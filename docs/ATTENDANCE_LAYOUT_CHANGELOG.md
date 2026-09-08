# Nhật ký chỉnh sửa giao diện Chấm công

## Mục tiêu

Giữ màn **Chấm công / Bảng công** ổn định khi nhiều công cụ hoặc nhiều nhánh cùng sửa giao diện. Bố cục quản trị phải gọn, phân biệt được nhân sự, chức danh, phòng ban, chi nhánh, các ca được phép và thao tác điều chỉnh; số liệu công không được rút gọn thành dấu ba chấm.

## Đối chiếu với Antigravity

- Commit được báo trước: `105cb21` (`fix(kho-hang): remove redundant plus sign next to add icons`).
- Phạm vi thực tế của commit này chỉ là `src/views/kho-hang.js`: bỏ ký tự `+` bị lặp bên cạnh icon thêm mới.
- Commit `105cb21` **không sửa** `app.css`, `src/views/attendance.js`, dữ liệu chấm công hoặc database.
- Nhánh `main` mới còn có `0401eb9`, là commit đồng bộ VPS đã thêm nhiều CSS và xử lý chấm công vào `app.css`/`src/views/attendance.js`; đây mới là nguồn giao nhau phải giữ khi gộp nhánh.
- Các commit `bf41952`, `b7653cd`, `813f39e`, `5075669`, `ebc454f` sau đó tập trung vào Kho, deploy và fallback backend; không được nhập nguyên nhánh vào phần chấm công nếu chưa rà lại yêu cầu loại bỏ Supabase.
- `ebc454f` thêm biểu mẫu cố định `public/templates/mau_de_xuat_mua_hang_bm03.xlsx`. CI chỉ miễn đúng file mẫu này khỏi luật cấm file Excel; các file Excel khác vẫn bị chặn.
- Lỗi ghi đè layout Chấm công đến từ chính việc có nhiều khối CSS cùng điều khiển một selector trong `app.css`: khối `Workspace quản lý công`, style chung của `attendance-work-summary-line`, và khối `ADMIN ATTENDANCE WORKSPACE V2`.

## Thay đổi đã thực hiện

### 1. Một nguồn CSS chính thức cho Chấm công

- Tạo `public/attendance-layout.css` và nạp **sau** `app.css` trong `index.html`.
- Mọi chỉnh sửa layout Chấm công tiếp theo phải đặt tại file này.
- Không tạo thêm các khối `Attendance V2`, `V3`, `fix cuối file` trong `app.css`.
- Khối `Workspace quản lý công` cũ đã được xóa; khối `ADMIN ATTENDANCE WORKSPACE V2` được vô hiệu hóa để giữ lịch sử đối chiếu nhưng không còn tham gia cascade.
- `public/mobile-preview.css` vẫn chỉ là canary cho tài khoản bác sĩ thử nghiệm `BS01`; file đó được nạp sau cùng và không ảnh hưởng tài khoản khác.

### 2. Bố cục quản trị

- Header quản trị được thu gọn thành một hàng có tiêu đề và nhóm thao tác rõ ràng.
- Bộ lọc được chia đúng bốn vùng: nhân sự, tháng công, chi nhánh, trạng thái đối chiếu.
- Hồ sơ nhân sự đang chọn là một dải thông tin riêng, thể hiện mã nhân viên, chức danh, phòng ban, chi nhánh, ca được phép và hai thao tác `Bổ sung công` / `Xếp - đổi ca`.
- Bảng ngày công và Nhật ký GPS là hai tab riêng; popover chọn nhân sự có lớp nổi và vùng cuộn độc lập nên không bị bảng bên dưới che.
- Dải tổng hợp dùng năm ô liền nhau thay vì năm box dashboard lớn.

### 3. Số liệu không bị cắt

