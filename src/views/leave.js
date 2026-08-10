import { getLeaveRequests, createLeaveRequest, reviewLeaveRequest } from '../services/leave.js';
import { getEmployees } from '../services/employees.js';
import { LEAVE_STATUS, LEAVE_TYPES } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, formatDateTime, formatCurrency, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { triggerArchive2Months } from '../services/archive-sync.js';

let cachedEmployees = [];
let cachedRequests = [];
let requestSearch = '';
let requestSearchMode = 'near';
let requestTypeFilter = 'all';
let requestStatusFilter = 'all';
let requestDepartmentFilter = 'all';
let requestBranchFilter = 'all';

function renderLeaveCard(request) {
  const employee = cachedEmployees.find(e => e.id === request.employee) || {
    id: request.employee,
    name: request.employee === 'PVC-IT' ? 'Admin IT' : (request.employee || 'Nhân sự'),
    department: 'it'
  };
  const role = store.getState().role;
  const isManagementRole = ['admin', 'hr', 'admin_it'].includes(role);

  // Calculate if request is within 30 days (1 month) limit for re-review
  const createdDate = request.createdAt ? new Date(request.createdAt) : (request.from ? new Date(request.from) : new Date());
  const diffDays = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));
  const isWithin30Days = diffDays <= 30;

  const canReview = request.status === 'pending' && (
    (role === 'leader' && request.leaderStatus === 'pending') ||
    isManagementRole
  );

  const canReReview = (request.status === 'approved' || request.status === 'rejected') && isManagementRole && isWithin30Days;
  const isLockedOver30Days = (request.status === 'approved' || request.status === 'rejected') && isManagementRole && !isWithin30Days;

  const workflowLabel = request.status === 'approved' ? 'Đã duyệt cấp cao nhất'
    : request.status === 'rejected' ? 'Đã từ chối'
    : request.leaderStatus === 'approved' ? 'Chờ Vận hành / HR duyệt'
    : 'Chờ Quản lý / HR duyệt';

  return `
    <article class="request-card ${request.status === 'approved' ? 'is-approved' : request.status === 'rejected' ? 'is-rejected' : ''}">
      <div class="section-title">
        <h4>${escapeHTML(request.type)}</h4>
        ${statusPill(LEAVE_STATUS[request.status] || request.status, statusTone(request.status))}
      </div>
      <div class="request-meta">
        ${pill(employee.name)}
        ${pill(departmentName(employee.department))}
        ${pill(`${formatShortDate(request.from)} - ${formatShortDate(request.to)}`)}
        ${request.type === 'Đơn tăng ca' && request.startTime && request.endTime ? pill(`${request.startTime}–${request.endTime} · ${Math.round(request.overtimeMinutes / 60 * 10) / 10} giờ`) : ''}
        ${['Tạm ứng lương', 'Ứng lương'].includes(request.type) && request.amount ? pill(formatCurrency(request.amount)) : ''}
        ${pill(workflowLabel)}
        ${isLockedOver30Days ? pill("🔒 Đã khóa (Quá 30 ngày)") : (request.status === 'approved' || request.status === 'rejected') && isWithin30Days ? pill(`⏱ Còn ${Math.max(0, 30 - diffDays)} ngày xem xét lại`) : ''}
      </div>
      <p class="subtle">${escapeHTML(request.reason)}</p>
      <div class="request-actions">
        <span class="subtle">Duyệt bởi ${escapeHTML(cachedEmployees.find(e => e.id === request.reviewer)?.name || "Quản lý / HR")}</span>
        ${canReview ? `
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="leave-approve" data-id="${escapeHTML(request.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="leave-reject" data-id="${escapeHTML(request.id)}"><span>×</span>Từ chối</button>
          </div>
        ` : ''}
        ${canReReview ? `
          <div class="pill-row">
            ${request.status === 'approved' ? `
              <button class="danger-button" type="button" data-action="leave-rereview" data-id="${escapeHTML(request.id)}" data-target="rejected"><span>↺</span>Duyệt lại (Từ chối)</button>
            ` : `
              <button class="secondary-button" type="button" data-action="leave-rereview" data-id="${escapeHTML(request.id)}" data-target="approved"><span>↺</span>Duyệt lại (Chấp nhận)</button>
            `}
            <button class="secondary-button" style="background:#f0f4f2;color:#455a64;" type="button" data-action="leave-rereview" data-id="${escapeHTML(request.id)}" data-target="pending"><span>↩</span>Đặt lại Chờ duyệt</button>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm, employeeCode, profile } = state;
  let currentEmpCode = employeeCode || profile?.employee_code;
  if (!currentEmpCode && profile?.role === 'admin_it') {
    currentEmpCode = 'PVC-IT';
  }

  let requests = [];
  let employees = [];
  try {
    [requests, employees] = await Promise.all([
      getLeaveRequests(),
      getEmployees()
    ]);
  } catch (err) {
    console.warn('[Leave View] Error loading data:', err);
  }

  // Ensure Admin IT employee record exists in employees list
  if (!employees.some(e => e.id === 'PVC-IT')) {
    employees.unshift({
      id: 'PVC-IT',
      name: 'Admin IT',
      department: 'it',
      branchId: 'pham-van-chieu',
      role: 'Quản trị IT',
    });
  }

  // Fallback for current logged in user if not in list
  if (profile && currentEmpCode && !employees.some(e => e.id === currentEmpCode)) {
    employees.unshift({
      id: currentEmpCode,
      name: profile.full_name || profile.email || 'Admin IT',
      department: profile.department || 'it',
      branchId: profile.branch_id || 'pham-van-chieu',
    });
  }

  cachedEmployees = employees.filter(emp => emp && emp.id && String(emp.id).trim() !== '');
  cachedRequests = requests;

  // Filter based on search query
  const filteredRequests = requests.filter(item => {
    const employee = cachedEmployees.find(e => e.id === item.employee) || {
      id: item.employee,
      name: item.employee === 'PVC-IT' ? 'Admin IT' : (item.employee || 'Nhân sự'),
      department: 'it',
      branchId: 'pham-van-chieu'
    };
    if (requestTypeFilter !== 'all' && item.type !== requestTypeFilter) return false;
    if (requestStatusFilter !== 'all' && item.status !== requestStatusFilter) return false;
    if (requestDepartmentFilter !== 'all' && employee?.department && employee.department !== requestDepartmentFilter) return false;
    if (requestBranchFilter !== 'all' && employee?.branchId && employee.branchId !== requestBranchFilter) return false;
    const activeSearch = requestSearch || searchTerm;
    if (!activeSearch) return true;
    const textToMatch = [
      employee?.name || item.employee,
      employee?.id || item.employee,
      departmentName(employee?.department),
      item.type,
      item.reason,
      item.status
    ].join(" ");
    return smartMatch(textToMatch, activeSearch, requestSearchMode);
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
            <select id="leaveEmployee" name="employee" required>
              ${cachedEmployees.map(emp => option(emp.id, `${emp.name} (${emp.id}) - ${departmentName(emp.department)}`, emp.id === currentEmpCode)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="leaveType">Loại đơn</label>
            <select id="leaveType" name="type">
              ${LEAVE_TYPES.map(t => `<option>${escapeHTML(t)}</option>`).join('')}
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
          <div class="form-field" data-request-fields="overtime" hidden>
            <label for="leaveStartTime">Bắt đầu tăng ca</label>
            <input id="leaveStartTime" name="startTime" type="time" />
          </div>
          <div class="form-field" data-request-fields="overtime" hidden>
            <label for="leaveEndTime">Kết thúc tăng ca</label>
            <input id="leaveEndTime" name="endTime" type="time" />
          </div>
          <div class="form-field" data-request-fields="advance" hidden>
            <label for="leaveAmount">Số tiền ứng</label>
            <input id="leaveAmount" name="amount" type="number" min="1" step="1000" />
          </div>
          <div class="form-field" data-request-fields="advance" hidden>
            <label for="leaveBankAccount">Tài khoản nhận tiền</label>
            <input id="leaveBankAccount" name="bankAccount" placeholder="Ngân hàng · Số tài khoản · Chủ tài khoản" />
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
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div>
          <h3>Danh sách đơn</h3>
          <span class="subtle">${filteredRequests.length} đơn theo bộ lọc</span>
        </div>
        ${['admin', 'hr', 'admin_it'].includes(store.getState().role) ? `
          <button class="secondary-button" type="button" id="triggerArchive2MonthsBtn" style="white-space:nowrap;">
            <span>📁</span>Lưu trữ 2 tháng (Excel & Drive)
          </button>
        ` : ''}
      </div>
      <div class="operation-filterbar" id="leaveRequestFilters">
        <label class="is-search">Tìm thông minh<input type="search" id="leaveRequestSearch" value="${escapeHTML(requestSearch)}" placeholder="Gõ gần đúng tên, MNV, lý do hoặc loại đơn" autocomplete="off"></label>
        <label>Kiểu dò<select id="leaveRequestSearchMode"><option value="near" ${requestSearchMode === 'near' ? 'selected' : ''}>Gần đúng, bỏ dấu</option><option value="exact" ${requestSearchMode === 'exact' ? 'selected' : ''}>Đúng cụm từ</option></select></label>
        <label>Loại đơn<select id="leaveRequestTypeFilter"><option value="all">Tất cả loại đơn</option>${LEAVE_TYPES.map((type) => `<option value="${escapeHTML(type)}" ${requestTypeFilter === type ? 'selected' : ''}>${escapeHTML(type)}</option>`).join('')}</select></label>
        <label>Trạng thái<select id="leaveRequestStatusFilter"><option value="all">Tất cả trạng thái</option><option value="pending" ${requestStatusFilter === 'pending' ? 'selected' : ''}>Chờ duyệt</option><option value="approved" ${requestStatusFilter === 'approved' ? 'selected' : ''}>Đã duyệt</option><option value="rejected" ${requestStatusFilter === 'rejected' ? 'selected' : ''}>Đã từ chối</option></select></label>
        <label>Phòng ban<select id="leaveRequestDepartmentFilter"><option value="all">Tất cả phòng ban</option>${[...new Set(employees.map((item) => item.department).filter(Boolean))].map((department) => `<option value="${escapeHTML(department)}" ${requestDepartmentFilter === department ? 'selected' : ''}>${escapeHTML(departmentName(department))}</option>`).join('')}</select></label>
        <label>Chi nhánh<select id="leaveRequestBranchFilter"><option value="all">Cả hai chi nhánh</option><option value="le-van-tho" ${requestBranchFilter === 'le-van-tho' ? 'selected' : ''}>Lê Văn Thọ</option><option value="pham-van-chieu" ${requestBranchFilter === 'pham-van-chieu' ? 'selected' : ''}>Phạm Văn Chiêu</option></select></label>
        <button class="secondary-button" type="button" id="clearLeaveRequestFilters">Xóa bộ lọc</button>
      </div>
      <div class="grid cols-3 animate-fade">
        ${filteredRequests.length ? filteredRequests.map(renderLeaveCard).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  const refreshLeaveFilters = () => store.notify();
  document.getElementById('leaveRequestSearch')?.addEventListener('input', (event) => {
    requestSearch = event.target.value;
    window.clearTimeout(event.target._leaveFilterTimer);
    event.target._leaveFilterTimer = window.setTimeout(refreshLeaveFilters, 180);
  });
  document.getElementById('leaveRequestTypeFilter')?.addEventListener('change', (event) => { requestTypeFilter = event.target.value; refreshLeaveFilters(); });
  document.getElementById('leaveRequestSearchMode')?.addEventListener('change', (event) => { requestSearchMode = event.target.value; refreshLeaveFilters(); });
  document.getElementById('leaveRequestStatusFilter')?.addEventListener('change', (event) => { requestStatusFilter = event.target.value; refreshLeaveFilters(); });
  document.getElementById('leaveRequestDepartmentFilter')?.addEventListener('change', (event) => { requestDepartmentFilter = event.target.value; refreshLeaveFilters(); });
  document.getElementById('leaveRequestBranchFilter')?.addEventListener('change', (event) => { requestBranchFilter = event.target.value; refreshLeaveFilters(); });
  document.getElementById('clearLeaveRequestFilters')?.addEventListener('click', () => {
    requestSearch = '';
    requestSearchMode = 'near';
    requestTypeFilter = 'all';
    requestStatusFilter = 'all';
    requestDepartmentFilter = 'all';
    requestBranchFilter = 'all';
    refreshLeaveFilters();
  });
  const leaveForm = document.getElementById("leaveForm");
  if (leaveForm) {
    const typeSelect = document.getElementById('leaveType');
    const startInput = document.getElementById('leaveStartTime');
    const endInput = document.getElementById('leaveEndTime');
    const amountInput = document.getElementById('leaveAmount');
    const bankInput = document.getElementById('leaveBankAccount');
    const syncRequestFields = () => {
      const isOvertime = typeSelect.value === 'Đơn tăng ca';
      const isAdvance = ['Tạm ứng lương', 'Ứng lương'].includes(typeSelect.value);
      document.querySelectorAll('[data-request-fields="overtime"]').forEach(el => { el.hidden = !isOvertime; });
      document.querySelectorAll('[data-request-fields="advance"]').forEach(el => { el.hidden = !isAdvance; });
      startInput.required = isOvertime;
      endInput.required = isOvertime;
      amountInput.required = isAdvance;
      bankInput.required = isAdvance;
    };
    typeSelect.addEventListener('change', syncRequestFields);
    syncRequestFields();

    leaveForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(leaveForm);
      const data = Object.fromEntries(formData.entries());

      if (!data.employee || !String(data.employee).trim()) {
        showToast("Vui lòng chọn nhân sự hợp lệ.", true);
        return;
      }

      let overtimeMinutes = 0;
      if (data.type === 'Đơn tăng ca') {
        const [startHour, startMinute] = data.startTime.split(':').map(Number);
        const [endHour, endMinute] = data.endTime.split(':').map(Number);
        overtimeMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        if (overtimeMinutes <= 0) {
          showToast('Giờ kết thúc tăng ca phải sau giờ bắt đầu.', true);
          return;
        }
      }

      try {
        await createLeaveRequest({
          employee: data.employee,
          type: data.type,
          from: data.from,
          to: data.to,
          reason: data.reason,
          amount: Number(data.amount || 0),
          bankAccount: data.bankAccount || '',
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          overtimeMinutes,
          status: "pending",
          reviewer: cachedEmployees[0]?.id || "e-001",
          routedTo: ['Tạm ứng lương', 'Ứng lương'].includes(data.type) ? 'kt' : 'ns',
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
        const result = await reviewLeaveRequest(id, "approved");
        showToast(result.status === 'approved' ? "Đã duyệt cấp cao nhất." : "Đã chuyển Tổng vận hành duyệt.");
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
        const reason = window.prompt('Lý do từ chối:') || '';
        await reviewLeaveRequest(id, "rejected", reason);
        showToast("Đã từ chối đơn.");
        store.notify();
      } catch (err) {
        console.error('[Leave View] updateLeaveRequest (reject) failed:', err);
        showToast("Lỗi khi từ chối đơn.", true);
      }
    });
  });

  document.querySelectorAll("[data-action='leave-rereview']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const targetStatus = btn.dataset.target;
      try {
        let reason = '';
        if (targetStatus === 'rejected') {
          reason = window.prompt('Lý do xem xét lại (Từ chối):') || '';
        }
        const profile = store.getState().profile;
        await updateLeaveRequest(id, {
          status: targetStatus,
          leaderStatus: targetStatus === 'approved' ? 'approved' : targetStatus === 'rejected' ? 'rejected' : 'pending',
          operationsStatus: targetStatus === 'approved' ? 'approved' : targetStatus === 'rejected' ? 'rejected' : 'pending',
          reviewer: profile?.employee_code || 'PVC-IT',
        });
        showToast(targetStatus === 'approved' ? "Đã duyệt lại đơn (Chấp nhận)." : targetStatus === 'rejected' ? "Đã đổi đơn thành từ chối." : "Đã đặt lại đơn về chờ duyệt.");
        store.notify();
      } catch (err) {
        console.error('[Leave View] leave-rereview failed:', err);
        showToast("Lỗi khi cập nhật lại đơn.", true);
      }
    });
  });

  document.getElementById('triggerArchive2MonthsBtn')?.addEventListener('click', async () => {
    if (!window.confirm('Hệ thống sẽ tổng hợp tất cả dữ liệu đơn từ & chấm công > 60 ngày thành file Excel, gửi lưu trữ về Google Drive và dọn dẹp cơ sở dữ liệu. Tiếp tục?')) return;
    try {
      showToast('Đang tổng hợp dữ liệu & đóng gói sang Google Drive...');
      const result = await triggerArchive2Months();
      showToast(result.message || 'Đã lưu trữ dữ liệu 2 tháng thành công.');
      store.notify();
    } catch (err) {
      console.error('[Leave View] Archive 2 months failed:', err);
      showToast('Lỗi khi lưu trữ dữ liệu: ' + (err.message || err), true);
    }
  });
}
