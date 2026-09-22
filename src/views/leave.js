import { getLeaveRequests, createLeaveRequest, reviewLeaveRequest, updateLeaveRequest, reReviewLeaveRequest } from '../services/leave.js';
import { getEmployees } from '../services/employees.js';
import { LEAVE_STATUS, LEAVE_TYPES } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, formatDateTime, formatCurrency, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
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
let requestPage = 1;
let requestPageSize = 9;
let leaveViewMode = localStorage.getItem('clinic_leave_view_mode') || 'pipeline';

function getFilteredRequests() {
  return cachedRequests.filter(item => {
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
    const activeSearch = requestSearch;
    if (!activeSearch) return true;
    const textToMatch = [
      employee?.name || item.employee,
      employee?.id || item.employee,
      departmentName(employee?.department),
      item.type,
      item.reason,
      item.status
    ].join(' ');
    return smartMatch(textToMatch, activeSearch, requestSearchMode);
  });
}

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
        ${isLockedOver30Days ? pill('🔒 Đã khóa (Quá 30 ngày)') : (request.status === 'approved' || request.status === 'rejected') && isWithin30Days ? pill(`⏱ Còn ${Math.max(0, 30 - diffDays)} ngày xem xét lại`) : ''}
      </div>
      <p class="subtle">${escapeHTML(request.reason)}</p>
      ${request.rejectionReason ? `<p class="subtle" style="color:#c62828;font-size:12px;margin-top:4px;"><b>Lý do từ chối:</b> ${escapeHTML(request.rejectionReason)}</p>` : ''}
      <div class="request-actions">
        <span class="subtle">Duyệt bởi ${escapeHTML(cachedEmployees.find(e => e.id === request.reviewer)?.name || 'Quản lý / HR')}</span>
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

