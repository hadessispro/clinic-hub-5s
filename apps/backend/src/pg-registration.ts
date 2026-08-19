import { BadRequestException, Body, ConflictException, Controller, Injectable, Post, Req } from '@nestjs/common';
import { randomBytes, randomUUID, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { InfrastructureService } from './infrastructure';

const scrypt = promisify(nodeScrypt);

async function hashRegistrationPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const result = await scrypt(password, salt, 64) as Buffer;
  return { salt, hash: result.toString('hex') };
}

type RegistrationInput = {
  fullName?: string;
  phone?: string;
  email?: string;
  password?: string;
};

function normalizePhone(value: unknown) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0084')) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith('84')) phone = `0${phone.slice(2)}`;
  return phone;
}

@Injectable()
export class PgRegistrationService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  private async notifyApprovers(employeeCode: string, fullName: string) {
    const approvers = await this.infrastructure.postgres.query<{ user_id: string }>(
      `select distinct payload->>'id' user_id
         from app.records
        where entity_type='profiles' and deleted_at is null
          and payload->>'role'=any($1::text[])
          and coalesce((payload->>'active')::boolean,true)=true
          and coalesce(payload->>'id','')<>''`,
      [['admin', 'admin_it', 'superadmin', 'admin_marketing', 'support_marketing']],
    );
    const createdAt = new Date().toISOString();
    for (const approver of approvers.rows) {
      const notificationId = randomUUID();
      const payload = {
        id: notificationId,
        user_id: approver.user_id,
        title: 'Có tài khoản PG chờ duyệt',
        body: `${fullName} (${employeeCode}) vừa tự đăng ký tài khoản PG.`,
        type: 'pg_account_registration',
        link_view: 'pg-management',
        read: false,
        created_at: createdAt,
        updated_at: createdAt,
      };
      await this.infrastructure.postgres.query(
        `insert into app.records(entity_type,record_key,payload,origin)
         values ('notifications',$1,$2::jsonb,'vps-self-registration')`,
        [notificationId, JSON.stringify(payload)],
      );
    }
  }

  async register(input: RegistrationInput, requestIp: string) {
    const fullName = String(input.fullName || '').trim().replace(/\s+/g, ' ');
    const phone = normalizePhone(input.phone);
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');

    if (fullName.length < 2 || fullName.length > 100) {
      throw new BadRequestException('Họ tên phải có từ 2 đến 100 ký tự.');
    }
    if (!/^0\d{9}$/.test(phone)) {
      throw new BadRequestException('Số điện thoại phải gồm 10 số và bắt đầu bằng 0.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 180) {
      throw new BadRequestException('Email chưa đúng định dạng.');
    }
    if (password.length < 8 || password.length > 72) {
      throw new BadRequestException('Mật khẩu phải có từ 8 đến 72 ký tự.');
    }

    // A small fixed-window limiter prevents public registration from creating
    // unbounded rows. Redis failure never blocks a legitimate registration.
    try {
      const key = `clinic:pg-register:${requestIp || 'unknown'}`;
      const attempts = await this.infrastructure.redis.incr(key);
      if (attempts === 1) await this.infrastructure.redis.expire(key, 10 * 60);
      if (attempts > 5) throw new BadRequestException('Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau 10 phút.');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      console.warn('[PG registration] Redis limiter unavailable.');
    }

    const id = randomUUID();
    const employeeCode = `PG-${id.slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const profileKey = id;
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      // Serialize equal identities so two parallel requests cannot both pass.
      await client.query('select pg_advisory_xact_lock(hashtext($1)), pg_advisory_xact_lock(hashtext($2))', [email, phone]);
      const duplicate = await client.query(
        `select 1
           from app.records
          where deleted_at is null and (
            (entity_type='employees' and (
              lower(coalesce(payload->>'email',''))=$1 or
              right(regexp_replace(coalesce(payload->>'phone',''),'\\D','','g'),9)=right($2,9)
            )) or
            (entity_type='profiles' and lower(coalesce(payload->>'email',''))=$1)
          ) limit 1`,
        [email, phone],
      );
      if (duplicate.rowCount) throw new ConflictException('Email hoặc số điện thoại đã được đăng ký.');

      const employee = {
        id,
        code: employeeCode,
        full_name: fullName,
        email,
        phone,
        role: 'pg_staff',
        department: 'marketing',
        title: 'Nhân viên PG',
        branch_id: 'all',
        status: 'pending_approval',
      };
      const profile = {
        id,
        employee_code: employeeCode,
        employee_number: employeeCode,
        full_name: fullName,
        email,
        phone,
        role: 'pg_staff',
        department: 'marketing',
        branch_id: 'all',
        active: true,
        registration_status: 'pending_approval',
        registration_source: 'self_service',
        registered_at: now,
      };
      const credentials = await hashRegistrationPassword(password);
      await client.query(
        `insert into app.records(entity_type,record_key,payload,origin) values
         ('employees',$1,$2::jsonb,'vps-self-registration'),
         ('profiles',$3,$4::jsonb,'vps-self-registration')`,
        [employeeCode, JSON.stringify(employee), profileKey, JSON.stringify(profile)],
      );
      await client.query(
        `insert into app.local_accounts
         (user_id,profile_key,email,employee_code,branch_id,password_salt,password_hash,active)
         values ($1,$2,$3,$4,'all',$5,$6,false)`,
        [id, profileKey, email, employeeCode, credentials.salt, credentials.hash],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Email hoặc số điện thoại đã được đăng ký.');
      }
      throw error;
    } finally {
      client.release();
    }

    try {
      await this.notifyApprovers(employeeCode, fullName);
    } catch (error) {
      // Registration is already safely committed. A notification outage must
      // not make the user retry and create an unnecessary duplicate request.
      console.warn('[PG registration] Could not notify approvers.', error);
    }
    await this.infrastructure.markDataChanged(['profiles', 'employees', 'marketing.pg_accounts', 'notifications']);
    return {
      data: {
        employeeCode,
        fullName,
        email,
        status: 'pending_approval',
        message: 'Đăng ký thành công. Support hoặc Admin sẽ duyệt tài khoản trước khi bạn đăng nhập.',
      },
    };
  }
}

@Controller('/api/v2/auth')
export class PgRegistrationController {
  constructor(private readonly registration: PgRegistrationService) {}

  @Post('/pg-register')
  register(@Body() body: RegistrationInput, @Req() request: { ip?: string; headers?: Record<string, string | string[] | undefined> }) {
    const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    return this.registration.register(body, forwarded || request.ip || 'unknown');
  }
}
