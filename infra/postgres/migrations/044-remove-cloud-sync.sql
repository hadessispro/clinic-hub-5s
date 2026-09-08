-- PostgreSQL on the Clinic Hub VPS is the only data store. Remove the old
-- cloud-backup queue and trigger so no write can be forwarded externally.
--
-- This migration is intentionally idempotent. Production may already have
-- applied the earlier duplicate-number filename; rerunning the DROP IF EXISTS
-- statements under the unique 044 identifier is safe.

begin;

drop trigger if exists records_backup_outbox on app.records;
drop function if exists app.queue_record_backup();
drop view if exists app.v_sao_luu_da_chet;
drop view if exists app.v_suc_khoe_sao_luu;

-- Keep historical rows recoverable on a fresh installation. The disabled
-- name is not referenced by any runtime service and makes the state explicit.
do $$
begin
  if to_regclass('app.backup_outbox') is not null
     and to_regclass('app.backup_outbox_cloud_disabled') is null then
    alter table app.backup_outbox rename to backup_outbox_cloud_disabled;
  end if;
end;
$$;

commit;
