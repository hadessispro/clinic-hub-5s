/* Sổ bệnh án điện tử · lớp dữ liệu.
 *
 * Giai đoạn dựng giao diện: dữ liệu nằm trong bộ nhớ, hình dạng hàm đúng như
 * bản nối API sẽ có.
 *
 * BỐN RÀNG BUỘC của bệnh án điện tử được phản ánh ngay từ lớp này, để giao
 * diện được dựng đúng ngay từ đầu thay vì sửa lại sau:
 *
 *   1. Chỉ ghi thêm. Không có hàm nào sửa đè hay xoá một bản ghi lâm sàng.
 *      Đính chính là ghi bản mới, trỏ về bản cũ qua `sua_cho`.
 *   2. Ký số. Bản ghi đã ký thì `da_ky` bật, và mọi hàm ghi từ chối đụng vào.
 *   3. Nhật ký đọc. `moHoSo()` ghi vết mỗi lượt mở, không chỉ lượt sửa.
 *   4. Lưu trữ lâu. Không có hàm xoá, kể cả xoá mềm.
 *
 * SƠ ĐỒ RĂNG là nguồn dữ liệu duy nhất về tình trạng răng. Sơ đồ 2D và cảnh
 * 3D đều đọc từ đây, không bên nào giữ bản sao riêng.
 */

import { BRANCHES } from '../branch.js';

/* ── Ký hiệu răng ─────────────────────────────────────────────────────
 *
 * Hai chữ số: số đầu là phần hàm (1 trên phải, 2 trên trái, 3 dưới trái,
 * 4 dưới phải), số sau là vị trí tính từ đường giữa ra. Răng sữa dùng dải
 * 5–8 theo cùng quy tắc.
 */

export const PHAN_HAM = {
  1: { ten: 'Trên phải', ham: 'tren', ben: 'phai' },
  2: { ten: 'Trên trái', ham: 'tren', ben: 'trai' },
  3: { ten: 'Dưới trái', ham: 'duoi', ben: 'trai' },
  4: { ten: 'Dưới phải', ham: 'duoi', ben: 'phai' },
};

// Loại răng theo vị trí. Quyết định hình vẽ và số mặt có mặt nhai.
export const LOAI_RANG = {
  1: 'cua_giua', 2: 'cua_ben', 3: 'nanh',
  4: 'ham_nho', 5: 'ham_nho', 6: 'ham_lon', 7: 'ham_lon', 8: 'khon',
};
export const TEN_LOAI = {
  cua_giua: 'Răng cửa giữa', cua_ben: 'Răng cửa bên', nanh: 'Răng nanh',
  ham_nho: 'Răng hàm nhỏ', ham_lon: 'Răng hàm lớn', khon: 'Răng khôn',
};

/* Năm mặt của một răng.
 *
 * "Gần" và "xa" tính theo đường giữa hàm, nên phía nào là gần thì phụ thuộc
 * răng nằm bên trái hay bên phải — sơ đồ phải lật theo, nếu không bác sĩ đọc
 * ngược mặt tổn thương. */
export const MAT_RANG = {
  gan:   { ten: 'Gần',   viet_tat: 'G' },
  xa:    { ten: 'Xa',    viet_tat: 'X' },
  ngoai: { ten: 'Ngoài', viet_tat: 'N' },
  trong: { ten: 'Trong', viet_tat: 'T' },
  nhai:  { ten: 'Nhai',  viet_tat: 'C' },
};

export const TRANG_THAI_RANG = {
  binh_thuong: { ten: 'Bình thường', mau: 'lanh',  to: false },
  sau:         { ten: 'Sâu răng',    mau: 'sau',   to: true },
  tram:        { ten: 'Đã trám',     mau: 'tram',  to: true },
  boc_su:      { ten: 'Bọc sứ',      mau: 'phuc',  to: true },
  noi_nha:     { ten: 'Nội nha',     mau: 'noi',   to: true },
  implant:     { ten: 'Implant',     mau: 'phuc',  to: true },
  chi_dinh_nho:{ ten: 'Chỉ định nhổ',mau: 'sau',   to: true },
  mat:         { ten: 'Mất răng',    mau: 'mat',   to: false },
  chua_moc:    { ten: 'Chưa mọc',    mau: 'mat',   to: false },
};

/** Danh sách răng vĩnh viễn của một phần hàm, thứ tự từ trong ra ngoài. */
export function rangCuaPhanHam(phan) {
  const ds = [];
  for (let i = 8; i >= 1; i -= 1) ds.push(`${phan}${i}`);
  return ds; // 18 17 16 … 11
}

export const SO_DO_HAM = {
  tren: [...rangCuaPhanHam(1), ...rangCuaPhanHam(2).reverse()],
  duoi: [...rangCuaPhanHam(4), ...rangCuaPhanHam(3).reverse()],
};

