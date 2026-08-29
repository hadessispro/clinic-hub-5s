/* Sổ bệnh án điện tử · màn của bác sĩ.
 *
 * Hai lớp: danh sách hồ sơ có bộ lọc, và sổ chi tiết của một bệnh nhân.
 *
 * SƠ ĐỒ RĂNG là phần lõi. Tình trạng ghi theo TỪNG MẶT của TỪNG RĂNG, không
 * phải một đoạn văn mô tả — ghi "răng 26 sâu" thì buổi sau bác sĩ khác không
 * biết sâu mặt nào và phải khám lại từ đầu.
 *
 * Hai chi tiết giải phẫu mà sơ đồ phải làm đúng, nếu không bác sĩ đọc ngược:
 *
 *   Gần và xa tính theo ĐƯỜNG GIỮA hàm. Răng bên phải (phần hàm 1 và 4) có
 *   mặt gần nằm bên phải trên sơ đồ; răng bên trái thì ngược lại. Nên ô mặt
 *   răng phải lật theo phần hàm.
 *
 *   Ngoài và trong tính theo MÁ và LƯỠI. Nhìn từ mặt nhai xuống, hàm trên có
 *   mặt ngoài ở phía trên sơ đồ, hàm dưới có mặt ngoài ở phía dưới.
 *
 * Cảnh 3D cho bệnh nhân xem sẽ đọc từ đúng dữ liệu này, không giữ bản sao.
 */

import {
  CHI_NHANH, LOAI_ANH, MAT_RANG, MUC_CANH_BAO, SO_DO_HAM, TEN_LOAI,
  TRANG_THAI_RANG, coMatNhai, datTrangThaiRang, ghiLuotKham, kyLuotKham,
  layDanhSachHoSo, loaiCuaRang, locLuotKham, moHoSo, phanHamCuaRang,
  tomTatSoDo, xuatCsvLuotKham,
  CHI_SO_NHA_CHU, GIAI_DOAN, LOAI_THU_THUAT, SINH_HIEU, TRANG_THAI_KE_HOACH,
} from '../services/so-benh-an.js';
import { BAC_SI, tenBacSi, tenChiNhanh } from '../services/le-tan.js';
import { escapeHTML, downloadText, phanTrang, thanhPhanTrang, todayISO } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { navigateTo } from '../router.js';
import { store } from '../store.js';

/* ── Trạng thái màn ───────────────────────────────────────────────────── */

let hoSoMo = '';
let duLieu = null;
let dsHoSo = [];

let fTim = ''; let fChiNhanh = ''; let fBacSi = '';
let fCanhBao = false; let fRangSau = false; let trang = 1;

let kTu = ''; let kDen = ''; let kBacSi = ''; let kRang = '';
let kChuaKy = false; let kTim = '';
// Chip chọn nhanh: ô ngày gốc hiện theo ngôn ngữ TRÌNH DUYỆT nên máy đặt
// tiếng Anh thấy mm/dd/yyyy. Chip phủ gần hết nhu cầu thật; ô ngày chỉ
// hiện khi chọn Tự chọn.
let khoangKham = 'tat-ca';

let rangChon = '';
let hienFormKham = false;

/* ── Mảnh dùng lại ────────────────────────────────────────────────────── */

const opt = (v, t, chon) => `<option value="${escapeHTML(v)}"${chon === v ? ' selected' : ''}>${escapeHTML(t)}</option>`;
const ngayHien = (d) => (d ? d.split('-').reverse().join('/') : '—');
const tuoi = (sinh) => {
  if (!sinh) return '—';
  const d = new Date(sinh); const n = new Date();
  let t = n.getFullYear() - d.getFullYear();
  if (n.getMonth() < d.getMonth()
    || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) t -= 1;
  return `${t} tuổi`;
};
const chuDau = (ten) => {
  const p = String(ten || '?').trim().split(/\s+/);
  return (p[p.length - 1][0] || '?').toUpperCase();
};

/* ── Sơ đồ răng ───────────────────────────────────────────────────────── */

/* Bốn vùng quanh ô giữa. Toạ độ cố định; ý nghĩa của từng vùng mới là thứ
 * thay đổi theo phần hàm và theo hàm trên hay hàm dưới. */
const VUNG = {
  tren:  'M0 0 L36 0 L25 11 L11 11 Z',
  duoi:  'M0 36 L36 36 L25 25 L11 25 Z',
  trai:  'M0 0 L0 36 L11 25 L11 11 Z',
  phai:  'M36 0 L36 36 L25 25 L25 11 Z',
};

/** Vùng nào trên sơ đồ ứng với mặt răng nào. Đây là chỗ dễ vẽ ngược nhất. */
function banDoMat(maRang) {
  const phan = phanHamCuaRang(maRang);
  const hamTren = phan === 1 || phan === 2;
  const benPhai = phan === 1 || phan === 4;
  return {
    tren: hamTren ? 'ngoai' : 'trong',
    duoi: hamTren ? 'trong' : 'ngoai',
    // Mặt gần hướng về đường giữa. Trên sơ đồ, đường giữa nằm ở giữa cung hàm.
    phai: benPhai ? 'gan' : 'xa',
    trai: benPhai ? 'xa' : 'gan',
  };
}

