-- ═══════════════════════════════════════════════════════════════════════════
-- HẠ QUYỀN BACKEND VẬN HÀNH · Điều kiện cần để két tiền có nghĩa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Khảo sát ngày 27/08/2026 phát hiện: toàn bộ service dùng chung một tài khoản
-- database duy nhất, và tài khoản đó là SUPERUSER. Superuser bỏ qua mọi lệnh
-- grant và revoke. Nghĩa là bức tường dựng ở migration 022 không chặn được gì:
-- backend vẫn chạy được `select count(*) from finance.journal_lines`.
--
-- Migration này tách vai:
--
--   clinic_app     : superuser, CHỈ dùng cho migrate. Không service nào khác dùng.
--   clinic_backend : tài khoản backend vận hành chạy hằng ngày. Không superuser.
--                    Đọc ghi app, marketing, source_pg, migration.
--                    KHÔNG có một quyền nào trên finance và finance_src.
--   finance_app    : tài khoản két tiền. Đọc ghi finance.
--                    Đọc vận hành CHỈ qua view finance_src, không chạm bảng gốc.
--
-- Mật khẩu clinic_backend đặt ngoài Git, ghi vào .env.vps.
--
-- An toàn khi chạy lại nhiều lần.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · TÀI KHOẢN BACKEND KHÔNG PHẢI SUPERUSER
-- ───────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'clinic_backend') then
    -- Không đặt mật khẩu ở đây vì file này nằm trong Git.
    create role clinic_backend login nosuperuser nocreatedb nocreaterole
      nobypassrls noreplication;
  else
    -- Chạy lại thì siết lại cho chắc, phòng trường hợp bị nâng quyền thủ công.
    alter role clinic_backend nosuperuser nocreatedb nocreaterole
      nobypassrls noreplication;
  end if;
end $$;

do $$
begin
  execute format('grant connect, temporary on database %I to clinic_backend',
                 current_database());
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2 · QUYỀN TRÊN PHẦN VẬN HÀNH
-- ───────────────────────────────────────────────────────────────────────────
-- Đủ để backend làm đúng việc nó đang làm, không hơn. DDL không cấp: khảo sát
-- cho thấy chỉ apps/backend/src/migrate.ts chạy DDL, mà file đó thuộc service
-- migrate, vẫn dùng clinic_app.

grant usage on schema app, marketing, public, source_pg, migration
  to clinic_backend;

grant select, insert, update, delete, truncate
  on all tables in schema app, marketing, public, source_pg, migration
  to clinic_backend;

grant usage, select, update
  on all sequences in schema app, marketing, public, source_pg, migration
  to clinic_backend;

grant execute
  on all functions in schema app, marketing, public, source_pg, migration
  to clinic_backend;

-- Bảng migrate tạo về sau cũng phải dùng được ngay, không phải sửa tay.
alter default privileges for role clinic_app
  in schema app, marketing, public, source_pg, migration
  grant select, insert, update, delete, truncate on tables to clinic_backend;
alter default privileges for role clinic_app
  in schema app, marketing, public, source_pg, migration
  grant usage, select, update on sequences to clinic_backend;
alter default privileges for role clinic_app
  in schema app, marketing, public, source_pg, migration
  grant execute on functions to clinic_backend;


-- ───────────────────────────────────────────────────────────────────────────
-- 3 · BỨC TƯỜNG
-- ───────────────────────────────────────────────────────────────────────────
-- Vận hành không đọc được tài chính. Đây là điều 2 trong nguyên tắc bảo mật.
-- Thu hồi cả từ public để không ai thừa hưởng gián tiếp.

revoke all on schema finance, finance_src from clinic_backend, public;
revoke all on all tables in schema finance, finance_src from clinic_backend, public;
revoke all on all sequences in schema finance from clinic_backend, public;
revoke all on all functions in schema finance from clinic_backend, public;

alter default privileges for role clinic_app in schema finance, finance_src
  revoke all on tables from clinic_backend, public;
alter default privileges for role clinic_app in schema finance
  revoke all on sequences from clinic_backend, public;


-- ───────────────────────────────────────────────────────────────────────────
-- 4 · SIẾT CHIỀU NGƯỢC LẠI
-- ───────────────────────────────────────────────────────────────────────────
-- Migration 022 cấp cho finance_app quyền đọc thẳng app.records và
-- marketing.*. Quyền đó thừa: view trong finance_src không khai báo
-- security_invoker nên chạy bằng quyền của chủ view là clinic_app, người gọi
-- chỉ cần quyền trên view. Để nguyên là vi phạm điều 3: tài chính phải đọc
-- qua view chỉ phơi đúng cột cần, không nhìn thấy bảng gốc.

revoke all on app.records from finance_app;
revoke all on marketing.leads, marketing.pg_attendance,
              marketing.pg_shift_assignments from finance_app;
revoke usage on schema app, marketing from finance_app;

-- finance_app cũng không được đụng vào phần vận hành ở bất kỳ dạng nào khác.
revoke all on all tables in schema app, marketing, source_pg, migration
  from finance_app;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- SAU KHI CHẠY, PHẢI LÀM TIẾP HAI VIỆC NGOÀI SQL:
--
--   1. Đặt mật khẩu clinic_backend, ghi BACKEND_DB_USER và BACKEND_DB_PASSWORD
--      vào .env.vps.
--   2. Đổi DATABASE_URL của backend, backup-sync, shadow-sync sang tài khoản
--      mới trong docker-compose.yml. Service migrate GIỮ NGUYÊN clinic_app.
--
-- Chưa làm xong hai việc đó thì backend vẫn chạy bằng superuser và bức tường
-- ở mục 3 vẫn chưa có tác dụng.
-- ═══════════════════════════════════════════════════════════════════════════