function renderSheetRow(request, index) {
  const employee = cachedEmployees.find(e => e.id === request.employee) || {
    id: request.employee,
    name: request.employee === 'PVC-IT' ? 'Admin IT' : (request.employee || 'Nhân sự'),
    department: 'it',
    branchId: 'pham-van-chieu'
  };
  const role = store.getState().role;
  const isManagementRole = ['admin', 'hr', 'admin_it'].includes(role);

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

  const reviewerName = cachedEmployees.find(e => e.id === request.reviewer)?.name || 'Quản lý / HR';

  return `
    <tr class="leave-table-row" style="border-bottom: 1px solid var(--line); transition: background 0.15s;">
      <td style="text-align: center; color: var(--muted); font-size: 0.82rem; padding: 10px 8px;">${index}</td>
      <td style="padding: 10px 12px; font-size: 0.85rem;">
        <strong style="color: var(--ink);">${escapeHTML(employee.name)}</strong>
        <br><span class="subtle" style="font-size: 0.74rem;">${escapeHTML(employee.id)}</span>
      </td>
      <td style="padding: 10px 12px; font-size: 0.82rem;">
        <span>${escapeHTML(departmentName(employee.department))}</span>
        <br><span class="subtle" style="font-size: 0.74rem;">${employee.branchId === 'pham-van-chieu' ? 'Phạm Văn Chiêu' : 'Lê Văn Thọ'}</span>
      </td>
      <td style="padding: 10px 12px; font-size: 0.82rem;">
        <span class="pill" style="font-size: 0.75rem; font-weight: 600;">${escapeHTML(request.type)}</span>
      </td>
      <td style="padding: 10px 12px; font-size: 0.82rem;">
        <strong>${formatShortDate(request.from)}</strong>${request.to && request.to !== request.from ? ` – <strong>${formatShortDate(request.to)}</strong>` : ''}
        ${request.type === 'Đơn tăng ca' && request.startTime && request.endTime ? `<br><span class="subtle" style="color: var(--teal); font-weight: 600; font-size: 0.75rem;"><i class="ri-time-line"></i> ${request.startTime}–${request.endTime} (${Math.round(request.overtimeMinutes / 60 * 10) / 10}h)</span>` : ''}
        ${['Tạm ứng lương', 'Ứng lương'].includes(request.type) && request.amount ? `<br><strong style="color: #b45309; font-size: 0.78rem;">💰 ${formatCurrency(request.amount)}</strong>${request.bankAccount ? `<br><small class="subtle" style="font-size: 0.72rem;">${escapeHTML(request.bankAccount)}</small>` : ''}` : ''}
      </td>
      <td style="padding: 10px 12px; font-size: 0.82rem; max-width: 240px;">
        <span style="display: block; line-height: 1.4;">${escapeHTML(request.reason)}</span>
        ${request.rejectionReason ? `<span style="display: block; color: #c62828; font-size: 0.75rem; margin-top: 3px;"><b>Từ chối:</b> ${escapeHTML(request.rejectionReason)}</span>` : ''}
      </td>
      <td style="padding: 10px 12px; font-size: 0.82rem;">
        ${statusPill(LEAVE_STATUS[request.status] || request.status, statusTone(request.status))}
        <br><small class="subtle" style="font-size: 0.72rem;">${escapeHTML(workflowLabel)}</small>
      </td>
      <td style="padding: 10px 12px; font-size: 0.82rem;">
        <span class="subtle" style="font-size: 0.76rem;">${escapeHTML(reviewerName)}</span>
        ${isLockedOver30Days ? `<br><span class="pill" style="font-size: 0.7rem; background: #f1f5f9; color: #64748b;">🔒 Quá 30 ngày</span>` : (request.status === 'approved' || request.status === 'rejected') && isWithin30Days ? `<br><span class="pill" style="font-size: 0.7rem; background: #fef3c7; color: #92400e;">⏱ Còn ${Math.max(0, 30 - diffDays)} ngày</span>` : ''}
      </td>
      <td style="padding: 10px 12px; text-align: right; min-width: 130px;">
        ${canReview ? `
          <div class="pill-row" style="justify-content: flex-end; gap: 4px;">
            <button class="secondary-button" type="button" data-action="leave-approve" data-id="${escapeHTML(request.id)}" style="padding: 4px 9px; font-size: 0.76rem; min-height: 28px;" title="Duyệt đơn"><i class="ri-check-line"></i> Duyệt</button>
            <button class="danger-button" type="button" data-action="leave-reject" data-id="${escapeHTML(request.id)}" style="padding: 4px 9px; font-size: 0.76rem; min-height: 28px;" title="Từ chối đơn"><i class="ri-close-line"></i> Từ chối</button>
          </div>
        ` : ''}
        ${canReReview ? `
          <div class="pill-row" style="justify-content: flex-end; gap: 4px;">
            ${request.status === 'approved' ? `
              <button class="danger-button" type="button" data-action="leave-rereview" data-id="${escapeHTML(request.id)}" data-target="rejected" style="padding: 4px 9px; font-size: 0.76rem; min-height: 28px;" title="Duyệt lại (Từ chối)"><i class="ri-restart-line"></i> Từ chối</button>
            ` : `
              <button class="secondary-button" type="button" data-action="leave-rereview" data-id="${escapeHTML(request.id)}" data-target="approved" style="padding: 4px 9px; font-size: 0.76rem; min-height: 28px;" title="Duyệt lại (Chấp nhận)"><i class="ri-restart-line"></i> Duyệt</button>
            `}
            <button class="secondary-button" style="padding: 4px 9px; font-size: 0.76rem; min-height: 28px; background: #f0f4f2; color: #455a64;" type="button" data-action="leave-rereview" data-id="${escapeHTML(request.id)}" data-target="pending" title="Đặt lại Chờ duyệt"><i class="ri-reply-line"></i> Đặt lại</button>
          </div>
        ` : ''}
        ${!canReview && !canReReview ? `<span class="subtle" style="font-size: 0.75rem;">—</span>` : ''}
      </td>
    </tr>
  `;
}

