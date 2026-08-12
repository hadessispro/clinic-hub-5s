import {
  getSystemHealth, getBugLogs, createBugLog, updateBugLog,
  publishSystemAnnouncement, getSystemAnnouncements, getSystemProfiles,
  updateUserAccess, getTechnicalAudit, getIntegrationFailures,
  getSystemErrorLogs, resolveSystemError, subscribeToSystemErrors,
} from '../services/system-admin.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/app-dialog.js';
import { store } from '../store.js';

const severityLabel = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', critical: 'Nghiêm trọng' };
const statusLabel = { open: 'Mới', investigating: 'Đang kiểm tra', resolved: 'Đã sửa', closed: 'Đã đóng' };
const roleLabel = { staff: 'Nhân viên', leader: 'Trưởng bộ phận', hr: 'Nhân sự', finance: 'Kế toán', admin: 'Admin', admin_it: 'Admin IT', superadmin: 'Superadmin' };
let logSub = null;
let bugFilterTimer = null;
let logFilterTimer = null;

const functionalAreas = {
  authentication: { label: 'Đăng nhập & tài khoản', icon: 'A' },
  attendance: { label: 'Chấm công & GPS', icon: 'C' },
  schedule: { label: 'Lịch làm & ca làm', icon: 'L' },
  chat: { label: 'Tin nhắn & thông báo', icon: 'T' },
  sync: { label: 'Đồng bộ & tích hợp', icon: 'Đ' },
  data: { label: 'Dữ liệu & phân quyền', icon: 'D' },
  other: { label: 'Hệ thống khác', icon: 'H' },
};

function functionalArea(item) {
  const context = JSON.stringify(item.context || {});
  const text = `${item.area || ''} ${item.title || ''} ${item.message || ''} ${item.source || ''} ${item.page_url || ''} ${context}`.toLocaleLowerCase('vi');
  if (/đăng nhập|login|auth|credential|tài khoản|account|profile/.test(text)) return 'authentication';
  if (/chấm công|attendance|checkin|checkout|gps|geolocation/.test(text)) return 'attendance';
  if (/lịch làm|schedule|ca làm|shift/.test(text)) return 'schedule';
  if (/tin nhắn|message|chat|notification|thông báo/.test(text)) return 'chat';
  if (/đồng bộ|sync|sheet|integration|api|outbox/.test(text)) return 'sync';
  if (/database|supabase|rls|permission|phân quyền|data/.test(text)) return 'data';
  return 'other';
}

