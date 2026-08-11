import { getMonthlySchedule, saveMonthlySchedule, subscribeMonthlySchedule, updateMonthlyScheduleWorkflow } from '../services/monthly-schedule.js';
import { DEPARTMENTS } from '../constants.js';
import { escapeHTML, normalizeText, todayISO, smartMatch } from '../utils.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let selectedMonth = todayISO().slice(0, 7);
let selectedBranch = 'all';
let selectedDepartment = 'all';
let selectedEmployeeSearch = '';
let selectedSearchMode = 'near';
let selectedWorkflowStage = 'all';
let selectedAssignmentState = 'all';
let currentData = null;
let currentVisibleEmployeeCodes = new Set();
let stopRealtime = null;
let realtimeRefreshTimer = null;
let realtimeFallbackTimer = null;
let realtimeRefreshPending = false;
let scheduleTableViewport = { left: 0, top: 0 };
const pendingAssignments = new Map();

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const STAGE_LABELS = {
  draft: 'Bản nháp', leader_review: 'Chờ trưởng bộ phận', hr_review: 'Chờ phòng hành chính',
  approved: 'Đã chốt', returned: 'Cần chỉnh sửa',
};
const STAGE_TONES = { draft: 'neutral', leader_review: 'warn', hr_review: 'warn', approved: 'good', returned: 'bad' };

function branchLabel(branchId) {
  return branchId === 'le-van-tho' ? 'Lê Văn Thọ'
    : branchId === 'pham-van-chieu' ? 'Phạm Văn Chiêu'
      : branchId || 'Chưa gán chi nhánh';
}

function dateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftHours(shift) {
  const [sh, sm] = String(shift.start_time || '00:00').split(':').map(Number);
  const [eh, em] = String(shift.end_time || '00:00').split(':').map(Number);
  const configuredBreak = Number(shift.break_minutes || 0);
  const breakMinutes = ['front-morning', 'front-afternoon'].includes(shift.code) ? Math.max(60, configuredBreak) : configuredBreak;
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm) - breakMinutes) / 60);
}

function shiftShortLabel(shift) {
  const labels = {
    'doctor-office': 'HC', 'doctor-morning': 'S', 'doctor-afternoon': 'C', 'doctor-full': 'F',
    'front-office': 'HC', 'front-morning': 'S', 'front-afternoon': 'C', 'front-full': 'F',
    'security-weekday': 'T2–T7', 'security-sunday': 'CN',
    'cleaning-weekday': 'T2–T7', 'cleaning-sunday': 'CN', 'clinic-0800': 'HC',
  };
  return labels[shift.code] || shift.name || shift.code;
}