function renderPipelineView(filteredRequests) {
  const columns = [
    {
      key: 'pending',
      title: 'Chờ duyệt',
      icon: 'ri-time-line',
      color: '#b45309',
      borderColor: '#f59e0b',
      bg: '#fdfbf7',
      colBorder: '#fef3c7',
      badgeBg: '#fef3c7',
      badgeColor: '#b45309',
      badgeBorder: '#fde68a',
      emptyText: 'Không có đơn chờ duyệt',
    },
    {
      key: 'approved',
      title: 'Đã duyệt',
      icon: 'ri-checkbox-circle-line',
      color: '#047857',
      borderColor: '#10b981',
      bg: '#f7fbf9',
      colBorder: '#d1fae5',
      badgeBg: '#d1fae5',
      badgeColor: '#047857',
      badgeBorder: '#a7f3d0',
      emptyText: 'Không có đơn đã duyệt',
    },
    {
      key: 'rejected',
      title: 'Đã từ chối',
      icon: 'ri-close-circle-line',
      color: '#b91c1c',
      borderColor: '#ef4444',
      bg: '#fdf8f8',
      colBorder: '#fee2e2',
      badgeBg: '#fee2e2',
      badgeColor: '#b91c1c',
      badgeBorder: '#fca5a5',
      emptyText: 'Không có đơn từ chối',
    },
  ];

  return `
    <div class="leave-pipeline-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; align-items: start; margin-top: 14px; overflow-x: auto; padding-bottom: 8px;">
      ${columns.map(col => {
        const colRequests = filteredRequests.filter(r => r.status === col.key);
        return `
          <div class="leave-pipeline-col" data-status-col="${col.key}" style="background: ${col.bg}; border: 1px solid ${col.colBorder}; border-radius: 12px; padding: 14px; display: flex; flex-direction: column; min-height: 220px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div class="leave-pipeline-col-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid ${col.borderColor};">
              <div style="display: inline-flex; align-items: center; gap: 8px;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: ${col.badgeBg}; color: ${col.color};">
                  <i class="${col.icon}" style="font-size: 1rem;"></i>
                </span>
                <strong style="font-size: 0.95rem; color: #1e293b;">${col.title}</strong>
              </div>
              <span class="pipeline-count" style="padding: 2px 9px; border-radius: 12px; font-weight: 700; font-size: 0.78rem; background: ${col.badgeBg}; color: ${col.badgeColor}; border: 1px solid ${col.badgeBorder};">
                ${colRequests.length}
              </span>
            </div>
            <div class="leave-pipeline-cards" style="display: flex; flex-direction: column; gap: 12px; max-height: 720px; overflow-y: auto; padding-right: 4px;">
              ${colRequests.length ? colRequests.map(renderLeaveCard).join('') : `
                <div style="text-align: center; padding: 36px 12px; color: #94a3b8; font-size: 0.83rem;">
                  <i class="ri-inbox-line" style="font-size: 1.8rem; display: block; margin-bottom: 6px; color: #cbd5e1;"></i>
                  ${col.emptyText}
                </div>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSheetView(filteredRequests, pagedRequests, requestPageStart) {
  return `
    <div class="table-wrap leave-sheet-wrap" style="overflow-x: auto; margin-top: 14px; background: #ffffff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
      <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="border-bottom: 2px solid var(--line); background: var(--surface-soft);">
            <th style="width: 48px; text-align: center; padding: 10px 8px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">STT</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">Nhân sự</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">Phòng ban & Cơ sở</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">Loại đơn</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">Thời gian / Chi tiết</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">Lý do</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">Trạng thái</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink);">Người duyệt & Hạn</th>
            <th style="padding: 10px 12px; font-size: 0.78rem; font-weight: 700; color: var(--ink); text-align: right; min-width: 130px;">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${pagedRequests.length ? pagedRequests.map((req, idx) => renderSheetRow(req, requestPageStart + idx + 1)).join('') : `
            <tr>
              <td colspan="9" style="text-align: center; padding: 36px; color: #94a3b8;">
                <i class="ri-inbox-line" style="font-size: 1.8rem; display: block; margin-bottom: 6px; color: #cbd5e1;"></i>
                Không có đơn phù hợp bộ lọc.
              </td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;
}

function renderPaginationContent(totalItems, requestPageStart, requestTotalPages) {
  const requestPageCandidates = Array.from(new Set([1, requestPage - 1, requestPage, requestPage + 1, requestTotalPages]))
    .filter((page) => page >= 1 && page <= requestTotalPages)
    .sort((a, b) => a - b);

  return `
    <div class="data-pagination-summary">${totalItems ? `Hiển thị ${requestPageStart + 1}–${Math.min(requestPageStart + requestPageSize, totalItems)} trong ${totalItems} đơn` : 'Không có đơn phù hợp'}</div>
    <div class="data-pagination-actions">
      <label class="data-page-size">Hiển thị
        <select id="leaveRequestPageSize">${[9, 18, 36].map((size) => option(size, `${size} đơn`, requestPageSize === size)).join('')}</select>
      </label>
      <button type="button" class="data-page-nav" id="leaveRequestPrevPage" ${requestPage <= 1 ? 'disabled' : ''}><i class="ri-arrow-left-s-line"></i><span>Trước</span></button>
      <div class="data-page-numbers">
        ${requestPageCandidates.map((page, index) => {
          const previousPage = requestPageCandidates[index - 1];
          const gap = previousPage && page - previousPage > 1 ? '<span class="data-page-gap">…</span>' : '';
          return `${gap}<button type="button" class="data-page-number${page === requestPage ? ' is-active' : ''}" data-leave-page="${page}" ${page === requestPage ? 'aria-current="page"' : ''}>${page}</button>`;
        }).join('')}
      </div>
      <button type="button" class="data-page-nav" id="leaveRequestNextPage" ${requestPage >= requestTotalPages ? 'disabled' : ''}><span>Sau</span><i class="ri-arrow-right-s-line"></i></button>
    </div>
  `;
}

function getSwitcherBtnStyle(isActive) {
  return `padding:5px 14px; font-size:0.82rem; font-weight:600; border:0; border-radius:7px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; background:${isActive ? '#ffffff' : 'transparent'}; color:${isActive ? '#087f7b' : '#64748b'}; box-shadow:${isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}; transition:all 0.15s ease;`;
}

function updateSwitcherStyles() {
  const pBtn = document.getElementById('leaveViewModePipeline');
  const sBtn = document.getElementById('leaveViewModeSheet');
  if (pBtn) {
    pBtn.style.cssText = getSwitcherBtnStyle(leaveViewMode === 'pipeline');
    pBtn.classList.toggle('active', leaveViewMode === 'pipeline');
  }
  if (sBtn) {
    sBtn.style.cssText = getSwitcherBtnStyle(leaveViewMode === 'sheet');
    sBtn.classList.toggle('active', leaveViewMode === 'sheet');
  }
}

function updateLeaveDisplay() {
  const filtered = getFilteredRequests();

  // Update summary count
  const summaryEl = document.getElementById('leaveRequestSummaryText');
  if (summaryEl) {
    summaryEl.textContent = `${filtered.length} đơn theo bộ lọc`;
  }

  // Update content container
  const contentEl = document.getElementById('leaveContentContainer');
  if (!contentEl) return;

  const requestTotalPages = Math.max(1, Math.ceil(filtered.length / requestPageSize));
  requestPage = Math.min(Math.max(1, requestPage), requestTotalPages);
  const requestPageStart = (requestPage - 1) * requestPageSize;
  const pagedRequests = filtered.slice(requestPageStart, requestPageStart + requestPageSize);

  if (leaveViewMode === 'pipeline') {
    contentEl.innerHTML = renderPipelineView(filtered);
  } else {
    contentEl.innerHTML = renderSheetView(filtered, pagedRequests, requestPageStart);
  }

  // Update pagination
  const pagEl = document.getElementById('leavePaginationContainer');
  if (pagEl) {
    if (leaveViewMode === 'pipeline' || filtered.length <= requestPageSize) {
      pagEl.hidden = true;
    } else {
      pagEl.hidden = false;
      pagEl.innerHTML = renderPaginationContent(filtered.length, requestPageStart, requestTotalPages);
      bindPaginationEvents();
    }
  }

  // Re-bind actions inside content
  bindLeaveCardActions();
}

function bindLeaveCardActions() {
  const container = document.getElementById('leaveContentContainer');
  if (!container) return;

  container.querySelectorAll("[data-action='leave-approve']").forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        const result = await reviewLeaveRequest(id, 'approved');
        showToast(result.status === 'approved' ? 'Đã duyệt cấp cao nhất.' : 'Đã chuyển Tổng vận hành duyệt.');
        store.notify();
      } catch (err) {
        console.error('[Leave View] updateLeaveRequest (approve) failed:', err);
        showToast('Lỗi khi duyệt đơn.', true);
      }
    });
  });

  container.querySelectorAll("[data-action='leave-reject']").forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        const reason = await requestInput('Vui lòng ghi rõ lý do để nhân viên nhận phản hồi.', { title: 'Từ chối đơn', label: 'Lý do từ chối', placeholder: 'Nhập lý do...', confirmText: 'Từ chối đơn', tone: 'danger' });
        if (reason === null) return;
        await reviewLeaveRequest(id, 'rejected', reason);
        showToast('Đã từ chối đơn.');
        store.notify();
      } catch (err) {
        console.error('[Leave View] updateLeaveRequest (reject) failed:', err);
        showToast('Lỗi khi từ chối đơn.', true);
      }
    });
  });

  container.querySelectorAll("[data-action='leave-rereview']").forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const targetStatus = btn.dataset.target;
      try {
        let reason = '';
        if (targetStatus === 'rejected') {
          reason = await requestInput('Vui lòng ghi rõ lý do thay đổi kết quả xét duyệt.', {
            title: 'Xem xét lại đơn',
            label: 'Lý do từ chối',
            placeholder: 'Nhập lý do...',
            confirmText: 'Từ chối đơn',
            tone: 'danger',
          });
          if (reason === null) return;
        } else if (targetStatus === 'pending') {
          const ok = await confirmAction('Bạn có chắc muốn đặt lại đơn này về trạng thái "Chờ duyệt" để xem xét lại từ đầu?', {
            title: 'Đặt lại Chờ duyệt',
            confirmText: 'Đặt lại',
          });
          if (!ok) return;
        } else if (targetStatus === 'approved') {
          const ok = await confirmAction('Bạn có chắc muốn duyệt lại đơn này (Chấp nhận)?', {
            title: 'Duyệt lại đơn',
            confirmText: 'Duyệt chấp nhận',
          });
          if (!ok) return;
        }

        await reReviewLeaveRequest(id, targetStatus, reason);
        showToast(targetStatus === 'approved' ? 'Đã duyệt lại đơn (Chấp nhận).' : targetStatus === 'rejected' ? 'Đã đổi đơn thành từ chối.' : 'Đã đặt lại đơn về chờ duyệt.');
        store.notify();
      } catch (err) {
        console.error('[Leave View] leave-rereview failed:', err);
        showToast('Lỗi khi cập nhật lại đơn: ' + (err.message || err), true);
      }
    });
  });
}

function bindPaginationEvents() {
  const pagEl = document.getElementById('leavePaginationContainer');
  if (!pagEl) return;

  pagEl.querySelector('#leaveRequestPageSize')?.addEventListener('change', (event) => {
    requestPageSize = Number(event.target.value) || 9;
    requestPage = 1;
    updateLeaveDisplay();
  });
  pagEl.querySelector('#leaveRequestPrevPage')?.addEventListener('click', () => {
    requestPage = Math.max(1, requestPage - 1);
    updateLeaveDisplay();
  });
  pagEl.querySelector('#leaveRequestNextPage')?.addEventListener('click', () => {
    requestPage += 1;
    updateLeaveDisplay();
  });
  pagEl.querySelectorAll('[data-leave-page]').forEach((button) => button.addEventListener('click', () => {
    requestPage = Number(button.dataset.leavePage) || 1;
    updateLeaveDisplay();
  }));
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
      getEmployees(),
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

  if (!requestSearch && searchTerm) {
    requestSearch = searchTerm;
  }

  leaveViewMode = localStorage.getItem('clinic_leave_view_mode') || 'pipeline';

  const filteredRequests = getFilteredRequests();
  const requestTotalPages = Math.max(1, Math.ceil(filteredRequests.length / requestPageSize));
  requestPage = Math.min(Math.max(1, requestPage), requestTotalPages);
  const requestPageStart = (requestPage - 1) * requestPageSize;
  const pagedRequests = filteredRequests.slice(requestPageStart, requestPageStart + requestPageSize);

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
          ${pill('HR duyệt trước ca')}
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
          ${pill('Theo ca làm thực tế')}
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
      <div class="section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0;">Danh sách đơn</h3>
            <span class="subtle" id="leaveRequestSummaryText">${filteredRequests.length} đơn theo bộ lọc</span>
          </div>
          <!-- View switcher segmented buttons -->
          <div class="marketing-view-switcher" role="group" aria-label="Chế độ hiển thị danh sách đơn">
            <button type="button" id="leaveViewModePipeline" class="view-switch-btn ${leaveViewMode === 'pipeline' ? 'active' : ''}" style="${getSwitcherBtnStyle(leaveViewMode === 'pipeline')}">
              <i class="ri-layout-column-line"></i> Pipeline (Quy trình)
            </button>
            <button type="button" id="leaveViewModeSheet" class="view-switch-btn ${leaveViewMode === 'sheet' ? 'active' : ''}" style="${getSwitcherBtnStyle(leaveViewMode === 'sheet')}">
              <i class="ri-table-line"></i> Sheet bảng tính
            </button>
          </div>
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

      <div id="leaveContentContainer">
        ${leaveViewMode === 'pipeline' ? renderPipelineView(filteredRequests) : renderSheetView(filteredRequests, pagedRequests, requestPageStart)}
      </div>

      <div id="leavePaginationContainer" class="data-pagination" ${leaveViewMode === 'pipeline' || filteredRequests.length <= requestPageSize ? 'hidden' : ''}>
        ${renderPaginationContent(filteredRequests.length, requestPageStart, requestTotalPages)}
      </div>
    </section>
  `;
}

export function initView() {
  const searchInput = document.getElementById('leaveRequestSearch');
  searchInput?.addEventListener('input', (event) => {
    requestSearch = event.target.value;
    window.clearTimeout(event.target._leaveFilterTimer);
    event.target._leaveFilterTimer = window.setTimeout(() => {
      requestPage = 1;
      updateLeaveDisplay();
    }, 80);
  });

  document.getElementById('leaveRequestTypeFilter')?.addEventListener('change', (event) => {
    requestTypeFilter = event.target.value;
    requestPage = 1;
    updateLeaveDisplay();
  });
  document.getElementById('leaveRequestSearchMode')?.addEventListener('change', (event) => {
    requestSearchMode = event.target.value;
    requestPage = 1;
    updateLeaveDisplay();
  });
  document.getElementById('leaveRequestStatusFilter')?.addEventListener('change', (event) => {
    requestStatusFilter = event.target.value;
    requestPage = 1;
    updateLeaveDisplay();
  });
  document.getElementById('leaveRequestDepartmentFilter')?.addEventListener('change', (event) => {
    requestDepartmentFilter = event.target.value;
    requestPage = 1;
    updateLeaveDisplay();
  });
  document.getElementById('leaveRequestBranchFilter')?.addEventListener('change', (event) => {
    requestBranchFilter = event.target.value;
    requestPage = 1;
    updateLeaveDisplay();
  });

  document.getElementById('clearLeaveRequestFilters')?.addEventListener('click', () => {
    requestSearch = '';
    requestSearchMode = 'near';
    requestTypeFilter = 'all';
    requestStatusFilter = 'all';
    requestDepartmentFilter = 'all';
    requestBranchFilter = 'all';
    requestPage = 1;

    const s = document.getElementById('leaveRequestSearch');
    if (s) s.value = '';
    const sm = document.getElementById('leaveRequestSearchMode');
    if (sm) sm.value = 'near';
    const tf = document.getElementById('leaveRequestTypeFilter');
    if (tf) tf.value = 'all';
    const sf = document.getElementById('leaveRequestStatusFilter');
    if (sf) sf.value = 'all';
    const df = document.getElementById('leaveRequestDepartmentFilter');
    if (df) df.value = 'all';
    const bf = document.getElementById('leaveRequestBranchFilter');
    if (bf) bf.value = 'all';

    updateLeaveDisplay();
  });

  document.getElementById('leaveViewModePipeline')?.addEventListener('click', () => {
    if (leaveViewMode === 'pipeline') return;
    leaveViewMode = 'pipeline';
    localStorage.setItem('clinic_leave_view_mode', 'pipeline');
    updateSwitcherStyles();
    updateLeaveDisplay();
  });

  document.getElementById('leaveViewModeSheet')?.addEventListener('click', () => {
    if (leaveViewMode === 'sheet') return;
    leaveViewMode = 'sheet';
    localStorage.setItem('clinic_leave_view_mode', 'sheet');
    updateSwitcherStyles();
    updateLeaveDisplay();
  });

  bindPaginationEvents();
  bindLeaveCardActions();

  const leaveForm = document.getElementById('leaveForm');
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

    leaveForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(leaveForm);
      const data = Object.fromEntries(formData.entries());

      if (!data.employee || !String(data.employee).trim()) {
        showToast('Vui lòng chọn nhân sự hợp lệ.', true);
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
          status: 'pending',
          reviewer: cachedEmployees[0]?.id || 'e-001',
          routedTo: ['Tạm ứng lương', 'Ứng lương'].includes(data.type) ? 'kt' : 'ns',
        });

        showToast('Đã gửi đơn.');
        leaveForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Leave View] createLeaveRequest failed:', err);
        showToast('Lỗi gửi đơn.', true);
      }
    });
  }

  document.getElementById('triggerArchive2MonthsBtn')?.addEventListener('click', async () => {
    if (!await confirmAction('Hệ thống sẽ tổng hợp tất cả dữ liệu đơn từ & chấm công > 60 ngày thành file Excel, gửi lưu trữ về Google Drive và dọn dẹp cơ sở dữ liệu. Tiếp tục?', { title: 'Lưu trữ dữ liệu cũ', confirmText: 'Bắt đầu lưu trữ' })) return;
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
