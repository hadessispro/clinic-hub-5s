-- Bổ sung bốn lượt vào ca ngày 07/09/2026 từ bảng chấm công đã xác nhận
-- và bảo đảm mọi Lễ tân/Phụ tá/Bác sĩ có đủ bốn ca đúng chuyên môn.

begin;

create temporary table expected_checkin_20260907 (
  employee_code text primary key,
  recorded_at timestamptz not null,
  shift_code text not null
) on commit drop;

insert into expected_checkin_20260907 (employee_code, recorded_at, shift_code) values
  ('PVC003', '2026-09-07 07:22:37+07', 'front-office'),
  ('PVC012', '2026-09-07 07:22:57+07', 'front-morning'),
  ('PVC005', '2026-09-07 07:25:57+07', 'front-full'),
  ('PVC002', '2026-09-07 07:47:03+07', 'doctor-morning');

insert into app.records (
  entity_type,
  record_key,
  payload,
  origin,
  version,
  created_at,
  updated_at,
  deleted_at
)
select
  'attendance_records',
  ids.id::text,
  jsonb_build_object(
    'id', ids.id::text,
    'client_event_id', ids.id::text,
    'employee_code', e.employee_code,
    'shift_code', e.shift_code,
    'record_type', 'checkin',
    'work_date', '2026-09-07',
    'recorded_at', to_char(e.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'lat', null,
    'lng', null,
    'branch_id', 'le-van-tho',
    'distance_m', null,
    'accuracy_m', null,
    'status', 'valid',
    'created_by', null,
    'device_id', 'manual-reconciliation',
    'captured_offline', false,
    'synced_at', to_char(e.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'proof_url', null,
    'note', '[MANUAL_RECONCILIATION] Bổ sung từ bảng chấm công xác nhận ngày 07/09/2026; nguồn không kèm tọa độ GPS.'
  ),
  'manual-reconciliation',
  1,
  now(),
  now(),
  null
from expected_checkin_20260907 e
cross join lateral (
  select gen_random_uuid() id
  where e.employee_code is not null
) ids
where not exists (
  select 1
  from app.records r
  where r.entity_type = 'attendance_records'
    and r.deleted_at is null
    and lower(r.payload->>'employee_code') = lower(e.employee_code)
    and r.payload->>'work_date' = '2026-09-07'
    and r.payload->>'record_type' = 'checkin'
);

-- Sinh đủ bốn ca cho từng nhân viên thuộc nhóm ca tương ứng. Bảng phân ca
-- theo ngày vẫn quyết định ca bắt buộc của hôm đó; danh mục này là phạm vi
-- hợp lệ khi ngày chưa được phân lịch.
with eligible_employees as (
  select
    e.payload->>'code' employee_code,
    case
      when lower(coalesce(e.payload->>'department', '')) in ('bs', 'chuyên môn')
        or lower(coalesce(e.payload->>'role', '')) = 'bac_si'
        then array['doctor-office', 'doctor-morning', 'doctor-afternoon', 'doctor-full']::text[]
      when lower(coalesce(e.payload->>'department', '')) in ('phuta', 'dvkh', 'lễ tân')
        or lower(coalesce(e.payload->>'role', '')) = 'le_tan'
        then array['front-office', 'front-morning', 'front-afternoon', 'front-full']::text[]
      else array[]::text[]
    end shift_codes
  from app.records e
  where e.entity_type = 'employees'
    and e.deleted_at is null
    and e.payload->>'status' = 'active'
    and nullif(e.payload->>'code', '') is not null
), expected_allowed as (
  select employee_code, unnest(shift_codes) shift_code
  from eligible_employees
), missing_allowed as materialized (
  select e.employee_code, e.shift_code, gen_random_uuid() id
  from expected_allowed e
  where not exists (
    select 1
    from app.records r
    where r.entity_type = 'employee_allowed_shifts'
      and r.deleted_at is null
      and lower(r.payload->>'employee_code') = lower(e.employee_code)
      and r.payload->>'shift_code' = e.shift_code
  )
)
insert into app.records (entity_type, record_key, payload, origin)
select
  'employee_allowed_shifts',
  id::text,
  jsonb_build_object(
    'id', id::text,
    'employee_code', employee_code,
    'shift_code', shift_code,
    'created_at', now(),
    'updated_at', now()
  ),
  'vps'
from missing_allowed;

do $$
declare
  missing_checkins integer;
  incomplete_shift_sets integer;
begin
  select count(*)
  into missing_checkins
  from expected_checkin_20260907 e
  left join app.records r
    on r.entity_type = 'attendance_records'
   and r.deleted_at is null
   and lower(r.payload->>'employee_code') = lower(e.employee_code)
   and r.payload->>'work_date' = '2026-09-07'
   and r.payload->>'record_type' = 'checkin'
  where r.record_key is null;

  select count(*)
  into incomplete_shift_sets
  from app.records e
  where e.entity_type = 'employees'
    and e.deleted_at is null
    and e.payload->>'status' = 'active'
    and (
      lower(coalesce(e.payload->>'department', '')) in ('bs', 'chuyên môn', 'phuta', 'dvkh', 'lễ tân')
      or lower(coalesce(e.payload->>'role', '')) in ('bac_si', 'le_tan')
    )
    and (
      select count(distinct a.payload->>'shift_code')
      from app.records a
      where a.entity_type = 'employee_allowed_shifts'
        and a.deleted_at is null
        and lower(a.payload->>'employee_code') = lower(e.payload->>'code')
        and a.payload->>'shift_code' = any(
          case
            when lower(coalesce(e.payload->>'department', '')) in ('bs', 'chuyên môn')
              or lower(coalesce(e.payload->>'role', '')) = 'bac_si'
              then array['doctor-office', 'doctor-morning', 'doctor-afternoon', 'doctor-full']::text[]
            else array['front-office', 'front-morning', 'front-afternoon', 'front-full']::text[]
          end
        )
    ) <> 4;

  if missing_checkins <> 0 or incomplete_shift_sets <> 0 then
    raise exception 'Doi chieu that bai: % check-in thieu, % nhan vien thieu danh muc ca', missing_checkins, incomplete_shift_sets;
  end if;
end;
$$;

commit;
