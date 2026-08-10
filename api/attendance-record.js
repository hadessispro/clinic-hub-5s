import { createClient } from '@supabase/supabase-js';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MANAGER_ROLES = new Set(['admin', 'hr', 'leader', 'admin_it']);
const FALLBACK_BRANCHES = {
  'pham-van-chieu': {
    id: 'pham-van-chieu', latitude: 10.848632, longitude: 106.649181,
    allowed_radius_m: 100, max_gps_accuracy_m: 50,
  },
  'le-van-tho': {
    id: 'le-van-tho', latitude: 10.8381574, longitude: 106.6579553,
    allowed_radius_m: 100, max_gps_accuracy_m: 50,
  },
};

function clients() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !publishableKey) return null;
  return {
    admin: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    verifier: createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function authorize(req, db) {
  const jwt = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data: authData } = await db.verifier.auth.getUser(jwt);
  if (!authData.user) return null;
  const { data: profile } = await db.admin.from('profiles')
    .select('id,employee_code,full_name,department,role,active,branch_id')
    .eq('id', authData.user.id).maybeSingle();
  if (!profile?.active || !profile.employee_code) return null;
  return profile;
}

function clinicParts(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` };
}

function seconds(time) {
  const [hour = 0, minute = 0, second = 0] = String(time || '').split(':').map(Number);
  return hour * 3600 + minute * 60 + second;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const radians = (number) => number * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function loadBranch(db, branchId) {
  const { data } = await db.admin.from('clinic_locations').select('*')
    .eq('id', branchId).eq('active', true).maybeSingle();
  return data || FALLBACK_BRANCHES[branchId] || null;
}

async function resolveShift(db, employee, workDate, requestedShift) {
  const { data: assignment } = await db.admin.from('schedule_assignments')
    .select('shift_code').eq('employee_code', employee.code).eq('work_date', workDate).maybeSingle();
  if (assignment?.shift_code) return assignment.shift_code;

  if (requestedShift) {
    const { data: allowed } = await db.admin.from('employee_allowed_shifts')
      .select('shift_code').eq('employee_code', employee.code).eq('shift_code', requestedShift).maybeSingle();
    if (!allowed) throw new Error('Ca làm đã chọn không được cấp cho tài khoản này.');
    return requestedShift;
  }
  return employee.shift_code || 'clinic-0800';
}

async function findExisting(db, employeeCode, workDate, type, eventId) {
  const { data: eventRow } = await db.admin.from('attendance_records').select('*')
    .eq('client_event_id', eventId).maybeSingle();
  if (eventRow) return eventRow;
  const { data } = await db.admin.from('attendance_records').select('*')
    .eq('employee_code', employeeCode).eq('work_date', workDate).eq('record_type', type)
    .order('recorded_at').limit(1);
  return data?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = clients();
  if (!db) return res.status(503).json({ error: 'Dịch vụ chấm công chưa được cấu hình.' });

  try {
    const profile = await authorize(req, db);
    if (!profile) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const type = body.type === 'checkout' ? 'checkout' : 'checkin';
    const eventId = String(body.clientEventId || '');
    const recordedAt = new Date(body.time);
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const accuracy = Math.round(Number(body.accuracy));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) throw new Error('Mã lượt chấm công không hợp lệ.');
    if (!Number.isFinite(recordedAt.getTime()) || recordedAt > new Date(Date.now() + 5 * 60000) || recordedAt < new Date(Date.now() - 7 * 86400000)) throw new Error('Thời gian chấm công không hợp lệ.');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error('Tọa độ GPS không hợp lệ.');

    const { data: employee } = await db.admin.from('employees')
      .select('code,department,branch_id,shift_code,status').eq('code', profile.employee_code).maybeSingle();
    if (!employee || employee.status !== 'active') throw new Error('Hồ sơ nhân viên chưa hoạt động.');

    const requestedBranch = String(body.branchId || '');
    const branchId = MANAGER_ROLES.has(profile.role)
      ? requestedBranch
      : (profile.branch_id || employee.branch_id);
    if (!FALLBACK_BRANCHES[branchId]) throw new Error('Chi nhánh chấm công không hợp lệ.');
    if (!MANAGER_ROLES.has(profile.role) && requestedBranch && requestedBranch !== branchId) throw new Error('Tài khoản không được chấm công tại chi nhánh đã chọn.');

    const branch = await loadBranch(db, branchId);
    if (!branch) throw new Error('Chi nhánh chưa cấu hình vị trí chấm công.');
    const maxAccuracy = Math.max(10, Math.min(100, Number(branch.max_gps_accuracy_m || 50)));
    const radius = Math.max(20, Math.min(300, Number(branch.allowed_radius_m || 100)));
    if (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > maxAccuracy) throw new Error(`Sai số GPS ±${accuracy || 0} m vượt mức cho phép ${maxAccuracy} m.`);
    const distance = distanceMeters(lat, lng, Number(branch.latitude), Number(branch.longitude));
    if (distance > radius) throw new Error(`Bạn đang cách ${branchId === 'pham-van-chieu' ? 'Phạm Văn Chiêu' : 'Lê Văn Thọ'} ${distance} m; bán kính cho phép ${radius} m.`);

    const effectiveAt = body.capturedOffline ? recordedAt : new Date();
    const local = clinicParts(effectiveAt);
    const existing = await findExisting(db, employee.code, local.date, type, eventId);
    if (existing) return res.status(200).json({ data: existing, duplicate: true });

    let shiftCode;
    let shift;
    if (type === 'checkout') {
      const { data: checkin } = await db.admin.from('attendance_records').select('*')
        .eq('employee_code', employee.code).eq('work_date', local.date).eq('record_type', 'checkin')
        .order('recorded_at').limit(1).maybeSingle();
      if (!checkin) throw new Error('Bạn cần check-in trước khi kết ca.');
      if (effectiveAt < new Date(checkin.recorded_at)) throw new Error('Giờ kết ca không thể trước giờ check-in.');
      shiftCode = checkin.shift_code;
    } else {
      shiftCode = await resolveShift(db, employee, local.date, String(body.shift || ''));
    }
    const { data: shiftData } = await db.admin.from('work_shifts').select('*')
      .eq('code', shiftCode).eq('active', true).maybeSingle();
    shift = shiftData;
    if (!shift) throw new Error('Ca làm chưa được cấu hình trong hệ thống.');

    const localSeconds = seconds(local.time);
    const status = type === 'checkin'
      ? (localSeconds > seconds(shift.start_time) - Number(shift.checkin_advance_minutes || 0) * 60 ? 'late' : 'valid')
      : (localSeconds < seconds(shift.end_time) ? 'early_leave' : 'valid');
    const payload = {
      client_event_id: eventId,
      employee_code: employee.code,
      shift_code: shiftCode,
      record_type: type,
      work_date: local.date,
      recorded_at: effectiveAt.toISOString(),
      lat, lng, distance_m: distance, accuracy_m: accuracy, status,
      created_by: profile.id,
      device_id: String(body.deviceId || '').slice(0, 120) || null,
      captured_offline: !!body.capturedOffline,
      synced_at: new Date().toISOString(),
      note: `[BRANCH:${branchId}]`,
    };
    const { data, error } = await db.admin.from('attendance_records').insert(payload).select().single();
    if (error) {
      if (String(error.code) === '23505') {
        const duplicate = await findExisting(db, employee.code, local.date, type, eventId);
        if (duplicate) return res.status(200).json({ data: duplicate, duplicate: true });
      }
      throw error;
    }
    return res.status(200).json({ data });
  } catch (error) {
    console.error('[Attendance API]', error);
    return res.status(400).json({ error: String(error?.message || 'Không thể ghi nhận chấm công.') });
  }
}
