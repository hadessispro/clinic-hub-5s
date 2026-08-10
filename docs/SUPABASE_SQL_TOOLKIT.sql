/*
  NHA KHOA 5S - BỘ LỆNH TỰ KIỂM TRA SUPABASE
  ===========================================
  Mục đích: giúp quản trị viên tự kiểm tra hệ thống trong Supabase SQL Editor,
  không cần sửa code và không phụ thuộc người triển khai.

  AN TOÀN:
  - Mục 00-16 chỉ đọc/kiểm tra; không sửa dữ liệu nghiệp vụ.
  - Bảng tạm quick_params chỉ tồn tại trong phiên SQL Editor hiện tại.
  - Mục 90 là mẫu sửa dữ liệu, được comment và mặc định ROLLBACK.
  - Không bao giờ sửa auth.users.encrypted_password bằng SQL.

  CÁCH DÙNG NHANH:
  1. Chạy mục 00 và sửa đúng MNV/email/chi nhánh/ngày/tháng cần kiểm tra.
  2. Chạy riêng từng mục; không cần bấm Run cho toàn bộ file.
  3. Nếu báo quick_params không tồn tại, chạy lại mục 00.
  4. Nếu báo column/relation does not exist, chạy mục 01 để xem tên thật.

  MỤC LỤC:
  00 tham số       01 schema          02 tài khoản/Auth
  03 đăng nhập     04 chi nhánh/GPS   05 quyền/leader
  06 ca làm        07 lịch làm        08 chấm công
  09 đơn từ        10 chat/thông báo  11 Google Sheet/outbox
  12 bug/system    13 RLS/policy      14 sức khỏe tổng hợp
  15 tra cứu MNV   16 hiệu năng       90 mẫu sửa có ROLLBACK
*/

-- Giới hạn truy vấn treo khi tự kiểm tra trên production.
set statement_timeout = '30s';
set lock_timeout = '5s';

-- ================================================================
-- 00. THAM SO DUNG CHUNG - DOI 1 DONG VALUES BEN DUOI
-- ================================================================
drop table if exists pg_temp.quick_params;
create temporary table quick_params (
  employee_code text,
  email text,
  branch_id text,
  department text,
  work_date date,
  work_month text,
  days_back integer
) on commit preserve rows;

insert into quick_params values (
  'PVC-10187',                 -- MNV (ví dụ: Huỳnh Kim Thy)
  'dr.thyhuynh2409@gmail.com', -- email
  'le-van-tho',                -- le-van-tho | pham-van-chieu
  'bs',                        -- bs | phuta | dvkh | marketing | hcth...
  current_date,                -- hoac date '2026-08-05'
  to_char(current_date, 'YYYY-MM'),
  30                           -- so ngay log/cham cong gan nhat
);

select * from quick_params;

-- ================================================================
-- 01. KIEM TRA SCHEMA TRUOC KHI VIET QUERY
-- Giai quyet loi kieu: column "created_at" does not exist.
-- ================================================================

-- 01A. Tat ca bang va so dong uoc tinh.
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
where schemaname in ('public', 'auth')
order by schemaname, relname;

-- 01B. Liet ke dung ten cot, kieu du lieu, nullable va default cua mot bang.
-- Doi table_name neu can.
select
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'schedule_assignments'
order by ordinal_position;

-- 01C. Tim cot theo tu khoa tren toan bo public schema.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name ilike '%created%'
order by table_name, ordinal_position;

-- 01D. Ham/RPC hien co.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, arguments;

-- 01E. Trigger dang gan vao bang.
select
  event_object_table as table_name,
  trigger_name,
  event_manipulation as event,
  action_timing,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name, event_manipulation;

-- 01F. Index, khoa chinh, unique index.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- ================================================================
-- 02. TAI KHOAN AUTH + PROFILE + NHAN VIEN
-- ================================================================

-- 02A. Ho so day du cua MNV/email dang chon.
select
  e.code as employee_code,
  e.full_name,
  e.email as employee_email,
  e.phone,
  e.department as employee_department,
  e.title,
  e.manager_code,
  e.shift_code as default_shift,
  e.status as employee_status,
  e.branch_id as employee_branch,
  p.id as auth_user_id,
  p.role,
  p.active as profile_active,
  p.department as profile_department,
  p.branch_id as profile_branch,
  u.email as auth_email,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.banned_until,
  u.deleted_at
from public.employees e
left join public.profiles p on p.employee_code = e.code
left join auth.users u on u.id = p.id
cross join quick_params q
where e.code = q.employee_code
   or lower(coalesce(e.email, '')) = lower(q.email)
   or lower(coalesce(u.email, '')) = lower(q.email);

-- 02B. Tim nhanh bang MNV, ten, email hoac SDT.
-- Doi '%le kha thy%' thanh tu khoa can tim.
select code, full_name, email, phone, department, title, status, branch_id
from public.employees
where concat_ws(' ', code, full_name, email, phone) ilike '%le kha thy%'
order by full_name;

-- 02C. Tat ca tai khoan dang hoat dong theo chi nhanh/role/bo phan.
select
  coalesce(p.branch_id, e.branch_id, '(chua gan)') as branch_id,
  p.role,
  coalesce(p.department, e.department, '(chua gan)') as department,
  count(*) as total
