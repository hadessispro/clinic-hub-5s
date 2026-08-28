/* Duyệt hoa hồng PG / SUP.
 *
 * Một màn cho cả hai vòng duyệt. Nút nào hiện ra là do vai trò và do trạng
 * thái của đợt quyết định, nên SUP và Admin nhìn cùng một bảng số liệu chứ
 * không phải hai bảng dựng riêng — hai bảng riêng là hai cơ hội lệch nhau.
 *
 * Màn này KHÔNG tự quyết định gì về tiền. Mọi con số do máy chủ tính, mọi
 * ràng buộc do database giữ. Ở đây chỉ bày ra cho người đọc và gửi lệnh đi.
 */
import { store } from '../store.js';
import { escapeHTML, formatCurrency, formatDateTime, oNguoiPhuTrach } from '../utils.js';
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

const kyMacDinh = () => new Date().toISOString().slice(0, 7);

// Năm mốc trong quy trình gộp thành bốn trạng thái sống. "SUP đã xác nhận" và
// "Chờ Admin xác nhận" là cùng một thời điểm nhìn từ hai phía, nên nhãn nói cả
// hai vế thay vì tách thành hai trạng thái mà một trong hai không bao giờ tồn
// tại quá vài phần nghìn giây.
const NHAN = {
  cho_sup:        { chu: 'Chờ SUP xác nhận',                 lop: 'is-cho' },
  cho_admin:      { chu: 'SUP đã xác nhận · chờ Admin',      lop: 'is-cho' },
  admin_da_duyet: { chu: 'Admin đã xác nhận · chờ chốt',     lop: 'is-duyet' },
  da_chot:        { chu: 'Đã chốt · đã đẩy sang kế toán',    lop: 'is-chot' },
  tu_choi:        { chu: 'Đã từ chối',                       lop: 'is-tuchoi' },
};
const nhanTrangThai = (tt) => {
  const n = NHAN[tt] || { chu: tt || '—', lop: '' };
  return `<span class="hh-pill ${n.lop}">${escapeHTML(n.chu)}</span>`;
};

const tien = (v) => formatCurrency(Number(v || 0));
const ngay = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');

