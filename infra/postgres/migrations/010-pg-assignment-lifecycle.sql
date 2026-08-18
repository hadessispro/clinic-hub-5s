alter table marketing.pg_shift_assignments
  add column if not exists status text not null default 'scheduled',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by_code text,
  add column if not exists cancel_reason text,
  add column if not exists expired_at timestamptz,
  add column if not exists completed_at timestamptz;

-- Preserve the actual state of assignments created before lifecycle tracking.
with checkout_records as (
  select assignment_id, max(recorded_at) recorded_at
    from marketing.pg_attendance
   where record_type = 'checkout'
   group by assignment_id
)
update marketing.pg_shift_assignments a
   set status = 'completed',
       completed_at = coalesce(a.completed_at, checkout_records.recorded_at),
       updated_at = greatest(a.updated_at, checkout_records.recorded_at)
  from checkout_records
 where checkout_records.assignment_id = a.id
   and a.status = 'scheduled';

with checkin_records as (
  select assignment_id, max(recorded_at) recorded_at
    from marketing.pg_attendance
   where record_type = 'checkin'
   group by assignment_id
)
update marketing.pg_shift_assignments a
   set status = 'checked_in',
       updated_at = greatest(a.updated_at, checkin_records.recorded_at)
  from checkin_records
 where checkin_records.assignment_id = a.id
   and a.status = 'scheduled';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pg_shift_assignments_status_check'
      and conrelid = 'marketing.pg_shift_assignments'::regclass
  ) then
    alter table marketing.pg_shift_assignments
      add constraint pg_shift_assignments_status_check
      check (status in ('scheduled', 'checked_in', 'completed', 'cancelled', 'expired'));
  end if;
end $$;

create index if not exists pg_shift_assignments_status_date_idx
  on marketing.pg_shift_assignments(status, work_date, start_time);

create table if not exists marketing.pg_assignment_events (
  id bigserial primary key,
  assignment_id uuid not null references marketing.pg_shift_assignments(id),
  pg_code text not null,
  event_type text not null check (event_type in (
    'assigned', 'rescheduled', 'checked_in', 'completed', 'cancelled', 'expired'
  )),
  actor_code text,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pg_assignment_events_assignment_idx
  on marketing.pg_assignment_events(assignment_id, created_at desc);
create index if not exists pg_assignment_events_pg_idx
  on marketing.pg_assignment_events(lower(pg_code), created_at desc);

create or replace function marketing.log_pg_assignment_lifecycle() returns trigger
language plpgsql as $$
declare
  next_event text;
begin
  if tg_op = 'INSERT' then
    next_event := 'assigned';
  elsif new.status is distinct from old.status then
    next_event := case new.status
      when 'scheduled' then 'rescheduled'
      when 'checked_in' then 'checked_in'
      when 'completed' then 'completed'
      when 'cancelled' then 'cancelled'
      when 'expired' then 'expired'
      else null
    end;
  end if;

  if next_event is not null then
    insert into marketing.pg_assignment_events(
      assignment_id, pg_code, event_type, actor_code, reason, detail
    ) values (
      new.id,
      new.pg_code,
      next_event,
      case when next_event = 'cancelled' then new.cancelled_by_code else new.created_by_code end,
      case when next_event = 'cancelled' then new.cancel_reason else null end,
      jsonb_build_object(
        'work_date', new.work_date,
        'start_time', new.start_time,
        'end_time', new.end_time,
        'site_id', new.site_id,
        'status', new.status
      )
    );
  end if;
  return new;
end $$;

drop trigger if exists pg_assignment_lifecycle_trigger on marketing.pg_shift_assignments;
create trigger pg_assignment_lifecycle_trigger
after insert or update of status on marketing.pg_shift_assignments
for each row execute function marketing.log_pg_assignment_lifecycle();

create or replace function marketing.expire_pg_assignments()
returns table(id uuid, pg_code text, work_date date, start_time time, end_time time)
language sql
as $$
  update marketing.pg_shift_assignments a
     set status = 'expired', expired_at = now(), updated_at = now()
   where a.status = 'scheduled'
     and (a.work_date + a.end_time) < (now() at time zone 'Asia/Ho_Chi_Minh')
  returning a.id, a.pg_code, a.work_date, a.start_time, a.end_time
$$;
