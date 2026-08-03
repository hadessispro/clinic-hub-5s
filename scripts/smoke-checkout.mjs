import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function localDate(offsetDays) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + offsetDays * 86_400_000));
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${value.year}-${value.month}-${value.day}`;
}

loadEnvFile(path.resolve('.env'));

const url = process.env.VITE_SUPABASE_URL;
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publicKey || !secretKey) {
  throw new Error('Thiếu cấu hình Supabase trong .env.');
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const admin = createClient(url, secretKey, clientOptions);

const { data: profiles, error: profileError } = await admin
  .from('profiles')
  .select('id, employee_code')
  .eq('active', true)
  .not('employee_code', 'is', null)
  .limit(20);
if (profileError) throw profileError;

let subject = null;
for (const profile of profiles || []) {
  const [{ data: employee }, { data: userResult, error: userError }] = await Promise.all([
    admin.from('employees').select('code, shift_code, status').eq('code', profile.employee_code).maybeSingle(),
    admin.auth.admin.getUserById(profile.id),
  ]);
  if (userError) continue;
  const email = userResult?.user?.email;
  if (employee?.status === 'active' && email) {
    subject = { ...profile, shiftCode: employee.shift_code || 'clinic-0800', email };
    break;
  }
}
if (!subject) throw new Error('Không tìm thấy nhân viên đang hoạt động để kiểm thử.');

const candidateDates = Array.from({ length: 6 }, (_, index) => localDate(-(index + 1)));
const { data: occupied, error: occupiedError } = await admin
  .from('attendance_records')
  .select('work_date')
  .eq('employee_code', subject.employee_code)
  .in('work_date', candidateDates);
if (occupiedError) throw occupiedError;
const occupiedDates = new Set((occupied || []).map((record) => record.work_date));
const workDate = candidateDates.find((date) => !occupiedDates.has(date));
if (!workDate) throw new Error('Không có ngày trống an toàn trong 6 ngày gần nhất để kiểm thử.');

const checkinEventId = randomUUID();
const checkoutEventId = randomUUID();
const outsideCheckoutEventId = randomUUID();
const checkinAt = `${workDate}T09:00:00+07:00`;
const checkoutAt = `${workDate}T17:00:00+07:00`;
let inserted = false;

try {
  const { error: insertError } = await admin.from('attendance_records').insert({
    client_event_id: checkinEventId,
    employee_code: subject.employee_code,
    shift_code: subject.shiftCode,
    record_type: 'checkin',
    work_date: workDate,
    recorded_at: checkinAt,
    lat: 10.8381574,
    lng: 106.6579553,
    distance_m: 0,
    accuracy_m: 10,
    status: 'valid',
    created_by: subject.id,
    device_id: 'codex-checkout-smoke',
    captured_offline: true,
    note: 'codex-checkout-smoke-test',
  });
  if (insertError) throw insertError;
  inserted = true;

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: subject.email,
  });
  if (linkError) throw linkError;
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error('Supabase không trả về token kiểm thử.');

  const userClient = createClient(url, publicKey, clientOptions);
  const { error: verifyError } = await userClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError) throw verifyError;

  const params = {
    p_client_event_id: checkoutEventId,
    p_recorded_at: checkoutAt,
    p_lat: 10.8381574,
    p_lng: 106.6579553,
    p_accuracy_m: 10,
    p_device_id: 'codex-checkout-smoke',
    p_offline: true,
  };

  const { error: outsideError } = await userClient.rpc('record_attendance_checkout', {
    ...params,
    p_client_event_id: outsideCheckoutEventId,
    p_lat: 10.8581574,
  });
  if (!outsideError) {
    throw new Error('RPC checkout chưa chặn tọa độ ngoài bán kính văn phòng.');
  }

  const { data: checkoutRows, error: checkoutError } = await userClient.rpc(
    'record_attendance_checkout',
    params,
  );
  if (checkoutError) throw checkoutError;
  const checkout = checkoutRows?.[0];
  if (!checkout || checkout.record_type !== 'checkout' || checkout.work_date !== workDate
    || Number(checkout.accuracy_m) !== 10 || Number(checkout.distance_m) > 5) {
    throw new Error('RPC không trả về bản ghi checkout hợp lệ.');
  }

  const { data: repeatedRows, error: repeatedError } = await userClient.rpc(
    'record_attendance_checkout',
    params,
  );
  if (repeatedError) throw repeatedError;
  if (repeatedRows?.[0]?.id !== checkout.id) {
    throw new Error('RPC checkout chưa bảo đảm tính idempotent.');
  }

  console.log(`Checkout GPS RPC smoke test passed for ${workDate}; outside-office GPS was rejected and duplicate call returned the same record.`);
} finally {
  if (inserted) {
    const { error: cleanupError } = await admin
      .from('attendance_records')
      .delete()
      .in('client_event_id', [checkinEventId, checkoutEventId, outsideCheckoutEventId]);
    if (cleanupError) throw cleanupError;
  }
}
