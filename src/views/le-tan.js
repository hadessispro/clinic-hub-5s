/* Lễ tân · quầy tiếp đón.
 *
 * Một màn hình, ba tab, vì lễ tân là MỘT chỗ làm việc: nhìn hôm nay ai tới,
 * đặt lịch cho khách đang đứng trước mặt, và gọi những khách cần chăm sóc.
 * Tách ba thứ đó thành ba mục menu thì người trực quầy phải nhảy qua lại cả
 * ngày, và mỗi màn lại có bộ lọc riêng lệch nhau.
 *
 * Sáu hàng đợi chăm sóc đều là PHÉP LỌC trên lịch hẹn, không phải bảng riêng.
 * Nhờ vậy số trên thẻ và số dòng trong bảng không bao giờ lệch — chúng gọi
 * đúng một hàm.
 *
 * Màn này thiết kế cho điện thoại trước: quầy lễ tân hay dùng máy tính bảng,
 * và lúc đông khách thì thao tác bằng ngón tay. Dưới 860px mỗi lịch hẹn là
 * một thẻ bấm được, trên 860px là bảng để nhìn được nhiều dòng cùng lúc.
 */

import {
  BAC_SI, CHI_NHANH, HANG_DOI, LOAI_LICH, NGUON, PHONG, TRANG_THAI,
  datLich, demHangDoi, doiLich, doiTrangThai, layHangDoi, layLichHen,
  layLichHomNay,
  tenBacSi, tenChiNhanh, tiepDon, xuLyPhanHoi, xuatCsvLichHen,
  LOAI_SU_KIEN, baoCaoThang, layDanhSachKhach, layHanhTrinh, xuatCsvBaoCao,
  CHAM_SOC, NHOM_KHACH, TELESALE, doiBacSiLich, doiDieuPhoi,
  tenChamSoc, tenTelesale,
} from '../services/le-tan.js';
import { escapeHTML, downloadText, phanTrang, thanhPhanTrang, todayISO } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { navigateTo } from '../router.js';

/* ── Trạng thái màn hình ─────────────────────────────────────────────── */

let tab = 'hom-nay';
let hangDoiMo = 'nhac_hen';
let hienForm = false;

// Bộ lọc của tab Lịch hẹn. Tab Hôm nay có bộ lọc riêng, cố ý: đổi ngày ở tab
// Lịch hẹn mà làm tab Hôm nay không còn là hôm nay thì tên tab thành nói dối.
let fTu = todayISO();
let fDen = '';
let fChiNhanh = '';
let fBacSi = '';
let fTrangThai = '';
let fLoai = '';
let fTim = '';
let trang = 1;

let hnChiNhanh = '';

// Khoảng ngày chọn nhanh của tab Lịch hẹn. Ô ngày gốc của trình duyệt hiển
// thị theo ngôn ngữ TRÌNH DUYỆT chứ không theo trang, nên máy đặt tiếng Anh
// sẽ thấy mm/dd/yyyy. Các nút chọn nhanh phủ gần hết nhu cầu thật của quầy,
// còn ô ngày chỉ dùng cho khoảng bất thường.
let khoangNgay = 'hom-nay';

// Tab Hành trình
let khachMo = '';
let dsKhach = [];
let hanhTrinh = null;
let hTim = ''; let hChiNhanh = ''; let hNguon = '';
let tabHoSo = 'hanh-trinh';  // hanh-trinh | lich-su | dieu-phoi

// Tab Báo cáo
let baoCao = null;
let kyBaoCao = '';
let bcChiNhanh = '';

// Dữ liệu của lần render gần nhất, để initView gắn sự kiện mà không phải đọc lại.
let dsHomNay = [];
let dsLichHen = [];
let dsHangDoi = [];
let demQueue = {};

/* ── Mảnh HTML dùng lại ──────────────────────────────────────────────── */

const opt = (v, t, chon) => `<option value="${escapeHTML(v)}"${chon === v ? ' selected' : ''}>${escapeHTML(t)}</option>`;

const pill = (tt) => {
  const n = TRANG_THAI[tt] || { ten: tt, lop: 'neutral' };
  return `<span class="status-pill ${n.lop}">${escapeHTML(n.ten)}</span>`;
};

const the = (nhan, giaTri, phu) => `<article class="metric-card">
  <p class="metric-label">${escapeHTML(nhan)}</p>
  <p class="metric-value">${escapeHTML(String(giaTri))}</p>
  <p class="metric-detail">${escapeHTML(phu || '')}</p></article>`;

const gioHien = (iso) => (iso ? iso.slice(11, 16) : '—');
const tuoiTu = (sinh) => {
  if (!sinh) return '';
  const d = new Date(sinh); const n = new Date();
  let t = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth()
    || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) t -= 1;
  return `${t} tuổi`;
};

/* Ô <input type="month"> gốc hiển thị theo ngôn ngữ trình duyệt, nên Chrome
 * tiếng Anh ra "August 2026". Tự dựng danh sách kỳ để nó luôn là tiếng Việt. */
function danhSachKy(dangChon) {
  const nay = new Date();
  const ds = [];
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(nay.getFullYear(), nay.getMonth() - i, 1);
    const ma = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ds.push(`<option value="${ma}"${(dangChon || '') === ma ? ' selected' : ''}>Tháng ${
      d.getMonth() + 1}/${d.getFullYear()}</option>`);
  }
  return ds.join('');
}

