import { randomUUID } from 'node:crypto';
import {
  BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable,
  Param, Patch, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AuthGuard, AuthUser, hashPassword } from './auth';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, unknown>;
type ActorRequest = { user: AuthUser };

const adminRoles = new Set(['admin', 'admin_it', 'superadmin', 'admin_marketing']);
const supportRoles = new Set([...adminRoles, 'support_marketing']);
const managerRoles = new Set([...adminRoles, 'telesale_leader']);
const reportRoles = new Set([...managerRoles, 'support_marketing']);
const dataClasses = new Set(['raw', 'net']);
const netLevels = new Set(['basic', 'advanced']);
const netServices: Record<string, Set<string>> = {
  basic: new Set(['Cạo vôi răng', 'Trám răng', 'Nhổ răng khôn', 'Thăm khám răng', 'Phục hình tháo lắp', 'Điều trị tủy', 'Tẩy trắng']),
  advanced: new Set(['Implant', 'Răng sứ', 'Niềng răng']),
};
const leadStatuses = new Set(['new', 'contacted', 'appointment_booked', 'visited', 'converted', 'cancelled']);
const callStatuses = new Set(['interested', 'appointment_booked', 'busy', 'no_answer', 'rejected']);

function requireRole(user: AuthUser, roles: Set<string>) {
  if (!roles.has(user.role)) throw new ForbiddenException('Tài khoản không có quyền thực hiện thao tác này.');
}

