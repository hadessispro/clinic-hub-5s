/* Hai danh sách vai trò được miễn ràng buộc chi nhánh phải khớp nhau.
 *
 *   src/auth.js              canUseManagedBranch   — frontend, quyết định có
 *                                                    chặn trước khi gửi đi không
 *   apps/backend/src/auth.ts branchFlexible        — backend, quyết định thật
 *
 * Lệch nhau thì hỏng theo cách khó tìm nhất: frontend nói "được miễn" nên
 * không chặn, người dùng bấm đăng nhập, rồi backend lọc theo chi nhánh và từ
 * chối. Không có gì trong giao diện gợi ý rằng ô chi nhánh mới là thứ sai.
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

const fe = layDanhSach('src/auth.js', 'canUseManagedBranch',
  /canUseManagedBranch\s*=\s*\[([^\]]*)\]/);
const be = layDanhSach('apps/backend/src/auth.ts', 'branchFlexible',
  /branchFlexible\s*=\s*new Set\(\[([^\]]*)\]/);

const thieuOBe = [...fe].filter((r) => !be.has(r)).sort();
const thieuOFe = [...be].filter((r) => !fe.has(r)).sort();

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
  console.log(`::error file=src/auth.js::"${r}" được miễn ở backend nhưng KHÔNG có trong `
    + 'canUseManagedBranch. Frontend sẽ chặn trước khi gửi đi, nên phần miễn ở backend vô dụng.');
  loi = 1;
}

if (loi) process.exit(1);
console.log('  Hai danh sách khớp nhau.');
