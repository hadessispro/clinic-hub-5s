import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';
import { PushService } from './push';

type JsonMap = Record<string, unknown>;
type Filter = { field: string; op: 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'gt' | 'lt' | 'is' | 'ilike'; value: unknown };
type QueryRequest = {
  table: string;
  operation?: 'select' | 'insert' | 'upsert' | 'update' | 'delete';
  filters?: Filter[];
  values?: JsonMap | JsonMap[];
  order?: { field: string; ascending?: boolean }[];
  limit?: number;
  offset?: number;
};

const tables = new Set([
  'profiles', 'employees', 'attendance_records', 'tasks', 'leave_requests', 'proposals',
  'inventory_items', 'purchase_requests', 'assets', 'asset_audits', 'uniform_logs',
  'onboarding_docs', 'onboarding_progress', 'recruitment', 'schedule_requests',
  'schedule_assignments', 'payroll_feedback', 'incidents', 'messages', 'notifications',
  'performance_metrics', 'audit_logs', 'clinic_state_snapshots', 'clinic_locations',
  'integration_outbox', 'system_bug_logs', 'system_announcements', 'system_error_logs',
  'work_shifts', 'employee_allowed_shifts', 'leader_scopes', 'push_subscriptions',
  'attendance_work_days',
  'marketing_campaigns', 'marketing_leads', 'telesale_call_logs',
  // Ghi đè phân quyền màn hình. MỌI người đăng nhập phải ĐỌC được: ứng dụng
  // nạp bảng này ngay sau khi xác thực để biết người đó thấy những màn nào.
  // Quyền GHI đã bị chặn sẵn ở canWrite — chỉ admin/admin_it/superadmin, vì
  // 'phan_quyen' không nằm trong hrWriteTables lẫn staffWriteTables.
  'phan_quyen',
]);

const adminRoles = new Set(['admin', 'admin_it', 'superadmin']);
const departmentLeaderRoles = new Set(['leader', 'phu_ta_truong']);
const hrWriteTables = new Set([
  'profiles', 'employees', 'attendance_records', 'leave_requests', 'schedule_requests',
  'schedule_assignments', 'work_shifts', 'employee_allowed_shifts', 'leader_scopes',
  'onboarding_docs', 'onboarding_progress', 'recruitment', 'notifications', 'messages',
]);
const staffWriteTables = new Set([
  'attendance_records', 'leave_requests', 'schedule_requests', 'schedule_assignments', 'messages', 'notifications',
  'push_subscriptions', 'payroll_feedback', 'incidents', 'tasks',
]);

function safeField(field: string) {
  if (!/^[a-z][a-z0-9_]*$/i.test(field)) throw new BadRequestException(`Tên trường không hợp lệ: ${field}`);
  return field;
}

function comparable(value: unknown) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function matches(row: JsonMap, filter: Filter) {
  const actual = comparable(row[safeField(filter.field)]);
  const expected = comparable(filter.value);
  switch (filter.op) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'in': return Array.isArray(filter.value) && filter.value.map(comparable).includes(actual);
    case 'gte': return actual != null && expected != null && actual >= expected;
    case 'lte': return actual != null && expected != null && actual <= expected;
    case 'gt': return actual != null && expected != null && actual > expected;
    case 'lt': return actual != null && expected != null && actual < expected;
    case 'is': return expected === null ? actual == null : actual === expected;
    case 'ilike': {
      const needle = String(expected || '').replace(/^%|%$/g, '').toLocaleLowerCase('vi');
      return String(actual || '').toLocaleLowerCase('vi').includes(needle);
    }
    default: return false;
  }
}

function rowKey(row: JsonMap) {
  return String(row.id || row.code || row.client_event_id || randomUUID());
}

