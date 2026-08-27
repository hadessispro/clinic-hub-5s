-- The operational list stays lightweight.  Consultation-specific service
-- changes live as append-only events in call_logs and are read only when a
-- user opens an individual customer dossier.
alter table marketing.call_logs add column if not exists service_type text;
alter table marketing.call_logs add column if not exists next_action text;

create index if not exists marketing_audit_lead_timeline_idx
  on marketing.audit_log(entity_type, entity_id, created_at desc);
