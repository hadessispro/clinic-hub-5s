-- Nhật ký mọi thao tác động vào tài khoản đăng nhập.
--
-- ─────────────────────────────────────────────────────────────────────────
-- VÌ SAO CẦN
-- ─────────────────────────────────────────────────────────────────────────
--
-- apps/backend/src/auth.ts nhắc tới chữ "audit" đúng KHÔNG LẦN NÀO. Nghĩa là
-- đặt lại mật khẩu, mở khoá, tạo tài khoản — không thao tác nào để lại dấu.
--
-- Lỗ này có từ trước: /auth/provision vốn đã đặt lại được mật khẩu của bất kỳ
-- tài khoản nào đang tồn tại, kèm mở khoá luôn. Nó chỉ ít lộ ra vì giao diện
-- không có nút gọi tới. Thêm nút mà không thêm nhật ký là làm một quyền nguy
-- hiểm trở nên tiện dùng mà vẫn vô hình.
--
-- Câu hỏi cần trả lời được khi có sự cố là "ai đã đặt lại mật khẩu của người
-- này, lúc nào, từ máy nào". Không có bảng này thì câu đó không trả lời được,
-- và một quyền không truy vết được thì không kiểm soát được.
--
-- ─────────────────────────────────────────────────────────────────────────
-- KHÔNG BAO GIỜ GHI MẬT KHẨU
-- ─────────────────────────────────────────────────────────────────────────
--
-- Bảng này ghi AI làm GÌ với AI, không ghi nội dung. Không mật khẩu, không
-- mã băm, không muối. Một nhật ký chứa mật khẩu còn nguy hiểm hơn việc không
-- có nhật ký nào.

create table if not exists app.auth_audit (
  id           bigserial primary key,
  hanh_dong    text not null
                 check (hanh_dong in ('dat_lai_mat_khau','mo_khoa','tao_tai_khoan',
                                      'doi_vai_tro','khoa_tai_khoan','mo_khoa_tu_dong')),
  -- Người thực hiện
  actor_code   text,
  actor_role   text,
  actor_ip     text,
  -- Người bị tác động
  muc_tieu_ma  text not null,
  muc_tieu_vai_tro text,
  -- Chi tiết không nhạy cảm: vai trò cũ và mới khi đổi quyền, lý do, v.v.
  chi_tiet     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists auth_audit_muc_tieu_idx on app.auth_audit(muc_tieu_ma, created_at desc);
create index if not exists auth_audit_actor_idx    on app.auth_audit(actor_code, created_at desc);
create index if not exists auth_audit_thoi_gian_idx on app.auth_audit(created_at desc);

comment on table app.auth_audit is
  'Ai làm gì với tài khoản đăng nhập của ai. Không bao giờ chứa mật khẩu hay mã băm.';

-- Nhật ký chỉ ghi thêm. Sửa hay xoá được thì nó không còn là bằng chứng, và
-- người đầu tiên muốn xoá nó chính là người vừa làm điều cần che.
create or replace function app.auth_audit_bat_bien()
returns trigger language plpgsql as $$
begin
  raise exception 'Nhật ký tài khoản không được sửa hoặc xoá';
end $$;

drop trigger if exists auth_audit_guard on app.auth_audit;
create trigger auth_audit_guard
  before update or delete on app.auth_audit
  for each row execute function app.auth_audit_bat_bien();
