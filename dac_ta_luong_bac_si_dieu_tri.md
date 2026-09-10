# Đặc tả bổ sung: Logic tính lương bác sĩ theo tư vấn & điều trị

> Tài liệu này dùng làm context/yêu cầu cho AI coding agent (Antigravity) triển khai vào hệ thống sẵn có. Agent cần đọc kỹ toàn bộ trước khi sinh code, đặc biệt phần "Ràng buộc bắt buộc" — đây là các quy tắc nghiệp vụ không được suy diễn khác đi.

## 1. Bối cảnh

Hệ thống hiện có đã quản lý bác sĩ, khách hàng, và một cơ chế phân loại tư vấn/thăm khám bằng mã `L` (L1–L5) — **phần này đã tồn tại, KHÔNG cần xây lại, chỉ cần đảm bảo trường tham chiếu tồn tại để không phá vỡ dữ liệu cũ.**

Phần cần bổ sung là logic tính lương/hoa hồng bác sĩ cho 2 nhóm hoạt động: **Tư vấn** và **Điều trị**, trong đó điều trị chia thành 2 nhánh có cách tính khác nhau: **mắc cài (chỉnh nha)** và **dịch vụ khác**.

## 2. Mô hình dữ liệu (bổ sung)

### Bảng `ca_tu_van` (Tư vấn)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| ma_tu_van | PK | |
| ma_bac_si | FK | |
| ma_kh | FK | |
| loai_tu_van | enum | `chinh_nha` \| `dich_vu_khac` \| `tham_kham` |
| ma_phan_loai_L | string, nullable | Tham chiếu mã L đã có sẵn trong hệ thống, chỉ lưu vết, không dùng để tính công thức |
| doanh_thu | number | Doanh thu phát sinh từ ca tư vấn này |

### Bảng `ca_dieu_tri` (Điều trị)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| ma_dieu_tri | PK | |
| ma_bac_si | FK | |
| ma_kh | FK | |
| la_mac_cai | boolean | `true` nếu là ca chỉnh nha có gắn mắc cài |
| so_ham | number, nullable | 1 hoặc 2 — chỉ áp dụng khi `la_mac_cai = true` |

### Bảng `giai_doan_mac_cai` (chỉ áp dụng khi `la_mac_cai = true`)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| ma_giai_doan | PK | |
| ma_dieu_tri | FK | |
| ham | number | 1 hoặc 2 — hàm nào đang được ghi nhận |
| giai_doan | enum | `GD1` \| `GD2` \| `GD3` |
| ngay_thuc_hien | date | |
| da_tinh_luong | boolean | Đánh dấu đã chốt lương cho mốc này, tránh tính trùng khi chạy lại bảng lương |

Mỗi hàm (1–2 hàm/ca) có tối đa 3 dòng tương ứng 3 giai đoạn. Nếu `so_ham = 2`, hệ thống phải sinh và theo dõi **độc lập** 2 bộ giai đoạn (hàm trên, hàm dưới) — không gộp chung một tiến độ.

### Bảng `tien_do_dich_vu_khac` (chỉ áp dụng khi `la_mac_cai = false`)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| ma_tien_do | PK | |
| ma_dieu_tri | FK | |
| thang | string (YYYY-MM) | |
| phan_tram | number | % hoàn thành ghi nhận riêng trong tháng đó |
| luy_ke | number | Tổng % lũy kế tính đến hết tháng đó |
| da_tinh_luong | boolean | Đánh dấu đã chốt lương, tránh tính trùng |

### Bảng `bang_luong` (tổng hợp theo bác sĩ + tháng)
| Trường | Kiểu |
|---|---|
| ma_bang_luong | PK |
| ma_bac_si | FK |
| thang | string |
| tong_tu_van | number |
| tong_dieu_tri | number |

## 3. Ràng buộc bắt buộc (business rules)