export const loaiCuaRang = (ma) => LOAI_RANG[Number(String(ma)[1])];
export const phanHamCuaRang = (ma) => Number(String(ma)[0]);
export const coMatNhai = (ma) => ['ham_nho', 'ham_lon', 'khon'].includes(loaiCuaRang(ma));

/* ── Danh mục lâm sàng ────────────────────────────────────────────────── */

export const LOAI_ANH = {
  trong_mieng: 'Ảnh trong miệng',
  ngoai_mat:   'Ảnh ngoài mặt',
  quanh_chop:  'Phim quanh chóp',
  toan_canh:   'Phim toàn cảnh',
  ct:          'CT Cone Beam',
};

/* Chỉ số nha chu.
 *
 * Bốn chỉ số này là phần khám mà bệnh án nha khoa nào cũng phải có, và là thứ
 * quyết định có làm được thủ thuật hay không: nướu đang viêm chảy máu thì
 * không đặt implant, không lấy dấu phục hình.
 */
export const CHI_SO_NHA_CHU = {
  mang_bam:   { ten: 'Chỉ số mảng bám', don_vi: '%', tot: 20 },
  chay_mau:   { ten: 'Chảy máu nướu', don_vi: '%', tot: 10 },
  tui_sau:    { ten: 'Túi nha chu sâu nhất', don_vi: 'mm', tot: 3 },
  lung_rang:  { ten: 'Độ lung lay tối đa', don_vi: 'độ', tot: 0 },
};

/* Sinh hiệu.
 *
 * Không phải hình thức: thuốc tê nha khoa hầu hết có adrenaline gây co mạch,
 * nên huyết áp trước thủ thuật là thông tin bắt buộc với khách cao huyết áp.
 */
export const SINH_HIEU = {
  huyet_ap:  { ten: 'Huyết áp', don_vi: 'mmHg', mau: '120/80' },
  mach:      { ten: 'Mạch', don_vi: 'lần/phút', mau: '78' },
  duong_huyet: { ten: 'Đường huyết', don_vi: 'mmol/L', mau: '5.4' },
};

export const LOAI_THU_THUAT = {
  kham:        'Khám và tư vấn',
  cao_voi:     'Cạo vôi, đánh bóng',
  tram:        'Trám răng',
  noi_nha:     'Điều trị tuỷ',
  nho_rang:    'Nhổ răng',
  phuc_hinh:   'Phục hình, bọc sứ',
  implant:     'Cấy ghép Implant',
  chinh_nha:   'Chỉnh nha',
  nha_chu:     'Điều trị nha chu',
  tay_trang:   'Tẩy trắng',
};

export const GIAI_DOAN = {
  cap_cuu:  'Giai đoạn cấp cứu · giảm đau',
  on_dinh:  'Giai đoạn ổn định · kiểm soát bệnh',
  phuc_hoi: 'Giai đoạn phục hồi chức năng',
  tham_my:  'Giai đoạn thẩm mỹ',
  duy_tri:  'Giai đoạn duy trì · tái khám định kỳ',
};

export const TRANG_THAI_KE_HOACH = {
  cho_duyet:  { ten: 'Chờ khách đồng ý', lop: 'warn' },
  dong_y:     { ten: 'Khách đã đồng ý', lop: 'good' },
  dang_lam:   { ten: 'Đang thực hiện', lop: 'warn' },
  xong:       { ten: 'Đã hoàn tất', lop: 'good' },
  tu_choi:    { ten: 'Khách từ chối', lop: 'bad' },
};

export const MUC_CANH_BAO = {
  di_ung:     { ten: 'Dị ứng',        muc: 'cao' },
  benh_nen:   { ten: 'Bệnh nền',      muc: 'cao' },
  thuoc:      { ten: 'Thuốc đang dùng', muc: 'vua' },
  thai_ky:    { ten: 'Thai kỳ',       muc: 'cao' },
  luu_y:      { ten: 'Lưu ý khác',    muc: 'thap' },
};

export const CHI_NHANH = Object.values(BRANCHES).map((b) => ({ ma: b.id, ten: b.shortName }));

/* ── Dữ liệu dựng màn ─────────────────────────────────────────────────── */

const ngayLech = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Sơ đồ răng mặc định: mọi răng bình thường, răng khôn để chưa mọc.
function soDoTrang() {
  const kq = {};
  [...SO_DO_HAM.tren, ...SO_DO_HAM.duoi].forEach((ma) => {
    kq[ma] = {
      ma,
      trang_thai: String(ma)[1] === '8' ? 'chua_moc' : 'binh_thuong',
      mat: {},
      ghi_chu: '',
    };
  });
  return kq;
}

function datRang(soDo, ma, trangThai, mat = {}, ghiChu = '') {
  soDo[ma] = { ma, trang_thai: trangThai, mat, ghi_chu: ghiChu };
}

