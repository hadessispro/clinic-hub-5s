import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Missing Supabase admin configuration.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const doctorShifts = ['doctor-office', 'doctor-morning', 'doctor-afternoon', 'doctor-full'];

const { data: doctors, error: employeeError } = await db
  .from('employees')
  .select('code')
  .eq('status', 'active')
  .eq('department', 'bs');
if (employeeError) throw employeeError;

const codes = doctors.map((employee) => employee.code);
if (codes.length) {
  const { error: deleteError } = await db
    .from('employee_allowed_shifts')
    .delete()
    .in('employee_code', codes);
  if (deleteError) throw deleteError;

  const rows = codes.flatMap((employeeCode) => doctorShifts.map((shiftCode) => ({
    employee_code: employeeCode,
    shift_code: shiftCode,
  })));
  const { error: insertError } = await db.from('employee_allowed_shifts').insert(rows);
  if (insertError) throw insertError;
}

const { data: audit, error: auditError } = await db
  .from('employee_allowed_shifts')
  .select('employee_code,shift_code')
  .in('employee_code', codes);
if (auditError) throw auditError;

const allDoctorsHaveFourShifts = codes.every((code) => (
  audit.filter((row) => row.employee_code === code).length === doctorShifts.length
));
console.log(JSON.stringify({ activeDoctors: codes.length, mappedRows: audit.length, allDoctorsHaveFourShifts }));
