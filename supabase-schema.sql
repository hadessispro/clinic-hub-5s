-- 5S Clinic Hub Supabase setup
-- Run in the dedicated Supabase database for the Pham Van Chieu branch.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'clinic_role') then
    create type public.clinic_role as enum ('admin', 'hr', 'leader', 'finance', 'staff');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_code text unique,
  full_name text not null,
  department text,
  role public.clinic_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  full_name text not null,
  department text not null,
  title text not null,
  manager_code text,
  phone text,
  email text,
  shift_code text not null default 'clinic-0800',
  status text not null default 'onboarding',
  hire_date date,
  insurance_date date,
  salary_offer numeric(14, 0) default 0,
  hourly_rate numeric(14, 0) default 0,
  profile_locked boolean not null default false,
  certificates text[] not null default '{}',
  confidential_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null default gen_random_uuid(),
  employee_code text not null references public.employees(code) on delete cascade,
  shift_code text,
  record_type text not null check (record_type in ('checkin', 'checkout')),
  work_date date not null default current_date,
  recorded_at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  distance_m integer,
  accuracy_m integer,
  status text not null default 'valid',
  created_by uuid references auth.users(id) on delete set null,
  device_id text,
  captured_offline boolean not null default false,
  synced_at timestamptz not null default now(),
  proof_url text,
  note text
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  assignee_code text references public.employees(code) on delete set null,
  creator uuid references auth.users(id) on delete set null,
  status text not null default 'todo',
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  priority text not null default 'medium',
  due_date date,
  attachment_url text,
  file_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references public.employees(code) on delete cascade,
  request_type text not null,
  from_date date not null,
  to_date date not null,
  amount numeric(14, 0) default 0,
  bank_account text,
  reason text not null,
  status text not null default 'pending',
  leader_status text not null default 'pending',
  operations_status text not null default 'pending',
  reviewer_code text,
  routed_to text not null default 'ns',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_type text not null,
  title text not null,
  department text,
  requester_code text references public.employees(code) on delete set null,
  amount numeric(14, 0) default 0,
  attachment_url text,
  file_name text,
  status text not null default 'pending',
  leader_status text not null default 'pending',
  finance_status text not null default 'pending',
  account_route text not null default 'main_account',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  unit text not null default 'cai',
  stock numeric(14, 2) not null default 0,
  min_stock numeric(14, 2) not null default 0,
  location text,
  supplier text,
  lot_no text,
  expiry_date date,
  last_import date,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  category text,
  quantity numeric(14, 2) not null default 1,
  unit text,
  requester_code text references public.employees(code) on delete set null,
  department text,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  department text,
  location text,
  custodian_code text references public.employees(code) on delete set null,
  condition text not null default 'good',
  checked_at date,
  attachment_url text,
  file_name text,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_audits (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  owner_code text references public.employees(code) on delete set null,
  due_date date,
  attachment_url text,
  file_name text,
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.uniform_logs (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references public.employees(code) on delete cascade,
  issued_year integer not null,
  item text not null,
  quantity integer not null default 1,
  size text,
  issued_at date not null default current_date,
  issuer_code text references public.employees(code) on delete set null,
  status text not null default 'issued',
  note text
);

create table if not exists public.onboarding_docs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  attachment_url text,
  file_name text,
  owner_code text references public.employees(code) on delete set null,
  required boolean not null default true,
  security_locked boolean not null default false,
  updated_at date not null default current_date
);

create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references public.employees(code) on delete cascade,
  doc_id uuid not null references public.onboarding_docs(id) on delete cascade,
  status text not null default 'todo',
  completed_at date,
  signed_at timestamptz,
  unique(employee_code, doc_id)
);

create table if not exists public.recruitment (
  id uuid primary key default gen_random_uuid(),
  candidate text not null,
  target_role text not null,
  department text,
  responsible_code text references public.employees(code) on delete set null,
  stage text not null default 'screening',
  interview_at timestamptz,
  auto_schedule boolean not null default true,
  salary_expected numeric(14, 0) default 0,
  offer_amount numeric(14, 0) default 0,
  insurance_date date,
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references public.employees(code) on delete cascade,
  work_month text not null,
  submitted_at timestamptz not null default now(),
  preference text,
  status text not null default 'pending',
  reviewer_code text
);

