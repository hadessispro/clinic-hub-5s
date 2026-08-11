import { getPgAssignments, getPgAttendance, recordPgAttendance } from '../services/marketing.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';

let assignments = [];
let records = [];
function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); }

export async function renderView() {
  [assignments, records] = await Promise.all([getPgAssignments(today()), getPgAttendance(today(), today())]);
  const shift = assignments[0];
  const hasCheckin = records.some((row) => row.record_type === 'checkin');
  const hasCheckout = records.some((row) => row.record_type === 'checkout');
  return `<div class="view-header"><div><p class="eyebrow">PG ATTENDANCE</p><h3>Chấm công tại vị trí Support phân công</h3></div></div>
    <section class="panel pg-attendance-card">
      ${shift ? `<div class="checkin-summary-grid"><div><span>Ngày làm</span><strong>${escapeHTML(shift.work_date)}</strong></div><div><span>Ca làm</span><strong>${escapeHTML(String(shift.start_time).slice(0,5))}–${escapeHTML(String(shift.end_time).slice(0,5))}</strong></div><div class="full"><span>Vị trí</span><strong>${escapeHTML(shift.site_name)}</strong><small>${escapeHTML(shift.address)}</small></div></div>
      <div class="checkin-policy-note"><strong>Điều kiện GPS</strong><p>Trong bán kính ${shift.allowed_radius_m} m · sai số tối đa ±${shift.max_accuracy_m} m.</p></div>
      <div class="button-row"><button class="primary-button" data-pg-clock="checkin" ${hasCheckin ? 'disabled' : ''}>${hasCheckin ? 'Đã check-in' : 'Check-in vào ca'}</button><button class="secondary-button" data-pg-clock="checkout" ${!hasCheckin || hasCheckout ? 'disabled' : ''}>${hasCheckout ? 'Đã check-out' : 'Check-out kết ca'}</button></div>` : '<div class="empty-state"><strong>Chưa được phân công hôm nay</strong><p>Liên hệ Support để được tạo ngày, giờ và vị trí chấm công.</p></div>'}
    </section>
    <section class="panel" style="margin-top:14px"><div class="section-title"><h3>Lịch sử hôm nay</h3><span class="pill">${records.length} lượt</span></div>
      <div class="table-wrap"><table><thead><tr><th>Loại</th><th>Thời gian</th><th>Khoảng cách</th><th>GPS</th><th>Trạng thái</th></tr></thead><tbody>${records.length ? records.map((row) => `<tr><td>${row.record_type === 'checkin' ? 'Vào ca' : 'Ra ca'}</td><td>${new Date(row.recorded_at).toLocaleString('vi-VN')}</td><td>${row.distance_m} m</td><td>±${row.accuracy_m} m</td><td>${escapeHTML(row.status)}</td></tr>`).join('') : '<tr><td colspan="5">Chưa chấm công.</td></tr>'}</tbody></table></div>
    </section>`;
}

function position() {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
}

export function initView() {
  document.querySelectorAll('[data-pg-clock]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      showToast('Đang lấy GPS chính xác...');
      const result = await position();
      await recordPgAttendance({ type: button.dataset.pgClock, latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy });
      showToast(button.dataset.pgClock === 'checkin' ? 'Check-in PG thành công.' : 'Check-out PG thành công.');
      await navigateTo('pg-attendance');
    } catch (error) {
      button.disabled = false;
      showToast(error.message || 'Không lấy được vị trí GPS.', true);
    }
  }));
}

