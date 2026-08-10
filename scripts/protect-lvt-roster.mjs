import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { LVT_PROTECTED_STAFF } from './lvt-protected-staff.mjs';
for (const path of ['.env.production.local','.env.local','.env']) { try { for (const line of readFileSync(path,'utf8').split(/\r?\n/)) { const m=line.match(/^\s*([^#=]+)=(.*)$/); if(m&&!process.env[m[1].trim()]) process.env[m[1].trim()]=m[2].trim().replace(/^['"]|['"]$/g,''); } } catch {} }
const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL, secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!secret) throw new Error('Thiếu cấu hình Supabase phía máy chủ.');
const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
let updated=0;
for(const staff of LVT_PROTECTED_STAFF){
  const {data:employee,error:e1}=await admin.from('employees').select('code').eq('code',staff.code).maybeSingle(); if(e1||!employee) throw e1||new Error(`Không thấy ${staff.code}`);
  const employeeUpdate={branch_id:'le-van-tho',full_name:staff.name,phone:staff.phone,updated_at:new Date().toISOString()}; if(staff.employeeNumber) employeeUpdate.employee_number=staff.employeeNumber;
  const {error:e2}=await admin.from('employees').update(employeeUpdate).eq('code',staff.code); if(e2) throw e2;
  const {data:profile,error:e3}=await admin.from('profiles').select('id').eq('employee_code',staff.code).maybeSingle(); if(e3||!profile) throw e3||new Error(`Thiếu profile ${staff.code}`);
  const profileUpdate={branch_id:'le-van-tho',full_name:staff.name,active:true,updated_at:new Date().toISOString()}; if(staff.employeeNumber) profileUpdate.employee_number=staff.employeeNumber;
  const {error:e4}=await admin.from('profiles').update(profileUpdate).eq('id',profile.id); if(e4) throw e4;
  const attrs={password:staff.phone,email_confirm:true,user_metadata:{full_name:staff.name,employee_code:staff.code,employee_number:staff.employeeNumber,branch_id:'le-van-tho'}};
  if(staff.employeeNumber) attrs.email=`lvt.${staff.employeeNumber}@login.nhakhoa5s.vn`;
  const {error:e5}=await admin.auth.admin.updateUserById(profile.id,attrs); if(e5) throw e5;
  updated++;
}
console.log(JSON.stringify({protectedBranch:'le-van-tho',updated}));
