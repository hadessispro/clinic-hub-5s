-- Correct paid hours for Lễ tân/Phụ tá morning and afternoon shifts.
-- Source: THỜI GIAN LÀM VIỆC NHA KHOA 5S - HCM (2).docx
-- 07:30-18:00 and 09:30-20:00 both include a 60-minute lunch break.
update public.work_shifts
set break_minutes = 60,
    updated_at = now()
where code in ('front-morning', 'front-afternoon')
  and break_minutes is distinct from 60;

select
  code,
  name,
  start_time,
  end_time,
  break_minutes,
  round(((extract(epoch from (end_time - start_time)) / 60 - break_minutes) / 60.0)::numeric, 1) as paid_hours
from public.work_shifts
where code in ('front-morning', 'front-afternoon', 'doctor-morning', 'doctor-afternoon')
order by code;
