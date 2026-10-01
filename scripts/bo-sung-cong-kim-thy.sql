BEGIN;

-- 1. SCHEDULE ASSIGNMENTS CHO BÁC SĨ KIM THY (PVC-10187) TỪ 01/09 ĐẾN 10/09/2026
-- Ngày 1 (2026-09-01): OFF (không có ca làm việc)
-- Ngày 2 (2026-09-02): OFF (không có ca làm việc)

-- Ngày 3 (2026-09-03): Ca chiều (doctor-afternoon)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'schedule_assignments',
  'sched-pvc-10187-2026-09-03',
  jsonb_build_object(
    'id', 'sched-pvc-10187-2026-09-03',
    'employee_code', 'PVC-10187',
    'owner_code', 'PVC-10187',
    'work_date', '2026-09-03',
    'shift_code', 'doctor-afternoon',
    'branch_id', 'pham-van-chieu',
    'status', 'planned',
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0,
    'note', '[BÙ CÔNG]: Lịch phân ca Bác sĩ Huỳnh Kim Thy (Ca Chiều)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 4 (2026-09-04): Ca full (doctor-full)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'schedule_assignments',
  'sched-pvc-10187-2026-09-04',
  jsonb_build_object(
    'id', 'sched-pvc-10187-2026-09-04',
    'employee_code', 'PVC-10187',
    'owner_code', 'PVC-10187',
    'work_date', '2026-09-04',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'status', 'planned',
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0,
    'note', '[BÙ CÔNG]: Lịch phân ca Bác sĩ Huỳnh Kim Thy (Ca Full)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 5 (2026-09-05): Ca sáng tới 17h (doctor-office)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'schedule_assignments',
  'sched-pvc-10187-2026-09-05',
  jsonb_build_object(
    'id', 'sched-pvc-10187-2026-09-05',
    'employee_code', 'PVC-10187',
    'owner_code', 'PVC-10187',
    'work_date', '2026-09-05',
    'shift_code', 'doctor-office',
    'branch_id', 'pham-van-chieu',
    'status', 'planned',
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0,
    'note', '[BÙ CÔNG]: Lịch phân ca Bác sĩ Huỳnh Kim Thy (Ca Sáng - 17h)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 6 (2026-09-06): OFF (không có ca làm việc)

-- Ngày 7 (2026-09-07): Ca full (doctor-full)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'schedule_assignments',
  'sched-pvc-10187-2026-09-07',
  jsonb_build_object(
    'id', 'sched-pvc-10187-2026-09-07',
    'employee_code', 'PVC-10187',
    'owner_code', 'PVC-10187',
    'work_date', '2026-09-07',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'status', 'planned',
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0,
    'note', '[BÙ CÔNG]: Lịch phân ca Bác sĩ Huỳnh Kim Thy (Ca Full)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 8 (2026-09-08): Ca chiều (doctor-afternoon)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'schedule_assignments',
  'sched-pvc-10187-2026-09-08',
  jsonb_build_object(
    'id', 'sched-pvc-10187-2026-09-08',
    'employee_code', 'PVC-10187',
    'owner_code', 'PVC-10187',
    'work_date', '2026-09-08',
    'shift_code', 'doctor-afternoon',
    'branch_id', 'pham-van-chieu',
    'status', 'planned',
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0,
    'note', '[BÙ CÔNG]: Lịch phân ca Bác sĩ Huỳnh Kim Thy (Ca Chiều)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 9 (2026-09-09): Ca full (doctor-full)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'schedule_assignments',
  'sched-pvc-10187-2026-09-09',
  jsonb_build_object(
    'id', 'sched-pvc-10187-2026-09-09',
    'employee_code', 'PVC-10187',
    'owner_code', 'PVC-10187',
    'work_date', '2026-09-09',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'status', 'planned',
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0,
    'note', '[BÙ CÔNG]: Lịch phân ca Bác sĩ Huỳnh Kim Thy (Ca Full)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 10 (2026-09-10): Ca chiều (doctor-afternoon)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'schedule_assignments',
  'sched-pvc-10187-2026-09-10',
  jsonb_build_object(
    'id', 'sched-pvc-10187-2026-09-10',
    'employee_code', 'PVC-10187',
    'owner_code', 'PVC-10187',
    'work_date', '2026-09-10',
    'shift_code', 'doctor-afternoon',
    'branch_id', 'pham-van-chieu',
    'status', 'planned',
    'overtime_minutes', 0,
    'early_leave_minutes', 0,
    'early_arrival_minutes', 0,
    'note', '[BÙ CÔNG]: Lịch phân ca Bác sĩ Huỳnh Kim Thy (Ca Chiều)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;


-- 2. ATTENDANCE RECORDS (CHECKIN / CHECKOUT) CHO BÁC SĨ KIM THY (PVC-10187)
-- Chi nhánh: pham-van-chieu, tọa độ chuẩn chi nhánh

-- Ngày 3 (2026-09-03): Vào 10:00:00, Ra 20:00:00 (doctor-afternoon)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-03-in',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-03-in',
    'client_event_id', 'att-pvc-10187-2026-09-03-in',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-03',
    'record_type', 'checkin',
    'shift_code', 'doctor-afternoon',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-03T10:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Vào ca Chiều (10:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-03-out',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-03-out',
    'client_event_id', 'att-pvc-10187-2026-09-03-out',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-03',
    'record_type', 'checkout',
    'shift_code', 'doctor-afternoon',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-03T20:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Ra ca Chiều (20:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 4 (2026-09-04): Vào 08:00:00, Ra 20:00:00 (doctor-full)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-04-in',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-04-in',
    'client_event_id', 'att-pvc-10187-2026-09-04-in',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-04',
    'record_type', 'checkin',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-04T08:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Vào ca Full (08:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-04-out',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-04-out',
    'client_event_id', 'att-pvc-10187-2026-09-04-out',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-04',
    'record_type', 'checkout',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-04T20:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Ra ca Full (20:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 5 (2026-09-05): Vào 08:00:00, Ra 17:00:00 (doctor-office)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-05-in',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-05-in',
    'client_event_id', 'att-pvc-10187-2026-09-05-in',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-05',
    'record_type', 'checkin',
    'shift_code', 'doctor-office',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-05T08:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Vào ca Sáng-17h (08:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-05-out',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-05-out',
    'client_event_id', 'att-pvc-10187-2026-09-05-out',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-05',
    'record_type', 'checkout',
    'shift_code', 'doctor-office',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-05T17:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Ra ca Sáng-17h (17:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 7 (2026-09-07): Vào 08:00:00, Ra 20:00:00 (doctor-full)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-07-in',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-07-in',
    'client_event_id', 'att-pvc-10187-2026-09-07-in',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-07',
    'record_type', 'checkin',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-07T08:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Vào ca Full (08:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-07-out',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-07-out',
    'client_event_id', 'att-pvc-10187-2026-09-07-out',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-07',
    'record_type', 'checkout',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-07T20:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Ra ca Full (20:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 8 (2026-09-08): Vào 10:00:00, Ra 20:00:00 (doctor-afternoon)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-08-in',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-08-in',
    'client_event_id', 'att-pvc-10187-2026-09-08-in',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-08',
    'record_type', 'checkin',
    'shift_code', 'doctor-afternoon',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-08T10:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Vào ca Chiều (10:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-08-out',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-08-out',
    'client_event_id', 'att-pvc-10187-2026-09-08-out',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-08',
    'record_type', 'checkout',
    'shift_code', 'doctor-afternoon',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-08T20:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Ra ca Chiều (20:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 9 (2026-09-09): Vào 08:00:00, Ra 20:00:00 (doctor-full)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-09-in',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-09-in',
    'client_event_id', 'att-pvc-10187-2026-09-09-in',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-09',
    'record_type', 'checkin',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-09T08:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Vào ca Full (08:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_records',
  'att-pvc-10187-2026-09-09-out',
  jsonb_build_object(
    'id', 'att-pvc-10187-2026-09-09-out',
    'client_event_id', 'att-pvc-10187-2026-09-09-out',
    'employee_code', 'PVC-10187',
    'work_date', '2026-09-09',
    'record_type', 'checkout',
    'shift_code', 'doctor-full',
    'branch_id', 'pham-van-chieu',
    'recorded_at', '2026-09-09T20:00:00+07:00',
    'lat', 10.8485568, 'lng', 106.6492019, 'accuracy_m', 10, 'distance_m', 5,
    'status', 'valid',
    'note', '[BÙ CÔNG ĐỐI SOÁT]: Ra ca Full (20:00:00)'
  ),
  'vps-admin-script'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;


-- 3. BẢNG CÔNG ATTENDANCE_WORK_DAYS CHO BÁC SĨ KIM THY (PVC-10187)
-- Ngày 3 (2026-09-03): Ca chiều (540 phút, credit 1)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_work_days',
  'work:PVC-10187:2026-09-03',
  jsonb_build_object(
    'id', 'work:PVC-10187:2026-09-03',
    'source', 'postgresql-vps',
    'employee_code', 'PVC-10187',
    'status', 'complete',
    'branch_id', 'pham-van-chieu',
    'work_date', '2026-09-03',
    'shift_code', 'doctor-afternoon',
    'shift_name', 'Ca chiều',
    'checkin_at', '2026-09-03T10:00:00+07:00',
    'checkout_at', '2026-09-03T20:00:00+07:00',
    'late_minutes', 0,
    'early_leave_minutes', 0,
    'scheduled_minutes', 540,
    'regular_minutes', 540,
    'overtime_minutes', 0,
    'approved_overtime_minutes', 0,
    'overtime_request_ids', jsonb_build_array(),
    'payable_minutes', 540,
    'workday_credit', 1,
    'checkout_branch_id', 'pham-van-chieu',
    'calculated_at', now()::text
  ),
  'vps-work-calculation'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 4 (2026-09-04): Ca full (660 phút, credit 1)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_work_days',
  'work:PVC-10187:2026-09-04',
  jsonb_build_object(
    'id', 'work:PVC-10187:2026-09-04',
    'source', 'postgresql-vps',
    'employee_code', 'PVC-10187',
    'status', 'complete',
    'branch_id', 'pham-van-chieu',
    'work_date', '2026-09-04',
    'shift_code', 'doctor-full',
    'shift_name', 'Ca full',
    'checkin_at', '2026-09-04T08:00:00+07:00',
    'checkout_at', '2026-09-04T20:00:00+07:00',
    'late_minutes', 0,
    'early_leave_minutes', 0,
    'scheduled_minutes', 660,
    'regular_minutes', 660,
    'overtime_minutes', 0,
    'approved_overtime_minutes', 0,
    'overtime_request_ids', jsonb_build_array(),
    'payable_minutes', 660,
    'workday_credit', 1,
    'checkout_branch_id', 'pham-van-chieu',
    'calculated_at', now()::text
  ),
  'vps-work-calculation'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 5 (2026-09-05): Ca sáng tới 17h (480 phút, credit 1)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_work_days',
  'work:PVC-10187:2026-09-05',
  jsonb_build_object(
    'id', 'work:PVC-10187:2026-09-05',
    'source', 'postgresql-vps',
    'employee_code', 'PVC-10187',
    'status', 'complete',
    'branch_id', 'pham-van-chieu',
    'work_date', '2026-09-05',
    'shift_code', 'doctor-office',
    'shift_name', 'Ca hành chính',
    'checkin_at', '2026-09-05T08:00:00+07:00',
    'checkout_at', '2026-09-05T17:00:00+07:00',
    'late_minutes', 0,
    'early_leave_minutes', 0,
    'scheduled_minutes', 480,
    'regular_minutes', 480,
    'overtime_minutes', 0,
    'approved_overtime_minutes', 0,
    'overtime_request_ids', jsonb_build_array(),
    'payable_minutes', 480,
    'workday_credit', 1,
    'checkout_branch_id', 'pham-van-chieu',
    'calculated_at', now()::text
  ),
  'vps-work-calculation'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 7 (2026-09-07): Ca full (660 phút, credit 1)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_work_days',
  'work:PVC-10187:2026-09-07',
  jsonb_build_object(
    'id', 'work:PVC-10187:2026-09-07',
    'source', 'postgresql-vps',
    'employee_code', 'PVC-10187',
    'status', 'complete',
    'branch_id', 'pham-van-chieu',
    'work_date', '2026-09-07',
    'shift_code', 'doctor-full',
    'shift_name', 'Ca full',
    'checkin_at', '2026-09-07T08:00:00+07:00',
    'checkout_at', '2026-09-07T20:00:00+07:00',
    'late_minutes', 0,
    'early_leave_minutes', 0,
    'scheduled_minutes', 660,
    'regular_minutes', 660,
    'overtime_minutes', 0,
    'approved_overtime_minutes', 0,
    'overtime_request_ids', jsonb_build_array(),
    'payable_minutes', 660,
    'workday_credit', 1,
    'checkout_branch_id', 'pham-van-chieu',
    'calculated_at', now()::text
  ),
  'vps-work-calculation'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 8 (2026-09-08): Ca chiều (540 phút, credit 1)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_work_days',
  'work:PVC-10187:2026-09-08',
  jsonb_build_object(
    'id', 'work:PVC-10187:2026-09-08',
    'source', 'postgresql-vps',
    'employee_code', 'PVC-10187',
    'status', 'complete',
    'branch_id', 'pham-van-chieu',
    'work_date', '2026-09-08',
    'shift_code', 'doctor-afternoon',
    'shift_name', 'Ca chiều',
    'checkin_at', '2026-09-08T10:00:00+07:00',
    'checkout_at', '2026-09-08T20:00:00+07:00',
    'late_minutes', 0,
    'early_leave_minutes', 0,
    'scheduled_minutes', 540,
    'regular_minutes', 540,
    'overtime_minutes', 0,
    'approved_overtime_minutes', 0,
    'overtime_request_ids', jsonb_build_array(),
    'payable_minutes', 540,
    'workday_credit', 1,
    'checkout_branch_id', 'pham-van-chieu',
    'calculated_at', now()::text
  ),
  'vps-work-calculation'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

-- Ngày 9 (2026-09-09): Ca full (660 phút, credit 1)
INSERT INTO app.records (entity_type, record_key, payload, origin)
VALUES (
  'attendance_work_days',
  'work:PVC-10187:2026-09-09',
  jsonb_build_object(
    'id', 'work:PVC-10187:2026-09-09',
    'source', 'postgresql-vps',
    'employee_code', 'PVC-10187',
    'status', 'complete',
    'branch_id', 'pham-van-chieu',
    'work_date', '2026-09-09',
    'shift_code', 'doctor-full',
    'shift_name', 'Ca full',
    'checkin_at', '2026-09-09T08:00:00+07:00',
    'checkout_at', '2026-09-09T20:00:00+07:00',
    'late_minutes', 0,
    'early_leave_minutes', 0,
    'scheduled_minutes', 660,
    'regular_minutes', 660,
    'overtime_minutes', 0,
    'approved_overtime_minutes', 0,
    'overtime_request_ids', jsonb_build_array(),
    'payable_minutes', 660,
    'workday_credit', 1,
    'checkout_branch_id', 'pham-van-chieu',
    'calculated_at', now()::text
  ),
  'vps-work-calculation'
)
ON CONFLICT (entity_type, record_key) DO UPDATE
SET payload = EXCLUDED.payload, origin = EXCLUDED.origin, updated_at = now(), deleted_at = null;

COMMIT;
