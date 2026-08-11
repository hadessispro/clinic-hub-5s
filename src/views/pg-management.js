import {
  createPgAccount, createPgAssignment, createPgSite, deletePgAccount, exportPgAttendanceCsv,
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

function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }

export async function renderView() {
  [accounts, sites, assignments, report, attendance] = await Promise.all([
    getPgAccounts(), getPgSites(), getPgAssignments(today()), getMarketingReports(), getPgAttendance(today(), today()),
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

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title"><h3>Tạo tài khoản PG</h3><span class="pill">Chỉ nhập data và chấm công</span></div>
        <form id="pgAccountForm" class="form-grid two">
          <label class="form-field"><span>Họ tên</span><input name="fullName" required placeholder="Nguyễn Văn A"></label>
          <label class="form-field"><span>Mã PG</span><input name="employeeCode" placeholder="PG-001"></label>
          <label class="form-field"><span>Email đăng nhập</span><input name="email" type="email" required></label>
          <label class="form-field"><span>Số điện thoại</span><input name="phone" required inputmode="numeric"></label>
          <label class="form-field"><span>Mật khẩu ban đầu</span><input name="password" type="password" minlength="8" placeholder="Mặc định dùng SĐT"></label>
          <label class="form-field"><span>Chi nhánh quản lý</span><select name="branchId"><option value="pham-van-chieu">Phạm Văn Chiêu</option><option value="le-van-tho">Lê Văn Thọ</option></select></label>
          <button class="primary-button full" type="submit">Tạo tài khoản PG</button>
        </form>
      </section>

      <section class="panel">
        <div class="section-title"><h3>Tạo điểm chấm công PG</h3><span class="pill">Support quản lý</span></div>
        <form id="pgSiteForm" class="form-grid two">
          <label class="form-field"><span>Tên vị trí</span><input name="name" required placeholder="Booth PG Gò Vấp"></label>
          <label class="form-field"><span>Địa chỉ</span><input name="address" required></label>
          <label class="form-field"><span>Vĩ độ</span><input name="latitude" type="number" step="any" required></label>
          <label class="form-field"><span>Kinh độ</span><input name="longitude" type="number" step="any" required></label>
          <label class="form-field"><span>Bán kính hợp lệ (m)</span><input name="allowedRadiusM" type="number" value="100" min="20" max="500"></label>
          <label class="form-field"><span>Sai số GPS tối đa (m)</span><input name="maxAccuracyM" type="number" value="100" min="10" max="200"></label>
          <button class="primary-button full" type="submit">Lưu vị trí chấm công</button>
        </form>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title"><h3>Phân công vị trí và thời gian</h3><span class="pill">Mỗi PG · mỗi ngày một ca</span></div>
      <form id="pgAssignmentForm" class="form-grid five">
        <label class="form-field"><span>Nhân viên PG</span><select name="pgCode" required><option value="">Chọn PG</option>${accounts.map((row) => `<option value="${escapeHTML(row.profile?.employee_code || '')}">${escapeHTML(row.employee?.full_name || row.profile?.full_name || '')} · ${escapeHTML(row.profile?.employee_code || '')}</option>`).join('')}</select></label>
        <label class="form-field"><span>Vị trí</span><select name="siteId" required><option value="">Chọn vị trí</option>${sites.map((site) => `<option value="${site.id}">${escapeHTML(site.name)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Ngày làm</span><input name="workDate" type="date" value="${today()}" required></label>
        <label class="form-field"><span>Giờ vào</span><input name="startTime" type="time" value="08:00" required></label>
        <label class="form-field"><span>Giờ ra</span><input name="endTime" type="time" value="17:00" required></label>
        <button class="primary-button full" type="submit">Giao lịch và vị trí chấm công</button>
      </form>
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>PG</th><th>Ngày</th><th>Ca</th><th>Vị trí</th><th>Địa chỉ</th></tr></thead><tbody>
        ${assignments.length ? assignments.map((row) => `<tr><td><strong>${escapeHTML(row.pg_code)}</strong></td><td>${escapeHTML(row.work_date)}</td><td>${escapeHTML(String(row.start_time).slice(0,5))}–${escapeHTML(String(row.end_time).slice(0,5))}</td><td>${escapeHTML(row.site_name)}</td><td>${escapeHTML(row.address)}</td></tr>`).join('') : '<tr><td colspan="5">Chưa có phân công hôm nay.</td></tr>'}
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
          <td><div class="button-row"><button class="secondary-button" data-toggle-pg="${escapeHTML(code)}" data-active="${row.login_active ? '1' : '0'}">${row.login_active ? 'Khóa' : 'Mở khóa'}</button><button class="danger-button" data-delete-pg="${escapeHTML(code)}">Xóa</button></div></td>
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
      <div class="section-title"><h3>Chấm công PG hôm nay</h3><button id="exportPgAttendance" class="secondary-button">Xuất Excel/CSV</button></div>
      <div class="table-wrap"><table><thead><tr><th>PG</th><th>Loại</th><th>Thời gian</th><th>Vị trí</th><th>GPS</th><th>Trạng thái</th></tr></thead><tbody>
        ${attendance.length ? attendance.map((row) => `<tr><td><strong>${escapeHTML(row.pg_code)}</strong></td><td>${row.record_type === 'checkin' ? 'Vào ca' : 'Ra ca'}</td><td>${new Date(row.recorded_at).toLocaleString('vi-VN')}</td><td>${escapeHTML(row.site_name)}</td><td>${row.distance_m} m · ±${row.accuracy_m} m</td><td>${escapeHTML(row.status)}</td></tr>`).join('') : '<tr><td colspan="6">Chưa có lượt chấm công hôm nay.</td></tr>'}
      </tbody></table></div>
    </section>`;
}

async function refresh(message) {
  if (message) showToast(message);
  await navigateTo('pg-management');
}

export function initView() {
  document.getElementById('pgAccountForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!data.password) data.password = data.phone;
    try { await createPgAccount(data); await refresh('Đã tạo tài khoản PG.'); } catch (error) { showToast(error.message, true); }
  });
  document.getElementById('pgSiteForm')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try { await createPgSite(data); await refresh('Đã lưu vị trí chấm công PG.'); } catch (error) { showToast(error.message, true); }
  });
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
  document.getElementById('exportPgAttendance')?.addEventListener('click', async () => {
    try { const count = await exportPgAttendanceCsv(today(), today()); showToast(`Đã xuất ${count} lượt chấm công PG.`); } catch (error) { showToast(error.message, true); }
  });
}