function hourText(hours) {
  return `${Number(hours).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
}

function stagePill(stage) {
  return `<span class="status-pill ${STAGE_TONES[stage] || 'neutral'}">${escapeHTML(STAGE_LABELS[stage] || stage)}</span>`;
}

function employeeSearchText(employee) {
  return [employee.full_name, employee.code, employee.title, employee.department, branchLabel(employee.branch_id)].join(' ');
}

function matchesEmployeeSearch(employee) {
  return !selectedEmployeeSearch || smartMatch(employeeSearchText(employee), selectedEmployeeSearch, selectedSearchMode);
}

function scheduleRealtimeRefresh() {
  if (store.getState().currentView !== 'schedule') return;
  const isEditing = Boolean(document.querySelector('.pilot-schedule-select.is-dirty'))
    || document.activeElement?.classList?.contains('pilot-schedule-select');
  if (isEditing) {
    realtimeRefreshPending = true;
    return;
  }
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(() => {
    captureScheduleTableViewport();
    realtimeRefreshPending = false;
    store.notify();
  }, 120);
}

function ensureScheduleRealtime() {
  if (!stopRealtime) stopRealtime = subscribeMonthlySchedule(scheduleRealtimeRefresh);
  if (!realtimeFallbackTimer) {
    realtimeFallbackTimer = window.setInterval(() => {
      if (store.getState().currentView === 'schedule' && document.visibilityState === 'visible') scheduleRealtimeRefresh();
    }, 5000);
  }
}

function canEditRow(role, employeeCode, request, profile) {
  if (role === 'admin_it') return true;
  if (role === 'staff') return employeeCode === profile.employee_code && ['draft', 'returned'].includes(request.stage);
  if (role === 'leader') return ['draft', 'returned', 'leader_review'].includes(request.stage);
  if (['hr', 'admin'].includes(role)) return request.stage === 'hr_review';
  return false;
}

function assignmentKey(employeeCode, workDate) {
  return `${employeeCode}:${workDate}`;
}

function captureScheduleTableViewport() {
  const tableWrap = document.querySelector('.pilot-schedule-table-wrap');
  if (!tableWrap) return;
  scheduleTableViewport = { left: tableWrap.scrollLeft, top: tableWrap.scrollTop };
}

function restoreScheduleTableViewport() {
  const tableWrap = document.querySelector('.pilot-schedule-table-wrap');
  if (!tableWrap) return;
  tableWrap.scrollLeft = scheduleTableViewport.left;
  tableWrap.scrollTop = scheduleTableViewport.top;
}

function monthSelectors() {
  const [year, month] = selectedMonth.split('-').map(Number);
  const years = Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 1 + index);
  return `<label>Tháng<select id="monthlyScheduleMonth">${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}" ${month === index + 1 ? 'selected' : ''}>Tháng ${index + 1}</option>`).join('')}</select></label>
    <label>Năm<select id="monthlyScheduleYear">${years.map((item) => `<option value="${item}" ${year === item ? 'selected' : ''}>Năm ${item}</option>`).join('')}</select></label>`;
}

function renderLegend(shifts) {
  const defaultShifts = shifts.length ? shifts : [
    { code: 'doctor-office', name: 'Ca hành chính', start_time: '08:00:00', end_time: '17:00:00', break_minutes: 60 },
    { code: 'doctor-morning', name: 'Ca sáng', start_time: '08:00:00', end_time: '18:00:00', break_minutes: 60 },
    { code: 'doctor-afternoon', name: 'Ca chiều', start_time: '10:00:00', end_time: '20:00:00', break_minutes: 60 },
    { code: 'doctor-full', name: 'Ca full', start_time: '08:00:00', end_time: '20:00:00', break_minutes: 60 },
  ];
  return defaultShifts.map((shift) => `
    <div class="shift-legend-chip">
      <strong>${escapeHTML(shiftShortLabel(shift))}</strong>
      <span>${escapeHTML(shift.name)} · ${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)} · ${hourText(shiftHours(shift))}</span>
    </div>
  `).join('');
}

function workflowDescription(request) {
  if (request.stage === 'returned') return request.hrNote || request.leaderNote || 'Lịch được yêu cầu chỉnh sửa trước khi gửi lại.';
  if (request.stage === 'leader_review') return 'Nhân viên đã chốt, đang chờ trưởng bộ phận rà soát.';
  if (request.stage === 'hr_review') return 'Trưởng bộ phận đã duyệt, đang chờ hr.emily tổng hợp.';
  if (request.stage === 'approved') return `Đã chốt bởi ${request.finalApprover || 'phòng hành chính'}.`;
  return 'Đang đăng ký lịch làm việc trong tháng.';
}

function actionCard(employee, request, role, profile, hasAssignments = false) {
  const own = employee.code === profile.employee_code;
  let actions = '';
  let noteLabel = 'Ghi chú xử lý';
  if (role === 'staff' && own && ['draft', 'returned'].includes(request.stage)) {
    noteLabel = 'Ghi chú đăng ký';
    actions = `<button class="primary-button" type="button" data-schedule-action="submit" data-employee="${escapeHTML(employee.code)}" ${hasAssignments ? '' : 'disabled title="Hãy đăng ký và lưu ca làm trước"'}>${hasAssignments ? 'Chốt và gửi trưởng bộ phận' : 'Chưa có ca để gửi duyệt'}</button>`;
  } else if (['leader', 'admin', 'hr', 'admin_it', 'admin_marketing', 'telesale_leader'].includes(role)) {
    noteLabel = 'Nhận xét phân bổ của quản lý';
    actions = `<button class="primary-button" type="button" data-schedule-action="leader_forward" data-employee="${escapeHTML(employee.code)}">Xác nhận phân bổ đội ngũ</button>`;
  }
  const actionPanel = actions ? `<details class="schedule-workflow-details"><summary><span>Xử lý lịch</span><span class="schedule-workflow-chevron" aria-hidden="true">⌄</span></summary><div class="schedule-workflow-details-body"><label class="schedule-note-field"><span>${noteLabel}</span><textarea data-schedule-note="${escapeHTML(employee.code)}" placeholder="Nhập nội dung cần lưu hoặc phản hồi..."></textarea></label><div class="schedule-workflow-actions">${actions}</div></div></details>` : '';
  return `<article class="schedule-workflow-card ${own ? 'is-own-schedule' : ''}" data-schedule-card="${escapeHTML(employee.code)}" data-schedule-search="${escapeHTML(employeeSearchText(employee))}"><div class="schedule-workflow-card-head"><div class="schedule-workflow-person"><strong>${escapeHTML(employee.full_name)}</strong><small>${escapeHTML(employee.title)} · ${escapeHTML(employee.code)} · ${escapeHTML(branchLabel(employee.branch_id))}</small></div>${stagePill(request.stage)}</div><p>${escapeHTML(workflowDescription(request))}</p>${actionPanel}</article>`;
}

export async function renderMonthlySchedule(state) {
  try {
    currentData = await getMonthlySchedule({ month: selectedMonth, branch: selectedBranch, department: selectedDepartment });
  } catch (error) {
    return `<section class="panel pilot-schedule-error"><h3>Không tải được lịch làm việc</h3><p>${escapeHTML(error.message)}</p><button class="secondary-button" type="button" id="retryMonthlySchedule">Thử lại</button></section>`;
  }
  
  const data = {
    ...currentData,
    profile: currentData?.profile || state.profile || {},
    employees: Array.isArray(currentData?.employees) ? currentData.employees : [],
    shifts: Array.isArray(currentData?.shifts) ? currentData.shifts : [],
    allowed: Array.isArray(currentData?.allowed) ? currentData.allowed : [],
    assignments: Array.isArray(currentData?.assignments) ? currentData.assignments : [],
    requests: Array.isArray(currentData?.requests) ? currentData.requests : [],
  };
  currentData = data;
  const role = state.role;
  const profile = data.profile;
  const canManageSchedule = ['admin', 'hr', 'admin_it', 'leader', 'admin_marketing', 'telesale_leader'].includes(role);
  const canScopeFilter = canManageSchedule;
  const [year, monthNumber] = selectedMonth.split('-').map(Number);
  const monthIndex = monthNumber - 1;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, monthIndex, day);
    return { day, key: dateKey(year, monthIndex, day), weekday: WEEKDAYS[date.getDay()], sunday: date.getDay() === 0 };
  });
  const shiftByCode = new Map(data.shifts.map((shift) => [shift.code, shift]));
  const allowedByEmployee = new Map();
  data.allowed.forEach((item) => {
    if (!allowedByEmployee.has(item.employee_code)) allowedByEmployee.set(item.employee_code, []);
    allowedByEmployee.get(item.employee_code).push(item.shift_code);
  });
  const assignmentByKey = new Map(data.assignments.map((item) => [`${item.employee_code}:${item.work_date}`, item]));
  const employeesWithAssignments = new Set(data.assignments.map((item) => item.employee_code));
  const requestByEmployee = new Map(data.requests.map((item) => [item.employee_code, item]));
  const structuredEmployees = data.employees.filter((employee) => {
    const request = requestByEmployee.get(employee.code) || { stage: 'draft' };
    const matchesStage = selectedWorkflowStage === 'all' || request.stage === selectedWorkflowStage;
    const hasAssignments = employeesWithAssignments.has(employee.code);
    const matchesAssignment = selectedAssignmentState === 'all'
      || (selectedAssignmentState === 'assigned' && hasAssignments)
      || (selectedAssignmentState === 'empty' && !hasAssignments);
    return matchesStage && matchesAssignment;
  });
  const visibleEmployees = structuredEmployees.filter(matchesEmployeeSearch);
  currentVisibleEmployeeCodes = new Set(visibleEmployees.map((employee) => employee.code));
  const visibleShifts = [...new Set(data.allowed.map((item) => item.shift_code))].map((code) => shiftByCode.get(code)).filter(Boolean);
  let monthHours = 0;
  const rows = structuredEmployees.map((employee) => {
    const request = requestByEmployee.get(employee.code) || { stage: 'draft' };
    const editable = canManageSchedule || canEditRow(role, employee.code, request, profile);
    const allowedCodes = allowedByEmployee.get(employee.code) || [employee.shift_code].filter(Boolean);
    let total = 0;
    const cells = dates.map((date) => {
      const key = assignmentKey(employee.code, date.key);
      const stored = assignmentByKey.get(key)?.shift_code || '';
      const selected = pendingAssignments.has(key) ? pendingAssignments.get(key) : stored;
      const shift = shiftByCode.get(selected);
      const shiftLabel = shift ? shiftShortLabel(shift) : '';
      if (shift) total += shiftHours(shift);
      const options = allowedCodes.map((code) => {
        const allowedShift = shiftByCode.get(code);
        return allowedShift ? `<option value="${escapeHTML(code)}" data-hours="${shiftHours(allowedShift)}" ${selected === code ? 'selected' : ''}>${escapeHTML(shiftShortLabel(allowedShift))}</option>` : '';
      }).join('');
      const dirtyClass = selected !== stored ? ' is-dirty' : '';
      const cellBg = date.sunday ? ' roster-table-cell is-sunday' : ' roster-table-cell';
      return `<td class="${cellBg}"><select class="pilot-schedule-select${dirtyClass}" data-employee="${escapeHTML(employee.code)}" data-date="${date.key}" data-original="${escapeHTML(stored)}" data-shift-label="${escapeHTML(shiftLabel)}" aria-label="${escapeHTML(employee.full_name)}, ngày ${date.day}" ${editable ? '' : 'disabled'}><option value="" data-hours="0">—</option>${options}</select></td>`;
    }).join('');
    if (matchesEmployeeSearch(employee)) monthHours += total;
    return `<tr data-monthly-employee="${escapeHTML(employee.code)}" data-schedule-search="${escapeHTML(employeeSearchText(employee))}" ${matchesEmployeeSearch(employee) ? '' : 'hidden'}><th class="pilot-employee-cell"><strong class="emp-name" title="${escapeHTML(employee.full_name)}">${escapeHTML(employee.full_name)}</strong><small class="emp-meta">${escapeHTML(employee.title || 'Nhân viên')} · ${escapeHTML(employee.code)}</small>${stagePill(request.stage)}</th>${cells}<td class="pilot-total-cell"><strong data-monthly-total>${total.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong><span>giờ</span></td></tr>`;
  }).join('');
  const reviewCards = structuredEmployees.map((employee) => actionCard(
    employee,
    requestByEmployee.get(employee.code) || { stage: 'draft' },
    role,
    profile,
    employeesWithAssignments.has(employee.code),
  )).map((card, index) => matchesEmployeeSearch(structuredEmployees[index]) ? card : card.replace('<article ', '<article hidden ')).join('');

  const branchControl = canScopeFilter ? `<label>Chi nhánh<select id="monthlyScheduleBranch"><option value="all" ${selectedBranch === 'all' ? 'selected' : ''}>Cả hai chi nhánh</option><option value="le-van-tho" ${selectedBranch === 'le-van-tho' ? 'selected' : ''}>Lê Văn Thọ</option><option value="pham-van-chieu" ${selectedBranch === 'pham-van-chieu' ? 'selected' : ''}>Phạm Văn Chiêu</option></select></label>` : '';
  const departmentControl = canScopeFilter ? `<label>Phòng ban<select id="monthlyScheduleDepartment"><option value="all">Tất cả phòng ban</option>${DEPARTMENTS.map((item) => `<option value="${item.id}" ${selectedDepartment === item.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label>` : '';

  const weekNav = `<div class="shift-legend-bar" aria-label="Chuyển nhanh ngày trong tháng" style="margin-top:10px; margin-bottom:10px;">
    <span style="font-size:0.8rem; font-weight:700; color:#475569;">Chuyển ngày:</span>
    <button type="button" class="period-nav-btn" data-scroll-day="1">T1 (1–7)</button>
    <button type="button" class="period-nav-btn" data-scroll-day="8">T2 (8–14)</button>
    <button type="button" class="period-nav-btn" data-scroll-day="15">T3 (15–21)</button>
    <button type="button" class="period-nav-btn" data-scroll-day="22">T4 (22–28)</button>
    <button type="button" class="period-nav-btn" data-scroll-day="29">Cuối tháng</button>
  </div>`;

  return `<div class="monthly-schedule-page">
    <section class="monthly-schedule-hero">
      <div>
        <p class="eyebrow">LỊCH TRÌNH PHÂN BỔ ĐỘI NGŨ LÀM VIỆC & GIAO TIẾP NỘI BỘ THÁNG ${monthNumber}/${year}</p>
        <h3>Bảng phân bổ lịch làm việc & trao đổi công việc linh hoạt các phòng ban</h3>
        <p>Cho phép các cấp quản lý sắp xếp phân bổ nhân sự, trao đổi công việc nội bộ và chốt lịch trình vận hành.</p>
      </div>
    </section>

    <!-- Shift Legend Header matching Image 2 -->
    <div class="shift-legend-bar">
      ${renderLegend(visibleShifts)}
    </div>

    <section class="panel pilot-schedule-panel">
      <div class="pilot-schedule-toolbar monthly-toolbar">
        ${monthSelectors()}
        ${branchControl}
        ${departmentControl}
        ${canManageSchedule ? `<button class="primary-button" type="button" id="saveMonthlySchedule" disabled>Lưu các ô phân bổ đã đổi</button>` : ''}
      </div>

      ${weekNav}

      <div class="pilot-schedule-metrics">
        <article><span>Nhân sự đang xem</span><strong id="monthlyVisibleMetric">${visibleEmployees.length}</strong></article>
        <article><span>Ca đã phân bổ</span><strong id="monthlyVisibleAssignments">${data.assignments.filter((item) => currentVisibleEmployeeCodes.has(item.employee_code)).length}</strong></article>
        <article><span>Tổng giờ phân bổ</span><strong id="monthlyVisibleHours">${monthHours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong></article>
        <article><span>Thay đổi chưa lưu</span><strong id="monthlyDirtyCount">0</strong></article>
      </div>

      <div class="pilot-schedule-table-wrap">
        <table class="pilot-schedule-table">
          <thead>
            <tr>
              <th class="pilot-employee-cell" style="min-width:180px;">NHÂN VIÊN</th>
              ${dates.map((date) => `<th data-day="${date.day}" class="${date.sunday ? 'roster-table-cell is-sunday-header' : ''}"><span>${date.day}</span><small>${date.weekday}</small></th>`).join('')}
              <th class="pilot-total-cell">TỔNG</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="${daysInMonth + 2}" class="pilot-empty">Không có nhân viên phù hợp bộ lọc.</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="pilot-schedule-note"><b>Quy ước ca làm việc:</b> HC = hành chính, S = sáng, C = chiều, F = full. Ngày Chủ nhật (CN) được tô màu nền riêng; ô trống là ngày chưa đăng ký/nghỉ. Chỉ các cấp quản lý mới có quyền chỉnh sửa & công bố lịch trình phân bổ.</p>
    </section>

    <section class="panel monthly-workflow-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">LUỒNG CÔNG BỐ LỊCH TRÌNH</p>
          <h3>Trạng thái phê duyệt & trao đổi công việc đội ngũ <span class="realtime-indicator"><i></i>Realtime</span></h3>
        </div>
      </div>
      <div class="schedule-workflow-grid">${reviewCards || '<p class="subtle">Chưa có lịch trong phạm vi này.</p>'}</div>
    </section>
  </div>`;
}

function applyInstantScheduleSearch() {
  if (!currentData) return;
  const employeeByCode = new Map(currentData.employees.map((employee) => [employee.code, employee]));
  const requestByCode = new Map(currentData.requests.map((request) => [request.employee_code, request]));
  const visibleCodes = new Set();
  let visibleHours = 0;
  document.querySelectorAll('[data-monthly-employee]').forEach((row) => {
    const employee = employeeByCode.get(row.dataset.monthlyEmployee);
    const visible = employee && matchesEmployeeSearch(employee);
    row.hidden = !visible;
    if (visible) {
      visibleCodes.add(employee.code);
      visibleHours += Number(String(row.querySelector('[data-monthly-total]')?.textContent || '0').replace(',', '.')) || 0;
    }
  });
  document.querySelectorAll('[data-schedule-card]').forEach((card) => { card.hidden = !visibleCodes.has(card.dataset.scheduleCard); });
  currentVisibleEmployeeCodes = visibleCodes;
  const assignmentCount = currentData.assignments.filter((item) => visibleCodes.has(item.employee_code)).length;
  const approvedCount = [...visibleCodes].filter((code) => requestByCode.get(code)?.stage === 'approved').length;
  const assignedEmployees = new Set(currentData.assignments.map((item) => item.employee_code));
  const leaderConfirmable = [...visibleCodes].filter((code) => assignedEmployees.has(code) && ['draft', 'returned', 'leader_review'].includes(requestByCode.get(code)?.stage || 'draft')).length;
  document.getElementById('monthlyVisibleFilterCount')?.replaceChildren(document.createTextNode(String(visibleCodes.size)));
  document.getElementById('monthlyVisibleMetric')?.replaceChildren(document.createTextNode(String(visibleCodes.size)));
  document.getElementById('monthlyVisibleAssignments')?.replaceChildren(document.createTextNode(String(assignmentCount)));
  document.getElementById('monthlyVisibleHours')?.replaceChildren(document.createTextNode(visibleHours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })));
  const approvedNode = document.getElementById('monthlyApprovedCount');
  if (approvedNode) approvedNode.textContent = `${approvedCount}/${visibleCodes.size} lịch đang lọc đã chốt`;
  const batchButton = document.getElementById('confirmAllLeaderSchedules');
  if (batchButton) {
    batchButton.disabled = !leaderConfirmable;
    batchButton.textContent = `Xác nhận ${leaderConfirmable} lịch đã có ca`;
  }
  const emptyNode = document.getElementById('monthlyNoFilterResults');
  if (emptyNode) emptyNode.hidden = Boolean(visibleCodes.size);
}

