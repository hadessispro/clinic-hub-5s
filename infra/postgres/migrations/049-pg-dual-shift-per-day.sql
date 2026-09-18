-- Migration 049: Cho phép 1 PG làm tối đa 2 ca trong ngày và chặn trùng ca tại cùng điểm làm việc

-- 1. Xóa ràng buộc unique (pg_code, work_date) cũ (trước đây chỉ cho phép 1 ca/ngày/PG)
alter table marketing.pg_shift_assignments
  drop constraint if exists pg_shift_assignments_pg_code_work_date_key;

-- 2. Đảm bảo cùng một PG không bị phân công 2 ca có cùng giờ bắt đầu trong ngày
create unique index if not exists pg_shift_assignments_pg_work_date_start_idx
  on marketing.pg_shift_assignments(lower(trim(pg_code)), work_date, start_time);

-- 3. Index phục vụ kiểm tra nhanh xung đột ca tại cùng một địa điểm làm việc
create index if not exists pg_shift_assignments_site_work_date_idx
  on marketing.pg_shift_assignments(site_id, work_date, start_time, end_time);
