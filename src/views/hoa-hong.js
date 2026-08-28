/* Duyệt hoa hồng PG / SUP.
 *
 * Một màn cho cả hai vòng duyệt. Nút nào hiện ra là do vai trò và do trạng
 * thái của đợt quyết định, nên SUP và Admin nhìn cùng một bảng số liệu chứ
 * không phải hai bảng dựng riêng — hai bảng riêng là hai cơ hội lệch nhau.
 *
 * Màn này KHÔNG tự quyết định gì về tiền. Mọi con số do máy chủ tính, mọi
 * ràng buộc do database giữ. Ở đây chỉ bày ra cho người đọc và gửi lệnh đi.
 *
 * Dùng .panel, .metric-card, .status-pill của ứng dụng thay vì tự dựng. Bản
 * đầu tôi tự đặt một bảng màu xanh dương riêng, và kết quả là màn này trông
 * như dán thêm vào chứ không thuộc về phần mềm.
 */
import { store } from '../store.js';
import {
  escapeHTML, formatCurrency, formatDateTime, oNguoiPhuTrach, phanTrang, thanhPhanTrang,
} from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { navigateTo } from '../router.js';
import {
  adminXacNhanHoaHong, chotHoaHong, getHoaHongBieuGia, getHoaHongChiTiet,
  getHoaHongDanhSach, getHoaHongXemTruoc, supXacNhanHoaHong, tinhHoaHong,
  tuChoiHoaHong, xuatHoaHongCsv,
} from '../services/marketing.js';

let dsDot = []; let bieuGia = []; let chiTiet = null; let xemTruoc = null;
let dotDangMo = ''; let kyChon = '';

// Bộ lọc giữ ngoài hàm render, vì router dựng lại cả view mỗi lần điều hướng
// và mất bộ lọc giữa chừng thì không ai đối chiếu nổi.
let fVaiTro = ''; let fLoai = ''; let fKetQua = ''; let fNguoi = ''; let fTim = '';
let fTrangThaiDot = '';
let trangXem = 1; let trangCt = 1; let trangDot = 1;

const kyMacDinh = () => new Date().toISOString().slice(0, 7);

// Danh sách kỳ tự dựng, không dùng <input type="month">.
//
// Ô month gốc của trình duyệt hiển thị theo ngôn ngữ TRÌNH DUYỆT chứ không
// theo lang của trang, nên Chrome cài tiếng Anh luôn hiện "August 2026" giữa
// một màn tiếng Việt. Không ép được bằng CSS hay thuộc tính HTML nào.
//
// Đi lùi 18 tháng là đủ: hoa hồng chốt theo tháng và không ai duyệt lại kỳ
// cách đây hơn một năm rưỡi.
function danhSachKy(dangChon) {
  const nay = new Date();
  const ds = [];
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(nay.getFullYear(), nay.getMonth() - i, 1);
    const ma = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ds.push(opt(ma, `Tháng ${d.getMonth() + 1} · ${d.getFullYear()}`, dangChon));
  }
  // Kỳ đang chọn có thể nằm ngoài 18 tháng nếu người dùng vừa mở một đợt cũ.
  // Thiếu nó thì select tự nhảy về tháng này và người ta tính nhầm kỳ.
  if (dangChon && !ds.some((o) => o.includes(`value="${dangChon}"`))) {
    const [nam, thang] = dangChon.split('-');
    ds.unshift(opt(dangChon, `Tháng ${Number(thang)} · ${nam}`, dangChon));
  }
  return ds.join('');
}

// Năm mốc trong quy trình gộp thành bốn trạng thái sống. "SUP đã xác nhận" và
// "Chờ Admin xác nhận" là cùng một thời điểm nhìn từ hai phía, nên nhãn nói cả
// hai vế thay vì tách thành hai trạng thái mà một trong hai không bao giờ tồn
// tại quá vài phần nghìn giây.
const NHAN = {
  cho_sup:        { chu: 'Chờ SUP xác nhận',              lop: 'warn' },
  cho_admin:      { chu: 'SUP đã xác nhận · chờ Admin',   lop: 'warn' },
  admin_da_duyet: { chu: 'Admin đã xác nhận · chờ chốt',  lop: 'neutral' },
  da_chot:        { chu: 'Đã chốt',                       lop: 'good' },
  tu_choi:        { chu: 'Đã từ chối',                    lop: 'bad' },
};
const BUOC = ['cho_sup', 'cho_admin', 'admin_da_duyet', 'da_chot'];

