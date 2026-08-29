/* Mọi view được cấp quyền đều phải có mặt trong menu, và mọi vai trò đều
 * phải có nhãn.
 *
 * src/permissions.js giữ HAI danh sách, và chúng phải khớp nhau:
 *
 *   ROLE_VIEWS   vai trò nào được vào view nào
 *   NAV_ITEMS    mục nào hiện ra trên menu, kèm nhãn và biểu tượng
 *
 * getNavForRole lọc NAV_ITEMS theo ROLE_VIEWS. Nên thêm view vào ROLE_VIEWS
 * mà quên thêm vào NAV_ITEMS thì quyền có cho phép cũng KHÔNG hiện ra menu —
 * và không có gì báo. View vẫn vào được nếu gõ thẳng đường dẫn, nên nó không
 * hỏng theo cách dễ thấy; nó chỉ vô hình.
 *
 * Đã xảy ra thật ngày 28/08/2026 với màn Duyệt hoa hồng: cấp quyền cho sáu
 * vai trò, triển khai lên production, và không ai tìm thấy nó ở đâu cả.
 *
 * Danh sách thứ BA: ROLE_PROFILES trong src/constants.js, nơi giữ nhãn tiếng
 * Việt của từng vai trò. Màn Quản trị hệ thống dựng ô chọn vai trò từ đúng
 * danh sách này, nên vai trò có trong ROLE_VIEWS mà thiếu ở đây thì KHÔNG cấp
 * được cho ai từ giao diện, và tài khoản đang mang vai trò đó hiện ra mã trần
 * thay vì tên. Xảy ra ngày 29/08/2026 với vai trò le_tan.
 */
import { readFileSync } from 'node:fs';

const nguon = readFileSync('src/permissions.js', 'utf8');

const catLay = (tu, den) => nguon.slice(nguon.indexOf(tu), den ? nguon.indexOf(den) : undefined);

// NAV_ITEMS: mỗi mục viết dạng { view: 'ten-view', label: …, icon: … }
const trongMenu = new Set(
  [...catLay('const NAV_ITEMS').matchAll(/\{\s*view:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]),
);

// ROLE_VIEWS: mỗi vai trò là một mảng chuỗi tên view.
const khoiQuyen = catLay('const ROLE_VIEWS', 'const NAV_ITEMS');
const duocCap = new Map();
for (const dong of khoiQuyen.matchAll(/^\s{2}([a-z_]+):\s*\[([^\]]*)\]/gm)) {
  const [, vaiTro, ds] = dong;
  for (const v of ds.matchAll(/'([a-z0-9-]+)'/g)) {
    if (!duocCap.has(v[1])) duocCap.set(v[1], []);
    duocCap.get(v[1]).push(vaiTro);
  }
}

// ROLE_PROFILES: nhãn tiếng Việt của từng vai trò, dùng để dựng ô chọn vai trò.
const hangSo = readFileSync('src/constants.js', 'utf8');
const khoiNhan = hangSo.slice(hangSo.indexOf('export const ROLE_PROFILES'),
  hangSo.indexOf('export const VIEW_TITLES'));
const coNhan = new Set([...khoiNhan.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)].map((m) => m[1]));
const moiVaiTro = new Set([...khoiQuyen.matchAll(/^\s{2}([a-z_]+):\s*\[/gm)].map((m) => m[1]));
const thieuNhan = [...moiVaiTro].filter((r) => !coNhan.has(r)).sort();

const thieu = [...duocCap.keys()].filter((v) => !trongMenu.has(v)).sort();
const thua = [...trongMenu].filter((v) => !duocCap.has(v)).sort();

console.log(`  NAV_ITEMS  ${trongMenu.size} mục`);
console.log(`  ROLE_VIEWS ${duocCap.size} view được cấp quyền`);
console.log(`  ROLE_PROFILES ${coNhan.size} vai trò có nhãn`);

let loi = 0;

for (const v of thieu) {
  console.log(`::error file=src/permissions.js::"${v}" được cấp quyền cho `
    + `${duocCap.get(v).join(', ')} nhưng KHÔNG có trong NAV_ITEMS, nên không hiện ra menu.`);
  loi = 1;
}

for (const r of thieuNhan) {
  console.log(`::error file=src/constants.js::vai trò "${r}" có trong ROLE_VIEWS nhưng `
    + 'KHÔNG có trong ROLE_PROFILES, nên màn Quản trị hệ thống không cấp được vai trò này '
    + 'và tài khoản mang nó sẽ hiện ra mã trần thay vì tên.');
  loi = 1;
}

// Mục có trên menu mà không vai trò nào được vào là mục chết: nó hiện ra rồi
// người ta bấm vào và bị chặn. Cảnh báo thôi, không chặn, vì có thể đang làm dở.
for (const v of thua) {
  console.log(`::warning file=src/permissions.js::"${v}" có trên menu nhưng không vai trò nào được cấp quyền.`);
}

if (loi) process.exit(1);
console.log('  Ba danh sách khớp nhau.');
