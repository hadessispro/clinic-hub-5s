-- PostgreSQL on the Clinic Hub VPS is the only data store. Remove the old
-- cloud-backup queue and trigger so no write can be forwarded externally.

begin;

drop trigger if exists records_backup_outbox on app.records;
drop function if exists app.queue_record_backup();
drop view if exists app.v_sao_luu_da_chet;
drop view if exists app.v_suc_khoe_sao_luu;
drop table if exists app.backup_outbox;

commit;
