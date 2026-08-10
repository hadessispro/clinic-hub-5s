create extension if not exists pgcrypto;
create schema if not exists migration;

create table if not exists migration.import_runs (
  id uuid primary key,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists migration.raw_records (
  table_name text not null,
  record_key text not null,
  payload jsonb not null,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  import_run_id uuid references migration.import_runs(id) on delete set null,
  primary key (table_name, record_key)
);

create index if not exists raw_records_payload_gin on migration.raw_records using gin(payload);
create index if not exists raw_records_import_run on migration.raw_records(import_run_id);