function defaultRoleForEmployee(department?: unknown, title?: unknown): string {
  const dept = String(department || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  if (dept === 'bs' || t.includes('bác sĩ')) return 'bac_si';
  if (t.includes('phụ tá trưởng')) return 'phu_ta_truong';
  if (dept === 'phuta' || t.includes('phụ tá')) return 'phu_ta';
  if (t.includes('lễ tân')) return 'le_tan';
  if (dept === 'dvkh' || t.includes('cskh') || t.includes('khách hàng')) return 'le_tan';
  if (dept === 'ns' || t.includes('nhân sự') || t.includes('hr')) return 'hr';
  if (dept === 'mkt' || t.includes('marketing')) {
    if (t.includes('lead') || t.includes('quản lý')) return 'admin_marketing';
    return 'support_marketing';
  }
  if (t.includes('telesale') || t.includes('tele')) {
    if (t.includes('trưởng') || t.includes('lead')) return 'telesale_leader';
    return 'telesale_staff';
  }
  if (t.includes('pg') || t.includes('thị trường')) return 'pg_staff';
  if (dept === 'it' || t.includes('it')) return 'admin_it';
  return 'staff';
}

function defaultAllowedShiftsForEmployee(department?: unknown, title?: unknown): string[] {
  const dept = String(department || '').toLowerCase();
  const t = String(title || '').toLowerCase();
  if (dept === 'phuta' || dept === 'dvkh' || t.includes('phụ tá') || t.includes('lễ tân')) {
    return ['front-office', 'front-morning', 'front-afternoon', 'front-full'];
  }
  if (dept === 'bs' || t.includes('bác sĩ')) {
    return ['doctor-office', 'doctor-morning', 'doctor-afternoon', 'doctor-full'];
  }
  if (dept === 'baove' || t.includes('bảo vệ')) {
    return ['security-weekday', 'security-sunday'];
  }
  if (dept === 'laocong' || t.includes('tạp vụ')) {
    return ['cleaning-weekday', 'cleaning-sunday'];
  }
  return [];
}

@Injectable()
export class DataService {
  constructor(
    private readonly infrastructure: InfrastructureService,
    private readonly push: PushService,
  ) {}

  private canWrite(user: AuthUser, table: string) {
    if (user.role === 'pg_staff') return false;
    if (adminRoles.has(user.role)) return true;
    if (user.role === 'hr') return hrWriteTables.has(table);
    if (departmentLeaderRoles.has(user.role)) return staffWriteTables.has(table);
    return staffWriteTables.has(table);
  }

  private owns(user: AuthUser, table: string, row: JsonMap, managedCodes: Set<string> | null = null) {
    if (adminRoles.has(user.role) || user.role === 'hr') return true;
    const employee = user.employeeCode.toLowerCase();
    if (departmentLeaderRoles.has(user.role)) {
      if (table === 'employees' || table === 'profiles') return String(row.department || '').toLowerCase() === user.department.toLowerCase();
      if (['attendance_records', 'attendance_work_days', 'leave_requests', 'schedule_requests', 'schedule_assignments'].includes(table)) {
        return managedCodes?.has(String(row.employee_code || '').toLowerCase()) || false;
      }
      if (table === 'tasks') {
        return String(row.department || '').toLowerCase() === user.department.toLowerCase()
          || (managedCodes?.has(String(row.assignee_code || '').toLowerCase()) || false);
      }
      return true;
    }
    if (table === 'profiles') return String(row.id || '') === user.id;
    if (table === 'employees') return String(row.code || '').toLowerCase() === employee;
    if (table === 'attendance_records' || table === 'attendance_work_days' || table === 'leave_requests' || table === 'schedule_requests' || table === 'schedule_assignments') {
      return String(row.employee_code || '').toLowerCase() === employee;
    }
    if (table === 'messages') {
      return [row.author_code, row.sender_id, row.recipient_id].some((value) => String(value || '').toLowerCase() === employee || String(value || '') === user.id);
    }
    if (table === 'notifications' || table === 'push_subscriptions') return String(row.user_id || '') === user.id;
    return true;
  }

  private protectWrite(user: AuthUser, table: string, row: JsonMap) {
    if (!this.canWrite(user, table)) throw new ForbiddenException('Tài khoản không có quyền thay đổi dữ liệu này.');
    if (!adminRoles.has(user.role) && user.role !== 'hr' && !departmentLeaderRoles.has(user.role)) {
      if (['attendance_records', 'leave_requests', 'schedule_requests', 'schedule_assignments'].includes(table)) {
        row.employee_code = user.employeeCode;
      }
      if (table === 'notifications' || table === 'push_subscriptions') row.user_id = user.id;
      if (table === 'messages') {
        row.author_code = user.employeeCode;
        row.sender_id = user.id;
      }
    }
    return row;
  }

  async version(user: AuthUser) {
    return { ...(await this.infrastructure.dataRevision(user.id, user.role)), userId: user.id };
  }

  async execute(user: AuthUser, request: QueryRequest) {
    const table = String(request.table || '');
    if (!tables.has(table)) throw new BadRequestException('Bảng dữ liệu không được hỗ trợ.');
    const operation = request.operation || 'select';
    const filters = Array.isArray(request.filters) ? request.filters : [];
    const stored = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
      'select record_key,payload from app.records where entity_type=$1 and deleted_at is null order by updated_at desc limit 5000', [table],
    );
    let managedCodes: Set<string> | null = null;
    if (departmentLeaderRoles.has(user.role)) {
      const team = await this.infrastructure.postgres.query<{ employee_code: string }>(
        `select lower(payload->>'code') employee_code from app.records
         where entity_type='employees' and deleted_at is null and lower(payload->>'department')=lower($1)`,
        [user.department],
      );
      managedCodes = new Set(team.rows.map((row) => row.employee_code));
    }
    let selected = stored.rows.filter(({ payload }) => filters.every((filter) => matches(payload, filter)) && this.owns(user, table, payload, managedCodes));

    if (operation === 'select') {
      const orders = request.order || [];
      selected.sort((left, right) => {
        for (const order of orders) {
          const field = safeField(order.field);
          const a = comparable(left.payload[field]);
          const b = comparable(right.payload[field]);
          if (a === b) continue;
          const direction = order.ascending === false ? -1 : 1;
          return (a == null || (b != null && a < b)) ? -direction : direction;
        }
        return 0;
      });
      const offset = Math.max(Number(request.offset || 0), 0);
      const limit = Math.min(Math.max(Number(request.limit || 1000), 1), 5000);
      return { data: selected.slice(offset, offset + limit).map((row) => row.payload) };
    }

    if (!this.canWrite(user, table)) throw new ForbiddenException('Tài khoản không có quyền thay đổi dữ liệu này.');
    if (operation === 'insert' || operation === 'upsert') {
      const inputs = (Array.isArray(request.values) ? request.values : [request.values || {}]).map((value) => this.protectWrite(user, table, { ...value }));
      const output: JsonMap[] = [];
      const tablesToNotify = new Set([table]);
      const client = await this.infrastructure.postgres.connect();
      try {
        await client.query('begin');
        for (const input of inputs) {
          const now = new Date().toISOString();
          if (!input.id && !input.code && !input.client_event_id) input.id = randomUUID();
          if (!input.created_at) input.created_at = now;
          input.updated_at = now;
          const key = rowKey(input);
          const result = await client.query<{ payload: JsonMap }>(
            `insert into app.records(entity_type,record_key,payload,origin) values ($1,$2,$3::jsonb,'vps')
             on conflict (entity_type,record_key) do update set payload=excluded.payload,origin='vps',version=app.records.version+1,updated_at=now(),deleted_at=null
             returning payload`, [table, key, JSON.stringify(input)],
          );
          output.push(result.rows[0].payload);
        }

        if (table === 'employees') {
          for (const rawItem of output) {
            const item: any = rawItem;
            const empCode = String(item.code || item.id || '').trim();
            if (!empCode) continue;
            const existing = await client.query<{ record_key: string; payload: JsonMap }>(
              `select record_key, payload from app.records
               where entity_type='profiles' and deleted_at is null
                 and (lower(payload->>'employee_code')=lower($1) or lower(payload->>'id')=lower($1) or lower(record_key)=lower($1))
               limit 1`, [empCode],
            );
            const nowIso = new Date().toISOString();
            if (existing.rows[0]) {
              const prev = existing.rows[0].payload;
              const updated = {
                ...prev,
                full_name: item.full_name || prev.full_name,
                phone: item.phone !== undefined ? (item.phone || null) : prev.phone,
                email: item.email !== undefined ? (item.email || null) : prev.email,
                department: item.department || prev.department,
                title: item.title !== undefined ? (item.title || null) : prev.title,
                branch_id: item.branch_id || prev.branch_id || 'pham-van-chieu',
                active: item.status ? item.status !== 'inactive' : prev.active,
                updated_at: nowIso,
              };
              await client.query(
                `update app.records set payload=$2::jsonb, origin='vps', version=version+1, updated_at=now()
                 where entity_type='profiles' and record_key=$1`,
                [existing.rows[0].record_key, JSON.stringify(updated)],
              );
            } else {
              const profileKey = `staff-profile-${empCode.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;
              const newProfile = {
                id: profileKey,
                employee_code: empCode,
                employee_number: item.employee_number || empCode,
                full_name: item.full_name || empCode,
                phone: item.phone || null,
                email: item.email || null,
                department: item.department || '',
                title: item.title || null,
                branch_id: item.branch_id || 'pham-van-chieu',
                role: defaultRoleForEmployee(item.department, item.title),
                active: item.status ? item.status !== 'inactive' : true,
                created_at: nowIso,
                updated_at: nowIso,
              };
              await client.query(
                `insert into app.records(entity_type, record_key, payload, origin)
                 values ('profiles', $1, $2::jsonb, 'vps')
                 on conflict (entity_type, record_key) do update
                 set payload=excluded.payload, origin='vps', version=app.records.version+1, updated_at=now(), deleted_at=null`,
                [profileKey, JSON.stringify(newProfile)],
              );
            }
            tablesToNotify.add('profiles');

            // Auto-provision default allowed shifts for new employee
            const defaultShifts = defaultAllowedShiftsForEmployee(item.department, item.title);
            for (const shiftCode of defaultShifts) {
              const existingShift = await client.query(
                `select record_key from app.records
                 where entity_type='employee_allowed_shifts' and deleted_at is null
                   and (lower(payload->>'employee_code')=lower($1) or lower(payload->>'employee_code')=lower($2))
                   and payload->>'shift_code'=$3 limit 1`,
                [empCode, String(item.id || ''), shiftCode],
              );
              if (!existingShift.rows[0]) {
                const shiftKey = randomUUID();
                await client.query(
                  `insert into app.records(entity_type, record_key, payload, origin)
                   values ('employee_allowed_shifts', $1, $2::jsonb, 'vps')`,
                  [shiftKey, JSON.stringify({
                    id: shiftKey,
                    employee_code: empCode,
                    shift_code: shiftCode,
                    created_at: nowIso,
                    updated_at: nowIso,
                  })],
                );
                tablesToNotify.add('employee_allowed_shifts');
              }
            }
          }
        }

        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally { client.release(); }
      await this.infrastructure.markDataChanged(Array.from(tablesToNotify), user.id, user.role);

      // Web Push dispatch for inserted/upserted items
      if (table === 'messages') {
        for (const item of output) {
          const recipientId = String(item.recipient_id || '');
          if (recipientId && recipientId !== user.id) {
            const authorName = String(user.profile?.full_name || user.employeeCode || 'Một đồng nghiệp');
            const snippet = String(item.body || '').slice(0, 100);
            void this.push.sendToUser(recipientId, {
              title: `💬 Tin nhắn từ ${authorName}`,
              body: snippet,
              view: 'messages',
              url: '/',
            }).catch((e) => console.error('[DataService] push message error:', e));
          }
        }
      } else if (table === 'tasks') {
        for (const item of output) {
          const assigneeCode = String(item.assignee_code || '');
          if (assigneeCode && assigneeCode.toLowerCase() !== user.employeeCode.toLowerCase()) {
            const taskTitle = String(item.title || 'Công việc mới');
            void this.push.sendToEmployee(assigneeCode, {
              title: '📋 Bạn được giao việc mới',
              body: `${user.profile?.full_name || user.employeeCode} đã giao việc: "${taskTitle}"`,
              view: 'tasks',
              url: '/',
            }).catch((e) => console.error('[DataService] push task error:', e));
          }
        }
      } else if (table === 'notifications') {
        for (const item of output) {
          const targetUserId = String(item.user_id || '');
          if (targetUserId && targetUserId !== user.id) {
            void this.push.sendToUser(targetUserId, {
              title: String(item.title || '5S Clinic Hub'),
              body: String(item.body || ''),
              id: String(item.id || ''),
              view: String(item.link_view || 'dashboard'),
              url: '/',
            }).catch((e) => console.error('[DataService] push notification error:', e));
          }
        }
      }

      return { data: Array.isArray(request.values) ? output : output[0] };
    }

    const output: JsonMap[] = [];
    const tablesToNotify = new Set([table]);
    for (const current of selected) {
      if (!this.owns(user, table, current.payload, managedCodes)) throw new ForbiddenException();
      if (operation === 'delete') {
        await this.infrastructure.postgres.query(
          `update app.records set deleted_at=now(),origin='vps',version=version+1,updated_at=now() where entity_type=$1 and record_key=$2`,
          [table, current.record_key],
        );
        output.push(current.payload);
        if (table === 'employees') {
          const empCode = String(current.payload.code || current.payload.id || '').trim();
          if (empCode) {
            await this.infrastructure.postgres.query(
              `update app.records
               set payload = jsonb_set(payload, '{active}', 'false'::jsonb),
                   origin='vps', version=version+1, updated_at=now()
               where entity_type='profiles' and deleted_at is null
                 and (lower(payload->>'employee_code')=lower($1) or lower(payload->>'id')=lower($1))`,
              [empCode],
            );
            tablesToNotify.add('profiles');
          }
        }
      } else if (operation === 'update') {
        const patch = this.protectWrite(user, table, { ...(request.values as JsonMap || {}) });
        const next: any = { ...current.payload, ...patch, updated_at: new Date().toISOString() };
        await this.infrastructure.postgres.query(
          `update app.records set payload=$3::jsonb,origin='vps',version=version+1,updated_at=now() where entity_type=$1 and record_key=$2`,
          [table, current.record_key, JSON.stringify(next)],
        );
        output.push(next);
        if (table === 'employees') {
          const empCode = String(next.code || next.id || '').trim();
          if (empCode) {
            const existing = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
              `select record_key, payload from app.records
               where entity_type='profiles' and deleted_at is null
                 and (lower(payload->>'employee_code')=lower($1) or lower(payload->>'id')=lower($1) or lower(record_key)=lower($1))
               limit 1`, [empCode],
            );
            if (existing.rows[0]) {
              const prev = existing.rows[0].payload;
              const updated = {
                ...prev,
                full_name: next.full_name || prev.full_name,
                phone: next.phone !== undefined ? (next.phone || null) : prev.phone,
                email: next.email !== undefined ? (next.email || null) : prev.email,
                department: next.department || prev.department,
                title: next.title !== undefined ? (next.title || null) : prev.title,
                branch_id: next.branch_id || prev.branch_id || 'pham-van-chieu',
                active: next.status ? next.status !== 'inactive' : prev.active,
                updated_at: new Date().toISOString(),
              };
              await this.infrastructure.postgres.query(
                `update app.records set payload=$2::jsonb, origin='vps', version=version+1, updated_at=now()
                 where entity_type='profiles' and record_key=$1`,
                [existing.rows[0].record_key, JSON.stringify(updated)],
              );
            }
            tablesToNotify.add('profiles');

            // Auto-provision default allowed shifts for updated employee if missing
            const defaultShifts = defaultAllowedShiftsForEmployee(next.department, next.title);
            for (const shiftCode of defaultShifts) {
              const existingShift = await this.infrastructure.postgres.query(
                `select record_key from app.records
                 where entity_type='employee_allowed_shifts' and deleted_at is null
                   and (lower(payload->>'employee_code')=lower($1) or lower(payload->>'employee_code')=lower($2))
                   and payload->>'shift_code'=$3 limit 1`,
                [empCode, String(next.id || ''), shiftCode],
              );
              if (!existingShift.rows[0]) {
                const shiftKey = randomUUID();
                await this.infrastructure.postgres.query(
                  `insert into app.records(entity_type, record_key, payload, origin)
                   values ('employee_allowed_shifts', $1, $2::jsonb, 'vps')`,
                  [shiftKey, JSON.stringify({
                    id: shiftKey,
                    employee_code: empCode,
                    shift_code: shiftCode,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })],
                );
                tablesToNotify.add('employee_allowed_shifts');
              }
            }
          }
        }
      }
    }
    if (selected.length) {
      await this.infrastructure.markDataChanged(Array.from(tablesToNotify), user.id, user.role);
      if (table === 'tasks') {
        for (const item of output) {
          const assigneeCode = String(item.assignee_code || '');
          if (assigneeCode && assigneeCode.toLowerCase() !== user.employeeCode.toLowerCase()) {
            const taskTitle = String(item.title || 'Công việc');
            const status = String(item.status || '');
            void this.push.sendToEmployee(assigneeCode, {
              title: '📋 Cập nhật công việc',
              body: `Công việc "${taskTitle}" đã được cập nhật (trạng thái: ${status})`,
              view: 'tasks',
              url: '/',
            }).catch((e) => console.error('[DataService] push task update error:', e));
          }
        }
      }
    }
    return { data: output };
  }
}

@Controller('/api/v2/data')
@UseGuards(AuthGuard)
export class DataController {
  constructor(private readonly data: DataService) {}
  @Post('/query')
  query(@Req() request: { user: AuthUser }, @Body() body: QueryRequest) {
    return this.data.execute(request.user, body);
  }

  @Get('/version')
  version(@Req() request: { user: AuthUser }) {
    return this.data.version(request.user);
  }
}
