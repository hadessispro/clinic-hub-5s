import { readFile } from 'node:fs/promises';

import { BM03_TEMPLATE_BASE64 } from '../src/services/bm03-template-base64.js';
import {
  capNhatPhieuDeXuat,
  layDanhSachDeXuat,
  taoDonHangTuPhieu,
  taoPhieuDeXuat,
  goiYHangThieu,
} from '../src/services/kho-hang.js';

const failures = [];

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
if (!defaultProposal) {
  failures.push('Hệ thống phải có phiếu đề xuất chuẩn mẫu 5S_QĐ_KT_01/BM03.');
} else {
  // Kiểm tra khởi tạo phiếu mới theo chuẩn biểu mẫu BM03
  const pMoi = await taoPhieuDeXuat({
    chi_nhanh: 'le-van-tho',
    bo_phan: 'Kho vật tư & Khối lâm sàng',
    nguoi_tao: 'Thủ kho Kiểm Thử',
  }, 'TEST_USER');

  if (!pMoi || pMoi.ma_code !== '5S_QĐ_KT_01/BM03') {
    failures.push('Phiếu mới tạo không đúng mã hiệu chuẩn 5S_QĐ_KT_01/BM03.');
  }

  // Thêm các mặt hàng vào phiếu và kiểm tra luồng tách đơn PO theo nhà cung cấp
  const testRows = [
    { id: 'T1', stt: 1, ten: 'Khăn choàng y tế', don_vi: 'Gói', so_luong: 5, don_gia: 25000, thanh_tien: 125000, ncc_id: 'NCC-01' },
    { id: 'T2', stt: 2, ten: 'Găng tay cao su', don_vi: 'Hộp', so_luong: 10, don_gia: 85000, thanh_tien: 850000, ncc_id: 'NCC-02' },
  ];
  await capNhatPhieuDeXuat(pMoi.id, { dong: testRows });
  const purchaseOrders = await taoDonHangTuPhieu(pMoi.id, 'CI-BM03');
  if (purchaseOrders.so_don_tao !== 2 || purchaseOrders.phieu.trang_thai !== 'da_tao_don') {
    failures.push('Luồng BM03 không tách đúng đơn đặt hàng theo từng nhà cung cấp.');
  }
}

// Kiểm tra hàm gợi ý hàng thiếu hoạt động
const dsThieu = await goiYHangThieu({ chiNhanh: 'le-van-tho' });
if (!Array.isArray(dsThieu)) {
  failures.push('Hàm gợi ý hàng thiếu phải trả về mảng danh sách.');
}

const [view, css] = await Promise.all([
  readFile('src/views/kho-hang.js', 'utf8'),
  readFile('app.css', 'utf8'),
]);

for (const marker of ['btnMoGoiYHangThieu', 'btnThemDongMoi', 'btnXuatExcelBM03', 'btnTaoDonTuPhieu', 'btnLuuPhieuDeXuat']) {
  if (!view.includes(marker)) failures.push(`Giao diện Kho thiếu chức năng ${marker}.`);
}
if (!css.includes('.bm03-workspace') || !css.includes('.bm03-paper')) {
  failures.push('Thiếu lớp giao diện chính của biểu mẫu BM03.');
}

if (failures.length) {
  for (const failure of failures) console.error(`LOI · ${failure}`);
  process.exit(1);
}

console.log('OK · Biểu mẫu đề xuất mua hàng BM03 hợp lệ, tệp Excel chuẩn và tách đúng đơn theo nhà cung cấp.');
