-- One-time reconciliation of the five demo Marketing accounts seeded by
-- supabase-marketing-telesale.sql.  Profiles are retained as inactive audit
-- history; customer leads move to verified, active staff profiles.

create table if not exists app.personnel_cleanup_audit (
  id bigserial primary key,
  executed_at timestamptz not null default now(),
  sample_code text not null,
  target_code text,
  profile_payload jsonb,
  local_account jsonb
);

insert into app.personnel_cleanup_audit(sample_code,target_code,profile_payload,local_account)
select p.payload->>'employee_code',
       case p.payload->>'employee_code'
         when 'MKT-01' then 'PVC-10162'
         when 'MKT-SUP' then 'PVC-10251'
         when 'TS-LEAD' then 'PVC-10237'
         when 'PVC-TS01' then 'PVC-10221'
         when 'PG-FIELD' then 'PVC-10198'
       end,
       p.payload,
       to_jsonb(a)
from app.records p
left join app.local_accounts a on a.profile_key=p.record_key
where p.entity_type='profiles' and p.deleted_at is null
  and p.payload->>'employee_code' in ('MKT-01','MKT-SUP','TS-LEAD','PVC-TS01','PG-FIELD');

-- The orphaned legacy Telesale code is the same named employee as PVC-10221.
-- Preserve all customer rows and their existing net/raw classification.
update marketing.leads
set assigned_telesale_code='PVC-10221', updated_at=now()
where assigned_telesale_code in ('PG-LEGACY-16','PVC-TS01');

-- Keep source attribution but move the two demo PG intake rows to the verified
-- field-development employee, rather than deleting customer history.
update marketing.leads
set created_by_pg_code='PVC-10198', updated_at=now()
where created_by_pg_code='PG-FIELD';

update app.records
set payload=jsonb_set(payload, '{active}', 'false'::jsonb, true)
              || jsonb_build_object('deactivated_reason','demo_account_cleanup','updated_at',now()::text),
    origin='vps', version=version+1, updated_at=now()
where entity_type='profiles' and deleted_at is null
  and payload->>'employee_code' in ('MKT-01','MKT-SUP','TS-LEAD','PVC-TS01','PG-FIELD');

update app.local_accounts a
set active=false, failed_attempts=0, locked_until=null, updated_at=now()
from app.records p
where p.entity_type='profiles' and p.record_key=a.profile_key
  and p.payload->>'employee_code' in ('MKT-01','MKT-SUP','TS-LEAD','PVC-TS01','PG-FIELD');

update app.refresh_sessions s
set revoked_at=coalesce(revoked_at,now())
from app.local_accounts a
where s.user_id=a.user_id and a.active=false
  and a.employee_code in ('MKT-01','MKT-SUP','TS-LEAD','PVC-TS01','PG-FIELD');
