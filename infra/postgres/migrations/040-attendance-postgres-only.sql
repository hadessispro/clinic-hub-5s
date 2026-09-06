-- Từ 01/09/2026, PostgreSQL/VPS là nguồn dữ liệu duy nhất cho chấm công,
-- phân ca và bảng tính công. Không phát sinh bản sao Supabase/Google Sheet.

begin;

create or replace function app.queue_record_backup() returns trigger
language plpgsql as $$
declare loai text := coalesce(new.entity_type, old.entity_type);
begin
  if current_setting('app.suppress_backup_outbox', true) = 'on' then
    return coalesce(new, old);
  end if;

  if loai = any(array[
    'attendance_records',
    'attendance_work_days',
    'schedule_assignments',
    'schedule_requests',
    'work_shifts',
    'employee_allowed_shifts',
    'payroll_feedback'
  ]::text[]) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    insert into app.backup_outbox(entity_type, record_key, operation, payload)
    values (old.entity_type, old.record_key, 'delete', old.payload);
    return old;
  end if;

  insert into app.backup_outbox(entity_type, record_key, operation, payload)
  values (new.entity_type, new.record_key, 'upsert', new.payload);
  return new;
end;
$$;

-- Không xóa lịch sử. Các sự kiện chấm công chưa gửi được chỉ được đóng lại
-- với lý do rõ ràng vì từ thời điểm này chúng là dữ liệu cục bộ có chủ đích.
update app.backup_outbox
set completed_at = coalesce(completed_at, now()),
    dead_at = null,
    dead_reason = null,
    last_error = 'local-only since 2026-09-01: PostgreSQL is attendance source of truth'
where completed_at is null
  and entity_type = any(array[
    'attendance_records',
    'attendance_work_days',
    'schedule_assignments',
    'schedule_requests',
    'work_shifts',
    'employee_allowed_shifts',
    'payroll_feedback'
  ]::text[]);

-- Dữ liệu chấm công đã nhập từ nguồn cũ nay thuộc PostgreSQL. Đổi origin để
-- app.bootstrap_from_shadow() không thể ghi đè lại nếu worker cũ còn chạy
-- trong lúc các container đang được thay thế.
update app.records
set origin = 'vps',
    updated_at = now()
where deleted_at is null
  and entity_type = any(array[
    'attendance_records',
    'attendance_work_days',
    'schedule_assignments',
    'schedule_requests',
    'work_shifts',
    'employee_allowed_shifts',
    'payroll_feedback'
  ]::text[]);

commit;
