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
  deXuatMuaHang, doiTrangThaiDon, huyPhieuXuat, layDonHang, layHoaDon,
  layNhaCungCap, layPhieuXuat, layVatTu, nhanHang, soSanhGia,
  taoDonTuDeXuat, taoPhieuXuat, tenChiNhanhKho, tenNhaCungCap, tenNguoi,
  themAnhHoaDon, themHoaDon, thongKeKho, xoaAnhHoaDon, xuatKho,
  xuatCsvDeXuat, xuatCsvVatTu,
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
  { ma: 'vat-tu',    ten: 'Vật tư & tồn', icon: 'ri-archive-2-line' },
  { ma: 'don-hang',  ten: 'Đơn hàng',     icon: 'ri-truck-line' },
  { ma: 'phieu-xuat', ten: 'Phiếu xuất',  icon: 'ri-file-list-3-line' },
  { ma: 'de-xuat',   ten: 'Đề xuất mua',  icon: 'ri-shopping-cart-2-line' },
  { ma: 'ncc',       ten: 'Nhà cung cấp', icon: 'ri-store-2-line' },
];

let tab = 'tong-quan';
let chiNhanh = '';

let dsVatTu = []; let dsDon = []; let dsPhieu = []; let dsNcc = [];
let thongKe = null; let deXuat = null;

let vTim = ''; let vNhom = ''; let vMuc = ''; let vCo = ''; let vTrang = 1;
let dTim = ''; let dNcc = ''; let dTrangThai = ''; let dChiTre = false; let dChiThieu = false;
let pTim = ''; let pNoiNhan = ''; let pTrangThai = '';
let nTim = '';

// Bảng so giá đang mở cho vật tư nào, và cần bao nhiêu đơn vị.
let soSanh = null;
// Đơn đang mở để nhận hàng / xem hoá đơn.
let donMo = ''; let hoaDonCuaDon = []; let anhCho = [];
let hienFormPhieu = false; let dongPhieuMoi = [];

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

  return `
    <div class="kh-the-luoi">
      ${the.map((x, i) => `<button type="button" class="kh-the kh-the-${x.lop}" data-nhay="${i}">
        <i class="${x.icon}"></i>
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
      <div class="kh-dac-biet">
        ${Object.entries(CO_DAC_BIET).map(([ma, c]) => {
          const ds = dsVatTu.filter((v) => v.co.includes(ma));
          if (!ds.length) return '';
          return `<article class="kh-db">
            <div class="kh-db-dau">
              <span class="kh-co kh-co-${c.lop}"><i class="${c.icon}"></i>${escapeHTML(c.ten)}</span>
              <b>${ds.length}</b>
            </div>
            <p class="kh-db-canh">${escapeHTML(c.canh)}</p>
            <ul class="kh-db-ds">
              ${ds.map((v) => `<li><button type="button" class="kh-lien-ket"
                data-so-sanh="${escapeHTML(v.id)}">${escapeHTML(v.ten)}</button>
                <span>${v.so_luong} ${escapeHTML(v.don_vi)}</span></li>`).join('')}
            </ul>
          </article>`;
        }).join('')}
      </div>
    </section>`;
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
          <small>${escapeHTML(NHOM_VAT_TU[v.nhom])}</small>
          ${v.co.length ? `<div class="kh-co-hang">${coDacBiet(v.co)}</div>` : ''}
        </div>
      </td>
      <td data-label="Tồn" class="kh-so">
        <b>${v.so_luong.toLocaleString('vi-VN')}</b>
        <small>${escapeHTML(v.don_vi)}</small>
      </td>
      <td data-label="Định mức" class="kh-so kh-mo">${v.dinh_muc_hien.toLocaleString('vi-VN')}</td>
      <td data-label="Đang về" class="kh-so">${v.dang_cho_ve
        ? `<span class="kh-dang-ve">+${v.dang_cho_ve.toLocaleString('vi-VN')}</span>`
        : '<span class="kh-mo">—</span>'}</td>
      <td data-label="Mức tồn">${nhanMuc(v.muc_ton)}</td>
      <td data-label="Giá tốt nhất">${g
        ? `<div class="kh-gia">
             <b>${tien(g.don_gia_quy_doi)}</b><small>/${escapeHTML(v.don_vi)}</small>
             <span>${escapeHTML(tenNhaCungCap(g.ncc))}</span>
           </div>`
        : '<span class="kh-mo">Chưa có báo giá</span>'}</td>
      <td data-label="So giá" class="kh-cot-nut">
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
      </div>
    </header>

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
      <table class="hh-bang">
        <thead><tr>
          <th>Mã</th><th>Vật tư</th><th>Tồn</th><th>Định mức</th><th>Đang về</th>
          <th>Mức tồn</th><th>Giá tốt nhất</th><th></th>
        </tr></thead>
        <tbody>${dong || '<tr><td colspan="8" class="empty-state">Không có vật tư nào khớp bộ lọc.</td></tr>'}</tbody>
      </table>
    </div>
    ${thanhPhanTrang(kq, 'khTrang', 'vật tư')}
  </section>`;
}

