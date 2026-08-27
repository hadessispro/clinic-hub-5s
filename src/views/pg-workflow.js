import { store } from '../store.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { geolocationErrorMessage } from '../services/geolocation.js';
import { navigateTo } from '../router.js';
import { LEAD_STATUS } from '../constants.js';
import { leadStatusPill } from '../components/shared.js';
import {
  actionPgSupportRequest, cancelPgAssignment, createPgAssignment, createPgLocationSuggestion, createPgSupportRequest,
  confirmPgLeadArrival, getMarketingLeadPage, getPgAccounts, getPgAssignments, getPgLocationSuggestions, getPgSites, getPgSupportRequests, reviewPgLocationSuggestion,
} from '../services/marketing.js';

let suggestions = []; let requests = []; let assignments = []; let accounts = []; let sites = [];
let supportDate = ''; let supportPg = ''; let supportStatus = '';
let leadPage = 1; let leadSearch = ''; let leadPg = ''; let leadClass = ''; let leadStatus = ''; let leadCommission = ''; let leadFrom = ''; let leadTo = '';
// Mỗi lần lọc lại là router dựng lại toàn bộ view, nghĩa là ô tìm kiếm bị
// thay bằng thẻ input mới và mất focus. Cờ này để lấy lại con trỏ sau khi
// render xong, nếu không người dùng gõ được một ký tự rồi đứng.
let restoreLeadSearchFocus = false;
let leadResult = { data: [], meta: { page: 1, pageSize: 25, total: 0 } };
const statusLabel = { pending_admin: 'Chờ Admin duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', submitted: 'Chờ Support', admin_review: 'Chờ Admin', in_progress: 'Support đang xử lý', completed: 'Hoàn tất' };
const assignmentLabels = { scheduled: 'Đã phân công', checked_in: 'Đang trong ca', completed: 'Hoàn thành', cancelled: 'Đã hủy', expired: 'Tự hết hạn' };
const assignmentTones = { scheduled: 'info', checked_in: 'warning', completed: 'success', cancelled: 'danger', expired: 'muted' };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const pill = (value) => `<span class="pill">${escapeHTML(statusLabel[value] || value)}</span>`;
const pgName = (account) => account?.employee?.full_name || account?.profile?.full_name || account?.profile?.employee_code || '';
const assignmentState = (row) => `<span class="assignment-status is-${assignmentTones[row.status] || 'muted'}">${escapeHTML(assignmentLabels[row.status] || row.status || 'Đã phân công')}</span>`;

