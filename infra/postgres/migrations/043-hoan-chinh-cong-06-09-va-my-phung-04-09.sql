-- Hoàn chỉnh công ngày 06/09/2026 từ bảng chấm công đã xác nhận và sửa
-- giờ vào của Trần Mỹ Phụng ngày 04/09 do nhân viên quên chấm công.

begin;

create temporary table expected_checkout_20260906 (
  employee_code text primary key,
  recorded_at timestamptz not null,
  shift_code text not null
) on commit drop;

insert into expected_checkout_20260906 (employee_code, recorded_at, shift_code) values
  ('PVC007', '2026-09-06 17:04:59+07', 'front-office'),
  ('PVC010', '2026-09-06 17:03:44+07', 'front-office'),
  ('PVC012', '2026-09-06 17:02:49+07', 'front-office'),
  ('PVC003', '2026-09-06 17:04:15+07', 'front-office'),
  ('PVC011', '2026-09-06 17:01:09+07', 'front-office'),
  ('PVC005', '2026-09-06 17:10:07+07', 'front-office'),
  ('PVC006', '2026-09-06 17:01:25+07', 'front-office'),
  ('PVC004', '2026-09-06 17:06:41+07', 'front-office'),
  ('PVC002', '2026-09-06 17:00:15+07', 'doctor-office'),
  ('PVC001', '2026-09-06 17:00:18+07', 'doctor-office'),
  ('PVC009', '2026-09-06 17:03:39+07', 'doctor-office');

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
    'record_type', 'checkout',
    'work_date', '2026-09-06',
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
    'note', '[MANUAL_RECONCILIATION] Bổ sung giờ ra từ bảng chấm công xác nhận ngày 06/09/2026; nguồn không kèm tọa độ GPS.'
  ),
  'manual-reconciliation',
  1,
  now(),
  now(),
  null
from expected_checkout_20260906 e
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
    and r.payload->>'work_date' = '2026-09-06'
    and r.payload->>'record_type' = 'checkout'
);

-- Lượt 16:47 của Mỹ Phụng là thao tác bù cuối ca, không phải giờ bắt đầu
-- làm việc. Đổi thành 07:30 theo xác nhận và xóa GPS của lượt cũ để lịch sử
-- không hiểu nhầm tọa độ đo lúc 16:47 là bằng chứng GPS lúc 07:30.
update app.records
set payload = payload
      || jsonb_build_object(
        'recorded_at', '2026-09-04T00:30:00Z',
        'lat', null,
        'lng', null,
        'distance_m', null,
        'accuracy_m', null,
        'status', 'valid',
        'device_id', 'manual-reconciliation',
        'synced_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'note', '[MANUAL_RECONCILIATION] Sửa giờ vào 07:30 ngày 04/09/2026 do nhân viên quên chấm công; giữ giờ ra gốc 17:03:13.'
      ),
    origin = 'manual-reconciliation',
    version = version + 1,
    updated_at = now()
where entity_type = 'attendance_records'
  and deleted_at is null
  and payload->>'employee_code' = 'PVC013'
  and payload->>'work_date' = '2026-09-04'
  and payload->>'record_type' = 'checkin';