const soDo1 = soDoTrang();
datRang(soDo1, '16', 'tram', { nhai: 'tram', gan: 'tram' }, 'Trám composite 03/2025');
datRang(soDo1, '26', 'sau', { nhai: 'sau', xa: 'sau' }, 'Sâu ngà sâu, sát tuỷ');
datRang(soDo1, '36', 'noi_nha', { nhai: 'tram' }, 'Điều trị tuỷ xong, chờ bọc sứ');
datRang(soDo1, '28', 'mat', {}, 'Nhổ 2024');
datRang(soDo1, '48', 'chi_dinh_nho', {}, 'Mọc lệch 45 độ, chèn răng 47');
datRang(soDo1, '11', 'sau', { ngoai: 'sau' }, 'Sâu mặt ngoài, thẩm mỹ');

const soDo2 = soDoTrang();
datRang(soDo2, '46', 'implant', {}, 'Implant đặt 11/2025, đã tích hợp');
datRang(soDo2, '45', 'boc_su', {}, 'Mão sứ zirconia');
datRang(soDo2, '24', 'sau', { gan: 'sau' }, '');
datRang(soDo2, '18', 'mat', {}, '');
datRang(soDo2, '38', 'mat', {}, '');

const soDo3 = soDoTrang();
datRang(soDo3, '21', 'sau', { ngoai: 'sau', gan: 'sau' }, 'Sâu men lan rộng');
datRang(soDo3, '22', 'sau', { ngoai: 'sau' }, '');
datRang(soDo3, '37', 'tram', { nhai: 'tram' }, '');

let HO_SO = [
  {
    id: 'BN-00001', ma: 'BN-00001',
    ten: 'Nguyễn Thị Bích Ngọc', dien_thoai: '0903112233',
    ngay_sinh: '1994-03-12', gioi: 'nu',
    dia_chi: '128 Quang Trung, Gò Vấp, TP.HCM',
    nghe_nghiep: 'Nhân viên văn phòng',
    cccd: '079194******',
    bhyt: '',
    nguoi_lien_he: { ten: 'Nguyễn Văn Thành', quan_he: 'Chồng', dien_thoai: '0908227744' },
    chi_nhanh: 'pham-van-chieu',
    bac_si_chinh: 'BS01',
    tao_luc: '2024-06-18',
    nguon: 'Telesale · booth EMart Gò Vấp',
    thoi_quen: 'Chải răng 2 lần/ngày, không dùng chỉ nha khoa. Không hút thuốc.',
    canh_bao: [
      { loai: 'di_ung', noi_dung: 'Dị ứng Penicillin — nổi mề đay toàn thân' },
      { loai: 'benh_nen', noi_dung: 'Cao huyết áp, đang dùng Amlodipine 5mg' },
    ],
    tien_su: 'Chỉnh nha mắc cài kim loại từ 06/2024. Không hút thuốc.',
    so_do_rang: soDo1,
  },
  {
    id: 'BN-00002', ma: 'BN-00002',
    ten: 'Trần Văn Hùng', dien_thoai: '0912445566',
    ngay_sinh: '1986-11-02', gioi: 'nam',
    dia_chi: '45 Lê Văn Thọ, Gò Vấp, TP.HCM',
    nghe_nghiep: 'Kinh doanh tự do',
    cccd: '079186******',
    bhyt: 'DN4790123456789',
    nguoi_lien_he: { ten: 'Trần Thị Mai', quan_he: 'Vợ', dien_thoai: '0918665533' },
    chi_nhanh: 'pham-van-chieu',
    bac_si_chinh: 'BS02',
    tao_luc: '2025-09-04',
    nguon: 'Người quen giới thiệu',
    thoi_quen: 'Hút thuốc 10 điếu/ngày. Chải răng 1 lần/ngày.',
    canh_bao: [
      { loai: 'benh_nen', noi_dung: 'Đái tháo đường type 2, HbA1c 7.1%' },
      { loai: 'thuoc', noi_dung: 'Đang dùng Metformin 850mg' },
    ],
    tien_su: 'Mất răng 46 do sâu vỡ lớn. Hút thuốc 10 điếu/ngày.',
    so_do_rang: soDo2,
  },
  {
    id: 'BN-00003', ma: 'BN-00003',
    ten: 'Lê Thị Mai Anh', dien_thoai: '0938778899',
    ngay_sinh: '2001-06-24', gioi: 'nu',
    dia_chi: '90 Phạm Văn Chiêu, Gò Vấp, TP.HCM',
    nghe_nghiep: 'Sinh viên',
    cccd: '079201******',
    bhyt: 'SV4790987654321',
    nguoi_lien_he: { ten: 'Lê Văn Bình', quan_he: 'Cha', dien_thoai: '0903447788' },
    chi_nhanh: 'le-van-tho',
    bac_si_chinh: 'BS03',
    tao_luc: ngayLech(0),
    nguon: 'PG · tuyến đường Quang Trung',
    thoi_quen: 'Chải răng 2 lần/ngày. Uống trà sữa hằng ngày.',
    canh_bao: [],
    tien_su: 'Khách mới, chưa từng điều trị nha khoa.',
    so_do_rang: soDo3,
  },
];