from public.profiles p
left join public.employees e on e.code = p.employee_code
where p.active = true
group by 1, 2, 3
order by 1, 2, 3;

-- 02D. Nhan vien active nhung thieu profile/auth user.
select
  e.code, e.full_name, e.email, e.phone, e.department, e.title, e.branch_id,
  case when p.id is null then 'THIEU PROFILE' else 'CO PROFILE' end as profile_check,
  case when u.id is null then 'THIEU AUTH USER' else 'CO AUTH USER' end as auth_check
from public.employees e
left join public.profiles p on p.employee_code = e.code
left join auth.users u on u.id = p.id
where e.status = 'active'
  and (p.id is null or u.id is null)
order by e.branch_id, e.department, e.full_name;

-- 02E. Profile khong co employee tuong ung.
select p.*
from public.profiles p
left join public.employees e on e.code = p.employee_code
where p.employee_code is not null and e.code is null
order by p.created_at desc;

-- 02F. Email/SDT trung lap trong danh sach nhan vien.
select 'email' as duplicate_type, lower(trim(email)) as value,
       count(*) as total, string_agg(code || ' - ' || full_name, '; ' order by code) as employees
from public.employees
where nullif(trim(email), '') is not null
group by lower(trim(email)) having count(*) > 1
union all
select 'phone', regexp_replace(phone, '[^0-9]', '', 'g'),
       count(*), string_agg(code || ' - ' || full_name, '; ' order by code)
from public.employees
where nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '') is not null
group by regexp_replace(phone, '[^0-9]', '', 'g') having count(*) > 1
order by duplicate_type, value;

-- 02G. Email giua employees/profile auth khong khop.
select e.code, e.full_name, e.email as employee_email, u.email as auth_email,
       e.branch_id, p.branch_id as profile_branch
from public.employees e
join public.profiles p on p.employee_code = e.code
join auth.users u on u.id = p.id
where nullif(lower(trim(e.email)), '') is distinct from nullif(lower(trim(u.email)), '')
order by e.branch_id, e.full_name;

-- LUU Y: mat khau goc khong the doc lai. Supabase chi luu hash.
-- Neu quen mat khau: reset bang Supabase Auth UI hoac Admin API.

-- ================================================================
-- 03. DANG NHAP BANG EMAIL HOAC MNV
-- ================================================================

-- 03A. Kiem tra RPC resolve_login_email co ton tai hay khong.
select to_regprocedure('public.resolve_login_email(text,text)') as login_rpc;

-- 03B. Chay neu 03A tra ve ten ham.
select public.resolve_login_email(q.branch_id, q.employee_code) as resolved_login_email
from quick_params q;

-- 03C. Phat hien MNV/profile trung hoặc chi nhanh khong khop.
select
  e.code, e.full_name,
  e.branch_id as employee_branch,
  p.branch_id as profile_branch,
  p.active,
  u.email as auth_login
from public.employees e
left join public.profiles p on p.employee_code = e.code
left join auth.users u on u.id = p.id
where e.branch_id is distinct from p.branch_id
   or p.active is distinct from true
   or u.id is null
order by e.code;

-- ================================================================
-- 04. CHI NHANH, GPS VA PHAN BO NHAN SU
-- ================================================================

select * from public.clinic_locations order by id;

select branch_id, department, title, count(*) as total
from public.employees
where status = 'active'
group by branch_id, department, title
order by branch_id, department, title;

-- Nhan vien chua gan/gan sai chi nhanh giua employee va profile.
select e.code, e.full_name, e.branch_id as employee_branch,
       p.branch_id as profile_branch, e.department, p.department as profile_department
from public.employees e
left join public.profiles p on p.employee_code = e.code
where e.branch_id is null
   or p.branch_id is null
   or e.branch_id is distinct from p.branch_id
   or e.department is distinct from p.department
order by e.full_name;

-- ================================================================
-- 05. PHAN QUYEN ADMIN / HR / LEADER / STAFF
-- ================================================================

-- 05A. Danh sach quan ly va pham vi.
select
  p.employee_code, p.full_name, p.role, p.active,
  p.branch_id as profile_branch, p.department as profile_department,
  e.title, e.email, e.phone,
  ls.branch_id as scope_branch, ls.department as scope_department
from public.profiles p
left join public.employees e on e.code = p.employee_code
left join public.leader_scopes ls on ls.leader_code = p.employee_code
where p.role in ('admin', 'hr', 'leader')
order by p.role, p.full_name, ls.branch_id, ls.department;

-- 05B. Leader active nhung khong co leader_scopes.
select p.employee_code, p.full_name, p.branch_id, p.department
from public.profiles p
left join public.leader_scopes ls on ls.leader_code = p.employee_code
where p.role = 'leader' and p.active = true and ls.leader_code is null;

-- 05C. manager_code khong ton tai.
select e.code, e.full_name, e.department, e.branch_id, e.manager_code
from public.employees e
left join public.employees m on m.code = e.manager_code
where nullif(e.manager_code, '') is not null and m.code is null
order by e.branch_id, e.department, e.full_name;

-- 05D. Nhan vien va quan ly cung scope hay khong.
select
  e.code, e.full_name, e.branch_id, e.department, e.manager_code,
  case when ls.leader_code is null then 'SAI/THIEU SCOPE' else 'DUNG SCOPE' end as scope_check
