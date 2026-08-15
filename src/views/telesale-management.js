import { createMarketingLead, exportLeadsToCSV, getLeadCallLogs, getMarketingLeadPage, getMarketingLeads, getTelesaleAccounts, getTelesaleDailySummary, updateMarketingLead } from '../services/marketing.js';
import { LEAD_STATUS, MARKETING_SOURCES } from '../constants.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { option } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { navigateTo } from '../router.js';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let selectedTelesale = '';
let dateFrom = '';
let dateTo = '';
let reportDate = today();
let statusFilter = '';
let currentPage = 1;
const PAGE_SIZE = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches ? 20 : 50;

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

  const [accounts, summary, leadPage] = await Promise.all([
    getTelesaleAccounts(),
    getTelesaleDailySummary(reportDate),
    getMarketingLeadPage({
      page: currentPage,
      page_size: PAGE_SIZE,
      assigned_telesale_id: selectedTelesale || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      status: statusFilter || undefined,
    }),
  ]);
  const telesales = accounts.filter((item) => ['telesale_staff', 'telesale_leader'].includes(item.role) && item.active !== false);
  const leads = leadPage.data || [];
  const meta = leadPage.meta || { page: 1, pageSize: PAGE_SIZE, total: leads.length };
  const totalPages = Math.max(1, Math.ceil(Number(meta.total || 0) / Number(meta.pageSize || PAGE_SIZE)));
  const totals = summary.totals || {};
  const staff = summary.staff || [];

  const staffRows = staff.map((member) => {
    const active = selectedTelesale === member.employee_code;
    return `<button type="button" class="tsm-staff-row ${active ? 'is-active' : ''}" data-team-member="${escapeHTML(member.employee_code)}">
      <span class="tsm-avatar">${escapeHTML((member.full_name || member.employee_code || '?').trim().slice(0, 1).toUpperCase())}</span>
      <span class="tsm-person"><strong>${escapeHTML(member.full_name || member.employee_code)}</strong><small>${escapeHTML(member.employee_code)}</small></span>
      <span><b>${number(member.assigned_total)}</b><small>đang quản lý</small></span>
      <span><b>${number(member.handled_today)}</b><small>đã xử lý</small></span>
      <span><b>${number(member.status_changes_today)}</b><small>đổi trạng thái</small></span>
      <span><b>${number(member.visited_today)}</b><small>khách đến</small></span>
      <i class="ri-arrow-right-s-line"></i>
    </button>`;
  }).join('') || '<div class="tsm-empty">Chưa có tài khoản Telesale Staff đang hoạt động.</div>';

  const leadRows = leads.map((lead, index) => `<tr>
    <td data-label="STT">${(currentPage - 1) * PAGE_SIZE + index + 1}</td>
    <td data-label="Khách hàng"><strong>${escapeHTML(lead.full_name || 'Chưa có tên')}</strong><small>${escapeHTML(lead.phone || '')}</small></td>
    <td data-label="Phân loại"><span class="tsm-data-tag ${lead.data_class === 'net' ? 'is-net' : ''}">${lead.data_class === 'net' ? 'Data net' : 'Data thô'}</span></td>
    <td data-label="Dịch vụ">${escapeHTML(lead.service_interest || 'Chưa cập nhật')}</td>
    <td data-label="Chi nhánh">${escapeHTML(branchName(lead.branch_id))}</td>
    <td data-label="Telesale phụ trách"><select class="select-badge tsm-assign" data-reassign-lead="${escapeHTML(lead.id)}" data-current="${escapeHTML(lead.assigned_telesale_id || '')}">
      <option value="">Chưa gán</option>
      ${telesales.map((member) => option(member.employee_code, `${member.name} · ${member.employee_code}`, lead.assigned_telesale_id === member.employee_code)).join('')}
    </select></td>
    <td data-label="Trạng thái"><span class="tsm-status">${escapeHTML(LEAD_STATUS[lead.status] || lead.status || 'Chưa rõ')}</span></td>
    <td data-label="Nguồn nhập"><strong>${escapeHTML(lead.created_by_name || lead.source || 'Chưa xác định')}</strong><small>${lead.created_by_role === 'pg_staff' ? 'Nhân viên PG' : lead.created_by_role === 'telesale_leader' ? 'Quản lý Telesale' : escapeHTML(lead.source || '')}</small></td>
    <td data-label="Tiếp nhận"><time>${formatDateTime(lead.created_at)}</time></td>
    <td data-label="Hồ sơ"><button type="button" class="secondary-button" data-lead-history="${escapeHTML(lead.id)}" data-lead-name="${escapeHTML(lead.full_name || 'Khách hàng')}"><i class="ri-history-line"></i> Lịch sử</button></td>
  </tr>`).join('') || '<tr><td colspan="10" class="tsm-empty">Không có hồ sơ phù hợp với bộ lọc.</td></tr>';

  return `<div class="tsm-page">
    <header class="tsm-header">
      <div><p class="eyebrow">TRUNG TÂM ĐIỀU HÀNH TELESALE</p><h3>Quản lý đội ngũ & phân bổ hồ sơ</h3><span>Theo dõi khối lượng, hiệu suất trong ngày và điều chuyển data đúng người phụ trách.</span></div>
      <div class="tsm-header-actions"><button type="button" class="secondary-button" id="tsmToggleIntake"><i class="ri-add-line"></i> Tiếp nhận data mới</button><button type="button" class="primary-button" id="tsmExport"><i class="ri-file-excel-2-line"></i> Xuất Excel</button><label class="tsm-report-date"><span>Ngày báo cáo</span><input type="date" id="tsmReportDate" value="${escapeHTML(reportDate)}"></label></div>
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
      <article><i class="ri-folder-user-line"></i><div><small>Tổng hồ sơ đang giao</small><strong>${number(totals.assigned_total)}</strong><span>${number(totals.assigned_active)} hồ sơ đang mở</span></div></article>
      <article><i class="ri-customer-service-2-line"></i><div><small>Đã xử lý trong ngày</small><strong>${number(totals.handled_today)}</strong><span>${number(totals.calls_today)} lượt chăm sóc</span></div></article>
      <article><i class="ri-refresh-line"></i><div><small>Đổi trạng thái</small><strong>${number(totals.status_changes_today)}</strong><span>${number(totals.appointments_today)} khách đã hẹn</span></div></article>
      <article><i class="ri-hospital-line"></i><div><small>Khách đến chi nhánh</small><strong>${number(totals.visited_today)}</strong><span>Ghi nhận trong ngày chọn</span></div></article>
    </section>

    <section class="panel tsm-team-panel">
      <div class="section-title"><div><h3>Hiệu suất từng Telesale</h3><p class="subtle">Chọn nhân viên để lọc ngay danh sách hồ sơ đang phụ trách.</p></div><button type="button" class="secondary-button" id="tsmClearMember">Xem toàn đội</button></div>
      <div class="tsm-team-head"><span>Nhân viên</span><span>Kho hồ sơ</span><span>Hôm nay</span><span>Cập nhật</span><span>Khách đến</span></div>
      <div class="tsm-team-list">${staffRows}</div>
    </section>

    <section class="panel tsm-ledger">
      <div class="section-title"><div><h3>Danh sách hồ sơ & giao lại Telesale</h3><p class="subtle">Bộ lọc áp dụng trên toàn bộ dữ liệu máy chủ, không chỉ 50 dòng đang hiển thị.</p></div><span class="pill">${number(meta.total)} hồ sơ</span></div>
      <div class="tsm-filters">
        <label><span>Telesale phụ trách</span><select id="tsmMemberFilter"><option value="">Toàn đội Telesale</option>${telesales.map((member) => option(member.employee_code, `${member.name} · ${member.employee_code}`, selectedTelesale === member.employee_code)).join('')}</select></label>
        <label><span>Từ ngày</span><input type="date" id="tsmDateFrom" value="${escapeHTML(dateFrom)}"></label>
        <label><span>Đến ngày</span><input type="date" id="tsmDateTo" value="${escapeHTML(dateTo)}"></label>
        <label><span>Trạng thái</span><select id="tsmStatus"><option value="">Tất cả trạng thái</option>${Object.entries(LEAD_STATUS).map(([key, label]) => option(key, label, statusFilter === key)).join('')}</select></label>
        <button type="button" class="secondary-button" id="tsmResetFilters"><i class="ri-restart-line"></i> Xóa lọc</button>
      </div>
      <div class="tsm-table-wrap"><table class="tsm-table" data-auto-pagination="off"><thead><tr><th>STT</th><th>Khách hàng</th><th>Phân loại</th><th>Dịch vụ</th><th>Chi nhánh</th><th>Telesale phụ trách</th><th>Trạng thái</th><th>Nguồn nhập</th><th>Ngày tiếp nhận</th><th>Hồ sơ</th></tr></thead><tbody>${leadRows}</tbody></table></div>
      <div class="tsm-history-panel" id="tsmHistoryPanel" hidden></div>
      <footer class="tsm-pagination"><span>Trang ${currentPage}/${totalPages} · ${number(meta.total)} hồ sơ</span><div><button type="button" class="secondary-button" id="tsmPrev" ${currentPage <= 1 ? 'disabled' : ''}><i class="ri-arrow-left-s-line"></i> Trước</button><button type="button" class="secondary-button" id="tsmNext" ${currentPage >= totalPages ? 'disabled' : ''}>Sau <i class="ri-arrow-right-s-line"></i></button></div></footer>
    </section>
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
      let rows = await getMarketingLeads({ status: statusFilter || undefined, assigned_telesale_id: selectedTelesale || undefined });
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00+07:00`) : null;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999+07:00`) : null;
      rows = rows.filter((lead) => { const value = new Date(lead.created_at || 0); return (!from || value >= from) && (!to || value <= to); });
      if (!rows.length) { showToast('Không có dữ liệu phù hợp để xuất.', true); return; }
      exportLeadsToCSV(rows, `Ho_so_Telesale_${reportDate}.csv`);
      showToast(`Đã xuất ${rows.length} hồ sơ.`);
    } catch (error) { showToast(error.message || 'Không thể xuất dữ liệu.', true); }
  });
  document.querySelectorAll('[data-lead-history]').forEach((button) => button.addEventListener('click', async () => {
    const panel = document.getElementById('tsmHistoryPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = '<div class="tsm-empty">Đang tải lịch sử chăm sóc...</div>';
    try {
      const logs = await getLeadCallLogs(button.dataset.leadHistory);
      panel.innerHTML = `<div class="section-title"><div><h3>Hồ sơ chăm sóc: ${escapeHTML(button.dataset.leadName || '')}</h3><p class="subtle">Toàn bộ lịch sử cuộc gọi và cập nhật cũ đã lưu.</p></div><button type="button" class="secondary-button" id="tsmCloseHistory">Đóng</button></div>${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người chăm sóc</th><th>Kết quả</th><th>Nội dung</th><th>Lịch hẹn</th></tr></thead><tbody>${logs.map((log) => `<tr><td>${formatDateTime(log.created_at)}</td><td>${escapeHTML(log.telesale_name || log.telesale_code || log.telesale_id || 'Chưa xác định')}</td><td>${escapeHTML(LEAD_STATUS[log.call_status] || log.call_status || 'Đã liên hệ')}</td><td>${escapeHTML(log.note || 'Không có ghi chú')}</td><td>${log.appointment_at || log.appointment_date ? formatDateTime(log.appointment_at || log.appointment_date) : 'Không có'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="tsm-empty">Hồ sơ này chưa có lịch sử chăm sóc.</div>'}`;
      document.getElementById('tsmCloseHistory')?.addEventListener('click', () => { panel.hidden = true; panel.innerHTML = ''; });
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) { panel.innerHTML = `<div class="tsm-empty">${escapeHTML(error.message || 'Không thể tải lịch sử chăm sóc.')}</div>`; }
  }));
  document.getElementById('tsmReportDate')?.addEventListener('change', (event) => { reportDate = event.target.value || today(); rerender(); });
  document.getElementById('tsmMemberFilter')?.addEventListener('change', (event) => { selectedTelesale = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmDateFrom')?.addEventListener('change', (event) => { dateFrom = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmDateTo')?.addEventListener('change', (event) => { dateTo = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmStatus')?.addEventListener('change', (event) => { statusFilter = event.target.value; currentPage = 1; rerender(); });
  document.getElementById('tsmClearMember')?.addEventListener('click', () => { selectedTelesale = ''; currentPage = 1; rerender(); });
  document.getElementById('tsmResetFilters')?.addEventListener('click', () => { selectedTelesale = ''; dateFrom = ''; dateTo = ''; statusFilter = ''; currentPage = 1; rerender(); });
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