/* Lượt khám.
 *
 * Một bệnh án nha khoa không dừng ở "khám gì, chẩn đoán gì, làm gì". Những
 * phần dưới đây là thứ buổi sau bác sĩ khác cần đọc để tiếp tục được:
 *
 *   Sinh hiệu    huyết áp trước thủ thuật, vì thuốc tê nha khoa hầu hết có
 *                adrenaline gây co mạch.
 *   Nha chu      bốn chỉ số quyết định có làm được thủ thuật hay không.
 *   Thuốc tê     loại và số ống đã dùng, để buổi sau biết ngưỡng của khách.
 *   Vật tư       trừ kho và đối chiếu chi phí.
 *   Kế hoạch     chia giai đoạn, gắn với răng và chi phí, có trạng thái đồng ý.
 *
 * Mỗi lượt là một bản ghi riêng, ký riêng, không sửa đè.
 */
let LUOT_KHAM = [
  {
    id: 'LK-0001', ho_so: 'BN-00001', ngay: ngayLech(0), gio: '08:00',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS01', phu_ta: 'PT-02', phong: 'Phòng 1',
    ly_do: 'Đau âm ỉ răng hàm trên trái khi ăn ngọt, kéo dài 1 tuần',
    sinh_hieu: { huyet_ap: '138/86', mach: '82', duong_huyet: '' },
    kham_ngoai_mat: 'Mặt cân đối. Không sưng, không hạch. Khớp thái dương hàm '
      + 'không tiếng kêu, há miệng 42mm.',
    kham_trong_mieng: 'Răng 26 lỗ sâu mặt nhai lan mặt xa, đáy ngà mềm, thăm dò đau nhói, '
      + 'gõ dọc âm tính, thử lạnh đau nhói kéo dài dưới 10 giây. Răng 11 đốm trắng đục '
      + 'mặt ngoài 1/3 cổ răng. Niêm mạc má, lưỡi, sàn miệng bình thường.',
    nha_chu: { mang_bam: 32, chay_mau: 14, tui_sau: 3, lung_rang: 0 },
    can_lam_sang: [
      { loai: 'quanh_chop', ket_qua: 'Răng 26: thấu quang mặt nhai lan tới 1/2 bề dày ngà, '
        + 'chưa thông buồng tuỷ. Vùng quanh chóp bình thường.' },
    ],
    chan_doan: 'Sâu ngà sâu răng 26, viêm tuỷ có hồi phục',
    ma_benh: 'K02.1',
    chan_doan_them: 'Sâu men răng 11 · Viêm nướu do mảng bám',
    rang_lien_quan: ['26', '11'],
    thu_thuat: [
      { loai: 'tram', ten: 'Trám composite thẩm mỹ', rang: '11', mat: 'ngoài' },
    ],
    thuoc_te: { ten: 'Lidocaine 2% + Adrenaline 1:100.000', so_ong: 1 },
    vat_tu: [
      { ten: 'Composite A2', so_luong: '1 liều' },
      { ten: 'Keo dán thế hệ 5', so_luong: '1 liều' },
    ],
    dien_bien: 'Khách hợp tác tốt, không đau trong lúc làm. Huyết áp sau thủ thuật 132/84.',
    xu_tri: 'Đã trám composite răng 11. Răng 26 hẹn tuần sau điều trị tuỷ, '
      + 'đã giải thích khách hiểu và đồng ý.',
    don_thuoc: [
      { ten: 'Paracetamol', ham_luong: '500mg', lieu: '1 viên khi đau, cách 6 giờ', so_ngay: 3 },
    ],
    dan_do: 'Không ăn nhai bên trái 2 giờ. Đau tăng hoặc sưng thì gọi ngay. '
      + 'Chải răng nhẹ vùng vừa trám.',
    hen_tai_kham: ngayLech(7),
    da_ky: false,
    anh: [
      { id: 'A1', loai: 'trong_mieng', ghi_chu: 'Mặt nhai răng 26 trước xử lý', rang: '26' },
      { id: 'A2', loai: 'quanh_chop', ghi_chu: 'Phim quanh chóp răng 26', rang: '26' },
    ],
    tao_luc: `${ngayLech(0)}T08:12:00`, tao_boi: 'BS01',
  },
  {
    id: 'LK-0002', ho_so: 'BN-00001', ngay: ngayLech(-21), gio: '09:30',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS01', phu_ta: 'PT-01', phong: 'Phòng 1',
    ly_do: 'Tái khám chỉnh nha định kỳ tháng thứ 14',
    sinh_hieu: { huyet_ap: '130/82', mach: '76', duong_huyet: '' },
    kham_ngoai_mat: 'Mặt cân đối, môi khép kín không gắng sức.',
    kham_trong_mieng: 'Mắc cài nguyên vẹn, không bong. Dây cung 018 SS còn nguyên. '
      + 'Cao răng độ 1 mặt trong nhóm răng cửa dưới. Nướu viền đỏ nhẹ vùng 31–41.',
    nha_chu: { mang_bam: 41, chay_mau: 22, tui_sau: 3, lung_rang: 1 },
    can_lam_sang: [],
    chan_doan: 'Theo dõi chỉnh nha giai đoạn đóng khoảng · Viêm nướu do mảng bám',
    ma_benh: 'K05.0',
    chan_doan_them: '',
    rang_lien_quan: ['31', '41'],
    thu_thuat: [
      { loai: 'chinh_nha', ten: 'Siết dây cung, thay thun', rang: 'toàn hàm', mat: '' },
      { loai: 'cao_voi', ten: 'Cạo vôi siêu âm, đánh bóng', rang: 'toàn hàm', mat: '' },
    ],
    thuoc_te: null,
    vat_tu: [{ ten: 'Thun buộc mắc cài', so_luong: '20 cái' }],
    dien_bien: 'Đã hướng dẫn lại kỹ thuật chải răng Bass cải tiến và dùng bàn chải kẽ.',
    xu_tri: 'Siết dây cung. Cạo vôi toàn hàm. Hẹn tái khám 4 tuần.',
    don_thuoc: [],
    dan_do: 'Dùng bàn chải kẽ mỗi tối. Súc miệng nước muối sinh lý 3 ngày.',
    hen_tai_kham: ngayLech(7),
    da_ky: true, ky_luc: `${ngayLech(-21)}T10:05:00`, ky_boi: 'BS01',
    anh: [{ id: 'A3', loai: 'ngoai_mat', ghi_chu: 'Ảnh chính diện theo dõi', rang: null }],
    tao_luc: `${ngayLech(-21)}T09:41:00`, tao_boi: 'BS01',
  },
  {
    id: 'LK-0003', ho_so: 'BN-00001', ngay: ngayLech(-49), gio: '14:00',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS01', phu_ta: 'PT-02', phong: 'Phòng 1',
    ly_do: 'Tái khám chỉnh nha, khách báo cộm khi nhai bên phải',
    sinh_hieu: { huyet_ap: '128/80', mach: '74', duong_huyet: '' },
    kham_ngoai_mat: 'Không ghi nhận bất thường.',
    kham_trong_mieng: 'Miếng trám composite răng 16 bong một phần mặt gần, '
      + 'lộ ngà, thăm dò ê. Không đau tự phát.',
    nha_chu: { mang_bam: 38, chay_mau: 18, tui_sau: 3, lung_rang: 0 },
    can_lam_sang: [],
    chan_doan: 'Bong miếng trám răng 16',
    ma_benh: 'K08.5',
    chan_doan_them: '',
    rang_lien_quan: ['16'],
    thu_thuat: [{ loai: 'tram', ten: 'Trám lại composite', rang: '16', mat: 'nhai, gần' }],
    thuoc_te: null,
    vat_tu: [{ ten: 'Composite A2', so_luong: '1 liều' }],
    dien_bien: 'Không cần gây tê, khách không đau.',
    xu_tri: 'Trám lại composite răng 16 mặt nhai và mặt gần. Chỉnh khớp cắn.',
    don_thuoc: [],
    dan_do: 'Không ăn cứng bên phải trong ngày.',
    hen_tai_kham: ngayLech(-21),
    da_ky: true, ky_luc: `${ngayLech(-49)}T14:48:00`, ky_boi: 'BS01',
    anh: [{ id: 'A4', loai: 'trong_mieng', ghi_chu: 'Sau trám răng 16', rang: '16' }],
    tao_luc: `${ngayLech(-49)}T14:20:00`, tao_boi: 'BS01',
  },
  {
    id: 'LK-0004', ho_so: 'BN-00002', ngay: ngayLech(0), gio: '08:30',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS02', phu_ta: 'PT-03', phong: 'Phòng VIP',
    ly_do: 'Tái khám sau đặt Implant răng 46, tháng thứ 4',
    sinh_hieu: { huyet_ap: '134/85', mach: '80', duong_huyet: '7.2' },
    kham_ngoai_mat: 'Không sưng, không hạch dưới hàm.',
    kham_trong_mieng: 'Vùng implant 46 niêm mạc lành, không đỏ, không rỉ dịch. '
      + 'Gõ implant tiếng đanh. Không lung lay. Khoảng phục hình 8mm.',
    nha_chu: { mang_bam: 27, chay_mau: 11, tui_sau: 4, lung_rang: 0 },
    can_lam_sang: [
      { loai: 'toan_canh', ket_qua: 'Implant 46 tích hợp xương tốt, không thấu quang '
        + 'quanh trụ. Xương viền ổn định.' },
    ],
    chan_doan: 'Theo dõi sau cấy ghép implant, giai đoạn tích hợp xương hoàn tất',
    ma_benh: 'Z96.5',
    chan_doan_them: 'Đái tháo đường type 2 kiểm soát chưa tốt · lưu ý lành thương',
    rang_lien_quan: ['46'],
    thu_thuat: [
      { loai: 'phuc_hinh', ten: 'Lấy dấu kỹ thuật số trên implant', rang: '46', mat: '' },
    ],
    thuoc_te: null,
    vat_tu: [{ ten: 'Trụ lấy dấu Straumann RC', so_luong: '1 cái' }],
    dien_bien: 'Đường huyết tại chỗ 7.2 mmol/L. Đã dặn khách kiểm soát trước ngày gắn mão.',
    xu_tri: 'Lấy dấu làm mão sứ trên implant. Hẹn 2 tuần gắn mão.',
    don_thuoc: [],
    dan_do: 'Giữ vệ sinh vùng implant bằng bàn chải kẽ. Kiểm soát đường huyết.',
    hen_tai_kham: ngayLech(14),
    da_ky: false,
    anh: [{ id: 'A5', loai: 'toan_canh', ghi_chu: 'Phim toàn cảnh kiểm tra tích hợp', rang: null }],
    tao_luc: `${ngayLech(0)}T08:44:00`, tao_boi: 'BS02',
  },
  {
    id: 'LK-0005', ho_so: 'BN-00003', ngay: ngayLech(0), gio: '09:00',
    chi_nhanh: 'le-van-tho', bac_si: 'BS03', phu_ta: 'PT-01', phong: 'Phòng 2',
    ly_do: 'Khám tổng quát lần đầu, muốn tư vấn tẩy trắng răng',
    sinh_hieu: { huyet_ap: '112/70', mach: '72', duong_huyet: '' },
    kham_ngoai_mat: 'Mặt cân đối. Đường cười lộ nướu 2mm.',
    kham_trong_mieng: 'Răng 21, 22 đốm trắng đục mặt ngoài, bề mặt còn nhẵn, '
      + 'thăm dò không mắc. Màu răng A3.5 theo thang Vita. Nướu hồng, không chảy máu khi thăm dò. '
      + 'Răng 37 có miếng trám amalgam cũ còn khít.',
    nha_chu: { mang_bam: 18, chay_mau: 6, tui_sau: 2, lung_rang: 0 },
    can_lam_sang: [],
    chan_doan: 'Sâu men răng 21, 22 giai đoạn đốm trắng',
    ma_benh: 'K02.0',
    chan_doan_them: 'Nhiễm màu răng ngoại lai mức độ nhẹ',
    rang_lien_quan: ['21', '22'],
    thu_thuat: [{ loai: 'kham', ten: 'Khám tổng quát, lập kế hoạch', rang: '', mat: '' }],
    thuoc_te: null,
    vat_tu: [],
    dien_bien: 'Đã giải thích: tẩy trắng khi còn sâu men sẽ ê buốt nhiều và '
      + 'không đều màu, nên trám trước.',
    xu_tri: 'Hẹn trám thẩm mỹ 21, 22. Tẩy trắng sau khi trám ổn định 2 tuần.',
    don_thuoc: [],
    dan_do: 'Giảm nước ngọt và trà sữa. Dùng kem đánh răng có fluor 1450ppm.',
    hen_tai_kham: ngayLech(5),
    da_ky: false,
    anh: [],
    tao_luc: `${ngayLech(0)}T09:18:00`, tao_boi: 'BS03',
  },
];

