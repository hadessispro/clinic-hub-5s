create table if not exists marketing.customer_journey_events (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid references marketing.customer_profiles(id) on delete set null,
  lead_id uuid references marketing.leads(id) on delete set null,
  external_source text not null,
  external_id text not null,
  legacy_customer_id text,
  event_type text not null,
  event_category text not null default 'legacy',
  actor_code text,
  actor_name text,
  occurred_at timestamptz not null,
  summary text,
  detail jsonb not null default '{}'::jsonb,
  mapping_status text not null default 'mapped' check (mapping_status in ('mapped','orphan')),
  created_at timestamptz not null default now(),
  unique(external_source,external_id)
);

create index if not exists customer_journey_events_lead_time_idx
  on marketing.customer_journey_events(lead_id,occurred_at desc)
  where lead_id is not null;
create index if not exists customer_journey_events_profile_time_idx
  on marketing.customer_journey_events(customer_profile_id,occurred_at desc)
  where customer_profile_id is not null;
create index if not exists customer_journey_events_type_time_idx
  on marketing.customer_journey_events(event_type,occurred_at desc);

-- Complete the master-customer index without creating another lead. This is
-- idempotent and preserves the first-seen timestamp when a phone already exists.
insert into marketing.customers(
  phone_normalized,full_name,first_source,last_source,first_seen_at,last_seen_at
)
select marketing.normalize_lead_phone(cp.phone),
       coalesce(nullif(trim(cp.customer_name),''),'Khách hàng'),
       cp.external_source,cp.external_source,
       coalesce(cp.source_created_at,cp.created_at,now()),
       coalesce(cp.source_updated_at,cp.updated_at,now())
from marketing.customer_profiles cp
where cp.external_source='pg_nhakhoa5s_mysql'
  and length(marketing.normalize_lead_phone(cp.phone))>=8
on conflict(phone_normalized) do update
set full_name=coalesce(nullif(marketing.customers.full_name,''),excluded.full_name),
    last_source=excluded.last_source,
    first_seen_at=least(marketing.customers.first_seen_at,excluded.first_seen_at),
    last_seen_at=greatest(marketing.customers.last_seen_at,excluded.last_seen_at),
    updated_at=now();

-- Keep raw snapshots in source_pg and copy only the normalized fields required
-- by the customer journey. The unique external key makes reruns safe.
insert into marketing.customer_journey_events(
  customer_profile_id,lead_id,external_source,external_id,legacy_customer_id,
  event_type,event_category,actor_code,actor_name,occurred_at,summary,detail,mapping_status
)
select cp.id,l.id,'pg_nhakhoa5s_mysql_customer_logs',log.source_id::text,
       log.payload->>'customer_id',
       coalesce(nullif(log.payload->>'event_type',''),'legacy_customer_log'),
       case when lower(coalesce(log.payload->>'event_type','')) similar to '%(gift|voucher|doi.?qua|redeem)%'
                  or lower(coalesce(log.payload->>'source_module','')) similar to '%(gift|voucher|doi.?qua|redeem)%'
            then 'gift' else 'legacy' end,
       nullif(log.payload->>'user_id',''),nullif(log.payload->>'user_name',''),
       (log.payload->>'created_at')::timestamp at time zone 'Asia/Ho_Chi_Minh',
       left(coalesce(nullif(log.payload->>'note',''),nullif(log.payload->>'event_type',''),'Nhật ký dữ liệu cũ'),2000),
       jsonb_strip_nulls(jsonb_build_object(
         'sourceEventType',nullif(log.payload->>'event_type',''),
         'sourceModule',nullif(log.payload->>'source_module',''),
         'actorRole',nullif(log.payload->>'actor_role',''),
         'customerStatus',nullif(log.payload->>'customer_status',''),
         'callStatus',nullif(log.payload->>'call_status',''),
         'appointmentStatus',nullif(log.payload->>'appointment_status',''),
         'appointmentDate',nullif(log.payload->>'appointment_date',''),
         'previousCustomerStatus',nullif(log.payload#>>'{before_data,customer_status}',''),
         'nextCustomerStatus',nullif(log.payload#>>'{after_data,customer_status}','')
       )),
       case when cp.id is null then 'orphan' else 'mapped' end
from source_pg.customer_logs log
left join marketing.customer_profiles cp
  on cp.external_source='pg_nhakhoa5s_mysql'
 and cp.external_id=log.payload->>'customer_id'
left join marketing.leads l on l.customer_profile_id=cp.id
on conflict(external_source,external_id) do update
set customer_profile_id=excluded.customer_profile_id,
    lead_id=excluded.lead_id,
    legacy_customer_id=excluded.legacy_customer_id,
    event_type=excluded.event_type,
    event_category=excluded.event_category,
    actor_code=excluded.actor_code,
    actor_name=excluded.actor_name,
    occurred_at=excluded.occurred_at,
    summary=excluded.summary,
    detail=excluded.detail,
    mapping_status=excluded.mapping_status;
