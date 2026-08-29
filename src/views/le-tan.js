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

/* ── Tab: Hôm nay ────────────────────────────────────────────────────── */

function veHomNay() {
  const d = dsHomNay;
  const dem = (tt) => d.filter((x) => x.trang_thai === tt).length;
  const chuaDen = d.filter((x) => x.trang_thai === 'cho_den');
  const keTiep = chuaDen[0];

  const dong = d.map((x) => {
    const daDen = !!x.den_luc;
    const xong = ['hoan_tat', 'huy', 'khong_den'].includes(x.trang_thai);
    return `<article class="lt-dong${daDen ? ' da-den' : ''}${xong ? ' xong' : ''}"
       data-id="${escapeHTML(x.id)}">
      <div class="lt-gio">
        <b>${escapeHTML(x.gio)}</b>
        <small>${x.phut}′</small>
      </div>
      <div class="lt-noi">
        ${oKhach(x)}
        <p class="lt-viec">${escapeHTML(x.noi_dung || LOAI_LICH[x.loai] || '')}</p>
        <p class="lt-meta">
          <span>${escapeHTML(tenBacSi(x.bac_si))}</span>
          <span>${escapeHTML(x.phong)}</span>
          <span>${escapeHTML(tenChiNhanh(x.chi_nhanh))}</span>
          ${x.den_luc ? `<span class="lt-den">Đến lúc ${escapeHTML(gioHien(x.den_luc))}</span>` : ''}
        </p>
        ${x.ghi_chu ? `<p class="lt-ghi">${escapeHTML(x.ghi_chu)}</p>` : ''}
      </div>
      <div class="lt-thao-tac">
        ${pill(x.trang_thai)}
        <div class="lt-nut">
          ${x.trang_thai === 'cho_den'
            ? `<button type="button" class="primary-button lt-nho" data-td="${escapeHTML(x.id)}">
                 <i class="ri-user-follow-line"></i> Tiếp đón</button>`
            : ''}
          ${x.trang_thai === 'da_den'
            ? `<button type="button" class="ghost-button lt-nho" data-tt="dang_kham" data-id2="${escapeHTML(x.id)}">Vào khám</button>`
            : ''}
          ${x.trang_thai === 'dang_kham'
            ? `<button type="button" class="ghost-button lt-nho" data-tt="hoan_tat" data-id2="${escapeHTML(x.id)}">Hoàn tất</button>`
            : ''}
          ${['cho_den', 'da_den'].includes(x.trang_thai)
            ? `<button type="button" class="ghost-button lt-nho lt-huy" data-huy="${escapeHTML(x.id)}">Hủy</button>`
            : ''}
        </div>
      </div>
    </article>`;
  }).join('');

  return `
    <section class="grid cols-4">
      ${the('Lịch hôm nay', d.length, `${dem('cho_den')} khách chưa tới`)}
      ${the('Đã tiếp đón', dem('da_den') + dem('dang_kham') + dem('hoan_tat'),
        `${dem('dang_kham')} đang khám`)}
      ${the('Hoàn tất', dem('hoan_tat'), 'Đã xong trong ngày')}
      ${the('Không đến', dem('khong_den'), `${dem('huy')} lịch đã hủy`)}
    </section>

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

    <section class="panel">
      <header class="section-title lt-header">
        <h3>Lịch hẹn hôm nay</h3>
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
  const dong = kq.ds.map((x) => `<tr data-id="${escapeHTML(x.id)}">
    <td data-label="Mã">${escapeHTML(x.ma)}</td>
    <td data-label="Thời gian"><b>${escapeHTML(x.gio)}</b><small>${ngayHien(x.ngay)}</small></td>
    <td data-label="Khách hàng">${oKhach(x)}</td>
    <td data-label="Nội dung">${escapeHTML(x.noi_dung || '—')}</td>
    <td data-label="Bác sĩ">${escapeHTML(tenBacSi(x.bac_si))}<small>${escapeHTML(x.phong)}</small></td>
    <td data-label="Chi nhánh">${escapeHTML(tenChiNhanh(x.chi_nhanh))}</td>
    <td data-label="Loại">${escapeHTML(LOAI_LICH[x.loai] || x.loai)}</td>
    <td data-label="Nguồn">${escapeHTML(NGUON[x.nguon] || x.nguon)}</td>
    <td data-label="Trạng thái">${pill(x.trang_thai)}</td>
    <td data-label="" class="lt-cot-nut">
      ${x.trang_thai === 'cho_den'
        ? `<button type="button" class="ghost-button lt-nho" data-td="${escapeHTML(x.id)}">Tiếp đón</button>`
        : ''}
      <button type="button" class="ghost-button lt-nho" data-doi="${escapeHTML(x.id)}">Đổi lịch</button>
    </td>
  </tr>`).join('');

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

      <div class="lt-loc">
        <label><span>Từ ngày</span><input type="date" id="lTu" value="${escapeHTML(fTu)}"></label>
        <label><span>Đến ngày</span><input type="date" id="lDen" value="${escapeHTML(fDen)}"></label>
        <label><span>Chi nhánh</span><select id="lChiNhanh">
          ${opt('', 'Tất cả', fChiNhanh)}
          ${CHI_NHANH.map((c) => opt(c.ma, c.ten, fChiNhanh)).join('')}
        </select></label>
        <label><span>Bác sĩ</span><select id="lBacSi">
          ${opt('', 'Tất cả', fBacSi)}
          ${BAC_SI.map((b) => opt(b.ma, b.ten, fBacSi)).join('')}
        </select></label>
        <label><span>Trạng thái</span><select id="lTrangThai">
          ${opt('', 'Tất cả', fTrangThai)}
          ${Object.entries(TRANG_THAI).map(([v, n]) => opt(v, n.ten, fTrangThai)).join('')}
        </select></label>
        <label><span>Loại lịch</span><select id="lLoai">
          ${opt('', 'Tất cả', fLoai)}
          ${Object.entries(LOAI_LICH).map(([v, t]) => opt(v, t, fLoai)).join('')}
        </select></label>
        <label class="lt-tim"><span>Tìm</span>
          <input type="search" id="lTim" value="${escapeHTML(fTim)}"
                 placeholder="Tên, số điện thoại hoặc mã lịch"></label>
        <button type="button" class="ghost-button" id="ltXoaLoc">
          <i class="ri-filter-off-line"></i> Bỏ lọc
        </button>
      </div>

      <div class="hh-bang-wrap lt-bang">
        <table class="hh-bang">
          <thead><tr>
            <th>Mã</th><th>Thời gian</th><th>Khách hàng</th><th>Nội dung</th>
            <th>Bác sĩ</th><th>Chi nhánh</th><th>Loại</th><th>Nguồn</th>
            <th>Trạng thái</th><th></th>
          </tr></thead>
          <tbody>${dong || '<tr><td colspan="10" class="empty-state">Không có lịch hẹn nào khớp bộ lọc.</td></tr>'}</tbody>
        </table>
      </div>
      ${thanhPhanTrang(kq, 'ltTrang', 'lịch hẹn')}
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
  } else {
    [demQueue, dsHangDoi] = await Promise.all([demHangDoi(), layHangDoi(hangDoiMo)]);
  }

  return `<div class="view-stack lt-view">
    <header class="view-header">
      <div>
        <h1>Lễ tân</h1>
        <p>Tiếp đón, lịch hẹn và chăm sóc khách hàng tại quầy</p>
      </div>
    </header>

    <nav class="lt-tabs" role="tablist">
      ${TABS.map((t) => `<button type="button" role="tab" class="lt-tab${tab === t.ma ? ' is-active' : ''}"
         aria-selected="${tab === t.ma}" data-tab="${t.ma}">
         <i class="${t.icon}"></i><span>${escapeHTML(t.ten)}</span>
       </button>`).join('')}
    </nav>
    ${tab === 'hom-nay' ? veHomNay() : ''}
    ${tab === 'lich-hen' ? veLichHen() : ''}
    ${tab === 'cham-soc' ? veHangDoi() : ''}
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
  g('ltHnChiNhanh')?.addEventListener('change', (e) => {
    hnChiNhanh = e.target.value; ve();
  });

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
  doiLoc('lTu', (v) => { fTu = v; });
  doiLoc('lDen', (v) => { fDen = v; });
  doiLoc('lChiNhanh', (v) => { fChiNhanh = v; });
  doiLoc('lBacSi', (v) => { fBacSi = v; });
  doiLoc('lTrangThai', (v) => { fTrangThai = v; });
  doiLoc('lLoai', (v) => { fLoai = v; });

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
    fTu = todayISO(); fDen = ''; fChiNhanh = ''; fBacSi = '';
    fTrangThai = ''; fLoai = ''; fTim = ''; trang = 1; ve();
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
