import { exportPgAttendanceCsv, getPgAssignments, getPgAttendance, recordPgAttendance } from '../services/marketing.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../components/toast.js';
import { navigateTo } from '../router.js';
import { store } from '../store.js';
import { geolocationErrorMessage } from '../services/geolocation.js';
import {
  discardRejected, enqueue, listPending, listRejected, makeClientEventId, syncQueue,
} from '../services/pg-attendance-offline.js';

let assignments = [];
let records = [];
let pendingQueue = [];
let rejectedQueue = [];
let networkListenerBound = false;
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
  const pgCode = profile.employee_code || '';
  // Mất mạng thì vẫn phải mở được màn chấm công: dữ liệu máy chủ để rỗng,
  // hàng đợi trên thiết bị vẫn đọc được và PG vẫn bấm chấm công được.
  [assignments, records, pendingQueue, rejectedQueue] = await Promise.all([
    getPgAssignments(isPg ? today() : reportFrom).catch(() => []),
    getPgAttendance(isPg ? today() : reportFrom, isPg ? today() : reportTo).catch(() => []),
    isPg ? listPending(pgCode) : Promise.resolve([]),
    isPg ? listRejected(pgCode) : Promise.resolve([]),
  ]);
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
  const hasCheckin = records.some((row) => row.record_type === 'checkin')
    || pendingQueue.some((row) => row.type === 'checkin');
  const hasCheckout = records.some((row) => row.record_type === 'checkout')
    || pendingQueue.some((row) => row.type === 'checkout');
  const queueBanner = `
    ${pendingQueue.length ? `
      <div class="attendance-sync-banner">
        <div><strong>${pendingQueue.length} lượt chấm công đang chờ đồng bộ</strong><span>Đã lưu an toàn trên máy kèm đúng giờ và tọa độ lúc bấm. Sẽ tự gửi khi có mạng.</span></div>
        <button type="button" data-pg-sync ${navigator.onLine ? '' : 'disabled'}>Đồng bộ ngay</button>
      </div>` : ''}
    ${rejectedQueue.length ? `
      <div class="attendance-sync-banner is-rejected">
        <div>
          <strong>${rejectedQueue.length} lượt bị máy chủ từ chối</strong>
          <span>${escapeHTML(rejectedQueue[0].syncError || 'Lượt chấm công không hợp lệ.')}${rejectedQueue.length > 1 ? ` (và ${rejectedQueue.length - 1} lượt khác)` : ''} Hãy báo Support để bổ sung công thủ công.</span>
        </div>
        <button type="button" data-pg-discard>Đã hiểu, xóa</button>
      </div>` : ''}`;

  return `<div class="attendance-page">
    ${queueBanner}
    <header class="attendance-page-header"><div><p class="eyebrow">GPS Attendance · PG Marketing</p><h3>Chấm công vào ca</h3><p>${dateLabel(today())}</p></div><div class="attendance-header-actions"><span class="network-status ${navigator.onLine ? 'is-online' : 'is-offline'}"><span></span>${navigator.onLine ? 'Đang online' : 'Đang ngoại tuyến'}</span></div></header>
    ${shift ? `<section class="attendance-primary-card ${hasCheckout ? 'is-complete' : (hasCheckin ? 'is-active' : '')}">
      <div class="attendance-time-block"><span>Ca Support phân công</span><strong>${escapeHTML(String(shift.start_time).slice(0,5))}</strong><small>Kết thúc ${escapeHTML(String(shift.end_time).slice(0,5))}</small></div>
      <div class="attendance-primary-copy"><p class="eyebrow">${hasCheckout ? 'Đã hoàn thành' : (hasCheckin ? 'Đang trong ca' : 'Sẵn sàng check-in')}</p><h3>${escapeHTML(shift.site_name)}</h3><p>${escapeHTML(shift.address)}</p></div>
      ${hasCheckin ? `<button class="attendance-checkout-button" data-pg-clock="checkout" ${hasCheckout ? 'disabled' : ''}><span class="attendance-button-icon">↗</span><span><strong>${hasCheckout ? 'Đã check-out' : 'Check-out kết ca'}</strong><small>Xác minh GPS tại điểm làm việc</small></span></button>` : `<button class="attendance-checkin-button" data-pg-clock="checkin"><span class="attendance-button-icon">⌖</span><span><strong>Xác nhận chấm công</strong><small>Ca do Support phân công</small></span></button>`}
    </section>
    <div class="attendance-info-grid"><section class="attendance-office-card"><div class="attendance-card-icon">⌖</div><div><p class="eyebrow">Điểm chấm công</p><h3>${escapeHTML(shift.site_name)}</h3><p>${escapeHTML(shift.address)}</p></div><span class="attendance-radius">${shift.allowed_radius_m} m</span></section><section class="attendance-rule-card"><div class="attendance-card-icon">⏱</div><div><p class="eyebrow">Quy định hôm nay</p><h3>Ca ${escapeHTML(String(shift.start_time).slice(0,5))}–${escapeHTML(String(shift.end_time).slice(0,5))}</h3><p>Vị trí và thời gian do Support thiết lập · sai số GPS tối đa ±${shift.max_accuracy_m} m.</p></div></section></div>` : '<section class="attendance-primary-card"><div class="attendance-primary-copy"><p class="eyebrow">Chưa có ca hôm nay</p><h3>Support chưa phân công vị trí</h3><p>Sau khi Support giao ngày, giờ và điểm làm việc, ca sẽ tự động xuất hiện tại đây.</p></div></section>'}
    <section class="attendance-history-panel"><div class="section-title"><div><p class="eyebrow">Lịch sử</p><h3>Chấm công hôm nay</h3></div><span class="pill">${records.length} lượt</span></div>
      <div class="table-wrap"><table><thead><tr><th>Loại</th><th>Thời gian</th><th>Khoảng cách</th><th>GPS</th><th>Trạng thái</th></tr></thead><tbody>${pendingQueue.map((row) => `<tr><td>${row.type === 'checkin' ? 'Vào ca' : 'Ra ca'}</td><td>${new Date(row.capturedAt).toLocaleString('vi-VN')}</td><td>—</td><td>±${Math.round(row.accuracy)} m</td><td>Chờ đồng bộ</td></tr>`).join('')}${records.length ? records.map((row) => `<tr><td>${row.record_type === 'checkin' ? 'Vào ca' : 'Ra ca'}</td><td>${new Date(row.recorded_at).toLocaleString('vi-VN')}</td><td>${row.distance_m} m</td><td>±${row.accuracy_m} m</td><td>${escapeHTML(row.status)}</td></tr>`).join('') : (pendingQueue.length ? '' : '<tr><td colspan="5">Chưa chấm công.</td></tr>')}</tbody></table></div>
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
  document.querySelector('[data-pg-sync]')?.addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    await runSync({ announce: true });
    await navigateTo('attendance');
  });

  document.querySelector('[data-pg-discard]')?.addEventListener('click', async () => {
    await discardRejected(store.getState().profile?.employee_code || '');
    showToast('Đã xóa các lượt bị từ chối khỏi thiết bị.');
    await navigateTo('attendance');
  });

  document.querySelectorAll('[data-pg-clock]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    const type = button.dataset.pgClock;

    // GPS luôn phải lấy thật tại thời điểm bấm, kể cả khi đang mất mạng. Định
    // vị là chức năng của thiết bị, không phụ thuộc Internet.
    let coords;
    try {
      showToast('Đang lấy GPS chính xác...');
      const result = await position();
      coords = result.coords;
    } catch (error) {
      button.disabled = false;
      showToast(geolocationErrorMessage(error), true);
      return;
    }

    const entry = {
      clientEventId: makeClientEventId(),
      pgCode: store.getState().profile?.employee_code || '',
      type,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: Math.round(coords.accuracy),
      capturedAt: new Date().toISOString(),
    };

    // Mất mạng thì lưu thẳng vào hàng đợi, giữ nguyên giờ và tọa độ lúc bấm.
    if (!navigator.onLine) {
      await queueOffline(entry, type);
      await navigateTo('attendance');
      return;
    }

    try {
      await recordPgAttendance({
        clientEventId: entry.clientEventId,
        type,
        latitude: entry.latitude,
        longitude: entry.longitude,
        accuracy: entry.accuracy,
        capturedAt: entry.capturedAt,
        offline: false,
      });
      showToast(type === 'checkin' ? 'Check-in PG thành công.' : 'Check-out PG thành công.');
      await navigateTo('attendance');
    } catch (error) {
      // Mạng hỏng giữa chừng: thiết bị không biết yêu cầu đã tới máy chủ hay
      // chưa, nên cứ đưa vào hàng đợi. clientEventId đảm bảo gửi lại không tạo
      // bản ghi thứ hai. Lỗi nghiệp vụ thật thì báo nguyên văn cho PG.
      if (isOffline(error)) {
        await queueOffline(entry, type);
      } else {
        button.disabled = false;
        showToast(error?.message || 'Không ghi nhận được chấm công.', true);
        return;
      }
      await navigateTo('attendance');
    }
  }));

  if (!networkListenerBound) {
    networkListenerBound = true;
    window.addEventListener('online', () => { runSync({ announce: true }).then(() => navigateTo('attendance')); });
  }
}

function isOffline(error) {
  const message = String(error?.message || '').toLowerCase();
  return !navigator.onLine
    || error instanceof TypeError
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('load failed');
}

async function queueOffline(entry, type) {
  try {
    await enqueue(entry);
    showToast(type === 'checkin'
      ? 'Đã lưu check-in trên máy kèm đúng giờ và vị trí. Sẽ tự gửi khi có mạng.'
      : 'Đã lưu check-out trên máy kèm đúng giờ và vị trí. Sẽ tự gửi khi có mạng.');
  } catch (error) {
    showToast(`Không lưu được chấm công lên thiết bị: ${error.message}`, true);
  }
}

async function runSync({ announce = false } = {}) {
  const pgCode = store.getState().profile?.employee_code || '';
  const result = await syncQueue((payload) => recordPgAttendance(payload), pgCode);
  if (announce) {
    if (result.rejected > 0) {
      showToast(`${result.rejected} lượt chấm công bị máy chủ từ chối và đã dừng gửi lại.`, true);
    }
    showToast(result.synced
      ? `Đã đồng bộ ${result.synced} lượt chấm công.`
      : 'Chưa có lượt nào được đồng bộ.');
  }
  return result;
}
