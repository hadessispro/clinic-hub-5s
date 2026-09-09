-- Migration 045: Hệ thống kiểm soát an ninh, F12 Console Tamper, Đăng nhập/Đăng xuất và Bot Telegram
--
-- Ghi nhận bất biến (Append-Only) các sự kiện:
-- - login_success, login_failed, logout
-- - f12_opened, console_tamper
-- - gps_anomaly, suspicious_activity, server_alert

create table if not exists app.security_events (
  id           bigserial primary key,
  event_type   text not null check (event_type in (
                 'login_success', 'login_failed', 'logout',
                 'f12_opened', 'console_tamper', 'gps_anomaly',
                 'suspicious_activity', 'server_alert'
               )),
  severity     text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  actor_code   text,
  actor_name   text,
  actor_role   text,
  branch_id    text,
  client_ip    text,
  user_agent   text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists security_events_type_idx on app.security_events(event_type, created_at desc);
create index if not exists security_events_actor_idx on app.security_events(actor_code, created_at desc);
create index if not exists security_events_created_idx on app.security_events(created_at desc);
create index if not exists security_events_branch_idx on app.security_events(branch_id, created_at desc);

comment on table app.security_events is
  'Nhật ký an ninh phòng khám: Đăng nhập, đăng xuất, can thiệp F12, cảnh báo máy chủ. Bất biến không xoá.';

-- Cơ chế chống xoá/sửa (Append-Only)
create or replace function app.security_events_bat_bien()
returns trigger language plpgsql as $$
begin
  raise exception 'Nhật ký an ninh không được sửa hoặc xoá';
end $$;

drop trigger if exists security_events_guard on app.security_events;
create trigger security_events_guard
  before update or delete on app.security_events
  for each row execute function app.security_events_bat_bien();

-- Bảng lưu cấu hình vận hành của Bot Telegram (ví dụ: Chat ID của quản trị viên đã kích hoạt)
create table if not exists app.bot_config (
  config_key   text primary key,
  config_value text not null,
  updated_at   timestamptz not null default now()
);

comment on table app.bot_config is
  'Lưu trữ trạng thái bot telegram và danh sách chat_id nhận thông báo khẩn.';

-- Cấp quyền cho clinic_backend theo mô hình Least Privilege
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'clinic_backend') then
    grant select, insert, update on table app.security_events to clinic_backend;
    grant select, insert, update, delete on table app.bot_config to clinic_backend;
    grant usage, select on sequence app.security_events_id_seq to clinic_backend;
  end if;
end $$;