create table if not exists public.schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references public.employees(code) on delete cascade,
  work_date date not null,
  shift_code text,
  owner_code text references public.employees(code) on delete set null,
  swap_with_code text references public.employees(code) on delete set null,
  status text not null default 'planned',
  overtime_minutes integer not null default 0,
  early_arrival_minutes integer not null default 0,
  early_leave_minutes integer not null default 0,
  proof_url text,
  note text
);

create table if not exists public.payroll_feedback (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null references public.employees(code) on delete cascade,
  work_month text not null,
  text text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  employee_code text references public.employees(code) on delete set null,
  reporter_code text references public.employees(code) on delete set null,
  issue_date date not null default current_date,
  category text,
  title text not null,
  proof_url text,
  file_name text,
  status text not null default 'open',
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  author_code text references public.employees(code) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  type text not null default 'general',
  link_view text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

create table if not exists public.performance_metrics (
  id uuid primary key default gen_random_uuid(),
  work_month text not null,
  department text not null,
  revenue numeric(14, 0) default 0,
  target numeric(14, 0) default 0,
  leads integer default 0,
  appointments integer default 0,
  score integer default 0,
  note text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.clinic_state_snapshots (
  id text primary key default 'main',
  payload jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_locations (
  id text primary key,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  allowed_radius_m integer not null default 100 check (allowed_radius_m between 20 and 300),
  max_gps_accuracy_m integer not null default 50 check (max_gps_accuracy_m between 10 and 100),
  checkin_time time not null default '08:00',
  checkin_grace_minutes integer not null default 0 check (checkin_grace_minutes between 0 and 60),
  time_zone text not null default 'Asia/Ho_Chi_Minh',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Keep reruns safe when upgrading an existing branch database.
alter table public.employees add column if not exists email text;
alter table public.employees add column if not exists shift_code text not null default 'clinic-0800';
alter table public.attendance_records add column if not exists client_event_id uuid;
alter table public.attendance_records add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.attendance_records add column if not exists device_id text;
alter table public.attendance_records add column if not exists captured_offline boolean not null default false;
alter table public.attendance_records add column if not exists synced_at timestamptz not null default now();
update public.attendance_records set client_event_id = gen_random_uuid() where client_event_id is null;
alter table public.attendance_records alter column client_event_id set default gen_random_uuid();
alter table public.attendance_records alter column client_event_id set not null;
create unique index if not exists employees_email_uidx on public.employees(lower(email)) where email is not null;
create unique index if not exists attendance_client_event_uidx on public.attendance_records(client_event_id);
create unique index if not exists attendance_one_checkin_per_day_uidx
  on public.attendance_records(employee_code, work_date, record_type)
  where record_type = 'checkin';
create unique index if not exists attendance_one_checkout_per_day_uidx
  on public.attendance_records(employee_code, work_date, record_type)
  where record_type = 'checkout';

create or replace function public.current_clinic_role()
returns public.clinic_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.clinic_role;
begin
  select role into r from public.profiles where id = auth.uid() and active = true;
  return r;
end;
$$;

create or replace function public.current_employee_code()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  code text;
begin
  select employee_code into code from public.profiles where id = auth.uid() and active = true;
  return code;
end;
$$;

create or replace function public.is_ops_role()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_role boolean;
begin
  select coalesce(public.current_clinic_role() in ('admin', 'hr', 'leader', 'finance'), false) into has_role;
  return has_role;
end;
$$;

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
  v_latitude double precision := 10.8381574;
  v_longitude double precision := 106.6579553;
  v_radius_m integer := 100;
  v_max_accuracy_m integer := 50;
  v_checkin_time time := '08:00';
  v_grace_minutes integer := 0;
  v_distance_m integer;
  v_status text;
  v_existing public.attendance_records%rowtype;
  v_created public.attendance_records%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập trước khi chấm công.' using errcode = '28000';
  end if;

  select employee_code into v_employee_code
  from public.profiles
  where id = auth.uid() and active = true;

  if v_employee_code is null then
    raise exception 'Tài khoản chưa được liên kết với nhân viên.' using errcode = '42501';
  end if;

  select coalesce(shift_code, 'clinic-0800') into v_shift_code
  from public.employees
  where code = v_employee_code and status = 'active';

  if v_shift_code is null then
    raise exception 'Nhân viên chưa hoạt động hoặc chưa được gán ca.' using errcode = '42501';
  end if;

  select
    latitude,
    longitude,
    allowed_radius_m,
    max_gps_accuracy_m,
    checkin_time,
    checkin_grace_minutes
  into v_latitude, v_longitude, v_radius_m, v_max_accuracy_m, v_checkin_time, v_grace_minutes
  from public.clinic_locations
  where id = 'pham-van-chieu' and active = true;

  v_latitude := coalesce(v_latitude, 10.8381574);
  v_longitude := coalesce(v_longitude, 106.6579553);
  v_checkin_time := coalesce(v_checkin_time, '08:00'::time);
  v_radius_m := greatest(20, least(300, coalesce(v_radius_m, 100)));
  v_max_accuracy_m := greatest(10, least(100, coalesce(v_max_accuracy_m, 50)));
  v_grace_minutes := greatest(0, least(60, coalesce(v_grace_minutes, 0)));

  if p_client_event_id is null or p_recorded_at is null then
    raise exception 'Thiếu mã sự kiện hoặc thời gian chấm công.' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Tọa độ GPS không hợp lệ.' using errcode = '22023';
  end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > v_max_accuracy_m then
    raise exception 'Sai số GPS % m vượt mức cho phép % m.', p_accuracy_m, v_max_accuracy_m using errcode = '22023';
  end if;
  if p_recorded_at > now() + interval '5 minutes' or p_recorded_at < now() - interval '7 days' then
    raise exception 'Thời gian chấm công không hợp lệ.' using errcode = '22023';
  end if;

  -- Online check-ins use database time. Client time is preserved only for a
  -- queued offline event and remains marked for later audit.
  v_effective_at := case when p_offline then p_recorded_at else now() end;

  v_distance_m := round(
    6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_latitude) / 2), 2)
      + cos(radians(v_latitude)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - v_longitude) / 2), 2)
    ))
  );

  if v_distance_m > v_radius_m then
    raise exception 'Bạn đang cách phòng khám % m; bán kính cho phép là % m.', v_distance_m, v_radius_m using errcode = '22023';
  end if;

  v_work_date := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_local_time := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::time;
  v_status := case
    when v_local_time > v_checkin_time + make_interval(mins => v_grace_minutes) then 'late'
    else 'valid'
  end;

  perform pg_advisory_xact_lock(hashtext(v_employee_code || ':' || v_work_date::text)::bigint);

  select * into v_existing
  from public.attendance_records
  where client_event_id = p_client_event_id
     or (employee_code = v_employee_code and work_date = v_work_date and record_type = 'checkin')
  order by recorded_at
  limit 1;

  if found then
    return next v_existing;
    return;
  end if;

  insert into public.attendance_records (
    client_event_id, employee_code, shift_code, record_type, work_date,
    recorded_at, lat, lng, distance_m, accuracy_m, status, created_by,
    device_id, captured_offline, synced_at
  ) values (
    p_client_event_id, v_employee_code, v_shift_code, 'checkin', v_work_date,
    v_effective_at, p_lat, p_lng, v_distance_m, p_accuracy_m, v_status, auth.uid(),
    left(nullif(p_device_id, ''), 120), p_offline, now()
  )
  returning * into v_created;

  return next v_created;
