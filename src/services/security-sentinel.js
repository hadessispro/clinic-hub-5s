/**
 * Security Sentinel - Giám sát an ninh đầu cuối (Frontend Anti-Tamper)
 *
 * Tối ưu hóa theo quy chuẩn Clinic Hub 5S:
 * 1. KHÔNG can thiệp hoặc làm phiền người dùng trên thiết bị di động (Mobile View).
 * 2. LOẠI BỎ hoàn toàn cơ chế đo chênh lệch kích thước cửa sổ (window size differential)
 *    và console getter định kỳ vì gây báo động giả liên tục trên mobile/responsive.
 * 3. Chỉ ghi nhận sự kiện phím tắt F12 trên máy tính để bàn (Desktop PC) phục vụ nhật ký an ninh,
 *    không can thiệp, không chặn luồng debug và KHÔNG spam Telegram.
 */

const SESSION_KEY = '5s_vps_session_v1';
const ALERT_COOLDOWN_MS = 300_000; // Giới hạn gửi cảnh báo tối đa 1 lần / 5 phút, tránh hao tài nguyên
const lastAlertTimes = new Map();

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return true;
  return false;
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.user || null;
  } catch {
    return null;
  }
}

function sendTamperAlert(type, details = {}) {
  // Bỏ qua hoàn toàn nếu là thiết bị di động
  if (isMobileDevice()) return;

  const now = Date.now();
  const lastTime = lastAlertTimes.get(type) || 0;
  if (now - lastTime < ALERT_COOLDOWN_MS) {
    return; // Đang trong thời gian giãn cách (cooldown)
  }
  lastAlertTimes.set(type, now);

  const user = getCurrentUser();
  const payload = {
    type,
    actorCode: user?.employeeCode || '',
    actorName: user?.profile?.full_name || '',
    actorRole: user?.role || '',
    branchId: user?.branchId || '',
    details: {
      url: window.location.href,
      pathname: window.location.pathname,
      timestamp: new Date().toISOString(),
      screen: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      device: 'Desktop PC',
      ...details,
    },
  };

  const url = '/api/v2/security/client-tamper';
  const body = JSON.stringify(payload);

  if (typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    const success = navigator.sendBeacon(url, blob);
    if (success) return;
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Silent fail
  });
}

/**
 * Lắng nghe phím tắt mở DevTools chỉ trên máy tính để bàn (Desktop PC)
 */
function setupKeyboardListeners() {
  if (isMobileDevice()) return;

  window.addEventListener(
    'keydown',
    (e) => {
      // F12 vật lý trên bàn phím
      if (e.key === 'F12' || e.keyCode === 123) {
        sendTamperAlert('f12_opened', { trigger: 'keyboard_f12' });
        return;
      }

      // Ctrl + Shift + I / Cmd + Opt + I (DevTools)
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = String(e.key || '').toUpperCase();

      if (isCtrlOrCmd && isShift && (key === 'I' || key === 'J' || key === 'C')) {
        sendTamperAlert('f12_opened', { trigger: `keyboard_shortcut_${key}` });
      }
    },
    { capture: true },
  );
}

/**
 * Khởi chạy Sentinel: Loại bỏ hoàn toàn detector kích thước và console getter
 */
export function initSecuritySentinel() {
  if (isMobileDevice()) return;
  setupKeyboardListeners();
}
