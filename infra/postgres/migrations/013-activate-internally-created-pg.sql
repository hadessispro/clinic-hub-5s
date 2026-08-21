-- Accounts created by Support/Admin in the PG management screen are active
-- immediately.  Public self-registration remains pending for review.
update app.records profile
set payload = profile.payload || jsonb_build_object(
      'active', true,
      'registration_status', 'active',
      'activated_at', now()::text,
      'activation_source', 'internal_creation_migration'
    ),
    updated_at = now(),
    version = version + 1
where profile.entity_type = 'profiles'
  and profile.deleted_at is null
  and profile.payload->>'role' = 'pg_staff'
  and profile.payload->>'registration_status' = 'pending_approval'
  and profile.payload->>'registration_source' in ('support_created', 'manager_created');

update app.records employee
set payload = employee.payload || jsonb_build_object('status', 'active', 'updated_at', now()::text),
    updated_at = now(),
    version = version + 1
where employee.entity_type = 'employees'
  and employee.deleted_at is null
  and lower(employee.payload->>'code') in (
    select lower(profile.payload->>'employee_code')
    from app.records profile
    where profile.entity_type = 'profiles'
      and profile.deleted_at is null
      and profile.payload->>'role' = 'pg_staff'
      and profile.payload->>'registration_status' = 'active'
      and profile.payload->>'activation_source' = 'internal_creation_migration'
  );

update app.local_accounts account
set active = true,
    failed_attempts = 0,
    locked_until = null,
    updated_at = now()
from app.records profile
where profile.entity_type = 'profiles'
  and profile.deleted_at is null
  and profile.record_key = account.profile_key
  and profile.payload->>'role' = 'pg_staff'
  and profile.payload->>'registration_status' = 'active'
  and profile.payload->>'activation_source' = 'internal_creation_migration';
