-- Align paid doctor hours with "Bang_ca_lam_viec (1).docx".
-- Safe to run repeatedly in Supabase SQL Editor.
begin;

update public.work_shifts
set break_minutes = 60,
    updated_at = now()
where code in ('doctor-office', 'doctor-morning', 'doctor-afternoon', 'doctor-full')
  and break_minutes is distinct from 60;

select
  code,
  name,
  start_time,
  end_time,
  break_minutes,
  round(((extract(epoch from (end_time - start_time)) / 60 - break_minutes) / 60.0)::numeric, 1) as paid_hours
from public.work_shifts
where code like 'doctor-%'
order by start_time, end_time;

commit;
