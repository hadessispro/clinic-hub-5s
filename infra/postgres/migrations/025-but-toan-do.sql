-- ═══════════════════════════════════════════════════════════════════════════
-- CHO PHÉP BÚT TOÁN ĐỎ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 022 cấm số âm ở cả hai bên Nợ và Có. Ràng buộc đó dựa trên khảo
-- sát 77.220 dòng, và khảo sát đó đọc thiếu: bộ sổ thật có đúng 2 dòng âm.
--
--   XK.MT.2026_07/03 ngày 31/07/2026, "Cone giấy (200C/H)"
--     TK 621 đối ứng 152   Nợ  -1.571
--     TK 152 đối ứng 621   Có  -1.571
--
-- Đây là bút toán đỏ, cách sửa sai được dùng phổ biến trong kế toán Việt Nam:
-- thay vì ghi một bút toán đảo ngược, người ta ghi lại chính bút toán cũ với
-- số âm. Khác biệt không chỉ là hình thức. Bút toán đảo làm phát sinh Nợ và
-- phát sinh Có của tài khoản đều phình lên, còn bút toán đỏ thì không. Trên
-- Bảng cân đối tài khoản, hai cách cho hai con số phát sinh khác nhau.
--
-- Đó là lý do giữ nguyên dấu thay vì lật -1.571 bên Nợ thành +1.571 bên Có.
-- Lật dấu vẫn cân, nhưng làm tổng phát sinh lệch khỏi con số 99.834.075.425
-- mà kế toán đang cầm, và làm hỏng phép đối chiếu chéo với Bảng cân đối.
-- Sổ trong hệ thống phải khớp với sổ trên tay kế toán tới từng đồng.
--
-- Điều thật sự cần cấm vẫn giữ nguyên: một dòng không được có cả hai vế.
--
-- An toàn khi chạy lại nhiều lần.

begin;

alter table finance.journal_lines drop constraint if exists journal_lines_check;
alter table finance.journal_lines drop constraint if exists journal_lines_check1;
alter table finance.journal_lines drop constraint if exists jl_khong_ca_hai_ve;

-- Một dòng chỉ được ghi một vế. Đây mới là ràng buộc chặn lỗi nhập liệu thật.
-- Số 0 ở cả hai vế vẫn cho phép: bút toán ghi nhận sự kiện không có giá trị
-- tiền vẫn tồn tại trong sổ.
alter table finance.journal_lines add constraint jl_khong_ca_hai_ve
  check (debit = 0 or credit = 0);

comment on column finance.journal_lines.debit is
  'Cho phép số âm. Bút toán đỏ ghi lại bút toán cũ với dấu âm để sửa sai, '
  'khác với bút toán đảo ở chỗ không làm phình tổng phát sinh.';
comment on column finance.journal_lines.credit is
  'Cho phép số âm. Xem ghi chú ở cột debit.';

commit;
