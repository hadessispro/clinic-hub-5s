import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { PushService } from './push';
import { randomUUID } from 'node:crypto';

type JsonMap = Record<string, any>;

export interface ReminderEventConfig {
  enabled: boolean;
  time_window?: string;
  chime?: string;
  doctor_title: string;
  doctor_body: string;
  staff_title: string;
  staff_body: string;
}

export interface SystemReminderConfig {
  checkin_morning: ReminderEventConfig;
  checkin_afternoon: ReminderEventConfig;
  lunch_break: ReminderEventConfig;
  afternoon_care: ReminderEventConfig;
  checkout: ReminderEventConfig;
  evening_care: ReminderEventConfig;
}

export const DEFAULT_REMINDER_CONFIG: SystemReminderConfig = {
  checkin_morning: {
    enabled: true,
    time_window: '07:15 - 07:45',
    chime: 'alert',
    doctor_title: '⏰ Bác sĩ có lịch điều trị sáng · 5S Clinic 🩺',
    doctor_body: 'Kính chào Bác sĩ {ten}, Bác sĩ có lịch khám ca {ca} ({gio}) hôm nay. Kính chúc Bác sĩ một ngày điều trị thành công và nhiều niềm vui! 🌟',
    staff_title: '⏰ Nhắc nhở chấm công ca sáng · Nha Khoa 5S 🌟',
    staff_body: 'Chào {ten}, bạn có ca {ca} ({gio}) hôm nay. Đừng quên check-in đúng giờ nhé! Chúc bạn ngày mới tràn đầy năng lượng! 💪✨',
  },
  checkin_afternoon: {
    enabled: true,
    time_window: '09:15 - 09:45',
    chime: 'alert',
    doctor_title: '⏰ Bác sĩ có lịch điều trị chiều · 5S Clinic 🩺',
    doctor_body: 'Kính chào Bác sĩ {ten}, Bác sĩ có lịch trực ca {ca} ({gio}) chiều nay. Đừng quên check-in và chuẩn bị hồ sơ bệnh nhân nhé! 🩺✨',
    staff_title: '⏰ Nhắc nhở chấm công ca chiều · Nha Khoa 5S 🌟',
    staff_body: 'Chào {ten}, bạn có ca {ca} ({gio}) hôm nay. Đừng quên check-in đúng giờ để bắt đầu ca làm việc nhé! 🌸',
  },
  lunch_break: {
    enabled: true,
    time_window: '12:00 - 12:15',
    chime: 'melody',
    doctor_title: '🍱 Giờ nghỉ trưa nạp năng lượng Bác sĩ · 5S Care 💖',
    doctor_body: 'Kính chào Bác sĩ {ten}, giờ nghỉ trưa đã đến sau các ca điều trị sáng. Kính mời Bác sĩ dùng bữa ngon miệng và chợp mắt nghỉ ngơi phục hồi sức khỏe nhé! 🍵✨',
    staff_title: '🍱 Giờ nghỉ trưa nạp năng lượng · 5S Care 💖',
    staff_body: 'Chào {ten}, giờ nghỉ trưa đã đến rồi! Hãy gác lại công việc, thưởng thức bữa trưa ngon miệng và nghỉ ngơi một chút để nạp lại 100% năng lượng nhé! 🍵✨',
  },
  afternoon_care: {
    enabled: true,
    time_window: '15:00 - 15:15',
    chime: 'melody',
    doctor_title: '☕ Thư giãn & tiếp năng lượng Bác sĩ · 5S Clinic 🩺',
    doctor_body: 'Bác sĩ {ten} ơi, nghỉ tay một chút uống ngụm nước và thư giãn mắt nào! Cảm ơn Bác sĩ vì sự tận tâm mang lại nụ cười rạng rỡ cho khách hàng hôm nay. ☕🩺🌿',
    staff_title: '☕ Thư giãn & tiếp năng lượng chiều · 5S Clinic 🌸',
    staff_body: 'Vươn vai, uống một ngụm nước và thư giãn mắt nào {ten}! Bạn đã làm việc rất chăm chỉ suốt buổi sáng. Cố gắng thêm một chút nữa nhé, buổi chiều tuyệt vời! 💪🌈✨',
  },
  checkout: {
    enabled: true,
    time_window: '17:05, 18:05, 20:05',
    chime: 'alert',
    doctor_title: '🏁 Nhắc nhở check-out ca điều trị Bác sĩ · Nha Khoa 5S',
    doctor_body: 'Ca khám và điều trị của Bác sĩ {ten} đã hoàn thành ({gio}). Kính chúc Bác sĩ một buổi tối vui vẻ, đầm ấm bên gia đình! 🛋️✨',
    staff_title: '🏁 Nhắc nhở check-out tan ca · Nha Khoa 5S',
    staff_body: 'Ca làm việc của {ten} đã kết thúc ({gio}). Hãy nhớ checkout và bàn giao công việc trước khi ra về nhé! Chúc bạn buổi tối ấm áp! 🛋️✨',
  },
  evening_care: {
    enabled: true,
    time_window: '18:15 - 18:30',
    chime: 'soft',
    doctor_title: '🌙 Chặng cuối ca tối, cố lên Bác sĩ nhé · 5S Care 🎯',
    doctor_body: 'Trân trọng cảm ơn Bác sĩ {ten} vì sự cống hiến và đồng hành cùng phòng khám trong ca tối hôm nay. Ca làm sắp hoàn tất rồi, chúc Bác sĩ về nhà an toàn! 🌙🚗',
    staff_title: '🌙 Chặng cuối của ngày rồi, cố lên bạn nhé · 5S Care 🎯',
    staff_body: 'Cảm ơn {ten} vì sự tận tâm và nụ cười rạng rỡ mang đến cho khách hàng hôm nay. Ca làm việc sắp hoàn thành rồi, chuẩn bị về nghỉ ngơi nhé! ✨🛋️',
  },
};