const nhanTT = (tt) => {
  const n = NHAN[tt] || { chu: tt || '—', lop: '' };
  return `<span class="status-pill ${n.lop}">${escapeHTML(n.chu)}</span>`;
};
const tien = (v) => formatCurrency(Number(v || 0));
const ngay = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
const opt = (v, t, chon) => `<option value="${escapeHTML(v)}"${chon === v ? ' selected' : ''}>${escapeHTML(t)}</option>`;
const the = (nhan, giaTri, phu) => `<article class="metric-card">
  <p class="metric-label">${escapeHTML(nhan)}</p>
  <p class="metric-value">${escapeHTML(String(giaTri))}</p>
  <p class="metric-detail">${escapeHTML(phu || '')}</p>
</article>`;

function vaiTro() {
  const role = store.getState().profile?.role;
  const laAdmin = ['admin', 'admin_it', 'superadmin', 'admin_marketing'].includes(role);
  const laSup = role === 'support_marketing';
  return { laAdmin, laSup, duocTinh: laAdmin || laSup, duocXem: laAdmin || laSup || role === 'telesale_leader' };
}

export async function renderView() {
  const { laAdmin, laSup, duocXem, duocTinh } = vaiTro();
  if (!duocXem) {
    return `<div class="view-stack"><section class="panel"><h3>Không có quyền</h3>
      <p>Phân hệ duyệt hoa hồng dành cho Support Marketing và Admin.</p></section></div>`;
  }

  kyChon ||= kyMacDinh();
  [dsDot, bieuGia] = await Promise.all([getHoaHongDanhSach(), getHoaHongBieuGia()]);
  chiTiet = dotDangMo ? await getHoaHongChiTiet(dotDangMo).catch(() => null) : null;

  return `<div class="view-stack">
    ${duocTinh ? khoiTinh() : ''}
    ${khoiDanhSach()}
    ${chiTiet ? khoiChiTiet(laAdmin, laSup) : ''}
    ${khoiBieuGia()}
  </div>`;
}

/* ── Tính theo kỳ ────────────────────────────────────────────────────────── */

function khoiTinh() {
  const m = xemTruoc?.meta;
  return `<section class="panel">
    <div class="section-title"><h3>Tính hoa hồng theo kỳ</h3>
      <span class="pill">Máy tính · người duyệt hai vòng</span></div>

    <form id="hhFormKy" class="hh-hang">
      <label><span>Kỳ tính</span><select name="ky">${danhSachKy(kyChon)}</select></label>
      <button type="submit" class="secondary-button"><i class="ri-search-eye-line"></i> Xem trước</button>
      <button type="button" id="hhNutTinh" class="primary-button"
        ${xemTruoc && m?.trong_han ? '' : 'disabled'}><i class="ri-add-circle-line"></i> Tạo đợt duyệt</button>
      <p class="hh-ghi">${xemTruoc
        ? `Kỳ ${escapeHTML(m.ky_code)}: ${m.trong_han} dòng đủ điều kiện, ${m.qua_han} dòng quá hạn.`
        : 'Xem trước trước đã. Nó không ghi gì, chỉ cho thấy đợt sắp tạo gồm những gì và loại những gì.'}</p>
    </form>

    ${!xemTruoc ? '' : `
      <div class="grid cols-4">
        ${the('Đủ điều kiện', m.trong_han, 'sẽ được trả')}
        ${the('Quá hạn', m.qua_han, 'vẫn ghi vào đợt, tiền bằng 0')}
        ${the('Tổng dự kiến', tien(m.tong_tien), 'phần PG và SUP cộng lại')}
        ${the('Phải xem kỹ', (m.suy_ra_sup || 0) + (m.lui_ve_ngay_bam || 0) + (m.den_truoc_ngay_hen || 0), 'dòng dựa trên suy đoán')}
      </div>
      ${khoiCanhBao(m)}
      ${bangXemTruoc()}`}
  </section>`;
}

