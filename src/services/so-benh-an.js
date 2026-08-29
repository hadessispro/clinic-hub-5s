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
    chi_nhanh: 'pham-van-chieu',
    bac_si_chinh: 'BS01',
    tao_luc: '2024-06-18',
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
    chi_nhanh: 'pham-van-chieu',
    bac_si_chinh: 'BS02',
    tao_luc: '2025-09-04',
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
    chi_nhanh: 'le-van-tho',
    bac_si_chinh: 'BS03',
    tao_luc: ngayLech(0),
    canh_bao: [],
    tien_su: 'Khách mới, chưa từng điều trị nha khoa.',
    so_do_rang: soDo3,
  },
];

// Lượt khám. Mỗi lượt là một bản ghi riêng, ký riêng, không sửa đè.
let LUOT_KHAM = [
  {
    id: 'LK-0001', ho_so: 'BN-00001', ngay: ngayLech(0), gio: '08:00',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS01', phong: 'Phòng 1',
    ly_do: 'Đau âm ỉ răng hàm trên trái khi ăn ngọt',
    kham: 'Răng 26 lỗ sâu mặt nhai lan mặt xa, thăm dò đau, gõ dọc âm tính. '
        + 'Răng 11 sâu men mặt ngoài.',
    chan_doan: 'Sâu ngà sâu răng 26 · Sâu men răng 11',
    ma_benh: 'K02.1',
    rang_lien_quan: ['26', '11'],
    xu_tri: 'Trám composite răng 11. Răng 26 hẹn tuần sau lấy tuỷ.',
    da_ky: false,
    anh: [
      { id: 'A1', loai: 'trong_mieng', ghi_chu: 'Mặt nhai răng 26 trước xử lý', rang: '26' },
      { id: 'A2', loai: 'quanh_chop', ghi_chu: 'Phim quanh chóp 26', rang: '26' },
    ],
    tao_luc: `${ngayLech(0)}T08:12:00`, tao_boi: 'BS01',
  },
  {
    id: 'LK-0002', ho_so: 'BN-00001', ngay: ngayLech(-21), gio: '09:30',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS01', phong: 'Phòng 1',
    ly_do: 'Tái khám chỉnh nha định kỳ',
    kham: 'Mắc cài nguyên vẹn. Vệ sinh răng miệng khá. Cao răng độ 1.',
    chan_doan: 'Theo dõi chỉnh nha · Viêm nướu do mảng bám',
    ma_benh: 'K05.0',
    rang_lien_quan: [],
    xu_tri: 'Siết dây cung. Cạo vôi răng toàn hàm.',
    da_ky: true, ky_luc: `${ngayLech(-21)}T10:05:00`, ky_boi: 'BS01',
    anh: [{ id: 'A3', loai: 'ngoai_mat', ghi_chu: 'Ảnh chính diện theo dõi', rang: null }],
    tao_luc: `${ngayLech(-21)}T09:41:00`, tao_boi: 'BS01',
  },
  {
    id: 'LK-0003', ho_so: 'BN-00001', ngay: ngayLech(-49), gio: '14:00',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS01', phong: 'Phòng 1',
    ly_do: 'Tái khám chỉnh nha định kỳ',
    kham: 'Răng 16 lỗ trám cũ bong một phần.',
    chan_doan: 'Bong miếng trám răng 16',
    ma_benh: 'K08.5',
    rang_lien_quan: ['16'],
    xu_tri: 'Trám lại composite răng 16 mặt nhai và mặt gần.',
    da_ky: true, ky_luc: `${ngayLech(-49)}T14:48:00`, ky_boi: 'BS01',
    anh: [{ id: 'A4', loai: 'trong_mieng', ghi_chu: 'Sau trám răng 16', rang: '16' }],
    tao_luc: `${ngayLech(-49)}T14:20:00`, tao_boi: 'BS01',
  },
  {
    id: 'LK-0004', ho_so: 'BN-00002', ngay: ngayLech(0), gio: '08:30',
    chi_nhanh: 'pham-van-chieu', bac_si: 'BS02', phong: 'Phòng VIP',
    ly_do: 'Tái khám sau đặt Implant răng 46',
    kham: 'Vùng implant 46 lành thương tốt, không sưng đau. Độ vững ổn định.',
    chan_doan: 'Theo dõi sau cấy ghép implant · giai đoạn tích hợp xương',
    ma_benh: 'Z96.5',
    rang_lien_quan: ['46'],
    xu_tri: 'Lấy dấu làm mão sứ trên implant. Hẹn 2 tuần gắn mão.',
    da_ky: false,
    anh: [{ id: 'A5', loai: 'toan_canh', ghi_chu: 'Phim toàn cảnh kiểm tra', rang: null }],
    tao_luc: `${ngayLech(0)}T08:44:00`, tao_boi: 'BS02',
  },
  {
    id: 'LK-0005', ho_so: 'BN-00003', ngay: ngayLech(0), gio: '09:00',
    chi_nhanh: 'le-van-tho', bac_si: 'BS03', phong: 'Phòng 2',
    ly_do: 'Khám tổng quát, muốn tư vấn tẩy trắng',
    kham: 'Răng 21 và 22 sâu men mặt ngoài. Màu răng A3.5. Nướu khoẻ.',
    chan_doan: 'Sâu men răng 21, 22',
    ma_benh: 'K02.0',
    rang_lien_quan: ['21', '22'],
    xu_tri: 'Trám thẩm mỹ 21, 22 trước. Tẩy trắng sau khi trám ổn định.',
    da_ky: false,
    anh: [],
    tao_luc: `${ngayLech(0)}T09:18:00`, tao_boi: 'BS03',
  },
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
  return cho({
    ho_so: h,
    luot_kham: luot,
    so_lan_kham: luot.length,
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
