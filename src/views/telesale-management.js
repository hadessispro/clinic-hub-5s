import { bulkAssignMarketingLeads, createMarketingLead, distributeRawLeads, exportLeadsToCSV, getMarketingLeadPage, getMarketingLeads, getTelesaleAccounts, getTelesaleDailySummary, updateMarketingLead } from '../services/marketing.js';
import { LEAD_STATUS, MARKETING_SOURCES } from '../constants.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { leadStatusPill, option } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { navigateTo } from '../router.js';
import { initLeadConsultationDrawer, leadConsultationDrawer } from '../components/lead-consultation-drawer.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let selectedTelesale = '';
let dateFrom = '';
let dateTo = '';
let reportDate = '';
let statusFilter = '';
let dataClassFilter = '';
let serviceGroupFilter = '';
let serviceTypeFilter = '';
let pgUnhandledOnly = false;
let customerSearch = '';
let currentPage = 1;
let renderedLeads = new Map();
const selectedLeadIds = new Set();
const PAGE_SIZE = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches ? 20 : 50;
const BASIC_SERVICES = ['Cạo vôi răng', 'Trám răng', 'Nhổ răng khôn', 'Thăm khám răng', 'Phục hình tháo lắp', 'Điều trị tủy', 'Tẩy trắng'];
const ADVANCED_SERVICES = ['Implant', 'Răng sứ', 'Niềng răng'];

const number = (value) => Number(value || 0).toLocaleString('vi-VN');
const branchName = (id) => id === 'le-van-tho' ? '5S Lê Văn Thọ' : id === 'pham-van-chieu' ? '5S Phạm Văn Chiêu' : (id || 'Chưa xác định');
function rerender() {
  navigateTo('telesale-management');
}