// Bốn cảnh báo này không chặn việc tính, nhưng người duyệt phải nhìn thấy
// trước khi ký. Số liệu suy đoán mà trông y hệt số liệu khai báo thật là cách
// nhanh nhất để một sai sót đi hết cả quy trình duyệt mà không ai dừng lại.
function khoiCanhBao(m) {
  const c = [];
  if (m.thieu_sup) c.push(`${m.thieu_sup} dòng không tìm được người phụ trách SUP nên phần SUP bị bỏ qua.`);
  if (m.suy_ra_sup) c.push(`${m.suy_ra_sup} dòng suy ra SUP từ chỗ chỉ có một người Support Marketing, không phải từ khai báo trên hồ sơ PG.`);
  if (m.lui_ve_ngay_bam) c.push(`${m.lui_ve_ngay_bam} dòng không có ngày khách đến nên phải lùi về thời điểm bấm xác nhận. Hai mốc này khác nhau.`);
  if (m.den_truoc_ngay_hen) c.push(`${m.den_truoc_ngay_hen} dòng ghi khách đến TRƯỚC cả ngày hẹn. Cần kiểm lại.`);
  if (!c.length) return '';
  return `<div class="hh-canhbao"><strong>Cần xem kỹ trước khi ký</strong>
    <ul>${c.map((x) => `<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`;
}

function bangXemTruoc() {
  const tatCa = xemTruoc.data || [];
  if (!tatCa.length) return '<p class="hh-ghi">Không có lead nào đủ điều kiện trong kỳ này.</p>';
  const tr = phanTrang(tatCa, trangXem);
  const rows = tr.ds;
  return `<div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
    <th>Khách hàng</th><th>Loại</th><th>PG nhập</th><th>SUP hưởng</th>
    <th>Lịch hẹn</th><th>Ngày đến</th><th class="hh-so">Số ngày</th><th>Kết quả</th>
  </tr></thead><tbody>
    ${rows.map((r) => `<tr class="${r.trong_han ? '' : 'hh-loai'}">
      <td><strong>${escapeHTML(r.customer_name || '')}</strong></td>
      <td>${escapeHTML(r.loai)}</td>
      <td>${oNguoiPhuTrach(r.pg_ten, r.created_by_pg_code)}</td>
      <td>${r.sup_ma ? oNguoiPhuTrach(r.sup_ten, r.sup_ma) : '<span class="pg-unassigned">Chưa xác định</span>'}
        ${r.sup_nguon === 'suy_ra_duy_nhat' ? '<span class="hh-suyra">suy ra</span>' : ''}</td>
      <td>${ngay(r.appointment_at)}</td>
      <td>${ngay(r.ngay_den)}${r.ngay_den_nguon === 'xac_nhan' ? '<span class="hh-suyra">lùi về lúc bấm</span>' : ''}</td>
      <td class="hh-so">${r.so_ngay_cho == null ? '—' : r.so_ngay_cho}</td>
      <td>${r.trong_han ? '<span class="status-pill good">Đủ điều kiện</span>'
        : `<span class="status-pill bad">${r.den_truoc_ngay_hen ? 'Đến trước ngày hẹn' : 'Quá hạn'}</span>`}</td>
    </tr>`).join('')}
  </tbody></table></div>${thanhPhanTrang(tr, 'xem', 'dòng')}`;
}

/* ── Danh sách đợt ───────────────────────────────────────────────────────── */

function khoiDanhSach() {
  const ds = fTrangThaiDot ? dsDot.filter((d) => d.trang_thai === fTrangThaiDot) : dsDot;
  return `<section class="panel">
    <div class="section-title"><h3>Các đợt hoa hồng</h3>
      <span class="pill">${ds.length}${fTrangThaiDot ? ` trên ${dsDot.length}` : ''} đợt</span></div>

    <form id="hhLocDot" class="hh-hang">
      <label><span>Trạng thái đợt</span><select name="tt">
        ${opt('', 'Tất cả trạng thái', fTrangThaiDot)}
        ${BUOC.concat('tu_choi').map((k) => opt(k, NHAN[k].chu, fTrangThaiDot)).join('')}
      </select></label>
      <button type="submit" class="secondary-button"><i class="ri-filter-3-line"></i> Lọc</button>
    </form>

    ${!ds.length ? '<p class="hh-ghi">Chưa có đợt nào khớp bộ lọc.</p>' : `
    <div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
      <th>Kỳ</th><th>Trạng thái</th><th class="hh-so">Dòng trả</th>
      <th class="hh-so">Phần PG</th><th class="hh-so">Phần SUP</th><th class="hh-so">Tổng chi</th><th></th>
    </tr></thead><tbody>
      ${phanTrang(ds, trangDot, 20).ds.map((d) => `<tr>
        <td><strong>${escapeHTML(d.ky_code)}</strong><small>${ngay(d.ky_tu)} – ${ngay(d.ky_den)}</small></td>
        <td>${nhanTT(d.trang_thai)}</td>
        <td class="hh-so">${d.so_dong}</td>
        <td class="hh-so">${tien(d.tong_tien_pg)}</td>
        <td class="hh-so">${tien(d.tong_tien_sup)}</td>
        <td class="hh-so"><strong>${tien(d.tong_tien)}</strong></td>
        <td><button type="button" class="secondary-button" data-hh-mo="${escapeHTML(d.id)}">
          ${dotDangMo === d.id ? 'Đang xem' : 'Mở'}</button></td>
      </tr>`).join('')}
    </tbody></table></div>${thanhPhanTrang(phanTrang(ds, trangDot, 20), 'dot', 'đợt')}`}
  </section>`;
}

/* ── Chi tiết một đợt ────────────────────────────────────────────────────── */

function chuoiBuoc(tt) {
  if (tt === 'tu_choi') return '<div class="hh-chuoi"><span class="status-pill bad">Đã từ chối</span></div>';
  const iHienTai = BUOC.indexOf(tt);
  const ten = ['Tính tự động', 'SUP xác nhận', 'Admin xác nhận', 'Chốt'];
  return `<div class="hh-chuoi">${ten.map((t, k) => {
    const xong = k <= iHienTai;
    return `<span class="${xong ? 'xong' : ''}">${xong ? '✓ ' : ''}${escapeHTML(t)}</span>`
      + (k < ten.length - 1 ? '<i>›</i>' : '');
  }).join('')}<span class="pill">Kế toán quan sát, không duyệt</span></div>`;
}

function locDong(dong) {
  const tim = fTim.trim().toLocaleLowerCase('vi');
  return dong.filter((l) => {
    if (fVaiTro && l.vai_tro !== fVaiTro) return false;
    if (fLoai && l.loai !== fLoai) return false;
    if (fKetQua === 'tra' && !l.tinh_tien) return false;
    if (fKetQua === 'loai' && l.tinh_tien) return false;
    if (fNguoi && l.nguoi_ma !== fNguoi) return false;
    if (tim && !`${l.anh_khach_ten || ''} ${l.nguoi_ten || ''} ${l.nguoi_ma || ''}`
      .toLocaleLowerCase('vi').includes(tim)) return false;
    return true;
  });
}

function khoiChiTiet(laAdmin, laSup) {
  const { dot, gop, dong, nhat_ky: nk } = chiTiet;
  const tt = dot.trang_thai;
  const nut = [];
  if (tt === 'cho_sup' && (laSup || laAdmin)) nut.push(['hhSup', 'primary-button', 'ri-check-line', 'SUP xác nhận']);
  if (tt === 'cho_admin' && laAdmin) nut.push(['hhAdmin', 'primary-button', 'ri-check-double-line', 'Admin xác nhận']);
  if (tt === 'admin_da_duyet' && laAdmin) nut.push(['hhChot', 'primary-button', 'ri-lock-line', 'Chốt đợt chi']);
  if (['cho_sup', 'cho_admin', 'admin_da_duyet'].includes(tt) && (laSup || laAdmin)) {
    nut.push(['hhTuChoi', 'danger-button', 'ri-close-line', 'Từ chối']);
  }

  const daLoc = locDong(dong);
  const nguoiCo = [...new Map(dong.map((l) => [l.nguoi_ma, l])).values()];
  const soLoai = dong.filter((l) => !l.tinh_tien).length;

  return `<section class="panel">
    <div class="section-title"><h3>Đợt ${escapeHTML(dot.ky_code)}</h3>${nhanTT(tt)}</div>
    ${chuoiBuoc(tt)}

    <div class="grid cols-4">
      ${the('Dòng được trả', dot.so_dong, 'đã trừ dòng quá hạn')}
      ${the('Phần PG', tien(dot.tong_tien_pg), '70% mỗi khoản')}
      ${the('Phần SUP', tien(dot.tong_tien_sup), '30% mỗi khoản')}
      ${the('Tổng chi', tien(dot.tong_tien), `${soLoai} dòng bị loại, tiền bằng 0`)}
    </div>

    <p class="hh-ghi">Định khoản đề xuất: <strong>Nợ ${escapeHTML(dot.tk_no)} / Có ${escapeHTML(dot.tk_co)}</strong>
      · khoản mục ${escapeHTML(dot.khoan_muc)}. Kế toán thấy khoản này trong két để đối chiếu, nhưng không phải một cửa duyệt.</p>

    <div class="hh-nut">
      ${nut.map(([id, lop, ico, chu]) => `<button type="button" id="${id}" class="${lop}"><i class="${ico}"></i> ${chu}</button>`).join('')}
      <button type="button" id="hhXuat" class="secondary-button"><i class="ri-file-excel-2-line"></i> Xuất Excel đối chiếu</button>
    </div>

    <h4>Tổng hợp theo người</h4>
    <div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
      <th>Vai trò</th><th>Người hưởng</th><th>Loại</th><th class="hh-so">Số lượt</th><th class="hh-so">Thành tiền</th>
    </tr></thead><tbody>
      ${gop.map((g) => `<tr>
        <td>${g.vai_tro === 'pg' ? 'PG' : 'SUP'}</td>
        <td>${oNguoiPhuTrach(g.nguoi_ten, g.nguoi_ma)}</td>
        <td>${escapeHTML(g.loai)}</td>
        <td class="hh-so">${g.so_luong}</td>
        <td class="hh-so"><strong>${tien(g.so_tien)}</strong></td>
      </tr>`).join('')}
    </tbody></table></div>

    <h4>Chi tiết từng dòng</h4>
    <form id="hhLocDong" class="hh-loc">
      <label><span>Tìm khách hoặc người hưởng</span><input type="search" name="tim" value="${escapeHTML(fTim)}" placeholder="Tên khách, tên hoặc mã người hưởng"></label>
      <label><span>Vai trò</span><select name="vaiTro">
        ${opt('', 'PG và SUP', fVaiTro)}${opt('pg', 'Chỉ PG', fVaiTro)}${opt('sup', 'Chỉ SUP', fVaiTro)}</select></label>
      <label><span>Loại dịch vụ</span><select name="loai">
        ${opt('', 'Tất cả loại', fLoai)}${bieuGia.map((g) => opt(g.ma, `${g.ma} · ${g.ten}`, fLoai)).join('')}</select></label>
      <label><span>Kết quả</span><select name="ketQua">
        ${opt('', 'Được trả và bị loại', fKetQua)}${opt('tra', 'Chỉ dòng được trả', fKetQua)}${opt('loai', 'Chỉ dòng bị loại', fKetQua)}</select></label>
      <label><span>Người hưởng</span><select name="nguoi">
        ${opt('', 'Tất cả', fNguoi)}${nguoiCo.map((l) => opt(l.nguoi_ma, `${l.nguoi_ten || l.nguoi_ma} · ${l.vai_tro === 'pg' ? 'PG' : 'SUP'}`, fNguoi)).join('')}</select></label>
      <button type="submit" class="secondary-button"><i class="ri-filter-3-line"></i> Lọc</button>
      <p class="hh-ghi">Hiện ${daLoc.length} trên ${dong.length} dòng.
        ${daLoc.length !== dong.length ? ' <button type="button" id="hhXoaLoc" class="secondary-button">Xóa lọc</button>' : ''}</p>
    </form>
    ${(() => { const tr = phanTrang(daLoc, trangCt);
      return bangDong(tr.ds) + thanhPhanTrang(tr, 'ct', 'dòng'); })()}

    <h4>Nhật ký duyệt</h4>
    <ul class="hh-nhatky">
      ${nk.map((k) => `<li>
        <strong>${escapeHTML(NHAN[k.den_trang_thai]?.chu || k.den_trang_thai)}</strong>
        · ${escapeHTML(k.boi)}${k.vai_tro_boi ? ` (${escapeHTML(k.vai_tro_boi)})` : ''}
        · ${escapeHTML(formatDateTime(k.created_at))}
        ${k.ghi_chu ? `<small>${escapeHTML(k.ghi_chu)}</small>` : ''}
      </li>`).join('')}
    </ul>
  </section>`;
}

// Một bảng cho cả dòng được trả lẫn dòng bị loại. Tách hai bảng thì bộ lọc
// phải chạy hai lần và người đọc phải so hai chỗ; gộp lại rồi đánh dấu bằng
// vạch đỏ bên trái thì so sánh nằm ngay trong tầm mắt.
function bangDong(ds) {
  if (!ds.length) return '<p class="hh-ghi">Không có dòng nào khớp bộ lọc.</p>';
  return `<div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
    <th>Vai trò</th><th>Người hưởng</th><th>Khách hàng</th><th>Loại</th>
    <th>Lịch hẹn</th><th>Ngày đến</th><th class="hh-so">Số ngày</th><th class="hh-so">Số tiền</th><th>Ghi chú</th>
  </tr></thead><tbody>
    ${ds.map((l) => `<tr class="${l.tinh_tien ? '' : 'hh-loai'}">
      <td>${l.vai_tro === 'pg' ? 'PG' : 'SUP'}</td>
      <td>${oNguoiPhuTrach(l.nguoi_ten, l.nguoi_ma)}
        ${l.sup_nguon === 'suy_ra_duy_nhat' ? '<span class="hh-suyra">suy ra</span>' : ''}</td>
      <td>${escapeHTML(l.anh_khach_ten || '')}</td>
      <td>${escapeHTML(l.loai)}</td>
      <td>${ngay(l.anh_lich_hen)}</td>
      <td>${ngay(l.ngay_den)}${l.ngay_den_nguon === 'xac_nhan' ? '<span class="hh-suyra">lùi về lúc bấm</span>' : ''}</td>
      <td class="hh-so">${l.so_ngay_cho == null ? '—' : l.so_ngay_cho}</td>
      <td class="hh-so">${l.tinh_tien ? `<strong>${tien(l.so_tien)}</strong>` : '0 ₫'}</td>
      <td>${l.tinh_tien ? '' : `<span class="hh-lydo">${escapeHTML(l.ly_do_loai || '')}</span>`}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

/* ── Biểu giá ────────────────────────────────────────────────────────────── */

function khoiBieuGia() {
  return `<section class="panel">
    <div class="section-title"><h3>Biểu giá đang áp dụng</h3>
      <span class="pill">Sửa trong bảng, không sửa trong mã</span></div>
    <div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
      <th>Loại dịch vụ</th><th>Mức data</th><th class="hh-so">Tổng hoa hồng</th>
      <th class="hh-so">PG · 70%</th><th class="hh-so">SUP · 30%</th>
      <th>Thời hạn khách đến</th><th>Tính từ</th>
    </tr></thead><tbody>
      ${bieuGia.map((g) => `<tr>
        <td><strong>${escapeHTML(g.ten)}</strong><small>${escapeHTML(g.ma)}</small></td>
        <td>${g.net_level === 'advanced' ? 'Chuyên sâu' : 'Cơ bản'}</td>
        <td class="hh-so"><strong>${tien(g.tong_hoa_hong)}</strong></td>
        <td class="hh-so">${tien(g.don_gia_pg)}</td>
        <td class="hh-so">${tien(g.don_gia_sup)}</td>
        <td>${g.so_ngay_toi_da == null ? 'Không giới hạn' : `trong ${g.so_ngay_toi_da} ngày`}</td>
        <td>${g.moc_tinh === 'lich_hen' ? 'Lịch hẹn' : 'Ngày nhập lead'}</td>
      </tr>`).join('')}
    </tbody></table></div>
  </section>`;
}

/* ── Sự kiện ─────────────────────────────────────────────────────────────── */

export function initView() {
  document.getElementById('hhFormKy')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    kyChon = new FormData(e.currentTarget).get('ky');
    try {
      xemTruoc = await getHoaHongXemTruoc(kyChon);
      await navigateTo('hoa-hong');
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('hhNutTinh')?.addEventListener('click', async () => {
    const m = xemTruoc?.meta;
    const ok = await confirmAction(
      `${m.trong_han} dòng đủ điều kiện, tổng ${tien(m.tong_tien)}. `
      + `${m.qua_han} dòng quá hạn vẫn được ghi vào đợt với số tiền bằng 0 để đối chiếu. `
      + 'Đợt này phải đi qua SUP rồi Admin trước khi chốt.',
      { title: `Tạo đợt duyệt cho kỳ ${kyChon}?`, confirmText: 'Tạo đợt' });
    if (!ok) return;
    try {
      const d = await tinhHoaHong(kyChon);
      dotDangMo = d.dot.id; xemTruoc = null;
      showToast(`Đã tạo đợt ${kyChon} với ${d.dot.so_dong} dòng được trả.`);
      await navigateTo('hoa-hong');
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('hhLocDot')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    fTrangThaiDot = new FormData(e.currentTarget).get('tt') || '';
    trangDot = 1;
    await navigateTo('hoa-hong');
  });

  document.getElementById('hhLocDong')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    fTim = f.get('tim') || ''; fVaiTro = f.get('vaiTro') || '';
    fLoai = f.get('loai') || ''; fKetQua = f.get('ketQua') || ''; fNguoi = f.get('nguoi') || '';
    trangCt = 1;   // Đổi bộ lọc thì về trang đầu, nếu không người dùng thấy trang rỗng.
    await navigateTo('hoa-hong');
  });

  document.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', async () => {
    const [ma, trang] = b.dataset.pt.split(':');
    const n = Number(trang);
    if (ma === 'xem') trangXem = n;
    else if (ma === 'ct') trangCt = n;
    else if (ma === 'dot') trangDot = n;
    await navigateTo('hoa-hong');
  }));

  document.getElementById('hhXoaLoc')?.addEventListener('click', async () => {
    fTim = ''; fVaiTro = ''; fLoai = ''; fKetQua = ''; fNguoi = '';
    await navigateTo('hoa-hong');
  });

  document.querySelectorAll('[data-hh-mo]').forEach((b) => b.addEventListener('click', async () => {
    dotDangMo = b.dataset.hhMo;
    fTim = ''; fVaiTro = ''; fLoai = ''; fKetQua = ''; fNguoi = '';
    await navigateTo('hoa-hong');
  }));

  const buoc = async (fn, hoi, xong) => {
    const ok = await confirmAction(hoi.mo_ta, { title: hoi.tieu_de, confirmText: hoi.nut });
    if (!ok) return;
    try { await fn(dotDangMo); showToast(xong); await navigateTo('hoa-hong'); }
    catch (err) { showToast(err.message, true); }
  };

  document.getElementById('hhSup')?.addEventListener('click', () => buoc(
    supXacNhanHoaHong,
    { tieu_de: 'SUP xác nhận đợt này?', nut: 'SUP xác nhận',
      mo_ta: 'Sau bước này đợt chuyển sang chờ Admin. Người ký vòng Admin bắt buộc phải là người khác.' },
    'SUP đã xác nhận.'));

  document.getElementById('hhAdmin')?.addEventListener('click', () => buoc(
    adminXacNhanHoaHong,
    { tieu_de: 'Admin xác nhận đợt này?', nut: 'Admin xác nhận',
      mo_ta: 'Sau bước này chỉ còn bước chốt.' },
    'Admin đã xác nhận.'));

  document.getElementById('hhChot')?.addEventListener('click', () => buoc(
    chotHoaHong,
    { tieu_de: 'Chốt đợt hoa hồng?', nut: 'Chốt',
      mo_ta: 'Chốt rồi thì không sửa được nữa, kể cả một dòng. Kế toán sẽ thấy khoản chi này trong két để đối chiếu.' },
    'Đã chốt. Kế toán thấy khoản chi này trong két.'));

  document.getElementById('hhTuChoi')?.addEventListener('click', async () => {
    const lyDo = await requestInput(
      'Các lead trong đợt sẽ được trả lại để tính ở đợt sau.',
      { title: 'Từ chối đợt hoa hồng', label: 'Lý do từ chối',
        placeholder: 'Ít nhất 5 ký tự', confirmText: 'Từ chối', tone: 'danger' });
    if (!lyDo) return;
    try {
      await tuChoiHoaHong(dotDangMo, lyDo);
      showToast('Đã từ chối. Các lead trong đợt được trả lại để tính ở đợt sau.');
      await navigateTo('hoa-hong');
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('hhXuat')?.addEventListener('click', async () => {
    try {
      const n = await xuatHoaHongCsv(dotDangMo);
      showToast(`Đã xuất ${n} dòng để đối chiếu.`);
    } catch (err) { showToast(err.message, true); }
  });
}
