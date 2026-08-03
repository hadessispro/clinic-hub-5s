import { getScheduleRequests, createScheduleRequest, updateScheduleRequest, getScheduleAssignments, createScheduleAssignment, updateScheduleAssignment } from '../services/schedule.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS, SHIFTS, LEAVE_STATUS } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, formatDateTime, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedRequests = [];
let cachedAssignments = [];

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
  const { searchTerm } = state;
  const monthKey = todayISO().slice(0, 7);

  const [requests, assignments, employees] = await Promise.all([
    getScheduleRequests(),
    getScheduleAssignments(),
    getEmployees()
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
