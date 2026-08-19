import {
  cancelPgAssignment, createPgAccount, createPgAssignment, deletePgAccount, exportPgAttendanceCsv,
  getMarketingLeadPage, getMarketingReports, getPgAccounts, getPgAssignmentHistory, getPgAssignments, getPgAttendance, getPgSites, updatePgAccount,
} from '../services/marketing.js';
import { LEAD_STATUS } from '../constants.js';
import { leadStatusPill } from '../components/shared.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { navigateTo } from '../router.js';
import { geolocationErrorMessage } from '../services/geolocation.js';
import { store } from '../store.js';

let accounts = [];
let sites = [];
let assignments = [];
let assignmentHistory = [];
let assignmentHistoryFrom = '';
let assignmentHistoryTo = '';
let assignmentHistoryStatus = '';
let report = { totals: {}, pg: [], telesale: [] };
let attendance = [];
let attendanceFrom = '';
let attendanceTo = '';
let pgLeadPage = 1;
let pgLeadSearch = '';
let pgLeadCode = '';
let pgLeadDataClass = '';
let pgLeadNetLevel = '';
let pgLeadStatus = '';
let pgLeadBranch = '';
let pgLeadAssignment = '';
let pgLeadDateFrom = '';
let pgLeadDateTo = '';
const PG_LEAD_PAGE_SIZE = 25;