function cleanPhone(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function clinicDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function clinicTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

function seconds(value: unknown) {
  const [hour = 0, minute = 0, second = 0] = String(value || '').split(':').map(Number);
  return hour * 3600 + minute * 60 + second;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

@Injectable()
export class MarketingService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  private async audit(user: AuthUser, action: string, entityType: string, entityId?: string, detail: JsonMap = {}) {
    await this.infrastructure.postgres.query(
      `insert into marketing.audit_log(actor_code,action,entity_type,entity_id,detail)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [user.employeeCode, action, entityType, entityId || null, JSON.stringify(detail)],
    );
    await this.infrastructure.markDataChanged([entityType], user.id, user.role);
  }

  async listPgAccounts(user: AuthUser) {
    requireRole(user, supportRoles);
    const result = await this.infrastructure.postgres.query(
      `select p.record_key profile_key,p.payload profile,e.payload employee,
              coalesce(a.active,false) login_active,a.last_login_at
       from app.records p
       left join app.records e on e.entity_type='employees' and e.deleted_at is null
         and lower(e.payload->>'code')=lower(p.payload->>'employee_code')
       left join app.local_accounts a on a.profile_key=p.record_key
       where p.entity_type='profiles' and p.deleted_at is null and p.payload->>'role'='pg_staff'
       order by lower(coalesce(e.payload->>'full_name',p.payload->>'full_name',''))`,
    );
    return { data: result.rows };
  }

  async listTelesaleAccounts(user: AuthUser) {
    requireRole(user, managerRoles);
    const result = await this.infrastructure.postgres.query(
      `select p.payload->>'employee_code' employee_code,
              coalesce(e.payload->>'full_name',p.payload->>'full_name') full_name,
              p.payload->>'role' role,coalesce((p.payload->>'active')::boolean,true) active
       from app.records p left join app.records e on e.entity_type='employees' and e.deleted_at is null
         and lower(e.payload->>'code')=lower(p.payload->>'employee_code')
       where p.entity_type='profiles' and p.deleted_at is null
         and p.payload->>'role' in ('telesale_staff','telesale_leader')
         and coalesce((p.payload->>'active')::boolean,true)=true
       order by lower(coalesce(e.payload->>'full_name',p.payload->>'full_name'))`,
    );
    return { data: result.rows };
  }

  async createPgAccount(user: AuthUser, input: JsonMap) {
    requireRole(user, supportRoles);
    const fullName = String(input.fullName || '').trim();
    const phone = cleanPhone(input.phone);
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || phone);
    const requestedCode = String(input.employeeCode || '').trim().toUpperCase();
    const employeeCode = requestedCode || `PG-${Date.now().toString(36).toUpperCase()}`;
    if (!fullName || phone.length < 8 || !email.includes('@') || password.length < 8) {
      throw new BadRequestException('Cần nhập đủ họ tên, email, số điện thoại và mật khẩu từ 8 ký tự.');
    }
    if (!/^PG-[A-Z0-9-]+$/.test(employeeCode)) throw new BadRequestException('Mã PG phải bắt đầu bằng PG-.');
    const exists = await this.infrastructure.postgres.query(
      `select 1 from app.records where deleted_at is null and (
        (entity_type='profiles' and lower(payload->>'employee_code')=lower($1)) or
        (entity_type='employees' and (lower(payload->>'email')=lower($2) or lower(payload->>'code')=lower($1)))
      ) limit 1`, [employeeCode, email],
    );
    if (exists.rowCount) throw new BadRequestException('Mã PG hoặc email đã tồn tại.');

    const id = randomUUID();
    const profileKey = id;
    const now = new Date().toISOString();
    const branchId = String(input.branchId || 'pham-van-chieu');
    const employee = {
      id, code: employeeCode, employee_number: employeeCode, full_name: fullName, email, phone,
      department: 'marketing', title: 'Nhân viên PG', role: 'pg_staff', branch_id: branchId,
      status: 'active', created_by_code: user.employeeCode, created_at: now, updated_at: now,
    };
    const profile = {
      id, employee_code: employeeCode, employee_number: employeeCode, full_name: fullName,
      role: 'pg_staff', department: 'marketing', branch_id: branchId, active: true,
      parent_support_code: user.employeeCode, created_at: now, updated_at: now,
    };
    const credentials = await hashPassword(password);
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into app.records(entity_type,record_key,payload,origin) values
         ('employees',$1,$2::jsonb,'vps'),('profiles',$3,$4::jsonb,'vps')`,
        [employeeCode, JSON.stringify(employee), profileKey, JSON.stringify(profile)],
      );
      await client.query(
        `insert into app.local_accounts(user_id,profile_key,email,employee_code,branch_id,password_salt,password_hash)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [id, profileKey, email, employeeCode, branchId, credentials.salt, credentials.hash],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await this.audit(user, 'pg.create', 'profile', profileKey, { employeeCode });
    return { data: { id, employeeCode, fullName, email, branchId } };
  }

  async updatePgAccount(user: AuthUser, code: string, input: JsonMap) {
    requireRole(user, supportRoles);
    const result = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
      `select record_key,payload from app.records where entity_type='profiles' and deleted_at is null
       and payload->>'role'='pg_staff' and lower(payload->>'employee_code')=lower($1) limit 1`, [code],
    );
    const row = result.rows[0];
    if (!row) throw new BadRequestException('Không tìm thấy tài khoản PG.');
    const active = input.active === undefined ? row.payload.active !== false : Boolean(input.active);
    const fullName = String(input.fullName || row.payload.full_name || '').trim();
    const email = input.email ? String(input.email).trim().toLowerCase() : null;
    const phone = input.phone ? cleanPhone(input.phone) : null;
    const password = input.password ? String(input.password) : '';
    if (password && password.length < 8) throw new BadRequestException('Mật khẩu phải có ít nhất 8 ký tự.');
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      await client.query(
        `update app.records set payload=payload || $2::jsonb,updated_at=now(),version=version+1
         where entity_type='profiles' and record_key=$1`,
        [row.record_key, JSON.stringify({ full_name: fullName, active, updated_at: new Date().toISOString() })],
      );
      await client.query(
        `update app.records set payload=payload || $2::jsonb,updated_at=now(),version=version+1
         where entity_type='employees' and deleted_at is null and lower(payload->>'code')=lower($1)`,
        [code, JSON.stringify({ full_name: fullName, ...(email ? { email } : {}), ...(phone ? { phone } : {}), status: active ? 'active' : 'inactive', updated_at: new Date().toISOString() })],
      );
      if (password) {
        const credentials = await hashPassword(password);
        await client.query(
          `update app.local_accounts set password_salt=$2,password_hash=$3,active=$4,
           email=coalesce($5,email),failed_attempts=0,locked_until=null,updated_at=now() where profile_key=$1`,
          [row.record_key, credentials.salt, credentials.hash, active, email],
        );
      } else {
        await client.query('update app.local_accounts set active=$2,email=coalesce($3,email),updated_at=now() where profile_key=$1', [row.record_key, active, email]);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
    await this.audit(user, 'pg.update', 'profile', row.record_key, { code, active });
    return { data: { employeeCode: code, fullName, active } };
  }

  async deletePgAccount(user: AuthUser, code: string) {
    requireRole(user, supportRoles);
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      const profile = await client.query<{ record_key: string }>(
        `select record_key from app.records where entity_type='profiles' and deleted_at is null
         and payload->>'role'='pg_staff' and lower(payload->>'employee_code')=lower($1) limit 1`, [code],
      );
      if (!profile.rows[0]) throw new BadRequestException('Không tìm thấy tài khoản PG.');
      await client.query(`update app.records set deleted_at=now(),updated_at=now() where
        (entity_type='profiles' and record_key=$1) or
        (entity_type='employees' and lower(payload->>'code')=lower($2))`, [profile.rows[0].record_key, code]);
      await client.query('update app.local_accounts set active=false,updated_at=now() where profile_key=$1', [profile.rows[0].record_key]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
    await this.audit(user, 'pg.delete', 'profile', code);
    return { data: { deleted: true } };
  }

  async createLead(user: AuthUser, input: JsonMap) {
    if (![...supportRoles, 'telesale_leader', 'pg_staff'].includes(user.role)) throw new ForbiddenException();
    const dataClass = String(input.dataClass || input.data_class || 'raw');
    const netLevel = input.netLevel || input.net_level ? String(input.netLevel || input.net_level) : null;
    const serviceType = String(input.serviceType || input.service_interest || '').trim() || null;
    const phone = cleanPhone(input.phone) || null;
    const appointmentAt = input.appointmentAt || input.appointment_at ? new Date(String(input.appointmentAt || input.appointment_at)) : null;
    if (!dataClasses.has(dataClass)) throw new BadRequestException('Loại data không hợp lệ.');
    if (dataClass === 'net' && (!netLevel || !netLevels.has(netLevel) || !phone || !appointmentAt || !Number.isFinite(appointmentAt.getTime()))) {
      throw new BadRequestException('Data net bắt buộc có số điện thoại, lịch hẹn và phân loại cơ bản/chuyên sâu.');
    }
    if (dataClass === 'net' && (!serviceType || !netServices[netLevel!]?.has(serviceType))) {
      throw new BadRequestException('Dịch vụ không phù hợp với cấp độ Data net đã chọn.');
    }
    const customerName = String(input.customerName || input.full_name || '').trim();
    if (!customerName) throw new BadRequestException('Cần nhập tên khách hàng.');
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.leads(
         customer_name,phone,appointment_at,data_class,net_level,service_type,source,branch_id,notes,created_by_pg_code,
         assigned_telesale_code,assigned_by_code,assigned_at
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,null,null) returning *`,
      [customerName, phone, appointmentAt?.toISOString() || null, dataClass, dataClass === 'net' ? netLevel : null,
        dataClass === 'net' ? serviceType : null, input.source || 'PG', input.branchId || input.branch_id || null,
        input.notes || null, user.employeeCode],
    );
    await this.audit(user, 'lead.create', 'marketing.lead', result.rows[0].id, { dataClass, netLevel });
    return { data: result.rows[0] };
  }

  async listLeads(user: AuthUser, query: JsonMap) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (user.role === 'pg_staff') {
      params.push(user.employeeCode); where.push(`l.created_by_pg_code=$${params.length}`);
    } else if (user.role === 'telesale_staff') {
      params.push(user.employeeCode); where.push(`l.assigned_telesale_code=$${params.length}`);
    } else if (!reportRoles.has(user.role)) {
      throw new ForbiddenException();
    }
    for (const [field, column] of [['dataClass', 'data_class'], ['netLevel', 'net_level'], ['status', 'status'], ['assignedTo', 'assigned_telesale_code']] as const) {
      if (query[field]) { params.push(query[field]); where.push(`l.${column}=$${params.length}`); }
    }
    if (query.branchId) { params.push(query.branchId); where.push(`l.branch_id=$${params.length}`); }
    if (query.pgCode) { params.push(query.pgCode); where.push(`lower(l.created_by_pg_code)=lower($${params.length})`); }
    if (query.assignment === 'unassigned') where.push('l.assigned_telesale_code is null');
    if (query.assignment === 'assigned') where.push('l.assigned_telesale_code is not null');
    if (String(query.pgOnly || '').toLowerCase() === 'true') {
      where.push(`exists (
        select 1 from app.records pg_creator
        where pg_creator.entity_type='profiles' and pg_creator.deleted_at is null
          and pg_creator.payload->>'role'='pg_staff'
          and lower(pg_creator.payload->>'employee_code')=lower(l.created_by_pg_code)
      )`);
    }
    const searchTerms = String(query.search || '').trim().split(/\s+/).filter(Boolean).slice(0, 4);
    for (const term of searchTerms) {
      params.push(`%${term}%`);
      const placeholder = `$${params.length}`;
      where.push(`(
        l.customer_name ilike ${placeholder}
        or coalesce(l.phone,'') ilike ${placeholder}
        or l.created_by_pg_code ilike ${placeholder}
        or coalesce(l.service_type,'') ilike ${placeholder}
        or coalesce(l.source,'') ilike ${placeholder}
        or exists (
          select 1 from app.records pg_search
          left join app.records pg_employee on pg_employee.entity_type='employees' and pg_employee.deleted_at is null
            and lower(pg_employee.payload->>'code')=lower(pg_search.payload->>'employee_code')
          where pg_search.entity_type='profiles' and pg_search.deleted_at is null
            and lower(pg_search.payload->>'employee_code')=lower(l.created_by_pg_code)
            and coalesce(pg_employee.payload->>'full_name',pg_search.payload->>'full_name','') ilike ${placeholder}
        )
      )`);
    }
    if (query.dateFrom) { params.push(`${String(query.dateFrom)}T00:00:00+07:00`); where.push(`l.created_at >= $${params.length}::timestamptz`); }
    if (query.dateTo) { params.push(`${String(query.dateTo)}T23:59:59.999+07:00`); where.push(`l.created_at <= $${params.length}::timestamptz`); }
    if (String(query.pgUnassignedOnly || '').toLowerCase() === 'true') {
      where.push(`l.assigned_telesale_code is null and exists (
        select 1 from app.records pg_creator
        where pg_creator.entity_type='profiles' and pg_creator.deleted_at is null
          and pg_creator.payload->>'role'='pg_staff'
          and lower(pg_creator.payload->>'employee_code')=lower(l.created_by_pg_code)
      )`);
    }
    const requestedPage = Math.max(1, Number(query.page || 1));
    const hasPaging = query.page !== undefined || query.pageSize !== undefined;
    const pageSize = Math.max(1, Math.min(100, Number(query.pageSize || 50)));
    const limit = hasPaging ? pageSize : 5000;
    const offset = hasPaging ? (requestedPage - 1) * pageSize : 0;
    params.push(limit, offset);
    const result = await this.infrastructure.postgres.query(
      `select l.*,count(*) over()::int total_count,creator.full_name created_by_name,creator.role created_by_role,
        case when cp.id is null then null else jsonb_build_object(
          'customerCode',cp.customer_code,'customerName',cp.customer_name,'phone',cp.phone,
          'serviceNeed',cp.service_need,'booth',cp.booth,'pgName',cp.pg_name,'telesaleName',cp.telesale_name,
          'customerStatus',cp.customer_status,'callStatus',cp.call_status,
          'appointmentStatus',cp.appointment_status,'appointmentText',cp.appointment_text,
          'arrived',cp.arrived,'source',cp.source_label,'note',cp.note,'feedback',cp.feedback,
          'dataType',cp.data_type,'arrivalBranch',cp.arrival_branch,'lowQuality',cp.low_quality,
          'lowQualityReason',cp.low_quality_reason,'latestTelesaleNote',cp.latest_telesale_note,
          'vtechServiceType',cp.vtech_service_type,'vtechServiceDate',cp.vtech_service_date,
          'vtechServiceRevenue',cp.vtech_service_revenue,'vtechServiceSales',cp.vtech_service_sales,
          'commissionStatus',cp.commission_status,'sourceCreatedAt',cp.source_created_at,
          'sourceUpdatedAt',cp.source_updated_at
        ) end customer_profile
       from marketing.leads l
       left join marketing.customer_profiles cp on cp.id=l.customer_profile_id
       left join lateral (
         select coalesce(e.payload->>'full_name',p.payload->>'full_name',l.created_by_pg_code) full_name,
                p.payload->>'role' role
         from app.records p
         left join app.records e on e.entity_type='employees' and e.deleted_at is null
           and lower(e.payload->>'code')=lower(p.payload->>'employee_code')
         where p.entity_type='profiles' and p.deleted_at is null
           and lower(p.payload->>'employee_code')=lower(l.created_by_pg_code)
         order by p.updated_at desc limit 1
       ) creator on true
       ${where.length ? `where ${where.join(' and ')}` : ''}
       order by l.created_at desc limit $${params.length - 1} offset $${params.length}`, params,
    );
    const total = Number(result.rows[0]?.total_count || 0);
    const data = result.rows.map(({ total_count: _totalCount, ...row }) => row);
    return { data, meta: { page: hasPaging ? requestedPage : 1, pageSize: limit, total } };
  }

  async assignNetLead(user: AuthUser, leadId: string, telesaleCode: string) {
    requireRole(user, managerRoles);
    if (!telesaleCode) throw new BadRequestException('Cần chọn nhân viên Telesale.');
    const target = await this.infrastructure.postgres.query(
      `select 1 from app.records where entity_type='profiles' and deleted_at is null
       and payload->>'role' in ('telesale_staff','telesale_leader') and coalesce((payload->>'active')::boolean,true)=true
       and lower(payload->>'employee_code')=lower($1) limit 1`, [telesaleCode],
    );
    if (!target.rowCount) throw new BadRequestException('Tài khoản nhận data không phải Telesale đang hoạt động.');
    const result = await this.infrastructure.postgres.query(
      `update marketing.leads set assigned_telesale_code=$2,assigned_by_code=$3,assigned_at=now(),updated_at=now()
       where id=$1 returning *`, [leadId, telesaleCode, user.employeeCode],
    );
    if (!result.rows[0]) throw new BadRequestException('Không tìm thấy data net.');
    await this.audit(user, 'lead.assign_net', 'marketing.lead', leadId, { telesaleCode });
    return { data: result.rows[0] };
  }

  async distributeRaw(user: AuthUser, quantity?: number) {
    requireRole(user, managerRoles);
    const staff = await this.infrastructure.postgres.query<{ code: string }>(
      `select e.payload->>'code' code from app.records p join app.records e
       on e.entity_type='employees' and e.deleted_at is null and lower(e.payload->>'code')=lower(p.payload->>'employee_code')
       where p.entity_type='profiles' and p.deleted_at is null and p.payload->>'role'='telesale_staff'
         and coalesce((p.payload->>'active')::boolean,true)=true`,
    );
    if (!staff.rows.length) throw new BadRequestException('Chưa có tài khoản Telesale đang hoạt động.');
    const limit = Math.min(Math.max(Number(quantity || 5000), 1), 5000);
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      const leads = await client.query<{ id: string }>(
        `select id from marketing.leads where data_class='raw' and assigned_telesale_code is null
         order by random() for update skip locked limit $1`, [limit],
      );
      const workloads = await client.query<{ code: string; count: string }>(
        `select s.code,count(l.id)::text count from unnest($1::text[]) s(code)
         left join marketing.leads l on l.assigned_telesale_code=s.code and l.status not in ('converted','cancelled')
         group by s.code order by count(l.id),random()`, [staff.rows.map((row) => row.code)],
      );
      const queue = workloads.rows.map((row) => ({ code: row.code, count: Number(row.count) }));
      for (const lead of leads.rows) {
        queue.sort((a, b) => a.count - b.count || Math.random() - 0.5);
        const target = queue[0];
        await client.query(
          `update marketing.leads set assigned_telesale_code=$2,assigned_by_code=$3,assigned_at=now(),updated_at=now() where id=$1`,
          [lead.id, target.code, user.employeeCode],
        );
        target.count += 1;
      }
      await client.query('commit');
      await this.audit(user, 'lead.distribute_raw', 'marketing.lead', undefined, { count: leads.rows.length });
      return { data: { distributed: leads.rows.length, allocation: queue } };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }

  async updateLead(user: AuthUser, leadId: string, input: JsonMap) {
    const own = user.role === 'telesale_staff';
    if (!own && !managerRoles.has(user.role)) throw new ForbiddenException();
    const status = String(input.status || '');
    if (!leadStatuses.has(status)) throw new BadRequestException('Trạng thái Lead không hợp lệ.');
    const params: unknown[] = [leadId, status, input.notes || null];
    let owner = '';
    if (own) { params.push(user.employeeCode); owner = `and assigned_telesale_code=$${params.length}`; }
    const result = await this.infrastructure.postgres.query(
      `update marketing.leads set status=$2,notes=coalesce($3,notes),updated_at=now() where id=$1 ${owner} returning *`, params,
    );
    if (!result.rows[0]) throw new ForbiddenException('Lead không thuộc quyền xử lý của tài khoản này.');
    await this.audit(user, 'lead.update', 'marketing.lead', leadId, { status });
    return { data: result.rows[0] };
  }

  async deleteLead(user: AuthUser, leadId: string) {
    requireRole(user, managerRoles);
    const result = await this.infrastructure.postgres.query('delete from marketing.leads where id=$1 returning id', [leadId]);
    if (!result.rows[0]) throw new BadRequestException('Không tìm thấy Lead.');
    await this.audit(user, 'lead.delete', 'marketing.lead', leadId);
    return { data: { deleted: true } };
  }

  async addCallLog(user: AuthUser, leadId: string, input: JsonMap) {
    if (user.role !== 'telesale_staff' && !managerRoles.has(user.role)) throw new ForbiddenException();
    const status = String(input.callStatus || input.call_status || '');
    if (!callStatuses.has(status)) throw new BadRequestException('Kết quả cuộc gọi không hợp lệ.');
    const appointmentValue = input.appointmentAt || input.appointment_at;
    const appointmentAt = appointmentValue ? new Date(String(appointmentValue)) : null;
    if (status === 'appointment_booked' && (!appointmentAt || !Number.isFinite(appointmentAt.getTime()))) {
      throw new BadRequestException('Kết quả đã hẹn khám bắt buộc phải có ngày giờ hẹn.');
    }
    const lead = await this.infrastructure.postgres.query<{ assigned_telesale_code: string }>(
      'select assigned_telesale_code from marketing.leads where id=$1', [leadId],
    );
    if (!lead.rows[0] || (user.role === 'telesale_staff' && lead.rows[0].assigned_telesale_code !== user.employeeCode)) {
      throw new ForbiddenException('Lead không thuộc quyền xử lý của tài khoản này.');
    }
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.call_logs(lead_id,telesale_code,call_status,note,appointment_at)
       values ($1,$2,$3,$4,$5) returning *`,
      [leadId, user.employeeCode, status, input.note || null, appointmentAt?.toISOString() || null],
    );
    const leadStatus = status === 'appointment_booked' ? 'appointment_booked' : status === 'rejected' ? 'cancelled' : 'contacted';
    await this.infrastructure.postgres.query('update marketing.leads set status=$2,updated_at=now() where id=$1', [leadId, leadStatus]);
    return { data: result.rows[0] };
  }

  async listCallLogs(user: AuthUser, leadId: string) {
    const lead = await this.infrastructure.postgres.query<{ created_by_pg_code: string; assigned_telesale_code: string }>(
      'select created_by_pg_code,assigned_telesale_code from marketing.leads where id=$1', [leadId],
    );
    const row = lead.rows[0];
    if (!row) throw new BadRequestException('Không tìm thấy Lead.');
    if (user.role === 'pg_staff' && row.created_by_pg_code !== user.employeeCode) throw new ForbiddenException();
    if (user.role === 'telesale_staff' && row.assigned_telesale_code !== user.employeeCode) throw new ForbiddenException();
    if (!['pg_staff', 'telesale_staff'].includes(user.role) && !reportRoles.has(user.role)) throw new ForbiddenException();
    const result = await this.infrastructure.postgres.query(
      'select * from marketing.call_logs where lead_id=$1 order by created_at desc limit 200', [leadId],
    );
    return { data: result.rows };
  }

  async reports(user: AuthUser) {
    requireRole(user, reportRoles);
    const pg = await this.infrastructure.postgres.query(
      `with pg_totals as (
         select created_by_pg_code pg_code,count(*)::int total,
                count(*) filter (where data_class='raw')::int raw_count,
                count(*) filter (where data_class='net')::int net_count,
                count(*) filter (where net_level='basic')::int net_basic_count,
                count(*) filter (where net_level='advanced')::int net_advanced_count
           from marketing.leads
          group by created_by_pg_code
       )
       select totals.*,coalesce(creator.full_name,totals.pg_code) pg_name
         from pg_totals totals
         left join lateral (
           select coalesce(e.payload->>'full_name',p.payload->>'full_name') full_name
             from app.records p
             left join app.records e on e.entity_type='employees' and e.deleted_at is null
               and lower(e.payload->>'code')=lower(p.payload->>'employee_code')
            where p.entity_type='profiles' and p.deleted_at is null
              and lower(p.payload->>'employee_code')=lower(totals.pg_code)
            order by p.updated_at desc
            limit 1
         ) creator on true
        order by totals.total desc`,
    );
    const telesale = await this.infrastructure.postgres.query(
      `select l.assigned_telesale_code telesale_code,count(distinct l.id)::int assigned,
       count(distinct c.lead_id)::int contacted,
       count(distinct c.lead_id) filter (where c.call_status='appointment_booked')::int appointments,
       count(distinct l.id) filter (where l.status='converted')::int converted,
       count(distinct l.id) filter (where l.status='cancelled')::int cancelled,
       count(c.id)::int total_calls
       from marketing.leads l left join marketing.call_logs c on c.lead_id=l.id
       where l.assigned_telesale_code is not null group by l.assigned_telesale_code order by assigned desc`,
    );
    const totals = await this.infrastructure.postgres.query(
      `select count(*)::int total,count(*) filter(where data_class='raw')::int raw_count,
       count(*) filter(where data_class='net')::int net_count,
       count(*) filter(where status='converted')::int converted from marketing.leads`,
    );
    return { data: { totals: totals.rows[0], pg: pg.rows, telesale: telesale.rows } };
  }

  async createSite(user: AuthUser, input: JsonMap) {
    requireRole(user, supportRoles);
    const latitude = Number(input.latitude); const longitude = Number(input.longitude);
    const radius = Number(input.allowedRadiusM || 100); const accuracy = Number(input.maxAccuracyM || 100);
    if (!String(input.name || '').trim() || !String(input.address || '').trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
      || radius < 20 || radius > 500 || accuracy < 10 || accuracy > 200) {
      throw new BadRequestException('Thông tin vị trí chấm công chưa đầy đủ.');
    }
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.pg_work_sites(name,address,latitude,longitude,allowed_radius_m,max_accuracy_m,created_by_code)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [input.name, input.address, latitude, longitude, radius, accuracy, user.employeeCode],
    );
    await this.infrastructure.markDataChanged(['marketing.pg_work_site'], user.id, user.role);
    return { data: result.rows[0] };
  }

  async listSites(user: AuthUser) {
    if (user.role !== 'pg_staff') requireRole(user, supportRoles);
    const result = await this.infrastructure.postgres.query('select * from marketing.pg_work_sites where active=true order by name');
    return { data: result.rows };
  }

  async updateSite(user: AuthUser, id: string, input: JsonMap) {
    requireRole(user, supportRoles);
    const latitude = Number(input.latitude); const longitude = Number(input.longitude);
    const radius = Number(input.allowedRadiusM || 100); const accuracy = Number(input.maxAccuracyM || 100);
    if (!String(input.name || '').trim() || !String(input.address || '').trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
      || radius < 20 || radius > 500 || accuracy < 10 || accuracy > 200) {
      throw new BadRequestException('Thông tin vị trí chấm công chưa đầy đủ.');
    }
    const result = await this.infrastructure.postgres.query(
      `update marketing.pg_work_sites set name=$2,address=$3,latitude=$4,longitude=$5,allowed_radius_m=$6,max_accuracy_m=$7,updated_at=now()
       where id::text=$1 and active=true returning *`,
      [id, input.name, input.address, latitude, longitude, radius, accuracy],
    );
    if (!result.rows[0]) throw new BadRequestException('Không tìm thấy địa điểm đã lưu.');
    await this.infrastructure.markDataChanged(['marketing.pg_work_site'], user.id, user.role);
    return { data: result.rows[0] };
  }

  async deleteSite(user: AuthUser, id: string) {
    requireRole(user, supportRoles);
    const assigned = await this.infrastructure.postgres.query(
      `select exists(select 1 from marketing.pg_shift_assignments where site_id::text=$1 and work_date>=(now() at time zone 'Asia/Ho_Chi_Minh')::date) assigned`, [id],
    );
    if (assigned.rows[0]?.assigned) throw new ConflictException('Địa điểm đang có lịch PG hôm nay hoặc tương lai. Hãy đổi phân công trước khi xóa.');
    const result = await this.infrastructure.postgres.query(
      `update marketing.pg_work_sites set active=false,updated_at=now() where id::text=$1 and active=true returning id`, [id],
    );
    if (!result.rows[0]) throw new BadRequestException('Không tìm thấy địa điểm đã lưu.');
    await this.infrastructure.markDataChanged(['marketing.pg_work_site'], user.id, user.role);
    return { data: { id, deleted: true } };
  }

  async searchLocations(user: AuthUser, queryInput: string) {
    requireRole(user, supportRoles);
    const query = String(queryInput || '').trim();
    if (query.length < 3 || query.length > 180) throw new BadRequestException('Vui lòng nhập địa chỉ cần tìm.');
    const params = new URLSearchParams({
      q: query, format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: 'vn', 'accept-language': 'vi',
    });
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'ClinicHub5S/1.0 (location-search)' }, signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Geocoder ${response.status}`);
      const payload = await response.json() as Array<Record<string, unknown>>;
      return {
        data: payload.map((row) => ({
          id: String(row.place_id || ''), name: String(row.name || row.display_name || ''),
          address: String(row.display_name || ''), latitude: Number(row.lat), longitude: Number(row.lon),
          type: String(row.type || ''),
        })).filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude)),
      };
    } catch {
      throw new BadRequestException('Không tìm được vị trí lúc này. Có thể dùng GPS thiết bị hoặc thử lại sau.');
    }
  }

  async createAssignment(user: AuthUser, input: JsonMap) {
    requireRole(user, supportRoles);
    const pgCode = String(input.pgCode || '').trim().toUpperCase(); const siteId = String(input.siteId || '').trim();
    const workDate = String(input.workDate || ''); const startTime = String(input.startTime || ''); const endTime = String(input.endTime || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !/^\d{2}:\d{2}/.test(startTime) || !/^\d{2}:\d{2}/.test(endTime) || seconds(endTime) <= seconds(startTime)) {
      throw new BadRequestException('Ngày hoặc thời gian phân công không hợp lệ.');
    }
    const valid = await this.infrastructure.postgres.query(
      `select exists(select 1 from app.records where entity_type='profiles' and deleted_at is null and payload->>'role'='pg_staff'
         and lower(trim(payload->>'employee_code'))=lower(trim($1)) and coalesce((payload->>'active')::boolean,true)=true) pg_valid,
       exists(select 1 from marketing.pg_work_sites where id::text=$2 and active=true) site_valid`, [pgCode, siteId],
    );
    if (!valid.rows[0]?.pg_valid) throw new BadRequestException('Tài khoản PG không tồn tại hoặc đã bị khóa.');
    if (!valid.rows[0]?.site_valid) throw new BadRequestException('Vị trí chấm công không tồn tại hoặc đã ngừng hoạt động.');
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.pg_shift_assignments(pg_code,site_id,work_date,start_time,end_time,created_by_code)
       values ($1,$2,$3,$4,$5,$6)
       on conflict(pg_code,work_date) do update set site_id=excluded.site_id,start_time=excluded.start_time,
       end_time=excluded.end_time,created_by_code=excluded.created_by_code,updated_at=now() returning *`,
      [pgCode, siteId, workDate, startTime, endTime, user.employeeCode],
    );
    await this.infrastructure.markDataChanged(['marketing.pg_shift_assignment'], user.id, user.role);
    return { data: result.rows[0] };
  }

  async listAssignments(user: AuthUser, date?: string) {
    // A PG must always receive the assignment for the clinic's current day.
    // Do not trust a device date here because an incorrect mobile clock/timezone
    // would make a valid Support assignment appear to be missing.
    const params: unknown[] = [user.role === 'pg_staff' ? clinicDate() : (date || clinicDate())];
    let owner = '';
    if (user.role === 'pg_staff') {
      params.push(user.employeeCode);
      owner = `and lower(trim(a.pg_code))=lower(trim($${params.length}))`;
    }
    else requireRole(user, supportRoles);
    const result = await this.infrastructure.postgres.query(
      `select a.*,s.name site_name,s.address,s.latitude,s.longitude,s.allowed_radius_m,s.max_accuracy_m
       from marketing.pg_shift_assignments a join marketing.pg_work_sites s on s.id=a.site_id
       where a.work_date=$1 ${owner} order by a.start_time,a.pg_code`, params,
    );
    return { data: result.rows };
  }

  async deleteAssignment(user: AuthUser, id: string) {
    requireRole(user, supportRoles);
    const result = await this.infrastructure.postgres.query(
      `delete from marketing.pg_shift_assignments a
       where a.id::text=$1
         and not exists(select 1 from marketing.pg_attendance t where t.assignment_id=a.id)
       returning a.id,a.pg_code,a.work_date`, [id],
    );
    if (!result.rows[0]) {
      const current = await this.infrastructure.postgres.query(
        `select a.id,exists(select 1 from marketing.pg_attendance t where t.assignment_id=a.id) has_attendance
         from marketing.pg_shift_assignments a where a.id::text=$1`, [id],
      );
      if (current.rows[0]?.has_attendance) {
        throw new BadRequestException('Phân công đã phát sinh chấm công nên phải được giữ lại để đối soát.');
      }
      throw new BadRequestException('Phân công không còn tồn tại.');
    }
    await this.audit(user, 'pg_assignment.delete', 'marketing.pg_shift_assignment', id, {
      pgCode: result.rows[0].pg_code, workDate: result.rows[0].work_date,
    });
    return { data: result.rows[0] };
  }

  async listLocationSuggestions(user: AuthUser) {
    if (user.role !== 'pg_staff' && !supportRoles.has(user.role)) throw new ForbiddenException();
    const values: unknown[] = [];
    const owner = user.role === 'pg_staff' ? 'where lower(s.pg_code)=lower($1)' : '';
    if (user.role === 'pg_staff') values.push(user.employeeCode);
    const result = await this.infrastructure.postgres.query(
      `select s.*,a.work_date,a.start_time,a.end_time,w.name site_name,w.address current_address
       from marketing.pg_location_suggestions s
       left join marketing.pg_shift_assignments a on a.id=s.assignment_id
       left join marketing.pg_work_sites w on w.id=a.site_id
       ${owner} order by s.created_at desc limit 300`, values,
    );
    return { data: result.rows };
  }

  async suggestLocation(user: AuthUser, input: JsonMap) {
    if (user.role !== 'pg_staff') throw new ForbiddenException('Chỉ PG được gửi tọa độ gợi ý.');
    const assignmentId = String(input.assignmentId || '');
    const latitude = Number(input.latitude); const longitude = Number(input.longitude); const accuracy = Math.round(Number(input.accuracy));
    if (!assignmentId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 1 || accuracy > 500) {
      throw new BadRequestException('Tọa độ gợi ý không hợp lệ.');
    }
    const assignment = await this.infrastructure.postgres.query(
      `select id from marketing.pg_shift_assignments where id::text=$1 and lower(pg_code)=lower($2) limit 1`,
      [assignmentId, user.employeeCode],
    );
    if (!assignment.rows[0]) throw new BadRequestException('Phân công không thuộc tài khoản PG này.');
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.pg_location_suggestions(assignment_id,pg_code,latitude,longitude,accuracy_m,address,note)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [assignmentId, user.employeeCode, latitude, longitude, accuracy, String(input.address || '').slice(0, 500) || null, String(input.note || '').slice(0, 1000) || null],
    );
    await this.audit(user, 'pg_location.suggest', 'marketing.pg_location_suggestion', result.rows[0].id, { assignmentId });
    return { data: result.rows[0] };
  }

  async reviewLocationSuggestion(user: AuthUser, id: string, input: JsonMap) {
    requireRole(user, adminRoles);
    const decision = input.decision === 'approved' ? 'approved' : input.decision === 'rejected' ? 'rejected' : '';
    if (!decision) throw new BadRequestException('Quyết định duyệt không hợp lệ.');
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      const current = await client.query(
        `select s.*,a.site_id from marketing.pg_location_suggestions s
         join marketing.pg_shift_assignments a on a.id=s.assignment_id
         where s.id::text=$1 and s.status='pending_admin' for update`, [id],
      );
      if (!current.rows[0]) throw new BadRequestException('Gợi ý không còn ở trạng thái chờ duyệt.');
      const row = current.rows[0];
      await client.query(
        `update marketing.pg_location_suggestions set status=$2,reviewed_by_code=$3,reviewed_note=$4,reviewed_at=now(),updated_at=now()
         where id::text=$1`, [id, decision, user.employeeCode, String(input.note || '').slice(0, 1000) || null],
      );
      if (decision === 'approved') {
        await client.query(
          `update marketing.pg_work_sites set latitude=$2,longitude=$3,address=coalesce(nullif($4,''),address),updated_at=now()
           where id=$1`, [row.site_id, row.latitude, row.longitude, row.address || ''],
        );
      }
      await client.query('commit');
      await this.audit(user, `pg_location.${decision}`, 'marketing.pg_location_suggestion', id);
      return { data: { id, status: decision } };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  async listSupportRequests(user: AuthUser) {
    if (user.role !== 'pg_staff' && !supportRoles.has(user.role)) throw new ForbiddenException();
    const values: unknown[] = [];
    const owner = user.role === 'pg_staff' ? 'where lower(pg_code)=lower($1)' : '';
    if (user.role === 'pg_staff') values.push(user.employeeCode);
    const result = await this.infrastructure.postgres.query(
      `select * from marketing.pg_support_requests ${owner} order by created_at desc limit 500`, values,
    );
    return { data: result.rows };
  }

  async createSupportRequest(user: AuthUser, input: JsonMap) {
    if (user.role !== 'pg_staff') throw new ForbiddenException('Chỉ PG được tạo yêu cầu hỗ trợ.');
    const type = String(input.requestType || 'other');
    if (!['location_issue','schedule_change','account_access','data_issue','other'].includes(type)
      || !String(input.title || '').trim() || !String(input.detail || '').trim()) throw new BadRequestException('Yêu cầu hỗ trợ chưa đầy đủ.');
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.pg_support_requests(pg_code,request_type,title,detail) values ($1,$2,$3,$4) returning *`,
      [user.employeeCode, type, String(input.title).slice(0, 200), String(input.detail).slice(0, 3000)],
    );
    await this.audit(user, 'pg_support.submit', 'marketing.pg_support_request', result.rows[0].id);
    return { data: result.rows[0] };
  }

  async actionSupportRequest(user: AuthUser, id: string, input: JsonMap) {
    const action = String(input.action || ''); const note = String(input.note || '').slice(0, 2000) || null;
    let query = ''; let values: unknown[] = [];
    if (action === 'forward') {
      if (!supportRoles.has(user.role) || adminRoles.has(user.role)) throw new ForbiddenException('Support chịu trách nhiệm chuyển yêu cầu lên Admin.');
      query = `update marketing.pg_support_requests set status='admin_review',support_code=$2,support_note=$3,forwarded_at=now(),updated_at=now() where id::text=$1 and status='submitted' returning *`;
      values = [id, user.employeeCode, note];
    } else if (action === 'approve' || action === 'reject') {
      requireRole(user, adminRoles);
      query = `update marketing.pg_support_requests set status=$2,admin_code=$3,admin_note=$4,decided_at=now(),updated_at=now() where id::text=$1 and status='admin_review' returning *`;
      values = [id, action === 'approve' ? 'approved' : 'rejected', user.employeeCode, note];
    } else if (action === 'start' || action === 'complete') {
      if (!supportRoles.has(user.role) || adminRoles.has(user.role)) throw new ForbiddenException('Support chịu trách nhiệm xử lý và phản hồi PG.');
      query = action === 'start'
        ? `update marketing.pg_support_requests set status='in_progress',support_code=$2,support_note=coalesce($3,support_note),updated_at=now() where id::text=$1 and status='approved' returning *`
        : `update marketing.pg_support_requests set status='completed',support_code=$2,resolution=$3,completed_at=now(),updated_at=now() where id::text=$1 and status='in_progress' returning *`;
      values = [id, user.employeeCode, note];
    } else throw new BadRequestException('Thao tác workflow không hợp lệ.');
    const result = await this.infrastructure.postgres.query(query, values);
    if (!result.rows[0]) throw new BadRequestException('Trạng thái yêu cầu đã thay đổi hoặc thao tác không đúng thứ tự.');
    await this.audit(user, `pg_support.${action}`, 'marketing.pg_support_request', id);
    return { data: result.rows[0] };
  }

  async recordPgAttendance(user: AuthUser, input: JsonMap) {
    if (user.role !== 'pg_staff') throw new ForbiddenException('Chỉ tài khoản PG được chấm công tại vị trí được phân công.');
    const type = input.type === 'checkout' ? 'checkout' : 'checkin';
    const lat = Number(input.latitude ?? input.lat); const lng = Number(input.longitude ?? input.lng); const accuracy = Math.round(Number(input.accuracy));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy) || accuracy <= 0) throw new BadRequestException('GPS không hợp lệ.');
    const assignment = await this.infrastructure.postgres.query<{
      id: string; start_time: string; end_time: string; latitude: number; longitude: number; allowed_radius_m: number; max_accuracy_m: number;
    }>(
      `select a.id,a.start_time::text,a.end_time::text,s.latitude,s.longitude,s.allowed_radius_m,s.max_accuracy_m
       from marketing.pg_shift_assignments a join marketing.pg_work_sites s on s.id=a.site_id and s.active=true
       where lower(trim(a.pg_code))=lower(trim($1)) and a.work_date=$2 limit 1`, [user.employeeCode, clinicDate()],
    );
    const shift = assignment.rows[0];
    if (!shift) throw new BadRequestException('Support chưa phân công vị trí và thời gian làm việc hôm nay.');
    if (accuracy > shift.max_accuracy_m) throw new BadRequestException(`Sai số GPS ±${accuracy} m vượt mức ${shift.max_accuracy_m} m.`);
    const distance = distanceMeters(lat, lng, Number(shift.latitude), Number(shift.longitude));
    if (distance > shift.allowed_radius_m) throw new BadRequestException(`Bạn đang cách vị trí làm việc ${distance} m, ngoài bán kính ${shift.allowed_radius_m} m.`);
    const grace = 5 * 60;
    const nowTime = seconds(clinicTime());
    const status = type === 'checkin'
      ? (nowTime > seconds(shift.start_time) + grace ? 'late' : 'valid')
      : (nowTime < seconds(shift.end_time) - grace ? 'early_leave' : 'valid');
    const result = await this.infrastructure.postgres.query(
      `insert into marketing.pg_attendance(assignment_id,pg_code,record_type,latitude,longitude,accuracy_m,distance_m,status)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict(assignment_id,record_type) do nothing returning *`,
      [shift.id, user.employeeCode, type, lat, lng, accuracy, distance, status],
    );
    if (!result.rows[0]) throw new BadRequestException(type === 'checkin' ? 'Bạn đã check-in hôm nay.' : 'Bạn đã check-out hôm nay.');
    await this.infrastructure.markDataChanged(['marketing.pg_attendance'], user.id, user.role);
    return { data: result.rows[0] };
  }

  async listPgAttendance(user: AuthUser, from?: string, to?: string) {
    if (user.role !== 'pg_staff') requireRole(user, supportRoles);
    const values: unknown[] = [from || clinicDate(), to || clinicDate()];
    let owner = '';
    if (user.role === 'pg_staff') {
      values.push(user.employeeCode);
      owner = `and lower(trim(a.pg_code))=lower(trim($${values.length}))`;
    }
    const result = await this.infrastructure.postgres.query(
      `select a.*,s.work_date,s.start_time,s.end_time,w.name site_name,w.address
       from marketing.pg_attendance a join marketing.pg_shift_assignments s on s.id=a.assignment_id
       join marketing.pg_work_sites w on w.id=s.site_id
       where s.work_date between $1 and $2 ${owner} order by a.recorded_at desc`, values,
    );
    return { data: result.rows };
  }
}