/* Kế hoạch điều trị.
 *
 * Gắn với HỒ SƠ chứ không với một lượt khám: một kế hoạch chạy qua nhiều buổi,
 * và đó chính là thứ cho biết khách đang ở đâu trong lộ trình.
 */
let KE_HOACH = [
  { id: 'KH-01', ho_so: 'BN-00001', giai_doan: 'on_dinh',
    noi_dung: 'Điều trị tuỷ răng 26', rang: ['26'], so_buoi: 2, da_lam: 0,
    chi_phi: 3500000, trang_thai: 'dong_y', ghi_chu: 'Khách đồng ý ngày khám hôm nay' },
  { id: 'KH-02', ho_so: 'BN-00001', giai_doan: 'phuc_hoi',
    noi_dung: 'Bọc mão sứ răng 26 sau nội nha', rang: ['26'], so_buoi: 2, da_lam: 0,
    chi_phi: 5000000, trang_thai: 'cho_duyet', ghi_chu: '' },
  { id: 'KH-03', ho_so: 'BN-00001', giai_doan: 'tham_my',
    noi_dung: 'Trám thẩm mỹ răng 11', rang: ['11'], so_buoi: 1, da_lam: 1,
    chi_phi: 700000, trang_thai: 'xong', ghi_chu: 'Đã làm trong buổi hôm nay' },
  { id: 'KH-04', ho_so: 'BN-00001', giai_doan: 'duy_tri',
    noi_dung: 'Chỉnh nha mắc cài kim loại · còn 8 tháng', rang: ['toàn hàm'],
    so_buoi: 8, da_lam: 14, chi_phi: 45000000, trang_thai: 'dang_lam', ghi_chu: 'Tháng thứ 14/22' },
  { id: 'KH-05', ho_so: 'BN-00002', giai_doan: 'phuc_hoi',
    noi_dung: 'Mão sứ zirconia trên implant 46', rang: ['46'], so_buoi: 2, da_lam: 1,
    chi_phi: 8000000, trang_thai: 'dang_lam', ghi_chu: 'Đã lấy dấu, chờ gắn' },
  { id: 'KH-06', ho_so: 'BN-00003', giai_doan: 'on_dinh',
    noi_dung: 'Trám thẩm mỹ răng 21, 22', rang: ['21', '22'], so_buoi: 1, da_lam: 0,
    chi_phi: 1400000, trang_thai: 'cho_duyet', ghi_chu: '' },
  { id: 'KH-07', ho_so: 'BN-00003', giai_doan: 'tham_my',
    noi_dung: 'Tẩy trắng răng tại phòng khám', rang: ['toàn hàm'], so_buoi: 1, da_lam: 0,
    chi_phi: 2500000, trang_thai: 'cho_duyet', ghi_chu: 'Chỉ làm sau khi trám ổn định' },
];

