# BÁO CÁO ĐÁNH GIÁ TOÀN DIỆN: PHÂN HỆ KÉT SẮT KẾ TOÁN (FINANCE VAULT) — NHA KHOA 5S

> **Dành cho:** Kỹ sư hệ thống, AI Coding Assistant (OpenAI Codex / Claude / Antigravity), Kế toán trưởng và Ban Giám Đốc.  
> **Thời điểm kiểm toán:** Tháng 10/2026.  
> **Phạm vi kiểm toán:** Toàn bộ mã nguồn `apps/finance`, schema PostgreSQL `finance`, `finance_src`, container `clinic-hub-5s-finance-1`, reverse proxy Caddy và dữ liệu sổ cái thực tế trên máy chủ VPS.

---

## I. TỔNG QUAN KIẾN TRÚC & NGUYÊN TẮC BẢO MẬT ĐỘC LẬP

Phân hệ **Finance Vault (Két Kế Toán)** được thiết kế theo tư duy **Air-gapped Logic (Cách ly logic triệt để)** với hệ thống vận hành phòng khám (Clinic Hub PWA). Lý do cốt lõi: *Một sự cố hoặc lỗ hổng ở hệ vận hành lâm sàng không bao giờ được phép trở thành cửa ngõ thâm nhập vào sổ sách tài chính kế toán*.

### 1. Sơ đồ kiến trúc & Luồng dữ liệu

```
┌────────────────────────────────────────────────────────────────────────┐
│                        INTERNET / TRÌNH DUYỆT                          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTPS
                                     ▼
                    ┌─────────────────────────────────┐
                    │       CADDY REVERSE PROXY       │
                    │   (clinic-hub-5s-web-1:443)     │
                    └───────┬─────────────────┬───────┘
            /vault*         │                 │ /* (PWA Vận hành)
                            ▼                 ▼
             ┌──────────────────────┐  ┌──────────────────────┐
             │    FINANCE VAULT     │  │   CLINIC HUB PWA     │
             │   (Container riêng)  │  │   (Backend + Web)    │
             │     Port 4100        │  │     Port 4000        │
             └──────────┬───────────┘  └──────────┬───────────┘
                        │                         │
                        │ User: finance_app       │ User: clinic_app
                        ▼                         ▼
             ┌────────────────────────────────────────────────┐
             │             POSTGRESQL DATABASE                │
             │        (clinic-hub-5s-postgres-1)              │
             │                                                │
             │  ┌──────────────────┐    ┌──────────────────┐  │
             │  │  Schema finance  │    │    Schema app    │  │
             │  │   (Sổ cái kép,   │    │  (Hồ sơ, ca trực,│  │
             │  │   chứng từ, quỹ) │    │  chấm công, kho) │  │
             │  └────────▲─────────┘    └────────┬─────────┘  │
             │           │                       │            │
             │           └───────────┬───────────┘            │
             │                       │                        │
             │             ┌─────────┴─────────┐              │
             │             │ Schema finance_src│              │
             │             │ (View 1 chiều     │              │
             │             │  Chỉ đọc dữ liệu) │              │
             │             └───────────────────┘              │
             └────────────────────────────────────────────────┘
```

### 2. Các nguyên tắc bất biến (Invariants)
1. **Schema & Database Role riêng biệt**:
   - Dữ liệu tài chính nằm tại schema `finance`. Chỉ user database `finance_app` mới có quyền đọc/ghi. User vận hành (`clinic_app`) hoàn toàn **KHÔNG CÓ QUYỀN TRUY CẬP** schema `finance`.
2. **Cầu nối một chiều (`finance_src`)**:
   - Tài chính được phép **ĐỌC** dữ liệu vận hành (bảng công, lương, hoa hồng) thông qua các VIEW được kiểm soát chặt chẽ ở schema `finance_src`.
   - Hệ vận hành **KHÔNG BAO GIỜ** đọc được sổ cái tài chính.
3. **Audit Log bất biến (Append-only Trigger)**:
   - Mọi thao tác xem số tiền, xuất báo cáo, sửa chứng từ đều được ghi vào `finance.access_log`.
   - Bảng này có trigger PostgreSQL `access_log_no_update` chặn toàn bộ thao tác `UPDATE` và `DELETE` ở cấp database (kể cả admin cũng không sửa/xóa được log).