end;
$$;

revoke all on function public.record_attendance_checkin(uuid, timestamptz, double precision, double precision, integer, text, boolean) from public;
grant execute on function public.record_attendance_checkin(uuid, timestamptz, double precision, double precision, integer, text, boolean) to authenticated;

drop function if exists public.record_attendance_checkout(uuid, timestamptz, text, boolean);

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
  v_latitude double precision := 10.8381574;
  v_longitude double precision := 106.6579553;
  v_radius_m integer := 100;
  v_max_accuracy_m integer := 50;
  v_distance_m integer;
  v_checkin public.attendance_records%rowtype;
  v_existing public.attendance_records%rowtype;
  v_created public.attendance_records%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập trước khi kết ca.' using errcode = '28000';
  end if;

  select employee_code into v_employee_code
  from public.profiles
  where id = auth.uid() and active = true;

  if v_employee_code is null then
    raise exception 'Tài khoản chưa được liên kết với nhân viên.' using errcode = '42501';
  end if;

  select coalesce(shift_code, 'clinic-0800') into v_shift_code
  from public.employees
  where code = v_employee_code and status = 'active';

  if v_shift_code is null then
    raise exception 'Nhân viên chưa hoạt động hoặc chưa được gán ca.' using errcode = '42501';
  end if;

  select latitude, longitude, allowed_radius_m, max_gps_accuracy_m
  into v_latitude, v_longitude, v_radius_m, v_max_accuracy_m
  from public.clinic_locations
  where id = 'pham-van-chieu' and active = true;

  v_latitude := coalesce(v_latitude, 10.8381574);
  v_longitude := coalesce(v_longitude, 106.6579553);
  v_radius_m := greatest(20, least(300, coalesce(v_radius_m, 100)));
  v_max_accuracy_m := greatest(10, least(100, coalesce(v_max_accuracy_m, 50)));

  if p_client_event_id is null or p_recorded_at is null then
    raise exception 'Thiếu mã sự kiện hoặc thời gian kết ca.' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Tọa độ GPS check-out không hợp lệ.' using errcode = '22023';
  end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > v_max_accuracy_m then
    raise exception 'Sai số GPS check-out % m vượt mức cho phép % m.', p_accuracy_m, v_max_accuracy_m using errcode = '22023';
  end if;
  if p_recorded_at > now() + interval '5 minutes' or p_recorded_at < now() - interval '7 days' then
    raise exception 'Thời gian kết ca không hợp lệ.' using errcode = '22023';
  end if;

  v_effective_at := case when p_offline then p_recorded_at else now() end;
  v_work_date := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::date;

  v_distance_m := round(
    6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_latitude) / 2), 2)
      + cos(radians(v_latitude)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - v_longitude) / 2), 2)
    ))
  );

  if v_distance_m > v_radius_m then
    raise exception 'Bạn đang cách phòng khám % m; bán kính check-out cho phép là % m.', v_distance_m, v_radius_m using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_employee_code || ':' || v_work_date::text)::bigint);

  select * into v_existing
  from public.attendance_records
  where client_event_id = p_client_event_id
  limit 1;

  if found then
    if v_existing.employee_code <> v_employee_code or v_existing.record_type <> 'checkout' then
      raise exception 'Mã sự kiện đã được dùng cho một bản ghi khác.' using errcode = '23505';
    end if;
    return next v_existing;
    return;
  end if;

  select * into v_checkin
  from public.attendance_records
  where employee_code = v_employee_code
    and work_date = v_work_date
    and record_type = 'checkin'
  order by recorded_at
  limit 1;

  if not found then
    raise exception 'Bạn cần check-in trước khi kết ca.' using errcode = '22023';
  end if;
  if v_effective_at < v_checkin.recorded_at then
    raise exception 'Giờ kết ca không thể trước giờ check-in.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.attendance_records
  where employee_code = v_employee_code
    and work_date = v_work_date
    and record_type = 'checkout'
  order by recorded_at
  limit 1;

  if found then
    return next v_existing;
    return;
  end if;

  insert into public.attendance_records (
    client_event_id, employee_code, shift_code, record_type, work_date,
    recorded_at, lat, lng, distance_m, accuracy_m, status, created_by,
    device_id, captured_offline, synced_at
  ) values (
    p_client_event_id, v_employee_code, v_shift_code, 'checkout', v_work_date,
    v_effective_at, p_lat, p_lng, v_distance_m, p_accuracy_m, 'valid', auth.uid(),
    left(nullif(p_device_id, ''), 120), p_offline, now()
  )
  returning * into v_created;

  return next v_created;
