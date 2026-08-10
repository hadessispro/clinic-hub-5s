-- Reclassify historical attendance with a five-minute tolerance.
-- Early check-in is always valid. Check-in is late only after shift start + 5 minutes.
-- Checkout is early only before shift end - 5 minutes.
begin;

update public.attendance_records ar
set status = case
  when ar.record_type = 'checkin'
    and (ar.recorded_at at time zone 'Asia/Ho_Chi_Minh')::time > ws.start_time + interval '5 minutes'
    then 'late'
  when ar.record_type = 'checkout'
    and (ar.recorded_at at time zone 'Asia/Ho_Chi_Minh')::time < ws.end_time - interval '5 minutes'
    then 'early_leave'
  else 'valid'
end
from public.work_shifts ws
where ws.code = ar.shift_code;

-- The source document specifies a one-hour break for all front-office shifts.
update public.work_shifts
set break_minutes = 60, updated_at = now()
where code in ('front-morning', 'front-afternoon')
  and break_minutes is distinct from 60;

commit;

select status, record_type, count(*) as records
from public.attendance_records
group by status, record_type
order by record_type, status;
