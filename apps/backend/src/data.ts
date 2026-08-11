import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

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
]);

const adminRoles = new Set(['admin', 'admin_it', 'superadmin']);
const hrWriteTables = new Set([
  'profiles', 'employees', 'attendance_records', 'leave_requests', 'schedule_requests',
  'schedule_assignments', 'work_shifts', 'employee_allowed_shifts', 'leader_scopes',
  'onboarding_docs', 'onboarding_progress', 'recruitment', 'notifications', 'messages',
]);
const staffWriteTables = new Set([
  'attendance_records', 'leave_requests', 'schedule_requests', 'messages', 'notifications',
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

@Injectable()
export class DataService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  private canWrite(user: AuthUser, table: string) {
    if (user.role === 'pg_staff') return false;
    if (adminRoles.has(user.role)) return true;
    if (user.role === 'hr') return hrWriteTables.has(table);
    if (user.role === 'leader') return staffWriteTables.has(table);
    return staffWriteTables.has(table);
  }

  private owns(user: AuthUser, table: string, row: JsonMap) {
    if (adminRoles.has(user.role) || user.role === 'hr') return true;
    const employee = user.employeeCode.toLowerCase();
    if (user.role === 'leader') {
      if (table === 'employees' || table === 'profiles') return String(row.department || '').toLowerCase() === user.department.toLowerCase();
      return true;
    }
    if (table === 'profiles') return String(row.id || '') === user.id;
    if (table === 'employees') return String(row.code || '').toLowerCase() === employee;
    if (table === 'attendance_records' || table === 'leave_requests' || table === 'schedule_requests' || table === 'schedule_assignments') {
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
    if (!adminRoles.has(user.role) && user.role !== 'hr' && user.role !== 'leader') {
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

  async execute(user: AuthUser, request: QueryRequest) {
    const table = String(request.table || '');
    if (!tables.has(table)) throw new BadRequestException('Bảng dữ liệu không được hỗ trợ.');
    const operation = request.operation || 'select';
    const filters = Array.isArray(request.filters) ? request.filters : [];
    const stored = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
      'select record_key,payload from app.records where entity_type=$1 and deleted_at is null order by updated_at desc limit 5000', [table],
    );
    let selected = stored.rows.filter(({ payload }) => filters.every((filter) => matches(payload, filter)) && this.owns(user, table, payload));

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
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally { client.release(); }
      return { data: Array.isArray(request.values) ? output : output[0] };
    }

    const output: JsonMap[] = [];
    for (const current of selected) {
      if (!this.owns(user, table, current.payload)) throw new ForbiddenException();
      if (operation === 'delete') {
        await this.infrastructure.postgres.query(
          `update app.records set deleted_at=now(),origin='vps',version=version+1,updated_at=now() where entity_type=$1 and record_key=$2`,
          [table, current.record_key],
        );
        output.push(current.payload);
      } else if (operation === 'update') {
        const patch = this.protectWrite(user, table, { ...(request.values as JsonMap || {}) });
        const next = { ...current.payload, ...patch, updated_at: new Date().toISOString() };
        await this.infrastructure.postgres.query(
          `update app.records set payload=$3::jsonb,origin='vps',version=version+1,updated_at=now() where entity_type=$1 and record_key=$2`,
          [table, current.record_key, JSON.stringify(next)],
        );
        output.push(next);
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
}