### 3.1 Tư vấn
- `chinh_nha` và `dich_vu_khac`: hoa hồng tính **theo doanh thu** của ca đó (công thức % cụ thể lấy từ bảng cấu hình hoa hồng hiện có của hệ thống — KHÔNG tự suy ra %).
- `tham_kham`: không tính theo doanh thu, xử lý theo logic mã `L` đã có sẵn — **không đụng vào phần này**.

### 3.2 Điều trị mắc cài (`la_mac_cai = true`)
- **Chỉ phát sinh hoa hồng khi có sự kiện gắn mắc cài hoặc giao khay (GĐ1)** — không tính hoa hồng cho việc tư vấn/lên kế hoạch trước đó.
- Tính **riêng theo từng hàm**: nếu ca có 2 hàm, mỗi hàm được tính hoa hồng độc lập tại mỗi mốc GĐ1/GĐ2/GĐ3 của chính hàm đó — không phải đợi cả 2 hàm cùng đạt mốc mới tính.
- 3 mốc tính lương trên mỗi hàm: GĐ1 (gắn mắc cài/giao khay), GĐ2 (sau 1–2 tháng), GĐ3 (tháo mắc cài, giao duy trì).
- Sau khi một mốc đã được tính lương (`da_tinh_luong = true`), không được tính lại ở các lần chạy bảng lương sau.

### 3.3 Điều trị dịch vụ khác (`la_mac_cai = false`)
- Hoa hồng tính theo **% hoàn thành lũy kế**, **KHÔNG chia nhỏ theo từng tháng ghi nhận**.
- Chỉ chốt và tính hoa hồng **khi lũy kế đạt đủ 100%**.
- Hoa hồng được ghi nhận trọn vẹn vào **tháng mà mốc 100% bị vượt qua/đạt tới**, không phải chia tỷ lệ theo % của từng tháng góp vào.
  - Ví dụ: tháng 7 đạt 30% (lũy kế 30%), tháng 8 đạt thêm 70% (lũy kế 100%) → toàn bộ hoa hồng của ca điều trị này được tính vào bảng lương **tháng 8**, tháng 7 không tính gì.
- Nếu lũy kế vượt 100% ở một tháng nào đó do nhập sai, hệ thống nên cảnh báo thay vì tự động tính hoa hồng vượt mức.

### 3.4 Chống tính trùng
- Mọi job tính bảng lương (chạy hàng tháng hoặc chạy lại) phải kiểm tra cờ `da_tinh_luong` trước khi cộng dồn vào `bang_luong`, để đảm bảo idempotent — chạy lại nhiều lần không làm tăng số tiền lương.

## 4. Những gì KHÔNG được thay đổi

- Toàn bộ cơ chế phân loại `L1–L5` cho tư vấn/thăm khám đã có sẵn — chỉ tham chiếu qua `ma_phan_loai_L`, không viết lại logic này.
- Không gộp cách tính "mắc cài" và "dịch vụ khác" thành một công thức chung — đây là 2 nhánh tính lương hoàn toàn khác nhau (mốc sự kiện vs. % lũy kế).

## 5. Việc cần agent thực hiện

1. Rà soát schema hiện có, ánh xạ các bảng/trường ở mục 2 vào đúng tên bảng/cột đang dùng trong hệ thống (không tạo trùng nếu đã có bảng tương đương).
2. Bổ sung các trường còn thiếu (`la_mac_cai`, `so_ham`, `da_tinh_luong`, `luy_ke`...).
3. Viết job/service tính lương theo đúng 4 quy tắc ở mục 3 — có unit test riêng cho từng nhánh (tư vấn theo doanh thu, mắc cài theo mốc từng hàm, dịch vụ khác theo lũy kế 100%).
4. Đảm bảo idempotent khi chạy lại bảng lương của cùng một tháng.
5. Nếu có điểm nào trong schema hiện có xung đột với đặc tả này, dừng lại và hỏi người dùng thay vì tự suy diễn.
