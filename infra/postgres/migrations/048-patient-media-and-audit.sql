-- Migration 048: Lưu trữ ảnh bệnh nhân trên Google Drive 5TB & Nhật ký kiểm toán an ninh (Audit Trail)
--
-- Bảng 1: app.patient_media - Quản lý siêu dữ liệu ảnh bệnh nhân
-- Bảng 2: app.media_audit_log - Ghi vết bất biến (Append-Only) mọi hành vi: xem ảnh, tải về, thêm ảnh, sửa ghi chú, xoá

create table if not exists app.patient_media (
  id                      bigserial primary key,
  patient_code            text not null,
  patient_name            text not null,
  encounter_id            text,
  branch_id               text not null default 'le_van_tho',
  assistant_name          text not null default '',
  doctor_name             text not null default '',
  file_name               text not null,
  mime_type               text not null default 'image/jpeg',
  file_size               bigint not null default 0,
  google_drive_file_id    text not null,
  google_drive_folder_id  text not null,
  google_drive_web_link   text,
  category                text not null default 'trong_mieng' check (
                            category in ('trong_mieng', 'ngoai_mat', 'can_canh', 'xquang', 'khac')
                          ),
  notes                   text not null default '',
  created_by              text not null,
  created_by_name         text not null default '',
  created_at              timestamptz not null default now(),
  is_deleted              boolean not null default false,
  deleted_by              text,
  deleted_at              timestamptz
);

create index if not exists patient_media_patient_code_idx on app.patient_media(patient_code, created_at desc) where not is_deleted;
create index if not exists patient_media_assistant_idx on app.patient_media(assistant_name, created_at desc);
create index if not exists patient_media_branch_idx on app.patient_media(branch_id, created_at desc);
create index if not exists patient_media_drive_id_idx on app.patient_media(google_drive_file_id);

comment on table app.patient_media is
  'Quản lý danh mục ảnh hồ sơ điều trị lưu trên Google Drive 5TB.';

-- Bảng kiểm toán truy cập hình ảnh
create table if not exists app.media_audit_log (
  id           bigserial primary key,
  media_id     bigint references app.patient_media(id) on delete set null,
  patient_code text not null,
  action       text not null check (action in ('upload', 'view', 'download', 'update_note', 'delete')),
  actor_code   text not null,
  actor_name   text not null default '',
  actor_role   text not null default '',
  branch_id    text,
  client_ip    text,
  user_agent   text,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists media_audit_log_media_idx on app.media_audit_log(media_id, created_at desc);
create index if not exists media_audit_log_patient_idx on app.media_audit_log(patient_code, created_at desc);
create index if not exists media_audit_log_actor_idx on app.media_audit_log(actor_code, created_at desc);
create index if not exists media_audit_log_action_idx on app.media_audit_log(action, created_at desc);
create index if not exists media_audit_log_created_idx on app.media_audit_log(created_at desc);

comment on table app.media_audit_log is
  'Nhật ký kiểm toán an ninh hình ảnh bệnh nhân: Ai vào xem, tải về, thêm hoặc xoá ảnh. Bất biến không xoá.';

-- Ràng buộc bất biến (Append-Only): Không cho phép UPDATE hoặc DELETE trong bảng nhật ký kiểm toán
create or replace function app.media_audit_bat_bien()
returns trigger language plpgsql as $$
begin
  raise exception 'Nhật ký hình ảnh mang tính pháp lý kiểm toán, không được phép sửa hoặc xoá';
end $$;

drop trigger if exists media_audit_guard on app.media_audit_log;
create trigger media_audit_guard
  before update or delete on app.media_audit_log
  for each row execute function app.media_audit_bat_bien();

-- Cấp quyền cho role clinic_backend theo mô hình Least Privilege
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'clinic_backend') then
    grant select, insert, update on table app.patient_media to clinic_backend;
    grant usage, select on sequence app.patient_media_id_seq to clinic_backend;
    grant select, insert on table app.media_audit_log to clinic_backend;
    grant usage, select on sequence app.media_audit_log_id_seq to clinic_backend;
  end if;
end $$;
