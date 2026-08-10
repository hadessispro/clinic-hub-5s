import { clockIn, clockOut, getAttendance, getOfflineQueue, syncOfflineAttendance } from '../services/attendance.js';
import { getEmployees } from '../services/employees.js';
import { getEmployeeAllowedShifts } from '../services/schedule.js';
import {
  acquireCurrentPosition,
  acquirePrecisePosition,
  getGeolocationPermissionState,
  getOrCreateDeviceId,
  isGeolocationPermissionDenied,
} from '../services/geolocation.js';
import { captureWorkplacePhoto, startWorkplaceCamera, stopWorkplaceCamera } from '../services/camera.js';
import { listPendingProofs, movePendingProof, removePendingProof, savePendingProof, syncPendingProofs, uploadAttendanceProof } from '../services/attendance-proofs.js';
import { BRANCH, branchSettings, clinicDateISO, clinicTimeLabel } from '../branch.js';
import { SHIFTS, defaultShiftForDepartment, effectiveShiftId } from '../constants.js';
import { isOpsRole } from '../permissions.js';
import { navigateTo } from '../router.js';
import { store } from '../store.js';
import { departmentName, distanceMeters, downloadText, escapeHTML, formatDateTime, formatTime, smartMatch } from '../utils.js';
import { statusPill } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { evaluateAttendanceLocation } from '../../server/location-policy.mjs';

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

function attendanceTone(record) {
  if (record?.isOfflinePending) return 'warn';
  if (record?.status === 'valid') return 'good';
  if (record?.status === 'late') return 'warn';
  if (record?.status === 'early_leave') return 'warn';
  return 'bad';
}

function attendanceLabel(record) {
  if (record?.isOfflinePending) return 'Chờ đồng bộ';
  if (record?.status === 'late') return 'Đi muộn';
  if (record?.status === 'early_leave') return 'Về sớm';
  if (record?.status === 'valid') return 'Đã ghi nhận';
  return 'Cần kiểm tra';
}

function recordTypeLabel(record) {
  return record?.type === 'checkout' ? 'Check-out' : 'Check-in';
}

function recordShift(record) {
  return SHIFTS.find((item) => item.id === record?.shift) || null;
}

function recordShiftLabel(record) {
  const shift = recordShift(record);
  return shift ? `${shift.name} ${shift.start}–${shift.end}` : 'Ca chưa xác định';
}

