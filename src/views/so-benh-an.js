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
  MUC_LUU_Y, TRUONG_DANH_DAU, boDanhDau, themAnh, themDanhDau,
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
let anhLoc = '';
// Cảnh 3D bật/tắt và giữ tay cầm để huỷ khi rời màn. Không giữ thì mỗi lần
// vẽ lại màn lại tạo thêm một vòng lặp render chạy ngầm.
let hien3D = false;
let canh3D = null;
let goc3D = 'truoc';
let banQuet = null;
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

/* Nén ảnh sang WebP ngay trên máy trạm, TRƯỚC khi gửi lên.
 *
 * Không cần thêm thư viện: trình duyệt đã mã hoá WebP sẵn qua canvas.toBlob.
 * Thêm một thư viện nén chỉ để làm việc trình duyệt làm được là tăng dung
 * lượng tải cho mọi người dùng, kể cả người không bao giờ tải ảnh lên.
 *
 * Nén ở máy trạm chứ không ở máy chủ vì ảnh nha khoa từ máy chụp thường 3–8 MB
 * mỗi tấm. Gửi nguyên bản qua mạng 4G ở quầy là chờ rất lâu, và đó là lúc
 * người ta bỏ không tải ảnh nữa.
 *
 * Cạnh dài giới hạn 2000px: đủ để phóng to xem chi tiết mà không giữ những
 * pixel không ai nhìn tới.
 */
const CANH_TOI_DA = 2000;
const CHAT_LUONG = 0.82;

/* Mã băm sha256 của nội dung ảnh, tính ngay trên máy trạm.
 *
 * crypto.subtle chỉ có trong ngữ cảnh an toàn — https hoặc localhost. Production
 * chạy https nên vẫn có; nếu ai đó mở qua http thuần thì báo rõ thay vì lặng lẽ
 * lưu ảnh không có mã băm. */