4. **Khóa kỳ kế toán (Period Guard Trigger)**:
   - Các kỳ đã khóa (`locked`) có trigger `guard_locked_period` chặn mọi thao tác sửa/xóa bút toán. Bắt buộc phải tạo bút toán điều chỉnh ở kỳ đang mở.
5. **Zero-Dependency Frontend**:
   - Giao diện Két sắt (`apps/finance/public/app.js`) thuần Vanilla JS, không sử dụng framework hay CDN bên ngoài.
   - Chính sách CSP nghiêm ngặt: `default-src 'none'; script-src 'self'; style-src 'self'; frame-ancestors 'none'`. Chống tuyệt đối XSS và Clickjacking.
   - Token xác thực lưu trong RAM (biến JS), không lưu ở `localStorage`. Đóng tab là tự động khóa két.

---

## II. ĐÁNH GIÁ CHI TIẾT 10 PHÂN HỆ CỦA KÉT SẮT KẾ TOÁN

| STT | Phân hệ / Thành phần | Hiện trạng thực tế | Đánh giá & Rủi ro | Giải pháp khuyến nghị |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Sổ Quỹ Tiền Mặt (TK 111)** | Đang quản lý tập trung qua TK `1111`. Số dư cuối kỳ thực tế: **+1.216.899.634 đ** (Dương 1.216 tỷ VNĐ). | **Chưa tách riêng 2 chi nhánh**: Tiền mặt đang để chung 1 tài khoản `1111`, chưa chia thành `11111` (Két Lê Văn Thọ) và `11112` (Két Phạm Văn Chiêu). Thủ quỹ từng cơ sở không thể kiểm kê độc lập hàng ngày. | Tách TK con `11111` (LVT) và `11112` (PVC). Thêm chức năng Biên bản kiểm kê quỹ cuối ngày cho thủ quỹ. |
| **2** | **Sổ Tiền Gửi Ngân Hàng (TK 112)** | Quản lý 4 tài khoản ngân hàng (VCB 1763, TCB 468, VCB 7336, VCB 3065). Tổng số dư: **+195.685.933 đ**. Cân đối Nợ/Có khớp 100%. | Đạt chuẩn kế toán kép. Tuy nhiên chưa có API đối chiếu tự động với sao kê điện tử ngân hàng (Bank Reconciliation). | Bổ sung module đối chiếu tự động file sao kê Excel/CSV của Vietcombank và Techcombank. |
| **3** | **Sổ Nhật Ký Chung & Chứng Từ (Vouchers & Journal)** | Quản lý **13.789 chứng từ** và **44.036 bút toán kép**. Ràng buộc check `debit >= 0`, `credit >= 0`, không cho phép 1 dòng vừa có Nợ vừa có Có. | Kiến trúc cực kỳ vững chắc, tuân thủ chế độ kế toán doanh nghiệp Việt Nam. Có cột `contra_account_code` để tra cứu tài khoản đối ứng. | Duy trì kiến trúc hiện tại. Bổ sung tính năng đánh số chứng từ tự động theo tháng. |
| **4** | **Bảng Cân Đối & Báo Cáo Tài Chính (Trial Balance & B01)** | Các kỳ từ `2026-01` đến `2026-08` có tổng Nợ bằng tổng Có **tuyệt đối 100%** (Tổng phát sinh: 99.83 tỷ VNĐ, chênh lệch diff = 0.00 đ). Báo cáo B01-DN dựng động từ sổ cái. | Rất chuẩn xác về mặt toán học và định khoản kế toán. Tuy nhiên chưa có báo cáo Lưu chuyển tiền tệ gián tiếp. | Hoàn thiện Báo cáo Lưu chuyển tiền tệ (Cashflow) theo phương pháp gián tiếp từ lợi nhuận trước thuế. |
| **5** | **Xử lý Chứng Từ Lệch (Unbalanced Vouchers)** | View `finance.v_unbalanced` đang báo **10 chứng từ** (thực chất là 5 cặp chứng từ cân bằng chéo giữa Nhập kho NK và Phiếu chi PC). | Các cặp này có tổng chênh lệch bằng 0 (+260k/-260k; +450k/-450k; +280k/-280k; +198k/-198k; +1.355tr/-1.355tr), nhưng chưa được set `balance_group` nên view vẫn báo lỗi đỏ. | Chạy script gán `balance_group` cho 5 cặp này để làm sạch hoàn toàn danh sách cảnh báo. |
| **6** | **Kỳ Kế Toán (Periods)** | Hệ thống hiện có 8 kỳ: từ `2026-01` đến `2026-08`. Tất cả 8 kỳ đều đang để trạng thái `open`. **Chưa có kỳ Tháng 09 và Tháng 10/2026**. | **Lỗ hổng vận hành lớn**: Dữ liệu tháng 9 và tháng 10 chưa có kỳ để ghi sổ. Việc các kỳ cũ để `open` có nguy cơ bị ghi đè hoặc chỉnh sửa nhầm số liệu quá khứ. | Tạo ngay kỳ `2026-09` và `2026-10`. Thực hiện thủ tục chốt sổ và chuyển trạng thái các kỳ từ `2026-01` đến `2026-07` sang `closed` hoặc `locked`. |
| **7** | **Nhập Liệu Theo Lô (Excel Import & Rollback)** | Thiết kế 3 lớp: Bảng đệm `import_batches` $\rightarrow$ Kiểm tra & Đối chiếu `import_rows` $\rightarrow$ Duyệt ghi sổ. Có nút **Hoàn tác (Rollback)** trọn vẹn cả lô. | Rất an toàn, ngăn chặn việc file Excel hỏng làm rác sổ cái. Giữ lại mã SHA-256 chống tải trùng file. | Giữ nguyên, mở rộng thêm mẫu template nhập nhanh phiếu thu viện phí. |
| **8** | **Cầu Nối Vận Hành (Ops Bridge `finance_src`)** | Đã có view đọc hoa hồng PG/Marketing và bảng công vận hành. | **Chưa có luồng tự động kết chuyển lương & doanh thu**: Kế toán hiện tại vẫn phải xuất bảng lương và doanh thu thủ công rồi nhập tay vào két. | Xây dựng pipeline tự động sinh bút toán dự thảo (Draft Voucher) cho chi phí lương và doanh thu theo ngày/tháng. |
| **9** | **Phân Quyền & Người Dùng Két (Users & RBAC)** | Hệ thống chỉ có duy nhất **1 tài khoản (`KeToan`)** với vai trò `vault_admin`. | **Vi phạm nguyên tắc Tam quyền phân lập trong tài chính**: 1 người vừa quản trị user, vừa khóa kỳ, vừa ghi sổ thu chi, không có người kiểm soát độc lập. | Tạo tối thiểu 3 tài khoản: 1 Admin két (`vault_admin`), 1 Kế toán viên ghi sổ (`accountant`), 1 Giám đốc/BOD chỉ xem (`viewer`). |
| **10** | **Bảo Mật Truy Cập & Hạ Tầng Mạng** | Reverse proxy Caddy với CSP nghiêm ngặt, chống brute-force (khóa tài khoản sau 5 lần sai mật khẩu), trigger cấm sửa log. Đạt 993 lượt audit log sạch. | Bảo mật tầng mạng và application rất tốt. Không để lộ cổng 4100 ra Internet (chỉ chạy nội bộ trong Docker network). | Cần bổ sung xác thực 2 bước (TOTP 2FA) cho tài khoản Két sắt để đạt chuẩn ngân hàng. |

