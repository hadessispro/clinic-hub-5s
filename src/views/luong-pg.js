/* Lương PG · SUP quản lý và đối chiếu.
 *
 * Lương = tổng giờ làm THỰC TẾ × đơn giá theo loại điểm làm việc. Giờ thực tế
 * lấy từ khoảng cách giữa lúc chấm vào và lúc chấm ra.
 *
 * "Đối chiếu" ở đây có nghĩa cụ thể: mỗi dòng bày ra cả ba con số — giờ theo
 * ca phân công, giờ thực tế, giờ được tính lương — để SUP thấy chúng lệch
 * nhau chỗ nào. Chỉ đưa con số cuối thì không ai đối chiếu được gì.
 *
 * Lương SUP KHÔNG nằm ở màn này. Phần đó đi theo cách khác.
 */
import { store } from '../store.js';
import { escapeHTML, formatCurrency, formatDateTime, oNguoiPhuTrach } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { navigateTo } from '../router.js';
import {
  chotPgLuong, getPgLuongBieuGia, getPgLuongChiTiet, getPgLuongDanhSach,
  getPgLuongXemTruoc, tinhPgLuong, tuChoiPgLuong, xuatPgLuongCsv,
} from '../services/marketing.js';

let dsDot = []; let bieuGia = { bieu_gia: [], ca_chuan: [] };
let chiTiet = null; let xemTruoc = null; let dotDangMo = ''; let kyChon = '';
let fNguoi = ''; let fKetQua = ''; let fLoaiDiem = ''; let fTim = '';

const NHAN = {
  cho_sup: { chu: 'Chờ SUP chốt', lop: 'warn' },
  da_chot: { chu: 'Đã chốt', lop: 'good' },
  tu_choi: { chu: 'Đã từ chối', lop: 'bad' },
};
const nhanTT = (tt) => {
  const n = NHAN[tt] || { chu: tt || '—', lop: '' };
  return `<span class="status-pill ${n.lop}">${escapeHTML(n.chu)}</span>`;
};
const tien = (v) => formatCurrency(Number(v || 0));
const so = (v) => (v == null ? '—' : Number(v).toFixed(2));
const ngay = (v) => (v ? new Date(v).toLocaleDateString('vi-VN') : '—');
const gio = (v) => (v ? new Date(v).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—');
const hhmm = (v) => (v ? String(v).slice(0, 5) : '—');
const opt = (v, t, chon) => `<option value="${escapeHTML(v)}"${chon === v ? ' selected' : ''}>${escapeHTML(t)}</option>`;
const the = (nhan, giaTri, phu) => `<article class="metric-card">
  <p class="metric-label">${escapeHTML(nhan)}</p>
  <p class="metric-value">${escapeHTML(String(giaTri))}</p>
  <p class="metric-detail">${escapeHTML(phu || '')}</p></article>`;

const kyMacDinh = () => new Date().toISOString().slice(0, 7);

// Cùng lý do với màn hoa hồng: ô month gốc hiển thị theo ngôn ngữ trình duyệt
// chứ không theo lang của trang, nên Chrome tiếng Anh ra "August 2026".
function danhSachKy(dangChon) {
  const nay = new Date();
  const ds = [];
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(nay.getFullYear(), nay.getMonth() - i, 1);
    const ma = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ds.push(opt(ma, `Tháng ${d.getMonth() + 1} · ${d.getFullYear()}`, dangChon));
  }
  if (dangChon && !ds.some((o) => o.includes(`value="${dangChon}"`))) {
    const [nam, thang] = dangChon.split('-');
    ds.unshift(opt(dangChon, `Tháng ${Number(thang)} · ${nam}`, dangChon));
  }
  return ds.join('');
}

function vaiTro() {
  const role = store.getState().profile?.role;
  const laAdmin = ['admin', 'admin_it', 'superadmin', 'admin_marketing'].includes(role);
  const laSup = role === 'support_marketing';
  return { duocQuanLy: laAdmin || laSup, duocXem: laAdmin || laSup || role === 'telesale_leader' };
}