from public.employees e
left join public.leader_scopes ls
  on ls.leader_code = e.manager_code
 and ls.branch_id = e.branch_id
 and ls.department = e.department
where e.status = 'active'
order by scope_check desc, e.branch_id, e.department, e.full_name;

-- 05E. Kiểm tra riêng Huỳnh Kim Thy.
-- Kỳ vọng nghiệp vụ: department = bs, role = leader và có scope bộ phận bs.
select
  e.code,
  e.full_name,
  e.email,
  e.phone,
  e.title,
  e.department as employee_department,
  e.branch_id as employee_branch,
  p.role,
  p.active,
  p.department as profile_department,
  p.branch_id as profile_branch,
  u.email as auth_email,
  string_agg(distinct concat(ls.branch_id, '/', ls.department), ', ')
    filter (where ls.leader_code is not null) as leader_scopes,
  case
    when e.department = 'bs'
     and p.department = 'bs'
     and p.role = 'leader'
     and p.active = true
     and exists (
       select 1 from public.leader_scopes x
       where x.leader_code = e.code and x.department = 'bs'
     )
    then 'ĐÚNG CẤU HÌNH'
    else 'SAI/THIẾU CẤU HÌNH'
  end as configuration_check
from public.employees e
left join public.profiles p on p.employee_code = e.code
left join auth.users u on u.id = p.id
left join public.leader_scopes ls on ls.leader_code = e.code
where e.full_name ilike '%Huỳnh Kim Thy%'
   or lower(coalesce(e.email, '')) = 'dr.thyhuynh2409@gmail.com'
group by e.code, e.full_name, e.email, e.phone, e.title, e.department,
         e.branch_id, p.role, p.active, p.department, p.branch_id, u.email;

-- 05F. Kiểm tra mọi trưởng bộ phận đã quản lý đủ cả hai chi nhánh chưa.
-- Kết quả đúng: branch_scope_count = 2 và missing_branches = NULL.
with expected_branches(branch_id) as (
  values ('le-van-tho'), ('pham-van-chieu')
), leaders as (
  select
    p.employee_code,
    p.full_name,
    coalesce(nullif(p.department, ''), nullif(e.department, '')) as department
  from public.profiles p
  left join public.employees e on e.code = p.employee_code
  where p.role = 'leader' and p.active = true
)
select
  l.employee_code,
  l.full_name,
  l.department,
  count(distinct ls.branch_id) filter (
    where ls.branch_id in ('le-van-tho', 'pham-van-chieu')
      and ls.department = l.department
  ) as branch_scope_count,
  string_agg(distinct ls.branch_id, ', ' order by ls.branch_id)
    filter (where ls.department = l.department) as current_branches,
  string_agg(distinct eb.branch_id, ', ' order by eb.branch_id)
    filter (where not exists (
      select 1 from public.leader_scopes x
      where x.leader_code = l.employee_code
        and x.department = l.department
        and x.branch_id = eb.branch_id
    )) as missing_branches
from leaders l
cross join expected_branches eb
left join public.leader_scopes ls on ls.leader_code = l.employee_code
group by l.employee_code, l.full_name, l.department
order by l.department, l.full_name;

-- 05G. Danh sách nhân sự mà từng leader phải nhìn thấy trên toàn công ty.
select
  p.employee_code as leader_code,
  p.full_name as leader_name,
  ls.department,
  e.branch_id,
  count(distinct e.code) as employee_count,
  string_agg(distinct e.code || ' - ' || e.full_name, '; ' order by e.code || ' - ' || e.full_name) as employees
from public.profiles p
join public.leader_scopes ls on ls.leader_code = p.employee_code
join public.employees e
  on e.department = ls.department
 and e.branch_id = ls.branch_id
 and e.status = 'active'
where p.role = 'leader' and p.active = true
group by p.employee_code, p.full_name, ls.department, e.branch_id
order by p.full_name, ls.department, e.branch_id;

-- ================================================================
-- 06. CA LAM VIEC 8H / 10H / FULL VA CA DUOC PHEP
-- ================================================================

-- 06A. Tat ca ca, gio thuc te sau khi tru nghi.
select
  ws.code,
  ws.department_group,
  ws.name,
  ws.start_time,
  ws.end_time,
  ws.break_minutes,
  round((extract(epoch from (ws.end_time - ws.start_time)) / 3600.0)::numeric, 2) as gross_hours,
  round(((extract(epoch from (ws.end_time - ws.start_time)) / 60.0 - ws.break_minutes) / 60.0)::numeric, 2) as paid_hours,
  ws.checkin_advance_minutes,
  ws.sunday_only,
  ws.active
from public.work_shifts ws
order by ws.department_group, ws.start_time, ws.end_time;

-- 06B. Phan loai ca theo 8h / 10h / khac.
select
  case
    when round(((extract(epoch from (end_time - start_time)) / 60.0 - break_minutes) / 60.0)::numeric, 2) = 8 then 'Ca 8 giờ'
    when round(((extract(epoch from (end_time - start_time)) / 60.0 - break_minutes) / 60.0)::numeric, 2) = 10 then 'Ca 10 giờ'
    else 'Ca khác'
  end as shift_type,
  code, name, department_group, start_time, end_time, break_minutes
from public.work_shifts
where active = true
order by shift_type, department_group, start_time;