async function bamNoiDung(buf) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Trình duyệt không cho tính mã băm ở kết nối này. Hãy mở bằng HTTPS.');
  }
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function doKb(n) {
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(n / 1024)} KB`;
}

function nenWebp(tep) {
  return new Promise((xong, hong) => {
    const doc = new FileReader();
    doc.onerror = () => hong(new Error(`Không đọc được tệp ${tep.name}.`));
    doc.onload = () => {
      const anh = new Image();
      anh.onerror = () => hong(new Error(`${tep.name} không phải ảnh đọc được.`));
      anh.onload = () => {
        let { width: w, height: h } = anh;
        if (Math.max(w, h) > CANH_TOI_DA) {
          const ty = CANH_TOI_DA / Math.max(w, h);
          w = Math.round(w * ty); h = Math.round(h * ty);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(anh, 0, 0, w, h);
        c.toBlob(async (b) => {
          if (!b) { hong(new Error('Trình duyệt này không mã hoá được WebP.')); return; }
          // Băm nội dung ĐÃ NÉN, không băm tệp gốc: hai người xuất cùng một
          // tấm phim từ hai máy khác nhau sẽ ra hai tệp gốc khác nhau nhưng
          // cùng một ảnh sau khi nén, và đó mới là thứ đáng gộp.
          const bam = await bamNoiDung(await b.arrayBuffer());
          const d = new FileReader();
          d.onload = () => xong({
            tep: d.result, ten_goc: tep.name, ma_bam: bam, byte: b.size,
            kb: `${doKb(tep.size)} → ${doKb(b.size)}`,
            giam: Math.round((1 - b.size / tep.size) * 100),
          });
          d.readAsDataURL(b);
        }, 'image/webp', CHAT_LUONG);
      };
      anh.src = doc.result;
    };
    doc.readAsDataURL(tep);
  });
}

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

/* Cảnh 3D cho bệnh nhân xem.
 *
 * Mặc định TẮT. Nó tải thêm một thư viện và dựng 32 khối, mà bác sĩ ghi bệnh
 * án thì không cần tới nó — chỉ khi quay màn hình cho bệnh nhân xem mới bật.
 * Bật sẵn cho mọi lần mở hồ sơ là bắt mọi người trả giá cho một việc thỉnh
 * thoảng mới làm.
 */
function ve3D() {
  const GOC = {
    truoc: 'Nhìn trước', tren: 'Hàm trên', duoi: 'Hàm dưới',
    trai: 'Bên trái', phai: 'Bên phải',
  };
  if (!hien3D) {
    return `<div class="sbn-3d-moi">
      <button type="button" class="secondary-button" id="sbnMo3D">
        <i class="ri-box-3-line"></i> Xem cung hàm 3D cho bệnh nhân
      </button>
      <small>Xoay được, bấm vào răng để chỉ cho khách. Chỉ tải khi bật.</small>
    </div>`;
  }
  return `<div class="sbn-3d">
    <div class="sbn-3d-thanh">
      <span class="lt-nhanh-nhan">Góc nhìn</span>
      ${Object.entries(GOC).map(([m, t]) => `<button type="button"
        class="lt-chip${goc3D === m ? ' is-chon' : ''}" data-goc3d="${m}">${t}</button>`).join('')}
      <label class="ghost-button sbn-nho sbn-nhap-quet">
        <input type="file" accept=".stl,.ply" id="sbnQuet" hidden>
        <i class="ri-upload-cloud-2-line"></i> Nạp bản quét
      </label>
      <button type="button" class="ghost-button sbn-nho" id="sbnDong3D">
        <i class="ri-close-line"></i> Đóng
      </button>
    </div>
    <div class="sbn-3d-khung" id="sbn3DKhung"></div>
    <p class="sbn-3d-ghi">
      <i class="ri-information-line"></i>
      Hình răng dựng theo công thức: đúng loại răng, số múi và vị trí trên cung hàm.
      Không phải bản quét thật của bệnh nhân, nên dùng để chỉ chỗ và giải thích,
      không dùng để đo đạc.
    </p>
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
/* Một cột nhãn duy nhất cho MỌI mục trong lượt khám.
 *
 * Bản trước để sinh hiệu một hàng riêng, rồi tới cột nhãn, rồi nha chu lại
 * một hàng riêng — mắt phải nhảy qua ba kiểu bố cục trong cùng một bản ghi,
 * nên nó trông rời rạc dù nội dung đã đủ. Nay mọi thứ nằm trên cùng một trục:
 * nhãn bên trái, nội dung bên phải, từ trên xuống.
 */
function veHang(nhan, noi, lop = '') {
  if (!noi) return '';
  return `<div class="sbn-hang ${lop}">
    <dt>${escapeHTML(nhan)}</dt><dd>${noi}</dd></div>`;
}

/* Bôi sáng những đoạn bác sĩ đã đánh dấu.
 *
 * Tách theo ĐOẠN VĂN chứ không theo vị trí ký tự: vị trí hỏng ngay khi bản ghi
 * được đính chính và nội dung dịch đi một chữ. Đoạn không tìm thấy thì lặng lẽ
 * bỏ qua, chứ không sáng nhầm chỗ khác.
 */
function boiSang(chu, dsDanhDau) {
  const goc = String(chu || '');
  if (!dsDanhDau || !dsDanhDau.length) return escapeHTML(goc);

  // Đoạn dài trước, để đoạn ngắn nằm trong nó không cắt nó làm đôi.
  const dd = dsDanhDau.slice().sort((a, b) => b.doan.length - a.doan.length);
  const moc = [];
  dd.forEach((d) => {
    let tu = goc.indexOf(d.doan);
    while (tu >= 0) {
      const den = tu + d.doan.length;
      if (!moc.some((m) => tu < m.den && den > m.tu)) moc.push({ tu, den, d });
      tu = goc.indexOf(d.doan, tu + 1);
    }
  });
  if (!moc.length) return escapeHTML(goc);
  moc.sort((a, b) => a.tu - b.tu);

  let ra = ''; let i = 0;
  moc.forEach((m) => {
    ra += escapeHTML(goc.slice(i, m.tu));
    const mk = MUC_LUU_Y[m.d.muc] || { ten: m.d.muc, lop: 'neutral' };
    ra += `<mark class="sbn-hl hl-${escapeHTML(m.d.muc)}"
      data-danh-dau="${escapeHTML(m.d.id)}"
      title="${escapeHTML(`${mk.ten}${m.d.ghi_chu ? ` · ${m.d.ghi_chu}` : ''} — ${m.d.boi}`)}"
      >${escapeHTML(goc.slice(m.tu, m.den))}</mark>`;
    i = m.den;
  });
  return ra + escapeHTML(goc.slice(i));
}