function vaiTro() {
  const role = store.getState().profile?.role;
  const laAdmin = ['admin', 'admin_it', 'superadmin', 'admin_marketing'].includes(role);
  const laSup = role === 'support_marketing';
  return { role, laAdmin, laSup, duocTinh: laAdmin || laSup, duocXem: laAdmin || laSup || role === 'telesale_leader' };
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
    ${khoiBieuGia()}
    ${duocTinh ? khoiTinh() : ''}
    ${khoiDanhSach()}
    ${chiTiet ? khoiChiTiet(laAdmin, laSup) : ''}
  </div>`;
}

function khoiBieuGia() {
  return `<section class="panel">
    <div class="section-title"><h3>Biểu giá đang áp dụng</h3>
      <span class="hh-note">Sửa trong bảng, không sửa trong mã</span></div>
    <div class="table-wrap"><table><thead><tr>
      <th>Loại dịch vụ</th><th>Mức data</th><th>Tổng hoa hồng</th>
      <th>PG</th><th>SUP</th><th>Thời hạn khách đến</th><th>Tính từ</th>
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

function khoiTinh() {
  const m = xemTruoc?.meta;
  return `<section class="panel">
    <div class="section-title"><h3>Tính hoa hồng theo kỳ</h3></div>
    <form id="hhFormKy" class="hh-form">
      <label>Kỳ <input type="month" name="ky" value="${escapeHTML(kyChon)}" required></label>
      <button type="submit" class="secondary-button">Xem trước</button>
      <button type="button" id="hhNutTinh" class="primary-button"
        ${xemTruoc && m?.trong_han ? '' : 'disabled'}>Tạo đợt duyệt</button>
    </form>
    ${!xemTruoc ? '<p class="hh-note">Xem trước trước đã. Nó không ghi gì, chỉ cho thấy đợt sắp tạo gồm những gì.</p>' : `
      <div class="hh-tomtat">
        <div><span>${m.trong_han}</span><small>đủ điều kiện</small></div>
        <div><span>${m.qua_han}</span><small>quá hạn, bị loại</small></div>
        <div><span>${tien(m.tong_tien)}</span><small>tổng dự kiến</small></div>
      </div>
      ${khoiCanhBao(m)}
      ${bangXemTruoc()}
    `}
  </section>`;
}

// Ba cảnh báo này không chặn việc tính, nhưng người duyệt phải nhìn thấy
// trước khi ký. Số liệu suy đoán mà trông y hệt số liệu khai báo thật là cách
// nhanh nhất để một sai sót đi hết cả quy trình duyệt mà không ai dừng lại.
function khoiCanhBao(m) {
  const c = [];
  if (m.thieu_sup) c.push(`${m.thieu_sup} dòng không tìm được người phụ trách SUP nên phần SUP bị bỏ qua.`);
  if (m.suy_ra_sup) c.push(`${m.suy_ra_sup} dòng suy ra SUP từ việc chỉ có một người Support Marketing, không phải từ khai báo trên hồ sơ PG.`);
  if (m.lui_ve_ngay_bam) c.push(`${m.lui_ve_ngay_bam} dòng không có ngày khách đến nên phải lùi về thời điểm bấm xác nhận. Hai mốc này khác nhau.`);
  if (m.den_truoc_ngay_hen) c.push(`${m.den_truoc_ngay_hen} dòng ghi khách đến TRƯỚC cả ngày hẹn. Cần kiểm lại.`);
  if (!c.length) return '';
  return `<div class="hh-canhbao"><strong>Cần xem kỹ trước khi ký</strong><ul>
    ${c.map((x) => `<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`;
}

function bangXemTruoc() {
  const rows = xemTruoc.data || [];
  if (!rows.length) return '<p class="hh-note">Không có lead nào đủ điều kiện trong kỳ này.</p>';
  return `<div class="table-wrap"><table><thead><tr>
    <th>Khách hàng</th><th>Loại</th><th>PG nhập</th><th>SUP hưởng</th>
    <th>Lịch hẹn</th><th>Ngày đến</th><th>Số ngày</th><th>Kết quả</th>
  </tr></thead><tbody>
    ${rows.map((r) => `<tr class="${r.trong_han ? '' : 'hh-loai'}">
      <td><strong>${escapeHTML(r.customer_name || '')}</strong></td>
      <td>${escapeHTML(r.loai)}</td>
      <td>${oNguoiPhuTrach(r.pg_ten, r.created_by_pg_code)}</td>
      <td>${r.sup_ma ? oNguoiPhuTrach(r.sup_ten, r.sup_ma)
        : '<span class="pg-unassigned">Chưa xác định</span>'}
        ${r.sup_nguon === 'suy_ra_duy_nhat' ? '<small class="hh-suyra">suy ra</small>' : ''}</td>
      <td>${ngay(r.appointment_at)}</td>
      <td>${ngay(r.ngay_den)}${r.ngay_den_nguon === 'xac_nhan' ? '<small class="hh-suyra">lùi về lúc bấm</small>' : ''}</td>
      <td class="hh-so">${r.so_ngay_cho == null ? '—' : r.so_ngay_cho}</td>
      <td>${r.trong_han ? '<span class="hh-pill is-duyet">Đủ điều kiện</span>'
        : `<span class="hh-pill is-tuchoi">${r.den_truoc_ngay_hen ? 'Đến trước ngày hẹn' : 'Quá hạn'}</span>`}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function khoiDanhSach() {
  return `<section class="panel">
    <div class="section-title"><h3>Các đợt hoa hồng</h3>${dsDot.length ? `<span class="hh-note">${dsDot.length} đợt</span>` : ''}</div>
    ${!dsDot.length ? '<p class="hh-note">Chưa có đợt nào.</p>' : `
    <div class="table-wrap"><table><thead><tr>
      <th>Kỳ</th><th>Trạng thái</th><th>Số dòng</th><th>PG</th><th>SUP</th><th>Tổng</th><th>Chứng từ KT</th><th></th>
    </tr></thead><tbody>
      ${dsDot.map((d) => `<tr>
        <td><strong>${escapeHTML(d.ky_code)}</strong><small>${ngay(d.ky_tu)} – ${ngay(d.ky_den)}</small></td>
        <td>${nhanTrangThai(d.trang_thai)}</td>
        <td class="hh-so">${d.so_dong}</td>
        <td class="hh-so">${tien(d.tong_tien_pg)}</td>
        <td class="hh-so">${tien(d.tong_tien_sup)}</td>
        <td class="hh-so"><strong>${tien(d.tong_tien)}</strong></td>
        <td>${d.finance_voucher_no ? escapeHTML(d.finance_voucher_no)
          : (d.trang_thai === 'da_chot' ? '<span class="hh-cho">chờ kế toán</span>' : '—')}</td>
        <td><button type="button" class="secondary-button" data-hh-mo="${escapeHTML(d.id)}">
          ${dotDangMo === d.id ? 'Đang xem' : 'Xem'}</button></td>
      </tr>`).join('')}
    </tbody></table></div>`}
  </section>`;
}

function khoiChiTiet(laAdmin, laSup) {
  const { dot, gop, dong, nhat_ky: nk } = chiTiet;
  const tt = dot.trang_thai;
  const nut = [];
  if (tt === 'cho_sup' && (laSup || laAdmin)) nut.push(['hhSup', 'primary-button', 'SUP xác nhận']);
  if (tt === 'cho_admin' && laAdmin) nut.push(['hhAdmin', 'primary-button', 'Admin xác nhận']);
  if (tt === 'admin_da_duyet' && laAdmin) nut.push(['hhChot', 'primary-button', 'Chốt và đẩy sang kế toán']);
  if (['cho_sup', 'cho_admin', 'admin_da_duyet'].includes(tt) && (laSup || laAdmin)) {
    nut.push(['hhTuChoi', 'danger-button', 'Từ chối']);
  }

  return `<section class="panel">
    <div class="section-title"><h3>Đợt ${escapeHTML(dot.ky_code)}</h3>${nhanTrangThai(tt)}</div>

    <div class="hh-tomtat">
      <div><span>${dot.so_dong}</span><small>dòng hoa hồng</small></div>
      <div><span>${tien(dot.tong_tien_pg)}</span><small>phần PG</small></div>
      <div><span>${tien(dot.tong_tien_sup)}</span><small>phần SUP</small></div>
      <div><span>${tien(dot.tong_tien)}</span><small>tổng chi</small></div>
    </div>

    <p class="hh-note">Định khoản đề xuất: Nợ ${escapeHTML(dot.tk_no)} / Có ${escapeHTML(dot.tk_co)}
      · khoản mục ${escapeHTML(dot.khoan_muc)}. Kế toán vẫn kiểm lại trước khi ghi sổ.</p>

    <div class="hh-nut">
      ${nut.map(([id, lop, chu]) => `<button type="button" id="${id}" class="${lop}">${chu}</button>`).join('')}
      <button type="button" id="hhXuat" class="secondary-button">Xuất Excel đối chiếu</button>
    </div>

    <h4>Tổng hợp theo người</h4>
    <div class="table-wrap"><table><thead><tr>
      <th>Vai trò</th><th>Người hưởng</th><th>Loại</th><th>Số lượng</th><th>Thành tiền</th>
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
    <div class="table-wrap"><table><thead><tr>
      <th>Vai trò</th><th>Người hưởng</th><th>Khách hàng</th><th>Loại</th>
      <th>Lịch hẹn</th><th>Ngày đến</th><th>Số ngày</th><th>Số tiền</th>
    </tr></thead><tbody>
      ${dong.map((l) => `<tr>
        <td>${l.vai_tro === 'pg' ? 'PG' : 'SUP'}</td>
        <td>${oNguoiPhuTrach(l.nguoi_ten, l.nguoi_ma)}
          ${l.sup_nguon === 'suy_ra_duy_nhat' ? '<small class="hh-suyra">suy ra</small>' : ''}</td>
        <td>${escapeHTML(l.anh_khach_ten || '')}</td>
        <td>${escapeHTML(l.loai)}</td>
        <td>${ngay(l.anh_lich_hen)}</td>
        <td>${ngay(l.ngay_den)}${l.ngay_den_nguon === 'xac_nhan' ? '<small class="hh-suyra">lùi về lúc bấm</small>' : ''}</td>
        <td class="hh-so">${l.so_ngay_cho == null ? '—' : l.so_ngay_cho}</td>
        <td class="hh-so">${tien(l.so_tien)}</td>
      </tr>`).join('')}
    </tbody></table></div>

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
      + 'Đợt này sẽ phải đi qua SUP rồi Admin trước khi chốt.',
      { title: `Tạo đợt duyệt cho kỳ ${kyChon}?`, confirmText: 'Tạo đợt' });
    if (!ok) return;
    try {
      const d = await tinhHoaHong(kyChon);
      dotDangMo = d.dot.id; xemTruoc = null;
      showToast(`Đã tạo đợt ${kyChon} với ${d.dot.so_dong} dòng.`);
      await navigateTo('hoa-hong');
    } catch (err) { showToast(err.message, true); }
  });

  document.querySelectorAll('[data-hh-mo]').forEach((b) => b.addEventListener('click', async () => {
    dotDangMo = b.dataset.hhMo;
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
      mo_ta: 'Sau bước này chỉ còn bước chốt và đẩy sang kế toán.' },
    'Admin đã xác nhận.'));

  document.getElementById('hhChot')?.addEventListener('click', () => buoc(
    chotHoaHong,
    { tieu_de: 'Chốt đợt hoa hồng?', nut: 'Chốt',
      mo_ta: 'Chốt rồi thì không sửa được nữa, kể cả một dòng. Kế toán sẽ thấy khoản chi này để hạch toán.' },
    'Đã chốt và đẩy sang kế toán.'));

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
