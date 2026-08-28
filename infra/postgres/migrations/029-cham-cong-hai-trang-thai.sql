-- ═══════════════════════════════════════════════════════════════════════════
-- CHẤM CÔNG CHỈ CÒN HAI TRẠNG THÁI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Chấm công chỉ có hai việc: xác nhận vào ca và xác nhận ra ca. Việc đánh giá
-- trễ muộn được bỏ khỏi hệ thống này và chuyển sang bước đồng bộ Google Sheet,
-- nơi có đủ lịch làm việc thật để đối chiếu.
--
-- ───────────────────────────────────────────────────────────────────────────
-- VÌ SAO BỎ
-- ───────────────────────────────────────────────────────────────────────────
--
-- Ngày 28/08/2026, một nhân viên check-in lúc 07:25. Màn hình ghi rõ "Ca
-- 07:30-17:00", tức là vào sớm 5 phút, vậy mà bản ghi bị gắn nhãn "Đi muộn".
--
-- Nguyên nhân không nằm ở phép tính. Backend lấy shift_code từ bảng phân ca,
-- và khi không tìm thấy phân ca cho ngày đó thì rơi về ca mặc định
-- clinic-0800. Ca đem ra so không phải ca mà người đó nhìn thấy, nên kết luận
-- trễ hay không trễ là kết luận về một ca khác.
--
-- Sửa cho khớp thì phải sửa cả chuỗi phân công lịch làm việc, và đó là việc
-- riêng. Trong lúc chờ, một nhãn "Đi muộn" sai làm người bị gắn mất lòng tin
-- vào toàn bộ hệ thống, còn công thì vẫn phải tính tay. Nhãn sai tệ hơn không
-- có nhãn.
--
-- ───────────────────────────────────────────────────────────────────────────
-- DỮ LIỆU CŨ ĐƯỢC GIỮ, KHÔNG XÓA
-- ───────────────────────────────────────────────────────────────────────────
--
-- 23 bản ghi 'late' và 12 bản ghi 'early_leave' trong app.records, cùng 2 và 3
-- bản trong marketing.pg_attendance, đều được chuyển sang 'valid' để mọi báo
-- cáo tính đủ ngày công. NHƯNG nhãn cũ được cất vào một khóa riêng chứ không
-- biến mất: bước đồng bộ Google Sheet có thể cần biết hệ thống cũ đã từng
-- phán gì, và xóa đi thì không lấy lại được.
--
-- Giờ chấm, ca làm, khoảng cách, sai số GPS vốn chưa bao giờ bị đụng tới. Đó
-- mới là dữ liệu thô, và nó vẫn nguyên vẹn để tính lại từ đầu.
--
-- An toàn khi chạy lại nhiều lần.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 · CHẤM CÔNG NHÂN VIÊN · app.records
-- ───────────────────────────────────────────────────────────────────────────

update app.records
   set payload = payload
                 || jsonb_build_object('status', 'valid')
                 || jsonb_build_object('status_he_thong_cu', payload->>'status')
                 || jsonb_build_object('ghi_chu_chuyen_doi',
                      'Nhãn trễ muộn bỏ ngày 28/08/2026, xem migration 029'),
       updated_at = now()
 where entity_type = 'attendance_records'
   and deleted_at is null
   and payload->>'status' in ('late', 'early_leave')
   and payload->>'status_he_thong_cu' is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2 · CHẤM CÔNG PG · marketing.pg_attendance
-- ───────────────────────────────────────────────────────────────────────────

alter table marketing.pg_attendance
  add column if not exists status_he_thong_cu text;

comment on column marketing.pg_attendance.status_he_thong_cu is
  'Nhãn trễ muộn mà hệ thống cũ đã gán, giữ lại để bước đồng bộ Google Sheet '
  'đối chiếu được. Không dùng cho báo cáo. Xem migration 029.';

update marketing.pg_attendance
   set status_he_thong_cu = status,
       status = 'valid'
 where status in ('late', 'early_leave')
   and status_he_thong_cu is null;

comment on column marketing.pg_attendance.status is
  'Chỉ còn hai giá trị có nghĩa: valid là đã ghi nhận, outside là bị từ chối '
  'vì ngoài bán kính. Loại lượt chấm nằm ở cột record_type, không nằm ở đây.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3 · VIEW MỘT CHIỀU CHO KÉT KẾ TOÁN
-- ───────────────────────────────────────────────────────────────────────────
-- Thêm record_type để phía tài chính đếm được số lượt vào ca, thay vì đếm mọi
-- lượt rồi chia đôi. Không phơi thêm cột nào ngoài những gì kế toán cần.

create or replace view finance_src.pg_attendance as
select a.pg_code,
       s.work_date,
       a.record_type,
       a.status,
       a.captured_offline,
       a.captured_at
from marketing.pg_attendance a
left join marketing.pg_shift_assignments s on s.id = a.assignment_id;

commit;
