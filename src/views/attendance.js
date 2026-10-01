import {
  adjustAttendanceRecord,
  adjustOvertimeRecord,
  clockIn, clockOut,
  deleteAttendanceDayRecords,
  deleteOvertimeRecord,
  discardRejectedAttendance,
  getAttendance,
  getAttendanceWorkSummary,
  getOfflineQueue,
  getOvertimeRecord,
  getRejectedQueue,
  syncOfflineAttendance
} from '../services/attendance.js';
import { getEmployees } from '../services/employees.js';
import {
  createScheduleAssignment,
  deleteScheduleAssignment,
  getEmployeeAllowedShifts,
  getScheduleAssignments,
  getShiftConfiguration,
} from '../services/schedule.js';
import {
  acquireCurrentPosition,
  acquirePrecisePosition,
  getGeolocationPermissionState,
  getOrCreateDeviceId,
  isGeolocationPermissionDenied,
} from '../services/geolocation.js';
import { captureWorkplacePhoto, startWorkplaceCamera, stopWorkplaceCamera } from '../services/camera.js';
import { listPendingProofs, movePendingProof, removePendingProof, savePendingProof, syncPendingProofs, uploadAttendanceProof } from '../services/attendance-proofs.js';
import { BRANCH, BRANCHES, clinicDateISO, clinicTimeLabel } from '../branch.js';
import { canEditAttendance, isOpsRole, khongPhaiChamCong } from '../permissions.js';
import { navigateTo } from '../router.js';
import { store } from '../store.js';
import { departmentName, distanceMeters, downloadText, escapeHTML, formatDateTime, formatTime, isPgEmployee, normalizeText, smartMatch } from '../utils.js';
import { statusPill } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import {
  createZipArchive,
  downloadFile,
  exportTableToExcel,
  exportWorkbookToExcel,
  generateWorkbookBuffer,
} from '../services/excel-export.js';
import { exportAttendanceMatrixWorkbook, sortEmployeesByPosition } from '../services/attendance-matrix-export.js';
import { renderView as renderPgAttendance, initView as initPgAttendance } from './pg-attendance.js';
import { SHIFTS, defaultShiftForDepartment, effectiveShiftId } from '../constants.js';

let context = null;
let lastLocation = null;
let locationRequestId = 0;
let clockTimer = null;
let capturedPhoto = null;
let capturedPhotoUrl = '';
let currentEventId = null;
let cameraStarting = false;
let attendanceSearch = '';
let attendanceSearchMode = 'near';
let attendanceDepartmentFilter = 'all';
let attendanceBranchFilter = 'all';
let attendanceTypeFilter = 'all';
let attendanceStatusFilter = 'all';
let attendanceDateFilter = '';
let attendanceWorkMonth = '';
let attendanceWorkStatusFilter = 'all';
let attendanceWorkBranchFilter = 'all';
let attendanceWorkPage = 1;
let attendanceHistoryMonth = '';
let attendanceHistoryType = 'all';
let attendanceHistoryBranch = 'all';
let attendanceHistoryPage = 1;
let attendanceAdminPage = 1;
let attendanceAdminPageSize = 10;
let attendanceActiveTab = 'workdays';
let attendanceAdminSelectedEmployee = '';
const ATTENDANCE_PAGE_SIZE = 10;
const REQUIRE_CHECKIN_PHOTO = false;

function makeEventId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mergeRecords(...groups) {
  const seen = new Set();
  return groups.flat().filter((record) => {
    const key = record.clientEventId || record.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.time) - new Date(a.time));
}

function currentEmployeeFallback(state) {
  return {
    id: state.employeeCode,
    name: state.profile?.full_name || 'Nhân viên',
    department: state.department || '',
    role: 'Nhân viên',
    shift: defaultShiftForDepartment(state.department),
  };
}

function settingsForBranch(branchId, stateSettings = null) {
  const branch = BRANCHES[branchId] || BRANCH;
  const base = {
    branchId: branch.id, clinicName: branch.name, clinicAddress: branch.address,
    latitude: branch.latitude, longitude: branch.longitude,
    allowedRadius: branch.allowedRadius, maxGpsAccuracy: branch.maxGpsAccuracy,
    checkinTime: branch.checkinTime, checkinGraceMinutes: branch.checkinGraceMinutes,
    timeZone: branch.timeZone,
  };
  return stateSettings?.branchId === branch.id ? { ...base, ...stateSettings } : base;
}

/*
 * Chấm công chỉ còn hai trạng thái: đã xác nhận vào ca, và đã xác nhận ra ca.
 *
 * Nhãn lấy từ LOẠI bản ghi, không từ một phán xét trễ hay muộn. Phán xét đó
 * đã bị bỏ vì nó dựa trên ca làm mà backend đoán ra, và ca đoán ra không phải
 * lúc nào cũng là ca người dùng nhìn thấy trên màn hình. Một nhãn "Đi muộn"
 * sai làm người bị gắn mất lòng tin vào cả hệ thống.
 *
 * Việc đối chiếu trễ muộn được thực hiện trong bảng công việc, dựa trên ca
 * đã phân và hai mốc vào/ra lưu tại máy chủ.
 */
function attendanceTone(record) {
  if (record?.isOfflinePending) return 'warn';
  return 'good';
}

function attendanceLabel(record) {
  if (record?.isOfflinePending) return 'Chờ đồng bộ';
  return (record?.type === 'checkout' || record?.record_type === 'checkout') ? 'Đã xác nhận ra ca' : 'Đã xác nhận vào ca';
}

function recordTypeLabel(record) {
  return record?.type === 'checkout' ? 'Check-out' : 'Check-in';
}

function minuteLabel(value) {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function paginationPages(currentPage, pageCount) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const start = Math.min(Math.max(1, currentPage - 2), pageCount - 4);
  return Array.from({ length: 5 }, (_, index) => start + index);
}