function veRang(r, dangChon) {
  const ma = r.ma;
  const tt = TRANG_THAI_RANG[r.trang_thai] || TRANG_THAI_RANG.binh_thuong;
  const ban = banDoMat(ma);
  const vang = ['mat', 'chua_moc'].includes(r.trang_thai);

  const vungSvg = Object.entries(VUNG).map(([vi, d]) => {
    const mat = ban[vi];
    const tThai = r.mat?.[mat];
    const lop = tThai ? `mat-${TRANG_THAI_RANG[tThai]?.mau || 'lanh'}` : '';
    return `<path d="${d}" class="sdr-mat ${lop}" data-mat="${mat}"><title>${
      escapeHTML(MAT_RANG[mat].ten)}</title></path>`;
  }).join('');

  const giua = coMatNhai(ma)
    ? `<rect x="11" y="11" width="14" height="14" class="sdr-mat ${
        r.mat?.nhai ? `mat-${TRANG_THAI_RANG[r.mat.nhai]?.mau || 'lanh'}` : ''
      }" data-mat="nhai"><title>Mặt nhai</title></rect>`
    : `<rect x="11" y="11" width="14" height="14" class="sdr-mat sdr-khong-nhai" data-mat="nhai"><title>Rìa cắn</title></rect>`;

  const dauMat = vang
    ? `<path d="M7 7 L29 29 M29 7 L7 29" class="sdr-vang"/>`
    : '';

  return `<button type="button" class="sdr-rang sdr-${tt.mau}${dangChon ? ' is-chon' : ''}"
      data-rang="${escapeHTML(ma)}"
      title="Răng ${escapeHTML(ma)} · ${escapeHTML(TEN_LOAI[loaiCuaRang(ma)])} · ${escapeHTML(tt.ten)}">
    <svg viewBox="0 0 36 36" aria-hidden="true">${vungSvg}${giua}${dauMat}</svg>
    <span class="sdr-so">${escapeHTML(ma)}</span>
  </button>`;
}

function veSoDo(soDo) {
  const day = (ds) => {
    const nua1 = ds.slice(0, 8); const nua2 = ds.slice(8);
    const cum = (x) => `<div class="sdr-cum">${x.map((ma) =>
      veRang(soDo[ma] || { ma, trang_thai: 'binh_thuong', mat: {} }, rangChon === ma)).join('')}</div>`;
    return `<div class="sdr-day">${cum(nua1)}${cum(nua2)}</div>`;
  };

  const dem = tomTatSoDo(soDo);
  const chuThich = Object.entries(TRANG_THAI_RANG)
    .filter(([ma]) => dem[ma])
    .map(([ma, t]) => `<span class="sdr-ct"><i class="sdr-o sdr-${t.mau}"></i>${
      escapeHTML(t.ten)} · ${dem[ma]}</span>`).join('');

  return `<div class="sdr">
    <div class="sdr-ham">
      <span class="sdr-nhan">Hàm trên</span>
      ${day(SO_DO_HAM.tren)}
    </div>
    <div class="sdr-giua"><span>Đường giữa</span></div>
    <div class="sdr-ham">
      ${day(SO_DO_HAM.duoi)}
      <span class="sdr-nhan">Hàm dưới</span>
    </div>
    <div class="sdr-chu-thich">${chuThich}</div>
  </div>`;
}

function veChiTietRang(soDo) {
  if (!rangChon) {
    return `<p class="sdr-goi-y">Bấm vào một răng để xem và ghi tình trạng từng mặt.</p>`;
  }
  const r = soDo[rangChon] || { ma: rangChon, trang_thai: 'binh_thuong', mat: {} };
  const ban = banDoMat(rangChon);
  const matCo = coMatNhai(rangChon)
    ? ['gan', 'xa', 'ngoai', 'trong', 'nhai']
    : ['gan', 'xa', 'ngoai', 'trong'];

  return `<div class="sdr-ct-rang">
    <header>
      <div>
        <b>Răng ${escapeHTML(rangChon)}</b>
        <span>${escapeHTML(TEN_LOAI[loaiCuaRang(rangChon)])} · ${
          escapeHTML(['tren', 'duoi'].includes(ban.tren) ? '' : '')}${
          escapeHTML(phanHamCuaRang(rangChon) <= 2 ? 'hàm trên' : 'hàm dưới')} ${
          escapeHTML([1, 4].includes(phanHamCuaRang(rangChon)) ? 'bên phải' : 'bên trái')}</span>
      </div>
      <button type="button" class="ghost-button sbn-nho" id="sbnBoChon">
        <i class="ri-close-line"></i> Bỏ chọn
      </button>
    </header>

    <label class="sbn-o"><span>Tình trạng chung của răng</span>
      <select id="sbnTrangThai">
        ${Object.entries(TRANG_THAI_RANG).map(([v, t]) => opt(v, t.ten, r.trang_thai)).join('')}
      </select></label>

    <div class="sbn-mat-luoi">
      ${matCo.map((m) => `<label class="sbn-o"><span>Mặt ${escapeHTML(MAT_RANG[m].ten.toLowerCase())}</span>
        <select data-mat-rang="${m}">
          ${opt('', 'Không ghi nhận', r.mat?.[m] || '')}
          ${Object.entries(TRANG_THAI_RANG).filter(([, t]) => t.to)
            .map(([v, t]) => opt(v, t.ten, r.mat?.[m] || '')).join('')}
        </select></label>`).join('')}
    </div>

    <label class="sbn-o"><span>Ghi chú lâm sàng</span>
      <input type="text" id="sbnGhiChuRang" value="${escapeHTML(r.ghi_chu || '')}"
             placeholder="Sâu ngà sâu, sát tuỷ…"></label>

    <div class="sbn-nut-hang">
      <button type="button" class="primary-button" id="sbnLuuRang">
        <i class="ri-save-3-line"></i> Lưu tình trạng răng ${escapeHTML(rangChon)}
      </button>
    </div>
  </div>`;
}

