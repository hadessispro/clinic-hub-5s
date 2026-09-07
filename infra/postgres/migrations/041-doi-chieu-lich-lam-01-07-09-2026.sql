-- Đối chiếu lịch làm việc 01-07/09/2026 theo bảng chấm công đã xác nhận.
-- Chỉ cập nhật lịch phân ca; tuyệt đối không tự tạo hoặc sửa lượt chấm công.

begin;

create temporary table expected_schedule_20260901_07 (
  work_date date not null,
  employee_code text not null,
  shift_code text not null,
  primary key (work_date, employee_code)
) on commit drop;

insert into expected_schedule_20260901_07 (work_date, employee_code, shift_code) values
  ('2026-09-01', 'PVC011', 'front-office'),
  ('2026-09-01', 'PVC004', 'front-office'),
  ('2026-09-01', 'PVC008', 'doctor-office'),
  ('2026-09-01', 'PVC001', 'doctor-office'),
  ('2026-09-01', 'PVC007', 'front-office'),
  ('2026-09-02', 'PVC004', 'front-office'),
  ('2026-09-02', 'PVC011', 'front-office'),
  ('2026-09-02', 'PVC009', 'doctor-office'),
  ('2026-09-02', 'PVC002', 'doctor-office'),
  ('2026-09-02', 'PVC007', 'front-office'),
  ('2026-09-03', 'PVC013', 'front-office'),
  ('2026-09-03', 'PVC006', 'front-full'),
  ('2026-09-03', 'PVC007', 'front-full'),
  ('2026-09-03', 'PVC002', 'doctor-morning'),
  ('2026-09-03', 'PVC008', 'doctor-full'),
  ('2026-09-03', 'PVC004', 'front-afternoon'),
  ('2026-09-03', 'PVC011', 'front-afternoon'),
  ('2026-09-03', 'PVC009', 'doctor-afternoon'),
  ('2026-09-04', 'PVC011', 'front-morning'),
  ('2026-09-04', 'PVC004', 'front-morning'),
  ('2026-09-04', 'PVC009', 'doctor-morning'),
  ('2026-09-04', 'PVC002', 'doctor-full'),
  ('2026-09-04', 'PVC005', 'front-afternoon'),
  ('2026-09-04', 'PVC012', 'front-afternoon'),
  ('2026-09-04', 'PVC006', 'front-afternoon'),
  ('2026-09-04', 'PVC003', 'front-afternoon'),
  ('2026-09-04', 'PVC007', 'front-afternoon'),
  ('2026-09-04', 'PVC001', 'doctor-afternoon'),
  ('2026-09-04', 'PVC013', 'front-office'),
  ('2026-09-05', 'PVC013', 'front-office'),
  ('2026-09-05', 'PVC005', 'front-full'),
  ('2026-09-05', 'PVC003', 'front-office'),
  ('2026-09-05', 'PVC007', 'front-morning'),
  ('2026-09-05', 'PVC002', 'doctor-morning'),
  ('2026-09-05', 'PVC009', 'doctor-full'),
  ('2026-09-05', 'PVC010', 'front-afternoon'),
  ('2026-09-05', 'PVC012', 'front-afternoon'),
  ('2026-09-05', 'PVC006', 'front-afternoon'),
  ('2026-09-05', 'PVC011', 'front-afternoon'),
  ('2026-09-05', 'PVC001', 'doctor-afternoon'),
  ('2026-09-06', 'PVC007', 'front-office'),
  ('2026-09-06', 'PVC010', 'front-office'),
  ('2026-09-06', 'PVC012', 'front-office'),
  ('2026-09-06', 'PVC003', 'front-office'),
  ('2026-09-06', 'PVC011', 'front-office'),
  ('2026-09-06', 'PVC005', 'front-office'),
  ('2026-09-06', 'PVC006', 'front-office'),
  ('2026-09-06', 'PVC004', 'front-office'),
  ('2026-09-06', 'PVC002', 'doctor-office'),
  ('2026-09-06', 'PVC001', 'doctor-office'),
  ('2026-09-06', 'PVC009', 'doctor-office'),
  ('2026-09-07', 'PVC003', 'front-office'),
  ('2026-09-07', 'PVC012', 'front-morning'),
  ('2026-09-07', 'PVC005', 'front-full'),
  ('2026-09-07', 'PVC002', 'doctor-morning');

-- Sửa đúng mã ca nếu lịch đã tồn tại nhưng được phân sai.
update app.records r
set payload = jsonb_set(r.payload, '{shift_code}', to_jsonb(e.shift_code), true),
    origin = 'vps',
    version = r.version + 1,
    updated_at = now()
from expected_schedule_20260901_07 e
where r.entity_type = 'schedule_assignments'
  and r.deleted_at is null
  and r.payload->>'employee_code' = e.employee_code
  and r.payload->>'work_date' = e.work_date::text
  and r.payload->>'shift_code' is distinct from e.shift_code;

-- Bổ sung lịch còn thiếu. Các trường tăng ca vẫn bằng 0 vì chỉ đơn tăng ca
-- được duyệt mới được cộng riêng vào bảng công.
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
  'schedule_assignments',
  ids.id::text,
  jsonb_build_object(
    'id', ids.id::text,
    'note', '[MONTHLY_SCHEDULE] Đối chiếu lịch làm 01-07/09/2026',
    'status', 'planned',
    'proof_url', null,
    'work_date', e.work_date::text,
    'owner_code', e.employee_code,
    'shift_code', e.shift_code,
    'employee_code', e.employee_code,
    'swap_with_code', null,
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0
  ),
  'vps',
  1,
  now(),
  now(),
  null
from expected_schedule_20260901_07 e
-- Tham chiếu e để PostgreSQL sinh một UUID riêng cho từng dòng thay vì
-- tối ưu biểu thức lateral không tương quan thành một UUID dùng chung.
cross join lateral (
  select gen_random_uuid() id
  where e.employee_code is not null
) ids
where not exists (
  select 1
  from app.records r
  where r.entity_type = 'schedule_assignments'
    and r.deleted_at is null
    and r.payload->>'employee_code' = e.employee_code
    and r.payload->>'work_date' = e.work_date::text
);

-- Dừng toàn bộ migration nếu còn thiếu hoặc sai bất kỳ một trong 55 ca.
do $$
declare
  mismatch_count integer;
begin
  select count(*)
  into mismatch_count
  from expected_schedule_20260901_07 e
  left join app.records r
    on r.entity_type = 'schedule_assignments'
   and r.deleted_at is null
   and r.payload->>'employee_code' = e.employee_code
   and r.payload->>'work_date' = e.work_date::text
   and r.payload->>'shift_code' = e.shift_code
  where r.record_key is null;

  if mismatch_count <> 0 then
    raise exception 'Con % lich lam bi thieu hoac sai trong giai doan 01-07/09/2026', mismatch_count;
  end if;
end;
$$;

commit;
