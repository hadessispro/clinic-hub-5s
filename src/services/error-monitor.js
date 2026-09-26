import { dataClient } from '../data-client.js';

const sent = new Map();
const TTL = 60_000;

function isKnownExternalNoise(event) {
  const message = cleanMessage(event?.error || event?.message || event?.reason);
  const lower = message.toLowerCase();
  return lower.includes('zaloj')
    || lower.includes('zalo')
    || lower.includes('isrecreate')
    || lower.includes('fb_xd_fragment')
    || (lower.includes('script error') && !event?.filename);
}

function cleanMessage(value) {
  return String(value?.message || value || 'Lỗi không xác định').slice(0, 2000);
}

export async function reportClientError(error, context = {}, level = 'error') {
  const message = cleanMessage(error);
  const key = `${level}:${message}:${context.source || ''}`;
  const now = Date.now();
  if (sent.has(key) && now - sent.get(key) < TTL) return;
  sent.set(key, now);
  try {
    await dataClient.rpc('report_client_error', {
      p_level: level,
      p_message: message,
      p_context: {
        ...context,
        stack: String(error?.stack || '').slice(0, 5000),
        view: document.body?.dataset?.view || null,
      },
      p_page_url: location.href,
      p_user_agent: navigator.userAgent,
    });
  } catch {
    // Error monitoring must never interrupt the application.
  }
}

export function initErrorMonitoring() {
  window.addEventListener('error', (event) => {
    if (isKnownExternalNoise(event)) return;
    reportClientError(event.error || event.message, {
      source: 'window.error', filename: event.filename, line: event.lineno, column: event.colno,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (isKnownExternalNoise(event)) return;
    reportClientError(event.reason, { source: 'unhandledrejection' });
  });
}
