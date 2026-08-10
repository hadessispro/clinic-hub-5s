begin;

-- Choose a shift from the employee's allowed shifts using the actual check-in time.
-- A dated schedule assignment always has priority.
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
  where sa.employee_code = p_employee_code and sa.work_date = p_work_date
  limit 1;
  if v_shift is not null then return v_shift; end if;

  select eas.shift_code into v_shift
  from public.employee_allowed_shifts eas
  join public.work_shifts ws on ws.code = eas.shift_code and ws.active = true
  where eas.employee_code = p_employee_code
  order by abs(extract(epoch from (v_time - ws.start_time))), ws.start_time desc
  limit 1;

  if v_shift is null then
    select e.shift_code into v_shift from public.employees e where e.code = p_employee_code;
  end if;
  return coalesce(v_shift, 'clinic-0800');
end $$;

create or replace function public.record_attendance_checkin(
  p_client_event_id uuid, p_recorded_at timestamptz, p_lat double precision,
  p_lng double precision, p_accuracy_m integer, p_device_id text default null,
  p_offline boolean default false
)
returns setof public.attendance_records
language plpgsql security definer set search_path = public
as $$
declare
  v_employee_code text; v_branch_id text; v_shift_code text;
  v_effective_at timestamptz; v_work_date date; v_local_time time;
  v_shift_start time; v_advance_minutes integer;
  v_latitude double precision; v_longitude double precision;
  v_radius_m integer; v_max_accuracy_m integer; v_distance_m integer; v_status text;
  v_existing public.attendance_records%rowtype; v_created public.attendance_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập trước khi chấm công.' using errcode='28000'; end if;
  select p.employee_code, coalesce(p.branch_id, e.branch_id, 'le-van-tho')
    into v_employee_code, v_branch_id
  from public.profiles p left join public.employees e on e.code=p.employee_code
  where p.id=auth.uid() and p.active=true;
  if v_employee_code is null then raise exception 'Tài khoản chưa liên kết nhân viên.' using errcode='42501'; end if;

  select latitude, longitude, allowed_radius_m, max_gps_accuracy_m
    into v_latitude, v_longitude, v_radius_m, v_max_accuracy_m
  from public.clinic_locations where id=v_branch_id and active=true;
  if v_latitude is null then raise exception 'Chi nhánh chưa cấu hình vị trí chấm công.' using errcode='42501'; end if;
  v_radius_m:=greatest(20,least(300,coalesce(v_radius_m,100)));
  v_max_accuracy_m:=greatest(10,least(100,coalesce(v_max_accuracy_m,50)));

  if p_client_event_id is null or p_recorded_at is null then raise exception 'Thiếu mã sự kiện hoặc thời gian.' using errcode='22023'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'Tọa độ GPS không hợp lệ.' using errcode='22023'; end if;
  if p_accuracy_m is null or p_accuracy_m<=0 or p_accuracy_m>v_max_accuracy_m then raise exception 'Sai số GPS % m vượt mức % m.',p_accuracy_m,v_max_accuracy_m using errcode='22023'; end if;
  if p_recorded_at>now()+interval '5 minutes' or p_recorded_at<now()-interval '7 days' then raise exception 'Thời gian chấm công không hợp lệ.' using errcode='22023'; end if;

  v_effective_at:=case when p_offline then p_recorded_at else now() end;
  v_work_date:=(v_effective_at at time zone 'Asia/Ho_Chi_Minh')::date;
  v_local_time:=(v_effective_at at time zone 'Asia/Ho_Chi_Minh')::time;
  v_shift_code:=public.resolve_employee_shift_at(v_employee_code,v_work_date,v_local_time);
  select start_time,checkin_advance_minutes into v_shift_start,v_advance_minutes from public.work_shifts where code=v_shift_code and active=true;
  if v_shift_start is null then raise exception 'Ca làm chưa được cấu hình.' using errcode='42501'; end if;

  v_distance_m:=round(6371000*2*asin(sqrt(power(sin(radians(p_lat-v_latitude)/2),2)+cos(radians(v_latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-v_longitude)/2),2))));
  if v_distance_m>v_radius_m then raise exception 'Bạn đang cách phòng khám % m; bán kính cho phép % m.',v_distance_m,v_radius_m using errcode='22023'; end if;
  v_status:=case when v_local_time>v_shift_start-make_interval(mins=>v_advance_minutes) then 'late' else 'valid' end;

  perform pg_advisory_xact_lock(hashtext(v_employee_code||':'||v_work_date::text)::bigint);
  select * into v_existing from public.attendance_records where client_event_id=p_client_event_id or (employee_code=v_employee_code and work_date=v_work_date and record_type='checkin') order by recorded_at limit 1;
  if found then return next v_existing; return; end if;
  insert into public.attendance_records(client_event_id,employee_code,shift_code,record_type,work_date,recorded_at,lat,lng,distance_m,accuracy_m,status,created_by,device_id,captured_offline,synced_at)
  values(p_client_event_id,v_employee_code,v_shift_code,'checkin',v_work_date,v_effective_at,p_lat,p_lng,v_distance_m,p_accuracy_m,v_status,auth.uid(),left(nullif(p_device_id,''),120),p_offline,now()) returning * into v_created;
  return next v_created;
end $$;

create or replace function public.record_attendance_checkout(
  p_client_event_id uuid, p_recorded_at timestamptz, p_lat double precision,
  p_lng double precision, p_accuracy_m integer, p_device_id text default null,
  p_offline boolean default false
)
returns setof public.attendance_records
language plpgsql security definer set search_path = public
as $$
declare
  v_employee_code text; v_branch_id text; v_shift_code text;
  v_effective_at timestamptz; v_work_date date; v_local_time time; v_shift_end time;
  v_latitude double precision; v_longitude double precision; v_radius_m integer; v_max_accuracy_m integer; v_distance_m integer;
  v_checkin public.attendance_records%rowtype; v_existing public.attendance_records%rowtype; v_created public.attendance_records%rowtype;
