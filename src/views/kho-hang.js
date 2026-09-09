/* Kho vật tư · màn hình của bộ phận phụ tá.
 *
 * MỘT MÀN, SÁU TAB, vì giữ kho là MỘT chỗ làm việc. Người phụ trách kho trong
 * một buổi sáng phải: xem hôm nay thiếu gì, tra một mã hàng khách hỏi, kiểm
 * đơn nào chưa về, xuất vật tư cho phòng, và chốt đơn đặt mới. Tách năm thứ
 * đó thành năm mục menu thì họ nhảy qua lại cả ngày, mỗi màn một bộ lọc riêng
 * lệch nhau, và không màn nào trả lời được câu hỏi thật: "còn đủ dùng không".
 *
 * Ba con số của kho phải luôn khớp nhau, nên chúng gọi đúng một hàm:
 *   TỒN     = đang có trong kho
 *   ĐANG VỀ = đã đặt, chưa nhận
 *   CẦN BÙ  = định mức − tồn − đang về
 * Đề xuất mua hàng dựng từ đúng ba số này, nên số trên thẻ và số trong đơn
 * không bao giờ lệch.
 */

import {
  CHI_NHANH, CO_DAC_BIET, MUC_TON, NHOM_VAT_TU, NOI_NHAN,
  TRANG_THAI_DON, TRANG_THAI_PHIEU,
  BAC_SI, KHO_XUAT, layCaDieuTri, themCaDieuTri, kiemTraTonKhoCa, xuatKhoCaDieuTri,
  capNhatTonKho, deXuatMuaHang, doiTrangThaiDon, huyPhieuXuat, layDonHang, layHoaDon,
  layNhaCungCap, layPhieuXuat, layVatTu, nhanHang, soSanhGia,
  taoDonHang, taoDonTuDeXuat, taoPhieuXuat, tenChiNhanhKho, tenNhaCungCap, tenNguoi,
  themAnhHoaDon, themBangGia, themHoaDon, themNhaCungCap, themVatTu, thongKeKho,
  xoaAnhHoaDon, xuatKho, xuatCsvDeXuat, xuatCsvVatTu,
  layDanhSachDeXuat, layChiTietDeXuat, taoPhieuDeXuat, capNhatPhieuDeXuat, xoaPhieuDeXuat,
  goiYHangThieu, soSanhGiaNhaCungCap, taoDonHangTuPhieu, xuatExcelDeXuatBM03,
  BM03_STANDARD_ITEMS,
} from '../services/kho-hang.js';
import { escapeHTML, downloadText, phanTrang, thanhPhanTrang, todayISO } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/app-dialog.js';
import { nenWebp } from '../components/nen-anh.js';
import { navigateTo } from '../router.js';
import { store } from '../store.js';

/* ── Trạng thái màn ───────────────────────────────────────────────────── */

const TABS = [
  { ma: 'tong-quan', ten: 'Tổng quan',    icon: 'ri-dashboard-line' },
  { ma: 'xuat-ca',   ten: 'Xuất vật tư',  icon: 'ri-medicine-bottle-line' },
  { ma: 'vat-tu',    ten: 'Vật tư & tồn', icon: 'ri-archive-2-line' },
  { ma: 'don-hang',  ten: 'Đơn hàng',     icon: 'ri-truck-line' },
  { ma: 'phieu-xuat', ten: 'Phiếu xuất',  icon: 'ri-file-list-3-line' },
  { ma: 'de-xuat',   ten: 'Đề xuất mua',  icon: 'ri-shopping-cart-2-line' },
  { ma: 'ncc',       ten: 'Nhà cung cấp', icon: 'ri-store-2-line' },
];

let tab = 'xuat-ca';
let chiNhanh = 'le-van-tho';

let dsVatTu = []; let dsDon = []; let dsPhieu = []; let dsNcc = [];
let thongKe = null; let deXuat = null;

let vTim = ''; let vNhom = ''; let vMuc = ''; let vCo = ''; let vTrang = 1;
let dTim = ''; let dNcc = ''; let dTrangThai = ''; let dChiTre = false; let dChiThieu = false;
let pTim = ''; let pNoiNhan = ''; let pTrangThai = '';
let nTim = '';

/* Xuất vật tư theo ca điều trị */
let dsCa = [];
let caDangChonId = null;
let caTim = '';
let caNgay = todayISO();
let hienFormThemCa = false;
let dongVatTuCa = [];
let caBacSiChon = '';
let caKhoXuatChon = 'pvc_tong_quat';
let caGhiChuChon = '';

/* Quản lý Đề xuất mua hàng BM03 & Supply Chain */
let dsPhieuDeXuat = [];
let phieuDeXuatHienTaiId = null;
let phieuDeXuatHienTai = null;
let dxNganhHangFilter = 'all';
let dxTimKiemVatTu = '';
let hienDrawerHangThieu = false;
let dsGoiYHangThieu = [];
let goiYChonMap = {};
let modalSoSanhGia = null; // { vat_tu, quotes, dongIndex? }

/* MỘT biến cho ngăn kéo, không phải mỗi loại chi tiết một biến. */
let nganMo = null;   // { loai: 'vat_tu' | 'don', id, so_sanh?, can? }
let hoaDonCuaDon = [];
let hienFormPhieu = false; let dongPhieuMoi = [];
let hienFormVatTu = false;
let hienFormNcc = false;
let hienFormDon = false; let dongDonMoi = [];
let hienFormBangGia = false;
let hienFormTonKho = false;

/* ── Mảnh dùng lại ────────────────────────────────────────────────────── */

const opt = (v, t, chon) => `<option value="${escapeHTML(v)}"${chon === v ? ' selected' : ''}>${escapeHTML(t)}</option>`;
const tien = (n) => `${Math.round(n || 0).toLocaleString('vi-VN')}đ`;
const trieu = (n) => (Math.abs(n) >= 1e6
  ? `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}tr` : `${Math.round((n || 0) / 1e3)}k`);
const ngayHien = (d) => (d ? d.split('-').reverse().join('/') : '—');

const nhanMuc = (m) => `<span class="status-pill ${MUC_TON[m].lop}">${MUC_TON[m].ten}</span>`;

const coDacBiet = (ds) => (ds || []).map((c) => `<span class="kh-co kh-co-${CO_DAC_BIET[c].lop}"
  title="${escapeHTML(CO_DAC_BIET[c].canh)}"><i class="${CO_DAC_BIET[c].icon}"></i>${
  escapeHTML(CO_DAC_BIET[c].ten)}</span>`).join('');

const oLoc = (nhan, noi) => `<label class="kh-o"><span>${escapeHTML(nhan)}</span>${noi}</label>`;

const veOptgroupBacSi = (bacSiChon) => {
  const bsPVC = BAC_SI.filter((b) => b.chi_nhanh === 'pham-van-chieu');
  const bsLVT = BAC_SI.filter((b) => b.chi_nhanh === 'le-van-tho');
  return `
    <option value="">— Chọn bác sĩ điều trị —</option>
    <optgroup label="── Chi nhánh Phạm Văn Chiêu (PVC) ──">
      ${bsPVC.map((b) => `<option value="${escapeHTML(b.ten)}"${bacSiChon === b.ten ? ' selected' : ''}>BS. ${escapeHTML(b.ten)} (${escapeHTML(b.chuc)})</option>`).join('')}
    </optgroup>
    <optgroup label="── Chi nhánh Lê Văn Thọ (LVT) ──">
      ${bsLVT.map((b) => `<option value="${escapeHTML(b.ten)}"${bacSiChon === b.ten ? ' selected' : ''}>BS. ${escapeHTML(b.ten)} (${escapeHTML(b.chuc)})</option>`).join('')}
    </optgroup>
  `;
};

/* ── Tab: Tổng quan ───────────────────────────────────────────────────── */

function veTongQuan() {
  const t = thongKe;
  if (!t) return '';

  /* Thẻ số xếp theo mức KHẨN, không theo thứ tự bảng dữ liệu: thứ khiến
   * người giữ kho phải làm gì đó hôm nay đứng trước. */
  const the = [
    { so: t.het_hang, ten: 'Hết hàng', phu: 'phải đặt ngay', lop: 'bad',
      icon: 'ri-alert-line', loc: () => { tab = 'vat-tu'; vMuc = 'het'; } },
    { so: t.duoi_dinh_muc, ten: 'Dưới định mức', phu: 'cần bù thêm', lop: 'warn',
      icon: 'ri-arrow-down-circle-line', loc: () => { tab = 'vat-tu'; vMuc = 'thieu'; } },
    { so: t.don_tre_hen, ten: 'Đơn trễ hẹn', phu: 'quá ngày giao', lop: 'bad',
      icon: 'ri-time-line', loc: () => { tab = 'don-hang'; dChiTre = true; } },
    { so: t.dong_con_thieu, ten: 'Dòng chưa giao đủ', phu: `${trieu(t.tien_dang_treo)} đang treo`,
      lop: 'warn', icon: 'ri-inbox-unarchive-line', loc: () => { tab = 'don-hang'; dChiThieu = true; } },
    { so: t.phieu_nhap, ten: 'Phiếu chờ xuất', phu: 'chưa trừ kho', lop: 'info',
      icon: 'ri-file-list-3-line', loc: () => { tab = 'phieu-xuat'; pTrangThai = 'nhap'; } },
    { so: t.don_thieu_hoa_don, ten: 'Đơn thiếu hoá đơn', phu: 'đã giao, chưa có chứng từ',
      lop: 'warn', icon: 'ri-bill-line', loc: () => { tab = 'don-hang'; dTrangThai = 'da_giao'; } },
  ];
  const mucDo = {
    bad: 'Khẩn',
    warn: 'Cần chú ý',
    info: 'Theo dõi',
  };

  return `
    <div class="kh-the-luoi">
      ${the.map((x, i) => `<button type="button" class="kh-the kh-the-${x.lop}" data-nhay="${i}">
        <span class="kh-the-dau"><i class="${x.icon}"></i><em>${mucDo[x.lop]}</em></span>
        <b>${x.so}</b>
        <span>${escapeHTML(x.ten)}</span>
        <small>${escapeHTML(x.phu)}</small>
      </button>`).join('')}
    </div>

    <section class="panel">
      <header class="section-title kh-header">
        <h3>Việc cần làm hôm nay</h3>
        <span class="pill">${chiNhanh ? tenChiNhanhKho(chiNhanh) : 'Toàn hệ thống'}</span>
      </header>
      ${veViecCanLam()}
    </section>

    <section class="panel">
      <header class="section-title kh-header">
        <h3>Vật tư cần lưu ý đặc biệt</h3>
        <span class="pill">${t.dac_biet} mặt hàng có điều kiện riêng</span>
      </header>
      ${veDsDacBiet()}
    </section>`;
}

/* Danh sách vật tư đặc biệt: MỘT DÒNG mỗi mặt hàng.
 *
 * Bản trước dựng năm khối thẻ, mỗi khối lặp lại câu cảnh báo dài của loại cờ
 * đó — sáu mặt hàng chiếm gần hai màn hình mà đọc xong vẫn chỉ biết đúng tên
 * và số tồn. Câu cảnh báo giống nhau cho mọi mặt hàng cùng cờ, nên lặp nó ở
 * từng khối là tốn chỗ mà không thêm thông tin.
 *
 * Nay: một dòng một mặt hàng, cờ hiện thành nhãn nhỏ, bấm vào mở ngăn kéo bên
 * phải có đầy đủ cảnh báo, tồn từng kho, bảng so giá và đơn đang về.
 */