export async function renderView() {
  const { duocQuanLy, duocXem } = vaiTro();
  if (!duocXem) {
    return `<div class="view-stack"><section class="panel"><h3>Không có quyền</h3>
      <p>Phân hệ lương PG dành cho Support Marketing và Admin.</p></section></div>`;
  }
  kyChon ||= kyMacDinh();
  [dsDot, bieuGia] = await Promise.all([getPgLuongDanhSach(), getPgLuongBieuGia()]);
  chiTiet = dotDangMo ? await getPgLuongChiTiet(dotDangMo).catch(() => null) : null;

  return `<div class="view-stack">
    ${duocQuanLy ? khoiTinh() : ''}
    ${khoiDanhSach()}
    ${chiTiet ? khoiChiTiet(duocQuanLy) : ''}
    ${khoiBieuGia()}
  </div>`;
}

function khoiTinh() {
  const m = xemTruoc?.meta;
  return `<section class="panel">
    <div class="section-title"><h3>Tính lương PG theo kỳ</h3>
      <span class="pill">Giờ thực tế × đơn giá theo loại điểm</span></div>
    <form id="plKy" class="hh-hang">
      <label><span>Kỳ tính</span><select name="ky">${danhSachKy(kyChon)}</select></label>
      <button type="submit" class="secondary-button"><i class="ri-search-eye-line"></i> Xem trước</button>
      <button type="button" id="plTinh" class="primary-button"
        ${xemTruoc && m?.du_dieu_kien ? '' : 'disabled'}><i class="ri-add-circle-line"></i> Tạo đợt lương</button>
      <p class="hh-ghi">${xemTruoc
        ? `Kỳ ${escapeHTML(m.ky_code)}: ${m.du_dieu_kien} ca đủ điều kiện, ${m.bi_loai} ca bị loại.`
        : 'Xem trước trước đã. Nó không ghi gì, chỉ cho thấy đợt sắp tạo gồm những ca nào và loại những ca nào.'}</p>
    </form>
    ${!xemTruoc ? '' : `
      <div class="grid cols-4">
        ${the('Ca được trả', m.du_dieu_kien, `${m.so_nguoi} nhân viên PG`)}
        ${the('Ca bị loại', m.bi_loai, 'vẫn ghi vào đợt, tiền bằng 0')}
        ${the('Tổng giờ', so(m.tong_gio), 'giờ làm thực tế')}
        ${the('Tổng lương', tien(m.tong_tien), 'chưa gồm phần của SUP')}
      </div>
      ${khoiCanhBao(m)}
      ${bangCa(xemTruoc.data || [], true)}`}
  </section>`;
}

function khoiCanhBao(m) {
  const c = [];
  if (m.thieu_loai_diem) c.push(`${m.thieu_loai_diem} ca ở điểm chưa gán loại nên không có đơn giá. Vào Địa điểm PG gán loại trước.`);
  if (m.thieu_cham_cong) c.push(`${m.thieu_cham_cong} ca thiếu chấm vào hoặc chấm ra nên không tính được giờ.`);
  if (m.co_canh_bao) c.push(`${m.co_canh_bao} ca có giờ lệch nhiều so với ca phân công. Vẫn tính, nhưng nên xem lại.`);
  if (!c.length) return '';
  return `<div class="hh-canhbao"><strong>Cần xem kỹ trước khi chốt</strong>
    <ul>${c.map((x) => `<li>${escapeHTML(x)}</li>`).join('')}</ul></div>`;
}

/* Một bảng cho cả ca được trả lẫn ca bị loại.
 *
 * Ba cột giờ đứng cạnh nhau — theo ca, thực tế, tính lương — vì đó chính là
 * phép đối chiếu. Chỉ đưa cột cuối thì con số không giải thích được.
 */
