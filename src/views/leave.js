import { getLeaveRequests, createLeaveRequest, updateLeaveRequest } from '../services/leave.js';
import { getEmployees } from '../services/employees.js';
import { LEAVE_STATUS, LEAVE_TYPES } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, formatDateTime, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedRequests = [];

function renderLeaveCard(request) {
  const employee = cachedEmployees.find(e => e.id === request.employee);
  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(request.type)}</h4>
        ${statusPill(LEAVE_STATUS[request.status] || request.status, statusTone(request.status))}
      </div>
      <div class="request-meta">
        ${pill(employee?.name || "Không rõ")}
        ${pill(departmentName(employee?.department))}
        ${pill(`${formatShortDate(request.from)} - ${formatShortDate(request.to)}`)}
        ${pill("Trưởng BP → Tổng vận hành")}
      </div>
      <p class="subtle">${escapeHTML(request.reason)}</p>
      <div class="request-actions">
        <span class="subtle">Duyệt bởi ${escapeHTML(cachedEmployees.find(e => e.id === request.reviewer)?.name || "Quản lý")}</span>
        ${request.status === "pending" ? `
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="leave-approve" data-id="${escapeHTML(request.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="leave-reject" data-id="${escapeHTML(request.id)}"><span>×</span>Từ chối</button>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  const [requests, employees] = await Promise.all([
    getLeaveRequests(),
    getEmployees()
  ]);

  cachedEmployees = employees;
  cachedRequests = requests;

  // Filter based on search query
  const filteredRequests = requests.filter(item => {
    if (!searchTerm) return true;
    const employee = employees.find(e => e.id === item.employee);
    const textToMatch = [
      employee?.name,
      departmentName(employee?.department),
      item.type,
      item.reason,
      item.status
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">People request workflow</p>
        <h3>Nhân sự gửi đơn nghỉ phép, đi trễ, bổ sung công vào/ra hoặc tăng ca; quản lý duyệt và lưu trạng thái vận hành.</h3>
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Tạo đơn</h3>
          ${pill("HR duyệt trước ca")}
        </div>
        <form class="form-grid" data-form="leave" id="leaveForm">
          <div class="form-field">
            <label for="leaveEmployee">Nhân sự</label>
            <select id="leaveEmployee" name="employee">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="leaveType">Loại đơn</label>
            <select id="leaveType" name="type">
              ${LEAVE_TYPES.filter(t => t !== 'Tạm ứng lương').map(t => `<option>${escapeHTML(t)}</option>`).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="leaveFrom">Từ ngày</label>
            <input id="leaveFrom" name="from" type="date" value="${todayISO()}" />
          </div>
          <div class="form-field">
            <label for="leaveTo">Đến ngày</label>
            <input id="leaveTo" name="to" type="date" value="${todayISO()}" />
          </div>
          <div class="form-field full">
            <label for="leaveReason">Lý do</label>
            <textarea id="leaveReason" name="reason" required placeholder="Nhập lý do, số tiền/STK nếu ứng lương, người đã bàn giao nếu nghỉ/đổi ca"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Gửi đơn</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Chính sách nhanh</h3>
          ${pill("Theo ca làm thực tế")}
        </div>
        <div class="grid">
          <article class="schedule-card">
            <h3>Duyệt trước ca</h3>
            <p class="subtle">Đơn nghỉ hoặc đổi ca cần có người thay thế với DVKH, BS, Phụ tá, Bảo vệ và Lao công.</p>
          </article>
          <article class="schedule-card">
            <h3>Tính công</h3>
            <p class="subtle">Chấm công hợp lệ khi có định vị trong bán kính phòng khám và đúng quy tắc check-in trước 5 phút.</p>
          </article>
          <article class="schedule-card">
            <h3>Bàn giao</h3>
            <p class="subtle">Task đang mở của người nghỉ phép cần cập nhật owner hoặc ghi rõ tình trạng trước khi duyệt.</p>
          </article>
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Danh sách đơn</h3>
        <span class="subtle">${filteredRequests.length} đơn theo bộ lọc</span>
      </div>
      <div class="grid cols-3 animate-fade">
        ${filteredRequests.length ? filteredRequests.map(renderLeaveCard).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  const leaveForm = document.getElementById("leaveForm");
  if (leaveForm) {
    leaveForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(leaveForm);
      const data = Object.fromEntries(formData.entries());

      try {
        await createLeaveRequest({
          employee: data.employee,
          type: data.type,
          from: data.from,
          to: data.to,
          reason: data.reason,
          status: "pending",
          reviewer: cachedEmployees[0]?.id || "e-001"
        });

        showToast("Đã gửi đơn.");
        leaveForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Leave View] createLeaveRequest failed:', err);
        showToast("Lỗi gửi đơn.", true);
      }
    });
  }

  document.querySelectorAll("[data-action='leave-approve']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateLeaveRequest(id, { status: "approved" });
        showToast("Đã duyệt đơn.");
        store.notify();
      } catch (err) {
        console.error('[Leave View] updateLeaveRequest (approve) failed:', err);
        showToast("Lỗi khi duyệt đơn.", true);
      }
    });
  });

  document.querySelectorAll("[data-action='leave-reject']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateLeaveRequest(id, { status: "rejected" });
        showToast("Đã từ chối đơn.");
        store.notify();
      } catch (err) {
        console.error('[Leave View] updateLeaveRequest (reject) failed:', err);
        showToast("Lỗi khi từ chối đơn.", true);
      }
    });
  });
}
