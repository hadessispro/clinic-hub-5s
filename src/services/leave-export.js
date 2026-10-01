/**
 * Module xuất dữ liệu Danh Sách Đơn Từ & Tăng Ca đa phân hệ
 * chuẩn hóa theo nhận diện thương hiệu Nha Khoa 5S.
 *
 * Tính năng chính:
 * 1. Phân chia rõ ràng 4 Sheet chuyên dụng:
 *    - Sheet 1: Tất cả đơn từ (Tổng hợp đầy đủ theo bộ lọc)
 *    - Sheet 2: Đơn Tăng Ca (Phục vụ kế toán chốt công tăng ca, có SUM tổng số giờ)
 *    - Sheet 3: Đơn Nghỉ Phép (Phục vụ HR quản lý phép & trừ công, có SUM tổng ngày nghỉ)
 *    - Sheet 4: Ứng Lương & Đơn Khác (Phục vụ kế toán theo dõi tạm ứng & tài khoản nhận tiền)
 * 2. Thiết kế OpenXML trực quan, có màu sắc chuẩn nhận diện:
 *    - Màu chủ đạo Deep Teal 5S (#0F766E) cho dòng tiêu đề.
 *    - Badge màu sắc trạng thái:
 *      + Đã duyệt: Nền xanh lá mềm (#DCFCE7), chữ xanh đậm (#166534).
 *      + Chờ duyệt: Nền vàng hổ phách (#FEF3C7), chữ nâu cam (#92400E).
 *      + Đã từ chối: Nền đỏ mềm (#FEE2E2), chữ đỏ sẫm (#991B1B).
 *    - Badge màu sắc loại đơn: Tăng ca (Xanh biển), Nghỉ phép (Tím), Tạm ứng (Cam).
 *    - Dòng xen kẽ (Zebra rows #F8FAFC) giúp mắt dò ngang không bị lệch hàng.
 *    - Dòng TỔNG CỘNG cuối bảng có công thức Excel =SUM(...) chuẩn xác.
 *    - Cố định dòng tiêu đề (Freeze Panes 4 hàng đầu) và kích hoạt AutoFilter.
 */

import { createZipArchive, downloadFile } from './excel-export.js';
import { BRANCHES } from '../branch.js';
import { departmentName } from '../utils.js';

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

function formatVnDate(iso) {
  if (!iso) return '';
  const str = String(iso).slice(0, 10);
  const parts = str.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
}

function formatVnDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return formatVnDate(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getBranchLabel(branchId) {
  if (branchId === 'pham-van-chieu') return 'Phạm Văn Chiêu';
  if (branchId === 'le-van-tho') return 'Lê Văn Thọ';
  if (branchId === 'marketing') return 'Khối Marketing';
  if (branchId === 'all') return 'Toàn hệ thống';
  return BRANCHES[branchId]?.shortName || branchId || 'Chưa gán';
}

function getWorkflowLabel(request) {
  if (request.status === 'approved') return 'Đã duyệt cấp cao nhất';
  if (request.status === 'rejected') return 'Đã từ chối';
  if (request.leaderStatus === 'approved') return 'Chờ Vận hành / HR duyệt';
  return 'Chờ Quản lý / HR duyệt';
}

function calcLeaveDays(from, to) {
  if (!from) return 1;
  if (!to || to === from) return 1;
  const d1 = new Date(from);
  const d2 = new Date(to);
  const diffTime = Math.abs(d2 - d1);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return isNaN(diffDays) || diffDays < 1 ? 1 : diffDays;
}

function buildLeaveStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="0.0"/>
    <numFmt numFmtId="165" formatCode="#,##0"/>
    <numFmt numFmtId="166" formatCode="@"/>
  </numFmts>
  <fonts count="14">
    <!-- 0: Regular 10pt Slate -->
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Segoe UI"/></font>
    <!-- 1: Bold 10pt White -->
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <!-- 2: Bold 11pt White -->
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <!-- 3: Bold 14pt Deep Teal -->
    <font><b/><sz val="14"/><color rgb="FF0F766E"/><name val="Segoe UI"/></font>
    <!-- 4: Bold 10pt Deep Teal -->
    <font><b/><sz val="10"/><color rgb="FF0F766E"/><name val="Segoe UI"/></font>
    <!-- 5: Bold 10pt Dark Green -->
    <font><b/><sz val="10"/><color rgb="FF166534"/><name val="Segoe UI"/></font>
    <!-- 6: Bold 10pt Amber Brown -->
    <font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Segoe UI"/></font>
    <!-- 7: Bold 10pt Crimson Red -->
    <font><b/><sz val="10"/><color rgb="FF991B1B"/><name val="Segoe UI"/></font>
    <!-- 8: Bold 10pt Ocean Blue -->
    <font><b/><sz val="10"/><color rgb="FF0369A1"/><name val="Segoe UI"/></font>
    <!-- 9: Bold 10pt Purple -->
    <font><b/><sz val="10"/><color rgb="FF6B21A8"/><name val="Segoe UI"/></font>
    <!-- 10: Bold 10pt Orange -->
    <font><b/><sz val="10"/><color rgb="FFC2410C"/><name val="Segoe UI"/></font>
    <!-- 11: 9pt Italic Slate -->
    <font><i/><sz val="9"/><color rgb="FF64748B"/><name val="Segoe UI"/></font>
    <!-- 12: Bold 10pt Dark Slate -->
    <font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/></font>
    <!-- 13: Regular 10pt Crimson Red -->
    <font><sz val="10"/><color rgb="FFDC2626"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="12">
    <!-- 0: none -->
    <fill><patternFill patternType="none"/></fill>
    <!-- 1: gray125 -->
    <fill><patternFill patternType="gray125"/></fill>
    <!-- 2: Deep Teal Header FF0F766E -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 3: Approved Green Soft FFDCFCE7 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 4: Pending Amber Soft FFFEF3C7 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 5: Rejected Red Soft FFFEE2E2 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 6: Overtime Blue Soft FFE0F2FE -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 7: Leave Purple Soft FFF3E8FF -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3E8FF"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 8: Advance Orange Soft FFFFEDD5 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFEDD5"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 9: Subtitle / Meta Soft Gray FFF1F5F9 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 10: Total Row Soft Slate FFE2E8F0 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 11: Zebra Alt Row FFF8FAFC -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
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
  <cellXfs count="28">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <!-- 1: Title -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <!-- 2: Subtitle / Meta -->
    <xf numFmtId="0" fontId="11" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
    <!-- 3: Table Header -->
    <xf numFmtId="0" fontId="2" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <!-- 4: Data Text Left -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <!-- 5: Data Text Center -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 6: Data Bold Left -->
    <xf numFmtId="0" fontId="12" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center"/></xf>
    <!-- 7: Data Bold Center -->
    <xf numFmtId="0" fontId="12" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 8: Data Number Right -->
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 9: Data Hours Right -->
    <xf numFmtId="164" fontId="12" fillId="0" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 10: Status Approved -->
    <xf numFmtId="0" fontId="5" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 11: Status Pending -->
    <xf numFmtId="0" fontId="6" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 12: Status Rejected -->
    <xf numFmtId="0" fontId="7" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 13: Type Overtime -->
    <xf numFmtId="0" fontId="8" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 14: Type Leave -->
    <xf numFmtId="0" fontId="9" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 15: Type Advance -->
    <xf numFmtId="0" fontId="10" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 16: Type Other -->
    <xf numFmtId="0" fontId="0" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 17: Total Label -->
    <xf numFmtId="0" fontId="4" fillId="10" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 18: Total Hours Formula -->
    <xf numFmtId="164" fontId="4" fillId="10" borderId="3" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 19: Total Amount Formula -->
    <xf numFmtId="165" fontId="4" fillId="10" borderId="3" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 20: Zebra Text Left -->
    <xf numFmtId="0" fontId="0" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <!-- 21: Zebra Text Center -->
    <xf numFmtId="0" fontId="0" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 22: Zebra Bold Left -->
    <xf numFmtId="0" fontId="12" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>
    <!-- 23: Zebra Bold Center -->
    <xf numFmtId="0" fontId="12" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <!-- 24: Zebra Number Right -->
    <xf numFmtId="165" fontId="0" fillId="11" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 25: Zebra Hours Right -->
    <xf numFmtId="164" fontId="12" fillId="11" borderId="1" xfId="0" applyFont="1" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="right" vertical="center"/></xf>
    <!-- 26: Red Text Left -->
    <xf numFmtId="0" fontId="13" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <!-- 27: Zebra Red Text Left -->
    <xf numFmtId="0" fontId="13" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
</styleSheet>`;
}

function getTypeStyleId(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('tăng ca')) return 13;
  if (t.includes('nghỉ')) return 14;
  if (t.includes('ứng')) return 15;
  return 16;
}

function getStatusStyleId(status) {
  if (status === 'approved') return 10;
  if (status === 'pending') return 11;
  if (status === 'rejected') return 12;
  return 5;
}

function getStatusLabel(status) {
  if (status === 'approved') return 'ĐÃ DUYỆT';
  if (status === 'pending') return 'CHỜ DUYỆT';
  if (status === 'rejected') return 'TỪ CHỐI';
  return status || '—';
}

/**
 * Tạo XML cho một Sheet dạng bảng tính
 */
function buildGenericSheetXml({
  sheetTitle = '',
  metaSubtitle = '',
  columns = [],
  dataRows = [],
  totalsConfig = null,
}) {
  const lastColLetter = colLetter(columns.length - 1);
  const rowsXml = [];
  const mergeCells = [];

  // Hàng 1: Tiêu đề Sheet
  rowsXml.push(
    `<row r="1" ht="28" customHeight="1">` +
    cellStr('A1', 1, sheetTitle) +
    `</row>`
  );
  mergeCells.push(`A1:${lastColLetter}1`);

  // Hàng 2: Subtitle / Meta
  rowsXml.push(
    `<row r="2" ht="20" customHeight="1">` +
    cellStr('A2', 2, metaSubtitle) +
    `</row>`
  );
  mergeCells.push(`A2:${lastColLetter}2`);

  // Hàng 3: Trống
  rowsXml.push(`<row r="3" ht="10" customHeight="1"></row>`);

  // Hàng 4: Header
  let r4Cells = '';
  columns.forEach((col, idx) => {
    r4Cells += cellStr(`${colLetter(idx)}4`, 3, col.label);
  });
  rowsXml.push(`<row r="4" ht="28" customHeight="1">${r4Cells}</row>`);

  // Dữ liệu
  const startDataRow = 5;
  dataRows.forEach((row, rowIdx) => {
    const rNum = startDataRow + rowIdx;
    const isZebra = rowIdx % 2 === 1;
    let rCells = '';

    columns.forEach((col, colIdx) => {
      const cRef = `${colLetter(colIdx)}${rNum}`;
      const val = row[col.key];

      if (col.type === 'status') {
        rCells += cellStr(cRef, getStatusStyleId(val), getStatusLabel(val));
      } else if (col.type === 'request_type') {
        rCells += cellStr(cRef, getTypeStyleId(val), val);
      } else if (col.type === 'number') {
        const num = Number(val || 0);
        rCells += cellNum(cRef, isZebra ? 24 : 8, num);
      } else if (col.type === 'hours') {
        const h = Number(val || 0);
        rCells += cellNum(cRef, isZebra ? 25 : 9, h);
      } else if (col.type === 'center_bold') {
        rCells += cellStr(cRef, isZebra ? 23 : 7, val);
      } else if (col.type === 'center') {
        rCells += cellStr(cRef, isZebra ? 21 : 5, val);
      } else if (col.type === 'bold') {
        rCells += cellStr(cRef, isZebra ? 22 : 6, val);
      } else if (col.type === 'danger_text') {
        rCells += cellStr(cRef, isZebra ? 27 : 26, val);
      } else {
        rCells += cellStr(cRef, isZebra ? 20 : 4, val);
      }
    });

    rowsXml.push(`<row r="${rNum}" ht="22" customHeight="1">${rCells}</row>`);
  });

  if (!dataRows.length) {
    rowsXml.push(
      `<row r="5" ht="24" customHeight="1">` +
      cellStr('A5', 4, 'Không có đơn nào thuộc danh mục này trong bộ lọc hiện tại.') +
      `</row>`
    );
    mergeCells.push(`A5:${lastColLetter}5`);
  }

  const lastDataRow = dataRows.length ? (startDataRow + dataRows.length - 1) : 5;
  let footerRowNum = lastDataRow;

  // Hàng Tổng Cộng (nếu có)
  if (totalsConfig && dataRows.length > 0) {
    footerRowNum = lastDataRow + 1;
    let footerCells = '';
    const labelEndCol = totalsConfig.labelColEndIndex || 0;

    // Các ô bên trái nhãn Tổng cộng
    columns.forEach((col, idx) => {
      const cRef = `${colLetter(idx)}${footerRowNum}`;
      if (idx === 0) {
        footerCells += cellStr(cRef, 17, totalsConfig.label || 'TỔNG CỘNG:');
      } else if (idx <= labelEndCol) {
        footerCells += cellEmpty(cRef, 17);
      } else if (totalsConfig.sumColumns && totalsConfig.sumColumns[col.key]) {
        const sumCfg = totalsConfig.sumColumns[col.key];
        const sumColLet = colLetter(idx);
        const formula = `SUM(${sumColLet}5:${sumColLet}${lastDataRow})`;
        const styleId = sumCfg.type === 'hours' ? 18 : 19;
        footerCells += cellFormula(cRef, styleId, formula, sumCfg.cachedTotal);
      } else {
        footerCells += cellEmpty(cRef, 17);
      }
    });

    if (labelEndCol > 0) {
      mergeCells.push(`A${footerRowNum}:${colLetter(labelEndCol)}${footerRowNum}`);
    }
    rowsXml.push(`<row r="${footerRowNum}" ht="26" customHeight="1">${footerCells}</row>`);
  }

  // Cấu hình độ rộng cột
  const colsXml = `<cols>` +
    columns.map((c, idx) => `<col min="${idx + 1}" max="${idx + 1}" width="${c.width || 15}" customWidth="1"/>`).join('') +
    `</cols>`;

  // Merged Cells
  let mergeCellsXml = '';
  if (mergeCells.length) {
    mergeCellsXml = `<mergeCells count="${mergeCells.length}">` +
      mergeCells.map((m) => `<mergeCell ref="${m}"/>`).join('') +
      `</mergeCells>`;
  }

  // Freeze pane: Cố định 4 hàng đầu
  const freezeRow = 4;
  const freezeCell = `A${freezeRow + 1}`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColLetter}${footerRowNum}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="${freezeRow}" topLeftCell="${freezeCell}" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="${freezeCell}" sqref="${freezeCell}"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  <sheetData>
    ${rowsXml.join('')}
  </sheetData>
  <autoFilter ref="A4:${lastColLetter}${footerRowNum}"/>
  ${mergeCellsXml}
</worksheet>`;
}

