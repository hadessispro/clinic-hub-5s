const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://clinic_app:clinic_password@clinic-hub-5s-postgres-1:5432/clinic_hub',
  });
  await client.connect();
  console.log('Connected to PostgreSQL');

  const { calculateWorkDay, positiveMinutes } = require('/app/apps/backend/dist/attendance.js');

  const employeeCode = 'PVC003';
  const from = '2026-09-01';
  const to = '2026-09-30';

  const [assignmentResult, attendanceResult, shiftResult, overtimeResult] = await Promise.all([
    client.query(
      `select payload from app.records where entity_type='schedule_assignments' and deleted_at is null
       and lower(payload->>'employee_code')=lower($1) and payload->>'work_date' between $2 and $3`,
      [employeeCode, from, to]
    ),
    client.query(
      `select payload from app.records where entity_type='attendance_records' and deleted_at is null
       and lower(payload->>'employee_code')=lower($1) and payload->>'work_date' between $2 and $3
       order by payload->>'recorded_at'`,
      [employeeCode, from, to]
    ),
    client.query(`select payload from app.records where entity_type='work_shifts' and deleted_at is null`),
    client.query(
      `select payload from app.records where entity_type='leave_requests' and deleted_at is null
       and lower(payload->>'employee_code')=lower($1)
       and payload->>'from_date' between $2 and $3
       and (lower(payload->>'request_type') like '%tăng ca%' or lower(payload->>'request_type') like '%overtime%')
       and payload->>'status'='approved' and payload->>'operations_status'='approved'`,
      [employeeCode, from, to]
    ),
  ]);

  console.log('Overtime rows found:', overtimeResult.rows.length);
  overtimeResult.rows.forEach((r) =>
    console.log('OT:', r.payload.from_date, r.payload.overtime_minutes + 'p', r.payload.reason)
  );

  const assignments = new Map(assignmentResult.rows.map((row) => [String(row.payload.work_date), row.payload]));
  const events = new Map();
  for (const row of attendanceResult.rows) {
    const date = String(row.payload.work_date);
    events.set(date, [...(events.get(date) || []), row.payload]);
  }
  const shifts = new Map(shiftResult.rows.map((row) => [String(row.payload.code), row.payload]));
  const approvedOvertime = new Map();
  for (const row of overtimeResult.rows) {
    const date = String(row.payload.from_date || '');
    const current = approvedOvertime.get(date) || { minutes: 0, ids: [] };
    current.minutes += positiveMinutes(row.payload.overtime_minutes);
    current.ids.push(String(row.payload.id || ''));
    approvedOvertime.set(date, current);
  }
  const dates = [...new Set([...assignments.keys(), ...events.keys(), ...approvedOvertime.keys()])].sort();
  const days = dates.map((date) =>
    calculateWorkDay(
      employeeCode,
      date,
      assignments.get(date),
      events.get(date) || [],
      shifts,
      approvedOvertime.get(date) || { minutes: 0, ids: [] }
    )
  );

  console.log(`Calculated ${days.length} days for ${employeeCode}`);

  await client.query('begin');
  for (const day of days) {
    await client.query(
      `insert into app.records(entity_type,record_key,payload,origin)
       values ('attendance_work_days',$1,$2::jsonb,'vps-work-calculation')
       on conflict(entity_type,record_key) do update set payload=excluded.payload,origin=excluded.origin,
         version=app.records.version+1,updated_at=now(),deleted_at=null`,
      [day.id, JSON.stringify(day)]
    );
  }
  await client.query('commit');
  console.log('Saved recalculated workdays successfully!');

  // In ra kết quả 5 ngày mục tiêu
  const targetDates = ['2026-09-19', '2026-09-20', '2026-09-22', '2026-09-23', '2026-09-26'];
  for (const d of days.filter((day) => targetDates.includes(day.work_date))) {
    console.log(
      `Ngày ${d.work_date}: ca ${d.shift_name}, vào ${d.checkin_at?.slice(11, 19)}, ra ${d.checkout_at?.slice(11, 19)}, reg: ${d.regular_minutes}p, OT: ${d.overtime_minutes}p, công: ${d.workday_credit}`
    );
  }

  await client.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