-- 06C. Tat ca ca duoc phep cua MNV dang chon.
select e.code, e.full_name, e.department, e.title, e.shift_code as default_shift,
       ws.code, ws.name, ws.start_time, ws.end_time, ws.break_minutes
from public.employees e
cross join quick_params q
left join public.employee_allowed_shifts eas on eas.employee_code = e.code
left join public.work_shifts ws on ws.code = eas.shift_code
where e.code = q.employee_code
order by ws.start_time;

-- 06D. Nhan vien active thieu ca duoc phep.
select e.code, e.full_name, e.department, e.title, e.shift_code, e.branch_id
from public.employees e
left join public.employee_allowed_shifts eas on eas.employee_code = e.code
where e.status = 'active'
group by e.code, e.full_name, e.department, e.title, e.shift_code, e.branch_id
having count(eas.shift_code) = 0
order by e.branch_id, e.department, e.full_name;

-- 06E. Ca mac dinh khong nam trong danh sach ca duoc phep.
select e.code, e.full_name, e.department, e.shift_code, e.branch_id
from public.employees e
where e.status = 'active'
  and not exists (
    select 1 from public.employee_allowed_shifts eas
    where eas.employee_code = e.code and eas.shift_code = e.shift_code
  )
order by e.branch_id, e.department, e.full_name;

-- 06F. Bac si phai giu du cac ca (khong tu dong xoa ca 8h/10h).
select
  e.code, e.full_name, e.branch_id,
  count(eas.shift_code) filter (where eas.shift_code in
    ('doctor-office','doctor-morning','doctor-afternoon','doctor-full')) as doctor_shift_count,
  string_agg(eas.shift_code, ', ' order by eas.shift_code) as allowed_shifts
from public.employees e
left join public.employee_allowed_shifts eas on eas.employee_code = e.code
where e.status = 'active' and e.department = 'bs'
group by e.code, e.full_name, e.branch_id
having count(eas.shift_code) filter (where eas.shift_code in
  ('doctor-office','doctor-morning','doctor-afternoon','doctor-full')) < 4
order by e.branch_id, e.full_name;

-- ================================================================
-- 07. LICH LAM THANG VA LUONG DUYET
-- ================================================================

-- 07A. Lich chi tiet cua thang/chi nhanh dang chon.
select
  sa.work_date,
  e.code, e.full_name, e.department, e.title, e.branch_id,
  sa.shift_code, ws.name as shift_name, ws.start_time, ws.end_time,
  sa.status, sa.owner_code, sa.swap_with_code,
  sa.overtime_minutes, sa.early_arrival_minutes, sa.early_leave_minutes, sa.note
from public.schedule_assignments sa
join public.employees e on e.code = sa.employee_code
left join public.work_shifts ws on ws.code = sa.shift_code
cross join quick_params q
where to_char(sa.work_date, 'YYYY-MM') = q.work_month
  and e.branch_id = q.branch_id
order by sa.work_date, e.department, e.full_name;

-- 07B. Tong so ngay/gio lich theo nhan vien.
select
  e.code, e.full_name, e.department, e.title, e.branch_id,
  count(sa.work_date) as scheduled_days,
  round(sum((extract(epoch from (ws.end_time - ws.start_time))/60 - ws.break_minutes)/60.0)::numeric, 2) as scheduled_hours
from public.schedule_assignments sa
join public.employees e on e.code = sa.employee_code
left join public.work_shifts ws on ws.code = sa.shift_code
cross join quick_params q
where to_char(sa.work_date, 'YYYY-MM') = q.work_month
  and e.branch_id = q.branch_id
group by e.code, e.full_name, e.department, e.title, e.branch_id
order by e.department, e.full_name;

-- 07C. Don dang ky lich va payload luong duyet.
select sr.id, sr.work_month, sr.employee_code, e.full_name, e.department,
       e.branch_id, sr.status, sr.reviewer_code, sr.submitted_at, sr.preference
from public.schedule_requests sr
join public.employees e on e.code = sr.employee_code
cross join quick_params q
where sr.work_month = q.work_month
  and e.branch_id = q.branch_id
order by sr.submitted_at desc;

-- 07D. Nhan vien active chua co lich trong thang.
select e.code, e.full_name, e.department, e.title, e.branch_id
from public.employees e
cross join quick_params q
where e.status = 'active' and e.branch_id = q.branch_id
  and not exists (
    select 1 from public.schedule_assignments sa
    where sa.employee_code = e.code and to_char(sa.work_date, 'YYYY-MM') = q.work_month
  )
order by e.department, e.full_name;

-- 07E. Trung lich cung nhan vien/cung ngay (ket qua phai rong).
select employee_code, work_date, count(*) as duplicate_count,
       string_agg(coalesce(shift_code, '(null)'), ', ') as shifts
from public.schedule_assignments
group by employee_code, work_date
having count(*) > 1
order by work_date desc, employee_code;

-- 07F. Lich dung ca ma nhan vien khong duoc phep.
select sa.work_date, sa.employee_code, e.full_name, sa.shift_code, e.department, e.branch_id
from public.schedule_assignments sa
join public.employees e on e.code = sa.employee_code
left join public.employee_allowed_shifts eas
  on eas.employee_code = sa.employee_code and eas.shift_code = sa.shift_code
where eas.employee_code is null
order by sa.work_date desc, e.full_name;

