import { readFile } from 'node:fs/promises';

import { BM03_TEMPLATE_BASE64 } from '../src/services/bm03-template-base64.js';
import { BM03_STANDARD_ITEMS } from '../src/services/bm03-standard-items.js';
import {
  capNhatPhieuDeXuat,
  layDanhSachDeXuat,
  taoDonHangTuPhieu,
} from '../src/services/kho-hang.js';

const failures = [];
const requiredItemFields = ['stt', 'ten', 'don_vi', 'so_luong', 'nganh_hang', 'thoi_gian_can', 'muc_dich'];

if (BM03_STANDARD_ITEMS.length !== 51) {
  failures.push(`Danh mục BM03 phải có đúng 51 mặt hàng, hiện có ${BM03_STANDARD_ITEMS.length}.`);
}

const invalidItem = BM03_STANDARD_ITEMS.find((item) => (
  !Number.isInteger(item.stt) || item.stt < 1
  || requiredItemFields.some((field) => item[field] === undefined || item[field] === '')
));
if (invalidItem) failures.push(`Mặt hàng BM03 số ${invalidItem.stt || '?'} thiếu trường bắt buộc hoặc có STT không hợp lệ.`);

const embeddedTemplate = Buffer.from(BM03_TEMPLATE_BASE64, 'base64');
const publicTemplate = await readFile('public/templates/mau_de_xuat_mua_hang_bm03.xlsx');
if (embeddedTemplate.subarray(0, 2).toString() !== 'PK') {
  failures.push('Mẫu Excel BM03 nhúng không phải tệp XLSX hợp lệ.');
}
if (!embeddedTemplate.equals(publicTemplate)) {
  failures.push('Mẫu Excel nhúng và tệp dự phòng trong public/templates không đồng nhất.');
}

const proposals = await layDanhSachDeXuat();
const defaultProposal = proposals.find((proposal) => proposal.ma_code === '5S_QĐ_KT_01/BM03');
if (!defaultProposal || defaultProposal.dong?.length !== 51) {
  failures.push('Phiếu BM03 mặc định phải được nạp đủ 51 mặt hàng.');
} else {
  const rows = defaultProposal.dong.slice(0, 2).map((row, index) => ({
    ...row,
    so_luong: index + 1,
    don_gia: (index + 1) * 1000,
    ncc_id: index === 0 ? 'NCC-01' : 'NCC-02',
  }));
  await capNhatPhieuDeXuat(defaultProposal.id, { dong: rows });
  const purchaseOrders = await taoDonHangTuPhieu(defaultProposal.id, 'CI-BM03');
  if (purchaseOrders.so_don_tao !== 2 || purchaseOrders.phieu.trang_thai !== 'da_tao_don') {
    failures.push('Luồng BM03 không tách đúng đơn đặt hàng theo từng nhà cung cấp.');
  }
}

const [view, css] = await Promise.all([
  readFile('src/views/kho-hang.js', 'utf8'),
  readFile('app.css', 'utf8'),
]);
for (const marker of ['btnNapMauBM03', 'btnXuatExcelBM03', 'btnTaoDonTuPhieu', 'btnLuuPhieuDeXuat']) {
  if (!view.includes(marker)) failures.push(`Giao diện Kho thiếu chức năng ${marker}.`);
}
if (!css.includes('.bm03-workspace') || !css.includes('.bm03-paper')) {
  failures.push('Thiếu lớp giao diện chính của biểu mẫu BM03.');
}

if (failures.length) {
  for (const failure of failures) console.error(`LOI · ${failure}`);
  process.exit(1);
}

console.log('OK · BM03 có đủ 51 mặt hàng, mẫu Excel đồng nhất và tách đúng đơn theo nhà cung cấp.');
