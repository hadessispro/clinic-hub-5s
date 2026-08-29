/* Lễ tân · lớp dữ liệu.
 *
 * Giai đoạn này là DỰNG GIAO DIỆN. Dữ liệu nằm trong bộ nhớ để màn hình chạy
 * và bấm được thật trước khi có API. Mọi hàm ở đây có đúng hình dạng mà bản
 * nối API sẽ có — trả Promise, ném Error khi sai — nên lúc nối chỉ thay ruột
 * từng hàm, không phải sửa màn hình.
 *
 * KHÔNG ĐỤNG DỮ LIỆU CỦA HỆ THỐNG CHÍNH. Khi lên database, phần này thuộc
 * schema riêng `le_tan`. Khách hàng, nhân viên và chi nhánh vẫn lấy từ nguồn
 * sẵn có của hệ thống; lễ tân chỉ sở hữu lịch hẹn, lượt tiếp đón và việc
 * chăm sóc. Mỗi khái niệm một chủ, không có bảng khách hàng thứ hai.
 */

import { todayISO } from '../utils.js';
import { BRANCHES } from '../branch.js';

/* ── Danh mục ────────────────────────────────────────────────────────── */

export const TRANG_THAI = {
  cho_den:   { ten: 'Chờ đến',    lop: 'neutral' },
  da_den:    { ten: 'Đã đến',     lop: 'good' },
  dang_kham: { ten: 'Đang khám',  lop: 'warn' },
  hoan_tat:  { ten: 'Hoàn tất',   lop: 'good' },
  khong_den: { ten: 'Không đến',  lop: 'bad' },
  huy:       { ten: 'Đã hủy',     lop: 'bad' },
};

export const LOAI_LICH = {
  kham_moi:  'Khám mới',
  tai_kham:  'Tái khám',
  dieu_tri:  'Điều trị',
  cap_cuu:   'Cấp cứu',
};

export const NGUON = {
  telesale:   'Telesale',
  pg:         'PG',
  vang_lai:   'Vãng lai',
  gioi_thieu: 'Giới thiệu',
  goi_lai:    'Khách gọi lại',
};

// Sáu hàng đợi chăm sóc. Mỗi hàng đợi là một PHÉP LỌC trên lịch hẹn, không
// phải một bảng dữ liệu riêng — nên số đếm ở thẻ và danh sách bên dưới không
// bao giờ lệch nhau được.
export const HANG_DOI = {
  nhac_hen: {
    ten: 'Nhắc lịch hẹn',
    mo_ta: 'Khách có hẹn trong 2 ngày tới, gọi nhắc trước',
    icon: 'ri-alarm-line',
  },
  khong_den: {
    ten: 'Hẹn không đến',
    mo_ta: 'Đã qua giờ hẹn mà khách không tới',
    icon: 'ri-user-unfollow-line',
  },
  chua_dung_dv: {
    ten: 'Đến nhưng chưa làm dịch vụ',
    mo_ta: 'Khách đã tới, khám xong nhưng chưa chốt dịch vụ nào',
    icon: 'ri-question-answer-line',
  },
  sau_dieu_tri: {
    ten: 'Sau điều trị',
    mo_ta: 'Hoàn tất điều trị 3–7 ngày trước, gọi hỏi thăm',
    icon: 'ri-heart-pulse-line',
  },
  sinh_nhat: {
    ten: 'Sinh nhật',
    mo_ta: 'Sinh nhật trong 7 ngày tới',
    icon: 'ri-cake-2-line',
  },
  khieu_nai: {
    ten: 'Phản hồi cần xử lý',
    mo_ta: 'Khách phàn nàn hoặc yêu cầu chưa được giải quyết',
    icon: 'ri-error-warning-line',
  },
};

// Chi nhánh lấy từ BRANCHES của hệ thống, không tự khai lại. Khai lại là tạo
// nguồn sự thật thứ hai về chi nhánh, rồi hai bên lệch nhau lúc nào không hay.
export const CHI_NHANH = Object.values(BRANCHES)
  .map((b) => ({ ma: b.id, ten: b.shortName }));

export const BAC_SI = [
  { ma: 'BS01', ten: 'BS. Trần Minh Quân', chuyen: 'Chỉnh nha' },
  { ma: 'BS02', ten: 'BS. Lê Thu Hà', chuyen: 'Implant' },
  { ma: 'BS03', ten: 'BS. Phạm Đức Anh', chuyen: 'Tổng quát' },
  { ma: 'BS04', ten: 'BS. Nguyễn Khánh Vy', chuyen: 'Nha chu' },
];

export const PHONG = ['Phòng 1', 'Phòng 2', 'Phòng 3', 'Phòng VIP'];

export const TELESALE = [
  { ma: 'TS-001', ten: 'Nguyễn Thu Hằng' },
  { ma: 'TS-002', ten: 'Trần Bảo Ngọc' },
  { ma: 'TS-003', ten: 'Lê Minh Thư' },
  { ma: 'TS-005', ten: 'Phạm Kiều Oanh' },
];

export const CHAM_SOC = [
  { ma: 'LT01', ten: 'Vũ Thanh Hà · lễ tân' },
  { ma: 'LT02', ten: 'Đỗ Kim Chi · lễ tân' },
  { ma: 'CS01', ten: 'Ngô Bích Trâm · CSKH' },
];

// Nhóm khách quyết định cách chăm và mức ưu tiên xếp lịch.
export const NHOM_KHACH = {
  moi:     { ten: 'Khách mới',     lop: 'warn' },
  thuong:  { ten: 'Khách thường',  lop: 'neutral' },
  than:    { ten: 'Khách thân thiết', lop: 'good' },
  vip:     { ten: 'Khách VIP',     lop: 'good' },
  can_giu: { ten: 'Cần giữ chân',  lop: 'bad' },
};

