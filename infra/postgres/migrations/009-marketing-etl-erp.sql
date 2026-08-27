-- ERP-style Marketing ETL: batches (documents), staging, customer master and
-- immutable assignment history. Lead screens read a bounded page; imports are
-- validated before they can enter the operational queue.
create table if not exists marketing.import_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  source text not null,
  branch_id text,
  data_class text not null check (data_class in ('raw','net')),
  net_level text check (net_level in ('basic','advanced')),
  status text not null default 'staged' check (status in ('staged','approved','loaded','cancelled')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  loaded_rows integer not null default 0,
  created_by_code text not null,
  approved_by_code text,
  loaded_by_code text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  loaded_at timestamptz,
  note text
);

create table if not exists marketing.lead_staging (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references marketing.import_batches(id) on delete cascade,
  row_number integer not null,
  customer_name text,
  phone text,
  service_type text,
  appointment_at timestamptz,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  validation_status text not null check (validation_status in ('valid','duplicate','error','loaded')),
  validation_errors jsonb not null default '[]'::jsonb,
  duplicate_lead_id uuid references marketing.leads(id),
  loaded_lead_id uuid references marketing.leads(id),
  created_at timestamptz not null default now(),
  unique(batch_id,row_number)
);
create index if not exists lead_staging_batch_status_idx on marketing.lead_staging(batch_id,validation_status,row_number);

create table if not exists marketing.customers (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text not null unique,
  full_name text,
  first_source text,
  last_source text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into marketing.customers(phone_normalized,full_name,first_source,last_source,first_seen_at,last_seen_at)
select regexp_replace(phone,'\D','','g'), max(customer_name), min(source), max(source), min(created_at), max(created_at)
from marketing.leads where phone is not null and regexp_replace(phone,'\D','','g')<>''
group by regexp_replace(phone,'\D','','g')
on conflict(phone_normalized) do update set full_name=excluded.full_name,last_source=excluded.last_source,last_seen_at=excluded.last_seen_at,updated_at=now();

create table if not exists marketing.lead_assignment_history (
  id bigserial primary key,
  lead_id uuid not null references marketing.leads(id) on delete cascade,
  from_telesale_code text,
  to_telesale_code text,
  assigned_by_code text,
  reason text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists lead_assignment_history_lead_idx on marketing.lead_assignment_history(lead_id,created_at desc);

insert into marketing.lead_assignment_history(lead_id,to_telesale_code,assigned_by_code,reason,created_at)
select id,assigned_telesale_code,assigned_by_code,'legacy_backfill',coalesce(assigned_at,created_at)
from marketing.leads where assigned_telesale_code is not null
  and not exists(select 1 from marketing.lead_assignment_history h where h.lead_id=marketing.leads.id);

create or replace function marketing.record_lead_assignment() returns trigger language plpgsql as $$
begin
  if new.assigned_telesale_code is distinct from old.assigned_telesale_code then
    insert into marketing.lead_assignment_history(lead_id,from_telesale_code,to_telesale_code,assigned_by_code,reason)
    values(new.id,old.assigned_telesale_code,new.assigned_telesale_code,new.assigned_by_code,coalesce(current_setting('app.assignment_reason',true),'manual'));
  end if;
  return new;
end $$;
drop trigger if exists marketing_leads_assignment_history on marketing.leads;
create trigger marketing_leads_assignment_history after update of assigned_telesale_code on marketing.leads
for each row execute function marketing.record_lead_assignment();

create index if not exists marketing_leads_operational_page_idx on marketing.leads(created_at desc,id desc);