---

## III. SỐ LIỆU KIỂM TOÁN THỰC TẾ TRÊN DATABASE PRODUCTION

*(Trích xuất trực tiếp từ máy chủ VPS ngày 02/10/2026)*

### 1. Thống kê quy mô sổ sách
- **Tổng số chứng từ đã ghi sổ**: `13.789` chứng từ.
- **Tổng số bút toán kép (Journal Lines)**: `44.036` dòng.
- **Tổng số tài khoản trong danh mục**: `256` tài khoản (hệ thống tài khoản chuẩn TT 200/133).
- **Tổng số đối tượng công nợ (Khách hàng, NCC, NV)**: `6.666` đối tác.
- **Khoản mục chi phí active**: `55` khoản mục.
- **Tổng phát sinh Nợ / Có 8 tháng đầu năm**: **99.837.288.583 đ** (~99.84 tỷ VNĐ). Cân đối `Nợ = Có` 100%.

### 2. Số dư tiền mặt & tiền gửi ngân hàng (Tại thời điểm kiểm toán)

| Tài khoản | Tên tài khoản | Số dư đầu kỳ (01/2026) | Phát sinh Thu (Nợ) | Phát sinh Chi (Có) | Số dư thực tế cuối kỳ |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **`1111`** | **Tiền mặt (VND)** | 1.798.590.807 đ | 5.973.835.996 đ | 6.555.527.169 đ | **+1.216.899.634 đ** |
| **`11211`** | Vietcombank (STK 1034781763) | 69.384.321 đ | 11.236.255.548 đ | 11.267.660.543 đ | **+37.979.326 đ** |
| **`11213`** | Techcombank (STK 468468) | 23.507.967 đ | 494 đ | 23.507.967 đ | **+494 đ** |
| **`11214`** | Vietcombank (STK 1061227336) | 7.821.318 đ | 5.057.145.433 đ | 5.053.001.291 đ | **+11.965.460 đ** |
| **`11215`** | Vietcombank (STK 1063003065) | 5.000.000 đ | 1.822.654.114 đ | 1.681.913.101 đ | **+145.741.013 đ** |
| **TỔNG CỘNG** | **Toàn bộ tiền trong két & ngân hàng** | **1.904.304.413 đ** | **24.089.891.585 đ** | **24.581.610.071 đ** | **+1.412.585.927 đ** |