/* ── Danh sách hồ sơ ──────────────────────────────────────────────────── */

function veDanhSach() {
  const kq = phanTrang(dsHoSo, trang, 20);
  const dong = kq.ds.map((h) => `<tr>
    <td data-label="Mã hồ sơ">${escapeHTML(h.ma)}</td>
    <td data-label="Bệnh nhân">
      <div class="sbn-nguoi">
        <span class="sbn-avatar">${escapeHTML(chuDau(h.ten))}</span>
        <span>
          <b>${escapeHTML(h.ten)}</b>
          <small>${escapeHTML(h.dien_thoai)} · ${escapeHTML(tuoi(h.ngay_sinh))} · ${
            h.gioi === 'nam' ? 'Nam' : 'Nữ'}</small>
        </span>
      </div>
    </td>
    <td data-label="Cảnh báo">${h.canh_bao.length
      ? h.canh_bao.map((c) => `<span class="status-pill ${
          MUC_CANH_BAO[c.loai]?.muc === 'cao' ? 'bad' : 'warn'}">${
          escapeHTML(MUC_CANH_BAO[c.loai]?.ten || c.loai)}</span>`).join(' ')
      : '<span class="sbn-mo">Không</span>'}</td>
    <td data-label="Lần khám" class="sbn-so">${h.so_lan_kham}</td>
    <td data-label="Khám gần nhất">${ngayHien(h.lan_kham_gan_nhat)}</td>
    <td data-label="Răng cần xử lý">${h.so_rang_can_xu_ly
      ? `<span class="status-pill bad">${h.so_rang_can_xu_ly} răng</span>
         <small class="sbn-mo">${escapeHTML(h.rang_can_xu_ly.join(', '))}</small>`
      : '<span class="status-pill good">Không</span>'}</td>
    <td data-label="Chi nhánh">${escapeHTML(tenChiNhanh(h.chi_nhanh))}</td>
    <td data-label="Bác sĩ">${escapeHTML(tenBacSi(h.bac_si_chinh))}</td>
    <td data-label="" class="sbn-cot-nut">
      <button type="button" class="primary-button sbn-nho" data-mo="${escapeHTML(h.id)}">
        <i class="ri-folder-open-line"></i> Mở sổ
      </button>
    </td>
  </tr>`).join('');

  return `<section class="panel">
    <header class="section-title sbn-header">
      <h3>Hồ sơ bệnh nhân</h3>
      <span class="pill">${dsHoSo.length} hồ sơ khớp bộ lọc</span>
    </header>

    <div class="lt-tim-lon">
      <i class="ri-search-line"></i>
      <input type="search" id="sTim" value="${escapeHTML(fTim)}"
             placeholder="Tìm theo tên bệnh nhân, số điện thoại hoặc mã hồ sơ">
      ${[fChiNhanh, fBacSi, fCanhBao, fRangSau].filter(Boolean).length
        ? `<button type="button" class="ghost-button sbn-nho" id="sXoaLoc">
             <i class="ri-filter-off-line"></i> Bỏ lọc</button>` : ''}
    </div>
    <div class="sbn-loc">
      <label><span>Chi nhánh</span><select id="sChiNhanh">
        ${opt('', 'Tất cả chi nhánh', fChiNhanh)}
        ${CHI_NHANH.map((c) => opt(c.ma, c.ten, fChiNhanh)).join('')}
      </select></label>
      <label><span>Bác sĩ phụ trách</span><select id="sBacSi">
        ${opt('', 'Tất cả bác sĩ', fBacSi)}
        ${BAC_SI.map((b) => opt(b.ma, b.ten, fBacSi)).join('')}
      </select></label>
      <label class="sbn-tick"><input type="checkbox" id="sCanhBao"${fCanhBao ? ' checked' : ''}>
        <span>Chỉ hồ sơ có cảnh báo</span></label>
      <label class="sbn-tick"><input type="checkbox" id="sRangSau"${fRangSau ? ' checked' : ''}>
        <span>Còn răng cần xử lý</span></label>
    </div>

    <div class="hh-bang-wrap sbn-bang">
      <table class="hh-bang">
        <thead><tr>
          <th>Mã hồ sơ</th><th>Bệnh nhân</th><th>Cảnh báo</th><th>Lần khám</th>
          <th>Khám gần nhất</th><th>Răng cần xử lý</th><th>Chi nhánh</th><th>Bác sĩ</th><th></th>
        </tr></thead>
        <tbody>${dong || '<tr><td colspan="9" class="empty-state">Không có hồ sơ nào khớp bộ lọc.</td></tr>'}</tbody>
      </table>
    </div>
    ${thanhPhanTrang(kq, 'sbnTrang', 'hồ sơ')}
  </section>`;
}

/* ── Sổ chi tiết ──────────────────────────────────────────────────────── */