/** Đổi một lựa chọn nhanh thành cặp ngày. */
function ngayTheoKhoang(ma) {
  const d = (n) => {
    const x = new Date();
    x.setDate(x.getDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const nay = new Date();
  if (ma === 'hom-nay') return [todayISO(), todayISO()];
  if (ma === 'mai') return [d(1), d(1)];
  if (ma === '7-ngay') return [todayISO(), d(7)];
  if (ma === 'thang') {
    const dau = `${nay.getFullYear()}-${String(nay.getMonth() + 1).padStart(2, '0')}-01`;
    const cuoi = new Date(nay.getFullYear(), nay.getMonth() + 1, 0).toISOString().slice(0, 10);
    return [dau, cuoi];
  }
  return ['', ''];
}
const ngayHien = (d) => {
  if (!d) return '—';
  const [y, m, n] = d.split('-');
  return `${n}/${m}/${y}`;
};

// Chữ cái đầu của tên, làm ảnh đại diện. Không tải ảnh thật vì lễ tân chỉ cần
// phân biệt nhanh giữa các dòng.
const chuDau = (ten) => {
  const p = String(ten || '?').trim().split(/\s+/);
  return (p[p.length - 1][0] || '?').toUpperCase();
};

function oKhach(x) {
  return `<div class="lt-khach">
    <span class="lt-avatar" aria-hidden="true">${escapeHTML(chuDau(x.khach.ten))}</span>
    <span class="lt-khach-chu">
      <b>${escapeHTML(x.khach.ten)}</b>
      ${x.khach.khach_moi ? '<em class="lt-moi">Khách mới</em>' : ''}
      <small>${escapeHTML(x.khach.dien_thoai)}</small>
    </span>
  </div>`;
}

/* Thẻ một lịch hẹn.
 *
 * Bản trước dồn trạng thái và nút sang tận mép phải, nên trên màn rộng giữa
 * thẻ hở ra một khoảng trống lớn và thẻ trông rỗng. Nay trạng thái đứng ngay
 * cạnh tên — đó là hai thứ mắt tìm cùng lúc — còn bên phải chỉ còn nút.
 *
 * Vạch màu bên trái dùng đúng bảng màu của bảng ngày, nên một lịch hẹn nhìn
 * ở hai chỗ vẫn là một màu.
 */
function veTheLich(x) {
  const xong = ['hoan_tat', 'huy', 'khong_den'].includes(x.trang_thai);
  const nut = [];
  if (x.trang_thai === 'cho_den') {
    nut.push(`<button type="button" class="primary-button lt-nho" data-td="${escapeHTML(x.id)}">
      <i class="ri-user-follow-line"></i> Tiếp đón</button>`);
  }
  if (x.trang_thai === 'da_den') {
    nut.push(`<button type="button" class="secondary-button lt-nho" data-tt="dang_kham"
      data-id2="${escapeHTML(x.id)}"><i class="ri-login-box-line"></i> Vào khám</button>`);
  }
  if (x.trang_thai === 'dang_kham') {
    nut.push(`<button type="button" class="secondary-button lt-nho" data-tt="hoan_tat"
      data-id2="${escapeHTML(x.id)}"><i class="ri-check-double-line"></i> Hoàn tất</button>`);
  }
  nut.push(`<button type="button" class="ghost-button lt-nho" data-doi="${escapeHTML(x.id)}"
    title="Đổi ngày giờ hẹn"><i class="ri-calendar-event-line"></i> Đổi lịch</button>`);
  if (['cho_den', 'da_den'].includes(x.trang_thai)) {
    nut.push(`<button type="button" class="ghost-button lt-nho lt-huy" data-huy="${escapeHTML(x.id)}"
      title="Hủy lịch hẹn"><i class="ri-close-line"></i></button>`);
  }

  return `<article class="lt-dong tt-${x.trang_thai}${xong ? ' xong' : ''}"
     data-id="${escapeHTML(x.id)}">
    <div class="lt-gio">
      <b>${escapeHTML(x.gio)}</b>
      <small>${x.phut}′</small>
    </div>
    <div class="lt-noi">
      <div class="lt-hang-ten">
        ${oKhach(x)}
        ${pill(x.trang_thai)}
      </div>
      <p class="lt-viec">
        ${escapeHTML(x.noi_dung || LOAI_LICH[x.loai] || '')}
        <span class="lt-the-nho">${escapeHTML(LOAI_LICH[x.loai] || '')}</span>
        <span class="lt-the-nho">${escapeHTML(NGUON[x.nguon] || '')}</span>
      </p>
      <p class="lt-meta">
        <span><i class="ri-user-heart-line"></i>${escapeHTML(tenBacSi(x.bac_si))}</span>
        <span><i class="ri-door-open-line"></i>${escapeHTML(x.phong)}</span>
        <span><i class="ri-map-pin-line"></i>${escapeHTML(tenChiNhanh(x.chi_nhanh))}</span>
        ${x.den_luc ? `<span class="lt-den"><i class="ri-time-line"></i>Đến lúc ${
          escapeHTML(gioHien(x.den_luc))}</span>` : ''}
      </p>
      ${x.ghi_chu ? `<p class="lt-ghi"><i class="ri-sticky-note-line"></i>${
        escapeHTML(x.ghi_chu)}</p>` : ''}
    </div>
    <div class="lt-thao-tac"><div class="lt-nut">${nut.join('')}</div></div>
  </article>`;
}

/* ── Tab: Hôm nay ────────────────────────────────────────────────────── */

/* Dải tóm tắt thay cho bốn thẻ số rời.
 *
 * Bốn con số đứng cạnh nhau bắt người đọc tự cộng trừ để biết ngày đang đi
 * tới đâu. Một thanh chia đoạn nói ngay điều đó: phần đã xong, phần đang
 * trong ghế, phần còn phải đón. */
function veTomTat(d, dem) {
  const tong = d.length || 1;
  const doan = [
    { ma: 'hoan_tat', ten: 'Hoàn tất', so: dem('hoan_tat') },
    { ma: 'dang_kham', ten: 'Đang khám', so: dem('dang_kham') },
    { ma: 'da_den', ten: 'Đã đến, chờ khám', so: dem('da_den') },
    { ma: 'cho_den', ten: 'Chưa tới', so: dem('cho_den') },
    { ma: 'khong_den', ten: 'Không đến', so: dem('khong_den') },
    { ma: 'huy', ten: 'Đã hủy', so: dem('huy') },
  ].filter((x) => x.so > 0);

  const daDon = dem('da_den') + dem('dang_kham') + dem('hoan_tat');

  return `<section class="panel lt-tom-tat">
    <div class="lt-tt-dau">
      <div class="lt-tt-so">
        <b>${d.length}</b>
        <span>lịch hẹn hôm nay</span>
      </div>
      <div class="lt-tt-phu">
        <div><b>${daDon}</b><span>đã tiếp đón</span></div>
        <div><b>${dem('cho_den')}</b><span>còn phải đón</span></div>
        <div><b>${dem('dang_kham')}</b><span>đang trong ghế</span></div>
      </div>
    </div>
    <div class="lt-thanh" role="img"
         aria-label="${escapeHTML(doan.map((x) => `${x.ten} ${x.so}`).join(', '))}">
      ${doan.map((x) => `<span class="lt-thanh-doan tt-${x.ma}"
        style="flex: ${x.so} 0 0" title="${escapeHTML(x.ten)}: ${x.so}"></span>`).join('')}
    </div>
    <div class="lt-thanh-ct">
      ${doan.map((x) => `<span><i class="lt-cham tt-${x.ma}"></i>${
        escapeHTML(x.ten)} · ${x.so}</span>`).join('')}
    </div>
  </section>`;
}

/* Bảng ngày theo bác sĩ.
 *
 * Đây là thứ lễ tân cần mà một danh sách dọc không trả lời được: bác sĩ nào
 * đang trống lúc mấy giờ. Cột là bác sĩ, trục dọc là giờ, mỗi lịch hẹn là một
 * khối đặt đúng vị trí và cao đúng thời lượng — nên khoảng trống giữa các
 * khối chính là chỗ còn đặt được.
 *
 * Vạch "bây giờ" chỉ vẽ khi đang xem đúng ngày hôm nay; vẽ nó trên một ngày
 * khác là nói dối.
 */
const GIO_MO = 7;
const GIO_DONG = 21;
const CAO_PHUT = 1.15; // px cho mỗi phút

function veBangNgay(d) {
  const hienThi = d.filter((x) => x.trang_thai !== 'huy');
  const bacSiCo = BAC_SI.filter((b) => hienThi.some((x) => x.bac_si === b.ma));
  if (!bacSiCo.length) {
    return `<section class="panel">
      <header class="section-title lt-header">
        <h3>Lịch ngày theo bác sĩ</h3>
      </header>
      <p class="empty-state">Chưa có lịch hẹn nào để xếp lên bảng ngày.</p>
    </section>`;
  }

  const phut = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const tuGoc = (hhmm) => (phut(hhmm) - GIO_MO * 60) * CAO_PHUT;
  const caoBang = (GIO_DONG - GIO_MO) * 60 * CAO_PHUT;

  const nay = new Date();
  const laHomNay = todayISO() === new Date().toISOString().slice(0, 10);
  const phutHienTai = nay.getHours() * 60 + nay.getMinutes();
  const trongGio = phutHienTai >= GIO_MO * 60 && phutHienTai <= GIO_DONG * 60;

  const cotGio = [];
  for (let h = GIO_MO; h <= GIO_DONG; h += 1) {
    cotGio.push(`<div class="lt-gio-nhan" style="top:${(h - GIO_MO) * 60 * CAO_PHUT}px">
      ${String(h).padStart(2, '0')}:00</div>`);
  }
  const vachGio = [];
  for (let h = GIO_MO; h <= GIO_DONG; h += 1) {
    vachGio.push(`<div class="lt-vach" style="top:${(h - GIO_MO) * 60 * CAO_PHUT}px"></div>`);
    if (h < GIO_DONG) {
      vachGio.push(`<div class="lt-vach nua" style="top:${
        ((h - GIO_MO) * 60 + 30) * CAO_PHUT}px"></div>`);
    }
  }

  const cot = bacSiCo.map((b) => {
    const cua = hienThi.filter((x) => x.bac_si === b.ma);
    const khoi = cua.map((x) => {
      const cao = Math.max(x.phut * CAO_PHUT, 26);
      const gon = cao < 46;
      return `<button type="button" class="lt-khoi tt-${x.trang_thai}${gon ? ' gon' : ''}"
        style="top:${tuGoc(x.gio)}px; height:${cao}px"
        data-khoi="${escapeHTML(x.id)}"
        title="${escapeHTML(`${x.gio} · ${x.khach.ten} · ${x.noi_dung || ''}`)}">
        <b>${escapeHTML(x.gio)}</b>
        <span>${escapeHTML(x.khach.ten)}</span>
        ${gon ? '' : `<small>${escapeHTML(x.noi_dung || LOAI_LICH[x.loai] || '')}</small>`}
      </button>`;
    }).join('');
    return `<div class="lt-cot">
      <header class="lt-cot-dau">
        <b>${escapeHTML(b.ten.replace(/^BS\.\s*/, ''))}</b>
        <small>${escapeHTML(b.chuyen)} · ${cua.length} lịch</small>
      </header>
      <div class="lt-cot-than" style="height:${caoBang}px">
        ${vachGio.join('')}${khoi}
      </div>
    </div>`;
  }).join('');

  return `<section class="panel lt-bang-ngay-panel">
    <header class="section-title lt-header">
      <h3>Lịch ngày theo bác sĩ</h3>
      <span class="pill">Khoảng trống giữa các khối là chỗ còn đặt được</span>
      <label class="lt-loc-nhanh">
        <span>Chi nhánh</span>
        <select id="ltHnChiNhanh2">
          ${opt('', 'Tất cả', hnChiNhanh)}
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten, hnChiNhanh)).join('')}
        </select>
      </label>
    </header>
    <div class="lt-bang-ngay" id="ltBangNgay">
      <div class="lt-truc-gio" style="height:${caoBang}px">${cotGio.join('')}</div>
      <div class="lt-cot-bo">
        ${cot}
        ${laHomNay && trongGio ? `<div class="lt-bay-gio"
          style="top:${(phutHienTai - GIO_MO * 60) * CAO_PHUT + 44}px">
          <span>${String(nay.getHours()).padStart(2, '0')}:${
            String(nay.getMinutes()).padStart(2, '0')}</span>
        </div>` : ''}
      </div>
    </div>
  </section>`;
}


function veHomNay() {
  const d = dsHomNay;
  const dem = (tt) => d.filter((x) => x.trang_thai === tt).length;
  const chuaDen = d.filter((x) => x.trang_thai === 'cho_den');
  const keTiep = chuaDen[0];

  const dong = d.map((x) => veTheLich(x)).join('');

  return `
    ${veTomTat(d, dem)}

    ${keTiep ? `<div class="lt-ke-tiep">
      <span class="lt-ke-tiep-icon"><i class="ri-user-received-2-line"></i></span>
      <span class="lt-ke-tiep-chu">
        <small>Khách kế tiếp</small>
        <b>${escapeHTML(keTiep.gio)} · ${escapeHTML(keTiep.khach.ten)}</b>
        <span>${escapeHTML(tenBacSi(keTiep.bac_si))} · ${escapeHTML(keTiep.phong)}</span>
      </span>
      <button type="button" class="primary-button" data-td="${escapeHTML(keTiep.id)}">
        <i class="ri-user-follow-line"></i> Tiếp đón
      </button>
    </div>` : ''}

    ${veBangNgay(d)}

    <section class="panel">
      <header class="section-title lt-header">
        <h3>Danh sách lịch hẹn</h3>
        <span class="pill">${ngayHien(todayISO())} · sắp theo giờ hẹn</span>
        <label class="lt-loc-nhanh">
          <span>Chi nhánh</span>
          <select id="ltHnChiNhanh">
            ${opt('', 'Tất cả', hnChiNhanh)}
            ${CHI_NHANH.map((c) => opt(c.ma, c.ten, hnChiNhanh)).join('')}
          </select>
        </label>
      </header>
      <div class="lt-danh-sach">
        ${dong || '<p class="empty-state">Chưa có lịch hẹn nào hôm nay.</p>'}
      </div>
    </section>`;
}

/* ── Tab: Lịch hẹn ───────────────────────────────────────────────────── */

function veForm() {
  if (!hienForm) return '';
  const gioGoiY = [];
  for (let h = 7; h <= 20; h += 1) {
    gioGoiY.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 20) gioGoiY.push(`${String(h).padStart(2, '0')}:30`);
  }
  return `<section class="panel lt-form">
    <header class="section-title lt-header">
      <h3>Đặt lịch hẹn</h3>
      <span class="pill">Khách đang ở quầy hoặc gọi tới</span>
      <button type="button" class="ghost-button" id="ltDongForm">
        <i class="ri-close-line"></i> Đóng
      </button>
    </header>
    <div class="lt-form-luoi">
      <label><span>Tên khách hàng *</span>
        <input type="text" id="fTen" placeholder="Nguyễn Văn A" autocomplete="off"></label>
      <label><span>Số điện thoại *</span>
        <input type="tel" id="fDienThoai" placeholder="09xxxxxxxx" inputmode="numeric"></label>
      <label><span>Ngày sinh</span>
        <input type="date" id="fNgaySinh"></label>
      <label><span>Giới tính</span>
        <select id="fGioi">${opt('nu', 'Nữ')}${opt('nam', 'Nam')}</select></label>

      <label><span>Ngày hẹn *</span>
        <input type="date" id="fNgay" value="${todayISO()}"></label>
      <label><span>Giờ hẹn *</span>
        <select id="fGio">${gioGoiY.map((g) => opt(g, g, '09:00')).join('')}</select></label>
      <label><span>Thời lượng</span>
        <select id="fPhut">
          ${[15, 30, 45, 60, 90].map((p) => opt(String(p), `${p} phút`, '30')).join('')}
        </select></label>
      <label><span>Loại lịch</span>
        <select id="fLoai">
          ${Object.entries(LOAI_LICH).map(([v, t]) => opt(v, t)).join('')}
        </select></label>

      <label><span>Chi nhánh *</span>
        <select id="fChiNhanh">
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten)).join('')}
        </select></label>
      <label><span>Bác sĩ *</span>
        <select id="fBacSi">
          ${BAC_SI.map((b) => opt(b.ma, `${b.ten} · ${b.chuyen}`)).join('')}
        </select></label>
      <label><span>Phòng</span>
        <select id="fPhong">${PHONG.map((p) => opt(p, p)).join('')}</select></label>
      <label><span>Nguồn khách</span>
        <select id="fNguon">
          ${Object.entries(NGUON).map(([v, t]) => opt(v, t, 'vang_lai')).join('')}
        </select></label>

      <label class="lt-rong"><span>Nội dung hẹn</span>
        <input type="text" id="fNoiDung" placeholder="Khám tổng quát, tư vấn niềng răng…"></label>
      <label class="lt-rong"><span>Ghi chú nội bộ</span>
        <input type="text" id="fGhiChu" placeholder="Khách đi cùng người nhà, cần chỗ đậu ô tô…"></label>
    </div>
    <div class="lt-form-nut">
      <button type="button" class="primary-button" id="ltLuu">
        <i class="ri-calendar-check-line"></i> Đặt lịch
      </button>
    </div>
  </section>`;
}

function veLichHen() {
  const kq = phanTrang(dsLichHen, trang, 25);

  const dong = kq.ds.map((x) => `<tr data-id="${escapeHTML(x.id)}" class="tt-${x.trang_thai}">
    <td data-label="Thời gian" class="lh-cot-gio">
      <b>${escapeHTML(x.gio)}</b>
      <small>${ngayHien(x.ngay)}</small>
      <em>${escapeHTML(x.ma)}</em>
    </td>
    <td data-label="Khách hàng">${oKhach(x)}</td>
    <td data-label="Nội dung">
      <span class="lh-viec">${escapeHTML(x.noi_dung || '—')}</span>
      <span class="lt-the-nho">${escapeHTML(LOAI_LICH[x.loai] || x.loai)}</span>
      <span class="lt-the-nho">${escapeHTML(NGUON[x.nguon] || x.nguon)}</span>
    </td>
    <td data-label="Bác sĩ">
      <b>${escapeHTML(tenBacSi(x.bac_si))}</b>
      <small>${escapeHTML(x.phong)} · ${escapeHTML(tenChiNhanh(x.chi_nhanh))}</small>
    </td>
    <td data-label="Trạng thái">${pill(x.trang_thai)}</td>
    <td data-label="" class="lt-cot-nut">
      ${x.trang_thai === 'cho_den'
        ? `<button type="button" class="secondary-button lt-nho" data-td="${escapeHTML(x.id)}">
             <i class="ri-user-follow-line"></i> Tiếp đón</button>`
        : ''}
      <button type="button" class="ghost-button lt-nho" data-doi="${escapeHTML(x.id)}">
        <i class="ri-calendar-event-line"></i> Đổi lịch</button>
    </td>
  </tr>`).join('');

  const soLoc = [fChiNhanh, fBacSi, fTrangThai, fLoai, fTim, fDen].filter(Boolean).length;

  return `
    ${veForm()}
    <section class="panel">
      <header class="section-title lt-header">
        <h3>Lịch hẹn</h3>
        <span class="pill">${dsLichHen.length} lịch hẹn khớp bộ lọc</span>
        <div class="lt-header-nut">
          <button type="button" class="ghost-button" id="ltXuat">
            <i class="ri-download-2-line"></i> Xuất CSV
          </button>
          <button type="button" class="primary-button" id="ltMoForm">
            <i class="ri-add-line"></i> Đặt lịch
          </button>
        </div>
      </header>

      <div class="lt-tim-lon">
        <i class="ri-search-line"></i>
        <input type="search" id="lTim" value="${escapeHTML(fTim)}"
               placeholder="Tìm theo tên khách, số điện thoại hoặc mã lịch hẹn">
        ${soLoc ? `<button type="button" class="ghost-button lt-nho" id="ltXoaLoc">
          <i class="ri-filter-off-line"></i> Bỏ ${soLoc} bộ lọc</button>` : ''}
      </div>

      <div class="lt-nhanh">
        <span class="lt-nhanh-nhan">Khoảng ngày</span>
        ${[['hom-nay', 'Hôm nay'], ['mai', 'Ngày mai'], ['7-ngay', '7 ngày tới'],
           ['thang', 'Tháng này'], ['tat-ca', 'Tất cả']]
          .map(([ma, ten]) => `<button type="button" class="lt-chip${
            khoangNgay === ma ? ' is-chon' : ''}" data-khoang="${ma}">${ten}</button>`).join('')}
        <span class="lt-nhanh-ngay">
          <input type="date" id="lTu" value="${escapeHTML(fTu)}" aria-label="Từ ngày">
          <i class="ri-arrow-right-line"></i>
          <input type="date" id="lDen" value="${escapeHTML(fDen)}" aria-label="Đến ngày">
        </span>
      </div>

      <div class="lt-loc">
        <label><span>Chi nhánh</span><select id="lChiNhanh">
          ${opt('', 'Tất cả chi nhánh', fChiNhanh)}
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten, fChiNhanh)).join('')}
        </select></label>
        <label><span>Bác sĩ</span><select id="lBacSi">
          ${opt('', 'Tất cả bác sĩ', fBacSi)}
          ${BAC_SI.map((b) => opt(b.ma, b.ten, fBacSi)).join('')}
        </select></label>
        <label><span>Trạng thái</span><select id="lTrangThai">
          ${opt('', 'Mọi trạng thái', fTrangThai)}
          ${Object.entries(TRANG_THAI).map(([v, n]) => opt(v, n.ten, fTrangThai)).join('')}
        </select></label>
        <label><span>Loại lịch</span><select id="lLoai">
          ${opt('', 'Mọi loại lịch', fLoai)}
          ${Object.entries(LOAI_LICH).map(([v, t]) => opt(v, t, fLoai)).join('')}
        </select></label>
      </div>

      <div class="hh-bang-wrap lt-bang">
        <table class="hh-bang">
          <thead><tr>
            <th>Thời gian</th><th>Khách hàng</th><th>Nội dung</th>
            <th>Bác sĩ</th><th>Trạng thái</th><th></th>
          </tr></thead>
          <tbody>${dong || '<tr><td colspan="6" class="empty-state">Không có lịch hẹn nào khớp bộ lọc.</td></tr>'}</tbody>
        </table>
      </div>
      ${thanhPhanTrang(kq, 'ltTrang', 'lịch hẹn')}
    </section>`;
}

/* ── Tab: Hành trình khách hàng ──────────────────────────────────────── */

function veHanhTrinh() {
  if (!khachMo) {
    const dong = dsKhach.map((k) => `<tr>
      <td data-label="Khách hàng">${oKhach({ khach: k.khach })}</td>
      <td data-label="Chi nhánh">
        <b>${escapeHTML(tenChiNhanh(k.chi_nhanh))}</b>
        <small>${escapeHTML(tenBacSi(k.dieu_phoi.bac_si))}</small></td>
      <td data-label="Nguồn"><span class="lt-the-nho">${
        escapeHTML(NGUON[k.nguon] || k.nguon)}</span></td>
      <td data-label="Lần khám" class="lh-so"><b>${k.lan_kham}</b></td>
      <td data-label="Lịch hẹn" class="lh-so">${k.so_lich}</td>
      <td data-label="Đã đến" class="lh-so">${k.so_lan_den}</td>
      <td data-label="Không đến" class="lh-so">${k.so_khong_den || '—'}</td>
      <td data-label="Tỷ lệ đến">
        <span class="lt-ty-le ${k.ty_le_den >= 80 ? 'tot' : k.ty_le_den >= 50 ? 'vua' : 'kem'}">
          ${k.ty_le_den}%</span></td>
      <td data-label="Gần nhất">${ngayHien(k.lich_gan_nhat)}</td>
      <td data-label="" class="lt-cot-nut">
        <button type="button" class="secondary-button lt-nho" data-khach="${
          escapeHTML(k.khach.dien_thoai)}">
          <i class="ri-route-line"></i> Xem hành trình</button>
      </td>
    </tr>`).join('');

    return `<section class="panel">
      <header class="section-title lt-header">
        <h3>Hành trình khách hàng</h3>
        <span class="pill">${dsKhach.length} khách · gộp theo số điện thoại</span>
      </header>
      <div class="lt-tim-lon">
        <i class="ri-search-line"></i>
        <input type="search" id="hTim" value="${escapeHTML(hTim)}"
               placeholder="Tìm theo tên khách hoặc số điện thoại">
      </div>
      <div class="lt-loc">
        <label><span>Chi nhánh</span><select id="hChiNhanh">
          ${opt('', 'Tất cả chi nhánh', hChiNhanh)}
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten, hChiNhanh)).join('')}
        </select></label>
        <label><span>Nguồn khách</span><select id="hNguon">
          ${opt('', 'Mọi nguồn', hNguon)}
          ${Object.entries(NGUON).map(([v, t]) => opt(v, t, hNguon)).join('')}
        </select></label>
      </div>
      <div class="hh-bang-wrap lt-bang">
        <table class="hh-bang">
          <thead><tr>
            <th>Khách hàng</th><th>Chi nhánh</th><th>Nguồn</th><th>Lần khám</th><th>Lịch hẹn</th>
            <th>Đã đến</th><th>Không đến</th><th>Tỷ lệ đến</th><th>Gần nhất</th><th></th>
          </tr></thead>
          <tbody>${dong || '<tr><td colspan="10" class="empty-state">Không có khách nào khớp bộ lọc.</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
  }

  const h = hanhTrinh;
  if (!h) return '<p class="empty-state">Không mở được hồ sơ của khách này.</p>';

  const dp = h.dieu_phoi;
  const nhom = NHOM_KHACH[dp.nhom] || NHOM_KHACH.thuong;
  const dem = (loai) => h.su_kien.filter((e) => e.loai === loai).length;
  const daDen = h.lich.filter((x) => x.den_luc
    || ['da_den', 'dang_kham', 'hoan_tat'].includes(x.trang_thai)).length;

  const TAB_HO_SO = [
    { ma: 'hanh-trinh', ten: 'Hành trình', icon: 'ri-route-line' },
    { ma: 'lich-su', ten: 'Lần khám và dịch vụ', icon: 'ri-list-check-2' },
    { ma: 'dieu-phoi', ten: 'Điều phối', icon: 'ri-user-shared-line' },
  ];

  return `
    <button type="button" class="ghost-button lt-quay-lai" id="htDong">
      <i class="ri-arrow-left-line"></i> Danh sách khách
    </button>

    <section class="panel lt-ho-so-dau">
      <div class="lt-hs-tren">
        <span class="lt-avatar lon">${escapeHTML(chuDau(h.khach.ten))}</span>
        <div class="lt-hs-ten">
          <h2>${escapeHTML(h.khach.ten)}</h2>
          <p class="lt-hs-ma">
            <code>${escapeHTML(h.khach.ma || h.khach.dien_thoai)}</code>
            <span class="status-pill ${nhom.lop}">${escapeHTML(nhom.ten)}</span>
          </p>
          <p class="lt-hs-phu">
            ${escapeHTML(h.khach.dien_thoai)}
            ${h.khach.ngay_sinh ? ` · ${ngayHien(h.khach.ngay_sinh)} · ${
              escapeHTML(tuoiTu(h.khach.ngay_sinh))}` : ''}
            · ${h.khach.gioi === 'nam' ? 'Nam' : 'Nữ'}
            · ${escapeHTML(tenChiNhanh(h.chi_nhanh))}
          </p>
        </div>
        <div class="lt-hs-phu-trach">
          <div><small>Bác sĩ phụ trách</small><b>${escapeHTML(tenBacSi(dp.bac_si))}</b></div>
          <div><small>Telesale</small><b>${escapeHTML(tenTelesale(dp.telesale))}</b></div>
          <div><small>Chăm sóc</small><b>${dp.cham_soc
            ? escapeHTML(tenChamSoc(dp.cham_soc))
            : '<em class="lt-chua-gan">Chưa gán</em>'}</b></div>
        </div>
      </div>
      <div class="lt-ht-so">
        <div><b>${h.tong_lan}</b><span>lần đã khám</span></div>
        <div><b>${h.lich.length}</b><span>lịch hẹn</span></div>
        <div><b>${daDen}</b><span>lần tới</span></div>
        <div><b>${dem('khong_den')}</b><span>lần không tới</span></div>
        <div><b>${dem('goi')}</b><span>cuộc gọi telesale</span></div>
      </div>
    </section>

    <nav class="lt-tab-con" role="tablist">
      ${TAB_HO_SO.map((t) => `<button type="button" role="tab"
        class="lt-tab-c${tabHoSo === t.ma ? ' is-active' : ''}"
        aria-selected="${tabHoSo === t.ma}" data-tabhs="${t.ma}">
        <i class="${t.icon}"></i><span>${escapeHTML(t.ten)}</span></button>`).join('')}
    </nav>

    ${tabHoSo === 'hanh-trinh' ? veDongThoiGian(h) : ''}
    ${tabHoSo === 'lich-su' ? veLanKham(h) : ''}
    ${tabHoSo === 'dieu-phoi' ? veDieuPhoi(h, dp) : ''}`;
}

