\set ON_ERROR_STOP on

-- Reconcile the latest phpMyAdmin PG customer export after it has been loaded
-- into source_pg.reconcile_20260820(source_id, payload).  The operation is
-- additive and preserves live Telesale status, assignment and call history.
begin;

lock table marketing.leads in share row exclusive mode;

-- Keep immutable, queryable snapshots before touching production data.
create table if not exists source_pg.customers_backup_20260820 as
select * from source_pg.customers with no data;
truncate source_pg.customers_backup_20260820;
insert into source_pg.customers_backup_20260820 select * from source_pg.customers;

create table if not exists source_pg.staff_backup_20260820 as
select * from source_pg.staff with no data;
truncate source_pg.staff_backup_20260820;
insert into source_pg.staff_backup_20260820 select * from source_pg.staff;

create table if not exists marketing.customer_profiles_backup_20260820 as
select * from marketing.customer_profiles with no data;
truncate marketing.customer_profiles_backup_20260820;
insert into marketing.customer_profiles_backup_20260820
select * from marketing.customer_profiles
where external_source = 'pg_nhakhoa5s_mysql';

create table if not exists marketing.leads_backup_20260820 as
select * from marketing.leads with no data;
truncate marketing.leads_backup_20260820;
insert into marketing.leads_backup_20260820
select distinct lead.*
from marketing.leads lead
left join source_pg.reconcile_20260820 source
  on marketing.normalize_lead_phone(lead.phone)
   = marketing.normalize_lead_phone(source.payload->>'phone')
where lead.external_source = 'pg_nhakhoa5s_mysql'
   or source.source_id is not null;

-- Net Chuyen sau (CS) is valid without an appointment.  Net Co ban (CB)
-- still requires an appointment text in the source reconciliation below.
alter table marketing.leads drop constraint if exists leads_check;
alter table marketing.leads
  add constraint leads_check check (
    data_class = 'raw'
    or (
      phone is not null
      and length(regexp_replace(phone, '\D', '', 'g')) >= 8
      and net_level in ('basic', 'advanced')
    )
  );

-- Refresh the lossless source snapshots first.
insert into source_pg.staff(source_id, payload, imported_at)
select source_id, payload, now()
from source_pg.reconcile_staff_20260820
on conflict(source_id) do update
set payload = excluded.payload,
    imported_at = excluded.imported_at;

insert into source_pg.customers(source_id, payload, imported_at)
select source_id, payload, now()
from source_pg.reconcile_20260820
on conflict(source_id) do update
set payload = excluded.payload,
    imported_at = excluded.imported_at;

-- Source dates are not consistently machine-readable.  Never discard the
-- original appointment_text; appointment_at is filled only when unambiguous.
create or replace function source_pg.try_source_timestamp(value text)
returns timestamptz
language plpgsql
stable
as $$
declare result timestamptz;
begin
  if trim(coalesce(value, '')) ~ '^20[0-9]{2}-[0-1][0-9]-[0-3][0-9][[:space:]][0-2][0-9]:[0-5][0-9]:[0-5][0-9]$' then
    result := trim(value)::timestamp at time zone 'Asia/Ho_Chi_Minh';
  elsif trim(coalesce(value, '')) ~ '^[0-3]?[0-9]/[0-1]?[0-9]/20[0-9]{2}[[:space:]][0-2]?[0-9]:[0-5][0-9]$' then
    result := to_timestamp(trim(value), 'DD/MM/YYYY HH24:MI') at time zone 'Asia/Ho_Chi_Minh';
  else
    result := null;
  end if;
  return result;
exception when others then
  return null;
end;
$$;