-- 07G. Vì sao leader chưa thể xác nhận lịch?
-- ready_for_leader = YES khi lịch có ít nhất một ca và đang ở bước leader được phép xử lý.
with latest_request as (
  select distinct on (sr.employee_code)
    sr.employee_code,
    sr.status,
    sr.preference,
    sr.submitted_at
  from public.schedule_requests sr
  cross join quick_params q
  where sr.work_month = q.work_month
  order by sr.employee_code, sr.submitted_at desc
), schedule_count as (
  select sa.employee_code, count(*) as assigned_days
  from public.schedule_assignments sa
  cross join quick_params q
  where to_char(sa.work_date, 'YYYY-MM') = q.work_month
  group by sa.employee_code
)
select
  e.code,
  e.full_name,
  e.department,
  e.branch_id,
  coalesce(sc.assigned_days, 0) as assigned_days,
  coalesce(substring(lr.preference from '"stage"\s*:\s*"([^"]+)"'), 'draft') as workflow_stage,
  case
    when coalesce(sc.assigned_days, 0) = 0 then 'NO - lịch chưa có ca'
    when coalesce(substring(lr.preference from '"stage"\s*:\s*"([^"]+)"'), 'draft')
         not in ('draft', 'returned', 'leader_review') then 'NO - sai bước duyệt'
    else 'YES'
  end as ready_for_leader
from public.employees e
left join latest_request lr on lr.employee_code = e.code
left join schedule_count sc on sc.employee_code = e.code
cross join quick_params q
where e.status = 'active'
  and e.department = q.department
order by ready_for_leader, e.branch_id, e.full_name;

-- 07H. Tổng hợp trạng thái lịch theo bộ phận và hai chi nhánh.
with latest_request as (
  select distinct on (sr.employee_code)
    sr.employee_code,
    coalesce(substring(sr.preference from '"stage"\s*:\s*"([^"]+)"'), 'draft') as stage
  from public.schedule_requests sr
  cross join quick_params q
  where sr.work_month = q.work_month
  order by sr.employee_code, sr.submitted_at desc
)
select
  e.department,
  e.branch_id,
  coalesce(lr.stage, 'draft') as stage,
  count(*) as employee_count
from public.employees e
left join latest_request lr on lr.employee_code = e.code
where e.status = 'active'
group by e.department, e.branch_id, coalesce(lr.stage, 'draft')
order by e.department, e.branch_id, stage;

-- ================================================================
-- 08. CHAM CONG - GIO VAO/RA, GPS, CA, BAT THUONG
-- ================================================================

-- 08A. Ban ghi cham cong cua ngay/chi nhanh dang chon.
select
  ar.work_date, ar.recorded_at at time zone 'Asia/Ho_Chi_Minh' as local_time,
  ar.employee_code, e.full_name, e.department, e.title, e.branch_id,
  ar.record_type, ar.shift_code, ws.name as shift_name,
  ar.status, ar.distance_m, ar.accuracy_m, ar.captured_offline,
  ar.synced_at, ar.device_id, ar.note
from public.attendance_records ar
join public.employees e on e.code = ar.employee_code
left join public.work_shifts ws on ws.code = ar.shift_code
cross join quick_params q
where ar.work_date = q.work_date and e.branch_id = q.branch_id
order by ar.recorded_at, e.full_name;

-- 08B. Ghép check-in/check-out thanh mot dong, tinh gio lam.
with paired as (
  select
    ar.work_date, ar.employee_code, ar.shift_code,
    min(ar.recorded_at) filter (where ar.record_type = 'checkin') as checkin_at,
    max(ar.recorded_at) filter (where ar.record_type = 'checkout') as checkout_at,
    count(*) filter (where ar.record_type = 'checkin') as checkin_count,
    count(*) filter (where ar.record_type = 'checkout') as checkout_count
  from public.attendance_records ar
  cross join quick_params q
  where ar.work_date between q.work_date - q.days_back and q.work_date
  group by ar.work_date, ar.employee_code, ar.shift_code
)
select
  p.work_date, p.employee_code, e.full_name, e.branch_id, e.department,
  p.shift_code, ws.name as shift_name,
  p.checkin_at at time zone 'Asia/Ho_Chi_Minh' as checkin_local,
  p.checkout_at at time zone 'Asia/Ho_Chi_Minh' as checkout_local,
  case when p.checkin_at is not null and p.checkout_at is not null
       then round((extract(epoch from (p.checkout_at-p.checkin_at))/3600.0)::numeric, 2)
  end as actual_hours,
  p.checkin_count, p.checkout_count
from paired p
join public.employees e on e.code = p.employee_code
left join public.work_shifts ws on ws.code = p.shift_code
order by p.work_date desc, e.full_name;

-- 08C. Bat thuong: thieu vao/ra, nhieu lan, ra truoc vao.
with paired as (
  select work_date, employee_code, shift_code,
    min(recorded_at) filter (where record_type='checkin') as checkin_at,
    max(recorded_at) filter (where record_type='checkout') as checkout_at,
    count(*) filter (where record_type='checkin') as checkin_count,
    count(*) filter (where record_type='checkout') as checkout_count
  from public.attendance_records
  cross join quick_params q
  where work_date between q.work_date - q.days_back and q.work_date
  group by work_date, employee_code, shift_code
)
select p.*, e.full_name, e.branch_id,
  concat_ws('; ',
    case when checkin_count=0 then 'Thiếu check-in' end,
    case when checkout_count=0 then 'Thiếu check-out' end,
    case when checkin_count>1 then 'Nhiều check-in' end,
    case when checkout_count>1 then 'Nhiều check-out' end,
    case when checkout_at < checkin_at then 'Check-out trước check-in' end
  ) as problem
