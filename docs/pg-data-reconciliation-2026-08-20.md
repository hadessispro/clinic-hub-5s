# Đối soát dữ liệu PG ngày 20/08/2026

## Quy tắc phân loại đã áp dụng

- `CS` luôn là **Data net · Chuyên sâu**.
- `CB` có nội dung lịch hẹn là **Data net · Cơ bản**.
- `CB` chưa có nội dung lịch hẹn là **Data thô**.
- Data thô luôn có `net_level = NULL`; không được mang nhãn Cơ bản/Chuyên sâu.
- Lịch hẹn ghi tự do như `Hẹn 12/7` vẫn được tính là có lịch. Trường `appointment_at` chỉ được tạo khi ngày giờ đủ rõ; nguyên văn luôn được giữ trong hồ sơ khách hàng.

## Kết quả nguồn và PostgreSQL

| Chỉ tiêu | Kết quả |
|---|---:|
| Dòng khách hàng trong SQL nguồn | 2.872 |
| Số điện thoại duy nhất trong nguồn | 2.872 |
| Thiếu tên | 0 |
| Thiếu/sai số điện thoại dưới 8 số | 0 |
| Hồ sơ nguồn đã có customer profile | 2.872 |
| Hồ sơ nguồn đã ánh xạ sang lead | 2.872 |
| Data thô | 1.566 |
| Data net · Cơ bản | 1.149 |
| Data net · Chuyên sâu | 157 |
| Net có lịch hẹn dạng chữ | 1.264 |
| Lịch hẹn đọc được thành timestamp | 936 |
| Lịch hẹn chỉ giữ nguyên văn | 328 |
| Hồ sơ thiếu dịch vụ trong chính nguồn | 20 |

PostgreSQL trước đối soát có 2.463 hồ sơ nguồn. Đợt này bổ sung 409 hồ sơ nguồn mới: 44 hồ sơ trùng với số điện thoại người dùng đã nhập trên web được liên kết vào hồ sơ sẵn có, 365 hồ sơ thực sự chưa tồn tại được thêm mới.

## Bảo toàn dữ liệu vận hành

- Không thay đổi trạng thái chăm sóc hoặc người Telesale phụ trách của 2.463 hồ sơ đã vận hành.
- Không xóa lịch sử cuộc gọi.
- Không xóa lịch sử phân công.
- Bốn bản ghi do nhập lại số điện thoại sau lần import cũ đã được gộp vào hồ sơ nguồn; 13 sự kiện phân công được chuyển sang hồ sơ giữ lại.
- Có 5 nhóm trùng số điện thoại chỉ thuộc dữ liệu nhập trực tiếp trên web. Một nhóm có tên khác nhau (`Cô Trúc` / `Nh Thái`), nên chưa tự xóa để tránh gộp nhầm khách hàng; cần người quản lý xác minh.

## Điểm cần bổ sung thủ công

20 hồ sơ nguồn không có dịch vụ, phân bổ như sau:

- Trần Thị Thuỳ Linh: 8
- Huỳnh Thị Ngọc My: 7
- Trần thị diễm trinh: 3
- Nguyễn Mỹ Trân: 2

Không tự suy đoán dịch vụ cho các hồ sơ này. Chúng được giữ nguyên để Support/PG cập nhật đúng từ chứng từ gốc.

## Khôi phục khi cần

Các bảng sao lưu trên VPS:

- `source_pg.customers_backup_20260820`
- `source_pg.staff_backup_20260820`
- `marketing.customer_profiles_backup_20260820`
- `marketing.leads_backup_20260820`