/* Bảng so giá — phần lõi của module.
 *
 * Cột quyết định là ĐƠN GIÁ QUY ĐỔI, không phải giá niêm yết. Nhà bán thùng
 * 1000 đôi giá 1.050.000đ trông đắt gấp chín lần nhà bán hộp 100 đôi giá
 * 118.000đ, trong khi thật ra rẻ hơn 12%. So bằng mắt trên giá niêm yết là
 * sai mỗi khi các nhà bán quy cách khác nhau — mà họ luôn bán khác nhau.
 */
function veSoSanh() {
  if (!soSanh) return '';
  const { vat_tu: v, bang, tiet_kiem, canh_bao_moq: moq } = soSanh;

  return `<div class="kh-lop" id="khLop">
    <div class="kh-hop" role="dialog" aria-label="So sánh giá">
      <header class="kh-hop-dau">
        <div>
          <span class="kh-hop-nhan">So sánh giá giữa nhà cung cấp</span>
          <h3>${escapeHTML(v.ten)}</h3>
          <p>${escapeHTML(v.ma)} · tính theo đơn vị <b>${escapeHTML(v.don_vi)}</b>
             · cần <b>${soSanh.can} ${escapeHTML(v.don_vi)}</b></p>
        </div>
        <button type="button" class="ghost-button kh-nho" id="khDongLop">
          <i class="ri-close-line"></i>
        </button>
      </header>

      ${moq ? `<div class="kh-canh kh-canh-warn">
        <i class="ri-error-warning-line"></i>
        <div>
          <b>Rẻ theo đơn giá không phải rẻ theo tiền thật</b>
          <span>${escapeHTML(moq.re_don_gia)} có đơn giá thấp nhất nhưng bắt lấy tối thiểu
          nhiều hơn nhu cầu — trả <b>${tien(moq.tien_neu_mua)}</b> và dư ${moq.du_ra}
          ${escapeHTML(v.don_vi)}. Lấy của ${escapeHTML(moq.re_tien_that)} chỉ
          <b>${tien(moq.tien_that)}</b>, rẻ hơn <b>${tien(moq.chenh)}</b> cho lần đặt này.</span>
        </div>
      </div>` : ''}

      ${tiet_kiem ? `<div class="kh-canh kh-canh-good">
        <i class="ri-money-dollar-circle-line"></i>
        <div><b>Chênh ${tiet_kiem.chenh_pt}% giữa nhà rẻ nhất và đắt nhất</b>
        <span>Chọn đúng nhà cho lần đặt này tiết kiệm
        <b>${tien(tiet_kiem.chenh_tien)}</b>.</span></div>
      </div>` : ''}

      <div class="hh-bang-wrap">
        <table class="hh-bang kh-bang-gia">
          <thead><tr>
            <th>Nhà cung cấp</th><th>Quy cách</th><th>Giá niêm yết</th>
            <th>Đơn giá quy đổi</th><th>Phải mua</th><th>Thành tiền</th><th>Giao</th>
          </tr></thead>
          <tbody>${bang.map((g) => `<tr class="${g.la_re_tien ? 'kh-hang-re' : ''}">
            <td data-label="Nhà cung cấp">
              <div class="kh-ten">
                <b>${escapeHTML(g.ten_ncc)}</b>
                <small>${escapeHTML(g.thanh_toan)} · ${g.danh_gia}★</small>
                ${g.la_re_tien ? '<span class="kh-cheo kh-cheo-good">Rẻ nhất cho lần này</span>' : ''}
                ${g.la_re_nhat && !g.la_re_tien ? '<span class="kh-cheo">Đơn giá thấp nhất</span>' : ''}
              </div>
            </td>
            <td data-label="Quy cách">${g.quy_cach.toLocaleString('vi-VN')}
              ${escapeHTML(v.don_vi)}/${escapeHTML(g.don_vi_mua)}
              ${g.toi_thieu > 1 ? `<small class="kh-mo">tối thiểu ${g.toi_thieu}</small>` : ''}</td>
            <td data-label="Giá niêm yết" class="kh-so">${tien(g.gia)}<small>/${escapeHTML(g.don_vi_mua)}</small></td>
            <td data-label="Đơn giá quy đổi" class="kh-so kh-nhan-manh">
              <b>${tien(g.don_gia_quy_doi)}</b>
              ${g.dat_hon_pt > 0 ? `<small class="kh-dat">+${g.dat_hon_pt}%</small>`
                : '<small class="kh-re">thấp nhất</small>'}</td>
            <td data-label="Phải mua" class="kh-so">${g.can_mua} ${escapeHTML(g.don_vi_mua)}
              ${g.du_ra > 0 ? `<small class="kh-mo">dư ${g.du_ra}</small>` : ''}</td>
            <td data-label="Thành tiền" class="kh-so"><b>${tien(g.thanh_tien)}</b></td>
            <td data-label="Giao">${g.ngay_giao} ngày</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="kh-hop-ghi"><i class="ri-information-line"></i>
        <span>Đơn giá quy đổi là giá của <b>một ${escapeHTML(v.don_vi)}</b> sau khi chia theo
        quy cách đóng gói. Đây là con số duy nhất so sánh được khi các nhà bán hộp,
        thùng, vỉ khác nhau.</span></p>
    </div>
  </div>`;
}

/* ── Tab: Đơn hàng ────────────────────────────────────────────────────── */

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
    </header>

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
  </section>
  ${veChiTietDon()}`;
}

