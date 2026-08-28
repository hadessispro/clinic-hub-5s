-- Hợp nhất ràng buộc leads_check giữa production và database dựng mới.
--
-- ─────────────────────────────────────────────────────────────────────────
-- VẤN ĐỀ
-- ─────────────────────────────────────────────────────────────────────────
--
-- Hai nơi cùng định nghĩa một ràng buộc tên leads_check, với hai luật khác
-- nhau, và chúng chưa bao giờ gặp nhau:
--
--   Migration 004 tạo bảng marketing.leads kèm một CHECK vô danh. Postgres
--   tự đặt tên cho nó là leads_check. Luật: lead không phải data thô thì phải
--   có số điện thoại VÀ phải có lịch hẹn.
--
--   Migration 008 muốn đổi luật thành: phải có số điện thoại VÀ net_level
--   phải là basic hoặc advanced. Nhưng nó bọc trong "if not exists" theo TÊN
--   ràng buộc. Tên đó đã bị 004 chiếm mất, nên đoạn thêm ràng buộc của 008
--   không bao giờ chạy.
--
-- Hệ quả là production và database dựng mới có hai lược đồ khác nhau:
--
--   production   phải có SĐT và net_level hợp lệ  ← app đang chạy theo luật này
--   dựng mới     phải có SĐT và có lịch hẹn       ← chặt hơn
--
-- Đo trên dữ liệu thật ngày 28/08/2026: 370 trên 1.612 lead data net KHÔNG có
-- lịch hẹn. Nếu dựng lại database từ migration rồi nạp bản sao lưu vào, 370
-- bản ghi đó bị từ chối. Không ai biết cho tới lúc cần khôi phục thật, mà lúc
-- cần khôi phục thì không phải lúc để phát hiện ra chuyện này.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CHỌN LUẬT NÀO
-- ─────────────────────────────────────────────────────────────────────────
--
-- Lấy luật của production. Hai lý do:
--
--   Ứng dụng đang chạy theo luật đó. Màn nhập lead của PG không bắt buộc điền
--   lịch hẹn, và 370 bản ghi đã tồn tại chứng minh điều đó là cố ý chứ không
--   phải sơ suất.
--
--   Siết chặt lại bây giờ sẽ chặn PG nhập lead khi khách chưa hẹn được ngày,
--   mà đó là tình huống bình thường: PG lấy được thông tin trước, hẹn sau.
--
-- Lịch hẹn vẫn quan trọng, nhưng nó quan trọng ở chỗ TÍNH HOA HỒNG chứ không
-- phải ở chỗ được phép lưu hay không. Thiếu lịch hẹn thì lead vẫn tồn tại,
-- chỉ là không tính được thời hạn nên không sinh hoa hồng.
--
-- Bài học rút ra, ghi lại đây cho lần sau: "add constraint if not exists"
-- kiểm theo TÊN chứ không kiểm theo NỘI DUNG. Hai ràng buộc khác nhau trùng
-- tên thì cái sau im lặng không chạy, và không có gì báo.

alter table marketing.leads drop constraint if exists leads_check;

alter table marketing.leads
  add constraint leads_check check (
    data_class = 'raw'
    or (
      phone is not null
      and length(regexp_replace(phone, '\D', '', 'g')) >= 8
      and net_level in ('basic', 'advanced')
    )
  );

comment on constraint leads_check on marketing.leads is
  'Lead data net phải có số điện thoại hợp lệ và mức phân loại. Lịch hẹn KHÔNG bắt buộc ở đây: nó chỉ quyết định có tính được hoa hồng hay không.';
