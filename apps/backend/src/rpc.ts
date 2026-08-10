import { randomUUID } from 'node:crypto';
import { Body, Controller, ForbiddenException, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, unknown>;
const admins = new Set(['admin', 'admin_it', 'superadmin']);

@Injectable()
export class RpcService {
  constructor(private readonly infrastructure: InfrastructureService) {}

  private async put(table: string, value: JsonMap, key = String(value.id || randomUUID())) {
    if (!value.id) value.id = key;
    const now = new Date().toISOString();
    if (!value.created_at) value.created_at = now;
    value.updated_at = now;
    await this.infrastructure.postgres.query(
      `insert into app.records(entity_type,record_key,payload,origin) values ($1,$2,$3::jsonb,'vps')
       on conflict(entity_type,record_key) do update set payload=excluded.payload,origin='vps',version=app.records.version+1,updated_at=now(),deleted_at=null`,
      [table, key, JSON.stringify(value)],
    );
    return value;
  }

  private async byId(table: string, id: string) {
    const result = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
      `select record_key,payload from app.records where entity_type=$1 and deleted_at is null and (record_key=$2 or payload->>'id'=$2) limit 1`, [table, id],
    );
    return result.rows[0] || null;
  }

  async call(user: AuthUser, name: string, args: JsonMap) {
    if (name === 'list_message_contacts') {
      const result = await this.infrastructure.postgres.query<{ profile: JsonMap; employee: JsonMap | null }>(
        `select p.payload profile,e.payload employee from app.records p left join app.records e
         on e.entity_type='employees' and lower(e.payload->>'code')=lower(p.payload->>'employee_code') and e.deleted_at is null
         where p.entity_type='profiles' and p.deleted_at is null and coalesce((p.payload->>'active')::boolean,true)=true`,
      );
      return result.rows.filter((row) => {
        const role = String(row.profile.role || 'staff'); const department = String(row.profile.department || '');
        if (String(row.profile.id) === user.id) return false;
        if (admins.has(user.role) || user.role === 'hr') return true;
        if (user.role === 'leader') return admins.has(role) || role === 'hr' || department === user.department;
        return admins.has(role) || role === 'hr' || (role === 'leader' && department === user.department);
      }).map((row) => ({ user_id: row.profile.id, employee_code: row.profile.employee_code, full_name: row.profile.full_name,
        department: row.profile.department || row.employee?.department || '', title: row.employee?.title || '', contact_role: row.profile.role }));
    }
    if (name === 'submit_leave_request') {
      const employeeCode = ['staff'].includes(user.role) ? user.employeeCode : String(args.p_employee_code || user.employeeCode);
      return this.put('leave_requests', { id: randomUUID(), employee_code: employeeCode, request_type: args.p_request_type,
        from_date: args.p_from_date, to_date: args.p_to_date || args.p_from_date, reason: args.p_reason,
        amount: Number(args.p_amount || 0), bank_account: args.p_bank_account || null,
        request_start_time: args.p_start_time || null, request_end_time: args.p_end_time || null,
        overtime_minutes: Number(args.p_overtime_minutes || 0), status: 'pending', leader_status: 'pending',
        operations_status: 'pending', routed_to: 'leader' });
    }
    if (name === 'review_leave_request') {
      const current = await this.byId('leave_requests', String(args.p_request_id || ''));
      if (!current) throw new Error('Không tìm thấy đơn cần duyệt.');
      const approved = String(args.p_decision) === 'approved';
      const next: JsonMap = { ...current.payload, reviewer_code: user.employeeCode, rejection_reason: args.p_reason || null };
      if (user.role === 'leader') {
        next.leader_status = approved ? 'approved' : 'rejected'; next.leader_reviewed_at = new Date().toISOString();
        next.status = approved ? 'pending' : 'rejected'; next.routed_to = approved ? 'hcth' : 'completed';
      } else if (user.role === 'hr' || admins.has(user.role)) {
        next.operations_status = approved ? 'approved' : 'rejected'; next.operations_reviewed_at = new Date().toISOString();
        next.status = approved ? 'approved' : 'rejected'; next.routed_to = 'completed';
      } else throw new ForbiddenException('Tài khoản không có quyền duyệt đơn.');
      return this.put('leave_requests', next, current.record_key);
    }
    if (name === 'report_client_error') {
      return this.put('system_error_logs', { id: randomUUID(), level: args.p_level || 'error', message: args.p_message,
        context: args.p_context || {}, page_url: args.p_page_url, user_agent: args.p_user_agent, source: 'client',
        user_id: user.id, resolved: false });
    }
    if (name === 'get_system_health') {
      if (!admins.has(user.role)) throw new ForbiddenException();
      const counts = await this.infrastructure.postgres.query<{ entity_type: string; count: string }>(
        'select entity_type,count(*)::text count from app.records where deleted_at is null group by entity_type',
      );
      const map = Object.fromEntries(counts.rows.map((row) => [row.entity_type, Number(row.count)]));
      return { database: 'active', active_accounts: map.profiles || 0, attendance_records: map.attendance_records || 0,
        sync_errors: 0, open_bugs: map.system_bug_logs || 0, source: 'vps-postgresql' };
    }
    if (name === 'publish_system_announcement') {
      if (!admins.has(user.role)) throw new ForbiddenException();
      return this.put('system_announcements', { id: randomUUID(), title: args.p_title, body: args.p_body,
        category: args.p_category, audience: args.p_audience, created_by: user.id, active: true });
    }
    if (name === 'system_update_user_access') {
      if (!admins.has(user.role)) throw new ForbiddenException();
      const current = await this.byId('profiles', String(args.p_user_id || ''));
      if (!current) throw new Error('Không tìm thấy hồ sơ người dùng.');
      const next = { ...current.payload, role: args.p_role, active: Boolean(args.p_active) };
      await this.put('profiles', next, current.record_key);
      return next;
    }
    if (name === 'resolve_system_error') {
      if (!admins.has(user.role)) throw new ForbiddenException();
      const current = await this.byId('system_error_logs', String(args.p_error_id || ''));
      if (!current) return null;
      return this.put('system_error_logs', { ...current.payload, resolved: Boolean(args.p_resolved),
        resolved_at: args.p_resolved ? new Date().toISOString() : null, resolved_by: user.id }, current.record_key);
    }
    throw new Error(`Nghiệp vụ ${name} chưa được hỗ trợ trên VPS.`);
  }
}

@Controller('/api/v2/rpc')
@UseGuards(AuthGuard)
export class RpcController {
  constructor(private readonly rpc: RpcService) {}
  @Post('/call')
  call(@Req() request: { user: AuthUser }, @Body() body: { name?: string; args?: JsonMap }) {
    return this.rpc.call(request.user, String(body.name || ''), body.args || {});
  }
}
