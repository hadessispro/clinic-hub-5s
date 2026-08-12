import { exportPgAttendanceCsv, getPgAssignments, getPgAttendance, recordPgAttendance } from '../services/marketing.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';
import { store } from '../store.js';
import { geolocationErrorMessage } from '../services/geolocation.js';

let assignments = [];
let records = [];
let reportFrom = '';
let reportTo = '';
function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }
function dateOnly(value) { return String(value || '').slice(0, 10); }
function dateLabel(value) {
  const normalized = dateOnly(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  return new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
    .format(new Date(`${normalized}T12:00:00+07:00`));
}

export async function renderView() {
  const profile = store.getState().profile || {};
  const isPg = profile.role === 'pg_staff';
  reportFrom ||= today(); reportTo ||= today();
  [assignments, records] = await Promise.all([getPgAssignments(isPg ? today() : reportFrom), getPgAttendance(isPg ? today() : reportFrom, isPg ? today() : reportTo)]);
  if (!isPg) return `<div class="view-header"><div><p class="eyebrow">PG ATTENDANCE REPORT</p><h3>Theo dõi chấm công PG theo ngày và vị trí</h3></div></div>
    <section class="panel">
      <div class="section-title"><div><h3>Bộ lọc báo cáo</h3><p class="subtle">Dành cho Admin và Support Marketing</p></div><span class="pill">${records.length} lượt</span></div>
      <form id="pgAttendanceReportFilter" class="pg-attendance-filter">
        <label class="form-field"><span>Từ ngày</span><input name="from" type="date" value="${reportFrom}" required></label>
        <label class="form-field"><span>Đến ngày</span><input name="to" type="date" value="${reportTo}" required></label>
        <button class="secondary-button" type="submit">Lọc dữ liệu</button><button id="exportPgAttendanceReport" class="primary-button" type="button">Xuất Excel/CSV</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>PG</th><th>Ngày</th><th>Loại</th><th>Thời gian</th><th>Vị trí</th><th>Khoảng cách</th><th>GPS</th><th>Trạng thái</th></tr></thead><tbody>
        ${records.length ? records.map((row) => `<tr><td><strong>${escapeHTML(row.pg_code)}</strong></td><td>${escapeHTML(row.work_date)}</td><td>${row.record_type === 'checkin' ? 'Vào ca' : 'Ra ca'}</td><td>${new Date(row.recorded_at).toLocaleString('vi-VN')}</td><td>${escapeHTML(row.site_name)}</td><td>${row.distance_m} m</td><td>±${row.accuracy_m} m</td><td>${escapeHTML(row.status)}</td></tr>`).join('') : '<tr><td colspan="8">Không có dữ liệu trong khoảng ngày đã chọn.</td></tr>'}
      </tbody></table></div>
    </section>`;
  const shift = assignments[0];
  const hasCheckin = records.some((row) => row.record_type === 'checkin');
  const hasCheckout = records.some((row) => row.record_type === 'checkout');
  return `<div class="attendance-page">
    <header class="attendance-page-header"><div><p class="eyebrow">GPS Attendance · PG Marketing</p><h3>Chấm công vào ca</h3><p>${dateLabel(today())}</p></div><div class="attendance-header-actions"><span class="network-status ${navigator.onLine ? 'is-online' : 'is-offline'}"><span></span>${navigator.onLine ? 'Đang online' : 'Đang ngoại tuyến'}</span></div></header>
    ${shift ? `<section class="attendance-primary-card ${hasCheckout ? 'is-complete' : (hasCheckin ? 'is-active' : '')}">
      <div class="attendance-time-block"><span>Ca Support phân công</span><strong>${escapeHTML(String(shift.start_time).slice(0,5))}</strong><small>Kết thúc ${escapeHTML(String(shift.end_time).slice(0,5))}</small></div>
      <div class="attendance-primary-copy"><p class="eyebrow">${hasCheckout ? 'Đã hoàn thành' : (hasCheckin ? 'Đang trong ca' : 'Sẵn sàng check-in')}</p><h3>${escapeHTML(shift.site_name)}</h3><p>${escapeHTML(shift.address)}</p></div>
      ${hasCheckin ? `<button class="attendance-checkout-button" data-pg-clock="checkout" ${hasCheckout ? 'disabled' : ''}><span class="attendance-button-icon">↗</span><span><strong>${hasCheckout ? 'Đã check-out' : 'Check-out kết ca'}</strong><small>Xác minh GPS tại điểm làm việc</small></span></button>` : `<button class="attendance-checkin-button" data-pg-clock="checkin"><span class="attendance-button-icon">⌖</span><span><strong>Xác nhận chấm công</strong><small>Ca do Support phân công</small></span></button>`}
    </section>
    <div class="attendance-info-grid"><section class="attendance-office-card"><div class="attendance-card-icon">⌖</div><div><p class="eyebrow">Điểm chấm công</p><h3>${escapeHTML(shift.site_name)}</h3><p>${escapeHTML(shift.address)}</p></div><span class="attendance-radius">${shift.allowed_radius_m} m</span></section><section class="attendance-rule-card"><div class="attendance-card-icon">⏱</div><div><p class="eyebrow">Quy định hôm nay</p><h3>Ca ${escapeHTML(String(shift.start_time).slice(0,5))}–${escapeHTML(String(shift.end_time).slice(0,5))}</h3><p>Vị trí và thời gian do Support thiết lập · sai số GPS tối đa ±${shift.max_accuracy_m} m.</p></div></section></div>` : '<section class="attendance-primary-card"><div class="attendance-primary-copy"><p class="eyebrow">Chưa có ca hôm nay</p><h3>Support chưa phân công vị trí</h3><p>Sau khi Support giao ngày, giờ và điểm làm việc, ca sẽ tự động xuất hiện tại đây.</p></div></section>'}
    <section class="attendance-history-panel"><div class="section-title"><div><p class="eyebrow">Lịch sử</p><h3>Chấm công hôm nay</h3></div><span class="pill">${records.length} lượt</span></div>
      <div class="table-wrap"><table><thead><tr><th>Loại</th><th>Thời gian</th><th>Khoảng cách</th><th>GPS</th><th>Trạng thái</th></tr></thead><tbody>${records.length ? records.map((row) => `<tr><td>${row.record_type === 'checkin' ? 'Vào ca' : 'Ra ca'}</td><td>${new Date(row.recorded_at).toLocaleString('vi-VN')}</td><td>${row.distance_m} m</td><td>±${row.accuracy_m} m</td><td>${escapeHTML(row.status)}</td></tr>`).join('') : '<tr><td colspan="5">Chưa chấm công.</td></tr>'}</tbody></table></div>
    </section></div>`;
}

function position() {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
}

export function initView() {
  document.getElementById('pgAttendanceReportFilter')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (data.from > data.to) return showToast('Ngày bắt đầu không được lớn hơn ngày kết thúc.', true);
    reportFrom = data.from; reportTo = data.to; await navigateTo('pg-attendance');
  });
  document.getElementById('exportPgAttendanceReport')?.addEventListener('click', async () => {
    try { const count = await exportPgAttendanceCsv(reportFrom, reportTo); showToast(`Đã xuất ${count} lượt chấm công PG.`); } catch (error) { showToast(error.message, true); }
  });
  document.querySelectorAll('[data-pg-clock]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      showToast('Đang lấy GPS chính xác...');
      const result = await position();
      await recordPgAttendance({ type: button.dataset.pgClock, latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy });
      showToast(button.dataset.pgClock === 'checkin' ? 'Check-in PG thành công.' : 'Check-out PG thành công.');
      await navigateTo('attendance');
    } catch (error) {
      button.disabled = false;
      showToast(geolocationErrorMessage(error), true);
    }
  }));
}
