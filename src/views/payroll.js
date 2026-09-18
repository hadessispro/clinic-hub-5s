import { getPayrollFeedback, createPayrollFeedback, updatePayrollFeedback } from '../services/payroll.js';
import { getEmployees } from '../services/employees.js';
import { getAttendance } from '../services/attendance.js';
import { getScheduleAssignments } from '../services/schedule.js';
import { getSalaryAdvances, createLeaveRequest, updateLeaveRequest } from '../services/leave.js';
import { todayISO, escapeHTML, formatCurrency, formatDateTime, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { store } from '../store.js';
import { parsePayrollWorkbook } from '../services/payslip-parser.js';
import { generatePayslipHtml, generatePayslipText } from '../services/payslip-template.js';
import {
  getSavedSmtpConfig,
  saveSmtpConfig,
  clearSmtpConfig,
  testSmtpConnection,
  sendPayslipEmail,
  getSystemSmtpStatus,
} from '../services/payroll-dispatch.js';

// Global View States
let activeTab = 'dispatch'; // 'dispatch' | 'legacy'
let cachedEmployees = [];
let cachedFeedback = [];
let cachedAdvances = [];

// In-Memory Payslip Dispatch States (RAM-only, zero DB persistence)
let inMemoryPayslips = [];
let inMemoryPeriod = '';
let inMemoryFileName = '';
let searchFilter = '';
let deptFilter = 'all';
let statusFilter = 'all';
let systemSmtpInfo = null;

// Batch Dispatch Engine States
let isBatchRunning = false;
let isBatchPaused = false;
let shouldCancelBatch = false;
let batchCurrentIndex = -1;
let batchStatusMessage = '';

// Active previewed payslip for Modal
let currentPreviewPayslip = null;
let isSmtpModalOpen = false;

// ==========================================
// 1. DISPATCH TAB RENDERERS (IN-MEMORY)
// ==========================================

function formatVND(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 đ';
  return Number(amount).toLocaleString('vi-VN') + ' đ';
}

function renderDispatchHeader(smtpStatus) {
  const isSmtpReady = Boolean(smtpStatus?.isConfigured);
  const senderEmail = smtpStatus?.senderEmail || '';
  const currentUserRole = store.getState()?.profile?.role || '';
  const isItOrAdmin = ['admin', 'superadmin', 'admin_it'].includes(currentUserRole);

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Payroll Dispatcher · Bảo Mật · In-Memory</p>
        <h3>Đẩy phiếu lương trực tiếp qua email SMTP — Không lưu trữ dữ liệu vào Database</h3>
      </div>
      <div style="display:inline-flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="status-pill ${isSmtpReady ? 'is-success' : 'is-warning'}" style="font-size:0.82rem; padding:6px 12px; display:inline-flex; align-items:center; gap:6px;">
          <i class="ri-${isSmtpReady ? 'checkbox-circle-fill' : 'error-warning-line'}" style="color:${isSmtpReady ? '#10b981' : '#f59e0b'};"></i>
          ${isSmtpReady ? `SMTP Hệ Thống: <strong>${escapeHTML(senderEmail || 'Sẵn sàng')}</strong>` : 'SMTP Chưa Thiết Lập (Liên hệ Admin-IT)'}
        </span>
        ${isItOrAdmin ? `
          <a href="#system-admin" class="secondary-button" style="font-size:0.8rem; padding:6px 12px; text-decoration:none; display:inline-flex; align-items:center; gap:5px;">
            <i class="ri-settings-3-line"></i> Quản Trị SMTP
          </a>
        ` : ''}
        ${inMemoryPayslips.length > 0 ? `
          <button type="button" class="danger-button" id="btnClearSession" style="font-size:0.8rem; padding:6px 12px; display:inline-flex; align-items:center; gap:5px;">
            <i class="ri-delete-bin-line"></i> Xóa phiên / Xóa dấu vết (RAM)
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function renderUploadBox() {
  if (inMemoryPayslips.length > 0) {
    return `
      <section class="panel" style="margin-bottom:14px; border:1px solid #10b981; background:linear-gradient(to right, #f0fdf4, #ffffff);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:2rem; line-height:1;"><i class="ri-file-chart-line" style="color:#065f46;"></i></div>
            <div>
              <h4 style="margin:0; font-size:1rem; color:#065f46;">
                Đã nạp file: <strong>${escapeHTML(inMemoryFileName || 'Bảng lương Excel')}</strong>
              </h4>
              <p class="subtle" style="margin:2px 0 0 0; color:#047857;">
                Kỳ lương: <strong>${escapeHTML(inMemoryPeriod)}</strong> • 
                Tổng cộng: <strong>${inMemoryPayslips.length} nhân sự</strong> • 
                <em>Dữ liệu đang lưu tạm trong RAM trình duyệt</em>
              </p>
            </div>
          </div>
          <div class="pill-row">
            <input type="file" id="payrollExcelInput" accept=".xlsx,.xlsm,.xls" style="display:none;" />
            <button type="button" class="secondary-button" id="btnBrowseFile" style="font-size:0.8rem;">
              <i class="ri-folder-open-line"></i> Chọn file khác
            </button>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="panel" style="margin-bottom:14px; text-align:center; padding:36px 20px; border:2px dashed #cbd5e1; background:#f8fafc; border-radius:12px;" id="uploadDropZone">
      <input type="file" id="payrollExcelInput" accept=".xlsx,.xlsm,.xls" style="display:none;" />
      <div style="font-size:3rem; margin-bottom:10px;"><i class="ri-upload-cloud-2-line" style="color:#64748b;"></i></div>
      <h3 style="margin:0 0 6px 0; font-size:1.15rem; color:#1e293b;">Tải lên Bảng Lương Excel (.xlsx, .xlsm)</h3>
      <p class="subtle" style="max-width:560px; margin:0 auto 16px auto; font-size:0.85rem; line-height:1.5;">
        Hệ thống tự động trích xuất sheet <code>BANG LUONG</code>, đối soát Mã nhân viên & Họ tên với hệ thống để tìm email nhận phiếu, và tạo bản xem trước hoàn chỉnh.
        <br><strong style="color:#0f766e;">Cam kết bảo mật:</strong> Dữ liệu chỉ xử lý trong RAM, không lưu xuống bất kỳ bảng nào trong cơ sở dữ liệu.
      </p>
      <button type="button" class="primary-button" id="btnBrowseFile" style="padding:10px 24px; font-size:0.9rem;">
        <i class="ri-folder-open-line"></i> Chọn file từ máy tính
      </button>
      <div style="margin-top:10px; font-size:0.75rem; color:#94a3b8;">
        Hỗ trợ kéo & thả trực tiếp file Excel vào đây
      </div>
    </section>
  `;
}

function renderBatchActionButtonsHtml() {
  const readyToSendCount = inMemoryPayslips.filter((p) => p.status !== 'sent' && Boolean(p.email)).length;
  if (!isBatchRunning) {
    return `
      <button type="button" class="primary-button" id="btnStartBatch" style="padding:10px 22px; font-size:0.92rem; font-weight:700; background:linear-gradient(135deg, #0f766e 0%, #059669 100%); box-shadow:0 4px 12px rgba(15,118,110,0.3); border-radius:8px; display:inline-flex; align-items:center; gap:8px; cursor:pointer;" ${readyToSendCount === 0 ? 'disabled' : ''}>
        <i class="ri-flashlight-fill" style="color:#fef08a; font-size:1.15rem;"></i>
        GỬI NHANH HÀNG LOẠT (${readyToSendCount} phiếu)
      </button>
      <span class="pill" style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; font-size:0.75rem; font-weight:600; padding:6px 10px; display:inline-flex; align-items:center; gap:5px;">
        <i class="ri-speed-up-line" style="color:#10b981;"></i> Đa luồng song song (Siêu tốc x3)
      </span>
      <button type="button" class="secondary-button" id="btnTestSendAdminIt" style="padding:9px 16px; border:1px solid #0284c7; color:#0369a1; background:#f0f9ff; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
        <i class="ri-test-tube-line"></i> Test gửi Admin-IT
      </button>
    `;
  }
  return `
    ${!isBatchPaused ? `
      <button type="button" class="secondary-button" id="btnPauseBatch" style="display:inline-flex; align-items:center; gap:6px; font-weight:600;">
        <i class="ri-pause-fill"></i> Tạm dừng
      </button>
    ` : `
      <button type="button" class="primary-button" id="btnResumeBatch" style="display:inline-flex; align-items:center; gap:6px; font-weight:600; background:#0f766e;">
        <i class="ri-play-fill"></i> Tiếp tục gửi
      </button>
    `}
    <button type="button" class="danger-button" id="btnCancelBatch" style="display:inline-flex; align-items:center; gap:6px; font-weight:600;">
      <i class="ri-stop-fill"></i> Dừng hẳn
    </button>
    <span class="pill" style="background:#e0f2fe; color:#0369a1; font-size:0.75rem; font-weight:600; padding:6px 10px; display:inline-flex; align-items:center; gap:5px;">
      <i class="ri-loader-4-line ri-spin"></i> Đang chạy đa luồng...
    </span>
  `;
}

function renderDispatchControls() {
  if (!inMemoryPayslips.length) {
    return `
      <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:10px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:42px; height:42px; border-radius:10px; background:#e0f2fe; display:flex; align-items:center; justify-content:center; color:#0284c7; font-size:1.4rem;">
            <i class="ri-flashlight-line"></i>
          </div>
          <div>
            <strong style="color:#0f172a; font-size:0.95rem;">Tính năng Gửi Nhanh Hàng Loạt (Đa luồng song song)</strong>
            <p class="subtle" style="margin:2px 0 0 0; font-size:0.82rem;">Tải lên file Excel bảng lương ở trên để kích hoạt nút Gửi Nhanh Hàng Loạt cho toàn bộ nhân sự.</p>
          </div>
        </div>
        <button type="button" class="primary-button" disabled style="opacity:0.6; display:inline-flex; align-items:center; gap:8px; cursor:not-allowed; background:#94a3b8; padding:9px 18px;">
          <i class="ri-flashlight-fill"></i> GỬI NHANH HÀNG LOẠT (0 phiếu)
        </button>
      </div>
    `;
  }

  const total = inMemoryPayslips.length;
  const sentCount = inMemoryPayslips.filter((p) => p.status === 'sent').length;
  const pendingCount = inMemoryPayslips.filter((p) => p.status === 'pending').length;
  const failedCount = inMemoryPayslips.filter((p) => p.status === 'failed').length;
  const noEmailCount = inMemoryPayslips.filter((p) => !p.email).length;
  const pct = total > 0 ? Math.round((sentCount / total) * 100) : 0;

  return `
    <section class="panel" style="margin-bottom:14px;">
      <!-- Stats summary row -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin-bottom:16px;">
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px;">
          <div style="font-size:0.75rem; color:#64748b; text-transform:uppercase;">Tổng nhân sự</div>
          <div id="statTotal" style="font-size:1.4rem; font-weight:700; color:#0f172a;">${total}</div>
        </div>
        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px;">
          <div style="font-size:0.75rem; color:#166534; text-transform:uppercase;">Đã gửi thành công</div>
          <div id="statSent" style="font-size:1.4rem; font-weight:700; color:#15803d;">${sentCount}</div>
        </div>
        <div style="background:#fefce8; border:1px solid #fef08a; border-radius:8px; padding:10px 14px;">
          <div style="font-size:0.75rem; color:#854d0e; text-transform:uppercase;">Chưa gửi</div>
          <div id="statPending" style="font-size:1.4rem; font-weight:700; color:#a16207;">${pendingCount}</div>
        </div>
        <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 14px;">
          <div style="font-size:0.75rem; color:#991b1b; text-transform:uppercase;">Gửi thất bại</div>
          <div id="statFailed" style="font-size:1.4rem; font-weight:700; color:#dc2626;">${failedCount}</div>
        </div>
        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:10px 14px;">
          <div style="font-size:0.75rem; color:#9a3412; text-transform:uppercase;">Chưa có email</div>
          <div id="statNoEmail" style="font-size:1.4rem; font-weight:700; color:#c2410c;">${noEmailCount}</div>
        </div>
      </div>

      <!-- Action buttons & Progress -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
        <div class="pill-row" id="batchActionButtons">
          ${renderBatchActionButtonsHtml()}
        </div>

        <div id="dispatchProgressText" style="font-size:0.85rem; color:#64748b;">
          ${batchStatusMessage ? `<span>${escapeHTML(batchStatusMessage)}</span>` : `Tiến độ gửi: <strong>${sentCount}/${total}</strong> (${pct}%)`}
        </div>
      </div>

      <!-- Progress bar -->
      <div style="height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden;">
        <div id="dispatchProgressBar" style="height:100%; width:${pct}%; background:linear-gradient(90deg, #10b981, #059669); transition:width 0.3s ease;"></div>
      </div>
    </section>
  `;
}

function renderFilterBar() {
  if (!inMemoryPayslips.length) return '';

  const departments = ['all', ...new Set(inMemoryPayslips.map((p) => p.department).filter(Boolean))];

  return `
    <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
      <!-- Search row with embedded Remix Icon -->
      <div style="display:flex; gap:10px; align-items:center;">
        <div style="position:relative; flex:1;">
          <i class="ri-search-line" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:1.05rem;"></i>
          <input 
            type="text" 
            id="payslipSearchInput" 
            placeholder="Tìm nhanh theo Tên, Mã NV (GD001, BS002...), Email, Chức danh..." 
            value="${escapeHTML(searchFilter)}"
            style="width:100%; padding:9px 14px 9px 36px; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem;"
          />
        </div>
      </div>

      <!-- Filter pills row -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <!-- Department pills -->
        <div class="pill-row" style="flex-wrap:wrap;">
          <span class="subtle" style="font-size:0.75rem; align-self:center;">Phòng ban:</span>
          ${departments.map((dept) => `
            <button 
              type="button" 
              class="pill ${deptFilter === dept ? 'active' : ''}" 
              data-action="filter-dept" 
              data-dept="${escapeHTML(dept)}"
              style="cursor:pointer; border:1px solid ${deptFilter === dept ? '#0f766e' : '#e2e8f0'}; background:${deptFilter === dept ? '#0f766e' : '#ffffff'}; color:${deptFilter === dept ? '#ffffff' : '#334155'}; font-size:0.75rem;"
            >
              ${dept === 'all' ? 'Tất cả' : escapeHTML(dept)}
            </button>
          `).join('')}
        </div>

        <!-- Status pills -->
        <div class="pill-row">
          <span class="subtle" style="font-size:0.75rem; align-self:center;">Trạng thái:</span>
          ${[
            { id: 'all', label: 'Tất cả' },
            { id: 'pending', label: 'Chưa gửi' },
            { id: 'sent', label: 'Đã gửi' },
            { id: 'failed', label: 'Lỗi' },
            { id: 'no_email', label: 'Thiếu email' },
          ].map((st) => `
            <button 
              type="button" 
              class="pill ${statusFilter === st.id ? 'active' : ''}" 
              data-action="filter-status" 
              data-status="${st.id}"
              style="cursor:pointer; border:1px solid ${statusFilter === st.id ? '#1e293b' : '#e2e8f0'}; background:${statusFilter === st.id ? '#1e293b' : '#ffffff'}; color:${statusFilter === st.id ? '#ffffff' : '#334155'}; font-size:0.75rem;"
            >
              ${st.label}
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderPayslipsTableInner() {
  let rows = [...inMemoryPayslips];
  if (searchFilter.trim()) {
    const kw = searchFilter.trim().toLowerCase();
    rows = rows.filter((p) => [p.mnv, p.name, p.role, p.department, p.email, p.bankAccountNumber, String(p.netSalary)].join(' ').toLowerCase().includes(kw));
  }
  if (deptFilter !== 'all') rows = rows.filter((p) => p.department === deptFilter);
  if (statusFilter === 'pending') rows = rows.filter((p) => p.status === 'pending');
  else if (statusFilter === 'sent') rows = rows.filter((p) => p.status === 'sent');
  else if (statusFilter === 'failed') rows = rows.filter((p) => p.status === 'failed');
  else if (statusFilter === 'no_email') rows = rows.filter((p) => !p.email);

  if (!rows.length) return `<p class="subtle" style="text-align:center; padding:24px;">Không tìm thấy phiếu lương nào khớp với bộ lọc.</p>`;

  return `<table>
    <thead><tr>
      <th style="width:90px;">Mã NV</th><th>Họ và Tên</th><th>Chức danh</th><th>Email nhận</th>
      <th style="text-align:right;">Thực lãnh</th><th style="text-align:center; width:120px;">Trạng thái</th>
      <th style="text-align:right; width:200px; min-width:200px;">Thao tác</th>
    </tr></thead>
    <tbody>${rows.map((p) => {
      let statusBadge = `<span class="pill subtle">Chưa gửi</span>`;
      if (p.status === 'sending') statusBadge = `<span class="pill" style="background:#e0f2fe; color:#0369a1;"><i class="ri-loader-4-line ri-spin"></i> Đang gửi...</span>`;
      else if (p.status === 'sent') statusBadge = `<span class="pill good"><i class="ri-checkbox-circle-line"></i> Đã gửi</span>`;
      else if (p.status === 'failed') statusBadge = `<span class="pill danger" title="${escapeHTML(p.errorMsg || 'Lỗi gửi thư')}"><i class="ri-close-circle-line"></i> Lỗi</span>`;

      const emailDisplay = p.email
        ? `<span style="display:flex; align-items:center; gap:4px;">
            <span style="font-size:0.82rem; color:#0369a1;">${escapeHTML(p.email)}</span>
            <button type="button" class="icon-button" data-action="quick-edit-email" data-id="${p.id}" title="Sửa email" style="font-size:0.75rem; border:none; background:none; cursor:pointer; color:#94a3b8;"><i class="ri-edit-line"></i></button>
          </span>`
        : `<button type="button" class="pill warn" data-action="quick-edit-email" data-id="${p.id}" style="cursor:pointer; font-size:0.75rem; border:none; display:inline-flex; align-items:center; gap:4px;">
            <i class="ri-error-warning-line"></i> Chưa có email (Nhấp để nhập)
          </button>`;

      return `<tr data-row-id="${p.id}" style="${p.status === 'sending' ? 'background:#f0f9ff;' : ''}">
        <td><strong style="color:#0284c7;">${escapeHTML(p.mnv)}</strong></td>
        <td><strong>${escapeHTML(p.name)}</strong><br><span class="subtle" style="font-size:0.75rem;">${escapeHTML(p.department)}</span></td>
        <td><span style="font-size:0.82rem;">${escapeHTML(p.role || '—')}</span></td>
        <td>${emailDisplay}</td>
        <td style="text-align:right;"><strong style="color:#059669; font-size:0.95rem;">${formatVND(p.netSalary)}</strong></td>
        <td style="text-align:center;">${statusBadge}</td>
        <td style="text-align:right; white-space:nowrap;"><div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:8px;">
          <button type="button" class="secondary-button" data-action="preview-payslip" data-id="${p.id}" style="font-size:0.75rem; padding:0 10px; height:32px; display:inline-flex; align-items:center; gap:4px; border-radius:6px; cursor:pointer;"><i class="ri-eye-line"></i> Xem & Gửi</button>
          <button type="button" class="primary-button" data-action="send-single" data-id="${p.id}" style="font-size:0.75rem; padding:0 10px; height:32px; display:inline-flex; align-items:center; gap:4px; border-radius:6px; cursor:pointer;" ${!p.email || isBatchRunning ? 'disabled' : ''}><i class="ri-send-plane-fill"></i> Gửi</button>
        </div></td>
      </tr>`;
    }).join('')}</tbody></table>
    <p class="subtle" style="text-align:center; font-size:0.78rem; margin-top:8px;">Hiển thị ${rows.length} / ${inMemoryPayslips.length} nhân sự</p>`;
}

function renderPayslipsTable() {
  if (!inMemoryPayslips.length) return '';
  const readyToSendCount = inMemoryPayslips.filter((p) => p.status !== 'sent' && Boolean(p.email)).length;
  return `
    <section class="panel">
      <div class="section-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <h3 style="margin:0;">Danh Sách Phiếu Lương</h3>
          <span class="subtle" id="payslipsCountBadge">Hiển thị ${inMemoryPayslips.length} / ${inMemoryPayslips.length} nhân sự</span>
        </div>
        <button type="button" class="primary-button" id="btnQuickBatchHeader" style="font-size:0.85rem; font-weight:700; padding:7px 16px; display:inline-flex; align-items:center; gap:6px; background:linear-gradient(135deg, #0f766e, #059669); border-radius:6px; cursor:pointer;" ${readyToSendCount === 0 || isBatchRunning ? 'disabled' : ''}>
          <i class="ri-flashlight-fill" style="color:#fef08a;"></i> Gửi nhanh hàng loạt (${readyToSendCount})
        </button>
      </div>
      <div class="table-wrap">
        ${renderPayslipsTableInner()}
      </div>
    </section>
  `;
}



function renderPreviewModal() {
  if (!currentPreviewPayslip) {
    return `<div id="payrollPreviewModal" class="modal-backdrop" style="display:none !important;"></div>`;
  }

  const ps = currentPreviewPayslip;
  const payslipHtml = generatePayslipHtml(ps);

  return `
    <div id="payrollPreviewModal" class="modal-backdrop is-open" style="display:flex !important; position:fixed; inset:0; z-index:999999; background:rgba(15,23,42,0.6); backdrop-filter:blur(3px); align-items:center; justify-content:center;">
      <div style="background:#ffffff; border-radius:14px; width:92%; max-width:760px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 15px 35px rgba(0,0,0,0.3); overflow:hidden;">
        <!-- Modal header -->
        <div style="padding:16px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="margin:0; font-size:1.1rem; color:#0f172a;">
              Phiếu Lương: <strong>${escapeHTML(ps.name)}</strong> (${escapeHTML(ps.mnv)})
            </h3>
            <span class="subtle" style="font-size:0.8rem;">Kỳ lương: ${escapeHTML(ps.period)} • ${escapeHTML(ps.department)}</span>
          </div>
          <button type="button" id="btnClosePreviewModal" class="icon-button" style="border:none; font-size:1.3rem; cursor:pointer;">✕</button>
        </div>

        <!-- Recipient & Action banner -->
        <div style="padding:12px 20px; background:#f1f5f9; border-bottom:1px solid #cbd5e1; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:280px;">
            <label style="font-size:0.8rem; font-weight:600; color:#334155; white-space:nowrap;">Email nhận:</label>
            <input 
              type="email" 
              id="previewRecipientInput" 
              value="${escapeHTML(ps.email || '')}" 
              placeholder="Nhập email nhân sự..." 
              style="flex:1; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem;"
            />
          </div>

          <div class="pill-row">
            <button type="button" class="primary-button" id="btnSendFromPreview" style="padding:7px 16px;">
              <i class="ri-send-plane-fill"></i> Gửi phiếu này ngay
            </button>
          </div>
        </div>

        <!-- Payslip Document View -->
        <div style="flex:1; overflow-y:auto; padding:20px; background:#e2e8f0;">
          <div style="max-width:620px; margin:0 auto; box-shadow:0 4px 12px rgba(0,0,0,0.08); border-radius:10px; overflow:hidden;">
            ${payslipHtml}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ==========================================
// 2. LEGACY TAB RENDERER (APPLICATION & FEEDBACK)
// ==========================================

function renderLegacyPayrollView(state, employees, feedback, advances, attendance, scheduleAssignments) {
  const { searchTerm, settings } = state;
  const monthKey = todayISO().slice(0, 7);

  // Build Payroll Rows
  const payrollRows = employees.map((employee) => {
    const checkins = attendance.filter((record) => record.employee === employee.id && record.type === 'checkin' && String(record.date).startsWith(monthKey));
    const assignments = scheduleAssignments.filter((item) => item.employee === employee.id && String(item.date).startsWith(monthKey));
    const regularHours = checkins.length * 8;
    const overtimeMinutes = assignments.reduce((sum, item) => sum + Number(item.overtimeMinutes || 0) + Number(item.earlyArrivalMinutes || 0) - Number(item.earlyLeaveMinutes || 0), 0);
    const overtimeHours = Math.max(overtimeMinutes / 60, 0);
    const advanceTotal = advances
      .filter((item) => item.employee === employee.id && item.status === 'approved' && String(item.createdAt).slice(0, 7) === monthKey)
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

  const filteredRows = payrollRows.filter((row) => {
    if (!searchTerm) return true;
    return smartMatch([
      row.employee.name,
      row.employee.role,
      departmentName(row.employee.department),
      row.month,
      String(row.regularHours),
      String(row.overtimeHours),
      String(row.netPay),
    ].join(' '), searchTerm);
  });

  const filteredAdvances = advances.filter((item) => {
    if (!searchTerm) return true;
    const employee = employees.find((e) => e.id === item.employee);
    return smartMatch([
      employee?.name,
      item.type,
      String(item.amount),
      item.bankAccount,
      item.reason,
      item.status,
    ].join(' '), searchTerm);
  });

  const filteredFeedback = feedback.filter((item) => {
    if (!searchTerm) return true;
    const employee = employees.find((e) => e.id === item.employee);
    return smartMatch([
      employee?.name,
      item.month,
      item.text,
      item.status,
    ].join(' '), searchTerm);
  });

  const grossTotal = filteredRows.reduce((sum, row) => sum + row.netPay, 0);
  const monthlyCycleText = settings?.monthlyPayrollCycle || 'Từ ngày 1 đến hết ngày cuối tháng. Lương chuyển khoản trước ngày 5.';

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
        ${pill('Cấu hình mẫu')}
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
          ${pill('Đổ về PNS/KT')}
        </div>
        <form class="form-grid three" data-form="salary-advance" id="advanceForm">
          <div class="form-field">
            <label for="advanceEmployee">Nhân sự</label>
            <select id="advanceEmployee" name="employee">
              ${employees.map((emp) => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
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
          ${pill('Nhân sự xác nhận')}
        </div>
        <form class="form-grid" data-form="payroll-feedback" id="feedbackForm">
          <div class="form-field">
            <label for="payrollEmployee">Nhân sự</label>
            <select id="payrollEmployee" name="employee">
              ${employees.map((emp) => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
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
      ${filteredRows.length ? `
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
            <tbody>
              ${filteredRows.map((row) => `
                <tr>
                  <td><strong>${escapeHTML(row.employee.name)}</strong><br><span class="subtle">${escapeHTML(departmentName(row.employee.department))}</span></td>
                  <td>${row.days} ngày<br><span class="subtle">${row.regularHours} giờ công</span></td>
                  <td>${row.overtimeHours.toFixed(1)} giờ<br><span class="subtle">Tăng ca/đến sớm</span></td>
                  <td>${formatCurrency(row.hourlyRate)}</td>
                  <td>${formatCurrency(row.grossPay)}</td>
                  <td>${formatCurrency(row.advanceTotal)}</td>
                  <td><strong>${formatCurrency(row.netPay)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : emptyState()}
    </section>

    <div class="grid cols-2" style="margin-top:14px">
      <section class="panel">
        <div class="section-title">
          <h3>Đơn ứng lương / tiền mặt</h3>
          <span class="subtle">${filteredAdvances.length} đơn</span>
        </div>
        <div class="grid cols-2 animate-fade">
          ${filteredAdvances.length ? filteredAdvances.map((item) => {
            const employee = employees.find((e) => e.id === item.employee);
            return `
              <article class="request-card">
                <div class="section-title">
                  <h4>${escapeHTML(item.type || 'Ứng lương')}</h4>
                  ${statusPill(item.status === 'approved' ? 'Đã duyệt' : item.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt', statusTone(item.status))}
                </div>
                <div class="request-meta">
                  ${pill(employee?.name || 'Không rõ')}
                  ${pill(formatCurrency(item.amount))}
                  ${pill(item.routedTo === 'kt' ? 'Kế toán' : 'PNS')}
                </div>
                <p class="subtle">STK: ${escapeHTML(item.bankAccount || 'Chưa nhập')}</p>
                <p class="subtle">${escapeHTML(item.reason)}</p>
                <div class="request-actions">
                  <span class="subtle">${formatDateTime(item.createdAt)}</span>
                  ${item.status === 'pending' ? `
                    <div class="pill-row">
                      <button class="secondary-button" type="button" data-action="advance-approve" data-id="${escapeHTML(item.id)}"><i class="ri-check-line"></i> Duyệt</button>
                      <button class="danger-button" type="button" data-action="advance-reject" data-id="${escapeHTML(item.id)}"><i class="ri-close-line"></i> Từ chối</button>
                    </div>
                  ` : ''}
                </div>
              </article>
            `;
          }).join('') : emptyState()}
        </div>
      </section>
      <section class="panel">
        <div class="section-title">
          <h3>Phản hồi công lương</h3>
          <span class="subtle">${filteredFeedback.length} phản hồi</span>
        </div>
        <div class="grid animate-fade">
          ${filteredFeedback.length ? filteredFeedback.map((item) => {
            const employee = employees.find((e) => e.id === item.employee);
            return `
              <article class="mini-card" style="cursor: pointer;" data-action="feedback-toggle" data-id="${escapeHTML(item.id)}" data-status="${escapeHTML(item.status)}">
                <strong>${escapeHTML(employee?.name || 'Không rõ')} · ${escapeHTML(item.month)}</strong>
                <span>${escapeHTML(item.text)}</span>
                ${statusPill(item.status === 'resolved' ? 'Đã xử lý' : 'Đang mở', item.status === 'resolved' ? 'good' : 'warn')}
              </article>
            `;
          }).join('') : emptyState()}
        </div>
      </section>
    </div>
  `;
}

// ==========================================
// 3. MAIN VIEW RENDERER
// ==========================================

export async function renderView(state) {
  let feedback = [];
  let advances = [];
  let employees = cachedEmployees;
  let attendance = [];
  let scheduleAssignments = [];

  if (activeTab === 'legacy') {
    [feedback, advances, employees, attendance, scheduleAssignments] = await Promise.all([
      getPayrollFeedback(),
      getSalaryAdvances(),
      getEmployees(),
      getAttendance(),
      getScheduleAssignments(),
    ]);
    cachedEmployees = employees;
    cachedFeedback = feedback;
    cachedAdvances = advances;
  } else {
    if (!cachedEmployees.length) {
      try {
        cachedEmployees = await getEmployees();
      } catch (err) {
        console.warn('[Payroll] Failed to fetch employees cache:', err);
      }
    }
  }

  try {
    systemSmtpInfo = await getSystemSmtpStatus();
  } catch {
    systemSmtpInfo = null;
  }

  const tabBarHtml = `
    <div style="display:flex; border-bottom:1px solid #e2e8f0; margin-bottom:16px; gap:4px;">
      <button 
        type="button" 
        data-payroll-tab="dispatch"
        style="padding:10px 18px; border:none; background:none; cursor:pointer; font-weight:600; font-size:0.88rem; display:flex; align-items:center; gap:8px; border-bottom:2px solid ${activeTab === 'dispatch' ? '#0f766e' : 'transparent'}; color:${activeTab === 'dispatch' ? '#0f766e' : '#64748b'};"
      >
        <i class="ri-mail-send-line"></i> Đẩy Phiếu Lương Email (Bảo Mật · In-Memory)
      </button>
      <button 
        type="button" 
        data-payroll-tab="legacy"
        style="padding:10px 18px; border:none; background:none; cursor:pointer; font-weight:600; font-size:0.88rem; display:flex; align-items:center; gap:8px; border-bottom:2px solid ${activeTab === 'legacy' ? '#0f766e' : 'transparent'}; color:${activeTab === 'legacy' ? '#0f766e' : '#64748b'};"
      >
        <i class="ri-file-list-3-line"></i> Ứng Lương & Phản Hồi
      </button>
    </div>
  `;

  if (activeTab === 'dispatch') {
    return `
      ${tabBarHtml}
      ${renderDispatchHeader(systemSmtpInfo)}
      ${renderUploadBox()}
      ${renderDispatchControls()}
      ${renderFilterBar()}
      ${renderPayslipsTable()}
      ${renderPreviewModal()}
    `;
  }

  return `
    ${tabBarHtml}
    ${renderLegacyPayrollView(state, employees, feedback, advances, attendance, scheduleAssignments)}
  `;
}

// ==========================================
// 4. BATCH DISPATCH EXECUTION ENGINE
// ==========================================

/** Cập nhật trạng thái trực tiếp vào đúng 1 dòng <tr> trong bảng — KHÔNG vẽ lại toàn bộ table DOM */
function updateSingleRowStatus(ps) {
  const tr = document.querySelector(`tr[data-row-id="${ps.id}"]`);
  if (tr) {
    if (ps.status === 'sending') {
      tr.style.backgroundColor = '#f0f9ff';
    } else if (ps.status === 'sent') {
      tr.style.backgroundColor = '#f0fdf4';
    } else if (ps.status === 'failed') {
      tr.style.backgroundColor = '#fef2f2';
    } else {
      tr.style.backgroundColor = '';
    }
    // Cột trạng thái là cột thứ 6 (index 5)
    const tdStatus = tr.children[5];
    if (tdStatus) {
      if (ps.status === 'sending') {
        tdStatus.innerHTML = `<span class="pill" style="background:#e0f2fe; color:#0369a1;"><i class="ri-loader-4-line ri-spin"></i> Đang gửi...</span>`;
      } else if (ps.status === 'sent') {
        tdStatus.innerHTML = `<span class="pill good"><i class="ri-checkbox-circle-line"></i> Đã gửi</span>`;
      } else if (ps.status === 'failed') {
        tdStatus.innerHTML = `<span class="pill danger" title="${escapeHTML(ps.errorMsg || 'Lỗi gửi thư')}"><i class="ri-close-circle-line"></i> Lỗi</span>`;
      } else {
        tdStatus.innerHTML = `<span class="pill subtle">Chưa gửi</span>`;
      }
    }
    const btnSend = tr.querySelector('[data-action="send-single"]');
    if (btnSend) {
      btnSend.disabled = !ps.email || isBatchRunning || ps.status === 'sent';
    }
  }
  updateStatsAndProgress();
}

/** Cập nhật số liệu thống kê & thanh tiến trình — KHÔNG truy vấn DB hay render lại DOM */
function updateStatsAndProgress() {
  const total = inMemoryPayslips.length;
  const sentCount = inMemoryPayslips.filter((p) => p.status === 'sent').length;
  const pendingCount = inMemoryPayslips.filter((p) => p.status === 'pending').length;
  const failedCount = inMemoryPayslips.filter((p) => p.status === 'failed').length;
  const noEmailCount = inMemoryPayslips.filter((p) => !p.email).length;
  const readyToSendCount = inMemoryPayslips.filter((p) => p.status !== 'sent' && Boolean(p.email)).length;
  const pct = total > 0 ? Math.round((sentCount / total) * 100) : 0;

  const elTotal = document.getElementById('statTotal'); if (elTotal) elTotal.textContent = total;
  const elSent = document.getElementById('statSent'); if (elSent) elSent.textContent = sentCount;
  const elPending = document.getElementById('statPending'); if (elPending) elPending.textContent = pendingCount;
  const elFailed = document.getElementById('statFailed'); if (elFailed) elFailed.textContent = failedCount;
  const elNoEmail = document.getElementById('statNoEmail'); if (elNoEmail) elNoEmail.textContent = noEmailCount;

  const bar = document.getElementById('dispatchProgressBar');
  if (bar) bar.style.width = `${pct}%`;
  const progText = document.getElementById('dispatchProgressText');
  if (progText) {
    progText.innerHTML = batchStatusMessage ? escapeHTML(batchStatusMessage) : `Tiến độ gửi: <strong>${sentCount}/${total}</strong> (${pct}%)`;
  }

  const btnBatchHdr = document.getElementById('btnQuickBatchHeader');
  if (btnBatchHdr) {
    btnBatchHdr.disabled = isBatchRunning || readyToSendCount === 0;
    if (isBatchRunning) {
      btnBatchHdr.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Đang gửi (${sentCount}/${total})`;
    } else {
      btnBatchHdr.innerHTML = `<i class="ri-flashlight-fill" style="color:#fef08a;"></i> Gửi nhanh hàng loạt (${readyToSendCount})`;
    }
  }
}

/** Làm mới cụm nút thao tác hàng loạt và gán lại sự kiện */
function refreshBatchButtonsAndProgress() {
  const container = document.getElementById('batchActionButtons');
  if (container) {
    container.innerHTML = renderBatchActionButtonsHtml();
    bindBatchActionButtons();
  }
  updateStatsAndProgress();
}

/** Gửi phiếu đơn lẻ */
async function sendSinglePayslip(ps) {
  if (!ps || !ps.email || isBatchRunning) return;
  ps.status = 'sending';
  updateSingleRowStatus(ps);
  showToast(`Đang gửi phiếu lương cho ${ps.name}...`);

  try {
    const html = generatePayslipHtml(ps);
    const text = generatePayslipText(ps);
    const subject = `[Nha Khoa 5S] Phiếu Lương Tháng ${ps.period} - ${ps.name} (${ps.mnv})`;
    await sendPayslipEmail(null, {
      to: ps.email,
      subject,
      html,
      text,
    });

    ps.status = 'sent';
    ps.sentAt = new Date().toISOString();
    ps.errorMsg = '';
    showToast(`Đã gửi phiếu lương thành công cho ${ps.name}!`);
  } catch (err) {
    ps.status = 'failed';
    ps.errorMsg = err.message || 'Lỗi gửi thư';
    showToast(`Gửi thất bại: ${err.message}`, true);
  }
  updateSingleRowStatus(ps);
}

/** Động cơ gửi hàng loạt siêu tốc (Đa luồng song song 3 workers, cập nhật mượt 60fps) */
async function runBatchDispatch() {
  const queue = inMemoryPayslips.filter((p) => p.status !== 'sent' && Boolean(p.email));
  if (!queue.length) {
    showToast('Không có phiếu lương nào sẵn sàng để gửi.', true);
    return;
  }

  isBatchRunning = true;
  isBatchPaused = false;
  shouldCancelBatch = false;
  refreshBatchButtonsAndProgress();

  // Khóa các nút gửi đơn lẻ trong lúc gửi hàng loạt
  document.querySelectorAll('[data-action="send-single"]').forEach((b) => { b.disabled = true; });

  const concurrency = 3; // 3 kết nối SMTP song song — tối ưu tốc độ x3 và an toàn tuyệt đối với Google
  let completed = 0;
  const totalToRun = queue.length;
  let nextIdx = 0;

  async function worker(workerId) {
    while (nextIdx < queue.length) {
      if (shouldCancelBatch) break;
      while (isBatchPaused) {
        batchStatusMessage = 'Đang tạm dừng gửi...';
        updateStatsAndProgress();
        await new Promise((r) => setTimeout(r, 400));
        if (shouldCancelBatch) break;
      }
      if (shouldCancelBatch) break;

      const ps = queue[nextIdx++];
      if (!ps || ps.status === 'sent') continue;

      ps.status = 'sending';
      batchStatusMessage = `Đang gửi siêu tốc (${completed + 1}/${totalToRun}): ${ps.name} (${ps.mnv})...`;
      updateSingleRowStatus(ps);

      try {
        const html = generatePayslipHtml(ps);
        const text = generatePayslipText(ps);
        const subject = `[Nha Khoa 5S] Phiếu Lương Tháng ${ps.period} - ${ps.name} (${ps.mnv})`;
        await sendPayslipEmail(null, {
          to: ps.email,
          subject,
          html,
          text,
        });

        ps.status = 'sent';
        ps.sentAt = new Date().toISOString();
        ps.errorMsg = '';
      } catch (err) {
        ps.status = 'failed';
        ps.errorMsg = err.message || 'Lỗi gửi thư';
        console.error(`[Payroll Dispatch] Error sending to ${ps.mnv}:`, err);
      }

      completed++;
      updateSingleRowStatus(ps);

      // Nghỉ nhẹ 250ms giữa các email trên cùng 1 worker để máy chủ nhận xử lý mượt mà
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Khởi động các luồng song song với độ trễ so le 150ms
  const workers = [];
  for (let w = 0; w < Math.min(concurrency, queue.length); w++) {
    workers.push(worker(w));
    if (w < concurrency - 1) await new Promise((r) => setTimeout(r, 150));
  }

  await Promise.all(workers);

  isBatchRunning = false;
  isBatchPaused = false;
  const sentTotal = inMemoryPayslips.filter((p) => p.status === 'sent').length;
  const failTotal = inMemoryPayslips.filter((p) => p.status === 'failed').length;
  batchStatusMessage = shouldCancelBatch
    ? `Đã dừng gửi đợt phiếu (${sentTotal} đã gửi thành công).`
    : `Hoàn tất gửi đợt phiếu lương (${sentTotal} thành công${failTotal > 0 ? `, ${failTotal} lỗi` : ''}).`;
  showToast(batchStatusMessage, failTotal > 0);
  refreshBatchButtonsAndProgress();
  rerenderDispatchTable();
}

function closePreviewModal() {
  currentPreviewPayslip = null;
  store.notify();
}

/** Lọc nhanh trên RAM: cập nhật trực tiếp tbody + filter bar + controls mà KHÔNG gọi store.notify() / DB query */
function rerenderDispatchTable() {
  const tableWrap = document.querySelector('.table-wrap');
  if (tableWrap) tableWrap.innerHTML = renderPayslipsTableInner();
  bindDispatchTableActions();
  updateStatsAndProgress();

  // Update filter pill active states
  document.querySelectorAll('[data-action="filter-dept"]').forEach((b) => {
    const active = b.dataset.dept === deptFilter;
    b.style.borderColor = active ? '#0f766e' : '#e2e8f0';
    b.style.background = active ? '#0f766e' : '#ffffff';
    b.style.color = active ? '#ffffff' : '#334155';
  });
  document.querySelectorAll('[data-action="filter-status"]').forEach((b) => {
    const active = b.dataset.status === statusFilter;
    b.style.borderColor = active ? '#1e293b' : '#e2e8f0';
    b.style.background = active ? '#1e293b' : '#ffffff';
    b.style.color = active ? '#ffffff' : '#334155';
  });
}

/** Bind action buttons inside the payslips table (called after table re-render) */
function bindDispatchTableActions() {
  document.querySelectorAll('[data-action="quick-edit-email"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const ps = inMemoryPayslips.find((p) => p.id === id);
      if (!ps) return;
      const newEmail = await requestInput(
        `Nhập địa chỉ email nhận phiếu lương cho nhân sự: ${ps.name} (${ps.mnv})`,
        { title: 'Cập nhật email nhận phiếu', confirmText: 'Lưu Email', cancelText: 'Hủy', input: { placeholder: 'example@nhakhoa5s.vn', maxLength: 100 } }
      );
      if (newEmail && newEmail.includes('@')) {
        ps.email = newEmail.trim();
        showToast(`Đã lưu email cho ${ps.name}: ${ps.email}`);
        rerenderDispatchTable();
      } else if (newEmail) {
        showToast('Email không đúng định dạng.', true);
      }
    });
  });

  document.querySelectorAll('[data-action="preview-payslip"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ps = inMemoryPayslips.find((p) => p.id === btn.dataset.id);
      if (ps) { currentPreviewPayslip = ps; store.notify(); }
    });
  });

  document.querySelectorAll('[data-action="send-single"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ps = inMemoryPayslips.find((p) => p.id === btn.dataset.id);
      if (!ps || !ps.email || isBatchRunning) return;
      await sendSinglePayslip(ps);
    });
  });
}

/** Gán sự kiện cho các nút điều khiển gửi hàng loạt */
function bindBatchActionButtons() {
  document.getElementById('btnStartBatch')?.addEventListener('click', () => {
    runBatchDispatch();
  });
  document.getElementById('btnQuickBatchHeader')?.addEventListener('click', () => {
    runBatchDispatch();
  });
  document.getElementById('btnTestSendAdminIt')?.addEventListener('click', () => {
    let ps = inMemoryPayslips.find((p) => p.mnv === 'HC002' || (p.name && p.name.includes('Đào Thái Bảo'))) || inMemoryPayslips[0];
    if (ps) {
      if (!ps.email) ps.email = 'thaibaoleo123@gmail.com';
      currentPreviewPayslip = ps;
      showToast(`Đã mở phiếu lương kiểm thử cho Admin-IT (${ps.name})`);
      store.notify();
    } else {
      showToast('Chưa có dữ liệu bảng lương. Vui lòng chọn hoặc kéo thả file Excel trước.', true);
    }
  });
  document.getElementById('btnPauseBatch')?.addEventListener('click', () => {
    isBatchPaused = true;
    batchStatusMessage = 'Đang tạm dừng gửi...';
    refreshBatchButtonsAndProgress();
  });
  document.getElementById('btnResumeBatch')?.addEventListener('click', () => {
    isBatchPaused = false;
    batchStatusMessage = 'Đang tiếp tục gửi...';
    refreshBatchButtonsAndProgress();
  });
  document.getElementById('btnCancelBatch')?.addEventListener('click', () => {
    shouldCancelBatch = true;
    batchStatusMessage = 'Đang dừng quá trình gửi...';
    refreshBatchButtonsAndProgress();
  });
}

// ==========================================
// 5. VIEW EVENT LISTENERS & INITIALIZATION
// ==========================================

export function initView() {
  // Tab Switching
  document.querySelectorAll('[data-payroll-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.payrollTab;
      store.notify();
    });
  });

  if (activeTab === 'dispatch') {
    initDispatchEvents();
  } else {
    initLegacyEvents();
  }
}

