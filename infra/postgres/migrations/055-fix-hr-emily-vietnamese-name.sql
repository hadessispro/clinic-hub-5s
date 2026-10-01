-- Sửa lỗi hiển thị Tiếng Việt cho Quản lý Emily và chức danh Quản trị Hành chính Tổng hợp

update app.records
set payload = payload || jsonb_build_object(
  'full_name', 'Quản lý Emily',
  'title', 'Quản trị Hành chính Tổng hợp'
),
version = version + 1,
updated_at = now()
where entity_type = 'employees' and record_key = 'hr-emily-employee';

update app.records
set payload = payload || jsonb_build_object(
  'full_name', 'Quản lý Emily'
),
version = version + 1,
updated_at = now()
where entity_type = 'profiles' and record_key = 'c982b7a2-c248-46c5-8f4e-f0d3d0fa23f9';
