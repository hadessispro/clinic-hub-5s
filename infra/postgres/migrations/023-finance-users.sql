-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE VAULT · Tài khoản người dùng riêng
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Đây là tài khoản ỨNG DỤNG cho người, khác hoàn toàn với role database
-- finance_app mà máy dùng để kết nối. Hai thứ này hay bị nhầm:
--
--   finance_app  : tài khoản database, mật khẩu ngẫu nhiên trong .env.vps,
--                  không ai gõ, không ai nhớ.
--   finance.users: tài khoản người, kế toán gõ khi đăng nhập, có thể tự sửa
--                  hồ sơ và tự đổi mật khẩu.
--
-- Tài khoản ở đây HOÀN TOÀN TÁCH BIỆT với tài khoản hệ vận hành. Người có
-- tài khoản vận hành không mặc nhiên vào được két tiền.

begin;

create table if not exists finance.users (
  id                   uuid primary key default gen_random_uuid(),
  username             text not null unique,
  password_hash        text not null,
  full_name            text not null,
  email                text,
  phone                text,
  -- accountant: ghi sổ, nhập liệu, xem tất cả
  -- viewer     : chỉ xem báo cáo tổng, KHÔNG xem lương từng người
  -- vault_admin: quản trị tài khoản và khóa kỳ
  role                 text not null default 'accountant'
                         check (role in ('accountant', 'viewer', 'vault_admin')),
  is_active            boolean not null default true,
  -- Bắt đổi mật khẩu ở lần đăng nhập đầu. Mật khẩu do người khác đặt hộ
  -- thì không được phép dùng lâu dài.
  must_change_password boolean not null default true,
  failed_attempts      integer not null default 0,
  locked_until         timestamptz,
  last_login_at        timestamptz,
  password_changed_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column finance.users.role is
  'viewer cố ý không xem được lương từng người. Xem tổng chi phí lương thì được.';

create table if not exists finance.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references finance.users(id) on delete cascade,
  refresh_hash  text not null,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz
);
create index if not exists finance_sessions_user_idx
  on finance.sessions(user_id) where revoked_at is null;

-- Người dùng tự sửa hồ sơ được, nhưng không tự nâng quyền cho mình.
-- Chặn ngay tại database chứ không chỉ ẩn nút trên giao diện.
create or replace function finance.guard_self_escalation() returns trigger
language plpgsql as $$
begin
  if current_setting('finance.self_edit', true) = new.id::text then
    if new.role is distinct from old.role then
      raise exception 'Không được tự đổi vai trò của chính mình.' using errcode = '42501';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'Không được tự thay đổi trạng thái kích hoạt.' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists finance_users_guard on finance.users;
create trigger finance_users_guard before update on finance.users
  for each row execute function finance.guard_self_escalation();

grant select, insert, update, delete on finance.users, finance.sessions to finance_app;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- TẠO TÀI KHOẢN KẾ TOÁN ĐẦU TIÊN
--
-- Không đặt mật khẩu trong file này vì nó nằm trong Git. Dùng công cụ:
--
--   docker compose --env-file .env.vps run --rm finance node src/cli.js \
--     create-user KeToan "Ho ten ke toan"
--
-- Công cụ sinh mật khẩu tạm ngẫu nhiên, in ra MỘT LẦN trên màn hình, và đặt
-- must_change_password = true. Kế toán đăng nhập lần đầu là bị bắt đổi ngay.
-- ═══════════════════════════════════════════════════════════════════════════
