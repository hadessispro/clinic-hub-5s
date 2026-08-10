import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

for (const path of ['.env.production.local', '.env.local', '.env']) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  } catch { /* optional */ }
}
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) throw new Error('Thiếu cấu hình Supabase phía máy chủ.');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: employee, error: employeeLookupError } = await admin.from('employees').select('code,full_name').eq('employee_number','10241').maybeSingle();
if (employeeLookupError || !employee) throw employeeLookupError || new Error('Không tìm thấy MNV 10241.');
const { data: profile, error: profileLookupError } = await admin.from('profiles').select('id').eq('employee_code',employee.code).maybeSingle();
if (profileLookupError || !profile) throw profileLookupError || new Error('Không tìm thấy profile MNV 10241.');

const { error: employeeError } = await admin.from('employees').update({ branch_id:'le-van-tho', updated_at:new Date().toISOString() }).eq('code',employee.code);
if (employeeError) throw employeeError;
const { error: profileError } = await admin.from('profiles').update({ branch_id:'le-van-tho', active:true, updated_at:new Date().toISOString() }).eq('id',profile.id);
if (profileError) throw profileError;
const { error: authError } = await admin.auth.admin.updateUserById(profile.id, {
  email:'lvt.10241@login.nhakhoa5s.vn', password:'0837983650', email_confirm:true,
  user_metadata:{ full_name:'Trần Văn Nguyên', employee_code:employee.code, employee_number:'10241', branch_id:'le-van-tho' },
});
if (authError) throw authError;
console.log(JSON.stringify({ employeeNumber:'10241', employeeCode:employee.code, branchId:'le-van-tho', profileActive:true }));