function veFormKham() {
  if (!hienFormKham) return '';
  return `<section class="panel sbn-form">
    <header class="section-title sbn-header">
      <h3>Ghi lượt khám mới</h3>
      <span class="pill">Bản ghi mới, không sửa đè bản cũ</span>
      <button type="button" class="ghost-button" id="sbnDongForm">
        <i class="ri-close-line"></i> Đóng
      </button>
    </header>
    <div class="sbn-form-luoi">
      <label class="sbn-o sbn-rong"><span>Lý do tới khám *</span>
        <input type="text" id="kLyDo" placeholder="Đau âm ỉ răng hàm trên trái khi ăn ngọt"></label>
      <label class="sbn-o sbn-rong"><span>Khám *</span>
        <textarea id="kKham" rows="3"
          placeholder="Mô tả tổn thương, thăm dò, gõ, tình trạng nướu…"></textarea></label>
      <label class="sbn-o"><span>Chẩn đoán *</span>
        <input type="text" id="kChanDoan" placeholder="Sâu ngà sâu răng 26"></label>
      <label class="sbn-o"><span>Mã bệnh</span>
        <input type="text" id="kMaBenh" placeholder="K02.1"></label>
      <label class="sbn-o"><span>Răng liên quan</span>
        <input type="text" id="kRangLQ" placeholder="26 11 — cách nhau bằng dấu cách"></label>
      <label class="sbn-o"><span>Phòng</span>
        <input type="text" id="kPhong" placeholder="Phòng 1"></label>
      <label class="sbn-o sbn-rong"><span>Xử trí và hẹn tiếp</span>
        <textarea id="kXuTri" rows="2"
          placeholder="Trám composite răng 11. Răng 26 hẹn tuần sau lấy tuỷ."></textarea></label>
    </div>
    <div class="sbn-nut-hang sbn-cuoi">
      <button type="button" class="primary-button" id="kLuu">
        <i class="ri-add-circle-line"></i> Ghi lượt khám
      </button>
    </div>
  </section>`;
}

/* Một lượt khám hiện đủ những phần mà buổi sau bác sĩ khác cần đọc để tiếp
 * tục được. Bốn dòng Khám / Chẩn đoán / Xử trí / Răng là chưa đủ: thiếu sinh
 * hiệu thì không biết có gây tê được không, thiếu chỉ số nha chu thì không
 * biết có làm phục hình được không, thiếu thuốc tê đã dùng thì buổi sau không
 * biết ngưỡng của khách. */
function veMuc(nhan, noi, lop = '') {
  if (!noi) return '';
  return `<div class="sbn-muc-o ${lop}">
    <dt>${escapeHTML(nhan)}</dt><dd>${noi}</dd></div>`;
}

function veNhaChu(nc) {
  if (!nc) return '';
  const o = Object.entries(CHI_SO_NHA_CHU).map(([ma, c]) => {
    const v = nc[ma];
    if (v === undefined || v === null || v === '') return '';
    const xau = Number(v) > c.tot;
    return `<span class="sbn-chi-so ${xau ? 'canh' : 'on'}">
      <small>${escapeHTML(c.ten)}</small>
      <b>${escapeHTML(String(v))}<i>${escapeHTML(c.don_vi)}</i></b>
    </span>`;
  }).join('');
  return o ? `<div class="sbn-chi-so-hang">${o}</div>` : '';
}

function veSinhHieu(sh) {
  if (!sh) return '';
  const o = Object.entries(SINH_HIEU).map(([ma, c]) => {
    if (!sh[ma]) return '';
    return `<span class="sbn-chi-so on">
      <small>${escapeHTML(c.ten)}</small>
      <b>${escapeHTML(sh[ma])}<i>${escapeHTML(c.don_vi)}</i></b></span>`;
  }).join('');
  return o ? `<div class="sbn-chi-so-hang">${o}</div>` : '';
}

