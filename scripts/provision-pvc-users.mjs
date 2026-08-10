import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { PVC_STAFF } from './pvc-staff.mjs';

function loadLocalEnv() {
  try {
    for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!match || process.env[match[1].trim()]) continue;
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Environment variables may be supplied by the terminal or CI instead.
  }
}

loadLocalEnv();
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !adminKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL/SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env. Secret key chỉ dùng cục bộ và tuyệt đối không thêm tiền tố VITE_.');
}

const admin = createClient(supabaseUrl, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
const usersByEmail = new Map((listed.users || []).map((user) => [user.email?.toLowerCase(), user]));

function defaultShiftForDepartment(department) {
  if (department === 'bs') return 'doctor-office';
  if (department === 'dvkh' || department === 'phuta') return 'front-office';
  if (department === 'baove') return 'security-weekday';
  if (department === 'laocong') return 'cleaning-weekday';
  return 'clinic-0800';
}

let created = 0;
let updated = 0;

const protectedLvtCodes = new Set(['PVC001','PVC002','PVC003','PVC004','PVC005','PVC006','PVC007','PVC008','PVC009','PVC010','PVC011','PVC013']);

for (const staff of PVC_STAFF) {
  // Danh sách LVT đã được người dùng xác nhận; tuyệt đối không ghi đè về PVC.
  if (protectedLvtCodes.has(staff.code)) continue;
  const email = staff.email.trim().toLowerCase();
  let authUser = usersByEmail.get(email);

  if (authUser) {
    const { data, error } = await admin.auth.admin.updateUserById(authUser.id, {
      password: staff.phone,
      email_confirm: true,
      user_metadata: { full_name: staff.name, employee_code: staff.code, branch_id: 'pham-van-chieu' },
    });
    if (error) throw new Error(`${staff.code}: ${error.message}`);
    authUser = data.user;
    updated += 1;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: staff.phone,
      email_confirm: true,
      user_metadata: { full_name: staff.name, employee_code: staff.code, branch_id: 'pham-van-chieu' },
    });
    if (error) throw new Error(`${staff.code}: ${error.message}`);
    authUser = data.user;
    usersByEmail.set(email, authUser);
    created += 1;
  }

  const { error: employeeError } = await admin.from('employees').upsert({
    code: staff.code,
    full_name: staff.name,
    department: staff.department,
    title: staff.title,
    phone: staff.phone,
    email,
    status: 'active',
    shift_code: defaultShiftForDepartment(staff.department),
  }, { onConflict: 'code' });
  if (employeeError) throw new Error(`${staff.code} employee: ${employeeError.message}`);

  const { data: linkedProfile, error: profileLookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('employee_code', staff.code)
    .maybeSingle();
  if (profileLookupError) throw new Error(`${staff.code} profile lookup: ${profileLookupError.message}`);
  if (linkedProfile && linkedProfile.id !== authUser.id) {
    throw new Error(`${staff.code} đang liên kết với một Auth UID khác. Hãy kiểm tra profiles trước khi chạy lại.`);
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: authUser.id,
    employee_code: staff.code,
    full_name: staff.name,
    department: staff.department,
    role: 'staff',
    active: true,
  }, { onConflict: 'id' });
  if (profileError) throw new Error(`${staff.code} profile: ${profileError.message}`);
}

console.log(`Hoàn tất tài khoản Lê Văn Thọ: tạo ${created}, cập nhật ${updated}, tổng ${PVC_STAFF.length}.`);
