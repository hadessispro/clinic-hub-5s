# Khôi phục đề xuất mua hàng BM03

## Phạm vi đã khôi phục

- Tab **Đề xuất mua** trong Kho vật tư và biểu mẫu `5S_QĐ_KT_01/BM03`.
- Danh mục chuẩn gồm đúng 51 mặt hàng.
- Tạo, sửa, lưu và xóa dòng đề xuất; gợi ý hàng dưới định mức; so sánh báo giá nhà cung cấp.
- Xuất Excel theo mẫu BM03 đã phát hành.
- Tách một phiếu đề xuất thành các đơn đặt hàng theo từng nhà cung cấp.

## Cách xử lý xung đột

- Chỉ lấy phần Kho từ các thay đổi của Antigravity; không nhập các commit trung gian liên quan Supabase hoặc chấm công.
- Giữ `public/**/*` trong quy trình triển khai để cả logo và mẫu Excel trong thư mục con đều được đưa lên VPS.
- Giữ CSS chấm công trong `public/attendance-layout.css`; CSS BM03 chỉ quản lý phạm vi `.bm03-*` trong `app.css`.
- Không đưa tệp ODS làm việc vào repository. Chỉ giữ tệp XLSX trống đã rà soát tại `public/templates/mau_de_xuat_mua_hang_bm03.xlsx`.

## Chốt kiểm tự động

`node scripts/kiem-kho-bm03.mjs` kiểm tra:

1. Đúng 51 mặt hàng và đủ trường bắt buộc.
2. Mẫu Excel nhúng trùng tuyệt đối với tệp dự phòng được triển khai.
3. Phiếu mặc định nạp đủ danh mục.
4. Luồng tạo đơn tách đúng theo nhà cung cấp.
5. Giao diện vẫn còn đủ nút nạp mẫu, lưu, xuất Excel và tạo đơn.

Chốt này chạy trong GitHub Actions trên mọi lần đẩy mã và pull request.

## Trạng thái lưu dữ liệu

Phiếu đề xuất hiện được lưu trên trình duyệt bằng `localStorage`, đúng với phiên bản tính năng được khôi phục. Dữ liệu Kho mẫu và đơn đặt hàng trong service vẫn là dữ liệu phía giao diện. Khi nâng cấp sử dụng chính thức cho nhiều máy/người dùng, cần chuyển phiếu BM03 và đơn đặt hàng sang API/PostgreSQL trước khi coi đây là sổ dữ liệu tập trung.