function initDispatchEvents() {
  // File Upload handling
  const fileInput = document.getElementById('payrollExcelInput');
  const btnBrowse = document.getElementById('btnBrowseFile');
  const dropZone = document.getElementById('uploadDropZone');

  btnBrowse?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
  });

  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#0f766e';
      dropZone.style.background = '#f0fdf4';
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#cbd5e1';
      dropZone.style.background = '#f8fafc';
    });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#cbd5e1';
      dropZone.style.background = '#f8fafc';
      const file = e.dataTransfer?.files?.[0];
      if (file) await processUploadedFile(file);
    });
  }

  async function processUploadedFile(file) {
    try {
      showToast('Đang đọc và bóc tách bảng lương...');
      const arrayBuffer = await file.arrayBuffer();
      const result = await parsePayrollWorkbook(arrayBuffer, cachedEmployees);

      inMemoryPayslips = result.payslips;
      inMemoryPeriod = result.period;
      inMemoryFileName = file.name;

      showToast(`Đã nạp thành công ${result.count} phiếu lương kỳ ${result.period}.`);
      store.notify();
    } catch (err) {
      console.error('[Payroll Dispatch] File parse error:', err);
      showToast(`Lỗi đọc file: ${err.message}`, true);
    }
  }

  // Clear session / wipe RAM
  document.getElementById('btnClearSession')?.addEventListener('click', async () => {
    const ok = await confirmAction(
      'Bạn có chắc chắn muốn xóa sạch toàn bộ dữ liệu phiên làm việc này? Dữ liệu bảng lương trong RAM sẽ được giải phóng ngay lập tức và không còn dấu vết.',
      { title: 'Xóa dấu vết phiên làm việc', confirmText: 'Xóa sạch RAM', tone: 'danger' }
    );
    if (ok) {
      inMemoryPayslips = [];
      inMemoryPeriod = '';
      inMemoryFileName = '';
      searchFilter = '';
      deptFilter = 'all';
      statusFilter = 'all';
      showToast('Đã dọn sạch dữ liệu trong phiên làm việc.');
      store.notify();
    }
  });

  // Batch control buttons
  bindBatchActionButtons();

  // Fast Search Input — DOM filtering only, zero DB calls
  const searchInput = document.getElementById('payslipSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchFilter = e.target.value;
      rerenderDispatchTable();
    });
  }

  // Filter pills — DOM filtering only, zero DB calls
  document.querySelectorAll('[data-action="filter-dept"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      deptFilter = btn.dataset.dept;
      rerenderDispatchTable();
    });
  });

  document.querySelectorAll('[data-action="filter-status"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      statusFilter = btn.dataset.status;
      rerenderDispatchTable();
    });
  });

  // Table row actions
  bindDispatchTableActions();

  // Preview Payslip Modal controls
  document.getElementById('btnClosePreviewModal')?.addEventListener('click', closePreviewModal);

  // Send single payslip from preview modal
  document.getElementById('btnSendFromPreview')?.addEventListener('click', async () => {
    if (!currentPreviewPayslip) return;
    const ps = currentPreviewPayslip;
    const recipientInput = document.getElementById('previewRecipientInput');
    const targetEmail = recipientInput?.value?.trim() || ps.email;

    if (!targetEmail || !targetEmail.includes('@')) {
      showToast('Vui lòng nhập địa chỉ email người nhận hợp lệ.', true);
      return;
    }
    ps.email = targetEmail;

    const btn = document.getElementById('btnSendFromPreview');
    if (btn) btn.disabled = true;
    showToast(`Đang gửi phiếu lương cho ${ps.name}...`);

    try {
      const html = generatePayslipHtml(ps);
      const text = generatePayslipText(ps);
      const subject = `[Nha Khoa 5S] Phiếu Lương Tháng ${ps.period} - ${ps.name} (${ps.mnv})`;
      await sendPayslipEmail(null, {
        to: targetEmail,
        subject,
        html,
        text,
      });

      ps.status = 'sent';
      ps.sentAt = new Date().toISOString();
      ps.errorMsg = '';
      showToast(`Đã gửi phiếu lương thành công cho ${ps.name}!`);
      closePreviewModal();
      rerenderDispatchTable();
    } catch (err) {
      ps.status = 'failed';
      ps.errorMsg = err.message || 'Lỗi gửi thư';
      showToast(`Gửi thất bại: ${err.message}`, true);
      if (btn) btn.disabled = false;
      rerenderDispatchTable();
    }
  });
}

