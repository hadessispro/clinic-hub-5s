import { escapeHTML } from '../utils.js';
import { LEAD_STATUS, PRIORITY_LABELS } from '../constants.js';

export function pill(text, isRawHtml = false) {
  return `<span class="pill">${isRawHtml ? text : escapeHTML(String(text))}</span>`;
}

export function statusPill(text, tone) {
  return `<span class="status-pill ${tone || 'neutral'}">${escapeHTML(String(text))}</span>`;
}

export function leadStatusTone(status) {
  const tones = {
    new: 'lead-new',
    contacted: 'lead-contacted',
    appointment_booked: 'lead-appointment',
    visited: 'lead-visited',
    converted: 'lead-converted',
    appointment_cancelled: 'lead-appointment-cancelled',
    low_quality: 'lead-low-quality',
    cancelled: 'lead-cancelled',
  };
  return tones[status] || 'lead-unknown';
}

export function leadStatusPill(status) {
  return `<span class="status-pill lead-status ${leadStatusTone(status)}">${escapeHTML(LEAD_STATUS[status] || status || 'Chưa rõ')}</span>`;
}

export function priorityPill(priority) {
  const label = PRIORITY_LABELS[priority] || priority;
  return `<span class="priority-pill ${escapeHTML(priority)}">${escapeHTML(label)}</span>`;
}

export function statusTone(status) {
  if (status === 'approved' || status === 'done' || status === 'confirmed' || status === 'resolved') return 'good';
  if (status === 'rejected' || status === 'closed') return status === 'closed' ? 'good' : 'bad';
  return 'warn';
}

export function metric(label, value, detail) {
  const normalized = String(label || '').toLocaleLowerCase('vi-VN');
  const icon = normalized.includes('nhân sự') ? 'ri-team-line'
    : normalized.includes('chấm công') || normalized.includes('vào ca') ? 'ri-time-line'
      : normalized.includes('công việc') ? 'ri-checkbox-circle-line'
        : normalized.includes('đơn') ? 'ri-file-list-3-line'
          : normalized.includes('hẹn') ? 'ri-calendar-check-line'
            : normalized.includes('liên hệ') ? 'ri-phone-line'
              : normalized.includes('hồ sơ') || normalized.includes('khách') ? 'ri-contacts-line'
                : normalized.includes('thành công') ? 'ri-checkbox-circle-line'
                  : normalized.includes('tăng ca') ? 'ri-timer-line'
                    : normalized.includes('ngày công') ? 'ri-calendar-2-line'
                      : 'ri-bar-chart-box-line';
  return `
    <article class="metric-card">
      <div class="metric-card-head"><span class="metric-icon"><i class="${icon}"></i></span><span class="metric-chip">Hiện tại</span></div>
      <p class="metric-label">${escapeHTML(label)}</p>
      <p class="metric-value">${escapeHTML(String(value))}</p>
      <p class="metric-detail">${escapeHTML(detail)}</p>
    </article>
  `;
}

export function option(value, text, selected) {
  return `<option value="${escapeHTML(value)}"${selected ? ' selected' : ''}>${escapeHTML(text)}</option>`;
}

export function emptyState() {
  const template = document.getElementById('emptyStateTemplate');
  return template ? template.innerHTML : `
    <div class="empty-state">
      <strong>Chưa có dữ liệu</strong>
      <span>Thêm mới để bắt đầu theo dõi.</span>
    </div>
  `;
}