end;
$$;

revoke all on function public.record_attendance_checkout(uuid, timestamptz, double precision, double precision, integer, text, boolean) from public;
grant execute on function public.record_attendance_checkout(uuid, timestamptz, double precision, double precision, integer, text, boolean) to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

drop trigger if exists touch_employees_updated_at on public.employees;
create trigger touch_employees_updated_at before update on public.employees for each row execute function public.touch_updated_at();

drop trigger if exists touch_tasks_updated_at on public.tasks;
create trigger touch_tasks_updated_at before update on public.tasks for each row execute function public.touch_updated_at();

drop trigger if exists touch_leave_updated_at on public.leave_requests;
create trigger touch_leave_updated_at before update on public.leave_requests for each row execute function public.touch_updated_at();

drop trigger if exists touch_proposals_updated_at on public.proposals;
create trigger touch_proposals_updated_at before update on public.proposals for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.tasks enable row level security;
alter table public.leave_requests enable row level security;
alter table public.proposals enable row level security;
alter table public.inventory_items enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.assets enable row level security;
alter table public.asset_audits enable row level security;
alter table public.uniform_logs enable row level security;
alter table public.onboarding_docs enable row level security;
alter table public.onboarding_progress enable row level security;
alter table public.recruitment enable row level security;
alter table public.schedule_requests enable row level security;
alter table public.schedule_assignments enable row level security;
alter table public.payroll_feedback enable row level security;
alter table public.incidents enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.audit_logs enable row level security;
alter table public.clinic_state_snapshots enable row level security;
alter table public.clinic_locations enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_ops_role());

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_ops_write" on public.profiles;
create policy "profiles_ops_write" on public.profiles for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr'))
with check (public.current_clinic_role() in ('admin', 'hr'));

drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees for select to authenticated
using (public.is_ops_role() or code = public.current_employee_code());

drop policy if exists "employees_ops_write" on public.employees;
create policy "employees_ops_write" on public.employees for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr'))
with check (public.current_clinic_role() in ('admin', 'hr'));

drop policy if exists "attendance_select" on public.attendance_records;
create policy "attendance_select" on public.attendance_records for select to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code());

drop policy if exists "attendance_self_insert" on public.attendance_records;
create policy "attendance_self_insert" on public.attendance_records for insert to authenticated
with check (public.is_ops_role());

drop policy if exists "attendance_ops_update" on public.attendance_records;
create policy "attendance_ops_update" on public.attendance_records for update to authenticated
using (public.is_ops_role()) with check (public.is_ops_role());

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks for select to authenticated
using (public.is_ops_role() or assignee_code = public.current_employee_code());

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks for insert to authenticated
with check (public.is_ops_role() or assignee_code = public.current_employee_code());

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks for update to authenticated
using (public.is_ops_role() or assignee_code = public.current_employee_code())
with check (public.is_ops_role() or assignee_code = public.current_employee_code());

drop policy if exists "leave_select" on public.leave_requests;
create policy "leave_select" on public.leave_requests for select to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code());

drop policy if exists "leave_insert" on public.leave_requests;
create policy "leave_insert" on public.leave_requests for insert to authenticated
with check (public.is_ops_role() or employee_code = public.current_employee_code());

drop policy if exists "leave_ops_update" on public.leave_requests;
create policy "leave_ops_update" on public.leave_requests for update to authenticated
using (public.is_ops_role()) with check (public.is_ops_role());

drop policy if exists "proposals_select" on public.proposals;
create policy "proposals_select" on public.proposals for select to authenticated
using (public.is_ops_role() or requester_code = public.current_employee_code());

drop policy if exists "proposals_insert" on public.proposals;
create policy "proposals_insert" on public.proposals for insert to authenticated
with check (public.is_ops_role() or requester_code = public.current_employee_code());

drop policy if exists "proposals_ops_update" on public.proposals;
create policy "proposals_ops_update" on public.proposals for update to authenticated
using (public.is_ops_role()) with check (public.is_ops_role());

drop policy if exists "ops_select_all_inventory" on public.inventory_items;
create policy "ops_select_all_inventory" on public.inventory_items for select to authenticated using (true);
drop policy if exists "ops_write_inventory" on public.inventory_items;
create policy "ops_write_inventory" on public.inventory_items for all to authenticated using (public.is_ops_role()) with check (public.is_ops_role());

drop policy if exists "purchase_select" on public.purchase_requests;
create policy "purchase_select" on public.purchase_requests for select to authenticated
using (public.is_ops_role() or requester_code = public.current_employee_code());
drop policy if exists "purchase_insert" on public.purchase_requests;
create policy "purchase_insert" on public.purchase_requests for insert to authenticated
with check (public.is_ops_role() or requester_code = public.current_employee_code());
drop policy if exists "purchase_update" on public.purchase_requests;
create policy "purchase_update" on public.purchase_requests for update to authenticated
using (public.is_ops_role()) with check (public.is_ops_role());

drop policy if exists "assets_select" on public.assets;
create policy "assets_select" on public.assets for select to authenticated using (true);
drop policy if exists "assets_ops_write" on public.assets;
create policy "assets_ops_write" on public.assets for all to authenticated using (public.is_ops_role()) with check (public.is_ops_role());

drop policy if exists "asset_audits_select" on public.asset_audits;
create policy "asset_audits_select" on public.asset_audits for select to authenticated
using (public.is_ops_role() or owner_code = public.current_employee_code());
drop policy if exists "asset_audits_write" on public.asset_audits;
create policy "asset_audits_write" on public.asset_audits for all to authenticated
using (public.is_ops_role() or owner_code = public.current_employee_code())
with check (public.is_ops_role() or owner_code = public.current_employee_code());

