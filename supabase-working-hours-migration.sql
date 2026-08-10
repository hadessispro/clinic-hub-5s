-- Align working hours with "THỜI GIAN LÀM VIỆC NHA KHOA 5S - HCM".
-- Safe to run repeatedly in the Supabase SQL Editor.

begin;

create table if not exists public.work_shifts (
  code text primary key,
  department_group text not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  checkin_advance_minutes integer not null default 5 check (checkin_advance_minutes between 0 and 60),
  sunday_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.work_shifts
  (code, department_group, name, start_time, end_time, break_minutes, checkin_advance_minutes, sunday_only)
values
  ('clinic-0800',     'other',          'Ca 08:00',       '08:00', '17:00', 0,  5, false),
  ('front-office',    'front_assistant','Ca hành chính',  '07:30', '17:00', 60, 5, false),
  ('front-full',      'front_assistant','Ca full',        '07:30', '20:00', 60, 5, false),
  ('front-afternoon', 'front_assistant','Ca chiều',       '09:30', '20:00', 60, 5, false),
  ('front-morning',   'front_assistant','Ca sáng',        '07:30', '18:00', 60, 5, false),
  ('doctor-office',   'doctor',         'Ca hành chính',  '08:00', '17:00', 60, 5, false),
  ('doctor-morning',  'doctor',         'Ca sáng',        '08:00', '18:00', 60, 5, false),
  ('doctor-afternoon','doctor',         'Ca chiều',       '10:00', '20:00', 60, 5, false),
  ('doctor-full',     'doctor',         'Ca full',        '08:00', '20:00', 60, 5, false),
  ('security-weekday','security',       'Ngày thường',    '07:00', '20:00', 0,  5, false),
  ('security-sunday', 'security',       'Chủ nhật',       '07:00', '17:00', 0,  5, true),
  ('cleaning-weekday','cleaning',       'Ngày thường',    '06:00', '16:00', 60, 5, false),
  ('cleaning-sunday', 'cleaning',       'Chủ nhật',       '06:00', '15:00', 60, 5, true)
on conflict (code) do update set
  department_group = excluded.department_group,
  name = excluded.name,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  break_minutes = excluded.break_minutes,
  checkin_advance_minutes = excluded.checkin_advance_minutes,
  sunday_only = excluded.sunday_only,
  active = true,
  updated_at = now();

alter table public.work_shifts enable row level security;
drop policy if exists "work_shifts_read" on public.work_shifts;
create policy "work_shifts_read" on public.work_shifts for select to authenticated using (active = true);
drop policy if exists "work_shifts_manage" on public.work_shifts;
create policy "work_shifts_manage" on public.work_shifts for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr'))
with check (public.current_clinic_role() in ('admin', 'hr'));

-- A person can be eligible for several shifts. This is intentionally separate
-- from employees.shift_code (fallback) and schedule_assignments (the shift on a date).
create table if not exists public.employee_allowed_shifts (
  employee_code text not null references public.employees(code) on delete cascade,
  shift_code text not null references public.work_shifts(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (employee_code, shift_code)
);

alter table public.employee_allowed_shifts enable row level security;
drop policy if exists "employee_allowed_shifts_read" on public.employee_allowed_shifts;
create policy "employee_allowed_shifts_read" on public.employee_allowed_shifts for select to authenticated using (true);
drop policy if exists "employee_allowed_shifts_manage" on public.employee_allowed_shifts;
create policy "employee_allowed_shifts_manage" on public.employee_allowed_shifts for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr', 'leader'))
with check (public.current_clinic_role() in ('admin', 'hr', 'leader'));

insert into public.employee_allowed_shifts (employee_code, shift_code)
select e.code, allowed.shift_code
from public.employees e
cross join lateral (
  select unnest(case
    when e.department = 'bs' then array['doctor-office','doctor-morning','doctor-afternoon','doctor-full']
    when e.department in ('dvkh', 'phuta') then array['front-office','front-full','front-afternoon','front-morning']
    when e.department = 'baove' then array['security-weekday','security-sunday']
    when e.department = 'laocong' then array['cleaning-weekday','cleaning-sunday']
    else array['clinic-0800']
  end) as shift_code
) allowed
on conflict do nothing;

-- Use one assignment per employee/day so the server and UI cannot disagree.
create unique index if not exists schedule_assignment_employee_day_uidx
  on public.schedule_assignments(employee_code, work_date);

create or replace function public.default_shift_for_department(p_department text)
returns text
language sql
immutable
as $$
  select case
    when p_department = 'bs' then 'doctor-office'
    when p_department in ('dvkh', 'phuta') then 'front-office'
    when p_department = 'baove' then 'security-weekday'
    when p_department = 'laocong' then 'cleaning-weekday'
    else 'clinic-0800'
  end;
$$;

create or replace function public.resolve_employee_shift(p_employee_code text, p_work_date date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shift text;
  v_department text;
begin
  select shift_code into v_shift
  from public.schedule_assignments
  where employee_code = p_employee_code and work_date = p_work_date
  limit 1;

  if v_shift is null then
    select department, coalesce(shift_code, public.default_shift_for_department(department))
      into v_department, v_shift
    from public.employees
    where code = p_employee_code and status = 'active';
  else
    select department into v_department from public.employees where code = p_employee_code;
  end if;

  if extract(isodow from p_work_date) = 7 and v_shift = 'security-weekday' then
    v_shift := 'security-sunday';
  elsif extract(isodow from p_work_date) = 7 and v_shift = 'cleaning-weekday' then
    v_shift := 'cleaning-sunday';
  end if;

  if not exists (select 1 from public.work_shifts where code = v_shift and active = true) then
    v_shift := public.default_shift_for_department(v_department);
  end if;
  return v_shift;
end;
$$;

-- Correct every current employee default without guessing a variable doctor/front-office shift.
-- The document's administrative shift is used; managers can override a day in schedule_assignments.
update public.employees
set shift_code = public.default_shift_for_department(department), updated_at = now()
where shift_code is null
   or shift_code = 'clinic-0800'
   or not exists (select 1 from public.work_shifts ws where ws.code = employees.shift_code);

create or replace function public.record_attendance_checkin(
  p_client_event_id uuid,
  p_recorded_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer,
  p_device_id text default null,
  p_offline boolean default false
)
returns setof public.attendance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_code text;
  v_shift_code text;
  v_effective_at timestamptz;
  v_work_date date;
  v_local_time time;
  v_shift_start time;
  v_advance_minutes integer;
  v_latitude double precision := 10.8381574;
  v_longitude double precision := 106.6579553;
  v_radius_m integer := 100;
  v_max_accuracy_m integer := 50;
  v_distance_m integer;
  v_status text;
  v_existing public.attendance_records%rowtype;
  v_created public.attendance_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập trước khi chấm công.' using errcode = '28000'; end if;
  select employee_code into v_employee_code from public.profiles where id = auth.uid() and active = true;
  if v_employee_code is null then raise exception 'Tài khoản chưa được liên kết với nhân viên.' using errcode = '42501'; end if;

  select latitude, longitude, allowed_radius_m, max_gps_accuracy_m
    into v_latitude, v_longitude, v_radius_m, v_max_accuracy_m
  from public.clinic_locations where id = 'pham-van-chieu' and active = true;
  v_latitude := coalesce(v_latitude, 10.8381574);
  v_longitude := coalesce(v_longitude, 106.6579553);
  v_radius_m := greatest(20, least(300, coalesce(v_radius_m, 100)));
  v_max_accuracy_m := greatest(10, least(100, coalesce(v_max_accuracy_m, 50)));

  if p_client_event_id is null or p_recorded_at is null then raise exception 'Thiếu mã sự kiện hoặc thời gian chấm công.' using errcode = '22023'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Tọa độ GPS không hợp lệ.' using errcode = '22023'; end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > v_max_accuracy_m then raise exception 'Sai số GPS % m vượt mức cho phép % m.', p_accuracy_m, v_max_accuracy_m using errcode = '22023'; end if;
  if p_recorded_at > now() + interval '5 minutes' or p_recorded_at < now() - interval '7 days' then raise exception 'Thời gian chấm công không hợp lệ.' using errcode = '22023'; end if;

  v_effective_at := case when p_offline then p_recorded_at else now() end;
  v_work_date := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_local_time := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::time;
  v_shift_code := public.resolve_employee_shift(v_employee_code, v_work_date);
  select start_time, checkin_advance_minutes into v_shift_start, v_advance_minutes
    from public.work_shifts where code = v_shift_code and active = true;
  if v_shift_start is null then raise exception 'Ca làm chưa được cấu hình.' using errcode = '42501'; end if;

  v_distance_m := round(6371000 * 2 * asin(sqrt(
    power(sin(radians(p_lat - v_latitude) / 2), 2)
    + cos(radians(v_latitude)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_longitude) / 2), 2)
  )));
  if v_distance_m > v_radius_m then raise exception 'Bạn đang cách phòng khám % m; bán kính cho phép là % m.', v_distance_m, v_radius_m using errcode = '22023'; end if;

  v_status := case when v_local_time > v_shift_start - make_interval(mins => v_advance_minutes) then 'late' else 'valid' end;
  perform pg_advisory_xact_lock(hashtext(v_employee_code || ':' || v_work_date::text)::bigint);
  select * into v_existing from public.attendance_records
    where client_event_id = p_client_event_id or (employee_code = v_employee_code and work_date = v_work_date and record_type = 'checkin')
    order by recorded_at limit 1;
  if found then return next v_existing; return; end if;

  insert into public.attendance_records
    (client_event_id, employee_code, shift_code, record_type, work_date, recorded_at, lat, lng, distance_m, accuracy_m, status, created_by, device_id, captured_offline, synced_at)
  values
    (p_client_event_id, v_employee_code, v_shift_code, 'checkin', v_work_date, v_effective_at, p_lat, p_lng, v_distance_m, p_accuracy_m, v_status, auth.uid(), left(nullif(p_device_id, ''), 120), p_offline, now())
  returning * into v_created;
  return next v_created;
end;
$$;

revoke all on function public.record_attendance_checkin(uuid, timestamptz, double precision, double precision, integer, text, boolean) from public;
grant execute on function public.record_attendance_checkin(uuid, timestamptz, double precision, double precision, integer, text, boolean) to authenticated;

create or replace function public.record_attendance_checkout(
  p_client_event_id uuid,
  p_recorded_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer,
  p_device_id text default null,
  p_offline boolean default false
)
returns setof public.attendance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_code text;
  v_shift_code text;
  v_effective_at timestamptz;
  v_work_date date;
  v_local_time time;
  v_shift_end time;
  v_latitude double precision := 10.8381574;
  v_longitude double precision := 106.6579553;
  v_radius_m integer := 100;
  v_max_accuracy_m integer := 50;
  v_distance_m integer;
  v_status text;
  v_checkin public.attendance_records%rowtype;
  v_existing public.attendance_records%rowtype;
  v_created public.attendance_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập trước khi kết ca.' using errcode = '28000'; end if;
  select employee_code into v_employee_code from public.profiles where id = auth.uid() and active = true;
  if v_employee_code is null then raise exception 'Tài khoản chưa được liên kết với nhân viên.' using errcode = '42501'; end if;

  select latitude, longitude, allowed_radius_m, max_gps_accuracy_m into v_latitude, v_longitude, v_radius_m, v_max_accuracy_m
  from public.clinic_locations where id = 'pham-van-chieu' and active = true;
  v_latitude := coalesce(v_latitude, 10.8381574);
  v_longitude := coalesce(v_longitude, 106.6579553);
  v_radius_m := greatest(20, least(300, coalesce(v_radius_m, 100)));
  v_max_accuracy_m := greatest(10, least(100, coalesce(v_max_accuracy_m, 50)));

  if p_client_event_id is null or p_recorded_at is null then raise exception 'Thiếu mã sự kiện hoặc thời gian kết ca.' using errcode = '22023'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Tọa độ GPS check-out không hợp lệ.' using errcode = '22023'; end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > v_max_accuracy_m then raise exception 'Sai số GPS check-out % m vượt mức cho phép % m.', p_accuracy_m, v_max_accuracy_m using errcode = '22023'; end if;
  if p_recorded_at > now() + interval '5 minutes' or p_recorded_at < now() - interval '7 days' then raise exception 'Thời gian kết ca không hợp lệ.' using errcode = '22023'; end if;

  v_effective_at := case when p_offline then p_recorded_at else now() end;
  v_work_date := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_local_time := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::time;
  v_shift_code := public.resolve_employee_shift(v_employee_code, v_work_date);
  select end_time into v_shift_end from public.work_shifts where code = v_shift_code and active = true;
  if v_shift_end is null then raise exception 'Ca làm chưa được cấu hình.' using errcode = '42501'; end if;

  v_distance_m := round(6371000 * 2 * asin(sqrt(
    power(sin(radians(p_lat - v_latitude) / 2), 2)
    + cos(radians(v_latitude)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_longitude) / 2), 2)
  )));
  if v_distance_m > v_radius_m then raise exception 'Bạn đang cách phòng khám % m; bán kính check-out cho phép là % m.', v_distance_m, v_radius_m using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtext(v_employee_code || ':' || v_work_date::text)::bigint);
  select * into v_existing from public.attendance_records where client_event_id = p_client_event_id limit 1;
  if found then
    if v_existing.employee_code <> v_employee_code or v_existing.record_type <> 'checkout' then raise exception 'Mã sự kiện đã được dùng cho bản ghi khác.' using errcode = '23505'; end if;
    return next v_existing; return;
  end if;
  select * into v_checkin from public.attendance_records where employee_code = v_employee_code and work_date = v_work_date and record_type = 'checkin' order by recorded_at limit 1;
  if not found then raise exception 'Bạn cần check-in trước khi kết ca.' using errcode = '22023'; end if;
  if v_effective_at < v_checkin.recorded_at then raise exception 'Giờ kết ca không thể trước giờ check-in.' using errcode = '22023'; end if;
  select * into v_existing from public.attendance_records where employee_code = v_employee_code and work_date = v_work_date and record_type = 'checkout' order by recorded_at limit 1;
  if found then return next v_existing; return; end if;

  v_status := case when v_local_time < v_shift_end then 'early_leave' else 'valid' end;
  insert into public.attendance_records
    (client_event_id, employee_code, shift_code, record_type, work_date, recorded_at, lat, lng, distance_m, accuracy_m, status, created_by, device_id, captured_offline, synced_at)
  values
    (p_client_event_id, v_employee_code, v_shift_code, 'checkout', v_work_date, v_effective_at, p_lat, p_lng, v_distance_m, p_accuracy_m, v_status, auth.uid(), left(nullif(p_device_id, ''), 120), p_offline, now())
  returning * into v_created;
  return next v_created;
