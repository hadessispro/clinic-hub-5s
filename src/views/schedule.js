import { getScheduleRequests, createScheduleRequest, updateScheduleRequest, getScheduleAssignments, createScheduleAssignment, updateScheduleAssignment, getShiftConfiguration } from '../services/schedule.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS, SHIFTS, LEAVE_STATUS } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, formatDateTime, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { initAdminItPilot, renderAdminItPilot } from './pilot-schedule.js';
import { initMonthlySchedule, renderMonthlySchedule } from './monthly-schedule.js';

let cachedEmployees = [];
let cachedRequests = [];
let cachedAssignments = [];

function paidHours(shift) {
  const [sh, sm] = String(shift.start_time || '00:00').split(':').map(Number);
  const [eh, em] = String(shift.end_time || '00:00').split(':').map(Number);
  const configuredBreak = Number(shift.break_minutes || 0);
  const breakMinutes = ['front-morning', 'front-afternoon'].includes(shift.code) ? Math.max(60, configuredBreak) : configuredBreak;
  return (((eh * 60 + em) - (sh * 60 + sm) - breakMinutes) / 60);
}

function hourLabel(hours) {
  return Number.isInteger(hours) ? `${hours} giờ` : `${hours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
}

function renderShiftOverview(employees, config) {
  const shiftByCode = new Map(config.shifts.map((shift) => [shift.code, shift]));
  const allowedByEmployee = new Map();
  config.allowed.forEach(({ employee_code, shift_code }) => {
    if (!allowedByEmployee.has(employee_code)) allowedByEmployee.set(employee_code, []);
    allowedByEmployee.get(employee_code).push(shift_code);
  });
  const rows = new Map();
  employees.filter((employee) => employee.status === 'active').forEach((employee) => {
    const allowedCodes = allowedByEmployee.get(employee.id) || [];
    const codes = allowedCodes.length ? allowedCodes : [employee.shift];
    const key = `${employee.branchId}|${employee.role}|${allowedCodes.length ? codes.slice().sort().join(',') : `missing:${employee.shift}`}`;
    if (!rows.has(key)) rows.set(key, { branch: employee.branchId, title: employee.role, names: [], codes, missing: !allowedCodes.length });
    rows.get(key).names.push(employee.name);
  });
  const list = [...rows.values()].sort((a, b) => `${a.branch}${a.title}`.localeCompare(`${b.branch}${b.title}`, 'vi'));
  const exact10 = config.shifts.filter((shift) => paidHours(shift) === 10);
  const exact8 = config.shifts.filter((shift) => paidHours(shift) === 8);
  const missing = employees.filter((employee) => employee.status === 'active' && !allowedByEmployee.has(employee.id)).length;
  const cards = list.map((row) => {
    const shifts = row.codes.map((code) => shiftByCode.get(code)).filter(Boolean);
    const hours = shifts.map(paidHours);
    const category = row.missing ? 'missing' : hours.includes(10) ? '10' : hours.includes(8) ? '8' : 'other';
    const searchable = `${row.title} ${row.names.join(' ')}`.toLocaleLowerCase('vi');
    return `<article class="shift-role-card" data-shift-row data-branch="${escapeHTML(row.branch)}" data-hours="${category}" data-search="${escapeHTML(searchable)}">
      <div class="shift-role-head"><div><strong>${escapeHTML(row.title)}</strong><span>${row.branch === 'le-van-tho' ? 'Lê Văn Thọ' : 'Phạm Văn Chiêu'} · ${row.names.length} người</span></div>${row.missing ? '<span class="status-pill bad">Thiếu cấu hình</span>' : '<span class="status-pill good">Đã phân ca</span>'}</div>
      <p>${escapeHTML(row.names.join(', '))}</p>
      <div class="shift-chip-list">${shifts.map((shift) => `<span class="shift-time-chip ${paidHours(shift) === 10 ? 'is-ten-hour' : ''}"><b>${escapeHTML(shift.name)}</b>${String(shift.start_time).slice(0,5)}–${String(shift.end_time).slice(0,5)} · ${hourLabel(paidHours(shift))}</span>`).join('')}</div>
    </article>`;
  }).join('');
  return `<section class="panel shift-overview-panel">
    <div class="section-title"><div><p class="eyebrow">TỔNG QUAN CA THEO CHỨC DANH</p><h3>Phân loại nhân sự theo số giờ và ca được phép</h3></div><span class="subtle" id="shiftOverviewCount">${list.length} nhóm chức danh</span></div>
    <div class="shift-overview-metrics"><article><span>Ca đúng 10 giờ</span><strong>${exact10.length}</strong><small>${exact10.map((x) => x.name).join(', ')}</small></article><article><span>Ca đúng 8 giờ</span><strong>${exact8.length}</strong><small>${exact8.map((x) => x.name).join(', ') || 'Chưa có'}</small></article><article class="${missing ? 'has-warning' : ''}"><span>Nhân sự thiếu phân ca</span><strong>${missing}</strong><small>Cần bổ sung ca được phép</small></article></div>
    <div class="shift-overview-filters"><label>Tìm chức danh hoặc nhân viên<input type="search" id="shiftOverviewSearch" placeholder="VD: Bác sĩ, phụ tá, Trần Văn Nguyên"></label><label>Chi nhánh<select id="shiftBranchFilter"><option value="all">Cả hai chi nhánh</option><option value="le-van-tho">Lê Văn Thọ</option><option value="pham-van-chieu">Phạm Văn Chiêu</option></select></label><label>Nhóm giờ<select id="shiftHoursFilter"><option value="all">Tất cả nhóm giờ</option><option value="10">Có ca đúng 10 giờ</option><option value="8">Có ca đúng 8 giờ</option><option value="other">Ca khác</option><option value="missing">Thiếu cấu hình ca</option></select></label></div>
    <div class="shift-role-grid" id="shiftRoleGrid">${cards}</div><div class="shift-overview-empty" id="shiftOverviewEmpty" hidden>Không có chức danh phù hợp bộ lọc.</div>
  </section>`;
}

function renderScheduleAssignmentCard(item) {
  const employee = cachedEmployees.find(e => e.id === item.employee);
  const shift = SHIFTS.find(s => s.id === item.shift);
  const swap = cachedEmployees.find(e => e.id === item.swapWith);
  return `
    <article class="mini-card">
      <strong>${escapeHTML(employee?.name || "Không rõ")} · ${formatShortDate(item.date)}</strong>
      <span>${escapeHTML(shift ? `${shift.name} ${shift.start}-${shift.end}` : "Chưa gán ca")}</span>
      <span>${swap ? `Đổi/chia với ${escapeHTML(swap.name)} · ` : ""}Tăng ca ${item.overtimeMinutes || 0}p · đến sớm ${item.earlyArrivalMinutes || 0}p · đi sớm ${item.earlyLeaveMinutes || 0}p</span>
      ${statusPill(item.status === "confirmed" ? "Đã xác nhận" : item.status === "changed" ? "Đã đổi ca" : "Đã lên lịch", item.status === "confirmed" ? "good" : "neutral")}
    </article>
  `;
}

function renderDepartmentSchedule(departmentId, assignments) {
  const deptAssignments = assignments.filter((item) => cachedEmployees.find(e => e.id === item.employee)?.department === departmentId);
  return `
    <article class="schedule-card">
      <div class="section-title">
        <h3>${escapeHTML(departmentName(departmentId))}</h3>
        ${pill(deptAssignments.length)}
      </div>
      <div class="grid">
        ${deptAssignments.length ? deptAssignments.slice(0, 4).map(renderScheduleAssignmentCard).join("") : `<p class="subtle">Chưa có lịch trong bộ lọc.</p>`}
      </div>
    </article>
  `;
}

function renderScheduleRequestCard(item) {
  const employee = cachedEmployees.find(e => e.id === item.employee);
  const reviewer = cachedEmployees.find(e => e.id === item.reviewer);
  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(employee?.name || "Không rõ")}</h4>
        ${statusPill(LEAVE_STATUS[item.status] || item.status, statusTone(item.status))}
      </div>
      <div class="request-meta">
        ${pill(item.month)}
        ${pill(departmentName(employee?.department))}
        ${pill(`Duyệt: ${reviewer?.name || "Quản lý"}`)}
      </div>
      <p class="subtle">${escapeHTML(item.preference)}</p>
      <div class="request-actions">
        <span class="subtle">Gửi ${formatDateTime(item.submittedAt)}</span>
        ${item.status === "pending" ? `
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="schedule-approve" data-id="${escapeHTML(item.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="schedule-reject" data-id="${escapeHTML(item.id)}"><span>×</span>Từ chối</button>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

export async function renderView(state) {
  return renderMonthlySchedule(state);
  /* Legacy schedule dashboard is kept below for data compatibility during rollout. */
  const { searchTerm } = state;
  const monthKey = todayISO().slice(0, 7);

  const [requests, assignments, employees, shiftConfig] = await Promise.all([
    getScheduleRequests(),
    getScheduleAssignments(),
    getEmployees(),
    getShiftConfiguration().catch(() => ({ shifts: [], allowed: [] }))
  ]);

  cachedEmployees = employees;
  cachedRequests = requests;
  cachedAssignments = assignments;

  // Filter based on search query
  const filteredRequests = requests.filter(item => {
    if (!searchTerm) return true;
    const employee = employees.find(e => e.id === item.employee);
    const textToMatch = [
      employee?.name,
      departmentName(employee?.department),
      item.preference,
      item.month,
      item.status
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  const filteredAssignments = assignments.filter(item => {
    if (!searchTerm) return true;
    const employee = employees.find(e => e.id === item.employee);
    const shift = SHIFTS.find(s => s.id === item.shift);
    const textToMatch = [
      employee?.name,
      shift?.name,
      item.note,
      item.status
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  const detailedGroups = ["bs", "phuta", "dvkh"];

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Roster & overtime</p>
        <h3>Đăng ký lịch làm ngày 25 hằng tháng, chia lịch cho nhân viên khác, theo dõi tăng ca, đến sớm và đi sớm tính công.</h3>
      </div>
      <div class="pill-row">
        ${pill(`Kỳ ${monthKey}`)}
        ${statusPill("Hạn đăng ký ngày 25", Number(todayISO().slice(-2)) <= 25 ? "good" : "warn")}
      </div>
    </div>

    ${renderShiftOverview(employees, shiftConfig)}

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Đăng ký lịch làm</h3>
          ${pill("Mỗi tháng ngày 25")}
        </div>
        <form class="form-grid three" data-form="schedule-request" id="requestForm">
          <div class="form-field">
            <label for="scheduleRequestEmployee">Nhân sự</label>
            <select id="scheduleRequestEmployee" name="employee">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="scheduleMonth">Tháng đăng ký</label>
            <input id="scheduleMonth" name="month" type="month" value="${monthKey}" />
          </div>
          <div class="form-field">
            <label for="scheduleReviewer">Người duyệt</label>
            <select id="scheduleReviewer" name="reviewer">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field full">
            <label for="schedulePreference">Nội dung đăng ký</label>
            <textarea id="schedulePreference" name="preference" required placeholder="Ca mong muốn, ngày nghỉ, lịch bác sĩ/phụ tá/lễ tân..."></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Gửi đăng ký lịch</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Chia ca / đổi ca</h3>
          ${pill("Trưởng bộ phận gán")}
        </div>
        <form class="form-grid three" data-form="schedule-assignment" id="assignmentForm">
          <div class="form-field">
            <label for="assignmentEmployee">Nhân sự</label>
            <select id="assignmentEmployee" name="employee">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="assignmentDate">Ngày làm</label>
            <input id="assignmentDate" name="date" type="date" value="${todayISO()}" />
          </div>
          <div class="form-field">
            <label for="assignmentShift">Ca làm</label>
            <select id="assignmentShift" name="shift">
              ${SHIFTS.map(s => option(s.id, `${s.name} (${s.start}-${s.end})`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="assignmentOwner">Người phụ trách</label>
            <select id="assignmentOwner" name="owner">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="assignmentSwap">Chia/đổi với</label>
            <select id="assignmentSwap" name="swapWith">
              <option value="">Không đổi ca</option>
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="assignmentStatus">Trạng thái</label>
            <select id="assignmentStatus" name="status">
              <option value="planned">Đã lên lịch</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="changed">Đã đổi ca</option>
            </select>
          </div>
          <div class="form-field">
            <label for="assignmentOt">Tăng ca (phút)</label>
            <input id="assignmentOt" name="overtimeMinutes" type="number" min="0" value="0" />
          </div>
          <div class="form-field">
            <label for="assignmentEarly">Đến sớm tính công (phút)</label>
            <input id="assignmentEarly" name="earlyArrivalMinutes" type="number" min="0" value="0" />
          </div>
          <div class="form-field">
            <label for="assignmentLeave">Đi sớm (phút)</label>
            <input id="assignmentLeave" name="earlyLeaveMinutes" type="number" min="0" value="0" />
          </div>
          <div class="form-field full">
            <label for="assignmentNote">Ghi chú</label>
            <textarea id="assignmentNote" name="note" placeholder="Lý do đổi ca, lịch bệnh nhân, người nhận bàn giao"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Lưu lịch làm</button>
          </div>
        </form>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Bảng chi tiết BS / Phụ tá / Lễ tân</h3>
        <span class="subtle">${filteredAssignments.length} lịch</span>
      </div>
      <div class="grid cols-3 animate-fade">
        ${detailedGroups.map((dept) => renderDepartmentSchedule(dept, filteredAssignments)).join("")}
      </div>
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Đăng ký lịch chờ duyệt</h3>
        <span class="subtle">${filteredRequests.length} phiếu</span>
      </div>
      <div class="grid cols-3 animate-fade">
        ${filteredRequests.length ? filteredRequests.map(renderScheduleRequestCard).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  initMonthlySchedule();
  return;
  const applyShiftOverviewFilters = () => {
    const branch = document.getElementById('shiftBranchFilter')?.value || 'all';
    const hours = document.getElementById('shiftHoursFilter')?.value || 'all';
    const search = (document.getElementById('shiftOverviewSearch')?.value || '').trim().toLocaleLowerCase('vi');
    let visible = 0;
    document.querySelectorAll('[data-shift-row]').forEach((row) => {
      const show = (branch === 'all' || row.dataset.branch === branch) && (hours === 'all' || row.dataset.hours === hours) && (!search || row.dataset.search.includes(search));
      row.hidden = !show;
      if (show) visible += 1;
    });
    const count = document.getElementById('shiftOverviewCount');
    const empty = document.getElementById('shiftOverviewEmpty');
    if (count) count.textContent = `${visible} nhóm chức danh`;
    if (empty) empty.hidden = visible !== 0;
  };
  ['shiftBranchFilter','shiftHoursFilter','shiftOverviewSearch'].forEach((id) => document.getElementById(id)?.addEventListener('input', applyShiftOverviewFilters));
  const requestForm = document.getElementById("requestForm");
  if (requestForm) {
    requestForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(requestForm);
      const data = Object.fromEntries(formData.entries());

      try {
        await createScheduleRequest({
          employee: data.employee,
          month: data.month,
          preference: data.preference,
          status: "pending",
          reviewer: data.reviewer
        });

        showToast("Đã gửi đăng ký lịch.");
        requestForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Schedule View] createScheduleRequest failed:', err);
        showToast("Lỗi gửi đăng ký.", true);
      }
    });
  }

  const assignmentForm = document.getElementById("assignmentForm");
  if (assignmentForm) {
    assignmentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(assignmentForm);
      const data = Object.fromEntries(formData.entries());

      try {
        await createScheduleAssignment({
          employee: data.employee,
          date: data.date || todayISO(),
          shift: data.shift,
          owner: data.owner,
          swapWith: data.swapWith,
          status: data.status,
          overtimeMinutes: Number(data.overtimeMinutes || 0),
          earlyArrivalMinutes: Number(data.earlyArrivalMinutes || 0),
          earlyLeaveMinutes: Number(data.earlyLeaveMinutes || 0),
          note: data.note.trim()
        });

        showToast("Đã gán ca làm việc.");
        assignmentForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Schedule View] createScheduleAssignment failed:', err);
        showToast("Lỗi lưu ca làm việc.", true);
      }
    });
  }

  document.querySelectorAll("[data-action='schedule-approve']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateScheduleRequest(id, { status: "approved" });
        showToast("Đã duyệt đơn đăng ký.");
        store.notify();
      } catch (err) {
        console.error('[Schedule View] updateScheduleRequest (approve) failed:', err);
        showToast("Lỗi khi duyệt đơn.", true);
      }
    });
  });

  document.querySelectorAll("[data-action='schedule-reject']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateScheduleRequest(id, { status: "rejected" });
        showToast("Đã từ chối đơn đăng ký.");
        store.notify();
      } catch (err) {
        console.error('[Schedule View] updateScheduleRequest (reject) failed:', err);
        showToast("Lỗi khi từ chối đơn.", true);
      }
    });
  });
}