function veDongThoiGian(h) {
  const moc = h.su_kien.map((e) => {
    const l = LOAI_SU_KIEN[e.loai] || { ten: e.loai, icon: 'ri-circle-line', nhom: 'le_tan' };
    const lan = e.lich_id && h.so_lan[e.lich_id];
    return `<li class="ht-moc nhom-${l.nhom}${e.sap_toi ? ' sap-toi' : ''}">
      <span class="ht-cham"><i class="${escapeHTML(l.icon)}"></i></span>
      <div class="ht-noi">
        <p class="ht-dau">
          <b>${escapeHTML(l.ten)}</b>
          ${lan ? `<span class="lt-lan">Lần ${lan}</span>` : ''}
          <time>${escapeHTML(e.luc.slice(0, 10).split('-').reverse().join('/'))} · ${
            escapeHTML(e.luc.slice(11, 16))}</time>
        </p>
        <p class="ht-chu">${escapeHTML(e.chu)}</p>
        ${e.phu ? `<p class="ht-phu">${escapeHTML(e.phu)}</p>` : ''}
        <p class="ht-boi">${escapeHTML(e.boi || '—')}</p>
      </div>
    </li>`;
  }).join('');

  return `<section class="panel">
    <header class="section-title lt-header">
      <h3>Dòng thời gian</h3>
      <span class="pill">Từ lúc là lead cho tới lần chăm sóc gần nhất</span>
    </header>
    <ol class="ht-doc">${moc}</ol>
  </section>`;
}

