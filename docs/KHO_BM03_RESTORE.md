# Chuẩn hóa đề xuất mua hàng theo biểu mẫu 5S_QĐ_KT_01/BM03

## Bản chất biểu mẫu BM03

- BM03 (`5S_QĐ_KT_01/BM03`) là **biểu mẫu hành chính chuẩn** của công ty dùng khi lập và xuất file Phiếu đề nghị mua hàng.
- Biểu mẫu quy định:
  1. Thông tin tiêu đề, số hiệu, ngày hiệu lực, lần ban hành/soát xét.
  2. Các trường hành chính: Đơn vị lập, bộ phận, đơn vị hạch toán, kho hàng, thủ kho, người tạo, ngày tạo, ngày duyệt.
  3. Cấu trúc bảng hàng hóa: STT, Mô tả, Thông số kỹ thuật, ĐVT, Tồn kho, Số lượng đề xuất, Đơn giá đề xuất (có VAT), Thành tiền (có VAT), Thời gian cần hàng, Mục đích sử dụng, Nhà cung cấp.
  4. Khối chữ ký 4 bên: Trưởng bộ phận, Kế toán trưởng, Bộ phận quản lý kho, Phê duyệt BGĐ.
- BM03 **không phải** là một danh mục 51 mặt hàng cố định. Dữ liệu làm việc được xây dựng động theo nhu cầu thực tế:
  - Nạp nhanh từ **Gợi ý hàng thiếu** (dựa trên tồn kho thực tế dưới định mức của chi nhánh).
  - Tìm kiếm và thêm vật tư từ danh mục kho của phòng khám.
  - Thêm dòng mặt hàng mới tùy ý (cho phép gõ tên, thông số, ĐVT, số lượng, đơn giá).

## Quy trình làm việc trên giao diện

- Nút **Phiếu mới**: Tạo một phiếu đề xuất mua hàng trống theo đúng mẫu BM03.
- Nút **Thêm mặt hàng**: Thêm trực tiếp dòng mặt hàng mới vào phiếu đang mở.
- Nút **Gợi ý hàng thiếu**: Mở danh sách các mặt hàng tồn dưới định mức để tick chọn đưa vào phiếu.
- Nút **File mẫu BM03**: Tải file biểu mẫu Excel BM03 gốc (`mau_de_xuat_mua_hang_bm03.xlsx`) về máy.
- Nút **Xuất Excel BM03**: Xuất dữ liệu phiếu đang làm việc ra tệp Excel đúng 100% chuẩn mẫu BM03.
- Nút **Tạo đơn PO**: Tách các dòng trong phiếu thành các đơn đặt hàng theo từng Nhà cung cấp.
- Nút **Lưu phiếu**: Lưu trữ phiếu vào hệ thống.

## Chốt kiểm tự động

`node scripts/kiem-kho-bm03.mjs` kiểm tra:

1. Mẫu Excel nhúng hợp lệ và đồng nhất với tệp dự phòng trong `public/templates/`.
2. Khởi tạo phiếu mới đúng chuẩn mã hiệu `5S_QĐ_KT_01/BM03`.
3. Hàm gợi ý hàng thiếu hoạt động và trả về dữ liệu.
4. Luồng tạo đơn PO tách đúng theo từng nhà cung cấp.
5. Giao diện có đủ các nút chức năng: `btnMoGoiYHangThieu`, `btnThemDongMoi`, `btnXuatExcelBM03`, `btnTaoDonTuPhieu`, `btnLuuPhieuDeXuat`.
6. Lớp CSS `.bm03-workspace` và `.bm03-paper` tồn tại.

Chốt này chạy trong GitHub Actions trên mọi lần đẩy mã và pull request.

## Trạng thái lưu dữ liệu

Phiếu đề xuất hiện được lưu trên trình duyệt bằng `localStorage`, đúng với phiên bản tính năng được khôi phục. Dữ liệu Kho mẫu và đơn đặt hàng trong service vẫn là dữ liệu phía giao diện. Khi nâng cấp sử dụng chính thức cho nhiều máy/người dùng, cần chuyển phiếu BM03 và đơn đặt hàng sang API/PostgreSQL trước khi coi đây là sổ dữ liệu tập trung.