function groupedPanels(items, rowRenderer, type) {
  const groups = new Map();
  items.forEach((item) => {
    const key = functionalArea(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const overview = `<div class="system-log-category-nav">${Object.entries(functionalAreas).map(([key, meta]) => `<span class="${groups.has(key) ? 'has-records' : ''}"><b>${meta.icon}</b>${meta.label}<small>${groups.get(key)?.length || 0}</small></span>`).join('')}</div>`;
  if (!items.length) return `${overview}<div class="system-log-empty">Không có ${type === 'bug' ? 'bug' : 'lỗi hệ thống'} phù hợp bộ lọc.</div>`;
  return overview + Object.keys(functionalAreas).filter((key) => groups.has(key)).map((key) => {
    const meta = functionalAreas[key];
    const rows = groups.get(key);
    const header = type === 'bug'
      ? '<tr><th>Lỗi</th><th>Khu vực</th><th>Mức độ</th><th>Trạng thái</th><th>Kết quả xử lý</th><th></th></tr>'
      : '<tr><th>Mức độ</th><th>Thông báo</th><th>Thời gian</th><th>Ngữ cảnh</th><th>Trạng thái</th><th></th></tr>';
    return `<section class="system-log-group"><div class="system-log-group-title"><span>${meta.icon}</span><div><strong>${meta.label}</strong><small>${rows.length} bản ghi</small></div></div><div class="table-wrap"><table><thead>${header}</thead><tbody>${rowRenderer(rows)}</tbody></table></div></section>`;
  }).join('');
}

function metric(label, value, note = '') {
  return `<article class="system-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(String(value ?? 0))}</strong><small>${escapeHTML(note)}</small></article>`;
}

function filterOptions(map, selected = 'all') {
  return `<option value="all">Tất cả</option>${Object.entries(map).map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('')}`;
}

function bugRows(bugs) {
  if (!bugs.length) return '<tr><td colspan="6" class="empty-table-cell">Không có bug phù hợp bộ lọc.</td></tr>';
  return bugs.map((bug) => `<tr>
    <td><strong>${escapeHTML(bug.title)}</strong><small>${escapeHTML(bug.description || '')}</small></td>
    <td>${escapeHTML(bug.area)}</td>
    <td><span class="status-pill ${bug.severity === 'critical' ? 'bad' : bug.severity === 'high' ? 'warn' : 'neutral'}">${escapeHTML(severityLabel[bug.severity] || bug.severity)}</span></td>
    <td><select data-bug-status="${bug.id}">${Object.entries(statusLabel).map(([value, label]) => `<option value="${value}" ${bug.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td>
    <td><input data-bug-resolution="${bug.id}" value="${escapeHTML(bug.resolution || '')}" placeholder="Ghi chú xử lý"></td>
    <td><button class="secondary-button compact-button" type="button" data-save-bug="${bug.id}">Lưu</button></td>
  </tr>`).join('');
}

function errorRows(logs) {
  if (!logs.length) return '<tr><td colspan="6" class="empty-table-cell">Không có lỗi hệ thống phù hợp bộ lọc.</td></tr>';
  return logs.map((log) => {
    const details = JSON.stringify(log.context || {}, null, 2);
    return `<tr class="${log.resolved ? 'is-muted-row' : ''}">
      <td><span class="status-pill ${log.level === 'critical' || log.level === 'error' ? 'bad' : log.level === 'warning' ? 'warn' : 'neutral'}">${escapeHTML(log.level)}</span></td>
      <td><strong>${escapeHTML(log.message)}</strong><small>${escapeHTML(log.source || 'client')}</small></td>
      <td>${formatDateTime(log.created_at)}</td>
      <td><button class="text-button" type="button" data-log-detail="${log.id}">Xem chi tiết</button><pre id="logDetail-${log.id}" class="system-log-detail" hidden>${escapeHTML(details)}</pre></td>
      <td>${log.resolved ? '<span class="status-pill good">Đã xử lý</span>' : '<span class="status-pill warn">Chưa xử lý</span>'}</td>
      <td><button class="secondary-button compact-button" type="button" data-resolve-log="${log.id}" data-resolved="${log.resolved}">${log.resolved ? 'Mở lại' : 'Đánh dấu xử lý'}</button></td>
    </tr>`;
  }).join('');
}

function profileRows(profiles, currentUserId) {
  return profiles.map((profile) => {
    const protectedRole = ['admin', 'admin_it', 'superadmin'].includes(profile.role) || profile.id === currentUserId;
    return `<tr><td><strong>${escapeHTML(profile.full_name)}</strong><small>${escapeHTML(profile.employee_code || 'Tài khoản hệ thống')}</small></td>
      <td>${escapeHTML(profile.department || '—')}</td><td>${escapeHTML(profile.branch_id || '—')}</td>
      <td><select data-user-role="${profile.id}" ${protectedRole ? 'disabled' : ''}>${['staff','leader','hr','finance'].map((role) => `<option value="${role}" ${profile.role === role ? 'selected' : ''}>${roleLabel[role]}</option>`).join('')}${protectedRole ? `<option selected>${escapeHTML(roleLabel[profile.role] || profile.role)}</option>` : ''}</select></td>
      <td><label class="system-toggle"><input type="checkbox" data-user-active="${profile.id}" ${profile.active ? 'checked' : ''} ${protectedRole ? 'disabled' : ''}><span>${profile.active ? 'Hoạt động' : 'Đã khóa'}</span></label></td>
      <td>${protectedRole ? '<span class="subtle">Được bảo vệ</span>' : `<button class="secondary-button compact-button" type="button" data-save-access="${profile.id}">Cập nhật</button>`}</td></tr>`;
  }).join('');
}

export async function renderView(state) {
  const [health, bugs, announcements, profiles, audits, outbox, errorLogs] = await Promise.all([
    getSystemHealth(), getBugLogs(), getSystemAnnouncements(), getSystemProfiles(), getTechnicalAudit(), getIntegrationFailures(), getSystemErrorLogs(),
  ]);
  const failed = outbox.filter((item) => item.status === 'failed');
  return `<div class="view-header"><div><p class="eyebrow">SYSTEM CONTROL CENTER</p><h3>Thông báo phát hành, theo dõi lỗi, quản lý bug và quyền truy cập.</h3></div><button class="secondary-button" type="button" id="refreshSystem">↻ Làm mới dữ liệu</button></div>
    <section class="system-health-grid">${metric('Database', health.database === 'online' ? 'Đang hoạt động' : 'Có lỗi', `Kiểm tra ${formatDateTime(health.checked_at)}`)}${metric('Tài khoản hoạt động', health.active_profiles, `${health.inactive_profiles || 0} tài khoản bị khóa`)}${metric('Dữ liệu chấm công', health.attendance_records, `Lần cuối ${health.last_attendance_at ? formatDateTime(health.last_attendance_at) : 'chưa có'}`)}${metric('Đồng bộ lỗi', health.failed_sync, `${health.pending_sync || 0} đang chờ`)}${metric('Lỗi ứng dụng', errorLogs.filter((x) => !x.resolved).length, `${errorLogs.filter((x) => x.level === 'critical' && !x.resolved).length} nghiêm trọng`)}</section>

    <div class="grid cols-2 system-admin-grid">
      <section class="panel"><div class="section-title"><div><p class="eyebrow">THÔNG BÁO PHÁT HÀNH</p><h3>Gửi cập nhật đến người dùng</h3></div></div>
        <form id="announcementForm" class="system-form"><label class="span-2">Tiêu đề<input name="title" required maxlength="160" placeholder="VD: Đã cập nhật chức năng chấm công"></label><label>Loại<select name="category"><option value="feature">Tính năng mới</option><option value="maintenance">Bảo trì</option><option value="security">Bảo mật</option><option value="general">Thông báo chung</option></select></label><label>Người nhận<select name="audience"><option value="all">Tất cả người dùng</option><option value="staff">Nhân viên</option><option value="leader">Trưởng bộ phận</option><option value="hr">Nhân sự</option><option value="finance">Kế toán</option><option value="admin">Admin</option></select></label><label class="span-2">Nội dung<textarea name="body" required maxlength="2000" placeholder="Mô tả thay đổi, thời gian áp dụng và hướng dẫn..."></textarea></label><button class="primary-button span-2" type="submit">🔔 Phát hành thông báo realtime</button></form>
        <div class="system-recent-list">${announcements.slice(0, 3).map((item) => `<article><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.body)}</span><small>${formatDateTime(item.created_at)} · ${escapeHTML(item.audience)}</small></article>`).join('') || '<p class="subtle">Chưa có thông báo phát hành.</p>'}</div>
      </section>
      <section class="panel"><div class="section-title"><div><p class="eyebrow">BUG LOG</p><h3>Ghi nhận lỗi cần xử lý</h3></div></div>
        <form id="bugForm" class="system-form"><label class="span-2">Tên lỗi<input name="title" required maxlength="180" placeholder="Mô tả ngắn lỗi cần kiểm tra"></label><label>Khu vực<input name="area" required placeholder="VD: Chấm công / Đăng nhập"></label><label>Mức độ<select name="severity"><option value="low">Thấp</option><option value="medium" selected>Trung bình</option><option value="high">Cao</option><option value="critical">Nghiêm trọng</option></select></label><label class="span-2">Chi tiết<textarea name="description" placeholder="Các bước tái hiện, thiết bị, tài khoản và kết quả mong đợi..."></textarea></label><button class="primary-button span-2" type="submit">+ Thêm bug log</button></form>
        <div class="system-sync-status"><strong>Hàng đợi đồng bộ</strong><span>${failed.length ? `${failed.length} lỗi cần kiểm tra` : 'Không có lỗi đồng bộ gần đây'}</span></div>
      </section>
    </div>

    <section class="panel"><div class="section-title"><div><p class="eyebrow">BỘ LỌC BUG</p><h3>Danh sách bug</h3></div><span class="subtle" id="bugResultCount">${bugs.length} bản ghi</span></div>
      <div class="system-filterbar" id="bugFilters"><label>Tìm kiếm<input type="search" name="search" placeholder="Tên lỗi hoặc mô tả"></label><label>Khu vực<input name="area" placeholder="VD: Chấm công"></label><label>Mức độ<select name="severity">${filterOptions(severityLabel)}</select></label><label>Trạng thái<select name="status">${filterOptions(statusLabel)}</select></label><button class="secondary-button" type="button" data-clear-filters="bug">Xóa lọc</button></div>
      <div class="system-log-groups" id="bugTableBody">${groupedPanels(bugs, bugRows, 'bug')}</div></section>

    <section class="panel"><div class="section-title"><div><p class="eyebrow">LOG HỆ THỐNG REALTIME</p><h3>Lỗi ứng dụng và lỗi đồng bộ</h3></div><span class="live-indicator">Đang theo dõi</span></div>
      <div class="system-filterbar" id="logFilters"><label>Tìm trong log<input type="search" name="search" placeholder="Thông báo, nguồn hoặc URL"></label><label>Nguồn<select name="source"><option value="all">Tất cả</option><option value="client">Ứng dụng client</option><option value="sync">Đồng bộ dữ liệu</option></select></label><label>Mức độ<select name="level"><option value="all">Tất cả</option><option value="warning">Cảnh báo</option><option value="error">Lỗi</option><option value="critical">Nghiêm trọng</option></select></label><label>Trạng thái<select name="resolved"><option value="all">Tất cả</option><option value="false">Chưa xử lý</option><option value="true">Đã xử lý</option></select></label><button class="secondary-button" type="button" data-clear-filters="log">Xóa lọc</button></div>
      <div class="system-log-groups" id="systemLogBody">${groupedPanels(errorLogs, errorRows, 'log')}</div>
      <details class="sync-error-details"><summary>Lỗi đồng bộ dữ liệu (${failed.length})</summary>${failed.length ? failed.map((item) => `<article><strong>${escapeHTML(item.entity_type)} · ${escapeHTML(item.entity_id || '')}</strong><span>${escapeHTML(item.last_error || 'Không có mô tả')}</span><small>${formatDateTime(item.created_at)} · thử ${item.attempts || 0} lần</small></article>`).join('') : '<p class="subtle">Không có lỗi đồng bộ.</p>'}</details>
    </section>

    <section class="panel"><div class="section-title"><div><p class="eyebrow">PHÂN QUYỀN CÓ KIỂM SOÁT</p><h3>Tài khoản hệ thống</h3></div><span class="subtle">Không thể cấp Admin IT/Superadmin tại đây</span></div><div class="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Bộ phận</th><th>Chi nhánh</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr></thead><tbody>${profileRows(profiles, state.user.id)}</tbody></table></div></section>
    <section class="panel"><div class="section-title"><div><p class="eyebrow">AUDIT TRAIL</p><h3>Lịch sử thay đổi hệ thống</h3></div><span class="subtle">${audits.length} thao tác gần nhất</span></div><div class="system-audit-list">${audits.slice(0, 30).map((item) => `<article><strong>${escapeHTML(item.action)} · ${escapeHTML(item.entity)}</strong><span>${escapeHTML(item.entity_id || '')}</span><small>${formatDateTime(item.created_at)}</small></article>`).join('') || '<p class="subtle">Chưa có audit log.</p>'}</div></section>`;
}

function bindLiveFilters() {
  const bugBox = document.getElementById('bugFilters');
  bugBox?.addEventListener('input', () => {
    clearTimeout(bugFilterTimer);
    bugFilterTimer = setTimeout(async () => {
      const values = Object.fromEntries([...bugBox.querySelectorAll('input,select')].map((el) => [el.name, el.value]));
      const count = document.getElementById('bugResultCount');
      count.textContent = 'Đang lọc…';
      try {
        const rows = await getBugLogs(values);
        document.getElementById('bugTableBody').innerHTML = groupedPanels(rows, bugRows, 'bug');
        count.textContent = `${rows.length} bản ghi`;
        bindBugActions();
      } catch (error) {
        count.textContent = 'Không thể tải dữ liệu';
        showToast(error.message || 'Không thể lọc bug.', true);
      }
    }, 250);
  });
  const logBox = document.getElementById('logFilters');
  logBox?.addEventListener('input', () => {
    clearTimeout(logFilterTimer);
    logFilterTimer = setTimeout(async () => {
      const values = Object.fromEntries([...logBox.querySelectorAll('input,select')].map((el) => [el.name, el.value]));
      try {
        let rows = await getSystemErrorLogs();
        rows = rows.filter((x) => (values.source === 'all' || x.source === values.source) && (values.level === 'all' || x.level === values.level) && (values.resolved === 'all' || String(x.resolved) === values.resolved) && (!values.search || `${x.message} ${x.source} ${x.page_url || ''}`.toLowerCase().includes(values.search.toLowerCase())));
        document.getElementById('systemLogBody').innerHTML = groupedPanels(rows, errorRows, 'log');
        bindLogActions();
      } catch (error) { showToast(error.message || 'Không thể lọc log hệ thống.', true); }
    }, 250);
  });
  document.querySelectorAll('[data-clear-filters]').forEach((button) => button.addEventListener('click', () => { const box = document.getElementById(`${button.dataset.clearFilters}Filters`); box.querySelectorAll('input').forEach((x) => x.value = ''); box.querySelectorAll('select').forEach((x) => x.value = 'all'); box.dispatchEvent(new Event('input')); }));
}

function bindBugActions() {
  document.querySelectorAll('[data-save-bug]').forEach((button) => button.addEventListener('click', async () => { const id = button.dataset.saveBug; try { await updateBugLog(id, { status: document.querySelector(`[data-bug-status="${id}"]`).value, resolution: document.querySelector(`[data-bug-resolution="${id}"]`).value }); showToast('Đã cập nhật bug log.'); } catch (error) { showToast(error.message || 'Không thể cập nhật bug.', true); } }));
}

function bindLogActions() {
  document.querySelectorAll('[data-log-detail]').forEach((button) => button.addEventListener('click', () => { const detail = document.getElementById(`logDetail-${button.dataset.logDetail}`); detail.hidden = !detail.hidden; button.textContent = detail.hidden ? 'Xem chi tiết' : 'Thu gọn'; }));
  document.querySelectorAll('[data-resolve-log]').forEach((button) => button.addEventListener('click', async () => { try { await resolveSystemError(button.dataset.resolveLog, button.dataset.resolved !== 'true'); showToast('Đã cập nhật trạng thái log.'); store.notify(); } catch (error) { showToast(error.message || 'Không thể cập nhật log.', true); } }));
}

export function initView() {
  document.getElementById('refreshSystem')?.addEventListener('click', () => store.notify());
  document.getElementById('announcementForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(event.currentTarget)); button.disabled = true; button.textContent = 'Đang phát hành…'; try { await publishSystemAnnouncement(data); showToast('Đã phát hành thông báo đến người dùng.'); event.currentTarget.reset(); store.notify(); } catch (error) { button.disabled = false; button.textContent = '🔔 Phát hành thông báo realtime'; showToast(error.message || 'Không thể phát hành thông báo.', true); } });
  document.getElementById('bugForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(event.currentTarget)); button.disabled = true; button.textContent = 'Đang lưu bug…'; try { await createBugLog(data); showToast('Đã thêm bug log.'); event.currentTarget.reset(); store.notify(); } catch (error) { button.disabled = false; button.textContent = '+ Thêm bug log'; showToast(error.message || 'Không thể thêm bug log.', true); } });
  bindLiveFilters(); bindBugActions(); bindLogActions();
  document.querySelectorAll('[data-save-access]').forEach((button) => button.addEventListener('click', async () => { const id = button.dataset.saveAccess; const role = document.querySelector(`[data-user-role="${id}"]`).value; const active = document.querySelector(`[data-user-active="${id}"]`).checked; if (!await confirmAction(`Xác nhận cập nhật quyền ${roleLabel[role]} và trạng thái tài khoản?`, { title: 'Cập nhật phân quyền', confirmText: 'Lưu phân quyền' })) return; try { await updateUserAccess(id, role, active); showToast('Đã cập nhật quyền tài khoản và lưu audit.'); store.notify(); } catch (error) { showToast(error.message || 'Không thể cập nhật tài khoản.', true); } }));
  logSub?.unsubscribe(); logSub = subscribeToSystemErrors(() => { if (store.getState().currentView === 'system-admin') store.notify(); });
}