drop policy if exists "uniform_select" on public.uniform_logs;
create policy "uniform_select" on public.uniform_logs for select to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code());
drop policy if exists "uniform_write" on public.uniform_logs;
create policy "uniform_write" on public.uniform_logs for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr')) with check (public.current_clinic_role() in ('admin', 'hr'));

drop policy if exists "onboarding_docs_select" on public.onboarding_docs;
create policy "onboarding_docs_select" on public.onboarding_docs for select to authenticated using (true);
drop policy if exists "onboarding_docs_write" on public.onboarding_docs;
create policy "onboarding_docs_write" on public.onboarding_docs for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr', 'leader')) with check (public.current_clinic_role() in ('admin', 'hr', 'leader'));

drop policy if exists "onboarding_progress_select" on public.onboarding_progress;
create policy "onboarding_progress_select" on public.onboarding_progress for select to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code());
drop policy if exists "onboarding_progress_write" on public.onboarding_progress;
create policy "onboarding_progress_write" on public.onboarding_progress for all to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code())
with check (public.is_ops_role() or employee_code = public.current_employee_code());

drop policy if exists "recruitment_ops" on public.recruitment;
create policy "recruitment_ops" on public.recruitment for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr', 'leader'))
with check (public.current_clinic_role() in ('admin', 'hr', 'leader'));

drop policy if exists "schedule_requests_select" on public.schedule_requests;
create policy "schedule_requests_select" on public.schedule_requests for select to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code());
drop policy if exists "schedule_requests_write" on public.schedule_requests;
create policy "schedule_requests_write" on public.schedule_requests for all to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code())
with check (public.is_ops_role() or employee_code = public.current_employee_code());

drop policy if exists "schedule_assignments_select" on public.schedule_assignments;
create policy "schedule_assignments_select" on public.schedule_assignments for select to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code() or swap_with_code = public.current_employee_code());
drop policy if exists "schedule_assignments_write" on public.schedule_assignments;
create policy "schedule_assignments_write" on public.schedule_assignments for all to authenticated
using (public.is_ops_role()) with check (public.is_ops_role());

drop policy if exists "payroll_feedback_select" on public.payroll_feedback;
create policy "payroll_feedback_select" on public.payroll_feedback for select to authenticated
using (public.current_clinic_role() in ('admin', 'hr', 'finance') or employee_code = public.current_employee_code());
drop policy if exists "payroll_feedback_write" on public.payroll_feedback;
create policy "payroll_feedback_write" on public.payroll_feedback for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr', 'finance') or employee_code = public.current_employee_code())
with check (public.current_clinic_role() in ('admin', 'hr', 'finance') or employee_code = public.current_employee_code());

drop policy if exists "incidents_select" on public.incidents;
create policy "incidents_select" on public.incidents for select to authenticated
using (public.is_ops_role() or employee_code = public.current_employee_code() or reporter_code = public.current_employee_code());
drop policy if exists "incidents_write" on public.incidents;
create policy "incidents_write" on public.incidents for all to authenticated
using (public.is_ops_role() or reporter_code = public.current_employee_code())
with check (public.is_ops_role() or reporter_code = public.current_employee_code());

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to authenticated using (true);
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to authenticated
with check (public.is_ops_role() or author_code = public.current_employee_code());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated
using (user_id = auth.uid());
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notifications_insert_authenticated" on public.notifications;
create policy "notifications_insert_authenticated" on public.notifications for insert to authenticated
with check (true);

drop policy if exists "performance_select" on public.performance_metrics;
create policy "performance_select" on public.performance_metrics for select to authenticated using (public.is_ops_role());
drop policy if exists "performance_write" on public.performance_metrics;
create policy "performance_write" on public.performance_metrics for all to authenticated
using (public.current_clinic_role() in ('admin', 'finance', 'leader')) with check (public.current_clinic_role() in ('admin', 'finance', 'leader'));

drop policy if exists "audit_select" on public.audit_logs;
create policy "audit_select" on public.audit_logs for select to authenticated using (public.current_clinic_role() in ('admin', 'hr', 'finance'));
drop policy if exists "audit_insert" on public.audit_logs;
create policy "audit_insert" on public.audit_logs for insert to authenticated with check (actor = auth.uid());

