# Cài đặt chi nhánh Lê Văn Thọ

Ứng dụng này dùng một Supabase database riêng cho chi nhánh:

- Địa chỉ: **60 Lê Văn Thọ, Phường Thông Tây Hội, TP.HCM**
- Pin chấm công: `10.8381574, 106.6579553`
- Bán kính: `100 m`
- Sai số GPS tối đa: `50 m`
- Giờ check-in: `08:00`, múi giờ `Asia/Ho_Chi_Minh`

## 1. Khởi tạo database

1. Mở Supabase Dashboard của database dành riêng cho chi nhánh.
2. Vào **SQL Editor**.
3. Mở file `supabase-schema.sql`, dán toàn bộ nội dung và bấm **Run**.

Schema tạo dữ liệu nhân viên, bảng chấm công, RLS, hàm check-in phía server, thông báo Realtime và bucket file. Hàm server tự tính lại khoảng cách; frontend không được tự quyết định một vị trí có hợp lệ hay không.

## 2. Cấu hình Auth

Trong **Authentication → URL Configuration**:

- Site URL: URL HTTPS đang triển khai.
- Redirect URLs: thêm URL HTTPS và `http://localhost:3000` để chạy thử.

Trong **Authentication → Providers**, bật Email. Có thể tắt đăng ký công khai vì tài khoản nhân viên được tạo bằng công cụ quản trị bên dưới.

## 3. Tạo 13 tài khoản nhân viên

Trong Supabase vào **Project Settings → API Keys → Secret keys**, tạo/copy một `secret key` và thêm tạm vào file `.env` cục bộ:

```env
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxx
```

Nếu project cũ chưa có `secret key`, có thể dùng key `service_role` trong tab **Legacy API Keys** với tên `SUPABASE_SERVICE_ROLE_KEY`.

Sau đó chạy:

```powershell
npm run provision:pvc
```

Công cụ sẽ:

- tạo hoặc cập nhật 13 Auth user;
- dùng email làm tên đăng nhập;
- dùng số điện thoại viết liền làm mật khẩu;
- liên kết Auth user với `employees` và `profiles`;
- gán role `staff` và ca `08:00`.

Công cụ không in mật khẩu ra terminal và có thể chạy lại. Sau khi hoàn tất, nên xóa `SUPABASE_SECRET_KEY` khỏi máy triển khai. Key này không được có tiền tố `VITE_` và không được đưa lên Git/Vercel frontend.

## 4. Điều kiện để GPS và ngoại tuyến hoạt động

- Website thật phải chạy qua HTTPS; trình duyệt không cấp GPS cho HTTP thông thường.
- Nhân viên cần cho phép quyền Vị trí và bật chế độ vị trí chính xác trên điện thoại.
- Người dùng phải đăng nhập online ít nhất một lần. Sau đó service worker mới có thể mở lại giao diện khi mất mạng.
- Lượt chấm công ngoại tuyến giữ nguyên thời gian và GPS lúc xác nhận, rồi tự đồng bộ khi có Internet.
- Database chỉ nhận một check-in cho mỗi nhân viên trong một ngày; gửi lại hoặc bấm trùng không tạo bản ghi thứ hai.

## 5. Kiểm tra tại phòng khám

Đứng tại khu vực làm việc ở 60 Lê Văn Thọ, mở ứng dụng bằng điện thoại thật và xác nhận:

1. GPS có sai số không quá 50 m.
2. Khoảng cách đến pin phòng khám không quá 100 m.
3. Tắt mạng, check-in, sau đó bật mạng và kiểm tra trạng thái chuyển từ “Chờ đồng bộ” sang “Đã ghi nhận”.

Trình duyệt web có thể phát hiện độ chính xác, khoảng cách và vị trí giả ở mức cơ bản nhưng không thể đảm bảo tuyệt đối chống ứng dụng giả lập GPS trên thiết bị đã can thiệp hệ thống.