/* Lần khám và dịch vụ.
 *
 * Số thứ tự chỉ đếm buổi khách THẬT SỰ tới. "Lần 3" mà tính cả hai buổi khách
 * không đến thì con số đó không nói gì về tiến trình điều trị. Buổi hủy hoặc
 * không đến vẫn hiện đủ, nhưng mang nhãn riêng thay vì một số thứ tự. */
function veLanKham(h) {
  const dong = h.lich.map((x) => {
    const lan = h.so_lan[x.id];
    return `<tr class="tt-${x.trang_thai}">
      <td data-label="Lần">${lan
        ? `<span class="lt-lan lon">${lan === 1 ? 'Lần đầu' : `Lần ${lan}`}</span>`
        : '<span class="lt-lan trong">—</span>'}</td>
      <td data-label="Ngày">
        <b>${ngayHien(x.ngay)}</b><small>${escapeHTML(x.gio)} · ${x.phut} phút</small></td>
      <td data-label="Nội dung">
        <span class="lh-viec">${escapeHTML(x.noi_dung || '—')}</span>
        <span class="lt-the-nho">${escapeHTML(LOAI_LICH[x.loai] || x.loai)}</span></td>
      <td data-label="Bác sĩ">
        <b>${escapeHTML(tenBacSi(x.bac_si))}</b>
        <small>${escapeHTML(x.phong)} · ${escapeHTML(tenChiNhanh(x.chi_nhanh))}</small></td>
      <td data-label="Nguồn"><span class="lt-the-nho">${
        escapeHTML(NGUON[x.nguon] || x.nguon)}</span></td>
      <td data-label="Trạng thái">${pill(x.trang_thai)}</td>
      <td data-label="" class="lt-cot-nut">
        ${['cho_den', 'da_den', 'khong_den'].includes(x.trang_thai)
          ? `<button type="button" class="ghost-button lt-nho" data-chuyen-bs="${escapeHTML(x.id)}">
               <i class="ri-user-shared-line"></i> Chuyển bác sĩ</button>`
          : ''}
      </td>
    </tr>`;
  }).join('');

  return `<section class="panel">
    <header class="section-title lt-header">
      <h3>Lần khám và dịch vụ</h3>
      <span class="pill">${h.tong_lan} lần đã tới · chỉ đếm buổi khách thật sự đến</span>
    </header>
    <div class="hh-bang-wrap lt-bang">
      <table class="hh-bang">
        <thead><tr>
          <th>Lần</th><th>Ngày</th><th>Nội dung</th><th>Bác sĩ</th>
          <th>Nguồn</th><th>Trạng thái</th><th></th>
        </tr></thead>
        <tbody>${dong}</tbody>
      </table>
    </div>
  </section>`;
}