function initLegacyEvents() {
  const advanceForm = document.getElementById('advanceForm');
  if (advanceForm) {
    advanceForm.addEventListener('submit', async (e) => {
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
          status: 'pending',
          reviewer: 'e-001',
          routedTo: data.type === 'Duyệt tiền mặt' ? 'kt' : 'ns',
        });

        showToast('Đã gửi yêu cầu ứng lương/tiền mặt.');
        advanceForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Payroll View] createLeaveRequest (advance) failed:', err);
        showToast('Lỗi gửi yêu cầu ứng lương.', true);
      }
    });
  }

  const feedbackForm = document.getElementById('feedbackForm');
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(feedbackForm);
      const data = Object.fromEntries(formData.entries());

      try {
        await createPayrollFeedback({
          employee: data.employee,
          month: data.month || todayISO().slice(0, 7),
          text: data.text.trim(),
          status: 'open',
        });

        showToast('Đã gửi phản hồi lương.');
        feedbackForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Payroll View] createPayrollFeedback failed:', err);
        showToast('Lỗi gửi phản hồi.', true);
      }
    });
  }

  document.querySelectorAll("[data-action='advance-approve']").forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        await updateLeaveRequest(id, { status: 'approved' });
        showToast('Đã duyệt yêu cầu ứng lương.');
        store.notify();
      } catch (err) {
        console.error('[Payroll View] updateLeaveRequest (approve) failed:', err);
        showToast('Lỗi khi duyệt yêu cầu.', true);
      }
    });
  });

  document.querySelectorAll("[data-action='advance-reject']").forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        await updateLeaveRequest(id, { status: 'rejected' });
        showToast('Đã từ chối yêu cầu ứng lương.');
        store.notify();
      } catch (err) {
        console.error('[Payroll View] updateLeaveRequest (reject) failed:', err);
        showToast('Lỗi khi từ chối yêu cầu.', true);
      }
    });
  });

  document.querySelectorAll("[data-action='feedback-toggle']").forEach((card) => {
    card.addEventListener('click', async () => {
      const id = card.dataset.id;
      const currentStatus = card.dataset.status;
      const nextStatus = currentStatus === 'resolved' ? 'open' : 'resolved';
      try {
        await updatePayrollFeedback(id, { status: nextStatus });
        showToast(nextStatus === 'resolved' ? 'Đã đánh dấu xử lý phản hồi.' : 'Đã mở lại phản hồi.');
        store.notify();
      } catch (err) {
        console.error('[Payroll View] updatePayrollFeedback failed:', err);
        showToast('Lỗi cập nhật phản hồi.', true);
      }
    });
  });
}
