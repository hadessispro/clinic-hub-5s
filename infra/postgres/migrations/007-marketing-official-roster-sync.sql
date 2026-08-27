-- Official Marketing roster synchronization, supplied by HR on 2026-08-13.
-- Passwords are deliberately not stored in this migration. Existing local
-- credentials are revoked so the first login provisions a fresh hash from the
-- verified employee phone number in AuthService.

create table if not exists app.marketing_roster_sync_audit (
  id bigserial primary key,
  executed_at timestamptz not null default now(),
  employee_code text not null,
  before_employee jsonb,
  before_profile jsonb,
  before_account jsonb
);

with roster(code, phone, email) as (
  values
    ('PVC-10162','0932188656',null::text),
    ('PVC-10198','0949339597',null::text),
    ('PVC-10222','0528828145',null::text),
    ('PVC-10202',null::text,null::text),
    ('PVC-10203','0984110298',null::text),
    ('PVC-10234','0345982867','ngodinhnhuy@gmail.com'),
    ('PVC-10237','0933935664',null::text),
    ('PVC-10251','0387938544',null::text),
    ('PVC-10221','0775708179',null::text)
)
insert into app.marketing_roster_sync_audit(employee_code,before_employee,before_profile,before_account)
select r.code,e.payload,p.payload,to_jsonb(a)
from roster r
left join app.records e on e.entity_type='employees' and e.deleted_at is null and e.payload->>'code'=r.code
left join app.records p on p.entity_type='profiles' and p.deleted_at is null and p.payload->>'employee_code'=r.code
left join app.local_accounts a on a.profile_key=p.record_key;

with roster(code, phone, email) as (
  values
    ('PVC-10162','0932188656',null::text),('PVC-10198','0949339597',null::text),
    ('PVC-10222','0528828145',null::text),('PVC-10202',null::text,null::text),
    ('PVC-10203','0984110298',null::text),('PVC-10234','0345982867','ngodinhnhuy@gmail.com'),
    ('PVC-10237','0933935664',null::text),('PVC-10251','0387938544',null::text),
    ('PVC-10221','0775708179',null::text)
)
update app.records e
set payload=e.payload || jsonb_strip_nulls(jsonb_build_object('phone',r.phone,'email',r.email,'updated_at',now()::text)),
    origin='vps',version=e.version+1,updated_at=now()
from roster r
where e.entity_type='employees' and e.deleted_at is null and e.payload->>'code'=r.code;

-- Revoke sessions and remove old password hashes only for official entries
-- whose phone is available. Their next login uses the verified phone number.
delete from app.refresh_sessions s
using app.local_accounts a
where s.user_id=a.user_id
  and a.employee_code in ('PVC-10162','PVC-10198','PVC-10222','PVC-10203','PVC-10234','PVC-10237','PVC-10251','PVC-10221');

delete from app.local_accounts
where employee_code in ('PVC-10162','PVC-10198','PVC-10222','PVC-10203','PVC-10234','PVC-10237','PVC-10251','PVC-10221');