/* Điều phối.
 *
 * Ba người phụ trách gắn với KHÁCH chứ không gắn với từng buổi hẹn. Gắn vào
 * buổi hẹn thì mỗi lần đặt lịch mới lại phải chọn lại, và hai buổi của cùng
 * một người có thể ra hai bác sĩ phụ trách khác nhau mà không ai biết. */
function veDieuPhoi(h, dp) {
  const sapToi = h.lich.filter((x) => x.trang_thai === 'cho_den').length;
  return `<section class="panel lt-dp">
    <header class="section-title lt-header">
      <h3>Điều phối khách</h3>
      <span class="pill">Người phụ trách gắn với khách, không gắn với từng buổi hẹn</span>
    </header>

    <div class="lt-dp-luoi">
      <label class="lt-o"><span>Bác sĩ phụ trách</span>
        <select id="dpBacSi">
          ${opt('', 'Chưa gán', dp.bac_si)}
          ${BAC_SI.map((b) => opt(b.ma, `${b.ten} · ${b.chuyen}`, dp.bac_si)).join('')}
        </select></label>
      <label class="lt-o"><span>Telesale phụ trách</span>
        <select id="dpTelesale">
          ${opt('', 'Chưa gán', dp.telesale)}
          ${TELESALE.map((t) => opt(t.ma, t.ten, dp.telesale)).join('')}
        </select></label>
      <label class="lt-o"><span>Người chăm sóc</span>
        <select id="dpChamSoc">
          ${opt('', 'Chưa gán', dp.cham_soc)}
          ${CHAM_SOC.map((c) => opt(c.ma, c.ten, dp.cham_soc)).join('')}
        </select></label>
      <label class="lt-o"><span>Nhóm khách hàng</span>
        <select id="dpNhom">
          ${Object.entries(NHOM_KHACH).map(([v, n]) => opt(v, n.ten, dp.nhom)).join('')}
        </select></label>
    </div>

    <p class="lt-dp-luu-y">
      <i class="ri-information-line"></i>
      Đổi bác sĩ phụ trách thì ${sapToi} buổi hẹn <b>chưa diễn ra</b> sẽ chuyển theo.
      Buổi đã khám xong giữ nguyên bác sĩ đã làm — sửa lại là viết lại lịch sử.
    </p>

    <div class="lt-dp-nut">
      <button type="button" class="primary-button" id="dpLuu">
        <i class="ri-save-3-line"></i> Lưu điều phối
      </button>
    </div>
  </section>`;
}