from paired p
join public.employees e on e.code=p.employee_code
where checkin_count<>1 or checkout_count<>1 or checkout_at < checkin_at
order by p.work_date desc, e.full_name;

-- 08D. Ngoai ban kinh / GPS kem / offline / trang thai bat thuong.
select ar.*, e.full_name, e.branch_id, e.department
from public.attendance_records ar
join public.employees e on e.code = ar.employee_code
cross join quick_params q
where ar.work_date between q.work_date - q.days_back and q.work_date
  and (ar.status not in ('valid', 'Đã ghi nhận')
       or coalesce(ar.captured_offline, false) = true
       or coalesce(ar.distance_m, 0) > coalesce((
            select cl.allowed_radius_m from public.clinic_locations cl
            where cl.id=e.branch_id limit 1), 100)
       or coalesce(ar.accuracy_m, 0) > coalesce((
            select cl.max_gps_accuracy_m from public.clinic_locations cl
            where cl.id=e.branch_id limit 1), 50))
order by ar.recorded_at desc;

-- 08E. Cham cong bang ca khong nam trong allowed shifts.
select ar.work_date, ar.employee_code, e.full_name, e.department, e.branch_id,
       ar.shift_code, ar.record_type, ar.recorded_at
from public.attendance_records ar
join public.employees e on e.code=ar.employee_code
left join public.employee_allowed_shifts eas
  on eas.employee_code=ar.employee_code and eas.shift_code=ar.shift_code
where ar.shift_code is not null and eas.employee_code is null
order by ar.work_date desc, e.full_name;

-- 08F. Thong ke trang thai cham cong.
select e.branch_id, ar.status, ar.record_type, count(*) as total
from public.attendance_records ar
join public.employees e on e.code=ar.employee_code
cross join quick_params q
where ar.work_date between q.work_date - q.days_back and q.work_date
group by e.branch_id, ar.status, ar.record_type
order by e.branch_id, ar.status, ar.record_type;

-- ================================================================
-- 09. DON TU VA LUONG DUYET
-- ================================================================

-- 09A. Tat ca don dang cho xu ly.
select
  lr.id, lr.created_at, lr.employee_code, e.full_name, e.department, e.branch_id,
  lr.request_type, lr.from_date, lr.to_date,
  lr.request_start_time, lr.request_end_time, lr.overtime_minutes,
  lr.amount, lr.bank_account, lr.reason,
  lr.status, lr.leader_status, lr.operations_status,
  lr.reviewer_code, lr.routed_to,
  lr.leader_reviewed_at, lr.operations_reviewed_at, lr.rejection_reason
from public.leave_requests lr
join public.employees e on e.code=lr.employee_code
where lr.status='pending'
   or lr.leader_status='pending'
   or lr.operations_status='pending'
order by lr.created_at desc;

-- 09B. Rieng don tang ca va ung luong.
select lr.*, e.full_name, e.department, e.branch_id
from public.leave_requests lr
join public.employees e on e.code=lr.employee_code
where lr.request_type in ('overtime', 'salary_advance', 'tang_ca', 'ung_luong')
order by lr.created_at desc;

-- 09C. Don da duyet cap cuoi nhung status tong chua approved.
select lr.*, e.full_name, e.branch_id
from public.leave_requests lr
join public.employees e on e.code=lr.employee_code
where lr.operations_status='approved' and lr.status <> 'approved'
order by lr.updated_at desc;

-- ================================================================
-- 10. TIN NHAN, THONG BAO VA REALTIME DATA
-- ================================================================

-- 10A. Tin nhan moi nhat. channel la khoa hoi thoai/kenh.
select m.id, m.channel, m.author_code, e.full_name as author_name,
       e.department, e.branch_id, m.body, m.created_at
from public.messages m
left join public.employees e on e.code=m.author_code
order by m.created_at desc
limit 200;

-- 10B. Kenh co tin moi nhat se nam tren dau.
select channel, max(created_at) as last_message_at, count(*) as message_count
from public.messages
group by channel
order by last_message_at desc;

-- 10C. Thong bao chua doc cua tung tai khoan.
select p.employee_code, p.full_name, p.role, p.branch_id,
       count(n.id) filter (where n.read=false) as unread,
       max(n.created_at) as latest_notification
from public.profiles p
left join public.notifications n on n.user_id=p.id
group by p.employee_code, p.full_name, p.role, p.branch_id
having count(n.id) filter (where n.read=false) > 0
order by unread desc, latest_notification desc;

-- 10D. Thong bao moi nhat cua MNV dang chon.
select n.*
from public.notifications n
join public.profiles p on p.id=n.user_id
cross join quick_params q
where p.employee_code=q.employee_code
order by n.created_at desc
limit 100;

-- ================================================================
-- 11. DONG BO GOOGLE SHEET / OUTBOX
-- ================================================================

