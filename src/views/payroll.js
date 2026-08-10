import { getPayrollFeedback, createPayrollFeedback, updatePayrollFeedback } from '../services/payroll.js';
import { getEmployees } from '../services/employees.js';
import { getAttendance } from '../services/attendance.js';
import { getScheduleAssignments } from '../services/schedule.js';
import { getSalaryAdvances, createLeaveRequest, updateLeaveRequest } from '../services/leave.js';
import { todayISO, escapeHTML, formatCurrency, formatDateTime, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedFeedback = [];
let cachedAdvances = [];

function renderPayrollTable(rows) {
  if (!rows.length) return emptyState();
  const body = rows.map((row) => `
    <tr>
      <td><strong>${escapeHTML(row.employee.name)}</strong><br><span class="subtle">${escapeHTML(departmentName(row.employee.department))}</span></td>
      <td>${row.days} ngày<br><span class="subtle">${row.regularHours} giờ công</span></td>
      <td>${row.overtimeHours.toFixed(1)} giờ<br><span class="subtle">Tăng ca/đến sớm</span></td>
      <td>${formatCurrency(row.hourlyRate)}</td>
      <td>${formatCurrency(row.grossPay)}</td>
      <td>${formatCurrency(row.advanceTotal)}</td>
      <td><strong>${formatCurrency(row.netPay)}</strong></td>
    </tr>
  `).join("");

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nhân sự</th>
            <th>Công</th>
            <th>Tăng ca</th>
            <th>Lương giờ</th>
            <th>Tạm tính</th>
            <th>Ứng</th>
            <th>Thực nhận</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderSalaryAdvanceCard(item) {
  const employee = cachedEmployees.find(e => e.id === item.employee);
  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(item.type || "Ứng lương")}</h4>
        ${statusPill(item.status === "approved" ? "Đã duyệt" : item.status === "rejected" ? "Từ chối" : "Chờ duyệt", statusTone(item.status))}
      </div>
      <div class="request-meta">
        ${pill(employee?.name || "Không rõ")}
        ${pill(formatCurrency(item.amount))}
        ${pill(item.routedTo === "kt" ? "Kế toán" : "PNS")}
      </div>
      <p class="subtle">STK: ${escapeHTML(item.bankAccount || "Chưa nhập")}</p>
      <p class="subtle">${escapeHTML(item.reason)}</p>
      <div class="request-actions">
        <span class="subtle">${formatDateTime(item.createdAt)}</span>
        ${item.status === "pending" ? `
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="advance-approve" data-id="${escapeHTML(item.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="advance-reject" data-id="${escapeHTML(item.id)}"><span>×</span>Từ chối</button>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

function renderPayrollFeedbackCard(item) {
  const employee = cachedEmployees.find(e => e.id === item.employee);
  return `
    <article class="mini-card" style="cursor: pointer;" data-action="feedback-toggle" data-id="${escapeHTML(item.id)}" data-status="${escapeHTML(item.status)}">
      <strong>${escapeHTML(employee?.name || "Không rõ")} · ${escapeHTML(item.month)}</strong>
      <span>${escapeHTML(item.text)}</span>
      ${statusPill(item.status === "resolved" ? "Đã xử lý" : "Đang mở", item.status === "resolved" ? "good" : "warn")}
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm, settings } = state;
  const monthKey = todayISO().slice(0, 7);

  const [feedback, advances, employees, attendance, scheduleAssignments] = await Promise.all([
    getPayrollFeedback(),
    getSalaryAdvances(),
    getEmployees(),
    getAttendance(),
    getScheduleAssignments()
  ]);

  cachedEmployees = employees;
  cachedFeedback = feedback;
  cachedAdvances = advances;

  // Build Payroll Rows
  const payrollRows = employees.map((employee) => {
    const checkins = attendance.filter((record) => record.employee === employee.id && record.type === "checkin" && String(record.date).startsWith(monthKey));
    const assignments = scheduleAssignments.filter((item) => item.employee === employee.id && String(item.date).startsWith(monthKey));
    const regularHours = checkins.length * 8;
    const overtimeMinutes = assignments.reduce((sum, item) => sum + Number(item.overtimeMinutes || 0) + Number(item.earlyArrivalMinutes || 0) - Number(item.earlyLeaveMinutes || 0), 0);
    const overtimeHours = Math.max(overtimeMinutes / 60, 0);
    const advanceTotal = advances
      .filter((item) => item.employee === employee.id && item.status === "approved" && String(item.createdAt).slice(0, 7) === monthKey)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const hourlyRate = Number(employee.hourlyRate || 0);
    const grossPay = Math.round(regularHours * hourlyRate + overtimeHours * hourlyRate * 1.5);
    return {
      employee,
      month: monthKey,
      days: checkins.length,
      regularHours,
      overtimeHours,
      hourlyRate,
      grossPay,
      advanceTotal,
      netPay: Math.max(grossPay - advanceTotal, 0),
    };
  });

  // Filter based on search query
  const filteredRows = payrollRows.filter(row => {
    if (!searchTerm) return true;
    return smartMatch([
      row.employee.name,
      row.employee.role,
      departmentName(row.employee.department),
      row.month,
      String(row.regularHours),
      String(row.overtimeHours),
      String(row.netPay)
    ].join(" "), searchTerm);
  });

  const filteredAdvances = advances.filter(item => {
    if (!searchTerm) return true;
    const employee = employees.find(e => e.id === item.employee);
    return smartMatch([
      employee?.name,
      item.type,
      String(item.amount),
      item.bankAccount,
      item.reason,
      item.status
    ].join(" "), searchTerm);
  });

  const filteredFeedback = feedback.filter(item => {
    if (!searchTerm) return true;
    const employee = employees.find(e => e.id === item.employee);
    return smartMatch([
      employee?.name,
      item.month,
      item.text,
      item.status
    ].join(" "), searchTerm);
  });

  const grossTotal = filteredRows.reduce((sum, row) => sum + row.netPay, 0);
  const monthlyCycleText = settings?.monthlyPayrollCycle || "Từ ngày 1 đến hết ngày cuối tháng. Lương chuyển khoản trước ngày 5.";

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Payroll formula</p>
        <h3>Tính lương theo giờ, chuyên cần, tăng ca, đến sớm tính công, ứng lương và phản hồi công lương theo kỳ.</h3>
      </div>
      <div class="pill-row">
        ${pill(`Kỳ ${monthKey}`)}
        ${pill(`Tạm tính ${formatCurrency(grossTotal)}`)}
      </div>
    </div>

    <section class="panel">
      <div class="section-title">
        <h3>Công thức lương theo giờ</h3>
        ${pill("Cấu hình mẫu")}
      </div>
      <div class="formula-box">
        <strong>Lương tạm tính = Giờ công hợp lệ × lương giờ + tăng ca × 150% + đến sớm tính công − đi sớm − ứng lương</strong>
        <span>${escapeHTML(monthlyCycleText)}</span>
      </div>
    </section>

    <div class="grid cols-2" style="margin-top:14px">
      <section class="panel">
        <div class="section-title">
          <h3>Ứng lương / duyệt tiền mặt</h3>
          ${pill("Đổ về PNS/KT")}
        </div>
        <form class="form-grid three" data-form="salary-advance" id="advanceForm">
          <div class="form-field">
            <label for="advanceEmployee">Nhân sự</label>
            <select id="advanceEmployee" name="employee">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="advanceType">Loại yêu cầu</label>
            <select id="advanceType" name="type">
              <option>Tạm ứng lương</option>
              <option>Duyệt tiền mặt</option>
            </select>
          </div>
          <div class="form-field">
            <label for="advanceAmount">Số tiền</label>
            <input id="advanceAmount" name="amount" type="number" min="0" value="0" />
          </div>
          <div class="form-field full">
            <label for="advanceBank">Thông tin STK / người nhận</label>
            <input id="advanceBank" name="bankAccount" placeholder="Tên ngân hàng, số tài khoản, chủ tài khoản" />
          </div>
          <div class="form-field full">
            <label for="advanceReason">Lý do</label>
            <textarea id="advanceReason" name="reason" required placeholder="Lý do ứng lương hoặc duyệt tiền mặt"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Gửi yêu cầu</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Phản hồi lương</h3>
          ${pill("Nhân sự xác nhận")}
        </div>
        <form class="form-grid" data-form="payroll-feedback" id="feedbackForm">
          <div class="form-field">
            <label for="payrollEmployee">Nhân sự</label>
            <select id="payrollEmployee" name="employee">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="payrollMonth">Kỳ lương</label>
            <input id="payrollMonth" name="month" type="month" value="${monthKey}" />
          </div>
          <div class="form-field full">
            <label for="payrollText">Nội dung phản hồi</label>
            <textarea id="payrollText" name="text" required placeholder="VD: kiểm tra lại tăng ca, công đi sớm, đơn bổ sung công..."></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Gửi phản hồi lương</button>
          </div>
        </form>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Bảng công lương tháng</h3>
        <span class="subtle">${filteredRows.length} nhân sự</span>
      </div>
      ${renderPayrollTable(filteredRows)}
    </section>

    <div class="grid cols-2" style="margin-top:14px">
      <section class="panel">
        <div class="section-title">
          <h3>Đơn ứng lương / tiền mặt</h3>
          <span class="subtle">${filteredAdvances.length} đơn</span>
        </div>
        <div class="grid cols-2 animate-fade">
          ${filteredAdvances.length ? filteredAdvances.map(renderSalaryAdvanceCard).join("") : emptyState()}
        </div>
      </section>
      <section class="panel">
        <div class="section-title">
          <h3>Phản hồi công lương</h3>
          <span class="subtle">${filteredFeedback.length} phản hồi</span>
        </div>
        <div class="grid animate-fade">
          ${filteredFeedback.length ? filteredFeedback.map(renderPayrollFeedbackCard).join("") : emptyState()}
        </div>
      </section>
    </div>
  `;
}

export function initView() {
  const advanceForm = document.getElementById("advanceForm");
  if (advanceForm) {
    advanceForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(advanceForm);
      const data = Object.fromEntries(formData.entries());

      try {
        await createLeaveRequest({
          employee: data.employee,
          type: data.type,
          from: todayISO(),
          to: todayISO(),
          amount: Number(data.amount || 0),
          bankAccount: data.bankAccount.trim(),
          reason: data.reason.trim(),
          status: "pending",
          reviewer: "e-001",
          routedTo: data.type === "Duyệt tiền mặt" ? "kt" : "ns"
        });

        showToast("Đã gửi yêu cầu ứng lương/tiền mặt.");
        advanceForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Payroll View] createLeaveRequest (advance) failed:', err);
        showToast("Lỗi gửi yêu cầu ứng lương.", true);
      }
    });
  }

  const feedbackForm = document.getElementById("feedbackForm");
  if (feedbackForm) {
    feedbackForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(feedbackForm);
      const data = Object.fromEntries(formData.entries());

      try {
        await createPayrollFeedback({
          employee: data.employee,
          month: data.month || todayISO().slice(0, 7),
          text: data.text.trim(),
          status: "open"
        });

        showToast("Đã gửi phản hồi lương.");
        feedbackForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Payroll View] createPayrollFeedback failed:', err);
        showToast("Lỗi gửi phản hồi.", true);
      }
    });
  }

  document.querySelectorAll("[data-action='advance-approve']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateLeaveRequest(id, { status: "approved" });
        showToast("Đã duyệt yêu cầu ứng lương.");
        store.notify();
      } catch (err) {
        console.error('[Payroll View] updateLeaveRequest (approve) failed:', err);
        showToast("Lỗi khi duyệt yêu cầu.", true);
      }
    });
  });

  document.querySelectorAll("[data-action='advance-reject']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      try {
        await updateLeaveRequest(id, { status: "rejected" });
        showToast("Đã từ chối yêu cầu ứng lương.");
        store.notify();
      } catch (err) {
        console.error('[Payroll View] updateLeaveRequest (reject) failed:', err);
        showToast("Lỗi khi từ chối yêu cầu.", true);
      }
    });
  });

  document.querySelectorAll("[data-action='feedback-toggle']").forEach(card => {
    card.addEventListener("click", async () => {
      const id = card.dataset.id;
      const currentStatus = card.dataset.status;
      const nextStatus = currentStatus === "resolved" ? "open" : "resolved";
      try {
        await updatePayrollFeedback(id, { status: nextStatus });
        showToast(nextStatus === "resolved" ? "Đã đánh dấu xử lý phản hồi." : "Đã mở lại phản hồi.");
        store.notify();
      } catch (err) {
        console.error('[Payroll View] updatePayrollFeedback failed:', err);
        showToast("Lỗi cập nhật phản hồi.", true);
      }
    });
  });
}