// Nhật ký ĐỌC. Với dữ liệu sức khoẻ, mở xem cũng là sự kiện phải lưu vết.
let NHAT_KY_DOC = [];

/* ── Đọc ──────────────────────────────────────────────────────────────── */

const sao = (x) => JSON.parse(JSON.stringify(x));
const cho = (v) => Promise.resolve(sao(v));

export function layDanhSachHoSo({ tim, chiNhanh, bacSi, coCanhBao, coRangSau } = {}) {
  let ds = HO_SO.map((h) => {
    const luot = LUOT_KHAM.filter((l) => l.ho_so === h.id);
    const rangCanXuLy = Object.values(h.so_do_rang)
      .filter((r) => ['sau', 'chi_dinh_nho'].includes(r.trang_thai));
    return {
      ...h,
      so_lan_kham: luot.length,
      lan_kham_gan_nhat: luot.map((l) => l.ngay).sort().pop() || null,
      so_anh: luot.reduce((s, l) => s + l.anh.length, 0),
      so_rang_can_xu_ly: rangCanXuLy.length,
      rang_can_xu_ly: rangCanXuLy.map((r) => r.ma),
      chua_ky: luot.filter((l) => !l.da_ky).length,
    };
  });

  if (chiNhanh) ds = ds.filter((h) => h.chi_nhanh === chiNhanh);
  if (bacSi) ds = ds.filter((h) => h.bac_si_chinh === bacSi);
  if (coCanhBao) ds = ds.filter((h) => h.canh_bao.length > 0);
  if (coRangSau) ds = ds.filter((h) => h.so_rang_can_xu_ly > 0);
  if (tim) {
    const q = tim.trim().toLowerCase();
    ds = ds.filter((h) => h.ten.toLowerCase().includes(q)
      || h.dien_thoai.includes(q) || h.ma.toLowerCase().includes(q));
  }
  ds.sort((a, b) => (a.lan_kham_gan_nhat || '') < (b.lan_kham_gan_nhat || '') ? 1 : -1);
  return cho(ds);
}

