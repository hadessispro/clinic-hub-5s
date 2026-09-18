-- Migration 050: Bổ sung quản lý thư mục đồng bộ Google Drive cho Phụ tá & Nhật ký kiểm toán an ninh

-- 1. Cập nhật check constraint trên app.media_audit_log để hỗ trợ hành động 'create_folder'
alter table app.media_audit_log drop constraint if exists media_audit_log_action_check;
alter table app.media_audit_log add constraint media_audit_log_action_check
  check (action in ('upload', 'view', 'download', 'update_note', 'delete', 'create_folder', 'delete_folder'));

-- 2. Tạo bảng danh mục thư mục đồng bộ khách hàng cho riêng mỗi tài khoản Phụ tá
create table if not exists app.patient_media_folders (
  id                      bigserial primary key,
  assistant_code          text not null,
  assistant_name          text not null,
  patient_code            text not null,
  patient_name            text not null,
  branch_id               text not null default 'le_van_tho',
  google_drive_folder_id  text not null,
  google_drive_web_link   text,
  notes                   text not null default '',
  created_by              text not null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists patient_media_folders_asst_patient_idx
  on app.patient_media_folders (lower(trim(assistant_code)), lower(trim(patient_code)));

create index if not exists patient_media_folders_asst_idx
  on app.patient_media_folders (lower(trim(assistant_code)), created_at desc);

create index if not exists patient_media_folders_patient_idx
  on app.patient_media_folders (lower(trim(patient_code)), created_at desc);

create index if not exists patient_media_folders_branch_idx
  on app.patient_media_folders (branch_id, created_at desc);

comment on table app.patient_media_folders is
  'Quản lý danh sách thư mục đồng bộ lưu trữ phân vùng theo từng Phụ tá và Khách hàng.';

-- 3. Phân quyền bảng mới cho clinic_backend
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'clinic_backend') then
    grant select, insert, update, delete on table app.patient_media_folders to clinic_backend;
    grant usage, select on sequence app.patient_media_folders_id_seq to clinic_backend;
  end if;
end $$;

-- 4. Đồng bộ dữ liệu thư mục ban đầu từ các ảnh đã có trong app.patient_media (nếu có)
insert into app.patient_media_folders (
  assistant_code, assistant_name, patient_code, patient_name, branch_id,
  google_drive_folder_id, google_drive_web_link, created_by, created_at, updated_at
)
select
  created_by as assistant_code,
  coalesce(nullif(assistant_name, ''), created_by_name, created_by) as assistant_name,
  patient_code,
  patient_name,
  branch_id,
  google_drive_folder_id,
  'https://drive.google.com/drive/folders/' || google_drive_folder_id,
  created_by,
  min(created_at),
  max(created_at)
from app.patient_media
where google_drive_folder_id is not null and google_drive_folder_id <> ''
group by created_by, assistant_name, created_by_name, patient_code, patient_name, branch_id, google_drive_folder_id
on conflict (lower(trim(assistant_code)), lower(trim(patient_code))) do nothing;
