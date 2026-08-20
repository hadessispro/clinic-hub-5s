\set ON_ERROR_STOP on
begin;

-- These four application rows were entered after the same phone already
-- existed in the legacy PG source.  Keep the source-linked customer as the
-- canonical row and move the later assignment audit trail before deletion.
create temporary table pg_overlap_merge(old_id uuid primary key, keep_id uuid not null);
insert into pg_overlap_merge values
  ('cb488f19-a5c2-4b60-8a65-19a610af704a','0ad77173-6c49-49d8-8f11-98250b618770'),
  ('3543b48b-3866-4b4c-bbbe-361079472be7','7fad31ee-e41f-4088-9914-059c9668f252'),
  ('efc69ab0-5e6b-44b8-9725-ebb8362817d8','4739f762-89eb-4f76-bf28-a01bb780aeb8'),
  ('767bb7d2-1224-4dd5-88a0-df6d7905ff38','b84ab559-2872-433c-9148-5ddaf229a816');

-- Preserve a newer active assignment if the duplicate row carries one.
update marketing.leads keep
set assigned_telesale_code = old.assigned_telesale_code,
    assigned_by_code = old.assigned_by_code,
    assigned_at = old.assigned_at,
    updated_at = now()
from pg_overlap_merge merge
join marketing.leads old on old.id = merge.old_id
where keep.id = merge.keep_id
  and old.assigned_telesale_code is not null;

update marketing.call_logs log
set lead_id = merge.keep_id
from pg_overlap_merge merge
where log.lead_id = merge.old_id;

update marketing.lead_assignment_history history
set lead_id = merge.keep_id
from pg_overlap_merge merge
where history.lead_id = merge.old_id;

delete from marketing.leads old
using pg_overlap_merge merge
where old.id = merge.old_id;

insert into marketing.audit_log(actor_code, action, entity_type, detail)
values ('ADMIN-IT', 'merge_pg_source_phone_overlaps', 'marketing.leads',
  jsonb_build_object('merged_rows', 4, 'merged_at', now()));

commit;
