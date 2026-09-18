/**
 * Module xuất dữ liệu Excel (.xlsx) chuẩn hóa cho toàn hệ thống Clinic Hub 5S.
 * - Tự động bật Auto-filter trên hàng tiêu đề
 * - Tự động tính toán và tối ưu độ rộng cột (!cols)
 * - Định dạng phân cách hàng nghìn cho số và tiền tệ (#,##0)
 * - Bảo toàn số 0 đầu cho Số điện thoại, Mã NV, Số tài khoản (ép kiểu string @)
 * - Hỗ trợ cả xuất đơn bảng tính và xuất nhiều sheet trong 1 workbook
 */

export async function createStyledWorksheet(XLSX, data, options = {}) {
  const {
    customWidths = {},
    customFormats = {},
  } = options;

  if (!Array.isArray(data) || !data.length) {
    return XLSX.utils.json_to_sheet([{}]);
  }

  const ws = XLSX.utils.json_to_sheet(data);
  if (!ws['!ref']) return ws;

  // 1. Kích hoạt bộ lọc mặc định (Auto-filter) trên toàn bộ hàng tiêu đề
  ws['!autofilter'] = { ref: ws['!ref'] };

  // 2. Tính toán độ rộng cột tự động và định dạng dữ liệu từng ô
  const range = XLSX.utils.decode_range(ws['!ref']);
  const colWidths = [];

  for (let C = range.s.c; C <= range.e.c; ++C) {
    let maxLen = 0;
    const headerAddr = XLSX.utils.encode_cell({ r: range.s.r, c: C });
    const headerCell = ws[headerAddr];
    const headerText = headerCell ? String(headerCell.v ?? '') : '';
    maxLen = Math.max(maxLen, headerText.length);

    // Nhận diện kiểu cột từ tiêu đề để định dạng tự động
    const headerLower = headerText.toLowerCase();
    const isPhoneOrCode = /điện thoại|sđt|phone|mã|stk|tài khoản|cccd|cmnd|id/i.test(headerLower);
    const isCurrencyOrNumber = /lương|tiền|giá|chi phí|thực lãnh|tạm ứng|phí|hoa hồng|thành tiền|đơn giá|phút|số lượng|tồn|định mức|công/i.test(headerLower);

    // Quét các dòng dữ liệu để đo độ rộng và format cell
    const maxScanRow = Math.min(range.e.r, range.s.r + 300);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell || cell.v == null) continue;

      if (R <= maxScanRow) {
        maxLen = Math.max(maxLen, String(cell.v).length);
      }

      // Xử lý bảo toàn số 0 cho SĐT và mã
      if (isPhoneOrCode) {
        cell.t = 's';
        cell.v = String(cell.v);
        cell.z = '@';
      } else if (isCurrencyOrNumber && typeof cell.v === 'number') {
        cell.z = '#,##0';
      }

      // Ghi đè format nếu có cấu hình riêng
      if (customFormats[headerText]) {
        cell.z = customFormats[headerText];
      }
    }

    // Xác định độ rộng cuối cùng
    const customW = customWidths[headerText] || customWidths[C];
    let colW = 12;
    if (headerText === 'STT') {
      colW = 7;
    } else if (customW) {
      colW = Math.max(customW, maxLen + 3);
    } else {
      colW = Math.min(Math.max(maxLen + 4, 11), 60);
    }
    colWidths.push({ wch: colW });
  }

  ws['!cols'] = colWidths;
  return ws;
}

export async function exportTableToExcel({
  filename = 'Xuat_Du_Lieu.xlsx',
  sheetName = 'Dữ liệu',
  data = [],
  customWidths = {},
  customFormats = {},
}) {
  if (!data || !data.length) return false;
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = await createStyledWorksheet(XLSX, data, { customWidths, customFormats });
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeFilename = filename.toLowerCase().endsWith('.xlsx')
    ? filename
    : `${filename.replace(/\.[^/.]+$/, '')}.xlsx`;

  XLSX.writeFile(wb, safeFilename);
  return true;
}

export async function exportWorkbookToExcel({
  filename = 'Xuat_Du_Lieu.xlsx',
  sheets = [], // [{ sheetName, data, customWidths, customFormats }]
}) {
  if (!sheets || !sheets.length) return false;
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  for (const s of sheets) {
    const ws = await createStyledWorksheet(XLSX, s.data || [], {
      customWidths: s.customWidths || {},
      customFormats: s.customFormats || {},
    });
    XLSX.utils.book_append_sheet(wb, ws, s.sheetName || 'Sheet');
  }

  const safeFilename = filename.toLowerCase().endsWith('.xlsx')
    ? filename
    : `${filename.replace(/\.[^/.]+$/, '')}.xlsx`;

  XLSX.writeFile(wb, safeFilename);
  return true;
}