@Controller('/api/v2/marketing')
@UseGuards(AuthGuard)
export class MarketingController {
  constructor(private readonly service: MarketingService) {}

  @Get('/pg-accounts') listPg(@Req() request: ActorRequest) { return this.service.listPgAccounts(request.user); }
  @Get('/telesale-accounts') listTelesale(@Req() request: ActorRequest) { return this.service.listTelesaleAccounts(request.user); }
  @Post('/pg-accounts') createPg(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.createPgAccount(request.user, body); }
  @Patch('/pg-accounts/:code') updatePg(@Req() request: ActorRequest, @Param('code') code: string, @Body() body: JsonMap) { return this.service.updatePgAccount(request.user, code, body); }
  @Delete('/pg-accounts/:code') deletePg(@Req() request: ActorRequest, @Param('code') code: string) { return this.service.deletePgAccount(request.user, code); }
  @Get('/leads') listLeads(@Req() request: ActorRequest, @Query() query: JsonMap) { return this.service.listLeads(request.user, query); }
  @Post('/leads') createLead(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.createLead(request.user, body); }
  @Patch('/leads/:id') updateLead(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: JsonMap) { return this.service.updateLead(request.user, id, body); }
  @Delete('/leads/:id') deleteLead(@Req() request: ActorRequest, @Param('id') id: string) { return this.service.deleteLead(request.user, id); }
  @Post('/leads/:id/assign-net') assignNet(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: JsonMap) { return this.service.assignNetLead(request.user, id, String(body.telesaleCode || '')); }
  @Post('/leads/distribute-raw') distributeRaw(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.distributeRaw(request.user, Number(body.quantity || 0)); }
  @Post('/leads/:id/calls') addCall(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: JsonMap) { return this.service.addCallLog(request.user, id, body); }
  @Get('/leads/:id/calls') listCalls(@Req() request: ActorRequest, @Param('id') id: string) { return this.service.listCallLogs(request.user, id); }
  @Get('/reports') reports(@Req() request: ActorRequest) { return this.service.reports(request.user); }
  @Get('/pg-sites') sites(@Req() request: ActorRequest) { return this.service.listSites(request.user); }
  @Get('/pg-location-search') searchLocations(@Req() request: ActorRequest, @Query('q') query: string) { return this.service.searchLocations(request.user, query); }
  @Post('/pg-sites') createSite(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.createSite(request.user, body); }
  @Patch('/pg-sites/:id') updateSite(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: JsonMap) { return this.service.updateSite(request.user, id, body); }
  @Delete('/pg-sites/:id') deleteSite(@Req() request: ActorRequest, @Param('id') id: string) { return this.service.deleteSite(request.user, id); }
  @Get('/pg-assignments') assignments(@Req() request: ActorRequest, @Query('date') date?: string) { return this.service.listAssignments(request.user, date); }
  @Post('/pg-assignments') createAssignment(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.createAssignment(request.user, body); }
  @Delete('/pg-assignments/:id') deleteAssignment(@Req() request: ActorRequest, @Param('id') id: string) { return this.service.deleteAssignment(request.user, id); }
  @Get('/pg-location-suggestions') locationSuggestions(@Req() request: ActorRequest) { return this.service.listLocationSuggestions(request.user); }
  @Post('/pg-location-suggestions') suggestLocation(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.suggestLocation(request.user, body); }
  @Patch('/pg-location-suggestions/:id') reviewLocation(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: JsonMap) { return this.service.reviewLocationSuggestion(request.user, id, body); }
  @Get('/pg-support-requests') supportRequests(@Req() request: ActorRequest) { return this.service.listSupportRequests(request.user); }
  @Post('/pg-support-requests') createSupportRequest(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.createSupportRequest(request.user, body); }
  @Patch('/pg-support-requests/:id') actionSupportRequest(@Req() request: ActorRequest, @Param('id') id: string, @Body() body: JsonMap) { return this.service.actionSupportRequest(request.user, id, body); }
  @Post('/pg-attendance') attendance(@Req() request: ActorRequest, @Body() body: JsonMap) { return this.service.recordPgAttendance(request.user, body); }
  @Get('/pg-attendance') attendanceList(@Req() request: ActorRequest, @Query('from') from?: string, @Query('to') to?: string) { return this.service.listPgAttendance(request.user, from, to); }
  @Get('/pg-attendance/export')
  async attendanceExport(@Req() request: ActorRequest, @Res({ passthrough: true }) reply: FastifyReply, @Query('from') from?: string, @Query('to') to?: string) {
    const result = await this.service.listPgAttendance(request.user, from, to);
    const rows = result.data as JsonMap[];
    const header = ['Mã PG','Ngày','Loại','Thời gian','Địa điểm','Khoảng cách (m)','Sai số GPS (m)','Trạng thái'];
    const csv = '\uFEFF' + [header.map(csvCell).join(','), ...rows.map((row) => [
      row.pg_code,row.work_date,row.record_type,row.recorded_at,row.site_name,row.distance_m,row.accuracy_m,row.status,
    ].map(csvCell).join(','))].join('\n');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="Cham_cong_PG_${from || clinicDate()}_${to || clinicDate()}.csv"`);
    return csv;
  }
}
