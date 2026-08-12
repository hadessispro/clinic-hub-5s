import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv(path) {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()]) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}

loadEnv(process.argv[2] || '.env.vercel-audit');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Thiếu URL hoặc service-role key của Supabase.');

const email = 'thaibaoleo123@gmail.com';
const password = '0366013107';
const employeeCode = 'PVC-IT';
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: listed, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
let authUser = listed.users.find((user) => user.email?.toLowerCase() === email);
const attributes = {
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: 'Đào Thái Bảo', employee_code: employeeCode, branch_id: 'all' },
};
if (authUser) {
  const { data, error } = await admin.auth.admin.updateUserById(authUser.id, attributes);
  if (error) throw error;
  authUser = data.user;
} else {
  const { data, error } = await admin.auth.admin.createUser(attributes);
  if (error) throw error;
  authUser = data.user;
}

const { error: employeeError } = await admin.from('employees').upsert({
  code: employeeCode,
  employee_number: '10999',
  branch_id: 'pham-van-chieu',
  full_name: 'Đào Thái Bảo',
  department: 'it',
  title: 'Quản trị IT',
  phone: password,
  email,
  status: 'active',
  shift_code: 'clinic-0800',
}, { onConflict: 'code' });
if (employeeError) throw employeeError;

// Remove stale profile rows for the same employee code before linking the
// canonical profile to the real Supabase Auth UID.
const { error: staleError } = await admin.from('profiles').delete()
  .eq('employee_code', employeeCode).neq('id', authUser.id);
if (staleError) throw staleError;
const { error: profileError } = await admin.from('profiles').upsert({
  id: authUser.id,
  employee_code: employeeCode,
  employee_number: '10999',
  full_name: 'Đào Thái Bảo',
  department: 'it',
  branch_id: 'pham-van-chieu',
  role: 'admin_it',
  active: true,
}, { onConflict: 'id' });
if (profileError) throw profileError;

console.log(JSON.stringify({ ok: true, userId: authUser.id, email, employeeCode, role: 'admin_it' }));