insert into marketing.customer_profiles(
  external_source, external_id, customer_code, customer_name, phone,
  service_need, booth, pg_name, telesale_name, customer_status,
  call_status, appointment_status, appointment_text, arrived, source_label,
  note, feedback, data_type, arrival_branch, low_quality,
  low_quality_reason, latest_telesale_note, vtech_service_type,
  vtech_service_date, vtech_service_revenue, vtech_service_sales,
  commission_status, raw_snapshot, source_created_at, source_updated_at,
  created_at, updated_at
)
select
  'pg_nhakhoa5s_mysql', source_id::text,
  nullif(trim(payload->>'customer_code'), ''),
  trim(payload->>'customer_name'),
  marketing.normalize_lead_phone(payload->>'phone'),
  nullif(trim(payload->>'service_need'), ''),
  nullif(trim(payload->>'booth'), ''),
  case when trim(payload->>'pg_user_id') = '20'
       then 'CÔNG TY CỔ PHẦN 5S SÀI GÒN'
       else nullif(trim(payload->>'pg_name'), '') end,
  nullif(trim(payload->>'tele_name'), ''),
  nullif(trim(payload->>'customer_status'), ''),
  nullif(trim(payload->>'call_status'), ''),
  nullif(trim(payload->>'appointment_status'), ''),
  nullif(trim(payload->>'appointment_date'), ''),
  lower(trim(coalesce(payload->>'arrived_status', '0'))) in ('1','true','yes'),
  coalesce(nullif(trim(payload->>'source'), ''), 'PG Field Intake'),
  nullif(trim(payload->>'note'), ''),
  nullif(trim(payload->>'feedback'), ''),
  lower(trim(payload->>'data_type')),
  nullif(trim(payload->>'arrival_branch'), ''),
  lower(trim(coalesce(payload->>'low_quality', '0'))) in ('1','true','yes'),
  coalesce(nullif(trim(payload->>'low_quality_reason'), ''), nullif(trim(payload->>'low_quality_note'), '')),
  nullif(trim(payload->>'tele_note_latest'), ''),
  nullif(trim(payload->>'vtech_service_type'), ''),
  case when trim(coalesce(payload->>'vtech_service_date','')) ~ '^20[0-9]{2}-[0-1][0-9]-[0-3][0-9]$'
       then trim(payload->>'vtech_service_date')::date end,
  case when trim(coalesce(payload->>'vtech_service_revenue','')) ~ '^-?[0-9]+([.][0-9]+)?$'
       then (payload->>'vtech_service_revenue')::numeric else 0 end,
  case when trim(coalesce(payload->>'vtech_service_sales','')) ~ '^-?[0-9]+([.][0-9]+)?$'
       then (payload->>'vtech_service_sales')::numeric else 0 end,
  nullif(trim(payload->>'commission_status'), ''),
  payload,
  source_pg.try_source_timestamp(payload->>'created_at'),
  source_pg.try_source_timestamp(payload->>'updated_at'),
  coalesce(source_pg.try_source_timestamp(payload->>'created_at'), now()),
  now()
from source_pg.reconcile_20260820
on conflict(external_source, external_id) do update
set customer_code = excluded.customer_code,
    customer_name = excluded.customer_name,
    phone = excluded.phone,
    service_need = excluded.service_need,
    booth = excluded.booth,
    pg_name = excluded.pg_name,
    telesale_name = excluded.telesale_name,
    customer_status = excluded.customer_status,
    call_status = excluded.call_status,
    appointment_status = excluded.appointment_status,
    appointment_text = excluded.appointment_text,
    arrived = excluded.arrived,
    source_label = excluded.source_label,
    note = excluded.note,
    feedback = excluded.feedback,
    data_type = excluded.data_type,
    arrival_branch = excluded.arrival_branch,
    low_quality = excluded.low_quality,
    low_quality_reason = excluded.low_quality_reason,
    latest_telesale_note = excluded.latest_telesale_note,
    vtech_service_type = excluded.vtech_service_type,
    vtech_service_date = excluded.vtech_service_date,
    vtech_service_revenue = excluded.vtech_service_revenue,
    vtech_service_sales = excluded.vtech_service_sales,
    commission_status = excluded.commission_status,
    raw_snapshot = excluded.raw_snapshot,
    source_created_at = excluded.source_created_at,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

-- Link source rows to an application-entered lead with the same canonical
-- phone.  This avoids creating 44 duplicate customers while retaining every
-- operational edit already made to those leads.
update marketing.leads lead
set external_source = 'pg_nhakhoa5s_mysql',
    external_id = source.source_id::text,
    customer_profile_id = profile.id,
    updated_at = now()
from source_pg.reconcile_20260820 source
join marketing.customer_profiles profile
  on profile.external_source = 'pg_nhakhoa5s_mysql'
 and profile.external_id = source.source_id::text
where lead.external_source is null
  and marketing.normalize_lead_phone(lead.phone)
    = marketing.normalize_lead_phone(source.payload->>'phone')
  and not exists (
    select 1 from marketing.leads linked
    where linked.external_source = 'pg_nhakhoa5s_mysql'
      and linked.external_id = source.source_id::text
  );