drop policy if exists "state_snapshot_select" on public.clinic_state_snapshots;
create policy "state_snapshot_select" on public.clinic_state_snapshots for select to authenticated using (public.is_ops_role());
drop policy if exists "state_snapshot_write" on public.clinic_state_snapshots;
create policy "state_snapshot_write" on public.clinic_state_snapshots for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr')) with check (public.current_clinic_role() in ('admin', 'hr'));

drop policy if exists "clinic_locations_select" on public.clinic_locations;
create policy "clinic_locations_select" on public.clinic_locations for select to authenticated using (active = true);
drop policy if exists "clinic_locations_manage" on public.clinic_locations;
create policy "clinic_locations_manage" on public.clinic_locations for all to authenticated
using (public.current_clinic_role() in ('admin', 'hr'))
with check (public.current_clinic_role() in ('admin', 'hr'));

insert into storage.buckets (id, name, public)
values ('clinic-files', 'clinic-files', false)
on conflict (id) do nothing;

drop policy if exists "clinic_files_read_own_or_ops" on storage.objects;
create policy "clinic_files_read_own_or_ops" on storage.objects for select to authenticated
using (
  bucket_id = 'clinic-files'
  and (
    public.is_ops_role()
    or owner_id = (select auth.uid()::text)
    or (storage.foldername(name))[1] = public.current_employee_code()
  )
);

drop policy if exists "clinic_files_upload_auth" on storage.objects;
create policy "clinic_files_upload_auth" on storage.objects for insert to authenticated
with check (
  bucket_id = 'clinic-files'
  and (
    public.is_ops_role()
    or owner_id = (select auth.uid()::text)
    or (storage.foldername(name))[1] = public.current_employee_code()
  )
);

drop policy if exists "clinic_files_update_own_or_ops" on storage.objects;
create policy "clinic_files_update_own_or_ops" on storage.objects for update to authenticated
using (bucket_id = 'clinic-files' and (public.is_ops_role() or owner_id = (select auth.uid()::text)))
with check (bucket_id = 'clinic-files' and (public.is_ops_role() or owner_id = (select auth.uid()::text)));

insert into public.clinic_state_snapshots (id, payload)
values (
  'main',
  jsonb_build_object('settings', jsonb_build_object(
    'branchId', 'pham-van-chieu',
    'clinicName', 'Nha Khoa 5S - Lê Văn Thọ',
    'clinicAddress', '60 Lê Văn Thọ, Phường Thông Tây Hội, TP.HCM',
    'latitude', 10.8381574,
    'longitude', 106.6579553,
    'allowedRadius', 100,
    'maxGpsAccuracy', 50,
    'checkinTime', '08:00',
    'checkinGraceMinutes', 0,
    'timeZone', 'Asia/Ho_Chi_Minh'
  ))
)
on conflict (id) do nothing;

insert into public.clinic_locations (
  id, name, address, latitude, longitude, allowed_radius_m,
  max_gps_accuracy_m, checkin_time, checkin_grace_minutes, time_zone, active
) values (
  'pham-van-chieu',
  'Nha Khoa 5S - Lê Văn Thọ',
  '60 Lê Văn Thọ, Phường Thông Tây Hội, TP.HCM',
  10.8381574,
  106.6579553,
  100,
  50,
  '08:00',
  0,
  'Asia/Ho_Chi_Minh',
  true
)
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  allowed_radius_m = excluded.allowed_radius_m,
  max_gps_accuracy_m = excluded.max_gps_accuracy_m,
  checkin_time = excluded.checkin_time,
  checkin_grace_minutes = excluded.checkin_grace_minutes,
  time_zone = excluded.time_zone,
  active = excluded.active,
  updated_at = now();

