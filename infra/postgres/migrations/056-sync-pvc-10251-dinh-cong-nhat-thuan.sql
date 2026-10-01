-- Đồng bộ thông tin nhân sự PVC-10251 thành Đinh Công Nhật Thuần
-- (Khắc phục dữ liệu cũ của SupPG Nguyễn Cao Hồng Ngọc bị ghi đè nhầm từ bảng tính đối soát)

-- 1. Cập nhật bảng nhân sự (employees)
update app.records
set payload = payload || jsonb_build_object(
  'full_name', 'Đinh Công Nhật Thuần',
  'email', 'dinhcongnhatthuan@gmail.com',
  'phone', '0394777424',
  'title', 'Nhân viên Phát triển thị trường'
),
version = version + 1,
updated_at = now()
where entity_type = 'employees' and (payload->>'code' = 'PVC-10251' or record_key = '82189869-1ed5-4815-a74c-2e117ef08e2a');

-- 2. Cập nhật hồ sơ tài khoản (profiles) để đảm bảo đồng bộ 100%
update app.records
set payload = payload || jsonb_build_object(
  'full_name', 'Đinh Công Nhật Thuần',
  'email', 'dinhcongnhatthuan@gmail.com',
  'phone', '0394777424',
  'title', 'Nhân viên Phát triển thị trường',
  'role', 'support_marketing',
  'department', 'marketing',
  'branch_id', 'pham-van-chieu'
),
version = version + 1,
updated_at = now()
where entity_type = 'profiles' and (payload->>'employee_code' = 'PVC-10251' or record_key = 'staff-profile-pvc-10251');

-- 3. Mở khóa tài khoản đăng nhập và reset số lần sai mật khẩu
update app.local_accounts
set failed_attempts = 0,
    locked_until = null,
    email = 'dinhcongnhatthuan@gmail.com',
    updated_at = now()
where lower(employee_code) = 'pvc-10251' or profile_key = 'staff-profile-pvc-10251';

-- 4. Cập nhật ghi chú phân ca đối soát công của PVC-10251
update app.records
set payload = jsonb_set(
  payload, 
  '{note}', 
  to_jsonb(replace(payload->>'note', 'Nguyễn Cao Hồng Ngọc', 'Đinh Công Nhật Thuần'))
),
version = version + 1,
updated_at = now()
where entity_type = 'schedule_assignments' 
  and (payload->>'employee_code' = 'PVC-10251' or payload->>'owner_code' = 'PVC-10251')
  and payload->>'note' like '%Nguyễn Cao Hồng Ngọc%';

-- 5. Cập nhật thông báo lời chúc / hệ thống nếu có
update app.records
set payload = jsonb_set(
  payload,
  '{body}',
  to_jsonb(replace(payload->>'body', 'Nguyễn Cao Hồng Ngọc', 'Đinh Công Nhật Thuần'))
),
version = version + 1,
updated_at = now()
where entity_type = 'notifications'
  and payload->>'user_id' = 'staff-profile-pvc-10251'
  and payload->>'body' like '%Nguyễn Cao Hồng Ngọc%';