function veLuotKham(ds) {
  if (!ds.length) {
    return '<p class="empty-state">Không có lượt khám nào khớp bộ lọc.</p>';
  }
  return ds.map((l) => {
    const rang = (l.rang_lien_quan || []).map((r) =>
      `<button type="button" class="sbn-rang-tag" data-rang="${escapeHTML(r)}">${
        escapeHTML(r)}</button>`).join('');

    const thuThuat = (l.thu_thuat || []).map((t) => `<li>
      <b>${escapeHTML(t.ten)}</b>
      <span class="lt-the-nho">${escapeHTML(LOAI_THU_THUAT[t.loai] || t.loai)}</span>
      ${t.rang ? `<em>răng ${escapeHTML(t.rang)}${
        t.mat ? ` · mặt ${escapeHTML(t.mat)}` : ''}</em>` : ''}
    </li>`).join('');

    const clsang = (l.can_lam_sang || []).map((c) => `<li>
      <b>${escapeHTML(LOAI_ANH[c.loai] || c.loai)}</b>
      <span>${escapeHTML(c.ket_qua)}</span></li>`).join('');

    const thuoc = (l.don_thuoc || []).map((t) => `<li>
      <b>${escapeHTML(t.ten)} ${escapeHTML(t.ham_luong || '')}</b>
      <span>${escapeHTML(t.lieu)}${t.so_ngay ? ` · ${t.so_ngay} ngày` : ''}</span></li>`).join('');

    const vatTu = (l.vat_tu || []).map((v) =>
      `<span class="lt-the-nho">${escapeHTML(v.ten)} · ${escapeHTML(v.so_luong)}</span>`).join('');

    return `<article class="sbn-luot${l.da_ky ? ' da-ky' : ''}">
      <header class="sbn-luot-dau">
        <div class="sbn-luot-moc">
          <b>${escapeHTML(ngayHien(l.ngay))}</b>
          <small>${escapeHTML(l.gio)}</small>
          ${l.da_ky ? '<span class="status-pill good">Đã ký</span>'
                    : '<span class="status-pill warn">Chưa ký</span>'}
        </div>
        <p class="sbn-ly-do">${escapeHTML(l.ly_do)}</p>
        <div class="sbn-luot-nut">
          ${!l.da_ky
            ? `<button type="button" class="secondary-button sbn-nho" data-ky="${escapeHTML(l.id)}">
                 <i class="ri-quill-pen-line"></i> Ký lượt khám</button>`
            : `<button type="button" class="ghost-button sbn-nho" data-dinh-chinh="${escapeHTML(l.id)}">
                 <i class="ri-edit-2-line"></i> Đính chính</button>`}
        </div>
      </header>

      ${veSinhHieu(l.sinh_hieu)}

      <dl class="sbn-muc">
        ${veMuc('Khám ngoài mặt', escapeHTML(l.kham_ngoai_mat || ''))}
        ${veMuc('Khám trong miệng', escapeHTML(l.kham_trong_mieng || l.kham || ''))}
      </dl>

      ${l.nha_chu ? `<div class="sbn-khoi">
        <h4>Chỉ số nha chu</h4>${veNhaChu(l.nha_chu)}</div>` : ''}

      ${clsang ? `<div class="sbn-khoi">
        <h4>Cận lâm sàng</h4><ul class="sbn-ds">${clsang}</ul></div>` : ''}

      <div class="sbn-khoi sbn-chan-doan">
        <h4>Chẩn đoán</h4>
        <p class="sbn-cd-chinh">${escapeHTML(l.chan_doan)}
          ${l.ma_benh ? `<code>${escapeHTML(l.ma_benh)}</code>` : ''}</p>
        ${l.chan_doan_them ? `<p class="sbn-cd-them">${escapeHTML(l.chan_doan_them)}</p>` : ''}
        ${rang ? `<p class="sbn-cd-rang"><span>Răng liên quan</span>${rang}</p>` : ''}
      </div>

      ${thuThuat ? `<div class="sbn-khoi">
        <h4>Thủ thuật đã thực hiện</h4><ul class="sbn-ds sbn-tt">${thuThuat}</ul>
        ${l.thuoc_te ? `<p class="sbn-te"><i class="ri-syringe-line"></i>
          <b>Gây tê:</b> ${escapeHTML(l.thuoc_te.ten)} · ${l.thuoc_te.so_ong} ống</p>` : ''}
        ${vatTu ? `<p class="sbn-vat-tu"><span>Vật tư</span>${vatTu}</p>` : ''}
      </div>` : ''}

      <dl class="sbn-muc">
        ${veMuc('Diễn biến', escapeHTML(l.dien_bien || ''))}
        ${veMuc('Xử trí và hướng tiếp', escapeHTML(l.xu_tri || ''))}
      </dl>

      ${thuoc ? `<div class="sbn-khoi">
        <h4>Đơn thuốc</h4><ul class="sbn-ds">${thuoc}</ul></div>` : ''}

      ${l.dan_do ? `<p class="sbn-dan-do"><i class="ri-chat-quote-line"></i>
        <b>Dặn dò:</b> ${escapeHTML(l.dan_do)}</p>` : ''}

      ${l.anh && l.anh.length ? `<div class="sbn-anh">
        ${l.anh.map((a) => `<figure class="sbn-anh-o">
          <div class="sbn-anh-hinh"><i class="${
            ['quanh_chop', 'toan_canh', 'ct'].includes(a.loai) ? 'ri-scan-line' : 'ri-camera-lens-line'
          }"></i></div>
          <figcaption><b>${escapeHTML(LOAI_ANH[a.loai] || a.loai)}</b>
            <small>${escapeHTML(a.ghi_chu || '')}${
              a.rang ? ` · răng ${escapeHTML(a.rang)}` : ''}</small></figcaption>
        </figure>`).join('')}
      </div>` : ''}

      <footer class="sbn-chan-luot">
        ${escapeHTML(tenBacSi(l.bac_si))}
        ${l.phu_ta ? ` · phụ tá ${escapeHTML(l.phu_ta)}` : ''}
        ${l.phong ? ` · ${escapeHTML(l.phong)}` : ''}
        · ${escapeHTML(tenChiNhanh(l.chi_nhanh))}
        ${l.hen_tai_kham ? ` · hẹn lại ${escapeHTML(ngayHien(l.hen_tai_kham))}` : ''}
        ${l.sua_cho ? ` · <em>đính chính cho ${escapeHTML(l.sua_cho)}</em>` : ''}
      </footer>
    </article>`;
  }).join('');
}

/* Kế hoạch điều trị gắn với HỒ SƠ chứ không với một lượt khám: một kế hoạch
 * chạy qua nhiều buổi, và đó chính là thứ cho biết khách đang ở đâu trong lộ
 * trình. */