/** Mở một hồ sơ. GHI VẾT LƯỢT ĐỌC — đây là yêu cầu của dữ liệu sức khoẻ. */
export function moHoSo(id, nguoiXem = { ma: '?', vai_tro: '?' }) {
  const h = HO_SO.find((x) => x.id === id);
  if (!h) throw new Error('Không tìm thấy hồ sơ này.');
  NHAT_KY_DOC.unshift({
    id: `ND-${NHAT_KY_DOC.length + 1}`,
    ho_so: id, boi: nguoiXem.ma, vai_tro: nguoiXem.vai_tro,
    luc: new Date().toISOString(), viec: 'mo_ho_so',
  });
  const luot = LUOT_KHAM.filter((l) => l.ho_so === id)
    .sort((a, b) => (a.ngay < b.ngay ? 1 : -1));
  const kh = KE_HOACH.filter((k) => k.ho_so === id);
  return cho({
    ho_so: h,
    luot_kham: luot,
    so_lan_kham: luot.length,
    ke_hoach: kh,
    tong_chi_phi: kh.filter((k) => k.trang_thai !== 'tu_choi')
      .reduce((t, k) => t + k.chi_phi, 0),
    nhat_ky_doc: NHAT_KY_DOC.filter((n) => n.ho_so === id).slice(0, 30),
  });
}

export function locLuotKham(dsLuot, { tu, den, bacSi, rang, chuaKy, tim } = {}) {
  let ds = dsLuot.slice();
  if (tu) ds = ds.filter((l) => l.ngay >= tu);
  if (den) ds = ds.filter((l) => l.ngay <= den);
  if (bacSi) ds = ds.filter((l) => l.bac_si === bacSi);
  if (rang) ds = ds.filter((l) => (l.rang_lien_quan || []).includes(rang));
  if (chuaKy) ds = ds.filter((l) => !l.da_ky);
  if (tim) {
    const q = tim.trim().toLowerCase();
    ds = ds.filter((l) => [l.ly_do, l.kham, l.chan_doan, l.xu_tri, l.ma_benh]
      .some((v) => String(v || '').toLowerCase().includes(q)));
  }
  return ds;
}

