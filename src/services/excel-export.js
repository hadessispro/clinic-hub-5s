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

/**
 * Tạo buffer nhị phân Uint8Array của Workbook gồm nhiều sheet
 */
export async function generateWorkbookBuffer(sheets = []) {
  if (!sheets || !sheets.length) return null;
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  for (const s of sheets) {
    const ws = await createStyledWorksheet(XLSX, s.data || [], {
      customWidths: s.customWidths || {},
      customFormats: s.customFormats || {},
    });
    XLSX.utils.book_append_sheet(wb, ws, s.sheetName || 'Sheet');
  }

  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(arrayBuffer);
}

/**
 * Tải file trực tiếp xuống trình duyệt
 */
export function downloadFile(data, filename, mimeType = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let crcTableCache = null;
function getCrcTable() {
  if (crcTableCache) return crcTableCache;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  crcTableCache = table;
  return table;
}

export function calculateCrc32(bytes) {
  const table = getCrcTable();
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Tạo file ZIP chuẩn (Store mode 0, tương thích 100% Windows/Mac/Linux)
 * files: Array<{ name: string, data: Uint8Array | string }>
 * Trả về Uint8Array
 */
export function createZipArchive(files = []) {
  const enc = new TextEncoder();
  const fileEntries = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const dataBytes = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data || ''));
    const crc = calculateCrc32(dataBytes);

    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, dataBytes.length, true);
    dv.setUint32(22, dataBytes.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    header.set(nameBytes, 30);

    fileEntries.push({ nameBytes, dataBytes, offset, header, crc });
    offset += header.length + dataBytes.length;
  }

  const centralStart = offset;
  const centralChunks = [];
  for (const f of fileEntries) {
    const cd = new Uint8Array(46 + f.nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, f.crc, true);
    dv.setUint32(20, f.dataBytes.length, true);
    dv.setUint32(24, f.dataBytes.length, true);
    dv.setUint16(28, f.nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, f.offset, true);
    cd.set(f.nameBytes, 46);
    centralChunks.push(cd);
    offset += cd.length;
  }

  const centralSize = offset - centralStart;
  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, fileEntries.length, true);
  dv.setUint16(10, fileEntries.length, true);
  dv.setUint32(12, centralSize, true);
  dv.setUint32(16, centralStart, true);
  dv.setUint16(20, 0, true);

  let totalLen = 0;
  for (const f of fileEntries) totalLen += f.header.length + f.dataBytes.length;
  for (const c of centralChunks) totalLen += c.length;
  totalLen += eocd.length;

  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const f of fileEntries) {
    result.set(f.header, pos); pos += f.header.length;
    result.set(f.dataBytes, pos); pos += f.dataBytes.length;
  }
  for (const c of centralChunks) {
    result.set(c, pos); pos += c.length;
  }
  result.set(eocd, pos);
  return result;
}