function renderMonthlySearchSuggestions(input) {
  const panel = document.getElementById('monthlySearchSuggestionPanel');
  if (!panel || !currentData) return;
  const query = input.value.trim();
  const normalizedQuery = normalizeText(query);
  const candidates = currentData.employees
    .filter((employee) => !query || smartMatch(employeeSearchText(employee), query, selectedSearchMode))
    .map((employee) => {
      const name = normalizeText(employee.full_name);
      const code = normalizeText(employee.code);
      const score = !normalizedQuery ? 3
        : name === normalizedQuery || code === normalizedQuery ? 0
          : name.startsWith(normalizedQuery) || code.startsWith(normalizedQuery) ? 1
            : name.includes(normalizedQuery) || code.includes(normalizedQuery) ? 2 : 3;
      return { employee, score };
    })
    .sort((left, right) => left.score - right.score || left.employee.full_name.localeCompare(right.employee.full_name, 'vi'))
    .slice(0, 8);
  panel.innerHTML = candidates.length ? `<div class="smart-search-caption">${query ? `Kết quả gần nhất cho “${escapeHTML(query)}”` : 'Gợi ý nhân viên'}</div>${candidates.map(({ employee }, index) => `<button type="button" role="option" data-smart-suggestion="${escapeHTML(employee.full_name)}" data-suggestion-index="${index}"><span class="smart-search-avatar">${escapeHTML(employee.full_name.trim().charAt(0).toUpperCase())}</span><span class="smart-search-person"><strong>${escapeHTML(employee.full_name)}</strong><small>${escapeHTML(employee.title)} · ${escapeHTML(branchLabel(employee.branch_id))}</small></span><span class="smart-search-code">${escapeHTML(employee.code)}</span></button>`).join('')}` : '<p class="smart-search-empty">Không có nhân viên phù hợp. Thử đổi sang dò gần đúng hoặc kiểm tra lại MNV.</p>';
  panel.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function closeMonthlySearchSuggestions(input) {
  const panel = document.getElementById('monthlySearchSuggestionPanel');
  if (panel) panel.hidden = true;
  input?.setAttribute('aria-expanded', 'false');
}

function recalculateRow(select) {
  const row = select.closest('[data-monthly-employee]');
  if (!row) return;
  const total = [...row.querySelectorAll('.pilot-schedule-select')].reduce((sum, item) => sum + Number(item.selectedOptions[0]?.dataset.hours || 0), 0);
  row.querySelector('[data-monthly-total]').textContent = total.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function dirtySelects() {
  const dirty = [...document.querySelectorAll('.pilot-schedule-select')].filter((select) => select.value !== select.dataset.original);
  const button = document.getElementById('saveMonthlySchedule');
  const count = document.getElementById('monthlyDirtyCount');
  if (count) count.textContent = String(dirty.length);
  if (button) { button.disabled = !dirty.length; button.textContent = dirty.length ? `Lưu ${dirty.length} ô đã đổi` : 'Lưu các ô đã đổi'; }
  return dirty;
}

export function initMonthlySchedule() {
  ensureScheduleRealtime();
  restoreScheduleTableViewport();
  window.requestAnimationFrame(restoreScheduleTableViewport);
  document.querySelector('.pilot-schedule-table-wrap')?.addEventListener('scroll', captureScheduleTableViewport, { passive: true });
  document.getElementById('retryMonthlySchedule')?.addEventListener('click', () => store.notify());
  const changeMonth = () => {
    const month = String(document.getElementById('monthlyScheduleMonth')?.value || '').padStart(2, '0');
    const year = document.getElementById('monthlyScheduleYear')?.value;
    if (month && year) { selectedMonth = `${year}-${month}`; store.notify(); }
  };
  document.getElementById('monthlyScheduleMonth')?.addEventListener('change', changeMonth);
  document.getElementById('monthlyScheduleYear')?.addEventListener('change', changeMonth);
  document.getElementById('monthlyScheduleBranch')?.addEventListener('change', (event) => { selectedBranch = event.target.value; store.notify(); });
  document.getElementById('monthlyScheduleDepartment')?.addEventListener('change', (event) => { selectedDepartment = event.target.value; store.notify(); });
  const smartSearchInput = document.getElementById('monthlyScheduleSearch');
  smartSearchInput?.addEventListener('input', (event) => {
    selectedEmployeeSearch = event.target.value;
    window.requestAnimationFrame(() => { applyInstantScheduleSearch(); renderMonthlySearchSuggestions(event.target); });
  });
  smartSearchInput?.addEventListener('focus', () => renderMonthlySearchSuggestions(smartSearchInput));
  smartSearchInput?.addEventListener('blur', () => window.setTimeout(() => closeMonthlySearchSuggestions(smartSearchInput), 140));
  smartSearchInput?.addEventListener('keydown', (event) => {
    const panel = document.getElementById('monthlySearchSuggestionPanel');
    const options = [...(panel?.querySelectorAll('[data-smart-suggestion]') || [])];
    if (event.key === 'Escape') { closeMonthlySearchSuggestions(smartSearchInput); return; }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) || !options.length) return;
    const currentIndex = options.findIndex((option) => option.classList.contains('is-active'));
    if (event.key === 'Enter') {
      if (currentIndex < 0) return;
      event.preventDefault();
      options[currentIndex].click();
      return;
    }
    event.preventDefault();
    const nextIndex = event.key === 'ArrowDown'
      ? (currentIndex + 1) % options.length
      : (currentIndex <= 0 ? options.length - 1 : currentIndex - 1);
    options.forEach((option, index) => option.classList.toggle('is-active', index === nextIndex));
    options[nextIndex].scrollIntoView({ block: 'nearest' });
  });
  document.getElementById('monthlySearchSuggestionPanel')?.addEventListener('mousedown', (event) => event.preventDefault());
  document.getElementById('monthlySearchSuggestionPanel')?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-smart-suggestion]');
    if (!option || !smartSearchInput) return;
    smartSearchInput.value = option.dataset.smartSuggestion;
    selectedEmployeeSearch = option.dataset.smartSuggestion;
    applyInstantScheduleSearch();
    closeMonthlySearchSuggestions(smartSearchInput);
    smartSearchInput.focus();
  });
  document.getElementById('monthlyScheduleStage')?.addEventListener('change', (event) => { selectedWorkflowStage = event.target.value; store.notify(); });
  document.getElementById('monthlyScheduleSearchMode')?.addEventListener('change', (event) => { selectedSearchMode = event.target.value; applyInstantScheduleSearch(); });
  document.getElementById('monthlyScheduleAssignment')?.addEventListener('change', (event) => { selectedAssignmentState = event.target.value; store.notify(); });
  document.getElementById('clearMonthlyScheduleFilters')?.addEventListener('click', () => {
    selectedEmployeeSearch = '';
    selectedSearchMode = 'near';
    selectedWorkflowStage = 'all';
    selectedAssignmentState = 'all';
    selectedBranch = 'all';
    selectedDepartment = 'all';
    store.notify();
  });
  document.querySelectorAll('[data-schedule-preset]').forEach((button) => button.addEventListener('click', () => {
    selectedEmployeeSearch = '';
    selectedWorkflowStage = 'all';
    selectedAssignmentState = 'all';
    selectedBranch = 'all';
    selectedDepartment = 'all';
    if (button.dataset.schedulePreset === 'doctor-empty') { selectedDepartment = 'bs'; selectedAssignmentState = 'empty'; }
    if (button.dataset.schedulePreset === 'leader-review') selectedWorkflowStage = 'leader_review';
    if (button.dataset.schedulePreset === 'hr-review') selectedWorkflowStage = 'hr_review';
    if (button.dataset.schedulePreset === 'lvt') selectedBranch = 'le-van-tho';
    if (button.dataset.schedulePreset === 'pvc') selectedBranch = 'pham-van-chieu';
    store.notify();
  }));
  document.querySelectorAll('[data-scroll-day]').forEach((button) => button.addEventListener('click', () => {
    const day = button.dataset.scrollDay;
    const tableWrap = document.querySelector('.pilot-schedule-table-wrap');
    const targetTh = tableWrap?.querySelector(`thead th[data-day="${day}"]`);
    if (tableWrap && targetTh) {
      const left = Math.max(0, targetTh.offsetLeft - 100);
      tableWrap.scrollTo({ left, behavior: 'smooth' });
    }
  }));
  document.querySelectorAll('.pilot-schedule-select').forEach((select) => select.addEventListener('change', () => {
    const tableWrap = select.closest('.pilot-schedule-table-wrap');
    const viewport = tableWrap ? { left: tableWrap.scrollLeft, top: tableWrap.scrollTop } : scheduleTableViewport;
    const key = assignmentKey(select.dataset.employee, select.dataset.date);
    if (select.value === select.dataset.original) pendingAssignments.delete(key);
    else pendingAssignments.set(key, select.value);
    const selectedOption = select.options[select.selectedIndex];
    select.dataset.shiftLabel = selectedOption?.value ? (selectedOption.textContent || '') : '';
    select.classList.toggle('is-dirty', select.value !== select.dataset.original);
    recalculateRow(select);
    dirtySelects();
    applyInstantScheduleSearch();
    scheduleTableViewport = viewport;
    window.requestAnimationFrame(() => {
      if (!tableWrap?.isConnected) return;
      tableWrap.scrollLeft = viewport.left;
      tableWrap.scrollTop = viewport.top;
    });
  }));
  document.getElementById('saveMonthlySchedule')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const dirty = dirtySelects();
    if (!dirty.length) return;
    button.disabled = true;
    button.textContent = 'Đang lưu lịch…';
    try {
      const changes = dirty.map((select) => ({ employee: select.dataset.employee, date: select.dataset.date, shift: select.value }));
      const result = await saveMonthlySchedule(selectedMonth, changes);
      changes.forEach((change) => pendingAssignments.delete(assignmentKey(change.employee, change.date)));
      captureScheduleTableViewport();
      showToast(`Đã lưu ${result.saved || 0} ca và xóa ${result.removed || 0} ô lịch.`);
      store.notify();
    } catch (error) {
      showToast(error.message || 'Không thể lưu lịch.', true);
      dirtySelects();
    }
  });
  document.getElementById('confirmAllLeaderSchedules')?.addEventListener('click', async (event) => {
    if (dirtySelects().length) return showToast('Hãy lưu toàn bộ ô lịch đã đổi trước khi xác nhận hàng loạt.', true);
    const assignedEmployees = new Set((currentData?.assignments || []).map((item) => item.employee_code));
    const eligible = (currentData?.requests || []).filter((request) => (
      currentVisibleEmployeeCodes.has(request.employee_code)
      &&
      assignedEmployees.has(request.employee_code)
      && ['draft', 'returned', 'leader_review'].includes(request.stage)
    ));
    if (!eligible.length) return showToast('Chưa có lịch nào đã phân ca để xác nhận.', true);
    if (!confirm(`Xác nhận và gửi ${eligible.length} lịch đã có ca đến hr.emily?`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = `Đang xác nhận 0/${eligible.length}…`;
    let completed = 0;
    const failed = [];
    for (const request of eligible) {
      try {
        await updateMonthlyScheduleWorkflow({
          month: selectedMonth,
          employee: request.employee_code,
          action: 'leader_forward',
          note: 'Trưởng bộ phận xác nhận lịch hàng loạt.',
        });
        completed += 1;
      } catch (error) {
        failed.push(request.employee_code);
      }
      button.textContent = `Đang xác nhận ${completed}/${eligible.length}…`;
    }
    showToast(failed.length
      ? `Đã xác nhận ${completed} lịch; ${failed.length} lịch lỗi: ${failed.join(', ')}.`
      : `Đã xác nhận ${completed} lịch và gửi hr.emily tổng hợp.`, Boolean(failed.length));
    store.notify();
  });
  document.querySelectorAll('[data-schedule-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.scheduleAction;
    const employee = button.dataset.employee;
    if (dirtySelects().some((item) => item.dataset.employee === employee)) return showToast('Hãy lưu các ô lịch đã đổi trước khi chuyển bước duyệt.', true);
    const note = document.querySelector(`[data-schedule-note="${employee}"]`)?.value || '';
    const confirmations = {
      submit: 'Chốt lịch và gửi trưởng bộ phận duyệt?', leader_forward: 'Duyệt lịch và gửi hr.emily tổng hợp?',
      return_to_staff: 'Gửi yêu cầu nhân viên chỉnh sửa lịch?', hr_approve: 'Chốt lịch chính thức cho nhân viên này?',
      hr_return: 'Trả lịch lại trưởng bộ phận để rà soát?',
    };
    if (!confirm(confirmations[action] || 'Xác nhận thao tác?')) return;
    button.disabled = true;
    try {
      await updateMonthlyScheduleWorkflow({ month: selectedMonth, employee, action, note });
      showToast('Đã cập nhật trạng thái lịch và gửi thông báo đến người phụ trách.');
      store.notify();
    } catch (error) {
      button.disabled = false;
      showToast(error.message || 'Không thể chuyển bước duyệt lịch.', true);
    }
  }));
}
