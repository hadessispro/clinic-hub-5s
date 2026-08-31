/* Kho vật tư · lớp dữ liệu.
 *
 * Giai đoạn này là DỰNG GIAO DIỆN. Dữ liệu nằm trong bộ nhớ để màn hình chạy
 * và bấm được thật trước khi có API. Mọi hàm ở đây có đúng hình dạng mà bản
 * nối API sẽ có — trả Promise, ném Error khi sai — nên lúc nối chỉ thay ruột
 * từng hàm, không phải sửa màn hình.
 *
 * NĂM BẢNG, MỖI KHÁI NIỆM MỘT CHỦ. Đây là chỗ dễ làm hỏng nhất của một phần
 * mềm kho, nên tách rạch ròi ngay từ đầu:
 *
 *   VAT_TU        thứ mua về là gì — tên, đơn vị dùng, ngưỡng tồn tối thiểu
 *   NHA_CUNG_CAP  mua của ai — công tác thời gian giao, điều khoản thanh toán
 *   BANG_GIA      ai bán thứ gì với giá nào — MỘT vật tư có NHIỀU dòng giá
 *   TON_KHO       mỗi chi nhánh đang còn bao nhiêu
 *   DON_HANG      đã đặt gì, về được bao nhiêu, còn thiếu bao nhiêu
 *
 * "Còn thiếu" KHÔNG phải một cột người ta gõ vào. Nó bằng số đặt trừ số đã
 * nhận, tính mỗi lần đọc. Cho phép gõ tay thì chỉ cần một lần quên cập nhật
 * là kho ảo và kho thật lệch nhau, mà không ai biết cái nào đúng.
 */

import { BRANCHES } from '../branch.js';

/* ── Danh mục ────────────────────────────────────────────────────────── */

export const CHI_NHANH = Object.values(BRANCHES).map((b) => ({ ma: b.id, ten: b.shortName }));

export const NHOM_VAT_TU = {
  tieu_hao:   'Tiêu hao hằng ngày',
  vo_trung:   'Vô trùng & bảo hộ',
  thuoc:      'Thuốc & hoá chất',
  noi_nha:    'Nội nha',
  phuc_hinh:  'Phục hình & vật liệu',
  implant:    'Implant & phẫu thuật',
  chinh_nha:  'Chỉnh nha',
  thiet_bi:   'Dụng cụ & thiết bị',
};

/* Cờ đặc biệt — thứ khiến một vật tư KHÔNG được đặt hàng như mọi thứ khác.
 *
 * Mỗi cờ gắn với một hậu quả thật nếu bỏ qua, nên chúng hiện nổi ngay trên
 * thẻ vật tư chứ không nằm trong phần ghi chú ai đó phải nhớ mở ra đọc. */
export const CO_DAC_BIET = {
  han_dung: {
    ten: 'Có hạn dùng', icon: 'ri-calendar-close-line', lop: 'warn',
    canh: 'Đặt dư là hết hạn phải bỏ. Đặt theo nhu cầu thực, không gom lô lớn cho rẻ.',
  },
  lanh: {
    ten: 'Bảo quản lạnh', icon: 'ri-temp-cold-line', lop: 'info',
    canh: 'Cần tủ mát 2–8°C từ lúc nhận. Không nhận hàng nếu thùng đã ấm.',
  },
  kiem_soat: {
    ten: 'Quản lý đặc biệt', icon: 'ri-shield-keyhole-line', lop: 'bad',
    canh: 'Thuốc phải vào sổ theo dõi riêng, đối chiếu số lô mỗi lần xuất dùng.',
  },
  dat_rieng: {
    ten: 'Đặt riêng theo ca', icon: 'ri-time-line', lop: 'warn',
    canh: 'Không giữ tồn sẵn. Đặt khi đã chốt ca, và phải tính đủ thời gian giao.',
  },
  gia_tri_cao: {
    ten: 'Giá trị cao', icon: 'ri-price-tag-3-line', lop: 'bad',
    canh: 'Kiểm đếm hai người khi nhận. Ghi số lô và số sê-ri vào hồ sơ ca.',
  },
};

export const TRANG_THAI_DON = {
  nhap:       { ten: 'Nháp',            lop: 'neutral' },
  cho_duyet:  { ten: 'Chờ duyệt',       lop: 'warn' },
  da_dat:     { ten: 'Đã đặt',          lop: 'info' },
  giao_mot_phan: { ten: 'Giao một phần', lop: 'warn' },
  da_giao:    { ten: 'Đã giao đủ',      lop: 'good' },
  huy:        { ten: 'Đã huỷ',          lop: 'bad' },
};

/* Nơi nhận của phiếu xuất kho. Vật tư ra khỏi kho phải đi tới một chỗ CÓ TÊN
 * — "xuất dùng" chung chung là chỗ hàng bốc hơi mà không ai chịu trách nhiệm. */
export const NOI_NHAN = {
  phong_1:    'Phòng khám 1',
  phong_2:    'Phòng khám 2',
  phong_3:    'Phòng khám 3',
  phong_pt:   'Phòng phẫu thuật',
  vo_trung:   'Khu vô trùng',
  le_tan:     'Quầy lễ tân',
  chi_nhanh:  'Điều chuyển chi nhánh khác',
  huy_hong:   'Xuất huỷ · hỏng, hết hạn',
};

export const TRANG_THAI_PHIEU = {
  nhap:    { ten: 'Nháp',        lop: 'neutral' },
  da_xuat: { ten: 'Đã xuất kho', lop: 'good' },
  huy:     { ten: 'Đã huỷ',      lop: 'bad' },
};

/* Mức tồn kho — tính từ số lượng so với ngưỡng tối thiểu, không gõ tay. */
export const MUC_TON = {
  het:     { ten: 'Hết hàng',     lop: 'bad' },
  thieu:   { ten: 'Dưới định mức', lop: 'warn' },
  sap_het: { ten: 'Sắp chạm mức',  lop: 'warn' },
  du:      { ten: 'Đủ dùng',      lop: 'good' },
};

/* ── Dữ liệu dựng màn ─────────────────────────────────────────────────── */

const ngayLech = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const NGUOI_KHO = {
  'PVC003':    { ten: 'Nguyễn Thị Như Huỳnh', chuc: 'Trưởng bộ phận Phụ tá', chi_nhanh: 'le-van-tho' },
  'PVC-10199': { ten: 'Võ Đoàn Thái Tuấn',    chuc: 'Phụ tá',                chi_nhanh: 'pham-van-chieu' },
};
export const tenNguoi = (ma) => NGUOI_KHO[ma]?.ten || ma || '—';

let NHA_CUNG_CAP = [
  { id: 'NCC-01', ten: 'Công ty TNHH Nha khoa Việt Tiên', nguoi: 'Chị Lan', dien_thoai: '0903 118 224',
    ngay_giao: 2, thanh_toan: 'Công nợ 30 ngày', danh_gia: 4.5,
    ghi_chu: 'Giao nhanh, hàng tiêu hao ổn định. Hay thiếu hàng cuối tháng.' },
  { id: 'NCC-02', ten: 'Công ty CP Vật tư Y tế Đông Á', nguoi: 'Anh Dũng', dien_thoai: '0918 442 907',
    ngay_giao: 4, thanh_toan: 'Công nợ 45 ngày', danh_gia: 4.0,
    ghi_chu: 'Giá tốt khi lấy số lượng lớn. Giao chậm hơn, cần đặt sớm.' },
  { id: 'NCC-03', ten: 'Nha khoa Kim Phát', nguoi: 'Chị Trâm', dien_thoai: '0977 305 118',
    ngay_giao: 1, thanh_toan: 'Thanh toán ngay', danh_gia: 4.2,
    ghi_chu: 'Kho gần, lấy gấp trong ngày được. Giá nhỉnh hơn.' },
  { id: 'NCC-04', ten: 'Straumann Việt Nam', nguoi: 'Anh Phúc', dien_thoai: '0908 776 512',
    ngay_giao: 7, thanh_toan: 'Chuyển khoản trước 50%', danh_gia: 4.8,
    ghi_chu: 'Hàng chính hãng có tem truy xuất. Chỉ đặt khi đã chốt ca.' },
  { id: 'NCC-05', ten: 'Công ty TNHH TM Dược phẩm Minh Châu', nguoi: 'Chị Hà', dien_thoai: '0939 214 668',
    ngay_giao: 3, thanh_toan: 'Công nợ 30 ngày', danh_gia: 4.3,
    ghi_chu: 'Chuyên thuốc và hoá chất, có giấy tờ đầy đủ cho hàng kiểm soát.' },
];

