/* ── XSS Protection ── */
export function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const escapeAttr = escapeHTML;

/* ── Date & Time Formatting ── */
export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(dateStr));
  } catch { return dateStr; }
}

export function formatTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(dateStr));
  } catch { return dateStr; }
}

export function formatShortDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit',
    }).format(new Date(dateStr));
  } catch { return dateStr; }
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(dateStr));
  } catch { return dateStr; }
}

export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function todayISO() {
  return toISODate(new Date());
}

/* ── Currency ── */
export function formatCurrency(value) {
  if (value == null || isNaN(value)) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

/* ── Haversine Distance (meters) ── */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Text Search ── */
export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

export function smartMatch(haystack, query) {
  if (!query) return true;
  const normalized = normalizeText(haystack);
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  return terms.every((term) => normalized.includes(term));
}

/* ── ID Generation ── */
export function makeId(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Misc ── */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function countBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

export function splitList(text) {
  if (!text) return [];
  return text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
}

/* ── Download helper ── */
export function downloadText(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function attendanceStatusLabel(status) {
  if (status === 'valid') return 'Hợp lệ';
  if (status === 'late') return 'Đi muộn';
  if (status === 'outside') return 'Ngoài bán kính';
  return 'Cần xác minh';
}

/* ── Department / Shift lookups ── */
import { DEPARTMENTS, SHIFTS, UNIFORM_CATALOG } from './constants.js';

export function departmentName(id) {
  return DEPARTMENTS.find((d) => d.id === id)?.name || id || '—';
}

export function shiftById(id) {
  return SHIFTS.find((s) => s.id === id) || null;
}

export function uniformPackageFor(department, roleTitle) {
  const haystack = normalizeText(`${department} ${roleTitle}`);
  return UNIFORM_CATALOG.find((pkg) => pkg.matcher.some((m) => haystack.includes(m))) || UNIFORM_CATALOG.at(-1);
}
