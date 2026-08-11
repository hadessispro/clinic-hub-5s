import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
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

function classify(type: string, recorded: string, shift: JsonMap) {
  const grace = Math.max(0, Number(process.env.ATTENDANCE_GRACE_MINUTES || 5)) * 60;
  if (type === 'checkout') return seconds(recorded) < seconds(shift.end_time) - grace ? 'early_leave' : 'valid';
  return seconds(recorded) > seconds(shift.start_time) + grace ? 'late' : 'valid';
}

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
      distance_m: distance, accuracy_m: accuracy, status: classify(type, local.time, shift), created_by: user.id,
      device_id: String(body.deviceId || '').slice(0, 120) || null, captured_offline: Boolean(body.capturedOffline),
      synced_at: now.toISOString(), note: `[BRANCH:${branchId}]`, created_at: now.toISOString(), updated_at: now.toISOString(),
    };
    await this.infrastructure.postgres.query(
      `insert into app.records(entity_type,record_key,payload,origin) values ('attendance_records',$1,$2::jsonb,'vps')`,
      [String(payload.id), JSON.stringify(payload)],
    );
    return { data: payload };
  }
}