> 📌 **Kết luận quỹ tiền:** Tổng tài sản thanh khoản cao (tiền mặt tại phòng khám + tiền gửi ngân hàng) của Nha Khoa 5S trên sổ sách là **1.412.585.927 đ** (Khoảng 1.41 tỷ VNĐ). Không bị âm quỹ.

---

## IV. 6 VẤN ĐỀ TỒN ĐỌNG & HÀNH ĐỘNG CẦN TRIỂN KHAI NGAY

### 1. Mở kỳ kế toán Tháng 09 và Tháng 10/2026
- **Hiện tượng**: Bảng `finance.periods` mới chỉ có đến `2026-08`. Kế toán không thể ghi sổ các chứng từ phát sinh trong tháng 9 và tháng 10.
- **Hành động**: Chạy lệnh tạo kỳ `2026-09` (`2026-09-01` đến `2026-09-30`) và `2026-10` (`2026-10-01` đến `2026-10-31`).

### 2. Chuẩn hóa 5 cặp chứng từ lệch (`balance_group`)
- **Hiện tượng**: 10 chứng từ trong `finance.v_unbalanced` thực chất là các cặp nhập kho và phiếu chi cân bằng chéo (+260k vs -260k; +450k vs -450k; +280k vs -280k; +198k vs -198k; +1.355tr vs -1.355tr).
- **Hành động**: Cập nhật giá trị `balance_group` cho 5 cặp này:
  ```sql
  UPDATE finance.vouchers SET balance_group = 'pair_20260109_260k' WHERE voucher_no IN ('NK597/244', 'PC023/2026_01');
  UPDATE finance.vouchers SET balance_group = 'pair_20260123_450k' WHERE voucher_no IN ('NK567/244', 'PC055/2026_01');
  UPDATE finance.vouchers SET balance_group = 'pair_20260420_280k' WHERE voucher_no IN ('NK00086', 'PC045/2026_04');
  UPDATE finance.vouchers SET balance_group = 'pair_20260607_198k' WHERE voucher_no IN ('NK931/244', 'PC020/2026_06');
  UPDATE finance.vouchers SET balance_group = 'pair_20260622_1355k' WHERE voucher_no IN ('NK877/244', 'PC043/2026_06');
  ```

### 3. Tách tài khoản tiền mặt chi tiết theo 2 Chi nhánh (LVT & PVC)
- **Hiện tượng**: TK `1111` đang chứa chung toàn bộ tiền mặt của cả cơ sở Lê Văn Thọ và cơ sở Phạm Văn Chiêu.
- **Hành động**: Tạo 2 tài khoản con:
  - `11111`: Tiền mặt tại két Cơ sở Lê Văn Thọ (LVT)
  - `11112`: Tiền mặt tại két Cơ sở Phạm Văn Chiêu (PVC)
  Thực hiện bút toán phân bổ số dư 1.216 tỷ VNĐ về đúng két thực tế tại từng chi nhánh dựa trên biên bản kiểm kê hiện vật.