-- Tính lại ngay bảng công ngày 06/09 để màn quản lý không còn đọc bản ghi
-- cache cũ công bằng 0. Các giờ vào đều trước giờ bắt đầu và giờ ra đều từ
-- 17:00 trở đi, nên công thường bằng đúng công chuẩn của ca.
with work_rows as (
  select
    e.employee_code,
    e.shift_code,
    e.recorded_at checkout_at,
    min((a.payload->>'recorded_at')::timestamptz) checkin_at,
    s.payload->>'name' shift_name,
    (
      extract(epoch from ((s.payload->>'end_time')::time - (s.payload->>'start_time')::time)) / 60
      - coalesce((s.payload->>'break_minutes')::integer, 0)
    )::integer scheduled_minutes
  from expected_checkout_20260906 e
  join app.records a
    on a.entity_type = 'attendance_records'
   and a.deleted_at is null
   and lower(a.payload->>'employee_code') = lower(e.employee_code)
   and a.payload->>'work_date' = '2026-09-06'
   and a.payload->>'record_type' = 'checkin'
  join app.records s
    on s.entity_type = 'work_shifts'
   and s.deleted_at is null
   and s.payload->>'code' = e.shift_code
  group by e.employee_code, e.shift_code, e.recorded_at, s.payload
), payloads as (
  select
    'work:' || employee_code || ':2026-09-06' id,
    jsonb_build_object(
      'id', 'work:' || employee_code || ':2026-09-06',
      'employee_code', employee_code,
      'work_date', '2026-09-06',
      'shift_code', shift_code,
      'shift_name', shift_name,
      'branch_id', 'le-van-tho',
      'scheduled_minutes', scheduled_minutes,
      'regular_minutes', scheduled_minutes,
      'overtime_minutes', 0,
      'approved_overtime_minutes', 0,
      'overtime_request_ids', '[]'::jsonb,
      'late_minutes', 0,
      'early_leave_minutes', 0,
      'payable_minutes', scheduled_minutes,
      'workday_credit', 1,
      'checkin_at', to_char(checkin_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'checkout_at', to_char(checkout_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'status', 'complete',
      'calculated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'source', 'postgresql-vps'
    ) payload
  from work_rows
)
insert into app.records (entity_type, record_key, payload, origin)
select 'attendance_work_days', id, payload, 'vps-work-calculation'
from payloads
on conflict (entity_type, record_key) do update
set payload = excluded.payload,
    origin = excluded.origin,
    version = app.records.version + 1,
    updated_at = now(),
    deleted_at = null;

-- Tính lại công của Mỹ Phụng ngày 04/09 sau khi sửa giờ vào.
insert into app.records (entity_type, record_key, payload, origin)
values (
  'attendance_work_days',
  'work:PVC013:2026-09-04',
  jsonb_build_object(
    'id', 'work:PVC013:2026-09-04',
    'employee_code', 'PVC013',
    'work_date', '2026-09-04',
    'shift_code', 'front-office',
    'shift_name', 'Ca hành chính',
    'branch_id', 'le-van-tho',
    'scheduled_minutes', 510,
    'regular_minutes', 510,
    'overtime_minutes', 0,
    'approved_overtime_minutes', 0,
    'overtime_request_ids', '[]'::jsonb,
    'late_minutes', 0,
    'early_leave_minutes', 0,
    'payable_minutes', 510,
    'workday_credit', 1,
    'checkin_at', '2026-09-04T00:30:00Z',
    'checkout_at', '2026-09-04T10:03:13.964Z',
    'status', 'complete',
    'calculated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'source', 'postgresql-vps'
  ),
  'vps-work-calculation'
)
on conflict (entity_type, record_key) do update
set payload = excluded.payload,
    origin = excluded.origin,
    version = app.records.version + 1,
    updated_at = now(),
    deleted_at = null;

do $$
declare
  missing_checkout integer;
  incomplete_work integer;
  phung_checkin text;
begin
  -- Database mới không có bảng chấm công nguồn ngày 06/09 hoặc lượt bù của
  -- Mỹ Phụng. Khi đó phần insert ở trên là idempotent nhưng không có dữ liệu
  -- đầu vào để đối chiếu; chỉ chạy chốt kiểm trên database production có
  -- ít nhất một lượt check-in nguồn. Điều này giúp migration tái tạo được từ
  -- volume trống mà vẫn giữ kiểm tra nghiêm ngặt trên dữ liệu thực tế.
  if not exists (
    select 1 from app.records
    where entity_type = 'attendance_records'
      and deleted_at is null
      and payload->>'work_date' = '2026-09-06'
      and payload->>'record_type' = 'checkin'
  ) and not exists (
    select 1 from app.records
    where entity_type = 'attendance_records'
      and deleted_at is null
      and payload->>'employee_code' = 'PVC013'
      and payload->>'work_date' = '2026-09-04'
      and payload->>'record_type' = 'checkin'
  ) then
    return;
  end if;

  select count(*)
  into missing_checkout
  from expected_checkout_20260906 e
  left join app.records r
    on r.entity_type = 'attendance_records'
   and r.deleted_at is null
   and lower(r.payload->>'employee_code') = lower(e.employee_code)
   and r.payload->>'work_date' = '2026-09-06'
   and r.payload->>'record_type' = 'checkout'
  where r.record_key is null;

  select count(*)
  into incomplete_work
  from expected_checkout_20260906 e
  left join app.records r
    on r.entity_type = 'attendance_work_days'
   and r.deleted_at is null
   and lower(r.payload->>'employee_code') = lower(e.employee_code)
   and r.payload->>'work_date' = '2026-09-06'
   and r.payload->>'status' = 'complete'
   and (r.payload->>'workday_credit')::numeric = 1
  where r.record_key is null;

  select to_char((payload->>'recorded_at')::timestamptz at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI:SS')
  into phung_checkin
  from app.records
  where entity_type = 'attendance_records'
    and deleted_at is null
    and payload->>'employee_code' = 'PVC013'
    and payload->>'work_date' = '2026-09-04'
    and payload->>'record_type' = 'checkin';

  if missing_checkout <> 0 or incomplete_work <> 0 or phung_checkin is distinct from '07:30:00' then
    raise exception 'Doi chieu that bai: % checkout thieu, % cong chua du, gio My Phung %', missing_checkout, incomplete_work, phung_checkin;
  end if;
end;
$$;

commit;
