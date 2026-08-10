create schema if not exists app;

create table if not exists app.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists app.records (
  entity_type text not null,
  record_key text not null,
  payload jsonb not null default '{}'::jsonb,
  origin text not null default 'vps',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (entity_type, record_key)
);

create index if not exists records_payload_gin on app.records using gin (payload jsonb_path_ops);
create index if not exists records_entity_updated_idx on app.records(entity_type, updated_at desc);

create table if not exists app.backup_outbox (
  id bigserial primary key,
  entity_type text not null,
  record_key text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  payload jsonb,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists backup_outbox_pending_idx
  on app.backup_outbox(next_attempt_at, id) where completed_at is null;

create table if not exists app.local_accounts (
  user_id uuid primary key,
  profile_key text not null unique,
  email text,
  employee_code text,
  branch_id text,
  password_salt text not null,
  password_hash text not null,
  active boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists local_accounts_email_idx
  on app.local_accounts(lower(email)) where email is not null;
create index if not exists local_accounts_employee_idx
  on app.local_accounts(lower(employee_code), branch_id) where employee_code is not null;

create table if not exists app.refresh_sessions (
  id uuid primary key,
  user_id uuid not null references app.local_accounts(user_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create or replace function app.queue_record_backup() returns trigger
language plpgsql as $$
begin
  if current_setting('app.suppress_backup_outbox', true) = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    insert into app.backup_outbox(entity_type, record_key, operation, payload)
    values (old.entity_type, old.record_key, 'delete', old.payload);
    return old;
  end if;
  insert into app.backup_outbox(entity_type, record_key, operation, payload)
  values (new.entity_type, new.record_key, 'upsert', new.payload);
  return new;
end;
$$;

drop trigger if exists records_backup_outbox on app.records;
create trigger records_backup_outbox
after insert or update or delete on app.records
for each row execute function app.queue_record_backup();

create or replace function app.bootstrap_from_shadow() returns bigint
language plpgsql as $$
declare affected bigint;
begin
  perform set_config('app.suppress_backup_outbox', 'on', true);
  insert into app.records(entity_type, record_key, payload, origin, created_at, updated_at)
  select table_name, record_key, payload, 'supabase-bootstrap', imported_at, imported_at
  from migration.raw_records
  on conflict (entity_type, record_key) do update set
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    version = app.records.version + 1
  where app.records.origin <> 'vps';
  get diagnostics affected = row_count;
  return affected;
end;
$$;

select app.bootstrap_from_shadow();