function isDoctor(emp?: JsonMap, profile?: JsonMap): boolean {
  const role = String(profile?.role || emp?.role || '').toLowerCase();
  const dept = String(profile?.department || emp?.department || '').toLowerCase();
  const title = String(profile?.title || emp?.title || '').toLowerCase();
  return role === 'bac_si' || dept === 'bs' || dept.includes('bác sĩ') || dept.includes('chuyên môn') || title.includes('bác sĩ');
}

function formatTemplate(template: string, vars: { ten: string; ma: string; ca?: string; gio?: string }): string {
  return String(template || '')
    .replace(/{ten}/g, vars.ten || '')
    .replace(/{ma}/g, vars.ma || '')
    .replace(/{ca}/g, vars.ca || 'ca làm')
    .replace(/{gio}/g, vars.gio || '');
}

@Injectable()
export class ReminderService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private sentReminders = new Set<string>();
  private lastResetDate = '';
  private cachedConfig: SystemReminderConfig | null = null;
  private configCacheTime = 0;

  constructor(
    private readonly infrastructure: InfrastructureService,
    private readonly push: PushService,
  ) {}

  onApplicationBootstrap() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async getConfig(): Promise<SystemReminderConfig> {
    const now = Date.now();
    if (this.cachedConfig && now - this.configCacheTime < 30_000) {
      return this.cachedConfig;
    }
    try {
      const res = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='reminder_config' and record_key='main' and deleted_at is null limit 1`,
      );
      if (res.rows[0]?.payload) {
        this.cachedConfig = { ...DEFAULT_REMINDER_CONFIG, ...res.rows[0].payload };
        this.configCacheTime = now;
        return this.cachedConfig;
      }
    } catch {}
    this.cachedConfig = { ...DEFAULT_REMINDER_CONFIG };
    this.configCacheTime = now;
    return this.cachedConfig;
  }

  async saveConfig(config: Partial<SystemReminderConfig>): Promise<SystemReminderConfig> {
    const current = await this.getConfig();
    const updated = { ...current, ...config };
    await this.infrastructure.postgres.query(
      `insert into app.records(entity_type,record_key,payload,origin) values ('reminder_config','main',$1::jsonb,'vps')
       on conflict (entity_type,record_key) do update set payload=excluded.payload,origin='vps',version=app.records.version+1,updated_at=now()`,
      [JSON.stringify(updated)],
    );
    this.cachedConfig = updated;
    this.configCacheTime = Date.now();
    return updated;
  }

  private async tick() {
    const vnParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const map = Object.fromEntries(vnParts.map((p) => [p.type, p.value]));
    const dateKey = `${map.year}-${map.month}-${map.day}`;
    const hour = Number(map.hour);
    const minute = Number(map.minute);

    if (this.lastResetDate !== dateKey) {
      this.sentReminders.clear();
      this.lastResetDate = dateKey;
    }

    const config = await this.getConfig();

    // 1. Nhắc Check-in & Chúc ngày mới:
    if (config.checkin_morning?.enabled !== false && hour === 7 && minute >= 15 && minute <= 45) {
      await this.processCheckinReminders(dateKey, 'morning', config.checkin_morning);
    }
    if (config.checkin_afternoon?.enabled !== false && hour === 9 && minute >= 15 && minute <= 45) {
      await this.processCheckinReminders(dateKey, 'afternoon', config.checkin_afternoon);
    }

    // 2. Nhắc Check-out ra về:
    if (
      config.checkout?.enabled !== false && (
        (hour === 17 && minute >= 5 && minute <= 15)
        || (hour === 18 && minute >= 5 && minute <= 15)
        || (hour === 20 && minute >= 5 && minute <= 15)
      )
    ) {
      const targetEndTime = hour === 17 ? '17:00' : (hour === 18 ? '18:00' : '20:00');
      await this.processCheckoutReminders(dateKey, targetEndTime, config.checkout);
    }

    // 3. Nghỉ trưa & Nạp năng lượng (12:00 - 12:15):
    if (config.lunch_break?.enabled !== false && hour === 12 && minute >= 0 && minute <= 15) {
      await this.processLunchBreakCare(dateKey, config.lunch_break);
    }

    // 4. Tiếp năng lượng giữa giờ chiều (15:00 - 15:15):
    if (config.afternoon_care?.enabled !== false && hour === 15 && minute >= 0 && minute <= 15) {
      await this.processAfternoonCare(dateKey, config.afternoon_care);
    }

    // 5. Động viên chặng cuối của ngày (18:15 - 18:30):
    if (config.evening_care?.enabled !== false && hour === 18 && minute >= 15 && minute <= 30) {
      await this.processEveningCare(dateKey, config.evening_care);
    }
  }

  private async processCheckinReminders(dateKey: string, shiftPeriod: 'morning' | 'afternoon', eventConfig: ReminderEventConfig) {
    try {
      const assignmentsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
         and payload->>'work_date'=$1 and coalesce(payload->>'status','planned') in ('planned','confirmed')`,
        [dateKey],
      );
      if (!assignmentsResult.rows.length) return;

      const shiftsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='work_shifts' and deleted_at is null`,
      );
      const shiftByCode = new Map(shiftsResult.rows.map((r) => [String(r.payload.code), r.payload]));

      const attendanceResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and payload->>'work_date'=$1 and payload->>'record_type'='checkin' and coalesce(payload->>'status','valid')='valid'`,
        [dateKey],
      );
      const checkedInCodes = new Set(attendanceResult.rows.map((r) => String(r.payload.employee_code || '').toLowerCase()));

      const employeesResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='employees' and deleted_at is null and coalesce(payload->>'status','active')='active'`,
      );
      const employeeByCode = new Map(employeesResult.rows.map((r) => [String(r.payload.code).toLowerCase(), r.payload]));

      for (const row of assignmentsResult.rows) {
        const empCode = String(row.payload.employee_code || '').trim();
        const codeKey = empCode.toLowerCase();
        if (!empCode || checkedInCodes.has(codeKey)) continue;

        const shift = shiftByCode.get(String(row.payload.shift_code));
        const startTime = String(shift?.start_time || '08:00').slice(0, 5);
        const [startH] = startTime.split(':').map(Number);

        if (shiftPeriod === 'morning') {
          if (startH < 7 || startH > 8) continue;
        } else {
          if (startH < 9 || startH > 10) continue;
        }

        const trackerKey = `${dateKey}:checkin:${codeKey}`;
        if (this.sentReminders.has(trackerKey)) continue;
        this.sentReminders.add(trackerKey);

        const emp = employeeByCode.get(codeKey);
        const empName = emp?.full_name || empCode;
        const shiftName = shift?.name || 'ca làm';

        const profileResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where entity_type='profiles' and deleted_at is null and lower(payload->>'employee_code')=$1 limit 1`,
          [codeKey],
        );
        const profile = profileResult.rows[0]?.payload;
        const doctorFlag = isDoctor(emp, profile);

        const rawTitle = doctorFlag ? eventConfig.doctor_title : eventConfig.staff_title;
        const rawBody = doctorFlag ? eventConfig.doctor_body : eventConfig.staff_body;
        const title = formatTemplate(rawTitle, { ten: empName, ma: empCode, ca: shiftName, gio: startTime });
        const body = formatTemplate(rawBody, { ten: empName, ma: empCode, ca: shiftName, gio: startTime });
        const chime = eventConfig.chime || 'alert';

        if (profile?.id) {
          const notifId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
            [notifId, JSON.stringify({
              id: notifId,
              user_id: profile.id,
              title,
              body,
              type: 'attendance',
              sound: chime,
              link_view: 'attendance',
              read: false,
              created_at: new Date().toISOString(),
            })],
          );
        }

        await this.push.sendToEmployee(empCode, {
          title,
          body,
          view: 'attendance',
          url: '/',
        });
      }
    } catch (error) {
      console.error('[ReminderService] checkin reminder error:', error);
    }
  }

  private async processCheckoutReminders(dateKey: string, shiftEndTimePrefix: string, eventConfig: ReminderEventConfig) {
    try {
      const checkinsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and payload->>'work_date'=$1 and payload->>'record_type'='checkin' and coalesce(payload->>'status','valid')='valid'`,
        [dateKey],
      );
      if (!checkinsResult.rows.length) return;

      const checkoutsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and payload->>'work_date'=$1 and payload->>'record_type'='checkout'`,
        [dateKey],
      );
      const checkedOutCodes = new Set(checkoutsResult.rows.map((r) => String(r.payload.employee_code || '').toLowerCase()));

      const shiftsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='work_shifts' and deleted_at is null`,
      );
      const shiftByCode = new Map(shiftsResult.rows.map((r) => [String(r.payload.code), r.payload]));

      const assignmentsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null and payload->>'work_date'=$1`,
        [dateKey],
      );
      const assignmentByCode = new Map(assignmentsResult.rows.map((r) => [String(r.payload.employee_code || '').toLowerCase(), r.payload]));

      const employeesResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='employees' and deleted_at is null`,
      );
      const employeeByCode = new Map(employeesResult.rows.map((r) => [String(r.payload.code).toLowerCase(), r.payload]));

      for (const row of checkinsResult.rows) {
        const empCode = String(row.payload.employee_code || '').trim();
        const codeKey = empCode.toLowerCase();
        if (!empCode || checkedOutCodes.has(codeKey)) continue;

        const assignment = assignmentByCode.get(codeKey);
        const shiftCode = String(row.payload.shift_code || assignment?.shift_code || '');
        const shift = shiftByCode.get(shiftCode);
        const endTime = String(shift?.end_time || '17:00').slice(0, 5);

        if (!endTime.startsWith(shiftEndTimePrefix.slice(0, 2))) continue;

        const trackerKey = `${dateKey}:checkout:${codeKey}`;
        if (this.sentReminders.has(trackerKey)) continue;
        this.sentReminders.add(trackerKey);

        const emp = employeeByCode.get(codeKey);
        const empName = emp?.full_name || empCode;

        const profileResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where entity_type='profiles' and deleted_at is null and lower(payload->>'employee_code')=$1 limit 1`,
          [codeKey],
        );
        const profile = profileResult.rows[0]?.payload;
        const doctorFlag = isDoctor(emp, profile);

        const rawTitle = doctorFlag ? eventConfig.doctor_title : eventConfig.staff_title;
        const rawBody = doctorFlag ? eventConfig.doctor_body : eventConfig.staff_body;
        const title = formatTemplate(rawTitle, { ten: empName, ma: empCode, ca: shift?.name || 'ca làm', gio: endTime });
        const body = formatTemplate(rawBody, { ten: empName, ma: empCode, ca: shift?.name || 'ca làm', gio: endTime });
        const chime = eventConfig.chime || 'alert';

        if (profile?.id) {
          const notifId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
            [notifId, JSON.stringify({
              id: notifId,
              user_id: profile.id,
              title,
              body,
              type: 'attendance',
              sound: chime,
              link_view: 'attendance',
              read: false,
              created_at: new Date().toISOString(),
            })],
          );
        }

        await this.push.sendToEmployee(empCode, {
          title,
          body,
          view: 'attendance',
          url: '/',
        });
      }
    } catch (error) {
      console.error('[ReminderService] checkout reminder error:', error);
    }
  }

  private async processLunchBreakCare(dateKey: string, eventConfig: ReminderEventConfig) {
    try {
      const assignmentsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
         and payload->>'work_date'=$1 and coalesce(payload->>'status','planned') in ('planned','confirmed')`,
        [dateKey],
      );
      const checkinsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and payload->>'work_date'=$1 and payload->>'record_type'='checkin' and coalesce(payload->>'status','valid')='valid'`,
        [dateKey],
      );

      const activeEmployeeCodes = new Set<string>();
      for (const row of assignmentsResult.rows) {
        const c = String(row.payload.employee_code || '').trim();
        if (c) activeEmployeeCodes.add(c);
      }
      for (const row of checkinsResult.rows) {
        const c = String(row.payload.employee_code || '').trim();
        if (c) activeEmployeeCodes.add(c);
      }
      if (!activeEmployeeCodes.size) return;

      const employeesResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='employees' and deleted_at is null and coalesce(payload->>'status','active')='active'`,
      );
      const employeeByCode = new Map(employeesResult.rows.map((r) => [String(r.payload.code).toLowerCase(), r.payload]));

      for (const empCode of activeEmployeeCodes) {
        const codeKey = empCode.toLowerCase();
        const trackerKey = `${dateKey}:lunch:${codeKey}`;
        if (this.sentReminders.has(trackerKey)) continue;
        this.sentReminders.add(trackerKey);

        const emp = employeeByCode.get(codeKey);
        const empName = emp?.full_name || empCode;

        const profileResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where entity_type='profiles' and deleted_at is null and lower(payload->>'employee_code')=$1 limit 1`,
          [codeKey],
        );
        const profile = profileResult.rows[0]?.payload;
        const doctorFlag = isDoctor(emp, profile);

        const rawTitle = doctorFlag ? eventConfig.doctor_title : eventConfig.staff_title;
        const rawBody = doctorFlag ? eventConfig.doctor_body : eventConfig.staff_body;
        const title = formatTemplate(rawTitle, { ten: empName, ma: empCode });
        const body = formatTemplate(rawBody, { ten: empName, ma: empCode });
        const chime = eventConfig.chime || 'melody';

        if (profile?.id) {
          const notifId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
            [notifId, JSON.stringify({
              id: notifId,
              user_id: profile.id,
              title,
              body,
              type: 'care',
              sound: chime,
              link_view: 'dashboard',
              read: false,
              created_at: new Date().toISOString(),
            })],
          );
        }

        await this.push.sendToEmployee(empCode, {
          title,
          body,
          view: 'dashboard',
          url: '/',
        });
      }
    } catch (error) {
      console.error('[ReminderService] lunch care error:', error);
    }
  }

  private async processAfternoonCare(dateKey: string, eventConfig: ReminderEventConfig) {
    try {
      const assignmentsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
         and payload->>'work_date'=$1 and coalesce(payload->>'status','planned') in ('planned','confirmed')`,
        [dateKey],
      );
      const checkinsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and payload->>'work_date'=$1 and payload->>'record_type'='checkin' and coalesce(payload->>'status','valid')='valid'`,
        [dateKey],
      );

      const activeEmployeeCodes = new Set<string>();
      for (const row of assignmentsResult.rows) {
        const c = String(row.payload.employee_code || '').trim();
        if (c) activeEmployeeCodes.add(c);
      }
      for (const row of checkinsResult.rows) {
        const c = String(row.payload.employee_code || '').trim();
        if (c) activeEmployeeCodes.add(c);
      }
      if (!activeEmployeeCodes.size) return;

      const employeesResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='employees' and deleted_at is null and coalesce(payload->>'status','active')='active'`,
      );
      const employeeByCode = new Map(employeesResult.rows.map((r) => [String(r.payload.code).toLowerCase(), r.payload]));

      for (const empCode of activeEmployeeCodes) {
        const codeKey = empCode.toLowerCase();
        const trackerKey = `${dateKey}:afternoon:${codeKey}`;
        if (this.sentReminders.has(trackerKey)) continue;
        this.sentReminders.add(trackerKey);

        const emp = employeeByCode.get(codeKey);
        const empName = emp?.full_name || empCode;

        const profileResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where entity_type='profiles' and deleted_at is null and lower(payload->>'employee_code')=$1 limit 1`,
          [codeKey],
        );
        const profile = profileResult.rows[0]?.payload;
        const doctorFlag = isDoctor(emp, profile);

        const rawTitle = doctorFlag ? eventConfig.doctor_title : eventConfig.staff_title;
        const rawBody = doctorFlag ? eventConfig.doctor_body : eventConfig.staff_body;
        const title = formatTemplate(rawTitle, { ten: empName, ma: empCode });
        const body = formatTemplate(rawBody, { ten: empName, ma: empCode });
        const chime = eventConfig.chime || 'melody';

        if (profile?.id) {
          const notifId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
            [notifId, JSON.stringify({
              id: notifId,
              user_id: profile.id,
              title,
              body,
              type: 'care',
              sound: chime,
              link_view: 'dashboard',
              read: false,
              created_at: new Date().toISOString(),
            })],
          );
        }

        await this.push.sendToEmployee(empCode, {
          title,
          body,
          view: 'dashboard',
          url: '/',
        });
      }
    } catch (error) {
      console.error('[ReminderService] afternoon care error:', error);
    }
  }

  private async processEveningCare(dateKey: string, eventConfig: ReminderEventConfig) {
    try {
      const shiftsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='work_shifts' and deleted_at is null`,
      );
      const shiftByCode = new Map(shiftsResult.rows.map((r) => [String(r.payload.code), r.payload]));

      const assignmentsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
         and payload->>'work_date'=$1 and coalesce(payload->>'status','planned') in ('planned','confirmed')`,
        [dateKey],
      );
      const checkinsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and payload->>'work_date'=$1 and payload->>'record_type'='checkin' and coalesce(payload->>'status','valid')='valid'`,
        [dateKey],
      );
      const checkoutsResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='attendance_records' and deleted_at is null
         and payload->>'work_date'=$1 and payload->>'record_type'='checkout'`,
        [dateKey],
      );
      const checkedOutCodes = new Set(checkoutsResult.rows.map((r) => String(r.payload.employee_code || '').toLowerCase()));

      const activeEveningCodes = new Set<string>();
      for (const row of assignmentsResult.rows) {
        const c = String(row.payload.employee_code || '').trim();
        const shift = shiftByCode.get(String(row.payload.shift_code));
        const endTime = String(shift?.end_time || '17:00').slice(0, 5);
        if (c && (endTime.startsWith('19') || endTime.startsWith('20'))) {
          activeEveningCodes.add(c);
        }
      }
      for (const row of checkinsResult.rows) {
        const c = String(row.payload.employee_code || '').trim();
        const shift = shiftByCode.get(String(row.payload.shift_code));
        const endTime = String(shift?.end_time || '17:00').slice(0, 5);
        if (c && (endTime.startsWith('19') || endTime.startsWith('20'))) {
          activeEveningCodes.add(c);
        }
      }

      if (!activeEveningCodes.size) return;

      const employeesResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
        `select payload from app.records where entity_type='employees' and deleted_at is null and coalesce(payload->>'status','active')='active'`,
      );
      const employeeByCode = new Map(employeesResult.rows.map((r) => [String(r.payload.code).toLowerCase(), r.payload]));

      for (const empCode of activeEveningCodes) {
        const codeKey = empCode.toLowerCase();
        if (checkedOutCodes.has(codeKey)) continue;

        const trackerKey = `${dateKey}:evening:${codeKey}`;
        if (this.sentReminders.has(trackerKey)) continue;
        this.sentReminders.add(trackerKey);

        const emp = employeeByCode.get(codeKey);
        const empName = emp?.full_name || empCode;

        const profileResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
          `select payload from app.records where entity_type='profiles' and deleted_at is null and lower(payload->>'employee_code')=$1 limit 1`,
          [codeKey],
        );
        const profile = profileResult.rows[0]?.payload;
        const doctorFlag = isDoctor(emp, profile);

        const rawTitle = doctorFlag ? eventConfig.doctor_title : eventConfig.staff_title;
        const rawBody = doctorFlag ? eventConfig.doctor_body : eventConfig.staff_body;
        const title = formatTemplate(rawTitle, { ten: empName, ma: empCode });
        const body = formatTemplate(rawBody, { ten: empName, ma: empCode });
        const chime = eventConfig.chime || 'soft';

        if (profile?.id) {
          const notifId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
            [notifId, JSON.stringify({
              id: notifId,
              user_id: profile.id,
              title,
              body,
              type: 'care',
              sound: chime,
              link_view: 'dashboard',
              read: false,
              created_at: new Date().toISOString(),
            })],
          );
        }

        await this.push.sendToEmployee(empCode, {
          title,
          body,
          view: 'dashboard',
          url: '/',
        });
      }
    } catch (error) {
      console.error('[ReminderService] evening care error:', error);
    }
  }

  async sendImmediateReminder(params: {
    target: 'all' | 'doctors' | 'staff' | 'me';
    title: string;
    body: string;
    chime?: string;
    view?: string;
    currentUserId?: string;
  }): Promise<{ sentNotifications: number; sentPush: number }> {
    const { target, title, body, chime = 'crystal', view = 'dashboard', currentUserId } = params;
    let sentNotifications = 0;
    let sentPush = 0;

    const employeesResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type='employees' and deleted_at is null and coalesce(payload->>'status','active')='active'`,
    );
    const profilesResult = await this.infrastructure.postgres.query<{ payload: JsonMap }>(
      `select payload from app.records where entity_type='profiles' and deleted_at is null`,
    );
    const profileByEmpCode = new Map(profilesResult.rows.map((r) => [String(r.payload.employee_code || '').toLowerCase(), r.payload]));
    const profileById = new Map(profilesResult.rows.map((r) => [String(r.payload.id), r.payload]));

    if (target === 'me') {
      if (!currentUserId) return { sentNotifications: 0, sentPush: 0 };
      const notifId = randomUUID();
      await this.infrastructure.postgres.query(
        `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
        [notifId, JSON.stringify({
          id: notifId,
          user_id: currentUserId,
          title,
          body,
          type: 'care',
          sound: chime,
          link_view: view,
          read: false,
          created_at: new Date().toISOString(),
        })],
      );
      sentNotifications++;
      const pushRes = await this.push.sendToUser(currentUserId, { title, body, view, url: '/' });
      sentPush += pushRes.sent;
      return { sentNotifications, sentPush };
    }

    for (const empRow of employeesResult.rows) {
      const emp = empRow.payload;
      const code = String(emp.code || '').trim();
      if (!code) continue;
      const profile = profileByEmpCode.get(code.toLowerCase());
      const doctorFlag = isDoctor(emp, profile);

      if (target === 'doctors' && !doctorFlag) continue;
      if (target === 'staff' && doctorFlag) continue;

      const empName = emp.full_name || code;
      const customTitle = formatTemplate(title, { ten: empName, ma: code });
      const customBody = formatTemplate(body, { ten: empName, ma: code });

      if (profile?.id) {
        const notifId = randomUUID();
        await this.infrastructure.postgres.query(
          `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
          [notifId, JSON.stringify({
            id: notifId,
            user_id: profile.id,
            title: customTitle,
            body: customBody,
            type: 'care',
            sound: chime,
            link_view: view,
            read: false,
            created_at: new Date().toISOString(),
          })],
        );
        sentNotifications++;
      }

      const pushRes = await this.push.sendToEmployee(code, {
        title: customTitle,
        body: customBody,
        view,
        url: '/',
      });
      sentPush += pushRes.sent;
    }

    return { sentNotifications, sentPush };
  }
}