begin
  if auth.uid() is null then raise exception 'Bạn cần đăng nhập trước khi kết ca.' using errcode='28000'; end if;
  select p.employee_code,coalesce(p.branch_id,e.branch_id,'le-van-tho') into v_employee_code,v_branch_id
  from public.profiles p left join public.employees e on e.code=p.employee_code where p.id=auth.uid() and p.active=true;
  if v_employee_code is null then raise exception 'Tài khoản chưa liên kết nhân viên.' using errcode='42501'; end if;
  select latitude,longitude,allowed_radius_m,max_gps_accuracy_m into v_latitude,v_longitude,v_radius_m,v_max_accuracy_m from public.clinic_locations where id=v_branch_id and active=true;
  if v_latitude is null then raise exception 'Chi nhánh chưa cấu hình vị trí chấm công.' using errcode='42501'; end if;
  v_radius_m:=greatest(20,least(300,coalesce(v_radius_m,100))); v_max_accuracy_m:=greatest(10,least(100,coalesce(v_max_accuracy_m,50)));
  if p_client_event_id is null or p_recorded_at is null then raise exception 'Thiếu mã sự kiện hoặc thời gian.' using errcode='22023'; end if;
  if p_lat is null or p_lng is null or p_accuracy_m is null or p_accuracy_m<=0 or p_accuracy_m>v_max_accuracy_m then raise exception 'Dữ liệu GPS không hợp lệ.' using errcode='22023'; end if;
  if p_recorded_at>now()+interval '5 minutes' or p_recorded_at<now()-interval '7 days' then raise exception 'Thời gian kết ca không hợp lệ.' using errcode='22023'; end if;
  v_effective_at:=case when p_offline then p_recorded_at else now() end; v_work_date:=(v_effective_at at time zone 'Asia/Ho_Chi_Minh')::date; v_local_time:=(v_effective_at at time zone 'Asia/Ho_Chi_Minh')::time;
  perform pg_advisory_xact_lock(hashtext(v_employee_code||':'||v_work_date::text)::bigint);
  select * into v_existing from public.attendance_records where client_event_id=p_client_event_id limit 1;
  if found then return next v_existing; return; end if;
  select * into v_checkin from public.attendance_records where employee_code=v_employee_code and work_date=v_work_date and record_type='checkin' order by recorded_at limit 1;
  if not found then raise exception 'Bạn cần check-in trước khi kết ca.' using errcode='22023'; end if;
  if v_effective_at<v_checkin.recorded_at then raise exception 'Giờ kết ca không thể trước giờ check-in.' using errcode='22023'; end if;
  v_shift_code:=v_checkin.shift_code; select end_time into v_shift_end from public.work_shifts where code=v_shift_code and active=true;
  v_distance_m:=round(6371000*2*asin(sqrt(power(sin(radians(p_lat-v_latitude)/2),2)+cos(radians(v_latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-v_longitude)/2),2))));
  if v_distance_m>v_radius_m then raise exception 'Bạn đang cách phòng khám % m; bán kính cho phép % m.',v_distance_m,v_radius_m using errcode='22023'; end if;
  select * into v_existing from public.attendance_records where employee_code=v_employee_code and work_date=v_work_date and record_type='checkout' limit 1;
  if found then return next v_existing; return; end if;
  insert into public.attendance_records(client_event_id,employee_code,shift_code,record_type,work_date,recorded_at,lat,lng,distance_m,accuracy_m,status,created_by,device_id,captured_offline,synced_at)
  values(p_client_event_id,v_employee_code,v_shift_code,'checkout',v_work_date,v_effective_at,p_lat,p_lng,v_distance_m,p_accuracy_m,case when v_local_time<v_shift_end then 'early_leave' else 'valid' end,auth.uid(),left(nullif(p_device_id,''),120),p_offline,now()) returning * into v_created;
  return next v_created;
end $$;

revoke all on function public.record_attendance_checkin(uuid,timestamptz,double precision,double precision,integer,text,boolean) from public;
grant execute on function public.record_attendance_checkin(uuid,timestamptz,double precision,double precision,integer,text,boolean) to authenticated;
revoke all on function public.record_attendance_checkout(uuid,timestamptz,double precision,double precision,integer,text,boolean) from public;
grant execute on function public.record_attendance_checkout(uuid,timestamptz,double precision,double precision,integer,text,boolean) to authenticated;

-- Repair stored check-ins using their own recorded time. Check-outs inherit that repaired shift.
update public.attendance_records ar set shift_code=public.resolve_employee_shift_at(ar.employee_code,ar.work_date,(ar.recorded_at at time zone 'Asia/Ho_Chi_Minh')::time)
where ar.record_type='checkin';
update public.attendance_records co set shift_code=ci.shift_code
from public.attendance_records ci where ci.employee_code=co.employee_code and ci.work_date=co.work_date and ci.record_type='checkin' and co.record_type='checkout';
update public.attendance_records ar set status=case
  when ar.record_type='checkin' and (ar.recorded_at at time zone 'Asia/Ho_Chi_Minh')::time>ws.start_time-make_interval(mins=>ws.checkin_advance_minutes) then 'late'
  when ar.record_type='checkout' and (ar.recorded_at at time zone 'Asia/Ho_Chi_Minh')::time<ws.end_time then 'early_leave'
  else 'valid' end
from public.work_shifts ws where ws.code=ar.shift_code;

commit;