function veKeHoach(ds, tongChiPhi) {
  if (!ds || !ds.length) {
    return `<section class="panel">
      <header class="section-title sbn-header"><h3>Kế hoạch điều trị</h3></header>
      <p class="empty-state">Chưa lập kế hoạch điều trị cho bệnh nhân này.</p>
    </section>`;
  }
  const theoGd = {};
  ds.forEach((k) => { (theoGd[k.giai_doan] ||= []).push(k); });

  const khoi = Object.entries(GIAI_DOAN)
    .filter(([g]) => theoGd[g])
    .map(([g, ten]) => `<div class="sbn-gd">
      <h4>${escapeHTML(ten)}</h4>
      ${theoGd[g].map((k) => {
        const tt = TRANG_THAI_KE_HOACH[k.trang_thai] || { ten: k.trang_thai, lop: 'neutral' };
        const pt = k.so_buoi ? Math.min(100, Math.round((k.da_lam / k.so_buoi) * 100)) : 0;
        return `<article class="sbn-kh">
          <div class="sbn-kh-tren">
            <b>${escapeHTML(k.noi_dung)}</b>
            <span class="status-pill ${tt.lop}">${escapeHTML(tt.ten)}</span>
          </div>
          <p class="sbn-kh-meta">
            <span>Răng ${escapeHTML((k.rang || []).join(', ') || '—')}</span>
            <span>${k.da_lam}/${k.so_buoi} buổi</span>
            <span class="sbn-tien">${(k.chi_phi || 0).toLocaleString('vi-VN')}đ</span>
          </p>
          <div class="sbn-tien-do"><i style="width:${pt}%"></i></div>
          ${k.ghi_chu ? `<p class="sbn-kh-ghi">${escapeHTML(k.ghi_chu)}</p>` : ''}
        </article>`;
      }).join('')}
    </div>`).join('');

  return `<section class="panel">
    <header class="section-title sbn-header">
      <h3>Kế hoạch điều trị</h3>
      <span class="pill">${ds.length} hạng mục · tổng ${
        (tongChiPhi || 0).toLocaleString('vi-VN')}đ</span>
    </header>
    <div class="sbn-gd-luoi">${khoi}</div>
  </section>`;
}