/* ── Ghi · chỉ thêm, không sửa đè ─────────────────────────────────────── */

export function ghiLuotKham(hoSoId, du, boi) {
  const h = HO_SO.find((x) => x.id === hoSoId);
  if (!h) throw new Error('Không tìm thấy hồ sơ này.');
  for (const [f, ten] of [['ly_do', 'lý do khám'], ['kham', 'phần khám'],
    ['chan_doan', 'chẩn đoán']]) {
    if (!String(du[f] || '').trim()) throw new Error(`Còn thiếu ${ten}.`);
  }
  const moi = {
    id: `LK-${String(LUOT_KHAM.length + 1).padStart(4, '0')}`,
    ho_so: hoSoId,
    ngay: du.ngay || ngayLech(0),
    gio: du.gio || new Date().toTimeString().slice(0, 5),
    chi_nhanh: du.chi_nhanh || h.chi_nhanh,
    bac_si: boi, phong: du.phong || '',
    ly_do: du.ly_do.trim(), kham: du.kham.trim(),
    chan_doan: du.chan_doan.trim(), ma_benh: (du.ma_benh || '').trim(),
    rang_lien_quan: du.rang_lien_quan || [],
    xu_tri: (du.xu_tri || '').trim(),
    da_ky: false, anh: [],
    sua_cho: du.sua_cho || null,
    tao_luc: new Date().toISOString(), tao_boi: boi,
  };
  LUOT_KHAM.push(moi);
  return cho(moi);
}

/** Đính chính một lượt đã ký: KHÔNG sửa bản cũ, ghi bản mới trỏ về nó. */
export function dinhChinh(luotId, du, boi) {
  const cu = LUOT_KHAM.find((l) => l.id === luotId);
  if (!cu) throw new Error('Không tìm thấy lượt khám này.');
  if (!String(du.ly_do_dinh_chinh || '').trim()) {
    throw new Error('Phải ghi lý do đính chính. Bản cũ vẫn được giữ nguyên.');
  }
  return ghiLuotKham(cu.ho_so, { ...cu, ...du, sua_cho: luotId }, boi);
}

export function kyLuotKham(luotId, boi) {
  const l = LUOT_KHAM.find((x) => x.id === luotId);
  if (!l) throw new Error('Không tìm thấy lượt khám này.');
  if (l.da_ky) throw new Error('Lượt khám này đã ký rồi.');
  if (l.bac_si !== boi) {
    throw new Error('Chỉ bác sĩ thực hiện mới ký được lượt khám của mình.');
  }
  l.da_ky = true;
  l.ky_luc = new Date().toISOString();
  l.ky_boi = boi;
  return cho(l);
}

export function datTrangThaiRang(hoSoId, maRang, trangThai, mat, ghiChu, boi) {
  const h = HO_SO.find((x) => x.id === hoSoId);
  if (!h) throw new Error('Không tìm thấy hồ sơ này.');
  if (!h.so_do_rang[maRang]) throw new Error(`Không có răng ${maRang}.`);
  if (!TRANG_THAI_RANG[trangThai]) throw new Error('Trạng thái răng không hợp lệ.');
  h.so_do_rang[maRang] = {
    ma: maRang, trang_thai: trangThai,
    mat: mat || {}, ghi_chu: ghiChu || '',
    cap_nhat_luc: new Date().toISOString(), cap_nhat_boi: boi,
  };
  return cho(h.so_do_rang[maRang]);
}

/* ── Tổng hợp cho màn hình ────────────────────────────────────────────── */

/** Số răng theo từng trạng thái. Dùng cho cả sơ đồ 2D lẫn cảnh 3D. */
export function tomTatSoDo(soDo) {
  const dem = {};
  Object.values(soDo).forEach((r) => {
    dem[r.trang_thai] = (dem[r.trang_thai] || 0) + 1;
  });
  return dem;
}

export function xuatCsvLuotKham(ho, ds) {
  const dong = [['Mã hồ sơ', 'Bệnh nhân', 'Ngày', 'Giờ', 'Bác sĩ', 'Lý do khám',
    'Khám', 'Chẩn đoán', 'Mã bệnh', 'Răng', 'Xử trí', 'Đã ký']];
  ds.forEach((l) => dong.push([
    ho.ma, ho.ten, l.ngay, l.gio, l.bac_si, l.ly_do, l.kham,
    l.chan_doan, l.ma_benh, (l.rang_lien_quan || []).join(' '), l.xu_tri,
    l.da_ky ? 'Đã ký' : 'Chưa ký',
  ]));
  return dong.map((r) => r.map((o) => `"${String(o ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}
