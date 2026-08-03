import { escapeHTML } from '../utils.js';
import { PRIORITY_LABELS } from '../constants.js';

export function pill(text) {
  return `<span class="pill">${escapeHTML(String(text))}</span>`;
}

export function statusPill(text, tone) {
  return `<span class="status-pill ${tone || 'neutral'}">${escapeHTML(String(text))}</span>`;
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
  return `
    <article class="metric-card">
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
