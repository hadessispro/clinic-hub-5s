-- HR account was imported with an administrative role. Keep its source
-- identity, but apply the intended HR permission set.

create table if not exists app.hr_role_sync_audit (
  id bigserial primary key,
  executed_at timestamptz not null default now(),
  profile_before jsonb not null
);

insert into app.hr_role_sync_audit(profile_before)
select payload from app.records
where entity_type='profiles' and record_key='c982b7a2-c248-46c5-8f4e-f0d3d0fa23f9';

update app.records
set payload=payload || jsonb_build_object('role','hr','department','hcth','updated_at',now()::text),
    origin='vps',version=version+1,updated_at=now()
where entity_type='profiles' and record_key='c982b7a2-c248-46c5-8f4e-f0d3d0fa23f9';