end;
$$;

revoke all on function public.record_attendance_checkout(uuid, timestamptz, double precision, double precision, integer, text, boolean) from public;
grant execute on function public.record_attendance_checkout(uuid, timestamptz, double precision, double precision, integer, text, boolean) to authenticated;

-- Bring historical rows onto the documented shift and recalculate timing status.
update public.attendance_records ar
set shift_code = public.resolve_employee_shift(ar.employee_code, ar.work_date)
where exists (select 1 from public.employees e where e.code = ar.employee_code)
  and (ar.shift_code is null or ar.shift_code = 'clinic-0800');

update public.attendance_records ar
set status = case
  when ar.record_type = 'checkin'
    and (ar.recorded_at at time zone 'Asia/Ho_Chi_Minh')::time > ws.start_time - make_interval(mins => ws.checkin_advance_minutes)
    then 'late'
  when ar.record_type = 'checkout'
    and (ar.recorded_at at time zone 'Asia/Ho_Chi_Minh')::time < ws.end_time
    then 'early_leave'
  else 'valid'
end
from public.work_shifts ws
where ws.code = ar.shift_code;

commit;

-- Verification report: should return no invalid shift codes.
select e.code, e.full_name, e.department, e.title, e.shift_code, ws.start_time, ws.end_time
from public.employees e
left join public.work_shifts ws on ws.code = e.shift_code
order by e.department, e.code;
