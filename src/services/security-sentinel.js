/**
 * Security Sentinel - Giám sát an ninh đầu cuối (Frontend Anti-Tamper)
 *
 * Nhiệm vụ:
 * 1. Bắt phím tắt F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U.
 * 2. Phát hiện cửa sổ Developer Tools / Console được mở.
 * 3. Gửi cảnh báo tức thì về Backend (/api/v2/security/client-tamper) để đẩy về Telegram của Quản trị viên.
 */

const SESSION_KEY = '5s_vps_session_v1';
const ALERT_COOLDOWN_MS = 60_000; // Giới hạn gửi cảnh báo tối đa 1 lần/phút cho mỗi loại sự kiện
const lastAlertTimes = new Map();

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
  const now = Date.now();
  const lastTime = lastAlertTimes.get(type) || 0;
  if (now - lastTime < ALERT_COOLDOWN_MS) {
    return; // Đang trong thời gian giãn cách (cooldown), tránh spam
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
      ...details,
    },
  };

  const url = '/api/v2/security/client-tamper';
  const body = JSON.stringify(payload);

  // Ưu tiên navigator.sendBeacon để không bị hủy ngay cả khi người dùng tắt trình duyệt
  if (typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' });
    const success = navigator.sendBeacon(url, blob);
    if (success) return;
  }

  // Fallback sang fetch API
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Silent fail on network error
  });
}

/**
 * 1. Lắng nghe phím tắt mở DevTools
 */
function setupKeyboardListeners() {
  window.addEventListener(
    'keydown',
    (e) => {
      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        sendTamperAlert('f12_opened', { trigger: 'keyboard_f12' });
        return;
      }

      // Ctrl + Shift + I / Cmd + Opt + I (DevTools)
      // Ctrl + Shift + J / Cmd + Opt + J (Console)
      // Ctrl + Shift + C / Cmd + Opt + C (Inspect Element)
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = String(e.key || '').toUpperCase();

      if (isCtrlOrCmd && isShift && (key === 'I' || key === 'J' || key === 'C')) {
        sendTamperAlert('f12_opened', { trigger: `keyboard_shortcut_${key}` });
        return;
      }

      // Ctrl + U (View Source)
      if (isCtrlOrCmd && key === 'U') {
        sendTamperAlert('f12_opened', { trigger: 'keyboard_view_source' });
      }
    },
    { capture: true },
  );
}

/**
 * 2. Phát hiện mở DevTools thông qua kích thước chênh lệch màn hình
 */
function setupWindowSizeDetector() {
  let devtoolsOpen = false;
  const threshold = 160;

  setInterval(() => {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;

    const isOpen = widthDiff > threshold || heightDiff > threshold;
    if (isOpen && !devtoolsOpen) {
      devtoolsOpen = true;
      sendTamperAlert('devtools_opened', {
        trigger: 'window_size_differential',
        widthDiff,
        heightDiff,
      });
    } else if (!isOpen && devtoolsOpen) {
      devtoolsOpen = false;
    }
  }, 2000);
}

/**
 * 3. Phát hiện Console Getter / Tamper Detection
 */
function setupConsoleTamperDetector() {
  try {
    const sentinel = {
      get id() {
        sendTamperAlert('console_tamper', {
          trigger: 'console_evaluated',
          action: 'Người dùng đang quan sát hoặc tương tác trực tiếp trên Console',
        });
        return '5s_security_guard';
      },
    };

    // Định kỳ gửi sentinel vào debug log; khi DevTools mở và tự động render object, getter sẽ kích hoạt
    setInterval(() => {
      console.debug(sentinel);
    }, 4000);
  } catch {
    // Ignored
  }
}

/**
 * Khởi chạy Sentinel
 */
export function initSecuritySentinel() {
  setupKeyboardListeners();
  setupWindowSizeDetector();
  setupConsoleTamperDetector();
}