select status, entity_type, count(*) as total,
       min(created_at) as oldest, max(created_at) as newest,
       max(attempts) as max_attempts
from public.integration_outbox
group by status, entity_type
order by status, entity_type;

select id, entity_type, entity_id, status, attempts, last_error, created_at, sent_at
from public.integration_outbox
where status in ('pending','failed')
order by created_at
limit 500;

-- Check-in vua tao co duoc day vao outbox ngay hay khong.
select ar.id, ar.employee_code, ar.record_type, ar.recorded_at,
       io.id as outbox_id, io.status as sync_status, io.attempts, io.last_error, io.sent_at
from public.attendance_records ar
left join public.integration_outbox io
  on io.entity_type='attendance' and io.entity_id=ar.id::text
cross join quick_params q
where ar.work_date=q.work_date
order by ar.recorded_at desc;

-- Ban ghi attendance/leave thieu outbox.
select 'attendance' as entity_type, ar.id::text as entity_id, ar.recorded_at as event_at
from public.attendance_records ar
cross join quick_params q
where ar.work_date between q.work_date-q.days_back and q.work_date
  and not exists (select 1 from public.integration_outbox io
                  where io.entity_type='attendance' and io.entity_id=ar.id::text)
union all
select 'leave_request', lr.id::text, lr.created_at
from public.leave_requests lr
cross join quick_params q
where lr.created_at >= q.work_date-q.days_back
  and not exists (select 1 from public.integration_outbox io
                  where io.entity_type='leave_request' and io.entity_id=lr.id::text)
order by event_at desc;

-- ================================================================
-- 12. BUG LOG / SYSTEM ERROR / ANNOUNCEMENT
-- Chay 12A truoc de xem cot that tren production.
-- ================================================================

-- 12A. Schema ba bang system.
select table_name, ordinal_position, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('system_bug_logs','system_error_logs','system_announcements')
order by table_name, ordinal_position;

-- 12B. Cac lenh an toan, khong phu thuoc ten cot ngoai id.
select * from public.system_bug_logs limit 200;
select * from public.system_error_logs limit 200;
select * from public.system_announcements limit 100;

-- Neu bang system_* khong ton tai, SQL Editor se bao relation does not exist.
-- Khi do dung ket qua 12A de xac nhan migration production con thieu.

-- Audit thao tac admin/ky thuat.
select al.*, p.employee_code, p.full_name, p.role
from public.audit_logs al
left join public.profiles p on p.id=al.actor
order by al.created_at desc
limit 300;

-- ================================================================
-- 13. RLS, POLICY VA QUYEN API
-- ================================================================

-- 13A. Bang public nao chua bat RLS.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
order by c.relrowsecurity, c.relname;

-- 13B. Tat ca policy.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
order by tablename, policyname;

-- 13C. Bang co RLS nhung khong co policy.
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
where n.nspname='public' and c.relkind='r' and c.relrowsecurity=true
group by c.relname
having count(p.policyname)=0
order by c.relname;

-- 13D. Quyen table cua anon/authenticated/service_role.
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee in ('anon','authenticated','service_role')
order by table_name, grantee, privilege_type;

-- ================================================================
-- 14. BAO CAO SUC KHOE DU LIEU MOT LAN
-- So > 0 la dau muc can mo truy van chi tiet tuong ung.
-- ================================================================
select 'Nhan vien active thieu profile/auth' as check_name, count(*) as issue_count
from public.employees e
left join public.profiles p on p.employee_code=e.code
left join auth.users u on u.id=p.id
where e.status='active' and (p.id is null or u.id is null)
union all
select 'Sai chi nhanh employee/profile', count(*)
from public.employees e join public.profiles p on p.employee_code=e.code
where e.branch_id is distinct from p.branch_id
union all
select 'Sai bo phan employee/profile', count(*)
from public.employees e join public.profiles p on p.employee_code=e.code
where e.department is distinct from p.department
union all
select 'Leader thieu scope', count(*)
from public.profiles p
left join public.leader_scopes ls on ls.leader_code=p.employee_code
where p.role='leader' and p.active=true and ls.leader_code is null
union all
select 'Nhan vien active thieu allowed shift', count(*)
from public.employees e
where e.status='active' and not exists (
  select 1 from public.employee_allowed_shifts eas where eas.employee_code=e.code)
union all
select 'Lich trung nhan vien/ngay', count(*)
from (select 1 from public.schedule_assignments
      group by employee_code, work_date having count(*)>1) x
union all
select 'Cham cong thieu outbox', count(*)
from public.attendance_records ar
where not exists (select 1 from public.integration_outbox io
                  where io.entity_type='attendance' and io.entity_id=ar.id::text)
union all
select 'Outbox pending/failed', count(*)
from public.integration_outbox where status in ('pending','failed')
order by issue_count desc, check_name;

-- ================================================================
-- 15. TIM KIEM TOAN CUC 1 MNV
-- Tra ve nhieu result set lien tiep, tien cho support UI.
-- ================================================================
select e.*, p.id as user_id, p.role, p.active, p.branch_id as profile_branch,
       u.email as auth_email, u.last_sign_in_at
from public.employees e
left join public.profiles p on p.employee_code=e.code
left join auth.users u on u.id=p.id
cross join quick_params q where e.code=q.employee_code;