function veChiTietDon() {
  if (!donMo) return '';
  const d = dsDon.find((x) => x.id === donMo);
  if (!d) return '';
  const tt = TRANG_THAI_DON[d.trang_thai];
  const choNhan = !['da_giao', 'huy'].includes(d.trang_thai);

  return `<div class="kh-lop" id="khLop">
    <div class="kh-hop kh-hop-rong" role="dialog" aria-label="Chi tiết đơn hàng">
      <header class="kh-hop-dau">
        <div>
          <span class="kh-hop-nhan">Đơn đặt hàng</span>
          <h3>${escapeHTML(d.id)} · ${escapeHTML(d.ten_ncc)}</h3>
          <p>${escapeHTML(tenChiNhanhKho(d.chi_nhanh))} · đặt ${ngayHien(d.ngay_dat)}
             · hẹn giao ${ngayHien(d.hen_giao)}
             <span class="status-pill ${tt.lop}">${tt.ten}</span></p>
        </div>
        <button type="button" class="ghost-button kh-nho" id="khDongLop">
          <i class="ri-close-line"></i>
        </button>
      </header>

      ${d.tre_hen ? `<div class="kh-canh kh-canh-bad">
        <i class="ri-time-line"></i>
        <div><b>Trễ ${d.so_ngay_tre} ngày so với hẹn giao</b>
        <span>Còn ${d.so_dong_thieu} dòng chưa nhận đủ. Gọi ${escapeHTML(d.ten_ncc)} để chốt lại ngày.</span></div>
      </div>` : ''}

      ${d.ghi_chu ? `<p class="kh-ghi-chu">${escapeHTML(d.ghi_chu)}</p>` : ''}

      <div class="hh-bang-wrap">
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
      </div>

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

      ${veHoaDon(d)}
    </div>
  </div>`;
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
    <p class="kh-hop-ghi"><i class="ri-information-line"></i>
      <span>Phiếu lưu ở trạng thái <b>nháp</b>, chưa trừ kho. Vật tư chỉ rời kho khi
      bấm <b>Xuất kho</b> — để người lập và người duyệt xuất có thể là hai người.</span></p>
  </div>`;
}

/* ── Tab: Đề xuất mua hàng ────────────────────────────────────────────── */

function veDeXuat() {
  if (!deXuat) return '';
  if (!deXuat.nhom.length && !deXuat.thieu_gia.length) {
    return `<section class="panel">
      <header class="section-title kh-header"><h3>Đề xuất mua hàng</h3></header>
      <p class="empty-state">Không có mặt hàng nào dưới định mức. Chưa cần đặt gì.</p>
    </section>`;
  }

  return `<section class="panel">
    <header class="section-title kh-header">
      <h3>Đề xuất mua hàng</h3>
      <span class="pill">${deXuat.so_mat_hang} mặt hàng · ${deXuat.nhom.length} đơn
        · tổng ${tien(deXuat.tong_tien)}</span>
      <div class="kh-header-nut">
        <button type="button" class="ghost-button" id="khXuatDx">
          <i class="ri-download-2-line"></i> Xuất CSV
        </button>
      </div>
    </header>

    <div class="kh-canh kh-canh-info">
      <i class="ri-lightbulb-line"></i>
      <div>
        <b>Cách hệ thống chọn nhà cung cấp</b>
        <span>Lấy mọi vật tư dưới định mức, trừ đi phần đang trên đường về, rồi chọn nhà
        rẻ nhất theo <b>tiền thật phải trả</b> cho đúng lượng cần — không phải theo đơn giá.
        Nhà có đơn giá thấp hơn mà bắt lấy tối thiểu nhiều hơn nhu cầu thì hoá đơn đắt hơn,
        nên bị bỏ qua và ghi rõ lý do ở từng dòng.</span>
      </div>
    </div>

    ${deXuat.thieu_gia.length ? `<div class="kh-canh kh-canh-warn">
      <i class="ri-price-tag-3-line"></i>
      <div><b>${deXuat.thieu_gia.length} mặt hàng chưa có báo giá</b>
      <span>${deXuat.thieu_gia.map((x) => escapeHTML(x.vat_tu.ten)).join(' · ')}
      — cần xin báo giá trước khi đặt.</span></div>
    </div>` : ''}

    <div class="kh-dx-luoi">
      ${deXuat.nhom.map((n, i) => `<article class="kh-dx">
        <header class="kh-dx-dau">
          <div>
            <b>${escapeHTML(n.ten)}</b>
            <small>${n.dong.length} mặt hàng</small>
          </div>
          <div class="kh-dx-tien">
            <b>${tien(n.tong)}</b>
            <button type="button" class="primary-button kh-nho" data-tao-don="${i}">
              <i class="ri-file-add-line"></i> Tạo đơn
            </button>
          </div>
        </header>
        <div class="hh-bang-wrap">
          <table class="hh-bang">
            <thead><tr>
              <th>Vật tư</th><th>Tồn</th><th>Định mức</th><th>Đang về</th>
              <th>Cần bù</th><th>Đặt</th><th>Thành tiền</th>
            </tr></thead>
            <tbody>${n.dong.map((x) => `<tr>
              <td data-label="Vật tư">
                <div class="kh-ten">
                  <b>${escapeHTML(x.vat_tu.ten)}</b>
                  <small>${escapeHTML(x.vat_tu.ma)}</small>
                  ${x.vat_tu.co.length ? `<div class="kh-co-hang">${coDacBiet(x.vat_tu.co)}</div>` : ''}
                  ${x.bo_qua_re_hon ? `<small class="kh-bo-qua">
                    Bỏ qua ${escapeHTML(x.bo_qua_re_hon.ten)}: đơn giá ${tien(x.bo_qua_re_hon.don_gia)}
                    rẻ hơn nhưng tối thiểu ${x.bo_qua_re_hon.toi_thieu} →
                    phải trả ${tien(x.bo_qua_re_hon.thanh_tien)}</small>` : ''}
                </div>
              </td>
              <td data-label="Tồn" class="kh-so">${x.ton}</td>
              <td data-label="Định mức" class="kh-so kh-mo">${x.dinh_muc}</td>
              <td data-label="Đang về" class="kh-so">${x.dang_cho_ve || '—'}</td>
              <td data-label="Cần bù" class="kh-so"><b>${x.can_bu}</b> ${escapeHTML(x.vat_tu.don_vi)}</td>
              <td data-label="Đặt" class="kh-so kh-nhan-manh">
                <b>${x.can_mua}</b> ${escapeHTML(x.don_vi_mua)}
                ${x.du_ra > 0 ? `<small class="kh-mo">dư ${x.du_ra}</small>` : ''}</td>
              <td data-label="Thành tiền" class="kh-so">${tien(x.thanh_tien)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </article>`).join('')}
    </div>
  </section>`;
}

/* ── Tab: Nhà cung cấp ────────────────────────────────────────────────── */

function veNcc() {
  return `<section class="panel">
    <header class="section-title kh-header">
      <h3>Nhà cung cấp</h3>
      <span class="pill">${dsNcc.length} nhà đang hợp tác</span>
    </header>
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

/* ── Khung ────────────────────────────────────────────────────────────── */

export async function renderView() {
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
  deXuat = tab === 'de-xuat' ? await deXuatMuaHang(loc) : deXuat;
  hoaDonCuaDon = donMo ? await layHoaDon(donMo) : [];

  return `<div class="view-stack kh-view">
    <div class="lt-canh-bao" role="status">
      <i class="ri-flask-line"></i>
      <div>
        <b>Dữ liệu mẫu — màn hình đang ở giai đoạn dựng giao diện</b>
        <span>Vật tư, tồn kho, đơn hàng và nhà cung cấp trên màn này là dữ liệu dựng
        sẵn để xem giao diện. Chưa nối cơ sở dữ liệu, và mọi thao tác nhận hàng hay
        xuất kho sẽ mất khi tải lại trang.</span>
      </div>
    </div>

    <div class="kh-thanh-tren">
      <nav class="lt-tabs" role="tablist">
        ${TABS.map((t) => `<button type="button" role="tab" class="lt-tab${tab === t.ma ? ' is-active' : ''}"
           aria-selected="${tab === t.ma}" data-tab="${t.ma}">
           <i class="${t.icon}"></i><span>${escapeHTML(t.ten)}</span>
         </button>`).join('')}
      </nav>
      <label class="kh-chon-cn">
        <span>Kho</span>
        <select id="khChiNhanh">
          ${opt('', 'Toàn hệ thống', chiNhanh)}
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten, chiNhanh)).join('')}
        </select>
      </label>
    </div>

    ${tab === 'tong-quan' ? veTongQuan() : ''}
    ${tab === 'vat-tu' ? veVatTu() : ''}
    ${tab === 'don-hang' ? veDonHang() : ''}
    ${tab === 'phieu-xuat' ? vePhieuXuat() : ''}
    ${tab === 'de-xuat' ? veDeXuat() : ''}
    ${tab === 'ncc' ? veNcc() : ''}
    ${veSoSanh()}
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
    b.addEventListener('click', () => { tab = b.dataset.tab; soSanh = null; donMo = ''; ve(); });
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

  g('vXoaLoc')?.addEventListener('click', () => {
    vNhom = ''; vMuc = ''; vCo = ''; vTrang = 1; ve();
  });
  document.querySelectorAll('[data-pt]').forEach((b) => {
    b.addEventListener('click', () => { [, vTrang] = b.dataset.pt.split(':').map(Number); ve(); });
  });

  /* So sánh giá. Truyền LƯỢNG CẦN BÙ vào, không phải 0: chỉ khi biết cần bao
   * nhiêu mới tính được nhà nào rẻ theo tiền thật, vì mức tối thiểu và quy
   * cách chỉ có nghĩa khi đặt cạnh một con số nhu cầu. */
  document.querySelectorAll('[data-so-sanh]').forEach((b) => {
    b.addEventListener('click', async () => {
      const v = dsVatTu.find((x) => x.id === b.dataset.soSanh);
      const can = v ? Math.max(0, v.dinh_muc_hien - v.so_luong - v.dang_cho_ve) : 0;
      try {
        soSanh = await soSanhGia(b.dataset.soSanh, can);
        soSanh.can = can;
        await ve();
      } catch (err) { showToast(err.message, true); }
    });
  });

  g('khDongLop')?.addEventListener('click', () => { soSanh = null; donMo = ''; ve(); });
  g('khLop')?.addEventListener('click', (e) => {
    if (e.target.id === 'khLop') { soSanh = null; donMo = ''; ve(); }
  });

  /* Đơn hàng */
  document.querySelectorAll('[data-mo-don]').forEach((b) => {
    b.addEventListener('click', () => { donMo = b.dataset.moDon; tab = 'don-hang'; ve(); });
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
    chay(async () => { await nhanHang(donMo, nhan, maToi); }, 'Đã ghi nhận hàng về và cộng vào tồn kho.');
  });

  /* Hoá đơn và ảnh */
  g('khThemHd')?.addEventListener('click', () => {
    chay(async () => {
      await themHoaDon(donMo, {
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

  /* Đề xuất mua hàng */
  document.querySelectorAll('[data-tao-don]').forEach((b) => {
    b.addEventListener('click', () => {
      const n = deXuat.nhom[Number(b.dataset.taoDon)];
      chay(async () => { await taoDonTuDeXuat(n, chiNhanh, maToi); },
        `Đã dựng đơn cho ${n.ten} ở trạng thái chờ duyệt.`);
    });
  });

  document.querySelectorAll('[data-loc-ncc]').forEach((b) => {
    b.addEventListener('click', () => { dNcc = b.dataset.locNcc; tab = 'don-hang'; ve(); });
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