export async function renderView() {
  const profile = store.getState().profile || {};
  if (!['telesale_leader', 'admin_marketing', 'admin', 'superadmin'].includes(profile.role)) {
    return '<div class="empty-state error"><strong>Không có quyền truy cập</strong><span>Khu vực này chỉ dành cho Quản lý Telesale.</span></div>';
  }

  const [accounts, summary, leadPage, rawInventory] = await Promise.all([
    getTelesaleAccounts(),
    getTelesaleDailySummary(reportDate),
    getMarketingLeadPage({
      page: currentPage,
      page_size: PAGE_SIZE,
      assigned_telesale_id: selectedTelesale || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      status: statusFilter || undefined,
      data_class: dataClassFilter || undefined,
      service_group: serviceGroupFilter || undefined,
      service_type: serviceTypeFilter || undefined,
      search: customerSearch || undefined,
      pg_unhandled_only: pgUnhandledOnly,
    }),
    getMarketingLeadPage({ page: 1, page_size: 1, data_class: 'raw', assignment: 'unassigned' }),
  ]);
  const telesales = accounts.filter((item) => ['telesale_staff', 'telesale_leader'].includes(item.role) && item.active !== false);
  const leads = leadPage.data || [];
  renderedLeads = new Map(leads.map((lead) => [String(lead.id), lead]));
  const meta = leadPage.meta || { page: 1, pageSize: PAGE_SIZE, total: leads.length };
  const totalPages = Math.max(1, Math.ceil(Number(meta.total || 0) / Number(meta.pageSize || PAGE_SIZE)));
  const totals = summary.totals || {};
  const staff = summary.staff || [];
  const unassignedRawTotal = Number(rawInventory.meta?.total || 0);
  const serviceOptions = serviceGroupFilter === 'advanced' ? ADVANCED_SERVICES : serviceGroupFilter === 'basic' ? BASIC_SERVICES : [];

  const staffRows = staff.map((member) => {
    const active = selectedTelesale === member.employee_code;
    return `<button type="button" class="tsm-staff-row ${active ? 'is-active' : ''}" data-team-member="${escapeHTML(member.employee_code)}">
      <span class="tsm-avatar">${escapeHTML((member.full_name || member.employee_code || '?').trim().slice(0, 1).toUpperCase())}</span>
      <span class="tsm-person"><strong>${escapeHTML(member.full_name || member.employee_code)}</strong><small>${escapeHTML(member.employee_code)}</small></span>
      <span><b>${number(member.total_data)}</b><small>tổng data</small></span>
      <span><b>${number(member.processed_total)}</b><small>đã xử lý</small></span>
      <span><b>${number(member.unprocessed_total)}</b><small>chưa xử lý</small></span>
      <span><b>${number(member.visited_total)}</b><small>khách đến</small></span>
      <span><b>${number(member.low_quality_total)}</b><small>khách KCL</small></span>
      <i class="ri-arrow-right-s-line"></i>
    </button>`;
  }).join('') || '<div class="tsm-empty">Chưa có tài khoản Telesale Staff đang hoạt động.</div>';

  const leadRows = leads.map((lead, index) => `<tr data-tsm-lead-row="${escapeHTML(lead.id)}">
    <td class="tsm-select-cell" data-label="Chọn"><input class="tsm-lead-check" type="checkbox" value="${escapeHTML(lead.id)}" aria-label="Chọn hồ sơ ${escapeHTML(lead.full_name || '')}" ${selectedLeadIds.has(String(lead.id)) ? 'checked' : ''}></td>
    <td class="tsm-index-cell" data-label="STT">${(currentPage - 1) * PAGE_SIZE + index + 1}</td>
    <td class="tsm-customer-cell" data-label="Khách hàng"><strong>${escapeHTML(lead.full_name || 'Chưa có tên')}</strong><small>${escapeHTML(lead.phone || '')}</small></td>
    <td data-label="Phân loại"><span class="tsm-data-tag ${lead.data_class === 'net' ? 'is-net' : ''}">${lead.data_class === 'net' ? `Data net ${lead.net_level === 'advanced' ? 'chuyên sâu' : 'cơ bản'}` : 'Data thô'}</span></td>
    <td data-label="Dịch vụ">${escapeHTML(lead.service_interest || 'Chưa cập nhật')}</td>
    <td data-label="Chi nhánh">${escapeHTML(branchName(lead.branch_id))}</td>
    <td data-label="Telesale phụ trách"><select class="select-badge tsm-assign" data-reassign-lead="${escapeHTML(lead.id)}" data-current="${escapeHTML(lead.assigned_telesale_id || '')}">
      <option value="">Chưa gán</option>
      ${telesales.map((member) => option(member.employee_code, `${member.name} · ${member.employee_code}`, lead.assigned_telesale_id === member.employee_code)).join('')}
    </select></td>
    <td data-label="Trạng thái"><span data-tsm-lead-status>${leadStatusPill(lead.status)}</span></td>
    <td data-label="Nguồn nhập"><strong>${escapeHTML(lead.created_by_name || lead.source || 'Chưa xác định')}</strong><small>${lead.created_by_role === 'pg_staff' ? 'Nhân viên PG' : lead.created_by_role === 'telesale_leader' ? 'Quản lý Telesale' : escapeHTML(lead.source || '')}</small></td>
    <td data-label="Tiếp nhận"><time>${formatDateTime(lead.created_at)}</time></td>
    <td data-label="Hồ sơ"><button type="button" class="secondary-button" data-open-lead-consultation="${escapeHTML(lead.id)}"><i class="ri-customer-service-2-line"></i> Tư vấn</button></td>
  </tr>`).join('') || '<tr><td colspan="11" class="tsm-empty">Không có hồ sơ phù hợp với bộ lọc.</td></tr>';

  return `<div class="tsm-page">
    <header class="tsm-header">
      <div><p class="eyebrow">TRUNG TÂM ĐIỀU HÀNH TELESALE</p><h3>Quản lý đội ngũ & phân bổ hồ sơ</h3><span>Theo dõi khối lượng, hiệu suất trong ngày và điều chuyển data đúng người phụ trách.</span></div>
      <div class="tsm-header-actions"><button type="button" class="secondary-button" id="tsmToggleIntake"><i class="ri-add-line"></i> Tiếp nhận data mới</button><button type="button" class="primary-button" id="tsmExport"><i class="ri-file-excel-2-line"></i> Xuất Excel</button><label class="tsm-report-date"><span>Ngày được giao</span><input type="date" id="tsmReportDate" value="${escapeHTML(reportDate)}" title="Để trống để xem toàn bộ dữ liệu"></label></div>
    </header>

    <section class="panel tsm-intake" id="tsmIntakePanel" hidden style="display:none">
      <div class="section-title"><div><h3>Tiếp nhận data của Quản lý Telesale</h3><p class="subtle">Dữ liệu được ghi nhận đúng người nhập là ${escapeHTML(profile.full_name || profile.employee_code || 'Quản lý Telesale')}, không ghi nhận là PG.</p></div></div>
      <form class="form-grid three" id="tsmIntakeForm">
        <div class="form-field"><label>Phân loại data</label><select name="data_class" id="tsmDataClass"><option value="raw">Data thô</option><option value="net">Data net</option></select></div>
        <div class="form-field" id="tsmNetLevelField" hidden style="display:none"><label>Cấp độ data net</label><select name="net_level" id="tsmNetLevel" disabled><option value="basic">Net cơ bản</option><option value="advanced">Net chuyên sâu</option></select></div>
        <div class="form-field" id="tsmAppointmentField" hidden style="display:none"><label>Lịch hẹn</label><input type="datetime-local" name="appointment_at" id="tsmAppointment" disabled></div>
        <div class="form-field"><label>Họ tên khách hàng</label><input name="full_name" required placeholder="Nhập họ tên khách hàng"></div>
        <div class="form-field"><label>Số điện thoại</label><input name="phone" id="tsmPhone" type="tel" placeholder="090..."></div>
        <div class="form-field"><label>Nguồn tiếp nhận</label><select name="source">${MARKETING_SOURCES.map((source) => `<option value="${escapeHTML(source)}">${escapeHTML(source)}</option>`).join('')}</select></div>
        <div class="form-field"><label>Chi nhánh</label><select name="branch_id"><option value="pham-van-chieu">5S Phạm Văn Chiêu</option><option value="le-van-tho">5S Lê Văn Thọ</option></select></div>
        <div class="form-field" id="tsmServiceField" hidden style="display:none"><label>Dịch vụ quan tâm</label><select name="service_interest" id="tsmService" disabled><option value="">Chọn dịch vụ</option></select></div>
        <div class="form-field full"><label>Ghi chú nhu cầu</label><textarea name="notes" placeholder="Nhu cầu, thời gian liên hệ, thông tin cần lưu ý..."></textarea></div>
        <div class="form-field full"><button class="primary-button" type="submit"><i class="ri-save-line"></i> Lưu data và ghi đúng nguồn Quản lý Telesale</button></div>
      </form>
    </section>

    <section class="tsm-kpis">
      <article><i class="ri-database-2-line"></i><div><small>Tổng data</small><strong>${number(totals.total_data)}</strong><span>${reportDate ? 'Được giao trong ngày chọn' : 'Toàn bộ data đang giao'}</span></div></article>
      <article><i class="ri-checkbox-circle-line"></i><div><small>Đã xử lý</small><strong>${number(totals.processed_total)}</strong><span>Đã đổi trạng thái và lưu</span></div></article>
      <article><i class="ri-time-line"></i><div><small>Chưa xử lý</small><strong>${number(totals.unprocessed_total)}</strong><span>Chưa có cập nhật từ Telesale</span></div></article>
      <article><i class="ri-hospital-line"></i><div><small>Tổng khách đến</small><strong>${number(totals.visited_total)}</strong><span>Đã đến hoặc chốt thành công</span></div></article>
      <article><i class="ri-user-unfollow-line"></i><div><small>Tổng khách KCL</small><strong>${number(totals.low_quality_total)}</strong><span>Khách không chất lượng</span></div></article>
    </section>

    <section class="panel tsm-team-panel">
      <div class="section-title"><div><h3>Hiệu suất từng Telesale</h3><p class="subtle">Chọn nhân viên để lọc ngay danh sách hồ sơ đang phụ trách.</p></div><button type="button" class="secondary-button" id="tsmClearMember">Xem toàn đội</button></div>
      <div class="tsm-team-head"><span>Nhân viên</span><span>Tổng data</span><span>Đã xử lý</span><span>Chưa xử lý</span><span>Khách đến</span><span>Khách KCL</span></div>
      <div class="tsm-team-list">${staffRows}</div>
    </section>

    <section class="panel tsm-ledger">
      <div class="section-title"><div><h3>Danh sách hồ sơ & giao lại Telesale</h3><p class="subtle">Bộ lọc áp dụng trên toàn bộ dữ liệu máy chủ, không chỉ 50 dòng đang hiển thị.</p></div><div class="tsm-ledger-actions"><button type="button" class="secondary-button${pgUnhandledOnly ? ' is-active' : ''}" id="tsmPgUnhandled"><i class="ri-user-received-line"></i> PG mới nhập · chưa gán</button><span class="pill">${number(meta.total)} hồ sơ</span></div></div>
      <div class="tsm-distribution" aria-label="Phân bổ tự động Data thô">
        <div class="tsm-distribution-copy">
          <i class="ri-shuffle-line"></i>
          <span><strong>Chia ngẫu nhiên Data thô</strong><small><b>${number(unassignedRawTotal)} hồ sơ chưa gán</b><span aria-hidden="true">·</span> Cân bằng theo khối lượng đang xử lý của từng Telesale</small></span>
        </div>
        <div class="tsm-distribution-controls">
          <label for="tsmRawQuantity"><span>Số lượng cần chia</span><input id="tsmRawQuantity" type="number" min="1" max="5000" value="${Math.min(Math.max(unassignedRawTotal, 1), 20)}" inputmode="numeric" ${unassignedRawTotal < 1 ? 'disabled' : ''}></label>
          <button type="button" class="primary-button" id="tsmDistributeRaw" ${unassignedRawTotal < 1 ? 'disabled' : ''}><i class="ri-shuffle-line"></i><span>Phân bổ ngẫu nhiên, chia đều</span></button>
        </div>
      </div>
      <div class="tsm-bulk-assign" aria-label="Chia nhanh data đã chọn">
        <div class="tsm-bulk-title"><i class="ri-checkbox-multiple-line"></i><span><strong>Chia nhanh data có chọn</strong><small>Tích một, nhiều hoặc toàn bộ hồ sơ trên trang rồi giao cùng lúc.</small></span><b id="tsmSelectedCount">${selectedLeadIds.size} đã chọn</b></div>
        <div class="tsm-bulk-controls">
          <label><span>Telesale nhận data</span><select id="tsmBulkTelesale"><option value="">Chọn Telesale</option>${telesales.map((member) => option(member.employee_code, `${member.name} · ${member.employee_code}`, false)).join('')}</select></label>
          <label><span>Loại data</span><select id="tsmBulkDataClass"><option value="all">Data thô và Data net</option><option value="raw">Chỉ Data thô</option><option value="net">Chỉ Data net</option></select></label>
          <button type="button" class="secondary-button" id="tsmClearSelection"><i class="ri-close-circle-line"></i> Bỏ chọn</button>
          <button type="button" class="primary-button" id="tsmConfirmBulk"><i class="ri-user-shared-line"></i> Xác nhận chia data</button>
        </div>
      </div>
      <div class="tsm-filters">
        <label class="tsm-customer-search"><span>Tìm nhanh khách hàng / SĐT</span><div class="tsm-search-control"><i class="ri-search-line"></i><input type="search" id="tsmCustomerSearch" value="${escapeHTML(customerSearch)}" placeholder="Nhập tên hoặc số điện thoại" autocomplete="off" inputmode="search"></div></label>
        <label><span>Telesale phụ trách</span><select id="tsmMemberFilter"><option value="">Toàn đội Telesale</option>${telesales.map((member) => option(member.employee_code, `${member.name} · ${member.employee_code}`, selectedTelesale === member.employee_code)).join('')}</select></label>
        <label><span>Từ ngày</span><input type="date" id="tsmDateFrom" value="${escapeHTML(dateFrom)}"></label>
        <label><span>Đến ngày</span><input type="date" id="tsmDateTo" value="${escapeHTML(dateTo)}"></label>
        <label><span>Phân loại data</span><select id="tsmDataClassFilter"><option value="">Tất cả data</option><option value="raw"${dataClassFilter === 'raw' ? ' selected' : ''}>Data thô</option><option value="net"${dataClassFilter === 'net' ? ' selected' : ''}>Data net</option></select></label>
        <label><span>Nhóm dịch vụ</span><select id="tsmServiceGroupFilter"><option value="">Tất cả dịch vụ</option><option value="basic"${serviceGroupFilter === 'basic' ? ' selected' : ''}>Dịch vụ cơ bản</option><option value="advanced"${serviceGroupFilter === 'advanced' ? ' selected' : ''}>Dịch vụ chuyên sâu · Data net</option></select></label>
        <label><span>Dịch vụ cụ thể</span><select id="tsmServiceTypeFilter"${serviceGroupFilter ? '' : ' disabled'}><option value="">Tất cả trong nhóm</option>${serviceOptions.map((serviceName) => option(serviceName, serviceName, serviceTypeFilter === serviceName)).join('')}</select></label>
        <label><span>Trạng thái</span><select id="tsmStatus"><option value="">Tất cả trạng thái</option>${Object.entries(LEAD_STATUS).map(([key, label]) => option(key, label, statusFilter === key)).join('')}</select></label>
        <button type="button" class="secondary-button" id="tsmResetFilters"><i class="ri-restart-line"></i> Xóa lọc</button>
      </div>
      <div class="tsm-table-wrap"><table class="tsm-table" data-auto-pagination="off"><thead><tr><th class="tsm-select-head"><input id="tsmSelectPage" type="checkbox" aria-label="Chọn tất cả hồ sơ trên trang" ${leads.length && leads.every((lead) => selectedLeadIds.has(String(lead.id))) ? 'checked' : ''}></th><th>STT</th><th>Khách hàng</th><th>Phân loại</th><th>Dịch vụ</th><th>Chi nhánh</th><th>Telesale phụ trách</th><th>Trạng thái</th><th>Nguồn nhập</th><th>Ngày tiếp nhận</th><th>Hồ sơ</th></tr></thead><tbody>${leadRows}</tbody></table></div>
      <footer class="tsm-pagination"><span>Trang ${currentPage}/${totalPages} · ${number(meta.total)} hồ sơ</span><div><button type="button" class="secondary-button" id="tsmPrev" ${currentPage <= 1 ? 'disabled' : ''}><i class="ri-arrow-left-s-line"></i> Trước</button><button type="button" class="secondary-button" id="tsmNext" ${currentPage >= totalPages ? 'disabled' : ''}>Sau <i class="ri-arrow-right-s-line"></i></button></div></footer>
    </section>
    ${leadConsultationDrawer()}
  </div>`;
}

