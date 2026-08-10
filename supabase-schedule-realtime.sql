-- Enable live schedule and approval updates in Clinic Hub.
-- Safe to run repeatedly in Supabase SQL Editor.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Publication supabase_realtime does not exist';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schedule_assignments'
  ) then
    execute 'alter publication supabase_realtime add table public.schedule_assignments';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'schedule_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.schedule_requests';
  end if;
end
$$;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename in ('schedule_assignments', 'schedule_requests')
order by tablename;
