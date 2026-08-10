import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { PVC_WORKBOOK_STAFF } from './pvc-workbook-staff.mjs';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (!match || process.env[match[1].trim()]) continue;
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch { /* optional local env */ }
}
loadEnv('.env.production.local'); loadEnv('.env.local'); loadEnv('.env');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Thiếu SUPABASE URL hoặc secret key.');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const clean = (value) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const digits = (value) => String(value || '').replace(/\D/g, '');
const loginEmail = (branchId, mnv) => `${branchId === 'le-van-tho' ? 'lvt' : 'pvc'}.${String(mnv).toLowerCase()}@login.nhakhoa5s.vn`;
const shiftFor = (department) => department === 'bs' ? 'doctor-office' : department === 'dvkh' || department === 'phuta' ? 'front-office' : department === 'laocong' ? 'cleaning-weekday' : 'clinic-0800';

const [{ data: employees, error: employeeReadError }, { data: profiles, error: profileReadError }, { data: authPage, error: authReadError }] = await Promise.all([
  admin.from('employees').select('*'), admin.from('profiles').select('*'), admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
]);
if (employeeReadError || profileReadError || authReadError) throw employeeReadError || profileReadError || authReadError;

const employeeByPhone = new Map(employees.filter((e) => digits(e.phone)).map((e) => [digits(e.phone), e]));
const employeeByName = new Map(employees.map((e) => [clean(e.full_name), e]));
const profileByCode = new Map(profiles.filter((p) => p.employee_code).map((p) => [p.employee_code, p]));
const userById = new Map(authPage.users.map((u) => [u.id, u]));
const userByEmail = new Map(authPage.users.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));

let createdUsers = 0, updatedUsers = 0, createdEmployees = 0, updatedEmployees = 0, skippedAccounts = 0;
for (const staff of PVC_WORKBOOK_STAFF) {
  const existing = (staff.phone && employeeByPhone.get(digits(staff.phone))) || employeeByName.get(clean(staff.name));
  const fallback = staff.employeeNumber ? `PVC-${staff.employeeNumber}` : `PVC-PENDING-${digits(staff.phone).slice(-6) || clean(staff.name).replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
  const code = existing?.code || fallback;
  const employeeRow = {
    code, employee_number: staff.employeeNumber, branch_id: staff.branchId, full_name: staff.name,
    department: staff.department, title: staff.title || existing?.title || 'Chưa cập nhật', phone: staff.phone || existing?.phone || null,
    email: staff.employeeNumber ? loginEmail(staff.branchId, staff.employeeNumber) : existing?.email || null,
    status: 'active', shift_code: existing?.shift_code || shiftFor(staff.department),
  };
  const { error: upsertEmployeeError } = await admin.from('employees').upsert(employeeRow, { onConflict: 'code' });
  if (upsertEmployeeError) throw new Error(`${staff.name}: ${upsertEmployeeError.message}`);
  existing ? updatedEmployees++ : createdEmployees++;
  employeeByName.set(clean(staff.name), employeeRow);
  if (staff.phone) employeeByPhone.set(digits(staff.phone), employeeRow);

  if (!staff.employeeNumber || digits(staff.phone).length !== 10) { skippedAccounts++; continue; }
  const email = loginEmail(staff.branchId, staff.employeeNumber);
  const linkedProfile = profileByCode.get(code);
  let user = (linkedProfile && userById.get(linkedProfile.id)) || userByEmail.get(email);
  const attributes = { email, password: digits(staff.phone), email_confirm: true,
    user_metadata: { full_name: staff.name, employee_code: code, employee_number: staff.employeeNumber, branch_id: staff.branchId } };
  if (user) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, attributes);
    if (error) throw new Error(`${staff.employeeNumber} auth update: ${error.message}`);
    user = data.user; updatedUsers++;
  } else {
    const { data, error } = await admin.auth.admin.createUser(attributes);
    if (error) throw new Error(`${staff.employeeNumber} auth create: ${error.message}`);
    user = data.user; createdUsers++;
  }
  const { error: profileError } = await admin.from('profiles').upsert({ id: user.id, employee_code: code,
    employee_number: staff.employeeNumber, branch_id: staff.branchId, full_name: staff.name,
    department: staff.department, role: linkedProfile?.role || 'staff', active: true }, { onConflict: 'id' });
  if (profileError) throw new Error(`${staff.employeeNumber} profile: ${profileError.message}`);
}

console.log(JSON.stringify({ total: PVC_WORKBOOK_STAFF.length, createdEmployees, updatedEmployees, createdUsers, updatedUsers, skippedAccounts }, null, 2));
