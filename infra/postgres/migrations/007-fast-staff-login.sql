create index if not exists records_profiles_employee_code_login_idx
  on app.records (lower((payload->>'employee_code')))
  where entity_type = 'profiles' and deleted_at is null;

create index if not exists records_employees_code_login_idx
  on app.records (lower((payload->>'code')))
  where entity_type = 'employees' and deleted_at is null;

create index if not exists records_employees_username_login_idx
  on app.records (lower((payload->>'login_username')))
  where entity_type = 'employees' and deleted_at is null
    and coalesce(payload->>'login_username', '') <> '';