/* ── Tab: Báo cáo tháng ──────────────────────────────────────────────── */

function veBaoCao() {
  const bc = baoCao;
  if (!bc) return '<p class="empty-state">Chưa có số liệu.</p>';

  const dai = (ds, tong) => ds.map((x) => `<li>
    <span class="bc-ten">${escapeHTML(x.ten)}</span>
    <span class="bc-thanh"><i style="width:${tong ? (x.so / tong) * 100 : 0}%"></i></span>
    <span class="bc-so">${x.so}</span>
  </li>`).join('');

  const maxNgay = Math.max(1, ...bc.theo_ngay.map((n) => n.so));

  return `<section class="panel lt-bc-dau">
      <header class="section-title lt-header">
        <h3>Báo cáo tháng</h3>
        <span class="pill">Mọi con số tính từ cùng một tập lịch hẹn</span>
        <div class="lt-header-nut">
          <select id="bcKy" class="lt-chon-ky">${danhSachKy(kyBaoCao)}</select>
          <select id="bcChiNhanh">
            ${opt('', 'Tất cả chi nhánh', bcChiNhanh)}
            ${CHI_NHANH.map((c) => opt(c.ma, c.ten, bcChiNhanh)).join('')}
          </select>
          <button type="button" class="ghost-button" id="bcXuat">
            <i class="ri-download-2-line"></i> Xuất CSV
          </button>
        </div>
      </header>
      <div class="lt-bc-so">
        <div><b>${bc.tong}</b><span>lịch hẹn</span></div>
        <div><b>${bc.so_khach}</b><span>lượt khách</span></div>
        <div><b>${bc.khach_moi}</b><span>khách mới</span></div>
        <div class="tot"><b>${bc.ty_le_den}%</b><span>tỷ lệ đến</span></div>
        <div class="kem"><b>${bc.ty_le_khong_den}%</b><span>tỷ lệ không đến</span></div>
      </div>
    </section>

    <section class="panel">
      <header class="section-title lt-header">
        <h3>Theo chi nhánh</h3>
        <span class="pill">Tổng các chi nhánh luôn bằng tổng chung</span>
      </header>
      <div class="hh-bang-wrap lt-bang">
        <table class="hh-bang">
          <thead><tr><th>Chi nhánh</th><th>Lịch hẹn</th><th>Lượt khách</th>
            <th>Đã đến</th><th>Không đến</th><th>Tỷ lệ đến</th></tr></thead>
          <tbody>${bc.theo_chi_nhanh.map((c) => `<tr>
            <td data-label="Chi nhánh"><b>${escapeHTML(c.ten)}</b></td>
            <td data-label="Lịch hẹn" class="lh-so">${c.so}</td>
            <td data-label="Lượt khách" class="lh-so">${c.so_khach}</td>
            <td data-label="Đã đến" class="lh-so">${c.den}</td>
            <td data-label="Không đến" class="lh-so">${c.khong_den}</td>
            <td data-label="Tỷ lệ đến"><span class="lt-ty-le ${
              c.ty_le_den >= 80 ? 'tot' : c.ty_le_den >= 50 ? 'vua' : 'kem'}">${c.ty_le_den}%</span></td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Tháng này chưa có lịch hẹn nào.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <div class="lt-bc-luoi">
      <section class="panel">
        <header class="section-title"><h3>Theo nguồn khách</h3></header>
        <ul class="bc-dai">${dai(bc.theo_nguon, bc.tong)}</ul>
      </section>
      <section class="panel">
        <header class="section-title"><h3>Theo trạng thái</h3></header>
        <ul class="bc-dai">${dai(bc.theo_trang_thai, bc.tong)}</ul>
      </section>
      <section class="panel">
        <header class="section-title"><h3>Theo loại lịch</h3></header>
        <ul class="bc-dai">${dai(bc.theo_loai, bc.tong)}</ul>
      </section>
      <section class="panel">
        <header class="section-title"><h3>Theo bác sĩ</h3></header>
        <ul class="bc-dai">${dai(bc.theo_bac_si.map((b) => ({
          ten: `${b.ten} · ${b.chuyen}`, so: b.so })), bc.tong)}</ul>
      </section>
    </div>

    <section class="panel">
      <header class="section-title lt-header">
        <h3>Lịch hẹn theo ngày</h3>
        <span class="pill">Chỉ những ngày thật sự có lịch</span>
      </header>
      <div class="bc-cot">
        ${bc.theo_ngay.map((n) => `<div class="bc-cot-o" title="${
          escapeHTML(ngayHien(n.ngay))}: ${n.so} lịch">
          <span class="bc-cot-thanh" style="height:${(n.so / maxNgay) * 100}%"></span>
          <span class="bc-cot-so">${n.so}</span>
          <span class="bc-cot-ngay">${escapeHTML(n.ngay.slice(8))}</span>
        </div>`).join('') || '<p class="empty-state">Tháng này chưa có lịch hẹn nào.</p>'}
      </div>
    </section>`;
}

/* ── Tab: Chăm sóc ───────────────────────────────────────────────────── */

function veHangDoi() {
  const thePhieu = Object.entries(HANG_DOI).map(([ma, h]) => `
    <button type="button" class="lt-queue${hangDoiMo === ma ? ' is-open' : ''}"
            data-queue="${escapeHTML(ma)}">
      <span class="lt-queue-icon"><i class="${escapeHTML(h.icon)}"></i></span>
      <span class="lt-queue-so">${demQueue[ma] ?? 0}</span>
      <span class="lt-queue-ten">${escapeHTML(h.ten)}</span>
      <span class="lt-queue-mo">${escapeHTML(h.mo_ta)}</span>
    </button>`).join('');

  const h = HANG_DOI[hangDoiMo];
  const dong = dsHangDoi.map((x) => {
    if (x.la_phan_hoi) {
      const mucNhan = { cao: 'Gấp', thuong: 'Bình thường', thap: 'Thấp' };
      const mucLop = { cao: 'bad', thuong: 'warn', thap: 'neutral' };
      return `<article class="lt-viec-hang">
        <div class="lt-noi">
          ${oKhach(x)}
          <p class="lt-viec">${escapeHTML(x.noi_dung)}</p>
          <p class="lt-meta">
            <span>${escapeHTML(tenChiNhanh(x.chi_nhanh))}</span>
            <span>Nhận ${escapeHTML(ngayHien(x.tao_luc.slice(0, 10)))}</span>
            <span class="status-pill ${mucLop[x.muc]}">${escapeHTML(mucNhan[x.muc])}</span>
          </p>
        </div>
        <div class="lt-thao-tac">
          <div class="lt-nut">
            <a class="ghost-button lt-nho" href="tel:${escapeHTML(x.khach.dien_thoai)}">
              <i class="ri-phone-line"></i> Gọi</a>
            <button type="button" class="primary-button lt-nho"
                    data-xong="${escapeHTML(x.id)}">Đã xử lý</button>
          </div>
        </div>
      </article>`;
    }
    return `<article class="lt-viec-hang">
      <div class="lt-noi">
        ${oKhach(x)}
        <p class="lt-viec">${escapeHTML(x.noi_dung || LOAI_LICH[x.loai] || '')}</p>
        <p class="lt-meta">
          <span>${escapeHTML(ngayHien(x.ngay))} · ${escapeHTML(x.gio)}</span>
          <span>${escapeHTML(tenBacSi(x.bac_si))}</span>
          <span>${escapeHTML(tenChiNhanh(x.chi_nhanh))}</span>
          ${x.khach.ngay_sinh && hangDoiMo === 'sinh_nhat'
            ? `<span class="lt-den">Sinh nhật ${escapeHTML(ngayHien(x.khach.ngay_sinh))}</span>` : ''}
        </p>
        ${x.ghi_chu ? `<p class="lt-ghi">${escapeHTML(x.ghi_chu)}</p>` : ''}
      </div>
      <div class="lt-thao-tac">
        ${pill(x.trang_thai)}
        <div class="lt-nut">
          <a class="ghost-button lt-nho" href="tel:${escapeHTML(x.khach.dien_thoai)}">
            <i class="ri-phone-line"></i> Gọi</a>
          <button type="button" class="ghost-button lt-nho" data-doi="${escapeHTML(x.id)}">Đặt lại lịch</button>
        </div>
      </div>
    </article>`;
  }).join('');

  return `
    <section class="lt-queue-luoi">${thePhieu}</section>
    <section class="panel">
      <header class="section-title lt-header">
        <h3>${escapeHTML(h.ten)}</h3>
        <span class="pill">${escapeHTML(h.mo_ta)} · ${dsHangDoi.length} khách</span>
      </header>
      <div class="lt-danh-sach">
        ${dong || '<p class="empty-state">Hàng đợi này đang trống. Không có việc phải làm.</p>'}
      </div>
    </section>`;
}

/* ── Khung màn hình ──────────────────────────────────────────────────── */

const TABS = [
  { ma: 'hom-nay', ten: 'Hôm nay', icon: 'ri-calendar-check-line' },
  { ma: 'lich-hen', ten: 'Lịch hẹn', icon: 'ri-calendar-2-line' },
  { ma: 'cham-soc', ten: 'Chăm sóc', icon: 'ri-customer-service-2-line' },
  { ma: 'hanh-trinh', ten: 'Hành trình', icon: 'ri-route-line' },
  { ma: 'bao-cao', ten: 'Báo cáo', icon: 'ri-bar-chart-box-line' },
];

export async function renderView() {
  if (tab === 'hom-nay') {
    dsHomNay = await layLichHomNay(hnChiNhanh || undefined);
  } else if (tab === 'lich-hen') {
    dsLichHen = await layLichHen({
      tu: fTu || undefined, den: fDen || undefined,
      chiNhanh: fChiNhanh || undefined, bacSi: fBacSi || undefined,
      trangThai: fTrangThai || undefined, loai: fLoai || undefined,
      tim: fTim || undefined,
    });
  } else if (tab === 'cham-soc') {
    [demQueue, dsHangDoi] = await Promise.all([demHangDoi(), layHangDoi(hangDoiMo)]);
  } else if (tab === 'hanh-trinh') {
    if (khachMo) {
      hanhTrinh = await layHanhTrinh(khachMo).catch(() => null);
      if (!hanhTrinh) khachMo = '';
    }
    if (!khachMo) {
      dsKhach = await layDanhSachKhach({
        tim: hTim || undefined, chiNhanh: hChiNhanh || undefined, nguon: hNguon || undefined,
      });
    }
  } else if (tab === 'bao-cao') {
    kyBaoCao ||= todayISO().slice(0, 7);
    baoCao = await baoCaoThang(kyBaoCao, bcChiNhanh || undefined);
  }

  return `<div class="view-stack lt-view">
    <header class="view-header">
      <div>
        <h1>Lễ tân</h1>
        <p>Tiếp đón, lịch hẹn và chăm sóc khách hàng tại quầy</p>
      </div>
    </header>

    <div class="lt-canh-bao" role="status">
      <i class="ri-flask-line"></i>
      <div>
        <b>Dữ liệu mẫu — màn hình đang ở giai đoạn dựng giao diện</b>
        <span>Toàn bộ khách hàng, lịch hẹn và phản hồi trên màn này là dữ liệu
        dựng sẵn để xem giao diện. Chưa nối cơ sở dữ liệu, và mọi thao tác
        đặt lịch hay tiếp đón sẽ mất khi tải lại trang.</span>
      </div>
    </div>

    <nav class="lt-tabs" role="tablist">
      ${TABS.map((t) => `<button type="button" role="tab" class="lt-tab${tab === t.ma ? ' is-active' : ''}"
         aria-selected="${tab === t.ma}" data-tab="${t.ma}">
         <i class="${t.icon}"></i><span>${escapeHTML(t.ten)}</span>
       </button>`).join('')}
    </nav>
    ${tab === 'hom-nay' ? veHomNay() : ''}
    ${tab === 'lich-hen' ? veLichHen() : ''}
    ${tab === 'cham-soc' ? veHangDoi() : ''}
    ${tab === 'hanh-trinh' ? veHanhTrinh() : ''}
    ${tab === 'bao-cao' ? veBaoCao() : ''}
  </div>`;
}

/* ── Sự kiện ─────────────────────────────────────────────────────────── */

const ve = () => navigateTo('le-tan');

async function lamRoiVe(viec, loiNhan) {
  try {
    await viec();
    if (loiNhan) showToast(loiNhan);
    await ve();
  } catch (err) {
    showToast(err.message, true);
  }
}

export function initView() {
  const g = (id) => document.getElementById(id);

  document.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => { tab = b.dataset.tab; ve(); });
  });

  /* Hôm nay */
  ['ltHnChiNhanh', 'ltHnChiNhanh2'].forEach((id) => {
    g(id)?.addEventListener('change', (e) => { hnChiNhanh = e.target.value; ve(); });
  });

  // Bấm một khối trên bảng ngày thì cuộn xuống đúng dòng của nó trong danh
  // sách bên dưới, vì mọi nút thao tác nằm ở đó. Nhân đôi nút lên khối là
  // nhân đôi chỗ phải sửa mỗi khi luồng trạng thái đổi.
  document.querySelectorAll('[data-khoi]').forEach((b) => {
    b.addEventListener('click', () => {
      const dong = document.querySelector(`.lt-dong[data-id="${b.dataset.khoi}"]`);
      if (!dong) return;
      dong.scrollIntoView({ behavior: 'smooth', block: 'center' });
      dong.classList.add('vua-chon');
      setTimeout(() => dong.classList.remove('vua-chon'), 1600);
    });
  });

  // Bảng ngày mở ra ở khung 07:00, mà lúc 15h thì lễ tân phải cuộn tay xuống.
  // Đưa vạch bây giờ vào giữa khung ngay khi vẽ xong.
  const bang = g('ltBangNgay');
  const bayGio = bang?.querySelector('.lt-bay-gio');
  if (bang && bayGio) {
    bang.scrollTop = Math.max(0, bayGio.offsetTop - bang.clientHeight / 2);
  }

  document.querySelectorAll('[data-td]').forEach((b) => {
    b.addEventListener('click', () => lamRoiVe(
      () => tiepDon(b.dataset.td), 'Đã tiếp đón khách.',
    ));
  });

  document.querySelectorAll('[data-id2][data-tt]').forEach((b) => {
    b.addEventListener('click', () => lamRoiVe(
      () => doiTrangThai(b.dataset.id2, b.dataset.tt),
      b.dataset.tt === 'hoan_tat' ? 'Đã hoàn tất lượt khám.' : 'Khách đã vào phòng khám.',
    ));
  });

  document.querySelectorAll('[data-huy]').forEach((b) => {
    b.addEventListener('click', async () => {
      const lyDo = await requestInput('Lịch hẹn sẽ chuyển sang trạng thái đã hủy.', {
        title: 'Hủy lịch hẹn', label: 'Lý do hủy',
        placeholder: 'Khách báo bận, xin dời tuần sau…',
        confirmText: 'Hủy lịch', tone: 'danger',
      });
      if (!lyDo) return;
      await lamRoiVe(() => doiTrangThai(b.dataset.huy, 'huy', lyDo), 'Đã hủy lịch hẹn.');
    });
  });

  document.querySelectorAll('[data-doi]').forEach((b) => {
    b.addEventListener('click', async () => {
      const ngay = await requestInput('Nhập ngày hẹn mới theo dạng NĂM-THÁNG-NGÀY.', {
        title: 'Đổi lịch hẹn', label: 'Ngày mới', placeholder: todayISO(),
        confirmText: 'Tiếp tục',
      });
      if (!ngay) return;
      const gio = await requestInput('Nhập giờ hẹn mới theo dạng GIỜ:PHÚT.', {
        title: 'Đổi lịch hẹn', label: 'Giờ mới', placeholder: '09:30',
        confirmText: 'Đổi lịch',
      });
      if (!gio) return;
      await lamRoiVe(() => doiLich(b.dataset.doi, ngay.trim(), gio.trim()),
        'Đã đổi lịch hẹn.');
    });
  });

  /* Lịch hẹn */
  const doiLoc = (id, gan) => g(id)?.addEventListener('change', (e) => {
    gan(e.target.value); trang = 1; ve();
  });
  doiLoc('lTu', (v) => { fTu = v; khoangNgay = ''; });
  doiLoc('lDen', (v) => { fDen = v; khoangNgay = ''; });
  doiLoc('lChiNhanh', (v) => { fChiNhanh = v; });
  doiLoc('lBacSi', (v) => { fBacSi = v; });
  doiLoc('lTrangThai', (v) => { fTrangThai = v; });
  doiLoc('lLoai', (v) => { fLoai = v; });

  function goTimHt(id, gan) {
    const o = g(id);
    if (!o) return;
    let hen;
    o.addEventListener('input', (e) => {
      clearTimeout(hen);
      const v = e.target.value;
      hen = setTimeout(() => { gan(v); ve(); }, 300);
    });
  }

  const oTim = g('lTim');
  if (oTim) {
    let hen;
    oTim.addEventListener('input', (e) => {
      clearTimeout(hen);
      const v = e.target.value;
      hen = setTimeout(() => { fTim = v; trang = 1; ve(); }, 300);
    });
  }

  g('ltXoaLoc')?.addEventListener('click', () => {
    khoangNgay = 'hom-nay';
    [fTu, fDen] = ngayTheoKhoang('hom-nay');
    fChiNhanh = ''; fBacSi = ''; fTrangThai = ''; fLoai = ''; fTim = '';
    trang = 1; ve();
  });

  document.querySelectorAll('[data-khoang]').forEach((b) => {
    b.addEventListener('click', () => {
      khoangNgay = b.dataset.khoang;
      [fTu, fDen] = ngayTheoKhoang(khoangNgay);
      trang = 1; ve();
    });
  });

  /* Hành trình khách */
  document.querySelectorAll('[data-khach]').forEach((b) => {
    b.addEventListener('click', () => { khachMo = b.dataset.khach; ve(); });
  });
  g('htDong')?.addEventListener('click', () => { khachMo = ''; tabHoSo = 'hanh-trinh'; ve(); });

  document.querySelectorAll('[data-tabhs]').forEach((b) => {
    b.addEventListener('click', () => { tabHoSo = b.dataset.tabhs; ve(); });
  });

  g('dpLuu')?.addEventListener('click', () => {
    lamRoiVe(() => doiDieuPhoi(khachMo, {
      bac_si: g('dpBacSi').value,
      telesale: g('dpTelesale').value,
      cham_soc: g('dpChamSoc').value,
      nhom: g('dpNhom').value,
    }), 'Đã lưu điều phối. Các buổi chưa diễn ra đã chuyển theo bác sĩ mới.');
  });

  document.querySelectorAll('[data-chuyen-bs]').forEach((b) => {
    b.addEventListener('click', async () => {
      const ma = await requestInput(
        'Nhập mã bác sĩ tiếp nhận buổi này. Các buổi khác của khách giữ nguyên.',
        { title: 'Chuyển bác sĩ cho một buổi',
          label: BAC_SI.map((x) => `${x.ma} = ${x.ten}`).join(' · '),
          placeholder: 'BS02', confirmText: 'Chuyển' });
      if (!ma) return;
      lamRoiVe(() => doiBacSiLich(b.dataset.chuyenBs, ma.trim().toUpperCase()),
        'Đã chuyển buổi hẹn sang bác sĩ khác.');
    });
  });
  goTimHt('hTim', (v) => { hTim = v; });
  g('hChiNhanh')?.addEventListener('change', (e) => { hChiNhanh = e.target.value; ve(); });
  g('hNguon')?.addEventListener('change', (e) => { hNguon = e.target.value; ve(); });

  /* Báo cáo */
  g('bcKy')?.addEventListener('change', (e) => { kyBaoCao = e.target.value; ve(); });
  g('bcChiNhanh')?.addEventListener('change', (e) => { bcChiNhanh = e.target.value; ve(); });
  g('bcXuat')?.addEventListener('click', () => {
    if (!baoCao) return;
    downloadText(`bao-cao-le-tan-${baoCao.ky}.csv`,
      '﻿' + xuatCsvBaoCao(baoCao), 'text/csv');
    showToast(`Đã xuất báo cáo tháng ${baoCao.ky}.`);
  });

  document.querySelectorAll('[data-pt]').forEach((b) => {
    b.addEventListener('click', () => {
      const [, so] = b.dataset.pt.split(':');
      trang = Number(so); ve();
    });
  });

  g('ltMoForm')?.addEventListener('click', () => { hienForm = true; ve(); });
  g('ltDongForm')?.addEventListener('click', () => { hienForm = false; ve(); });

  g('ltXuat')?.addEventListener('click', () => {
    if (!dsLichHen.length) { showToast('Không có dòng nào để xuất.', true); return; }
    downloadText(`lich-hen-${todayISO()}.csv`,
      '﻿' + xuatCsvLichHen(dsLichHen), 'text/csv');
    showToast(`Đã xuất ${dsLichHen.length} lịch hẹn.`);
  });

  g('ltLuu')?.addEventListener('click', async () => {
    const v = (id) => (g(id)?.value || '').trim();
    await lamRoiVe(async () => {
      await datLich({
        ten: v('fTen'), dien_thoai: v('fDienThoai'),
        ngay_sinh: v('fNgaySinh'), gioi: v('fGioi'),
        ngay: v('fNgay'), gio: v('fGio'), phut: Number(v('fPhut')),
        loai: v('fLoai'), chi_nhanh: v('fChiNhanh'), bac_si: v('fBacSi'),
        phong: v('fPhong'), nguon: v('fNguon'),
        noi_dung: v('fNoiDung'), ghi_chu: v('fGhiChu'),
      });
      hienForm = false;
    }, 'Đã đặt lịch hẹn.');
  });

  /* Chăm sóc */
  document.querySelectorAll('[data-queue]').forEach((b) => {
    b.addEventListener('click', () => { hangDoiMo = b.dataset.queue; ve(); });
  });

  document.querySelectorAll('[data-xong]').forEach((b) => {
    b.addEventListener('click', async () => {
      const ok = await confirmAction('Đánh dấu phản hồi này đã được xử lý xong?', {
        title: 'Đã xử lý', confirmText: 'Xác nhận',
      });
      if (!ok) return;
      await lamRoiVe(() => xuLyPhanHoi(b.dataset.xong, 'xong'), 'Đã ghi nhận xử lý.');
    });
  });
}
