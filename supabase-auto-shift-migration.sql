begin;

create or replace function public.resolve_employee_shift_at(
  p_employee_code text,
  p_work_date date,
  p_local_time time default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shift text;
  v_time time := coalesce(p_local_time, (now() at time zone 'Asia/Ho_Chi_Minh')::time);
begin
  select sa.shift_code into v_shift
  from public.schedule_assignments sa
  where sa.employee_code=p_employee_code and sa.work_date=p_work_date
  limit 1;
  if v_shift is not null then return v_shift; end if;

  select eas.shift_code into v_shift
  from public.employee_allowed_shifts eas
  join public.work_shifts ws on ws.code=eas.shift_code and ws.active=true
  where eas.employee_code=p_employee_code
  order by abs(extract(epoch from (v_time-ws.start_time))) asc, ws.start_time desc
  limit 1;
  if v_shift is not null then return v_shift; end if;

  select e.shift_code into v_shift from public.employees e where e.code=p_employee_code;
  return coalesce(v_shift,'clinic-0800');
end $$;

create or replace function public.resolve_employee_shift(p_employee_code text,p_work_date date)
returns text language sql stable security definer set search_path=public
as $$ select public.resolve_employee_shift_at(p_employee_code,p_work_date,null) $$;

-- Các RPC check-in hiện tại gọi resolve_employee_shift; từ đây ca sẽ được xác định
-- theo lịch ngày trước, nếu không có lịch thì chọn giờ bắt đầu gần giờ check-in nhất.
commit;

select public.resolve_employee_shift_at('PVC001',current_date,'07:00'::time) as shift_at_07,
       public.resolve_employee_shift_at('PVC001',current_date,'10:00'::time) as shift_at_10;