function veDsDacBiet() {
  const ds = dsVatTu.filter((v) => v.co.length);
  if (!ds.length) return '<p class="empty-state">Không có vật tư nào cần điều kiện bảo quản riêng.</p>';
  return `<div class="hh-bang-wrap kh-bang">
    <table class="hh-bang kh-bang-gon">
      <thead><tr>
        <th>Vật tư</th><th>Điều kiện riêng</th><th>Tồn</th><th>Mức tồn</th><th></th>
      </tr></thead>
      <tbody>${ds.map((v) => `<tr class="kh-hang-bam" data-ngan-vt="${escapeHTML(v.id)}">
        <td data-label="Vật tư">
          <div class="kh-ten"><b>${escapeHTML(v.ten)}</b><small>${escapeHTML(v.ma)}</small></div>
        </td>
        <td data-label="Điều kiện riêng"><div class="kh-co-hang">${coDacBiet(v.co)}</div></td>
        <td data-label="Tồn" class="kh-so"><b>${v.so_luong.toLocaleString('vi-VN')}</b>
          <small>${escapeHTML(v.don_vi)}</small></td>
        <td data-label="Mức tồn">${nhanMuc(v.muc_ton)}</td>
        <td class="kh-cot-nut"><i class="ri-arrow-right-s-line kh-mui"></i></td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function veViecCanLam() {
  const viec = [];
  dsVatTu.filter((v) => v.muc_ton === 'het').forEach((v) => viec.push({
    lop: 'bad', icon: 'ri-alert-line',
    chinh: `${v.ten} đã hết sạch`,
    phu: v.dang_cho_ve ? `Đang về ${v.dang_cho_ve} ${v.don_vi}` : 'Chưa có đơn nào đang về',
    nut: 'Xem giá', hanh: `data-so-sanh="${escapeHTML(v.id)}"`,
  }));
  dsDon.filter((d) => d.tre_hen).forEach((d) => viec.push({
    lop: 'warn', icon: 'ri-truck-line',
    chinh: `${d.id} · ${d.ten_ncc} trễ ${d.so_ngay_tre} ngày`,
    phu: `Hẹn giao ${ngayHien(d.hen_giao)} · còn ${d.so_dong_thieu} dòng chưa đủ`,
    nut: 'Mở đơn', hanh: `data-mo-don="${escapeHTML(d.id)}"`,
  }));
  dsPhieu.filter((p) => p.trang_thai === 'nhap').forEach((p) => viec.push({
    lop: 'info', icon: 'ri-file-list-3-line',
    chinh: `Phiếu ${p.id} chờ xuất cho ${p.ten_noi_nhan}`,
    phu: `${p.so_dong} dòng · ${escapeHTML(p.ly_do || 'Không ghi lý do')}`,
    nut: 'Xem phiếu', hanh: 'data-tab-di="phieu-xuat"',
  }));

  if (!viec.length) {
    return `<p class="empty-state">Không có việc gấp. Tồn kho đang trên định mức và
      không đơn nào trễ hẹn.</p>`;
  }
  return `<ul class="kh-viec">
    ${viec.map((v) => `<li class="kh-viec-dong kh-viec-${v.lop}">
      <i class="${v.icon}"></i>
      <div><b>${escapeHTML(v.chinh)}</b><span>${escapeHTML(v.phu)}</span></div>
      <button type="button" class="ghost-button kh-nho" ${v.hanh}>${escapeHTML(v.nut)}</button>
    </li>`).join('')}
  </ul>`;
}

/* ── Tab: Vật tư ──────────────────────────────────────────────────────── */

function veFormVatTu() {
  if (!hienFormVatTu) return '';
  return `<div class="kh-form-phieu" style="margin-bottom:14px;">
    <b>Thêm vật tư mới vào danh mục</b>
    <div class="kh-form-luoi">
      ${oLoc('Mã vật tư *', '<input type="text" id="vtMa" placeholder="VD: GT-NIT-M, TT-LIDO2">')}
      ${oLoc('Tên vật tư *', '<input type="text" id="vtTen" placeholder="VD: Găng tay nitrile không bột · size M">')}
      ${oLoc('Nhóm vật tư *', `<select id="vtNhom">
        ${Object.entries(NHOM_VAT_TU).map(([m, t]) => opt(m, t, 'tieu_hao')).join('')}</select>`)}
      ${oLoc('Đơn vị dùng *', '<input type="text" id="vtDonVi" placeholder="đôi, cây, ống, vỉ, gói..." value="cái">')}
      ${oLoc('Định mức tồn kho', '<input type="number" id="vtDinhMuc" min="0" placeholder="VD: 100" value="50">')}
    </div>
    <div class="kh-px-dong">
      <b>Lưu ý & điều kiện bảo quản đặc biệt</b>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:4px;">
        ${Object.entries(CO_DAC_BIET).map(([k, v]) => `
          <label class="kh-tick">
            <input type="checkbox" data-co-chon="${escapeHTML(k)}">
            <span><i class="${v.icon}"></i> ${escapeHTML(v.ten)}</span>
          </label>
        `).join('')}
      </div>
    </div>
    <div class="kh-nut-hang">
      <button type="button" class="ghost-button" id="vtHuy">Huỷ</button>
      <button type="button" class="primary-button" id="vtLuu">
        <i class="ri-save-line"></i> Lưu vật tư
      </button>
    </div>
  </div>`;
}

function veVatTu() {
  const kq = phanTrang(dsVatTu, vTrang, 20);
  const dong = kq.ds.map((v) => {
    const g = v.gia_tot_nhat;
    return `<tr>
      <td data-label="Mã">
        <b class="kh-ma">${escapeHTML(v.ma)}</b>
      </td>
      <td data-label="Vật tư">
        <div class="kh-ten">
          <b>${escapeHTML(v.ten)}</b>
          <small>${escapeHTML(NHOM_VAT_TU[v.nhom] || v.nhom)}</small>
          ${v.co.length ? `<div class="kh-co-hang">${coDacBiet(v.co)}</div>` : ''}
        </div>
      </td>
      <td data-label="Tồn" class="kh-so">
        <b style="color: ${v.so_luong === 0 ? '#b03d2e' : '#14332f'};">${v.so_luong.toLocaleString('vi-VN')}</b>
        <small style="color: #758782;">${escapeHTML(v.don_vi)}</small>
      </td>
      <td data-label="Định mức" class="kh-so kh-mo">${v.dinh_muc_hien.toLocaleString('vi-VN')}</td>
      <td data-label="Đang về" class="kh-so">${v.dang_cho_ve
        ? `<span class="kh-dang-ve">+${v.dang_cho_ve.toLocaleString('vi-VN')}</span>`
        : '<span class="kh-mo">—</span>'}</td>
      <td data-label="Mức tồn" style="text-align: center;">${nhanMuc(v.muc_ton)}</td>
      <td data-label="Giá tốt nhất">${g
        ? `<div class="kh-gia">
             <b>${tien(g.don_gia_quy_doi)}</b><small>/${escapeHTML(v.don_vi)}</small>
             <span title="${escapeHTML(tenNhaCungCap(g.ncc))}">${escapeHTML(tenNhaCungCap(g.ncc))}</span>
           </div>`
        : '<span class="kh-mo">Chưa có báo giá</span>'}</td>
      <td data-label="So giá" class="kh-cot-nut" style="text-align: center;">
        <button type="button" class="secondary-button kh-nho" data-so-sanh="${escapeHTML(v.id)}">
          <i class="ri-scales-3-line"></i> ${v.so_nha_cung_cap} nhà
        </button>
      </td>
    </tr>`;
  }).join('');

  return `<section class="panel">
    <header class="section-title kh-header">
      <h3>Vật tư và tồn kho</h3>
      <span class="pill">${dsVatTu.length} mặt hàng khớp bộ lọc</span>
      <div class="kh-header-nut">
        <button type="button" class="ghost-button" id="khXuatVt">
          <i class="ri-download-2-line"></i> Xuất CSV
        </button>
        <button type="button" class="${hienFormVatTu ? 'secondary-button' : 'primary-button'}" id="khMoFormVt">
          <i class="ri-add-line"></i> ${hienFormVatTu ? 'Đóng biểu mẫu' : 'Thêm vật tư'}
        </button>
      </div>
    </header>

    ${veFormVatTu()}

    <div class="lt-tim-lon">
      <i class="ri-search-line"></i>
      <input type="search" id="vTim" value="${escapeHTML(vTim)}"
             placeholder="Tìm theo tên vật tư, mã hàng, nhóm — hoặc tên nhà cung cấp">
      ${[vNhom, vMuc, vCo].filter(Boolean).length
        ? `<button type="button" class="ghost-button kh-nho" id="vXoaLoc">
             <i class="ri-filter-off-line"></i> Bỏ lọc</button>` : ''}
    </div>

    <div class="kh-loc">
      ${oLoc('Nhóm vật tư', `<select id="vNhom">${opt('', 'Tất cả nhóm', vNhom)}
        ${Object.entries(NHOM_VAT_TU).map(([m, t]) => opt(m, t, vNhom)).join('')}</select>`)}
      ${oLoc('Mức tồn', `<select id="vMuc">${opt('', 'Mọi mức tồn', vMuc)}
        ${Object.entries(MUC_TON).map(([m, t]) => opt(m, t.ten, vMuc)).join('')}</select>`)}
      ${oLoc('Lưu ý đặc biệt', `<select id="vCo">${opt('', 'Không lọc', vCo)}
        ${Object.entries(CO_DAC_BIET).map(([m, c]) => opt(m, c.ten, vCo)).join('')}</select>`)}
    </div>

    <div class="hh-bang-wrap kh-bang">
      <table class="hh-bang kh-bang-chinh">
        <thead><tr>
          <th style="width: 95px;">Mã</th>
          <th>Vật tư</th>
          <th style="width: 80px; text-align: right;">Tồn</th>
          <th style="width: 80px; text-align: right;">Định mức</th>
          <th style="width: 80px; text-align: right;">Đang về</th>
          <th style="width: 105px; text-align: center;">Mức tồn</th>
          <th style="width: 160px;">Giá tốt nhất</th>
          <th style="width: 85px; text-align: center;">So giá</th>
        </tr></thead>
        <tbody>${dong || '<tr><td colspan="8" class="empty-state">Không có vật tư nào khớp bộ lọc.</td></tr>'}</tbody>
      </table>
    </div>
    ${thanhPhanTrang(kq, 'khTrang', 'vật tư')}
  </section>`;
}

/* Ngăn kéo bên phải — chỗ xem chi tiết của cả màn kho.
 *
 * MỘT kiểu mở chi tiết cho mọi thứ: vật tư, đơn hàng, phiếu xuất. Trước đó
 * chi tiết nằm rải ở ba kiểu khác nhau — khối thẻ xếp dọc trang, hộp thoại
 * giữa màn, và bảng mở rộng tại chỗ — nên mỗi lần muốn xem sâu hơn người dùng
 * lại phải đoán xem lần này nó hiện ra kiểu gì.
 *
 * Ngăn kéo thay vì hộp thoại giữa màn vì hai lý do thật: danh sách phía sau
 * vẫn nhìn thấy được nên không mất chỗ đang đứng, và chi tiết kho là nội dung
 * DÀI — bảng giá, tồn từng kho, đơn đang về — thứ cuộn dọc trong một cột hẹp
 * dễ đọc hơn là trải ngang giữa màn.
 */
function veNgan() {
  if (!nganMo) return '';
  const noi = nganMo.loai === 'vat_tu' ? veNganVatTu()
    : nganMo.loai === 'don' ? veNganDon() : '';
  if (!noi) return '';
  return `<div class="kh-ngan is-open" id="khNgan">
    <button type="button" class="kh-ngan-nen" id="khNganNen" aria-label="Đóng"></button>
    <aside class="kh-ngan-to" role="dialog" aria-label="Chi tiết">${noi}</aside>
  </div>`;
}

const nganDau = (nhan, tieuDe, phu) => `<header class="kh-ngan-dau">
  <div>
    <span class="kh-ngan-nhan">${escapeHTML(nhan)}</span>
    <h3>${tieuDe}</h3>
    <p>${phu}</p>
  </div>
  <button type="button" class="kh-ngan-dong" id="khDongNgan" aria-label="Đóng">
    <i class="ri-close-line"></i>
  </button>
</header>`;

/* Dải số ngang ở đầu ngăn kéo: mỗi con số là một câu trả lời, đọc hết dải là
 * nắm được tình trạng mặt hàng mà chưa cần cuộn. */
const nganSo = (cac) => `<div class="kh-ngan-so">
  ${cac.map((x) => `<div${x.lop ? ` class="${x.lop}"` : ''}>
    <b>${x.so}</b><span>${escapeHTML(x.ten)}</span></div>`).join('')}
</div>`;

const nganMuc = (tieuDe, noi, phu = '') => `<section class="kh-ngan-muc">
  <h4>${escapeHTML(tieuDe)}${phu ? `<span>${escapeHTML(phu)}</span>` : ''}</h4>
  ${noi}
</section>`;

/* Chi tiết vật tư: gộp cảnh báo bảo quản, tồn từng kho, đơn đang về và bảng
 * so giá vào một chỗ.
 *
 * Bảng so giá là phần lõi của cả module. Cột quyết định là ĐƠN GIÁ QUY ĐỔI,
 * không phải giá niêm yết: nhà bán thùng 1000 đôi giá 1.050.000đ trông đắt
 * gấp chín lần nhà bán hộp 100 đôi giá 118.000đ, trong khi thật ra rẻ hơn
 * 12%. So bằng mắt trên giá niêm yết là sai mỗi khi các nhà bán quy cách khác
 * nhau — mà họ luôn bán khác nhau.
 */
function veNganVatTu() {
  const v = dsVatTu.find((x) => x.id === nganMo.id);
  if (!v) return '';
  const ss = nganMo.so_sanh;
  const can = nganMo.can ?? 0;

  const canhBao = v.co.length ? `<div class="kh-ngan-canh">
    ${v.co.map((c) => `<div class="kh-canh kh-canh-${CO_DAC_BIET[c].lop}">
      <i class="${CO_DAC_BIET[c].icon}"></i>
      <div><b>${escapeHTML(CO_DAC_BIET[c].ten)}</b>
      <span>${escapeHTML(CO_DAC_BIET[c].canh)}</span></div>
    </div>`).join('')}
  </div>` : '';

  const formTon = hienFormTonKho ? `
    <div class="kh-form-phieu" style="margin-top:10px;">
      <b>Cập nhật số lượng tồn kho</b>
      <div class="kh-form-luoi">
        ${oLoc('Chi nhánh *', `<select id="tkChiNhanh">
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten, chiNhanh || CHI_NHANH[0].ma)).join('')}</select>`)}
        ${oLoc(`Số lượng (${v.don_vi}) *`, '<input type="number" id="tkSoLuong" min="0" placeholder="0">')}
        ${oLoc('Vị trí lưu kho', '<input type="text" id="tkViTri" placeholder="Kệ A1, Tủ mát, Phòng hấp...">')}
      </div>
      <div class="kh-nut-hang">
        <button type="button" class="ghost-button kh-nho" id="tkHuy">Đóng</button>
        <button type="button" class="primary-button kh-nho" id="tkLuu" data-vt-id="${escapeHTML(v.id)}">
          <i class="ri-save-line"></i> Lưu tồn kho
        </button>
      </div>
    </div>` : '';

  const tonKho = nganMuc('Tồn theo kho', `
    ${v.ton_kho.length
      ? `<table class="kh-ngan-bang">
          <tbody>${v.ton_kho.map((t) => `<tr>
            <td>${escapeHTML(tenChiNhanhKho(t.chi_nhanh))}
              <small>${escapeHTML(t.vi_tri)} · kiểm kê ${ngayHien(t.kiem_ke)}</small></td>
            <td class="kh-so"><b>${t.so_luong.toLocaleString('vi-VN')}</b>
              <small>${escapeHTML(v.don_vi)}</small></td>
          </tr>`).join('')}</tbody>
        </table>`
      : '<p class="kh-ngan-trong">Chưa kho nào giữ tồn mặt hàng này.</p>'}
    <div style="margin-top:8px;">
      <button type="button" class="secondary-button kh-nho" id="khMoFormTon">
        <i class="ri-edit-line"></i> ${hienFormTonKho ? 'Đóng biểu mẫu' : 'Cập nhật tồn kho'}
      </button>
    </div>
    ${formTon}`);

  const formGia = hienFormBangGia ? `
    <div class="kh-form-phieu" style="margin-top:10px;">
      <b>Thêm báo giá nhà cung cấp</b>
      <div class="kh-form-luoi">
        ${oLoc('Nhà cung cấp *', `<select id="bgNcc">
          ${opt('', '— Chọn nhà cung cấp —', '')}
          ${dsNcc.map((n) => opt(n.id, n.ten, '')).join('')}</select>`)}
        ${oLoc('Đơn vị mua *', `<input type="text" id="bgDvm" placeholder="hộp, thùng, vỉ, tuýp..." value="hộp">`)}
        ${oLoc(`Quy cách (${v.don_vi}/đơn vị mua) *`, `<input type="number" id="bgQuyCach" min="1" value="100">`)}
        ${oLoc('Đơn giá niêm yết (đ) *', `<input type="number" id="bgGia" min="0" step="1000" placeholder="VD: 120000">`)}
        ${oLoc('Mua tối thiểu (đơn vị mua)', `<input type="number" id="bgToiThieu" min="1" value="1">`)}
      </div>
      <div class="kh-nut-hang">
        <button type="button" class="ghost-button kh-nho" id="bgHuy">Đóng</button>
        <button type="button" class="primary-button kh-nho" id="bgLuu" data-vt-id="${escapeHTML(v.id)}">
          <i class="ri-save-line"></i> Lưu báo giá
        </button>
      </div>
    </div>` : '';

  const bangGia = nganMuc('So sánh giá', `
    ${!ss || !ss.bang.length
      ? '<p class="kh-ngan-trong">Chưa có nhà cung cấp nào báo giá mặt hàng này.</p>'
      : `
        ${ss.canh_bao_moq ? `<div class="kh-canh kh-canh-warn">
          <i class="ri-error-warning-line"></i>
          <div><b>Rẻ theo đơn giá không phải rẻ theo tiền thật</b>
          <span>${escapeHTML(ss.canh_bao_moq.re_don_gia)} có đơn giá thấp nhất nhưng bắt lấy
          tối thiểu nhiều hơn nhu cầu — trả <b>${tien(ss.canh_bao_moq.tien_neu_mua)}</b> và dư
          ${ss.canh_bao_moq.du_ra} ${escapeHTML(v.don_vi)}. Lấy của
          ${escapeHTML(ss.canh_bao_moq.re_tien_that)} chỉ <b>${tien(ss.canh_bao_moq.tien_that)}</b>,
          rẻ hơn <b>${tien(ss.canh_bao_moq.chenh)}</b> cho lần đặt này.</span></div>
        </div>` : ''}
        ${ss.tiet_kiem ? `<div class="kh-canh kh-canh-good">
          <i class="ri-money-dollar-circle-line"></i>
          <div><b>Chênh ${ss.tiet_kiem.chenh_pt}% giữa nhà rẻ nhất và đắt nhất</b>
          <span>Chọn đúng nhà cho lần đặt này tiết kiệm
          <b>${tien(ss.tiet_kiem.chenh_tien)}</b>.</span></div>
        </div>` : ''}
        <div class="kh-ngan-cuon">
          <table class="hh-bang kh-bang-gia">
            <thead><tr>
              <th>Nhà cung cấp</th>
              <th>Quy cách</th>
              <th style="text-align: right;">Niêm yết</th>
              <th style="text-align: right;">Quy đổi</th>
              <th style="text-align: right;">Phải mua</th>
              <th style="text-align: right;">Thành tiền</th>
            </tr></thead>
            <tbody>${ss.bang.map((g) => `<tr class="${g.la_re_tien ? 'kh-hang-re' : ''}">
              <td data-label="Nhà cung cấp">
                <div class="kh-ten">
                  <b>${escapeHTML(g.ten_ncc)}</b>
                  <small>${escapeHTML(g.thanh_toan)} · giao ${g.ngay_giao} ngày · ${g.danh_gia}★</small>
                  ${g.la_re_tien ? '<span class="kh-cheo kh-cheo-good">Rẻ nhất cho lần này</span>' : ''}
                  ${g.la_re_nhat && !g.la_re_tien ? '<span class="kh-cheo">Đơn giá thấp nhất</span>' : ''}
                </div>
              </td>
              <td data-label="Quy cách">${g.quy_cach.toLocaleString('vi-VN')} ${escapeHTML(v.don_vi)}/${escapeHTML(g.don_vi_mua)}
                ${g.toi_thieu > 1 ? `<small class="kh-mo">tối thiểu ${g.toi_thieu}</small>` : ''}</td>
              <td data-label="Niêm yết" class="kh-so">${tien(g.gia)}
                <small>/${escapeHTML(g.don_vi_mua)}</small></td>
              <td data-label="Quy đổi" class="kh-so kh-nhan-manh">
                <b>${tien(g.don_gia_quy_doi)}</b>
                ${g.dat_hon_pt > 0 ? `<small class="kh-dat">+${g.dat_hon_pt}%</small>`
                  : '<small class="kh-re">thấp nhất</small>'}</td>
              <td data-label="Phải mua" class="kh-so">${g.can_mua} ${escapeHTML(g.don_vi_mua)}
                ${g.du_ra > 0 ? `<small class="kh-mo">dư ${g.du_ra}</small>` : ''}</td>
              <td data-label="Thành tiền" class="kh-so"><b>${tien(g.thanh_tien)}</b></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
        <p class="kh-ngan-ghi"><i class="ri-information-line"></i>
          <span>Đơn giá quy đổi là giá của <b>một ${escapeHTML(v.don_vi)}</b> sau khi chia theo
          quy cách đóng gói. Đây là con số duy nhất so sánh được khi các nhà bán hộp,
          thùng, vỉ khác nhau.</span></p>`}
    <div style="margin-top:8px;">
      <button type="button" class="secondary-button kh-nho" id="khMoFormGia">
        <i class="ri-add-line"></i> ${hienFormBangGia ? 'Đóng biểu mẫu' : 'Thêm báo giá mới'}
      </button>
    </div>
    ${formGia}`);

  const donVe = dsDon.filter((d) => !['da_giao', 'huy'].includes(d.trang_thai)
    && d.dong.some((x) => x.vat_tu === v.id && !x.da_du));
  const khoiDonVe = donVe.length ? nganMuc('Đơn đang về', `
    <table class="kh-ngan-bang">
      <tbody>${donVe.map((d) => {
        const x = d.dong.find((y) => y.vat_tu === v.id);
        return `<tr>
          <td><button type="button" class="kh-lien-ket" data-ngan-don="${escapeHTML(d.id)}">
            ${escapeHTML(d.id)}</button>
            <small>${escapeHTML(d.ten_ncc)} · hẹn ${ngayHien(d.hen_giao)}${
              d.tre_hen ? ` · <span class="kh-tre">trễ ${d.so_ngay_tre} ngày</span>` : ''}</small></td>
          <td class="kh-so"><b>${(x.con_thieu * x.quy_cach).toLocaleString('vi-VN')}</b>
            <small>${escapeHTML(v.don_vi)} chưa về</small></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`) : '';

  return `${nganDau('Chi tiết vật tư', escapeHTML(v.ten),
    `${escapeHTML(v.ma)} · ${escapeHTML(NHOM_VAT_TU[v.nhom])} · đơn vị <b>${escapeHTML(v.don_vi)}</b>`)}
    ${nganSo([
      { so: v.so_luong.toLocaleString('vi-VN'), ten: `tồn (${v.don_vi})` },
      { so: v.dinh_muc_hien.toLocaleString('vi-VN'), ten: 'định mức' },
      { so: v.dang_cho_ve ? `+${v.dang_cho_ve.toLocaleString('vi-VN')}` : '—', ten: 'đang về' },
      { so: can ? can.toLocaleString('vi-VN') : '—', ten: 'cần bù',
        lop: can ? 'kh-ngan-can' : '' },
      { so: v.so_nha_cung_cap, ten: 'nhà báo giá' },
    ])}
    <div class="kh-ngan-muc kh-ngan-muc-dau">${nhanMuc(v.muc_ton)}
      ${v.co.length ? `<div class="kh-co-hang">${coDacBiet(v.co)}</div>` : ''}</div>
    ${canhBao}
    ${tonKho}
    ${khoiDonVe}
    ${bangGia}`;
}

/* ── Tab: Đơn hàng ────────────────────────────────────────────────────── */

function veFormDonHang() {
  if (!hienFormDon) return '';
  const cn = chiNhanh || CHI_NHANH[0]?.ma || 'le-van-tho';
  return `<div class="kh-form-phieu" style="margin-bottom:14px;">
    <b>Tạo đơn đặt hàng mới</b>
    <div class="kh-form-luoi">
      ${oLoc('Chi nhánh nhận hàng', `<select id="dhChiNhanh">
        ${CHI_NHANH.map((c) => opt(c.ma, c.ten, cn)).join('')}</select>`)}
      ${oLoc('Nhà cung cấp *', `<select id="dhNcc">
        ${opt('', '— Chọn nhà cung cấp —', '')}
        ${dsNcc.map((n) => opt(n.id, n.ten, '')).join('')}</select>`)}
      ${oLoc('Ngày hẹn giao', `<input type="date" id="dhHenGiao" value="${todayISO()}">`)}
      ${oLoc('Ghi chú đơn', '<input type="text" id="dhGhiChu" placeholder="Ghi chú đơn hàng...">')}
    </div>

    <div class="kh-px-dong">
      <b>Danh sách vật tư đặt mua</b>
      ${dongDonMoi.map((d, i) => `<div class="kh-px-hang" style="grid-template-columns: minmax(0, 1.5fr) 100px 90px 110px auto;">
        <select data-dh-dong-vt="${i}">
          ${opt('', '— chọn vật tư —', d.vat_tu)}
          ${dsVatTu.map((v) => opt(v.id, `${v.ma} · ${v.ten} (${v.don_vi})`, d.vat_tu)).join('')}
        </select>
        <input type="number" min="1" placeholder="SL" value="${d.so_luong || ''}" data-dh-dong-sl="${i}">
        <input type="text" placeholder="Đơn vị mua" value="${escapeHTML(d.don_vi_mua || 'hộp')}" data-dh-dong-dvm="${i}">
        <input type="number" min="0" step="1000" placeholder="Đơn giá (đ)" value="${d.don_gia || ''}" data-dh-dong-dg="${i}">
        <button type="button" class="ghost-button kh-nho" data-dh-bo-dong="${i}">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>`).join('')}
      <button type="button" class="ghost-button kh-nho" id="dhThemDong">
        <i class="ri-add-line"></i> Thêm dòng vật tư
      </button>
    </div>

    <div class="kh-nut-hang">
      <button type="button" class="ghost-button" id="dhHuy">Huỷ</button>
      <button type="button" class="primary-button" id="dhLuu">
        <i class="ri-save-line"></i> Tạo đơn hàng (chờ duyệt)
      </button>
    </div>
  </div>`;
}

function veDonHang() {
  const dong = dsDon.map((d) => {
    const tt = TRANG_THAI_DON[d.trang_thai];
    return `<tr class="${d.tre_hen ? 'kh-hang-tre' : ''}">
      <td data-label="Mã đơn"><b class="kh-ma">${escapeHTML(d.id)}</b></td>
      <td data-label="Nhà cung cấp">
        <div class="kh-ten">
          <b>${escapeHTML(d.ten_ncc)}</b>
          <small>${escapeHTML(tenChiNhanhKho(d.chi_nhanh))} · ${escapeHTML(tenNguoi(d.nguoi_dat))}</small>
        </div>
      </td>
      <td data-label="Đặt">${ngayHien(d.ngay_dat)}</td>
      <td data-label="Hẹn giao">${ngayHien(d.hen_giao)}
        ${d.tre_hen ? `<small class="kh-tre">trễ ${d.so_ngay_tre} ngày</small>` : ''}</td>
      <td data-label="Dòng">${d.dong.length}
        ${d.so_dong_thieu ? `<small class="kh-tre">${d.so_dong_thieu} chưa đủ</small>` : ''}</td>
      <td data-label="Giá trị" class="kh-so">${tien(d.tong_tien)}</td>
      <td data-label="Trạng thái"><span class="status-pill ${tt.lop}">${tt.ten}</span></td>
      <td data-label="" class="kh-cot-nut">
        <button type="button" class="secondary-button kh-nho" data-mo-don="${escapeHTML(d.id)}">
          <i class="ri-folder-open-line"></i> Mở
        </button>
      </td>
    </tr>`;
  }).join('');

  return `<section class="panel">
    <header class="section-title kh-header">
      <h3>Đơn đặt hàng</h3>
      <span class="pill">${dsDon.length} đơn khớp bộ lọc</span>
      <div class="kh-header-nut">
        <button type="button" class="${hienFormDon ? 'secondary-button' : 'primary-button'}" id="khMoFormDon">
          <i class="ri-add-line"></i> ${hienFormDon ? 'Đóng biểu mẫu' : 'Tạo đơn đặt hàng'}
        </button>
      </div>
    </header>

    ${veFormDonHang()}

    <div class="lt-tim-lon">
      <i class="ri-search-line"></i>
      <input type="search" id="dTim" value="${escapeHTML(dTim)}"
             placeholder="Tìm theo mã đơn, nhà cung cấp, tên vật tư trong đơn">
    </div>

    <div class="kh-loc">
      ${oLoc('Nhà cung cấp', `<select id="dNcc">${opt('', 'Tất cả nhà cung cấp', dNcc)}
        ${dsNcc.map((n) => opt(n.id, n.ten, dNcc)).join('')}</select>`)}
      ${oLoc('Trạng thái', `<select id="dTrangThai">${opt('', 'Mọi trạng thái', dTrangThai)}
        ${Object.entries(TRANG_THAI_DON).map(([m, t]) => opt(m, t.ten, dTrangThai)).join('')}</select>`)}
      <label class="kh-tick"><input type="checkbox" id="dChiTre"${dChiTre ? ' checked' : ''}>
        <span>Chỉ đơn trễ hẹn</span></label>
      <label class="kh-tick"><input type="checkbox" id="dChiThieu"${dChiThieu ? ' checked' : ''}>
        <span>Còn dòng chưa giao đủ</span></label>
    </div>

    <div class="hh-bang-wrap kh-bang">
      <table class="hh-bang">
        <thead><tr>
          <th>Mã đơn</th><th>Nhà cung cấp</th><th>Đặt</th><th>Hẹn giao</th>
          <th>Dòng</th><th>Giá trị</th><th>Trạng thái</th><th></th>
        </tr></thead>
        <tbody>${dong || '<tr><td colspan="8" class="empty-state">Không có đơn nào khớp bộ lọc.</td></tr>'}</tbody>
      </table>
    </div>
  </section>`;
}

function veNganDon() {
  const d = dsDon.find((x) => x.id === nganMo.id);
  if (!d) return '';
  const tt = TRANG_THAI_DON[d.trang_thai];
  const choNhan = !['da_giao', 'huy'].includes(d.trang_thai);

  return `${nganDau('Đơn đặt hàng', `${escapeHTML(d.id)} · ${escapeHTML(d.ten_ncc)}`,
      `${escapeHTML(tenChiNhanhKho(d.chi_nhanh))} · đặt ${ngayHien(d.ngay_dat)}
       · hẹn giao ${ngayHien(d.hen_giao)}`)}
    ${nganSo([
      { so: `<span class="status-pill ${tt.lop}">${tt.ten}</span>`, ten: 'trạng thái' },
      { so: d.dong.length, ten: 'dòng hàng' },
      { so: d.so_dong_thieu || '—', ten: 'chưa đủ',
        lop: d.so_dong_thieu ? 'kh-ngan-can' : '' },
      { so: trieu(d.tong_tien), ten: 'giá trị đơn' },
    ])}

      ${d.tre_hen ? `<div class="kh-canh kh-canh-bad">
        <i class="ri-time-line"></i>
        <div><b>Trễ ${d.so_ngay_tre} ngày so với hẹn giao</b>
        <span>Còn ${d.so_dong_thieu} dòng chưa nhận đủ. Gọi ${escapeHTML(d.ten_ncc)} để chốt lại ngày.</span></div>
      </div>` : ''}

      ${d.ghi_chu ? `<p class="kh-ghi-chu">${escapeHTML(d.ghi_chu)}</p>` : ''}

      ${nganMuc('Các dòng hàng', `
      <div class="kh-ngan-cuon">
        <table class="hh-bang">
          <thead><tr>
            <th>Vật tư</th><th>Đặt</th><th>Đã nhận</th><th>Còn thiếu</th>
            <th>Đơn giá</th><th>Thành tiền</th>${choNhan ? '<th>Nhận thêm</th>' : ''}
          </tr></thead>
          <tbody>${d.dong.map((x) => `<tr>
            <td data-label="Vật tư">
              <div class="kh-ten">
                <b>${escapeHTML(x.ten)}</b>
                <small>${escapeHTML(x.ma)} · ${x.quy_cach} ${escapeHTML(x.don_vi)}/${escapeHTML(x.don_vi_mua)}</small>
                ${x.co.length ? `<div class="kh-co-hang">${coDacBiet(x.co)}</div>` : ''}
              </div>
            </td>
            <td data-label="Đặt" class="kh-so">${x.so_luong} ${escapeHTML(x.don_vi_mua)}</td>
            <td data-label="Đã nhận" class="kh-so">${x.da_nhan}</td>
            <td data-label="Còn thiếu" class="kh-so">${x.da_du
              ? '<span class="status-pill good">Đủ</span>'
              : `<span class="kh-tre"><b>${x.con_thieu}</b> ${escapeHTML(x.don_vi_mua)}</span>`}</td>
            <td data-label="Đơn giá" class="kh-so">${tien(x.don_gia)}</td>
            <td data-label="Thành tiền" class="kh-so">${tien(x.thanh_tien)}</td>
            ${choNhan ? `<td data-label="Nhận thêm">${x.da_du ? '<span class="kh-mo">—</span>'
              : `<input type="number" class="kh-o-nhan" data-nhan="${escapeHTML(x.vat_tu)}"
                   min="0" max="${x.con_thieu}" placeholder="0">`}</td>` : ''}
          </tr>`).join('')}</tbody>
          <tfoot><tr>
            <td colspan="5" class="kh-so"><b>Tổng giá trị đơn</b></td>
            <td class="kh-so"><b>${tien(d.tong_tien)}</b></td>
            ${choNhan ? '<td></td>' : ''}
          </tr></tfoot>
        </table>
      </div>`)}

      ${choNhan ? `<div class="kh-nut-hang">
        <button type="button" class="ghost-button" data-doi-don="${escapeHTML(d.id)}:huy">
          Huỷ đơn
        </button>
        ${d.trang_thai === 'cho_duyet' ? `<button type="button" class="secondary-button"
          data-doi-don="${escapeHTML(d.id)}:da_dat">Duyệt và đặt hàng</button>` : ''}
        <button type="button" class="primary-button" id="khNhanHang">
          <i class="ri-inbox-archive-line"></i> Ghi nhận hàng về
        </button>
      </div>` : ''}

      ${veHoaDon(d)}`;
}

/* Hoá đơn kèm ảnh chụp.
 *
 * Đối chiếu tiền hoá đơn với tiền đơn đặt ngay tại chỗ. Lệch tiền là thứ phải
 * biết lúc nhận hàng, không phải để kế toán phát hiện sau một tháng khi đã
 * thanh toán xong và không đòi lại được.
 */
function veHoaDon(d) {
  return `<section class="kh-hd">
    <header class="section-title kh-header">
      <h3>Hoá đơn và chứng từ</h3>
      <span class="pill">${hoaDonCuaDon.length} hoá đơn</span>
    </header>

    ${hoaDonCuaDon.map((h) => `<article class="kh-hd-the">
      <div class="kh-hd-dau">
        <div>
          <b>Hoá đơn ${escapeHTML(h.so)}</b>
          <small>${ngayHien(h.ngay)}${h.ghi_chu ? ` · ${escapeHTML(h.ghi_chu)}` : ''}</small>
        </div>
        <div class="kh-hd-tien">
          <b>${tien(h.tien)}</b>
          ${h.lech_tien !== 0 ? `<span class="kh-lech">
            ${h.lech_tien > 0 ? 'Cao hơn' : 'Thấp hơn'} đơn đặt ${tien(Math.abs(h.lech_tien))}
          </span>` : '<span class="kh-khop">Khớp đơn đặt</span>'}
        </div>
      </div>
      <div class="kh-anh-luoi">
        ${h.anh.map((a) => `<figure class="kh-anh">
          <img src="${a.data}" alt="Ảnh hoá đơn ${escapeHTML(h.so)}" loading="lazy">
          <button type="button" class="kh-anh-xoa" title="Gỡ ảnh khỏi hoá đơn"
            data-xoa-anh="${escapeHTML(h.id)}:${escapeHTML(a.ma_bam)}">
            <i class="ri-close-line"></i>
          </button>
        </figure>`).join('')}
        <label class="kh-anh-them">
          <input type="file" accept="image/*" multiple hidden
                 data-tai-anh-hd="${escapeHTML(h.id)}">
          <i class="ri-camera-line"></i>
          <span>Chụp / tải ảnh hoá đơn</span>
          <small>Tự nén WebP trước khi lưu</small>
        </label>
      </div>
    </article>`).join('')}

    <div class="kh-hd-them">
      <b>Thêm hoá đơn cho đơn ${escapeHTML(d.id)}</b>
      <div class="kh-form-luoi">
        ${oLoc('Số hoá đơn *', '<input type="text" id="hdSo" placeholder="VT-2026-01184">')}
        ${oLoc('Ngày hoá đơn', `<input type="date" id="hdNgay" value="${todayISO()}">`)}
        ${oLoc('Số tiền (đ) *', `<input type="number" id="hdTien" min="0" step="1000"
          placeholder="${d.tong_tien}">`)}
        ${oLoc('Ghi chú', '<input type="text" id="hdGhiChu" placeholder="Hoá đơn VAT bản cứng đã gửi kế toán">')}
      </div>
      <div class="kh-nut-hang">
        <button type="button" class="secondary-button" id="khThemHd">
          <i class="ri-add-line"></i> Thêm hoá đơn
        </button>
      </div>
    </div>
  </section>`;
}

/* ── Tab: Phiếu xuất kho ──────────────────────────────────────────────── */

function vePhieuXuat() {
  const the = dsPhieu.map((p) => {
    const tt = TRANG_THAI_PHIEU[p.trang_thai];
    return `<article class="kh-px ${p.trang_thai === 'nhap' ? 'kh-px-nhap' : ''}">
      <header class="kh-px-dau">
        <div>
          <b>${escapeHTML(p.id)}</b>
          <span class="status-pill ${tt.lop}">${tt.ten}</span>
          ${p.co_dac_biet ? '<span class="kh-co kh-co-warn"><i class="ri-alert-line"></i>Có vật tư đặc biệt</span>' : ''}
        </div>
        <span class="kh-mo">${ngayHien(p.ngay)}</span>
      </header>
      <p class="kh-px-den">
        <i class="ri-arrow-right-line"></i>
        <b>${escapeHTML(p.ten_noi_nhan)}</b>
        ${p.nguoi_nhan !== '—' ? ` · nhận: ${escapeHTML(p.nguoi_nhan)}` : ''}
        <small>${escapeHTML(tenChiNhanhKho(p.chi_nhanh))} · xuất bởi ${escapeHTML(p.ten_nguoi_xuat)}</small>
      </p>
      ${p.ly_do ? `<p class="kh-px-ly-do">${escapeHTML(p.ly_do)}</p>` : ''}
      <ul class="kh-px-ds">
        ${p.dong.map((x) => `<li class="${x.vuot_ton ? 'kh-px-vuot' : ''}">
          <span>${escapeHTML(x.ten)}</span>
          <b>${x.so_luong} ${escapeHTML(x.don_vi)}</b>
          ${x.vuot_ton ? `<small class="kh-tre">kho chỉ còn ${x.ton_hien}</small>`
            : `<small class="kh-mo">tồn ${x.ton_hien}</small>`}
        </li>`).join('')}
      </ul>
      ${p.trang_thai === 'nhap' ? `<div class="kh-nut-hang">
        <button type="button" class="ghost-button kh-nho" data-huy-phieu="${escapeHTML(p.id)}">
          Huỷ phiếu
        </button>
        <button type="button" class="primary-button kh-nho" data-xuat-phieu="${escapeHTML(p.id)}"
          ${p.co_vuot_ton ? 'disabled title="Có dòng vượt tồn kho, sửa số lượng trước khi xuất"' : ''}>
          <i class="ri-check-line"></i> Xuất kho
        </button>
      </div>` : ''}
    </article>`;
  }).join('');

  return `<section class="panel">
    <header class="section-title kh-header">
      <h3>Phiếu xuất kho</h3>
      <span class="pill">${dsPhieu.length} phiếu</span>
      <div class="kh-header-nut">
        <button type="button" class="${hienFormPhieu ? 'secondary-button' : 'primary-button'}" id="khMoFormPhieu">
          <i class="ri-add-line"></i> ${hienFormPhieu ? 'Đóng biểu mẫu' : 'Lập phiếu xuất'}
        </button>
      </div>
    </header>

    ${veFormPhieu()}

    <div class="lt-tim-lon">
      <i class="ri-search-line"></i>
      <input type="search" id="pTim" value="${escapeHTML(pTim)}"
             placeholder="Tìm theo mã phiếu, nơi nhận, người nhận, tên vật tư">
    </div>
    <div class="kh-loc">
      ${oLoc('Nơi nhận', `<select id="pNoiNhan">${opt('', 'Mọi nơi nhận', pNoiNhan)}
        ${Object.entries(NOI_NHAN).map(([m, t]) => opt(m, t, pNoiNhan)).join('')}</select>`)}
      ${oLoc('Trạng thái', `<select id="pTrangThai">${opt('', 'Mọi trạng thái', pTrangThai)}
        ${Object.entries(TRANG_THAI_PHIEU).map(([m, t]) => opt(m, t.ten, pTrangThai)).join('')}</select>`)}
    </div>

    <div class="kh-px-luoi">
      ${the || '<p class="empty-state">Chưa có phiếu xuất nào khớp bộ lọc.</p>'}
    </div>
  </section>`;
}

function veFormPhieu() {
  if (!hienFormPhieu) return '';
  const cn = chiNhanh || CHI_NHANH[0].ma;
  const coSan = dsVatTu.filter((v) => v.so_luong > 0);

  return `<div class="kh-form-phieu">
    <div class="kh-form-luoi">
      ${oLoc('Chi nhánh xuất', `<select id="pxChiNhanh">
        ${CHI_NHANH.map((c) => opt(c.ma, c.ten, cn)).join('')}</select>`)}
      ${oLoc('Nơi nhận *', `<select id="pxNoiNhan">
        ${Object.entries(NOI_NHAN).map(([m, t]) => opt(m, t, 'phong_1')).join('')}</select>`)}
      ${oLoc('Người nhận', '<input type="text" id="pxNguoiNhan" placeholder="Tên người ký nhận">')}
      ${oLoc('Lý do xuất', '<input type="text" id="pxLyDo" placeholder="Cấp vật tư đầu ca sáng">')}
    </div>

    <div class="kh-px-dong">
      <b>Vật tư xuất</b>
      ${dongPhieuMoi.map((d, i) => `<div class="kh-px-hang">
        <select data-dong-vt="${i}">
          ${opt('', '— chọn vật tư —', d.vat_tu)}
          ${coSan.map((v) => opt(v.id, `${v.ma} · ${v.ten} (còn ${v.so_luong} ${v.don_vi})`, d.vat_tu)).join('')}
        </select>
        <input type="number" min="1" placeholder="Số lượng" value="${d.so_luong || ''}"
               data-dong-sl="${i}">
        <button type="button" class="ghost-button kh-nho" data-bo-dong="${i}">
          <i class="ri-delete-bin-line"></i>
        </button>
      </div>`).join('')}
      <button type="button" class="ghost-button kh-nho" id="pxThemDong">
        <i class="ri-add-line"></i> Thêm dòng
      </button>
    </div>

    <div class="kh-nut-hang">
      <button type="button" class="ghost-button" id="pxHuy">Huỷ</button>
      <button type="button" class="primary-button" id="pxLuu">
        <i class="ri-save-line"></i> Lưu phiếu nháp
      </button>
    </div>
    <p class="kh-ngan-ghi"><i class="ri-information-line"></i>
      <span>Phiếu lưu ở trạng thái <b>nháp</b>, chưa trừ kho. Vật tư chỉ rời kho khi
      bấm <b>Xuất kho</b> — để người lập và người duyệt xuất có thể là hai người.</span></p>
  </div>`;
}

/* ── Tab: Đề xuất mua hàng chuẩn BM03 & Quy trình Supply Chain ───────── */

function veDeXuat() {
  const phieu = phieuDeXuatHienTai;
  if (!phieu) {
    return `<section class="panel">
      <header class="section-title kh-header">
        <h3>Đề xuất mua hàng</h3>
        <button type="button" class="primary-button" id="btnTaoPhieuMoi">
          <i class="ri-add-line"></i> Tạo phiếu đề xuất mới
        </button>
      </header>
      <p class="empty-state">Chưa có phiếu đề xuất mua hàng nào cho kho này. Nhấn Tạo phiếu mới để bắt đầu.</p>
    </section>`;
  }

  // Nhóm các dòng theo Ngành hàng
  const theoNganh = {};
  (phieu.dong || []).forEach((d, idx) => {
    const nh = d.nganh_hang || 'VẬT LIỆU - TỔNG QUÁT';
    (theoNganh[nh] ||= []).push({ ...d, _idx: idx });
  });

  // Lọc ngành hàng nếu người dùng chọn pill filter
  const cacNganhCoSan = [
    { ma: 'all', ten: 'Tất cả ngành hàng' },
    { ma: 'VẬT LIỆU - TỔNG QUÁT', ten: 'Vật liệu tổng quát' },
    { ma: 'CHỈNH NHA', ten: 'Chỉnh nha' },
    { ma: 'IMPLANT', ten: 'Implant' },
    { ma: 'CÔNG CỤ DỤNG CỤ', ten: 'Công cụ dụng cụ' },
    { ma: 'TIÊU HAO & VÔ TRÙNG', ten: 'Tiêu hao & Vô trùng' },
  ];

  // Tính tổng tiền
  const tongTien = (phieu.dong || []).reduce((s, d) => s + (Number(d.thanh_tien) || (Number(d.so_luong) * Number(d.don_gia)) || 0), 0);
  const soMatHang = phieu.dong?.length || 0;

  // Lấy danh sách kết quả tìm kiếm vật tư nếu người dùng đang gõ tìm kiếm
  let dsTimKiem = [];
  if (dxTimKiemVatTu.trim()) {
    const q = dxTimKiemVatTu.trim().toLowerCase();
    dsTimKiem = dsVatTu.filter((v) =>
      v.ten.toLowerCase().includes(q) || v.ma.toLowerCase().includes(q)
    ).slice(0, 10);
  }

  return `
    <div class="bm03-workspace">
      <!-- Toolbar thao tác đỉnh -->
      <section class="bm03-toolbar">
        <div class="bm03-tool-left">
          <label>
            <span style="font-size: 0.78rem; font-weight: 700; color: #475569; display: block; margin-bottom: 2px;">Phiếu đề xuất mua hàng:</span>
            <select class="bm03-phieu-select" id="selPhieuDeXuat">
              ${dsPhieuDeXuat.map((p) => `<option value="${p.id}" ${p.id === phieu.id ? 'selected' : ''}>${escapeHTML(p.so_phieu || p.id)} · ${escapeHTML(p.tieu_de || '')} (${p.so_mat_hang || (p.dong?.length || 0)} món)</option>`).join('')}
            </select>
          </label>
          <span class="status-pill ${phieu.trang_thai === 'da_tao_don' ? 'good' : phieu.trang_thai === 'da_duyet' ? 'info' : 'warn'}">
            ${phieu.trang_thai === 'da_tao_don' ? 'Đã tạo đơn PO' : phieu.trang_thai === 'da_duyet' ? 'Đã phê duyệt' : phieu.trang_thai === 'cho_duyet' ? 'Chờ duyệt' : 'Bản nháp'}
          </span>
        </div>

        <div class="bm03-tool-right">
          <button type="button" class="secondary-button" id="btnTaoPhieuMoi" title="Lập một phiếu đề xuất mua hàng mới">
            <i class="ri-add-line"></i> Phiếu mới
          </button>
          <button type="button" class="secondary-button" id="btnThemDongMoi" style="border-color: #0f8b7f; color: #0f8b7f;" title="Thêm một dòng mặt hàng mới vào phiếu đề xuất">
            <i class="ri-add-circle-line"></i> Thêm mặt hàng
          </button>
          <button type="button" class="secondary-button" id="btnMoGoiYHangThieu" style="border-color: #f59e0b; color: #b45309; background: #fffbeb;" title="Xem các mặt hàng tồn dưới định mức để tick chọn bổ sung">
            <i class="ri-flashlight-line"></i> Gợi ý hàng thiếu (${dsGoiYHangThieu.length})
          </button>
          <button type="button" class="secondary-button" id="btnXuatExcelBM03" style="border-color: #0f8b7f; color: #0f8b7f;" title="Tải về file Excel phiếu đề xuất mua hàng">
            <i class="ri-file-excel-2-line"></i> Xuất Excel
          </button>
          <button type="button" class="primary-button" id="btnTaoDonTuPhieu" style="background: #0f8b7f;" title="Chuyển các mặt hàng trong phiếu thành các đơn đặt hàng theo từng Nhà cung cấp">
            <i class="ri-shopping-cart-2-line"></i> Tạo đơn PO
          </button>
          <button type="button" class="primary-button" id="btnLuuPhieuDeXuat">
            <i class="ri-save-line"></i> Lưu phiếu
          </button>
        </div>
      </section>

      <!-- Khung Cung Ứng & Tìm kiếm thông minh -->
      <section class="bm03-supply-box">
        <div class="bm03-supply-header">
          <h4><i class="ri-search-eye-line"></i> Tìm kiếm hàng hóa &amp; So sánh nhà cung cấp</h4>
          <span style="font-size: 0.8rem; color: #64748b;">Gõ tên hoặc mã hàng để tìm, xem bảng giá các NCC rồi thêm vào phiếu</span>
        </div>

        <div class="bm03-categories">
          ${cacNganhCoSan.map((c) => `
            <button type="button" class="bm03-cat-btn ${dxNganhHangFilter === c.ma ? 'is-active' : ''}" data-dx-cat="${c.ma}">
              ${escapeHTML(c.ten)}
            </button>
          `).join('')}
        </div>

        <div class="bm03-search-bar">
          <i class="ri-search-line"></i>
          <input type="text" id="dxTimKiem" placeholder="Gõ tên vật tư, mã hàng (VD: Cồn 70 độ, Mắc cài, CIDEX, Khăn giấy, Mũi khoan, Mini vis...)" value="${escapeHTML(dxTimKiemVatTu)}" autocomplete="off">
          ${dsTimKiem.length ? `
            <div class="bm03-search-dropdown">
              ${dsTimKiem.map((v) => `
                <div class="bm03-search-item" data-chon-tim-vt="${v.id}">
                  <div>
                    <strong style="color: #0f4c45;">${escapeHTML(v.ten)}</strong>
                    <small style="display: block; color: #64748b;">Mã: ${escapeHTML(v.ma)} · ĐVT: ${escapeHTML(v.don_vi)} · Tồn kho hiện tại: <b>${v.so_luong}</b> (Định mức: ${v.dinh_muc_hien})</small>
                  </div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: #0f8b7f;">${tien(v.gia_von || 0)}</span>
                    <button type="button" class="secondary-button" style="padding: 4px 10px; font-size: 0.78rem;" data-so-sanh-them="${v.id}">
                      <i class="ri-scales-3-line"></i> So sánh giá &amp; Chọn
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </section>

      <!-- Tờ giấy Phiếu đề xuất mua hàng -->
      <section class="bm03-paper">
        <header class="bm03-header-top">
          <div>
            <div class="bm03-company-name">CÔNG TY CỔ PHẦN 5S SÀI GÒN</div>
            <div style="margin-top: 6px; font-size: 0.84rem; color: #475569;">
              <b>Số phiếu:</b> <input type="text" id="bm03SoPhieu" value="${escapeHTML(phieu.so_phieu || '')}" style="font-weight: 700; width: 130px; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px;">
            </div>
          </div>

          <div class="bm03-main-title">
            <h2>PHIẾU ĐỀ XUẤT MUA HÀNG</h2>
            <span style="font-size: 0.88rem; color: #475569; font-weight: 600;">Kế hoạch: Bổ sung định kỳ kho phòng khám</span>
          </div>

          <div class="bm03-code-box" style="text-align: right; font-size: 0.8rem; color: #64748b;">
            <b>HỆ THỐNG NHA KHOA 5S</b><br>
            Phiếu đề xuất mua hàng<br>
            Lưu hành nội bộ
          </div>
        </header>

        <div class="bm03-meta-grid">
          <label>
            <span>Đơn vị lập:</span>
            <input type="text" id="bm03DonViLap" value="CÔNG TY CỔ PHẦN 5S SÀI GÒN" readonly style="background: #f1f5f9;">
          </label>
          <label>
            <span>Bộ phận đề xuất:</span>
            <input type="text" id="bm03BoPhan" value="${escapeHTML(phieu.bo_phan || 'Kho vật tư')}">
          </label>
          <label>
            <span>Người tạo:</span>
            <input type="text" id="bm03NguoiTao" value="${escapeHTML(phieu.nguoi_tao || 'Thủ kho')}">
          </label>
          <label>
            <span>Ngày tạo phiếu:</span>
            <input type="date" id="bm03NgayTao" value="${escapeHTML(phieu.ngay_tao || '')}">
          </label>
          <label>
            <span>Kho hàng:</span>
            <input type="text" id="bm03KhoHang" value="${escapeHTML(phieu.kho_hang || 'Kho Lê Văn Thọ')}">
          </label>
          <label>
            <span>Thủ kho phụ trách:</span>
            <input type="text" id="bm03ThuKho" value="${escapeHTML(phieu.thu_kho || 'Nguyễn Thị Như Huỳnh')}">
          </label>
          <label style="grid-column: span 2;">
            <span>Ghi chú / Mục đích đợt mua:</span>
            <input type="text" id="bm03GhiChu" value="${escapeHTML(phieu.ghi_chu || '')}" placeholder="VD: Bổ sung định kỳ tháng 9...">
          </label>
        </div>

        <!-- Bảng chi tiết phân ngành hàng -->
        <div class="bm03-table-wrap">
          <table class="bm03-table">
            <thead>
              <tr>
                <th style="width: 40px;" rowspan="2">STT</th>
                <th rowspan="2">Mô tả hàng hóa</th>
                <th style="width: 110px;" rowspan="2">Thông số KT</th>
                <th style="width: 60px;" rowspan="2">ĐVT</th>
                <th colspan="2">Số lượng</th>
                <th colspan="2">Tham khảo (VNĐ)</th>
                <th style="width: 110px;" rowspan="2">Thời gian cần</th>
                <th rowspan="2">Mục đích sử dụng</th>
                <th style="width: 180px;" rowspan="2">Nhà cung cấp</th>
                <th style="width: 50px;" rowspan="2">Xóa</th>
              </tr>
              <tr>
                <th style="width: 60px;">Tồn</th>
                <th style="width: 75px;">Đề xuất</th>
                <th style="width: 105px;">Đơn giá (VAT)</th>
                <th style="width: 115px;">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${soMatHang === 0 ? `
                <tr>
                  <td colspan="12" style="text-align: center; padding: 48px 20px; background: #f8fafc;">
                    <div style="max-width: 520px; margin: 0 auto;">
                      <i class="ri-file-list-3-line" style="font-size: 3rem; color: #0f8b7f; display: inline-block; margin-bottom: 12px;"></i>
                      <h4 style="font-size: 1.05rem; font-weight: 700; color: #1e293b; margin-bottom: 6px;">Phiếu đề xuất mua hàng chưa có mặt hàng nào</h4>
                      <p style="font-size: 0.85rem; color: #64748b; line-height: 1.5; margin-bottom: 16px;">
                        Bạn có thể bấm <b>Gợi ý hàng thiếu</b> để nạp nhanh các vật tư tồn dưới định mức trong kho, tìm kiếm vật tư từ kho hàng ở khung phía trên, hoặc bấm <b>Thêm mặt hàng</b> để nhập dòng mới.
                      </p>
                      <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button type="button" class="primary-button" id="btnGoiYEmpty" style="background: #f59e0b;">
                          <i class="ri-flashlight-line"></i> Gợi ý hàng thiếu (${dsGoiYHangThieu.length})
                        </button>
                        <button type="button" class="secondary-button" id="btnThemDongEmpty" style="border-color: #0f8b7f; color: #0f8b7f;">
                          <i class="ri-add-line"></i> Thêm mặt hàng mới
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ` : ''}
              ${Object.entries(theoNganh).map(([nganhHang, dsDong]) => {
                if (dxNganhHangFilter !== 'all' && nganhHang !== dxNganhHangFilter) return '';
                const subTotal = dsDong.reduce((s, x) => s + (Number(x.thanh_tien) || (Number(x.so_luong) * Number(x.don_gia)) || 0), 0);
                return `
                  <tr class="bm03-sector-row">
                    <td colspan="12" class="bm03-sector-header">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span><i class="ri-bookmark-3-line"></i> ${escapeHTML(nganhHang)} (${dsDong.length} mặt hàng)</span>
                        <span style="font-weight: 700; color: #0e4c45;">Tổng nhóm: ${tien(subTotal)}</span>
                      </div>
                    </td>
                  </tr>
                  ${dsDong.map((item, rowIdx) => {
                    const idx = item._idx;
                    return `
                      <tr>
                        <td style="text-align: center; font-weight: 600; color: #64748b;">${rowIdx + 1}</td>
                        <td>
                          ${item.vat_tu_id ? `
                            <div style="font-weight: 700; color: #1e293b;">${escapeHTML(item.ten)}</div>
                            <small style="color: #64748b; font-size: 0.75rem;">Mã: ${escapeHTML(item.vat_tu_id)}</small>
                          ` : `
                            <input type="text" class="bm03-input-text" data-dx-ten="${idx}" value="${escapeHTML(item.ten || '')}" placeholder="Nhập tên mặt hàng...">
                          `}
                        </td>
                        <td>
                          <input type="text" class="bm03-input-text" data-dx-thong-so="${idx}" value="${escapeHTML(item.thong_so || '')}">
                        </td>
                        <td style="text-align: center; font-weight: 600;">
                          ${item.vat_tu_id ? escapeHTML(item.don_vi || 'Cái') : `
                            <input type="text" class="bm03-input-text" data-dx-dvt="${idx}" value="${escapeHTML(item.don_vi || 'Cái')}" style="width: 55px; text-align: center;">
                          `}
                        </td>
                        <td style="text-align: center; color: #64748b; background: #f8fafc; font-weight: 600;">
                          ${item.ton ?? 0}
                        </td>
                        <td>
                          <input type="number" min="1" class="bm03-input-num" data-dx-sl="${idx}" value="${item.so_luong || 1}">
                        </td>
                        <td style="text-align: right;">
                          <input type="number" min="0" step="1000" class="bm03-input-num" data-dx-gia="${idx}" value="${item.don_gia || 0}" style="width: 100px; text-align: right;">
                        </td>
                        <td class="col-total">
                          ${tien(item.thanh_tien || (item.so_luong * item.don_gia) || 0)}
                        </td>
                        <td>
                          <input type="date" class="bm03-input-text" data-dx-ngay="${idx}" value="${escapeHTML(item.thoi_gian || '2026-09-15')}">
                        </td>
                        <td>
                          <input type="text" class="bm03-input-text" data-dx-muc-dich="${idx}" value="${escapeHTML(item.muc_dich || 'Sử dụng điều trị lâm sàng')}">
                        </td>
                        <td>
                          <div style="display: flex; flex-direction: column; gap: 3px;">
                            <span style="font-weight: 700; color: #0e4c45; font-size: 0.78rem; line-height: 1.2;">
                              ${escapeHTML(item.ncc_ten || 'Dược & Vật Liệu Nha Khoa LVT')}
                            </span>
                            <button type="button" class="bm03-btn-ncc" data-dx-doi-ncc="${idx}">
                              <i class="ri-scales-3-line"></i> Đổi NCC / So giá
                            </button>
                          </div>
                        </td>
                        <td style="text-align: center;">
                          <button type="button" class="icon-button" style="color: #ef4444;" data-dx-xoa-dong="${idx}" title="Xóa mặt hàng khỏi phiếu">
                            <i class="ri-delete-bin-line"></i>
                          </button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="bm03-total-row">
                <td colspan="7" style="text-align: right; text-transform: uppercase;">
                  TỔNG CỘNG THÀNH TIỀN (ĐÃ BAO GỒM VAT):
                </td>
                <td class="col-total" style="font-size: 1.1rem;">
                  ${tien(tongTien)}
                </td>
                <td colspan="4" style="color: #64748b; font-weight: 600; font-size: 0.82rem;">
                  Tổng số mặt hàng: <b>${soMatHang}</b> mục
                </td>
              </tr>
            </tfoot>
          </table>
          <div style="padding: 10px 16px; background: #f8fafc; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
            <button type="button" class="secondary-button" id="btnThemDongDuoiBang" style="font-size: 0.82rem; padding: 5px 12px; border-color: #0f8b7f; color: #0f8b7f;">
              <i class="ri-add-line"></i> Thêm mặt hàng vào phiếu
            </button>
            <span style="font-size: 0.78rem; color: #64748b;">Phiếu đề xuất mua hàng · Hệ thống Nha khoa 5S</span>
          </div>
        </div>

        <!-- Khối chữ ký 4 bên chuẩn BM03 -->
        <div class="bm03-sign-date">
          Tp. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}
        </div>
        <div class="bm03-signatures-grid">
          <div class="bm03-sign-col">
            <strong>Trưởng bộ phận</strong>
            <small>(Ký và ghi rõ họ tên)</small>
            <div class="bm03-sign-box"></div>
          </div>
          <div class="bm03-sign-col">
            <strong>Kế toán trưởng</strong>
            <small>(Ký và ghi rõ họ tên)</small>
            <div class="bm03-sign-box"></div>
          </div>
          <div class="bm03-sign-col">
            <strong>Bộ phận quản lý kho</strong>
            <small>(Ký và ghi rõ họ tên)</small>
            <div class="bm03-sign-box"></div>
            <strong style="font-size: 0.85rem; color: #0f8b7f;">${escapeHTML(phieu.thu_kho || 'Nguyễn Thị Như Huỳnh')}</strong>
          </div>
          <div class="bm03-sign-col">
            <strong>Phê duyệt Ban Giám Đốc</strong>
            <small>(Ký và ghi rõ họ tên)</small>
            <div class="bm03-sign-box"></div>
          </div>
        </div>
      </section>

      <!-- Modal So Sánh Giá Nhà Cung Cấp -->
      ${modalSoSanhGia ? `
        <div class="bm03-dialog-overlay" id="modalSoSanhGiaNCC">
          <div class="bm03-dialog-content">
            <header class="bm03-dialog-header">
              <div>
                <h3 style="margin: 0; color: #0e4c45;"><i class="ri-scales-3-line"></i> So sánh giá Nhà Cung Cấp</h3>
                <span style="font-size: 0.85rem; color: #64748b;">Vật tư: <b>${escapeHTML(modalSoSanhGia.vat_tu.ten)}</b> (${escapeHTML(modalSoSanhGia.vat_tu.ma || '')})</span>
              </div>
              <button type="button" class="icon-button" id="btnDongModalSoSanhGia"><i class="ri-close-line"></i></button>
            </header>
            <div class="bm03-dialog-body">
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 12px 16px; font-size: 0.85rem; color: #166534;">
                <i class="ri-information-line"></i> Hệ thống hiển thị tất cả các nhà cung cấp có báo giá. Hãy chọn nhà cung cấp có mức giá và điều kiện giao hàng tốt nhất cho phòng khám.
              </div>
              <div style="display: grid; gap: 10px;">
                ${modalSoSanhGia.quotes.map((q, qIdx) => `
                  <div class="bm03-quote-card ${qIdx === 0 ? 'is-best' : ''}">
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <strong style="color: #1e293b; font-size: 0.95rem;">${escapeHTML(q.ncc_ten)}</strong>
                        ${qIdx === 0 ? '<span class="status-pill good"><i class="ri-award-line"></i> Giá rẻ nhất</span>' : ''}
                      </div>
                      <div style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">
                        ĐV mua: <b>${escapeHTML(q.don_vi_mua)}</b> (Quy cách: 1 ${escapeHTML(q.don_vi_mua)} = ${q.quy_cach} ${escapeHTML(modalSoSanhGia.vat_tu.don_vi || 'cái')})
                        · Đặt tối thiểu: <b>${q.toi_thieu}</b> ${escapeHTML(q.don_vi_mua)}
                        · Giao hàng: <b>${q.ngay_giao} ngày</b>
                        · Thanh toán: <b>${escapeHTML(q.thanh_toan || 'CK/TM')}</b>
                      </div>
                    </div>
                    <div style="text-align: right; min-width: 140px;">
                      <div style="font-size: 1.15rem; font-weight: 800; color: #0f8b7f;">${tien(q.gia)}</div>
                      <small style="color: #64748b; display: block; margin-bottom: 6px;">Đơn giá quy đổi: ${tien(q.don_gia_quy_doi)} / ${escapeHTML(modalSoSanhGia.vat_tu.don_vi || 'cái')}</small>
                      <button type="button" class="primary-button" style="padding: 5px 12px; font-size: 0.82rem;" data-chon-ncc-quote="${q.ncc_id}">
                        <i class="ri-check-line"></i> Chọn nhà này
                      </button>
                    </div>
                  </div>
                `).join('')}
                ${!modalSoSanhGia.quotes.length ? `
                  <p class="empty-state">Chưa có nhà cung cấp nào báo giá cho mặt hàng này. Hệ thống sẽ áp dụng theo giá vốn chuẩn.</p>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Drawer Gợi Ý Hàng Dưới Định Mức -->
      ${hienDrawerHangThieu ? `
        <div class="bm03-dialog-overlay" id="drawerHangThieuOverlay">
          <div class="bm03-dialog-content" style="max-width: 900px;">
            <header class="bm03-dialog-header">
              <div>
                <h3 style="margin: 0; color: #b45309;"><i class="ri-flashlight-line"></i> Gợi ý các mặt hàng đang thiếu tồn kho</h3>
                <span style="font-size: 0.85rem; color: #64748b;">Tick chọn các mặt hàng bạn muốn đưa vào Phiếu đề xuất mua hàng đợt này</span>
              </div>
              <button type="button" class="icon-button" id="btnDongDrawerHangThieu"><i class="ri-close-line"></i></button>
            </header>
            <div class="bm03-dialog-body">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="display: flex; align-items: center; gap: 6px; font-weight: 700; cursor: pointer;">
                  <input type="checkbox" id="chkChonTatCaHangThieu"> <span>Chọn tất cả (${dsGoiYHangThieu.length} mặt hàng)</span>
                </label>
                <button type="button" class="primary-button" id="btnThemHangThieuDaChon">
                  <i class="ri-add-line"></i> Thêm các mục đã chọn vào phiếu
                </button>
              </div>
              <div style="max-height: 480px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 10px;">
                <table class="bm03-table" style="font-size: 0.82rem;">
                  <thead>
                    <tr>
                      <th style="width: 36px;">Chọn</th>
                      <th>Mã &amp; Tên vật tư</th>
                      <th style="width: 70px;">Tồn kho</th>
                      <th style="width: 70px;">Định mức</th>
                      <th style="width: 80px;">Cần bù</th>
                      <th style="width: 100px;">Đơn giá rẻ nhất</th>
                      <th>Nhà cung cấp đề xuất</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${dsGoiYHangThieu.map((g, gIdx) => `
                      <tr>
                        <td style="text-align: center;">
                          <input type="checkbox" data-chk-thieu="${gIdx}" ${goiYChonMap[g.vat_tu.id] ? 'checked' : ''}>
                        </td>
                        <td>
                          <strong>${escapeHTML(g.vat_tu.ten)}</strong>
                          <small style="display: block; color: #64748b;">${escapeHTML(g.vat_tu.ma)} · ĐVT: ${escapeHTML(g.vat_tu.don_vi)}</small>
                        </td>
                        <td style="text-align: center; color: #ef4444; font-weight: 700;">${g.ton}</td>
                        <td style="text-align: center; color: #64748b;">${g.dinh_muc}</td>
                        <td style="text-align: center; font-weight: 800; color: #b45309;">+${g.can_bu} ${escapeHTML(g.vat_tu.don_vi)}</td>
                        <td style="text-align: right; font-weight: 700; color: #0f8b7f;">${tien(g.don_gia)}</td>
                        <td style="font-size: 0.78rem; font-weight: 600; color: #0e4c45;">${escapeHTML(g.ncc_ten)}</td>
                      </tr>
                    `).join('')}
                    ${!dsGoiYHangThieu.length ? `
                      <tr><td colspan="7" class="empty-state">Tất cả mặt hàng đều đạt đủ định mức.</td></tr>
                    ` : ''}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function veFormNcc() {
  if (!hienFormNcc) return '';
  return `<div class="kh-form-phieu" style="margin-bottom:14px;">
    <b>Thêm nhà cung cấp mới</b>
    <div class="kh-form-luoi">
      ${oLoc('Tên nhà cung cấp *', '<input type="text" id="nccTen" placeholder="VD: Công ty TNHH Nha khoa ABC">')}
      ${oLoc('Người liên hệ', '<input type="text" id="nccNguoi" placeholder="Chị Lan / Anh Dũng">')}
      ${oLoc('Số điện thoại', '<input type="text" id="nccDienThoai" placeholder="0903 118 224">')}
      ${oLoc('Thời gian giao (ngày)', '<input type="number" id="nccNgayGiao" min="1" max="30" value="2">')}
      ${oLoc('Điều khoản thanh toán', '<input type="text" id="nccThanhToan" placeholder="Công nợ 30 ngày, Thanh toán ngay...">')}
      ${oLoc('Đánh giá (sao)', '<input type="number" id="nccDanhGia" min="1" max="5" step="0.1" value="5.0">')}
      ${oLoc('Ghi chú', '<input type="text" id="nccGhiChu" placeholder="Giao nhanh, chuyên thuốc...">')}
    </div>
    <div class="kh-nut-hang">
      <button type="button" class="ghost-button" id="nccHuy">Huỷ</button>
      <button type="button" class="primary-button" id="nccLuu">
        <i class="ri-save-line"></i> Lưu nhà cung cấp
      </button>
    </div>
  </div>`;
}

function veNcc() {
  return `<section class="panel">
    <header class="section-title kh-header">
      <h3>Nhà cung cấp</h3>
      <span class="pill">${dsNcc.length} nhà đang hợp tác</span>
      <div class="kh-header-nut">
        <button type="button" class="${hienFormNcc ? 'secondary-button' : 'primary-button'}" id="khMoFormNcc">
          <i class="ri-add-line"></i> ${hienFormNcc ? 'Đóng biểu mẫu' : 'Thêm nhà cung cấp'}
        </button>
      </div>
    </header>
    ${veFormNcc()}
    <div class="lt-tim-lon">
      <i class="ri-search-line"></i>
      <input type="search" id="nTim" value="${escapeHTML(nTim)}"
             placeholder="Tìm theo tên công ty, người liên hệ, số điện thoại">
    </div>
    <div class="kh-ncc-luoi">
      ${dsNcc.map((n) => `<article class="kh-ncc">
        <header>
          <b>${escapeHTML(n.ten)}</b>
          <span class="kh-sao">${n.danh_gia}★</span>
        </header>
        <p class="kh-ncc-lien-he">
          <i class="ri-user-line"></i> ${escapeHTML(n.nguoi)}
          <i class="ri-phone-line"></i> ${escapeHTML(n.dien_thoai)}
        </p>
        <div class="kh-ncc-so">
          <div><b>${n.so_mat_hang}</b><span>mặt hàng</span></div>
          <div><b>${n.ngay_giao}</b><span>ngày giao</span></div>
          <div><b>${n.so_don}</b><span>đơn đã đặt</span></div>
          <div class="${n.so_don_tre ? 'kh-xau' : ''}">
            <b>${n.so_don_tre}</b><span>đơn trễ</span></div>
        </div>
        <p class="kh-ncc-dk"><i class="ri-bank-card-line"></i> ${escapeHTML(n.thanh_toan)}</p>
        <p class="kh-ncc-ghi">${escapeHTML(n.ghi_chu)}</p>
        <button type="button" class="ghost-button kh-nho" data-loc-ncc="${escapeHTML(n.id)}">
          <i class="ri-truck-line"></i> Xem ${n.so_don} đơn hàng
        </button>
      </article>`).join('') || '<p class="empty-state">Không tìm thấy nhà cung cấp nào.</p>'}
    </div>
  </section>`;
}

/* ── Tab: Xuất vật tư theo ca điều trị ────────────────────────────────── */

function veXuatVatTuCa() {
  const caDangChon = dsCa.find((c) => c.id === caDangChonId) || null;
  const dsLoc = dsCa;

  // Render form thêm ca nếu bật
  const formThemCa = hienFormThemCa ? `
    <div class="kh-form-phieu" style="margin-bottom: 12px; background: #fff; border: 1px dashed var(--teal);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <b style="color: #14332f;"><i class="ri-user-add-line"></i> Tiếp nhận ca điều trị mới</b>
        <button type="button" class="ghost-button kh-nho" id="caDongFormThem"><i class="ri-close-line"></i></button>
      </div>
      <div class="kh-form-luoi" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
        ${oLoc('Tên khách hàng *', '<input type="text" id="caMoiTenBn" placeholder="VD: ĐINH CÔNG HƯNG">')}
        ${oLoc('Mã khách hàng', '<input type="text" id="caMoiMaBn" placeholder="VD: PVC00047490">')}
        ${oLoc('Số điện thoại', '<input type="tel" id="caMoiSdt" placeholder="0844455558">')}
        ${oLoc('Dịch vụ / Thủ thuật *', '<input type="text" id="caMoiDichVu" placeholder="VD: Cạo vôi răng mức độ 1">')}
        ${oLoc('Bác sĩ điều trị', `<select id="caMoiBacSi">
          ${veOptgroupBacSi('')}
        </select>`)}
        ${oLoc('Chi nhánh', `<select id="caMoiChiNhanh">
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten, chiNhanh || 'pham-van-chieu')).join('')}
        </select>`)}
      </div>
      <div class="kh-nut-hang">
        <button type="button" class="ghost-button" id="caHuyFormThem">Huỷ</button>
        <button type="button" class="primary-button" id="caLuuFormThem"><i class="ri-check-line"></i> Tiếp nhận ca</button>
      </div>
    </div>
  ` : '';

  // Danh sách thẻ ca bên trái
  const theCa = dsLoc.map((c) => {
    const isChon = caDangChon && caDangChon.id === c.id;
    const daXuat = c.trang_thai_xuat === 'da_xuat';
    return `
      <div class="kh-ca-item ${isChon ? 'is-selected' : ''}" data-chon-ca="${escapeHTML(c.id)}">
        <div class="kh-ca-item-khach">
          <span>${escapeHTML(c.ma_bn)} ${escapeHTML(c.ten_bn)}</span>
          <span class="status-pill ${daXuat ? 'good' : 'warn'}">${daXuat ? 'Đã xuất' : 'Chờ xuất'}</span>
        </div>
        <div class="kh-ca-item-dichvu">${escapeHTML(c.id)} - ${escapeHTML(c.dich_vu)}</div>
        <div class="kh-ca-item-meta">
          <span><i class="ri-calendar-event-line"></i> Điều trị ${ngayHien(c.ngay)}</span>
          <span><i class="ri-user-star-line"></i> ${escapeHTML(c.bac_si || 'BS')}</span>
        </div>
      </div>
    `;
  }).join('');

  // Bên phải: Chi tiết ca & phiếu xuất vật tư
  let noiDungPhai = '';
  if (!caDangChon) {
    noiDungPhai = `
      <div class="kh-ca-phieu-box empty-state" style="padding: 48px 24px; text-align: center; background: #fff; border-radius: 12px; border: 1px dashed var(--line);">
        <i class="ri-medicine-bottle-line" style="font-size: 3.5rem; color: #a9cec6; display: block; margin-bottom: 12px;"></i>
        <h4 style="margin: 0 0 8px; color: #14332f; font-size: 1.1rem;">Chưa có ca điều trị nào được chọn</h4>
        <p style="color: #75908b; max-width: 440px; margin: 0 auto 18px; font-size: .9rem; line-height: 1.5;">
          Danh sách ca điều trị hiện đang trống. Nhấn nút <b>Tiếp nhận ca</b> bên dưới hoặc ở cột bên trái để tạo ca điều trị cho khách hàng và thực hiện cấp phát vật tư.
        </p>
        <button type="button" class="primary-button" id="btnThemCaDieuTriRong" style="display: inline-flex; margin: 0 auto;">
          <i class="ri-user-add-line"></i> Tiếp nhận ca điều trị mới
        </button>
      </div>
    `;
  } else {
    const daXuat = caDangChon.trang_thai_xuat === 'da_xuat';
    const gioXuat = caDangChon.gio || new Date().toTimeString().slice(0, 8);

    noiDungPhai = `
      <div class="kh-ca-phieu-box">
        <header class="kh-ca-phieu-header">
          <div class="kh-ca-phieu-title">
            <h4>${escapeHTML(caDangChon.dich_vu)}</h4>
            <small>${escapeHTML(caDangChon.id)} · ${ngayHien(caDangChon.ngay)} ${escapeHTML(gioXuat)}</small>
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span class="pill" style="font-weight: 700; color: #14332f; background: #eaf5f3;">
                <i class="ri-user-smile-line"></i> ${escapeHTML(caDangChon.ten_bn)} (${escapeHTML(caDangChon.ma_bn)})
              </span>
              <span class="status-pill ${daXuat ? 'good' : 'warn'}">
                ${daXuat ? '✓ Đã xuất vật tư' : '⏳ Chờ xuất vật tư'}
              </span>
            </div>
          </div>
          ${daXuat ? `
            <div style="text-align: right;">
              <span class="status-pill good"><i class="ri-check-line"></i> Phiếu: ${escapeHTML(caDangChon.phieu_xuat_id || 'PX')}</span>
              <small style="display: block; color: #75908b; margin-top: 4px;">Xuất lúc: ${caDangChon.ngay_xuat ? new Date(caDangChon.ngay_xuat).toLocaleString('vi-VN') : 'Vừa xong'}</small>
            </div>
          ` : ''}
        </header>

        <!-- Form thông tin xuất -->
        <div class="kh-ca-form-grid">
          ${oLoc('Số điện thoại', `<input type="text" value="${escapeHTML(caDangChon.dien_thoai || '—')}" readonly style="background: #f8faf9;">`)}
          ${oLoc('Bác sĩ thực hiện', `<select id="caBacSi" ${daXuat ? 'disabled' : ''}>
            ${veOptgroupBacSi(caBacSiChon || caDangChon.bac_si)}
          </select>`)}
          ${oLoc('Kho xuất *', `<select id="caKhoXuat" ${daXuat ? 'disabled' : ''}>
            ${Object.entries(KHO_XUAT).map(([k, v]) => opt(k, v.ten, caKhoXuatChon || caDangChon.kho_xuat)).join('')}
          </select>`)}
          ${oLoc('Ngày xuất', `<input type="text" value="${ngayHien(caDangChon.ngay)} ${gioXuat}" readonly style="background: #f8faf9;">`)}
          <div style="grid-column: 1 / -1;">
            ${oLoc('Ghi chú ca / thủ thuật', `<input type="text" id="caGhiChu" placeholder="Ghi chú lâm sàng hoặc chỉ định xuất vật tư riêng..." value="${escapeHTML(caGhiChuChon || caDangChon.ghi_chu || '')}" ${daXuat ? 'disabled' : ''}>`)}
          </div>
        </div>

        <!-- Quét mã vạch / Thêm vật tư -->
        ${!daXuat ? `
          <div class="kh-ca-scan-bar">
            <i class="ri-barcode-box-line" style="font-size: 1.4rem; color: var(--teal); flex: none;"></i>
            <span style="font-size: .8rem; font-weight: 700; color: #14332f; white-space: nowrap;">Vật tư / SKU:</span>
            <select id="caChonVt" style="min-height: 38px; flex: 1; min-width: 220px;">
              <option value="">— Chọn vật tư cần xuất —</option>
              ${dsVatTu.map((v) => `<option value="${escapeHTML(v.id)}">${escapeHTML(v.ma)} · ${escapeHTML(v.ten)} (tồn ${v.so_luong} ${v.don_vi})</option>`).join('')}
            </select>
            <input type="number" id="caSlTuDo" min="1" value="1" style="min-height: 38px; width: 75px; text-align: center;" placeholder="SL">
            <button type="button" class="secondary-button" id="caThemVtBtn" style="min-height: 38px; padding: 0 14px; white-space: nowrap;">
              <i class="ri-add-line"></i> Thêm vào ca
            </button>
          </div>
        ` : ''}

        <!-- Bảng vật tư xuất cho ca -->
        <div class="kh-bang-cuon" style="overflow-x: auto;">
          <table class="hh-bang">
            <thead>
              <tr>
                <th style="width: 45px; text-align: center;">STT</th>
                <th style="width: 130px;">Mã SKU</th>
                <th>Tên vật tư</th>
                <th style="width: 80px; text-align: center;">ĐVT</th>
                <th style="width: 110px; text-align: center;">Số lượng</th>
                <th style="width: 120px; text-align: center;">Tồn khả dụng</th>
                ${!daXuat ? '<th style="width: 70px; text-align: center;">Xoá</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${(dongVatTuCa && dongVatTuCa.length > 0) ? dongVatTuCa.map((d, i) => {
                const vt = dsVatTu.find((v) => v.id === d.vat_tu || v.ma === d.ma || v.ma === d.vat_tu);
                const tonHien = vt?.so_luong ?? 0;
                const duTon = tonHien >= Number(d.so_luong);
                return `
                  <tr>
                    <td style="text-align: center;">${i + 1}</td>
                    <td><b class="kh-ma">${escapeHTML(d.ma || vt?.ma || d.vat_tu)}</b></td>
                    <td>
                      <b>${escapeHTML(d.ten || vt?.ten || 'Vật tư tiêu hao')}</b>
                    </td>
                    <td style="text-align: center;">${escapeHTML(d.don_vi || vt?.don_vi || 'cái')}</td>
                    <td style="text-align: center;">
                      ${daXuat
                        ? `<b>${d.so_luong}</b>`
                        : `<input type="number" class="kh-o-nhan" min="1" value="${d.so_luong}" data-ca-dong-sl="${i}" style="width: 70px; min-height: 34px; margin: 0 auto;">`
                      }
                    </td>
                    <td style="text-align: center;">
                      <span class="status-pill ${duTon ? 'good' : 'bad'}">${tonHien} ${escapeHTML(d.don_vi || vt?.don_vi || 'cái')}</span>
                    </td>
                    ${!daXuat ? `
                      <td style="text-align: center;">
                        <button type="button" class="ghost-button kh-nho" data-ca-xoa-vt="${i}" title="Gỡ vật tư này" style="color: #c2483a;">
                          <i class="ri-delete-bin-line"></i>
                        </button>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="${!daXuat ? 7 : 6}" style="text-align: center; padding: 24px; color: #75908b;">
                    Chưa có vật tư nào trong danh sách ca điều trị này. Vui lòng chọn và bấm <b>+ Thêm vào ca</b> ở trên.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>

        <!-- Thanh tác vụ (Toolbar matching user screenshot) -->
        <div class="kh-ca-thanh-tacvu">
          ${!daXuat ? `
            <button type="button" class="ghost-button" id="btnCaXoa" style="color: #a8392c;" title="Xoá toàn bộ dòng vật tư đang chọn">
              <i class="ri-delete-bin-line"></i> Xóa
            </button>
          ` : ''}
          <button type="button" class="ghost-button" id="btnCaDong">
            <i class="ri-close-line"></i> Đóng
          </button>
          ${!daXuat ? `
            <button type="button" class="secondary-button" id="btnCaKiem" style="color: #0b6b45; border-color: #aeddc8; font-weight: 700;">
              <i class="ri-checkbox-circle-line"></i> Kiểm tra
            </button>
            <button type="button" class="primary-button" id="btnCaXuat">
              <i class="ri-check-double-line"></i> Xuất kho
            </button>
          ` : `
            <span class="status-pill good" style="padding: 8px 14px; font-size: .85rem;">
              <i class="ri-check-line"></i> Ca đã hoàn tất xuất kho
            </span>
          `}
        </div>
      </div>
    `;
  }

  return `
    <section class="panel" style="padding: 16px;">
      <header class="section-title kh-header" style="margin-bottom: 14px;">
        <div>
          <h3 style="margin: 0;">Xuất vật tư theo ca điều trị</h3>
          <small style="color: #62807a;">Quản lý và cấp phát vật tư tiêu hao theo từng thủ thuật điều trị lâm sàng</small>
        </div>
        <div class="kh-header-nut">
          <button type="button" class="primary-button kh-nho" id="btnThemCaDieuTri">
            <i class="ri-add-line"></i> Tiếp nhận ca
          </button>
        </div>
      </header>

      <div class="kh-xuat-ca-layout">
        <!-- Cột trái: Bộ lọc & Danh sách ca -->
        <aside class="kh-ca-cot-trai">
          <div style="display: grid; gap: 8px; background: #f8faf9; padding: 12px; border-radius: 12px; border: 1px solid var(--line);">
            <div style="display: flex; gap: 8px;">
              <select id="caChiNhanhLoc" style="min-height: 38px; flex: 1; font-size: .82rem;">
                ${opt('', 'Tất cả chi nhánh', chiNhanh)}
                ${CHI_NHANH.map((c) => opt(c.ma, c.ten, chiNhanh)).join('')}
              </select>
              <input type="date" id="caNgayLoc" value="${caNgay}" style="min-height: 38px; width: 140px; font-size: .82rem;">
            </div>
            <div class="lt-tim-lon" style="margin: 0;">
              <i class="ri-search-line"></i>
              <input type="search" id="caTim" value="${escapeHTML(caTim)}" placeholder="Tìm mã ca, BN, thủ thuật...">
            </div>
          </div>

          ${formThemCa}

          <div class="kh-ca-ds">
            ${theCa || `
              <div class="empty-state" style="padding: 28px 16px; text-align: center; background: #fff; border-radius: 10px; border: 1px dashed var(--line);">
                <i class="ri-calendar-check-line" style="font-size: 2rem; color: #a9cec6; display: block; margin-bottom: 8px;"></i>
                <p style="margin: 0 0 6px; color: #14332f; font-weight: 600; font-size: .88rem;">Chưa có ca điều trị</p>
                <small style="color: #75908b; display: block; margin-bottom: 12px;">Dữ liệu mẫu đã được làm sạch.</small>
                <button type="button" class="secondary-button kh-nho" id="btnThemCaTrai" style="width: 100%;">
                  <i class="ri-add-line"></i> Tiếp nhận ca
                </button>
              </div>
            `}
          </div>
        </aside>

        <!-- Cột phải: Phiếu xuất vật tư chi tiết -->
        <main class="kh-ca-cot-phai">
          ${noiDungPhai}
        </main>
      </div>
    </section>
  `;
}

/* ── Khung ────────────────────────────────────────────────────────────── */

export async function renderView() {
  const toi = store.state?.profile || {};
  const role = toi.role || '';
  const maToi = toi.employee_code || '';
  const laAdmin = ['admin', 'admin_it', 'system_admin', 'leader'].includes(role) ||
                  toi.title?.includes('Admin') || toi.title?.includes('Giám đốc') || toi.title?.includes('Trợ lý') ||
                  ['PVC-10001', '10001', '10096'].includes(maToi);
  const laPhuTaPVC = maToi === 'PVC-10199';
  const laPhuTaLVT = maToi === 'PVC003' || maToi === '10216';
  if (laPhuTaLVT && chiNhanh !== 'le-van-tho') chiNhanh = 'le-van-tho';
  if (laPhuTaPVC && chiNhanh !== 'pham-van-chieu') chiNhanh = 'pham-van-chieu';
  if (!chiNhanh) chiNhanh = 'le-van-tho';

  const loc = { chiNhanh: chiNhanh || undefined };

  [thongKe, dsVatTu, dsNcc] = await Promise.all([
    thongKeKho(loc),
    layVatTu({ tim: vTim || undefined, nhom: vNhom || undefined,
      chiNhanh: chiNhanh || undefined, mucTon: vMuc || undefined, co: vCo || undefined }),
    layNhaCungCap({ tim: nTim || undefined }),
  ]);

  dsDon = await layDonHang({ tim: dTim || undefined, chiNhanh: chiNhanh || undefined,
    ncc: dNcc || undefined, trangThai: dTrangThai || undefined,
    chiTre: dChiTre, chiThieu: dChiThieu });
  dsPhieu = await layPhieuXuat({ tim: pTim || undefined, chiNhanh: chiNhanh || undefined,
    noiNhan: pNoiNhan || undefined, trangThai: pTrangThai || undefined });
  if (tab === 'de-xuat') {
    deXuat = await deXuatMuaHang(loc);
    dsPhieuDeXuat = await layDanhSachDeXuat({ chiNhanh: chiNhanh || undefined });
    if (!phieuDeXuatHienTaiId && dsPhieuDeXuat.length > 0) {
      phieuDeXuatHienTaiId = dsPhieuDeXuat[0].id;
    }
    if (phieuDeXuatHienTaiId) {
      try {
        phieuDeXuatHienTai = await layChiTietDeXuat(phieuDeXuatHienTaiId);
      } catch {
        phieuDeXuatHienTai = dsPhieuDeXuat[0] || null;
      }
    }
    dsGoiYHangThieu = await goiYHangThieu({ chiNhanh: chiNhanh || undefined });
  }
  hoaDonCuaDon = nganMo?.loai === 'don' ? await layHoaDon(nganMo.id) : [];

  if (tab === 'xuat-ca') {
    dsCa = await layCaDieuTri({ chiNhanh: chiNhanh || undefined, ngay: caNgay || undefined, tim: caTim || undefined });
    if (!caDangChonId && dsCa.length > 0) {
      caDangChonId = dsCa[0].id;
    }
  }

  return `<div class="view-stack kh-view">
    <div class="kh-thanh-tren">
      <nav class="lt-tabs" role="tablist">
        ${TABS.map((t) => `<button type="button" role="tab" class="lt-tab${tab === t.ma ? ' is-active' : ''}"
           aria-selected="${tab === t.ma}" data-tab="${t.ma}">
           <i class="${t.icon}"></i><span>${escapeHTML(t.ten)}</span>
         </button>`).join('')}
      </nav>
      <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
        ${laAdmin ? `
          <span class="pill" style="color: #0b6b45; background: #e8f6ef; font-weight: 700;">
            <i class="ri-shield-check-line"></i> Quản trị IT: Toàn quyền 2 chi nhánh
          </span>
        ` : (laPhuTaPVC ? `
          <span class="pill" style="color: #1a5c8e; background: #e8f2fa; font-weight: 700;">
            <i class="ri-user-star-line"></i> Phụ tá Tuấn · Kho PVC
          </span>
        ` : (laPhuTaLVT ? `
          <span class="pill" style="color: #6a2a8e; background: #f4e8fa; font-weight: 700;">
            <i class="ri-user-star-line"></i> Phụ tá Như Huỳnh · Kho LVT
          </span>
        ` : ''))}
        <label class="kh-chon-cn">
          <span>Kho</span>
          <select id="khChiNhanh">
            ${opt('', 'Toàn hệ thống (PVC & LVT)', chiNhanh)}
            ${CHI_NHANH.map((c) => opt(c.ma, c.ten, chiNhanh)).join('')}
          </select>
        </label>
      </div>
    </div>

    ${tab === 'tong-quan' ? veTongQuan() : ''}
    ${tab === 'xuat-ca' ? veXuatVatTuCa() : ''}
    ${tab === 'vat-tu' ? veVatTu() : ''}
    ${tab === 'don-hang' ? veDonHang() : ''}
    ${tab === 'phieu-xuat' ? vePhieuXuat() : ''}
    ${tab === 'de-xuat' ? veDeXuat() : ''}
    ${tab === 'ncc' ? veNcc() : ''}
    ${veNgan()}
  </div>`;
}

/* ── Sự kiện ──────────────────────────────────────────────────────────── */

const ve = () => navigateTo('kho-hang');

async function chay(viec, loiNhan) {
  try {
    await viec();
    if (loiNhan) showToast(loiNhan);
    await ve();
  } catch (err) { showToast(err.message, true); }
}

export function initView() {
  const g = (id) => document.getElementById(id);
  const toi = store.state?.profile || {};
  const maToi = toi.employee_code || 'PVC-10199';

  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => { tab = b.dataset.tab; nganMo = null; ve(); });
  });
  document.querySelectorAll('[data-tab-di]').forEach((b) => {
    b.addEventListener('click', () => { tab = b.dataset.tabDi; ve(); });
  });
  g('khChiNhanh')?.addEventListener('change', (e) => { chiNhanh = e.target.value; ve(); });

  /* Thẻ tổng quan bấm được: mỗi thẻ nhảy sang đúng tab kèm bộ lọc đã đặt sẵn.
   * Hiện con số mà không đi tới được danh sách đằng sau nó thì người đọc vẫn
   * phải tự đi tìm, và thẻ chỉ còn là trang trí. */
  const NHAY = [
    () => { tab = 'vat-tu'; vMuc = 'het'; },
    () => { tab = 'vat-tu'; vMuc = 'thieu'; },
    () => { tab = 'don-hang'; dChiTre = true; },
    () => { tab = 'don-hang'; dChiThieu = true; },
    () => { tab = 'phieu-xuat'; pTrangThai = 'nhap'; },
    () => { tab = 'don-hang'; dTrangThai = 'da_giao'; },
  ];
  document.querySelectorAll('[data-nhay]').forEach((b) => {
    b.addEventListener('click', () => { NHAY[Number(b.dataset.nhay)]?.(); ve(); });
  });

  /* Bộ lọc gõ chữ: chờ 300ms rồi mới vẽ lại, không vẽ mỗi phím. */
  const goTim = (id, gan) => {
    const o = g(id);
    if (!o) return;
    let hen;
    o.addEventListener('input', (e) => {
      clearTimeout(hen);
      const v = e.target.value;
      hen = setTimeout(() => { gan(v); ve(); }, 300);
    });
  };
  goTim('vTim', (v) => { vTim = v; vTrang = 1; });
  goTim('dTim', (v) => { dTim = v; });
  goTim('pTim', (v) => { pTim = v; });
  goTim('nTim', (v) => { nTim = v; });
  goTim('caTim', (v) => { caTim = v; });

  const loc = (id, gan) => g(id)?.addEventListener('change', (e) => {
    gan(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    ve();
  });
  loc('vNhom', (v) => { vNhom = v; vTrang = 1; });
  loc('vMuc', (v) => { vMuc = v; vTrang = 1; });
  loc('vCo', (v) => { vCo = v; vTrang = 1; });
  loc('dNcc', (v) => { dNcc = v; });
  loc('dTrangThai', (v) => { dTrangThai = v; });
  loc('dChiTre', (v) => { dChiTre = v; });
  loc('dChiThieu', (v) => { dChiThieu = v; });
  loc('pNoiNhan', (v) => { pNoiNhan = v; });
  loc('pTrangThai', (v) => { pTrangThai = v; });
  loc('caNgayLoc', (v) => { caNgay = v; });
  loc('caChiNhanhLoc', (v) => { chiNhanh = v; });

  g('vXoaLoc')?.addEventListener('click', () => {
    vNhom = ''; vMuc = ''; vCo = ''; vTrang = 1; ve();
  });
  document.querySelectorAll('[data-pt]').forEach((b) => {
    b.addEventListener('click', () => { [, vTrang] = b.dataset.pt.split(':').map(Number); ve(); });
  });

  /* So sánh giá. Truyền LƯỢNG CẦN BÙ vào, không phải 0: chỉ khi biết cần bao
   * nhiêu mới tính được nhà nào rẻ theo tiền thật, vì mức tối thiểu và quy
   * cách chỉ có nghĩa khi đặt cạnh một con số nhu cầu. */
  /* Mở ngăn kéo chi tiết vật tư. Truyền LƯỢNG CẦN BÙ vào bảng so giá, không
   * phải 0: chỉ khi biết cần bao nhiêu mới tính được nhà nào rẻ theo tiền
   * thật, vì mức tối thiểu và quy cách chỉ có nghĩa khi đặt cạnh nhu cầu. */
  const moNganVatTu = async (id) => {
    const v = dsVatTu.find((x) => x.id === id);
    const can = v ? Math.max(0, v.dinh_muc_hien - v.so_luong - v.dang_cho_ve) : 0;
    try {
      const ss = await soSanhGia(id, can);
      nganMo = { loai: 'vat_tu', id, so_sanh: ss, can };
      await ve();
    } catch (err) { showToast(err.message, true); }
  };
  document.querySelectorAll('[data-so-sanh]').forEach((b) => {
    b.addEventListener('click', () => moNganVatTu(b.dataset.soSanh));
  });
  document.querySelectorAll('[data-ngan-vt]').forEach((b) => {
    b.addEventListener('click', () => moNganVatTu(b.dataset.nganVt));
  });
  document.querySelectorAll('[data-ngan-don]').forEach((b) => {
    b.addEventListener('click', () => { nganMo = { loai: 'don', id: b.dataset.nganDon }; ve(); });
  });

  const dongNgan = () => { nganMo = null; ve(); };
  g('khDongNgan')?.addEventListener('click', dongNgan);
  g('khNganNen')?.addEventListener('click', dongNgan);
  // Phím Esc: ngăn kéo che nội dung nên phải thoát được mà không cần tìm nút.
  if (nganMo) {
    const thoat = (e) => {
      if (e.key !== 'Escape') return;
      document.removeEventListener('keydown', thoat);
      dongNgan();
    };
    document.addEventListener('keydown', thoat);
  }

  /* Đơn hàng */
  document.querySelectorAll('[data-mo-don]').forEach((b) => {
    b.addEventListener('click', () => { nganMo = { loai: 'don', id: b.dataset.moDon }; tab = 'don-hang'; ve(); });
  });
  document.querySelectorAll('[data-doi-don]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [id, tt] = b.dataset.doiDon.split(':');
      if (tt === 'huy') {
        const ok = await confirmAction('Huỷ đơn hàng này? Đơn đã huỷ không nhận hàng được nữa.',
          { title: 'Huỷ đơn hàng', confirmText: 'Huỷ đơn', danger: true });
        if (!ok) return;
      }
      chay(async () => { await doiTrangThaiDon(id, tt, maToi); },
        tt === 'huy' ? 'Đã huỷ đơn hàng.' : 'Đã duyệt và chuyển sang trạng thái đã đặt.');
    });
  });

  g('khNhanHang')?.addEventListener('click', () => {
    const nhan = {};
    document.querySelectorAll('[data-nhan]').forEach((o) => {
      const so = Number(o.value);
      if (so > 0) nhan[o.dataset.nhan] = so;
    });
    chay(async () => { await nhanHang(nganMo.id, nhan, maToi); }, 'Đã ghi nhận hàng về và cộng vào tồn kho.');
  });

  /* Hoá đơn và ảnh */
  g('khThemHd')?.addEventListener('click', () => {
    chay(async () => {
      await themHoaDon(nganMo.id, {
        so: g('hdSo')?.value, ngay: g('hdNgay')?.value,
        tien: g('hdTien')?.value, ghi_chu: g('hdGhiChu')?.value,
      }, maToi);
    }, 'Đã thêm hoá đơn.');
  });

  document.querySelectorAll('[data-tai-anh-hd]').forEach((o) => {
    o.addEventListener('change', async (e) => {
      const ds = [...e.target.files];
      if (!ds.length) return;
      const qua = ds.filter((f) => f.size > 25 * 1024 * 1024);
      if (qua.length) { showToast(`${qua[0].name} lớn hơn 25 MB, không xử lý được.`, true); return; }
      showToast(`Đang nén ${ds.length} ảnh…`);
      try {
        const xong = [];
        for (const f of ds) {
          const a = await nenWebp(f);
          xong.push({ ma_bam: a.ma_bam, data: a.tep, ten: a.ten_goc,
            co: a.byte, co_goc: f.size });
        }
        const kq = await themAnhHoaDon(o.dataset.taiAnhHd, xong, maToi);
        showToast(`Đã thêm ${kq.them} ảnh · nén ${xong[0].kb || ''}`.trim());
        await ve();
      } catch (err) { showToast(err.message, true); }
    });
  });

  document.querySelectorAll('[data-xoa-anh]').forEach((b) => {
    b.addEventListener('click', async () => {
      const [hd, bam] = b.dataset.xoaAnh.split(':');
      const ok = await confirmAction('Gỡ ảnh này khỏi hoá đơn?',
        { title: 'Gỡ ảnh hoá đơn', confirmText: 'Gỡ ảnh', danger: true });
      if (!ok) return;
      chay(async () => { await xoaAnhHoaDon(hd, bam); }, 'Đã gỡ ảnh khỏi hoá đơn.');
    });
  });

  /* Phiếu xuất kho */
  g('khMoFormPhieu')?.addEventListener('click', () => {
    hienFormPhieu = !hienFormPhieu;
    if (hienFormPhieu && !dongPhieuMoi.length) dongPhieuMoi = [{ vat_tu: '', so_luong: '' }];
    ve();
  });
  g('pxThemDong')?.addEventListener('click', () => {
    dongPhieuMoi.push({ vat_tu: '', so_luong: '' }); ve();
  });
  document.querySelectorAll('[data-bo-dong]').forEach((b) => {
    b.addEventListener('click', () => {
      dongPhieuMoi.splice(Number(b.dataset.boDong), 1);
      if (!dongPhieuMoi.length) dongPhieuMoi = [{ vat_tu: '', so_luong: '' }];
      ve();
    });
  });
  /* Giữ giá trị đang gõ vào biến ngay khi đổi. Không giữ thì mỗi lần thêm
   * dòng là vẽ lại màn và mất sạch những dòng đã nhập. */
  document.querySelectorAll('[data-dong-vt]').forEach((o) => {
    o.addEventListener('change', () => { dongPhieuMoi[Number(o.dataset.dongVt)].vat_tu = o.value; });
  });
  document.querySelectorAll('[data-dong-sl]').forEach((o) => {
    o.addEventListener('input', () => { dongPhieuMoi[Number(o.dataset.dongSl)].so_luong = o.value; });
  });
  g('pxHuy')?.addEventListener('click', () => {
    hienFormPhieu = false; dongPhieuMoi = []; ve();
  });
  g('pxLuu')?.addEventListener('click', () => {
    chay(async () => {
      await taoPhieuXuat({
        chi_nhanh: g('pxChiNhanh')?.value, noi_nhan: g('pxNoiNhan')?.value,
        nguoi_nhan: g('pxNguoiNhan')?.value, ly_do: g('pxLyDo')?.value,
        dong: dongPhieuMoi.filter((d) => d.vat_tu),
      }, maToi);
      hienFormPhieu = false; dongPhieuMoi = [];
    }, 'Đã lưu phiếu nháp. Bấm Xuất kho để trừ tồn.');
  });

  document.querySelectorAll('[data-xuat-phieu]').forEach((b) => {
    b.addEventListener('click', async () => {
      const ok = await confirmAction('Xuất kho theo phiếu này? Tồn kho sẽ bị trừ ngay '
        + 'và không hoàn tác được — muốn trả lại phải lập phiếu nhập bù.',
        { title: 'Xác nhận xuất kho', confirmText: 'Xuất kho' });
      if (!ok) return;
      chay(async () => { await xuatKho(b.dataset.xuatPhieu, maToi); }, 'Đã xuất kho và trừ tồn.');
    });
  });
  document.querySelectorAll('[data-huy-phieu]').forEach((b) => {
    b.addEventListener('click', () => {
      chay(async () => { await huyPhieuXuat(b.dataset.huyPhieu, maToi); }, 'Đã huỷ phiếu.');
    });
  });

  /* ── Đề xuất mua hàng chuẩn BM03 & Quy trình Supply Chain ── */
  g('selPhieuDeXuat')?.addEventListener('change', async (e) => {
    phieuDeXuatHienTaiId = e.target.value;
    try {
      phieuDeXuatHienTai = await layChiTietDeXuat(phieuDeXuatHienTaiId);
    } catch {
      phieuDeXuatHienTai = dsPhieuDeXuat.find((p) => p.id === phieuDeXuatHienTaiId) || null;
    }
    ve();
  });

  g('btnTaoPhieuMoi')?.addEventListener('click', () => {
    chay(async () => {
      const pMoi = await taoPhieuDeXuat({
        kho_hang: chiNhanh === 'le-van-tho' ? 'Kho Lê Văn Thọ' : 'Kho Phạm Văn Chiêu',
        bo_phan: 'Kho vật tư',
        nguoi_tao: toi.name || 'Thủ kho',
        thu_kho: toi.name || 'Nguyễn Thị Như Huỳnh',
        ghi_chu: 'Đề xuất mua hàng đợt mới'
      }, maToi);
      phieuDeXuatHienTaiId = pMoi.id;
      phieuDeXuatHienTai = pMoi;
    }, 'Đã khởi tạo phiếu đề xuất mua hàng mới.');
  });

  g('btnMoGoiYHangThieu')?.addEventListener('click', () => {
    hienDrawerHangThieu = true;
    goiYChonMap = {};
    (dsGoiYHangThieu || []).forEach((item) => {
      goiYChonMap[item.vat_tu.id] = true;
    });
    ve();
  });

  g('btnDongDrawerHangThieu')?.addEventListener('click', () => {
    hienDrawerHangThieu = false;
    ve();
  });

  g('chkChonTatCaHangThieu')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    (dsGoiYHangThieu || []).forEach((item) => {
      goiYChonMap[item.vat_tu.id] = checked;
    });
    ve();
  });

  document.querySelectorAll('[data-chk-thieu]').forEach((chk) => {
    chk.addEventListener('change', (e) => {
      const idx = Number(chk.dataset.chkThieu);
      const item = dsGoiYHangThieu[idx];
      if (item) {
        goiYChonMap[item.vat_tu.id] = e.target.checked;
      }
    });
  });

  g('btnThemHangThieuDaChon')?.addEventListener('click', () => {
    const selected = (dsGoiYHangThieu || []).filter((gItem) => goiYChonMap[gItem.vat_tu.id]);
    if (!selected.length) {
      showToast('Vui lòng chọn ít nhất 1 mặt hàng để thêm vào phiếu.', true);
      return;
    }
    if (!phieuDeXuatHienTai) return;
    if (!phieuDeXuatHienTai.dong) phieuDeXuatHienTai.dong = [];

    selected.forEach((gItem) => {
      const tonTai = phieuDeXuatHienTai.dong.find((d) => d.vat_tu_id === gItem.vat_tu.id);
      if (tonTai) {
        tonTai.so_luong += gItem.can_bu;
        tonTai.thanh_tien = tonTai.so_luong * tonTai.don_gia;
      } else {
        phieuDeXuatHienTai.dong.push({
          nganh_hang: gItem.vat_tu.nhom_ten || 'VẬT LIỆU - TỔNG QUÁT',
          vat_tu_id: gItem.vat_tu.id,
          ten: gItem.vat_tu.ten,
          thong_so: gItem.vat_tu.quy_cach || '',
          don_vi: gItem.vat_tu.don_vi || 'Cái',
          ton: gItem.ton,
          so_luong: gItem.can_bu,
          don_gia: gItem.don_gia,
          thanh_tien: gItem.can_bu * gItem.don_gia,
          thoi_gian: todayISO(),
          muc_dich: 'Bổ sung bù định mức sử dụng lâm sàng',
          ncc_id: gItem.ncc_id,
          ncc_ten: gItem.ncc_ten,
        });
      }
    });
    hienDrawerHangThieu = false;
    chay(async () => {
      await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
    }, `Đã bổ sung ${selected.length} mặt hàng thiếu vào phiếu đề xuất.`);
  });

  const themDongMoiVaoPhieu = () => {
    if (!phieuDeXuatHienTai) return;
    if (!phieuDeXuatHienTai.dong) phieuDeXuatHienTai.dong = [];
    const nextStt = phieuDeXuatHienTai.dong.length + 1;
    phieuDeXuatHienTai.dong.push({
      id: `D${Date.now()}`,
      stt: nextStt,
      nganh_hang: 'VẬT LIỆU - TỔNG QUÁT',
      vat_tu_id: '',
      ten: '',
      thong_so: '',
      don_vi: 'Cái',
      ton: 0,
      so_luong: 1,
      don_gia: 0,
      thanh_tien: 0,
      thoi_gian: todayISO(),
      muc_dich: 'Sử dụng điều trị lâm sàng',
      ncc_id: 'NCC-01',
      ncc_ten: 'Dược & Vật Liệu Nha Khoa LVT',
    });
    chay(async () => {
      await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
    }, 'Đã thêm dòng mặt hàng mới vào phiếu đề xuất.');
  };

  g('btnThemDongMoi')?.addEventListener('click', themDongMoiVaoPhieu);
  g('btnThemDongEmpty')?.addEventListener('click', themDongMoiVaoPhieu);
  g('btnThemDongDuoiBang')?.addEventListener('click', themDongMoiVaoPhieu);
  g('btnGoiYEmpty')?.addEventListener('click', () => {
    hienDrawerHangThieu = true;
    goiYChonMap = {};
    (dsGoiYHangThieu || []).forEach((item) => {
      goiYChonMap[item.vat_tu.id] = true;
    });
    ve();
  });

  g('btnXuatExcelBM03')?.addEventListener('click', async () => {
    if (!phieuDeXuatHienTai || !phieuDeXuatHienTai.dong?.length) {
      showToast('Phiếu đề xuất chưa có mặt hàng nào để xuất file.', true);
      return;
    }
    // Đồng bộ các trường thông tin trên form vào phiếu trước khi xuất file
    if (g('bm03SoPhieu')) phieuDeXuatHienTai.so_phieu = g('bm03SoPhieu').value;
    if (g('bm03BoPhan')) phieuDeXuatHienTai.bo_phan = g('bm03BoPhan').value;
    if (g('bm03NguoiTao')) phieuDeXuatHienTai.nguoi_tao = g('bm03NguoiTao').value;
    if (g('bm03NgayTao')) phieuDeXuatHienTai.ngay_tao = g('bm03NgayTao').value;
    if (g('bm03KhoHang')) phieuDeXuatHienTai.kho_hang = g('bm03KhoHang').value;
    if (g('bm03ThuKho')) phieuDeXuatHienTai.thu_kho = g('bm03ThuKho').value;
    if (g('bm03GhiChu')) phieuDeXuatHienTai.ghi_chu = g('bm03GhiChu').value;

    try {
      await xuatExcelDeXuatBM03(phieuDeXuatHienTai);
      showToast('Đã tải xuống file Excel phiếu đề xuất mua hàng!');
    } catch (err) {
      showToast('Lỗi xuất Excel: ' + err.message, true);
    }
  });

  g('btnTaoDonTuPhieu')?.addEventListener('click', async () => {
    if (!phieuDeXuatHienTai || !phieuDeXuatHienTai.dong?.length) {
      showToast('Phiếu đề xuất không có mặt hàng nào để tạo đơn.', true);
      return;
    }
    const ok = await confirmAction(
      `Hệ thống sẽ tách ${phieuDeXuatHienTai.dong.length} mặt hàng theo từng Nhà cung cấp và lập các đơn đặt hàng (PO) ở trạng thái chờ duyệt. Tiếp tục?`,
      { title: 'Tạo đơn đặt hàng từ phiếu đề xuất', confirmText: 'Tạo đơn PO' }
    );
    if (!ok) return;
    chay(async () => {
      await taoDonHangTuPhieu(phieuDeXuatHienTai.id, maToi);
      tab = 'don-hang';
    }, 'Đã tự động tạo các đơn đặt hàng PO cho từng nhà cung cấp!');
  });

  g('btnLuuPhieuDeXuat')?.addEventListener('click', () => {
    if (!phieuDeXuatHienTai) return;
    phieuDeXuatHienTai.so_phieu = g('bm03SoPhieu')?.value || phieuDeXuatHienTai.so_phieu;
    phieuDeXuatHienTai.bo_phan = g('bm03BoPhan')?.value || phieuDeXuatHienTai.bo_phan;
    phieuDeXuatHienTai.nguoi_tao = g('bm03NguoiTao')?.value || phieuDeXuatHienTai.nguoi_tao;
    phieuDeXuatHienTai.ngay_tao = g('bm03NgayTao')?.value || phieuDeXuatHienTai.ngay_tao;
    phieuDeXuatHienTai.kho_hang = g('bm03KhoHang')?.value || phieuDeXuatHienTai.kho_hang;
    phieuDeXuatHienTai.thu_kho = g('bm03ThuKho')?.value || phieuDeXuatHienTai.thu_kho;
    phieuDeXuatHienTai.ghi_chu = g('bm03GhiChu')?.value || phieuDeXuatHienTai.ghi_chu;

    chay(async () => {
      await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
    }, 'Đã lưu phiếu đề xuất mua hàng.');
  });

  document.querySelectorAll('[data-dx-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dxNganhHangFilter = btn.dataset.dxCat;
      ve();
    });
  });

  const dxTim = g('dxTimKiem');
  if (dxTim) {
    let henDx;
    dxTim.addEventListener('input', (e) => {
      clearTimeout(henDx);
      const val = e.target.value;
      henDx = setTimeout(() => {
        dxTimKiemVatTu = val;
        ve();
      }, 250);
    });
  }

  document.querySelectorAll('[data-chon-tim-vt]').forEach((row) => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('[data-so-sanh-them]')) return;
      const vtId = row.dataset.chonTimVt;
      const vt = dsVatTu.find((v) => v.id === vtId);
      if (!vt || !phieuDeXuatHienTai) return;
      if (!phieuDeXuatHienTai.dong) phieuDeXuatHienTai.dong = [];
      const resGia = soSanhGiaNhaCungCap(vtId);
      const best = resGia.gia_re_nhat || resGia.quotes[0] || { ncc_id: 'NCC-01', ncc_ten: 'Dược & Vật Liệu Nha Khoa LVT', gia: vt.gia_von || 100000 };
      phieuDeXuatHienTai.dong.push({
        nganh_hang: vt.nhom_ten || 'VẬT LIỆU - TỔNG QUÁT',
        vat_tu_id: vt.id,
        ten: vt.ten,
        thong_so: vt.quy_cach || '',
        don_vi: vt.don_vi || 'Cái',
        ton: vt.so_luong || 0,
        so_luong: 1,
        don_gia: best.gia || vt.gia_von || 100000,
        thanh_tien: best.gia || vt.gia_von || 100000,
        thoi_gian: todayISO(),
        muc_dich: 'Sử dụng điều trị lâm sàng',
        ncc_id: best.ncc_id,
        ncc_ten: best.ncc_ten,
      });
      dxTimKiemVatTu = '';
      chay(async () => {
        await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
      }, `Đã thêm "${vt.ten}" vào phiếu đề xuất.`);
    });
  });

  document.querySelectorAll('[data-so-sanh-them]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const vtId = btn.dataset.soSanhThem;
      const vt = dsVatTu.find((v) => v.id === vtId);
      if (!vt) return;
      const resGia = soSanhGiaNhaCungCap(vtId);
      modalSoSanhGia = { vat_tu: vt, quotes: resGia.quotes, dongIndex: null };
      ve();
    });
  });

  document.querySelectorAll('[data-dx-sl]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.dxSl);
      const val = Math.max(1, Number(e.target.value) || 1);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong[idx].so_luong = val;
        phieuDeXuatHienTai.dong[idx].thanh_tien = val * (phieuDeXuatHienTai.dong[idx].don_gia || 0);
        chay(async () => {
          await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
        });
      }
    });
  });

  document.querySelectorAll('[data-dx-thong-so]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.dxThongSo);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong[idx].thong_so = e.target.value;
      }
    });
  });

  document.querySelectorAll('[data-dx-ngay]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.dxNgay);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong[idx].thoi_gian = e.target.value;
      }
    });
  });

  document.querySelectorAll('[data-dx-muc-dich]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.dxMucDich);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong[idx].muc_dich = e.target.value;
      }
    });
  });

  document.querySelectorAll('[data-dx-ten]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.dxTen);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong[idx].ten = e.target.value.trim();
        chay(async () => {
          await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
        });
      }
    });
  });

  document.querySelectorAll('[data-dx-dvt]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.dxDvt);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong[idx].don_vi = e.target.value.trim();
        chay(async () => {
          await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
        });
      }
    });
  });

  document.querySelectorAll('[data-dx-gia]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.dxGia);
      const val = Math.max(0, Number(e.target.value) || 0);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong[idx].don_gia = val;
        phieuDeXuatHienTai.dong[idx].thanh_tien = val * (phieuDeXuatHienTai.dong[idx].so_luong || 1);
        chay(async () => {
          await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
        });
      }
    });
  });

  document.querySelectorAll('[data-dx-doi-ncc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.dxDoiNcc);
      const dong = phieuDeXuatHienTai?.dong?.[idx];
      if (!dong) return;
      const vt = dsVatTu.find((v) => v.id === dong.vat_tu_id || v.ten === dong.ten) || {
        id: dong.vat_tu_id || 'VT-CUSTOM',
        ten: dong.ten,
        ma: dong.vat_tu_id || 'VT',
        don_vi: dong.don_vi || 'Cái',
        gia_von: dong.don_gia || 0,
      };
      const resGia = soSanhGiaNhaCungCap(vt.id);
      modalSoSanhGia = { vat_tu: vt, quotes: resGia.quotes, dongIndex: idx };
      ve();
    });
  });

  document.querySelectorAll('[data-dx-xoa-dong]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.dxXoaDong);
      if (phieuDeXuatHienTai?.dong?.[idx]) {
        phieuDeXuatHienTai.dong.splice(idx, 1);
        chay(async () => {
          await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
        }, 'Đã xóa mặt hàng khỏi phiếu đề xuất.');
      }
    });
  });

  g('btnDongModalSoSanhGia')?.addEventListener('click', () => {
    modalSoSanhGia = null;
    ve();
  });

  document.querySelectorAll('[data-chon-ncc-quote]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!modalSoSanhGia) return;
      const nccId = btn.dataset.chonNccQuote;
      const quote = modalSoSanhGia.quotes.find((q) => q.ncc_id === nccId);
      if (!quote) return;

      if (modalSoSanhGia.dongIndex != null && phieuDeXuatHienTai?.dong?.[modalSoSanhGia.dongIndex]) {
        const dong = phieuDeXuatHienTai.dong[modalSoSanhGia.dongIndex];
        dong.ncc_id = quote.ncc_id;
        dong.ncc_ten = quote.ncc_ten;
        dong.don_gia = quote.gia;
        dong.thanh_tien = (dong.so_luong || 1) * quote.gia;
      } else if (phieuDeXuatHienTai) {
        if (!phieuDeXuatHienTai.dong) phieuDeXuatHienTai.dong = [];
        const vt = modalSoSanhGia.vat_tu;
        phieuDeXuatHienTai.dong.push({
          nganh_hang: vt.nhom_ten || 'VẬT LIỆU - TỔNG QUÁT',
          vat_tu_id: vt.id,
          ten: vt.ten,
          thong_so: vt.quy_cach || '',
          don_vi: vt.don_vi || 'Cái',
          ton: vt.so_luong || 0,
          so_luong: 1,
          don_gia: quote.gia,
          thanh_tien: quote.gia,
          thoi_gian: todayISO(),
          muc_dich: 'Sử dụng điều trị lâm sàng',
          ncc_id: quote.ncc_id,
          ncc_ten: quote.ncc_ten,
        });
        dxTimKiemVatTu = '';
      }
      modalSoSanhGia = null;
      chay(async () => {
        await capNhatPhieuDeXuat(phieuDeXuatHienTai.id, phieuDeXuatHienTai);
      }, `Đã chọn nhà cung cấp ${quote.ncc_ten}.`);
    });
  });

  /* Thêm vật tư mới */
  g('khMoFormVt')?.addEventListener('click', () => {
    hienFormVatTu = !hienFormVatTu; ve();
  });
  g('vtHuy')?.addEventListener('click', () => {
    hienFormVatTu = false; ve();
  });
  g('vtLuu')?.addEventListener('click', () => {
    const co = [];
    document.querySelectorAll('[data-co-chon]:checked').forEach((c) => co.push(c.dataset.coChon));
    chay(async () => {
      await themVatTu({
        ma: g('vtMa')?.value,
        ten: g('vtTen')?.value,
        nhom: g('vtNhom')?.value,
        don_vi: g('vtDonVi')?.value,
        dinh_muc: g('vtDinhMuc')?.value,
        co,
      });
      hienFormVatTu = false;
    }, 'Đã thêm vật tư mới vào danh mục.');
  });

  /* Thêm nhà cung cấp mới */
  g('khMoFormNcc')?.addEventListener('click', () => {
    hienFormNcc = !hienFormNcc; ve();
  });
  g('nccHuy')?.addEventListener('click', () => {
    hienFormNcc = false; ve();
  });
  g('nccLuu')?.addEventListener('click', () => {
    chay(async () => {
      await themNhaCungCap({
        ten: g('nccTen')?.value,
        nguoi: g('nccNguoi')?.value,
        dien_thoai: g('nccDienThoai')?.value,
        ngay_giao: g('nccNgayGiao')?.value,
        thanh_toan: g('nccThanhToan')?.value,
        danh_gia: g('nccDanhGia')?.value,
        ghi_chu: g('nccGhiChu')?.value,
      });
      hienFormNcc = false;
    }, 'Đã thêm nhà cung cấp mới.');
  });

  /* Tạo đơn đặt hàng mới */
  g('khMoFormDon')?.addEventListener('click', () => {
    hienFormDon = !hienFormDon;
    if (hienFormDon && !dongDonMoi.length) dongDonMoi = [{ vat_tu: '', so_luong: 1, don_vi_mua: 'hộp', don_gia: 0 }];
    ve();
  });
  g('dhThemDong')?.addEventListener('click', () => {
    dongDonMoi.push({ vat_tu: '', so_luong: 1, don_vi_mua: 'hộp', don_gia: 0 }); ve();
  });
  document.querySelectorAll('[data-dh-bo-dong]').forEach((b) => {
    b.addEventListener('click', () => {
      dongDonMoi.splice(Number(b.dataset.dhBoDong), 1);
      if (!dongDonMoi.length) dongDonMoi = [{ vat_tu: '', so_luong: 1, don_vi_mua: 'hộp', don_gia: 0 }];
      ve();
    });
  });
  document.querySelectorAll('[data-dh-dong-vt]').forEach((o) => {
    o.addEventListener('change', () => { dongDonMoi[Number(o.dataset.dhDongVt)].vat_tu = o.value; });
  });
  document.querySelectorAll('[data-dh-dong-sl]').forEach((o) => {
    o.addEventListener('input', () => { dongDonMoi[Number(o.dataset.dhDongSl)].so_luong = o.value; });
  });
  document.querySelectorAll('[data-dh-dong-dvm]').forEach((o) => {
    o.addEventListener('input', () => { dongDonMoi[Number(o.dataset.dhDongDvm)].don_vi_mua = o.value; });
  });
  document.querySelectorAll('[data-dh-dong-dg]').forEach((o) => {
    o.addEventListener('input', () => { dongDonMoi[Number(o.dataset.dhDongDg)].don_gia = o.value; });
  });
  g('dhHuy')?.addEventListener('click', () => {
    hienFormDon = false; dongDonMoi = []; ve();
  });
  g('dhLuu')?.addEventListener('click', () => {
    chay(async () => {
      await taoDonHang({
        chi_nhanh: g('dhChiNhanh')?.value,
        ncc: g('dhNcc')?.value,
        hen_giao: g('dhHenGiao')?.value,
        ghi_chu: g('dhGhiChu')?.value,
        dong: dongDonMoi.filter((d) => d.vat_tu),
      }, maToi);
      hienFormDon = false; dongDonMoi = [];
    }, 'Đã tạo đơn đặt hàng mới ở trạng thái chờ duyệt.');
  });

  /* Cập nhật tồn kho trong ngăn kéo */
  g('khMoFormTon')?.addEventListener('click', () => {
    hienFormTonKho = !hienFormTonKho; ve();
  });
  g('tkHuy')?.addEventListener('click', () => {
    hienFormTonKho = false; ve();
  });
  g('tkLuu')?.addEventListener('click', (e) => {
    const vtId = e.currentTarget.dataset.vtId;
    chay(async () => {
      await capNhatTonKho(vtId, g('tkChiNhanh')?.value, g('tkSoLuong')?.value, g('tkViTri')?.value);
      hienFormTonKho = false;
      if (nganMo?.id === vtId) {
        const can = Math.max(0, (dsVatTu.find((x) => x.id === vtId)?.dinh_muc_hien || 0));
        nganMo.so_sanh = await soSanhGia(vtId, can);
      }
    }, 'Đã cập nhật tồn kho.');
  });

  /* Thêm báo giá trong ngăn kéo */
  g('khMoFormGia')?.addEventListener('click', () => {
    hienFormBangGia = !hienFormBangGia; ve();
  });
  g('bgHuy')?.addEventListener('click', () => {
    hienFormBangGia = false; ve();
  });
  g('bgLuu')?.addEventListener('click', (e) => {
    const vtId = e.currentTarget.dataset.vtId;
    chay(async () => {
      await themBangGia({
        vat_tu: vtId,
        ncc: g('bgNcc')?.value,
        don_vi_mua: g('bgDvm')?.value,
        quy_cach: g('bgQuyCach')?.value,
        gia: g('bgGia')?.value,
        toi_thieu: g('bgToiThieu')?.value,
      });
      hienFormBangGia = false;
      if (nganMo?.id === vtId) {
        const can = Math.max(0, (dsVatTu.find((x) => x.id === vtId)?.dinh_muc_hien || 0));
        nganMo.so_sanh = await soSanhGia(vtId, can);
      }
    }, 'Đã lưu báo giá của nhà cung cấp.');
  });

  /* Xuất vật tư theo ca điều trị lâm sàng */
  document.querySelectorAll('[data-chon-ca]').forEach((b) => {
    b.addEventListener('click', () => {
      const caId = b.dataset.chonCa;
      caDangChonId = caId;
      const c = dsCa.find((x) => x.id === caId);
      if (c) {
        caBacSiChon = c.bac_si;
        caKhoXuatChon = c.kho_xuat;
        caGhiChuChon = c.ghi_chu || '';
        if (c.dong_vat_tu && c.dong_vat_tu.length > 0) {
          dongVatTuCa = c.dong_vat_tu.map((x) => ({ ...x }));
        } else {
          dongVatTuCa = [];
        }
      }
      ve();
    });
  });

  g('caBacSi')?.addEventListener('change', (e) => { caBacSiChon = e.target.value; });
  g('caKhoXuat')?.addEventListener('change', (e) => { caKhoXuatChon = e.target.value; });
  g('caGhiChu')?.addEventListener('input', (e) => { caGhiChuChon = e.target.value; });

  g('caThemVtBtn')?.addEventListener('click', () => {
    const vtId = g('caChonVt')?.value;
    const sl = Number(g('caSlTuDo')?.value) || 1;
    if (!vtId) {
      showToast('Vui lòng chọn vật tư cần xuất.', true);
      return;
    }
    const vt = dsVatTu.find((v) => v.id === vtId);
    if (!vt) return;
    const co = dongVatTuCa.find((x) => x.vat_tu === vt.id || x.ma === vt.ma);
    if (co) {
      co.so_luong += sl;
    } else {
      dongVatTuCa.push({
        vat_tu: vt.id,
        ma: vt.ma,
        ten: vt.ten,
        don_vi: vt.don_vi,
        so_luong: sl,
      });
    }
    ve();
  });

  g('caSlTuDo')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      g('caThemVtBtn')?.click();
    }
  });

  document.querySelectorAll('[data-ca-dong-sl]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.caDongSl);
      const val = Number(e.target.value);
      if (dongVatTuCa[idx]) {
        dongVatTuCa[idx].so_luong = val > 0 ? val : 1;
      }
    });
  });

  document.querySelectorAll('[data-ca-xoa-vt]').forEach((b) => {
    b.addEventListener('click', () => {
      const idx = Number(b.dataset.caXoaVt);
      dongVatTuCa.splice(idx, 1);
      ve();
    });
  });

  g('btnCaXoa')?.addEventListener('click', () => {
    dongVatTuCa = [];
    ve();
    showToast('Đã xóa danh sách vật tư đã chọn.');
  });

  g('btnCaDong')?.addEventListener('click', () => {
    caDangChonId = null;
    ve();
  });

  g('btnCaKiem')?.addEventListener('click', () => {
    if (!dongVatTuCa.length) {
      showToast('Chưa có vật tư nào để kiểm tra.', true);
      return;
    }
    const check = kiemTraTonKhoCa(dongVatTuCa, chiNhanh || 'pham-van-chieu');
    if (check.hop_le) {
      showToast('✓ Đủ tồn kho cho tất cả các vật tư của ca này!');
    } else {
      const thieu = check.dong.filter((d) => !d.hop_le);
      const msg = thieu.map((t) => `${t.ten} (thiếu ${t.so_luong - t.ton_kha_dung})`).join(', ');
      showToast(`Cảnh báo thiếu tồn: ${msg}`, true);
    }
  });

  g('btnCaXuat')?.addEventListener('click', () => {
    if (!caDangChonId) {
      showToast('Vui lòng chọn ca điều trị.', true);
      return;
    }
    if (!dongVatTuCa.length) {
      showToast('Vui lòng thêm ít nhất một vật tư để xuất.', true);
      return;
    }
    chay(async () => {
      const res = await xuatKhoCaDieuTri({
        caId: caDangChonId,
        bacSi: caBacSiChon || g('caBacSi')?.value,
        nguoiXuat: maToi,
        khoXuat: caKhoXuatChon || g('caKhoXuat')?.value,
        ghiChu: caGhiChuChon || g('caGhiChu')?.value,
        dong: dongVatTuCa,
      });
      caDangChonId = res.ca.id;
    }, 'Đã xuất kho thành công cho ca điều trị và tạo phiếu xuất!');
  });

  g('btnThemCaDieuTri')?.addEventListener('click', () => {
    hienFormThemCa = !hienFormThemCa;
    ve();
  });
  g('btnThemCaDieuTriRong')?.addEventListener('click', () => {
    hienFormThemCa = true;
    ve();
  });
  g('btnThemCaTrai')?.addEventListener('click', () => {
    hienFormThemCa = true;
    ve();
  });
  g('caChiNhanhLoc')?.addEventListener('change', (e) => {
    chiNhanh = e.target.value;
    ve();
  });
  g('caNgayLoc')?.addEventListener('change', (e) => {
    caNgay = e.target.value;
    ve();
  });
  g('caTim')?.addEventListener('input', (e) => {
    caTim = e.target.value;
    ve();
  });
  g('caDongFormThem')?.addEventListener('click', () => {
    hienFormThemCa = false;
    ve();
  });
  g('caHuyFormThem')?.addEventListener('click', () => {
    hienFormThemCa = false;
    ve();
  });
  g('caLuuFormThem')?.addEventListener('click', () => {
    const tenBn = g('caMoiTenBn')?.value;
    const dichVu = g('caMoiDichVu')?.value;
    if (!tenBn?.trim()) {
      showToast('Vui lòng nhập tên khách hàng / bệnh nhân.', true);
      return;
    }
    if (!dichVu?.trim()) {
      showToast('Vui lòng nhập tên thủ thuật / dịch vụ điều trị.', true);
      return;
    }
    chay(async () => {
      const caMoi = await themCaDieuTri({
        ten_bn: tenBn,
        ma_bn: g('caMoiMaBn')?.value,
        dien_thoai: g('caMoiSdt')?.value,
        dich_vu: dichVu,
        bac_si: g('caMoiBacSi')?.value,
        chi_nhanh: g('caMoiChiNhanh')?.value || chiNhanh,
        ngay: caNgay,
      });
      hienFormThemCa = false;
      caDangChonId = caMoi.id;
      caBacSiChon = caMoi.bac_si;
      caKhoXuatChon = caMoi.kho_xuat;
      caGhiChuChon = '';
      dongVatTuCa = [];
    }, 'Đã tiếp nhận ca điều trị mới.');
  });

  /* Xuất báo cáo */
  g('khXuatVt')?.addEventListener('click', () => {
    if (!dsVatTu.length) { showToast('Không có vật tư nào để xuất.', true); return; }
    downloadText(`kho-vat-tu-${todayISO()}.csv`, '﻿' + xuatCsvVatTu(dsVatTu), 'text/csv');
    showToast(`Đã xuất ${dsVatTu.length} mặt hàng.`);
  });
  g('khXuatDx')?.addEventListener('click', () => {
    downloadText(`de-xuat-mua-hang-${todayISO()}.csv`, '﻿' + xuatCsvDeXuat(deXuat), 'text/csv');
    showToast('Đã xuất đề xuất mua hàng.');
  });
}
