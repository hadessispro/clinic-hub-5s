import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthUser } from './auth';
import { InfrastructureService } from './infrastructure';

type JsonMap = Record<string, unknown>;
const timeZone = 'Asia/Ho_Chi_Minh';
const managerRoles = new Set(['admin', 'hr', 'leader', 'admin_it', 'superadmin']);
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
  if (month < '2026-09') throw new BadRequestException('Bảng công PostgreSQL bắt đầu từ tháng 09/2026.');
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
  scheduled_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  early_leave_minutes: number;
  payable_minutes: number;
  workday_credit: number;
  checkin_at: string | null;
  checkout_at: string | null;
  status: 'complete' | 'missing_checkin' | 'missing_checkout' | 'no_attendance' | 'missing_shift';
  calculated_at: string;
  source: 'postgresql-vps';
};

function calculateWorkDay(employeeCode: string, workDate: string, assignment: JsonMap | undefined, events: JsonMap[], shifts: Map<string, JsonMap>): WorkDay {
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
  else if (!checkout) status = 'missing_checkout';

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
    overtimeMinutes = positiveMinutes(assignment?.overtime_minutes) + positiveMinutes(assignment?.early_arrival_minutes);
  }

  const payableMinutes = regularMinutes + overtimeMinutes;
  return {
    id: `work:${employeeCode}:${workDate}`,
    employee_code: employeeCode,
    work_date: workDate,
    shift_code: shiftCode,
    shift_name: shift ? String(shift.name || shiftCode) : null,
    scheduled_minutes: scheduledMinutes,
    regular_minutes: regularMinutes,
    overtime_minutes: overtimeMinutes,
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
 * đối chiếu trễ muộn chuyển sang bước đồng bộ Google Sheet, nơi có đủ lịch
 * làm việc thật để so.
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
    const lat = Number(body.lat); const lng = Number(body.lng); const accuracy = Math.round(Number(body.accuracy));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) throw new BadRequestException('Mã lượt chấm công không hợp lệ.');
    if (!Number.isFinite(requestedTime.getTime()) || requestedTime > new Date(Date.now() + 300000) || requestedTime < new Date(Date.now() - 7 * 86400000)) throw new BadRequestException('Thời gian chấm công không hợp lệ.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new BadRequestException('Tọa độ GPS không hợp lệ.');

    const employee = await this.one('employees', 'code', user.employeeCode);
    if (!employee || employee.status !== 'active') throw new BadRequestException('Hồ sơ nhân viên chưa hoạt động.');
    const requestedBranch = String(body.branchId || '');
    const branchId = managerRoles.has(user.role) ? requestedBranch : String(user.branchId || employee.branch_id || '');
    if (!fallbackBranches[branchId]) throw new BadRequestException('Chi nhánh chấm công không hợp lệ.');
    if (!managerRoles.has(user.role) && requestedBranch && requestedBranch !== branchId) throw new BadRequestException('Tài khoản không được chấm công tại chi nhánh đã chọn.');
    const branch = await this.one('clinic_locations', 'id', branchId) || fallbackBranches[branchId];
    const maxAccuracy = Math.max(10, Math.min(100, Number(branch.max_gps_accuracy_m || 100)));
    const radius = Math.max(20, Math.min(300, Number(branch.allowed_radius_m || 100)));
    if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > maxAccuracy) throw new BadRequestException(`Sai số GPS ±${accuracy || 0} m vượt mức cho phép ${maxAccuracy} m.`);
    const distance = distanceMeters(lat, lng, Number(branch.latitude), Number(branch.longitude));
    const policy = locationResult(distance, accuracy, radius, maxAccuracy);
    if (!policy.inside) throw new BadRequestException(`Vị trí cách phòng khám ${distance} m, sai số ±${accuracy} m; vùng hợp lệ hiện tại ${policy.effectiveRadius} m.`);

    const local = clinicParts(effectiveAt);
    const duplicate = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type='attendance_records' and deleted_at is null and
       (payload->>'client_event_id'=$1 or (lower(payload->>'employee_code')=lower($2) and payload->>'work_date'=$3 and payload->>'record_type'=$4))
       order by updated_at limit 1`, [eventId, user.employeeCode, local.date, type],
    );
    if (duplicate.rows[0]) return { data: duplicate.rows[0].payload, duplicate: true };

    let shiftCode = String(body.shift || '');
    if (type === 'checkout') {
      const checkin = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 and payload->>'record_type'='checkin'
         order by payload->>'recorded_at' limit 1`, [user.employeeCode, local.date],
      );
      if (!checkin.rows[0]) throw new BadRequestException('Bạn cần check-in trước khi kết ca.');
      shiftCode = String(checkin.rows[0].payload.shift_code || '');
      if (effectiveAt < new Date(String(checkin.rows[0].payload.recorded_at))) throw new BadRequestException('Giờ kết ca không thể trước giờ check-in.');
    } else {
      const assignment = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 limit 1`, [user.employeeCode, local.date],
      );
      const allowed = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='employee_allowed_shifts' and deleted_at is null and lower(payload->>'employee_code')=lower($1)`, [user.employeeCode],
      );
      const valid = shiftCode && [employee.shift_code, assignment.rows[0]?.payload.shift_code, ...allowed.rows.map((row) => row.payload.shift_code)].some((code) => String(code || '') === shiftCode);
      if (!shiftCode) shiftCode = String(assignment.rows[0]?.payload.shift_code || employee.shift_code || 'clinic-0800');
      else if (!valid) throw new BadRequestException('Ca làm đã chọn không được cấp cho tài khoản này.');
    }
    const shift = await this.one('work_shifts', 'code', shiftCode);
    if (!shift || shift.active === false) throw new BadRequestException('Ca làm chưa được cấu hình trong hệ thống.');
    const payload: JsonMap = {
      id: randomUUID(), client_event_id: eventId, employee_code: user.employeeCode, shift_code: shiftCode,
      record_type: type, work_date: local.date, recorded_at: effectiveAt.toISOString(), lat, lng,
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
    const [assignmentResult, attendanceResult, shiftResult] = await Promise.all([
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
    ]);

    const assignments = new Map(assignmentResult.rows.map((row) => [String(row.payload.work_date), row.payload]));
    const events = new Map<string, JsonMap[]>();
    for (const row of attendanceResult.rows) {
      const date = String(row.payload.work_date);
      events.set(date, [...(events.get(date) || []), row.payload]);
    }
    const shifts = new Map(shiftResult.rows.map((row) => [String(row.payload.code), row.payload]));
    const dates = [...new Set([...assignments.keys(), ...events.keys()])].sort();
    const days = dates.map((date) => calculateWorkDay(employeeCode, date, assignments.get(date), events.get(date) || [], shifts));

    const client = await this.infrastructure.postgres.connect();
    try {
      await client.query('begin');
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
      incompleteDays: sum.incompleteDays + (day.status === 'complete' ? 0 : 1),
    }), { workdays: 0, regularMinutes: 0, overtimeMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, payableMinutes: 0, incompleteDays: 0 });

    return { month: bounds.month, employeeCode, source: 'postgresql-vps', formulaVersion: '2026-09-v1', totals: { ...totals, workdays: Number(totals.workdays.toFixed(3)) }, days };
  }
}