function renderAttendancePagination({ page, pageCount, total, pageSize, prefix, unit = 'lượt', showPageSize = false }) {
  const offset = (page - 1) * pageSize;
  const first = total ? offset + 1 : 0;
  const last = Math.min(offset + pageSize, total);
  const pages = paginationPages(page, pageCount);
  return `<div class="attendance-pagination attendance-pagination-complete">
    <div class="attendance-pagination-summary">
      <strong>Hiển thị ${first}–${last}</strong><span>trong ${total} ${unit}</span>
      ${showPageSize ? `<label>Số dòng<select id="attendanceAdminPageSize">${[10, 20, 50].map((size) => `<option value="${size}" ${pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}</select></label>` : ''}
    </div>
    <nav class="attendance-page-controls" aria-label="Phân trang chấm công">
      <button type="button" data-action="${prefix}-first" aria-label="Trang đầu" ${page <= 1 ? 'disabled' : ''}>«</button>
      <button type="button" data-action="${prefix}-prev" ${page <= 1 ? 'disabled' : ''}>‹ Trước</button>
      <span class="attendance-page-numbers">${pages.map((number) => `<button type="button" data-action="${prefix}-page" data-page="${number}" class="${number === page ? 'is-active' : ''}" aria-current="${number === page ? 'page' : 'false'}">${number}</button>`).join('')}</span>
      <button type="button" data-action="${prefix}-next" ${page >= pageCount ? 'disabled' : ''}>Sau ›</button>
      <button type="button" data-action="${prefix}-last" data-page="${pageCount}" aria-label="Trang cuối" ${page >= pageCount ? 'disabled' : ''}>»</button>
    </nav>
  </div>`;
}

function formatShiftDisplayName(day) {
  if (day?.shift_name && !day.shift_name.startsWith('Ca CHIEU') && !day.shift_name.startsWith('Ca SANG')) {
    return day.shift_name;
  }
  const code = String(day?.shift_code || day?.shift_name || '').trim();
  if (!code) return 'Chưa có ca';
  const found = SHIFTS.find((s) => s.id === code || s.name === code);
  if (found) return found.name;
  const upper = code.toUpperCase();
  if (upper === 'CHIEU' || upper === 'C' || upper.includes('AFTERNOON') || upper.includes('CHIỀU')) return 'Ca chiều';
  if (upper === 'SANG' || upper === 'S' || upper.includes('MORNING') || upper.includes('SÁNG')) return 'Ca sáng';
  if (upper === 'HC' || upper === 'HANH_CHINH' || upper.includes('OFFICE') || upper.includes('HÀNH CHÍNH')) return 'Ca hành chính';
  if (upper === 'FULL' || upper === 'F') return 'Ca full';
  return day?.shift_name || code;
}

function workDayStatus(day) {
  const labels = {
    complete: ['Đủ vào/ra', 'good'],
    in_progress: ['Đang trong ca', 'good'],
    attendance_anomaly: ['Dữ liệu bất thường', 'bad'],
    missing_checkin: ['Thiếu check-in', 'bad'],
    missing_checkout: ['Thiếu check-out', 'bad'],
    no_attendance: ['Chưa chấm công', 'warn'],
    missing_shift: ['Thiếu ca làm', 'warn'],
  };
  return labels[day?.status] || ['Cần kiểm tra', 'warn'];
}

function renderWorkSummary(summary, month, targetEmployee = null, canEdit = false) {
  const employeeTitle = targetEmployee ? `Bảng công: ${escapeHTML(targetEmployee.name)} (${escapeHTML(targetEmployee.id)})` : 'Công làm việc của tôi';
  if (!summary) {
    return `<section class="attendance-work-panel">
      <div class="section-title attendance-work-heading">
        <div><p class="eyebrow">Bảng công việc</p><h3>${employeeTitle}</h3></div>
        ${canEdit ? `
        <div style="display:inline-flex; gap:8px;">
          <button class="primary-button" type="button" data-action="open-adjust-modal" style="font-size:0.85rem;padding:6px 14px;">+ Bổ sung công</button>
          <button class="primary-button" type="button" data-action="open-overtime-modal" style="font-size:0.85rem;padding:6px 14px; background:#0f766e; border-color:#0f766e;"><i class="ri-add-circle-line"></i> Bổ sung tăng ca</button>
        </div>` : ''}
      </div>
      <div class="attendance-empty"><strong>Chưa có dữ liệu bảng công của nhân sự này</strong><span>${canEdit ? 'Bấm nút "+ Bổ sung công" hoặc "+ Bổ sung tăng ca" ở trên để nhập hoặc điều chỉnh cho nhân sự.' : 'Nhân sự chưa có dữ liệu ngày công được ghi nhận trong tháng này.'}</span></div>
    </section>`;
  }
  const totals = summary.totals || {};
  const filtered = [...(summary.days || [])].filter((day) => {
    if (attendanceWorkStatusFilter !== 'all' && day.status !== attendanceWorkStatusFilter) return false;
    if (attendanceWorkBranchFilter !== 'all' && day.branch_id !== attendanceWorkBranchFilter) return false;
    return true;
  }).reverse();
  const pageCount = Math.max(1, Math.ceil(filtered.length / ATTENDANCE_PAGE_SIZE));
  attendanceWorkPage = Math.min(Math.max(1, attendanceWorkPage), pageCount);
  const offset = (attendanceWorkPage - 1) * ATTENDANCE_PAGE_SIZE;
  const days = filtered.slice(offset, offset + ATTENDANCE_PAGE_SIZE);
  if (context) {
    context.workSummary = summary;
    context.workRows = filtered;
    context.targetEmployee = targetEmployee;
  }
  return `<section class="attendance-work-panel${canEdit ? ' is-admin-work-summary' : ''}">
    <div class="section-title attendance-work-heading">
      <div><p class="eyebrow">Bảng công việc</p><h3>${employeeTitle}</h3><span class="subtle">Tính từ ca làm và chấm công đã xác nhận</span></div>
      <div class="attendance-work-actions">
        ${canEdit ? `
        <button class="primary-button" type="button" data-action="open-adjust-modal"><i class="ri-edit-2-line"></i> Điều chỉnh công</button>
        <button class="primary-button" type="button" data-action="open-overtime-modal" style="background:#0f766e; border-color:#0f766e;"><i class="ri-add-circle-line"></i> Bổ sung tăng ca</button>
        ` : ''}
        <button class="secondary-button" type="button" data-action="export-work-excel">Xuất Excel</button>
      </div>
    </div>
    <div class="attendance-work-summary-line">
      <span class="is-workday"><i class="ri-calendar-check-line"></i><small>Ngày công</small><b>${Number(totals.workdays || 0).toFixed(3).replace(/\.?0+$/, '')}</b></span>
      <span class="is-regular"><i class="ri-time-line"></i><small>Công thường</small><b>${minuteLabel(totals.regularMinutes)}</b></span>
      <span class="is-overtime"><i class="ri-add-circle-line"></i><small>Tăng ca đã duyệt</small><b>${minuteLabel(totals.overtimeMinutes)}</b></span>
      <span class="is-payable"><i class="ri-calculator-line"></i><small>Tổng tính công</small><b>${minuteLabel(totals.payableMinutes)}</b></span>
      <span class="is-review"><i class="ri-error-warning-line"></i><small>Cần đối chiếu</small><b>${Number(totals.incompleteDays || 0)} ngày</b></span>
    </div>
    <div class="table-wrap attendance-work-table"><table>
      <colgroup><col class="col-date"><col class="col-shift"><col class="col-time"><col class="col-work"><col class="col-overtime"><col class="col-deduction"><col class="col-credit"><col class="col-status">${canEdit ? '<col class="col-actions" style="width:170px;">' : ''}</colgroup>
      <thead><tr><th>Ngày & chi nhánh</th><th>Ca làm việc</th><th>Vào / Ra</th><th>Giờ công</th><th>Tăng ca duyệt</th><th>Đi muộn / Về sớm</th><th>Ngày công</th><th>Đối chiếu</th>${canEdit ? '<th>Thao tác</th>' : ''}</tr></thead>
      <tbody>${days.length ? days.map((day) => {
        const [label, tone] = workDayStatus(day);
        const isCross = day.checkout_branch_id && day.checkout_branch_id !== day.branch_id;
        const branchBadge = isCross
          ? `<span class="attendance-branch-badge is-cross" title="Vào: ${escapeHTML(BRANCHES[day.branch_id]?.shortName || day.branch_id)} ➔ Ra: ${escapeHTML(BRANCHES[day.checkout_branch_id]?.shortName || day.checkout_branch_id)}">${escapeHTML(BRANCHES[day.branch_id]?.code || day.branch_id)} ➔ ${escapeHTML(BRANCHES[day.checkout_branch_id]?.code || day.checkout_branch_id)}</span>`
          : `<span class="attendance-branch-badge is-${escapeHTML(day.branch_id || 'unknown')}">${escapeHTML(BRANCHES[day.branch_id]?.shortName || 'Chưa xác định')}</span>`;
        return `<tr class="attendance-data-row is-${escapeHTML(day.status || 'unknown')}">
          <td><strong>${new Date(`${day.work_date}T00:00:00`).toLocaleDateString('vi-VN')}</strong>${branchBadge}</td>
          <td><strong>${escapeHTML(formatShiftDisplayName(day))}</strong></td>
          <td><span class="attendance-time-pair"><b>${day.checkin_at ? formatTime(day.checkin_at) : '—'}</b>${day.late_checkin_minutes > 0 ? `<span class="pill" style="font-size:10px; background:#fee2e2; color:#991b1b; padding:1px 5px; border-radius:4px; margin-left:4px;" title="Trễ check-in mốc 5p trước ca (${day.required_checkin_time || 'trước 5p'}): ${day.late_checkin_minutes} phút">Trễ CI: ${day.late_checkin_minutes}p</span>` : ''}<i>→</i><b>${day.checkout_at ? formatTime(day.checkout_at) : '—'}</b></span></td>
          <td class="attendance-number is-primary">${minuteLabel(day.regular_minutes)}</td>
          <td class="attendance-number is-overtime">${minuteLabel(day.overtime_minutes)}</td>
          <td><span class="attendance-deduction"><em title="Đi muộn sau giờ vào ca: ${day.late_minutes} phút">${minuteLabel(day.late_minutes)}</em><em title="Về sớm trước giờ hết ca: ${day.early_leave_minutes} phút">${minuteLabel(day.early_leave_minutes)}</em></span></td>
          <td class="attendance-number is-credit">${Number(day.workday_credit || 0).toFixed(3).replace(/\.?0+$/, '')}</td>
          <td>${statusPill(label, tone)}</td>
          ${canEdit ? `<td>
            <div style="display:inline-flex; gap:4px; align-items:center;">
              <button type="button" class="btn-adjust-day" data-action="adjust-day" data-date="${day.work_date}" data-shift="${escapeHTML(day.shift_code || '')}" data-branch="${escapeHTML(day.branch_id || '')}" data-checkout-branch="${escapeHTML(day.checkout_branch_id || '')}" data-checkin="${day.checkin_at ? formatTime(day.checkin_at) : ''}" data-checkout="${day.checkout_at ? formatTime(day.checkout_at) : ''}">✎ Sửa công</button>
              <button type="button" class="btn-adjust-day" data-action="quick-overtime-day" data-date="${day.work_date}" title="Bổ sung / sửa tăng ca ngày này" style="color:#0f766e; border-color:#99f6e4; background:#f0fdfa;">+ Tăng ca</button>
            </div>
          </td>` : ''}
        </tr>`;
      }).join('') : '<tr><td colspan="' + (canEdit ? 9 : 8) + '" class="subtle">Chưa có dữ liệu phù hợp bộ lọc.</td></tr>'}</tbody>
    </table></div>
    <div class="attendance-pagination"><span>Hiển thị ${filtered.length ? offset + 1 : 0}–${Math.min(offset + ATTENDANCE_PAGE_SIZE, filtered.length)} trong ${filtered.length} ngày</span><div><button type="button" data-action="work-prev" ${attendanceWorkPage <= 1 ? 'disabled' : ''}>‹ Trước</button><b>${attendanceWorkPage}/${pageCount}</b><button type="button" data-action="work-next" ${attendanceWorkPage >= pageCount ? 'disabled' : ''}>Sau ›</button></div></div>
    <p class="attendance-formula-note"><b>Công thức:</b> Giờ công thường = thời lượng ca − đi muộn − về sớm. Tổng giờ tính công = giờ công thường + tăng ca có đơn được duyệt cuối cùng. Ngày thiếu giờ vào/ra hoặc có dữ liệu bất thường không tự cộng công.</p>
  </section>`;
}

function renderTodayCard(checkin, checkout, shift, employee) {
  if (checkout) {
    const isCross = checkin?.branchId && checkout?.branchId && checkin.branchId !== checkout.branchId;
    const branchDetail = isCross
      ? ` · Vào: ${BRANCHES[checkin.branchId]?.shortName || checkin.branchId} ➔ Ra: ${BRANCHES[checkout.branchId]?.shortName || checkout.branchId}`
      : (checkout.branchId ? ` · ${BRANCHES[checkout.branchId]?.shortName || ''}` : '');
    return `
      <section class="attendance-primary-card is-complete">
        <div class="attendance-success-mark" aria-hidden="true">✓</div>
        <div class="attendance-primary-copy">
          <p class="eyebrow">Ca làm hôm nay${isCross ? ' (Liên chi nhánh)' : ''}</p>
          <h3>${checkout.isOfflinePending ? 'Đã lưu giờ kết ca trên điện thoại' : 'Đã hoàn thành ca'}</h3>
          <p>${escapeHTML(employee.name)} · vào ${formatTime(checkin?.time)} · ra ${formatTime(checkout.time)} · GPS ${checkout.distance} m${escapeHTML(branchDetail)}</p>
        </div>
        ${statusPill(attendanceLabel(checkout), attendanceTone(checkout))}
      </section>
    `;
  }

  if (checkin) {
    const checkinBranchName = BRANCHES[checkin.branchId]?.shortName || '';
    return `
      <section class="attendance-primary-card is-active">
        <div class="attendance-success-mark" aria-hidden="true">✓</div>
        <div class="attendance-primary-copy">
          <p class="eyebrow">Đang trong ca làm việc${checkinBranchName ? ` · ${escapeHTML(checkinBranchName)}` : ''}</p>
          <h3>${checkin.isOfflinePending ? 'Đã lưu check-in trên điện thoại' : 'Check-in thành công'}</h3>
          <p>${escapeHTML(employee.name)} · ${formatTime(checkin.time)} · cách phòng khám ${checkin.distance} m</p>
        </div>
        <button class="attendance-checkout-button" type="button" data-action="checkout">
          <span class="attendance-button-icon" aria-hidden="true">↗</span>
          <span><strong>Check-out kết ca</strong><small>Xác minh GPS linh hoạt (PVC hoặc LVT)</small></span>
        </button>
      </section>
    `;
  }

  return `
    <section class="attendance-primary-card">
      <div class="attendance-time-block">
        <span>Giờ hiện tại</span>
        <strong id="attendanceLiveClock">${clinicTimeLabel()}</strong>
        <small>Ca làm ${escapeHTML(shift?.start || '08:00')}–${escapeHTML(shift?.end || '17:00')}</small>
      </div>
      <div class="attendance-primary-copy">
        <p class="eyebrow">Sẵn sàng check-in</p>
        <h3>Chào ${escapeHTML(employee.name)}</h3>
        <p>Hệ thống sẽ kiểm tra GPS trực tiếp trước khi cho phép xác nhận.</p>
      </div>
      <button class="attendance-checkin-button" type="button" data-action="open-checkin">
        <span class="attendance-button-icon" aria-hidden="true">⌖</span>
        <span><strong>Xác nhận chấm công</strong><small>Chỉ một lần trong ngày</small></span>
      </button>
    </section>
  `;
}

function renderHistory(records, employees, ops) {
  if (!records.length) {
    return '<div class="attendance-empty"><strong>Chưa có lượt chấm công</strong><span>Lịch sử sẽ xuất hiện sau lần check-in đầu tiên.</span></div>';
  }

  if (!ops) {
    const filtered = records.filter((record) => {
      const recordMonth = String(record.date || clinicDateISO(record.time)).slice(0, 7);
      if (attendanceHistoryMonth && recordMonth !== attendanceHistoryMonth) return false;
      if (attendanceHistoryType !== 'all' && record.type !== attendanceHistoryType) return false;
      if (attendanceHistoryBranch !== 'all' && record.branchId !== attendanceHistoryBranch) return false;
      return true;
    });
    const pageCount = Math.max(1, Math.ceil(filtered.length / ATTENDANCE_PAGE_SIZE));
    attendanceHistoryPage = Math.min(Math.max(1, attendanceHistoryPage), pageCount);
    const offset = (attendanceHistoryPage - 1) * ATTENDANCE_PAGE_SIZE;
    const rows = filtered.slice(offset, offset + ATTENDANCE_PAGE_SIZE);
    return `<div class="attendance-table-filters attendance-history-filters">
      <label><span>Tháng:</span><span style="display:inline-flex; gap:6px;">${renderVietnameseMonthYearSelects('attendanceHistoryMonthSelect', 'attendanceHistoryYearSelect', attendanceHistoryMonth)}</span></label>
      <label>Chi nhánh<select id="attendanceHistoryBranch"><option value="all">Tất cả</option>${Object.values(BRANCHES).map((branch) => `<option value="${branch.id}" ${attendanceHistoryBranch === branch.id ? 'selected' : ''}>${escapeHTML(branch.shortName)}</option>`).join('')}</select></label>
      <label>Loại lượt chấm<select id="attendanceHistoryType"><option value="all">Vào và ra ca</option><option value="checkin" ${attendanceHistoryType === 'checkin' ? 'selected' : ''}>Vào ca</option><option value="checkout" ${attendanceHistoryType === 'checkout' ? 'selected' : ''}>Ra ca</option></select></label>
    </div>
    <div class="table-wrap attendance-history-table"><table>
      <colgroup><col class="col-date"><col class="col-type"><col class="col-branch"><col class="col-distance"><col class="col-gps"><col class="col-status"></colgroup>
      <thead><tr><th>Thời gian</th><th>Loại</th><th>Chi nhánh</th><th>Khoảng cách</th><th>Độ chính xác GPS</th><th>Trạng thái</th></tr></thead>
      <tbody>${rows.length ? rows.map((record) => `<tr>
        <td><strong>${new Date(record.time).toLocaleDateString('vi-VN', { timeZone: BRANCH.timeZone })}</strong><span class="attendance-cell-subtitle">${formatTime(record.time)}</span></td>
        <td><span class="attendance-type-badge is-${escapeHTML(record.type)}">${recordTypeLabel(record)}</span></td>
        <td><span class="attendance-branch-badge is-${escapeHTML(record.branchId || 'unknown')}">${escapeHTML(BRANCHES[record.branchId]?.shortName || 'Chưa xác định')}</span></td>
        <td>${Number(record.distance || 0)} m</td>
        <td>±${Number(record.accuracy || 0)} m${record.capturedOffline ? '<br><span class="subtle">Ghi ngoại tuyến</span>' : ''}</td>
        <td>${statusPill(attendanceLabel(record), attendanceTone(record))}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="subtle">Chưa có dữ liệu phù hợp bộ lọc.</td></tr>'}</tbody>
    </table></div>
    <div class="attendance-pagination"><span>Hiển thị ${filtered.length ? offset + 1 : 0}–${Math.min(offset + ATTENDANCE_PAGE_SIZE, filtered.length)} trong ${filtered.length} lượt</span><div><button type="button" data-action="history-prev" ${attendanceHistoryPage <= 1 ? 'disabled' : ''}>‹ Trước</button><b>${attendanceHistoryPage}/${pageCount}</b><button type="button" data-action="history-next" ${attendanceHistoryPage >= pageCount ? 'disabled' : ''}>Sau ›</button></div></div>`;
  }

  const pageCount = Math.max(1, Math.ceil(records.length / attendanceAdminPageSize));
  attendanceAdminPage = Math.min(Math.max(1, attendanceAdminPage), pageCount);
  const offset = (attendanceAdminPage - 1) * attendanceAdminPageSize;
  const rows = records.slice(offset, offset + attendanceAdminPageSize);
  return `
    <div class="table-wrap attendance-admin-table">
      <table>
        <thead><tr><th>Nhân sự</th><th>Loại</th><th>Thời gian</th><th>Khoảng cách</th><th>GPS</th><th>Trạng thái</th></tr></thead>
        <tbody>${rows.map((record) => {
          const employee = employees.find((item) => item.id === record.employee);
          const employeeMeta = employee
            ? `${departmentName(employee.department)} · ${employee.role || 'Nhân viên'}`
            : 'Chưa liên kết hồ sơ nhân sự';
          return `<tr>
            <td><strong>${escapeHTML(employee?.name || record.employee)}</strong><br><span class="subtle">${escapeHTML(employeeMeta)}</span></td>
            <td><strong>${recordTypeLabel(record)}</strong></td>
            <td>${formatDateTime(record.time)}</td>
            <td>${record.distance} m</td>
            <td>±${record.accuracy} m${record.capturedOffline ? '<br><span class="subtle">Ghi ngoại tuyến</span>' : ''}</td>
            <td>${statusPill(attendanceLabel(record), attendanceTone(record))}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
    ${renderAttendancePagination({ page: attendanceAdminPage, pageCount, total: records.length, pageSize: attendanceAdminPageSize, prefix: 'admin-history', unit: 'bản ghi', showPageSize: true })}
  `;
}

function renderCheckinDialog(employee, shift, settings, allowedShifts, assignedShiftId = '') {
  const shiftChoices = allowedShifts.length ? allowedShifts : [shift].filter(Boolean);
  const assignmentLocked = Boolean(assignedShiftId);
  const selectedShift = shiftChoices.find((item) => item.id === assignedShiftId)
    || shiftChoices.find((item) => item.id === shift?.id)
    || shiftChoices[0]
    || { name: 'Chưa có ca', start: '—', end: '—' };
  return `
    <div class="checkin-dialog" id="checkinDialog" hidden>
      <button class="checkin-dialog-backdrop" type="button" data-action="close-checkin" aria-label="Đóng"></button>
      <section class="checkin-dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="checkinDialogTitle">
        <div class="checkin-dialog-handle" aria-hidden="true"></div>
        <div class="checkin-dialog-header">
          <div>
            <p class="eyebrow">Xác nhận một lần</p>
            <h2 id="checkinDialogTitle">Chấm công lúc vào làm</h2>
          </div>
          <button class="icon-button" type="button" data-action="close-checkin" aria-label="Đóng">×</button>
        </div>

        <div class="checkin-summary-grid">
          <div><span>Nhân viên</span><strong>${escapeHTML(employee.name)}</strong></div>
          <div><span>Ca làm hôm nay</span><strong id="selectedShiftSummary">${escapeHTML(selectedShift.name || 'Ca làm')} · ${escapeHTML(selectedShift.start || '—')}–${escapeHTML(selectedShift.end || '—')}</strong></div>
          <label class="full attendance-branch-choice">
            <span>Chi nhánh làm việc hôm nay</span>
            <select id="attendanceBranchChoice">
              ${Object.values(BRANCHES).map((branch) => `<option value="${escapeHTML(branch.id)}" ${branch.id === settings.branchId ? 'selected' : ''}>${escapeHTML(branch.shortName)}</option>`).join('')}
            </select>
            <small id="attendanceBranchAddress">${escapeHTML(settings.clinicAddress)}</small>
          </label>
        </div>

        <fieldset class="attendance-shift-picker">
          <legend>Chọn ca làm việc hôm nay</legend>
          <p>${assignmentLocked ? 'Ca đã được lịch phân công khóa cố định cho hôm nay.' : 'Chỉ hiển thị các ca hợp lệ theo đúng chức danh của bạn.'}</p>
          <div class="attendance-shift-options">
            ${shiftChoices.map((item) => `
              <label class="attendance-shift-option ${assignmentLocked && item.id !== assignedShiftId ? 'is-disabled' : ''}">
                <input type="radio" name="attendanceShift" value="${escapeHTML(item.id)}" ${(assignmentLocked ? item.id === assignedShiftId : item.id === selectedShift.id) ? 'checked' : ''} ${assignmentLocked && item.id !== assignedShiftId ? 'disabled' : ''}>
                <span><strong>${escapeHTML(item.name || 'Ca làm')}</strong><small>${escapeHTML(item.start)}–${escapeHTML(item.end)}</small></span>
              </label>
            `).join('')}
          </div>
        </fieldset>

        <div class="gps-confirm-state is-loading" id="gpsConfirmState" aria-live="polite">
          <div class="gps-radar" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 21s7-6.1 7-13a7 7 0 1 0-14 0c0 6.9 7 13 7 13Z" />
              <circle cx="12" cy="8" r="2.25" />
            </svg>
          </div>
          <div>
            <strong id="gpsStateTitle">Đang kết nối GPS…</strong>
            <p id="gpsStateDetail">Giữ màn hình sáng trong vài giây để lấy vị trí chính xác nhất.</p>
          </div>
        </div>

        <div class="location-permission-help" id="locationPermissionHelp" hidden>
          <strong>Cần bật lại quyền vị trí cho website</strong>
          <p>Trình duyệt sẽ không hỏi lại nếu quyền đã từng bị từ chối. Hãy đổi sang <b>Cho phép</b>, quay lại trang rồi bấm nút thử lại.</p>
          <div class="location-permission-steps">
            <span><b>Android · Chrome/Brave:</b> chạm biểu tượng bên trái thanh địa chỉ → Quyền → Vị trí → Cho phép.</span>
            <span><b>iPhone · Safari/Web App:</b> mở Cài đặt trang web → Vị trí → Cho phép; hoặc Cài đặt iPhone → Quyền riêng tư &amp; Bảo mật → Dịch vụ định vị.</span>
          </div>
        </div>

        <section class="workplace-camera" id="workplaceCameraSection" hidden>
          <div class="workplace-camera-heading">
            <div>
              <p class="eyebrow">Ảnh xác nhận tại nơi làm việc</p>
              <h3>Chụp trực tiếp bằng camera</h3>
            </div>
            <span>Không chọn từ thư viện</span>
          </div>
          <div class="workplace-camera-frame">
            <video id="workplaceCameraVideo" autoplay muted playsinline aria-label="Camera chụp nơi làm việc"></video>
            <img id="workplaceCameraPreview" alt="Ảnh nơi làm việc vừa chụp" hidden>
            <div class="workplace-camera-placeholder" id="workplaceCameraPlaceholder">
              <span aria-hidden="true">◉</span>
              <strong>Đang mở camera…</strong>
            </div>
          </div>
          <p class="workplace-camera-status" id="workplaceCameraStatus" aria-live="polite">Cho phép camera để chụp ảnh thực tế tại thời điểm chấm công.</p>
          <div class="workplace-camera-actions">
            <button class="primary-button" type="button" data-action="capture-photo" disabled>Chụp ảnh nơi làm việc</button>
            <button class="secondary-button" type="button" data-action="retake-photo" hidden>Chụp lại</button>
            <button class="secondary-button" type="button" data-action="retry-camera" hidden>Thử lại camera</button>
          </div>
        </section>

        <div class="checkin-policy-note">
          <span id="attendanceAccuracyRule">✓ Sai số GPS tối đa ${Number(settings.maxGpsAccuracy)} m</span>
          <span id="attendanceRadiusRule">✓ Trong bán kính ${Number(settings.allowedRadius)} m</span>
          <span>✓ Không hỗ trợ nhập tọa độ thủ công</span>
          <span>✓ Xác minh bằng ảnh đang tạm tắt</span>
        </div>

        <div class="checkin-dialog-actions">
          <button class="secondary-button" type="button" data-action="retry-location">Lấy lại vị trí</button>
          <button class="primary-button" id="confirmCheckinBtn" type="button" data-action="confirm-checkin" disabled>
            Hoàn tất chấm công
          </button>
        </div>
        <p class="checkin-offline-note">Nếu mất mạng, lượt chấm công vẫn được lưu trên điện thoại với đúng thời gian và GPS, sau đó tự đồng bộ.</p>
      </section>
    </div>
  `;
}

function employeeBranchName(employee) {
  if (employee?.branchId === 'marketing') return 'Khối Marketing';
  if (employee?.branchId === 'all') return 'Toàn hệ thống';
  return BRANCHES[employee?.branchId]?.shortName || 'Chưa gán chi nhánh';
}

function employeeInitials(name = '') {
  return String(name).trim().split(/\s+/).slice(-2).map((part) => part.charAt(0)).join('').toUpperCase() || 'NS';
}

function configuredShiftsForEmployee(employee, configuration) {
  const empId = String(employee?.id || '').toLowerCase();
  const empCode = String(employee?.code || '').toLowerCase();
  const empNumber = String(employee?.employeeNumber || '').toLowerCase();
  const codes = new Set((configuration?.allowed || [])
    .filter((item) => {
      const c = String(item.employee_code || '').toLowerCase();
      return (empId && c === empId) || (empCode && c === empCode) || (empNumber && c === empNumber);
    })
    .map((item) => item.shift_code));
  const configured = (configuration?.shifts || [])
    .filter((item) => item.active !== false && codes.has(item.code))
    .map((item) => ({ id: item.code, name: item.name, start: String(item.start_time).slice(0, 5), end: String(item.end_time).slice(0, 5) }));
  if (configured.length) return configured;

  const dept = String(employee?.department || '').toLowerCase();
  const role = String(employee?.role || '').toLowerCase();
  const title = String(employee?.title || '').toLowerCase();
  if (dept === 'phuta' || dept === 'dvkh' || role.includes('phụ tá') || role.includes('lễ tân') || title.includes('phụ tá') || title.includes('lễ tân') || role.includes('phu_ta') || role.includes('le_tan')) {
    return SHIFTS.filter((item) => ['front-office', 'front-morning', 'front-afternoon', 'front-full'].includes(item.id));
  }
  if (dept === 'bs' || role.includes('bác sĩ') || title.includes('bác sĩ') || role === 'bac_si') {
    return SHIFTS.filter((item) => ['doctor-office', 'doctor-morning', 'doctor-afternoon', 'doctor-full'].includes(item.id));
  }
  if (dept === 'baove' || title.includes('bảo vệ')) {
    return SHIFTS.filter((item) => ['security-weekday', 'security-sunday'].includes(item.id));
  }
  if (dept === 'laocong' || title.includes('tạp vụ')) {
    return SHIFTS.filter((item) => ['cleaning-weekday', 'cleaning-sunday'].includes(item.id));
  }
  const fallbackCode = employee?.shift || defaultShiftForDepartment(employee?.department);
  return SHIFTS.filter((item) => item.id === fallbackCode);
}

function renderAdminEmployeePicker(employees, selectedEmployee) {
  const branchOrder = ['pham-van-chieu', 'le-van-tho', 'marketing', 'unknown'];
  const groups = new Map(branchOrder.map((branch) => [branch, []]));
  [...employees].sort((left, right) => String(left.name).localeCompare(String(right.name), 'vi'))
    .forEach((employee) => {
      const branch = employee.branchId === 'marketing'
        ? 'marketing'
        : (BRANCHES[employee.branchId] ? employee.branchId : 'unknown');
      groups.get(branch).push(employee);
    });
  return `<div class="attendance-employee-combobox" id="attendanceEmployeeCombobox">
    <span class="attendance-field-label">Nhân sự đang kiểm tra</span>
    <button class="attendance-employee-trigger" type="button" data-action="toggle-employee-picker" aria-haspopup="listbox" aria-expanded="false">
      <span class="attendance-employee-avatar">${escapeHTML(employeeInitials(selectedEmployee?.name))}</span>
      <span class="attendance-employee-trigger-copy"><strong>${escapeHTML(selectedEmployee?.name || 'Chọn nhân sự')}</strong><small>${escapeHTML(selectedEmployee?.id || '—')} · ${escapeHTML(selectedEmployee?.role || departmentName(selectedEmployee?.department))}</small></span>
      <span class="attendance-employee-trigger-branch">${escapeHTML(employeeBranchName(selectedEmployee))}</span>
      <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
    </button>
    <div class="attendance-employee-popover" id="attendanceEmployeePopover" hidden>
      <label class="attendance-employee-search"><i class="ri-search-line"></i><input id="attendanceEmployeeSearch" type="search" placeholder="Tìm tên, mã nhân viên hoặc vị trí…" autocomplete="off"></label>
      <div class="attendance-employee-results" role="listbox">
        ${branchOrder.map((branch) => {
          const rows = groups.get(branch);
          if (!rows.length) return '';
          const title = branch === 'marketing'
            ? 'Khối Marketing / Telesale'
            : (branch === 'unknown' ? 'Chưa xác định chi nhánh' : BRANCHES[branch].shortName);
          return `<section class="attendance-employee-group" data-employee-group><header><span>${escapeHTML(title)}</span><b>${rows.length}</b></header>${rows.map((employee) => `<button type="button" role="option" data-action="select-attendance-employee" data-employee="${escapeHTML(employee.id)}" data-employee-search="${escapeHTML(normalizeText(`${employee.name} ${employee.id} ${employee.role} ${departmentName(employee.department)} ${employeeBranchName(employee)}`))}"><span class="attendance-employee-avatar">${escapeHTML(employeeInitials(employee.name))}</span><span><strong>${escapeHTML(employee.name)}</strong><small>${escapeHTML(employee.id)} · ${escapeHTML(employee.role || departmentName(employee.department))}</small></span><em>${escapeHTML(departmentName(employee.department))}</em></button>`).join('')}</section>`;
        }).join('')}
        <p class="attendance-employee-no-result" hidden>Không tìm thấy nhân sự phù hợp.</p>
      </div>
    </div>
  </div>`;
}

function renderSelectedEmployeeProfile(employee, allowedShifts) {
  return `<section class="attendance-selected-profile">
    <span class="attendance-profile-avatar">${escapeHTML(employeeInitials(employee?.name))}</span>
    <div class="attendance-profile-identity"><small>Hồ sơ đang đối chiếu</small><strong>${escapeHTML(employee?.name || 'Chưa chọn nhân sự')}</strong><span>${escapeHTML(employee?.id || '—')}</span></div>
    <div class="attendance-profile-facts">
      <span><small>Chi nhánh hồ sơ</small><b><i class="ri-map-pin-2-line"></i>${escapeHTML(employeeBranchName(employee))}</b></span>
      <span><small>Vị trí làm việc</small><b><i class="ri-briefcase-4-line"></i>${escapeHTML(employee?.role || departmentName(employee?.department))}</b></span>
      <span><small>Phòng ban</small><b><i class="ri-team-line"></i>${escapeHTML(departmentName(employee?.department))}</b></span>
    </div>
    <div class="attendance-profile-shifts"><small>Ca được phép</small><div>${allowedShifts.map((shift) => `<span><b>${escapeHTML(shift.name)}</b>${escapeHTML(shift.start)}–${escapeHTML(shift.end)}</span>`).join('') || '<span>Chưa cấu hình ca</span>'}</div></div>
    <div class="attendance-profile-actions">
      <button class="primary-button" type="button" data-action="open-adjust-modal"><i class="ri-time-line"></i> Bổ sung công</button>
      <button class="primary-button" type="button" data-action="open-overtime-modal" style="background:#0f766e; border-color:#0f766e;"><i class="ri-add-circle-line"></i> Bổ sung tăng ca</button>
      <button class="secondary-button" type="button" data-action="open-schedule-modal"><i class="ri-calendar-event-line"></i> Xếp / đổi ca</button>
    </div>
  </section>`;
}

function renderScheduleAdjustmentDialog(employee, allowedShifts) {
  return `<div class="attendance-adjust-dialog" id="scheduleAdjustModal" hidden>
    <button class="attendance-adjust-backdrop" type="button" data-action="close-schedule-modal" aria-label="Đóng"></button>
    <section class="attendance-adjust-sheet attendance-schedule-sheet" role="dialog" aria-modal="true" aria-labelledby="scheduleDialogTitle">
      <div class="attendance-adjust-header"><div><p class="eyebrow">Phân ca nhân sự</p><h2 id="scheduleDialogTitle">Xếp hoặc thay đổi ca làm</h2></div><button class="icon-button" type="button" data-action="close-schedule-modal" aria-label="Đóng"><i class="ri-close-line"></i></button></div>
      <div class="schedule-dialog-person"><span class="attendance-employee-avatar">${escapeHTML(employeeInitials(employee?.name))}</span><div><strong>${escapeHTML(employee?.name || '')}</strong><small>${escapeHTML(employee?.id || '')} · ${escapeHTML(employee?.role || departmentName(employee?.department))}</small></div><em>${escapeHTML(employeeBranchName(employee))}</em></div>
      <form id="scheduleAdjustForm" data-assignment-id="">
        <input id="scheduleEmployee" type="hidden" value="${escapeHTML(employee?.id || '')}">
        <div class="attendance-adjust-grid">
          <label><span>Ngày làm việc *</span><input type="date" id="scheduleWorkDate" required value="${clinicDateISO()}"></label>
          <label><span>Chi nhánh làm việc *</span><select id="scheduleBranch" required>${Object.values(BRANCHES).map((branch) => `<option value="${branch.id}" ${employee?.branchId === branch.id ? 'selected' : ''}>${escapeHTML(branch.shortName)}</option>`).join('')}</select></label>
          <fieldset class="schedule-shift-choice full"><legend>Ca làm việc theo đúng vị trí</legend>${allowedShifts.map((shift, index) => `<label><input type="radio" name="scheduleShift" value="${escapeHTML(shift.id)}" ${index === 0 ? 'checked' : ''}><span><b>${escapeHTML(shift.name)}</b><small>${escapeHTML(shift.start)}–${escapeHTML(shift.end)}</small></span></label>`).join('') || '<p>Nhân sự chưa được cấu hình ca hợp lệ.</p>'}</fieldset>
          <label class="full"><span>Ghi chú sắp xếp</span><textarea id="scheduleNote" rows="3" placeholder="Ví dụ: Đổi ca theo điều phối ngày, hỗ trợ chi nhánh khác…"></textarea></label>
        </div>
        <div class="attendance-adjust-actions"><button type="button" class="danger-btn" id="scheduleDeleteBtn" hidden><i class="ri-delete-bin-6-line"></i> Xóa lịch ngày này</button><button class="secondary-button" type="button" data-action="close-schedule-modal">Hủy</button><button class="primary-button" type="submit" id="scheduleSubmitBtn"><i class="ri-save-3-line"></i> Lưu lịch làm</button></div>
      </form>
    </section>
  </div>`;
}

function renderVietnameseMonthYearSelects(monthId, yearId, selectedISO) {
  const [yStr, mStr] = String(selectedISO || todayISO().slice(0, 7)).split('-');
  const curY = Number(yStr) || new Date().getFullYear();
  const curM = Number(mStr) || (new Date().getMonth() + 1);
  const years = [2025, 2026, 2027];

  const mOptions = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const val = String(m).padStart(2, '0');
    return `<option value="${val}" ${curM === m ? 'selected' : ''}>Tháng ${m}</option>`;
  }).join('');

  const yOptions = years.map((y) => `<option value="${y}" ${curY === y ? 'selected' : ''}>Năm ${y}</option>`).join('');

  return `
    <select id="${monthId}" style="flex:1; min-width:96px; padding:7px 10px; border:1px solid #cbd5e1; border-radius:6px; font-weight:500; font-size:0.85rem; background:#fff;">
      ${mOptions}
    </select>
    <select id="${yearId}" style="width:105px; padding:7px 10px; border:1px solid #cbd5e1; border-radius:6px; font-weight:500; font-size:0.85rem; background:#fff;">
      ${yOptions}
    </select>
  `;
}

function renderCompanySplitExportDialog(canEdit = false, workMonth = '') {
  if (!canEdit) return '';
  const hasDirPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  return `
    <div class="attendance-adjust-dialog" id="companySplitExportModal" hidden>
      <button class="attendance-adjust-backdrop" type="button" data-action="close-company-split-modal" aria-label="Đóng"></button>
      <section class="attendance-adjust-sheet" role="dialog" aria-modal="true" aria-labelledby="companySplitTitle" style="max-width:580px;">
        <div class="attendance-adjust-header">
          <div>
            <p class="eyebrow">XUẤT DỮ LIỆU ĐỐI SOÁT TOÀN CÔNG TY</p>
            <h2 id="companySplitTitle"><i class="ri-folder-user-line"></i> Xuất Bảng Công Tách Từng Nhân Sự</h2>
          </div>
          <button class="icon-button" type="button" data-action="close-company-split-modal" aria-label="Đóng"><i class="ri-close-line"></i></button>
        </div>

        <div style="font-size:0.88rem; color:#334155; line-height:1.5;">
          <p style="margin:0 0 14px 0;">Xuất dữ liệu bảng công chi tiết toàn bộ nhân viên trong tháng, phân tách rõ ràng từng người để nhân sự có thể tự tra cứu, kiểm tra ngày công, giờ vào/ra và các lượt trễ sớm.</p>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
            <label style="display:flex; flex-direction:column; gap:4px; font-weight:600; font-size:0.8rem;">
              <span>Tháng tính công:</span>
              <div style="display:flex; gap:6px;">
                ${renderVietnameseMonthYearSelects('companySplitMonth', 'companySplitYear', workMonth || attendanceWorkMonth)}
              </div>
            </label>
            <label style="display:flex; flex-direction:column; gap:4px; font-weight:600; font-size:0.8rem;">
              <span>Chi nhánh:</span>
              <select id="companySplitBranch" style="padding:7px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.85rem; height:36px; background:#fff;">
                <option value="all">Tất cả chi nhánh (PVC &amp; LVT)</option>
                <option value="pham-van-chieu">Phạm Văn Chiêu</option>
                <option value="le-van-tho">Lê Văn Thọ</option>
              </select>
            </label>
          </div>

          <fieldset style="border:1px solid #e2e8f0; border-radius:8px; padding:12px 14px; margin-bottom:16px;">
            <legend style="font-weight:700; font-size:0.8rem; color:#0f172a; padding:0 6px;">Phương thức xuất file</legend>
            <div style="display:flex; flex-direction:column; gap:12px;">
              <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
                <input type="radio" name="companySplitFormat" value="matrix_format" checked style="margin-top:3px;">
                <div>
                  <strong style="display:flex; align-items:center; gap:6px; color:#0f766e;"><i class="ri-table-fill"></i> Bảng Ma Trận 30 Ngày (Tách LVT &amp; PVC, Chấm Công &amp; Tăng Ca) (Mới - Khuyên dùng)</strong>
                  <span class="subtle" style="font-size:0.78rem; display:block; margin-top:2px;">Tự động phân tách 5 bảng tính có màu sắc trực quan: Chấm công LVT, Chấm công PVC, Tăng ca LVT, Tăng ca PVC và Tổng hợp 2 chi nhánh. Ô tăng ca hiển thị giờ chi tiết (0.7h, 1.5h...), ô công đủ/nửa công/nghỉ phép có màu riêng, cố định hàng cột, công thức =SUM chuẩn Excel.</span>
                </div>
              </label>

              <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
                <input type="radio" name="companySplitFormat" value="multi_sheet" style="margin-top:3px;">
                <div>
                  <strong style="display:flex; align-items:center; gap:6px; color:#334155;"><i class="ri-file-excel-2-line"></i> Sổ cái Excel đa Sheet (Tách từng nhân sự)</strong>
                  <span class="subtle" style="font-size:0.78rem; display:block; margin-top:2px;">1 file Excel duy nhất gồm Sheet Tổng hợp toàn công ty + Từng Sheet riêng cho mỗi nhân sự. Mở file là bấm vào tên/mã của mình để tự kiểm tra đối chiếu.</span>
                </div>
              </label>

              <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
                <input type="radio" name="companySplitFormat" value="zip" style="margin-top:3px;">
                <div>
                  <strong style="display:flex; align-items:center; gap:6px; color:#2563eb;"><i class="ri-file-zip-line"></i> Tải Thư mục ZIP (Tách riêng từng file Excel)</strong>
                  <span class="subtle" style="font-size:0.78rem; display:block; margin-top:2px;">File ZIP giải nén ra thư mục chứa từng file Excel riêng cho mỗi nhân viên. Rất tiện để lưu trữ máy tính hoặc gửi riêng file cho từng người.</span>
                </div>
              </label>

              ${hasDirPicker ? `
              <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
                <input type="radio" name="companySplitFormat" value="directory" style="margin-top:3px;">
                <div>
                  <strong style="display:flex; align-items:center; gap:6px; color:#7c3aed;"><i class="ri-folder-download-line"></i> Lưu trực tiếp vào Thư mục máy tính</strong>
                  <span class="subtle" style="font-size:0.78rem; display:block; margin-top:2px;">Chọn thư mục trên máy tính (Windows/Mac), hệ thống sẽ lưu thẳng toàn bộ file Excel của từng nhân sự vào thư mục đó.</span>
                </div>
              </label>
              ` : ''}
            </div>
          </fieldset>

          <div id="companySplitProgressBox" style="display:none; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:10px 14px; margin-bottom:14px; font-size:0.82rem; color:#166534;">
            <div style="display:flex; align-items:center; gap:8px;">
              <i class="ri-loader-4-line" style="animation:spin 1s linear infinite;"></i>
              <span id="companySplitProgressText">Đang khởi tạo xuất file...</span>
            </div>
          </div>
        </div>

        <div class="attendance-adjust-actions" style="margin-top:16px;">
          <button class="secondary-button" type="button" data-action="close-company-split-modal" id="companySplitCancelBtn">Đóng</button>
          <button class="primary-button" type="button" id="btnExecuteCompanySplit" style="display:inline-flex; align-items:center; gap:6px; white-space:nowrap; flex-shrink:0; padding:8px 16px;">
            <i class="ri-download-2-line"></i> Bắt đầu xuất file
          </button>
        </div>
      </section>
    </div>
  `;
}


function renderAdjustmentDialog(employee, allowedShifts, canEdit = false) {
  if (!canEdit) return '';
  return `
    <div class="attendance-adjust-dialog" id="attendanceAdjustModal" hidden>
      <button class="attendance-adjust-backdrop" type="button" data-action="close-adjust-modal" aria-label="Đóng"></button>
      <section class="attendance-adjust-sheet" role="dialog" aria-modal="true" aria-labelledby="adjustDialogTitle">
        <div class="attendance-adjust-header">
          <div>
            <p class="eyebrow">Quản trị chấm công</p>
            <h2 id="adjustDialogTitle">Điều chỉnh &amp; Bổ sung ngày công</h2>
          </div>
          <button class="icon-button" type="button" data-action="close-adjust-modal" aria-label="Đóng"><i class="ri-close-line"></i></button>
        </div>

        <form id="attendanceAdjustForm">
          <div class="attendance-adjust-grid">
            <div class="schedule-dialog-person full"><span class="attendance-employee-avatar">${escapeHTML(employeeInitials(employee?.name))}</span><div><small>Nhân sự áp dụng</small><strong>${escapeHTML(employee?.name || '')}</strong><span>${escapeHTML(employee?.id || '')} · ${escapeHTML(employee?.role || departmentName(employee?.department))}</span></div><em>${escapeHTML(employeeBranchName(employee))}</em></div>
            <input id="adjustEmployee" type="hidden" value="${escapeHTML(employee?.id || '')}">

            <label>
              <span>Ngày làm việc *</span>
              <input type="date" id="adjustWorkDate" required value="${clinicDateISO()}">
            </label>

            <label>
              <span>Chi nhánh vào ca *</span>
              <select id="adjustBranch" required>
                ${Object.values(BRANCHES).map((b) => `<option value="${b.id}">${escapeHTML(b.shortName)}</option>`).join('')}
              </select>
            </label>

            <label>
              <span>Chi nhánh ra ca (nếu khác)</span>
              <select id="adjustCheckoutBranch">
                <option value="">Cùng chi nhánh vào ca</option>
                ${Object.values(BRANCHES).map((b) => `<option value="${b.id}">${escapeHTML(b.shortName)}</option>`).join('')}
              </select>
            </label>

            <label class="full">
              <span>Ca làm việc *</span>
              <select id="adjustShift" required>
                ${allowedShifts.map((shift) => `<option value="${shift.id}">${escapeHTML(shift.name)} (${escapeHTML(shift.start)}–${escapeHTML(shift.end)})</option>`).join('')}
              </select>
            </label>

            <label>
              <span>Giờ vào ca (Check-in)</span>
              <input type="time" id="adjustCheckin" placeholder="08:00">
              <small class="subtle">Để trống nếu không có lượt vào</small>
            </label>

            <label>
              <span>Giờ kết ca (Check-out)</span>
              <input type="time" id="adjustCheckout" placeholder="17:00">
              <small class="subtle">Để trống nếu chưa ra ca</small>
            </label>

            <div class="full" style="padding:10px 12px; background:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px;">
              <span style="font-weight:700; color:#0f766e; font-size:0.82rem; display:block; margin-bottom:6px;">
                <i class="ri-add-circle-line"></i> Giờ tăng ca (Dành cho ca tăng cường / qua đêm)
              </span>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <label style="margin:0;">
                  <span style="font-size:0.75rem;">Bắt đầu tăng ca</span>
                  <input type="time" id="adjustOtStart" placeholder="17:30">
                </label>
                <label style="margin:0;">
                  <span style="font-size:0.75rem;">Kết thúc tăng ca</span>
                  <input type="time" id="adjustOtEnd" placeholder="20:00">
                </label>
              </div>
              <small class="subtle" style="font-size:0.72rem; color:#0d9488; margin-top:4px; display:block;">
                Hỗ trợ ca xuyên đêm (ví dụ: 20:00 → 00:00). Để trống nếu ngày này không có tăng ca.
              </small>
            </div>

            <label class="full">
              <span>Lý do điều chỉnh / Bổ sung *</span>
              <select id="adjustReason">
                <option value="Quên bấm chấm công">Quên bấm chấm công vào/ra</option>
                <option value="Lỗi thiết bị hoặc GPS">Lỗi thiết bị / GPS chập chờn</option>
                <option value="Điều động hỗ trợ phòng khám">Điều động công tác / chi viện phòng khám</option>
                <option value="Đơn giải trình được duyệt">Theo đơn giải trình đã duyệt</option>
                <option value="Đổi ca đột xuất">Đổi ca làm việc đột xuất</option>
                <option value="Khác">Lý do khác</option>
              </select>
            </label>

            <label class="full">
              <span>Ghi chú quản lý (căn cứ duyệt)</span>
              <textarea id="adjustNote" rows="2" placeholder="Ví dụ: Đã xác minh qua camera / xác nhận từ trưởng ca"></textarea>
            </label>
          </div>

          <div class="attendance-adjust-actions">
            <button type="button" class="danger-btn" id="adjustDeleteDayBtn" hidden>
              <i class="ri-delete-bin-6-line"></i> Xóa lượt chấm ngày này
            </button>
            <button class="secondary-button" type="button" data-action="close-adjust-modal">Hủy</button>
            <button class="primary-button" type="submit" id="adjustSubmitBtn">
              Lưu &amp; Cập nhật ngày công
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderOvertimeAdjustmentDialog(employee) {
  return `
    <div class="attendance-adjust-dialog" id="overtimeAdjustModal" hidden>
      <button class="attendance-adjust-backdrop" type="button" data-action="close-overtime-modal" aria-label="Đóng"></button>
      <section class="attendance-adjust-sheet" role="dialog" aria-modal="true" aria-labelledby="overtimeDialogTitle">
        <div class="attendance-adjust-header">
          <div>
            <p class="eyebrow">Quản trị chấm công</p>
            <h2 id="overtimeDialogTitle">Bổ sung &amp; Duyệt tăng ca nhanh</h2>
          </div>
          <button class="icon-button" type="button" data-action="close-overtime-modal" aria-label="Đóng"><i class="ri-close-line"></i></button>
        </div>

        <form id="overtimeAdjustForm">
          <div class="attendance-adjust-grid">
            <div class="schedule-dialog-person full">
              <span class="attendance-employee-avatar">${escapeHTML(employeeInitials(employee?.name))}</span>
              <div>
                <small>Nhân sự áp dụng tăng ca</small>
                <strong>${escapeHTML(employee?.name || '')}</strong>
                <span>${escapeHTML(employee?.id || '')} · ${escapeHTML(employee?.role || departmentName(employee?.department))}</span>
              </div>
              <em>${escapeHTML(employeeBranchName(employee))}</em>
            </div>
            <input id="otEmployee" type="hidden" value="${escapeHTML(employee?.id || '')}">

            <label class="full">
              <span>Ngày tăng ca *</span>
              <input type="date" id="otWorkDate" required value="${clinicDateISO()}">
            </label>

            <label>
              <span>Giờ bắt đầu tăng ca *</span>
              <input type="time" id="otStartTime" required value="17:30">
            </label>

            <label>
              <span>Giờ kết thúc tăng ca *</span>
              <input type="time" id="otEndTime" required value="20:00">
            </label>

            <div class="full" style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px;">
              <div id="otDurationBadge" style="font-size:0.88rem; font-weight:700; color:#15803d; display:flex; align-items:center; gap:6px;">
                <i class="ri-time-line"></i> <span>Thời lượng: 2.5 giờ (150 phút)</span>
              </div>
              <small class="subtle" style="font-size:0.75rem; color:#166534; margin-top:2px; display:block;">
                Hệ thống tự động nhận diện ca qua đêm nếu giờ kết thúc nhỏ hơn giờ bắt đầu (VD: 20:00 → 00:00 = 4.0 giờ).
              </small>
            </div>

            <label class="full">
              <span>Lý do tăng ca *</span>
              <input id="otReason" required placeholder="Ví dụ: Giám sát sơn cửa cuốn LVT / Phụ tá ca tối / Hỗ trợ khách hàng..." list="otReasonSuggestions">
              <datalist id="otReasonSuggestions">
                <option value="Giám sát sơn cửa cuốn Chi nhánh LVT">
                <option value="Hỗ trợ điều trị khách hàng ngoài giờ">
                <option value="Phụ tá trực ca tối ngoài giờ hành chính">
                <option value="Kiểm kê kho &amp; đối soát vật tư y tế">
                <option value="Hỗ trợ công tác đột xuất theo điều phối">
                <option value="Trực xử lý sự cố kỹ thuật / hệ thống">
              </datalist>
            </label>

            <label class="full">
              <span>Ghi chú Admin IT (Căn cứ duyệt)</span>
              <input id="otNote" placeholder="Ví dụ: Đã đối chiếu camera / duyệt theo chỉ đạo vận hành" value="Duyệt trực tiếp bởi Admin IT">
            </label>
          </div>

          <div class="attendance-adjust-actions">
            <button type="button" class="danger-btn" id="otDeleteBtn" hidden>
              <i class="ri-delete-bin-6-line"></i> Xóa tăng ca ngày này
            </button>
            <button class="secondary-button" type="button" data-action="close-overtime-modal">Hủy</button>
            <button class="primary-button" type="submit" id="otSubmitBtn" style="background:#0f766e; border-color:#0f766e;">
              <i class="ri-checkbox-circle-line"></i> Lưu &amp; Duyệt tăng ca
            </button>
          </div>
        </form>
      </section>
    </div>
  `;
}

export async function renderView(state) {
  if (state.profile?.role === 'pg_staff' || state.role === 'pg_staff' || isPgEmployee(state.profile)) {
    return renderPgAttendance();
  }
  if (clockTimer) clearTimeout(clockTimer);
  stopWorkplaceCamera();
  let settings = settingsForBranch(BRANCH.id, state.settings);
  const workDate = clinicDateISO(new Date(), settings.timeZone);
  const userRole = state.profile?.role || state.role;
  const ops = isOpsRole(userRole);
  const canEditWorkday = canEditAttendance(userRole);
  const tuChamCong = !khongPhaiChamCong(state.profile?.role || state.role);
  if (!attendanceWorkMonth) attendanceWorkMonth = workDate.slice(0, 7);
  if (!attendanceHistoryMonth) attendanceHistoryMonth = workDate.slice(0, 7);
  const offlineQueue = getOfflineQueue(state.user?.id);
  const rejectedQueue = getRejectedQueue(state.user?.id);
  const employeeFallback = currentEmployeeFallback(state);

  const [employees, remoteRecords, pendingProofs, allowedShiftRows, todayAssignments, shiftConfiguration] = await Promise.all([
    navigator.onLine ? getEmployees().catch(() => (state.employeeCode ? [employeeFallback] : [])) : Promise.resolve(state.employeeCode ? [employeeFallback] : []),
    (state.employeeCode || ops) && navigator.onLine
      ? getAttendance({ employee: ops ? undefined : state.employeeCode, limit: ops ? 500 : 500 }).catch(() => [])
      : Promise.resolve([]),
    state.user?.id ? listPendingProofs(state.user.id).catch(() => []) : Promise.resolve([]),
    navigator.onLine && state.employeeCode ? getEmployeeAllowedShifts(state.employeeCode).catch(() => []) : Promise.resolve([]),
    navigator.onLine && state.employeeCode ? getScheduleAssignments(workDate).catch(() => []) : Promise.resolve([]),
    navigator.onLine && canEditWorkday ? getShiftConfiguration().catch(() => ({ shifts: [], allowed: [] })) : Promise.resolve({ shifts: [], allowed: [] }),
  ]);

  // Tách biệt nhân sự PG: Khối PG chấm công riêng trên hệ thống Marketing do SupPG điều phối
  const clinicEmployees = employees.filter((item) => !isPgEmployee(item));

  const scopedEmployees = state.role === 'leader'
    ? clinicEmployees.filter((item) => item.department === state.department)
    : clinicEmployees;

  if (!attendanceAdminSelectedEmployee || !scopedEmployees.some((e) => e.id === attendanceAdminSelectedEmployee)) {
    attendanceAdminSelectedEmployee = canEditWorkday
      ? (scopedEmployees.find((item) => item.status === 'active' && item.department !== 'it')?.id || scopedEmployees[0]?.id || '')
      : state.employeeCode;
  }

  const targetEmployeeCode = canEditWorkday ? attendanceAdminSelectedEmployee : state.employeeCode;
  const targetEmployee = scopedEmployees.find((item) => item.id === targetEmployeeCode) || employeeFallback;
  const targetAllowedShifts = configuredShiftsForEmployee(targetEmployee, shiftConfiguration);

  const workSummary = (navigator.onLine && targetEmployeeCode)
    ? await getAttendanceWorkSummary(attendanceWorkMonth, targetEmployeeCode).catch((error) => {
        console.error('[Attendance] Không tải được bảng công:', error);
        return null;
      })
    : null;

  const employee = employees.find((item) => item.id === state.employeeCode) || employeeFallback;
  const todayAssignment = todayAssignments.find((item) => item.employee === state.employeeCode);
  const shiftId = effectiveShiftId({
    assignedShift: todayAssignment?.shift,
    defaultShift: employee.shift,
    department: employee.department,
    workDate,
  });
  const shift = SHIFTS.find((item) => item.id === shiftId)
    || SHIFTS.find((item) => item.id === defaultShiftForDepartment(employee.department));
  const configuredAllowedShifts = allowedShiftRows
    .map((row) => SHIFTS.find((item) => item.id === (row.code || row.shift_code)))
    .filter(Boolean);
  const empDept = String(employee?.department || '').toLowerCase();
  const empRole = String(employee?.role || '').toLowerCase();
  const empTitle = String(employee?.title || '').toLowerCase();
  const groupFallbackShifts = (empDept === 'phuta' || empDept === 'dvkh' || empRole.includes('phụ tá') || empRole.includes('lễ tân') || empTitle.includes('phụ tá') || empTitle.includes('lễ tân') || empRole.includes('phu_ta') || empRole.includes('le_tan'))
    ? SHIFTS.filter((item) => ['front-office', 'front-morning', 'front-afternoon', 'front-full'].includes(item.id))
    : ((empDept === 'bs' || empRole.includes('bác sĩ') || empTitle.includes('bác sĩ') || empRole === 'bac_si')
      ? SHIFTS.filter((item) => ['doctor-office', 'doctor-morning', 'doctor-afternoon', 'doctor-full'].includes(item.id))
      : [shift].filter(Boolean));
  const allowedShifts = todayAssignment
    ? [shift].filter(Boolean)
    : (configuredAllowedShifts.length ? configuredAllowedShifts : groupFallbackShifts);
  const records = mergeRecords(offlineQueue, remoteRecords);
  const todayRecords = mergeRecords(
    offlineQueue.filter((item) => item.employee === state.employeeCode && item.date === workDate),
    remoteRecords.filter((item) => item.employee === state.employeeCode && item.date === workDate),
  );
  const todayCheckin = todayRecords.find((record) => record.type === 'checkin');
  const todayCheckout = todayRecords.find((record) => record.type === 'checkout');
  if (todayCheckin?.branchId) settings = settingsForBranch(todayCheckin.branchId, state.settings);

  store.setTodayAttendance({
    checkedIn: Boolean(todayCheckin),
    checkinTime: todayCheckin ? (todayCheckin.recorded_at || todayCheckin.time) : null,
    checkedOut: Boolean(todayCheckout),
    checkoutTime: todayCheckout ? (todayCheckout.recorded_at || todayCheckout.time) : null,
    branchName: BRANCHES[settings.branchId]?.shortName || settings.clinicName,
  }, true);

  const scopedEmployeeCodes = new Set(scopedEmployees.map((item) => item.id));
  const scopedRecords = canEditWorkday
    ? records.filter((record) => scopedEmployeeCodes.has(record.employee))
    : records.filter((record) => record.employee === state.employeeCode);
  const filteredRecords = canEditWorkday ? scopedRecords.filter((record) => {
    const recordEmployee = scopedEmployees.find((item) => item.id === record.employee);
    if (attendanceDepartmentFilter !== 'all' && recordEmployee?.department !== attendanceDepartmentFilter) return false;
    if (attendanceBranchFilter !== 'all' && record.branchId !== attendanceBranchFilter) return false;
    if (attendanceTypeFilter !== 'all' && record.type !== attendanceTypeFilter) return false;
    if (attendanceStatusFilter !== 'all' && record.record_type !== attendanceStatusFilter) return false;
    if (attendanceDateFilter && String(record.date || record.time || '').slice(0, 10) !== attendanceDateFilter) return false;
    return !attendanceSearch || smartMatch([
      recordEmployee?.name,
      recordEmployee?.id,
      recordEmployee?.role,
      departmentName(recordEmployee?.department),
      record.type,
      record.status,
    ].join(' '), attendanceSearch, attendanceSearchMode);
  }) : scopedRecords;
  const historyTitle = canEditWorkday
    ? 'Chấm công toàn hệ thống'
    : (state.role === 'leader' ? `Chấm công bộ phận ${departmentName(state.department)}` : 'Chấm công của tôi');

  context = {
    state, settings, employee, employees: scopedEmployees, targetEmployee, targetEmployeeCode, targetAllowedShifts, shiftConfiguration, shift, allowedShifts, records: filteredRecords, workDate, todayCheckin, todayCheckout, ops, canEditWorkday,
    // Nhân viên chọn trong các ca hợp lệ của vị trí; nếu đã được phân lịch,
    // danh sách chỉ còn đúng ca đã phân.
    selectedShift: shift || allowedShifts[0] || null,
    selectedBranchId: settings.branchId,
  };
  lastLocation = null;
  capturedPhoto = null;
  currentEventId = null;

  if (!state.employeeCode && !canEditWorkday) {
    return `<section class="panel attendance-account-error"><h3>Tài khoản chưa liên kết nhân viên</h3><p>Quản trị viên cần gán mã nhân viên cho tài khoản này trước khi chấm công.</p></section>`;
  }

  const mapUrl = `https://www.google.com/maps?q=${settings.latitude},${settings.longitude}`;
  const pendingCount = offlineQueue.length + pendingProofs.length;

  if (!canEditWorkday) {
    return `
      <div class="attendance-page">
        <header class="attendance-page-header">
          <div>
            <p class="eyebrow">Điểm trực: ${escapeHTML(BRANCHES[settings.branchId]?.shortName || settings.clinicName)} · Bán kính ${Number(settings.allowedRadius)}m</p>
            <h3>${todayCheckin ? 'Ca làm việc hôm nay' : 'Chấm công vào ca'}</h3>
            <p>${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: settings.timeZone })}</p>
          </div>
          <div class="attendance-header-actions">
            <span class="network-status ${navigator.onLine ? 'is-online' : 'is-offline'}" data-network-status>
              <span></span>${navigator.onLine ? 'Đang online' : 'Đang ngoại tuyến'}
            </span>
          </div>
        </header>

        ${pendingCount ? `
          <div class="attendance-sync-banner">
            <div><strong>${pendingCount} mục đang chờ đồng bộ</strong><span>Bản ghi và ảnh chấm công vẫn an toàn trên điện thoại này.</span></div>
            <button type="button" data-action="sync-attendance" ${navigator.onLine ? '' : 'disabled'}>Đồng bộ ngay</button>
          </div>
        ` : ''}

        ${rejectedQueue.length ? `
          <div class="attendance-sync-banner is-rejected">
            <div>
              <strong>${rejectedQueue.length} lượt chấm công bị máy chủ từ chối</strong>
              <span>${escapeHTML(rejectedQueue[0].syncError || 'Bản ghi không hợp lệ.')}${rejectedQueue.length > 1 ? ` (và ${rejectedQueue.length - 1} lượt khác)` : ''} Hãy báo quản lý để bổ sung công thủ công.</span>
            </div>
            <button type="button" data-action="discard-rejected">Đã hiểu, xóa</button>
          </div>
        ` : ''}

        ${renderTodayCard(todayCheckin, todayCheckout, shift, employee)}

        <div class="attendance-info-grid">
          <section class="attendance-office-card">
            <div class="attendance-card-icon" aria-hidden="true">⌖</div>
            <div>
              <p class="eyebrow">Điểm chấm công</p>
              <h3>${escapeHTML(BRANCHES[settings.branchId]?.shortName || settings.clinicName)}</h3>
              <p>${escapeHTML(settings.clinicAddress)}</p>
              <a href="${mapUrl}" target="_blank" rel="noreferrer">Mở vị trí phòng khám</a>
            </div>
            <span class="attendance-radius">${Number(settings.allowedRadius)} m</span>
          </section>
          <section class="attendance-rule-card">
            <div class="attendance-card-icon" aria-hidden="true">⏱</div>
            <div><p class="eyebrow">Quy định hôm nay</p><h3>Ca ${escapeHTML(shift?.start || '08:00')}–${escapeHTML(shift?.end || '17:00')}</h3><p>Check-in trước giờ bắt đầu ít nhất 5 phút. Hỗ trợ chấm công và ra ca linh hoạt tại cả 2 chi nhánh PVC và LVT.</p></div>
          </section>
        </div>

        ${renderWorkSummary(workSummary, attendanceWorkMonth, employee, false)}

        <section class="attendance-history-panel">
          <div class="section-title">
            <div><p class="eyebrow">Lịch sử</p><h3>${escapeHTML(historyTitle)}</h3></div>
            <span class="subtle">${filteredRecords.length}/${scopedRecords.length} bản ghi</span>
          </div>
          ${renderHistory(filteredRecords, scopedEmployees, false)}
        </section>
        ${renderCheckinDialog(employee, shift, settings, allowedShifts, todayAssignment?.shift || '')}
      </div>
    `;
  }

  // Giao diện Quản trị & Điều chỉnh ngày công dành cho Quản lý / Admin / HR
  return `
    <div class="attendance-page attendance-admin-workspace">
      <header class="attendance-page-header">
        <div>
          <p class="eyebrow">${canEditWorkday ? 'QUẢN TRỊ CHẤM CÔNG' : 'THEO DÕI VẬN HÀNH'}</p>
          <h3>${canEditWorkday ? 'Quản lý công nhân sự' : 'Bảng công & chấm công'}</h3>
          <p>${canEditWorkday ? 'Tra cứu, đối chiếu và bổ sung công từ một bảng dữ liệu thống nhất.' : 'Theo dõi dữ liệu vào/ra thực tế và chi tiết ngày công của nhân sự.'}</p>
        </div>
        <div class="attendance-header-actions" style="position:relative;">
          <div class="attendance-action-dropdown-wrap" style="position:relative; display:inline-block;">
            <button type="button" class="primary-button" id="btnAttendanceActionMenu" style="background:#0f766e; border-color:#0f766e; display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:8px; font-weight:600; box-shadow:0 1px 3px rgba(0,0,0,0.1); cursor:pointer;">
              <i class="ri-apps-2-line" style="font-size:1.15rem;"></i>
              <span>Chức năng &amp; Xuất Excel</span>
              <i class="ri-arrow-down-s-line" style="font-size:1.15rem; transition:transform 0.2s;" id="attendanceMenuArrow"></i>
            </button>
            <div id="attendanceActionMenuDropdown" class="attendance-dropdown-menu" style="display:none; position:absolute; right:0; top:calc(100% + 8px); background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; box-shadow:0 12px 30px -4px rgba(0,0,0,0.18), 0 6px 12px -3px rgba(0,0,0,0.1); width:320px; z-index:1000; overflow:hidden; text-align:left;">
              
              <div style="padding:10px 14px 6px; font-size:0.72rem; font-weight:700; color:#64748b; letter-spacing:0.05em; text-transform:uppercase; background:#f8fafc; border-bottom:1px solid #f1f5f9;">
                <i class="ri-file-excel-2-line" style="color:#0f766e;"></i> Xuất báo cáo Excel
              </div>
              <div style="padding:4px 0;">
                <button type="button" class="attendance-dropdown-item" data-action="export-matrix-attendance" style="width:100%; display:flex; align-items:center; gap:12px; padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; color:#0f172a; font-size:0.87rem; transition:background 0.15s;">
                  <span style="width:34px; height:34px; border-radius:8px; background:#ecfdf5; color:#0f766e; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="ri-table-fill" style="font-size:1.1rem;"></i>
                  </span>
                  <div style="flex:1;">
                    <div style="font-weight:600; display:flex; align-items:center; gap:6px;">
                      <span>Xuất Ma Trận LVT &amp; PVC</span>
                      <span style="font-size:0.65rem; background:#0f766e; color:#ffffff; padding:1px 5px; border-radius:4px; font-weight:700;">Có Màu</span>
                    </div>
                    <span style="font-size:0.75rem; color:#64748b;">Bảng công &amp; tăng ca ma trận 30 ngày</span>
                  </div>
                </button>

                ${canEditWorkday ? `
                <button type="button" class="attendance-dropdown-item" data-action="export-company-split-excel" style="width:100%; display:flex; align-items:center; gap:12px; padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; color:#0f172a; font-size:0.87rem; transition:background 0.15s;">
                  <span style="width:34px; height:34px; border-radius:8px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="ri-folder-user-line" style="font-size:1.1rem;"></i>
                  </span>
                  <div style="flex:1;">
                    <div style="font-weight:600;">Xuất toàn viện (Tách nhân sự)</div>
                    <span style="font-size:0.75rem; color:#64748b;">Mỗi nhân sự một sheet để đối soát</span>
                  </div>
                </button>` : ''}

                <button type="button" class="attendance-dropdown-item" data-action="export-work-excel" style="width:100%; display:flex; align-items:center; gap:12px; padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; color:#0f172a; font-size:0.87rem; transition:background 0.15s;">
                  <span style="width:34px; height:34px; border-radius:8px; background:#f1f5f9; color:#475569; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="ri-file-list-3-line" style="font-size:1.1rem;"></i>
                  </span>
                  <div style="flex:1;">
                    <div style="font-weight:600;">Xuất Excel bảng công hiện tại</div>
                    <span style="font-size:0.75rem; color:#64748b;">Dữ liệu bảng công theo bộ lọc đang xem</span>
                  </div>
                </button>

                <button type="button" class="attendance-dropdown-item" data-action="export-attendance" style="width:100%; display:flex; align-items:center; gap:12px; padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; color:#0f172a; font-size:0.87rem; transition:background 0.15s;">
                  <span style="width:34px; height:34px; border-radius:8px; background:#f1f5f9; color:#475569; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="ri-map-pin-line" style="font-size:1.1rem;"></i>
                  </span>
                  <div style="flex:1;">
                    <div style="font-weight:600;">Xuất nhật ký chấm công GPS</div>
                    <span style="font-size:0.75rem; color:#64748b;">Toàn bộ lượt quét vào/ra chi tiết</span>
                  </div>
                </button>
              </div>

              ${canEditWorkday ? `
              <div style="padding:10px 14px 6px; font-size:0.72rem; font-weight:700; color:#64748b; letter-spacing:0.05em; text-transform:uppercase; background:#f8fafc; border-top:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9;">
                <i class="ri-settings-3-line" style="color:#0284c7;"></i> Quản trị &amp; Nghiệp vụ
              </div>
              <div style="padding:4px 0;">
                <button type="button" class="attendance-dropdown-item" data-action="open-adjust-modal" style="width:100%; display:flex; align-items:center; gap:12px; padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; color:#0f172a; font-size:0.87rem; transition:background 0.15s;">
                  <span style="width:34px; height:34px; border-radius:8px; background:#fef3c7; color:#b45309; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="ri-time-line" style="font-size:1.1rem;"></i>
                  </span>
                  <div style="flex:1;">
                    <div style="font-weight:600;">Điều chỉnh công</div>
                    <span style="font-size:0.75rem; color:#64748b;">Sửa ca, giờ vào/ra, tính lại ngày công</span>
                  </div>
                </button>

                <button type="button" class="attendance-dropdown-item" data-action="open-overtime-modal" style="width:100%; display:flex; align-items:center; gap:12px; padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; color:#0f172a; font-size:0.87rem; transition:background 0.15s;">
                  <span style="width:34px; height:34px; border-radius:8px; background:#f0fdfa; color:#0f766e; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="ri-add-circle-line" style="font-size:1.1rem;"></i>
                  </span>
                  <div style="flex:1;">
                    <div style="font-weight:600;">Bổ sung tăng ca nhanh</div>
                    <span style="font-size:0.75rem; color:#64748b;">Tạo đơn tăng ca duyệt trực tiếp cho nhân sự</span>
                  </div>
                </button>

                <button type="button" class="attendance-dropdown-item" data-action="open-schedule-modal" style="width:100%; display:flex; align-items:center; gap:12px; padding:10px 16px; border:none; background:none; text-align:left; cursor:pointer; color:#0f172a; font-size:0.87rem; transition:background 0.15s;">
                  <span style="width:34px; height:34px; border-radius:8px; background:#f5f3ff; color:#7c3aed; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="ri-calendar-event-line" style="font-size:1.1rem;"></i>
                  </span>
                  <div style="flex:1;">
                    <div style="font-weight:600;">Xếp / đổi ca làm việc</div>
                    <span style="font-size:0.75rem; color:#64748b;">Phân ca trực và lịch làm việc</span>
                  </div>
                </button>
              </div>` : ''}

            </div>
          </div>
        </div>
      </header>

      ${pendingCount ? `
        <div class="attendance-sync-banner">
          <div><strong>${pendingCount} mục đang chờ đồng bộ</strong><span>Bản ghi và ảnh chấm công vẫn an toàn trên điện thoại này.</span></div>
          <button type="button" data-action="sync-attendance" ${navigator.onLine ? '' : 'disabled'}>Đồng bộ ngay</button>
        </div>
      ` : ''}

      ${!canEditWorkday && state.employeeCode ? renderTodayCard(todayCheckin, todayCheckout, shift, employee) : ''}

      <section class="attendance-admin-toolbar" aria-label="Bộ lọc bảng công">
        ${renderAdminEmployeePicker(scopedEmployees, targetEmployee)}
        <label>
          <span>Tháng tính công:</span>
          <span style="display:inline-flex; gap:6px;">
            ${renderVietnameseMonthYearSelects('attendanceWorkMonthSelect', 'attendanceWorkYearSelect', attendanceWorkMonth)}
          </span>
        </label>
        <label>
          <span>Chi nhánh:</span>
          <select id="attendanceWorkBranch">
            <option value="all">Tất cả chi nhánh</option>
            <option value="le-van-tho" ${attendanceWorkBranchFilter === 'le-van-tho' ? 'selected' : ''}>Lê Văn Thọ</option>
            <option value="pham-van-chieu" ${attendanceWorkBranchFilter === 'pham-van-chieu' ? 'selected' : ''}>Phạm Văn Chiêu</option>
          </select>
        </label>
        <label>
          <span>Trạng thái đối chiếu:</span>
          <select id="attendanceWorkStatus">
            <option value="all">Tất cả trạng thái</option>
            <option value="complete" ${attendanceWorkStatusFilter === 'complete' ? 'selected' : ''}>Đủ vào/ra</option>
            <option value="in_progress" ${attendanceWorkStatusFilter === 'in_progress' ? 'selected' : ''}>Đang trong ca</option>
            <option value="missing_checkout" ${attendanceWorkStatusFilter === 'missing_checkout' ? 'selected' : ''}>Thiếu check-out</option>
            <option value="missing_checkin" ${attendanceWorkStatusFilter === 'missing_checkin' ? 'selected' : ''}>Thiếu check-in</option>
            <option value="attendance_anomaly" ${attendanceWorkStatusFilter === 'attendance_anomaly' ? 'selected' : ''}>Dữ liệu bất thường</option>
          </select>
        </label>
      </section>

      ${renderSelectedEmployeeProfile(targetEmployee, targetAllowedShifts)}

      <div class="attendance-nav-tabs">
        <button type="button" class="attendance-tab-btn ${attendanceActiveTab === 'workdays' ? 'is-active' : ''}" data-action="switch-tab" data-tab="workdays">
          <span><i class="ri-table-line"></i> ${canEditWorkday ? 'Bảng ngày công &amp; Điều chỉnh' : 'Bảng ngày công'}</span>
        </button>
        <button type="button" class="attendance-tab-btn ${attendanceActiveTab === 'history' ? 'is-active' : ''}" data-action="switch-tab" data-tab="history">
          <span><i class="ri-map-pin-time-line"></i> Nhật ký quét GPS (${filteredRecords.length})</span>
        </button>
      </div>

      ${attendanceActiveTab === 'workdays' ? renderWorkSummary(workSummary, attendanceWorkMonth, targetEmployee, canEditWorkday) : `
        <section class="attendance-history-panel">
          <div class="section-title">
            <div><p class="eyebrow">Lịch sử</p><h3>${escapeHTML(historyTitle)}</h3></div>
            <span class="subtle">${filteredRecords.length}/${scopedRecords.length} bản ghi</span>
          </div>
          <div class="operation-filterbar attendance-filterbar">
            <label class="is-search">Tìm thông minh<input type="search" id="attendanceSearchFilter" value="${escapeHTML(attendanceSearch)}" placeholder="Gõ gần đúng tên, MNV hoặc chức danh" autocomplete="off"></label>
            <label>Kiểu dò<select id="attendanceSearchMode"><option value="near" ${attendanceSearchMode === 'near' ? 'selected' : ''}>Gần đúng, bỏ dấu</option><option value="exact" ${attendanceSearchMode === 'exact' ? 'selected' : ''}>Đúng cụm từ</option></select></label>
            <label>Chi nhánh<select id="attendanceBranchFilter"><option value="all">Cả hai chi nhánh</option><option value="le-van-tho" ${attendanceBranchFilter === 'le-van-tho' ? 'selected' : ''}>Lê Văn Thọ</option><option value="pham-van-chieu" ${attendanceBranchFilter === 'pham-van-chieu' ? 'selected' : ''}>Phạm Văn Chiêu</option></select></label>
            <label>Phòng ban<select id="attendanceDepartmentFilter"><option value="all">Tất cả phòng ban được xem</option>${[...new Set(scopedEmployees.map((item) => item.department).filter(Boolean))].map((department) => `<option value="${escapeHTML(department)}" ${attendanceDepartmentFilter === department ? 'selected' : ''}>${escapeHTML(departmentName(department))}</option>`).join('')}</select></label>
            <label>Loại<select id="attendanceTypeFilter"><option value="all">Vào và ra</option><option value="checkin" ${attendanceTypeFilter === 'checkin' ? 'selected' : ''}>Check-in</option><option value="checkout" ${attendanceTypeFilter === 'checkout' ? 'selected' : ''}>Check-out</option></select></label>
            <label>Trạng thái lượt<select id="attendanceStatusFilter"><option value="all">Vào ca và ra ca</option><option value="checkin" ${attendanceStatusFilter === 'checkin' ? 'selected' : ''}>Chỉ vào ca</option><option value="checkout" ${attendanceStatusFilter === 'checkout' ? 'selected' : ''}>Chỉ ra ca</option></select></label>
            <label>Ngày<input type="date" id="attendanceDateFilter" value="${escapeHTML(attendanceDateFilter)}"></label>
            <button class="secondary-button" type="button" id="clearAttendanceFilters">Xóa bộ lọc</button>
          </div>
          ${renderHistory(filteredRecords, scopedEmployees, true)}
        </section>
      `}
      ${renderAdjustmentDialog(targetEmployee, targetAllowedShifts, canEditWorkday)}
      ${canEditWorkday ? renderOvertimeAdjustmentDialog(targetEmployee) : ''}
      ${canEditWorkday ? renderScheduleAdjustmentDialog(targetEmployee, targetAllowedShifts) : ''}
      ${canEditWorkday ? renderCompanySplitExportDialog(canEditWorkday, attendanceWorkMonth) : ''}
      ${state.employeeCode ? renderCheckinDialog(employee, shift, settings, allowedShifts, todayAssignment?.shift || '') : ''}
    </div>
  `;
}

function evaluateLocation(reading, preferredBranchId = null) {
  const accuracy = Math.round(reading.accuracy);
  const ageMs = Date.now() - new Date(reading.capturedAt).getTime();
  const fresh = ageMs >= -5000 && ageMs <= 120000;

  const candidateBranches = Object.values(BRANCHES);
  const insideMatches = [];
  let closestBranch = null;
  let minDistance = Infinity;

  for (const branch of candidateBranches) {
    const bDist = Math.round(distanceMeters(reading.lat, reading.lng, Number(branch.latitude), Number(branch.longitude)));
    const bMaxAcc = Number(branch.maxGpsAccuracy || 100);
    const bRadius = Number(branch.allowedRadius || 100);
    const bAccurate = accuracy <= bMaxAcc;
    const bInside = bDist <= bRadius && bAccurate;

    if (bDist < minDistance) {
      minDistance = bDist;
      closestBranch = { branch, distance: bDist, accurate: bAccurate, inside: bInside };
    }

    if (bInside) {
      insideMatches.push({ branch, distance: bDist, accurate: bAccurate, inside: true });
    }
  }

  let selected = null;
  if (insideMatches.length > 0) {
    const pref = preferredBranchId ? insideMatches.find((m) => m.branch.id === preferredBranchId) : null;
    selected = pref || insideMatches.sort((a, b) => a.distance - b.distance)[0];
  } else {
    selected = closestBranch || {
      branch: BRANCH,
      distance: Math.round(distanceMeters(reading.lat, reading.lng, Number(BRANCH.latitude), Number(BRANCH.longitude))),
      accurate: accuracy <= Number(BRANCH.maxGpsAccuracy || 100),
      inside: false,
    };
  }

  const { branch, distance, accurate, inside } = selected;
  return {
    ...reading,
    distance,
    accurate,
    inside,
    fresh,
    branchId: branch.id,
    branchName: branch.shortName || branch.name,
    allowedRadius: Number(branch.allowedRadius || 100),
    maxGpsAccuracy: Number(branch.maxGpsAccuracy || 100),
  };
}

function updateGpsState(mode, title, detail) {
  const box = document.getElementById('gpsConfirmState');
  const titleNode = document.getElementById('gpsStateTitle');
  const detailNode = document.getElementById('gpsStateDetail');
  if (!box || !titleNode || !detailNode) return;
  box.className = `gps-confirm-state ${mode}`;
  titleNode.textContent = title;
  detailNode.textContent = detail;
}

function setLocationActionState(label, disabled = false) {
  const button = document.querySelector('[data-action="retry-location"]');
  if (!button) return;
  button.textContent = label;
  button.disabled = disabled;
}

function hideLocationPermissionHelp() {
  const help = document.getElementById('locationPermissionHelp');
  if (help) help.hidden = true;
}

function showLocationPermissionHelp() {
  const help = document.getElementById('locationPermissionHelp');
  if (help) help.hidden = false;
  setLocationActionState('Đã bật quyền – thử lại');
}

function resetCapturedPhoto() {
  stopWorkplaceCamera();
  cameraStarting = false;
  capturedPhoto = null;
  if (capturedPhotoUrl) URL.revokeObjectURL(capturedPhotoUrl);
  capturedPhotoUrl = '';
}

function updateConfirmAvailability() {
  const button = document.getElementById('confirmCheckinBtn');
  if (!button) return;
  const validLocation = lastLocation
    && lastLocation.accurate
    && lastLocation.inside
    && lastLocation.fresh;
  button.disabled = !(validLocation && (!REQUIRE_CHECKIN_PHOTO || capturedPhoto?.blob) && context?.selectedShift);
}

function updateCameraState(mode, message) {
  const section = document.getElementById('workplaceCameraSection');
  const status = document.getElementById('workplaceCameraStatus');
  if (section) section.dataset.state = mode;
  if (status) status.textContent = message;
}

async function startCameraFlow() {
  if (cameraStarting || capturedPhoto) return;
  const section = document.getElementById('workplaceCameraSection');
  const video = document.getElementById('workplaceCameraVideo');
  const preview = document.getElementById('workplaceCameraPreview');
  const placeholder = document.getElementById('workplaceCameraPlaceholder');
  const captureButton = section?.querySelector('[data-action="capture-photo"]');
  const retryButton = section?.querySelector('[data-action="retry-camera"]');
  const retakeButton = section?.querySelector('[data-action="retake-photo"]');
  if (!section || !video || !captureButton) return;

  section.hidden = false;
  cameraStarting = true;
  captureButton.hidden = false;
  captureButton.disabled = true;
  if (retryButton) retryButton.hidden = true;
  if (retakeButton) retakeButton.hidden = true;
  if (preview) preview.hidden = true;
  video.hidden = false;
  if (placeholder) placeholder.hidden = false;
  updateCameraState('is-loading', 'Đang mở camera sau của thiết bị…');

  try {
    await startWorkplaceCamera(video);
    if (placeholder) placeholder.hidden = true;
    captureButton.disabled = false;
    updateCameraState('is-live', 'Camera đang trực tiếp. Hướng máy về khu vực bạn đang làm việc rồi chụp.');
  } catch (error) {
    video.hidden = true;
    if (placeholder) {
      placeholder.hidden = false;
      const title = placeholder.querySelector('strong');
      if (title) title.textContent = 'Không mở được camera';
    }
    if (retryButton) retryButton.hidden = false;
    updateCameraState('is-error', error.message || 'Không thể mở camera trực tiếp.');
  } finally {
    cameraStarting = false;
  }
}

async function takeWorkplacePhoto(button) {
  const video = document.getElementById('workplaceCameraVideo');
  const preview = document.getElementById('workplaceCameraPreview');
  const section = document.getElementById('workplaceCameraSection');
  const retakeButton = section?.querySelector('[data-action="retake-photo"]');
  const placeholder = document.getElementById('workplaceCameraPlaceholder');
  if (!video || !preview || !button) return;

  button.disabled = true;
  button.textContent = 'Đang chụp…';
  try {
    const blob = await captureWorkplacePhoto(video);
    resetCapturedPhoto();
    capturedPhotoUrl = URL.createObjectURL(blob);
    capturedPhoto = { blob, capturedAt: new Date().toISOString() };
    preview.src = capturedPhotoUrl;
    preview.hidden = false;
    video.hidden = true;
    if (placeholder) placeholder.hidden = true;
    button.hidden = true;
    if (retakeButton) retakeButton.hidden = false;
    updateCameraState('is-captured', `Đã chụp ảnh lúc ${clinicTimeLabel(new Date(capturedPhoto.capturedAt))}. Ảnh sẽ được lưu riêng tư cùng lượt chấm công.`);
    updateConfirmAvailability();
  } catch (error) {
    updateCameraState('is-error', error.message || 'Không thể chụp ảnh. Vui lòng thử lại.');
    button.disabled = false;
    button.textContent = 'Chụp ảnh nơi làm việc';
  }
}

async function retakeWorkplacePhoto() {
  resetCapturedPhoto();
  updateConfirmAvailability();
  await startCameraFlow();
}

async function acquireLocationWithFallback(requestId, { onReading, onFallback } = {}) {
  let bestReading = null;
  let primaryError = null;
  try {
    bestReading = await acquirePrecisePosition({
      // Stop as soon as the reading satisfies the same threshold enforced by
      // the database. Waiting for 30 m made valid 31–50 m fixes look frozen.
      targetAccuracyM: Number(context.settings.maxGpsAccuracy),
      timeoutMs: 12000,
      onReading: (current, best) => {
        if (requestId !== locationRequestId) return;
        onReading?.(current, best);
      },
    });
  } catch (error) {
    primaryError = error;
  }

  const needsDirectReading = !bestReading || Number(bestReading.accuracy) > Number(context.settings.maxGpsAccuracy);
  const permissionDenied = isGeolocationPermissionDenied(primaryError);
  if (needsDirectReading && !permissionDenied && requestId === locationRequestId) {
    onFallback?.();
    try {
      const directReading = await acquireCurrentPosition({ timeoutMs: 12000 });
      if (!bestReading || directReading.accuracy < bestReading.accuracy) bestReading = directReading;
    } catch (fallbackError) {
      if (!bestReading) throw fallbackError;
    }
  }

  if (!bestReading) throw primaryError || new Error('Không thể lấy vị trí hiện tại từ thiết bị.');
  return bestReading;
}

async function captureLocation() {
  const requestId = ++locationRequestId;
  lastLocation = null;
  resetCapturedPhoto();
  const cameraSection = document.getElementById('workplaceCameraSection');
  if (cameraSection) cameraSection.hidden = true;
  const confirmButton = document.getElementById('confirmCheckinBtn');
  if (confirmButton) confirmButton.disabled = true;
  hideLocationPermissionHelp();
  setLocationActionState('Đang lấy vị trí…', true);
  updateGpsState('is-loading', 'Đang kết nối GPS…', 'Giữ màn hình sáng trong vài giây để lấy vị trí chính xác nhất.');

  try {
    const reading = await acquireLocationWithFallback(requestId, {
      onReading: (_current, best) => {
        updateGpsState('is-loading', 'Đang tăng độ chính xác…', `Tín hiệu tốt nhất hiện tại ±${best.accuracy} m.`);
      },
      onFallback: () => {
        updateGpsState('is-loading', 'Đang lấy vị trí hiện tại trực tiếp…', 'GPS chính xác chưa phản hồi; hệ thống đang yêu cầu ngay vị trí mới nhất từ thiết bị.');
      },
    });
    if (requestId !== locationRequestId) return;

    lastLocation = evaluateLocation(reading, context?.selectedBranchId || context?.settings?.branchId);
    const userRole = context?.state?.profile?.role || context?.state?.role;
    const isTelesale = ['telesale_staff', 'telesale_leader'].includes(userRole)
      || context?.employee?.department === 'mkt' || context?.employee?.department === 'marketing';

    if (!lastLocation.accurate && !isTelesale) {
      updateGpsState('is-warning', 'GPS chưa đủ chính xác', `Sai số hiện tại ±${lastLocation.accuracy} m; yêu cầu tối đa ${lastLocation.maxGpsAccuracy} m. Hãy đứng gần cửa sổ và thử lại.`);
      setLocationActionState('Thử lấy GPS chính xác hơn');
      return;
    }
    if (!lastLocation.inside) {
      if (isTelesale) {
        updateGpsState('is-success', 'Tọa độ GPS Telesale hợp lệ', `Đã ghi nhận GPS · Cách ${lastLocation.branchName} ${lastLocation.distance} m · Sai số ±${lastLocation.accuracy} m (Chế độ Telesale linh hoạt)`);
      } else {
        updateGpsState('is-error', 'Bạn đang ngoài khu vực chấm công', `Vị trí cách cơ sở gần nhất (${lastLocation.branchName}) ${lastLocation.distance} m; bán kính cho phép ${lastLocation.allowedRadius} m.`);
        setLocationActionState('Lấy lại vị trí');
        return;
      }
    } else {
      updateGpsState('is-success', 'Vị trí hợp lệ', `Tại ${lastLocation.branchName} · Cách cơ sở ${lastLocation.distance} m · GPS ±${lastLocation.accuracy} m.`);
      if (lastLocation.branchId && context && context.selectedBranchId !== lastLocation.branchId) {
        context.selectedBranchId = lastLocation.branchId;
        context.settings = settingsForBranch(lastLocation.branchId, context.state?.settings);
        const branchSelect = document.getElementById('attendanceBranchChoice');
        if (branchSelect && branchSelect.value !== lastLocation.branchId) {
          branchSelect.value = lastLocation.branchId;
        }
        const address = document.getElementById('attendanceBranchAddress');
        if (address) address.textContent = context.settings.clinicAddress;
      }
    }
    if (!lastLocation.fresh) {
      updateGpsState('is-warning', 'Vị trí đã cũ', 'Vui lòng lấy lại vị trí trước khi xác nhận.');
      setLocationActionState('Lấy lại vị trí');
      return;
    }
    setLocationActionState('Làm mới vị trí');
    if (REQUIRE_CHECKIN_PHOTO) await startCameraFlow();
    updateConfirmAvailability();
  } catch (error) {
    if (requestId !== locationRequestId) return;
    const permissionState = await getGeolocationPermissionState();
    const permissionDenied = isGeolocationPermissionDenied(error) || permissionState === 'denied';
    if (permissionDenied) {
      updateGpsState('is-error', 'Quyền vị trí đang bị tắt', 'Website không thể tự bật lại quyền đã bị từ chối. Làm theo hướng dẫn bên dưới rồi thử lại.');
      showLocationPermissionHelp();
    } else {
      updateGpsState('is-error', 'Không lấy được vị trí', error.message || 'Hãy bật GPS và cấp quyền vị trí cho trình duyệt.');
      setLocationActionState('Thử lại GPS');
    }
  }
}

function syncNetworkBadge() {
  const node = document.querySelector('[data-network-status]');
  if (!node) {
    window.removeEventListener('clinic:network-change', syncNetworkBadge);
    return;
  }
  node.className = `network-status ${navigator.onLine ? 'is-online' : 'is-offline'}`;
  node.innerHTML = `<span></span>${navigator.onLine ? 'Đang online' : 'Đang ngoại tuyến'}`;
}

function openDialog() {
  const dialog = document.getElementById('checkinDialog');
  if (!dialog || context.todayCheckin) return;
  dialog.hidden = false;
  currentEventId = makeEventId();
  resetCapturedPhoto();
  document.body.classList.add('dialog-open');
  dialog.querySelector('[data-action="close-checkin"]')?.focus();
  captureLocation();
}

function closeDialog() {
  const dialog = document.getElementById('checkinDialog');
  locationRequestId += 1;
  if (dialog) dialog.hidden = true;
  document.body.classList.remove('dialog-open');
  lastLocation = null;
  currentEventId = null;
  resetCapturedPhoto();
  // Bao cho main.js biet overlay da dong de lan refresh realtime bi hoan
  // trong luc cham cong duoc ap dung ngay, khong phai cho mot su kien
  // focusout tinh co nao do.
  window.dispatchEvent(new CustomEvent('clinic:overlay-closed', { detail: { overlay: 'attendance-checkin' } }));
}

async function confirmCheckin(button) {
  if (!lastLocation || (REQUIRE_CHECKIN_PHOTO && !capturedPhoto?.blob) || !currentEventId) return;
  lastLocation = evaluateLocation(lastLocation);
  const userRole = context?.state?.profile?.role || context?.state?.role;
  const isTelesale = ['telesale_staff', 'telesale_leader'].includes(userRole)
    || context?.employee?.department === 'mkt' || context?.employee?.department === 'marketing';

  if ((!lastLocation.accurate && !isTelesale) || (!lastLocation.inside && !isTelesale) || !lastLocation.fresh) {
    showToast('Vị trí không còn hợp lệ. Vui lòng lấy lại GPS.', true);
    captureLocation();
    return;
  }

  button.disabled = true;
  button.textContent = 'Đang lưu chấm công GPS…';
  const now = new Date();
  const eventId = currentEventId;
  const proof = capturedPhoto;
  const userId = context.state.user?.id;
  let proofQueued = false;
  try {
    if (proof) try {
      await savePendingProof({ clientEventId: eventId, userId, blob: proof.blob, capturedAt: proof.capturedAt });
      proofQueued = true;
    } catch (storageError) {
      if (!navigator.onLine) throw storageError;
      console.warn('[Attendance Proof] Could not stage photo locally:', storageError);
    }

    const targetBranchId = lastLocation.branchId || context?.selectedBranchId || context.settings.branchId;
    const targetBranchName = lastLocation.branchName || BRANCHES[targetBranchId]?.shortName || context.settings.clinicName;

    const result = await clockIn({
      clientEventId: eventId,
      employee: context.employee.id,
      branchId: targetBranchId,
      shift: context.selectedShift?.id,
      type: 'checkin',
      date: clinicDateISO(now, context.settings.timeZone),
      time: now.toISOString(),
      lat: lastLocation.lat,
      lng: lastLocation.lng,
      distance: lastLocation.distance,
      accuracy: lastLocation.accuracy,
      deviceId: getOrCreateDeviceId(),
      capturedOffline: !navigator.onLine,
    }, userId);

    const proofEventId = result.clientEventId || eventId;
    if (proof && proofQueued && proofEventId !== eventId) {
      await movePendingProof(eventId, proofEventId);
    }

    let proofPending = !!result.isOfflinePending;
    if (proof && !proofPending && navigator.onLine) {
      try {
        await uploadAttendanceProof({ clientEventId: proofEventId, blob: proof.blob, capturedAt: proof.capturedAt });
        if (proofQueued) await removePendingProof(proofEventId);
      } catch (proofError) {
        console.warn('[Attendance Proof] Upload deferred:', proofError);
        proofPending = true;
        await savePendingProof({ clientEventId: proofEventId, userId, blob: proof.blob, capturedAt: proof.capturedAt });
      }
    }

    store.setTodayAttendance({
      checkedIn: true,
      checkinTime: now.toISOString(),
      checkedOut: false,
      checkoutTime: null,
      branchId: targetBranchId,
      branchName: targetBranchName,
    });

    closeDialog();
    showToast(proofPending
      ? 'Đã ghi nhận chấm công. Dữ liệu đang được giữ an toàn và sẽ tự đồng bộ khi có mạng.'
      : 'Check-in GPS đã được lưu thành công!');
    navigateTo('attendance');
  } catch (error) {
    console.error('[Attendance] Check-in failed:', error);
    if (proofQueued) await removePendingProof(eventId).catch(() => undefined);
    const message = String(error?.message || 'Không thể ghi nhận chấm công.');
    showToast(message.includes('GPS') || message.includes('bán kính') ? message : 'Không thể ghi nhận. Vui lòng kiểm tra GPS và thử lại.', true);
    button.disabled = false;
    button.textContent = 'Hoàn tất chấm công';
  }
}

async function confirmCheckout(button) {
  if (!button || !context?.todayCheckin || context?.todayCheckout) return;

  button.disabled = true;
  const originalLabel = button.innerHTML;
  const requestId = ++locationRequestId;
  button.innerHTML = '<span class="attendance-button-icon" aria-hidden="true">⌖</span><span><strong>Đang xác minh GPS…</strong><small>Giữ màn hình sáng vài giây</small></span>';

  try {
    const reading = await acquireLocationWithFallback(requestId, {
      onReading: (_current, best) => {
        button.innerHTML = `<span class="attendance-button-icon" aria-hidden="true">⌖</span><span><strong>Đang tăng độ chính xác…</strong><small>GPS tốt nhất ±${best.accuracy} m</small></span>`;
      },
      onFallback: () => {
        button.innerHTML = '<span class="attendance-button-icon" aria-hidden="true">⌖</span><span><strong>Đang lấy vị trí trực tiếp…</strong><small>Vui lòng giữ kết nối GPS</small></span>';
      },
    });
    if (requestId !== locationRequestId) return;

    const location = evaluateLocation(reading);
    const userRole = context?.state?.profile?.role || context?.state?.role;
    const isTelesale = ['telesale_staff', 'telesale_leader'].includes(userRole)
      || context?.employee?.department === 'mkt' || context?.employee?.department === 'marketing';

    if (!location.accurate && !isTelesale) {
      throw new Error(`Sai số GPS ±${location.accuracy} m vượt mức cho phép ${location.maxGpsAccuracy} m. Hãy đứng gần cửa sổ và thử lại.`);
    }
    if (!location.inside && !isTelesale) {
      throw new Error(`Bạn đang cách cơ sở gần nhất (${location.branchName}) ${location.distance} m; chỉ được check-out trong bán kính ${location.allowedRadius} m.`);
    }
    if (!location.fresh) {
      throw new Error('Vị trí GPS đã cũ. Vui lòng thử check-out lại.');
    }

    const checkinBranchId = context.todayCheckin?.branchId || context.settings.branchId;
    const checkoutBranchId = location.branchId || checkinBranchId;
    const isCrossBranch = checkinBranchId && checkoutBranchId && checkinBranchId !== checkoutBranchId;
    const checkoutBranchName = location.branchName || BRANCHES[checkoutBranchId]?.shortName || context.settings.clinicName;

    button.innerHTML = `<span class="attendance-button-icon" aria-hidden="true">✓</span><span><strong>GPS hợp lệ · ${escapeHTML(checkoutBranchName)}</strong><small>Đang ghi nhận giờ ra ca…</small></span>`;
    const now = new Date();
    const result = await clockOut({
      clientEventId: makeEventId(),
      employee: context.employee.id,
      branchId: checkoutBranchId,
      shift: context.shift?.id || 'clinic-0800',
      type: 'checkout',
      date: clinicDateISO(now, context.settings.timeZone),
      time: now.toISOString(),
      lat: location.lat,
      lng: location.lng,
      distance: location.distance,
      accuracy: location.accuracy,
      deviceId: getOrCreateDeviceId(),
      capturedOffline: !navigator.onLine,
    }, context.state.user?.id);

    store.setTodayAttendance({
      checkedOut: true,
      checkoutTime: now.toISOString(),
      branchId: checkoutBranchId,
      checkoutBranchName,
    });

    const successMsg = isCrossBranch
      ? `Check-out liên chi nhánh thành công tại ${checkoutBranchName} lúc ${formatTime(result.time)}!`
      : `Check-out thành công tại ${checkoutBranchName} lúc ${formatTime(result.time)}.`;
    showToast(result.isOfflinePending
      ? 'Đã lưu giờ kết ca trên điện thoại. Hệ thống sẽ tự đồng bộ khi có mạng.'
      : successMsg);
    navigateTo('attendance');
  } catch (error) {
    if (requestId !== locationRequestId) return;
    console.error('[Attendance] Check-out failed:', error);
    const permissionState = await getGeolocationPermissionState();
    const permissionDenied = isGeolocationPermissionDenied(error) || permissionState === 'denied';
    const message = permissionDenied
      ? 'Chưa thể check-out vì quyền Vị trí đang bị tắt. Hãy mở quyền của website, chọn Vị trí → Cho phép rồi thử lại.'
      : String(error?.message || 'Không thể xác minh GPS để kết ca.');
    showToast(message, true);
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}

async function exportAttendance() {
  if (!context?.records?.length) {
    showToast('Không có dữ liệu chấm công để xuất.', true);
    return;
  }
  const data = context.records.map((record, index) => {
    const employee = context.employees?.find((item) => item.id === record.employee);
    return {
      'STT': index + 1,
      'Mã NV': record.employee || '',
      'Họ và tên': employee?.name || record.employee || '',
      'Phòng ban': departmentName(employee?.department),
      'Loại ghi nhận': recordTypeLabel(record),
      'Thời gian': formatDateTime(record.time),
      'Khoảng cách GPS (m)': record.distance != null ? Number(record.distance) : '',
      'Sai số GPS (m)': record.accuracy != null ? Number(record.accuracy) : '',
      'Đánh giá': attendanceLabel(record),
      'Chế độ': record.capturedOffline ? 'Ngoại tuyến' : 'Trực tuyến',
    };
  });

  try {
    await exportTableToExcel({
      filename: `cham-cong-le-van-tho-${clinicDateISO()}.xlsx`,
      sheetName: 'Nhật ký GPS',
      data,
    });
    showToast('Đã xuất file Excel nhật ký chấm công chuẩn có bộ lọc.');
  } catch (error) {
    console.error('[Attendance] Export attendance Excel failed:', error);
    showToast('Lỗi xuất file Excel chấm công.', true);
  }
}

async function exportWorkExcel() {
  const rows = context?.workRows || [];
  if (!rows.length) {
    showToast('Không có dữ liệu bảng công phù hợp để xuất.', true);
    return;
  }
  try {
    const data = rows.map((day) => {
      const [status] = workDayStatus(day);
      const regMin = Number(day.regular_minutes || 0);
      const otMin = Number(day.overtime_minutes || 0);
      const payMin = Number(day.payable_minutes || 0);
      return {
        'Ngày': new Date(`${day.work_date}T00:00:00`).toLocaleDateString('vi-VN'),
        'Chi nhánh': (day.checkout_branch_id && day.checkout_branch_id !== day.branch_id)
          ? `${BRANCHES[day.branch_id]?.shortName || day.branch_id} ➔ ${BRANCHES[day.checkout_branch_id]?.shortName || day.checkout_branch_id}`
          : (BRANCHES[day.branch_id]?.shortName || 'Chưa xác định'),
        'Ca làm việc': formatShiftDisplayName(day),
        'Giờ vào': day.checkin_at ? formatTime(day.checkin_at) : '',
        'Giờ ra': day.checkout_at ? formatTime(day.checkout_at) : '',
        'Giờ công thường (giờ)': Number((regMin / 60).toFixed(2)),
        'Tăng ca duyệt (giờ)': Number((otMin / 60).toFixed(2)),
        'Tổng giờ tính công (giờ)': Number((payMin / 60).toFixed(2)),
        'Giờ công thường (phút)': regMin,
        'Tăng ca đã duyệt (phút)': otMin,
        'Tổng giờ tính công (phút)': payMin,
        'Trễ check-in (phút)': Number(day.late_checkin_minutes || 0),
        'Đi muộn (phút)': Number(day.late_minutes || 0),
        'Về sớm (phút)': Number(day.early_leave_minutes || 0),
        'Ngày công': Number(day.workday_credit || 0),
        'Trạng thái đối chiếu': status,
      };
    });
    const rules = [
      { 'Nội dung': 'Nguồn dữ liệu', 'Quy tắc / công thức': 'Ca làm việc và lượt vào/ra được lưu trên hệ thống từ tháng 09/2026.' },
      { 'Nội dung': 'Chi nhánh trong ngày', 'Quy tắc / công thức': 'Chi nhánh nhân viên chọn khi vào ca và được GPS xác nhận; không lấy chi nhánh cố định trong hồ sơ.' },
      { 'Nội dung': 'Giờ công thường', 'Quy tắc / công thức': 'Thời lượng ca trừ thời gian nghỉ, đi muộn và về sớm; không vượt quá thời gian hiện diện thực tế.' },
      { 'Nội dung': 'Tăng ca', 'Quy tắc / công thức': 'Chỉ cộng số phút từ đơn tăng ca đã được duyệt cuối cùng.' },
      { 'Nội dung': 'Tổng giờ tính công', 'Quy tắc / công thức': 'Giờ công thường + tăng ca đã duyệt.' },
      { 'Nội dung': 'Ngày công', 'Quy tắc / công thức': 'Giờ công thường / số phút chuẩn của ca, tối đa 1 ngày; tăng ca được cộng riêng vào tổng giờ.' },
      { 'Nội dung': 'Cần đối chiếu', 'Quy tắc / công thức': 'Thiếu giờ vào/ra, thiếu ca hoặc dữ liệu bất thường không tự cộng công.' },
    ];

    const targetEmpName = context.targetEmployee?.id || context.employee?.id || 'nhan-vien';
    await exportWorkbookToExcel({
      filename: `bang-cong-${targetEmpName}-${attendanceWorkMonth}.xlsx`,
      sheets: [
        { sheetName: 'Bảng công', data },
        { sheetName: 'Quy tắc tính công', data: rules, customWidths: { 'Nội dung': 25, 'Quy tắc / công thức': 80 } },
      ],
    });
    showToast('Đã xuất file Excel bảng công tiếng Việt chuẩn có bộ lọc.');
  } catch (error) {
    console.error('[Attendance] Export work Excel failed:', error);
    showToast('Không thể xuất file Excel. Vui lòng thử lại.', true);
  }
}

function openCompanySplitModal() {
  const modal = document.getElementById('companySplitExportModal');
  if (modal) {
    modal.removeAttribute('hidden');
    modal.hidden = false;
  }
}

function closeCompanySplitModal() {
  const modal = document.getElementById('companySplitExportModal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.hidden = true;
  }
}

function makeSafeSheetName(code, name, existingNames) {
  const cleanCode = String(code || '').replace(/[\/\\?*\[\]:]/g, '').trim();
  const cleanName = String(name || '').replace(/[\/\\?*\[\]:]/g, '').trim();
  let base = `${cleanCode} ${cleanName}`.trim();
  if (base.length > 28) {
    base = base.slice(0, 28).trim();
  }
  let unique = base || cleanCode || 'Sheet';
  let counter = 1;
  while (existingNames.has(unique.toLowerCase())) {
    const suffix = `_${counter++}`;
    unique = `${base.slice(0, 28 - suffix.length)}${suffix}`;
  }
  existingNames.add(unique.toLowerCase());
  return unique;
}

async function exportAttendanceMatrixDirect() {
  const month = attendanceWorkMonth || todayISO().slice(0, 7);
  let employeesToExport = sortEmployeesByPosition(
    (context?.employees || []).filter((e) => e.status === 'active' && !isPgEmployee(e))
  );
  if (!employeesToExport.length) {
    showToast('Không có danh sách nhân sự phù hợp để xuất.', true);
    return;
  }

  showToast(`Đang khởi tạo xuất Bảng Ma Trận Công & Tăng Ca tháng ${month}...`, false, 3000);
  try {
    await exportAttendanceMatrixWorkbook({
      month,
      employees: employeesToExport,
      fetchWorkSummaryFn: getAttendanceWorkSummary,
      onProgress: (current, total, emp) => {
        if (current === 1 || current % 5 === 0 || current === total) {
          showToast(`Đang tổng hợp ma trận công: ${current}/${total} nhân sự...`, false, 2000);
        }
      },
    });
    showToast(`Đã xuất thành công Bảng Chấm Công & Tăng Ca ma trận 30 ngày (LVT & PVC) có định dạng màu sắc!`);
  } catch (error) {
    console.error('[Attendance] Lỗi xuất ma trận công:', error);
    showToast('Lỗi xuất file ma trận: ' + (error.message || 'Không xác định'), true);
  }
}

async function executeCompanySplitExport() {
  const monthSelect = document.getElementById('companySplitMonth');
  const yearSelect = document.getElementById('companySplitYear');
  const branchSelect = document.getElementById('companySplitBranch');
  const formatRadios = document.getElementsByName('companySplitFormat');
  const progressBox = document.getElementById('companySplitProgressBox');
  const progressText = document.getElementById('companySplitProgressText');
  const executeBtn = document.getElementById('btnExecuteCompanySplit');
  const cancelBtn = document.getElementById('companySplitCancelBtn');

  const month = monthSelect && yearSelect
    ? `${yearSelect.value}-${monthSelect.value}`
    : (attendanceWorkMonth || todayISO().slice(0, 7));
  const branch = branchSelect?.value || 'all';
  let chosenFormat = 'matrix_format';
  for (const r of formatRadios) {
    if (r.checked) chosenFormat = r.value;
  }

  let employeesToExport = (context?.employees || []).filter((e) => e.status === 'active' && !isPgEmployee(e));
  if (branch !== 'all') {
    employeesToExport = employeesToExport.filter((e) => e.branchId === branch);
  }
  employeesToExport = sortEmployeesByPosition(employeesToExport);
  if (!employeesToExport.length) {
    showToast('Không có nhân sự nào trong phạm vi đã chọn.', true);
    return;
  }

  if (chosenFormat === 'matrix_format') {
    if (progressBox) progressBox.style.display = 'block';
    if (executeBtn) executeBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    try {
      await exportAttendanceMatrixWorkbook({
        month,
        employees: employeesToExport,
        fetchWorkSummaryFn: getAttendanceWorkSummary,
        onProgress: (current, total, emp) => {
          if (progressText) {
            progressText.textContent = `Đang trích xuất ma trận công: [${current}/${total}] ${emp.name} (${emp.id})...`;
          }
        },
      });
      showToast(`Đã xuất thành công Ma Trận Chấm Công & Tăng Ca có định dạng màu sắc cho 2 chi nhánh LVT & PVC (${employeesToExport.length} nhân sự)!`);
      closeCompanySplitModal();
      return;
    } catch (err) {
      console.error('[Attendance] Lỗi xuất ma trận công:', err);
      showToast('Lỗi xuất ma trận công: ' + (err.message || 'Không xác định'), true);
      return;
    } finally {
      if (progressBox) progressBox.style.display = 'none';
      if (executeBtn) executeBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  }

  let dirHandle = null;
  if (chosenFormat === 'directory') {
    if (!window.showDirectoryPicker) {
      showToast('Trình duyệt không hỗ trợ chọn thư mục, chuyển sang tải file ZIP.', true);
      chosenFormat = 'zip';
    } else {
      try {
        dirHandle = await window.showDirectoryPicker();
      } catch (err) {
        if (err.name !== 'AbortError') {
          showToast('Không thể mở thư mục máy tính: ' + err.message, true);
        }
        return;
      }
    }
  }

  if (progressBox) progressBox.style.display = 'block';
  if (executeBtn) executeBtn.disabled = true;
  if (cancelBtn) cancelBtn.disabled = true;

  try {
    const summaryRows = [];
    const perEmployeeSheets = [];
    const zipFiles = [];
    const usedSheetNames = new Set(['tổng hợp công ty', 'quy tắc tính công']);

    const rules = [
      { 'Nội dung': 'Nguồn dữ liệu', 'Quy tắc / công thức': 'Ca làm việc và lượt vào/ra được lưu trên hệ thống từ tháng 09/2026.' },
      { 'Nội dung': 'Chi nhánh trong ngày', 'Quy tắc / công thức': 'Chi nhánh nhân viên chọn khi vào ca và được GPS xác nhận; không lấy chi nhánh cố định trong hồ sơ.' },
      { 'Nội dung': 'Giờ công thường', 'Quy tắc / công thức': 'Thời lượng ca trừ thời gian nghỉ, đi muộn và về sớm; không vượt quá thời gian hiện diện thực tế.' },
      { 'Nội dung': 'Tăng ca', 'Quy tắc / công thức': 'Chỉ cộng số phút từ đơn tăng ca đã được duyệt cuối cùng.' },
      { 'Nội dung': 'Tổng giờ tính công', 'Quy tắc / công thức': 'Giờ công thường + tăng ca đã duyệt.' },
      { 'Nội dung': 'Ngày công', 'Quy tắc / công thức': 'Giờ công thường / số phút chuẩn của ca, tối đa 1 ngày; tăng ca được cộng riêng vào tổng giờ.' },
      { 'Nội dung': 'Cần đối chiếu', 'Quy tắc / công thức': 'Thiếu giờ vào/ra, thiếu ca hoặc dữ liệu bất thường không tự cộng công.' },
    ];

    for (let i = 0; i < employeesToExport.length; i++) {
      const emp = employeesToExport[i];
      if (progressText) {
        progressText.textContent = `Đang trích xuất dữ liệu: [${i + 1}/${employeesToExport.length}] ${emp.name} (${emp.id})...`;
      }

      let summary = null;
      try {
        summary = await getAttendanceWorkSummary(month, emp.id);
      } catch {
        summary = null;
      }

      const totals = summary?.totals || {};
      const days = summary?.days || [];

      summaryRows.push({
        'STT': i + 1,
        'Mã NV': emp.id,
        'Họ và tên': emp.name,
        'Phòng ban': departmentName(emp.department),
        'Chức danh': emp.role || '',
        'Chi nhánh': BRANCHES[emp.branchId]?.name || emp.branchId || '',
        'Giờ công thường (giờ)': Number(((totals.regularMinutes || 0) / 60).toFixed(2)),
        'Tăng ca duyệt (giờ)': Number(((totals.overtimeMinutes || 0) / 60).toFixed(2)),
        'Tổng giờ tính công (giờ)': Number(((totals.payableMinutes || 0) / 60).toFixed(2)),
        'Tổng ngày công': Number(totals.workdays || 0),
        'Công thường (phút)': Number(totals.regularMinutes || 0),
        'Tăng ca duyệt (phút)': Number(totals.overtimeMinutes || 0),
        'Tổng phút tính công': Number(totals.payableMinutes || 0),
        'Đi muộn (phút)': Number(totals.lateMinutes || 0),
        'Về sớm (phút)': Number(totals.earlyLeaveMinutes || 0),
        'Cần đối chiếu (ngày)': Number(totals.incompleteDays || 0),
        'Email': emp.email || '',
        'SĐT': emp.phone || '',
      });

      const dayData = days.map((day, idx) => {
        const [status] = workDayStatus(day);
        const dateObj = new Date(`${day.work_date}T00:00:00`);
        const weekday = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dateObj.getDay()];
        const branchDisplay = (day.checkout_branch_id && day.checkout_branch_id !== day.branch_id)
          ? `${BRANCHES[day.branch_id]?.shortName || day.branch_id} ➔ ${BRANCHES[day.checkout_branch_id]?.shortName || day.checkout_branch_id}`
          : (BRANCHES[day.branch_id]?.shortName || 'Chưa xác định');

        const regMin = Number(day.regular_minutes || 0);
        const otMin = Number(day.overtime_minutes || 0);
        const payMin = Number(day.payable_minutes || 0);

        return {
          'STT': idx + 1,
          'Ngày': dateObj.toLocaleDateString('vi-VN'),
          'Thứ': weekday,
          'Chi nhánh': branchDisplay,
          'Ca làm việc': formatShiftDisplayName(day),
          'Giờ vào': day.checkin_at ? formatTime(day.checkin_at) : '',
          'Giờ ra': day.checkout_at ? formatTime(day.checkout_at) : '',
          'Giờ công thường (giờ)': Number((regMin / 60).toFixed(2)),
          'Tăng ca duyệt (giờ)': Number((otMin / 60).toFixed(2)),
          'Tổng giờ tính công (giờ)': Number((payMin / 60).toFixed(2)),
          'Trễ check-in (phút)': Number(day.late_checkin_minutes || 0),
          'Đi muộn (phút)': Number(day.late_minutes || 0),
          'Về sớm (phút)': Number(day.early_leave_minutes || 0),
          'Giờ công thường (phút)': regMin,
          'Tăng ca duyệt (phút)': otMin,
          'Tổng phút tính công': payMin,
          'Ngày công': Number(day.workday_credit || 0),
          'Trạng thái đối chiếu': status,
          'Ghi chú': day.note || day.attendance_anomaly_reason || '',
        };
      });

      const sheetName = makeSafeSheetName(emp.id, emp.name, usedSheetNames);
      perEmployeeSheets.push({
        sheetName,
        data: dayData.length ? dayData : [{ 'Thông báo': 'Chưa có dữ liệu chấm công trong tháng' }],
      });

      if (chosenFormat === 'zip' || chosenFormat === 'directory') {
        const empWbBuffer = await generateWorkbookBuffer([
          { sheetName: 'Bảng công cá nhân', data: dayData.length ? dayData : [{ 'Thông báo': 'Chưa có dữ liệu chấm công trong tháng' }] },
          { sheetName: 'Quy tắc tính công', data: rules, customWidths: { 'Nội dung': 25, 'Quy tắc / công thức': 80 } },
        ]);
        const safeEmpName = normalizeText(emp.name).replace(/[^a-zA-Z0-9]/g, '_');
        const empFilename = `Bang_Cong_${emp.id}_${safeEmpName}_${month}.xlsx`;

        if (chosenFormat === 'zip') {
          zipFiles.push({ name: empFilename, data: empWbBuffer });
        } else if (chosenFormat === 'directory' && dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(empFilename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(empWbBuffer);
          await writable.close();
        }
      }
    }

    if (progressText) progressText.textContent = 'Đang đóng gói file xuất...';

    if (chosenFormat === 'multi_sheet') {
      const allSheets = [
        { sheetName: 'TỔNG HỢP CÔNG TY', data: summaryRows },
        { sheetName: 'Quy tắc tính công', data: rules, customWidths: { 'Nội dung': 25, 'Quy tắc / công thức': 80 } },
        ...perEmployeeSheets,
      ];
      await exportWorkbookToExcel({
        filename: `Bang_Cong_GPS_Toan_Cong_Ty_${month}.xlsx`,
        sheets: allSheets,
      });
      showToast(`Đã xuất thành công sổ cái Excel toàn công ty (${employeesToExport.length} nhân sự, ${perEmployeeSheets.length} sheet)!`);
    } else if (chosenFormat === 'zip') {
      const summaryBuffer = await generateWorkbookBuffer([
        { sheetName: 'TỔNG HỢP CÔNG TY', data: summaryRows },
        { sheetName: 'Quy tắc tính công', data: rules, customWidths: { 'Nội dung': 25, 'Quy tắc / công thức': 80 } },
      ]);
      zipFiles.unshift({ name: `00_Tong_Hop_Cham_Cong_Toan_Cong_Ty_${month}.xlsx`, data: summaryBuffer });

      const zipData = createZipArchive(zipFiles);
      downloadFile(zipData, `Bang_Cong_GPS_Tung_Nhan_Su_${month}.zip`, 'application/zip');
      showToast(`Đã tải file ZIP gồm ${zipFiles.length} file Excel phân tách theo từng nhân sự!`);
    } else if (chosenFormat === 'directory' && dirHandle) {
      const summaryBuffer = await generateWorkbookBuffer([
        { sheetName: 'TỔNG HỢP CÔNG TY', data: summaryRows },
        { sheetName: 'Quy tắc tính công', data: rules, customWidths: { 'Nội dung': 25, 'Quy tắc / công thức': 80 } },
      ]);
      const fileHandle = await dirHandle.getFileHandle(`00_Tong_Hop_Cham_Cong_Toan_Cong_Ty_${month}.xlsx`, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(summaryBuffer);
      await writable.close();

      showToast(`Đã lưu trực tiếp toàn bộ file Excel của từng nhân sự vào thư mục máy tính!`);
    }

    closeCompanySplitModal();
  } catch (error) {
    console.error('[Attendance] Lỗi xuất bảng công toàn công ty:', error);
    showToast('Lỗi xuất dữ liệu: ' + (error.message || 'Không xác định'), true);
  } finally {
    if (progressBox) progressBox.style.display = 'none';
    if (executeBtn) executeBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
  }
}



function openAdjustModal(data = {}) {
  const modal = document.getElementById('attendanceAdjustModal');
  if (!modal) return;
  const empSelect = document.getElementById('adjustEmployee');
  const dateInput = document.getElementById('adjustWorkDate');
  const branchSelect = document.getElementById('adjustBranch');
  const checkoutBranchSelect = document.getElementById('adjustCheckoutBranch');
  const shiftSelect = document.getElementById('adjustShift');
  const inInput = document.getElementById('adjustCheckin');
  const outInput = document.getElementById('adjustCheckout');
  const reasonSelect = document.getElementById('adjustReason');
  const noteInput = document.getElementById('adjustNote');
  const delBtn = document.getElementById('adjustDeleteDayBtn');
  const submitBtn = document.getElementById('adjustSubmitBtn');

  if (empSelect && data.employeeCode) empSelect.value = data.employeeCode;
  if (dateInput) dateInput.value = data.workDate || clinicDateISO();
  if (branchSelect && data.branchId) branchSelect.value = data.branchId;
  if (checkoutBranchSelect) checkoutBranchSelect.value = data.checkoutBranchId || '';
  if (shiftSelect && data.shiftCode) shiftSelect.value = data.shiftCode;
  if (inInput) inInput.value = data.checkin || '';
  if (outInput) outInput.value = data.checkout || '';
  if (reasonSelect) reasonSelect.value = data.reason || 'Quên bấm chấm công';
  if (noteInput) noteInput.value = data.note || '';

  const otStartInput = document.getElementById('adjustOtStart');
  const otEndInput = document.getElementById('adjustOtEnd');
  if (otStartInput) otStartInput.value = '';
  if (otEndInput) otEndInput.value = '';
  const empTargetCode = data.employeeCode || context?.targetEmployeeCode;
  const wDateTarget = data.workDate || clinicDateISO();
  if (empTargetCode && wDateTarget) {
    getOvertimeRecord(empTargetCode, wDateTarget).then((ot) => {
      if (ot) {
        if (otStartInput) otStartInput.value = (ot.request_start_time || '').slice(0, 5);
        if (otEndInput) otEndInput.value = (ot.request_end_time || '').slice(0, 5);
      }
    }).catch(() => null);
  }

  if (delBtn) {
    delBtn.hidden = !(data.checkin || data.checkout);
    delBtn.disabled = false;
    delBtn.innerHTML = '<i class="ri-delete-bin-6-line"></i> Xóa lượt chấm ngày này';
  }
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Lưu & Cập nhật ngày công';
  }

  modal.removeAttribute('hidden');
  modal.hidden = false;
}

function closeAdjustModal() {
  const modal = document.getElementById('attendanceAdjustModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('hidden', '');
  }
}

async function openOvertimeModal(workDate = '') {
  const modal = document.getElementById('overtimeAdjustModal');
  if (!modal) return;

  const targetDate = workDate || clinicDateISO();
  const dateInput = document.getElementById('otWorkDate');
  if (dateInput) dateInput.value = targetDate;

  const empCode = document.getElementById('otEmployee')?.value || context?.targetEmployeeCode || attendanceAdminSelectedEmployee;
  const deleteBtn = document.getElementById('otDeleteBtn');
  const startTimeInput = document.getElementById('otStartTime');
  const endTimeInput = document.getElementById('otEndTime');
  const reasonInput = document.getElementById('otReason');

  if (deleteBtn) deleteBtn.hidden = true;

  if (empCode && targetDate) {
    try {
      const existingOt = await getOvertimeRecord(empCode, targetDate);
      if (existingOt) {
        if (startTimeInput) startTimeInput.value = (existingOt.request_start_time || '17:30').slice(0, 5);
        if (endTimeInput) endTimeInput.value = (existingOt.request_end_time || '20:00').slice(0, 5);
        if (reasonInput) reasonInput.value = existingOt.reason || '';
        if (deleteBtn) deleteBtn.hidden = false;
      } else {
        if (startTimeInput && !startTimeInput.value) startTimeInput.value = '17:30';
        if (endTimeInput && !endTimeInput.value) endTimeInput.value = '20:00';
      }
    } catch {
      // ignore
    }
  }

  updateOtDurationHint();
  modal.removeAttribute('hidden');
  modal.hidden = false;
}

function closeOvertimeModal() {
  const modal = document.getElementById('overtimeAdjustModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('hidden', '');
  }
}

function updateOtDurationHint() {
  const badge = document.getElementById('otDurationBadge');
  const startVal = document.getElementById('otStartTime')?.value;
  const endVal = document.getElementById('otEndTime')?.value;
  if (!badge || !startVal || !endVal) return;
  const [sH, sM] = startVal.split(':').map(Number);
  const [eH, eM] = endVal.split(':').map(Number);
  let sTotal = sH * 60 + sM;
  let eTotal = eH * 60 + eM;
  let isOvernight = false;
  if (eTotal <= sTotal) {
    eTotal += 24 * 60;
    isOvernight = true;
  }
  const diff = eTotal - sTotal;
  const hours = Math.round((diff / 60) * 10) / 10;
  badge.innerHTML = `<i class="ri-time-line"></i> <span>Thời lượng: ${hours} giờ (${diff} phút)${isOvernight ? ' — Ca qua đêm (+1 ngày)' : ''}</span>`;
}

async function openScheduleModal(workDate = clinicDateISO()) {
  const modal = document.getElementById('scheduleAdjustModal');
  const form = document.getElementById('scheduleAdjustForm');
  if (!modal || !form || !context?.targetEmployeeCode) return;
  const dateInput = document.getElementById('scheduleWorkDate');
  const branchInput = document.getElementById('scheduleBranch');
  const noteInput = document.getElementById('scheduleNote');
  const deleteButton = document.getElementById('scheduleDeleteBtn');
  const submitButton = document.getElementById('scheduleSubmitBtn');
  if (dateInput) dateInput.value = workDate;
  modal.removeAttribute('hidden');
  modal.hidden = false;
  form.classList.add('is-loading');
  if (submitButton) { submitButton.disabled = true; submitButton.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang tải lịch'; }
  try {
    const assignments = await getScheduleAssignments(workDate);
    const existing = assignments.find((item) => item.employee === context.targetEmployeeCode);
    form.dataset.assignmentId = existing?.id || '';
    const selectedShift = existing?.shift || context.targetAllowedShifts?.[0]?.id || '';
    form.querySelectorAll('input[name="scheduleShift"]').forEach((input) => { input.checked = input.value === selectedShift; });
    if (branchInput) branchInput.value = existing?.branchId || context.targetEmployee?.branchId || BRANCH.id;
    if (noteInput) noteInput.value = existing?.note || '';
    if (deleteButton) deleteButton.hidden = !existing?.id;
  } catch (error) {
    showToast(error?.message || 'Không tải được lịch hiện tại của nhân sự.', true);
  } finally {
    form.classList.remove('is-loading');
    if (submitButton) { submitButton.disabled = false; submitButton.innerHTML = '<i class="ri-save-3-line"></i> Lưu lịch làm'; }
  }
}

function closeScheduleModal() {
  const modal = document.getElementById('scheduleAdjustModal');
  if (modal) {
    modal.hidden = true;
    modal.setAttribute('hidden', '');
  }
}

export function initView() {
  const state = store.getState();
  if (state.profile?.role === 'pg_staff' || state.role === 'pg_staff' || isPgEmployee(state.profile)) {
    initPgAttendance();
    return;
  }
  const page = document.querySelector('.attendance-page');
  if (!page) return;

  const refreshAttendanceFilters = () => store.notify();

  document.getElementById('attendanceEmployeeSearch')?.addEventListener('input', (event) => {
    const query = normalizeText(event.target.value);
    let visibleCount = 0;
    document.querySelectorAll('[data-employee-group]').forEach((group) => {
      let groupVisible = 0;
      group.querySelectorAll('[data-employee-search]').forEach((button) => {
        const visible = !query || button.dataset.employeeSearch.includes(query);
        button.hidden = !visible;
        if (visible) { groupVisible += 1; visibleCount += 1; }
      });
      group.hidden = groupVisible === 0;
    });
    const empty = document.querySelector('.attendance-employee-no-result');
    if (empty) empty.hidden = visibleCount > 0;
  });

  const handleWorkMonthSelect = () => {
    const mSelect = document.getElementById('attendanceWorkMonthSelect');
    const ySelect = document.getElementById('attendanceWorkYearSelect');
    if (!mSelect || !ySelect) return;
    const month = `${ySelect.value}-${mSelect.value}`;
    if (month < '2026-08') {
      showToast('Bảng công mới bắt đầu từ tháng 08/2026.', true);
      return;
    }
    attendanceWorkMonth = month;
    attendanceWorkPage = 1;
    navigateTo('attendance');
  };
  document.getElementById('attendanceWorkMonthSelect')?.addEventListener('change', handleWorkMonthSelect);
  document.getElementById('attendanceWorkYearSelect')?.addEventListener('change', handleWorkMonthSelect);

  const handleHistoryMonthSelect = () => {
    const mSelect = document.getElementById('attendanceHistoryMonthSelect');
    const ySelect = document.getElementById('attendanceHistoryYearSelect');
    if (!mSelect || !ySelect) return;
    attendanceHistoryMonth = `${ySelect.value}-${mSelect.value}`;
    attendanceHistoryPage = 1;
    refreshAttendanceFilters();
  };
  document.getElementById('attendanceHistoryMonthSelect')?.addEventListener('change', handleHistoryMonthSelect);
  document.getElementById('attendanceHistoryYearSelect')?.addEventListener('change', handleHistoryMonthSelect);

  document.getElementById('attendanceWorkMonth')?.addEventListener('change', (event) => {
    const month = String(event.target.value || '');
    if (month < '2026-09') {
      showToast('Bảng công mới bắt đầu từ tháng 09/2026.', true);
      event.target.value = attendanceWorkMonth;
      return;
    }
    attendanceWorkMonth = month;
    attendanceWorkPage = 1;
    navigateTo('attendance');
  });
  document.getElementById('attendanceWorkBranch')?.addEventListener('change', (event) => {
    attendanceWorkBranchFilter = event.target.value;
    attendanceWorkPage = 1;
    refreshAttendanceFilters();
  });
  document.getElementById('attendanceWorkStatus')?.addEventListener('change', (event) => {
    attendanceWorkStatusFilter = event.target.value;
    attendanceWorkPage = 1;
    refreshAttendanceFilters();
  });
  document.getElementById('attendanceHistoryMonth')?.addEventListener('change', (event) => {
    attendanceHistoryMonth = event.target.value;
    attendanceHistoryPage = 1;
    refreshAttendanceFilters();
  });
  document.getElementById('attendanceHistoryBranch')?.addEventListener('change', (event) => {
    attendanceHistoryBranch = event.target.value;
    attendanceHistoryPage = 1;
    refreshAttendanceFilters();
  });
  document.getElementById('attendanceHistoryType')?.addEventListener('change', (event) => {
    attendanceHistoryType = event.target.value;
    attendanceHistoryPage = 1;
    refreshAttendanceFilters();
  });
  document.getElementById('attendanceSearchFilter')?.addEventListener('input', (event) => {
    attendanceSearch = event.target.value;
    attendanceAdminPage = 1;
    window.clearTimeout(event.target._attendanceFilterTimer);
    event.target._attendanceFilterTimer = window.setTimeout(refreshAttendanceFilters, 180);
  });
  document.getElementById('attendanceDepartmentFilter')?.addEventListener('change', (event) => { attendanceDepartmentFilter = event.target.value; attendanceAdminPage = 1; refreshAttendanceFilters(); });
  document.getElementById('attendanceSearchMode')?.addEventListener('change', (event) => { attendanceSearchMode = event.target.value; attendanceAdminPage = 1; refreshAttendanceFilters(); });
  document.getElementById('attendanceBranchFilter')?.addEventListener('change', (event) => { attendanceBranchFilter = event.target.value; attendanceAdminPage = 1; refreshAttendanceFilters(); });
  document.getElementById('attendanceTypeFilter')?.addEventListener('change', (event) => { attendanceTypeFilter = event.target.value; attendanceAdminPage = 1; refreshAttendanceFilters(); });
  document.getElementById('attendanceStatusFilter')?.addEventListener('change', (event) => { attendanceStatusFilter = event.target.value; attendanceAdminPage = 1; refreshAttendanceFilters(); });
  document.getElementById('attendanceDateFilter')?.addEventListener('change', (event) => { attendanceDateFilter = event.target.value; attendanceAdminPage = 1; refreshAttendanceFilters(); });
  document.getElementById('attendanceAdminPageSize')?.addEventListener('change', (event) => {
    attendanceAdminPageSize = Number(event.target.value || 10);
    attendanceAdminPage = 1;
    refreshAttendanceFilters();
  });
  document.getElementById('clearAttendanceFilters')?.addEventListener('click', () => {
    attendanceSearch = '';
    attendanceSearchMode = 'near';
    attendanceDepartmentFilter = 'all';
    attendanceBranchFilter = 'all';
    attendanceTypeFilter = 'all';
    attendanceStatusFilter = 'all';
    attendanceDateFilter = '';
    attendanceAdminPage = 1;
    refreshAttendanceFilters();
  });

  const updateClock = () => {
    const node = document.getElementById('attendanceLiveClock');
    if (!node) {
      clearTimeout(clockTimer);
      clockTimer = null;
      return;
    }

    const nextLabel = clinicTimeLabel();
    if (node.textContent !== nextLabel) node.textContent = nextLabel;

    // Stay aligned to the next real second instead of accumulating interval drift.
    clockTimer = window.setTimeout(updateClock, 1020 - (Date.now() % 1000));
  };
  updateClock();

  page.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'switch-tab') {
      const tab = event.target.closest('[data-tab]')?.dataset.tab;
      if (tab) {
        attendanceActiveTab = tab;
        refreshAttendanceFilters();
      }
    }
    if (action === 'toggle-employee-picker') {
      const popover = document.getElementById('attendanceEmployeePopover');
      const trigger = event.target.closest('[data-action="toggle-employee-picker"]');
      if (popover && trigger) {
        const willOpen = popover.hidden;
        popover.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', String(willOpen));
        if (willOpen) window.requestAnimationFrame(() => document.getElementById('attendanceEmployeeSearch')?.focus());
      }
    }
    if (action === 'select-attendance-employee') {
      attendanceAdminSelectedEmployee = event.target.closest('[data-employee]')?.dataset.employee || '';
      attendanceWorkPage = 1;
      navigateTo('attendance');
    }
    if (action === 'open-adjust-modal') {
      if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
        showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền sửa công.', true);
        return;
      }
      openAdjustModal({
        employeeCode: context?.targetEmployeeCode || '',
        workDate: clinicDateISO(),
        branchId: context?.targetEmployee?.branchId || BRANCH.id,
        shiftCode: context?.targetAllowedShifts?.[0]?.id || 'clinic-0800',
      });
    }
    if (action === 'adjust-day') {
      if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
        showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền sửa công.', true);
        return;
      }
      const btn = event.target.closest('button');
      const d = btn.dataset;
      openAdjustModal({
        employeeCode: context?.targetEmployeeCode || '',
        workDate: d.date,
        shiftCode: d.shift || 'clinic-0800',
        branchId: d.branch || 'pham-van-chieu',
        checkoutBranchId: d.checkoutBranch || '',
        checkin: d.checkin || '',
        checkout: d.checkout || '',
      });
    }
    if (action === 'close-adjust-modal') {
      closeAdjustModal();
    }
    if (action === 'open-overtime-modal') {
      if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
        showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền bổ sung tăng ca.', true);
        return;
      }
      openOvertimeModal();
    }
    if (action === 'quick-overtime-day') {
      if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
        showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền bổ sung tăng ca.', true);
        return;
      }
      const targetDate = event.target.closest('button')?.dataset.date || clinicDateISO();
      openOvertimeModal(targetDate);
    }
    if (action === 'close-overtime-modal') {
      closeOvertimeModal();
    }
    if (action === 'open-schedule-modal') {
      if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
        showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền xếp lịch.', true);
        return;
      }
      await openScheduleModal();
    }
    if (action === 'close-schedule-modal') closeScheduleModal();
    if (action === 'open-checkin') openDialog();
    if (action === 'checkout') confirmCheckout(event.target.closest('button'));
    if (action === 'export-attendance') exportAttendance();
    if (action === 'export-work-excel') exportWorkExcel();
    if (action === 'export-matrix-attendance') exportAttendanceMatrixDirect();
    if (action === 'export-company-split-excel') openCompanySplitModal();
    if (action === 'close-company-split-modal') closeCompanySplitModal();
    if (action === 'work-prev' && attendanceWorkPage > 1) { attendanceWorkPage -= 1; refreshAttendanceFilters(); }
    if (action === 'work-next') { attendanceWorkPage += 1; refreshAttendanceFilters(); }
    if (action === 'history-prev' && attendanceHistoryPage > 1) { attendanceHistoryPage -= 1; refreshAttendanceFilters(); }
    if (action === 'history-next') { attendanceHistoryPage += 1; refreshAttendanceFilters(); }
    if (action === 'admin-history-first') { attendanceAdminPage = 1; refreshAttendanceFilters(); }
    if (action === 'admin-history-prev' && attendanceAdminPage > 1) { attendanceAdminPage -= 1; refreshAttendanceFilters(); }
    if (action === 'admin-history-page') { attendanceAdminPage = Number(event.target.closest('[data-page]')?.dataset.page || 1); refreshAttendanceFilters(); }
    if (action === 'admin-history-next') { attendanceAdminPage += 1; refreshAttendanceFilters(); }
    if (action === 'admin-history-last') { attendanceAdminPage = Number(event.target.closest('[data-page]')?.dataset.page || attendanceAdminPage); refreshAttendanceFilters(); }
    if (action === 'sync-attendance') {
      const button = event.target.closest('button');
      button.disabled = true;
      button.textContent = 'Đang đồng bộ…';
      const result = await syncOfflineAttendance(context.state.user?.id);
      const proofResult = await syncPendingProofs(context.state.user?.id);
      const total = result.synced + proofResult.synced;
      if (result.rejected > 0) {
        showToast(`${result.rejected} lượt chấm công bị máy chủ từ chối và đã dừng gửi lại.`, true);
      }
      showToast(total ? `Đã đồng bộ ${total} bản ghi và ảnh chấm công.` : 'Chưa có dữ liệu nào được đồng bộ.');
      navigateTo('attendance');
    }
    if (action === 'discard-rejected') {
      discardRejectedAttendance(context.state.user?.id);
      showToast('Đã xóa các lượt chấm công bị từ chối khỏi thiết bị.');
      navigateTo('attendance');
    }
  });

  const adjustForm = document.getElementById('attendanceAdjustForm');
  adjustForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
      showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền sửa công.', true);
      return;
    }
    const submitBtn = document.getElementById('adjustSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang lưu…';
    try {
      const empCode = document.getElementById('adjustEmployee').value;
      const wDate = document.getElementById('adjustWorkDate').value;
      const checkoutBranchVal = document.getElementById('adjustCheckoutBranch')?.value || null;
      await adjustAttendanceRecord({
        employeeCode: empCode,
        workDate: wDate,
        branchId: document.getElementById('adjustBranch').value,
        checkoutBranchId: checkoutBranchVal,
        shiftCode: document.getElementById('adjustShift').value,
        checkinTime: document.getElementById('adjustCheckin').value,
        checkoutTime: document.getElementById('adjustCheckout').value,
        reason: document.getElementById('adjustReason').value,
        note: document.getElementById('adjustNote').value,
      });
      const otStartVal = document.getElementById('adjustOtStart')?.value;
      const otEndVal = document.getElementById('adjustOtEnd')?.value;
      if (otStartVal && otEndVal) {
        const adminCode = context?.state?.profile?.employee_code || context?.state?.user?.user_metadata?.employee_code || 'admin_it';
        await adjustOvertimeRecord({
          employeeCode: empCode,
          workDate: wDate,
          startTime: otStartVal,
          endTime: otEndVal,
          reason: 'Admin IT điều chỉnh công & tăng ca',
          reviewerCode: adminCode,
        }).catch((otErr) => console.warn('[Attendance] Adjust overtime in modal:', otErr));
      }
      attendanceAdminSelectedEmployee = empCode;
      showToast(`Đã điều chỉnh công ngày ${wDate} thành công!`);
      closeAdjustModal();
      navigateTo('attendance');
    } catch (err) {
      console.error('[Attendance] Adjust failed:', err);
      showToast(err?.message || 'Không thể lưu điều chỉnh. Vui lòng thử lại.', true);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Lưu & Cập nhật ngày công';
    }
  });

  document.getElementById('scheduleWorkDate')?.addEventListener('change', (event) => openScheduleModal(event.target.value));
  const scheduleForm = document.getElementById('scheduleAdjustForm');
  scheduleForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) return;
    const submitButton = document.getElementById('scheduleSubmitBtn');
    const date = document.getElementById('scheduleWorkDate').value;
    const selectedShift = scheduleForm.querySelector('input[name="scheduleShift"]:checked')?.value;
    if (!selectedShift) { showToast('Nhân sự chưa có ca hợp lệ để xếp lịch.', true); return; }
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang lưu';
    try {
      await createScheduleAssignment({
        employee: context.targetEmployeeCode,
        date,
        branchId: document.getElementById('scheduleBranch').value,
        shift: selectedShift,
        status: 'planned',
        note: document.getElementById('scheduleNote').value || '[ADMIN_IT] Điều chỉnh lịch làm',
      });
      showToast(`Đã lưu lịch làm ngày ${date} cho ${context.targetEmployee.name}.`);
      closeScheduleModal();
      navigateTo('attendance');
    } catch (error) {
      showToast(error?.message || 'Không thể lưu lịch làm.', true);
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="ri-save-3-line"></i> Lưu lịch làm';
    }
  });

  document.getElementById('scheduleDeleteBtn')?.addEventListener('click', async () => {
    const assignmentId = scheduleForm?.dataset.assignmentId;
    const date = document.getElementById('scheduleWorkDate')?.value;
    if (!assignmentId || !confirm(`Xóa lịch làm ngày ${date} của ${context.targetEmployee.name}?`)) return;
    try {
      await deleteScheduleAssignment(assignmentId);
      showToast(`Đã xóa lịch làm ngày ${date}.`);
      closeScheduleModal();
      navigateTo('attendance');
    } catch (error) { showToast(error?.message || 'Không thể xóa lịch làm.', true); }
  });

  const deleteDayBtn = document.getElementById('adjustDeleteDayBtn');
  deleteDayBtn?.addEventListener('click', async () => {
    if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
      showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền sửa công.', true);
      return;
    }
    const empCode = document.getElementById('adjustEmployee').value;
    const wDate = document.getElementById('adjustWorkDate').value;
    if (!confirm(`Bạn có chắc chắn muốn xóa tất cả lượt chấm công ngày ${wDate} của nhân sự này?`)) return;
    deleteDayBtn.disabled = true;
    deleteDayBtn.textContent = 'Đang xóa…';
    try {
      await deleteAttendanceDayRecords(empCode, wDate);
      showToast(`Đã xóa lượt chấm công ngày ${wDate}.`);
      closeAdjustModal();
      navigateTo('attendance');
    } catch (err) {
      console.error('[Attendance] Delete day records failed:', err);
      showToast(err?.message || 'Không thể xóa dữ liệu.', true);
      deleteDayBtn.disabled = false;
      deleteDayBtn.innerHTML = '<i class="ri-delete-bin-6-line"></i> Xóa lượt chấm ngày này';
    }
  });

  const otForm = document.getElementById('overtimeAdjustForm');
  otForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canEditAttendance(context?.state?.profile?.role || context?.state?.role)) {
      showToast('Chỉ quản trị viên hệ thống (Admin IT) mới có quyền bổ sung tăng ca.', true);
      return;
    }
    const submitBtn = document.getElementById('otSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang lưu…';
    try {
      const empCode = document.getElementById('otEmployee')?.value || context?.targetEmployeeCode || attendanceAdminSelectedEmployee;
      const wDate = document.getElementById('otWorkDate')?.value;
      const sTime = document.getElementById('otStartTime')?.value;
      const eTime = document.getElementById('otEndTime')?.value;
      const reasonVal = document.getElementById('otReason')?.value;
      const noteVal = document.getElementById('otNote')?.value;
      const adminCode = context?.state?.profile?.employee_code || context?.state?.user?.user_metadata?.employee_code || 'admin_it';

      await adjustOvertimeRecord({
        employeeCode: empCode,
        workDate: wDate,
        startTime: sTime,
        endTime: eTime,
        reason: reasonVal + (noteVal ? ` [${noteVal}]` : ''),
        reviewerCode: adminCode,
      });

      attendanceAdminSelectedEmployee = empCode;
      showToast(`Đã lưu & duyệt tăng ca ngày ${wDate} thành công!`);
      closeOvertimeModal();
      navigateTo('attendance');
    } catch (err) {
      console.error('[Attendance] Adjust overtime failed:', err);
      showToast(err?.message || 'Không thể lưu tăng ca. Vui lòng thử lại.', true);
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="ri-checkbox-circle-line"></i> Lưu & Duyệt tăng ca';
    }
  });

  document.getElementById('otDeleteBtn')?.addEventListener('click', async () => {
    const empCode = document.getElementById('otEmployee')?.value || context?.targetEmployeeCode || attendanceAdminSelectedEmployee;
    const wDate = document.getElementById('otWorkDate')?.value;
    if (!confirm(`Xóa giờ tăng ca ngày ${wDate} của nhân sự ${context?.targetEmployee?.name || empCode}?`)) return;
    try {
      await deleteOvertimeRecord(empCode, wDate);
      showToast(`Đã xóa tăng ca ngày ${wDate}.`);
      closeOvertimeModal();
      navigateTo('attendance');
    } catch (err) {
      showToast(err?.message || 'Không thể xóa tăng ca.', true);
    }
  });

  document.getElementById('otStartTime')?.addEventListener('input', updateOtDurationHint);
  document.getElementById('otStartTime')?.addEventListener('change', updateOtDurationHint);
  document.getElementById('otEndTime')?.addEventListener('input', updateOtDurationHint);
  document.getElementById('otEndTime')?.addEventListener('change', updateOtDurationHint);
  document.getElementById('otWorkDate')?.addEventListener('change', (e) => {
    const empCode = document.getElementById('otEmployee')?.value || context?.targetEmployeeCode || attendanceAdminSelectedEmployee;
    if (empCode && e.target.value) {
      getOvertimeRecord(empCode, e.target.value).then((existingOt) => {
        const delBtn = document.getElementById('otDeleteBtn');
        const sInput = document.getElementById('otStartTime');
        const eInput = document.getElementById('otEndTime');
        const rInput = document.getElementById('otReason');
        if (existingOt) {
          if (sInput) sInput.value = (existingOt.request_start_time || '17:30').slice(0, 5);
          if (eInput) eInput.value = (existingOt.request_end_time || '20:00').slice(0, 5);
          if (rInput) rInput.value = existingOt.reason || '';
          if (delBtn) delBtn.hidden = false;
        } else {
          if (delBtn) delBtn.hidden = true;
        }
        updateOtDurationHint();
      }).catch(() => null);
    }
  });

  const dialog = document.getElementById('checkinDialog');
  dialog?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close-checkin') closeDialog();
    if (action === 'retry-location') captureLocation();
    if (action === 'capture-photo') takeWorkplacePhoto(event.target.closest('button'));
    if (action === 'retake-photo' || action === 'retry-camera') retakeWorkplacePhoto();
    if (action === 'confirm-checkin') confirmCheckin(event.target.closest('button'));
  });
  dialog?.addEventListener('change', (event) => {
    if (event.target.id === 'attendanceBranchChoice') {
      context.selectedBranchId = event.target.value;
      context.settings = settingsForBranch(event.target.value, context.state.settings);
      const address = document.getElementById('attendanceBranchAddress');
      const accuracyRule = document.getElementById('attendanceAccuracyRule');
      const radiusRule = document.getElementById('attendanceRadiusRule');
      if (address) address.textContent = context.settings.clinicAddress;
      if (accuracyRule) accuracyRule.textContent = `✓ Sai số GPS tối đa ${Number(context.settings.maxGpsAccuracy)} m`;
      if (radiusRule) radiusRule.textContent = `✓ Trong bán kính ${Number(context.settings.allowedRadius)} m`;
      captureLocation();
      return;
    }
    if (event.target.name !== 'attendanceShift') return;
    context.selectedShift = context.allowedShifts.find((item) => item.id === event.target.value) || null;
    const summary = document.getElementById('selectedShiftSummary');
    if (summary && context.selectedShift) summary.textContent = `${context.selectedShift.name} · ${context.selectedShift.start}–${context.selectedShift.end}`;
    updateConfirmAvailability();
  });
  dialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDialog();
  });

  const adjustModal = document.getElementById('attendanceAdjustModal');
  adjustModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close-adjust-modal') {
      event.preventDefault();
      closeAdjustModal();
    }
  });

  const schedModal = document.getElementById('scheduleAdjustModal');
  schedModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close-schedule-modal') {
      event.preventDefault();
      closeScheduleModal();
    }
  });

  const companySplitModal = document.getElementById('companySplitExportModal');
  companySplitModal?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close-company-split-modal') {
      event.preventDefault();
      closeCompanySplitModal();
    }
  });

  document.getElementById('btnExecuteCompanySplit')?.addEventListener('click', executeCompanySplitExport);

  // Menu Dropdown Quản trị & Xuất Excel
  const menuBtn = document.getElementById('btnAttendanceActionMenu');
  const dropdownMenu = document.getElementById('attendanceActionMenuDropdown');
  const arrowIcon = document.getElementById('attendanceMenuArrow');

  if (menuBtn && dropdownMenu) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdownMenu.style.display === 'block';
      dropdownMenu.style.display = isOpen ? 'none' : 'block';
      if (arrowIcon) arrowIcon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && !menuBtn.contains(e.target)) {
        dropdownMenu.style.display = 'none';
        if (arrowIcon) arrowIcon.style.transform = 'rotate(0deg)';
      }
    });

    dropdownMenu.querySelectorAll('.attendance-dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        dropdownMenu.style.display = 'none';
        if (arrowIcon) arrowIcon.style.transform = 'rotate(0deg)';
      });
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f8fafc';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'transparent';
      });
    });
  }

  const handleEscapeKey = (event) => {
    if (event.key === 'Escape') {
      if (dropdownMenu) {
        dropdownMenu.style.display = 'none';
        if (arrowIcon) arrowIcon.style.transform = 'rotate(0deg)';
      }
      closeAdjustModal();
      closeScheduleModal();
      closeCompanySplitModal();
      closeDialog();
    }
  };
  document.removeEventListener('keydown', handleEscapeKey);
  document.addEventListener('keydown', handleEscapeKey);

  // once:true khien badge chi doi dung mot lan roi ket o trang thai sai. Dung
  // mot handler co dinh va go truoc khi gan lai de khong ro listener qua moi
  // lan render.
  window.removeEventListener('clinic:network-change', syncNetworkBadge);
  window.addEventListener('clinic:network-change', syncNetworkBadge);
}