/* Vật tư.
 *
 * `don_vi` là ĐƠN VỊ DÙNG, không phải đơn vị mua. Găng tay dùng theo "đôi"
 * nhưng mua theo "hộp 100 đôi" — tách hai thứ này ra là điều kiện để so giá
 * giữa các nhà cung cấp bán quy cách khác nhau. Gộp làm một là chỗ mọi phần
 * mềm kho làm ẩu bị sai.
 */
let VAT_TU = [
  { id: 'VT-001', ma: 'GT-NIT-M', ten: 'Găng tay nitrile không bột · size M',
    nhom: 'vo_trung', don_vi: 'đôi', dinh_muc: 1200, co: [] },
  { id: 'VT-002', ma: 'KT-27G', ten: 'Kim tiêm nha khoa 27G',
    nhom: 'tieu_hao', don_vi: 'cây', dinh_muc: 500, co: [] },
  { id: 'VT-003', ma: 'TT-LIDO2', ten: 'Thuốc tê Lidocaine 2% có Adrenaline',
    nhom: 'thuoc', don_vi: 'ống', dinh_muc: 300, co: ['han_dung', 'kiem_soat'] },
  { id: 'VT-004', ma: 'CP-Z350-A2', ten: 'Composite Filtek Z350 XT · màu A2',
    nhom: 'phuc_hinh', don_vi: 'ống', dinh_muc: 12, co: ['han_dung', 'lanh'] },
  { id: 'VT-005', ma: 'TR-PTAPER', ten: 'Trâm nội nha ProTaper Gold · bộ 6 cây',
    nhom: 'noi_nha', don_vi: 'bộ', dinh_muc: 20, co: [] },
  { id: 'VT-006', ma: 'MK-KC-FG', ten: 'Mũi khoan kim cương FG · hỗn hợp',
    nhom: 'thiet_bi', don_vi: 'cây', dinh_muc: 150, co: [] },
  { id: 'VT-007', ma: 'BG-CUON', ten: 'Bông gòn cuộn nha khoa',
    nhom: 'tieu_hao', don_vi: 'gói', dinh_muc: 80, co: [] },
  { id: 'VT-008', ma: 'KT-YT-4L', ten: 'Khẩu trang y tế 4 lớp',
    nhom: 'vo_trung', don_vi: 'cái', dinh_muc: 2000, co: [] },
  { id: 'VT-009', ma: 'IMP-STR-RC', ten: 'Trụ Implant Straumann BLT RC 4.1×10mm',
    nhom: 'implant', don_vi: 'trụ', dinh_muc: 0, co: ['dat_rieng', 'gia_tri_cao'] },
  { id: 'VT-010', ma: 'OH-NB', ten: 'Ống hút nước bọt dùng một lần',
    nhom: 'tieu_hao', don_vi: 'cái', dinh_muc: 3000, co: [] },
  { id: 'VT-011', ma: 'CM-TAM', ten: 'Cement gắn tạm Temp-Bond',
    nhom: 'phuc_hinh', don_vi: 'tuýp', dinh_muc: 10, co: ['han_dung'] },
  { id: 'VT-012', ma: 'MC-MC-018', ten: 'Mắc cài kim loại MBT 0.018 · bộ 20',
    nhom: 'chinh_nha', don_vi: 'bộ', dinh_muc: 8, co: [] },
  { id: 'VT-013', ma: 'CK-VICRYL', ten: 'Chỉ khâu tiêu Vicryl 4-0',
    nhom: 'implant', don_vi: 'sợi', dinh_muc: 40, co: ['han_dung'] },
  { id: 'VT-014', ma: 'KH-VT-BO', ten: 'Khay khám vô trùng · bộ 5 món',
    nhom: 'vo_trung', don_vi: 'bộ', dinh_muc: 200, co: [] },
  { id: 'VT-015', ma: 'HC-NAOCL', ten: 'Dung dịch bơm rửa NaOCl 3%',
    nhom: 'thuoc', don_vi: 'chai', dinh_muc: 24, co: ['han_dung'] },
];

/* Bảng giá.
 *
 * `quy_cach` là số ĐƠN VỊ DÙNG trong một đơn vị mua. Hộp găng 100 đôi thì
 * quy_cach = 100, don_vi_mua = 'hộp'. Đơn giá thật = gia / quy_cach, và đó
 * mới là con số so sánh được giữa các nhà cung cấp.
 *
 * `toi_thieu` là số đơn vị MUA tối thiểu mỗi lần đặt. Nhà rẻ nhất mà bắt lấy
 * 10 thùng trong khi mình cần 1 thì rẻ đó không dùng được.
 */