export const tenTelesale = (ma) => (TELESALE.find((x) => x.ma === ma) || {}).ten || ma || '—';
export const tenChamSoc = (ma) => (CHAM_SOC.find((x) => x.ma === ma) || {}).ten || ma || '—';

/* ── Dữ liệu dựng màn ────────────────────────────────────────────────── */

const ngayLech = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const luc = (ngay, hhmm) => `${ngay}T${hhmm}:00`;
const cong = (hhmm, phut) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + phut;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

let dem = 0;
const maLich = () => { dem += 1; return `LH-${String(dem).padStart(5, '0')}`; };

function lich(ngay, gio, phut, khach, cn, bs, phong, loai, tt, nguon, thua = {}) {
  return {
    id: maLich(),
    ma: `LH-${String(dem).padStart(5, '0')}`,
    khach,
    chi_nhanh: cn,
    ngay,
    bat_dau: luc(ngay, gio),
    ket_thuc: luc(ngay, cong(gio, phut)),
    gio,
    phut,
    bac_si: bs,
    phong,
    loai,
    trang_thai: tt,
    nguon,
    noi_dung: thua.noi_dung || '',
    ghi_chu: thua.ghi_chu || '',
    nguoi_chot: thua.nguoi_chot || 'LT01',
    den_luc: thua.den_luc || null,
    co_dich_vu: thua.co_dich_vu ?? (tt === 'hoan_tat'),
    ...thua,
  };
}

const k = (ten, dt, sinh, gioi, thua = {}) => ({
  ma: thua.ma || `KH${String(dt).slice(-5)}`,
  ten, dien_thoai: dt, ngay_sinh: sinh, gioi,
  khach_moi: thua.khach_moi ?? false,
  ...thua,
});

const HOM_NAY = ngayLech(0);
const MAI = ngayLech(1);
const KIA = ngayLech(2);

