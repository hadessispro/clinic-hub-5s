-- Migration 057: Dọn dẹp dữ liệu rác và đồng bộ triệt để sau khi xóa nhân sự
-- Đảm bảo an toàn phân quyền, tài khoản đăng nhập và tính toàn vẹn dữ liệu

-- 1. Vô hiệu hóa tài khoản đăng nhập (local_accounts) của nhân sự đã bị xóa khỏi hệ thống
update app.local_accounts
set active = false, updated_at = now()
where active = true
  and (
    exists (
      select 1 from app.records p
      where p.entity_type = 'profiles'
        and p.deleted_at is not null
        and (p.record_key = app.local_accounts.profile_key
             or lower(p.payload->>'employee_code') = lower(app.local_accounts.employee_code))
    )
    or exists (
      select 1 from app.records e
      where e.entity_type = 'employees'
        and e.deleted_at is not null
        and (lower(e.payload->>'code') = lower(app.local_accounts.employee_code)
             or lower(e.record_key) = lower(app.local_accounts.employee_code))
    )
  );

-- 2. Thu hồi toàn bộ refresh tokens / phiên đăng nhập còn sót lại của các tài khoản đã bị vô hiệu hóa
delete from app.refresh_sessions
where user_id in (select user_id from app.local_accounts where active = false);

-- 3. Soft-delete các ca trực cho phép (employee_allowed_shifts) của nhân sự đã bị xóa
update app.records
set deleted_at = now(), version = version + 1, updated_at = now()
where entity_type = 'employee_allowed_shifts'
  and deleted_at is null
  and exists (
    select 1 from app.records e
    where e.entity_type = 'employees'
      and e.deleted_at is not null
      and (lower(e.payload->>'code') = lower(app.records.payload->>'employee_code')
           or lower(e.record_key) = lower(app.records.payload->>'employee_code'))
  );

-- 4. Đồng bộ 100% hai chiều các trường họ tên, email, sđt giữa profiles và employees
update app.records e
set payload = jsonb_set(
  jsonb_set(
    jsonb_set(e.payload, '{full_name}', to_jsonb(p.payload->>'full_name')),
    '{email}', coalesce(to_jsonb(p.payload->>'email'), 'null'::jsonb)
  ),
  '{phone}', coalesce(to_jsonb(p.payload->>'phone'), 'null'::jsonb)
),
version = e.version + 1,
updated_at = now()
from app.records p
where e.entity_type = 'employees' and e.deleted_at is null
  and p.entity_type = 'profiles' and p.deleted_at is null
  and lower(e.payload->>'code') = lower(p.payload->>'employee_code')
  and p.payload->>'full_name' is not null
  and (
    e.payload->>'full_name' is distinct from p.payload->>'full_name'
    or e.payload->>'email' is distinct from p.payload->>'email'
    or e.payload->>'phone' is distinct from p.payload->>'phone'
  );