/**
 * Trình xuất chính Workbook Danh sách đơn từ & Tăng ca
 */
export async function exportLeaveRequestsWorkbook({
  requests = [],
  employees = [],
  filterSummary = '',
  filename = '',
}) {
  const employeesMap = new Map((employees || []).map((e) => [String(e.id || e.code || '').toLowerCase(), e]));

  // Chuẩn bị dữ liệu hiển thị chung
  const enrichedRequests = requests.map((req, idx) => {
    const emp = employeesMap.get(String(req.employee || '').toLowerCase()) || {
      id: req.employee,
      name: req.employee === 'PVC-IT' ? 'Admin IT' : (req.employee || 'Nhân sự'),
      department: 'it',
      branchId: 'pham-van-chieu',
      role: '—',
    };

    const otHours = req.overtimeMinutes ? Math.round((req.overtimeMinutes / 60) * 10) / 10 : 0;
    const leaveDays = calcLeaveDays(req.from, req.to);
    const branchName = getBranchLabel(emp.branchId);
    const reviewerName = (req.reviewer && employeesMap.get(String(req.reviewer).toLowerCase())?.name) ||
      (req.reviewer === 'PVC-IT' ? 'Đào Thái Bảo (Admin IT)' : (req.reviewer || 'Quản lý / HR'));

    return {
      raw: req,
      stt: idx + 1,
      empCode: emp.id || req.employee,
      empName: emp.name,
      deptName: departmentName(emp.department),
      branchName,
      empRole: emp.role || '—',
      requestType: req.type || 'Đơn',
      fromDate: formatVnDate(req.from),
      toDate: formatVnDate(req.to),
      timeRange: (req.startTime && req.endTime) ? `${req.startTime}–${req.endTime}` : '—',
      otHours: otHours > 0 ? otHours : '',
      amount: req.amount || 0,
      bankAccount: req.bankAccount || '',
      reason: req.reason || '—',
      status: req.status || 'pending',
      workflow: getWorkflowLabel(req),
      reviewer: reviewerName,
      createdAt: formatVnDateTime(req.createdAt || req.from),
      rejectionReason: req.rejectionReason || '',
      leaveDays,
    };
  });

  const nowStr = formatVnDateTime(new Date());
  const metaCommon = `Thời điểm xuất: ${nowStr}  |  Phạm vi: ${filterSummary || 'Tất cả đơn theo bộ lọc'}  |  Hệ thống quản trị Nha Khoa 5S`;

  // 1. Sheet 1: Tất cả đơn từ (Tổng hợp)
  const colsSheet1 = [
    { key: 'stt', label: 'STT', width: 6, type: 'center' },
    { key: 'empCode', label: 'MÃ NV', width: 14, type: 'center_bold' },
    { key: 'empName', label: 'HỌ VÀ TÊN', width: 25, type: 'bold' },
    { key: 'deptName', label: 'PHÒNG BAN', width: 18, type: 'text' },
    { key: 'branchName', label: 'CƠ SỞ / CHI NHÁNH', width: 18, type: 'text' },
    { key: 'empRole', label: 'CHỨC DANH', width: 22, type: 'text' },
    { key: 'requestType', label: 'LOẠI ĐƠN', width: 18, type: 'request_type' },
    { key: 'fromDate', label: 'TỪ NGÀY', width: 13, type: 'center' },
    { key: 'toDate', label: 'ĐẾN NGÀY', width: 13, type: 'center' },
    { key: 'timeRange', label: 'KHUNG GIỜ CA', width: 15, type: 'center' },
    { key: 'otHours', label: 'GIỜ TĂNG CA (H)', width: 16, type: 'hours' },
    { key: 'amount', label: 'TIỀN TẠM ỨNG (Đ)', width: 18, type: 'number' },
    { key: 'reason', label: 'LÝ DO CỦA NHÂN SỰ', width: 38, type: 'text' },
    { key: 'status', label: 'TRẠNG THÁI', width: 15, type: 'status' },
    { key: 'workflow', label: 'TIẾN TRÌNH XÉT DUYỆT', width: 24, type: 'text' },
    { key: 'reviewer', label: 'NGƯỜI DUYỆT', width: 22, type: 'text' },
    { key: 'createdAt', label: 'THỜI ĐIỂM GỬI', width: 18, type: 'center' },
    { key: 'rejectionReason', label: 'LÝ DO TỪ CHỐI (NẾU CÓ)', width: 30, type: 'danger_text' },
  ];

  const totalOtSheet1 = enrichedRequests.reduce((acc, r) => acc + (Number(r.otHours) || 0), 0);
  const totalAmountSheet1 = enrichedRequests.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  const sheet1Xml = buildGenericSheetXml({
    sheetTitle: 'HỆ THỐNG NHA KHOA 5S — TỔNG HỢP TOÀN BỘ ĐƠN TỪ & TĂNG CA',
    metaSubtitle: `${metaCommon}  |  Tổng số: ${enrichedRequests.length} đơn`,
    columns: colsSheet1,
    dataRows: enrichedRequests,
    totalsConfig: {
      label: 'TỔNG CỘNG TOÀN BỘ ĐƠN:',
      labelColEndIndex: 9,
      sumColumns: {
        otHours: { type: 'hours', cachedTotal: totalOtSheet1 },
        amount: { type: 'number', cachedTotal: totalAmountSheet1 },
      },
    },
  });

  // 2. Sheet 2: Đơn Tăng Ca
  const otRequests = enrichedRequests
    .filter((r) => String(r.requestType).toLowerCase().includes('tăng ca') || Number(r.otHours) > 0)
    .map((r, idx) => ({ ...r, stt: idx + 1 }));

  const colsSheet2 = [
    { key: 'stt', label: 'STT', width: 6, type: 'center' },
    { key: 'empCode', label: 'MÃ NV', width: 14, type: 'center_bold' },
    { key: 'empName', label: 'HỌ VÀ TÊN', width: 25, type: 'bold' },
    { key: 'deptName', label: 'PHÒNG BAN', width: 18, type: 'text' },
    { key: 'branchName', label: 'CƠ SỞ / CHI NHÁNH', width: 18, type: 'text' },
    { key: 'fromDate', label: 'NGÀY TĂNG CA', width: 14, type: 'center' },
    { key: 'timeRange', label: 'KHUNG GIỜ TĂNG CA', width: 18, type: 'center' },
    { key: 'otHours', label: 'SỐ GIỜ TĂNG CA (H)', width: 20, type: 'hours' },
    { key: 'reason', label: 'LÝ DO TĂNG CA / CÔNG VIỆC', width: 42, type: 'text' },
    { key: 'status', label: 'TRẠNG THÁI', width: 15, type: 'status' },
    { key: 'workflow', label: 'TIẾN TRÌNH DUYỆT', width: 24, type: 'text' },
    { key: 'reviewer', label: 'NGƯỜI DUYỆT', width: 22, type: 'text' },
    { key: 'createdAt', label: 'THỜI ĐIỂM GỬI', width: 18, type: 'center' },
  ];

  const totalOtHoursSheet2 = otRequests.reduce((acc, r) => acc + (Number(r.otHours) || 0), 0);

  const sheet2Xml = buildGenericSheetXml({
    sheetTitle: 'BẢNG ĐỐI SOÁT CÔNG TĂNG CA (OVERTIME) — NHA KHOA 5S',
    metaSubtitle: `${metaCommon}  |  Tổng số: ${otRequests.length} đơn tăng ca  |  Tổng giờ: ${totalOtHoursSheet2.toFixed(1)}h`,
    columns: colsSheet2,
    dataRows: otRequests,
    totalsConfig: {
      label: 'TỔNG CỘNG SỐ GIỜ TĂNG CA (H):',
      labelColEndIndex: 6,
      sumColumns: {
        otHours: { type: 'hours', cachedTotal: totalOtHoursSheet2 },
      },
    },
  });

  // 3. Sheet 3: Đơn Nghỉ Phép
  const leaveRequests = enrichedRequests
    .filter((r) => String(r.requestType).toLowerCase().includes('nghỉ'))
    .map((r, idx) => ({ ...r, stt: idx + 1 }));

  const colsSheet3 = [
    { key: 'stt', label: 'STT', width: 6, type: 'center' },
    { key: 'empCode', label: 'MÃ NV', width: 14, type: 'center_bold' },
    { key: 'empName', label: 'HỌ VÀ TÊN', width: 25, type: 'bold' },
    { key: 'deptName', label: 'PHÒNG BAN', width: 18, type: 'text' },
    { key: 'branchName', label: 'CƠ SỞ / CHI NHÁNH', width: 18, type: 'text' },
    { key: 'fromDate', label: 'TỪ NGÀY', width: 13, type: 'center' },
    { key: 'toDate', label: 'ĐẾN NGÀY', width: 13, type: 'center' },
    { key: 'leaveDays', label: 'SỐ NGÀY NGHỈ', width: 15, type: 'number' },
    { key: 'reason', label: 'LÝ DO XIN NGHỈ', width: 42, type: 'text' },
    { key: 'status', label: 'TRẠNG THÁI', width: 15, type: 'status' },
    { key: 'workflow', label: 'TIẾN TRÌNH DUYỆT', width: 24, type: 'text' },
    { key: 'reviewer', label: 'NGƯỜI DUYỆT', width: 22, type: 'text' },
    { key: 'rejectionReason', label: 'LÝ DO TỪ CHỐI (NẾU CÓ)', width: 30, type: 'danger_text' },
  ];

  const totalLeaveDaysSheet3 = leaveRequests.reduce((acc, r) => acc + (Number(r.leaveDays) || 0), 0);

  const sheet3Xml = buildGenericSheetXml({
    sheetTitle: 'BẢNG THEO DÕI NGHỈ PHÉP & TRỪ CÔNG — NHA KHOA 5S',
    metaSubtitle: `${metaCommon}  |  Tổng số: ${leaveRequests.length} đơn nghỉ phép  |  Tổng ngày nghỉ: ${totalLeaveDaysSheet3} ngày`,
    columns: colsSheet3,
    dataRows: leaveRequests,
    totalsConfig: {
      label: 'TỔNG CỘNG SỐ NGÀY NGHỈ PHÉP:',
      labelColEndIndex: 6,
      sumColumns: {
        leaveDays: { type: 'number', cachedTotal: totalLeaveDaysSheet3 },
      },
    },
  });

  // 4. Sheet 4: Ứng Lương & Đơn Khác
  const otherRequests = enrichedRequests
    .filter((r) => !String(r.requestType).toLowerCase().includes('tăng ca') && !String(r.requestType).toLowerCase().includes('nghỉ'))
    .map((r, idx) => ({ ...r, stt: idx + 1 }));

  const colsSheet4 = [
    { key: 'stt', label: 'STT', width: 6, type: 'center' },
    { key: 'empCode', label: 'MÃ NV', width: 14, type: 'center_bold' },
    { key: 'empName', label: 'HỌ VÀ TÊN', width: 25, type: 'bold' },
    { key: 'deptName', label: 'PHÒNG BAN', width: 18, type: 'text' },
    { key: 'branchName', label: 'CƠ SỞ / CHI NHÁNH', width: 18, type: 'text' },
    { key: 'requestType', label: 'LOẠI ĐƠN', width: 18, type: 'request_type' },
    { key: 'fromDate', label: 'NGÀY ÁP DỤNG', width: 14, type: 'center' },
    { key: 'amount', label: 'SỐ TIỀN ỨNG (VNĐ)', width: 20, type: 'number' },
    { key: 'bankAccount', label: 'SỐ TÀI KHOẢN NHẬN TIỀN', width: 26, type: 'text' },
    { key: 'reason', label: 'LÝ DO / NỘI DUNG CHI TIẾT', width: 40, type: 'text' },
    { key: 'status', label: 'TRẠNG THÁI', width: 15, type: 'status' },
    { key: 'reviewer', label: 'NGƯỜI DUYỆT', width: 22, type: 'text' },
    { key: 'createdAt', label: 'THỜI ĐIỂM GỬI', width: 18, type: 'center' },
  ];

  const totalAdvanceAmountSheet4 = otherRequests.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  const sheet4Xml = buildGenericSheetXml({
    sheetTitle: 'BẢNG THEO DÕI TẠM ỨNG LƯƠNG & ĐƠN KHÁC — NHA KHOA 5S',
    metaSubtitle: `${metaCommon}  |  Tổng số: ${otherRequests.length} đơn  |  Tổng tiền tạm ứng: ${totalAdvanceAmountSheet4.toLocaleString('vi-VN')} đ`,
    columns: colsSheet4,
    dataRows: otherRequests,
    totalsConfig: {
      label: 'TỔNG TIỀN TẠM ỨNG (VNĐ):',
      labelColEndIndex: 6,
      sumColumns: {
        amount: { type: 'number', cachedTotal: totalAdvanceAmountSheet4 },
      },
    },
  });

  // Package OpenXML files
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
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
  <sheets>
    <sheet name="Tất cả đơn từ" sheetId="1" r:id="rId1"/>
    <sheet name="Đơn Tăng ca" sheetId="2" r:id="rId2"/>
    <sheet name="Đơn Nghỉ phép" sheetId="3" r:id="rId3"/>
    <sheet name="Ứng lương &amp; Khác" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
</Relationships>`;

  const stylesXml = buildLeaveStylesXml();

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
  ];

  const zipBytes = createZipArchive(files);
  const outName = filename || `Danh_Sach_Don_Tu_5S_${new Date().toISOString().slice(0, 10)}.xlsx`;

  if (typeof document !== 'undefined') {
    downloadFile(
      zipBytes,
      outName,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }

  return zipBytes;
}