function renderTodayCard(checkin, checkout, shift, employee) {
  const effectiveShift = recordShift(checkout || checkin) || shift;
  if (checkout) {
    return `
      <section class="attendance-primary-card is-complete">
        <div class="attendance-success-mark" aria-hidden="true">✓</div>
        <div class="attendance-primary-copy">
          <p class="eyebrow">Ca làm hôm nay</p>
          <h3>${checkout.isOfflinePending ? 'Đã lưu giờ kết ca trên điện thoại' : 'Đã hoàn thành ca'}</h3>
          <p>${escapeHTML(employee.name)} · ${escapeHTML(effectiveShift?.name || 'Ca làm')} ${escapeHTML(effectiveShift?.start || '')}–${escapeHTML(effectiveShift?.end || '')} · vào ${formatTime(checkin?.time)} · ra ${formatTime(checkout.time)} · GPS ${checkout.distance} m</p>
        </div>
        ${statusPill(attendanceLabel(checkout), attendanceTone(checkout))}
      </section>
    `;
  }

  if (checkin) {
    return `
      <section class="attendance-primary-card is-active">
        <div class="attendance-success-mark" aria-hidden="true">✓</div>
        <div class="attendance-primary-copy">
          <p class="eyebrow">Đang trong ca làm việc</p>
          <h3>${checkin.isOfflinePending ? 'Đã lưu check-in trên điện thoại' : 'Check-in thành công'}</h3>
          <p>${escapeHTML(employee.name)} · ${escapeHTML(effectiveShift?.name || 'Ca làm')} ${escapeHTML(effectiveShift?.start || '')}–${escapeHTML(effectiveShift?.end || '')} · ${formatTime(checkin.time)} · cách phòng khám ${checkin.distance} m</p>
        </div>
        <button class="attendance-checkout-button" type="button" data-action="checkout">
          <span class="attendance-button-icon" aria-hidden="true">↗</span>
          <span><strong>Check-out kết ca</strong><small>Xác minh GPS tại văn phòng</small></span>
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
    return `<div class="attendance-history-list">${records.slice(0, 14).map((record) => `
      <article class="attendance-history-item">
        <div class="attendance-history-date">
          <strong>${new Date(record.time).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: BRANCH.timeZone })}</strong>
          <span>${formatTime(record.time)}</span>
        </div>
        <div>
          <strong>${recordTypeLabel(record)}</strong>
          <p>${escapeHTML(recordShiftLabel(record))} · ${record.distance} m tới phòng khám · GPS ±${record.accuracy} m</p>
        </div>
        ${statusPill(attendanceLabel(record), attendanceTone(record))}
      </article>
    `).join('')}</div>`;
  }

  return `
    <div class="table-wrap attendance-admin-table">
      <table>
        <thead><tr><th>Nhân sự</th><th>Loại</th><th>Ca làm</th><th>Thời gian</th><th>Khoảng cách</th><th>GPS</th><th>Trạng thái</th></tr></thead>
        <tbody>${records.map((record) => {
          const employee = employees.find((item) => item.id === record.employee);
          const employeeMeta = employee
            ? `${departmentName(employee.department)} · ${employee.role || 'Nhân viên'}`
            : 'Chưa liên kết hồ sơ nhân sự';
          return `<tr>
            <td><strong>${escapeHTML(employee?.name || record.employee)}</strong><br><span class="subtle">${escapeHTML(employeeMeta)}</span></td>
            <td><strong>${recordTypeLabel(record)}</strong></td>
            <td>${escapeHTML(recordShiftLabel(record))}</td>
            <td>${formatDateTime(record.time)}</td>
            <td>${record.distance} m</td>
            <td>±${record.accuracy} m${record.capturedOffline ? '<br><span class="subtle">Ghi ngoại tuyến</span>' : ''}</td>
            <td>${statusPill(attendanceLabel(record), attendanceTone(record))}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderCheckinDialog(employee, shift, settings, allowedShifts) {
  const shiftChoices = allowedShifts.length ? allowedShifts : [shift].filter(Boolean);
  const requiresChoice = shiftChoices.length > 1;
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
          <div><span>Ca làm</span><strong id="selectedShiftSummary">${requiresChoice ? 'Chọn ca bên dưới' : `${escapeHTML(shiftChoices[0]?.start || '08:00')}–${escapeHTML(shiftChoices[0]?.end || '17:00')}`}</strong></div>
          <div class="full"><span>Địa điểm</span><strong>${escapeHTML(settings.clinicAddress)}</strong></div>
        </div>

        <fieldset class="attendance-shift-picker">
          <legend>Chọn đúng ca làm việc hôm nay</legend>
          <p>Ca đã chọn sẽ được database kiểm tra lại trước khi ghi nhận.</p>
          <div class="attendance-shift-options">
            ${shiftChoices.map((item, index) => `
              <label class="attendance-shift-option">
                <input type="radio" name="attendanceShift" value="${escapeHTML(item.id)}" ${!requiresChoice && index === 0 ? 'checked' : ''}>
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
          <span>✓ Sai số GPS tối đa ${Number(settings.maxGpsAccuracy)} m</span>
          <span>✓ Trong bán kính ${Number(settings.allowedRadius)} m</span>
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

export async function renderView(state) {
  if (clockTimer) clearTimeout(clockTimer);
  stopWorkplaceCamera();
  const localBranchSettings = branchSettings();
  const settings = state.settings?.branchId === BRANCH.id
    ? { ...localBranchSettings, ...state.settings }
    : localBranchSettings;
  const workDate = clinicDateISO(new Date(), settings.timeZone);
  const offlineQueue = getOfflineQueue(state.user?.id);
  const employeeFallback = currentEmployeeFallback(state);

  const [employees, remoteRecords, pendingProofs, allowedShiftRows] = await Promise.all([
    navigator.onLine ? getEmployees().catch(() => (state.employeeCode ? [employeeFallback] : [])) : Promise.resolve(state.employeeCode ? [employeeFallback] : []),
    state.employeeCode && navigator.onLine
      ? getAttendance({ employee: isOpsRole(state.role) ? undefined : state.employeeCode, limit: isOpsRole(state.role) ? 200 : 31 }).catch(() => [])
      : Promise.resolve([]),
    state.user?.id ? listPendingProofs(state.user.id).catch(() => []) : Promise.resolve([]),
    navigator.onLine && state.employeeCode ? getEmployeeAllowedShifts(state.employeeCode).catch(() => []) : Promise.resolve([]),
  ]);

  const employee = employees.find((item) => item.id === state.employeeCode) || employeeFallback;
  const shiftId = effectiveShiftId({
    assignedShift: null,
    defaultShift: employee.shift,
    department: employee.department,
    workDate,
  });
  const shift = SHIFTS.find((item) => item.id === shiftId)
    || SHIFTS.find((item) => item.id === defaultShiftForDepartment(employee.department));
  const configuredAllowedShifts = allowedShiftRows
    .map((row) => SHIFTS.find((item) => item.id === row.code))
    .filter(Boolean);
  const allowedShifts = configuredAllowedShifts.length ? configuredAllowedShifts : [shift].filter(Boolean);
  const records = mergeRecords(offlineQueue, remoteRecords);
  const todayRecords = mergeRecords(
    offlineQueue.filter((item) => item.employee === state.employeeCode && item.date === workDate),
    remoteRecords.filter((item) => item.employee === state.employeeCode && item.date === workDate),
  );
  const todayCheckin = todayRecords.find((record) => record.type === 'checkin');
  const todayCheckout = todayRecords.find((record) => record.type === 'checkout');
  const ops = isOpsRole(state.role);
  const scopedEmployees = state.role === 'leader'
    ? employees.filter((item) => item.department === state.department)
    : employees;
  const scopedEmployeeCodes = new Set(scopedEmployees.map((item) => item.id));
  const scopedRecords = state.role === 'leader'
    ? records.filter((record) => scopedEmployeeCodes.has(record.employee))
    : records;
  const filteredRecords = ops ? scopedRecords.filter((record) => {
    const recordEmployee = scopedEmployees.find((item) => item.id === record.employee);
    if (attendanceDepartmentFilter !== 'all' && recordEmployee?.department !== attendanceDepartmentFilter) return false;
    if (attendanceBranchFilter !== 'all' && recordEmployee?.branchId !== attendanceBranchFilter) return false;
    if (attendanceTypeFilter !== 'all' && record.type !== attendanceTypeFilter) return false;
    if (attendanceStatusFilter !== 'all' && record.status !== attendanceStatusFilter) return false;
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
  const historyTitle = state.role === 'leader'
    ? `Chấm công bộ phận ${departmentName(state.department)}`
    : (ops ? 'Chấm công toàn hệ thống' : 'Chấm công của tôi');

  context = {
    state, settings, employee, employees: scopedEmployees, shift, allowedShifts, records: filteredRecords, workDate, todayCheckin, todayCheckout, ops,
    selectedShift: allowedShifts.length === 1 ? allowedShifts[0] : null,
  };
  lastLocation = null;
  capturedPhoto = null;
  currentEventId = null;

  if (!state.employeeCode) {
    return `<section class="panel attendance-account-error"><h3>Tài khoản chưa liên kết nhân viên</h3><p>Quản trị viên cần gán mã nhân viên cho tài khoản này trước khi chấm công.</p></section>`;
  }

  const mapUrl = `https://www.google.com/maps?q=${settings.latitude},${settings.longitude}`;
  const pendingCount = offlineQueue.length + pendingProofs.length;
  return `
    <div class="attendance-page">
      <header class="attendance-page-header">
        <div>
          <p class="eyebrow">GPS Attendance · ${escapeHTML(BRANCH.shortName)}</p>
          <h3>Chấm công vào ca</h3>
          <p>${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: settings.timeZone })}</p>
        </div>
        <div class="attendance-header-actions">
          <span class="network-status ${navigator.onLine ? 'is-online' : 'is-offline'}" data-network-status>
            <span></span>${navigator.onLine ? 'Đang online' : 'Đang ngoại tuyến'}
          </span>
          ${ops ? '<button class="secondary-button" type="button" data-action="export-attendance">Xuất CSV</button>' : ''}
        </div>
      </header>

      ${pendingCount ? `
        <div class="attendance-sync-banner">
          <div><strong>${pendingCount} mục đang chờ đồng bộ</strong><span>Bản ghi và ảnh chấm công vẫn an toàn trên điện thoại này.</span></div>
          <button type="button" data-action="sync-attendance" ${navigator.onLine ? '' : 'disabled'}>Đồng bộ ngay</button>
        </div>
      ` : ''}

      ${renderTodayCard(todayCheckin, todayCheckout, shift, employee)}

      <div class="attendance-info-grid">
        <section class="attendance-office-card">
          <div class="attendance-card-icon" aria-hidden="true">⌖</div>
          <div>
            <p class="eyebrow">Điểm chấm công</p>
            <h3>${escapeHTML(BRANCH.shortName)}</h3>
            <p>${escapeHTML(settings.clinicAddress)}</p>
            <a href="${mapUrl}" target="_blank" rel="noreferrer">Mở vị trí phòng khám</a>
          </div>
          <span class="attendance-radius">${Number(settings.allowedRadius)} m</span>
        </section>
        <section class="attendance-rule-card">
          <div class="attendance-card-icon" aria-hidden="true">⏱</div>
          <div><p class="eyebrow">Quy định hôm nay</p><h3>Ca ${escapeHTML(shift?.start || '08:00')}–${escapeHTML(shift?.end || '17:00')}</h3><p>Check-in trước giờ bắt đầu ít nhất 5 phút. Check-in và check-out đều phải xác minh GPS tại phòng khám.</p></div>
        </section>
      </div>

      <section class="attendance-history-panel">
        <div class="section-title">
          <div><p class="eyebrow">Lịch sử</p><h3>${escapeHTML(historyTitle)}</h3></div>
          <span class="subtle">${filteredRecords.length}/${scopedRecords.length} bản ghi</span>
        </div>
        ${ops ? `<div class="operation-filterbar attendance-filterbar">
          <label class="is-search">Tìm thông minh<input type="search" id="attendanceSearchFilter" value="${escapeHTML(attendanceSearch)}" placeholder="Gõ gần đúng tên, MNV hoặc chức danh" autocomplete="off"></label>
          <label>Kiểu dò<select id="attendanceSearchMode"><option value="near" ${attendanceSearchMode === 'near' ? 'selected' : ''}>Gần đúng, bỏ dấu</option><option value="exact" ${attendanceSearchMode === 'exact' ? 'selected' : ''}>Đúng cụm từ</option></select></label>
          <label>Chi nhánh<select id="attendanceBranchFilter"><option value="all">Cả hai chi nhánh</option><option value="le-van-tho" ${attendanceBranchFilter === 'le-van-tho' ? 'selected' : ''}>Lê Văn Thọ</option><option value="pham-van-chieu" ${attendanceBranchFilter === 'pham-van-chieu' ? 'selected' : ''}>Phạm Văn Chiêu</option></select></label>
          <label>Phòng ban<select id="attendanceDepartmentFilter"><option value="all">Tất cả phòng ban được xem</option>${[...new Set(scopedEmployees.map((item) => item.department).filter(Boolean))].map((department) => `<option value="${escapeHTML(department)}" ${attendanceDepartmentFilter === department ? 'selected' : ''}>${escapeHTML(departmentName(department))}</option>`).join('')}</select></label>
          <label>Loại<select id="attendanceTypeFilter"><option value="all">Vào và ra</option><option value="checkin" ${attendanceTypeFilter === 'checkin' ? 'selected' : ''}>Check-in</option><option value="checkout" ${attendanceTypeFilter === 'checkout' ? 'selected' : ''}>Check-out</option></select></label>
          <label>Trạng thái<select id="attendanceStatusFilter"><option value="all">Tất cả trạng thái</option><option value="valid" ${attendanceStatusFilter === 'valid' ? 'selected' : ''}>Đã ghi nhận</option><option value="late" ${attendanceStatusFilter === 'late' ? 'selected' : ''}>Đi muộn</option><option value="early_leave" ${attendanceStatusFilter === 'early_leave' ? 'selected' : ''}>Về sớm</option></select></label>
          <label>Ngày<input type="date" id="attendanceDateFilter" value="${escapeHTML(attendanceDateFilter)}"></label>
          <button class="secondary-button" type="button" id="clearAttendanceFilters">Xóa bộ lọc</button>
        </div>` : ''}
        ${renderHistory(filteredRecords, scopedEmployees, ops)}
      </section>
    </div>
    ${renderCheckinDialog(employee, shift, settings, allowedShifts)}
  `;
}

function evaluateLocation(reading) {
  const { settings } = context;
  const distance = Math.round(distanceMeters(reading.lat, reading.lng, Number(settings.latitude), Number(settings.longitude)));
  const accuracy = Math.round(reading.accuracy);
  const ageMs = Date.now() - new Date(reading.capturedAt).getTime();
  const policy = evaluateAttendanceLocation({
    distance,
    accuracy,
    allowedRadius: Number(settings.allowedRadius),
    maxAccuracy: Number(settings.maxGpsAccuracy),
  });
  return {
    ...reading,
    distance,
    accurate: policy.accurate,
    inside: policy.inside,
    effectiveRadius: policy.effectiveRadius,
    indoorMode: policy.indoorMode,
    fresh: ageMs >= -5000 && ageMs <= 120000,
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

    lastLocation = evaluateLocation(reading);
    if (!lastLocation.accurate) {
      updateGpsState('is-warning', 'GPS chưa đủ chính xác', `Sai số hiện tại ±${lastLocation.accuracy} m; yêu cầu tối đa ${context.settings.maxGpsAccuracy} m. Hãy đứng gần cửa sổ và thử lại.`);
      setLocationActionState('Thử lấy GPS chính xác hơn');
      return;
    }
    if (!lastLocation.inside) {
      updateGpsState('is-error', 'Bạn đang ngoài khu vực chấm công', `Vị trí cách phòng khám ${lastLocation.distance} m; bán kính cho phép ${context.settings.allowedRadius} m.`);
      setLocationActionState('Lấy lại vị trí');
      return;
    }
    if (!lastLocation.fresh) {
      updateGpsState('is-warning', 'Vị trí đã cũ', 'Vui lòng lấy lại vị trí trước khi xác nhận.');
      setLocationActionState('Lấy lại vị trí');
      return;
    }

    updateGpsState('is-success', 'Vị trí hợp lệ', `Cách phòng khám ${lastLocation.distance} m · GPS ±${lastLocation.accuracy} m.`);
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
}

async function confirmCheckin(button) {
  if (!lastLocation || (REQUIRE_CHECKIN_PHOTO && !capturedPhoto?.blob) || !currentEventId) return;
  lastLocation = evaluateLocation(lastLocation);
  if (!lastLocation.accurate || !lastLocation.inside || !lastLocation.fresh) {
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

    const result = await clockIn({
      clientEventId: eventId,
      employee: context.employee.id,
      branchId: context.settings.branchId,
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
    if (!location.accurate) {
      throw new Error(`Sai số GPS ±${location.accuracy} m vượt mức cho phép ${context.settings.maxGpsAccuracy} m. Hãy đứng gần cửa sổ và thử lại.`);
    }
    if (!location.inside) {
      throw new Error(`Bạn đang cách phòng khám ${location.distance} m; chỉ được check-out trong bán kính ${context.settings.allowedRadius} m.`);
    }
    if (!location.fresh) {
      throw new Error('Vị trí GPS đã cũ. Vui lòng thử check-out lại.');
    }

    button.innerHTML = '<span class="attendance-button-icon" aria-hidden="true">✓</span><span><strong>GPS hợp lệ · đang lưu…</strong><small>Đang ghi nhận giờ ra ca</small></span>';
    const now = new Date();
    const result = await clockOut({
      clientEventId: makeEventId(),
      employee: context.employee.id,
      branchId: context.settings.branchId,
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

    showToast(result.isOfflinePending
      ? 'Đã lưu giờ kết ca trên điện thoại. Hệ thống sẽ tự đồng bộ khi có mạng.'
      : `Check-out thành công lúc ${formatTime(result.time)}.`);
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

function exportAttendance() {
  const rows = [
    ['Nhan su', 'Phong ban', 'Loai', 'Thoi gian', 'Khoang cach (m)', 'Sai so GPS (m)', 'Trang thai', 'Ngoai tuyen'],
    ...context.records.map((record) => {
      const employee = context.employees.find((item) => item.id === record.employee);
      return [
        employee?.name || record.employee,
        departmentName(employee?.department),
        recordTypeLabel(record),
        formatDateTime(record.time),
        record.distance,
        record.accuracy,
        attendanceLabel(record),
        record.capturedOffline ? 'Co' : 'Khong',
      ];
    }),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  downloadText(`cham-cong-le-van-tho-${clinicDateISO()}.csv`, `\uFEFF${csv}`, 'text/csv;charset=utf-8');
}

export function initView() {
  const page = document.querySelector('.attendance-page');
  if (!page) return;

  const refreshAttendanceFilters = () => store.notify();
  document.getElementById('attendanceSearchFilter')?.addEventListener('input', (event) => {
    attendanceSearch = event.target.value;
    window.clearTimeout(event.target._attendanceFilterTimer);
    event.target._attendanceFilterTimer = window.setTimeout(refreshAttendanceFilters, 180);
  });
  document.getElementById('attendanceDepartmentFilter')?.addEventListener('change', (event) => { attendanceDepartmentFilter = event.target.value; refreshAttendanceFilters(); });
  document.getElementById('attendanceSearchMode')?.addEventListener('change', (event) => { attendanceSearchMode = event.target.value; refreshAttendanceFilters(); });
  document.getElementById('attendanceBranchFilter')?.addEventListener('change', (event) => { attendanceBranchFilter = event.target.value; refreshAttendanceFilters(); });
  document.getElementById('attendanceTypeFilter')?.addEventListener('change', (event) => { attendanceTypeFilter = event.target.value; refreshAttendanceFilters(); });
  document.getElementById('attendanceStatusFilter')?.addEventListener('change', (event) => { attendanceStatusFilter = event.target.value; refreshAttendanceFilters(); });
  document.getElementById('attendanceDateFilter')?.addEventListener('change', (event) => { attendanceDateFilter = event.target.value; refreshAttendanceFilters(); });
  document.getElementById('clearAttendanceFilters')?.addEventListener('click', () => {
    attendanceSearch = '';
    attendanceSearchMode = 'near';
    attendanceDepartmentFilter = 'all';
    attendanceBranchFilter = 'all';
    attendanceTypeFilter = 'all';
    attendanceStatusFilter = 'all';
    attendanceDateFilter = '';
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
    if (action === 'open-checkin') openDialog();
    if (action === 'checkout') confirmCheckout(event.target.closest('button'));
    if (action === 'export-attendance') exportAttendance();
    if (action === 'sync-attendance') {
      const button = event.target.closest('button');
      button.disabled = true;
      button.textContent = 'Đang đồng bộ…';
      const count = await syncOfflineAttendance(context.state.user?.id);
      const proofResult = await syncPendingProofs(context.state.user?.id);
      const total = count + proofResult.synced;
      showToast(total ? `Đã đồng bộ ${total} bản ghi và ảnh chấm công.` : 'Chưa có dữ liệu nào được đồng bộ.');
      navigateTo('attendance');
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
    if (event.target.name !== 'attendanceShift') return;
    context.selectedShift = context.allowedShifts.find((item) => item.id === event.target.value) || null;
    const summary = document.getElementById('selectedShiftSummary');
    if (summary && context.selectedShift) summary.textContent = `${context.selectedShift.start}–${context.selectedShift.end}`;
    updateConfirmAvailability();
  });
  dialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDialog();
  });

  window.addEventListener('clinic:network-change', () => {
    const node = document.querySelector('[data-network-status]');
    if (!node) return;
    node.className = `network-status ${navigator.onLine ? 'is-online' : 'is-offline'}`;
    node.innerHTML = `<span></span>${navigator.onLine ? 'Đang online' : 'Đang ngoại tuyến'}`;
  }, { once: true });
}