function bangCa(ds, laXemTruoc) {
  if (!ds.length) return '<p class="hh-ghi">Không có ca nào khớp.</p>';
  const duocTra = (x) => (laXemTruoc ? x.du_dieu_kien : x.tinh_tien);
  return `<div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
    <th>Nhân viên PG</th><th>Ngày</th><th>Điểm · loại</th><th>Ca phân công</th>
    <th>Vào</th><th>Ra</th><th class="hh-so">Theo ca</th><th class="hh-so">Thực tế</th>
    <th class="hh-so">Tính lương</th><th class="hh-so">Thành tiền</th><th>Ghi chú</th>
  </tr></thead><tbody>
    ${ds.map((x) => `<tr class="${duocTra(x) ? '' : 'hh-loai'}">
      <td>${oNguoiPhuTrach(x.pg_ten, x.pg_ma)}</td>
      <td>${ngay(x.ngay)}</td>
      <td>${escapeHTML(x.diem_ten || '')}<small>${escapeHTML(x.loai_diem || 'chưa gán loại')}</small></td>
      <td>${hhmm(x.ca_bat_dau)}–${hhmm(x.ca_ket_thuc)}</td>
      <td>${gio(x.vao_luc)}</td>
      <td>${gio(x.ra_luc)}</td>
      <td class="hh-so">${so(x.gio_phan_cong)}</td>
      <td class="hh-so">${so(x.gio_thuc_te)}</td>
      <td class="hh-so"><strong>${so(x.gio_tinh_luong)}</strong></td>
      <td class="hh-so">${duocTra(x) ? `<strong>${tien(x.so_tien)}</strong>` : '0 ₫'}</td>
      <td>${!duocTra(x) ? `<span class="hh-lydo">${escapeHTML(x.ly_do_loai || '')}</span>`
        : (x.canh_bao ? `<span class="hh-suyra">${escapeHTML(x.canh_bao)}</span>` : '')}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function khoiDanhSach() {
  return `<section class="panel">
    <div class="section-title"><h3>Các đợt lương</h3><span class="pill">${dsDot.length} đợt</span></div>
    ${!dsDot.length ? '<p class="hh-ghi">Chưa có đợt nào.</p>' : `
    <div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
      <th>Kỳ</th><th>Trạng thái</th><th class="hh-so">Ca trả</th><th class="hh-so">Người</th>
      <th class="hh-so">Tổng giờ</th><th class="hh-so">Tổng lương</th><th></th>
    </tr></thead><tbody>
      ${dsDot.map((d) => `<tr>
        <td><strong>${escapeHTML(d.ky_code)}</strong><small>${ngay(d.ky_tu)} – ${ngay(d.ky_den)}</small></td>
        <td>${nhanTT(d.trang_thai)}</td>
        <td class="hh-so">${d.so_ca}</td>
        <td class="hh-so">${d.so_nguoi}</td>
        <td class="hh-so">${so(d.tong_gio)}</td>
        <td class="hh-so"><strong>${tien(d.tong_tien)}</strong></td>
        <td><button type="button" class="secondary-button" data-pl-mo="${escapeHTML(d.id)}">
          ${dotDangMo === d.id ? 'Đang xem' : 'Mở'}</button></td>
      </tr>`).join('')}
    </tbody></table></div>`}
  </section>`;
}

function locDong(dong) {
  const tim = fTim.trim().toLocaleLowerCase('vi');
  return dong.filter((l) => {
    if (fNguoi && l.pg_ma !== fNguoi) return false;
    if (fLoaiDiem && l.loai_diem !== fLoaiDiem) return false;
    if (fKetQua === 'tra' && !l.tinh_tien) return false;
    if (fKetQua === 'loai' && l.tinh_tien) return false;
    if (tim && !`${l.pg_ten || ''} ${l.pg_ma || ''} ${l.diem_ten || ''}`
      .toLocaleLowerCase('vi').includes(tim)) return false;
    return true;
  });
}

function khoiChiTiet(duocQuanLy) {
  const { dot, gop, dong, nhat_ky: nk } = chiTiet;
  const tt = dot.trang_thai;
  const daLoc = locDong(dong);
  const nguoiCo = [...new Map(dong.map((l) => [l.pg_ma, l])).values()];
  const soLoai = dong.filter((l) => !l.tinh_tien).length;

  return `<section class="panel">
    <div class="section-title"><h3>Đợt ${escapeHTML(dot.ky_code)}</h3>${nhanTT(tt)}</div>

    <div class="grid cols-4">
      ${the('Ca được trả', dot.so_ca, `${soLoai} ca bị loại`)}
      ${the('Nhân viên PG', dot.so_nguoi, 'không gồm SUP')}
      ${the('Tổng giờ', so(dot.tong_gio), 'giờ làm thực tế')}
      ${the('Tổng lương', tien(dot.tong_tien), 'phải chi')}
    </div>

    <p class="hh-ghi">Định khoản đề xuất: <strong>Nợ ${escapeHTML(dot.tk_no)} / Có ${escapeHTML(dot.tk_co)}</strong>
      · khoản mục ${escapeHTML(dot.khoan_muc)}. Kế toán thấy khoản này trong két để đối chiếu, nhưng không phải một cửa duyệt.
      Lương của SUP không nằm trong đợt này.</p>

    <div class="hh-nut">
      ${tt === 'cho_sup' && duocQuanLy ? '<button type="button" id="plChot" class="primary-button"><i class="ri-lock-line"></i> Chốt đợt lương</button>' : ''}
      ${tt !== 'tu_choi' && duocQuanLy ? '<button type="button" id="plTuChoi" class="danger-button"><i class="ri-close-line"></i> Từ chối</button>' : ''}
      <button type="button" id="plXuat" class="secondary-button"><i class="ri-file-excel-2-line"></i> Xuất báo cáo đối chiếu</button>
    </div>

    <h4>Tổng hợp theo người</h4>
    <div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
      <th>Nhân viên PG</th><th>Loại điểm</th><th class="hh-so">Số ca</th>
      <th class="hh-so">Tổng giờ</th><th class="hh-so">Thành tiền</th>
    </tr></thead><tbody>
      ${gop.map((g) => `<tr>
        <td>${oNguoiPhuTrach(g.pg_ten, g.pg_ma)}</td>
        <td>${escapeHTML(g.loai_diem || '')}</td>
        <td class="hh-so">${g.so_ca}</td>
        <td class="hh-so">${so(g.tong_gio)}</td>
        <td class="hh-so"><strong>${tien(g.so_tien)}</strong></td>
      </tr>`).join('')}
    </tbody></table></div>

    <h4>Chi tiết từng ca</h4>
    <form id="plLoc" class="hh-loc">
      <label><span>Tìm người hoặc điểm</span><input type="search" name="tim" value="${escapeHTML(fTim)}" placeholder="Tên PG, mã, hoặc tên điểm"></label>
      <label><span>Nhân viên PG</span><select name="nguoi">${opt('', 'Tất cả', fNguoi)}${nguoiCo.map((l) => opt(l.pg_ma, l.pg_ten || l.pg_ma, fNguoi)).join('')}</select></label>
      <label><span>Loại điểm</span><select name="loaiDiem">${opt('', 'Tất cả loại', fLoaiDiem)}${bieuGia.bieu_gia.map((g) => opt(g.ma, g.ten, fLoaiDiem)).join('')}</select></label>
      <label><span>Kết quả</span><select name="ketQua">${opt('', 'Được trả và bị loại', fKetQua)}${opt('tra', 'Chỉ ca được trả', fKetQua)}${opt('loai', 'Chỉ ca bị loại', fKetQua)}</select></label>
      <button type="submit" class="secondary-button"><i class="ri-filter-3-line"></i> Lọc</button>
      <p class="hh-ghi">Hiện ${daLoc.length} trên ${dong.length} ca.
        ${daLoc.length !== dong.length ? ' <button type="button" id="plXoaLoc" class="secondary-button">Xóa lọc</button>' : ''}</p>
    </form>
    ${bangCa(daLoc, false)}

    <h4>Nhật ký</h4>
    <ul class="hh-nhatky">
      ${nk.map((k) => `<li><strong>${escapeHTML(NHAN[k.den_trang_thai]?.chu || k.den_trang_thai)}</strong>
        · ${escapeHTML(k.boi)} · ${escapeHTML(formatDateTime(k.created_at))}
        ${k.ghi_chu ? `<small>${escapeHTML(k.ghi_chu)}</small>` : ''}</li>`).join('')}
    </ul>
  </section>`;
}

function khoiBieuGia() {
  return `<section class="panel">
    <div class="section-title"><h3>Đơn giá và ca chuẩn</h3>
      <span class="pill">Sửa trong bảng, không sửa trong mã</span></div>
    <div class="hh-bang-wrap"><table class="hh-bang"><thead><tr>
      <th>Loại điểm</th><th class="hh-so">Đơn giá mỗi giờ</th><th class="hh-so">Ca chuẩn</th>
      <th class="hh-so">Thành tiền một ca</th><th>Cách tính giờ</th><th class="hh-so">Trần cảnh báo</th>
    </tr></thead><tbody>
      ${bieuGia.bieu_gia.map((g) => `<tr>
        <td><strong>${escapeHTML(g.ten)}</strong><small>${escapeHTML(g.ghi_chu || '')}</small></td>
        <td class="hh-so">${tien(g.don_gia_gio)}</td>
        <td class="hh-so">${so(g.so_gio_chuan)} giờ</td>
        <td class="hh-so"><strong>${tien(Number(g.don_gia_gio) * Number(g.so_gio_chuan))}</strong></td>
        <td>${g.cach_tinh === 'thuc_te' ? 'Giờ thực tế vào–ra'
          : g.cach_tinh === 'giao_nhau' ? 'Chỉ phần nằm trong ca' : 'Trọn ca'}</td>
        <td class="hh-so">${g.gio_toi_da ? `${so(g.gio_toi_da)} giờ` : '—'}</td>
      </tr>`).join('')}
    </tbody></table></div>

    ${!bieuGia.ca_chuan.length ? '' : `<h4>Ca chuẩn</h4>
    <div class="pill-row">${bieuGia.ca_chuan.map((c) => `<span class="pill">${escapeHTML(c.ten)} · ${hhmm(c.gio_bat_dau)}–${hhmm(c.gio_ket_thuc)}</span>`).join('')}</div>`}
  </section>`;
}

export function initView() {
  document.getElementById('plKy')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    kyChon = new FormData(e.currentTarget).get('ky');
    try { xemTruoc = await getPgLuongXemTruoc(kyChon); await navigateTo('luong-pg'); }
    catch (err) { showToast(err.message, true); }
  });

  document.getElementById('plTinh')?.addEventListener('click', async () => {
    const m = xemTruoc?.meta;
    const ok = await confirmAction(
      `${m.du_dieu_kien} ca đủ điều kiện cho ${m.so_nguoi} nhân viên PG, tổng ${tien(m.tong_tien)}. `
      + `${m.bi_loai} ca bị loại vẫn được ghi vào đợt với số tiền bằng 0 để đối chiếu.`,
      { title: `Tạo đợt lương cho kỳ ${kyChon}?`, confirmText: 'Tạo đợt' });
    if (!ok) return;
    try {
      const d = await tinhPgLuong(kyChon);
      dotDangMo = d.dot.id; xemTruoc = null;
      showToast(`Đã tạo đợt lương ${kyChon} với ${d.dot.so_ca} ca.`);
      await navigateTo('luong-pg');
    } catch (err) { showToast(err.message, true); }
  });

  document.querySelectorAll('[data-pl-mo]').forEach((b) => b.addEventListener('click', async () => {
    dotDangMo = b.dataset.plMo;
    fTim = ''; fNguoi = ''; fLoaiDiem = ''; fKetQua = '';
    await navigateTo('luong-pg');
  }));

  document.getElementById('plLoc')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    fTim = f.get('tim') || ''; fNguoi = f.get('nguoi') || '';
    fLoaiDiem = f.get('loaiDiem') || ''; fKetQua = f.get('ketQua') || '';
    await navigateTo('luong-pg');
  });

  document.getElementById('plXoaLoc')?.addEventListener('click', async () => {
    fTim = ''; fNguoi = ''; fLoaiDiem = ''; fKetQua = '';
    await navigateTo('luong-pg');
  });

  document.getElementById('plChot')?.addEventListener('click', async () => {
    const ok = await confirmAction(
      'Chốt rồi thì không sửa được nữa, kể cả một ca. Kế toán sẽ thấy khoản chi này trong két để đối chiếu.',
      { title: 'Chốt đợt lương?', confirmText: 'Chốt' });
    if (!ok) return;
    try {
      await chotPgLuong(dotDangMo);
      showToast('Đã chốt. Kế toán thấy khoản chi này trong két.');
      await navigateTo('luong-pg');
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('plTuChoi')?.addEventListener('click', async () => {
    const lyDo = await requestInput('Các ca trong đợt sẽ được trả lại để tính ở đợt sau.',
      { title: 'Từ chối đợt lương', label: 'Lý do từ chối', placeholder: 'Ít nhất 5 ký tự',
        confirmText: 'Từ chối', tone: 'danger' });
    if (!lyDo) return;
    try {
      await tuChoiPgLuong(dotDangMo, lyDo);
      showToast('Đã từ chối. Các ca được trả lại để tính ở đợt sau.');
      await navigateTo('luong-pg');
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('plXuat')?.addEventListener('click', async () => {
    try {
      const n = await xuatPgLuongCsv(dotDangMo);
      showToast(`Đã xuất ${n} ca để đối chiếu.`);
    } catch (err) { showToast(err.message, true); }
  });
}