select * from public.employee_allowed_shifts eas
cross join quick_params q where eas.employee_code=q.employee_code;

select sa.* from public.schedule_assignments sa
cross join quick_params q
where sa.employee_code=q.employee_code and to_char(sa.work_date,'YYYY-MM')=q.work_month
order by sa.work_date;

select ar.* from public.attendance_records ar
cross join quick_params q
where ar.employee_code=q.employee_code
order by ar.recorded_at desc limit 200;

select lr.* from public.leave_requests lr
cross join quick_params q
where lr.employee_code=q.employee_code
order by lr.created_at desc limit 100;

-- ================================================================
-- 16. HIEU NANG QUERY VA KET NOI
-- ================================================================

select now() as database_time,
       current_setting('TimeZone') as database_timezone,
       current_database(), current_user, version();

select pid, usename, application_name, client_addr, state,
       now()-query_start as running_for,
       left(query, 200) as query
from pg_stat_activity
where datname=current_database() and pid<>pg_backend_pid()
order by query_start;

-- Dung EXPLAIN ANALYZE cho mot query cham; no se CHAY query do.
-- Chi dung voi SELECT, khong dung voi UPDATE/DELETE.
explain (analyze, buffers, format text)
select * from public.attendance_records
where employee_code=(select employee_code from quick_params limit 1)
order by recorded_at desc limit 100;

-- ================================================================
-- 90. MAU SUA DU LIEU CO KIEM SOAT - KHONG CHAY NEU CHI KIEM TRA
-- Mac dinh ROLLBACK. Chi doi thanh COMMIT sau khi SELECT AFTER dung.
-- ================================================================

/*
-- 90A. Sua chi nhanh/bo phan/role cua mot MNV.
begin;

select e.code, e.full_name, e.branch_id, e.department,
       p.role, p.active, p.branch_id, p.department
from public.employees e
left join public.profiles p on p.employee_code=e.code
where e.code='PVC006';

update public.employees
set branch_id='le-van-tho', department='dvkh', updated_at=now()
where code='PVC006';

update public.profiles
set branch_id='le-van-tho', department='dvkh', role='staff', active=true, updated_at=now()
where employee_code='PVC006';

select e.code, e.full_name, e.branch_id, e.department,
       p.role, p.active, p.branch_id, p.department
from public.employees e
join public.profiles p on p.employee_code=e.code
where e.code='PVC006';

rollback; -- doi thanh commit; chi khi da doi chieu ket qua
*/

/*
-- 90B. Gan them ca duoc phep, KHONG xoa cac ca cu.
begin;
insert into public.employee_allowed_shifts(employee_code, shift_code)
values
  ('PVC001','doctor-office'),
  ('PVC001','doctor-morning'),
  ('PVC001','doctor-afternoon'),
  ('PVC001','doctor-full')
on conflict do nothing;

select * from public.employee_allowed_shifts where employee_code='PVC001';
rollback;
*/

/*
-- 90C. Gan scope cho truong bo phan o ca hai chi nhanh.
begin;
insert into public.leader_scopes(leader_code, branch_id, department)
values
  ('PVC003','le-van-tho','phuta'),
  ('PVC003','pham-van-chieu','phuta')
on conflict do nothing;

select * from public.leader_scopes where leader_code='PVC003';
rollback;
*/

/*
-- 90C2. Bổ sung tự động hai chi nhánh cho TẤT CẢ leader đang hoạt động.
-- Không xóa scope cũ. Chạy SELECT kiểm tra rồi mới đổi ROLLBACK thành COMMIT.
begin;

insert into public.leader_scopes (leader_code, branch_id, department)
select
  p.employee_code,
  b.branch_id,
  coalesce(nullif(p.department, ''), nullif(e.department, ''))
from public.profiles p
left join public.employees e on e.code = p.employee_code
cross join (values ('le-van-tho'), ('pham-van-chieu')) b(branch_id)
where p.role = 'leader'
  and p.active = true
  and p.employee_code is not null
  and coalesce(nullif(p.department, ''), nullif(e.department, '')) is not null
on conflict (leader_code, branch_id, department) do nothing;

select p.employee_code, p.full_name, p.department,
       count(ls.branch_id) as branch_scope_count,
       string_agg(ls.branch_id, ', ' order by ls.branch_id) as branches
from public.profiles p
left join public.leader_scopes ls
  on ls.leader_code = p.employee_code and ls.department = p.department
where p.role = 'leader' and p.active = true
group by p.employee_code, p.full_name, p.department
order by p.full_name;

rollback; -- đổi thành COMMIT chỉ khi mọi leader đều có đủ 2 chi nhánh
*/

/*
-- 90D. Danh dau outbox failed thanh pending de worker thu lai.
-- Chi dung sau khi da sua nguyen nhan va doc last_error.
begin;
update public.integration_outbox
set status='pending', last_error=null
where status='failed' and attempts < 5;

select * from public.integration_outbox
where status in ('pending','failed') order by created_at;
rollback;
*/

/*
-- 90E. Kiem tra truoc khi xoa/sua luon dung mau:
begin;
select * from public.<ten_bang> where <dieu_kien_chinh_xac>;
-- update public.<ten_bang> set ... where <dieu_kien_chinh_xac>;
select * from public.<ten_bang> where <dieu_kien_chinh_xac>;
rollback;
*/

-- HET BO LENH.
