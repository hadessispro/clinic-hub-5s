-- Tài khoản BÁC SĨ KIỂM THỬ cho màn Sổ bệnh án điện tử.
--
-- Mã nhân sự cố ý đặt là BS01, trùng với bác sĩ trong dữ liệu mẫu của
-- src/services/so-benh-an.js. Dùng mã khác thì tài khoản này không ký được
-- lượt khám nào, vì kyLuotKham chỉ cho bác sĩ THỰC HIỆN ký lượt của mình —
-- và như vậy không kiểm thử được đúng luồng.
--
-- Đăng nhập:
--   Chi nhánh  : Nha Khoa 5S - Phạm Văn Chiêu
--   Tài khoản  : BS01     (hoặc bacsi.test@nhakhoa5s.local)
--   Mật khẩu   : 0900000002   ← số điện thoại trên hồ sơ, đổi ngay sau khi vào
--
-- Chạy:
--   ssh -i <khoá> root@31.97.191.177 \
--     "cd /opt/clinic-hub-5s && docker compose --env-file .env.vps exec -T postgres \
--        sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -v ON_ERROR_STOP=1 -At'" \
--     < scripts/tao-tai-khoan-bac-si-kiem-thu.sql

begin;

insert into app.records (entity_type, record_key, payload, origin)
values ('employees', '9e000000-0000-4000-8000-000000000003', jsonb_build_object(
  'id',             '9e000000-0000-4000-8000-000000000003',
  'code',           'BS01',
  'full_name',      'BS. Trần Minh Quân',
  'email',          'bacsi.test@nhakhoa5s.local',
  'phone',          '0900000002',
  'role',           'bac_si',
  'branch_id',      'pham-van-chieu',
  'department',     'Chuyên môn',
  'title',          'Bác sĩ Răng Hàm Mặt · Chỉnh nha',
  'status',         'active',
  'employment_type','test',
  'created_at',     now()::text,
  'updated_at',     now()::text
), 'vps')
on conflict (entity_type, record_key) do update
  set payload = excluded.payload, deleted_at = null, updated_at = now();

insert into app.records (entity_type, record_key, payload, origin)
values ('profiles', '9e000000-0000-4000-8000-000000000004', jsonb_build_object(
  'id',                  '9e000000-0000-4000-8000-000000000004',
  'employee_code',       'BS01',
  'full_name',           'BS. Trần Minh Quân',
  'role',                'bac_si',
  'branch_id',           'pham-van-chieu',
  'department',          'Chuyên môn',
  'title',               'Bác sĩ Răng Hàm Mặt · Chỉnh nha',
  'active',              true,
  'registration_status', 'approved',
  'created_at',          now()::text,
  'updated_at',          now()::text
), 'vps')
on conflict (entity_type, record_key) do update
  set payload = excluded.payload, deleted_at = null, updated_at = now();

commit;

-- Kiểm: không được trùng mã BS01 với hồ sơ có sẵn nào khác, vì lúc đăng nhập
-- hệ thống tra theo mã nhân sự và nhiều hồ sơ cùng mã thì nó chọn nhầm.
select 'Số hồ sơ mang mã BS01: ' || count(*)
  from app.records
 where entity_type = 'profiles' and deleted_at is null
   and lower(payload->>'employee_code') = 'bs01';

select 'Đã tạo: ' || (payload->>'employee_code') || ' · ' || (payload->>'full_name')
       || ' · vai trò ' || (payload->>'role')
       || ' · chi nhánh ' || (payload->>'branch_id')
  from app.records
 where record_key = '9e000000-0000-4000-8000-000000000004' and deleted_at is null;

-- ── XOÁ khi không còn dùng ───────────────────────────────────────────────
--   update app.records set deleted_at = now()
--    where record_key in ('9e000000-0000-4000-8000-000000000003',
--                         '9e000000-0000-4000-8000-000000000004');
--   delete from app.refresh_sessions where user_id in (
--     select user_id from app.local_accounts where employee_code = 'BS01');
--   delete from app.local_accounts where employee_code = 'BS01';
