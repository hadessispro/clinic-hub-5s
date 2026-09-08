/* Hai danh sách vai trò linh hoạt chi nhánh phải khớp nhau.
 *
 *   src/branch.js            isManager             — frontend, quyết định có
 *                                                    được đổi chi nhánh làm việc
 *   apps/backend/src/auth.ts branchFlexible        — backend, quyết định thật
 *
 * PG là ngoại lệ chỉ có ở backend: họ làm tại điểm tạm do Support giao nhưng
 * không được dùng bộ chuyển chi nhánh quản lý trên frontend.
 *
 * Đã xảy ra thật ngày 28/08/2026: backend thiếu admin_marketing,
 * support_marketing và telesale_leader. Tài khoản Admin Marketing chọn đúng
 * chi nhánh thì vào được, chọn sai thì nhận thông báo trông y hệt sai mật
 * khẩu — nên người dùng gõ lại mật khẩu tới khi bị khoá tài khoản.
 *
 * Đây là lần thứ ba trong một ngày một danh sách bị chép đôi rồi lệch:
 * roleLabel ở màn Quản trị thiếu năm vai trò marketing, NAV_ITEMS thiếu mục
 * hoa hồng, và giờ là danh sách này. Hai bản sao của cùng một sự thật thì
 * sớm muộn cũng nói hai chuyện khác nhau — nên máy phải canh thay người.
 */
import { readFileSync } from 'node:fs';

function layDanhSach(duongDan, ten, mau) {
  const nguon = readFileSync(duongDan, 'utf8');
  const khop = nguon.match(mau);
  if (!khop) {
    console.log(`::error file=${duongDan}::Không tìm thấy danh sách ${ten}. `
      + 'Nếu vừa đổi tên biến thì sửa cả scripts/kiem-vai-tro-chi-nhanh.mjs.');
    process.exit(1);
  }
  return new Set([...khop[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

const fe = layDanhSach('src/branch.js', 'isManager',
  /isManager\s*=\s*\[([^\]]*)\]/);
const be = layDanhSach('apps/backend/src/auth.ts', 'branchFlexible',
  /branchFlexible\s*=\s*new Set\(\[([^\]]*)\]/);
const backendOnly = new Set(['pg_staff']);

const thieuOBe = [...fe].filter((r) => !be.has(r)).sort();
const thieuOFe = [...be].filter((r) => !fe.has(r) && !backendOnly.has(r)).sort();

console.log(`  frontend  ${fe.size} vai trò`);
console.log(`  backend   ${be.size} vai trò`);

let loi = 0;

for (const r of thieuOBe) {
  console.log(`::error file=apps/backend/src/auth.ts::"${r}" được miễn ở frontend nhưng KHÔNG `
    + 'có trong branchFlexible. Người dùng vai trò này sẽ bị từ chối khi chọn sai chi nhánh, '
    + 'với thông báo trông như sai mật khẩu.');
  loi = 1;
}

for (const r of thieuOFe) {
  console.log(`::error file=src/branch.js::"${r}" linh hoạt ở backend nhưng KHÔNG có trong `
    + 'isManager và cũng không phải ngoại lệ backend. Bộ chuyển chi nhánh sẽ xử lý sai vai trò này.');
  loi = 1;
}

if (loi) process.exit(1);
console.log('  Hai danh sách khớp nhau.');