### 4. Tự động hóa kết chuyển Bảng Lương & Viện phí sang Két tiền
- **Hiện tượng**: Bảng công (`attendance_work_days`) và Bảng lương (`payroll`) đã chuẩn hóa trên PWA nhưng việc ghi nhận chi phí lương vào Sổ cái Két tiền (Nợ TK 642 / Có TK 334, Nợ TK 334 / Có TK 1111, 1121) vẫn làm thủ công bằng Excel.
- **Hành động**: Tận dụng schema `finance_src` để tạo một API Endpoint trong Két sắt: Cho phép kế toán bấm **"Duyệt & Kết Chuyển Lương Tháng X"** $\rightarrow$ Hệ thống tự động tạo Chứng từ Dự thảo (Draft Voucher) trong Két tiền để kế toán duyệt chỉ bằng 1 cú click.

### 5. Thiết lập Phân quyền Tam quyền phân lập (RBAC)
- **Hiện tượng**: Hiện chỉ có 1 user `KeToan` duy nhất.
- **Hành động**: Tạo thêm các tài khoản theo đúng ma trận phân quyền:
  1. `admin_ketoan` (`vault_admin`): Trưởng phòng tài chính (Quản trị user, mở/khóa kỳ).
  2. `thuquy_lvt` (`accountant`): Thủ quỹ Lê Văn Thọ (Chỉ lập phiếu thu, phiếu chi tiền mặt tại LVT).
  3. `thuquy_pvc` (`accountant`): Thủ quỹ Phạm Văn Chiêu (Chỉ lập phiếu thu, phiếu chi tiền mặt tại PVC).
  4. `giamdoc_5s` (`viewer`): Ban Điều Hành (Xem báo cáo PnL, dòng tiền, bảng cân đối; không xem chi tiết lương từng nhân sự).

### 6. Khóa kỳ các tháng đã quyết toán (`2026-01` $\rightarrow$ `2026-06`)
- **Hiện tượng**: Các kỳ từ tháng 1 đến tháng 6 đã quyết toán thuế và chốt sổ nhưng vẫn mở `open`.
- **Hành động**: Gọi API `/api/ky/:code/trang-thai` chuyển trạng thái sang `locked` để kích hoạt trigger bảo vệ bất biến.

---

## V. CÂU HỎI MỞ TRAO ĐỔI CÙNG CODEX / ĐỘI NGŨ KỸ THUẬT

1. **Về luồng Đồng bộ Thu Viện Phí (Revenue Ingestion)**:
   - *Hiện tại phiếu thu viện phí ở phần mềm tiếp nhận bệnh nhân có nên sinh ngay bản ghi `staged` trong `finance.import_batches` qua event bus (Redis Pub/Sub hoặc Webhook nội bộ) không? Hay vẫn duy trì chốt theo ca cuối ngày của Lễ tân?*
2. **Về xử lý Chi nhánh trong Sổ cái Kép (Branch Accounting)**:
   - *Nha Khoa 5S đang áp dụng hạch toán báo sổ hay hạch toán độc lập giữa 2 chi nhánh LVT và PVC? Nếu hạch toán báo sổ, có cần dùng cặp tài khoản `136` (Phải thu nội bộ) và `336` (Phải trả nội bộ) khi điều chuyển tiền mặt giữa 2 két không?*
3. **Về Cơ chế Báo Cáo Thuế vs Sổ Sách Quản Trị**:
   - *Trường `is_deductible` trong `finance.journal_lines` đã phân loại chi phí hợp lý / không hợp lý. Cần bổ sung thêm báo cáo tự động nào để phục vụ mùa quyết toán thuế TNDN cuối năm?*
4. **Về Khả năng Mở Rộng Multi-factor Authentication (2FA)**:
   - *Với tính chất nhạy cảm của Két sắt, có nên triển khai WebAuthn (Passkeys) hoặc RFC 6238 TOTP (Google Authenticator) trực tiếp vào `apps/finance/src/auth.js` không?*

---
*Báo cáo được lập tự động dựa trên mã nguồn thực tế và dữ liệu live trên máy chủ Production Nha Khoa 5S.*
