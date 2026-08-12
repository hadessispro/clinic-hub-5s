import { getMarketingLeads, createMarketingLead, updateMarketingLead, deleteMarketingLead, distributeRawLeads, exportLeadsToCSV, getTelesaleAccounts } from '../services/marketing.js';
import { getEmployees } from '../services/employees.js';
import { LEAD_STATUS, MARKETING_SOURCES } from '../constants.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/app-dialog.js';
import { canExportData } from '../permissions.js';
import { store } from '../store.js';
import { navigateTo } from '../router.js';

let cachedLeads = [];
let cachedEmployees = [];
let activeViewMode = 'kanban'; // 'kanban' | 'table'
let activeDataClassFilter = '';

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const isPgStaff = profile.role === 'pg_staff';
  const isSupportMkt = profile.role === 'support_marketing';
  const showIntakeForm = isPgStaff;
  const isLeadManager = ['admin', 'admin_marketing', 'telesale_leader'].includes(profile.role);
  const allowExport = canExportData(profile.role);

  const [leads, employees, telesaleAccounts] = await Promise.all([
    getMarketingLeads(),
    isLeadManager ? getEmployees() : Promise.resolve([]),
    isLeadManager ? getTelesaleAccounts() : Promise.resolve([]),
  ]);

  cachedLeads = leads;
  cachedEmployees = employees;

  const telesaleEmployees = telesaleAccounts.filter((employee) => employee.role === 'telesale_staff' && employee.active !== false);

  // Group leads for Kanban columns
  const kanbanColumns = [
    { key: 'new', title: 'Mới nạp', icon: 'ri-user-add-line', badgeBg: '#e0f2fe', badgeColor: '#0369a1' },
    { key: 'contacted', title: 'Đã liên hệ', icon: 'ri-phone-line', badgeBg: '#fef3c7', badgeColor: '#b45309' },
    { key: 'appointment_booked', title: 'Đã hẹn khám', icon: 'ri-calendar-check-line', badgeBg: '#dcfce7', badgeColor: '#15803d' },
    { key: 'visited', title: 'Đã đến khám', icon: 'ri-hospital-line', badgeBg: '#ccfbf1', badgeColor: '#0f766e' },
    { key: 'converted', title: 'Chốt thành công', icon: 'ri-award-line', badgeBg: '#f3e8ff', badgeColor: '#6b21a8' },
    { key: 'cancelled', title: 'Hủy / Thất bại', icon: 'ri-close-circle-line', badgeBg: '#fee2e2', badgeColor: '#b91c1c' },
  ];

  const kanbanHtml = `
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap:14px; margin-top:14px; align-items:start;">
      ${kanbanColumns.map(col => {
        const colLeads = leads.filter(l => (l.status || 'new') === col.key);
        return `
          <div class="kanban-drop-zone" data-status-key="${col.key}" style="background:#f8fafc; border:2px dashed #cbd5e1; border-radius:12px; padding:12px; transition: background 0.2s, border-color 0.2s;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; padding-bottom:8px; border-bottom:2px solid #e2e8f0;">
              <span style="font-size:0.88rem; font-weight:700; color:#1e293b; display:inline-flex; align-items:center; gap:6px;">
                <i class="${col.icon}" style="color:${col.badgeColor}; font-size:1.05rem;"></i>
                ${col.title}
              </span>
              <span class="kanban-col-count" style="padding:2px 8px; background:${col.badgeBg}; color:${col.badgeColor}; font-size:0.78rem; font-weight:700; border-radius:12px;">${colLeads.length}</span>
            </div>

            <div class="kanban-card-list" style="display:flex; flex-direction:column; gap:10px; min-height:120px;">
              ${colLeads.length ? colLeads.map(lead => {
                const assignedEmp = employees.find(e => e.id === lead.assigned_telesale_id || e.employee_code === lead.assigned_telesale_id);
                return `
                  <article class="kanban-card lead-kanban-card is-collapsed" draggable="true" id="kanban-card-${lead.id}" data-id="${lead.id}" data-name="${escapeHTML(lead.full_name).toLowerCase()}" data-phone="${escapeHTML(lead.phone || '')}" data-source="${escapeHTML(lead.source || '')}" data-branch="${escapeHTML(lead.branch_id || '')}" data-class="${escapeHTML(lead.data_class || 'raw')}" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.04); position:relative; overflow:hidden;">
                    <!-- Top Info Section -->
                    <div class="card-header">
                      <h4 style="margin:0; font-size:0.95rem; font-weight:700; color:#0f172a; line-height:1.2;">${escapeHTML(lead.full_name)}</h4>
                      <div class="card-header-actions">
                        <button type="button" class="btn-card-action" data-toggle-card="${lead.id}" title="Thu gọn / Mở rộng">
                          <i class="ri-arrow-down-s-line" id="toggle-icon-${lead.id}"></i>
                        </button>
                        <button type="button" class="btn-card-action btn-delete" data-delete-lead="${lead.id}" title="Xóa Lead">
                          <i class="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </div>

                    <!-- Collapsible Card Body -->
                    <div id="card-body-${lead.id}" style="display:none">
                      <p style="font-size:0.85rem; font-weight:700; color:#0284c7; margin:0 0 6px; display:flex; align-items:center; gap:4px;">
                        <i class="ri-phone-fill" style="font-size:0.9rem;"></i> ${escapeHTML(lead.phone)}
                      </p>

                      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
                        <span style="padding:2px 8px; background:#e0f2fe; color:#0369a1; font-size:0.72rem; font-weight:700; border-radius:6px;">${escapeHTML(lead.source)}</span>
                        <span style="padding:2px 8px; background:${lead.data_class === 'net' ? '#dcfce7' : '#fef3c7'}; color:${lead.data_class === 'net' ? '#166534' : '#92400e'}; font-size:0.72rem; font-weight:700; border-radius:6px;">${lead.data_class === 'net' ? `Net ${lead.net_level === 'advanced' ? 'chuyên sâu' : 'cơ bản'}` : 'Data thô'}</span>
                        <span style="padding:2px 8px; background:#f1f5f9; color:#475569; font-size:0.72rem; font-weight:600; border-radius:6px;">${escapeHTML(lead.service_interest)}</span>
                      </div>

                      <p style="font-size:0.78rem; color:#64748b; margin:0 0 10px;"><strong>Ghi chú:</strong> ${escapeHTML(lead.notes || 'Không có')}</p>

                      <!-- Bottom Section: Dropdowns Footer -->
                      <div style="background:#f8fafc; border-top:1px solid #e2e8f0; margin:-4px -12px -12px -12px; padding:10px 12px; border-radius:0 0 12px 12px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                          <span style="font-size:0.75rem; font-weight:600; color:#475569; width:65px; shrink:0;">Telesale:</span>
                          <select class="select-badge" data-assign-lead data-id="${escapeHTML(lead.id)}" ${lead.data_class === 'raw' ? 'disabled title="Data thô được hệ thống chia đều tự động"' : ''} style="flex:1; width:100%; max-width:100% !important; height:32px;">
                            <option value="">${lead.data_class === 'raw' ? 'Chia tự động' : 'Chưa phân bổ'}</option>
                            ${telesaleEmployees.map(e => option(e.employee_code || e.id, `${e.name}`, lead.assigned_telesale_id === e.employee_code || lead.assigned_telesale_id === e.id)).join('')}
                          </select>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                          <span style="font-size:0.75rem; font-weight:600; color:#475569; width:65px; shrink:0;">Trạng thái:</span>
                          <select class="select-badge" data-change-status data-id="${escapeHTML(lead.id)}" style="flex:1; width:100%; max-width:100% !important; height:32px;">
                            ${Object.keys(LEAD_STATUS).map(st => option(st, LEAD_STATUS[st], lead.status === st)).join('')}
                          </select>
                        </div>
                      </div>
                    </div>
                  </article>
                `;
              }).join('') : `<div class="empty-kanban-msg" style="text-align:center; padding:16px; color:#94a3b8; font-size:0.8rem;">Kéo thả Lead vào đây</div>`}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const tableRowsHtml = leads.length
    ? leads.map((lead, idx) => {
        const assignedEmp = employees.find(e => e.id === lead.assigned_telesale_id || e.employee_code === lead.assigned_telesale_id);
        return `
          <tr id="table-row-${lead.id}" class="lead-table-row" data-name="${escapeHTML(lead.full_name).toLowerCase()}" data-phone="${escapeHTML(lead.phone)}" data-source="${escapeHTML(lead.source)}" data-branch="${escapeHTML(lead.branch_id)}" data-class="${escapeHTML(lead.data_class || 'raw')}">
            <td style="text-align:center; color:#64748b; font-size:0.82rem;">${idx + 1}</td>
            <td style="font-weight:600; color:#0f172a;">${escapeHTML(lead.full_name)}</td>
            <td style="font-weight:600; color:#0284c7;">${escapeHTML(lead.phone)}</td>
            <td><span style="padding:2px 8px; background:#f1f5f9; border-radius:6px; font-weight:600; font-size:0.78rem;">${escapeHTML(lead.source)}</span></td>
            <td style="color:#334155;">${escapeHTML(lead.service_interest)}</td>
            <td style="color:#334155;">${lead.branch_id === 'le-van-tho' ? '5S Lê Văn Thọ' : '5S Phạm Văn Chiêu'}</td>
            <td>
              <select class="select-badge" data-assign-lead data-id="${escapeHTML(lead.id)}" ${lead.data_class === 'raw' ? 'disabled title="Data thô được hệ thống chia đều tự động"' : ''}>
                <option value="">${lead.data_class === 'raw' ? 'Chia tự động' : 'Chưa gán'}</option>
                ${telesaleEmployees.map(e => option(e.employee_code || e.id, `${e.employee_code || e.id} · ${e.name}`, lead.assigned_telesale_id === e.employee_code || lead.assigned_telesale_id === e.id)).join('')}
              </select>
            </td>
            <td>
              <select class="select-badge" data-change-status data-id="${escapeHTML(lead.id)}">
                ${Object.keys(LEAD_STATUS).map(st => option(st, LEAD_STATUS[st], lead.status === st)).join('')}
              </select>
            </td>
            <td style="color:#64748b; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(lead.notes || 'Không có')}</td>
            <td style="color:#94a3b8; text-align:right;">
              <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px;">
                <span style="font-size:0.78rem;">${formatDateTime(lead.created_at)}</span>
                <button type="button" data-delete-lead="${lead.id}" title="Xóa Lead" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.95rem;">
                  <i class="ri-delete-bin-line"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="10" style="text-align:center; padding:20px; color:#94a3b8;">Chưa có dữ liệu Lead</td></tr>`;

  const spreadsheetTableHtml = `
    <div style="overflow-x:auto; background:#ffffff; border:1px solid #cbd5e1; border-radius:12px; margin-top:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <table class="spreadsheet-table">
        <thead>
          <tr>
            <th style="text-align:center; width:50px;">STT</th>
            <th>Họ tên khách</th>
            <th>Số điện thoại</th>
            <th>Nguồn Ads</th>
            <th>Dịch vụ quan tâm</th>
            <th>Chi nhánh</th>
            <th>Telesale gán</th>
            <th>Trạng thái</th>
            <th>Ghi chú</th>
            <th style="text-align:right;">Hành động</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  `;

  const defaultSource = isPgStaff ? 'PG Field Intake' : 'Facebook Ads';
  const sourceOptionsHtml = MARKETING_SOURCES.map(s => option(s, s, s === defaultSource)).join('');
  const telesaleOptionsHtml = telesaleEmployees.map(e => option(e.employee_code || e.id, `${e.name}`)).join('');

  const pgSubmissionRows = leads.length
    ? leads.slice(0, 50).map((lead) => `<tr>
        <td><strong>${escapeHTML(lead.full_name)}</strong><br><span class="subtle">${escapeHTML(lead.phone || 'Không có SĐT')}</span></td>
        <td>${lead.data_class === 'net' ? `Data net ${lead.net_level === 'advanced' ? 'chuyên sâu' : 'cơ bản'}` : 'Data thô'}</td>
        <td>${escapeHTML(lead.service_interest || 'Khám tổng quát')}</td>
        <td>${lead.appointment_at ? formatDateTime(lead.appointment_at) : 'Chưa có lịch hẹn'}</td>
        <td>${statusPill(LEAD_STATUS[lead.status] || lead.status, lead.status === 'cancelled' ? 'rejected' : lead.status === 'converted' ? 'approved' : 'pending')}</td>
      </tr>`).join('')
    : '<tr><td colspan="5">Bạn chưa nhập dữ liệu khách hàng nào.</td></tr>';

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Marketing & Field Lead Intake</p>
        <h3>${isPgStaff ? 'Giao diện Nhân viên PG: Nạp dữ liệu khách hàng thị trường cho đội Telesale' : 'Quản trị Khách hàng Tiềm năng, phân bổ Telesale & theo dõi danh sách Lead.'}</h3>
      </div>
    </div>

    ${showIntakeForm ? `
      <section class="panel">
        <div class="section-title">
          <h3>+ Nạp Data Khách Hàng (Support Marketing / PG)</h3>
          ${pill(isPgStaff ? "Nạp trực tiếp từ thị trường" : "Nạp từ Ads / Hotline")}
        </div>
        <form class="form-grid three" id="createLeadForm">
          <div class="form-field">
            <label for="leadDataClass">Phân loại data</label>
            <select id="leadDataClass" name="data_class" required><option value="raw">Data thô</option><option value="net">Data net</option></select>
          </div>
          <div class="form-field" id="leadNetLevelField" hidden>
            <label for="leadNetLevel">Cấp độ data net</label>
            <select id="leadNetLevel" name="net_level"><option value="basic">Net cơ bản</option><option value="advanced">Net chuyên sâu</option></select>
          </div>
          <div class="form-field" id="leadAppointmentField" hidden>
            <label for="leadAppointment">Lịch hẹn</label>
            <input id="leadAppointment" name="appointment_at" type="datetime-local">
          </div>
          <div class="form-field">
            <label for="leadName">Họ tên khách hàng</label>
            <input id="leadName" name="full_name" required placeholder="VD: Nguyễn Văn A" />
          </div>
          <div class="form-field">
            <label for="leadPhone">Số điện thoại</label>
            <input id="leadPhone" name="phone" required placeholder="090..." type="tel" />
          </div>
          <div class="form-field">
            <label for="leadSource">Nguồn tiếp nhận</label>
            <select id="leadSource" name="source">${sourceOptionsHtml}</select>
          </div>
          <div class="form-field">
            <label for="leadBranch">Chi nhánh đăng ký</label>
            <select id="leadBranch" name="branch_id">
              <option value="le-van-tho">5S Lê Văn Thọ</option>
              <option value="pham-van-chieu">5S Phạm Văn Chiêu</option>
            </select>
          </div>
          <div class="form-field">
            <label for="leadService">Dịch vụ quan tâm</label>
            <input id="leadService" name="service_interest" placeholder="VD: Trồng răng Implant, Niềng răng" />
          </div>
          <div class="form-field full">
            <label for="leadNotes">Ghi chú nhu cầu</label>
            <textarea id="leadNotes" name="notes" placeholder="Yêu cầu tư vấn, tình trạng răng miệng, thời gian thích hợp gọi lại..."></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Nạp Lead vào hệ thống</button>
          </div>
        </form>
      </section>
      <section class="panel" style="margin-top:14px">
        <div class="section-title"><div><h3>Dữ liệu tôi đã nhập</h3><p class="subtle">Tối đa 50 bản ghi gần nhất · chỉ hiển thị dữ liệu của tài khoản hiện tại</p></div><span class="pill">${leads.length} bản ghi</span></div>
        <div class="table-wrap"><table><thead><tr><th>Khách hàng</th><th>Phân loại</th><th>Dịch vụ</th><th>Lịch hẹn</th><th>Trạng thái</th></tr></thead><tbody>${pgSubmissionRows}</tbody></table></div>
      </section>
    ` : ''}

    <!-- Lead Pipeline & Spreadsheet Management Section -->
    <section class="panel" style="margin-top:14px;${isPgStaff ? 'display:none;' : ''}">
      <div class="marketing-pipeline-header">
        <div class="marketing-pipeline-heading">
          <h3 style="margin:0; font-size:1.1rem; font-weight:700;">Tổng quan Lead Marketing & Tiến độ Telesale (${leads.length})</h3>
          <span style="font-size:0.8rem; color:#64748b;">Kéo thả thẻ Kanban hoặc chuyển chế độ Bảng tính Google Sheets</span>
        </div>
        
        <div class="marketing-pipeline-actions">
          <!-- View Switcher -->
          <div class="marketing-view-switcher" role="group" aria-label="Chế độ hiển thị">
            <button type="button" id="viewModeKanban" class="view-switch-btn ${activeViewMode === 'kanban' ? 'active' : ''}" style="padding:5px 12px; font-size:0.8rem; font-weight:600; border:0; border-radius:6px; cursor:pointer; background:${activeViewMode === 'kanban' ? '#ffffff' : 'transparent'}; color:${activeViewMode === 'kanban' ? '#0f172a' : '#64748b'}; box-shadow:${activeViewMode === 'kanban' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'};">
              <i class="ri-layout-column-line"></i> Pipeline Kanban
            </button>
            <button type="button" id="viewModeTable" class="view-switch-btn ${activeViewMode === 'table' ? 'active' : ''}" style="padding:5px 12px; font-size:0.8rem; font-weight:600; border:0; border-radius:6px; cursor:pointer; background:${activeViewMode === 'table' ? '#ffffff' : 'transparent'}; color:${activeViewMode === 'table' ? '#0f172a' : '#64748b'}; box-shadow:${activeViewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'};">
              <i class="ri-table-line"></i> Google Sheets / Bảng
            </button>
          </div>

          <!-- Export Excel CSV Button for Admin/Leaders -->
          ${allowExport ? `
            <button type="button" id="btnExportCSV" class="primary-button marketing-export-button">
              <i class="ri-file-excel-2-line" style="font-size:1.05rem;"></i> Xuất Data Excel (CSV)
            </button>
          ` : ''}
        </div>
      </div>

      ${isLeadManager ? `
        <div class="lead-distribution-mode" aria-label="Phân loại và phân bổ Lead">
          <div class="lead-distribution-tabs">
            <button type="button" class="lead-data-filter ${activeDataClassFilter === 'net' ? 'is-active' : ''}" data-lead-class-filter="net">
              <i class="ri-user-star-line"></i><span><strong>Chia Data net</strong><small>${leads.filter((lead) => lead.data_class === 'net').length} Lead · gán trực tiếp</small></span>
            </button>
            <button type="button" class="lead-data-filter ${activeDataClassFilter === 'raw' ? 'is-active' : ''}" data-lead-class-filter="raw">
              <i class="ri-shuffle-line"></i><span><strong>Chia Data thô</strong><small>${leads.filter((lead) => lead.data_class !== 'net').length} Lead · chia ngẫu nhiên đều</small></span>
            </button>
            <button type="button" class="lead-data-filter-reset" id="clearLeadClassFilter" ${activeDataClassFilter ? '' : 'hidden'}>Xem tất cả</button>
          </div>
          <div class="lead-distribution-guidance" id="netDistributionGuidance" ${activeDataClassFilter === 'net' ? '' : 'hidden'}>
            <i class="ri-information-line"></i><span>Chọn Telesale tại từng dòng Data net. Mỗi Telesale vẫn có thể nhận đồng thời Data thô.</span>
          </div>
          <div class="raw-distribution-control" id="rawDistributionControl" ${activeDataClassFilter === 'raw' ? '' : 'hidden'}>
            <label for="rawDistributionQuantity">Số Data thô cần chia</label>
            <div><input id="rawDistributionQuantity" type="number" min="1" max="5000" value="20" inputmode="numeric" aria-label="Số lượng data thô"><button type="button" id="distributeRawLeads" class="secondary-button"><i class="ri-shuffle-line"></i><span>Phân bổ ngẫu nhiên, chia đều</span></button></div>
          </div>
        </div>
      ` : ''}

      <!-- Advanced Filter Toolbar -->
      <div class="marketing-filter-toolbar">
        <div style="flex:1; min-width:220px; display:flex; align-items:center;">
          <input id="searchLeadInput" placeholder="🔍 Tìm theo Tên hoặc Số điện thoại..." style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none;" />
        </div>
        <div style="min-width:160px; display:flex; align-items:center;">
          <select id="filterBranchSelect" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none; cursor:pointer; font-weight:600;">
            <option value="">Tất cả Chi nhánh</option>
            <option value="le-van-tho">5S Lê Văn Thọ</option>
            <option value="pham-van-chieu">5S Phạm Văn Chiêu</option>
          </select>
        </div>
        <div style="min-width:160px; display:flex; align-items:center;">
          <select id="filterSourceSelect" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none; cursor:pointer; font-weight:600;">
            <option value="">Tất cả Nguồn Ads</option>
            ${MARKETING_SOURCES.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- View Containers -->
      <div id="kanbanContainer" style="display:${activeViewMode === 'kanban' ? 'block' : 'none'};">
        ${kanbanHtml}
      </div>

      <div id="tableContainer" style="display:${activeViewMode === 'table' ? 'block' : 'none'};">
        ${spreadsheetTableHtml}
      </div>
    </section>
  `;
}

export function initView() {
  const dataClass = document.getElementById('leadDataClass');
  const netLevelField = document.getElementById('leadNetLevelField');
  const appointmentField = document.getElementById('leadAppointmentField');
  const netLevel = document.getElementById('leadNetLevel');
  const appointment = document.getElementById('leadAppointment');
  const toggleNetFields = () => {
    const isNet = dataClass?.value === 'net';
    if (netLevelField) netLevelField.hidden = !isNet;
    if (appointmentField) appointmentField.hidden = !isNet;
    if (netLevel) netLevel.required = isNet;
    if (appointment) appointment.required = isNet;
  };
  dataClass?.addEventListener('change', toggleNetFields);
  toggleNetFields();

  document.getElementById('distributeRawLeads')?.addEventListener('click', async () => {
    try {
      const quantity = Number(document.getElementById('rawDistributionQuantity')?.value || 0);
      const result = await distributeRawLeads(quantity);
      showToast(`Đã chia đều ${result.distributed} data thô.`);
      await navigateTo('marketing-leads');
    } catch (error) { showToast(error.message, true); }
  });

  const form = document.getElementById('createLeadForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      try {
        showToast("Đang tạo Lead mới...");
        const newLead = await createMarketingLead(data);
        showToast("✅ Đã thêm Lead mới thành công!");
        form.reset();
        if (newLead) {
          cachedLeads.unshift(newLead);
        }
      } catch (err) {
        showToast("Lỗi khi thêm Lead: " + err.message, true);
      }
    });
  }

  // View Switcher logic
  const btnKanban = document.getElementById('viewModeKanban');
  const btnTable = document.getElementById('viewModeTable');
  const kanbanContainer = document.getElementById('kanbanContainer');
  const tableContainer = document.getElementById('tableContainer');

  function activateTableView() {
    activeViewMode = 'table';
    if (kanbanContainer) kanbanContainer.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    if (btnTable) {
      btnTable.style.background = '#ffffff'; btnTable.style.color = '#0f172a'; btnTable.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
    }
    if (btnKanban) {
      btnKanban.style.background = 'transparent'; btnKanban.style.color = '#64748b'; btnKanban.style.boxShadow = 'none';
    }
  }

  if (btnKanban && btnTable && kanbanContainer && tableContainer) {
    btnKanban.addEventListener('click', () => {
      activeViewMode = 'kanban';
      kanbanContainer.style.display = 'block';
      tableContainer.style.display = 'none';
      btnKanban.style.background = '#ffffff';
      btnKanban.style.color = '#0f172a';
      btnKanban.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
      btnTable.style.background = 'transparent';
      btnTable.style.color = '#64748b';
      btnTable.style.boxShadow = 'none';
    });

    btnTable.addEventListener('click', () => {
      activeViewMode = 'table';
      kanbanContainer.style.display = 'none';
      tableContainer.style.display = 'block';
      btnTable.style.background = '#ffffff';
      btnTable.style.color = '#0f172a';
      btnTable.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
      btnKanban.style.background = 'transparent';
      btnKanban.style.color = '#64748b';
      btnKanban.style.boxShadow = 'none';
    });
  }

  // Export CSV Button Event
  const btnExportCSV = document.getElementById('btnExportCSV');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      if (!cachedLeads || !cachedLeads.length) {
        showToast("Không có dữ liệu Lead để xuất!", true);
        return;
      }
      const success = exportLeadsToCSV(cachedLeads);
      if (success) {
        showToast("✅ Đã xuất dữ liệu Lead sang file Excel (CSV) thành công!");
      }
    });
  }

  // Assign Telesale Without Reloading Page
  document.querySelectorAll('[data-assign-lead]').forEach(select => {
    select.addEventListener('change', async () => {
      const id = select.dataset.id;
      const assigned_telesale_id = select.value;
      try {
        showToast("Đang phân bổ Lead...");
        await updateMarketingLead(id, { assigned_telesale_id });
        const leadObj = cachedLeads.find(l => l.id === id);
        if (leadObj) leadObj.assigned_telesale_id = assigned_telesale_id;
        showToast("✅ Đã gán Telesale thành công!");
      } catch (err) {
        showToast("Lỗi khi gán Telesale: " + err.message, true);
      }
    });
  });

  // Change Lead Status without Page Reload
  document.querySelectorAll('[data-change-status]').forEach(select => {
    select.addEventListener('change', async () => {
      const id = select.dataset.id;
      const status = select.value;
      try {
        showToast("Đang cập nhật trạng thái Lead...");
        await updateMarketingLead(id, { status });
        const leadObj = cachedLeads.find(l => l.id === id);
        if (leadObj) leadObj.status = status;
        showToast("✅ Đã chuyển trạng thái Lead thành công!");
      } catch (err) {
        showToast("Lỗi khi chuyển trạng thái: " + err.message, true);
      }
    });
  });

  // Delete Lead Handler
  document.querySelectorAll('[data-delete-lead]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteLead;
      if (!await confirmAction("Bạn có chắc chắn muốn xóa Lead này khỏi hệ thống?", { title: 'Xóa Lead', confirmText: 'Xóa Lead', tone: 'danger' })) return;
      try {
        showToast("Đang xóa Lead...");
        await deleteMarketingLead(id);
        cachedLeads = cachedLeads.filter(l => l.id !== id);
        const card = document.getElementById(`kanban-card-${id}`);
        if (card) card.remove();
        const row = document.getElementById(`table-row-${id}`);
        if (row) row.remove();
        showToast("✅ Đã xóa Lead thành công!");
      } catch (err) {
        showToast("Lỗi khi xóa Lead: " + err.message, true);
      }
    });
  });

  // Card Collapse / Expand Handler
  document.querySelectorAll('[data-toggle-card]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.toggleCard;
      const card = document.getElementById(`kanban-card-${id}`);
      const body = document.getElementById(`card-body-${id}`);
      const icon = document.getElementById(`toggle-icon-${id}`);
      if (body) {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (card) {
          card.classList.toggle('is-collapsed', !isHidden);
        }
        if (icon) {
          icon.className = isHidden ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line';
        }
      }
    });
  });

  // HTML5 Drag and Drop for Kanban Columns
  document.querySelectorAll('[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.style.opacity = '0.5';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });
  });

  document.querySelectorAll('.kanban-drop-zone').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.style.background = '#e2e8f0';
      zone.style.borderColor = '#0284c7';
    });

    zone.addEventListener('dragleave', () => {
      zone.style.background = '#f8fafc';
      zone.style.borderColor = '#cbd5e1';
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.style.background = '#f8fafc';
      zone.style.borderColor = '#cbd5e1';
      const leadId = e.dataTransfer.getData('text/plain');
      const newStatus = zone.dataset.statusKey;

      if (!leadId || !newStatus) return;

      const card = document.getElementById(`kanban-card-${leadId}`);
      const cardList = zone.querySelector('.kanban-card-list');
      const emptyMsg = zone.querySelector('.empty-kanban-msg');

      if (card && cardList) {
        if (emptyMsg) emptyMsg.remove();
        cardList.appendChild(card);
        
        // Update select dropdown inside card
        const select = card.querySelector('[data-change-status]');
        if (select) select.value = newStatus;

        try {
          showToast(`Đang chuyển Lead sang "${LEAD_STATUS[newStatus] || newStatus}"...`);
          await updateMarketingLead(leadId, { status: newStatus });
          const leadObj = cachedLeads.find(l => l.id === leadId);
          if (leadObj) leadObj.status = newStatus;
          showToast(`✅ Đã chuyển Lead sang "${LEAD_STATUS[newStatus] || newStatus}" thành công!`);
        } catch (err) {
          showToast("Lỗi khi chuyển trạng thái: " + err.message, true);
        }
      }
    });
  });

  // Client-side search and filtering for Kanban & Table
  const searchInput = document.getElementById('searchLeadInput');
  const branchSelect = document.getElementById('filterBranchSelect');
  const sourceSelect = document.getElementById('filterSourceSelect');
  const rawDistributionControl = document.getElementById('rawDistributionControl');
  const netDistributionGuidance = document.getElementById('netDistributionGuidance');
  const clearClassFilter = document.getElementById('clearLeadClassFilter');

  function applyFilters() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const branch = branchSelect?.value || '';
    const source = sourceSelect?.value || '';
    const dataClass = activeDataClassFilter;

    // Filter Kanban cards
    document.querySelectorAll('.lead-kanban-card').forEach(card => {
      const name = card.dataset.name || '';
      const phone = card.dataset.phone || '';
      const cardSource = card.dataset.source || '';
      const cardBranch = card.dataset.branch || '';
      const cardClass = card.dataset.class || 'raw';

      const matchQ = !q || name.includes(q) || phone.includes(q);
      const matchBranch = !branch || cardBranch === branch;
      const matchSource = !source || cardSource === source;

      const matchClass = !dataClass || cardClass === dataClass;
      card.style.display = (matchQ && matchBranch && matchSource && matchClass) ? 'block' : 'none';
    });

    // Filter Table rows
    document.querySelectorAll('.lead-table-row').forEach(row => {
      const name = row.dataset.name || '';
      const phone = row.dataset.phone || '';
      const rowSource = row.dataset.source || '';
      const rowBranch = row.dataset.branch || '';
      const rowClass = row.dataset.class || 'raw';

      const matchQ = !q || name.includes(q) || phone.includes(q);
      const matchBranch = !branch || rowBranch === branch;
      const matchSource = !source || rowSource === source;

      const matchClass = !dataClass || rowClass === dataClass;
      row.style.display = (matchQ && matchBranch && matchSource && matchClass) ? 'table-row' : 'none';
    });
  }

  document.querySelectorAll('[data-lead-class-filter]').forEach((button) => button.addEventListener('click', () => {
    activeDataClassFilter = button.dataset.leadClassFilter;
    document.querySelectorAll('[data-lead-class-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    if (rawDistributionControl) rawDistributionControl.hidden = activeDataClassFilter !== 'raw';
    if (netDistributionGuidance) netDistributionGuidance.hidden = activeDataClassFilter !== 'net';
    if (clearClassFilter) clearClassFilter.hidden = false;
    activateTableView();
    applyFilters();
  }));
  clearClassFilter?.addEventListener('click', () => {
    activeDataClassFilter = '';
    document.querySelectorAll('[data-lead-class-filter]').forEach((item) => item.classList.remove('is-active'));
    if (rawDistributionControl) rawDistributionControl.hidden = true;
    if (netDistributionGuidance) netDistributionGuidance.hidden = true;
    clearClassFilter.hidden = true;
    applyFilters();
  });
  applyFilters();

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (branchSelect) branchSelect.addEventListener('change', applyFilters);
  if (sourceSelect) sourceSelect.addEventListener('change', applyFilters);
}