- Giá trị `Ngày công`, `Công thường`, `Tăng ca đã duyệt`, `Tổng tính công`, `Cần đối chiếu` dùng `overflow: visible`, `text-overflow: clip` và cho phép xuống dòng.
- Ví dụ đã kiểm tra trên production: `4`, `35 giờ`, `0 phút`, `35 giờ`, `0 ngày`; không còn `3…` hoặc `0…`.

### 4. Responsive

- Desktop: 5 chỉ số trên một dải, toolbar 4 vùng.
- Tablet: toolbar 2 cột, dải chỉ số 3 cột.
- Mobile: toolbar 1 cột; hồ sơ, nút thao tác và ca làm tự xếp lại; dưới 430 px dải chỉ số thành 1 cột.

## Các commit liên quan

- `105cb21`: Antigravity, chỉ sửa dấu cộng ở Kho vật tư.
- `f2b7324`: giới hạn giao diện mobile thử nghiệm cho `BS01`.
- `9853453`: sửa số tổng công bị hiển thị dấu ba chấm.
- `9b9239c`: hoàn thiện kiểm tra migration trên database rỗng.
- Commit chứa tài liệu này và `attendance-layout.css`: xem commit mới nhất sau khi hoàn tất kiểm thử.

## Kiểm tra bắt buộc trước khi gộp hoặc deploy

1. Chạy `npm run build`.
2. Chạy `node scripts/kiem-layout-cham-cong.mjs`; CI cũng bắt buộc chạy kiểm tra này.
3. Xác nhận `dist/attendance-layout.css` và `dist/mobile-preview.css` tồn tại.
4. Với tài khoản thường/Admin khác `BS01`, `#mobileUiCanaryStyles` phải không tồn tại.
5. Với `BS01`, `body[data-mobile-ui="v2-canary"]` và `#mobileUiCanaryStyles` phải tồn tại.
6. Kiểm tra năm số tổng hợp hiển thị toàn bộ nội dung ở desktop và mobile.
7. Kiểm tra popover nhân sự không bị cắt; thông tin chi nhánh, chức danh và ca được phép vẫn hiện.
8. Chỉ deploy khi workflow `Kiểm tra` của đúng commit đã xanh; deploy phải đi qua workflow `Triển khai`.

## Quy tắc tránh xung đột

- Không sửa layout Chấm công đồng thời trong `app.css` và `attendance-layout.css`.
- Không đổi tên class trong `src/views/attendance.js` nếu chưa cập nhật file CSS chuyên biệt và checklist trên.
- Không dùng selector chung như `.panel b`, `.section-title span` để sửa riêng màn Chấm công.
- Không đặt `overflow: hidden` hoặc `text-overflow: ellipsis` lên số liệu giờ/ngày công.
- Khi nhận commit từ công cụ khác, luôn chạy `git show --stat <commit>` và `git diff <commit>..HEAD -- app.css src/views/attendance.js public/attendance-layout.css` trước khi gộp.
- Không sửa lại migration đã áp trên production; mọi thay đổi dữ liệu phải là migration mới có số thứ tự mới.

## Trạng thái production trước thay đổi này

- Bản canary `9b9239c` đã triển khai thành công bằng GitHub Actions.
- Mã lần deploy: `20260908-065435`.
- Sao lưu database: `/opt/backups/pg-20260908-065435.sql.gz`.
- Health check: `/healthz` 200, PWA 200, API 401 đúng kỳ vọng, Két kế toán 200.
- Số lượng các bảng được pipeline đối chiếu không thay đổi trước/sau deploy.

## Sửa logo 5S sau khi đối chiếu production

- `public/images/app-icon-192.png` và `apps/finance/public/logo-5s.png` có cùng SHA-256; source đã chứa đúng logo ngôi sao 5S.
- Production vẫn hiện ảnh phòng khám vì whitelist deploy chỉ có `public/*`, không lấy file trong `public/images/`.
- Bổ sung `public/**/*|web`, thêm phiên bản cache vào URL logo của sidebar/màn đăng nhập và thêm `scripts/kiem-thuong-hieu.mjs` vào CI.
