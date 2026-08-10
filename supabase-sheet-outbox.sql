begin;
create table if not exists public.integration_outbox(
  id bigint generated always as identity primary key,
  entity_type text not null check(entity_type in ('attendance','leave_request')),
  entity_id text not null,
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','sent','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists integration_outbox_pending_idx on public.integration_outbox(status,created_at);
create or replace function public.queue_sheet_sync() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.integration_outbox(entity_type,entity_id,payload)
  values(case when tg_table_name='attendance_records' then 'attendance' else 'leave_request' end,new.id::text,to_jsonb(new));
  return new;
end $$;
drop trigger if exists attendance_sheet_outbox on public.attendance_records;
create trigger attendance_sheet_outbox after insert or update on public.attendance_records for each row execute function public.queue_sheet_sync();
drop trigger if exists leave_sheet_outbox on public.leave_requests;
create trigger leave_sheet_outbox after insert or update on public.leave_requests for each row execute function public.queue_sheet_sync();
alter table public.integration_outbox enable row level security;
commit;
