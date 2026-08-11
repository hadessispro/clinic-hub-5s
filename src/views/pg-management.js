import {
  createPgAccount, createPgAssignment, deletePgAccount, exportPgAttendanceCsv,
  getMarketingReports, getPgAccounts, getPgAssignments, getPgAttendance, getPgSites, updatePgAccount,
} from '../services/marketing.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';

let accounts = [];
let sites = [];
let assignments = [];
let report = { totals: {}, pg: [], telesale: [] };
let attendance = [];
let attendanceFrom = '';
let attendanceTo = '';

function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }

export async function renderView() {
  attendanceFrom ||= today();
  attendanceTo ||= today();
  [accounts, sites, assignments, report, attendance] = await Promise.all([
    getPgAccounts(), getPgSites(), getPgAssignments(today()), getMarketingReports(), getPgAttendance(attendanceFrom, attendanceTo),
  ]);
  const totals = report.totals || {};
  const pgRows = report.pg || [];
  const maxCount = pgRows.length ? Math.max(...pgRows.map((row) => Number(row.total || 0))) : 0;
  const minCount = pgRows.length ? Math.min(...pgRows.map((row) => Number(row.total || 0))) : 0;

  return `
    <div class="view-header"><div><p class="eyebrow">PG OPERATIONS</p><h3>Quản lý tài khoản, dữ liệu và chấm công PG</h3></div></div>

    <div class="shift-overview-metrics">
      <article><span>Tài khoản PG</span><strong>${accounts.length}</strong><small>${accounts.filter((row) => row.login_active).length} đang hoạt động</small></article>
      <article><span>Tổng data</span><strong>${Number(totals.total || 0)}</strong><small>${Number(totals.raw_count || 0)} thô · ${Number(totals.net_count || 0)} net</small></article>
      <article><span>PG nhiều data nhất</span><strong>${maxCount}</strong><small>${escapeHTML(pgRows.find((row) => Number(row.total) === maxCount)?.pg_code || 'Chưa có')}</small></article>
      <article><span>PG ít data nhất</span><strong>${minCount}</strong><small>${escapeHTML(pgRows.find((row) => Number(row.total) === minCount)?.pg_code || 'Chưa có')}</small></article>
    </div>

    <div class="grid">
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

    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title"><h3>Phân công vị trí và thời gian</h3><span class="pill">Mỗi PG · mỗi ngày một ca</span></div>
      <form id="pgAssignmentForm" class="pg-assignment-form">
        <label class="form-field"><span>Nhân viên PG</span><select name="pgCode" required><option value="">Chọn PG</option>${accounts.map((row) => `<option value="${escapeHTML(row.profile?.employee_code || '')}">${escapeHTML(row.employee?.full_name || row.profile?.full_name || '')} · ${escapeHTML(row.profile?.employee_code || '')}</option>`).join('')}</select></label>
        <label class="form-field"><span>Vị trí</span><select name="siteId" required><option value="">Chọn vị trí</option>${sites.map((site) => `<option value="${site.id}">${escapeHTML(site.name)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Ngày làm</span><input name="workDate" type="date" value="${today()}" required></label>
        <label class="form-field"><span>Giờ vào</span><input name="startTime" type="time" value="08:00" required></label>
        <label class="form-field"><span>Giờ ra</span><input name="endTime" type="time" value="17:00" required></label>
        <button class="primary-button pg-assignment-submit" type="submit"><i class="ri-send-plane-line"></i> Giao cho PG</button>
      </form>
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>PG</th><th>Ngày</th><th>Ca</th><th>Vị trí</th><th>Địa chỉ</th></tr></thead><tbody>
        ${assignments.length ? assignments.map((row) => `<tr><td><strong>${escapeHTML(row.pg_code)}</strong></td><td>${escapeHTML(String(row.work_date).slice(0,10))}</td><td>${escapeHTML(String(row.start_time).slice(0,5))}–${escapeHTML(String(row.end_time).slice(0,5))}</td><td>${escapeHTML(row.site_name)}</td><td>${escapeHTML(row.address)}</td></tr>`).join('') : '<tr><td colspan="5">Chưa có phân công hôm nay.</td></tr>'}
      </tbody></table></div>
    </section>

    <section class="panel" style="margin-top:14px">
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
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title"><h3>Báo cáo data theo tài khoản PG</h3><span class="pill">Dữ liệu PostgreSQL</span></div>
      <div class="table-wrap"><table><thead><tr><th>PG</th><th>Tổng</th><th>Data thô</th><th>Net cơ bản</th><th>Net chuyên sâu</th></tr></thead><tbody>
        ${pgRows.length ? pgRows.map((row) => `<tr><td><strong>${escapeHTML(row.pg_code)}</strong></td><td>${row.total}</td><td>${row.raw_count}</td><td>${row.net_basic_count}</td><td>${row.net_advanced_count}</td></tr>`).join('') : '<tr><td colspan="5">Chưa có data PG.</td></tr>'}
      </tbody></table></div>
    </section>

    <section class="panel" style="margin-top:14px">
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
    </section>

    <dialog id="editPgDialog" class="app-dialog">
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
    </dialog>`;
}

async function refresh(message) {
  if (message) showToast(message);
  await navigateTo('pg-management');
}

export function initView() {
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
      (error) => { button.disabled = false; showToast(error.message || 'Không lấy được GPS. Hãy cho phép quyền vị trí.', true); },
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
    const site = sites.find((item) => String(item.id) === button.dataset.deletePgSite);
    if (!site || !confirm(`Xóa địa điểm “${site.name}”?`)) return;
    try { await deletePgSite(site.id); await refresh('Đã xóa địa điểm chấm công.'); } catch (error) { showToast(error.message, true); }
  }));
  document.getElementById('pgAssignmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await createPgAssignment(data); await refresh('Đã giao lịch và vị trí cho PG.'); } catch (error) { showToast(error.message, true); }
  });
  document.querySelectorAll('[data-toggle-pg]').forEach((button) => button.addEventListener('click', async () => {
    try { await updatePgAccount(button.dataset.togglePg, { active: button.dataset.active !== '1' }); await refresh('Đã cập nhật tài khoản PG.'); } catch (error) { showToast(error.message, true); }
  }));
  document.querySelectorAll('[data-delete-pg]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirm(`Xóa tài khoản ${button.dataset.deletePg}?`)) return;
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