function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }
function daysAgo(days) { return new Date(Date.now() - days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }
const ASSIGNMENT_STATUS = {
  scheduled: ['Đã phân công', 'info'], checked_in: ['Đang trong ca', 'warning'], completed: ['Hoàn thành', 'success'],
  cancelled: ['Đã hủy', 'danger'], expired: ['Tự hết hạn', 'muted'],
};
function assignmentStatus(row) { return ASSIGNMENT_STATUS[row.status] || [row.status || 'Đã phân công', 'muted']; }

export async function renderView() {
  attendanceFrom ||= today();
  attendanceTo ||= today();
  assignmentHistoryFrom ||= daysAgo(30);
  assignmentHistoryTo ||= today();
  const adminOperations = store.getState().role !== 'support_marketing';
  const pgLeadRequest = getMarketingLeadPage({
    page: pgLeadPage, page_size: PG_LEAD_PAGE_SIZE, pg_only: true,
    search: pgLeadSearch || undefined, pg_code: pgLeadCode || undefined,
    data_class: pgLeadDataClass || undefined, net_level: pgLeadNetLevel || undefined,
    status: pgLeadStatus || undefined, branch_id: pgLeadBranch || undefined,
    assignment: pgLeadAssignment || undefined,
    date_from: pgLeadDateFrom || undefined, date_to: pgLeadDateTo || undefined,
  });
  const loaded = await Promise.all([
    getPgAccounts(),
    getPgSites(),
    getPgAssignments(today()),
    getMarketingReports(),
    adminOperations ? getPgAttendance(attendanceFrom, attendanceTo) : Promise.resolve([]),
    pgLeadRequest,
    getPgAssignmentHistory(assignmentHistoryFrom, assignmentHistoryTo, assignmentHistoryStatus),
  ]);
  [accounts, sites, assignments, report, attendance] = loaded;
  assignmentHistory = loaded[6] || [];
  const pgLeadResult = loaded[5];
  const totals = report.totals || {};
  const pgRows = report.pg || [];
  const maxCount = pgRows.length ? Math.max(...pgRows.map((row) => Number(row.total || 0))) : 0;
  const minCount = pgRows.length ? Math.min(...pgRows.map((row) => Number(row.total || 0))) : 0;
  const pgLeads = pgLeadResult.data || [];
  const pgLeadMeta = pgLeadResult.meta || { page: 1, pageSize: PG_LEAD_PAGE_SIZE, total: 0 };
  const pgLeadTotal = Number(pgLeadMeta.total || 0);
  const pgLeadPages = Math.max(1, Math.ceil(pgLeadTotal / PG_LEAD_PAGE_SIZE));
  const pgLeadStart = pgLeadTotal ? ((Number(pgLeadMeta.page || 1) - 1) * PG_LEAD_PAGE_SIZE) + 1 : 0;
  const pgOptions = pgRows
    .filter((row) => row.pg_code)
    .map((row) => ({ code: row.pg_code, name: row.pg_name || row.pg_code }))
    .sort((left, right) => left.name.localeCompare(right.name, 'vi', { sensitivity: 'base' }));
  const pgAccountNames = new Map(accounts.map((row) => [
    String(row.profile?.employee_code || '').toLowerCase(),
    row.employee?.full_name || row.profile?.full_name || row.profile?.employee_code || '',
  ]));
  const pgReportNames = new Map(pgRows.map((row) => [String(row.pg_code || '').toLowerCase(), row.pg_name || row.pg_code]));
  const pgDisplayName = (code) => pgAccountNames.get(String(code || '').toLowerCase())
    || pgReportNames.get(String(code || '').toLowerCase()) || code || 'PG';

  return `
    <div class="view-header"><div><p class="eyebrow">PG OPERATIONS</p><h3>Quản lý tài khoản, dữ liệu và chấm công PG</h3></div></div>

    ${adminOperations ? `<div class="shift-overview-metrics">
      <article><span>Tài khoản PG</span><strong>${accounts.length}</strong><small>${accounts.filter((row) => row.login_active).length} đang hoạt động</small></article>
      <article><span>Tổng data</span><strong>${Number(totals.total || 0)}</strong><small>${Number(totals.raw_count || 0)} thô · ${Number(totals.net_count || 0)} net</small></article>
      <article><span>PG nhiều data nhất</span><strong>${maxCount}</strong><small>${escapeHTML(pgRows.find((row) => Number(row.total) === maxCount)?.pg_name || 'Chưa có')}</small></article>
      <article><span>PG ít data nhất</span><strong>${minCount}</strong><small>${escapeHTML(pgRows.find((row) => Number(row.total) === minCount)?.pg_name || 'Chưa có')}</small></article>
    </div>` : ''}

    ${adminOperations ? `<div class="grid">
      <section class="panel">
        <div class="section-title"><h3>Tạo tài khoản PG</h3><span class="pill">Chỉ nhập data và chấm công</span></div>
        <form id="pgAccountForm" class="form-grid two pg-compact-form" autocomplete="off">
          <label class="form-field"><span>Họ tên</span><input name="fullName" required placeholder="Nguyễn Văn A"></label>
          <label class="form-field"><span>Mã PG</span><input name="employeeCode" placeholder="PG-001"></label>
          <label class="form-field"><span>Email đăng nhập</span><input name="pgEmail" type="email" autocomplete="off" data-1p-ignore required></label>
          <label class="form-field"><span>Số điện thoại</span><input name="pgPhone" autocomplete="off" data-1p-ignore required inputmode="numeric"></label>
          <label class="form-field"><span>Mật khẩu ban đầu</span><input name="pgPassword" type="password" autocomplete="new-password" data-1p-ignore minlength="8" placeholder="Mặc định dùng SĐT"></label>
          <label class="form-field"><span>Chi nhánh quản lý</span><select name="branchId"><option value="pham-van-chieu">Phạm Văn Chiêu</option><option value="le-van-tho">Lê Văn Thọ</option></select></label>
          <button class="primary-button full" type="submit">Tạo tài khoản PG</button>
        </form>
      </section>

    </div>` : ''}

    <section class="panel pg-assignment-panel" style="margin-top:14px">
      <div class="section-title"><div><h3>Phân công vị trí và thời gian</h3><p class="subtle">PG nhận thông báo ngay; chấm công chỉ mở theo ca và vị trí còn hiệu lực.</p></div><span class="pill">Mỗi PG · mỗi ngày một ca</span></div>
      <form id="pgAssignmentForm" class="pg-assignment-form">
        <label class="form-field"><span>Nhân viên PG</span><select name="pgCode" required><option value="">Chọn PG theo tên</option>${accounts.map((row) => `<option value="${escapeHTML(row.profile?.employee_code || '')}">${escapeHTML(row.employee?.full_name || row.profile?.full_name || row.profile?.employee_code || '')}</option>`).join('')}</select></label>
        <label class="form-field"><span>Vị trí</span><select name="siteId" required><option value="">Chọn vị trí</option>${sites.map((site) => `<option value="${site.id}">${escapeHTML(site.name)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Ngày làm</span><input name="workDate" type="date" value="${today()}" required></label>
        <label class="form-field"><span>Giờ vào</span><input name="startTime" type="time" value="08:00" required></label>
        <label class="form-field"><span>Giờ ra</span><input name="endTime" type="time" value="17:00" required></label>
        <button class="primary-button pg-assignment-submit" type="submit"><i class="ri-send-plane-line"></i> Giao cho PG</button>
      </form>
      <div class="table-wrap pg-assignment-table"><table><thead><tr><th>PG</th><th>Ngày</th><th>Ca</th><th>Vị trí</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        ${assignments.length ? assignments.map((row) => { const [label, tone] = assignmentStatus(row); const cancellable = ['scheduled', 'checked_in'].includes(row.status || 'scheduled'); return `<tr><td><strong>${escapeHTML(pgDisplayName(row.pg_code))}</strong><small>${escapeHTML(row.pg_code)}</small></td><td>${escapeHTML(String(row.work_date).slice(0,10))}</td><td>${escapeHTML(String(row.start_time).slice(0,5))}–${escapeHTML(String(row.end_time).slice(0,5))}</td><td><strong>${escapeHTML(row.site_name)}</strong><small>${escapeHTML(row.address)}</small></td><td><span class="assignment-status is-${tone}">${escapeHTML(label)}</span></td><td>${cancellable ? `<button class="danger-button pg-assignment-remove" type="button" data-cancel-pg-assignment="${escapeHTML(row.id)}"><i class="ri-close-circle-line"></i> Hủy phân công</button>` : '<span class="subtle">Đã khóa thao tác</span>'}</td></tr>`; }).join('') : '<tr><td colspan="6">Chưa có phân công hôm nay.</td></tr>'}
      </tbody></table></div>
    </section>

    <section class="panel pg-assignment-history" style="margin-top:14px">
      <div class="section-title"><div><p class="eyebrow">LỊCH SỬ PHÂN CÔNG</p><h3>Đối soát ca PG</h3><p class="subtle">Lưu cả phân công đã hủy, tự hết hạn, check-in và hoàn thành.</p></div><span class="pill">${assignmentHistory.length} bản ghi</span></div>
      <form id="pgAssignmentHistoryFilter" class="pg-assignment-history-filter">
        <label class="form-field"><span>Từ ngày</span><input name="from" type="date" value="${assignmentHistoryFrom}"></label>
        <label class="form-field"><span>Đến ngày</span><input name="to" type="date" value="${assignmentHistoryTo}"></label>
        <label class="form-field"><span>Trạng thái</span><select name="status"><option value="">Tất cả trạng thái</option>${Object.entries(ASSIGNMENT_STATUS).map(([value, item]) => `<option value="${value}"${assignmentHistoryStatus === value ? ' selected' : ''}>${item[0]}</option>`).join('')}</select></label>
        <button class="secondary-button" type="submit"><i class="ri-filter-3-line"></i> Lọc lịch sử</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>PG</th><th>Ngày · ca</th><th>Vị trí</th><th>Trạng thái</th><th>Người xử lý / lý do</th></tr></thead><tbody>
        ${assignmentHistory.length ? assignmentHistory.map((row) => { const [label, tone] = assignmentStatus(row); const lastEvent = Array.isArray(row.events) ? row.events.at(-1) : null; return `<tr><td><strong>${escapeHTML(row.pg_name || row.pg_code)}</strong><small>${escapeHTML(row.pg_code)}</small></td><td><strong>${escapeHTML(String(row.work_date).slice(0,10))}</strong><small>${escapeHTML(String(row.start_time).slice(0,5))}–${escapeHTML(String(row.end_time).slice(0,5))}</small></td><td><strong>${escapeHTML(row.site_name)}</strong><small>${escapeHTML(row.address)}</small></td><td><span class="assignment-status is-${tone}">${escapeHTML(label)}</span></td><td><strong>${escapeHTML(lastEvent?.actor_code || row.created_by_code || 'Hệ thống')}</strong><small>${escapeHTML(row.cancel_reason || lastEvent?.reason || (row.status === 'expired' ? 'Tự động hết hạn do chưa check-in' : '—'))}</small></td></tr>`; }).join('') : '<tr><td colspan="5">Không có phân công phù hợp bộ lọc.</td></tr>'}
      </tbody></table></div>
    </section>

    ${adminOperations ? `<section class="panel" style="margin-top:14px">
      <div class="section-title"><h3>Danh sách tài khoản PG</h3><span class="pill">${accounts.length} tài khoản</span></div>
      <div class="table-wrap"><table><thead><tr><th>PG</th><th>Liên hệ</th><th>Chi nhánh</th><th>Đăng nhập cuối</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        ${accounts.length ? accounts.map((row) => { const code = row.profile?.employee_code || ''; return `<tr>
          <td><strong>${escapeHTML(row.employee?.full_name || row.profile?.full_name || '')}</strong><br><span class="subtle">${escapeHTML(code)}</span></td>
          <td>${escapeHTML(row.employee?.email || '')}<br><span class="subtle">${escapeHTML(row.employee?.phone || '')}</span></td>
          <td>${escapeHTML(row.profile?.branch_id || '')}</td><td>${row.last_login_at ? new Date(row.last_login_at).toLocaleString('vi-VN') : 'Chưa đăng nhập'}</td>
          <td><span class="pill">${row.login_active ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
          <td><div class="button-row pg-account-actions"><button class="secondary-button" data-edit-pg="${escapeHTML(code)}"><i class="ri-edit-line"></i> Sửa</button><button class="secondary-button" data-toggle-pg="${escapeHTML(code)}" data-active="${row.login_active ? '1' : '0'}"><i class="ri-lock-line"></i> ${row.login_active ? 'Khóa' : 'Mở khóa'}</button><button class="danger-button" data-delete-pg="${escapeHTML(code)}"><i class="ri-delete-bin-line"></i> Xóa</button></div></td>
        </tr>`; }).join('') : '<tr><td colspan="6">Chưa có tài khoản PG.</td></tr>'}
      </tbody></table></div>
    </section>` : ''}

    <section class="panel" style="margin-top:14px">
      <div class="section-title"><h3>Báo cáo data theo tài khoản PG</h3><span class="pill">Dữ liệu PostgreSQL</span></div>
      <div class="table-wrap"><table><thead><tr><th>PG</th><th>Tổng</th><th>Data thô</th><th>Net cơ bản</th><th>Net chuyên sâu</th></tr></thead><tbody>
        ${pgRows.length ? pgRows.map((row) => `<tr><td><strong>${escapeHTML(row.pg_name || row.pg_code)}</strong><small>${escapeHTML(row.pg_code)}</small></td><td>${row.total}</td><td>${row.raw_count}</td><td>${row.net_basic_count}</td><td>${row.net_advanced_count}</td></tr>`).join('') : '<tr><td colspan="5">Chưa có data PG.</td></tr>'}
      </tbody></table></div>
    </section>

    <section class="panel pg-lead-audit-panel" style="margin-top:14px">
      <div class="section-title"><div><p class="eyebrow">KIỂM TRA DATA PG</p><h3>Data PG đã nhập</h3><p class="subtle">Tìm gần đúng và lọc trực tiếp trên PostgreSQL. Chỉ hiển thị nguồn do tài khoản PG nhập.</p></div><span class="pill">${pgLeadTotal.toLocaleString('vi-VN')} hồ sơ</span></div>
      <form id="pgLeadFilter" class="pg-lead-filter-grid" autocomplete="off">
        <label class="form-field pg-lead-search"><span>Tìm thông minh</span><div class="pg-lead-search-input"><i class="ri-search-line"></i><input id="pgLeadSearch" name="search" value="${escapeHTML(pgLeadSearch)}" placeholder="Tên khách, SĐT, mã/tên PG, dịch vụ hoặc nguồn"></div></label>
        <label class="form-field"><span>PG nhập</span><select name="pgCode"><option value="">Tất cả PG</option>${pgOptions.map((pg) => `<option value="${escapeHTML(pg.code)}"${pgLeadCode === pg.code ? ' selected' : ''}>${escapeHTML(pg.name)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Phân loại</span><select name="dataClass"><option value="">Tất cả data</option><option value="raw"${pgLeadDataClass === 'raw' ? ' selected' : ''}>Data thô</option><option value="net"${pgLeadDataClass === 'net' ? ' selected' : ''}>Data net</option></select></label>
        <label class="form-field"><span>Cấp độ net</span><select name="netLevel"${pgLeadDataClass && pgLeadDataClass !== 'net' ? ' disabled' : ''}><option value="">Tất cả cấp độ</option><option value="basic"${pgLeadNetLevel === 'basic' ? ' selected' : ''}>Net cơ bản</option><option value="advanced"${pgLeadNetLevel === 'advanced' ? ' selected' : ''}>Net chuyên sâu</option></select></label>
        <label class="form-field"><span>Trạng thái</span><select name="status"><option value="">Tất cả trạng thái</option>${Object.entries(LEAD_STATUS).map(([value, label]) => `<option value="${value}"${pgLeadStatus === value ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Chi nhánh</span><select name="branchId"><option value="">Cả hai chi nhánh</option><option value="pham-van-chieu"${pgLeadBranch === 'pham-van-chieu' ? ' selected' : ''}>Phạm Văn Chiêu</option><option value="le-van-tho"${pgLeadBranch === 'le-van-tho' ? ' selected' : ''}>Lê Văn Thọ</option></select></label>
        <label class="form-field"><span>Phân bổ Telesale</span><select name="assignment"><option value="">Tất cả</option><option value="unassigned"${pgLeadAssignment === 'unassigned' ? ' selected' : ''}>Chưa gán Telesale</option><option value="assigned"${pgLeadAssignment === 'assigned' ? ' selected' : ''}>Đã gán Telesale</option></select></label>
        <label class="form-field"><span>Từ ngày PG nhập</span><input name="dateFrom" type="date" value="${escapeHTML(pgLeadDateFrom)}" max="${escapeHTML(pgLeadDateTo || today())}"></label>
        <label class="form-field"><span>Đến ngày PG nhập</span><input name="dateTo" type="date" value="${escapeHTML(pgLeadDateTo)}" min="${escapeHTML(pgLeadDateFrom)}" max="${today()}"></label>
        <button class="secondary-button pg-lead-reset" type="button" data-reset-pg-leads><i class="ri-refresh-line"></i> Xóa lọc</button>
      </form>
      <div class="pg-lead-suggestions" aria-label="Lọc nhanh"><span>Gợi ý nhanh:</span><button type="button" data-pg-lead-preset="unassigned-new">PG mới nhập · chưa gán</button><button type="button" data-pg-lead-preset="net">Data net của PG</button><button type="button" data-pg-lead-preset="raw">Data thô của PG</button><button type="button" data-pg-lead-preset="all">Toàn bộ data PG</button></div>
      <div class="table-wrap pg-lead-table-wrap"><table class="pg-lead-table"><thead><tr><th>STT</th><th>Khách hàng</th><th>PG nhập</th><th>Phân loại</th><th>Dịch vụ / lịch hẹn</th><th>Telesale</th><th>Trạng thái</th><th>Nguồn · ngày nhập</th></tr></thead><tbody>
        ${pgLeads.length ? pgLeads.map((lead, index) => {
          const profile = lead.customer_profile || {};
          const appointment = profile.appointmentText || (lead.appointment_at ? new Date(lead.appointment_at).toLocaleString('vi-VN') : 'Chưa có lịch hẹn');
          const dataLabel = lead.data_class === 'net' ? `Data net${lead.net_level === 'advanced' ? ' · Chuyên sâu' : ' · Cơ bản'}` : 'Data thô';
          return `<tr><td>${pgLeadStart + index}</td><td><strong>${escapeHTML(lead.full_name || '')}</strong><small>${escapeHTML(lead.phone || 'Chưa có số điện thoại')}</small></td><td><strong>${escapeHTML(lead.created_by_name || pgDisplayName(lead.created_by_pg))}</strong><small>${escapeHTML(lead.created_by_pg || 'PG')}</small></td><td><span class="pg-data-tag ${lead.data_class === 'net' ? 'is-net' : 'is-raw'}">${escapeHTML(dataLabel)}</span></td><td><strong>${escapeHTML(lead.service_interest || 'Chưa xác định')}</strong><small>${escapeHTML(appointment)}</small></td><td>${lead.assigned_telesale_id ? `<strong>${escapeHTML(lead.assigned_telesale_id)}</strong>` : '<span class="pg-unassigned">Chưa gán</span>'}</td><td>${leadStatusPill(lead.status)}</td><td><strong>${escapeHTML(lead.source || 'PG')}</strong><small>${lead.created_at ? new Date(lead.created_at).toLocaleString('vi-VN') : '—'}</small></td></tr>`;
        }).join('') : '<tr><td colspan="8" class="pg-lead-empty">Không có data PG phù hợp bộ lọc.</td></tr>'}
      </tbody></table></div>
      <div class="data-pagination"><span class="data-pagination-summary">Hiển thị ${pgLeadStart}–${Math.min(pgLeadStart + pgLeads.length - 1, pgLeadTotal)} trong ${pgLeadTotal.toLocaleString('vi-VN')} data PG</span><div class="data-pagination-actions"><button type="button" class="data-page-nav" data-pg-lead-page="${Math.max(1, Number(pgLeadMeta.page || 1) - 1)}"${Number(pgLeadMeta.page || 1) <= 1 ? ' disabled' : ''}>‹ <span>Trước</span></button><label class="data-page-picker"><span>Trang</span><select aria-label="Chọn trang data PG" data-pg-lead-page-select>${Array.from({ length: pgLeadPages }, (_, index) => `<option value="${index + 1}"${index + 1 === Number(pgLeadMeta.page || 1) ? ' selected' : ''}>${index + 1}/${pgLeadPages}</option>`).join('')}</select></label><button type="button" class="data-page-nav" data-pg-lead-page="${Math.min(pgLeadPages, Number(pgLeadMeta.page || 1) + 1)}"${Number(pgLeadMeta.page || 1) >= pgLeadPages ? ' disabled' : ''}><span>Sau</span> ›</button></div></div>
    </section>

    ${adminOperations ? `<section class="panel" style="margin-top:14px">
      <div class="section-title"><div><h3>Báo cáo chấm công PG</h3><p class="subtle">Lọc theo khoảng ngày và xuất dữ liệu đang hiển thị</p></div><span class="pill">${attendance.length} lượt</span></div>
      <form id="pgAttendanceFilter" class="pg-attendance-filter">
        <label class="form-field"><span>Từ ngày</span><input name="from" type="date" value="${attendanceFrom}" required></label>
        <label class="form-field"><span>Đến ngày</span><input name="to" type="date" value="${attendanceTo}" required></label>
        <button class="secondary-button" type="submit">Lọc dữ liệu</button>
        <button id="exportPgAttendance" class="primary-button" type="button">Xuất Excel/CSV</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>PG</th><th>Loại</th><th>Thời gian</th><th>Vị trí</th><th>GPS</th><th>Trạng thái</th></tr></thead><tbody>
        ${attendance.length ? attendance.map((row) => `<tr><td><strong>${escapeHTML(row.pg_code)}</strong></td><td>${row.record_type === 'checkin' ? 'Vào ca' : 'Ra ca'}</td><td>${new Date(row.recorded_at).toLocaleString('vi-VN')}</td><td>${escapeHTML(row.site_name)}</td><td>${row.distance_m} m · ±${row.accuracy_m} m</td><td>${escapeHTML(row.status)}</td></tr>`).join('') : '<tr><td colspan="6">Chưa có lượt chấm công hôm nay.</td></tr>'}
      </tbody></table></div>
    </section>` : ''}

    ${adminOperations ? `<dialog id="editPgDialog" class="app-dialog">
      <form id="editPgForm" method="dialog" class="dialog-card">
        <div class="section-title"><div><p class="eyebrow">TÀI KHOẢN PG</p><h3>Chỉnh sửa tài khoản</h3></div><button type="button" class="icon-button" data-close-pg-dialog aria-label="Đóng">×</button></div>
        <input name="employeeCode" type="hidden">
        <div class="form-grid two">
          <label class="form-field"><span>Họ tên</span><input name="fullName" required></label>
          <label class="form-field"><span>Email</span><input name="email" type="email" required></label>
          <label class="form-field"><span>Số điện thoại</span><input name="phone" inputmode="numeric" required></label>
          <label class="form-field"><span>Mật khẩu mới</span><input name="password" type="password" minlength="8" placeholder="Để trống nếu không đổi"></label>
        </div>
        <div class="button-row pg-dialog-actions"><button type="button" class="secondary-button" data-close-pg-dialog>Hủy</button><button type="submit" class="primary-button">Lưu thay đổi</button></div>
      </form>
    </dialog>` : ''}`;
}

async function refresh(message) {
  if (message) showToast(message);
  await navigateTo('pg-management');
}

export function initView() {
  const applyPgLeadFilters = async (form, { resetPage = true } = {}) => {
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    pgLeadSearch = String(data.search || '').trim();
    pgLeadCode = String(data.pgCode || '');
    pgLeadDataClass = String(data.dataClass || '');
    pgLeadNetLevel = pgLeadDataClass === 'net' ? String(data.netLevel || '') : '';
    pgLeadStatus = String(data.status || '');
    pgLeadBranch = String(data.branchId || '');
    pgLeadAssignment = String(data.assignment || '');
    pgLeadDateFrom = String(data.dateFrom || '');
    pgLeadDateTo = String(data.dateTo || '');
    if (pgLeadDateFrom && pgLeadDateTo && pgLeadDateFrom > pgLeadDateTo) {
      showToast('Từ ngày PG nhập không được sau Đến ngày.', true);
      return;
    }
    if (resetPage) pgLeadPage = 1;
    await navigateTo('pg-management');
  };
  const pgLeadFilter = document.getElementById('pgLeadFilter');
  let pgLeadSearchTimer = 0;
  pgLeadFilter?.addEventListener('change', (event) => applyPgLeadFilters(event.currentTarget));
  document.getElementById('pgLeadSearch')?.addEventListener('input', (event) => {
    window.clearTimeout(pgLeadSearchTimer);
    pgLeadSearchTimer = window.setTimeout(() => applyPgLeadFilters(event.currentTarget.closest('form')), 300);
  });
  document.querySelectorAll('[data-pg-lead-page]').forEach((button) => button.addEventListener('click', async () => {
    pgLeadPage = Number(button.dataset.pgLeadPage || 1);
    await navigateTo('pg-management');
  }));
  document.querySelector('[data-pg-lead-page-select]')?.addEventListener('change', async (event) => {
    pgLeadPage = Number(event.currentTarget.value || 1);
    await navigateTo('pg-management');
  });
  document.querySelector('[data-reset-pg-leads]')?.addEventListener('click', async () => {
    pgLeadSearch = ''; pgLeadCode = ''; pgLeadDataClass = ''; pgLeadNetLevel = ''; pgLeadStatus = ''; pgLeadBranch = ''; pgLeadAssignment = ''; pgLeadDateFrom = ''; pgLeadDateTo = ''; pgLeadPage = 1;
    await navigateTo('pg-management');
  });
  document.querySelectorAll('[data-pg-lead-preset]').forEach((button) => button.addEventListener('click', async () => {
    const preset = button.dataset.pgLeadPreset;
    pgLeadSearch = ''; pgLeadCode = ''; pgLeadStatus = ''; pgLeadBranch = ''; pgLeadNetLevel = ''; pgLeadDateFrom = ''; pgLeadDateTo = '';
    if (preset === 'unassigned-new') { pgLeadDataClass = ''; pgLeadStatus = 'new'; pgLeadAssignment = 'unassigned'; }
    else if (preset === 'net') { pgLeadDataClass = 'net'; pgLeadAssignment = ''; }
    else if (preset === 'raw') { pgLeadDataClass = 'raw'; pgLeadAssignment = ''; }
    else { pgLeadDataClass = ''; pgLeadAssignment = ''; }
    pgLeadPage = 1;
    await navigateTo('pg-management');
  }));
  document.getElementById('pgAccountForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.email = data.pgEmail; data.phone = data.pgPhone; data.password = data.pgPassword;
    delete data.pgEmail; delete data.pgPhone; delete data.pgPassword;
    if (!data.password) data.password = data.phone;
    try { await createPgAccount(data); await refresh('Đã tạo tài khoản PG.'); } catch (error) { showToast(error.message, true); }
  });
  const siteForm = document.getElementById('pgSiteForm');
  const locationResults = document.getElementById('pgLocationResults');
  const locationQuery = document.getElementById('pgLocationQuery');
  const searchButton = document.getElementById('searchPgLocation');
  const siteSaveLabel = siteForm?.querySelector('.pg-save-site-button span');
  const cancelSiteEdit = document.getElementById('cancelPgSiteEdit');
  const resetSiteForm = () => {
    siteForm?.reset();
    if (siteForm?.elements.editingSiteId) siteForm.elements.editingSiteId.value = '';
    if (siteSaveLabel) siteSaveLabel.textContent = 'Lưu điểm chấm công';
    if (cancelSiteEdit) cancelSiteEdit.hidden = true;
    locationResults?.setAttribute('hidden', '');
    const preview = document.getElementById('pgMapPreview');
    if (preview) { preview.className = 'pg-map-preview is-empty'; preview.innerHTML = '<div><i class="ri-map-2-line"></i><strong>Chưa chọn vị trí</strong><span>Tìm địa chỉ hoặc dùng GPS thiết bị để xem bản đồ.</span></div>'; }
  };
  const loadSiteIntoForm = (site, editing = false) => {
    if (!siteForm || !site) return;
    siteForm.elements.editingSiteId.value = editing ? site.id : '';
    siteForm.elements.name.value = site.name || '';
    siteForm.elements.allowedRadiusM.value = site.allowed_radius_m || 100;
    siteForm.elements.maxAccuracyM.value = site.max_accuracy_m || 100;
    selectPgLocation(siteForm, site);
    if (siteSaveLabel) siteSaveLabel.textContent = editing ? 'Lưu thay đổi' : 'Lưu điểm chấm công';
    if (cancelSiteEdit) cancelSiteEdit.hidden = !editing;
    siteForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  let locationSearchTimer = 0;
  let locationSearchRequest = 0;
  let activeLocationIndex = -1;
  let visibleLocationResults = [];
  const locationCache = new Map();
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const renderLocationResults = (results) => {
    visibleLocationResults = results;
    activeLocationIndex = -1;
    locationResults.hidden = false;
    locationResults.innerHTML = results.length ? results.map((row, index) => `<button type="button" data-pg-location-result="${index}" role="option" aria-selected="false"><i class="ri-map-pin-line"></i><span><strong>${escapeHTML(row.name || 'Địa điểm')}</strong><small>${escapeHTML(row.address)}</small>${row.saved ? '<em>Điểm đã lưu</em>' : ''}</span><i class="ri-arrow-right-s-line"></i></button>`).join('') : '<p class="subtle">Không có kết quả. Hãy nhập tên địa điểm hoặc địa chỉ chi tiết hơn.</p>';
    locationResults.querySelectorAll('[data-pg-location-result]').forEach((button) => button.addEventListener('click', () => selectPgLocation(siteForm, visibleLocationResults[Number(button.dataset.pgLocationResult)])));
  };
  const setActiveLocation = (nextIndex) => {
    const buttons = [...locationResults.querySelectorAll('[data-pg-location-result]')];
    if (!buttons.length) return;
    activeLocationIndex = (nextIndex + buttons.length) % buttons.length;
    buttons.forEach((button, index) => {
      const active = index === activeLocationIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      if (active) button.scrollIntoView({ block: 'nearest' });
    });
  };
  const searchLocation = async ({ automatic = false } = {}) => {
    if (!locationResults || !searchButton) return;
    const query = String(locationQuery?.value || '').trim();
    if (query.length < 3) {
      if (!automatic) showToast('Nhập ít nhất 3 ký tự để tìm vị trí.', true);
      locationResults.hidden = true;
      return;
    }
    const requestId = ++locationSearchRequest;
    searchButton.disabled = true;
    locationResults.hidden = false;
    locationResults.innerHTML = '<p class="subtle">Đang gợi ý vị trí phù hợp...</p>';
    try {
      const cacheKey = normalize(query);
      const savedMatches = sites.filter((site) => normalize(`${site.name} ${site.address}`).includes(cacheKey)).map((site) => ({ ...site, saved: true }));
      const remoteResults = locationCache.has(cacheKey) ? locationCache.get(cacheKey) : await searchPgLocations(query);
      locationCache.set(cacheKey, remoteResults);
      if (requestId !== locationSearchRequest) return;
      const seen = new Set();
      const results = [...savedMatches, ...remoteResults].filter((row) => {
        const key = `${Number(row.latitude).toFixed(5)}:${Number(row.longitude).toFixed(5)}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).slice(0, 8);
      renderLocationResults(results);
    } catch (error) { locationResults.innerHTML = `<p class="subtle">${escapeHTML(error.message)}</p>`; }
    finally { if (requestId === locationSearchRequest) searchButton.disabled = false; }
  };
  searchButton?.addEventListener('click', () => searchLocation());
  locationQuery?.addEventListener('input', () => {
    window.clearTimeout(locationSearchTimer);
    if (String(locationQuery.value || '').trim().length < 3) { locationResults.hidden = true; return; }
    locationSearchTimer = window.setTimeout(() => searchLocation({ automatic: true }), 320);
  });
  locationQuery?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveLocation(activeLocationIndex + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveLocation(activeLocationIndex - 1); }
    else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeLocationIndex >= 0 && visibleLocationResults[activeLocationIndex]) selectPgLocation(siteForm, visibleLocationResults[activeLocationIndex]);
      else searchLocation();
    } else if (event.key === 'Escape') locationResults.hidden = true;
  });
  document.getElementById('usePgCurrentLocation')?.addEventListener('click', () => {
    if (!navigator.geolocation) return showToast('Thiết bị không hỗ trợ định vị.', true);
    const button = document.getElementById('usePgCurrentLocation');
    button.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        selectPgLocation(siteForm, { latitude, longitude, name: 'Điểm làm việc PG', address: `Vị trí GPS (${latitude.toFixed(6)}, ${longitude.toFixed(6)})` });
        if (siteForm?.elements.maxAccuracyM && Number(accuracy) > 0) siteForm.elements.maxAccuracyM.value = String(Math.max(30, Math.min(200, Math.ceil(accuracy))));
        button.disabled = false;
      },
      (error) => { button.disabled = false; showToast(geolocationErrorMessage(error), true); },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
  siteForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!data.latitude || !data.longitude) return showToast('Hãy tìm và chọn một vị trí trên bản đồ trước.', true);
    const editingSiteId = data.editingSiteId; delete data.editingSiteId;
    try {
      if (editingSiteId) await updatePgSite(editingSiteId, data); else await createPgSite(data);
      await refresh(editingSiteId ? 'Đã cập nhật địa điểm chấm công.' : 'Đã lưu vị trí chấm công PG.');
    } catch (error) { showToast(error.message, true); }
  });
  cancelSiteEdit?.addEventListener('click', resetSiteForm);
  document.querySelectorAll('[data-use-pg-site]').forEach((button) => button.addEventListener('click', () => loadSiteIntoForm(sites.find((site) => String(site.id) === button.dataset.usePgSite), false)));
  document.querySelectorAll('[data-edit-pg-site]').forEach((button) => button.addEventListener('click', () => loadSiteIntoForm(sites.find((site) => String(site.id) === button.dataset.editPgSite), true)));
  document.querySelectorAll('[data-delete-pg-site]').forEach((button) => button.addEventListener('click', async () => {
    if (button.disabled || button.dataset.pending === '1') return;
    const site = sites.find((item) => String(item.id) === button.dataset.deletePgSite);
    if (!site || !await confirmAction(`Xóa địa điểm “${site.name}”?`, { title: 'Xóa địa điểm PG', confirmText: 'Xóa địa điểm', tone: 'danger' })) return;
    button.disabled = true; button.dataset.pending = '1';
    try { await deletePgSite(site.id); await refresh('Đã xóa địa điểm chấm công.'); } catch (error) { showToast(error.message, true); }
    finally { button.disabled = false; delete button.dataset.pending; }
  }));
  document.getElementById('pgAssignmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await createPgAssignment(data); await refresh('Đã giao lịch và vị trí cho PG.'); } catch (error) { showToast(error.message, true); }
  });
  document.querySelectorAll('[data-cancel-pg-assignment]').forEach((button) => button.addEventListener('click', async () => {
    const assignment = assignments.find((row) => String(row.id) === button.dataset.cancelPgAssignment);
    if (!assignment) return;
    const reason = await requestInput(`Hủy phân công ${assignment.pg_code} tại “${assignment.site_name}” ngày ${String(assignment.work_date).slice(0, 10)}. Bản ghi vẫn được lưu để đối soát.`, { title: 'Hủy phân công PG', label: 'Lý do hủy', placeholder: 'VD: PG nghỉ đột xuất, đổi địa điểm hoặc đổi ca...', confirmText: 'Xác nhận hủy', tone: 'danger', maxLength: 500 });
    if (!reason) return;
    button.disabled = true;
    try { await cancelPgAssignment(assignment.id, reason); await refresh('Đã hủy phân công và lưu vào lịch sử.'); } catch (error) { button.disabled = false; showToast(error.message, true); }
  }));
  document.getElementById('pgAssignmentHistoryFilter')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (data.from && data.to && data.from > data.to) return showToast('Ngày bắt đầu không được lớn hơn ngày kết thúc.', true);
    assignmentHistoryFrom = data.from || daysAgo(30); assignmentHistoryTo = data.to || today(); assignmentHistoryStatus = data.status || '';
    await navigateTo('pg-management');
  });
  document.querySelectorAll('[data-toggle-pg]').forEach((button) => button.addEventListener('click', async () => {
    try { await updatePgAccount(button.dataset.togglePg, { active: button.dataset.active !== '1' }); await refresh('Đã cập nhật tài khoản PG.'); } catch (error) { showToast(error.message, true); }
  }));
  document.querySelectorAll('[data-delete-pg]').forEach((button) => button.addEventListener('click', async () => {
    if (!await confirmAction(`Xóa tài khoản ${button.dataset.deletePg}?`, { title: 'Xóa tài khoản PG', confirmText: 'Xóa tài khoản', tone: 'danger' })) return;
    try { await deletePgAccount(button.dataset.deletePg); await refresh('Đã xóa tài khoản PG.'); } catch (error) { showToast(error.message, true); }
  }));
  const editDialog = document.getElementById('editPgDialog');
  const editForm = document.getElementById('editPgForm');
  document.querySelectorAll('[data-edit-pg]').forEach((button) => button.addEventListener('click', () => {
    const code = button.dataset.editPg;
    const row = accounts.find((item) => (item.profile?.employee_code || '') === code);
    if (!row || !editForm || !editDialog) return;
    editForm.elements.employeeCode.value = code;
    editForm.elements.fullName.value = row.employee?.full_name || row.profile?.full_name || '';
    editForm.elements.email.value = row.employee?.email || '';
    editForm.elements.phone.value = row.employee?.phone || '';
    editForm.elements.password.value = '';
    editDialog.showModal();
  }));
  document.querySelectorAll('[data-close-pg-dialog]').forEach((button) => button.addEventListener('click', () => editDialog?.close()));
  editForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(editForm).entries());
    const code = data.employeeCode; delete data.employeeCode;
    if (!data.password) delete data.password;
    try { await updatePgAccount(code, data); editDialog?.close(); await refresh('Đã cập nhật thông tin tài khoản PG.'); } catch (error) { showToast(error.message, true); }
  });
  document.getElementById('pgAttendanceFilter')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (data.from > data.to) return showToast('Ngày bắt đầu không được lớn hơn ngày kết thúc.', true);
    attendanceFrom = data.from; attendanceTo = data.to;
    await navigateTo('pg-management');
  });
  document.getElementById('exportPgAttendance')?.addEventListener('click', async () => {
    try { const count = await exportPgAttendanceCsv(attendanceFrom, attendanceTo); showToast(`Đã xuất ${count} lượt chấm công PG.`); } catch (error) { showToast(error.message, true); }
  });
}
