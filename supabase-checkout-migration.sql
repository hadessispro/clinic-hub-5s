-- One-time migration for the live 5S Clinic Hub database.
-- Safe to run more than once in Supabase SQL Editor.

create unique index if not exists attendance_one_checkout_per_day_uidx
  on public.attendance_records(employee_code, work_date, record_type)
  where record_type = 'checkout';

drop function if exists public.record_attendance_checkout(uuid, timestamptz, text, boolean);

create or replace function public.record_attendance_checkout(
  p_client_event_id uuid,
  p_recorded_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_accuracy_m integer,
  p_device_id text default null,
  p_offline boolean default false
)
returns setof public.attendance_records
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_code text;
  v_shift_code text;
  v_effective_at timestamptz;
  v_work_date date;
  v_latitude double precision := 10.8381574;
  v_longitude double precision := 106.6579553;
  v_radius_m integer := 100;
  v_max_accuracy_m integer := 50;
  v_distance_m integer;
  v_checkin public.attendance_records%rowtype;
  v_existing public.attendance_records%rowtype;
  v_created public.attendance_records%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Bạn cần đăng nhập trước khi kết ca.' using errcode = '28000';
  end if;

  select employee_code into v_employee_code
  from public.profiles
  where id = auth.uid() and active = true;

  if v_employee_code is null then
    raise exception 'Tài khoản chưa được liên kết với nhân viên.' using errcode = '42501';
  end if;

  select coalesce(shift_code, 'clinic-0800') into v_shift_code
  from public.employees
  where code = v_employee_code and status = 'active';

  if v_shift_code is null then
    raise exception 'Nhân viên chưa hoạt động hoặc chưa được gán ca.' using errcode = '42501';
  end if;

  select latitude, longitude, allowed_radius_m, max_gps_accuracy_m
  into v_latitude, v_longitude, v_radius_m, v_max_accuracy_m
  from public.clinic_locations
  where id = 'pham-van-chieu' and active = true;

  v_latitude := coalesce(v_latitude, 10.8381574);
  v_longitude := coalesce(v_longitude, 106.6579553);
  v_radius_m := greatest(20, least(300, coalesce(v_radius_m, 100)));
  v_max_accuracy_m := greatest(10, least(100, coalesce(v_max_accuracy_m, 50)));

  if p_client_event_id is null or p_recorded_at is null then
    raise exception 'Thiếu mã sự kiện hoặc thời gian kết ca.' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Tọa độ GPS check-out không hợp lệ.' using errcode = '22023';
  end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > v_max_accuracy_m then
    raise exception 'Sai số GPS check-out % m vượt mức cho phép % m.', p_accuracy_m, v_max_accuracy_m using errcode = '22023';
  end if;
  if p_recorded_at > now() + interval '5 minutes' or p_recorded_at < now() - interval '7 days' then
    raise exception 'Thời gian kết ca không hợp lệ.' using errcode = '22023';
  end if;

  v_effective_at := case when p_offline then p_recorded_at else now() end;
  v_work_date := (v_effective_at at time zone 'Asia/Ho_Chi_Minh')::date;

  v_distance_m := round(
    6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_latitude) / 2), 2)
      + cos(radians(v_latitude)) * cos(radians(p_lat))
      * power(sin(radians(p_lng - v_longitude) / 2), 2)
    ))
  );

  if v_distance_m > v_radius_m then
    raise exception 'Bạn đang cách phòng khám % m; bán kính check-out cho phép là % m.', v_distance_m, v_radius_m using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_employee_code || ':' || v_work_date::text)::bigint);

  select * into v_existing
  from public.attendance_records
  where client_event_id = p_client_event_id
  limit 1;

  if found then
    if v_existing.employee_code <> v_employee_code or v_existing.record_type <> 'checkout' then
      raise exception 'Mã sự kiện đã được dùng cho một bản ghi khác.' using errcode = '23505';
    end if;
    return next v_existing;
    return;
  end if;

  select * into v_checkin
  from public.attendance_records
  where employee_code = v_employee_code
    and work_date = v_work_date
    and record_type = 'checkin'
  order by recorded_at
  limit 1;

  if not found then
    raise exception 'Bạn cần check-in trước khi kết ca.' using errcode = '22023';
  end if;
  if v_effective_at < v_checkin.recorded_at then
    raise exception 'Giờ kết ca không thể trước giờ check-in.' using errcode = '22023';
  end if;

  select * into v_existing
  from public.attendance_records
  where employee_code = v_employee_code
    and work_date = v_work_date
    and record_type = 'checkout'
  order by recorded_at
  limit 1;

  if found then
    return next v_existing;
    return;
  end if;

  insert into public.attendance_records (
    client_event_id, employee_code, shift_code, record_type, work_date,
    recorded_at, lat, lng, distance_m, accuracy_m, status, created_by,
    device_id, captured_offline, synced_at
  ) values (
    p_client_event_id, v_employee_code, v_shift_code, 'checkout', v_work_date,
    v_effective_at, p_lat, p_lng, v_distance_m, p_accuracy_m, 'valid', auth.uid(),
    left(nullif(p_device_id, ''), 120), p_offline, now()
  )
  returning * into v_created;

  return next v_created;
end;
$$;

revoke all on function public.record_attendance_checkout(uuid, timestamptz, double precision, double precision, integer, text, boolean) from public;
grant execute on function public.record_attendance_checkout(uuid, timestamptz, double precision, double precision, integer, text, boolean) to authenticated;