let BANG_GIA = [
  // Găng tay — ba nhà, quy cách khác nhau: đây là ví dụ rõ nhất của bẫy so giá
  { vat_tu: 'VT-001', ncc: 'NCC-01', don_vi_mua: 'hộp', quy_cach: 100, gia: 118000, toi_thieu: 1, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-001', ncc: 'NCC-02', don_vi_mua: 'thùng', quy_cach: 1000, gia: 1050000, toi_thieu: 1, cap_nhat: ngayLech(-8) },
  { vat_tu: 'VT-001', ncc: 'NCC-03', don_vi_mua: 'hộp', quy_cach: 100, gia: 125000, toi_thieu: 1, cap_nhat: ngayLech(-3) },

  { vat_tu: 'VT-002', ncc: 'NCC-01', don_vi_mua: 'hộp', quy_cach: 100, gia: 165000, toi_thieu: 1, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-002', ncc: 'NCC-03', don_vi_mua: 'hộp', quy_cach: 100, gia: 172000, toi_thieu: 1, cap_nhat: ngayLech(-3) },

  { vat_tu: 'VT-003', ncc: 'NCC-05', don_vi_mua: 'hộp', quy_cach: 50, gia: 385000, toi_thieu: 1, cap_nhat: ngayLech(-6) },
  { vat_tu: 'VT-003', ncc: 'NCC-01', don_vi_mua: 'hộp', quy_cach: 50, gia: 402000, toi_thieu: 1, cap_nhat: ngayLech(-12) },

  { vat_tu: 'VT-004', ncc: 'NCC-01', don_vi_mua: 'ống', quy_cach: 1, gia: 520000, toi_thieu: 1, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-004', ncc: 'NCC-02', don_vi_mua: 'bộ', quy_cach: 6, gia: 2820000, toi_thieu: 1, cap_nhat: ngayLech(-8) },

  { vat_tu: 'VT-005', ncc: 'NCC-01', don_vi_mua: 'bộ', quy_cach: 1, gia: 1250000, toi_thieu: 1, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-005', ncc: 'NCC-02', don_vi_mua: 'bộ', quy_cach: 1, gia: 1180000, toi_thieu: 5, cap_nhat: ngayLech(-8) },

  { vat_tu: 'VT-006', ncc: 'NCC-02', don_vi_mua: 'vỉ', quy_cach: 10, gia: 285000, toi_thieu: 2, cap_nhat: ngayLech(-8) },
  { vat_tu: 'VT-006', ncc: 'NCC-03', don_vi_mua: 'vỉ', quy_cach: 10, gia: 298000, toi_thieu: 1, cap_nhat: ngayLech(-3) },

  { vat_tu: 'VT-007', ncc: 'NCC-01', don_vi_mua: 'gói', quy_cach: 1, gia: 32000, toi_thieu: 10, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-007', ncc: 'NCC-03', don_vi_mua: 'gói', quy_cach: 1, gia: 35000, toi_thieu: 1, cap_nhat: ngayLech(-3) },

  { vat_tu: 'VT-008', ncc: 'NCC-02', don_vi_mua: 'thùng', quy_cach: 2000, gia: 1240000, toi_thieu: 1, cap_nhat: ngayLech(-8) },
  { vat_tu: 'VT-008', ncc: 'NCC-01', don_vi_mua: 'hộp', quy_cach: 50, gia: 38000, toi_thieu: 5, cap_nhat: ngayLech(-12) },

  { vat_tu: 'VT-009', ncc: 'NCC-04', don_vi_mua: 'trụ', quy_cach: 1, gia: 8950000, toi_thieu: 1, cap_nhat: ngayLech(-20) },

  { vat_tu: 'VT-010', ncc: 'NCC-01', don_vi_mua: 'bịch', quy_cach: 100, gia: 42000, toi_thieu: 5, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-010', ncc: 'NCC-02', don_vi_mua: 'thùng', quy_cach: 2000, gia: 760000, toi_thieu: 1, cap_nhat: ngayLech(-8) },

  { vat_tu: 'VT-011', ncc: 'NCC-01', don_vi_mua: 'tuýp', quy_cach: 1, gia: 385000, toi_thieu: 1, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-011', ncc: 'NCC-05', don_vi_mua: 'tuýp', quy_cach: 1, gia: 368000, toi_thieu: 3, cap_nhat: ngayLech(-6) },

  { vat_tu: 'VT-012', ncc: 'NCC-02', don_vi_mua: 'bộ', quy_cach: 1, gia: 1450000, toi_thieu: 1, cap_nhat: ngayLech(-8) },

  { vat_tu: 'VT-013', ncc: 'NCC-04', don_vi_mua: 'hộp', quy_cach: 12, gia: 1680000, toi_thieu: 1, cap_nhat: ngayLech(-20) },
  { vat_tu: 'VT-013', ncc: 'NCC-05', don_vi_mua: 'hộp', quy_cach: 12, gia: 1590000, toi_thieu: 1, cap_nhat: ngayLech(-6) },

  { vat_tu: 'VT-014', ncc: 'NCC-01', don_vi_mua: 'bộ', quy_cach: 1, gia: 28000, toi_thieu: 20, cap_nhat: ngayLech(-12) },
  { vat_tu: 'VT-014', ncc: 'NCC-03', don_vi_mua: 'bộ', quy_cach: 1, gia: 26500, toi_thieu: 50, cap_nhat: ngayLech(-3) },

  { vat_tu: 'VT-015', ncc: 'NCC-05', don_vi_mua: 'chai', quy_cach: 1, gia: 68000, toi_thieu: 6, cap_nhat: ngayLech(-6) },
];

/* Tồn kho theo chi nhánh. Vật tư nào không có dòng ở đây nghĩa là chi nhánh
 * đó không giữ tồn — không phải bằng 0 vì quên nhập. */
let TON_KHO = [
  { vat_tu: 'VT-001', chi_nhanh: 'pham-van-chieu', so_luong: 340,  vi_tri: 'Kệ A1', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-001', chi_nhanh: 'le-van-tho',     so_luong: 1450, vi_tri: 'Kệ A1', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-002', chi_nhanh: 'pham-van-chieu', so_luong: 120,  vi_tri: 'Kệ A2', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-002', chi_nhanh: 'le-van-tho',     so_luong: 640,  vi_tri: 'Kệ A2', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-003', chi_nhanh: 'pham-van-chieu', so_luong: 0,    vi_tri: 'Tủ thuốc khoá', kiem_ke: ngayLech(-1) },
  { vat_tu: 'VT-003', chi_nhanh: 'le-van-tho',     so_luong: 210,  vi_tri: 'Tủ thuốc khoá', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-004', chi_nhanh: 'pham-van-chieu', so_luong: 4,    vi_tri: 'Tủ mát',  kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-004', chi_nhanh: 'le-van-tho',     so_luong: 15,   vi_tri: 'Tủ mát',  kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-005', chi_nhanh: 'pham-van-chieu', so_luong: 18,   vi_tri: 'Kệ B1', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-005', chi_nhanh: 'le-van-tho',     so_luong: 26,   vi_tri: 'Kệ B1', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-006', chi_nhanh: 'pham-van-chieu', so_luong: 210,  vi_tri: 'Kệ B2', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-006', chi_nhanh: 'le-van-tho',     so_luong: 95,   vi_tri: 'Kệ B2', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-007', chi_nhanh: 'pham-van-chieu', so_luong: 62,   vi_tri: 'Kệ A3', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-007', chi_nhanh: 'le-van-tho',     so_luong: 110,  vi_tri: 'Kệ A3', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-008', chi_nhanh: 'pham-van-chieu', so_luong: 2400, vi_tri: 'Kệ A1', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-008', chi_nhanh: 'le-van-tho',     so_luong: 1750, vi_tri: 'Kệ A1', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-010', chi_nhanh: 'pham-van-chieu', so_luong: 1800, vi_tri: 'Kệ A4', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-010', chi_nhanh: 'le-van-tho',     so_luong: 4200, vi_tri: 'Kệ A4', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-011', chi_nhanh: 'pham-van-chieu', so_luong: 3,    vi_tri: 'Kệ C1', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-011', chi_nhanh: 'le-van-tho',     so_luong: 11,   vi_tri: 'Kệ C1', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-012', chi_nhanh: 'le-van-tho',     so_luong: 6,    vi_tri: 'Kệ C2', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-013', chi_nhanh: 'pham-van-chieu', so_luong: 12,   vi_tri: 'Tủ mát',  kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-013', chi_nhanh: 'le-van-tho',     so_luong: 48,   vi_tri: 'Tủ mát',  kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-014', chi_nhanh: 'pham-van-chieu', so_luong: 145,  vi_tri: 'Phòng hấp', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-014', chi_nhanh: 'le-van-tho',     so_luong: 320,  vi_tri: 'Phòng hấp', kiem_ke: ngayLech(-2) },
  { vat_tu: 'VT-015', chi_nhanh: 'pham-van-chieu', so_luong: 9,    vi_tri: 'Kệ B3', kiem_ke: ngayLech(-4) },
  { vat_tu: 'VT-015', chi_nhanh: 'le-van-tho',     so_luong: 30,   vi_tri: 'Kệ B3', kiem_ke: ngayLech(-2) },
];

/* Đơn hàng. `dong[].da_nhan` là số ĐƠN VỊ MUA đã nhận — số còn thiếu tính ra
 * từ đây, không lưu thành cột riêng. */
let DON_HANG = [
  { id: 'DH-0001', ncc: 'NCC-01', chi_nhanh: 'pham-van-chieu',
    ngay_dat: ngayLech(-6), hen_giao: ngayLech(-2), trang_thai: 'giao_mot_phan',
    nguoi_dat: 'PVC-10199', ghi_chu: 'Đơn bù gấp cho tuần cao điểm.',
    dong: [
      { vat_tu: 'VT-001', so_luong: 10, da_nhan: 10, don_gia: 118000, don_vi_mua: 'hộp', quy_cach: 100 },
      { vat_tu: 'VT-002', so_luong: 6,  da_nhan: 2,  don_gia: 165000, don_vi_mua: 'hộp', quy_cach: 100 },
      { vat_tu: 'VT-007', so_luong: 20, da_nhan: 0,  don_gia: 32000,  don_vi_mua: 'gói', quy_cach: 1 },
    ] },
  { id: 'DH-0002', ncc: 'NCC-05', chi_nhanh: 'pham-van-chieu',
    ngay_dat: ngayLech(-3), hen_giao: ngayLech(1), trang_thai: 'da_dat',
    nguoi_dat: 'PVC-10199', ghi_chu: 'Thuốc tê — kho PVC đã hết sạch.',
    dong: [
      { vat_tu: 'VT-003', so_luong: 8, da_nhan: 0, don_gia: 385000, don_vi_mua: 'hộp', quy_cach: 50 },
      { vat_tu: 'VT-015', so_luong: 12, da_nhan: 0, don_gia: 68000, don_vi_mua: 'chai', quy_cach: 1 },
    ] },
  { id: 'DH-0003', ncc: 'NCC-04', chi_nhanh: 'le-van-tho',
    ngay_dat: ngayLech(-9), hen_giao: ngayLech(-2), trang_thai: 'da_giao',
    nguoi_dat: 'PVC003', ghi_chu: 'Đặt riêng cho ca implant BN-00002.',
    dong: [
      { vat_tu: 'VT-009', so_luong: 1, da_nhan: 1, don_gia: 8950000, don_vi_mua: 'trụ', quy_cach: 1 },
      { vat_tu: 'VT-013', so_luong: 2, da_nhan: 2, don_gia: 1680000, don_vi_mua: 'hộp', quy_cach: 12 },
    ] },
  { id: 'DH-0004', ncc: 'NCC-02', chi_nhanh: 'le-van-tho',
    ngay_dat: ngayLech(-11), hen_giao: ngayLech(-5), trang_thai: 'giao_mot_phan',
    nguoi_dat: 'PVC003', ghi_chu: 'Nhà cung cấp báo thiếu hàng, hẹn giao nốt.',
    dong: [
      { vat_tu: 'VT-008', so_luong: 2, da_nhan: 1, don_gia: 1240000, don_vi_mua: 'thùng', quy_cach: 2000 },
      { vat_tu: 'VT-006', so_luong: 8, da_nhan: 8, don_gia: 285000, don_vi_mua: 'vỉ', quy_cach: 10 },
    ] },
  { id: 'DH-0005', ncc: 'NCC-03', chi_nhanh: 'pham-van-chieu',
    ngay_dat: ngayLech(-1), hen_giao: ngayLech(0), trang_thai: 'cho_duyet',
    nguoi_dat: 'PVC-10199', ghi_chu: 'Lấy gấp trong ngày, chờ chị Huỳnh duyệt.',
    dong: [
      { vat_tu: 'VT-011', so_luong: 4, da_nhan: 0, don_gia: 385000, don_vi_mua: 'tuýp', quy_cach: 1 },
    ] },
];

/* Phiếu xuất kho — vật tư đi RA khỏi kho.
 *
 * Đối xứng với nhận hàng: nhận thì cộng tồn, xuất thì trừ tồn. Có đủ hai
 * chiều thì con số tồn kho mới là con số thật; thiếu một chiều là sổ sách chỉ
 * biết hàng vào mà không biết hàng đi đâu.
 */
let PHIEU_XUAT = [
  { id: 'PX-0001', chi_nhanh: 'pham-van-chieu', ngay: ngayLech(-2),
    noi_nhan: 'phong_1', nguoi_xuat: 'PVC-10199', nguoi_nhan: 'Phụ tá Yến Thư',
    ly_do: 'Cấp vật tư đầu ca sáng.', trang_thai: 'da_xuat',
    dong: [
      { vat_tu: 'VT-001', so_luong: 60 },
      { vat_tu: 'VT-008', so_luong: 100 },
      { vat_tu: 'VT-010', so_luong: 200 },
    ] },
  { id: 'PX-0002', chi_nhanh: 'le-van-tho', ngay: ngayLech(-1),
    noi_nhan: 'phong_pt', nguoi_xuat: 'PVC003', nguoi_nhan: 'BS. Nguyễn Tuấn Ngọc',
    ly_do: 'Ca cấy ghép implant 46 — có trụ giá trị cao, kiểm đếm hai người.',
    trang_thai: 'da_xuat',
    dong: [
      { vat_tu: 'VT-013', so_luong: 4 },
      { vat_tu: 'VT-001', so_luong: 20 },
    ] },
  { id: 'PX-0003', chi_nhanh: 'pham-van-chieu', ngay: ngayLech(0),
    noi_nhan: 'huy_hong', nguoi_xuat: 'PVC-10199', nguoi_nhan: '—',
    ly_do: 'Composite A2 quá hạn sử dụng, huỷ theo quy định.',
    trang_thai: 'nhap',
    dong: [{ vat_tu: 'VT-004', so_luong: 1 }] },
];

/* Hoá đơn của đơn mua, kèm ảnh chụp.
 *
 * Ảnh lưu theo MÃ BĂM nội dung, giống kho ảnh bệnh án: chụp lại cùng một tờ
 * hoá đơn hai lần thì chỉ tốn chỗ một lần. `KHO_ANH_HD` là chỗ chứa thật,
 * `HOA_DON.anh` chỉ giữ mã băm trỏ vào đó.
 */
let HOA_DON = [
  { id: 'HD-0001', don: 'DH-0003', so: 'STR-2026-0914', ngay: ngayLech(-2),
    tien: 12310000, anh: [], ghi_chu: 'Hoá đơn VAT bản cứng đã gửi kế toán.' },
];
let KHO_ANH_HD = [];

/* ── Tiện ích ─────────────────────────────────────────────────────────── */

const sao = (x) => JSON.parse(JSON.stringify(x));
const cho = (giaTri) => Promise.resolve(sao(giaTri));
const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export const tenNhaCungCap = (id) => NHA_CUNG_CAP.find((n) => n.id === id)?.ten || id || '—';
export const tenChiNhanhKho = (id) => CHI_NHANH.find((c) => c.ma === id)?.ten || id || '—';

/** Đơn giá quy về ĐƠN VỊ DÙNG — con số duy nhất so sánh được giữa các nhà. */
export const donGiaQuyDoi = (dong) => (dong.gia ?? dong.don_gia) / (dong.quy_cach || 1);

function mucTon(soLuong, dinhMuc) {
  /* Định mức 0 nghĩa là KHÔNG giữ tồn thứ này — trụ implant đặt theo ca đã
   * chốt, không trữ sẵn. Tồn 0 ở đây là đúng trạng thái, không phải thiếu
   * hàng. Xếp nó vào "hết hàng" là đặt một báo động giả vĩnh viễn lên đầu
   * danh sách việc cần làm, và người dùng sẽ học cách bỏ qua cả danh sách. */
  if (!dinhMuc) return 'du';
  if (soLuong <= 0) return 'het';
  if (soLuong < dinhMuc) return 'thieu';
  if (soLuong < dinhMuc * 1.25) return 'sap_het';
  return 'du';
}

/* ── Đọc dữ liệu ──────────────────────────────────────────────────────── */

/** Một vật tư kèm tồn kho, mức tồn và giá tốt nhất — dạng dùng khắp màn hình. */
function dungVatTu(v, chiNhanh) {
  const ton = TON_KHO.filter((t) => t.vat_tu === v.id
    && (!chiNhanh || t.chi_nhanh === chiNhanh));
  const soLuong = ton.reduce((s, t) => s + t.so_luong, 0);
  // Định mức là mức của MỘT chi nhánh. Xem gộp cả hệ thống thì ngưỡng phải
  // nhân theo số chi nhánh đang giữ tồn, không thì kho nào cũng "đủ".
  const soKho = chiNhanh ? 1 : (ton.length || 1);
  const dinhMuc = v.dinh_muc * soKho;

  const gia = BANG_GIA.filter((g) => g.vat_tu === v.id)
    .map((g) => ({ ...g, don_gia_quy_doi: donGiaQuyDoi(g) }))
    .sort((a, b) => a.don_gia_quy_doi - b.don_gia_quy_doi);

  const dangCho = DON_HANG
    .filter((d) => !['huy', 'da_giao'].includes(d.trang_thai)
      && (!chiNhanh || d.chi_nhanh === chiNhanh))
    .flatMap((d) => d.dong.filter((x) => x.vat_tu === v.id)
      .map((x) => (x.so_luong - x.da_nhan) * x.quy_cach))
    .reduce((s, x) => s + x, 0);

  return {
    ...v,
    ton_kho: ton,
    so_luong: soLuong,
    dinh_muc_hien: dinhMuc,
    muc_ton: mucTon(soLuong, dinhMuc),
    dang_cho_ve: dangCho,
    so_nha_cung_cap: gia.length,
    gia_tot_nhat: gia[0] || null,
    gia_cao_nhat: gia.length > 1 ? gia[gia.length - 1] : null,
  };
}

export function layVatTu({ tim, nhom, chiNhanh, mucTon: locMuc, co, chiThieu } = {}) {
  let ds = VAT_TU.map((v) => dungVatTu(v, chiNhanh));

  if (nhom) ds = ds.filter((v) => v.nhom === nhom);
  if (co) ds = ds.filter((v) => v.co.includes(co));
  if (locMuc) ds = ds.filter((v) => v.muc_ton === locMuc);
  if (chiThieu) ds = ds.filter((v) => ['het', 'thieu'].includes(v.muc_ton));
  if (tim) {
    /* Tìm không dấu, và tìm cả trên TÊN NHÀ CUNG CẤP.
     *
     * Người giữ kho hay nhớ theo nhà bán chứ không nhớ mã: "mấy thứ mua của
     * Việt Tiên". Bỏ dấu vì gõ nhanh trên máy tính bảng ít ai bỏ dấu đúng. */
    const q = boDau(tim);
    ds = ds.filter((v) => {
      const nccCuaVt = BANG_GIA.filter((g) => g.vat_tu === v.id)
        .map((g) => tenNhaCungCap(g.ncc)).join(' ');
      return boDau(`${v.ten} ${v.ma} ${NHOM_VAT_TU[v.nhom]} ${nccCuaVt}`).includes(q);
    });
  }

  const uu = { het: 0, thieu: 1, sap_het: 2, du: 3 };
  ds.sort((a, b) => (uu[a.muc_ton] - uu[b.muc_ton]) || a.ten.localeCompare(b.ten, 'vi'));
  return cho(ds);
}

export function layNhaCungCap({ tim } = {}) {
  let ds = NHA_CUNG_CAP.map((n) => {
    const dong = BANG_GIA.filter((g) => g.ncc === n.id);
    const don = DON_HANG.filter((d) => d.ncc === n.id && d.trang_thai !== 'huy');
    const treHen = don.filter((d) => d.trang_thai !== 'da_giao' && d.hen_giao < ngayLech(0));
    return {
      ...n,
      so_mat_hang: dong.length,
      so_don: don.length,
      so_don_tre: treHen.length,
      tong_gia_tri: don.reduce((s, d) => s
        + d.dong.reduce((t, x) => t + x.so_luong * x.don_gia, 0), 0),
    };
  });
  if (tim) {
    const q = boDau(tim);
    ds = ds.filter((n) => boDau(`${n.ten} ${n.nguoi} ${n.dien_thoai}`).includes(q));
  }
  return cho(ds);
}

/* So sánh giá giữa các nhà cung cấp cho MỘT vật tư.
 *
 * Quy hết về đơn giá theo đơn vị dùng trước khi xếp hạng. Không quy đổi thì
 * hộp 100 đôi giá 118k trông "rẻ hơn" thùng 1000 đôi giá 1.050k, trong khi
 * thật ra thùng rẻ hơn 11%. Đây là cái bẫy khiến so giá bằng mắt luôn sai khi
 * các nhà bán quy cách khác nhau.
 *
 * `cho_so_luong` là số đơn vị DÙNG đang cần. Có nó thì tính được nhà rẻ nhất
 * có bắt mua dư hay không — rẻ mà phải ôm gấp năm lần nhu cầu thì không rẻ.
 */
export function soSanhGia(vatTuId, choSoLuong = 0) {
  const v = VAT_TU.find((x) => x.id === vatTuId);
  if (!v) throw new Error('Không tìm thấy vật tư này.');

  const ds = BANG_GIA.filter((g) => g.vat_tu === vatTuId).map((g) => {
    const ncc = NHA_CUNG_CAP.find((n) => n.id === g.ncc);
    const donGia = donGiaQuyDoi(g);
    // Số đơn vị mua cần lấy để đủ nhu cầu, nhưng không dưới mức tối thiểu.
    const canMua = choSoLuong > 0
      ? Math.max(g.toi_thieu, Math.ceil(choSoLuong / g.quy_cach)) : g.toi_thieu;
    const nhanDuoc = canMua * g.quy_cach;
    return {
      ...g,
      ten_ncc: ncc?.ten || g.ncc,
      ngay_giao: ncc?.ngay_giao ?? null,
      thanh_toan: ncc?.thanh_toan || '',
      danh_gia: ncc?.danh_gia ?? null,
      don_gia_quy_doi: donGia,
      can_mua: canMua,
      nhan_duoc: nhanDuoc,
      thanh_tien: canMua * g.gia,
      // Mua dư bao nhiêu so với nhu cầu — cờ cảnh báo, không phải lỗi.
      du_ra: choSoLuong > 0 ? nhanDuoc - choSoLuong : 0,
    };
  }).sort((a, b) => a.don_gia_quy_doi - b.don_gia_quy_doi);

  if (!ds.length) return cho({ vat_tu: v, bang: [], tiet_kiem: null });

  /* HAI thứ "rẻ nhất", và chúng KHÔNG phải lúc nào cũng là một nhà.
   *
   *   rẻ theo ĐƠN GIÁ   — đúng khi mua đều, mua dài hạn
   *   rẻ theo TIỀN THẬT — đúng cho lần đặt này, vì còn quy cách và mức tối
   *                       thiểu chen vào
   *
   * Ví dụ thật trong bảng giá này: trâm nội nha, cần 2 bộ. Đông Á rẻ hơn
   * 1.180k/bộ so với 1.250k, nhưng bắt lấy tối thiểu 5 bộ → trả 5.900k thay
   * vì 2.500k. Chỉ đưa ra "nhà rẻ nhất" theo đơn giá là đẩy người mua vào
   * chỗ trả đắt hơn 2,4 lần mà vẫn tưởng mình mua khôn.
   */
  const re = ds[0];
  const reTien = ds.slice().sort((a, b) => a.thanh_tien - b.thanh_tien)[0];
  const dat = ds[ds.length - 1];
  const lechNhau = choSoLuong > 0 && reTien.ncc !== re.ncc;

  return cho({
    vat_tu: v,
    bang: ds.map((g) => ({
      ...g,
      la_re_nhat: g.ncc === re.ncc,
      la_re_tien: choSoLuong > 0 && g.ncc === reTien.ncc,
      // Đắt hơn nhà rẻ nhất bao nhiêu phần trăm — đọc nhanh hơn số tiền thô.
      dat_hon_pt: re.don_gia_quy_doi > 0
        ? Math.round(((g.don_gia_quy_doi - re.don_gia_quy_doi) / re.don_gia_quy_doi) * 100) : 0,
    })),
    // Cảnh báo khi hai cách xếp hạng cho ra hai nhà khác nhau.
    canh_bao_moq: lechNhau ? {
      re_don_gia: re.ten_ncc, tien_neu_mua: re.thanh_tien, du_ra: re.du_ra,
      re_tien_that: reTien.ten_ncc, tien_that: reTien.thanh_tien,
      chenh: re.thanh_tien - reTien.thanh_tien,
    } : null,
    tiet_kiem: ds.length > 1 ? {
      re_nhat: re.ten_ncc,
      dat_nhat: dat.ten_ncc,
      chenh_pt: Math.round(((dat.don_gia_quy_doi - re.don_gia_quy_doi) / re.don_gia_quy_doi) * 100),
      // So TIỀN THẬT giữa lựa chọn rẻ nhất và đắt nhất cho đúng số lượng cần.
      // Lấy max−min chứ không lấy "đắt nhất trừ rẻ nhất theo đơn giá": làm
      // tròn theo quy cách khiến hiệu đó có lúc ra số ÂM, và một dòng "tiết
      // kiệm −600.000đ" thì vô nghĩa với người đọc.
      chenh_tien: choSoLuong > 0
        ? Math.max(...ds.map((g) => g.thanh_tien)) - Math.min(...ds.map((g) => g.thanh_tien))
        : 0,
    } : null,
  });
}

/* Đề xuất mua hàng tự dựng.
 *
 * Quét mọi vật tư dưới định mức, chọn nhà rẻ nhất cho từng thứ rồi GOM THEO
 * NHÀ CUNG CẤP — vì đặt hàng là đặt theo nhà, không phải theo từng món. Người
 * giữ kho mở ra là có sẵn mấy đơn để gửi đi, không phải ngồi dò từng dòng.
 *
 * TRỪ ĐI phần đang trên đường về. Không trừ thì mỗi lần mở màn lại đề xuất
 * đặt tiếp thứ đã đặt hôm qua, và kho sẽ ngập hàng.
 *
 * Vật tư `dat_rieng` (implant) KHÔNG vào đề xuất tự động: chúng đặt theo ca
 * đã chốt, không theo định mức tồn.
 */
export function deXuatMuaHang({ chiNhanh } = {}) {
  const cacDong = [];
  VAT_TU.forEach((v) => {
    if (v.co.includes('dat_rieng')) return;
    const d = dungVatTu(v, chiNhanh);
    if (!['het', 'thieu'].includes(d.muc_ton)) return;

    const canBu = d.dinh_muc_hien - d.so_luong - d.dang_cho_ve;
    if (canBu <= 0) return;

    /* Chọn nhà theo TIỀN THẬT PHẢI TRẢ cho đúng lượng cần bù, không theo đơn
     * giá. Nhà có đơn giá thấp nhất mà bắt lấy tối thiểu 5 khi mình cần 2 thì
     * hoá đơn đắt hơn hẳn — đề xuất mà chọn theo đơn giá là tự dẫn người mua
     * vào chỗ trả nhiều tiền hơn. Đây chính là việc mà "khỏi ngồi mò" phải
     * làm đúng, nếu không thì mò tay còn rẻ hơn. */
    const gia = BANG_GIA.filter((g) => g.vat_tu === v.id).map((g) => {
      const canMua = Math.max(g.toi_thieu, Math.ceil(canBu / g.quy_cach));
      return { ...g, don_gia_quy_doi: donGiaQuyDoi(g), can_mua: canMua,
        thanh_tien: canMua * g.gia };
    }).sort((a, b) => a.thanh_tien - b.thanh_tien
      || a.don_gia_quy_doi - b.don_gia_quy_doi);

    if (!gia.length) {
      cacDong.push({ vat_tu: v, can_bu: canBu, khong_co_gia: true });
      return;
    }
    const g = gia[0];
    const reDonGia = gia.slice().sort((a, b) => a.don_gia_quy_doi - b.don_gia_quy_doi)[0];
    cacDong.push({
      vat_tu: v, can_bu: canBu, ton: d.so_luong, dinh_muc: d.dinh_muc_hien,
      dang_cho_ve: d.dang_cho_ve, muc_ton: d.muc_ton,
      ncc: g.ncc, don_vi_mua: g.don_vi_mua, quy_cach: g.quy_cach,
      don_gia: g.gia, can_mua: g.can_mua, thanh_tien: g.thanh_tien,
      du_ra: g.can_mua * g.quy_cach - canBu,
      so_nha_khac: gia.length - 1,
      // Ghi lại khi phải bỏ qua nhà có đơn giá thấp hơn, kèm lý do bằng tiền.
      bo_qua_re_hon: reDonGia.ncc !== g.ncc ? {
        ten: tenNhaCungCap(reDonGia.ncc),
        don_gia: reDonGia.don_gia_quy_doi,
        thanh_tien: reDonGia.thanh_tien,
        toi_thieu: reDonGia.toi_thieu,
      } : null,
    });
  });

  const theoNcc = {};
  cacDong.filter((x) => !x.khong_co_gia).forEach((x) => {
    (theoNcc[x.ncc] ||= { ncc: x.ncc, ten: tenNhaCungCap(x.ncc), dong: [], tong: 0 });
    theoNcc[x.ncc].dong.push(x);
    theoNcc[x.ncc].tong += x.thanh_tien;
  });

  const nhom = Object.values(theoNcc).sort((a, b) => b.tong - a.tong);
  return cho({
    nhom,
    thieu_gia: cacDong.filter((x) => x.khong_co_gia),
    so_mat_hang: cacDong.length,
    tong_tien: nhom.reduce((s, n) => s + n.tong, 0),
  });
}

/** Một đơn hàng kèm số đã nhận / còn thiếu, tính từ từng dòng. */
function dungDon(d) {
  const dong = d.dong.map((x) => {
    const v = VAT_TU.find((y) => y.id === x.vat_tu);
    const conThieu = x.so_luong - x.da_nhan;
    return {
      ...x,
      ten: v?.ten || x.vat_tu, ma: v?.ma || '', co: v?.co || [], don_vi: v?.don_vi || '',
      con_thieu: conThieu,
      thanh_tien: x.so_luong * x.don_gia,
      da_du: conThieu <= 0,
    };
  });
  const conThieu = dong.filter((x) => !x.da_du);
  return {
    ...d,
    dong,
    ten_ncc: tenNhaCungCap(d.ncc),
    tong_tien: dong.reduce((s, x) => s + x.thanh_tien, 0),
    so_dong_thieu: conThieu.length,
    // Trễ hẹn tính từ NGÀY HẸN so với hôm nay, chỉ với đơn chưa giao đủ.
    tre_hen: !['da_giao', 'huy'].includes(d.trang_thai) && d.hen_giao < ngayLech(0),
    so_ngay_tre: !['da_giao', 'huy'].includes(d.trang_thai) && d.hen_giao < ngayLech(0)
      ? Math.round((Date.parse(ngayLech(0)) - Date.parse(d.hen_giao)) / 86400000) : 0,
  };
}

export function layDonHang({ tim, chiNhanh, ncc, trangThai, chiTre, chiThieu } = {}) {
  let ds = DON_HANG.map(dungDon);
  if (chiNhanh) ds = ds.filter((d) => d.chi_nhanh === chiNhanh);
  if (ncc) ds = ds.filter((d) => d.ncc === ncc);
  if (trangThai) ds = ds.filter((d) => d.trang_thai === trangThai);
  if (chiTre) ds = ds.filter((d) => d.tre_hen);
  if (chiThieu) ds = ds.filter((d) => d.so_dong_thieu > 0 && d.trang_thai !== 'huy');
  if (tim) {
    const q = boDau(tim);
    ds = ds.filter((d) => boDau(`${d.id} ${d.ten_ncc} ${d.ghi_chu} `
      + d.dong.map((x) => x.ten).join(' ')).includes(q));
  }
  ds.sort((a, b) => (b.tre_hen - a.tre_hen) || (a.ngay_dat < b.ngay_dat ? 1 : -1));
  return cho(ds);
}

/* ── Ghi dữ liệu ──────────────────────────────────────────────────────── */

export function taoDonTuDeXuat(nhom, chiNhanh, boi) {
  if (!nhom?.dong?.length) throw new Error('Nhóm đề xuất này không có dòng nào.');
  const moi = {
    id: `DH-${String(DON_HANG.length + 1).padStart(4, '0')}`,
    ncc: nhom.ncc, chi_nhanh: chiNhanh || CHI_NHANH[0].ma,
    ngay_dat: ngayLech(0),
    hen_giao: ngayLech(NHA_CUNG_CAP.find((n) => n.id === nhom.ncc)?.ngay_giao ?? 3),
    // Đơn dựng từ đề xuất vào thẳng "chờ duyệt", không phải "đã đặt": máy gợi
    // ý mua gì, người vẫn phải gật đầu trước khi tiền đi ra.
    trang_thai: 'cho_duyet',
    nguoi_dat: boi,
    ghi_chu: 'Dựng tự động từ đề xuất mua hàng.',
    dong: nhom.dong.map((x) => ({
      vat_tu: x.vat_tu.id, so_luong: x.can_mua, da_nhan: 0,
      don_gia: x.don_gia, don_vi_mua: x.don_vi_mua, quy_cach: x.quy_cach,
    })),
  };
  DON_HANG.unshift(moi);
  return cho(dungDon(moi));
}

export function doiTrangThaiDon(id, trangThai, boi) {
  const d = DON_HANG.find((x) => x.id === id);
  if (!d) throw new Error('Không tìm thấy đơn hàng này.');
  if (!TRANG_THAI_DON[trangThai]) throw new Error('Trạng thái không hợp lệ.');
  if (d.trang_thai === 'da_giao') throw new Error('Đơn đã giao đủ, không đổi trạng thái được.');
  d.trang_thai = trangThai;
  d.cap_nhat_boi = boi;
  return cho(dungDon(d));
}

/* Nhận hàng. Cập nhật số đã nhận của từng dòng VÀ cộng vào tồn kho — hai việc
 * này phải đi cùng nhau, tách ra là kho lệch. */
export function nhanHang(id, nhan, boi) {
  const d = DON_HANG.find((x) => x.id === id);
  if (!d) throw new Error('Không tìm thấy đơn hàng này.');
  if (d.trang_thai === 'huy') throw new Error('Đơn đã huỷ, không nhận hàng được.');

  let coThayDoi = false;
  Object.entries(nhan || {}).forEach(([vatTuId, soLuong]) => {
    const so = Number(soLuong);
    if (!Number.isFinite(so) || so <= 0) return;
    const dong = d.dong.find((x) => x.vat_tu === vatTuId);
    if (!dong) return;
    const conThieu = dong.so_luong - dong.da_nhan;
    if (so > conThieu) {
      throw new Error(`Nhận ${so} nhưng đơn chỉ còn thiếu ${conThieu}. `
        + 'Nhận dư phải sửa đơn trước, không ghi đè.');
    }
    dong.da_nhan += so;
    coThayDoi = true;

    const t = TON_KHO.find((x) => x.vat_tu === vatTuId && x.chi_nhanh === d.chi_nhanh);
    const themVaoKho = so * dong.quy_cach;
    if (t) { t.so_luong += themVaoKho; t.kiem_ke = ngayLech(0); }
    else {
      TON_KHO.push({ vat_tu: vatTuId, chi_nhanh: d.chi_nhanh,
        so_luong: themVaoKho, vi_tri: 'Chưa xếp kệ', kiem_ke: ngayLech(0) });
    }
  });

  if (!coThayDoi) throw new Error('Chưa nhập số lượng nhận cho dòng nào.');
  d.trang_thai = d.dong.every((x) => x.da_nhan >= x.so_luong) ? 'da_giao' : 'giao_mot_phan';
  d.cap_nhat_boi = boi;
  return cho(dungDon(d));
}

/* ── Phiếu xuất kho ───────────────────────────────────────────────────── */

function dungPhieu(p) {
  const dong = p.dong.map((x) => {
    const v = VAT_TU.find((y) => y.id === x.vat_tu);
    const t = TON_KHO.find((y) => y.vat_tu === x.vat_tu && y.chi_nhanh === p.chi_nhanh);
    return {
      ...x,
      ten: v?.ten || x.vat_tu, ma: v?.ma || '', don_vi: v?.don_vi || '',
      co: v?.co || [],
      ton_hien: t?.so_luong ?? 0,
      // Phiếu nháp mà số xuất đã vượt tồn: chặn trước khi bấm xuất, không
      // để tới lúc xuất mới báo lỗi giữa chừng nửa phiếu.
      vuot_ton: p.trang_thai === 'nhap' && x.so_luong > (t?.so_luong ?? 0),
    };
  });
  return {
    ...p, dong,
    ten_noi_nhan: NOI_NHAN[p.noi_nhan] || p.noi_nhan,
    ten_nguoi_xuat: tenNguoi(p.nguoi_xuat),
    so_dong: dong.length,
    tong_mon: dong.reduce((s, x) => s + x.so_luong, 0),
    co_vuot_ton: dong.some((x) => x.vuot_ton),
    co_dac_biet: dong.some((x) => x.co.length > 0),
  };
}

export function layPhieuXuat({ tim, chiNhanh, noiNhan, trangThai } = {}) {
  let ds = PHIEU_XUAT.map(dungPhieu);
  if (chiNhanh) ds = ds.filter((p) => p.chi_nhanh === chiNhanh);
  if (noiNhan) ds = ds.filter((p) => p.noi_nhan === noiNhan);
  if (trangThai) ds = ds.filter((p) => p.trang_thai === trangThai);
  if (tim) {
    const q = boDau(tim);
    ds = ds.filter((p) => boDau(`${p.id} ${p.ten_noi_nhan} ${p.nguoi_nhan} ${p.ly_do} `
      + `${p.ten_nguoi_xuat} ${p.dong.map((x) => x.ten).join(' ')}`).includes(q));
  }
  ds.sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  return cho(ds);
}

export function taoPhieuXuat(du, boi) {
  if (!NOI_NHAN[du.noi_nhan]) throw new Error('Hãy chọn nơi nhận vật tư.');
  const dong = (du.dong || []).filter((x) => Number(x.so_luong) > 0);
  if (!dong.length) throw new Error('Phiếu xuất phải có ít nhất một dòng vật tư.');
  const chiNhanh = du.chi_nhanh || CHI_NHANH[0].ma;

  for (const x of dong) {
    const v = VAT_TU.find((y) => y.id === x.vat_tu);
    if (!v) throw new Error('Có dòng vật tư không hợp lệ.');
    const t = TON_KHO.find((y) => y.vat_tu === x.vat_tu && y.chi_nhanh === chiNhanh);
    if (Number(x.so_luong) > (t?.so_luong ?? 0)) {
      throw new Error(`${v.ten}: kho chỉ còn ${t?.so_luong ?? 0} ${v.don_vi}, `
        + `không xuất được ${x.so_luong}.`);
    }
  }

  const moi = {
    id: `PX-${String(PHIEU_XUAT.length + 1).padStart(4, '0')}`,
    chi_nhanh: chiNhanh, ngay: ngayLech(0),
    noi_nhan: du.noi_nhan, nguoi_xuat: boi,
    nguoi_nhan: String(du.nguoi_nhan || '').trim() || '—',
    ly_do: String(du.ly_do || '').trim(),
    // Phiếu mới luôn là NHÁP. Vật tư chỉ rời kho khi có người bấm xuất, không
    // phải khi có người gõ xong biểu mẫu.
    trang_thai: 'nhap',
    dong: dong.map((x) => ({ vat_tu: x.vat_tu, so_luong: Number(x.so_luong) })),
  };
  PHIEU_XUAT.unshift(moi);
  return cho(dungPhieu(moi));
}

/** Xuất kho thật: trừ tồn. Kiểm lại tồn ngay lúc xuất, vì tồn có thể đã đổi
 * kể từ lúc lập phiếu nháp. */
export function xuatKho(id, boi) {
  const p = PHIEU_XUAT.find((x) => x.id === id);
  if (!p) throw new Error('Không tìm thấy phiếu xuất này.');
  if (p.trang_thai !== 'nhap') throw new Error('Chỉ xuất được phiếu đang ở trạng thái nháp.');

  for (const x of p.dong) {
    const v = VAT_TU.find((y) => y.id === x.vat_tu);
    const t = TON_KHO.find((y) => y.vat_tu === x.vat_tu && y.chi_nhanh === p.chi_nhanh);
    if (x.so_luong > (t?.so_luong ?? 0)) {
      throw new Error(`${v?.ten || x.vat_tu}: kho chỉ còn ${t?.so_luong ?? 0}, `
        + 'tồn đã thay đổi từ lúc lập phiếu. Sửa lại số lượng.');
    }
  }
  p.dong.forEach((x) => {
    const t = TON_KHO.find((y) => y.vat_tu === x.vat_tu && y.chi_nhanh === p.chi_nhanh);
    t.so_luong -= x.so_luong;
    t.kiem_ke = ngayLech(0);
  });
  p.trang_thai = 'da_xuat';
  p.xuat_boi = boi;
  p.xuat_luc = new Date().toISOString();
  return cho(dungPhieu(p));
}

export function huyPhieuXuat(id, boi) {
  const p = PHIEU_XUAT.find((x) => x.id === id);
  if (!p) throw new Error('Không tìm thấy phiếu xuất này.');
  if (p.trang_thai === 'da_xuat') {
    throw new Error('Phiếu đã xuất kho, không huỷ được. Muốn trả lại thì lập phiếu nhập bù.');
  }
  p.trang_thai = 'huy';
  p.cap_nhat_boi = boi;
  return cho(dungPhieu(p));
}

/* ── Hoá đơn và ảnh chụp ──────────────────────────────────────────────── */

export function layHoaDon(donId) {
  const ds = HOA_DON.filter((h) => h.don === donId).map((h) => {
    const d = DON_HANG.find((x) => x.id === h.don);
    const tienDon = d ? d.dong.reduce((s, x) => s + x.so_luong * x.don_gia, 0) : 0;
    return {
      ...h,
      anh: h.anh.map((ma) => KHO_ANH_HD.find((a) => a.ma_bam === ma)).filter(Boolean),
      tien_don: tienDon,
      // Đối chiếu hoá đơn với đơn đặt. Lệch tiền là chuyện phải biết NGAY,
      // không phải để kế toán phát hiện sau một tháng.
      lech_tien: h.tien - tienDon,
    };
  });
  return cho(ds);
}

export function themHoaDon(donId, du, boi) {
  const d = DON_HANG.find((x) => x.id === donId);
  if (!d) throw new Error('Không tìm thấy đơn hàng này.');
  if (!String(du.so || '').trim()) throw new Error('Hãy nhập số hoá đơn.');
  const tien = Number(du.tien);
  if (!Number.isFinite(tien) || tien < 0) throw new Error('Số tiền hoá đơn không hợp lệ.');

  const moi = {
    id: `HD-${String(HOA_DON.length + 1).padStart(4, '0')}`,
    don: donId, so: String(du.so).trim(), ngay: du.ngay || ngayLech(0),
    tien, anh: [], ghi_chu: String(du.ghi_chu || '').trim(), tao_boi: boi,
  };
  HOA_DON.push(moi);
  return cho(moi);
}

/* Ảnh hoá đơn lưu theo MÃ BĂM nội dung: chụp lại cùng một tờ thì chỉ tốn chỗ
 * một lần, và ảnh giống nhau chắc chắn nhận ra được kể cả khi tên tệp khác. */
export function themAnhHoaDon(hoaDonId, ds, boi) {
  const h = HOA_DON.find((x) => x.id === hoaDonId);
  if (!h) throw new Error('Không tìm thấy hoá đơn này.');
  const them = [];
  (ds || []).forEach((a) => {
    if (!a.ma_bam || !a.data) return;
    if (!KHO_ANH_HD.some((x) => x.ma_bam === a.ma_bam)) {
      KHO_ANH_HD.push({
        ma_bam: a.ma_bam, data: a.data, ten: a.ten || '',
        co: a.co || 0, co_goc: a.co_goc || 0,
        tai_luc: new Date().toISOString(), tai_boi: boi,
      });
    }
    if (!h.anh.includes(a.ma_bam)) { h.anh.push(a.ma_bam); them.push(a.ma_bam); }
  });
  if (!them.length) throw new Error('Những ảnh này đã có trong hoá đơn rồi.');
  return cho({ them: them.length, tong: h.anh.length });
}

export function xoaAnhHoaDon(hoaDonId, maBam) {
  const h = HOA_DON.find((x) => x.id === hoaDonId);
  if (!h) throw new Error('Không tìm thấy hoá đơn này.');
  h.anh = h.anh.filter((m) => m !== maBam);
  // KHÔNG xoá khỏi KHO_ANH_HD: hoá đơn khác có thể đang trỏ vào cùng ảnh đó.
  return cho({ con_lai: h.anh.length });
}

export function thongKeAnhHoaDon() {
  const tong = KHO_ANH_HD.reduce((s, a) => s + (a.co || 0), 0);
  const goc = KHO_ANH_HD.reduce((s, a) => s + (a.co_goc || 0), 0);
  const daDung = HOA_DON.reduce((s, h) => s + h.anh.length, 0);
  return {
    so_anh: KHO_ANH_HD.length,
    so_lan_dung: daDung,
    tiet_kiem_trung: daDung - KHO_ANH_HD.length,
    dung_luong: tong,
    dung_luong_goc: goc,
  };
}

/* ── Tổng quan ────────────────────────────────────────────────────────── */

export function thongKeKho({ chiNhanh } = {}) {
  const vt = VAT_TU.map((v) => dungVatTu(v, chiNhanh));
  const don = DON_HANG.map(dungDon)
    .filter((d) => !chiNhanh || d.chi_nhanh === chiNhanh);
  const dangChay = don.filter((d) => !['da_giao', 'huy'].includes(d.trang_thai));
  const phieu = PHIEU_XUAT.map(dungPhieu)
    .filter((p) => !chiNhanh || p.chi_nhanh === chiNhanh);
  const donChuaHd = don.filter((d) => d.trang_thai === 'da_giao'
    && !HOA_DON.some((h) => h.don === d.id));

  return cho({
    phieu_nhap: phieu.filter((p) => p.trang_thai === 'nhap').length,
    xuat_hom_nay: phieu.filter((p) => p.trang_thai === 'da_xuat' && p.ngay === ngayLech(0)).length,
    don_thieu_hoa_don: donChuaHd.length,
    tong_mat_hang: vt.length,
    het_hang: vt.filter((v) => v.muc_ton === 'het').length,
    duoi_dinh_muc: vt.filter((v) => v.muc_ton === 'thieu').length,
    sap_het: vt.filter((v) => v.muc_ton === 'sap_het').length,
    dac_biet: vt.filter((v) => v.co.length > 0).length,
    don_dang_chay: dangChay.length,
    don_tre_hen: don.filter((d) => d.tre_hen).length,
    dong_con_thieu: dangChay.reduce((s, d) => s + d.so_dong_thieu, 0),
    tien_dang_treo: dangChay.reduce((s, d) => s
      + d.dong.reduce((t, x) => t + x.con_thieu * x.don_gia, 0), 0),
    so_nha_cung_cap: NHA_CUNG_CAP.length,
  });
}

export function xuatCsvVatTu(ds) {
  const dong = [['Mã', 'Tên vật tư', 'Nhóm', 'Đơn vị', 'Tồn', 'Định mức', 'Mức tồn',
    'Đang về', 'Số NCC', 'Đơn giá tốt nhất', 'NCC rẻ nhất', 'Lưu ý đặc biệt']];
  ds.forEach((v) => dong.push([
    v.ma, v.ten, NHOM_VAT_TU[v.nhom], v.don_vi, v.so_luong, v.dinh_muc_hien,
    MUC_TON[v.muc_ton].ten, v.dang_cho_ve, v.so_nha_cung_cap,
    v.gia_tot_nhat ? Math.round(v.gia_tot_nhat.don_gia_quy_doi) : '',
    v.gia_tot_nhat ? tenNhaCungCap(v.gia_tot_nhat.ncc) : 'Chưa có báo giá',
    v.co.map((c) => CO_DAC_BIET[c].ten).join(' · '),
  ]));
  return dong.map((r) => r.map((o) => `"${String(o ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function xuatCsvDeXuat(dx) {
  const dong = [['Nhà cung cấp', 'Mã', 'Vật tư', 'Tồn', 'Định mức', 'Đang về',
    'Cần bù', 'Đặt', 'Đơn vị mua', 'Quy cách', 'Đơn giá', 'Thành tiền']];
  dx.nhom.forEach((n) => n.dong.forEach((x) => dong.push([
    n.ten, x.vat_tu.ma, x.vat_tu.ten, x.ton, x.dinh_muc, x.dang_cho_ve,
    x.can_bu, x.can_mua, x.don_vi_mua, x.quy_cach, x.don_gia, x.thanh_tien,
  ])));
  return dong.map((r) => r.map((o) => `"${String(o ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}