function veSoChiTiet() {
  const h = duLieu.ho_so;
  const luot = locLuotKham(duLieu.luot_kham, {
    tu: kTu || undefined, den: kDen || undefined, bacSi: kBacSi || undefined,
    rang: kRang || undefined, chuaKy: kChuaKy || undefined, tim: kTim || undefined,
  });

  const canhBao = h.canh_bao.length ? `<div class="sbn-canh-bao">
    <i class="ri-alert-line"></i>
    <div>${h.canh_bao.map((c) => `<p><b>${escapeHTML(MUC_CANH_BAO[c.loai]?.ten || c.loai)}:</b>
      ${escapeHTML(c.noi_dung)}</p>`).join('')}</div>
  </div>` : '';

  return `
    <button type="button" class="ghost-button sbn-quay-lai" id="sbnDong">
      <i class="ri-arrow-left-line"></i> Danh sách hồ sơ
    </button>

    <section class="panel sbn-dau-ho-so">
      <div class="sbn-nguoi lon">
        <span class="sbn-avatar lon">${escapeHTML(chuDau(h.ten))}</span>
        <div>
          <h2>${escapeHTML(h.ten)}</h2>
          <p>${escapeHTML(h.ma)} · ${escapeHTML(tuoi(h.ngay_sinh))} · ${
            h.gioi === 'nam' ? 'Nam' : 'Nữ'} · ${escapeHTML(h.dien_thoai)}</p>
          <p class="sbn-mo">${escapeHTML(h.dia_chi)}</p>
        </div>
      </div>
      <div class="sbn-so-lieu">
        <div><b>${duLieu.so_lan_kham}</b><span>lần khám</span></div>
        <div><b>${duLieu.luot_kham.reduce((s, l) => s + l.anh.length, 0)}</b><span>ảnh và phim</span></div>
        <div><b>${duLieu.luot_kham.filter((l) => !l.da_ky).length}</b><span>chưa ký</span></div>
        <div><b>${escapeHTML(tenBacSi(h.bac_si_chinh))}</b><span>bác sĩ phụ trách</span></div>
      </div>
      ${canhBao}
      ${h.tien_su ? `<p class="sbn-tien-su"><b>Tiền sử:</b> ${escapeHTML(h.tien_su)}</p>` : ''}
    </section>

    <section class="panel">
      <header class="section-title sbn-header">
        <h3>Sơ đồ răng</h3>
        <span class="pill">Ghi theo từng mặt của từng răng</span>
      </header>
      <div class="sbn-so-do-khung">
        ${veSoDo(h.so_do_rang)}
        <aside class="sbn-ben">${veChiTietRang(h.so_do_rang)}</aside>
      </div>
    </section>

    ${veKeHoach(duLieu.ke_hoach, duLieu.tong_chi_phi)}

    ${veFormKham()}

    <section class="panel">
      <header class="section-title sbn-header">
        <h3>Lượt khám</h3>
        <span class="pill">${luot.length} trên ${duLieu.luot_kham.length} lượt</span>
        <div class="sbn-header-nut">
          <button type="button" class="ghost-button" id="sbnXuat">
            <i class="ri-download-2-line"></i> Xuất CSV
          </button>
          <button type="button" class="primary-button" id="sbnMoForm">
            <i class="ri-add-line"></i> Ghi lượt khám
          </button>
        </div>
      </header>

      <div class="lt-tim-lon">
        <i class="ri-search-line"></i>
        <input type="search" id="kfTim" value="${escapeHTML(kTim)}"
               placeholder="Tìm trong chẩn đoán, xử trí, mã bệnh…">
        ${[kTu, kDen, kBacSi, kRang, kChuaKy].filter(Boolean).length
          ? `<button type="button" class="ghost-button sbn-nho" id="kfXoa">
               <i class="ri-filter-off-line"></i> Bỏ lọc</button>` : ''}
      </div>

      <div class="lt-nhanh">
        <span class="lt-nhanh-nhan">Khoảng ngày</span>
        ${[['tat-ca', 'Tất cả'], ['3-thang', '3 tháng gần đây'],
           ['1-nam', 'Trong 1 năm'], ['tu-chon', 'Tự chọn']]
          .map(([ma, ten]) => `<button type="button" class="lt-chip${
            khoangKham === ma ? ' is-chon' : ''}" data-khoangk="${ma}">${ten}</button>`).join('')}
        ${khoangKham === 'tu-chon' ? `<span class="lt-nhanh-ngay">
          <input type="date" id="kfTu" value="${escapeHTML(kTu)}" aria-label="Từ ngày">
          <i class="ri-arrow-right-line"></i>
          <input type="date" id="kfDen" value="${escapeHTML(kDen)}" aria-label="Đến ngày">
        </span>` : ''}
      </div>

      <div class="sbn-loc">
        <label><span>Bác sĩ</span><select id="kfBacSi">
          ${opt('', 'Tất cả bác sĩ', kBacSi)}
          ${BAC_SI.map((b) => opt(b.ma, b.ten, kBacSi)).join('')}
        </select></label>
        <label><span>Lọc theo răng</span>
          <input type="text" id="kfRang" value="${escapeHTML(kRang)}"
                 placeholder="Nhập mã răng, ví dụ 26"></label>
        <label class="sbn-tick"><input type="checkbox" id="kfChuaKy"${kChuaKy ? ' checked' : ''}>
          <span>Chỉ lượt chưa ký</span></label>
      </div>

      <div class="sbn-luot-ds">${veLuotKham(luot)}</div>
    </section>

    <section class="panel">
      <header class="section-title sbn-header">
        <h3>Nhật ký mở hồ sơ</h3>
        <span class="pill">Với dữ liệu sức khoẻ, mở xem cũng là việc phải lưu vết</span>
      </header>
      <div class="sbn-nhat-ky">
        ${duLieu.nhat_ky_doc.slice(0, 8).map((n) => `<p>
          <code>${escapeHTML(n.luc.slice(0, 16).replace('T', ' '))}</code>
          ${escapeHTML(n.boi)} · ${escapeHTML(n.vai_tro)} đã mở hồ sơ
        </p>`).join('') || '<p class="sbn-mo">Chưa có lượt mở nào được ghi.</p>'}
      </div>
    </section>`;
}

/* ── Khung ────────────────────────────────────────────────────────────── */

export async function renderView() {
  const toi = store.state?.profile || {};
  if (hoSoMo) {
    duLieu = await moHoSo(hoSoMo, { ma: toi.employee_code || '?', vai_tro: toi.role || '?' })
      .catch(() => null);
    if (!duLieu) { hoSoMo = ''; }
  }
  if (!hoSoMo) {
    dsHoSo = await layDanhSachHoSo({
      tim: fTim || undefined, chiNhanh: fChiNhanh || undefined,
      bacSi: fBacSi || undefined, coCanhBao: fCanhBao, coRangSau: fRangSau,
    });
  }

  // Thanh trên cùng đã hiện viewTitles['so-benh-an']. Thêm một h1 nữa là
  // tiêu đề hiện hai lần, cách nhau vài chục pixel.
  return `<div class="view-stack sbn-view">
    <div class="lt-canh-bao" role="status">
      <i class="ri-flask-line"></i>
      <div>
        <b>Dữ liệu mẫu — màn hình đang ở giai đoạn dựng giao diện</b>
        <span>Bệnh nhân, sơ đồ răng và lượt khám trên màn này là dữ liệu dựng sẵn.
        Chưa nối cơ sở dữ liệu; mọi thay đổi mất khi tải lại trang.</span>
      </div>
    </div>

    ${hoSoMo && duLieu ? veSoChiTiet() : veDanhSach()}
  </div>`;
}

/* ── Sự kiện ──────────────────────────────────────────────────────────── */

const ve = () => navigateTo('so-benh-an');

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
  const maToi = toi.employee_code || 'BS01';

  /* Danh sách */
  document.querySelectorAll('[data-mo]').forEach((b) => {
    b.addEventListener('click', () => { hoSoMo = b.dataset.mo; rangChon = ''; ve(); });
  });
  g('sbnDong')?.addEventListener('click', () => {
    hoSoMo = ''; rangChon = ''; hienFormKham = false; ve();
  });

  const loc = (id, gan) => g(id)?.addEventListener('change', (e) => {
    gan(e.target.type === 'checkbox' ? e.target.checked : e.target.value);
    trang = 1; ve();
  });
  loc('sChiNhanh', (v) => { fChiNhanh = v; });
  loc('sBacSi', (v) => { fBacSi = v; });
  loc('sCanhBao', (v) => { fCanhBao = v; });
  loc('sRangSau', (v) => { fRangSau = v; });

  const goTim = (id, gan) => {
    const o = g(id);
    if (!o) return;
    let hen;
    o.addEventListener('input', (e) => {
      clearTimeout(hen);
      const v = e.target.value;
      hen = setTimeout(() => { gan(v); trang = 1; ve(); }, 300);
    });
  };
  goTim('sTim', (v) => { fTim = v; });
  goTim('kfTim', (v) => { kTim = v; });

  g('sXoaLoc')?.addEventListener('click', () => {
    fTim = ''; fChiNhanh = ''; fBacSi = ''; fCanhBao = false; fRangSau = false;
    trang = 1; ve();
  });

  document.querySelectorAll('[data-pt]').forEach((b) => {
    b.addEventListener('click', () => { [, trang] = b.dataset.pt.split(':').map(Number); ve(); });
  });

  /* Sơ đồ răng */
  document.querySelectorAll('[data-rang]').forEach((b) => {
    b.addEventListener('click', () => {
      rangChon = rangChon === b.dataset.rang ? '' : b.dataset.rang;
      ve();
    });
  });
  g('sbnBoChon')?.addEventListener('click', () => { rangChon = ''; ve(); });

  g('sbnLuuRang')?.addEventListener('click', () => {
    const mat = {};
    document.querySelectorAll('[data-mat-rang]').forEach((s) => {
      if (s.value) mat[s.dataset.matRang] = s.value;
    });
    chay(() => datTrangThaiRang(hoSoMo, rangChon, g('sbnTrangThai').value,
      mat, g('sbnGhiChuRang').value, maToi), `Đã lưu tình trạng răng ${rangChon}.`);
  });

  /* Lượt khám */
  const locK = (id, gan) => g(id)?.addEventListener('change', (e) => {
    gan(e.target.type === 'checkbox' ? e.target.checked : e.target.value); ve();
  });
  locK('kfTu', (v) => { kTu = v; khoangKham = 'tu-chon'; });
  locK('kfDen', (v) => { kDen = v; khoangKham = 'tu-chon'; });
  locK('kfBacSi', (v) => { kBacSi = v; });
  locK('kfRang', (v) => { kRang = v; });
  locK('kfChuaKy', (v) => { kChuaKy = v; });
  g('kfXoa')?.addEventListener('click', () => {
    kTu = ''; kDen = ''; kBacSi = ''; kRang = ''; kChuaKy = false; kTim = '';
    khoangKham = 'tat-ca'; ve();
  });

  document.querySelectorAll('[data-khoangk]').forEach((b) => {
    b.addEventListener('click', () => {
      khoangKham = b.dataset.khoangk;
      const lui = (n) => {
        const d = new Date(); d.setMonth(d.getMonth() - n);
        return d.toISOString().slice(0, 10);
      };
      if (khoangKham === 'tat-ca') { kTu = ''; kDen = ''; }
      else if (khoangKham === '3-thang') { kTu = lui(3); kDen = ''; }
      else if (khoangKham === '1-nam') { kTu = lui(12); kDen = ''; }
      ve();
    });
  });

  document.querySelectorAll('.sbn-rang-tag').forEach((b) => {
    b.addEventListener('click', () => { rangChon = b.dataset.rang; ve(); });
  });

  g('sbnMoForm')?.addEventListener('click', () => { hienFormKham = true; ve(); });
  g('sbnDongForm')?.addEventListener('click', () => { hienFormKham = false; ve(); });

  g('kLuu')?.addEventListener('click', () => {
    const v = (id) => (g(id)?.value || '').trim();
    chay(async () => {
      await ghiLuotKham(hoSoMo, {
        ly_do: v('kLyDo'), kham: v('kKham'), chan_doan: v('kChanDoan'),
        ma_benh: v('kMaBenh'), xu_tri: v('kXuTri'), phong: v('kPhong'),
        rang_lien_quan: v('kRangLQ').split(/\s+/).filter(Boolean),
      }, maToi);
      hienFormKham = false;
    }, 'Đã ghi lượt khám.');
  });

  document.querySelectorAll('[data-ky]').forEach((b) => {
    b.addEventListener('click', async () => {
      const ok = await confirmAction(
        'Ký rồi thì nội dung khoá lại. Muốn sửa về sau phải ghi một bản đính chính mới, '
        + 'bản này vẫn được giữ nguyên.',
        { title: 'Ký lượt khám', confirmText: 'Ký' });
      if (!ok) return;
      chay(() => kyLuotKham(b.dataset.ky, maToi), 'Đã ký lượt khám.');
    });
  });

  document.querySelectorAll('[data-dinh-chinh]').forEach((b) => {
    b.addEventListener('click', async () => {
      const lyDo = await requestInput(
        'Bản đã ký không bị sửa. Hệ thống tạo một bản mới trỏ về nó.',
        { title: 'Đính chính', label: 'Lý do đính chính', confirmText: 'Tạo bản đính chính' });
      if (!lyDo) return;
      showToast('Chức năng đính chính cần màn nhập đầy đủ, sẽ làm ở bước nối API.', true);
    });
  });

  g('sbnXuat')?.addEventListener('click', () => {
    const luot = locLuotKham(duLieu.luot_kham, {
      tu: kTu || undefined, den: kDen || undefined, bacSi: kBacSi || undefined,
      rang: kRang || undefined, chuaKy: kChuaKy || undefined, tim: kTim || undefined,
    });
    if (!luot.length) { showToast('Không có lượt khám nào để xuất.', true); return; }
    downloadText(`benh-an-${duLieu.ho_so.ma}-${todayISO()}.csv`,
      '﻿' + xuatCsvLuotKham(duLieu.ho_so, luot), 'text/csv');
    showToast(`Đã xuất ${luot.length} lượt khám.`);
  });
}
