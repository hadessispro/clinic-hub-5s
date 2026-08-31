-- Cấp quyền màn Kho vật tư cho bộ phận phụ tá.
--
-- CHỈ CHẠY SAU KHI ĐÃ TRIỂN KHAI mã nguồn có màn kho lên production. Đổi vai
-- trò trước khi mã lên là người dùng thấy mục "Kho vật tư" trên menu nhưng bấm
-- vào ra màn trắng — và họ sẽ báo lỗi cho một thứ chỉ đang chờ deploy.
--
-- HAI VAI TRÒ, KHÔNG PHẢI MỘT:
--
--   phu_ta         Phụ tá giữ kho — xem tồn, lập đơn, nhận hàng, lập phiếu xuất
--   phu_ta_truong  Trưởng bộ phận — mọi quyền trên, CỘNG duyệt đơn đặt, duyệt
--                  xuất kho, và giữ nguyên quyền quản lý bộ phận của vai trò
--                  leader cũ (duyệt đơn nghỉ, xem chấm công và lịch bộ phận)
--
-- Vì sao tách hai: chị Huỳnh đang mang vai trò `leader` và đang dùng hệ thống
-- thật. Gộp hai người vào chung một vai trò `phu_ta` thì chị ấy MẤT quyền duyệt
-- đơn của bộ phận; còn nếu cho `phu_ta` đủ quyền của trưởng bộ phận thì mọi
-- phụ tá đều duyệt được đơn nghỉ của nhau. Không cách nào trong hai cách đó
-- đúng, nên phải là hai vai trò.
--
-- phu_ta_truong là TẬP CHA của leader về cả view lẫn quyền: đổi sang nó không
-- lấy đi thứ gì chị Huỳnh đang có.
--
-- Chạy:
--   ssh -i <khoá> root@31.97.191.177 \
--     "cd /opt/clinic-hub-5s && docker compose --env-file .env.vps exec -T postgres \
--        sh -c 'psql -U \$POSTGRES_USER -d \$POSTGRES_DB -v ON_ERROR_STOP=1 -At'" \
--     < scripts/cap-quyen-kho-vat-tu.sql

begin;

-- ── Trước khi đổi: chụp lại vai trò hiện tại để đối chiếu và để lùi ──────
select 'TRƯỚC · ' || (payload->>'employee_code') || ' · ' || (payload->>'full_name')
       || ' · vai trò ' || coalesce(payload->>'role', '(trống)')
  from app.records
 where entity_type = 'profiles' and deleted_at is null
   and payload->>'employee_code' in ('PVC003', 'PVC-10199')
 order by payload->>'employee_code';

-- ── Nguyễn Thị Như Huỳnh · Trưởng bộ phận Phụ tá · Lê Văn Thọ ───────────
update app.records
   set payload = jsonb_set(payload, '{role}', '"phu_ta_truong"'),
       updated_at = now()
 where entity_type = 'profiles' and deleted_at is null
   and payload->>'employee_code' = 'PVC003';

-- ── Võ Đoàn Thái Tuấn · Phụ tá · Phạm Văn Chiêu ─────────────────────────
update app.records
   set payload = jsonb_set(payload, '{role}', '"phu_ta"'),
       updated_at = now()
 where entity_type = 'profiles' and deleted_at is null
   and payload->>'employee_code' = 'PVC-10199';

commit;

-- ── Sau khi đổi ──────────────────────────────────────────────────────────
select 'SAU · ' || (payload->>'employee_code') || ' · ' || (payload->>'full_name')
       || ' · vai trò ' || (payload->>'role')
       || ' · chi nhánh ' || (payload->>'branch_id')
  from app.records
 where entity_type = 'profiles' and deleted_at is null
   and payload->>'employee_code' in ('PVC003', 'PVC-10199')
 order by payload->>'employee_code';

-- Cả hai phải trả về đúng một dòng mỗi người. Nhiều dòng cùng mã nhân sự là
-- hồ sơ trùng, và lúc đăng nhập hệ thống sẽ chọn nhầm cái nào không đoán được.
select 'Số hồ sơ mang mã PVC003: '    || count(*) from app.records
 where entity_type='profiles' and deleted_at is null and payload->>'employee_code'='PVC003';
select 'Số hồ sơ mang mã PVC-10199: ' || count(*) from app.records
 where entity_type='profiles' and deleted_at is null and payload->>'employee_code'='PVC-10199';

-- ── LÙI LẠI nếu cần ──────────────────────────────────────────────────────
--   update app.records set payload = jsonb_set(payload,'{role}','"leader"')
--    where entity_type='profiles' and payload->>'employee_code'='PVC003';
--   update app.records set payload = jsonb_set(payload,'{role}','"staff"')
--    where entity_type='profiles' and payload->>'employee_code'='PVC-10199';

-- ── CÒN THIẾU: tài khoản đăng nhập của anh Tuấn ─────────────────────────
--
-- Anh Võ Đoàn Thái Tuấn CHƯA có dòng trong app.local_accounts, và hồ sơ nhân
-- sự của anh KHÔNG có số điện thoại. Hệ thống dựng tài khoản ở lần đăng nhập
-- đầu bằng cách đối chiếu mật khẩu với số điện thoại trên hồ sơ (apps/backend/
-- src/auth.ts). Không có số điện thoại thì không có gì để đối chiếu — anh ấy
-- không đăng nhập được bằng bất kỳ mật khẩu nào.
--
-- Sửa bằng cách bổ sung số điện thoại thật vào hồ sơ nhân sự, rồi anh ấy đăng
-- nhập lần đầu với chính số đó:
--
--   update app.records
--      set payload = jsonb_set(payload, '{phone}', '"<số điện thoại thật>"'),
--          updated_at = now()
--    where entity_type = 'employees' and deleted_at is null
--      and payload->>'code' = 'PVC-10199';
--
-- KHÔNG điền số giả cho xong: số điện thoại trong hồ sơ nhân sự còn dùng để
-- liên lạc và để đặt lại mật khẩu, điền sai là hỏng cả hai việc đó.
