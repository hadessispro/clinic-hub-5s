import { api } from '../local-client.js';

const SMTP_STORAGE_KEY = 'clinic_hub_payroll_smtp';

/**
 * Load saved SMTP config from browser sessionStorage (or localStorage if opted)
 */
export function getSavedSmtpConfig() {
  try {
    const raw = sessionStorage.getItem(SMTP_STORAGE_KEY) || localStorage.getItem(SMTP_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save SMTP config into sessionStorage
 */
export function saveSmtpConfig(config, persistLocal = false) {
  try {
    const json = JSON.stringify(config);
    sessionStorage.setItem(SMTP_STORAGE_KEY, json);
    if (persistLocal) {
      localStorage.setItem(SMTP_STORAGE_KEY, json);
    } else {
      localStorage.removeItem(SMTP_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Clear in-memory / session SMTP config
 */
export function clearSmtpConfig() {
  try {
    sessionStorage.removeItem(SMTP_STORAGE_KEY);
    localStorage.removeItem(SMTP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Check if the system SMTP is configured (by admin_it via system-admin)
 */
export async function getSystemSmtpStatus() {
  try {
    return await api('/payroll/smtp-status', { timeout: 8000 });
  } catch {
    return { ok: false, isConfigured: false };
  }
}

/**
 * Test SMTP connection and authentication
 */
export async function testSmtpConnection(smtpConfig) {
  try {
    const res = await api('/payroll/test-smtp', {
      method: 'POST',
      body: JSON.stringify(smtpConfig),
      timeout: 16000,
    });
    if (res?.success) {
      return { success: true, message: res.message || 'Kết nối thành công!' };
    }
    return { success: false, message: res?.message || 'Không thể kết nối đến máy chủ SMTP.' };
  } catch (err) {
    return { success: false, message: err?.message || 'Lỗi mạng hoặc máy chủ không phản hồi.' };
  }
}

/**
 * Send single payslip email.
 * If smtpConfig is null/undefined, backend auto-uses system SMTP from DB/env.
 */
export async function sendPayslipEmail(smtpConfig, { to, subject, html, text }) {
  const res = await api('/payroll/send-payslip', {
    method: 'POST',
    body: JSON.stringify({
      smtp: smtpConfig || undefined,
      to,
      subject,
      html,
      text,
    }),
    timeout: 35000,
  });

  if (res?.success) {
    return { success: true, messageId: res.messageId };
  }
  throw new Error(res?.message || 'Gửi thư thất bại');
}

