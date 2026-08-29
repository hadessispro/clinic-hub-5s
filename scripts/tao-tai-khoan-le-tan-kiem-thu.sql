-- Tài khoản LỄ TÂN KIỂM THỬ.
--
-- Vì sao cần script này thay vì tạo trên giao diện: production hiện chỉ có
-- một tài khoản admin_it và một tài khoản hr, không có admin lẫn superadmin.
-- admin_it có màn Quản trị hệ thống (đặt vai trò, đặt lại mật khẩu) nhưng
-- KHÔNG có màn Hồ sơ nhân sự; hr thì ngược lại. Không vai trò nào đi trọn
-- được đường "tạo nhân sự mới rồi gán vai trò lễ tân".
--
-- MẬT KHẨU LẦN ĐẦU LÀ SỐ ĐIỆN THOẠI trên hồ sơ nhân viên. Backend tự tạo
-- tài khoản đăng nhập ở lần đăng nhập đầu tiên khi mật khẩu khớp số điện
-- thoại (apps/backend/src/auth.ts, nhánh auto-provision). Ở đây số điện thoại
-- là 0900000001 — một số rõ ràng không có thật, cố ý.
--
-- ĐỔI MẬT KHẨU NGAY sau lần đăng nhập đầu, và XOÁ tài khoản này trước khi
-- đưa hệ thống vào chạy thật. Lệnh xoá nằm ở cuối file.
--
-- Đăng nhập:
--   Tài khoản  : LT-TEST        (hoặc letan.test@nhakhoa5s.local)
--   Chi nhánh  : Phạm Văn Chiêu — BẮT BUỘC chọn đúng, vì lễ tân bị ràng theo
--                chi nhánh (le_tan không nằm trong branchFlexible)
--   Mật khẩu   : số điện thoại ở dưới
--
-- Chạy:
--   ssh -i <khoá> root@31.97.191.177 \
--     "cd /opt/clinic-hub-5s && docker compose --env-file .env.vps exec -T postgres \
--        sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -v ON_ERROR_STOP=1 -At'" \
--     < scripts/tao-tai-khoan-le-tan-kiem-thu.sql

begin;

-- UUID cố định, dễ nhận ra và dễ xoá. Chạy lại nhiều lần không sinh bản trùng.
insert into app.records (entity_type, record_key, payload, origin)
values ('employees', '9e000000-0000-4000-8000-000000000001', jsonb_build_object(
  'id',             '9e000000-0000-4000-8000-000000000001',
  'code',           'LT-TEST',
  'full_name',      'Lễ tân kiểm thử',
  'email',          'letan.test@nhakhoa5s.local',
  'phone',          '0900000001',
  'role',           'le_tan',
  'branch_id',      'pham-van-chieu',
  'department',     'Lễ tân',
  'title',          'Lễ tân',
  'status',         'active',
  'employment_type','test',
  'created_at',     now()::text,
  'updated_at',     now()::text
), 'vps')
on conflict (entity_type, record_key) do update
  set payload = excluded.payload, deleted_at = null, updated_at = now();

insert into app.records (entity_type, record_key, payload, origin)
values ('profiles', '9e000000-0000-4000-8000-000000000002', jsonb_build_object(
  'id',                  '9e000000-0000-4000-8000-000000000002',
  'employee_code',       'LT-TEST',
  'full_name',           'Lễ tân kiểm thử',
  'role',                'le_tan',
  'branch_id',           'pham-van-chieu',
  'department',          'Lễ tân',
  'title',               'Lễ tân',
  'active',              true,
  'registration_status', 'approved',
  'created_at',          now()::text,
  'updated_at',          now()::text
), 'vps')
on conflict (entity_type, record_key) do update
  set payload = excluded.payload, deleted_at = null, updated_at = now();

commit;

-- Kiểm lại: phải ra đúng một dòng, vai trò le_tan, chi nhánh pham-van-chieu.
select 'Đã tạo: ' || (payload->>'employee_code') || ' · vai trò ' || (payload->>'role')
       || ' · chi nhánh ' || (payload->>'branch_id')
       || ' · hoạt động ' || (payload->>'active')
  from app.records
 where record_key = '9e000000-0000-4000-8000-000000000002'
   and deleted_at is null;

-- Kiểm hồ sơ nhân viên có số điện thoại — thiếu nó thì không đăng nhập lần đầu được.
select 'Số điện thoại làm mật khẩu lần đầu: ' || (payload->>'phone')
  from app.records
 where record_key = '9e000000-0000-4000-8000-000000000001'
   and deleted_at is null;

-- ── XOÁ khi không còn dùng ───────────────────────────────────────────────
-- Xoá mềm hồ sơ, và xoá hẳn tài khoản đăng nhập cùng mọi phiên đang mở:
--
--   update app.records set deleted_at = now()
--    where record_key in ('9e000000-0000-4000-8000-000000000001',
--                         '9e000000-0000-4000-8000-000000000002');
--   delete from app.refresh_sessions where user_id in (
--     select user_id from app.local_accounts where employee_code = 'LT-TEST');
--   delete from app.local_accounts where employee_code = 'LT-TEST';
