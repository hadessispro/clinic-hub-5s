-- Chấm công PG ngoại tuyến.
--
-- Trước migration này, marketing.pg_attendance không có chỗ ghi thời điểm PG
-- thực sự bấm nút: recorded_at mặc định now(), nên một lượt chấm công lưu tạm
-- lúc mất mạng rồi đồng bộ sau sẽ mang giờ đồng bộ chứ không phải giờ có mặt
-- tại điểm làm việc. Ngoài ra không có khóa idempotency, nên gửi lại cùng một
-- lượt có nguy cơ tạo bản ghi thứ hai khi ràng buộc (assignment_id, record_type)
-- chưa kịp áp dụng.
--
-- Chỉ THÊM cột, không sửa và không xóa dữ liệu đang có. Chạy lại được nhiều lần.

alter table marketing.pg_attendance
  add column if not exists client_event_id uuid;

alter table marketing.pg_attendance
  add column if not exists captured_offline boolean not null default false;

alter table marketing.pg_attendance
  add column if not exists captured_at timestamptz;

alter table marketing.pg_attendance
  add column if not exists synced_at timestamptz not null default now();

-- Bản ghi cũ chưa có captured_at thì coi thời điểm ghi nhận là thời điểm chụp,
-- để mọi truy vấn sau này dùng chung một cột mà không phải xử lý null.
update marketing.pg_attendance
set captured_at = recorded_at
where captured_at is null;

-- Khóa chống trùng khi client gửi lại cùng một lượt sau khi mất mạng.
-- Partial index để các bản ghi cũ (client_event_id null) không xung đột nhau.
create unique index if not exists pg_attendance_client_event_idx
  on marketing.pg_attendance(client_event_id)
  where client_event_id is not null;

-- Tra cứu hàng đợi còn treo theo PG.
create index if not exists pg_attendance_offline_idx
  on marketing.pg_attendance(pg_code, captured_offline, captured_at desc);

comment on column marketing.pg_attendance.client_event_id is
  'Mã lượt do thiết bị sinh ra. Dùng để gửi lại an toàn sau khi mất mạng.';
comment on column marketing.pg_attendance.captured_at is
  'Thời điểm PG thực sự bấm nút tại điểm làm việc, không phải thời điểm đồng bộ.';
comment on column marketing.pg_attendance.captured_offline is
  'True nếu lượt này được lưu tạm trên máy rồi mới đồng bộ lên sau.';
