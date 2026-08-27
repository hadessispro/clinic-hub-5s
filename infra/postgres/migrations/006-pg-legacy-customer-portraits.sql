create schema if not exists source_pg;

create table if not exists source_pg.customers (
  source_id bigint primary key,
  payload jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists source_pg.staff (
  source_id bigint primary key,
  payload jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists source_pg.customer_logs (
  source_id bigint primary key,
  payload jsonb not null,
  imported_at timestamptz not null default now()
);

create table if not exists source_pg.staff_account_map (
  source_id bigint primary key references source_pg.staff(source_id) on delete cascade,
  employee_record_key text not null,
  employee_code text not null,
  match_method text not null check (match_method in ('email','phone','new','excluded')),
  matched_at timestamptz not null default now()
);

create table if not exists marketing.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  external_source text not null,
  external_id text not null,
  customer_code text,
  customer_name text not null,
  phone text,
  service_need text,
  booth text,
  pg_name text,
  telesale_name text,
  customer_status text,
  call_status text,
  appointment_status text,
  appointment_text text,
  arrived boolean not null default false,
  source_label text,
  note text,
  feedback text,
  data_type text,
  arrival_branch text,
  low_quality boolean not null default false,
  low_quality_reason text,
  latest_telesale_note text,
  vtech_service_type text,
  vtech_service_date date,
  vtech_service_revenue numeric(15,2) not null default 0,
  vtech_service_sales numeric(15,2) not null default 0,
  commission_status text,
  raw_snapshot jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(external_source, external_id)
);

alter table marketing.leads add column if not exists customer_profile_id uuid references marketing.customer_profiles(id);
alter table marketing.leads add column if not exists external_source text;
alter table marketing.leads add column if not exists external_id text;
create unique index if not exists marketing_leads_external_uidx
  on marketing.leads(external_source, external_id) where external_source is not null and external_id is not null;
create index if not exists marketing_customer_profiles_phone_idx
  on marketing.customer_profiles ((regexp_replace(coalesce(phone,''),'\D','','g')));

revoke all on schema source_pg from public;
revoke all on all tables in schema source_pg from public;
