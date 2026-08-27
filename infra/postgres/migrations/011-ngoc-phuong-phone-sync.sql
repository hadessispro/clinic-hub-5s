-- Verified roster correction supplied by management on 2026-08-14.
-- Keep the role/profile unchanged; update only contact credentials and revoke
-- old sessions so the verified phone becomes the login password.

insert into app.marketing_roster_sync_audit(employee_code,before_employee,before_profile,before_account)
select 'PG-LEGACY-17', e.payload, p.payload, to_jsonb(a)
from app.records e
left join app.records p on p.entity_type='profiles' and p.deleted_at is null
  and lower(p.payload->>'employee_code')='pg-legacy-17'
left join app.local_accounts a on a.profile_key=p.record_key
where e.entity_type='employees' and e.deleted_at is null
  and lower(e.payload->>'code')='pg-legacy-17';

update app.records
set payload=payload || jsonb_build_object(
      'phone','09849844123',
      'email','NgocPhuong@gmail.com',
      'updated_at',now()::text
    ),
    origin='vps', version=version+1, updated_at=now()
where entity_type='employees' and deleted_at is null
  and lower(payload->>'code')='pg-legacy-17'
  and lower(payload->>'full_name')=lower('Nguyễn Ngọc Phượng');

delete from app.refresh_sessions s
using app.local_accounts a
where s.user_id=a.user_id and lower(a.employee_code)='pg-legacy-17';

delete from app.local_accounts where lower(employee_code)='pg-legacy-17';