-- Insert only truly absent customers.  Existing lead status and assignment
-- are intentionally never overwritten by this import.
with prepared as (
  select
    source.source_id,
    source.payload,
    profile.id profile_id,
    coalesce(pg_map.employee_code,
             'PG-LEGACY-' || nullif(trim(source.payload->>'pg_user_id'), ''),
             'PG-SOURCE-' || source.source_id::text) pg_code,
    coalesce(tele_map.employee_code,
             case when trim(coalesce(source.payload->>'tele_user_id','')) <> ''
                  then 'PG-LEGACY-' || trim(source.payload->>'tele_user_id') end) tele_code,
    trim(coalesce(source.payload->>'appointment_date', '')) appointment_text,
    lower(trim(coalesce(source.payload->>'data_type', ''))) source_type
  from source_pg.reconcile_20260820 source
  join marketing.customer_profiles profile
    on profile.external_source = 'pg_nhakhoa5s_mysql'
   and profile.external_id = source.source_id::text
  left join source_pg.staff pg_staff
    on trim(pg_staff.payload->>'user_id') = trim(source.payload->>'pg_user_id')
  left join source_pg.staff_account_map pg_map on pg_map.source_id = pg_staff.source_id
  left join source_pg.staff tele_staff
    on trim(tele_staff.payload->>'user_id') = trim(source.payload->>'tele_user_id')
  left join source_pg.staff_account_map tele_map on tele_map.source_id = tele_staff.source_id
)
insert into marketing.leads(
  customer_name, phone, appointment_at, data_class, net_level, service_type,
  source, branch_id, notes, status, created_by_pg_code,
  assigned_telesale_code, assigned_by_code, assigned_at,
  created_at, updated_at, customer_profile_id, external_source, external_id,
  low_quality_reason
)
select
  trim(payload->>'customer_name'),
  marketing.normalize_lead_phone(payload->>'phone'),
  source_pg.try_source_timestamp(appointment_text),
  case when source_type = 'cs' or (source_type = 'cb' and appointment_text <> '') then 'net' else 'raw' end,
  case when source_type = 'cs' then 'advanced'
       when source_type = 'cb' and appointment_text <> '' then 'basic' end,
  nullif(trim(payload->>'service_need'), ''),
  'PG Legacy', null, nullif(trim(payload->>'note'), ''),
  case
    when lower(trim(coalesce(payload->>'low_quality','0'))) in ('1','true','yes') then 'low_quality'
    when lower(trim(coalesce(payload->>'arrived_status','0'))) in ('1','true','yes') then 'visited'
    when appointment_text <> '' or lower(coalesce(payload->>'appointment_status','')) like '%đã đặt lịch%' then 'appointment_booked'
    when trim(coalesce(payload->>'tele_name','')) <> '' or lower(trim(coalesce(payload->>'call_status',''))) not in ('','chưa gọi') then 'contacted'
    else 'new'
  end,
  pg_code, tele_code,
  case when tele_code is not null then 'PG-LEGACY-IMPORT' end,
  case when tele_code is not null then coalesce(source_pg.try_source_timestamp(payload->>'tele_assigned_at'), now()) end,
  coalesce(source_pg.try_source_timestamp(payload->>'created_at'), now()), now(),
  profile_id, 'pg_nhakhoa5s_mysql', source_id::text,
  case when lower(trim(coalesce(payload->>'low_quality','0'))) in ('1','true','yes')
       then case trim(coalesce(payload->>'low_quality_reason',''))
              when 'subscriber_unavailable' then 'subscriber_unavailable'
              when 'wrong_phone' then 'wrong_phone'
              when 'wrong_person' then 'wrong_person'
              when 'duplicate' then 'duplicate'
              when 'spam' then 'spam'
              else 'other'
            end end
from prepared
where not exists (
  select 1 from marketing.leads lead
  where lead.external_source = 'pg_nhakhoa5s_mysql'
    and lead.external_id = prepared.source_id::text
);

-- Apply the authoritative classification to every source-linked record.
-- CB with any appointment text is Net Co ban; CB without one is Data tho.
-- CS is always Net Chuyen sau.  Raw rows always have net_level NULL.
update marketing.leads lead
set customer_name = trim(source.payload->>'customer_name'),
    appointment_at = source_pg.try_source_timestamp(source.payload->>'appointment_date'),
    data_class = case
      when lower(trim(source.payload->>'data_type')) = 'cs' then 'net'
      when lower(trim(source.payload->>'data_type')) = 'cb'
       and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'net'
      else 'raw' end,
    net_level = case
      when lower(trim(source.payload->>'data_type')) = 'cs' then 'advanced'
      when lower(trim(source.payload->>'data_type')) = 'cb'
       and trim(coalesce(source.payload->>'appointment_date','')) <> '' then 'basic'
      else null end,
    service_type = nullif(trim(source.payload->>'service_need'), ''),
    created_by_pg_code = coalesce(pg_map.employee_code,
      'PG-LEGACY-' || nullif(trim(source.payload->>'pg_user_id'), ''),
      lead.created_by_pg_code),
    customer_profile_id = profile.id,
    updated_at = now()
from source_pg.reconcile_20260820 source
join marketing.customer_profiles profile
  on profile.external_source = 'pg_nhakhoa5s_mysql'
 and profile.external_id = source.source_id::text
left join source_pg.staff pg_staff
  on trim(pg_staff.payload->>'user_id') = trim(source.payload->>'pg_user_id')
left join source_pg.staff_account_map pg_map on pg_map.source_id = pg_staff.source_id
where lead.external_source = 'pg_nhakhoa5s_mysql'
  and lead.external_id = source.source_id::text;

insert into marketing.audit_log(actor_code, action, entity_type, detail)
values ('ADMIN-IT', 'reconcile_pg_customer_source', 'marketing.leads',
  jsonb_build_object(
    'source_rows', (select count(*) from source_pg.reconcile_20260820),
    'reconciled_at', now(),
    'rule', 'CS=net advanced; CB+appointment text=net basic; remaining CB=raw'
  ));

commit;
