import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Injectable, Post, Req, UseGuards } from '@nestjs/common';
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
    await this.infrastructure.markDataChanged([table]);
    return value;
  }

  private async byId(table: string, id: string) {
    const result = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
      `select record_key,payload from app.records where entity_type=$1 and deleted_at is null and (record_key=$2 or payload->>'id'=$2) limit 1`, [table, id],
    );
    return result.rows[0] || null;
  }

  async call(user: AuthUser, name: string, args: JsonMap) {
    if (name === 'archive_old_records') {
      if (!(admins.has(user.role) || user.role === 'hr')) throw new ForbiddenException('Không có quyền lưu trữ dữ liệu.');
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const result = await this.infrastructure.postgres.query<{ entity_type: string; record_key: string; payload: JsonMap }>(
        `select entity_type,record_key,payload from app.records
         where entity_type=any($1::text[]) and deleted_at is null
         and coalesce(payload->>'created_at',payload->>'timestamp','9999-12-31')<$2`,
        [['leave_requests', 'attendance_records'], cutoff],
      );
      const leaves = result.rows.filter((row) => row.entity_type === 'leave_requests');
      const attendance = result.rows.filter((row) => row.entity_type === 'attendance_records');
      if (!result.rows.length) return { success: true, archivedLeaves: 0, archivedAttendance: 0, purged: false,
        message: 'Chưa có dữ liệu quá 60 ngày để lưu trữ.' };
      await this.put('integration_outbox', { id: randomUUID(), entity_type: 'archive_2months_json',
        entity_id: `archive_${Date.now()}`, status: 'pending', attempts: 0,
        payload: { archive_date: new Date().toISOString(), cutoff_date: cutoff,
          leave_records: leaves.map((row) => row.payload), attendance_records: attendance.map((row) => row.payload) } });
      await this.infrastructure.postgres.query(
        `update app.records set deleted_at=now(),origin='vps',version=version+1,updated_at=now()
         where (entity_type,record_key) in (select * from unnest($1::text[],$2::text[]))`,
        [result.rows.map((row) => row.entity_type), result.rows.map((row) => row.record_key)],
      );
      return { success: true, archivedLeaves: leaves.length, archivedAttendance: attendance.length, purged: true,
        message: `Đã đóng gói ${leaves.length} đơn và ${attendance.length} bản ghi chấm công quá 60 ngày.` };
    }
    if (name === 'monthly_schedule_action') {
      const month = String(args.month || '');
      const employeeCode = String(args.employee || '');
      const action = String(args.action || '');
      if (!/^\d{4}-\d{2}$/.test(month) || !employeeCode) throw new Error('Tháng hoặc nhân viên không hợp lệ.');
      const employeeResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='employees' and deleted_at is null and lower(payload->>'code')=lower($1) limit 1`, [employeeCode],
      );
      const employee = employeeResult.rows[0]?.payload;
      if (!employee) throw new Error('Không tìm thấy nhân viên.');
      const permitted = admins.has(user.role) || user.role === 'hr'
        || (user.role === 'leader' && String(employee.department || '') === user.department)
        || (user.role === 'staff' && employeeCode.toLowerCase() === user.employeeCode.toLowerCase());
      if (!permitted) throw new ForbiddenException('Nhân viên không thuộc phạm vi quản lý.');
      const requestResult = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
        `select record_key,payload from app.records where entity_type='schedule_requests' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_month'=$2 order by updated_at desc limit 1`, [employeeCode, month],
      );
      const current = requestResult.rows[0];
      let meta: JsonMap = { workflow: 'monthly_schedule_v1', stage: 'draft' };
      try { meta = { ...meta, ...JSON.parse(String(current?.payload.preference || '{}')) }; } catch { /* use draft */ }
      const now = new Date().toISOString(); const note = String(args.note || '').slice(0, 800);
      if (action === 'submit' || action === 'leader_forward') {
        const assigned = await this.infrastructure.postgres.query<{ count: string }>(
          `select count(*)::text count from app.records where entity_type='schedule_assignments' and deleted_at is null
           and lower(payload->>'employee_code')=lower($1) and payload->>'work_date' like $2`, [employeeCode, `${month}-%`],
        );
        if (Number(assigned.rows[0]?.count || 0) < 1) throw new Error('Nhân viên chưa đăng ký ca làm nào trong tháng.');
      }
      if (action === 'submit') {
        if (user.role === 'staff' && user.employeeCode.toLowerCase() !== employeeCode.toLowerCase()) throw new ForbiddenException();
        meta = { ...meta, stage: 'leader_review', employeeSubmittedAt: now, employeeNote: note };
      } else if (action === 'leader_forward' && (user.role === 'leader' || admins.has(user.role))) {
        meta = { ...meta, stage: 'hr_review', leaderReviewedAt: now, leaderNote: note };
      } else if (action === 'return_to_staff' && (user.role === 'leader' || admins.has(user.role))) {
        meta = { ...meta, stage: 'returned', returnedBy: 'leader', returnedAt: now, leaderNote: note };
      } else if (action === 'hr_approve' && (user.role === 'hr' || admins.has(user.role))) {
        meta = { ...meta, stage: 'approved', hrReviewedAt: now, hrNote: note, finalApprover: user.profile.full_name || user.employeeCode };
      } else if (action === 'hr_return' && (user.role === 'hr' || admins.has(user.role))) {
        meta = { ...meta, stage: 'leader_review', returnedBy: 'hr', returnedAt: now, hrNote: note };
      } else throw new ForbiddenException('Tài khoản không được phép thực hiện bước duyệt này.');
      const status = meta.stage === 'approved' ? 'approved' : meta.stage === 'returned' ? 'rejected' : 'pending';
      const value: JsonMap = { ...(current?.payload || {}), id: current?.payload.id || randomUUID(), employee_code: employeeCode,
        work_month: month, preference: JSON.stringify(meta), status, reviewer_code: user.employeeCode, submitted_at: now };
      await this.put('schedule_requests', value, current?.record_key || String(value.id));
      const targetRoles = meta.stage === 'hr_review' ? ['hr', 'admin'] : [];
      if (targetRoles.length) {
        const profiles = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where entity_type='profiles' and deleted_at is null and payload->>'role'=any($1::text[])`, [targetRoles],
        );
        for (const profile of profiles.rows) await this.put('notifications', { id: randomUUID(), user_id: profile.payload.id,
          title: 'Lịch làm việc chờ duyệt', body: `${employee.full_name || employeeCode} đã gửi lịch tháng ${month}.`,
          type: 'schedule', link_view: 'schedule', read: false });
      }
      return { stage: meta.stage };
    }
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
      const activeProfiles = await this.infrastructure.postgres.query<{ active: string; inactive: string }>(
        `select
           count(*) filter (where coalesce((payload->>'active')::boolean,true))::text active,
           count(*) filter (where not coalesce((payload->>'active')::boolean,true))::text inactive
         from app.records where entity_type='profiles' and deleted_at is null`,
      );
      const profileCounts = activeProfiles.rows[0] || { active: '0', inactive: '0' };
      const lastAttendance = await this.infrastructure.postgres.query<{ last_at: string | null }>(
        `select max(coalesce(payload->>'recorded_at',payload->>'created_at')) last_at
         from app.records where entity_type='attendance_records' and deleted_at is null`,
      );
      return {
        database: 'online',
        checked_at: new Date().toISOString(),
        active_profiles: Number(profileCounts.active || 0),
        inactive_profiles: Number(profileCounts.inactive || 0),
        attendance_records: map.attendance_records || 0,
        last_attendance_at: lastAttendance.rows[0]?.last_at || null,
        failed_sync: 0,
        pending_sync: 0,
        open_bugs: map.system_bug_logs || 0,
        source: 'vps-postgresql',
      };
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
      await this.infrastructure.postgres.query(
        `insert into app.auth_audit
           (hanh_dong, actor_code, actor_role, muc_tieu_ma, muc_tieu_vai_tro, chi_tiet)
         values ($1, $2, $3, $4, $5, $6::jsonb)`,
        [Boolean(args.p_active) === false ? 'khoa_tai_khoan' : 'doi_vai_tro',
         user.employeeCode || null, user.role,
         String(current.payload.employee_code || args.p_user_id), String(args.p_role || ''),
         JSON.stringify({ vai_tro_cu: current.payload.role, vai_tro_moi: args.p_role,
                          hoat_dong: Boolean(args.p_active) })],
      );
      return next;
    }
    if (name === 'system_update_user_profile') {
      if (!admins.has(user.role)) throw new ForbiddenException('Chỉ quản trị viên được sửa thông tin tài khoản.');
      const current = await this.byId('profiles', String(args.p_user_id || ''));
      if (!current) throw new BadRequestException('Không tìm thấy hồ sơ người dùng.');
      const currentProfile = current.payload;
      const rank = (role: unknown) => ({ superadmin: 3, admin: 2, admin_it: 2 } as Record<string, number>)[String(role || '')] ?? 1;
      if (rank(currentProfile.role) >= rank(user.role) && String(currentProfile.id || '') !== user.id) {
        throw new ForbiddenException('Không được sửa hồ sơ của tài khoản có quyền bằng hoặc cao hơn bạn.');
      }
      const fullName = String(args.p_full_name || '').trim();
      const email = String(args.p_email || '').trim().toLowerCase();
      const phone = String(args.p_phone || '').trim();
      const department = String(args.p_department || '').trim();
      const title = String(args.p_title || '').trim();
      const branchId = String(args.p_branch_id || '').trim();
      const employeeCode = String(currentProfile.employee_code || '').trim();
      if (!fullName || !department || !branchId) throw new BadRequestException('Họ tên, bộ phận và chi nhánh là bắt buộc.');
      if (fullName.length > 160 || department.length > 100 || title.length > 120 || phone.length > 30) {
        throw new BadRequestException('Thông tin người dùng vượt quá độ dài cho phép.');
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Email không hợp lệ.');
      if (!['all', 'le-van-tho', 'pham-van-chieu'].includes(branchId)) throw new BadRequestException('Chi nhánh không hợp lệ.');

      const duplicate = email ? await this.infrastructure.postgres.query(
        `select 1 from app.local_accounts where lower(email)=lower($1) and profile_key<>$2 limit 1`,
        [email, current.record_key],
      ) : null;
      if (duplicate?.rowCount) throw new BadRequestException('Email này đang được dùng bởi tài khoản khác.');

      const nextProfile = { ...currentProfile, full_name: fullName, email: email || null,
        phone: phone || null, department, title: title || null, branch_id: branchId,
        updated_at: new Date().toISOString() };
      const employeeResult = employeeCode ? await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap }>(
        `select record_key,payload from app.records where entity_type='employees' and deleted_at is null
          and lower(payload->>'code')=lower($1) limit 1`, [employeeCode],
      ) : { rows: [] };
      const employee = employeeResult.rows[0];
      const nextEmployee = employee ? { ...employee.payload, full_name: fullName, email: email || null,
        phone: phone || null, department, title: title || null, branch_id: branchId,
        updated_at: new Date().toISOString() } : null;

      const client = await this.infrastructure.postgres.connect();
      try {
        await client.query('begin');
        await client.query(
          `update app.records set payload=$2::jsonb,origin='vps',version=version+1,updated_at=now()
            where entity_type='profiles' and record_key=$1`,
          [current.record_key, JSON.stringify(nextProfile)],
        );
        if (employee && nextEmployee) {
          await client.query(
            `update app.records set payload=$2::jsonb,origin='vps',version=version+1,updated_at=now()
              where entity_type='employees' and record_key=$1`,
            [employee.record_key, JSON.stringify(nextEmployee)],
          );
        }
        await client.query(
          `update app.local_accounts set email=$2,branch_id=$3,updated_at=now() where profile_key=$1`,
          [current.record_key, email || null, branchId],
        );
        await client.query(
          `insert into app.auth_audit
             (hanh_dong,actor_code,actor_role,muc_tieu_ma,muc_tieu_vai_tro,chi_tiet)
           values ('cap_nhat_ho_so',$1,$2,$3,$4,$5::jsonb)`,
          [user.employeeCode || null, user.role, employeeCode || String(currentProfile.id || ''),
           String(currentProfile.role || ''), JSON.stringify({
             truoc: { full_name: currentProfile.full_name, email: currentProfile.email,
               phone: currentProfile.phone, department: currentProfile.department,
               title: currentProfile.title, branch_id: currentProfile.branch_id },
             sau: { full_name: fullName, email: email || null, phone: phone || null,
               department, title: title || null, branch_id: branchId },
           })],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally { client.release(); }
      await this.infrastructure.markDataChanged(['profiles', 'employees'], user.id, user.role);
      return nextProfile;
    }
    // Mở khoá tài khoản bị chặn vì nhập sai mật khẩu nhiều lần.
    //
    // Trước đó không có đường nào làm việc này từ giao diện: tài khoản bị khoá
    // thì hoặc ngồi đợi hết mười phút, hoặc phải chạy SQL tay trên máy chủ.
    // Người quản trị không nên phải mở terminal để làm một việc thường ngày.
    //
    // KHÔNG đặt lại mật khẩu ở đây. Mở khoá chỉ xoá bộ đếm sai; mật khẩu vẫn
    // là mật khẩu cũ. Đặt lại mật khẩu đi đường /auth/provision, nơi người
    // quản trị phải tự nhập mật khẩu mới và biết mình vừa đặt gì.
    // Trạng thái đăng nhập của mọi tài khoản, để bảng quản trị hiện được ai
    // đang bị khoá.
    //
    // Trước đó bảng chỉ có cột "Hoạt động" lấy từ hồ sơ, mà cột đó nói về
    // việc hồ sơ có bị vô hiệu hoá hay không — hoàn toàn khác với việc tài
    // khoản đăng nhập có đang bị khoá vì nhập sai mật khẩu. Hai chuyện khác
    // nhau mà chỉ hiện một, nên người quản trị nhìn thấy "Hoạt động" trong
    // khi người kia đang không đăng nhập được.
    if (name === 'system_account_state') {
      if (!admins.has(user.role)) throw new ForbiddenException();
      const kq = await this.infrastructure.postgres.query(
        `select employee_code, email, active,
                failed_attempts,
                locked_until,
                locked_until is not null and locked_until > now() dang_khoa,
                last_login_at
           from app.local_accounts`,
      );
      return kq.rows;
    }
    if (name === 'system_unlock_account') {
      if (!admins.has(user.role)) throw new ForbiddenException();
      const ma = String(args.p_employee_code || '').trim();
      if (!ma) throw new Error('Thiếu mã nhân sự cần mở khoá.');
      const kq = await this.infrastructure.postgres.query(
        `update app.local_accounts
            set failed_attempts = 0, locked_until = null, updated_at = now()
          where lower(trim(employee_code)) = lower($1)
        returning employee_code, email`, [ma],
      );
      if (!kq.rowCount) throw new Error(`Không tìm thấy tài khoản đăng nhập của ${ma}.`);
      // Mở khoá cũng để lại dấu. Nó không đổi mật khẩu nhưng nó mở lại một
      // cánh cửa vừa bị đóng vì nghi ngờ, nên phải biết ai đã mở.
      await this.infrastructure.postgres.query(
        `insert into app.auth_audit (hanh_dong, actor_code, actor_role, muc_tieu_ma, chi_tiet)
         values ('mo_khoa', $1, $2, $3, $4::jsonb)`,
        [user.employeeCode || null, user.role, kq.rows[0].employee_code,
         JSON.stringify({ email: kq.rows[0].email })],
      );
      return { employee_code: kq.rows[0].employee_code, email: kq.rows[0].email, unlocked: true };
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
