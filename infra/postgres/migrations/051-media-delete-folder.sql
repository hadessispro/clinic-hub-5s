-- Migration 051: Hỗ trợ hành động delete_folder trong media_audit_log
set client_encoding = 'UTF8';

alter table app.media_audit_log drop constraint if exists media_audit_log_action_check;
alter table app.media_audit_log add constraint media_audit_log_action_check
  check (action in ('upload', 'view', 'download', 'update_note', 'delete', 'create_folder', 'delete_folder'));
