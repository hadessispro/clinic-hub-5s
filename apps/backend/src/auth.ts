import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Injectable, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';

const scrypt = promisify(scryptCallback);
const accessTtlSeconds = 15 * 60;
const refreshTtlSeconds = 30 * 24 * 60 * 60;

type JsonMap = Record<string, unknown>;
export type AuthUser = {
  id: string;
  email: string | null;
  employeeCode: string;
  branchId: string;
  role: string;
  department: string;
  profile: JsonMap;
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url');
}

function normalizePhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function jwtSecret() {
  const secret = process.env.APP_JWT_SECRET || '';
  if (secret.length < 32) throw new Error('APP_JWT_SECRET must contain at least 32 characters');
  return secret;
}

function signJwt(payload: JsonMap, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const signature = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string) {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
  const expected = createHmac('sha256', jwtSecret()).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JsonMap;
  if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) {
    throw new UnauthorizedException('Phiên đăng nhập đã hết hạn.');
  }
  return payload;
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const result = await scrypt(password, salt, 64) as Buffer;
  return { salt, hash: result.toString('hex') };
}

async function passwordMatches(password: string, salt: string, expectedHex: string) {
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

@Injectable()
export class AuthService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  async login(identifierInput: string, password: string, branchIdInput?: string) {
    const identifier = String(identifierInput || '').trim().toLowerCase();
    const requestedBranchId = String(branchIdInput || '').trim().toLowerCase();
    // "all" is a neutral login scope. The authenticated profile still keeps
    // its real branch and attendance authorization is evaluated separately.
    const branchId = requestedBranchId === 'all' ? '' : requestedBranchId;
    if (!identifier || !password) throw new UnauthorizedException('Vui lòng nhập tài khoản và mật khẩu.');

    const result = await this.infrastructure.postgres.query<{
      profile_key: string; profile: JsonMap; employee: JsonMap | null;
    }>(`select p.record_key as profile_key, p.payload as profile, e.payload as employee
       from app.records p
       left join app.records e on e.entity_type='employees'
         and lower(e.payload->>'code')=lower(p.payload->>'employee_code') and e.deleted_at is null
       where p.entity_type='profiles' and p.deleted_at is null
         and coalesce((p.payload->>'active')::boolean, true)=true
         and (
           lower(p.payload->>'employee_code')=$1 or lower(p.payload->>'employee_number')=$1
           or lower(coalesce(e.payload->>'email',''))=$1
         )
       order by case when lower(coalesce(e.payload->>'email',''))=$1 then 0 else 1 end
       limit 5`, [identifier]);

    // PG works at temporary Support-assigned sites, so the clinic selected on
    // the login screen must never block authentication. GPS/shift validation
    // remains enforced by the dedicated PG attendance workflow.
    const branchFlexible = new Set(['admin', 'hr', 'leader', 'admin_it', 'superadmin', 'pg_staff']);
    const candidate = result.rows.find((row) => {
      const role = String(row.profile.role || 'staff');
      return !branchId || branchFlexible.has(role) || String(row.profile.branch_id || '') === branchId;
    });
    if (!candidate) throw new UnauthorizedException('Sai tài khoản, chi nhánh hoặc mật khẩu.');

    const profile = candidate.profile;
    const employee = candidate.employee || {};
    const userId = String(profile.id || candidate.profile_key);
    const account = await this.infrastructure.postgres.query<{
      password_salt: string; password_hash: string; active: boolean; locked_until: Date | null;
    }>('select password_salt,password_hash,active,locked_until from app.local_accounts where profile_key=$1', [candidate.profile_key]);
    const stored = account.rows[0];
    if (stored?.locked_until && stored.locked_until.getTime() > Date.now()) {
      throw new UnauthorizedException('Tài khoản đang tạm khóa. Vui lòng thử lại sau.');
    }

    let valid = false;
    if (stored) {
      valid = stored.active && await passwordMatches(password, stored.password_salt, stored.password_hash);
    } else {
      const initialPhone = normalizePhone(employee.phone);
      const bootstrapAdminIdentifier = String(process.env.VPS_BOOTSTRAP_ADMIN_IDENTIFIER || '').trim().toLowerCase();
      const bootstrapAdminPassword = String(process.env.VPS_BOOTSTRAP_ADMIN_PASSWORD || '');
      const bootstrapAdmin = ['admin', 'admin_it', 'superadmin'].includes(String(profile.role || ''))
        && bootstrapAdminIdentifier === identifier && bootstrapAdminPassword.length >= 10;
      valid = (initialPhone.length >= 8 && normalizePhone(password) === initialPhone)
        || (bootstrapAdmin && password === bootstrapAdminPassword);
      if (valid) {
        const credentials = await hashPassword(password);
        await this.infrastructure.postgres.query(
          `insert into app.local_accounts(user_id,profile_key,email,employee_code,branch_id,password_salt,password_hash)
           values ($1,$2,$3,$4,$5,$6,$7) on conflict (profile_key) do nothing`,
          [userId, candidate.profile_key, employee.email || null, profile.employee_code || null,
            profile.branch_id || null, credentials.salt, credentials.hash],
        );
      }
    }
    if (!valid) {
      await this.infrastructure.postgres.query(
        `update app.local_accounts set failed_attempts=failed_attempts+1,
         locked_until=case when failed_attempts>=4 then now()+interval '10 minutes' else locked_until end,
         updated_at=now() where profile_key=$1`, [candidate.profile_key],
      );
      throw new UnauthorizedException('Sai tài khoản, chi nhánh hoặc mật khẩu.');
    }

    const user: AuthUser = {
      id: userId,
      email: employee.email ? String(employee.email) : null,
      employeeCode: String(profile.employee_code || ''),
      branchId: String(profile.branch_id || branchId || ''),
      role: String(profile.role || 'staff'),
      department: String(profile.department || employee.department || ''),
      profile,
    };
    const accessToken = signJwt({ sub: user.id, profileKey: candidate.profile_key, role: user.role }, accessTtlSeconds);
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshHash = createHmac('sha256', jwtSecret()).update(refreshToken).digest('hex');
    await this.infrastructure.postgres.query(
      `insert into app.refresh_sessions(id,user_id,token_hash,expires_at)
       values ($1,$2,$3,now()+($4 || ' seconds')::interval)`,
      [randomUUID(), user.id, refreshHash, refreshTtlSeconds],
    );
    await this.infrastructure.postgres.query(
      'update app.local_accounts set failed_attempts=0,locked_until=null,last_login_at=now(),updated_at=now() where profile_key=$1',
      [candidate.profile_key],
    );
    return { user, session: { accessToken, refreshToken, expiresIn: accessTtlSeconds } };
  }

  async userFromToken(token: string): Promise<AuthUser> {
    const payload = verifyJwt(token);
    const result = await this.infrastructure.postgres.query<{ profile: JsonMap; employee: JsonMap | null }>(
      `select p.payload profile, e.payload employee from app.records p
       left join app.records e on e.entity_type='employees'
         and lower(e.payload->>'code')=lower(p.payload->>'employee_code') and e.deleted_at is null
       where p.entity_type='profiles' and p.record_key=$1 and p.deleted_at is null limit 1`,
      [String(payload.profileKey || '')],
    );
    const row = result.rows[0];
    if (!row || row.profile.active === false) throw new UnauthorizedException('Tài khoản không còn hoạt động.');
    return {
      id: String(row.profile.id || payload.sub), email: row.employee?.email ? String(row.employee.email) : null,
      employeeCode: String(row.profile.employee_code || ''), branchId: String(row.profile.branch_id || ''),
      role: String(row.profile.role || 'staff'), department: String(row.profile.department || row.employee?.department || ''),
      profile: row.profile,
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Phiên làm việc không hợp lệ.');
    const tokenHash = createHmac('sha256', jwtSecret()).update(refreshToken).digest('hex');
    const result = await this.infrastructure.postgres.query<{ profile_key: string; user_id: string }>(
      `select a.profile_key,a.user_id::text from app.refresh_sessions s
       join app.local_accounts a on a.user_id=s.user_id
       where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and a.active=true limit 1`, [tokenHash],
    );
    const account = result.rows[0];
    if (!account) throw new UnauthorizedException('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
    const user = await this.userFromProfileKey(account.profile_key);
    const accessToken = signJwt({ sub: user.id, profileKey: account.profile_key, role: user.role }, accessTtlSeconds);
    await this.infrastructure.postgres.query('update app.refresh_sessions set last_used_at=now() where token_hash=$1', [tokenHash]);
    return { user, session: { accessToken, refreshToken, expiresIn: accessTtlSeconds } };
  }

  async provision(actor: AuthUser, input: { profileId?: string; email?: string; password?: string }) {
    if (!['admin', 'admin_it', 'superadmin'].includes(actor.role)) {
      throw new ForbiddenException('Chỉ quản trị viên được tạo hoặc đặt lại tài khoản đăng nhập.');
    }
    const profileId = String(input.profileId || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    if (!profileId || !email || password.length < 8) {
      throw new BadRequestException('Thiếu hồ sơ, email hoặc mật khẩu phải có ít nhất 8 ký tự.');
    }
    const result = await this.infrastructure.postgres.query<{ profile_key: string; profile: JsonMap }>(
      `select record_key profile_key,payload profile from app.records
       where entity_type='profiles' and deleted_at is null
       and (record_key=$1 or payload->>'id'=$1) limit 1`, [profileId],
    );
    const row = result.rows[0];
    if (!row) throw new BadRequestException('Không tìm thấy hồ sơ cần cấp tài khoản.');
    const credentials = await hashPassword(password);
    const userId = String(row.profile.id || row.profile_key);
    await this.infrastructure.postgres.query(
      `insert into app.local_accounts(user_id,profile_key,email,employee_code,branch_id,password_salt,password_hash,active)
       values ($1,$2,$3,$4,$5,$6,$7,true)
       on conflict (profile_key) do update set email=excluded.email,employee_code=excluded.employee_code,
         branch_id=excluded.branch_id,password_salt=excluded.password_salt,password_hash=excluded.password_hash,
         active=true,failed_attempts=0,locked_until=null,updated_at=now()`,
      [userId, row.profile_key, email, row.profile.employee_code || null, row.profile.branch_id || null,
        credentials.salt, credentials.hash],
    );
    return { id: userId, email, employeeCode: row.profile.employee_code || null };
  }

  private async userFromProfileKey(profileKey: string): Promise<AuthUser> {
    const result = await this.infrastructure.postgres.query<{ profile: JsonMap; employee: JsonMap | null }>(
      `select p.payload profile, e.payload employee from app.records p
       left join app.records e on e.entity_type='employees'
         and lower(e.payload->>'code')=lower(p.payload->>'employee_code') and e.deleted_at is null
       where p.entity_type='profiles' and p.record_key=$1 and p.deleted_at is null limit 1`, [profileKey],
    );
    const row = result.rows[0];
    if (!row || row.profile.active === false) throw new UnauthorizedException('Tài khoản không còn hoạt động.');
    return { id: String(row.profile.id || ''), email: row.employee?.email ? String(row.employee.email) : null,
      employeeCode: String(row.profile.employee_code || ''), branchId: String(row.profile.branch_id || ''),
      role: String(row.profile.role || 'staff'), department: String(row.profile.department || row.employee?.department || ''), profile: row.profile };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest() as { headers: Record<string, string | undefined>; user?: AuthUser };
    const value = request.headers.authorization || '';
    if (!value.startsWith('Bearer ')) throw new UnauthorizedException('Vui lòng đăng nhập.');
    request.user = await this.auth.userFromToken(value.slice(7));
    return true;
  }
}

@Controller('/api/v2/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('/login')
  login(@Body() body: { identifier?: string; password?: string; branchId?: string }) {
    return this.auth.login(body.identifier || '', body.password || '', body.branchId);
  }

  @Post('/refresh')
  refresh(@Body() body: { refreshToken?: string }) {
    return this.auth.refresh(body.refreshToken || '');
  }

  @Get('/me')
  @UseGuards(AuthGuard)
  me(@Req() request: { user: AuthUser }) {
    return { user: request.user };
  }

  @Post('/provision')
  @UseGuards(AuthGuard)
  provision(@Req() request: { user: AuthUser }, @Body() body: { profileId?: string; email?: string; password?: string }) {
    return this.auth.provision(request.user, body);
  }
}
