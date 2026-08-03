# Ghi chú quản lý - 5S Clinic Hub

## Phạm vi bản mini

- Hệ thống mini Lark cho phòng khám nha khoa gồm MKT, Nhân sự, Kế toán, DVKH, Bác sĩ, Phụ tá, Bảo vệ, Lao công.
- Các phân hệ đã dựng: tổng quan vận hành, chấm công GPS, giao task đội nhóm, xin nghỉ/đổi ca, quản lý nhân sự, tin nhắn theo kênh, báo cáo và cấu hình vị trí.
- Dữ liệu demo hiện lưu bằng `localStorage` trên trình duyệt để deploy Vercel nhanh. Khi dùng thật nhiều người cùng lúc cần gắn backend như Supabase/Firebase/Postgres, đăng nhập phân quyền, log audit và thông báo realtime.

## Quy tắc giờ làm đã lấy từ tài liệu

- Chi nhánh: Nha Khoa 5S - Lê Văn Thọ.
- Lễ tân, Phụ tá: ca hành chính 7h30-17h00; ca full 7h30-20h00; ca chiều 9h30-20h00; ca sáng 7h30-18h00; nghỉ trưa 1 tiếng với nhóm liên quan.
- Bác sĩ: ca hành chính 8h00-17h00; ca sáng 8h00-18h00; ca chiều 10h00-20h00; ca full 8h00-20h00, nghỉ 60 phút.
- Bảo vệ: ngày thường 7h00-20h00; Chủ nhật 7h00-17h00.
- Tạp vụ/Lao công: ngày thường 6h00-16h00, nghỉ trưa 11h-12h; Chủ nhật 6h00-15h00.
- Tất cả nhóm cần check-in trước giờ làm ít nhất 5 phút.

## Ghi chú vận hành

- Chấm công GPS mặc định dùng bán kính 180m quanh phòng khám, có thể chỉnh trong màn Báo cáo.
- Nếu định vị nằm ngoài bán kính hoặc check-in sau mốc trước ca 5 phút, bản ghi được đánh dấu để quản lý xác minh.
- Task cần có phòng ban, owner, deadline, ưu tiên và tiến độ.
- Đơn nghỉ phép/đổi ca cần HR hoặc quản lý duyệt trước khi tính công.
- Kênh chat tách theo toàn phòng khám, vận hành, MKT, NS, KT, DVKH, BS & Phụ tá, Bảo vệ & Lao công.