function veNhaChu(nc) {
  if (!nc) return '';
  const o = Object.entries(CHI_SO_NHA_CHU).map(([ma, c]) => {
    const v = nc[ma];
    if (v === undefined || v === null || v === '') return '';
    const xau = Number(v) > c.tot;
    return `<span class="sbn-chi-so ${xau ? 'canh' : 'on'}">
      <small>${escapeHTML(c.ten)}</small>
      <b>${escapeHTML(String(v))}<i>${escapeHTML(c.don_vi)}</i></b></span>`;
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
  const banDo = duLieu?.danh_dau || {};

  return ds.map((l) => {
    const dd = banDo[l.id] || {};
    const chu = (truong) => boiSang(l[truong], dd[truong]);
    const boi = (truong) => `data-truong="${truong}" data-luot="${escapeHTML(l.id)}"`;

    const rang = (l.rang_lien_quan || []).map((r) =>
      `<button type="button" class="sbn-rang-tag" data-rang="${escapeHTML(r)}">${
        escapeHTML(r)}</button>`).join('');

    const thuThuat = (l.thu_thuat || []).map((t) => `<li>
      <b>${escapeHTML(t.ten)}</b>
      <span class="lt-the-nho">${escapeHTML(LOAI_THU_THUAT[t.loai] || t.loai)}</span>
      ${t.rang ? `<em>răng ${escapeHTML(t.rang)}${
        t.mat ? ` · mặt ${escapeHTML(t.mat)}` : ''}</em>` : ''}</li>`).join('');

    const clsang = (l.can_lam_sang || []).map((c) => `<li>
      <b>${escapeHTML(LOAI_ANH[c.loai] || c.loai)}</b>
      <span>${escapeHTML(c.ket_qua)}</span></li>`).join('');

    const thuoc = (l.don_thuoc || []).map((t) => `<li>
      <b>${escapeHTML(t.ten)} ${escapeHTML(t.ham_luong || '')}</b>
      <span>${escapeHTML(t.lieu)}${t.so_ngay ? ` · ${t.so_ngay} ngày` : ''}</span></li>`).join('');

    const vatTu = (l.vat_tu || []).map((v) =>
      `<span class="lt-the-nho">${escapeHTML(v.ten)} · ${escapeHTML(v.so_luong)}</span>`).join('');

    const soDanhDau = Object.values(dd).flat().length;

    return `<article class="sbn-luot${l.da_ky ? ' da-ky' : ''}">
      <header class="sbn-luot-dau">
        <div class="sbn-luot-moc">
          <b>${escapeHTML(ngayHien(l.ngay))}</b>
          <small>${escapeHTML(l.gio)}</small>
          ${l.da_ky ? '<span class="status-pill good">Đã ký</span>'
                    : '<span class="status-pill warn">Chưa ký</span>'}
          ${soDanhDau ? `<span class="sbn-dem-hl" title="Số đoạn đã đánh dấu lưu ý">
            <i class="ri-mark-pen-line"></i>${soDanhDau}</span>` : ''}
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

      <dl class="sbn-hang-ds">
        ${veHang('Sinh hiệu', veSinhHieu(l.sinh_hieu))}
        ${veHang('Khám ngoài mặt',
          l.kham_ngoai_mat ? `<span class="sbn-boi" ${boi('kham_ngoai_mat')}>${chu('kham_ngoai_mat')}</span>` : '')}
        ${veHang('Khám trong miệng',
          l.kham_trong_mieng ? `<span class="sbn-boi" ${boi('kham_trong_mieng')}>${chu('kham_trong_mieng')}</span>` : '')}
        ${veHang('Chỉ số nha chu', veNhaChu(l.nha_chu))}
        ${veHang('Cận lâm sàng', clsang ? `<ul class="sbn-ds">${clsang}</ul>` : '')}
        ${veHang('Chẩn đoán', `<div class="sbn-chan-doan">
          <p class="sbn-cd-chinh"><span class="sbn-boi" ${boi('chan_doan')}>${chu('chan_doan')}</span>
            ${l.ma_benh ? `<code>${escapeHTML(l.ma_benh)}</code>` : ''}</p>
          ${l.chan_doan_them ? `<p class="sbn-cd-them">${escapeHTML(l.chan_doan_them)}</p>` : ''}
          ${rang ? `<p class="sbn-cd-rang"><span>Răng liên quan</span>${rang}</p>` : ''}
        </div>`, 'noi-bat')}
        ${veHang('Thủ thuật', thuThuat ? `<ul class="sbn-ds sbn-tt">${thuThuat}</ul>
          ${l.thuoc_te ? `<p class="sbn-te"><i class="ri-syringe-line"></i>
            <b>Gây tê:</b> ${escapeHTML(l.thuoc_te.ten)} · ${l.thuoc_te.so_ong} ống</p>` : ''}
          ${vatTu ? `<p class="sbn-vat-tu"><span>Vật tư</span>${vatTu}</p>` : ''}` : '')}
        ${veHang('Diễn biến',
          l.dien_bien ? `<span class="sbn-boi" ${boi('dien_bien')}>${chu('dien_bien')}</span>` : '')}
        ${veHang('Xử trí',
          l.xu_tri ? `<span class="sbn-boi" ${boi('xu_tri')}>${chu('xu_tri')}</span>` : '')}
        ${veHang('Đơn thuốc', thuoc ? `<ul class="sbn-ds">${thuoc}</ul>` : '')}
        ${veHang('Dặn dò',
          l.dan_do ? `<span class="sbn-boi" ${boi('dan_do')}>${chu('dan_do')}</span>` : '')}
        ${veHang(`Ảnh và phim${(l.anh || []).length ? ` · ${l.anh.length}` : ''}`,
          veAnhCuaLuot(l))}
      </dl>

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

/* Bảng lưu ý của bác sĩ.
 *
 * Đây là chỗ bác sĩ và quầy nối vào nhau: bác sĩ biết điều cần dặn, lễ tân là
 * người ngồi trước mặt khách. Cảnh báo lên đầu, và ghi rõ mục nào lễ tân đọc
 * được — không phải ghi chú chuyên môn nào cũng nên đọc cho khách nghe.
 */
function veLuuY(ds) {
  if (!ds || !ds.length) return '';
  return `<section class="panel sbn-luu-y">
    <header class="section-title sbn-header">
      <h3>Lưu ý từ bác sĩ</h3>
      <span class="pill">${ds.length} đoạn đã đánh dấu · mục "Dặn quầy" và "Cảnh báo" thì lễ tân đọc được</span>
    </header>
    <ul class="sbn-ly-ds">
      ${ds.map((x) => {
        const m = MUC_LUU_Y[x.muc] || { ten: x.muc, lop: 'neutral', icon: 'ri-bookmark-line' };
        return `<li class="sbn-ly ly-${escapeHTML(x.muc)}">
          <span class="sbn-ly-icon"><i class="${escapeHTML(m.icon)}"></i></span>
          <div>
            <p class="sbn-ly-dau">
              <span class="status-pill ${m.lop}">${escapeHTML(m.ten)}</span>
              <em>${escapeHTML(TRUONG_DANH_DAU[x.truong] || x.truong)}</em>
              <time>${escapeHTML(x.luc.slice(0, 10).split('-').reverse().join('/'))}</time>
            </p>
            <p class="sbn-ly-doan">“${escapeHTML(x.doan)}”</p>
            ${x.ghi_chu ? `<p class="sbn-ly-ghi">${escapeHTML(x.ghi_chu)}</p>` : ''}
            <p class="sbn-ly-boi">${escapeHTML(x.boi)}</p>
          </div>
          <button type="button" class="ghost-button sbn-nho" data-bo-dd="${escapeHTML(x.id)}"
            title="Gỡ đánh dấu"><i class="ri-delete-bin-line"></i></button>
        </li>`;
      }).join('')}
    </ul>
  </section>`;
}

/* Thuốc đã dùng.
 *
 * Gom qua MỌI lượt khám, gồm cả thuốc kê đơn lẫn thuốc tê đã tiêm. Bác sĩ cần
 * một chỗ để trả lời hai câu trước khi kê: khách đã dùng kháng sinh gì rồi, và
 * lần trước tê mấy ống thì đủ.
 *
 * Thuốc trùng với dị ứng ghi trong hồ sơ thì nổi lên đỏ ngay, không chờ ai
 * nhớ ra. Đây là chỗ một dòng chữ cứu được một ca sốc phản vệ.
 */
function veThuoc(ds) {
  // Không dựng khối khi chưa có gì. Một hộp cao 150px chỉ để nói "chưa có" thì
  // nó chiếm chỗ đúng bằng phần có dữ liệu thật, và người đọc phải cuộn qua nó.
  if (!ds || !ds.length) return '';
  const canh = ds.filter((t) => t.canh_bao_di_ung).length;
  return `<section class="panel${canh ? ' sbn-co-canh' : ''}">
    <header class="section-title sbn-header">
      <h3>Thuốc đã dùng</h3>
      <span class="pill">${ds.length} lần kê hoặc tiêm${
        canh ? ` · ${canh} lần trùng dị ứng đã ghi` : ''}</span>
    </header>
    ${canh ? `<p class="sbn-canh-bao" style="margin-top:12px">
      <i class="ri-alert-line"></i>
      <span>Có thuốc trùng với dị ứng ghi trong hồ sơ. Kiểm tra lại trước khi kê tiếp.</span>
    </p>` : ''}
    <div class="hh-bang-wrap sbn-bang">
      <table class="hh-bang">
        <thead><tr>
          <th>Ngày</th><th>Thuốc</th><th>Loại</th><th>Liều dùng</th><th>Bác sĩ</th>
        </tr></thead>
        <tbody>${ds.map((t) => `<tr${t.canh_bao_di_ung ? ' class="sbn-dong-canh"' : ''}>
          <td data-label="Ngày">${ngayHien(t.ngay)}</td>
          <td data-label="Thuốc">
            <b>${escapeHTML(t.ten)}${t.ham_luong ? ` ${escapeHTML(t.ham_luong)}` : ''}</b>
            ${t.canh_bao_di_ung
              ? '<small class="sbn-canh-chu"><i class="ri-alert-line"></i>Trùng dị ứng đã ghi</small>'
              : ''}</td>
          <td data-label="Loại"><span class="lt-the-nho">${
            t.loai === 'gay_te' ? 'Gây tê' : 'Kê đơn'}</span></td>
          <td data-label="Liều dùng">${escapeHTML(t.lieu)}${
            t.so_ngay ? ` · ${t.so_ngay} ngày` : ''}</td>
          <td data-label="Bác sĩ">${escapeHTML(tenBacSi(t.bac_si))}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
  </section>`;
}

/* Ô ảnh vẽ theo ĐÚNG loại phim, không dùng một biểu tượng chung: nhìn lướt là
 * phân biệt được phim toàn cảnh với phim quanh chóp. Khi nối API thật thì chỗ
 * này thay bằng ảnh thật, phần còn lại giữ nguyên.
 */
function veKhungPhim(a) {
  if (a.tep) {
    return `<img src="${escapeHTML(a.tep)}" alt="${escapeHTML(a.ghi_chu || '')}" loading="lazy">`;
  }
  if (a.loai === 'toan_canh') {
    return `<svg viewBox="0 0 120 64" class="sbn-phim pano" aria-hidden="true">
      <rect width="120" height="64" rx="4" class="nen"/>
      <path d="M8 30 Q60 6 112 30" class="cung"/>
      <path d="M8 36 Q60 60 112 36" class="cung"/>
      ${Array.from({ length: 14 }, (_, i2) => {
        const x = 12 + i2 * 7.2;
        const yt = 30 - Math.sin((i2 / 13) * Math.PI) * 15;
        const yd = 36 + Math.sin((i2 / 13) * Math.PI) * 15;
        return `<rect x="${x - 2.4}" y="${yt}" width="4.8" height="9" rx="1.4" class="rang"/>
                <rect x="${x - 2.4}" y="${yd - 9}" width="4.8" height="9" rx="1.4" class="rang"/>`;
      }).join('')}
    </svg>`;
  }
  if (a.loai === 'quanh_chop' || a.loai === 'ct') {
    return `<svg viewBox="0 0 120 64" class="sbn-phim quanh" aria-hidden="true">
      <rect width="120" height="64" rx="4" class="nen"/>
      <line x1="10" y1="26" x2="110" y2="26" class="xuong"/>
      ${[34, 60, 86].map((x) => `
        <rect x="${x - 11}" y="8" width="22" height="18" rx="3" class="rang"/>
        <path d="M${x - 7} 26 L${x - 4} 50 M${x + 7} 26 L${x + 4} 50" class="chan"/>`).join('')}
    </svg>`;
  }
  return `<svg viewBox="0 0 120 64" class="sbn-phim chup" aria-hidden="true">
    <rect width="120" height="64" rx="4" class="nen"/>
    <ellipse cx="60" cy="32" rx="34" ry="17" class="moi"/>
    <path d="M30 32 Q60 20 90 32 Q60 44 30 32" class="rang-vung"/>
    <line x1="60" y1="22" x2="60" y2="42" class="giua"/>
  </svg>`;
}

/* Ảnh nằm trong ĐÚNG lượt khám đã chụp nó, không gom thành một kho rời.
 *
 * Gom một chỗ thì nhìn được nhiều ảnh cùng lúc, nhưng mất mất thứ quan trọng
 * hơn: tấm phim này chụp trong buổi nào, để làm gì, bác sĩ kết luận ra sao.
 * Một tấm phim tách khỏi lượt khám của nó chỉ còn là một tấm ảnh.
 */
function veAnhCuaLuot(l) {
  const ds = l.anh || [];
  return `<div class="sbn-anh-hang">
    ${ds.map((a) => `<figure class="sbn-anh-o" data-xem-anh="${escapeHTML(a.id)}"
        data-luot="${escapeHTML(l.id)}" tabindex="0" role="button"
        title="${escapeHTML(a.ghi_chu || LOAI_ANH[a.loai] || '')}">
      <div class="sbn-anh-hinh">${veKhungPhim(a)}</div>
      <figcaption>
        <b>${escapeHTML(LOAI_ANH[a.loai] || a.loai)}</b>
        <small>${a.rang ? `Răng ${escapeHTML(a.rang)}` : escapeHTML(a.ghi_chu || '')}</small>
        ${a.kb ? `<small class="sbn-anh-kb">${escapeHTML(a.kb)}</small>` : ''}
        ${a.dung_lai ? '<small class="sbn-anh-lai"><i class="ri-links-line"></i>Dùng lại, không tốn thêm chỗ</small>' : ''}
      </figcaption>
    </figure>`).join('')}
    ${l.da_ky ? '' : `<label class="sbn-them-anh">
      <input type="file" accept="image/*" multiple data-tai-anh="${escapeHTML(l.id)}" hidden>
      <i class="ri-image-add-line"></i>
      <span>Thêm ảnh</span>
      <small>Tự nén WebP</small>
    </label>`}
  </div>`;
}

/* Kế hoạch điều trị gắn với HỒ SƠ/* Kế hoạch điều trị gắn với HỒ SƠ chứ không với một lượt khám: một kế hoạch
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
        <div>
          ${veSoDo(h.so_do_rang)}
          ${ve3D()}
        </div>
        <aside class="sbn-ben">${veChiTietRang(h.so_do_rang)}</aside>
      </div>
    </section>

    ${veLuuY(duLieu.luu_y)}

    ${veThuoc(duLieu.thuoc)}
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

      <div class="lt-nhanh sbn-loc-hang">
        <span class="lt-nhanh-nhan">Bác sĩ</span>
        <select id="kfBacSi" class="sbn-chon-gon">
          ${opt('', 'Tất cả', kBacSi)}
          ${BAC_SI.map((b) => opt(b.ma, b.ten.replace(/^BS\.\s*/, ''), kBacSi)).join('')}
        </select>
        <span class="lt-nhanh-nhan">Răng</span>
        <input type="text" id="kfRang" class="sbn-o-gon" value="${escapeHTML(kRang)}"
               placeholder="26" inputmode="numeric" maxlength="2">
        <button type="button" class="lt-chip${kChuaKy ? ' is-chon' : ''}" id="kfChuaKy">
          <i class="ri-quill-pen-line"></i> Chỉ lượt chưa ký
        </button>
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
  let henRang;

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

  /* Cảnh 3D. Huỷ cảnh cũ trước khi dựng cảnh mới: mỗi cảnh giữ một vòng lặp
   * render riêng, không huỷ thì sau vài lần vẽ lại màn sẽ có nhiều vòng cùng
   * chạy và máy nóng lên mà không ai hiểu vì sao. */
  if (canh3D) { canh3D.huy(); canh3D = null; }

  g('sbnMo3D')?.addEventListener('click', () => { hien3D = true; ve(); });
  g('sbnDong3D')?.addEventListener('click', () => { hien3D = false; ve(); });

  const khung3D = g('sbn3DKhung');
  if (khung3D && duLieu?.ho_so) {
    import('../components/rang-3d.js')
      .then((m) => {
        canh3D = m.taoCanh(khung3D, duLieu.ho_so.so_do_rang, (ma) => {
          rangChon = ma;
          ve();
        }, banQuet);
        canh3D.datGoc(goc3D);
        if (rangChon) canh3D.danhDauRang(rangChon);
      })
      .catch(() => {
        khung3D.innerHTML = '<p class="empty-state">Không tải được cảnh 3D trên trình duyệt này.</p>';
      });
  }

  g('sbnQuet')?.addEventListener('change', async (e) => {
    const t = e.target.files[0];
    if (!t) return;
    showToast('Đang đọc bản quét…');
    try {
      const m = await import('../components/rang-3d.js');
      banQuet = await m.napBanQuet(khung3D, t);
      showToast(banQuet.so_dinh.toLocaleString('vi-VN') + ' đỉnh · '
        + banQuet.kich_thuoc_mm.join(' × ') + ' mm — đã nạp bản quét.');
      await ve();
    } catch (err) { showToast(err.message, true); }
  });

  document.querySelectorAll('[data-goc3d]').forEach((b) => {
    b.addEventListener('click', () => {
      goc3D = b.dataset.goc3d;
      canh3D?.datGoc(goc3D);
      document.querySelectorAll('[data-goc3d]').forEach((x) =>
        x.classList.toggle('is-chon', x === b));
    });
  });

  document.querySelectorAll('[data-tai-anh]').forEach((o) => {
    o.addEventListener('change', async (e) => {
      const ds = [...e.target.files];
      if (!ds.length) return;
      const qua = ds.filter((f) => f.size > 25 * 1024 * 1024);
      if (qua.length) {
        showToast(`${qua[0].name} lớn hơn 25 MB, không xử lý được.`, true);
        return;
      }
      showToast(`Đang nén ${ds.length} ảnh…`);
      try {
        const xong = [];
        for (const f of ds) xong.push(await nenWebp(f));
        const giam = Math.round(xong.reduce((t, x) => t + x.giam, 0) / xong.length);
        const kq = await themAnh(o.dataset.taiAnh, xong, maToi);
        showToast(kq.trung
          ? `Đã thêm ${xong.length} ảnh, nhẹ đi ${giam}%. ${kq.trung} ảnh trùng nội dung đã có nên không lưu thêm bản sao.`
          : `Đã thêm ${xong.length} ảnh, nhẹ đi ${giam}% sau khi nén WebP.`);
        await ve();
      } catch (err) { showToast(err.message, true); }
    });
  });

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
  g('kfRang')?.addEventListener('input', (e) => {
    clearTimeout(henRang);
    const v = e.target.value;
    henRang = setTimeout(() => { kRang = v; ve(); }, 300);
  });
  g('kfChuaKy')?.addEventListener('click', () => { kChuaKy = !kChuaKy; ve(); });
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

  /* Bôi đen để đánh dấu lưu ý.
   *
   * Chỉ nhận vùng bôi nằm TRỌN trong một mục có data-truong. Bôi vắt qua hai
   * mục thì không lưu được đoạn nào cho đúng, mà lưu bừa thì lần sau nó sáng
   * nhầm chỗ — thà từ chối và nói rõ. */
  const thanh = document.createElement('div');
  thanh.className = 'sbn-thanh-hl';
  thanh.hidden = true;
  thanh.innerHTML = `
    <span class="sbn-thanh-chu"><i class="ri-mark-pen-line"></i> Đánh dấu lưu ý</span>
    <button type="button" data-muc="canh_bao" class="sbn-hl-nut hl-canh_bao">Cảnh báo</button>
    <button type="button" data-muc="quay" class="sbn-hl-nut hl-quay">Dặn quầy</button>
    <button type="button" data-muc="bac_si" class="sbn-hl-nut hl-bac_si">Ghi nhớ</button>`;
  document.body.appendChild(thanh);

  let dangBoi = null;
  const anThanh = () => { thanh.hidden = true; dangBoi = null; };

  document.addEventListener('mouseup', () => {
    if (!hoSoMo) return;
    const sel = window.getSelection();
    const doan = String(sel || '').trim();
    if (!doan || doan.length < 3) { anThanh(); return; }
    const o = sel.anchorNode?.parentElement?.closest('[data-truong]');
    const o2 = sel.focusNode?.parentElement?.closest('[data-truong]');
    if (!o || o !== o2) { anThanh(); return; }

    dangBoi = { luot_id: o.dataset.luot, truong: o.dataset.truong, doan };
    const r = sel.getRangeAt(0).getBoundingClientRect();
    thanh.hidden = false;
    const rong = thanh.offsetWidth || 320;
    thanh.style.top = `${window.scrollY + r.top - thanh.offsetHeight - 9}px`;
    thanh.style.left = `${Math.max(10,
      Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - rong - 10))}px`;
  });

  document.addEventListener('scroll', anThanh, { passive: true });

  thanh.querySelectorAll('[data-muc]').forEach((b) => {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', async () => {
      if (!dangBoi) return;
      const luu = { ...dangBoi, muc: b.dataset.muc };
      anThanh();
      const ghi = await requestInput(
        `Đoạn được đánh dấu: “${luu.doan.slice(0, 90)}${luu.doan.length > 90 ? '…' : ''}”`,
        { title: 'Câu dặn kèm theo',
          label: 'Ghi chú (có thể để trống)',
          placeholder: 'Nhắc khách đặt lịch trước, buổi này cần 90 phút…',
          confirmText: 'Đánh dấu' });
      if (ghi === null) return;
      chay(() => themDanhDau({ ...luu, ghi_chu: ghi }, maToi), 'Đã đánh dấu đoạn lưu ý.');
    });
  });

  document.querySelectorAll('[data-bo-dd]').forEach((b) => {
    b.addEventListener('click', async () => {
      const ok = await confirmAction('Gỡ đánh dấu này khỏi sổ và khỏi danh sách lưu ý?',
        { title: 'Gỡ đánh dấu', confirmText: 'Gỡ', tone: 'danger' });
      if (!ok) return;
      chay(() => boDanhDau(b.dataset.boDd, maToi), 'Đã gỡ đánh dấu.');
    });
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
