-- Hai chi nhánh + định danh đăng nhập MNV. Chạy trong một transaction.
begin;

alter table public.employees add column if not exists branch_id text;
alter table public.employees add column if not exists employee_number text;
alter table public.profiles add column if not exists branch_id text;
alter table public.profiles add column if not exists employee_number text;

update public.employees set branch_id = 'pham-van-chieu' where branch_id is null;
update public.profiles set branch_id = 'pham-van-chieu' where branch_id is null;

alter table public.employees alter column branch_id set default 'pham-van-chieu';
alter table public.employees alter column branch_id set not null;
alter table public.profiles alter column branch_id set default 'pham-van-chieu';
alter table public.profiles alter column branch_id set not null;

alter table public.employees drop constraint if exists employees_branch_id_check;
alter table public.employees add constraint employees_branch_id_check check (branch_id in ('pham-van-chieu', 'le-van-tho'));
alter table public.profiles drop constraint if exists profiles_branch_id_check;
alter table public.profiles add constraint profiles_branch_id_check check (branch_id in ('pham-van-chieu', 'le-van-tho'));

create unique index if not exists employees_branch_employee_number_uidx
  on public.employees(branch_id, employee_number) where employee_number is not null;
create unique index if not exists profiles_branch_employee_number_uidx
  on public.profiles(branch_id, employee_number) where employee_number is not null;

create or replace function public.current_branch_id()
returns text language sql stable security definer set search_path = public
as $$ select branch_id from public.profiles where id = auth.uid() and active = true $$;

create or replace function public.employee_in_current_branch(p_employee_code text)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.employees e where e.code = p_employee_code and e.branch_id = public.current_branch_id()) $$;

drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees for select to authenticated
using (
  code = public.current_employee_code()
  or (public.is_ops_role() and branch_id = public.current_branch_id())
);

drop policy if exists "employees_ops_write" on public.employees;
create policy "employees_ops_write" on public.employees for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr') and branch_id = public.current_branch_id())
with check (public.current_clinic_role() in ('admin', 'hr') and branch_id = public.current_branch_id());

insert into public.clinic_locations (
  id, name, address, latitude, longitude, allowed_radius_m, max_gps_accuracy_m,
  checkin_time, checkin_grace_minutes, time_zone, active
) values (
  'le-van-tho', 'Nha Khoa 5S - Lê Văn Thọ', '60 Lê Văn Thọ, Phường Thông Tây Hội, TP.HCM',
  10.8381574, 106.6579553, 100, 50, '08:00', 0, 'Asia/Ho_Chi_Minh', true
) on conflict (id) do update set name=excluded.name, address=excluded.address,
  latitude=excluded.latitude, longitude=excluded.longitude, active=true, updated_at=now();

update public.clinic_locations set name='Nha Khoa 5S - Phạm Văn Chiêu',
  address='248 Phạm Văn Chiêu, Phường Thông Tây Hội, TP.HCM'
where id='pham-van-chieu';

commit;

select branch_id, count(*) as employees,
       count(employee_number) as has_mnv
from public.employees group by branch_id order by branch_id;
