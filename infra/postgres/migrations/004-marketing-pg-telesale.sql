create schema if not exists marketing;

create table if not exists marketing.leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text,
  appointment_at timestamptz,
  data_class text not null check (data_class in ('raw', 'net')),
  net_level text check (net_level in ('basic', 'advanced')),
  service_type text,
  source text not null default 'PG',
  branch_id text,
  notes text,
  status text not null default 'new' check (status in ('new','contacted','appointment_booked','visited','converted','cancelled')),
  created_by_pg_code text not null,
  assigned_telesale_code text,
  assigned_by_code text,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (data_class = 'raw' or (phone is not null and length(regexp_replace(phone, '\\D', '', 'g')) >= 8 and appointment_at is not null)),
  check ((data_class = 'net' and net_level is not null) or (data_class = 'raw' and net_level is null))
);

create index if not exists marketing_leads_pg_idx on marketing.leads(created_by_pg_code, created_at desc);
create index if not exists marketing_leads_telesale_idx on marketing.leads(assigned_telesale_code, status, created_at desc);
create index if not exists marketing_leads_class_idx on marketing.leads(data_class, net_level, assigned_telesale_code);

create table if not exists marketing.call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references marketing.leads(id) on delete cascade,
  telesale_code text not null,
  call_status text not null check (call_status in ('interested','appointment_booked','busy','no_answer','rejected')),
  note text,
  appointment_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists marketing_call_logs_lead_idx on marketing.call_logs(lead_id, created_at desc);
create index if not exists marketing_call_logs_staff_idx on marketing.call_logs(telesale_code, created_at desc);

create table if not exists marketing.pg_work_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  allowed_radius_m integer not null default 100 check (allowed_radius_m between 20 and 500),
  max_accuracy_m integer not null default 100 check (max_accuracy_m between 10 and 200),
  active boolean not null default true,
  created_by_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing.pg_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  pg_code text not null,
  site_id uuid not null references marketing.pg_work_sites(id),
  work_date date not null,
  start_time time not null,
  end_time time not null,
  created_by_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pg_code, work_date),
  check (end_time > start_time)
);

create index if not exists pg_shift_assignments_date_idx on marketing.pg_shift_assignments(work_date, pg_code);

create table if not exists marketing.pg_attendance (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references marketing.pg_shift_assignments(id),
  pg_code text not null,
  record_type text not null check (record_type in ('checkin','checkout')),
  recorded_at timestamptz not null default now(),
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m integer not null,
  distance_m integer not null,
  status text not null check (status in ('valid','late','early_leave')),
  created_at timestamptz not null default now(),
  unique(assignment_id, record_type)
);

create index if not exists pg_attendance_staff_idx on marketing.pg_attendance(pg_code, recorded_at desc);

create table if not exists marketing.audit_log (
  id bigserial primary key,
  actor_code text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

