/* Ghi đè phân quyền · lớp dữ liệu.
 *
 * VÌ SAO CÓ FILE NÀY: bảng "vai trò nào thấy màn nào" nằm trong mã nguồn
 * (src/permissions.js). Đổi quyền một vai trò vì thế phải sửa code rồi triển
 * khai lại — nghĩa là mỗi lần thêm người vào một màn đều cần lập trình viên,
 * và trong lúc chờ thì không ai làm được việc. Đó là lý do vẫn phải vào VPS
 * chạy SQL để cấp quyền.
 *
 * Nay: mã nguồn giữ MẶC ĐỊNH, cơ sở dữ liệu giữ PHẦN CHÊNH. Admin IT bật tắt
 * trên giao diện, hệ thống lưu đúng những gì khác mặc định.
 *
 * LƯU PHẦN CHÊNH chứ không lưu cả danh sách. Nếu lưu cả danh sách thì mai này
 * thêm một màn mới vào mã nguồn, mọi vai trò đã từng chỉnh tay sẽ KHÔNG nhận
 * được màn đó — danh sách trong cơ sở dữ liệu đã đóng băng từ lúc bấm lưu.
 * Lưu phần chênh thì mặc định mới vẫn chảy xuống, chỉ những gì người ta cố ý
 * bật hoặc tắt mới giữ nguyên ý muốn của họ.
 *
 * Không cần migration: dùng chung bảng app.records như mọi thực thể khác,
 * với entity_type riêng.
 */

import { supabase } from '../supabase.js';
import {
  BANG_VAI_TRO, MOI_VIEW, VIEW_BAT_BUOC, viewsMacDinh,
} from '../permissions.js';

const BANG = 'phan_quyen';

/* Vai trò không cho chỉnh từ giao diện.
 *
 * Đây là ba vai trò có thể tự cấp lại quyền cho chính mình. Cho sửa chúng
 * bằng giao diện nghĩa là một tài khoản admin_it bị chiếm có thể tự nâng
 * thành toàn quyền mà không để lại dấu ở tầng nào cả. Muốn đổi thì vẫn phải
 * qua cơ sở dữ liệu, nơi có người thứ hai nhìn thấy. */
export const VAI_TRO_KHOA = ['admin', 'admin_it', 'superadmin'];

const khoaVaiTro = (vaiTro) => `vai-tro:${vaiTro}`;
const khoaNhanSu = (ma) => `nhan-su:${String(ma).toLowerCase()}`;

const rong = () => ({ bat: [], tat: [] });

/** Đọc toàn bộ ghi đè. Hỏng thì trả rỗng — mất ghi đè còn hơn khoá cả app. */
export async function layGhiDe() {
  try {
    const { data, error } = await supabase.from(BANG).select('*');
    if (error) throw error;
    const vaiTro = {}; const nhanSu = {};
    (data || []).forEach((r) => {
      const p = r.payload || r;
      if (!p?.loai || !p?.khoa) return;
      const muc = { bat: p.bat || [], tat: p.tat || [], sua_luc: p.sua_luc, sua_boi: p.sua_boi };
      if (p.loai === 'vai_tro') vaiTro[p.khoa] = muc;
      else if (p.loai === 'nhan_su') nhanSu[String(p.khoa).toLowerCase()] = muc;
    });
    return { vaiTro, nhanSu };
  } catch (err) {
    console.error('[Phân quyền] không đọc được ghi đè:', err);
    return { vaiTro: {}, nhanSu: {} };
  }
}

/* Tính phần chênh so với mặc định từ danh sách người dùng vừa tick.
 *
 * Người dùng tick vào một lưới checkbox; thứ cần lưu là hiệu số. View nào có
 * trong lưới mà không có trong mặc định thì vào `bat`; view nào ở mặc định mà
 * bị bỏ tick thì vào `tat`. Trùng với mặc định thì không lưu gì cả — nhờ vậy
 * bỏ hết chỉnh tay là quay về đúng hành vi của mã nguồn.
 */