function renderSupportOperations() {
  const filtered = assignments.filter((row) => (!supportPg || row.pg_code === supportPg) && (!supportStatus || row.status === supportStatus));
  const activeAccounts = accounts.filter((row) => row.login_active !== false && row.profile?.registration_status !== 'pending_approval');
  const assignedCodes = new Set(assignments.filter((row) => !['cancelled', 'expired'].includes(row.status)).map((row) => row.pg_code));
  const displayNames = new Map(accounts.map((row) => [String(row.profile?.employee_code || ''), pgName(row)]));
  return `<section class="panel pg-support-operations">
    <div class="section-title"><div><p class="eyebrow">ĐIỀU PHỐI CA PG</p><h3>Lịch làm việc ngày ${escapeHTML(supportDate)}</h3><p class="subtle">Lọc PG, kiểm tra ca và phân công trực tiếp tại một màn hình.</p></div><span class="pill">${filtered.length} ca hiển thị</span></div>
    <div class="shift-overview-metrics pg-shift-metrics">
      <article><span>PG hoạt động</span><strong>${activeAccounts.length}</strong><small>Tài khoản đang sử dụng</small></article>
      <article><span>Đã có ca</span><strong>${assignedCodes.size}</strong><small>Trong ngày đã chọn</small></article>
      <article><span>Chưa phân công</span><strong>${Math.max(0, activeAccounts.length - assignedCodes.size)}</strong><small>Cần sắp lịch</small></article>
      <article><span>Đã check-in</span><strong>${assignments.filter((row) => ['checked_in', 'completed'].includes(row.status)).length}</strong><small>Đang làm hoặc hoàn tất</small></article>
    </div>
    <form id="pgShiftFilter" class="pg-shift-filter">
      <label class="form-field"><span>Ngày làm việc</span><input name="date" type="date" value="${escapeHTML(supportDate)}"></label>
      <label class="form-field"><span>Nhân viên PG</span><select name="pgCode"><option value="">Tất cả PG</option>${activeAccounts.map((row) => { const code = row.profile?.employee_code || ''; return `<option value="${escapeHTML(code)}"${supportPg === code ? ' selected' : ''}>${escapeHTML(pgName(row))} · ${escapeHTML(code)}</option>`; }).join('')}</select></label>
      <label class="form-field"><span>Trạng thái ca</span><select name="status"><option value="">Tất cả trạng thái</option>${Object.entries(assignmentLabels).map(([value, label]) => `<option value="${value}"${supportStatus === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <button class="secondary-button" type="submit"><i class="ri-filter-3-line"></i> Áp dụng bộ lọc</button>
      <button class="ghost-button" id="resetPgShiftFilter" type="button">Đặt lại</button>
    </form>
    <div class="pg-shift-layout">
      <form id="pgAssignmentForm" class="pg-shift-create">
        <div><strong>Phân công ca mới</strong><p class="subtle">PG nhận lịch ngay sau khi lưu.</p></div>
        <label class="form-field"><span>Nhân viên PG</span><select name="pgCode" required><option value="">Chọn PG</option>${activeAccounts.map((row) => { const code = row.profile?.employee_code || ''; return `<option value="${escapeHTML(code)}">${escapeHTML(pgName(row))} · ${escapeHTML(code)}</option>`; }).join('')}</select></label>
        <label class="form-field"><span>Địa điểm làm việc</span><select name="siteId" required><option value="">Chọn địa điểm</option>${sites.filter((site) => site.active !== false).map((site) => `<option value="${escapeHTML(site.id)}">${escapeHTML(site.name)} · ${escapeHTML(site.address || '')}</option>`).join('')}</select></label>
        <div class="pg-shift-time-fields"><label class="form-field"><span>Ngày</span><input name="workDate" type="date" value="${escapeHTML(supportDate)}" required></label><label class="form-field"><span>Giờ vào</span><input name="startTime" type="time" value="08:00" required></label><label class="form-field"><span>Giờ ra</span><input name="endTime" type="time" value="17:00" required></label></div>
        <button class="primary-button" type="submit"><i class="ri-calendar-check-line"></i> Phân công ca</button>
      </form>
      <div class="pg-shift-results">
        <div class="pg-shift-results-head"><strong>Danh sách ca</strong><span>${filtered.length} kết quả</span></div>
        ${filtered.length ? filtered.map((row) => { const cancellable = ['scheduled', 'checked_in'].includes(row.status || 'scheduled'); return `<article class="pg-shift-card">
          <div class="pg-shift-card-main"><strong>${escapeHTML(displayNames.get(String(row.pg_code)) || row.pg_name || row.pg_code)}</strong><small>${escapeHTML(row.pg_code)} · ${escapeHTML(String(row.start_time).slice(0, 5))}–${escapeHTML(String(row.end_time).slice(0, 5))}</small><p><i class="ri-map-pin-2-line"></i> ${escapeHTML(row.site_name || 'Chưa có địa điểm')}</p><small>${escapeHTML(row.address || '')}</small></div>
          <div class="pg-shift-card-actions">${assignmentState(row)}${cancellable && !row.has_checkin ? `<button class="secondary-button" type="button" data-edit-pg-assignment="${escapeHTML(row.id)}">Sửa / gán lại</button>` : ''}${cancellable ? `<button class="danger-button" type="button" data-cancel-pg-assignment="${escapeHTML(row.id)}">Hủy ca</button>` : ''}</div>
        </article>`; }).join('') : '<div class="empty-state">Không có ca phù hợp bộ lọc trong ngày này.</div>'}
      </div>
    </div>
  </section>`;
}

function renderSupportLeadData() {
  const rows = leadResult.data || []; const meta = leadResult.meta || {};
  const total = Number(meta.total || 0); const pageSize = Number(meta.pageSize || 25); const page = Number(meta.page || 1);
  const pages = Math.max(1, Math.ceil(total / pageSize)); const start = total ? ((page - 1) * pageSize) + 1 : 0;
  const pgOptions = accounts.map((row) => ({ code: row.profile?.employee_code || '', name: pgName(row) })).filter((row) => row.code).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return `<section class="panel pg-support-data">
    <div class="section-title"><div><p class="eyebrow">KHO DATA PG</p><h3>Hồ sơ khách hàng do PG tiếp nhận</h3><p class="subtle">Bộ lọc chạy trực tiếp trên cơ sở dữ liệu; mỗi trang chỉ tải 25 hồ sơ để không làm nặng thiết bị.</p></div><span class="pill">${total.toLocaleString('vi-VN')} hồ sơ</span></div>
    <form id="supportPgLeadFilter" class="pg-lead-filter-grid" autocomplete="off">
      <label class="form-field pg-lead-search"><span>Tìm khách hàng</span><div class="pg-lead-search-input"><i class="ri-search-line"></i><input id="supportPgLeadSearch" name="search" value="${escapeHTML(leadSearch)}" placeholder="Tên, số điện thoại, dịch vụ hoặc nguồn"></div></label>
      <label class="form-field"><span>PG tiếp nhận</span><select name="pgCode"><option value="">Tất cả PG</option>${pgOptions.map((row) => `<option value="${escapeHTML(row.code)}"${leadPg === row.code ? ' selected' : ''}>${escapeHTML(row.name)} · ${escapeHTML(row.code)}</option>`).join('')}</select></label>
      <label class="form-field"><span>Phân loại data</span><select name="dataClass"><option value="">Tất cả</option><option value="raw"${leadClass === 'raw' ? ' selected' : ''}>Data thô</option><option value="net"${leadClass === 'net' ? ' selected' : ''}>Data net</option></select></label>
      <label class="form-field"><span>Trạng thái chăm sóc</span><select name="status"><option value="">Tất cả</option>${Object.entries(LEAD_STATUS).map(([value, label]) => `<option value="${value}"${leadStatus === value ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
      <label class="form-field"><span>Xác nhận khách đến</span><select name="commissionStatus"><option value="">Tất cả</option><option value="pending_confirmation"${leadCommission === 'pending_confirmation' ? ' selected' : ''}>Chờ Support xác nhận</option><option value="eligible"${leadCommission === 'eligible' ? ' selected' : ''}>Đủ điều kiện hoa hồng</option><option value="paid"${leadCommission === 'paid' ? ' selected' : ''}>Đã thanh toán</option><option value="rejected"${leadCommission === 'rejected' ? ' selected' : ''}>Không đủ điều kiện</option></select></label>
      <label class="form-field"><span>Từ ngày PG nhập</span><input name="dateFrom" type="date" value="${escapeHTML(leadFrom)}" max="${escapeHTML(leadTo || today())}"></label>
      <label class="form-field"><span>Đến ngày PG nhập</span><input name="dateTo" type="date" value="${escapeHTML(leadTo)}" min="${escapeHTML(leadFrom)}" max="${today()}"></label>
      <button class="ghost-button" data-reset-support-pg-leads type="button"><i class="ri-refresh-line"></i> Xóa lọc</button>
    </form>
    <div class="table-wrap pg-lead-table-wrap"><table class="pg-lead-table"><thead><tr><th>STT</th><th>Khách hàng</th><th>PG tiếp nhận</th><th>Phân loại</th><th>Dịch vụ</th><th>Telesale</th><th>Trạng thái</th><th>Xác nhận đến / HH</th><th>Ngày nhập</th></tr></thead><tbody>
      ${rows.length ? rows.map((lead, index) => {
        const confirmed = Boolean(lead.pg_arrival_confirmed_at);
        const confirmation = confirmed
          ? `<div class="pg-arrival-confirmed"><span><i class="ri-checkbox-circle-fill"></i> Đã xác nhận</span><strong>Đủ điều kiện HH</strong><small>${escapeHTML(lead.pg_arrival_confirmed_by || 'Support')} · ${new Date(lead.pg_arrival_confirmed_at).toLocaleString('vi-VN')}</small></div>`
          : `<div class="pg-arrival-pending"><small>Chờ Support kiểm tra thực tế</small><button type="button" class="secondary-button" data-support-confirm-arrival="${escapeHTML(lead.id)}" data-customer-name="${escapeHTML(lead.full_name || 'khách hàng')}"><i class="ri-hospital-line"></i> Xác nhận khách đến</button></div>`;
        return `<tr><td>${start + index}</td><td><strong>${escapeHTML(lead.full_name || '')}</strong><small>${escapeHTML(lead.phone || 'Chưa có SĐT')}</small></td><td><strong>${escapeHTML(lead.created_by_name || lead.created_by_pg || 'PG')}</strong><small>${escapeHTML(lead.created_by_pg || '')}</small></td><td><span class="pg-data-tag ${lead.data_class === 'net' ? 'is-net' : 'is-raw'}">${lead.data_class === 'net' ? `Data net${lead.net_level === 'advanced' ? ' · Chuyên sâu' : ' · Cơ bản'}` : 'Data thô'}</span></td><td>${escapeHTML(lead.service_interest || 'Chưa xác định')}</td><td>${lead.assigned_telesale_id ? escapeHTML(lead.assigned_telesale_id) : '<span class="pg-unassigned">Chưa gán</span>'}</td><td>${leadStatusPill(lead.status)}</td><td>${confirmation}</td><td>${lead.created_at ? new Date(lead.created_at).toLocaleString('vi-VN') : '—'}</td></tr>`;
      }).join('') : '<tr><td colspan="9" class="pg-lead-empty">Không có data PG phù hợp bộ lọc.</td></tr>'}
    </tbody></table></div>
    <div class="data-pagination"><span>Hiển thị ${start}–${Math.min(start + rows.length - 1, total)} trong ${total.toLocaleString('vi-VN')} hồ sơ</span><div class="data-pagination-actions"><button class="data-page-nav" data-support-lead-page="${Math.max(1, page - 1)}"${page <= 1 ? ' disabled' : ''}>‹ Trước</button><label class="data-page-picker"><span>Trang</span><select data-support-lead-page-select>${Array.from({ length: pages }, (_, i) => `<option value="${i + 1}"${page === i + 1 ? ' selected' : ''}>${i + 1}/${pages}</option>`).join('')}</select></label><button class="data-page-nav" data-support-lead-page="${Math.min(pages, page + 1)}"${page >= pages ? ' disabled' : ''}>Sau ›</button></div></div>
  </section>`;
}

export async function renderView() {
  const role = store.getState().profile?.role;
  const isPg = role === 'pg_staff'; const isSupport = role === 'support_marketing';
  // Backend cho supportRoles (admin, admin_it, superadmin, admin_marketing,
  // support_marketing) đọc kho data PG và xác nhận khách đến. Trước đây
  // frontend chỉ dựng panel cho support_marketing nên admin không thấy gì.
  const canSeePgData = isSupport || ['admin', 'admin_it', 'admin_marketing', 'superadmin'].includes(role);
  supportDate ||= today();
  [suggestions, requests, assignments, accounts, sites, leadResult] = await Promise.all([
    getPgLocationSuggestions(), getPgSupportRequests(), (isPg || isSupport) ? getPgAssignments(isSupport ? supportDate : today()) : Promise.resolve([]),
    canSeePgData ? getPgAccounts() : Promise.resolve([]), isSupport ? getPgSites() : Promise.resolve([]),
    canSeePgData ? getMarketingLeadPage({ page: leadPage, page_size: 25, pg_only: true, search: leadSearch || undefined, pg_code: leadPg || undefined, data_class: leadClass || undefined, status: leadStatus || undefined, commission_status: leadCommission || undefined, date_from: leadFrom || undefined, date_to: leadTo || undefined }) : Promise.resolve({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
  ]);
  return `${isSupport ? renderSupportOperations() : `<div class="view-header"><div><p class="eyebrow">ĐIỀU PHỐI PG</p><h3>${isPg ? 'Ca làm & hỗ trợ của tôi' : 'Phê duyệt vận hành PG'}</h3></div></div>`}
  ${canSeePgData ? renderSupportLeadData() : ''}
  ${isPg ? `<div class="grid cols-2 pg-workflow-grid">
    <section class="panel"><div class="section-title"><div><h3>Gợi ý chốt tọa độ</h3><p class="subtle">Chỉ gửi gợi ý; GPS chấm công vẫn dùng tọa độ đã được Admin duyệt.</p></div></div>
      <form id="pgSuggestLocation" class="form-grid"><label class="form-field"><span>Phân công hôm nay</span><select name="assignmentId" required><option value="">Chọn phân công</option>${assignments.map(a => `<option value="${a.id}">${escapeHTML(a.site_name)} · ${String(a.start_time).slice(0,5)}–${String(a.end_time).slice(0,5)}</option>`).join('')}</select></label><label class="form-field"><span>Ghi chú vị trí</span><textarea name="note" required placeholder="Mô tả vị trí đứng thực tế, cổng vào hoặc quầy PG"></textarea></label><input name="latitude" type="hidden"><input name="longitude" type="hidden"><input name="accuracy" type="hidden"><button id="captureSuggestionGps" class="secondary-button" type="button"><i class="ri-map-pin-user-line"></i> Lấy GPS hiện tại</button><div id="suggestionGpsState" class="subtle">Chưa lấy tọa độ.</div><button class="primary-button" type="submit">Gửi Admin xác nhận</button></form>
    </section>
    <section class="panel"><div class="section-title"><div><h3>Gửi yêu cầu hỗ trợ</h3><p class="subtle">Support tiếp nhận và xin quyền Admin trước khi xử lý.</p></div></div><form id="pgSupportRequest" class="form-grid"><label class="form-field"><span>Loại yêu cầu</span><select name="requestType"><option value="location_issue">Sai vị trí</option><option value="schedule_change">Đổi lịch / thời gian</option><option value="account_access">Quyền tài khoản</option><option value="data_issue">Dữ liệu</option><option value="other">Khác</option></select></label><label class="form-field"><span>Tiêu đề</span><input name="title" required maxlength="200"></label><label class="form-field"><span>Chi tiết</span><textarea name="detail" required maxlength="3000"></textarea></label><button class="primary-button" type="submit">Gửi Support</button></form></section></div>` : ''}
  <div class="grid cols-2 pg-workflow-grid">
    <section class="panel"><div class="section-title"><div><h3>Gợi ý tọa độ</h3><p class="subtle">${isPg ? 'Lịch sử đề xuất của bạn' : 'Admin kiểm tra trước khi cập nhật điểm làm việc'}</p></div><span class="pill">${suggestions.length}</span></div><div class="pg-workflow-list">${suggestions.length ? suggestions.map(s => `<article><div><strong>${escapeHTML(s.pg_code)} · ${escapeHTML(s.site_name || 'Điểm làm việc')}</strong><p>${Number(s.latitude).toFixed(6)}, ${Number(s.longitude).toFixed(6)} · GPS ±${s.accuracy_m} m</p><small>${escapeHTML(s.note || s.address || 'Không có ghi chú')}</small></div><div>${pill(s.status)}${!isPg && !isSupport && s.status === 'pending_admin' ? `<div class="button-row"><button class="secondary-button" data-review-location="approved" data-id="${s.id}">Duyệt</button><button class="danger-button" data-review-location="rejected" data-id="${s.id}">Từ chối</button></div>` : ''}</div></article>`).join('') : '<div class="empty-state">Chưa có gợi ý tọa độ.</div>'}</div></section>
    <section class="panel"><div class="section-title"><div><h3>Yêu cầu hỗ trợ & xin quyền</h3><p class="subtle">PG → Support → Admin → Support → PG</p></div><span class="pill">${requests.length}</span></div><div class="pg-workflow-list">${requests.length ? requests.map(r => `<article><div><strong>${escapeHTML(r.title)}</strong><p>${escapeHTML(r.pg_code)} · ${escapeHTML(r.request_type)}</p><small>${escapeHTML(r.detail)}</small>${r.resolution ? `<p><b>Phản hồi:</b> ${escapeHTML(r.resolution)}</p>` : ''}</div><div>${pill(r.status)}<div class="button-row">${isSupport && r.status === 'submitted' ? `<button class="primary-button" data-request-action="forward" data-id="${r.id}">Chuyển Admin</button>` : ''}${!isPg && !isSupport && r.status === 'admin_review' ? `<button class="secondary-button" data-request-action="approve" data-id="${r.id}">Cấp quyền</button><button class="danger-button" data-request-action="reject" data-id="${r.id}">Từ chối</button>` : ''}${isSupport && r.status === 'approved' ? `<button class="primary-button" data-request-action="start" data-id="${r.id}">Bắt đầu xử lý</button>` : ''}${isSupport && r.status === 'in_progress' ? `<button class="primary-button" data-request-action="complete" data-id="${r.id}">Hoàn tất & phản hồi</button>` : ''}</div></div></article>`).join('') : '<div class="empty-state">Chưa có yêu cầu hỗ trợ.</div>'}</div></section>
  </div>`;
}

export function initView() {
  let reading = null;
  document.getElementById('captureSuggestionGps')?.addEventListener('click', () => navigator.geolocation.getCurrentPosition(({ coords }) => {
    reading = coords; const form = document.getElementById('pgSuggestLocation'); form.elements.latitude.value = coords.latitude; form.elements.longitude.value = coords.longitude; form.elements.accuracy.value = Math.round(coords.accuracy); document.getElementById('suggestionGpsState').textContent = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} · ±${Math.round(coords.accuracy)} m`;
  }, (error) => showToast(geolocationErrorMessage(error), true), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
  document.getElementById('pgSuggestLocation')?.addEventListener('submit', async (event) => { event.preventDefault(); if (!reading) return showToast('Hãy lấy GPS hiện tại trước.', true); try { await createPgLocationSuggestion(Object.fromEntries(new FormData(event.currentTarget))); showToast('Đã gửi tọa độ chờ Admin duyệt.'); await navigateTo('pg-workflow'); } catch (e) { showToast(e.message, true); } });
  document.getElementById('pgSupportRequest')?.addEventListener('submit', async (event) => { event.preventDefault(); try { await createPgSupportRequest(Object.fromEntries(new FormData(event.currentTarget))); showToast('Đã gửi yêu cầu cho Support.'); await navigateTo('pg-workflow'); } catch (e) { showToast(e.message, true); } });
  document.getElementById('pgShiftFilter')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
    supportDate = data.date || today(); supportPg = data.pgCode || ''; supportStatus = data.status || '';
    await navigateTo('pg-workflow');
  });
  document.getElementById('resetPgShiftFilter')?.addEventListener('click', async () => { supportDate = today(); supportPg = ''; supportStatus = ''; await navigateTo('pg-workflow'); });
  document.getElementById('pgAssignmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); button.disabled = true;
    try { await createPgAssignment(Object.fromEntries(new FormData(event.currentTarget))); showToast('Đã phân công ca và gửi lịch cho PG.'); await navigateTo('pg-workflow'); } catch (e) { button.disabled = false; showToast(e.message, true); }
  });
  document.querySelectorAll('[data-edit-pg-assignment]').forEach((button) => button.addEventListener('click', () => {
    const row = assignments.find((item) => String(item.id) === button.dataset.editPgAssignment); const form = document.getElementById('pgAssignmentForm'); if (!row || !form) return;
    form.elements.pgCode.value = row.pg_code || ''; form.elements.siteId.value = row.site_id || ''; form.elements.workDate.value = String(row.work_date || '').slice(0, 10); form.elements.startTime.value = String(row.start_time || '').slice(0, 5); form.elements.endTime.value = String(row.end_time || '').slice(0, 5);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' }); showToast('Đã nạp ca vào biểu mẫu. Chỉnh thông tin rồi bấm Phân công ca.');
  }));
  document.querySelectorAll('[data-cancel-pg-assignment]').forEach((button) => button.addEventListener('click', async () => {
    const assignment = assignments.find((row) => String(row.id) === button.dataset.cancelPgAssignment); if (!assignment) return;
    const reason = await requestInput(`Ca ${assignment.pg_code} tại “${assignment.site_name}” vẫn được lưu trong lịch sử đối soát.`, { title: 'Hủy ca PG', label: 'Lý do hủy', placeholder: 'PG nghỉ, đổi địa điểm hoặc đổi ca…', confirmText: 'Xác nhận hủy', tone: 'danger', maxLength: 500 });
    if (!reason?.trim()) return; button.disabled = true;
    try { await cancelPgAssignment(assignment.id, reason.trim()); showToast('Đã hủy ca và cập nhật danh sách.'); await navigateTo('pg-workflow'); } catch (e) { button.disabled = false; showToast(e.message, true); }
  }));
  const applyLeadFilters = async (form) => {
    const data = Object.fromEntries(new FormData(form)); leadSearch = String(data.search || '').trim(); leadPg = String(data.pgCode || ''); leadClass = String(data.dataClass || ''); leadStatus = String(data.status || ''); leadCommission = String(data.commissionStatus || ''); leadFrom = String(data.dateFrom || ''); leadTo = String(data.dateTo || '');
    if (leadFrom && leadTo && leadFrom > leadTo) return showToast('Từ ngày không được sau Đến ngày.', true);
    leadPage = 1; await navigateTo('pg-workflow');
  };
  const leadFilter = document.getElementById('supportPgLeadFilter'); let searchTimer = 0;
  leadFilter?.addEventListener('change', (event) => applyLeadFilters(event.currentTarget));

  const leadSearchInput = document.getElementById('supportPgLeadSearch');
  // Lấy lại con trỏ ngay sau khi view được dựng lại, đặt ở cuối chuỗi để người
  // dùng gõ tiếp được liền mạch.
  if (restoreLeadSearchFocus && leadSearchInput) {
    restoreLeadSearchFocus = false;
    leadSearchInput.focus();
    const caret = leadSearchInput.value.length;
    leadSearchInput.setSelectionRange(caret, caret);
  }
  leadSearchInput?.addEventListener('input', (event) => {
    const input = event.currentTarget;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      if (String(input.value).trim() === leadSearch) return; // không có gì đổi
      restoreLeadSearchFocus = true;
      applyLeadFilters(input.closest('form'));
    }, 400);
  });
  // Enter để tìm ngay, không phải chờ hết thời gian trễ.
  leadSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    window.clearTimeout(searchTimer);
    restoreLeadSearchFocus = true;
    applyLeadFilters(event.currentTarget.closest('form'));
  });
  document.querySelector('[data-reset-support-pg-leads]')?.addEventListener('click', async () => { leadPage = 1; leadSearch = ''; leadPg = ''; leadClass = ''; leadStatus = ''; leadCommission = ''; leadFrom = ''; leadTo = ''; restoreLeadSearchFocus = true; await navigateTo('pg-workflow'); });
  document.querySelectorAll('[data-support-lead-page]').forEach((button) => button.addEventListener('click', async () => { leadPage = Number(button.dataset.supportLeadPage || 1); await navigateTo('pg-workflow'); }));
  document.querySelector('[data-support-lead-page-select]')?.addEventListener('change', async (event) => { leadPage = Number(event.currentTarget.value || 1); await navigateTo('pg-workflow'); });
  document.querySelectorAll('[data-support-confirm-arrival]').forEach((button) => button.addEventListener('click', async () => {
    const accepted = await confirmAction(`Xác nhận “${button.dataset.customerName || 'khách hàng'}” đã đến phòng khám? Hồ sơ sẽ được đưa vào danh sách đủ điều kiện đối soát hoa hồng PG.`, { title: 'Xác nhận khách đã đến', confirmText: 'Xác nhận khách đến' });
    if (!accepted) return;
    button.disabled = true;
    try { await confirmPgLeadArrival(button.dataset.supportConfirmArrival); showToast('Đã xác nhận khách đến và đủ điều kiện hoa hồng PG.'); await navigateTo('pg-workflow'); } catch (error) { button.disabled = false; showToast(error.message || 'Không thể xác nhận khách đến.', true); }
  }));
  document.querySelectorAll('[data-review-location]').forEach(b => b.addEventListener('click', async () => { const note = await requestInput('Ghi chú giúp PG hiểu kết quả phê duyệt.', { title: b.dataset.reviewLocation === 'approved' ? 'Duyệt tọa độ' : 'Từ chối tọa độ', label: 'Ghi chú duyệt', placeholder: 'Không bắt buộc' }); if (note === null) return; try { await reviewPgLocationSuggestion(b.dataset.id, b.dataset.reviewLocation, note); await navigateTo('pg-workflow'); } catch (e) { showToast(e.message, true); } }));
  document.querySelectorAll('[data-request-action]').forEach(b => b.addEventListener('click', async () => { const isComplete = b.dataset.requestAction === 'complete'; const note = await requestInput(isComplete ? 'Nhập phản hồi cuối cùng để PG nhận kết quả.' : 'Nhập ghi chú cho bước xử lý này.', { title: isComplete ? 'Hoàn tất yêu cầu' : 'Cập nhật yêu cầu', label: isComplete ? 'Phản hồi cho PG' : 'Ghi chú xử lý' }); if (note === null || (isComplete && !note.trim())) return; try { await actionPgSupportRequest(b.dataset.id, b.dataset.requestAction, note); await navigateTo('pg-workflow'); } catch (e) { showToast(e.message, true); } }));
}
