/**
 * Module xuất dữ liệu Chấm Công & Tăng Ca đa chiều dạng ma trận (Matrix 30 ngày)
 * chuẩn hóa theo nhận diện thương hiệu Nha Khoa 5S.
 *
 * Tính năng chính:
 * 1. Phân tách rõ ràng 2 chi nhánh: Lê Văn Thọ (LVT) và Phạm Văn Chiêu (PVC).
 * 2. Phân tách riêng biệt: Bảng Chấm Công (Workdays) & Bảng Tăng Ca (Overtime).
 * 3. Ma trận ngang 28-31 ngày công: Cột STT, Mã NV, Họ tên, Chức vụ, tiếp nối
 *    là các cột ngày 01..30/31 kèm thứ trong tuần (T2..CN có đánh dấu Chủ Nhật).
 * 4. Bảng Tăng Ca hiển thị chi tiết số giờ tăng ca (0.7h, 1.5h, 2.0h...), ô trống nếu 0h.
 * 5. Thiết kế OpenXML trực quan chuyên nghiệp:
 *    - Màu chủ đạo Deep Teal 5S (#0F766E).
 *    - Ô ngày công đủ màu xanh lá mềm (#DCFCE7, text #166534).
 *    - Ô nửa công màu xanh bạc hà (#ECFDF5, text #047857).
 *    - Ô nghỉ phép / OFF màu hổ phách (#FEF3C7, text #B45309).
 *    - Ô tăng ca màu xanh dương (#E0F2FE, text #0369A1).
 *    - Cố định dòng tiêu đề & 4 cột đầu (Freeze panes A-D và hàng 1-6).
 *    - Dòng TỔNG CỘNG cuối bảng có công thức =SUM(...) chuẩn Excel.
 */

import { createZipArchive, downloadFile } from './excel-export.js';
import { BRANCHES } from '../branch.js';
import { isPgEmployee } from '../utils.js';

export { isPgEmployee };

