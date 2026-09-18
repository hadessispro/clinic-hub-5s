-- Migration 052: Quản lý quy tắc thông báo Telegram & Chính sách cảnh báo an ninh
set client_encoding = 'UTF8';

-- 1. Bảng quy tắc thông báo
create table if not exists app.notification_rules (
  action_type    text primary key,
  category       text not null default 'security' check (category in ('media', 'auth', 'security', 'attendance')),
  severity       text not null default 'info' check (severity in ('critical', 'high', 'info')),
  should_notify  boolean not null default false,
  description    text,
  updated_at     timestamptz not null default now()
);

comment on table app.notification_rules is
  'Cấu hình chính sách cảnh báo Telegram: Phân định rõ sự kiện nào bắn thông báo tức thì, sự kiện nào gom báo cáo ngày.';

-- 2. Dữ liệu mặc định ban đầu
insert into app.notification_rules (action_type, category, severity, should_notify, description)
values
  ('delete_image', 'media', 'critical', true, 'Xóa ảnh hồ sơ lâm sàng bệnh nhân'),
  ('delete_folder', 'media', 'critical', true, 'Xóa thư mục ảnh bệnh nhân'),
  ('change_role', 'security', 'critical', true, 'Thay đổi vai trò hoặc cấp quyền quản trị'),
  ('lock_account', 'security', 'critical', true, 'Khóa tài khoản nhân sự'),
  ('login_anomaly', 'security', 'high', true, 'Đăng nhập ngoài giờ hành chính (22h - 6h) hoặc từ IP lạ'),
  ('login_failed_repeated', 'security', 'high', true, 'Đăng nhập sai mật khẩu liên tiếp (từ 3 lần trở lên)'),
  ('console_tamper', 'security', 'critical', true, 'Can thiệp mã nguồn hệ thống qua DevTools / Console'),
  ('f12_opened', 'security', 'high', true, 'Mở bảng điều khiển DevTools (F12) trên trình duyệt'),
  ('bulk_media_access', 'security', 'high', true, 'Tải hoặc xem ảnh lâm sàng số lượng lớn bất thường trong 5 phút'),
  ('gps_anomaly', 'attendance', 'high', true, 'Chấm công GPS nằm ngoài phạm vi phòng khám hoặc bất thường'),
  ('upload_image', 'media', 'info', false, 'Tải ảnh lâm sàng mới lên kho (chỉ ghi log + gom báo cáo 22h)'),
  ('create_folder', 'media', 'info', false, 'Tạo thư mục hồ sơ bệnh nhân mới (chỉ ghi log + gom báo cáo 22h)'),
  ('view_image', 'media', 'info', false, 'Xem ảnh lâm sàng (chỉ ghi log + gom báo cáo 22h)'),
  ('login_success', 'auth', 'info', false, 'Đăng nhập tài khoản bình thường (chỉ ghi log + gom báo cáo 22h)')
on conflict (action_type) do nothing;

-- 3. Bảng lưu trữ lạnh (Cold Archive) cho media_audit_log
create table if not exists app.media_audit_log_archive (
  like app.media_audit_log including all
);

comment on table app.media_audit_log_archive is
  'Kho lưu trữ lạnh cho nhật ký truy xuất hình ảnh cũ hơn 90 ngày nhằm tối ưu dung lượng và hiệu năng.';

-- 4. Thủ tục lưu trữ nhật ký cũ (Log Archiving Procedure)
-- ponytail: table partitioning deferred until media_audit_log exceeds 500k rows
create or replace function app.archive_old_audit_logs(days_to_keep int default 90)
returns int language plpgsql as $$
declare
  moved_count int;
begin
  set local session_replication_role = 'replica';
  with moved as (
    delete from app.media_audit_log
    where created_at < now() - (days_to_keep || ' days')::interval
    returning *
  )
  insert into app.media_audit_log_archive
  select * from moved;
  get diagnostics moved_count = row_count;
  set local session_replication_role = 'origin';
  return moved_count;
end $$;

-- 5. Phân quyền cho role backend
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'clinic_backend') then
    grant select, insert, update, delete on table app.notification_rules to clinic_backend;
    grant select, insert on table app.media_audit_log_archive to clinic_backend;
  end if;
end $$;
