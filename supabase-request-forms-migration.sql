-- Add structured overtime and salary-advance requests.
-- Safe to run repeatedly in the Supabase SQL Editor.

begin;

alter table public.leave_requests add column if not exists request_start_time time;
alter table public.leave_requests add column if not exists request_end_time time;
alter table public.leave_requests add column if not exists overtime_minutes integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'leave_requests_overtime_minutes_check'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_overtime_minutes_check check (overtime_minutes >= 0);
  end if;
end $$;

-- Normalize older labels so the Leave and Payroll screens use one vocabulary.
update public.leave_requests
set request_type = 'Tạm ứng lương'
where request_type = 'Ứng lương';

commit;

select request_type, count(*) as total
from public.leave_requests
group by request_type
order by request_type;
