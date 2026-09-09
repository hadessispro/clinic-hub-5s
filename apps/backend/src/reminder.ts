import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InfrastructureService } from './infrastructure';
import { PushService } from './push';
import { randomUUID } from 'node:crypto';

type JsonMap = Record<string, any>;

@Injectable()
export class ReminderService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null;
  private sentReminders = new Set<string>();
  private lastResetDate = '';

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

    // 1. Nhắc Check-in & Chúc ngày mới:
    // Ca sáng / hành chính (07:30, 08:00): nhắc lúc 07:15 - 07:45
    // Ca chiều (09:30, 10:00): nhắc lúc 09:15 - 09:45
    if (hour === 7 && minute >= 15 && minute <= 45) {
      await this.processCheckinReminders(dateKey, 'morning');
    }
    if (hour === 9 && minute >= 15 && minute <= 45) {
      await this.processCheckinReminders(dateKey, 'afternoon');
    }

    // 2. Nhắc Check-out ra về:
    // Ca HC (hết lúc 17:00): nhắc lúc 17:05 - 17:15
    // Ca S (hết lúc 18:00): nhắc lúc 18:05 - 18:15
    // Ca C, F (hết lúc 20:00): nhắc lúc 20:05 - 20:15
    if (
      (hour === 17 && minute >= 5 && minute <= 15)
      || (hour === 18 && minute >= 5 && minute <= 15)
      || (hour === 20 && minute >= 5 && minute <= 15)
    ) {
      const targetEndTime = hour === 17 ? '17:00' : (hour === 18 ? '18:00' : '20:00');
      await this.processCheckoutReminders(dateKey, targetEndTime);
    }

    // 3. Nghỉ trưa & Nạp năng lượng (12:00 - 12:15):
    if (hour === 12 && minute >= 0 && minute <= 15) {
      await this.processLunchBreakCare(dateKey);
    }

    // 4. Tiếp năng lượng giữa giờ chiều (15:00 - 15:15):
    if (hour === 15 && minute >= 0 && minute <= 15) {
      await this.processAfternoonCare(dateKey);
    }

    // 5. Động viên chặng cuối của ngày (18:15 - 18:30 cho nhân sự làm ca tối đến 20:00):
    if (hour === 18 && minute >= 15 && minute <= 30) {
      await this.processEveningCare(dateKey);
    }
  }

  private async processCheckinReminders(dateKey: string, shiftPeriod: 'morning' | 'afternoon') {
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
        if (profile?.id) {
          const notifId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
            [notifId, JSON.stringify({
              id: notifId,
              user_id: profile.id,
              title: '⏰ Nhắc nhở chấm công · Nha Khoa 5S',
              body: `Chào ${empName}, bạn có ca ${shiftName} (${startTime}) hôm nay. Đừng quên check-in đúng giờ nhé! Chúc bạn ngày mới năng lượng! 🌟`,
              type: 'attendance',
              link_view: 'attendance',
              read: false,
              created_at: new Date().toISOString(),
            })],
          );
        }

        await this.push.sendToEmployee(empCode, {
          title: '⏰ Nhắc nhở chấm công · Nha Khoa 5S',
          body: `Chào ${empName}, bạn có ca ${shiftName} (${startTime}) hôm nay. Đừng quên check-in đúng giờ nhé! Chúc bạn ngày mới năng lượng! 🌟`,
          view: 'attendance',
          url: '/',
        });
      }
    } catch (error) {
      console.error('[ReminderService] checkin reminder error:', error);
    }
  }

  private async processCheckoutReminders(dateKey: string, shiftEndTimePrefix: string) {
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
        if (profile?.id) {
          const notifId = randomUUID();
          await this.infrastructure.postgres.query(
            `insert into app.records(entity_type,record_key,payload,origin) values ('notifications',$1,$2::jsonb,'vps')`,
            [notifId, JSON.stringify({
              id: notifId,
              user_id: profile.id,
              title: '🏁 Nhắc nhở check-out · Nha Khoa 5S',
              body: `Ca làm việc của ${empName} đã kết thúc lúc ${endTime}. Hãy nhớ checkout và bàn giao công việc trước khi ra về nhé!`,
              type: 'attendance',
              link_view: 'attendance',
              read: false,
              created_at: new Date().toISOString(),
            })],
          );
        }

        await this.push.sendToEmployee(empCode, {
          title: '🏁 Nhắc nhở check-out · Nha Khoa 5S',
          body: `Ca làm việc của ${empName} đã kết thúc lúc ${endTime}. Hãy nhớ checkout và bàn giao công việc trước khi ra về nhé!`,
          view: 'attendance',
          url: '/',
        });
      }
    } catch (error) {
      console.error('[ReminderService] checkout reminder error:', error);
    }
  }

  private async processLunchBreakCare(dateKey: string) {
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
        const title = '🍱 Giờ nghỉ trưa nạp năng lượng · 5S Care 💖';
        const body = `Chào ${empName}, giờ nghỉ trưa đã đến rồi! Hãy gác lại công việc, thưởng thức bữa trưa ngon miệng và chợp mắt một chút để nạp lại 100% năng lượng nhé! 🍵✨`;

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

  private async processAfternoonCare(dateKey: string) {
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
        const title = '☕ Thư giãn & tiếp năng lượng chiều · 5S Clinic 🌸';
        const body = `Vươn vai, uống một ngụm nước và thư giãn mắt nào ${empName}! Bạn đã làm việc rất chăm chỉ suốt buổi sáng. Cố gắng thêm một chút nữa nhé, buổi chiều tuyệt vời! 💪🌈✨`;

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

  private async processEveningCare(dateKey: string) {
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
        const title = '🌙 Chặng cuối của ngày rồi, cố lên bạn nhé · 5S Care 🎯';
        const body = `Cảm ơn ${empName} vì sự tận tâm và nụ cười rạng rỡ mang đến cho khách hàng hôm nay. Ca làm việc sắp hoàn thành rồi, chuẩn bị về nghỉ ngơi ấm áp bên gia đình nhé! ✨🛋️`;

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
}