insert into public.employees (code, full_name, department, title, phone, email, status, shift_code)
values
  ('PVC001', 'Trần Văn Nguyên', 'bs', 'Bác sĩ Fulltime', '0837983650', 'vannguyen10a3@gmail.com', 'active', 'clinic-0800'),
  ('PVC002', 'Nguyễn Tuấn Ngọc', 'bs', 'Bác sĩ Fulltime', '0984048715', 'tn01638827382@gmail.com', 'active', 'clinic-0800'),
  ('PVC003', 'Nguyễn Thị Như Huỳnh', 'phuta', 'Phụ tá', '0911548525', 'nguyenthinhuhuynh2909@gmail.com', 'active', 'clinic-0800'),
  ('PVC004', 'Võ Thị Hậu', 'dvkh', 'Lễ tân - Tư vấn', '0987805971', 'hauvothi3@gmail.com', 'active', 'clinic-0800'),
  ('PVC005', 'Nguyễn Thị Thanh Trúc', 'dvkh', 'Lễ tân - Tư vấn', '0979291901', 'trucnguyen12121995@gmail.com', 'active', 'clinic-0800'),
  ('PVC006', 'Lê Kha Thy', 'dvkh', 'Lễ tân - Tư vấn', '0772554048', 'lekhathyc14@gmail.com', 'active', 'clinic-0800'),
  ('PVC007', 'Trần Xuân Nhân', 'phuta', 'Phụ tá', '0368370076', 'tranxuannhan1705@gmail.com', 'active', 'clinic-0800'),
  ('PVC008', 'Lâm Hưng Long', 'bs', 'Bác sĩ Fulltime', '0939133669', 'thienthay123@gmail.com', 'active', 'clinic-0800'),
  ('PVC009', 'Trần Hoàng My', 'bs', 'Bác sĩ Part-time', '0971345046', 'mytranvt3@gmail.com', 'active', 'clinic-0800'),
  ('PVC010', 'Nguyễn Thị Thu Hà', 'phuta', 'Phụ tá', '0901223693', 'ha.nguyenthu0203@gmail.com', 'active', 'clinic-0800'),
  ('PVC011', 'Nguyễn Kim Quỳnh Quyên', 'phuta', 'Phụ tá', '0369973426', 'quynhquyenkg2018@gmail.com', 'active', 'clinic-0800'),
  ('PVC012', 'Võ Đăng Khang', 'phuta', 'Phụ tá', '0392095618', 'khangnlcltv@gmail.com', 'active', 'clinic-0800'),
  ('PVC013', 'Trần Mỹ Phụng', 'phuta', 'Phụ tá', '0388742734', 'myphung190605@gmail.com', 'active', 'clinic-0800')
on conflict (code) do update set
  full_name = excluded.full_name,
  department = excluded.department,
  title = excluded.title,
  phone = excluded.phone,
  email = excluded.email,
  status = excluded.status,
  shift_code = excluded.shift_code,
  updated_at = now();

insert into public.inventory_items (name, category, unit, stock, min_stock, location, supplier, notes)
values
  ('Beotem', 'Trụ implant', 'trụ', 18, 10, 'Tủ implant A', 'Kho tổng', 'Theo dõi lot khi xuất cho bác sĩ.'),
  ('ETK', 'Trụ implant', 'trụ', 7, 8, 'Tủ implant A', 'Kho tổng', 'Dưới định mức, cần đề xuất mua.'),
  ('Dentium', 'Trụ implant', 'trụ', 12, 8, 'Tủ implant B', 'Kho tổng', 'Ưu tiên lịch implant cuối tuần.'),
  ('Mắc cài kim loại', 'Niềng', 'bộ', 24, 12, 'Kho chỉnh nha', 'Nhà cung ứng chỉnh nha', 'Dùng cho gói niềng tiêu chuẩn.'),
  ('Dây cung NiTi', 'Niềng', 'gói', 9, 15, 'Kho chỉnh nha', 'Nhà cung ứng chỉnh nha', 'Cần nhập bổ sung size phổ biến.')
on conflict do nothing;

insert into public.onboarding_docs (title, category, attachment_url, file_name, owner_code, required, security_locked)
values
  ('Nội quy phòng khám', 'Nội quy', 'https://docs.google.com/document', 'noi-quy-nha-khoa-5s.pdf', 'PVC001', true, true),
  ('Hướng dẫn chấm công GPS', 'Chấm công', '', 'huong-dan-cham-cong.pdf', 'PVC001', true, false),
  ('Chính sách nghỉ phép và tăng ca', 'Chính sách', 'https://docs.google.com/document', '', 'PVC001', true, false),
  ('Quy trình phòng ban và bàn giao công việc', 'Quy trình', '', 'quy-trinh-phong-ban.docx', 'PVC001', true, true),
  ('Giấy phép hành nghề và hồ sơ thực tập', 'Hồ sơ', '', 'mau-ho-so-thuc-tap.pdf', 'PVC001', true, true)
on conflict do nothing;

-- After creating Auth users, map each user to a profile, for example:
-- insert into public.profiles (id, employee_code, full_name, department, role)
-- values ('AUTH_USER_UUID_HERE', 'e-001', 'Minh Hạnh', 'ns', 'admin');

-- Enable PostgreSQL Realtime without failing when this script is run again.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  end if;
end
$$;
