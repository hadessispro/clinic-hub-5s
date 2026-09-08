import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, unknown>;
const timeZone = 'Asia/Ho_Chi_Minh';
const managerRoles = new Set(['admin', 'hr', 'leader', 'phu_ta_truong', 'admin_it', 'superadmin']);
const fallbackBranches: Record<string, JsonMap> = {
  'pham-van-chieu': { id: 'pham-van-chieu', latitude: 10.848632, longitude: 106.649181, allowed_radius_m: 100, max_gps_accuracy_m: 100 },
  'le-van-tho': { id: 'le-van-tho', latitude: 10.8381574, longitude: 106.6579553, allowed_radius_m: 100, max_gps_accuracy_m: 100 },
};

function clinicParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` };
}

function seconds(value: unknown) {
  const [hour = 0, minute = 0, second = 0] = String(value || '').split(':').map(Number);
  return hour * 3600 + minute * 60 + second;
}

function positiveMinutes(value: unknown) {
  return Math.max(0, Math.min(24 * 60, Math.round(Number(value || 0))));
}

function minuteOfClinicDay(value: unknown) {
  const parsed = new Date(String(value || ''));
  if (!Number.isFinite(parsed.getTime())) return null;
  const local = clinicParts(parsed);
  return Math.floor(seconds(local.time) / 60);
}

function monthBounds(value: unknown) {
  const month = String(value || clinicParts(new Date()).date.slice(0, 7));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Tháng tính công không hợp lệ.');
  if (month < '2026-09') throw new BadRequestException('Bảng công việc bắt đầu từ tháng 09/2026.');
  const [year, number] = month.split('-').map(Number);
  const from = `${month}-01`;
  const end = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const until = `${month}-${String(end).padStart(2, '0')}`;
  const today = clinicParts(new Date()).date;
  return { month, from, until, effectiveUntil: until < today ? until : today };
}

type WorkDay = {
  id: string;
  employee_code: string;
  work_date: string;
  shift_code: string | null;
  shift_name: string | null;
  branch_id: string | null;
  scheduled_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  approved_overtime_minutes: number;
  overtime_request_ids: string[];
  late_minutes: number;
  early_leave_minutes: number;
  payable_minutes: number;
  workday_credit: number;
  checkin_at: string | null;
  checkout_at: string | null;
  status: 'complete' | 'in_progress' | 'attendance_anomaly' | 'missing_checkin' | 'missing_checkout' | 'no_attendance' | 'missing_shift';
  calculated_at: string;
  source: 'postgresql-vps';
};

function calculateWorkDay(employeeCode: string, workDate: string, assignment: JsonMap | undefined, events: JsonMap[], shifts: Map<string, JsonMap>, approvedOvertime: { minutes: number; ids: string[] }) {
  const checkins = events.filter((row) => row.record_type === 'checkin').sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));
  const checkouts = events.filter((row) => row.record_type === 'checkout').sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)));
  const checkin = checkins[0];
  const checkout = checkouts.at(-1);
  const shiftCode = String(assignment?.shift_code || checkin?.shift_code || checkout?.shift_code || '') || null;
  const shift = shiftCode ? shifts.get(shiftCode) : undefined;
  const start = shift ? Math.floor(seconds(shift.start_time) / 60) : 0;
  let end = shift ? Math.floor(seconds(shift.end_time) / 60) : 0;
  if (shift && end <= start) end += 24 * 60;
  const breakMinutes = positiveMinutes(shift?.break_minutes);
  const scheduledMinutes = shift ? Math.max(0, end - start - breakMinutes) : 0;
  const checkinMinute = minuteOfClinicDay(checkin?.recorded_at);
  let checkoutMinute = minuteOfClinicDay(checkout?.recorded_at);
  if (checkoutMinute !== null && checkinMinute !== null && checkoutMinute < checkinMinute) checkoutMinute += 24 * 60;

  let status: WorkDay['status'] = 'complete';
  if (!shift) status = 'missing_shift';
  else if (!checkin && !checkout) status = 'no_attendance';
  else if (!checkin) status = 'missing_checkin';
  else if (!checkout) status = workDate === clinicParts(new Date()).date ? 'in_progress' : 'missing_checkout';

  // Bấm vào và ra gần như cùng lúc ở cuối ca là lỗi thao tác/thiếu công, không
  // phải một ca làm hai phút và cũng không phải "đi muộn 568 phút". Để ở
  // trạng thái cần đối chiếu, giữ nguyên hai mốc gốc và không tạo số phạt ảo.
  if (status === 'complete' && checkinMinute !== null && checkoutMinute !== null) {
    const observedMinutes = checkoutMinute - checkinMinute;
    if (observedMinutes < Math.min(60, Math.max(1, Math.round(scheduledMinutes * 0.25)))) {
      status = 'attendance_anomaly';
    }
  }

  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  if (status === 'complete' && checkinMinute !== null && checkoutMinute !== null) {
    lateMinutes = Math.max(0, checkinMinute - start);
    earlyLeaveMinutes = Math.max(Math.max(0, end - checkoutMinute), positiveMinutes(assignment?.early_leave_minutes));
    const regularByRules = Math.max(0, scheduledMinutes - lateMinutes - earlyLeaveMinutes);
    const regularByPresence = Math.max(0, checkoutMinute - checkinMinute - breakMinutes);
    regularMinutes = Math.min(scheduledMinutes, regularByRules, regularByPresence);
    // Chỉ đơn tăng ca đã được duyệt cuối cùng mới sinh phút tính công. Số phút
    // nhập tay trên phân ca không còn là bằng chứng đủ để cộng lương.
    overtimeMinutes = positiveMinutes(approvedOvertime.minutes);
  }

  const payableMinutes = regularMinutes + overtimeMinutes;
  return {
    id: `work:${employeeCode}:${workDate}`,
    employee_code: employeeCode,
    work_date: workDate,
    shift_code: shiftCode,
    shift_name: shift ? String(shift.name || shiftCode) : null,
    branch_id: attendanceBranch(checkin || checkout) || null,
    scheduled_minutes: scheduledMinutes,
    regular_minutes: regularMinutes,
    overtime_minutes: overtimeMinutes,
    approved_overtime_minutes: approvedOvertime.minutes,
    overtime_request_ids: approvedOvertime.ids,
    late_minutes: lateMinutes,
    early_leave_minutes: earlyLeaveMinutes,
    payable_minutes: payableMinutes,
    workday_credit: scheduledMinutes ? Number(Math.min(1, regularMinutes / scheduledMinutes).toFixed(3)) : 0,
    checkin_at: checkin ? String(checkin.recorded_at) : null,
    checkout_at: checkout ? String(checkout.recorded_at) : null,
    status,
    calculated_at: new Date().toISOString(),
    source: 'postgresql-vps',
  };
}

/**
 * Chấm công chỉ có hai việc: xác nhận vào ca và xác nhận ra ca.
 *
 * Hàm phân loại trễ muộn cũ đã bị bỏ, không phải vì nó viết sai mà vì nó dựa
 * trên một thứ không đáng tin: ca làm mà nó đem ra so.
 *
 * Chuyện đã xảy ra thật ngày 28/08/2026. Nhân viên check-in lúc 07:25, màn
 * hình ghi rõ "Ca 07:30-17:00", vậy mà bản ghi bị gắn "Đi muộn". Vì backend
 * lấy shift_code từ bảng phân ca, và khi không có phân ca thì rơi về mặc định
 * clinic-0800. Ca đem ra so không phải ca người đó nhìn thấy, nên kết luận
 * trễ hay không trễ là kết luận về một ca khác.
 *
 * Sửa cho khớp thì phải sửa cả chuỗi phân ca, và đó là việc khác. Trong khi
 * đó, một nhãn "Đi muộn" sai làm người bị gắn mất lòng tin vào cả hệ thống,
 * còn tính công thì vẫn phải làm tay. Nên bỏ nhãn, giữ nguyên dữ liệu thô.
 *
 * Giờ chấm, ca làm, khoảng cách, sai số GPS đều được ghi đầy đủ như cũ. Việc
 * đối chiếu trễ muộn được thực hiện trong bảng công việc dựa trên ca đã phân
 * và dữ liệu vào/ra lưu trên máy chủ.
 */
const DA_GHI_NHAN = 'valid';

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radians = (number: number) => number * Math.PI / 180;
  const dLat = radians(lat2 - lat1); const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function locationResult(distance: number, accuracy: number, radius: number, maxAccuracy: number) {
  const accurate = Number.isFinite(accuracy) && accuracy > 0 && accuracy <= maxAccuracy;
  const effectiveRadius = accuracy <= 50 ? radius : Math.max(20, radius - (accuracy - 50));
  return { inside: accurate && distance <= effectiveRadius, effectiveRadius: Math.round(effectiveRadius) };
}

function attendanceBranch(row: JsonMap | null | undefined) {
  const direct = String(row?.branch_id || '');
  if (direct) return direct;
  return String(row?.note || '').match(/\[BRANCH:([^\]]+)\]/i)?.[1] || '';
}

@Controller('/api/v2/attendance-record')
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  private async one(table: string, field: string, value: string) {
    const result = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type=$1 and deleted_at is null and lower(payload->>$2)=lower($3) limit 1`,
      [table, field, value],
    );
    return result.rows[0]?.payload || null;
  }

  @Post()
  async record(@Req() request: { user: AuthUser }, @Body() body: JsonMap) {
    const user = request.user;
    if (user.role === 'pg_staff') throw new BadRequestException('Tài khoản PG phải dùng phân hệ chấm công theo vị trí do Support phân công.');
    const type = body.type === 'checkout' ? 'checkout' : 'checkin';
    const eventId = String(body.clientEventId || '');
    const requestedTime = new Date(String(body.time || ''));
    const now = new Date();
    const effectiveAt = body.capturedOffline ? requestedTime : now;
    const local = clinicParts(effectiveAt);
    const lat = Number(body.lat); const lng = Number(body.lng); const accuracy = Math.round(Number(body.accuracy));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) throw new BadRequestException('Mã lượt chấm công không hợp lệ.');
    if (!Number.isFinite(requestedTime.getTime()) || requestedTime > new Date(Date.now() + 300000) || requestedTime < new Date(Date.now() - 7 * 86400000)) throw new BadRequestException('Thời gian chấm công không hợp lệ.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new BadRequestException('Tọa độ GPS không hợp lệ.');

    const employee = await this.one('employees', 'code', user.employeeCode);
    if (!employee || employee.status !== 'active') throw new BadRequestException('Hồ sơ nhân viên chưa hoạt động.');
    const requestedBranch = String(body.branchId || '');
    let dayCheckin: JsonMap | null = null;
    if (type === 'checkout') {
      const result = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 and payload->>'record_type'='checkin'
         order by payload->>'recorded_at' limit 1`, [user.employeeCode, local.date],
      );
      dayCheckin = result.rows[0]?.payload || null;
      if (!dayCheckin) throw new BadRequestException('Bạn cần check-in trước khi kết ca.');
    }
    const branchId = type === 'checkout' ? (attendanceBranch(dayCheckin) || requestedBranch) : requestedBranch;
    if (!fallbackBranches[branchId]) throw new BadRequestException('Vui lòng chọn chi nhánh đang làm việc trước khi chấm công.');
    if (type === 'checkout' && requestedBranch && requestedBranch !== branchId) {
      throw new BadRequestException('Bạn cần check-out tại đúng chi nhánh đã xác nhận lúc vào ca.');
    }
    const branch = await this.one('clinic_locations', 'id', branchId) || fallbackBranches[branchId];
    const maxAccuracy = Math.max(10, Math.min(100, Number(branch.max_gps_accuracy_m || 100)));
    const radius = Math.max(20, Math.min(300, Number(branch.allowed_radius_m || 100)));
    if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > maxAccuracy) throw new BadRequestException(`Sai số GPS ±${accuracy || 0} m vượt mức cho phép ${maxAccuracy} m.`);
    const distance = distanceMeters(lat, lng, Number(branch.latitude), Number(branch.longitude));
    const policy = locationResult(distance, accuracy, radius, maxAccuracy);
    if (!policy.inside) throw new BadRequestException(`Vị trí cách phòng khám ${distance} m, sai số ±${accuracy} m; vùng hợp lệ hiện tại ${policy.effectiveRadius} m.`);

    const duplicate = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type='attendance_records' and deleted_at is null and
       (payload->>'client_event_id'=$1 or (lower(payload->>'employee_code')=lower($2) and payload->>'work_date'=$3 and payload->>'record_type'=$4))
       order by updated_at limit 1`, [eventId, user.employeeCode, local.date, type],
    );
    if (duplicate.rows[0]) return { data: duplicate.rows[0].payload, duplicate: true };

    let shiftCode = String(body.shift || '');
    if (type === 'checkout') {
      shiftCode = String(dayCheckin?.shift_code || '');
      if (effectiveAt < new Date(String(dayCheckin?.recorded_at))) throw new BadRequestException('Giờ kết ca không thể trước giờ check-in.');
    } else {
      const assignment = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 limit 1`, [user.employeeCode, local.date],
      );
      const assignedShift = String(assignment.rows[0]?.payload.shift_code || '');
      if (assignedShift) {
        shiftCode = assignedShift;
      } else {
        // Không nhận ca do trình duyệt gửi lên. Khi chưa có lịch riêng, dùng
        // ca mặc định đã gán cho đúng hồ sơ nhân viên.
        shiftCode = String(employee.shift_code || 'clinic-0800');
      }
    }
    const shift = await this.one('work_shifts', 'code', shiftCode);
    if (!shift || shift.active === false) throw new BadRequestException('Ca làm chưa được cấu hình trong hệ thống.');
    const payload: JsonMap = {
      id: randomUUID(), client_event_id: eventId, employee_code: user.employeeCode, shift_code: shiftCode,
      record_type: type, work_date: local.date, recorded_at: effectiveAt.toISOString(), lat, lng,
      branch_id: branchId,
      distance_m: distance, accuracy_m: accuracy, status: DA_GHI_NHAN, created_by: user.id,
      device_id: String(body.deviceId || '').slice(0, 120) || null, captured_offline: Boolean(body.capturedOffline),
      synced_at: now.toISOString(), note: `[BRANCH:${branchId}]`, created_at: now.toISOString(), updated_at: now.toISOString(),
    };
    await this.infrastructure.postgres.query(
      `insert into app.records(entity_type,record_key,payload,origin) values ('attendance_records',$1,$2::jsonb,'vps')`,
      [String(payload.id), JSON.stringify(payload)],
    );
    await this.infrastructure.markDataChanged(['attendance_records'], user.id, user.role);
    return { data: payload };
  }
}

@Controller('/api/v2/attendance-work')
@UseGuards(AuthGuard)
export class AttendanceWorkController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  @Get()
  async summary(
    @Req() request: { user: AuthUser },
    @Query('month') requestedMonth?: string,
    @Query('employeeCode') requestedEmployee?: string,
  ) {
    const user = request.user;
    const employeeCode = String(requestedEmployee || user.employeeCode || '').trim();
    if (!employeeCode) throw new BadRequestException('Tài khoản chưa liên kết mã nhân viên.');
    if (requestedEmployee && requestedEmployee.toLowerCase() !== user.employeeCode.toLowerCase() && !managerRoles.has(user.role)) {
      throw new ForbiddenException('Bạn chỉ được xem bảng công của chính mình.');
    }
    const bounds = monthBounds(requestedMonth);
    const [assignmentResult, attendanceResult, shiftResult, overtimeResult] = await Promise.all([
      this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_date' between $2 and $3`,
        [employeeCode, bounds.from, bounds.effectiveUntil],
      ),
      this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_date' between $2 and $3
         order by payload->>'recorded_at'`,
        [employeeCode, bounds.from, bounds.effectiveUntil],
      ),
      this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='work_shifts' and deleted_at is null`,
      ),
      this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='leave_requests' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1)
         and payload->>'from_date' between $2 and $3
         and (lower(payload->>'request_type') like '%tăng ca%' or lower(payload->>'request_type') like '%overtime%')
         and payload->>'status'='approved' and payload->>'operations_status'='approved'`,
        [employeeCode, bounds.from, bounds.effectiveUntil],
      ),
    ]);

    const assignments = new Map(assignmentResult.rows.map((row) => [String(row.payload.work_date), row.payload]));
    const events = new Map<string, JsonMap[]>();
    for (const row of attendanceResult.rows) {
      const date = String(row.payload.work_date);
      events.set(date, [...(events.get(date) || []), row.payload]);
    }
    const shifts = new Map(shiftResult.rows.map((row) => [String(row.payload.code), row.payload]));
    const approvedOvertime = new Map<string, { minutes: number; ids: string[] }>();
    for (const row of overtimeResult.rows) {
      const date = String(row.payload.from_date || '');
      const current = approvedOvertime.get(date) || { minutes: 0, ids: [] };
      current.minutes += positiveMinutes(row.payload.overtime_minutes);
      current.ids.push(String(row.payload.id || ''));
      approvedOvertime.set(date, current);
    }
    const dates = [...new Set([...assignments.keys(), ...events.keys(), ...approvedOvertime.keys()])].sort();
    const days = dates.map((date) => calculateWorkDay(
      employeeCode, date, assignments.get(date), events.get(date) || [], shifts,
      approvedOvertime.get(date) || { minutes: 0, ids: [] },
    ));

    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`att_work_${employeeCode.toLowerCase()}_${requestedMonth}`]);
      await client.query(`select set_config('app.suppress_backup_outbox','on',true)`);
      await client.query(
        `update app.records set deleted_at=now(),updated_at=now(),version=version+1
         where entity_type='attendance_work_days' and lower(payload->>'employee_code')=lower($1)
           and payload->>'work_date' between $2 and $3`,
        [employeeCode, bounds.from, bounds.until],
      );
      for (const day of days) {
        await client.query(
          `insert into app.records(entity_type,record_key,payload,origin)
           values ('attendance_work_days',$1,$2::jsonb,'vps-work-calculation')
           on conflict(entity_type,record_key) do update set payload=excluded.payload,origin=excluded.origin,
             version=app.records.version+1,updated_at=now(),deleted_at=null`,
          [day.id, JSON.stringify(day)],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }

    const totals = days.reduce((sum, day) => ({
      workdays: sum.workdays + day.workday_credit,
      regularMinutes: sum.regularMinutes + day.regular_minutes,
      overtimeMinutes: sum.overtimeMinutes + day.overtime_minutes,
      lateMinutes: sum.lateMinutes + day.late_minutes,
      earlyLeaveMinutes: sum.earlyLeaveMinutes + day.early_leave_minutes,
      payableMinutes: sum.payableMinutes + day.payable_minutes,
      incompleteDays: sum.incompleteDays + (['complete', 'in_progress'].includes(day.status) ? 0 : 1),
    }), { workdays: 0, regularMinutes: 0, overtimeMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, payableMinutes: 0, incompleteDays: 0 });

    return { month: bounds.month, employeeCode, source: 'postgresql-vps', formulaVersion: '2026-09-v1', totals: { ...totals, workdays: Number(totals.workdays.toFixed(3)) }, days };
  }
}

const attendanceAdminRoles = new Set(['admin', 'admin_it', 'superadmin']);

@Controller('/api/v2/attendance-adjustments')
@UseGuards(AuthGuard)
export class AttendanceAdjustmentController {
  constructor(private readonly infrastructure: InfrastructureService) {}

  private authorize(user: AuthUser) {
    if (!attendanceAdminRoles.has(user.role)) {
      throw new ForbiddenException('Chỉ Admin IT hoặc quản trị cấp cao được điều chỉnh chấm công.');
    }
  }

  private monthRange(value: unknown) {
    const month = String(value || clinicParts(new Date()).date.slice(0, 7));
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Tháng không hợp lệ.');
    const [year, number] = month.split('-').map(Number);
    return { month, from: `${month}-01`, until: `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, '0')}` };
  }

  private async validateInput(client: any, body: JsonMap, ignoreId = '') {
    const employeeCode = String(body.employeeCode || '').trim();
    const workDate = String(body.workDate || '');
    const recordType = body.recordType === 'checkout' ? 'checkout' : body.recordType === 'checkin' ? 'checkin' : '';
    const time = String(body.time || '');
    const shiftCode = String(body.shiftCode || '').trim();
    const branchId = String(body.branchId || '').trim();
    const reason = String(body.reason || '').trim();
    if (!employeeCode || !/^20\d{2}-\d{2}-\d{2}$/.test(workDate)) throw new BadRequestException('Chọn nhân viên và ngày làm việc.');
    if (!recordType || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) throw new BadRequestException('Loại lượt chấm hoặc thời gian không hợp lệ.');
    if (!shiftCode) throw new BadRequestException('Chọn ca làm việc.');
    if (!fallbackBranches[branchId]) throw new BadRequestException('Chi nhánh không hợp lệ.');
    if (reason.length < 5) throw new BadRequestException('Nhập lý do điều chỉnh tối thiểu 5 ký tự.');
    const [employee, shift, duplicate] = await Promise.all([
      client.query(`select payload from app.records where entity_type='employees' and deleted_at is null and lower(payload->>'code')=lower($1) and payload->>'status'='active' limit 1`, [employeeCode]),
      client.query(`select payload from app.records where entity_type='work_shifts' and deleted_at is null and payload->>'code'=$1 and coalesce((payload->>'active')::boolean,true) limit 1`, [shiftCode]),
      client.query(`select record_key from app.records where entity_type='attendance_records' and deleted_at is null and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 and payload->>'record_type'=$3 and record_key<>$4 limit 1`, [employeeCode, workDate, recordType, ignoreId]),
    ]);
    if (!employee.rows[0]) throw new BadRequestException('Không tìm thấy nhân viên đang hoạt động.');
    if (!shift.rows[0]) throw new BadRequestException('Ca làm việc chưa được cấu hình.');
    if (duplicate.rows[0]) throw new BadRequestException(`Nhân viên đã có ${recordType === 'checkin' ? 'giờ vào' : 'giờ ra'} trong ngày này.`);
    const fullTime = time.length === 5 ? `${time}:00` : time;
    const recordedAt = new Date(`${workDate}T${fullTime}+07:00`);
    if (!Number.isFinite(recordedAt.getTime())) throw new BadRequestException('Thời gian điều chỉnh không hợp lệ.');
    return { employeeCode, workDate, recordType, time: fullTime, shiftCode, branchId, reason, recordedAt };
  }

  private async recalculate(client: any, employeeCode: string, workDate: string) {
    const [assignmentResult, attendanceResult, shiftResult, overtimeResult] = await Promise.all([
      client.query(`select payload from app.records where entity_type='schedule_assignments' and deleted_at is null and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 limit 1`, [employeeCode, workDate]),
      client.query(`select payload from app.records where entity_type='attendance_records' and deleted_at is null and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 order by payload->>'recorded_at'`, [employeeCode, workDate]),
      client.query(`select payload from app.records where entity_type='work_shifts' and deleted_at is null`),
      client.query(`select payload from app.records where entity_type='leave_requests' and deleted_at is null and lower(payload->>'employee_code')=lower($1) and payload->>'from_date'=$2 and (lower(payload->>'request_type') like '%tăng ca%' or lower(payload->>'request_type') like '%overtime%') and payload->>'status'='approved' and payload->>'operations_status'='approved'`, [employeeCode, workDate]),
    ]);
    const overtime = overtimeResult.rows.reduce((sum: number, row: any) => sum + positiveMinutes(row.payload.overtime_minutes), 0);
    const day = calculateWorkDay(
      employeeCode,
      workDate,
      assignmentResult.rows[0]?.payload,
      attendanceResult.rows.map((row: any) => row.payload),
      new Map(shiftResult.rows.map((row: any) => [String(row.payload.code), row.payload])),
      { minutes: overtime, ids: overtimeResult.rows.map((row: any) => String(row.payload.id || '')) },
    );
    await client.query(
      `insert into app.records(entity_type,record_key,payload,origin) values ('attendance_work_days',$1,$2::jsonb,'vps-work-calculation')
       on conflict(entity_type,record_key) do update set payload=excluded.payload,origin=excluded.origin,version=app.records.version+1,updated_at=now(),deleted_at=null`,
      [day.id, JSON.stringify(day)],
    );
    return day;
  }

  private async audit(client: any, user: AuthUser, action: string, entityId: string, reason: string, before: JsonMap | null, after: JsonMap | null) {
    const id = randomUUID();
    const payload = { id, action, entity: 'attendance_records', entity_id: entityId, actor_id: user.id, actor_employee_code: user.employeeCode, actor_role: user.role, reason, before, after, created_at: new Date().toISOString() };
    await client.query(`insert into app.records(entity_type,record_key,payload,origin) values ('audit_logs',$1,$2::jsonb,'vps')`, [id, JSON.stringify(payload)]);
  }

  @Get()
  async list(@Req() request: { user: AuthUser }, @Query('month') monthValue?: string, @Query('search') searchValue = '', @Query('page') pageValue = '1', @Query('pageSize') pageSizeValue = '20') {
    this.authorize(request.user);
    const bounds = this.monthRange(monthValue);
    const search = String(searchValue || '').trim();
    const pageSize = Math.min(100, Math.max(10, Number(pageSizeValue) || 20));
    const page = Math.max(1, Number(pageValue) || 1);
    const params: unknown[] = [bounds.from, bounds.until];
    let searchSql = '';
    if (search) {
      params.push(`%${search}%`);
      searchSql = ` and (a.payload->>'employee_code' ilike $3 or coalesce(e.payload->>'full_name',e.payload->>'name','') ilike $3)`;
    }
    const base = `from app.records a left join app.records e on e.entity_type='employees' and e.deleted_at is null and lower(e.payload->>'code')=lower(a.payload->>'employee_code') where a.entity_type='attendance_records' and a.deleted_at is null and a.payload->>'work_date' between $1 and $2${searchSql}`;
    const countResult = await this.infrastructure.postgres.query<{ total: string; checkins: string; checkouts: string; manual: string }>(
      `select count(*) total,count(*) filter(where a.payload->>'record_type'='checkin') checkins,count(*) filter(where a.payload->>'record_type'='checkout') checkouts,count(*) filter(where a.origin='manual-reconciliation') manual ${base}`,
      params,
    );
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await this.infrastructure.postgres.query<{ record_key: string; payload: JsonMap; employee_name: string; origin: string }>(
      `select a.record_key,a.payload,coalesce(e.payload->>'full_name',e.payload->>'name',a.payload->>'employee_code') employee_name,a.origin ${base} order by a.payload->>'recorded_at' desc limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const [employees, shifts] = await Promise.all([
      this.infrastructure.postgres.query<{ payload: JsonMap }>(`select payload from app.records where entity_type='employees' and deleted_at is null and payload->>'status'='active' order by coalesce(payload->>'full_name',payload->>'name',payload->>'code')`),
      this.infrastructure.postgres.query<{ payload: JsonMap }>(`select payload from app.records where entity_type='work_shifts' and deleted_at is null and coalesce((payload->>'active')::boolean,true) order by payload->>'start_time',payload->>'code'`),
    ]);
    const stats = countResult.rows[0] || { total: '0', checkins: '0', checkouts: '0', manual: '0' };
    return { month: bounds.month, page, pageSize, total: Number(stats.total), stats: { checkins: Number(stats.checkins), checkouts: Number(stats.checkouts), manual: Number(stats.manual) }, rows: rows.rows.map((row) => ({ ...row.payload, id: row.record_key, employee_name: row.employee_name, origin: row.origin })), employees: employees.rows.map((row) => row.payload), shifts: shifts.rows.map((row) => row.payload) };
  }

  @Post()
  async create(@Req() request: { user: AuthUser }, @Body() body: JsonMap) {
    this.authorize(request.user);
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      const input = await this.validateInput(client, body);
      const id = randomUUID();
      const now = new Date().toISOString();
      const payload: JsonMap = { id, client_event_id: id, employee_code: input.employeeCode, shift_code: input.shiftCode, record_type: input.recordType, work_date: input.workDate, recorded_at: input.recordedAt.toISOString(), lat: null, lng: null, branch_id: input.branchId, distance_m: null, accuracy_m: null, status: 'valid', created_by: request.user.id, device_id: 'admin-it-adjustment', captured_offline: false, synced_at: now, proof_url: null, note: `[ADMIN_IT_ADJUSTMENT] ${input.reason}`, created_at: now, updated_at: now };
      await client.query(`insert into app.records(entity_type,record_key,payload,origin) values ('attendance_records',$1,$2::jsonb,'manual-reconciliation')`, [id, JSON.stringify(payload)]);
      await this.audit(client, request.user, 'attendance_create', id, input.reason, null, payload);
      const day = await this.recalculate(client, input.employeeCode, input.workDate);
      await client.query('commit');
      await this.infrastructure.markDataChanged(['attendance_records', 'attendance_work_days', 'audit_logs'], request.user.id, request.user.role);
      return { data: payload, workDay: day };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  @Patch(':id')
  async update(@Req() request: { user: AuthUser }, @Param('id') id: string, @Body() body: JsonMap) {
    this.authorize(request.user);
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      const current = await client.query(`select payload from app.records where entity_type='attendance_records' and record_key=$1 and deleted_at is null for update`, [id]);
      if (!current.rows[0]) throw new BadRequestException('Không tìm thấy lượt chấm công cần sửa.');
      const before = current.rows[0].payload as JsonMap;
      const input = await this.validateInput(client, body, id);
      const now = new Date().toISOString();
      const after: JsonMap = { ...before, employee_code: input.employeeCode, shift_code: input.shiftCode, record_type: input.recordType, work_date: input.workDate, recorded_at: input.recordedAt.toISOString(), lat: null, lng: null, branch_id: input.branchId, distance_m: null, accuracy_m: null, status: 'valid', device_id: 'admin-it-adjustment', synced_at: now, note: `[ADMIN_IT_ADJUSTMENT] ${input.reason}`, updated_at: now };
      await client.query(`update app.records set payload=$2::jsonb,origin='manual-reconciliation',version=version+1,updated_at=now() where entity_type='attendance_records' and record_key=$1`, [id, JSON.stringify(after)]);
      await this.audit(client, request.user, 'attendance_update', id, input.reason, before, after);
      await this.recalculate(client, String(before.employee_code), String(before.work_date));
      const day = await this.recalculate(client, input.employeeCode, input.workDate);
      await client.query('commit');
      await this.infrastructure.markDataChanged(['attendance_records', 'attendance_work_days', 'audit_logs'], request.user.id, request.user.role);
      return { data: after, workDay: day };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }

  @Delete(':id')
  async remove(@Req() request: { user: AuthUser }, @Param('id') id: string, @Body() body: JsonMap) {
    this.authorize(request.user);
    const reason = String(body.reason || '').trim();
    if (reason.length < 5) throw new BadRequestException('Nhập lý do xóa tối thiểu 5 ký tự.');
    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
      const current = await client.query(`select payload from app.records where entity_type='attendance_records' and record_key=$1 and deleted_at is null for update`, [id]);
      if (!current.rows[0]) throw new BadRequestException('Không tìm thấy lượt chấm công cần xóa.');
      const before = current.rows[0].payload as JsonMap;
      await client.query(`update app.records set deleted_at=now(),origin='manual-reconciliation',version=version+1,updated_at=now() where entity_type='attendance_records' and record_key=$1`, [id]);
      await this.audit(client, request.user, 'attendance_delete', id, reason, before, null);
      const day = await this.recalculate(client, String(before.employee_code), String(before.work_date));
      await client.query('commit');
      await this.infrastructure.markDataChanged(['attendance_records', 'attendance_work_days', 'audit_logs'], request.user.id, request.user.role);
      return { data: before, workDay: day };
    } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  }
}
