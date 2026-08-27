-- ═══════════════════════════════════════════════════════════════════════════
-- HÀNG ĐỢI SAO LƯU · NGĂN THƯ CHẾT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Khảo sát ngày 27/08/2026: app.backup_outbox có 1.034 bản ghi kẹt, bản cũ
-- nhất từ 11/08, lần thử gần nhất là lần thứ 391. Chúng không kẹt vì mạng
-- chập chờn mà vì ba loại lỗi không bao giờ tự khỏi:
--
--   PGRST204  978 dòng  Supabase thiếu cột. 16 cột trên 6 bảng.
--   22P02      33 dòng  Supabase khai cột là uuid, VPS gửi khóa dạng chữ.
--   23503      24 dòng  Xóa nhân viên còn bị attendance_records tham chiếu.
--
-- Thử lại một cột không tồn tại 391 lần thì lần thứ 392 cũng không tồn tại.
-- Với trần chờ 1 giờ, 1.034 bản ghi này gọi Supabase khoảng 25.000 lần mỗi
-- ngày, vô ích, và mỗi lần lại ghi đè last_error nên không ai thấy gì bất
-- thường: log chỉ in "Processed N backup event(s)" như thể mọi thứ đang chạy.
--
-- Ngăn thư chết chữa đúng chỗ đó. Bản ghi hỏng vĩnh viễn được đặt sang một
-- bên KÈM LÝ DO, hàng đợi sạch trở lại, và số bản ghi chết là một con số nhìn
-- thấy được thay vì một sự im lặng.
--
-- Dữ liệu KHÔNG mất. payload giữ nguyên. Sửa xong lược đồ bên Supabase thì
-- đặt lại dead_at = null là chúng chạy tiếp.
--
-- An toàn khi chạy lại nhiều lần.

begin;

alter table app.backup_outbox add column if not exists dead_at     timestamptz;
alter table app.backup_outbox add column if not exists dead_reason text;

comment on column app.backup_outbox.dead_at is
  'Đặt sang một bên vì lỗi không tự khỏi. Không phải đã xóa: payload còn '
  'nguyên, đặt lại null là chạy tiếp.';
comment on column app.backup_outbox.dead_reason is
  'Vì sao bỏ cuộc: thieu_cot, sai_kieu, vuong_khoa_ngoai, qua_nhieu_lan.';

-- Chỉ mục cũ quét cả những bản ghi đã chết. Chỉ mục một phần này giữ cho câu
-- lấy việc luôn nhanh dù ngăn thư chết có phình to bao nhiêu.
create index if not exists backup_outbox_cho_lam_idx
  on app.backup_outbox (next_attempt_at, id)
  where completed_at is null and dead_at is null;

-- Sức khỏe hàng đợi, đọc một cái là biết. Không có view này thì phải nhớ ba
-- câu truy vấn mới trả lời được "sao lưu có đang chạy không".
create or replace view app.v_suc_khoe_sao_luu as
select
  count(*) filter (where completed_at is not null)                      as da_xong,
  count(*) filter (where completed_at is null and dead_at is null)      as dang_cho,
  count(*) filter (where dead_at is not null)                           as da_chet,
  count(*) filter (where completed_at is null and dead_at is null
                     and attempts > 5)                                  as dang_cho_va_kho,
  max(completed_at)                                                     as lan_dong_bo_gan_nhat,
  min(created_at) filter (where completed_at is null and dead_at is null)
                                                                        as viec_cho_cu_nhat
from app.backup_outbox;

comment on view app.v_suc_khoe_sao_luu is
  'lan_dong_bo_gan_nhat cách hiện tại quá một giờ là sao lưu đang có vấn đề.';

-- Chi tiết ngăn thư chết, gom theo nguyên nhân, để biết phải sửa gì bên
-- Supabase trước.
create or replace view app.v_sao_luu_da_chet as
select
  entity_type                                                     as bang,
  dead_reason                                                     as nguyen_nhan,
  coalesce(substring(last_error from 'Could not find the ''([a-z_]+)'' column'),
           substring(last_error from '"code":"([A-Z0-9]+)"'))     as chi_tiet,
  count(*)                                                        as so_ban_ghi,
  min(created_at)                                                 as cu_nhat,
  max(created_at)                                                 as moi_nhat
from app.backup_outbox
where dead_at is not null
group by 1, 2, 3
order by 4 desc;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- CHẠY LẠI NHỮNG BẢN GHI ĐÃ CHẾT SAU KHI SỬA XONG SUPABASE
--
--   update app.backup_outbox
--      set dead_at = null, dead_reason = null, attempts = 0,
--          next_attempt_at = now(), last_error = null
--    where dead_at is not null
--      and entity_type = 'system_error_logs';   -- sửa được bảng nào chạy bảng đó
--
-- Chạy từng bảng một, không chạy tất cả cùng lúc: nếu lược đồ vẫn còn thiếu
-- thì lại kẹt đúng như cũ, chỉ khác là mất thêm một vòng.
-- ═══════════════════════════════════════════════════════════════════════════