export function initView() {
  const basicServices = ['Cạo vôi răng', 'Trám răng', 'Nhổ răng khôn', 'Thăm khám răng', 'Phục hình tháo lắp', 'Điều trị tủy', 'Tẩy trắng'];
  const advancedServices = ['Implant', 'Răng sứ', 'Niềng răng'];
  const intakePanel = document.getElementById('tsmIntakePanel');
  document.getElementById('tsmToggleIntake')?.addEventListener('click', () => {
    const willOpen = intakePanel?.hidden !== false;
    if (intakePanel) { intakePanel.hidden = !willOpen; intakePanel.style.display = willOpen ? '' : 'none'; }
  });
  const dataClass = document.getElementById('tsmDataClass');
  const netLevel = document.getElementById('tsmNetLevel');
  const appointment = document.getElementById('tsmAppointment');
  const phone = document.getElementById('tsmPhone');
  const service = document.getElementById('tsmService');
  const netLevelField = document.getElementById('tsmNetLevelField');
  const appointmentField = document.getElementById('tsmAppointmentField');
  const serviceField = document.getElementById('tsmServiceField');
  const refreshServices = () => {
    const services = netLevel?.value === 'advanced' ? advancedServices : basicServices;
    if (service) service.innerHTML = `<option value="">Chọn dịch vụ</option>${services.map((item) => `<option value="${escapeHTML(item)}">${escapeHTML(item)}</option>`).join('')}`;
  };
  const toggleNetFields = () => {
    const isNet = dataClass?.value === 'net';
    for (const field of [netLevelField, appointmentField, serviceField]) {
      if (field) { field.hidden = !isNet; field.style.display = isNet ? '' : 'none'; }
    }
    for (const control of [netLevel, appointment, service]) if (control) control.disabled = !isNet;
    if (phone) phone.required = isNet;
    if (netLevel) netLevel.required = isNet;
    if (appointment) appointment.required = isNet;
    if (service) { service.required = isNet; if (!isNet) service.value = ''; }
    if (isNet) refreshServices();
  };
  dataClass?.addEventListener('change', toggleNetFields);
  netLevel?.addEventListener('change', refreshServices);
  toggleNetFields();
  document.getElementById('tsmIntakeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await createMarketingLead(Object.fromEntries(new FormData(form).entries()));
      showToast('Đã lưu data với nguồn Quản lý Telesale.');
      form.reset(); toggleNetFields(); rerender();
    } catch (error) { showToast(error.message || 'Không thể lưu data.', true); submit.disabled = false; }
  });
  document.getElementById('tsmExport')?.addEventListener('click', async () => {
    try {
      let rows = await getMarketingLeads({ search: customerSearch || undefined, status: statusFilter || undefined, data_class: dataClassFilter || undefined, service_group: serviceGroupFilter || undefined, service_type: serviceTypeFilter || undefined, assigned_telesale_id: selectedTelesale || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined });
      if (pgUnhandledOnly) rows = rows.filter((lead) => lead.created_by_role === 'pg_staff' && !lead.assigned_telesale_id);
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00+07:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999+07:00`) : null;
      rows = rows.filter((lead) => { const value = new Date(lead.created_at || 0); return (!from || value >= from) && (!to || value <= to); });
      if (!rows.length) { showToast('Không có dữ liệu phù hợp để xuất.', true); return; }
      exportLeadsToCSV(rows, `Ho_so_Telesale_${reportDate}.csv`);
      showToast(`Đã xuất ${rows.length} hồ sơ.`);
    } catch (error) { showToast(error.message || 'Không thể xuất dữ liệu.', true); }
  });
  initLeadConsultationDrawer({
    getLead: (id) => renderedLeads.get(String(id)),
    onSaved: (lead) => {
      renderedLeads.set(String(lead.id), lead);
      const row = document.querySelector(`[data-tsm-lead-row="${CSS.escape(String(lead.id))}"]`);
      const status = row?.querySelector('[data-tsm-lead-status]');
      if (status) status.innerHTML = leadStatusPill(lead.status);
    },
  });
  document.getElementById('tsmReportDate')?.addEventListener('change', (event) => { reportDate = event.target.value || ''; rerender(); });
  const customerSearchInput = document.getElementById('tsmCustomerSearch');
  let customerSearchTimer;
  customerSearchInput?.addEventListener('input', () => {
    window.clearTimeout(customerSearchTimer);
    customerSearchTimer = window.setTimeout(() => {
      customerSearch = customerSearchInput.value.trim();
      currentPage = 1;
      rerender();
    }, 260);
  });
  customerSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    window.clearTimeout(customerSearchTimer);
    customerSearch = customerSearchInput.value.trim();
    currentPage = 1;
    rerender();
  });
  document.getElementById('tsmMemberFilter')?.addEventListener('change', (event) => { selectedTelesale = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmDateFrom')?.addEventListener('change', (event) => { dateFrom = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmDateTo')?.addEventListener('change', (event) => { dateTo = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmDataClassFilter')?.addEventListener('change', (event) => {
    dataClassFilter = event.target.value;
    if (dataClassFilter === 'raw' && serviceGroupFilter === 'advanced') { serviceGroupFilter = ''; serviceTypeFilter = ''; }
    currentPage = 1;
    rerender();
  });
  document.getElementById('tsmServiceGroupFilter')?.addEventListener('change', (event) => {
    serviceGroupFilter = event.target.value;
    serviceTypeFilter = '';
    if (serviceGroupFilter === 'advanced') dataClassFilter = 'net';
    currentPage = 1;
    rerender();
  });
  document.getElementById('tsmServiceTypeFilter')?.addEventListener('change', (event) => { serviceTypeFilter = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmStatus')?.addEventListener('change', (event) => { statusFilter = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmPgUnhandled')?.addEventListener('click', () => {
    pgUnhandledOnly = !pgUnhandledOnly;
    if (pgUnhandledOnly) selectedTelesale = '';
    currentPage = 1;
    rerender();
  });
  document.getElementById('tsmDistributeRaw')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const quantity = Number(document.getElementById('tsmRawQuantity')?.value || 0);
    if (!Number.isInteger(quantity) || quantity < 1) {
      showToast('Cần nhập số lượng Data thô muốn phân bổ.', true);
      return;
    }
    button.disabled = true;
    try {
      const result = await distributeRawLeads(quantity);
      const distributed = Number(result?.distributed || 0);
      showToast(distributed > 0 ? `Đã chia đều ${distributed} Data thô cho đội Telesale.` : 'Không còn Data thô chưa gán để phân bổ.');
      currentPage = 1;
      rerender();
    } catch (error) {
      button.disabled = false;
      showToast(error.message || 'Không thể phân bổ Data thô.', true);
    }
  });
  const visibleLeadChecks = [...document.querySelectorAll('.tsm-lead-check')];
  const selectedCount = document.getElementById('tsmSelectedCount');
  const selectPage = document.getElementById('tsmSelectPage');
  const updateSelectionUi = () => {
    if (selectedCount) selectedCount.textContent = `${selectedLeadIds.size} đã chọn`;
    if (selectPage) {
      const checked = visibleLeadChecks.filter((input) => input.checked).length;
      selectPage.checked = visibleLeadChecks.length > 0 && checked === visibleLeadChecks.length;
      selectPage.indeterminate = checked > 0 && checked < visibleLeadChecks.length;
    }
  };
  visibleLeadChecks.forEach((input) => input.addEventListener('change', () => {
    if (input.checked) selectedLeadIds.add(input.value); else selectedLeadIds.delete(input.value);
    input.closest('tr')?.classList.toggle('is-selected', input.checked);
    updateSelectionUi();
  }));
  selectPage?.addEventListener('change', () => {
    visibleLeadChecks.forEach((input) => {
      input.checked = selectPage.checked;
      if (input.checked) selectedLeadIds.add(input.value); else selectedLeadIds.delete(input.value);
      input.closest('tr')?.classList.toggle('is-selected', input.checked);
    });
    updateSelectionUi();
  });
  document.getElementById('tsmClearSelection')?.addEventListener('click', () => {
    selectedLeadIds.clear();
    visibleLeadChecks.forEach((input) => { input.checked = false; input.closest('tr')?.classList.remove('is-selected'); });
    updateSelectionUi();
  });
  document.getElementById('tsmConfirmBulk')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const telesaleCode = document.getElementById('tsmBulkTelesale')?.value || '';
    const dataClass = document.getElementById('tsmBulkDataClass')?.value || 'all';
    const quantity = selectedLeadIds.size;
    if (!telesaleCode) { showToast('Cần chọn Telesale nhận data.', true); return; }
    if (!selectedLeadIds.size) { showToast('Cần tích chọn ít nhất một hồ sơ.', true); return; }
    button.disabled = true;
    try {
      const result = await bulkAssignMarketingLeads({ leadIds: [...selectedLeadIds], telesaleCode, dataClass, quantity });
      const assigned = Number(result?.assigned || 0);
      (result?.leadIds || []).forEach((id) => selectedLeadIds.delete(String(id)));
      showToast(assigned ? `Đã giao ${assigned} hồ sơ cho Telesale đã chọn.` : 'Không có hồ sơ phù hợp để giao.', !assigned);
      rerender();
    } catch (error) {
      button.disabled = false;
      showToast(error.message || 'Không thể chia nhanh data.', true);
    }
  });
  visibleLeadChecks.forEach((input) => input.closest('tr')?.classList.toggle('is-selected', input.checked));
  updateSelectionUi();
  document.getElementById('tsmClearMember')?.addEventListener('click', () => { selectedTelesale = ''; currentPage = 1; rerender(); });
  document.getElementById('tsmResetFilters')?.addEventListener('click', () => { customerSearch = ''; selectedTelesale = ''; dateFrom = ''; dateTo = ''; dataClassFilter = ''; serviceGroupFilter = ''; serviceTypeFilter = ''; statusFilter = ''; pgUnhandledOnly = false; currentPage = 1; rerender(); });
  document.getElementById('tsmPrev')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); rerender(); });
  document.getElementById('tsmNext')?.addEventListener('click', () => { currentPage += 1; rerender(); });
  document.querySelectorAll('[data-team-member]').forEach((button) => button.addEventListener('click', () => { selectedTelesale = button.dataset.teamMember || ''; currentPage = 1; rerender(); }));
  document.querySelectorAll('[data-reassign-lead]').forEach((select) => select.addEventListener('change', async () => {
    const previous = select.dataset.current || '';
    if (!select.value) { select.value = previous; showToast('Cần chọn Telesale nhận hồ sơ.', true); return; }
    select.disabled = true;
    try {
      await updateMarketingLead(select.dataset.reassignLead, { assigned_telesale_id: select.value });
      showToast('Đã giao lại hồ sơ và lưu lịch sử người thực hiện.');
      rerender();
    } catch (error) {
      select.value = previous;
      select.disabled = false;
      showToast(error.message || 'Không thể giao lại hồ sơ.', true);
    }
  }));
}