let LICH_HEN = [
  // ── Hôm nay ──
  lich(HOM_NAY, '08:00', 45, k('Nguyễn Thị Bích Ngọc', '0903112233', '1994-03-12', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'tai_kham', 'hoan_tat', 'telesale',
    { noi_dung: 'Siết mắc cài lần 4', den_luc: luc(HOM_NAY, '07:52'), co_dich_vu: true }),
  lich(HOM_NAY, '08:30', 60, k('Trần Văn Hùng', '0912445566', '1986-11-02', 'nam'),
    'pham-van-chieu', 'BS02', 'Phòng VIP', 'dieu_tri', 'dang_kham', 'gioi_thieu',
    { noi_dung: 'Cấy ghép Implant răng 36', den_luc: luc(HOM_NAY, '08:25') }),
  lich(HOM_NAY, '09:00', 30, k('Lê Thị Mai Anh', '0938778899', '2001-06-24', 'nu', { khach_moi: true }),
    'pham-van-chieu', 'BS03', 'Phòng 2', 'kham_moi', 'da_den', 'pg',
    { noi_dung: 'Khám tổng quát, tư vấn tẩy trắng', den_luc: luc(HOM_NAY, '08:58') }),
  lich(HOM_NAY, '09:30', 30, k('Phạm Quốc Đạt', '0977001122', '1999-01-30', 'nam'),
    'pham-van-chieu', 'BS03', 'Phòng 2', 'tai_kham', 'cho_den', 'telesale',
    { noi_dung: 'Kiểm tra sau nhổ răng khôn' }),
  lich(HOM_NAY, '10:00', 45, k('Vũ Hoàng Yến', '0908334455', '1992-09-08', 'nu'),
    'le-van-tho', 'BS04', 'Phòng 1', 'dieu_tri', 'cho_den', 'vang_lai',
    { noi_dung: 'Cạo vôi, điều trị viêm nướu' }),
  lich(HOM_NAY, '10:30', 30, k('Đặng Minh Tuấn', '0965223344', '1978-04-17', 'nam'),
    'le-van-tho', 'BS03', 'Phòng 3', 'kham_moi', 'cho_den', 'pg',
    { noi_dung: 'Tư vấn răng sứ thẩm mỹ' }),
  lich(HOM_NAY, '14:00', 60, k('Hoàng Thị Lan', '0919556677', '1989-12-01', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'dieu_tri', 'cho_den', 'telesale',
    { noi_dung: 'Gắn mắc cài hàm dưới' }),
  lich(HOM_NAY, '14:30', 30, k('Bùi Anh Khoa', '0902889900', '2005-08-19', 'nam'),
    'pham-van-chieu', 'BS03', 'Phòng 2', 'tai_kham', 'cho_den', 'goi_lai',
    { noi_dung: 'Tái khám định kỳ 6 tháng' }),
  lich(HOM_NAY, '15:00', 45, k('Trịnh Thu Trang', '0947118822', '1996-02-14', 'nu'),
    'le-van-tho', 'BS02', 'Phòng VIP', 'dieu_tri', 'cho_den', 'gioi_thieu',
    { noi_dung: 'Phục hình răng số 46' }),
  lich(HOM_NAY, '07:30', 30, k('Ngô Gia Bảo', '0933667788', '1991-07-07', 'nam'),
    'pham-van-chieu', 'BS04', 'Phòng 3', 'tai_kham', 'khong_den', 'telesale',
    { noi_dung: 'Tái khám nha chu', ghi_chu: 'Gọi 2 lần không nghe máy' }),
  lich(HOM_NAY, '11:00', 30, k('Dương Khánh Linh', '0987443322', '2000-05-21', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'kham_moi', 'huy', 'pg',
    { noi_dung: 'Tư vấn niềng răng', ghi_chu: 'Khách báo bận, xin dời tuần sau' }),
  lich(HOM_NAY, '13:00', 30, k('Lý Thanh Sơn', '0905998877', '1983-10-11', 'nam'),
    'le-van-tho', 'BS03', 'Phòng 3', 'kham_moi', 'da_den', 'vang_lai',
    { noi_dung: 'Đau răng hàm trên', den_luc: luc(HOM_NAY, '12:55'), co_dich_vu: false }),

  // ── Ngày mai và ngày kia · dùng cho hàng đợi nhắc hẹn ──
  lich(MAI, '08:00', 45, k('Nguyễn Hải Đăng', '0916334411', '1995-03-03', 'nam'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'dieu_tri', 'cho_den', 'telesale',
    { noi_dung: 'Siết mắc cài' }),
  lich(MAI, '09:00', 30, k('Phan Thị Kim Chi', '0978220033', '1988-06-30', 'nu'),
    'pham-van-chieu', 'BS04', 'Phòng 2', 'tai_kham', 'cho_den', 'gioi_thieu',
    { noi_dung: 'Kiểm tra sau cạo vôi' }),
  lich(MAI, '15:00', 60, k('Trương Văn Phúc', '0902114477', '1974-09-15', 'nam'),
    'le-van-tho', 'BS02', 'Phòng VIP', 'dieu_tri', 'cho_den', 'goi_lai',
    { noi_dung: 'Implant giai đoạn 2' }),
  lich(KIA, '10:00', 30, k('Đỗ Ngọc Hân', '0939887766', '2003-11-27', 'nu'),
    'pham-van-chieu', 'BS03', 'Phòng 3', 'kham_moi', 'cho_den', 'pg',
    { noi_dung: 'Khám và tư vấn tẩy trắng' }),

  // ── Buổi cũ của Nguyễn Thị Bích Ngọc · để thấy chuỗi Lần 1, 2, 3 ──
  //
  // Một khách điều trị dài như chỉnh nha đi rất nhiều buổi; số thứ tự chỉ có
  // nghĩa khi nhìn được cả chuỗi.
  lich(ngayLech(-84), '09:00', 60, k('Nguyễn Thị Bích Ngọc', '0903112233', '1994-03-12', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'kham_moi', 'hoan_tat', 'telesale',
    { noi_dung: 'Khám, chụp phim, lập kế hoạch chỉnh nha',
      den_luc: luc(ngayLech(-84), '08:54'), co_dich_vu: true }),
  lich(ngayLech(-56), '09:30', 90, k('Nguyễn Thị Bích Ngọc', '0903112233', '1994-03-12', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'dieu_tri', 'hoan_tat', 'telesale',
    { noi_dung: 'Gắn mắc cài hàm trên',
      den_luc: luc(ngayLech(-56), '09:28'), co_dich_vu: true }),
  lich(ngayLech(-28), '09:00', 45, k('Nguyễn Thị Bích Ngọc', '0903112233', '1994-03-12', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'tai_kham', 'khong_den', 'telesale',
    { noi_dung: 'Siết mắc cài lần 3', ghi_chu: 'Khách kẹt công việc, không báo trước' }),
  lich(ngayLech(-21), '14:00', 45, k('Nguyễn Thị Bích Ngọc', '0903112233', '1994-03-12', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'tai_kham', 'hoan_tat', 'telesale',
    { noi_dung: 'Siết mắc cài lần 3 · dời từ buổi trước',
      den_luc: luc(ngayLech(-21), '13:55'), co_dich_vu: true }),
  lich(ngayLech(28), '09:00', 45, k('Nguyễn Thị Bích Ngọc', '0903112233', '1994-03-12', 'nu'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'tai_kham', 'cho_den', 'telesale',
    { noi_dung: 'Siết mắc cài lần 5' }),

  // ── Đã qua · dùng cho hàng đợi hẹn không đến và sau điều trị ──
  lich(ngayLech(-1), '09:00', 30, k('Cao Thị Thuỳ Dương', '0908224466', '1997-01-09', 'nu'),
    'pham-van-chieu', 'BS03', 'Phòng 2', 'tai_kham', 'khong_den', 'telesale',
    { noi_dung: 'Tái khám sau trám răng' }),
  lich(ngayLech(-2), '14:00', 30, k('Hồ Minh Nhật', '0912778855', '1990-08-08', 'nam'),
    'le-van-tho', 'BS04', 'Phòng 1', 'kham_moi', 'khong_den', 'pg',
    { noi_dung: 'Tư vấn răng sứ' }),
  lich(ngayLech(-4), '10:00', 60, k('Đinh Thị Hồng Nhung', '0983556644', '1993-04-22', 'nu'),
    'pham-van-chieu', 'BS02', 'Phòng VIP', 'dieu_tri', 'hoan_tat', 'gioi_thieu',
    { noi_dung: 'Nhổ răng khôn hàm dưới', co_dich_vu: true }),
  lich(ngayLech(-5), '15:30', 45, k('Lâm Tuấn Kiệt', '0946113399', '1985-12-19', 'nam'),
    'pham-van-chieu', 'BS01', 'Phòng 1', 'dieu_tri', 'hoan_tat', 'telesale',
    { noi_dung: 'Trám răng thẩm mỹ 3 răng', co_dich_vu: true }),
  lich(ngayLech(-6), '08:30', 30, k('Nguyễn Thảo My', '0975664488', '1998-07-04', 'nu'),
    'le-van-tho', 'BS03', 'Phòng 3', 'kham_moi', 'hoan_tat', 'vang_lai',
    { noi_dung: 'Cạo vôi răng', co_dich_vu: true }),
  lich(ngayLech(-3), '11:00', 30, k('Võ Thành Trung', '0901447722', '1982-02-28', 'nam'),
    'pham-van-chieu', 'BS04', 'Phòng 2', 'kham_moi', 'hoan_tat', 'pg',
    { noi_dung: 'Khám tổng quát', co_dich_vu: false }),
];

/* Điều phối: mỗi khách có một bác sĩ, một telesale và một người chăm sóc.
 *
 * Khoá là số điện thoại, cùng khoá với hành trình. Để riêng khỏi lịch hẹn vì
 * đây là quan hệ dài hạn với KHÁCH, không phải thuộc tính của một buổi hẹn —
 * gắn nó vào lịch hẹn thì mỗi lần đặt lịch mới lại phải chọn lại từ đầu và
 * hai buổi của cùng một người có thể ra hai bác sĩ phụ trách khác nhau.
 */
let DIEU_PHOI = {
  '0903112233': { bac_si: 'BS01', telesale: 'TS-003', cham_soc: 'LT01', nhom: 'than' },
  '0912445566': { bac_si: 'BS02', telesale: 'TS-001', cham_soc: 'CS01', nhom: 'vip' },
  '0938778899': { bac_si: 'BS03', telesale: 'TS-005', cham_soc: '', nhom: 'moi' },
  '0933667788': { bac_si: 'BS04', telesale: 'TS-002', cham_soc: 'LT02', nhom: 'can_giu' },
};

// Phản hồi và khiếu nại. Cũng thuộc lễ tân vì khách thường nói ngay tại quầy.
let PHAN_HOI = [
  {
    id: 'PH-001', khach: k('Cao Thị Thuỳ Dương', '0908224466', '1997-01-09', 'nu'),
    chi_nhanh: 'pham-van-chieu', tao_luc: luc(ngayLech(-1), '16:20'),
    muc: 'cao', noi_dung: 'Trám răng bị cộm, ăn nhai vướng.',
    trang_thai: 'moi', nguoi_nhan: 'LT01',
  },
  {
    id: 'PH-002', khach: k('Lâm Tuấn Kiệt', '0946113399', '1985-12-19', 'nam'),
    chi_nhanh: 'pham-van-chieu', tao_luc: luc(ngayLech(-3), '10:05'),
    muc: 'thuong', noi_dung: 'Chờ quá lâu dù đã đặt hẹn trước.',
    trang_thai: 'dang_xu_ly', nguoi_nhan: 'LT01',
  },
  {
    id: 'PH-003', khach: k('Nguyễn Thảo My', '0975664488', '1998-07-04', 'nu'),
    chi_nhanh: 'le-van-tho', tao_luc: luc(ngayLech(-6), '09:40'),
    muc: 'thap', noi_dung: 'Đề nghị có thêm chỗ gửi xe máy.',
    trang_thai: 'moi', nguoi_nhan: 'LT02',
  },
];

/* ── Đọc ─────────────────────────────────────────────────────────────── */

const sao = (x) => JSON.parse(JSON.stringify(x));
const cho = (giaTri) => Promise.resolve(sao(giaTri));

export function layLichHen({ tu, den, chiNhanh, bacSi, trangThai, loai, tim } = {}) {
  let ds = LICH_HEN.slice();
  if (tu) ds = ds.filter((x) => x.ngay >= tu);
  if (den) ds = ds.filter((x) => x.ngay <= den);
  if (chiNhanh) ds = ds.filter((x) => x.chi_nhanh === chiNhanh);
  if (bacSi) ds = ds.filter((x) => x.bac_si === bacSi);
  if (trangThai) ds = ds.filter((x) => x.trang_thai === trangThai);
  if (loai) ds = ds.filter((x) => x.loai === loai);
  if (tim) {
    const q = tim.trim().toLowerCase();
    ds = ds.filter((x) => x.khach.ten.toLowerCase().includes(q)
      || x.khach.dien_thoai.includes(q)
      || x.ma.toLowerCase().includes(q));
  }
  ds.sort((a, b) => (a.bat_dau < b.bat_dau ? -1 : 1));
  return cho(ds);
}

export function layLichHomNay(chiNhanh) {
  return layLichHen({ tu: todayISO(), den: todayISO(), chiNhanh });
}

/* ── Ghi ─────────────────────────────────────────────────────────────── */

function timLich(id) {
  const x = LICH_HEN.find((l) => l.id === id);
  if (!x) throw new Error('Không tìm thấy lịch hẹn này.');
  return x;
}

export function datLich(du) {
  const thieu = ['ten', 'dien_thoai', 'ngay', 'gio', 'chi_nhanh', 'bac_si']
    .filter((f) => !String(du[f] || '').trim());
  if (thieu.length) throw new Error('Còn thiếu: ' + thieu.join(', '));

  const sdt = String(du.dien_thoai).replace(/\D/g, '');
  if (sdt.length < 9 || sdt.length > 11) throw new Error('Số điện thoại không hợp lệ.');

  // Một bác sĩ không thể có hai lịch cùng khung giờ. Chặn ở đây để lễ tân biết
  // ngay lúc đặt, thay vì phát hiện khi khách đã tới quầy.
  const phut = Number(du.phut) || 30;
  const dau = du.gio; const cuoi = cong(du.gio, phut);
  const dung = LICH_HEN.find((l) => l.bac_si === du.bac_si && l.ngay === du.ngay
    && !['huy', 'khong_den'].includes(l.trang_thai)
    && l.gio < cuoi && cong(l.gio, l.phut) > dau);
  if (dung) {
    throw new Error(`${tenBacSi(du.bac_si)} đã có lịch ${dung.gio} với ${dung.khach.ten}.`);
  }

  dem += 1;
  const moi = {
    id: `LH-${String(dem).padStart(5, '0')}`,
    ma: `LH-${String(dem).padStart(5, '0')}`,
    khach: k(du.ten.trim(), sdt, du.ngay_sinh || '', du.gioi || 'nu',
      { khach_moi: !!du.khach_moi }),
    chi_nhanh: du.chi_nhanh,
    ngay: du.ngay,
    bat_dau: luc(du.ngay, du.gio),
    ket_thuc: luc(du.ngay, cuoi),
    gio: du.gio,
    phut,
    bac_si: du.bac_si,
    phong: du.phong || PHONG[0],
    loai: du.loai || 'kham_moi',
    trang_thai: 'cho_den',
    nguon: du.nguon || 'vang_lai',
    noi_dung: (du.noi_dung || '').trim(),
    ghi_chu: (du.ghi_chu || '').trim(),
    nguoi_chot: du.nguoi_chot || 'LT01',
    den_luc: null,
    co_dich_vu: false,
  };
  LICH_HEN.push(moi);
  return cho(moi);
}

export function tiepDon(id) {
  const x = timLich(id);
  if (x.trang_thai === 'huy') throw new Error('Lịch này đã hủy, không tiếp đón được.');
  if (x.den_luc) throw new Error(`Khách đã được tiếp đón lúc ${x.den_luc.slice(11, 16)}.`);
  x.den_luc = new Date().toISOString();
  x.trang_thai = 'da_den';
  return cho(x);
}

export function doiTrangThai(id, trangThai, ghiChu) {
  if (!TRANG_THAI[trangThai]) throw new Error('Trạng thái không hợp lệ.');
  const x = timLich(id);
  if (trangThai === 'huy' && !String(ghiChu || '').trim()) {
    throw new Error('Phải ghi lý do hủy.');
  }
  x.trang_thai = trangThai;
  if (trangThai === 'hoan_tat') x.co_dich_vu = true;
  if (ghiChu) x.ghi_chu = ghiChu;
  return cho(x);
}

export function doiLich(id, ngay, gio) {
  const x = timLich(id);
  if (!ngay || !gio) throw new Error('Phải chọn ngày và giờ mới.');
  x.ngay = ngay; x.gio = gio;
  x.bat_dau = luc(ngay, gio);
  x.ket_thuc = luc(ngay, cong(gio, x.phut));
  x.trang_thai = 'cho_den';
  return cho(x);
}

export function xuLyPhanHoi(id, trangThai, ghiChu) {
  const x = PHAN_HOI.find((p) => p.id === id);
  if (!x) throw new Error('Không tìm thấy phản hồi này.');
  x.trang_thai = trangThai;
  if (ghiChu) x.xu_ly = ghiChu;
  return cho(x);
}

/* ── Hàng đợi chăm sóc ───────────────────────────────────────────────── */

// Một định nghĩa duy nhất cho mỗi hàng đợi. Thẻ đếm và bảng chi tiết cùng gọi
// hàm này, nên con số trên thẻ luôn bằng số dòng bên dưới.
export function layHangDoi(ma) {
  const nay = todayISO();
  const trong = (n) => ngayLech(n);
  let ds = [];

  if (ma === 'nhac_hen') {
    ds = LICH_HEN.filter((x) => x.trang_thai === 'cho_den'
      && x.ngay > nay && x.ngay <= trong(2));
  } else if (ma === 'khong_den') {
    ds = LICH_HEN.filter((x) => x.trang_thai === 'khong_den' && x.ngay >= trong(-7));
  } else if (ma === 'chua_dung_dv') {
    ds = LICH_HEN.filter((x) => ['da_den', 'hoan_tat'].includes(x.trang_thai)
      && !x.co_dich_vu);
  } else if (ma === 'sau_dieu_tri') {
    ds = LICH_HEN.filter((x) => x.trang_thai === 'hoan_tat'
      && x.ngay <= trong(-3) && x.ngay >= trong(-7));
  } else if (ma === 'sinh_nhat') {
    const trongTuan = new Set();
    for (let i = 0; i <= 7; i += 1) trongTuan.add(ngayLech(i).slice(5));
    const daCo = new Set();
    ds = LICH_HEN.filter((x) => {
      if (!x.khach.ngay_sinh) return false;
      if (!trongTuan.has(x.khach.ngay_sinh.slice(5))) return false;
      if (daCo.has(x.khach.dien_thoai)) return false;
      daCo.add(x.khach.dien_thoai);
      return true;
    });
  } else if (ma === 'khieu_nai') {
    return cho(PHAN_HOI.filter((p) => p.trang_thai !== 'xong')
      .map((p) => ({ ...p, la_phan_hoi: true })));
  }

  ds = ds.slice().sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  return cho(ds);
}

export async function demHangDoi() {
  const ma = Object.keys(HANG_DOI);
  const ds = await Promise.all(ma.map((m) => layHangDoi(m)));
  return Object.fromEntries(ma.map((m, i) => [m, ds[i].length]));
}

/* ── Hành trình khách hàng ────────────────────────────────────────────
 *
 * Hành trình gộp mọi dấu vết của MỘT khách theo trục thời gian: lead vào từ
 * đâu, telesale gọi mấy lần, chốt lịch lúc nào, tới hay không tới, làm dịch
 * vụ gì, ai chăm sau đó.
 *
 * Khoá là SỐ ĐIỆN THOẠI đã chuẩn hoá, không phải mã khách. Cùng một người có
 * thể mang mã khác nhau ở kho lead và ở hồ sơ phòng khám; số điện thoại là
 * thứ duy nhất hai bên cùng giữ.
 */

export const LOAI_SU_KIEN = {
  lead:      { ten: 'Lead vào hệ thống', icon: 'ri-inbox-archive-line',  nhom: 'marketing' },
  goi:       { ten: 'Telesale gọi',      icon: 'ri-phone-line',          nhom: 'marketing' },
  chot_lich: { ten: 'Chốt lịch hẹn',     icon: 'ri-calendar-check-line', nhom: 'marketing' },
  den:       { ten: 'Khách đến',         icon: 'ri-user-follow-line',    nhom: 'le_tan' },
  khong_den: { ten: 'Không đến',         icon: 'ri-user-unfollow-line',  nhom: 'le_tan' },
  huy:       { ten: 'Hủy lịch',          icon: 'ri-close-circle-line',   nhom: 'le_tan' },
  kham:      { ten: 'Khám và điều trị',  icon: 'ri-stethoscope-line',    nhom: 'chuyen_mon' },
  phan_hoi:  { ten: 'Phản hồi',          icon: 'ri-feedback-line',       nhom: 'le_tan' },
};

// Dấu vết TRƯỚC khi khách tới phòng khám. Chỗ này khi nối API sẽ đọc từ
// marketing.leads và marketing.call_logs; hình dạng dữ liệu giữ nguyên.
const TRUOC_KHI_TOI = {
  '0903112233': [
    { loai: 'lead', luc: '2024-06-10T09:12:00', boi: 'PG-014',
      chu: 'Lead từ booth EMart Gò Vấp', phu: 'Nguồn PG · quan tâm niềng răng' },
    { loai: 'goi', luc: '2024-06-11T14:30:00', boi: 'TS-003',
      chu: 'Gọi lần 1 · khách nghe máy', phu: 'Hẹn gọi lại cuối tuần' },
    { loai: 'goi', luc: '2024-06-15T10:05:00', boi: 'TS-003',
      chu: 'Gọi lần 2 · đồng ý tới khám', phu: '' },
    { loai: 'chot_lich', luc: '2024-06-15T10:20:00', boi: 'TS-003',
      chu: 'Chốt lịch 18/06 lúc 09:00', phu: 'BS. Trần Minh Quân' },
  ],
  '0912445566': [
    { loai: 'lead', luc: '2025-08-28T16:40:00', boi: 'LT01',
      chu: 'Khách được người quen giới thiệu', phu: 'Nguồn giới thiệu' },
    { loai: 'goi', luc: '2025-09-02T09:15:00', boi: 'TS-001',
      chu: 'Gọi tư vấn Implant', phu: 'Khách hỏi chi phí và thời gian điều trị' },
    { loai: 'chot_lich', luc: '2025-09-02T09:40:00', boi: 'TS-001',
      chu: 'Chốt lịch 04/09', phu: 'BS. Lê Thu Hà' },
  ],
  '0938778899': [
    { loai: 'lead', luc: '2026-08-20T11:00:00', boi: 'PG-021',
      chu: 'Lead từ tuyến đường Quang Trung', phu: 'Nguồn PG · quan tâm tẩy trắng' },
    { loai: 'goi', luc: '2026-08-22T15:20:00', boi: 'TS-005',
      chu: 'Gọi lần 1 · máy bận', phu: '' },
    { loai: 'goi', luc: '2026-08-25T09:50:00', boi: 'TS-005',
      chu: 'Gọi lần 2 · đồng ý tới khám', phu: '' },
    { loai: 'chot_lich', luc: '2026-08-25T10:00:00', boi: 'TS-005',
      chu: 'Chốt lịch hôm nay 09:00', phu: 'BS. Phạm Đức Anh' },
  ],
  '0933667788': [
    { loai: 'lead', luc: '2026-07-02T08:30:00', boi: 'PG-009',
      chu: 'Lead từ booth Galaxy', phu: 'Nguồn PG' },
    { loai: 'goi', luc: '2026-07-04T10:10:00', boi: 'TS-002',
      chu: 'Gọi lần 1 · đồng ý tới khám', phu: '' },
  ],
};

/* Đánh số lần khám của một khách.
 *
 * Đếm theo thứ tự THỜI GIAN và chỉ đếm buổi khách thật sự tới, vì "lần 3" mà
 * tính cả hai buổi khách không đến thì con số đó không nói lên điều gì về
 * tiến trình điều trị. Buổi bị hủy hoặc không đến vẫn hiện trong hồ sơ, nhưng
 * mang nhãn riêng thay vì một số thứ tự.
 */
export function danhSoLanKham(dsLich) {
  const theoNgay = dsLich.slice().sort((a, b) =>
    (`${a.ngay}${a.gio}` < `${b.ngay}${b.gio}` ? -1 : 1));
  let n = 0;
  const so = {};
  theoNgay.forEach((x) => {
    const daToi = !!x.den_luc || ['da_den', 'dang_kham', 'hoan_tat'].includes(x.trang_thai);
    if (daToi) { n += 1; so[x.id] = n; }
  });
  return { so, tong: n };
}

export function layDieuPhoi(dienThoai) {
  return DIEU_PHOI[dienThoai] || { bac_si: '', telesale: '', cham_soc: '', nhom: 'thuong' };
}

export function doiDieuPhoi(dienThoai, du) {
  const co = LICH_HEN.some((x) => x.khach.dien_thoai === dienThoai);
  if (!co) throw new Error('Không tìm thấy khách này.');
  const cu = layDieuPhoi(dienThoai);
  const moi = {
    bac_si: du.bac_si ?? cu.bac_si,
    telesale: du.telesale ?? cu.telesale,
    cham_soc: du.cham_soc ?? cu.cham_soc,
    nhom: du.nhom ?? cu.nhom,
  };
  DIEU_PHOI[dienThoai] = moi;

  // Đổi bác sĩ phụ trách thì các buổi CHƯA diễn ra đi theo. Buổi đã xong giữ
  // nguyên bác sĩ đã làm — sửa lại là viết lại lịch sử.
  if (du.bac_si && du.bac_si !== cu.bac_si) {
    LICH_HEN.filter((x) => x.khach.dien_thoai === dienThoai
      && x.trang_thai === 'cho_den').forEach((x) => { x.bac_si = du.bac_si; });
  }
  return cho(moi);
}

/** Chuyển một buổi hẹn sang bác sĩ khác, không đụng tới các buổi còn lại. */
export function doiBacSiLich(id, bacSi) {
  const x = LICH_HEN.find((l) => l.id === id);
  if (!x) throw new Error('Không tìm thấy lịch hẹn này.');
  if (!BAC_SI.some((b) => b.ma === bacSi)) throw new Error('Bác sĩ không hợp lệ.');
  if (['hoan_tat', 'dang_kham'].includes(x.trang_thai)) {
    throw new Error('Buổi đã khám xong hoặc đang khám thì không đổi bác sĩ được.');
  }
  const dung = LICH_HEN.find((l) => l.bac_si === bacSi && l.ngay === x.ngay && l.id !== x.id
    && !['huy', 'khong_den'].includes(l.trang_thai)
    && l.gio < cong(x.gio, x.phut) && cong(l.gio, l.phut) > x.gio);
  if (dung) throw new Error(`${tenBacSi(bacSi)} đã có lịch ${dung.gio} với ${dung.khach.ten}.`);
  x.bac_si = bacSi;
  return cho(x);
}

/** Danh sách khách có mặt trong lịch hẹn, kèm số liệu tóm tắt hành trình. */
export function layDanhSachKhach({ tim, chiNhanh, nguon } = {}) {
  const theoSdt = new Map();
  LICH_HEN.forEach((x) => {
    const sdt = x.khach.dien_thoai;
    if (!theoSdt.has(sdt)) {
      theoSdt.set(sdt, { khach: x.khach, chi_nhanh: x.chi_nhanh, nguon: x.nguon, lich: [] });
    }
    theoSdt.get(sdt).lich.push(x);
  });

  let ds = [...theoSdt.values()].map((k) => {
    const den = k.lich.filter((x) => x.den_luc).length;
    const hen = k.lich.filter((x) => x.trang_thai !== 'huy').length;
    return {
      ...k,
      so_lich: k.lich.length,
      so_lan_den: den,
      so_khong_den: k.lich.filter((x) => x.trang_thai === 'khong_den').length,
      ty_le_den: hen ? Math.round((den / hen) * 100) : 0,
      lich_gan_nhat: k.lich.map((x) => x.ngay).sort().pop(),
      truoc_khi_toi: (TRUOC_KHI_TOI[k.khach.dien_thoai] || []).length,
      dieu_phoi: layDieuPhoi(k.khach.dien_thoai),
      lan_kham: danhSoLanKham(k.lich).tong,
    };
  });

  if (chiNhanh) ds = ds.filter((k) => k.chi_nhanh === chiNhanh);
  if (nguon) ds = ds.filter((k) => k.nguon === nguon);
  if (tim) {
    const q = tim.trim().toLowerCase();
    ds = ds.filter((k) => k.khach.ten.toLowerCase().includes(q)
      || k.khach.dien_thoai.includes(q));
  }
  ds.sort((a, b) => (a.lich_gan_nhat < b.lich_gan_nhat ? 1 : -1));
  return cho(ds);
}

/** Toàn bộ hành trình của một khách, sắp mới nhất lên trước. */
export function layHanhTrinh(dienThoai) {
  const lich = LICH_HEN.filter((x) => x.khach.dien_thoai === dienThoai);
  if (!lich.length) throw new Error('Không tìm thấy khách này.');

  const sk = (TRUOC_KHI_TOI[dienThoai] || []).map((e) => ({ ...e }));

  lich.forEach((x) => {
    const moc = `${x.ngay}T${x.gio}:00`;
    if (x.den_luc) {
      sk.push({ loai: 'den', luc: x.den_luc, boi: x.nguoi_chot,
        chu: `Tới phòng khám · hẹn lúc ${x.gio}`,
        phu: `${tenBacSi(x.bac_si)} · ${x.phong} · ${tenChiNhanh(x.chi_nhanh)}`, lich_id: x.id });
    }
    if (x.trang_thai === 'khong_den') {
      sk.push({ loai: 'khong_den', luc: moc, boi: x.nguoi_chot,
        chu: `Không tới lịch hẹn ${x.gio}`, phu: x.ghi_chu || '', lich_id: x.id });
    }
    if (x.trang_thai === 'huy') {
      sk.push({ loai: 'huy', luc: moc, boi: x.nguoi_chot,
        chu: `Hủy lịch hẹn ${x.gio}`, phu: x.ghi_chu || '', lich_id: x.id });
    }
    if (x.trang_thai === 'hoan_tat') {
      sk.push({ loai: 'kham', luc: moc, boi: x.bac_si,
        chu: x.noi_dung || 'Khám và điều trị',
        phu: `${tenBacSi(x.bac_si)} · ${tenChiNhanh(x.chi_nhanh)}`, lich_id: x.id });
    }
    if (x.trang_thai === 'cho_den' && x.ngay >= todayISO()) {
      sk.push({ loai: 'chot_lich', luc: moc, boi: x.nguoi_chot,
        chu: `Lịch hẹn sắp tới ${x.gio}`,
        phu: `${tenBacSi(x.bac_si)} · ${x.phong}`, lich_id: x.id, sap_toi: true });
    }
  });

  PHAN_HOI.filter((p) => p.khach.dien_thoai === dienThoai).forEach((p) => {
    sk.push({ loai: 'phan_hoi', luc: p.tao_luc, boi: p.nguoi_nhan, chu: p.noi_dung,
      phu: `Mức ${p.muc} · ${p.trang_thai === 'xong' ? 'đã xử lý' : 'chưa xử lý'}` });
  });

  const danhSo = danhSoLanKham(lich);
  sk.sort((a, b) => (a.luc < b.luc ? 1 : -1));
  return cho({
    khach: lich[0].khach,
    chi_nhanh: lich[0].chi_nhanh,
    su_kien: sk,
    lich: lich.slice().sort((a, b) => (`${a.ngay}${a.gio}` < `${b.ngay}${b.gio}` ? 1 : -1)),
    dieu_phoi: layDieuPhoi(dienThoai),
    so_lan: danhSo.so,
    tong_lan: danhSo.tong,
  });
}

/* ── Báo cáo tháng ────────────────────────────────────────────────────
 *
 * Mọi con số dưới đây tính từ CÙNG một tập lịch hẹn đã lọc, nên tổng của các
 * bảng con luôn bằng tổng chung. Tính mỗi bảng bằng một phép lọc riêng là
 * cách chắc chắn nhất để chúng lệch nhau.
 */

export function baoCaoThang(kyCode, chiNhanh) {
  const ky = kyCode || todayISO().slice(0, 7);
  let ds = LICH_HEN.filter((x) => x.ngay.slice(0, 7) === ky);
  if (chiNhanh) ds = ds.filter((x) => x.chi_nhanh === chiNhanh);

  const daDen = (x) => !!x.den_luc || ['da_den', 'dang_kham', 'hoan_tat'].includes(x.trang_thai);

  const demTheo = (lay, danhMuc) => {
    const d = {};
    ds.forEach((x) => { const k = lay(x); d[k] = (d[k] || 0) + 1; });
    return Object.entries(danhMuc).map(([ma, v]) => ({
      ma, ten: typeof v === 'string' ? v : v.ten, so: d[ma] || 0,
    })).filter((x) => x.so > 0).sort((a, b) => b.so - a.so);
  };

  const hen = ds.filter((x) => x.trang_thai !== 'huy').length;
  const den = ds.filter(daDen).length;
  const khongDen = ds.filter((x) => x.trang_thai === 'khong_den').length;

  const theoNgay = {};
  ds.forEach((x) => { theoNgay[x.ngay] = (theoNgay[x.ngay] || 0) + 1; });

  return cho({
    ky, tong: ds.length, hen, den, khong_den: khongDen,
    ty_le_den: hen ? Math.round((den / hen) * 100) : 0,
    ty_le_khong_den: hen ? Math.round((khongDen / hen) * 100) : 0,
    so_khach: new Set(ds.map((x) => x.khach.dien_thoai)).size,
    khach_moi: new Set(ds.filter((x) => x.khach.khach_moi).map((x) => x.khach.dien_thoai)).size,
    theo_trang_thai: demTheo((x) => x.trang_thai, TRANG_THAI),
    theo_nguon: demTheo((x) => x.nguon, NGUON),
    theo_loai: demTheo((x) => x.loai, LOAI_LICH),
    theo_chi_nhanh: CHI_NHANH.map((c) => {
      const cua = ds.filter((x) => x.chi_nhanh === c.ma);
      const h = cua.filter((x) => x.trang_thai !== 'huy').length;
      const d = cua.filter(daDen).length;
      return { ma: c.ma, ten: c.ten, so: cua.length, den: d,
        khong_den: cua.filter((x) => x.trang_thai === 'khong_den').length,
        ty_le_den: h ? Math.round((d / h) * 100) : 0,
        so_khach: new Set(cua.map((x) => x.khach.dien_thoai)).size };
    }).filter((c) => c.so > 0),
    theo_bac_si: BAC_SI.map((b) => {
      const cua = ds.filter((x) => x.bac_si === b.ma);
      return { ma: b.ma, ten: b.ten, chuyen: b.chuyen, so: cua.length,
        hoan_tat: cua.filter((x) => x.trang_thai === 'hoan_tat').length };
    }).filter((b) => b.so > 0).sort((a, b) => b.so - a.so),
    theo_ngay: Object.entries(theoNgay).map(([ngay, so]) => ({ ngay, so }))
      .sort((a, b) => (a.ngay < b.ngay ? -1 : 1)),
  });
}

export function xuatCsvBaoCao(bc) {
  const d = [['Báo cáo lễ tân', bc.ky], [],
    ['Tổng lịch hẹn', bc.tong], ['Số khách', bc.so_khach], ['Khách mới', bc.khach_moi],
    ['Đã đến', bc.den], ['Không đến', bc.khong_den],
    ['Tỷ lệ đến (%)', bc.ty_le_den], ['Tỷ lệ không đến (%)', bc.ty_le_khong_den], [],
    ['Theo chi nhánh', 'Lịch hẹn', 'Số khách', 'Đã đến', 'Không đến', 'Tỷ lệ đến (%)']];
  bc.theo_chi_nhanh.forEach((c) => d.push([c.ten, c.so, c.so_khach, c.den, c.khong_den, c.ty_le_den]));
  d.push([], ['Theo nguồn khách', 'Lịch hẹn']);
  bc.theo_nguon.forEach((n) => d.push([n.ten, n.so]));
  d.push([], ['Theo bác sĩ', 'Lịch hẹn', 'Hoàn tất']);
  bc.theo_bac_si.forEach((b) => d.push([b.ten, b.so, b.hoan_tat]));
  return d.map((r) => r.map((o) => '"' + String(o == null ? '' : o).replace(/"/g, '""') + '"').join(',')).join('\n');
}

/* ── Tiện ích dùng chung cho màn hình ────────────────────────────────── */

export const tenBacSi = (ma) => (BAC_SI.find((b) => b.ma === ma) || {}).ten || ma || '—';
export const tenChiNhanh = (ma) => (CHI_NHANH.find((c) => c.ma === ma) || {}).ten || ma || '—';

export function xuatCsvLichHen(ds) {
  const dong = [['Mã', 'Ngày', 'Giờ', 'Khách hàng', 'Điện thoại', 'Chi nhánh',
    'Bác sĩ', 'Phòng', 'Loại', 'Trạng thái', 'Nguồn', 'Nội dung', 'Giờ đến']];
  ds.forEach((x) => dong.push([
    x.ma, x.ngay, x.gio, x.khach.ten, x.khach.dien_thoai,
    tenChiNhanh(x.chi_nhanh), tenBacSi(x.bac_si), x.phong,
    LOAI_LICH[x.loai] || x.loai, (TRANG_THAI[x.trang_thai] || {}).ten || x.trang_thai,
    NGUON[x.nguon] || x.nguon, x.noi_dung, x.den_luc ? x.den_luc.slice(11, 16) : '',
  ]));
  return dong.map((r) => r.map((o) => `"${String(o ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}
