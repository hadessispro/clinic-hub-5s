-- Kế toán nhìn thấy luồng chi hoa hồng ở MỌI giai đoạn, chỉ để quan sát.
--
-- ─────────────────────────────────────────────────────────────────────────
-- KẾ TOÁN QUAN SÁT, KHÔNG DUYỆT
-- ─────────────────────────────────────────────────────────────────────────
--
-- Quy trình duyệt vẫn nguyên bốn bước và nằm hoàn toàn bên marketing:
--
--   tính tự động → SUP xác nhận → Admin xác nhận → chốt
--
-- Kế toán không thêm một cửa nữa vào đó. Nhưng kế toán phải NẮM ĐƯỢC khoản
-- chi này từ sớm chứ không phải biết sau khi mọi thứ đã xong: cuối kỳ họ là
-- người phải giải thích con số, nên họ cần thấy nó hình thành.
--
-- Trước đó view chỉ hiện đợt ĐÃ CHỐT. Kế toán mở ra thì hoặc thấy một khoản
-- đã rồi, hoặc không thấy gì cả. Nay hiện mọi giai đoạn kèm trạng thái, để
-- kế toán biết tháng này sắp có một khoản chi bao nhiêu và nó đang ở đâu.
--
-- ─────────────────────────────────────────────────────────────────────────
-- KHÔNG MỞ ĐƯỜNG GHI NÀO
-- ─────────────────────────────────────────────────────────────────────────
--
-- Két kế toán chạy bằng vai trò database riêng, container riêng, mạng riêng,
-- và vẫn KHÔNG ghi được gì sang marketing. Quan sát thì chỉ cần quyền đọc,
-- và quyền đọc là thứ duy nhất được cấp.
--
-- Chỗ này đáng nói rõ vì bản nháp đầu của migration này từng cấp quyền ghi
-- theo cột để kế toán tự đẩy trạng thái. Nghiệp vụ không cần thế, nên đường
-- ghi đó bị bỏ. Một quyền không dùng tới là một quyền chỉ còn tác dụng vào
-- ngày có sự cố.

-- Xoá rồi tạo lại chứ không create or replace: view này đổi cả tên cột lẫn
-- thứ tự cột so với bản ở migration 030, mà "create or replace view" chỉ thêm
-- được cột vào cuối, không đổi được cột đã có.
--
-- Xoá view thì mất luôn quyền đã cấp trên nó, nên phần cấp quyền ở cuối file
-- phải chạy lại. Đó là lý do nó nằm sau chứ không nằm trước.
drop view if exists finance_src.hoa_hong_pg;
create view finance_src.hoa_hong_pg as
  select d.id                     dot_id,
         d.ky_code,
         d.ky_tu,
         d.ky_den,
         d.trang_thai,
         -- Nhãn tiếng Việt ngay trong view. Két kế toán là ứng dụng riêng,
         -- không dùng chung mã với hệ vận hành, nên nếu không đặt nhãn ở đây
         -- thì bên kia phải chép lại bảng ánh xạ trạng thái — và hai bảng ánh
         -- xạ rời nhau thì sớm muộn nói hai chuyện khác nhau.
         case d.trang_thai
           when 'cho_sup'        then 'Chờ SUP xác nhận'
           when 'cho_admin'      then 'SUP đã xác nhận · chờ Admin'
           when 'admin_da_duyet' then 'Admin đã xác nhận · chờ chốt'
           when 'da_chot'        then 'Đã chốt'
           when 'tu_choi'        then 'Đã từ chối'
           else d.trang_thai
         end                      trang_thai_ten,
         d.trang_thai = 'da_chot' da_chot,
         d.tinh_luc,
         d.sup_luc,
         d.admin_luc,
         d.chot_luc,
         d.chot_boi,
         d.tu_choi_luc,
         d.tu_choi_ly_do,
         d.tk_no,
         d.tk_co,
         d.khoan_muc,
         d.so_dong,
         d.tong_tien,
         d.tong_tien_pg,
         d.tong_tien_sup,
         d.finance_voucher_no,
         d.finance_ghi_so_luc
    from marketing.hoa_hong_dot d;

comment on view finance_src.hoa_hong_pg is
  'Các đợt hoa hồng PG/SUP ở mọi giai đoạn, để kế toán quan sát. Chỉ đọc, không duyệt.';

drop view if exists finance_src.hoa_hong_pg_chi_tiet;
create view finance_src.hoa_hong_pg_chi_tiet as
  select l.dot_id,
         d.ky_code,
         d.trang_thai,
         l.vai_tro,
         l.nguoi_ma,
         l.nguoi_ten,
         l.loai,
         count(*)::int      so_luong,
         sum(l.so_tien)     so_tien
    from marketing.hoa_hong_dong l
    join marketing.hoa_hong_dot d on d.id = l.dot_id
   where l.tinh_tien and not l.huy
   group by l.dot_id, d.ky_code, d.trang_thai, l.vai_tro, l.nguoi_ma, l.nguoi_ten, l.loai;

comment on view finance_src.hoa_hong_pg_chi_tiet is
  'Chi tiết hoa hồng gộp theo người, mọi giai đoạn. Chỉ dòng thật sự chi tiền. Chỉ đọc.';

do $$ begin
  execute 'grant usage on schema finance_src to finance_app';
  execute 'grant select on finance_src.hoa_hong_pg, finance_src.hoa_hong_pg_chi_tiet to finance_app';
exception when undefined_object then
  raise notice 'Chưa có vai trò finance_app, bỏ qua phần cấp quyền';
end $$;
