import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import XLSX from 'xlsx';

// Backend đã có `pg`; nạp từ workspace backend để không kéo driver database
// vào gói web chỉ vì một công cụ bảo trì chạy tay.
const backendRequire = createRequire(new URL('../apps/backend/package.json', import.meta.url));
const pg = backendRequire('pg');
const { Pool } = pg;

function argument(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

const file = argument('file');
const fromDate = argument('from', '2026-09-01');
const toDate = argument('to', '9999-12-31');
const apply = process.argv.includes('--apply');

if (!file) throw new Error('Cách dùng: node scripts/import-legacy-attendance-sheet.mjs --file <xlsx> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--apply]');
if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error('Khoảng ngày không hợp lệ.');

const shiftCodes = new Map([
  ['ca hanh chinh 07:30-17:00', 'front-office'],
  ['ca sang 07:30-18:00', 'front-morning'],
  ['ca chieu 09:30-20:00', 'front-afternoon'],
  ['ca toan ngay 07:30-20:00', 'front-full'],
  ['ca bac si 08:00-17:00', 'doctor-office'],
  ['ca bac si 08:00-18:00', 'doctor-morning'],
  ['ca bac si 10:00-20:00', 'doctor-afternoon'],
  ['ca bac si 08:00-20:00', 'doctor-full'],
  ['ca bao ve 07:00-20:00', 'security-weekday'],
  ['ca bao ve chu nhat 07:00-17:00', 'security-sunday'],
  ['ca tap vu 06:00-16:00', 'cleaning-weekday'],
  ['ca tap vu chu nhat 06:00-15:00', 'cleaning-sunday'],
  ['ca 08:00-17:00', 'clinic-0800'],
]);

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .replace(/[–—]/g, '-').replace(/\s+/g, ' ').toLowerCase();
}

function clinicDateParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
}

function dateValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const parts = clinicDateParts(value);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vi = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vi) return `${vi[3]}-${vi[2].padStart(2, '0')}-${vi[1].padStart(2, '0')}`;
  return '';
}

function timeValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const parts = clinicDateParts(value);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const seconds = Math.round((value - Math.floor(value)) * 86400) % 86400;
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((part) => String(part).padStart(2, '0')).join(':');
  }
  const match = text(value).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}` : '';
}

function uuidFromKey(key) {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function instant(workDate, clock) {
  return new Date(`${workDate}T${clock}+07:00`).toISOString();
}

const workbook = XLSX.read(await readFile(file), { type: 'buffer', cellDates: true });
const sheet = workbook.Sheets.ChamCong;
if (!sheet) throw new Error('Không tìm thấy tab ChamCong trong workbook.');
// Dùng chuỗi hiển thị của Excel. `cellDates` của thư viện xlsx làm lệch ngày
// và giờ 7 tiếng với workbook do Google Sheets xuất theo múi giờ Việt Nam.
const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

const selected = rows.map((row, index) => {
  const workDate = dateValue(row['Ngày']);
  const employeeCode = text(row['Mã nhân viên']);
  const employeeName = text(row['Họ và tên']);
  const checkin = timeValue(row['Giờ vào']);
  const checkout = timeValue(row['Giờ ra']);
  const shiftLabel = text(row['Ca làm việc']);
  const shiftCode = shiftCodes.get(normalized(shiftLabel));
  return { sourceRow: index + 2, workDate, employeeCode, employeeName, checkin, checkout, shiftLabel, shiftCode, capturedOffline: normalized(row.Offline) === 'co' };
}).filter((row) => row.workDate >= fromDate && row.workDate <= toDate && row.employeeCode);

const invalid = selected.filter((row) => !row.shiftCode || !row.checkin);
if (invalid.length) {
  console.error(JSON.stringify({ invalid }, null, 2));
  throw new Error(`${invalid.length} dòng thiếu giờ vào hoặc không nhận diện được ca làm.`);
}

const summary = {
  sourceRows: selected.length,
  checkins: selected.length,
  checkouts: selected.filter((row) => row.checkout).length,
  missingCheckout: selected.filter((row) => !row.checkout).map((row) => `${row.workDate}:${row.employeeCode}`),
  fromDate,
  toDate,
  mode: apply ? 'apply' : 'dry-run',
};

if (!apply) {
  console.log(JSON.stringify({ summary, rows: selected }, null, 2));
  process.exit(0);
}

if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const client = await pool.connect();
let schedulesInserted = 0;
let schedulesRefreshed = 0;
let attendanceInserted = 0;
let attendanceRefreshed = 0;
let existingSkipped = 0;

try {
  await client.query('begin');
  const employeeResult = await client.query(
    `select lower(payload->>'code') code from app.records where entity_type='employees' and deleted_at is null and payload->>'status'='active'`,
  );
  const activeEmployees = new Set(employeeResult.rows.map((row) => row.code));
  const unknownEmployees = selected.filter((row) => !activeEmployees.has(row.employeeCode.toLowerCase()));
  if (unknownEmployees.length) throw new Error(`Mã nhân viên chưa hoạt động: ${[...new Set(unknownEmployees.map((row) => row.employeeCode))].join(', ')}`);

  for (const row of selected) {
    const scheduleCollision = await client.query(
      `select record_key,origin from app.records where entity_type='schedule_assignments' and deleted_at is null
       and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 limit 1`,
      [row.employeeCode, row.workDate],
    );
    const scheduleId = scheduleCollision.rows[0]?.record_key || uuidFromKey(`legacy-sheet:schedule:${row.workDate}:${row.employeeCode}`);
    const schedulePayload = {
      id: scheduleId, employee_code: row.employeeCode, work_date: row.workDate, shift_code: row.shiftCode,
      status: 'planned', owner_code: row.employeeCode, swap_with_code: null,
      overtime_minutes: 0, early_leave_minutes: 0, early_arrival_minutes: 0, proof_url: null,
      note: `[LEGACY_GOOGLE_SHEET] ChamCong dòng ${row.sourceRow}`,
    };
    if (!scheduleCollision.rows.length) {
      await client.query(
        `insert into app.records(entity_type,record_key,payload,origin) values ('schedule_assignments',$1,$2::jsonb,'google-sheet-legacy')`,
        [scheduleId, JSON.stringify(schedulePayload)],
      );
      schedulesInserted += 1;
    } else if (scheduleCollision.rows[0].origin === 'google-sheet-legacy') {
      const refreshed = await client.query(
        `update app.records set payload=$2::jsonb,version=version+1,updated_at=now()
         where entity_type='schedule_assignments' and record_key=$1 and payload is distinct from $2::jsonb returning record_key`,
        [scheduleId, JSON.stringify(schedulePayload)],
      );
      schedulesRefreshed += refreshed.rowCount || 0;
    }

    for (const [recordType, clock] of [['checkin', row.checkin], ['checkout', row.checkout]]) {
      if (!clock) continue;
      const collision = await client.query(
        `select record_key,origin from app.records where entity_type='attendance_records' and deleted_at is null
         and lower(payload->>'employee_code')=lower($1) and payload->>'work_date'=$2 and payload->>'record_type'=$3 limit 1`,
        [row.employeeCode, row.workDate, recordType],
      );
      if (collision.rows.length && collision.rows[0].origin !== 'google-sheet-legacy') {
        existingSkipped += 1;
        continue;
      }
      const id = collision.rows[0]?.record_key || uuidFromKey(`legacy-sheet:attendance:${row.workDate}:${row.employeeCode}:${recordType}`);
      const recordedAt = instant(row.workDate, clock);
      const payload = {
        id, client_event_id: id, employee_code: row.employeeCode, shift_code: row.shiftCode,
        record_type: recordType, work_date: row.workDate, recorded_at: recordedAt,
        lat: null, lng: null, distance_m: null, accuracy_m: null, status: 'valid',
        created_by: null, device_id: 'legacy-google-sheet', captured_offline: row.capturedOffline,
        synced_at: recordedAt, proof_url: null,
        note: `[LEGACY_GOOGLE_SHEET] ChamCong dòng ${row.sourceRow}; không có GPS trong nguồn cũ; ${row.employeeName}; ${row.shiftLabel}`,
      };
      if (!collision.rows.length) {
        await client.query(
          `insert into app.records(entity_type,record_key,payload,origin) values ('attendance_records',$1,$2::jsonb,'google-sheet-legacy')`,
          [id, JSON.stringify(payload)],
        );
        attendanceInserted += 1;
      } else {
        const refreshed = await client.query(
          `update app.records set payload=$2::jsonb,version=version+1,updated_at=now()
           where entity_type='attendance_records' and record_key=$1 and payload is distinct from $2::jsonb returning record_key`,
          [id, JSON.stringify(payload)],
        );
        attendanceRefreshed += refreshed.rowCount || 0;
      }
    }
  }
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify({
  ...summary, schedulesInserted, schedulesRefreshed, attendanceInserted, attendanceRefreshed, existingSkipped,
}, null, 2));