export function tinhChenh(macDinh, dangChon) {
  const md = new Set(macDinh);
  const ch = new Set(dangChon);
  return {
    bat: [...ch].filter((v) => !md.has(v)).sort(),
    tat: [...md].filter((v) => !ch.has(v)).sort(),
  };
}

function kiemTra(dangChon, nhan) {
  const ds = [...new Set(dangChon)].filter((v) => MOI_VIEW.includes(v));
  if (!ds.length) {
    throw new Error(`${nhan}: phải còn ít nhất một màn hình. Không có màn nào thì `
      + 'người đó đăng nhập vào một trang trắng.');
  }
  const thieu = VIEW_BAT_BUOC.filter((v) => !ds.includes(v));
  if (thieu.length) {
    throw new Error(`${nhan}: không bỏ được màn bắt buộc (${thieu.join(', ')}). `
      + 'Đây là màn hệ thống đưa người dùng tới sau khi đăng nhập.');
  }
  return ds;
}

/** Lưu ghi đè cho MỘT vai trò. `dangChon` là danh sách view sau khi tick. */
export async function luuGhiDeVaiTro(vaiTro, dangChon, boi) {
  if (!BANG_VAI_TRO[vaiTro]) throw new Error('Vai trò không hợp lệ.');
  if (VAI_TRO_KHOA.includes(vaiTro)) {
    throw new Error(`Vai trò ${vaiTro} không chỉnh được từ giao diện — đây là vai trò `
      + 'có thể tự cấp lại quyền cho chính mình.');
  }
  const ds = kiemTra(dangChon, `Vai trò ${vaiTro}`);
  const chenh = tinhChenh(viewsMacDinh(vaiTro), ds);
  const ban = {
    id: khoaVaiTro(vaiTro), loai: 'vai_tro', khoa: vaiTro,
    ...chenh, sua_boi: boi, sua_luc: new Date().toISOString(),
  };
  const { error } = await supabase.from(BANG).upsert(ban, { onConflict: 'id' });
  if (error) throw new Error(`Không lưu được: ${error.message}`);
  return { ...chenh, khong_con_chenh: !chenh.bat.length && !chenh.tat.length };
}

/* Lưu ghi đè cho MỘT tài khoản — bật tắt màn riêng cho một người, không đụng
 * tới những người cùng vai trò. */
export async function luuGhiDeNhanSu(maNhanSu, vaiTro, dangChon, boi, maCuaToi) {
  if (!maNhanSu) throw new Error('Thiếu mã nhân sự.');
  if (String(maNhanSu).toLowerCase() === String(maCuaToi || '').toLowerCase()) {
    throw new Error('Không tự chỉnh quyền của chính mình. Nhờ một quản trị viên khác '
      + 'làm giúp — đây là chốt chặn để không ai tự khoá mình ra khỏi hệ thống.');
  }
  const ds = kiemTra(dangChon, `Tài khoản ${maNhanSu}`);
  const chenh = tinhChenh(viewsMacDinh(vaiTro), ds);
  const ban = {
    id: khoaNhanSu(maNhanSu), loai: 'nhan_su', khoa: String(maNhanSu),
    vai_tro_luc_luu: vaiTro,
    ...chenh, sua_boi: boi, sua_luc: new Date().toISOString(),
  };
  const { error } = await supabase.from(BANG).upsert(ban, { onConflict: 'id' });
  if (error) throw new Error(`Không lưu được: ${error.message}`);
  return { ...chenh, khong_con_chenh: !chenh.bat.length && !chenh.tat.length };
}

/** Bỏ mọi chỉnh tay, trả về đúng mặc định của mã nguồn. */
export async function xoaGhiDe(loai, khoa) {
  const id = loai === 'vai_tro' ? khoaVaiTro(khoa) : khoaNhanSu(khoa);
  const { error } = await supabase.from(BANG).delete().eq('id', id);
  if (error) throw new Error(`Không xoá được: ${error.message}`);
}