function escapeXml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function colLetter(colIdx) {
  let temp = colIdx + 1;
  let letter = '';
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

function cellStr(r, s, text) {
  if (!text) return `<c r="${r}" s="${s}"/>`;
  return `<c r="${r}" s="${s}" t="inlineStr"><is><t>${escapeXml(text)}</t></is></c>`;
}

function cellNum(r, s, num) {
  return `<c r="${r}" s="${s}" t="n"><v>${Number(num || 0)}</v></c>`;
}

function cellFormula(r, s, formula, cachedVal = null) {
  if (cachedVal != null) {
    return `<c r="${r}" s="${s}" t="n"><f>${escapeXml(formula)}</f><v>${Number(cachedVal)}</v></c>`;
  }
  return `<c r="${r}" s="${s}" t="n"><f>${escapeXml(formula)}</f></c>`;
}

function cellEmpty(r, s) {
  return `<c r="${r}" s="${s}"/>`;
}

export function getMonthDays(monthStr) {
  const [yStr, mStr] = String(monthStr || '').split('-');
  const year = parseInt(yStr, 10) || new Date().getFullYear();
  const month = parseInt(mStr, 10) || (new Date().getMonth() + 1);
  const totalDays = new Date(year, month, 0).getDate();
  const days = [];

  const viDays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  for (let d = 1; d <= totalDays; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dayOfWeek = dateObj.getDay();
    const dayStr = String(d).padStart(2, '0');
    const dateIso = `${year}-${String(month).padStart(2, '0')}-${dayStr}`;

    days.push({
      day: d,
      dayStr,
      dateIso,
      dayOfWeek,
      weekdayLabel: viDays[dayOfWeek],
      isSunday: dayOfWeek === 0,
      isSaturday: dayOfWeek === 6,
    });
  }

  return { year, month, totalDays, days };
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="0.##"/>
    <numFmt numFmtId="165" formatCode="#,##0"/>
    <numFmt numFmtId="166" formatCode="@"/>
  </numFmts>
  <fonts count="12">
    <!-- 0: Regular 10pt Slate -->
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Segoe UI"/></font>
    <!-- 1: Bold 10pt White -->
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <!-- 2: Bold 11pt White -->
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <!-- 3: Bold 12pt White -->
    <font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <!-- 4: Bold 10pt Deep Teal -->
    <font><b/><sz val="10"/><color rgb="FF0F766E"/><name val="Segoe UI"/></font>
    <!-- 5: Bold 10pt Green -->
    <font><b/><sz val="10"/><color rgb="FF166534"/><name val="Segoe UI"/></font>
    <!-- 6: Bold 10pt Amber -->
    <font><b/><sz val="10"/><color rgb="FFB45309"/><name val="Segoe UI"/></font>
    <!-- 7: Bold 10pt Blue -->
    <font><b/><sz val="10"/><color rgb="FF0369A1"/><name val="Segoe UI"/></font>
    <!-- 8: Bold 10pt Red -->
    <font><b/><sz val="10"/><color rgb="FFBE123C"/><name val="Segoe UI"/></font>
    <!-- 9: Bold 10pt Dark Slate -->
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
    <!-- 10: 9pt Italic Slate -->
    <font><i/><sz val="9"/><color rgb="FF64748B"/><name val="Segoe UI"/></font>
    <!-- 11: Bold 14pt Deep Teal (Sheet Title) -->
    <font><b/><sz val="14"/><color rgb="FF0F766E"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="15">
    <!-- 0: none -->
    <fill><patternFill patternType="none"/></fill>
    <!-- 1: gray125 -->
    <fill><patternFill patternType="gray125"/></fill>
    <!-- 2: Deep Teal FF0F766E -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 3: Dark Teal FF115E59 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF115E59"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 4: Weekend Red Header FFBE123C -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFBE123C"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 5: Sunday Soft Rose FFFFF1F2 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF1F2"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 6: Saturday Soft Slate FFF8FAFC -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 7: Workday Soft Green FFDCFCE7 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 8: Half Workday Soft Mint FFECFDF5 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 9: Leave/OFF Soft Amber FFFEF3C7 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 10: Overtime Soft Blue FFE0F2FE -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 11: Summary Soft Mint FFF0FDFA -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0FDFA"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 12: Footer Summary Soft Slate FFE2E8F0 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 13: Meta soft gray FFF1F5F9 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 14: Soft Cyan CCFBF1 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFCCFBF1"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="4">
    <!-- 0: none -->
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <!-- 1: thin light gray -->
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
    <!-- 2: Header border (bottom medium 0D9488) -->
    <border>
      <left style="thin"><color rgb="FF115E59"/></left>
      <right style="thin"><color rgb="FF115E59"/></right>
      <top style="thin"><color rgb="FF115E59"/></top>
      <bottom style="medium"><color rgb="FF0D9488"/></bottom>
    </border>
    <!-- 3: Summary Total Row border (top thin, bottom double) -->
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FF0F766E"/></top>
      <bottom style="double"><color rgb="FF0F766E"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="30">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Document Title -->
    <xf numFmtId="0" fontId="11" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <!-- 2: Subtitle / Meta -->
    <xf numFmtId="0" fontId="10" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
    <!-- 3: Main Group Header (Deep Teal) -->
    <xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <!-- 4: Subheader Day Number (Dark Teal) -->
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 5: Subheader Sunday Day Number (Red) -->
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 6: Subheader Saturday (Dark Teal) -->
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 7: Subheader Weekday (Dark Teal) -->
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 8: Subheader Sunday Weekday (Red) -->
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 9: Subheader Summary Column (Deep Teal) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <!-- 10: STT cell -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 11: Employee Code (Mã NV) -->
    <xf numFmtId="166" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 12: Employee Name (Họ tên) -->
    <xf numFmtId="0" fontId="9" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <!-- 13: Employee Role (Chức vụ) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <!-- 14: Normal weekday cell (blank/empty) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 15: Saturday cell (blank) -->
    <xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 16: Sunday cell (blank) -->
    <xf numFmtId="0" fontId="8" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 17: Full workday (1 / HC / F) -->
    <xf numFmtId="164" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 18: Half workday (0.5) -->
    <xf numFmtId="164" fontId="5" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 19: Leave / OFF cell -->
    <xf numFmtId="0" fontId="6" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 20: Overtime cell in Chấm công -->
    <xf numFmtId="164" fontId="7" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 21: Overtime hours (> 0) in Tăng ca -->
    <xf numFmtId="164" fontId="7" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 22: Overtime Sunday (> 0) in Tăng ca -->
    <xf numFmtId="164" fontId="8" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 23: Summary Total number (Tổng công / Tổng giờ) -->
    <xf numFmtId="164" fontId="4" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 24: Summary Integer number (Phút đi muộn, về sớm) -->
    <xf numFmtId="165" fontId="0" fillId="11" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 25: Summary Text (Ghi chú) -->
    <xf numFmtId="0" fontId="0" fillId="11" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <!-- 26: Footer label (TỔNG CỘNG) -->
    <xf numFmtId="0" fontId="9" fillId="12" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 27: Footer sum formula (Day column sum) -->
    <xf numFmtId="164" fontId="9" fillId="12" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 28: Footer Sunday sum formula -->
    <xf numFmtId="164" fontId="8" fillId="5" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 29: Footer grand total -->
    <xf numFmtId="164" fontId="4" fillId="14" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
</styleSheet>`;
}

/**
 * Tạo XML bảng ma trận chấm công hoặc tăng ca cho 1 chi nhánh
 */
function buildMatrixWorksheetXml({
  type = 'cham_cong', // 'cham_cong' | 'tang_ca'
  branchCode = 'LVT', // 'LVT' | 'PVC'
  branchName = 'Lê Văn Thọ',
  monthStr = '2026-09',
  monthInfo,
  employees = [],
  workSummaryMap = new Map(),
}) {
  const { totalDays, days, month, year } = monthInfo;
  const isOvertime = type === 'tang_ca';
  const sheetTitle = isOvertime
    ? `BẢNG THEO DÕI TĂNG CA - CHI NHÁNH ${branchCode} (${branchName.toUpperCase()})`
    : `BẢNG CHẤM CÔNG CHI TIẾT - CHI NHÁNH ${branchCode} (${branchName.toUpperCase()})`;

  // Cấu trúc cột:
  // Col 0: STT
  // Col 1: Mã NV
  // Col 2: Họ và tên
  // Col 3: Chức vụ
  // Col 4 .. (4 + totalDays - 1): Các ngày 01..totalDays
  const firstDayColIdx = 4;
  const lastDayColIdx = 4 + totalDays - 1;
  const firstDayColLetter = colLetter(firstDayColIdx);
  const lastDayColLetter = colLetter(lastDayColIdx);

  const summaryHeaders = isOvertime
    ? [
        { label: 'Tổng giờ tăng ca (h)', width: 15, isNum: true, isGrand: true },
        { label: 'Tổng phút tăng ca', width: 14, isNum: true, isInt: true },
        { label: 'Quy đổi ngày công (h/8)', width: 15, isNum: true },
        { label: 'Ghi chú', width: 20, isNum: false },
      ]
    : [
        { label: 'Tổng giờ công (h)', width: 16, isNum: true, isGrand: true },
        { label: 'Quy đổi ngày công (h/8)', width: 16, isNum: true },
        { label: 'Công chuẩn', width: 12, isNum: true },
        { label: 'Đi muộn (phút)', width: 13, isNum: true, isInt: true },
        { label: 'Về sớm (phút)', width: 13, isNum: true, isInt: true },
        { label: 'Nghỉ phép (P/OFF)', width: 14, isNum: false },
        { label: 'Ghi chú', width: 20, isNum: false },
      ];

  const totalCols = 4 + totalDays + summaryHeaders.length;
  const lastColLetter = colLetter(totalCols - 1);

  // Định nghĩa độ rộng cột <cols>
  let colsXml = '<cols>';
  colsXml += `<col min="1" max="1" width="7" customWidth="1"/>`; // STT
  colsXml += `<col min="2" max="2" width="11" customWidth="1"/>`; // Mã NV
  colsXml += `<col min="3" max="3" width="26" customWidth="1"/>`; // Họ tên
  colsXml += `<col min="4" max="4" width="20" customWidth="1"/>`; // Chức vụ
  for (let d = 0; d < totalDays; d++) {
    const colNum = 5 + d;
    colsXml += `<col min="${colNum}" max="${colNum}" width="5.5" customWidth="1"/>`;
  }
  for (let s = 0; s < summaryHeaders.length; s++) {
    const colNum = 5 + totalDays + s;
    colsXml += `<col min="${colNum}" max="${colNum}" width="${summaryHeaders[s].width}" customWidth="1"/>`;
  }
  colsXml += '</cols>';

  const mergeCells = [];
  const rowsXml = [];

  // Hàng 1: Banner thương hiệu 5S
  rowsXml.push(
    `<row r="1" ht="24" customHeight="1">` +
    cellStr('A1', 1, 'CÔNG TY CỔ PHẦN 5S SÀI GÒN - HỆ THỐNG PHÒNG KHÁM NHA KHOA 5S') +
    `</row>`
  );
  mergeCells.push(`A1:${lastColLetter}1`);

  // Hàng 2: Tiêu đề bảng
  rowsXml.push(
    `<row r="2" ht="26" customHeight="1">` +
    cellStr('A2', 1, `${sheetTitle} - THÁNG ${String(month).padStart(2, '0')}/${year}`) +
    `</row>`
  );
  mergeCells.push(`A2:${lastColLetter}2`);

  // Hàng 3: Metadata thông tin xuất
  const printDateStr = new Date().toLocaleString('vi-VN');
  rowsXml.push(
    `<row r="3" ht="20" customHeight="1">` +
    cellStr('A3', 2, `Chu kỳ: 01/${String(month).padStart(2, '0')}/${year} - ${totalDays}/${String(month).padStart(2, '0')}/${year}  |  Chi nhánh: ${branchName} (${branchCode})  |  Thời gian xuất: ${printDateStr}`) +
    `</row>`
  );
  mergeCells.push(`A3:${lastColLetter}3`);

  // Hàng 4: Dòng trống ngăn cách
  rowsXml.push(`<row r="4" ht="10" customHeight="1"></row>`);

  // Hàng 5: Header Nhóm (Cột cố định + Nhóm ngày công + Nhóm tổng hợp)
  let r5Cells = '';
  r5Cells += cellStr('A5', 3, 'STT');
  r5Cells += cellStr('B5', 3, 'MÃ NV');
  r5Cells += cellStr('C5', 3, 'HỌ VÀ TÊN');
  r5Cells += cellStr('D5', 3, 'CHỨC VỤ');

  // Ô nhóm các ngày
  const groupLabel = isOvertime
    ? `CHI TIẾT TĂNG CA CÁC NGÀY TRONG THÁNG (TỪ NGÀY 01 ĐẾN ${totalDays})`
    : `CHI TIẾT CHẤM CÔNG CÁC NGÀY TRONG THÁNG (TỪ NGÀY 01 ĐẾN ${totalDays})`;
  r5Cells += cellStr(`${firstDayColLetter}5`, 3, groupLabel);
  for (let c = firstDayColIdx + 1; c <= lastDayColIdx; c++) {
    r5Cells += cellEmpty(`${colLetter(c)}5`, 3);
  }
  mergeCells.push(`${firstDayColLetter}5:${lastDayColLetter}5`);

  // Cột tổng hợp
  summaryHeaders.forEach((sh, idx) => {
    const cLetter = colLetter(lastDayColIdx + 1 + idx);
    r5Cells += cellStr(`${cLetter}5`, 9, sh.label);
    mergeCells.push(`${cLetter}5:${cLetter}6`);
  });
  rowsXml.push(`<row r="5" ht="24" customHeight="1">${r5Cells}</row>`);

  // Merges cho A5:A6, B5:B6, C5:C6, D5:D6
  mergeCells.push(`A5:A6`);
  mergeCells.push(`B5:B6`);
  mergeCells.push(`C5:C6`);
  mergeCells.push(`D5:D6`);

  // Hàng 6: Subheader (Số ngày 01..totalDays & Thứ trong tuần T2..CN)
  let r6Cells = '';
  r6Cells += cellEmpty('A6', 3);
  r6Cells += cellEmpty('B6', 3);
  r6Cells += cellEmpty('C6', 3);
  r6Cells += cellEmpty('D6', 3);

  days.forEach((d, idx) => {
    const cLetter = colLetter(firstDayColIdx + idx);
    const dayStyle = d.isSunday ? 5 : (d.isSaturday ? 6 : 4);
    r6Cells += cellStr(`${cLetter}6`, dayStyle, `${d.dayStr} ${d.weekdayLabel}`);
  });

  summaryHeaders.forEach((sh, idx) => {
    const cLetter = colLetter(lastDayColIdx + 1 + idx);
    r6Cells += cellEmpty(`${cLetter}6`, 9);
  });
  rowsXml.push(`<row r="6" ht="26" customHeight="1">${r6Cells}</row>`);

  // Dữ liệu từng nhân sự (từ Hàng 7 trở đi)
  const startDataRow = 7;
  employees.forEach((emp, empIdx) => {
    const rNum = startDataRow + empIdx;
    const summary = workSummaryMap.get(emp.id) || { days: [], totals: {} };
    const dayMap = new Map((summary.days || []).map((d) => [d.work_date, d]));
    const totals = summary.totals || {};

    let rowCells = '';
    // A: STT
    rowCells += cellNum(`A${rNum}`, 10, empIdx + 1);
    // B: Mã NV
    rowCells += cellStr(`B${rNum}`, 11, emp.id);
    // C: Họ và tên
    rowCells += cellStr(`C${rNum}`, 12, emp.name);
    // D: Chức vụ
    rowCells += cellStr(`D${rNum}`, 13, emp.role || 'Nhân viên');

    // 01..totalDays
    days.forEach((d, dIdx) => {
      const cLetter = colLetter(firstDayColIdx + dIdx);
      const dayRec = dayMap.get(d.dateIso);

      if (isOvertime) {
        // Bảng Tăng Ca: Hiển thị số giờ tăng ca dạng số thuần (0.75, 1.5, 2...) để kế toán tính toán
        const otMin = Number(dayRec?.overtime_minutes || 0);
        if (otMin > 0) {
          const otHours = Number((otMin / 60).toFixed(2));
          const otStyle = d.isSunday ? 22 : 21;
          rowCells += cellNum(`${cLetter}${rNum}`, otStyle, otHours);
        } else {
          // Ô trống nếu không tăng ca
          const emptyStyle = d.isSunday ? 16 : (d.isSaturday ? 15 : 14);
          rowCells += cellEmpty(`${cLetter}${rNum}`, emptyStyle);
        }
      } else {
        // Bảng Chấm Công: Hiển thị số giờ làm việc thực tế (11, 9, 8, 9.35...) dạng số thuần
        const regMin = Number(dayRec?.regular_minutes || 0);
        const credit = Number(dayRec?.workday_credit || 0);
        const shiftCode = String(dayRec?.shift_code || '').toUpperCase();
        const note = String(dayRec?.note || '').toLowerCase();

        // Tính giờ công làm việc thực tế (11 giờ -> 11, 9h21 -> 9.35)
        const regHours = regMin > 0 ? Number((regMin / 60).toFixed(2)) : (credit > 0 ? Number((credit * 8).toFixed(2)) : 0);

        if (regHours > 0) {
          // Xuất số giờ làm thực tế dạng số (không xuất 1 công)
          const cellStyle = credit >= 0.9 ? 17 : 18;
          rowCells += cellNum(`${cLetter}${rNum}`, cellStyle, regHours);
        } else if (shiftCode === 'OFF' || note.includes('off') || note.includes('phép')) {
          // Nghỉ phép hoặc OFF
          rowCells += cellStr(`${cLetter}${rNum}`, 19, shiftCode === 'OFF' ? 'OFF' : 'P');
        } else {
          // Không có công
          const emptyStyle = d.isSunday ? 16 : (d.isSaturday ? 15 : 14);
          rowCells += cellEmpty(`${cLetter}${rNum}`, emptyStyle);
        }
      }
    });

    // Các cột tổng hợp cuối dòng
    if (isOvertime) {
      const sumRange = `${firstDayColLetter}${rNum}:${lastDayColLetter}${rNum}`;
      const totalOtMin = Number(totals.overtimeMinutes || 0);
      const totalOtHours = Number((totalOtMin / 60).toFixed(2));
      const convertedDays = Number((totalOtHours / 8).toFixed(2));

      // 1. Tổng giờ tăng ca (Formula =SUM)
      const c1 = colLetter(lastDayColIdx + 1);
      rowCells += cellFormula(`${c1}${rNum}`, 23, `SUM(${sumRange})`, totalOtHours);

      // 2. Tổng phút tăng ca
      const c2 = colLetter(lastDayColIdx + 2);
      rowCells += cellNum(`${c2}${rNum}`, 24, totalOtMin);

      // 3. Quy đổi ngày công
      const c3 = colLetter(lastDayColIdx + 3);
      rowCells += cellFormula(`${c3}${rNum}`, 23, `ROUND(${c1}${rNum}/8,2)`, convertedDays);

      // 4. Ghi chú
      const c4 = colLetter(lastDayColIdx + 4);
      rowCells += cellEmpty(`${c4}${rNum}`, 25);
    } else {
      const sumRange = `${firstDayColLetter}${rNum}:${lastDayColLetter}${rNum}`;
      const totalRegMin = Number(totals.regularMinutes || 0);
      const totalRegHours = Number((totalRegMin / 60).toFixed(2));
      const totalWorkdays = Number(totals.workdays || 0);
      const convertedDays = totalWorkdays > 0 ? totalWorkdays : Number((totalRegHours / 8).toFixed(2));
      const lateMin = Number(totals.lateMinutes || 0);
      const earlyMin = Number(totals.earlyLeaveMinutes || 0);

      // 1. Tổng giờ công (h) (=SUM(ngày 01..totalDays))
      const c1 = colLetter(lastDayColIdx + 1);
      rowCells += cellFormula(`${c1}${rNum}`, 23, `SUM(${sumRange})`, totalRegHours);

      // 2. Quy đổi ngày công (=ROUND(c1/8, 2))
      const c2 = colLetter(lastDayColIdx + 2);
      rowCells += cellFormula(`${c2}${rNum}`, 23, `ROUND(${c1}${rNum}/8,2)`, convertedDays);

      // 3. Công chuẩn (chuẩn 26 ngày)
      const c3 = colLetter(lastDayColIdx + 3);
      rowCells += cellNum(`${c3}${rNum}`, 23, 26);

      // 4. Đi muộn (phút)
      const c4 = colLetter(lastDayColIdx + 4);
      rowCells += cellNum(`${c4}${rNum}`, 24, lateMin);

      // 5. Về sớm (phút)
      const c5 = colLetter(lastDayColIdx + 5);
      rowCells += cellNum(`${c5}${rNum}`, 24, earlyMin);

      // 6. Nghỉ phép / OFF
      const c6 = colLetter(lastDayColIdx + 6);
      rowCells += cellEmpty(`${c6}${rNum}`, 25);

      // 7. Ghi chú
      const c7 = colLetter(lastDayColIdx + 7);
      rowCells += cellEmpty(`${c7}${rNum}`, 25);
    }

    rowsXml.push(`<row r="${rNum}" ht="22" customHeight="1">${rowCells}</row>`);
  });

  // Hàng TỔNG CỘNG (Footer Row)
  const lastDataRow = employees.length ? (startDataRow + employees.length - 1) : startDataRow;
  const footerRowNum = lastDataRow + 1;

  let footerCells = '';
  // A..D: TỔNG CỘNG
  footerCells += cellStr(`A${footerRowNum}`, 26, 'TỔNG CỘNG');
  footerCells += cellEmpty(`B${footerRowNum}`, 26);
  footerCells += cellEmpty(`C${footerRowNum}`, 26);
  footerCells += cellEmpty(`D${footerRowNum}`, 26);
  mergeCells.push(`A${footerRowNum}:D${footerRowNum}`);

  // Tổng từng ngày (cột 01..totalDays)
  days.forEach((d, dIdx) => {
    const cLetter = colLetter(firstDayColIdx + dIdx);
    const formulaRange = `${cLetter}${startDataRow}:${cLetter}${lastDataRow}`;
    const footerStyle = d.isSunday ? 28 : 27;

    if (employees.length) {
      footerCells += cellFormula(`${cLetter}${footerRowNum}`, footerStyle, `SUM(${formulaRange})`);
    } else {
      footerCells += cellEmpty(`${cLetter}${footerRowNum}`, footerStyle);
    }
  });

  // Tổng các cột tổng hợp
  summaryHeaders.forEach((sh, idx) => {
    const cLetter = colLetter(lastDayColIdx + 1 + idx);
    const formulaRange = `${cLetter}${startDataRow}:${cLetter}${lastDataRow}`;

    if (sh.isNum && employees.length) {
      footerCells += cellFormula(`${cLetter}${footerRowNum}`, 29, `SUM(${formulaRange})`);
    } else {
      footerCells += cellEmpty(`${cLetter}${footerRowNum}`, 29);
    }
  });
  rowsXml.push(`<row r="${footerRowNum}" ht="26" customHeight="1">${footerCells}</row>`);

  // Merged Cells XML
  let mergeCellsXml = '';
  if (mergeCells.length) {
    mergeCellsXml = `<mergeCells count="${mergeCells.length}">` +
      mergeCells.map((m) => `<mergeCell ref="${m}"/>`).join('') +
      `</mergeCells>`;
  }

  // Freeze pane: Cố định 6 dòng trên cùng và 4 cột bên trái (A, B, C, D)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColLetter}${footerRowNum}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane xSplit="4" ySplit="6" topLeftCell="E7" activePane="bottomRight" state="frozen"/>
      <selection pane="bottomRight" activeCell="E7" sqref="E7"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  <sheetData>
    ${rowsXml.join('')}
  </sheetData>
  ${mergeCellsXml}
</worksheet>`;
}

/**
 * Tạo XML Sheet Tổng hợp toàn viện (2 chi nhánh)
 */
function buildCompanySummarySheetXml({
  monthStr = '2026-09',
  monthInfo,
  employees = [],
  workSummaryMap = new Map(),
}) {
  const { month, year } = monthInfo;
  const cols = [
    { label: 'STT', width: 7 },
    { label: 'Mã NV', width: 11 },
    { label: 'Họ và tên', width: 26 },
    { label: 'Chi nhánh', width: 18 },
    { label: 'Chức vụ', width: 20 },
    { label: 'Tổng giờ công (h)', width: 16 },
    { label: 'Quy đổi công (ngày)', width: 15 },
    { label: 'Tăng ca (h)', width: 14 },
    { label: 'Tăng ca (phút)', width: 14 },
    { label: 'Đi muộn (phút)', width: 14 },
    { label: 'Về sớm (phút)', width: 14 },
    { label: 'Cần đối soát (ngày)', width: 16 },
    { label: 'Số điện thoại', width: 14 },
    { label: 'Email nhận phiếu', width: 26 },
  ];

  let colsXml = '<cols>';
  cols.forEach((c, idx) => {
    colsXml += `<col min="${idx + 1}" max="${idx + 1}" width="${c.width}" customWidth="1"/>`;
  });
  colsXml += '</cols>';

  const lastColLetter = colLetter(cols.length - 1);
  const rowsXml = [];
  const mergeCells = [];

  // Hàng 1: Banner
  rowsXml.push(
    `<row r="1" ht="24" customHeight="1">` +
    cellStr('A1', 1, 'CÔNG TY CỔ PHẦN 5S SÀI GÒN - HỆ THỐNG PHÒNG KHÁM NHA KHOA 5S') +
    `</row>`
  );
  mergeCells.push(`A1:${lastColLetter}1`);

  // Hàng 2: Tiêu đề
  rowsXml.push(
    `<row r="2" ht="26" customHeight="1">` +
    cellStr('A2', 1, `BẢNG TỔNG HỢP CÔNG & TĂNG CA TOÀN HỆ THỐNG - THÁNG ${String(month).padStart(2, '0')}/${year}`) +
    `</row>`
  );
  mergeCells.push(`A2:${lastColLetter}2`);

  // Hàng 3: Meta
  const printDateStr = new Date().toLocaleString('vi-VN');
  rowsXml.push(
    `<row r="3" ht="20" customHeight="1">` +
    cellStr('A3', 2, `Phạm vi: Cả 2 chi nhánh LVT & PVC  |  Số lượng nhân sự: ${employees.length}  |  Ngày xuất: ${printDateStr}`) +
    `</row>`
  );
  mergeCells.push(`A3:${lastColLetter}3`);

  // Hàng 4: Dòng trống
  rowsXml.push(`<row r="4" ht="10" customHeight="1"></row>`);

  // Hàng 5: Header cột
  let r5Cells = '';
  cols.forEach((c, idx) => {
    const cLetter = colLetter(idx);
    r5Cells += cellStr(`${cLetter}5`, 3, c.label);
  });
  rowsXml.push(`<row r="5" ht="26" customHeight="1">${r5Cells}</row>`);

  // Dữ liệu từng nhân sự
  const startRow = 6;
  employees.forEach((emp, idx) => {
    const rNum = startRow + idx;
    const summary = workSummaryMap.get(emp.id) || { totals: {} };
    const totals = summary.totals || {};
    const branchName = BRANCHES[emp.branchId]?.name || emp.branchId || 'Chưa gán';

    const regMin = Number(totals.regularMinutes || 0);
    const regHours = Number((regMin / 60).toFixed(2));
    const workdays = Number(totals.workdays || 0);
    const otMin = Number(totals.overtimeMinutes || 0);
    const otHours = Number((otMin / 60).toFixed(2));
    const lateMin = Number(totals.lateMinutes || 0);
    const earlyMin = Number(totals.earlyLeaveMinutes || 0);
    const incompleteDays = Number(totals.incompleteDays || 0);

    let rowCells = '';
    rowCells += cellNum(`A${rNum}`, 10, idx + 1);
    rowCells += cellStr(`B${rNum}`, 11, emp.id);
    rowCells += cellStr(`C${rNum}`, 12, emp.name);
    rowCells += cellStr(`D${rNum}`, 13, branchName);
    rowCells += cellStr(`E${rNum}`, 13, emp.role || '');
    rowCells += cellNum(`F${rNum}`, 23, regHours);
    rowCells += cellNum(`G${rNum}`, 23, workdays);
    rowCells += cellNum(`H${rNum}`, 21, otHours);
    rowCells += cellNum(`I${rNum}`, 24, otMin);
    rowCells += cellNum(`J${rNum}`, 24, lateMin);
    rowCells += cellNum(`K${rNum}`, 24, earlyMin);
    rowCells += cellNum(`L${rNum}`, 24, incompleteDays);
    rowCells += cellStr(`M${rNum}`, 10, emp.phone || '');
    rowCells += cellStr(`N${rNum}`, 13, emp.email || '');

    rowsXml.push(`<row r="${rNum}" ht="22" customHeight="1">${rowCells}</row>`);
  });

  // Footer Row
  const lastDataRow = employees.length ? (startRow + employees.length - 1) : startRow;
  const footerRow = lastDataRow + 1;
  let footerCells = '';
  footerCells += cellStr(`A${footerRow}`, 26, 'TỔNG CỘNG');
  footerCells += cellEmpty(`B${footerRow}`, 26);
  footerCells += cellEmpty(`C${footerRow}`, 26);
  footerCells += cellEmpty(`D${footerRow}`, 26);
  footerCells += cellEmpty(`E${footerRow}`, 26);
  mergeCells.push(`A${footerRow}:E${footerRow}`);

  // Sum F..L
  ['F', 'G', 'H', 'I', 'J', 'K', 'L'].forEach((colLet) => {
    if (employees.length) {
      footerCells += cellFormula(`${colLet}${footerRow}`, 29, `SUM(${colLet}${startRow}:${colLet}${lastDataRow})`);
    } else {
      footerCells += cellEmpty(`${colLet}${footerRow}`, 29);
    }
  });
  footerCells += cellEmpty(`M${footerRow}`, 29);
  footerCells += cellEmpty(`N${footerRow}`, 29);
  rowsXml.push(`<row r="${footerRow}" ht="26" customHeight="1">${footerCells}</row>`);

  let mergeCellsXml = '';
  if (mergeCells.length) {
    mergeCellsXml = `<mergeCells count="${mergeCells.length}">` +
      mergeCells.map((m) => `<mergeCell ref="${m}"/>`).join('') +
      `</mergeCells>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColLetter}${footerRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane xSplit="3" ySplit="5" topLeftCell="D6" activePane="bottomRight" state="frozen"/>
      <selection pane="bottomRight" activeCell="D6" sqref="D6"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  <sheetData>
    ${rowsXml.join('')}
  </sheetData>
  ${mergeCellsXml}
</worksheet>`;
}

/**
 * Sinh toàn bộ gói file OpenXML .xlsx chuẩn
 */
export function generateAttendanceMatrixXlsx({
  month = '2026-09',
  employees = [],
  workSummaryMap = new Map(),
}) {
  const monthInfo = getMonthDays(month);

  // Tách biệt nhân sự PG: Khối PG có hệ thống quản lý & chấm công riêng do SupPG điều phối
  const clinicEmployees = employees.filter((e) => !isPgEmployee(e));

  // Phân chia nhân viên theo chi nhánh
  // LVT: 'le-van-tho', PVC: 'pham-van-chieu'
  const lvtEmployees = clinicEmployees.filter((e) => e.branchId === 'le-van-tho');
  const pvcEmployees = clinicEmployees.filter((e) => e.branchId === 'pham-van-chieu');
  const otherEmployees = clinicEmployees.filter((e) => e.branchId !== 'le-van-tho' && e.branchId !== 'pham-van-chieu');

  // Nếu có nhân viên chưa gán, bổ sung vào LVT hoặc PVC tùy theo ngữ cảnh, hoặc giữ nguyên danh sách đầy đủ
  const allEmployees = [...lvtEmployees, ...pvcEmployees, ...otherEmployees];

  // 1. Sheet Chấm công - LVT
  const sheet1Xml = buildMatrixWorksheetXml({
    type: 'cham_cong',
    branchCode: 'LVT',
    branchName: 'Lê Văn Thọ',
    monthStr: month,
    monthInfo,
    employees: lvtEmployees.length ? lvtEmployees : otherEmployees,
    workSummaryMap,
  });

  // 2. Sheet Chấm công - PVC
  const sheet2Xml = buildMatrixWorksheetXml({
    type: 'cham_cong',
    branchCode: 'PVC',
    branchName: 'Phạm Văn Chiêu',
    monthStr: month,
    monthInfo,
    employees: pvcEmployees,
    workSummaryMap,
  });

  // 3. Sheet Tăng ca - LVT
  const sheet3Xml = buildMatrixWorksheetXml({
    type: 'tang_ca',
    branchCode: 'LVT',
    branchName: 'Lê Văn Thọ',
    monthStr: month,
    monthInfo,
    employees: lvtEmployees.length ? lvtEmployees : otherEmployees,
    workSummaryMap,
  });

  // 4. Sheet Tăng ca - PVC
  const sheet4Xml = buildMatrixWorksheetXml({
    type: 'tang_ca',
    branchCode: 'PVC',
    branchName: 'Phạm Văn Chiêu',
    monthStr: month,
    monthInfo,
    employees: pvcEmployees,
    workSummaryMap,
  });

  // 5. Sheet Tổng hợp 2 Chi nhánh
  const sheet5Xml = buildCompanySummarySheetXml({
    monthStr: month,
    monthInfo,
    employees: allEmployees,
    workSummaryMap,
  });

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
  <sheets>
    <sheet name="Chấm công - LVT" sheetId="1" r:id="rId1"/>
    <sheet name="Chấm công - PVC" sheetId="2" r:id="rId2"/>
    <sheet name="Tăng ca - LVT" sheetId="3" r:id="rId3"/>
    <sheet name="Tăng ca - PVC" sheetId="4" r:id="rId4"/>
    <sheet name="Tổng hợp 2 Chi nhánh" sheetId="5" r:id="rId5"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>
</Relationships>`;

  const stylesXml = buildStylesXml();

  const files = [
    { name: '[Content_Types].xml', data: contentTypesXml },
    { name: '_rels/.rels', data: rootRelsXml },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml },
    { name: 'xl/workbook.xml', data: workbookXml },
    { name: 'xl/styles.xml', data: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', data: sheet1Xml },
    { name: 'xl/worksheets/sheet2.xml', data: sheet2Xml },
    { name: 'xl/worksheets/sheet3.xml', data: sheet3Xml },
    { name: 'xl/worksheets/sheet4.xml', data: sheet4Xml },
    { name: 'xl/worksheets/sheet5.xml', data: sheet5Xml },
  ];

  return createZipArchive(files);
}

/**
 * Trình xuất chính gọi từ giao diện người dùng
 */
export async function exportAttendanceMatrixWorkbook({
  month = '2026-09',
  employees = [],
  fetchWorkSummaryFn,
  onProgress = null,
}) {
  // Loại bỏ nhân sự PG (do Marketing & SupPG quản lý riêng)
  const clinicEmployees = employees.filter((e) => !isPgEmployee(e));
  const workSummaryMap = new Map();
  const total = clinicEmployees.length;

  for (let i = 0; i < total; i++) {
    const emp = clinicEmployees[i];
    if (onProgress) {
      onProgress(i + 1, total, emp);
    }
    try {
      if (typeof fetchWorkSummaryFn === 'function') {
        const res = await fetchWorkSummaryFn(month, emp.id);
        if (res) workSummaryMap.set(emp.id, res);
      }
    } catch (err) {
      console.warn(`[Attendance Matrix] Không thể tải dữ liệu của ${emp.id}:`, err);
    }
  }

  const xlsxBuffer = generateAttendanceMatrixXlsx({
    month,
    employees: clinicEmployees,
    workSummaryMap,
  });

  const [y, m] = month.split('-');
  const fileName = `Bang_Cham_Cong_Tang_Ca_5S_LVT_PVC_Thang_${m}_${y}.xlsx`;
  downloadFile(
    xlsxBuffer,
    fileName,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  return true;
}
