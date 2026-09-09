import { dataClient } from '../data-client.js';
import { showToast } from '../components/toast.js';

function base64ToBytes(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function apiRequest(path, options = {}) {
  return dataClient.request(path.replace(/^\/api/, ''), options);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export async function ensurePushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const config = await apiRequest('/api/push-subscription');
    if (!config.publicKey) throw new Error('Máy chủ chưa cấu hình VAPID Public Key.');
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToBytes(config.publicKey),
    });
  }
  await apiRequest('/api/push-subscription', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });
  return subscription;
}

export async function getPushNotificationStatus() {
  const supported = window.isSecureContext && ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
  if (!supported) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
      isStandalone: isStandalone(),
    };
  }
  const permission = Notification.permission;
  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    subscribed = !!sub;
  } catch {
    subscribed = false;
  }
  return {
    supported: true,
    permission,
    subscribed,
    isStandalone: isStandalone(),
  };
}

export async function requestPushPermissionAndSubscribe() {
  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Trình duyệt hoặc thiết bị này không hỗ trợ Web Push.');
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos && !isStandalone()) {
    throw new Error('Trên iPhone: hãy bấm nút Chia sẻ (Share) ➔ chọn “Thêm vào MH chính”, sau đó mở app từ màn hình chính để kích hoạt thông báo.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bạn chưa cấp quyền nhận thông báo. Vui lòng cho phép thông báo trong Cài đặt của thiết bị.');
  }
  return ensurePushSubscription();
}

export async function sendTestPushNotification() {
  return apiRequest('/api/push-test', { method: 'POST' });
}

export async function unsubscribePushNotification() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await apiRequest('/api/push-subscription', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});
      await subscription.unsubscribe().catch(() => {});
    }
  } catch (err) {
    console.warn('[Push] Unsubscribe error:', err);
  }
  return true;
}

function renderPermissionPrompt() {
  if (document.getElementById('pushPermissionPrompt')) return;
  const prompt = document.createElement('section');
  prompt.id = 'pushPermissionPrompt';
  prompt.className = 'push-permission-prompt';

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const iosNotInstalled = isIos && !isStandalone();

  const hintText = iosNotInstalled
    ? '<small>Trên iPhone: Bấm nút <strong>Chia sẻ (Share ⎘)</strong> ➔ <strong>“Thêm vào MH chính”</strong> rồi mở app từ màn hình chính để nhận chuông.</small>'
    : '<small>Nhận chuông nhắc chấm công, nhắc checkout tan ca, tin nhắn từ trưởng bộ phận và duyệt đơn ngay trên điện thoại.</small>';

  prompt.innerHTML = `
    <span class="push-permission-icon" aria-hidden="true" style="font-size: 20px;">🔔</span>
    <div>
      <strong style="color: var(--teal-dark);">Bật thông báo trên điện thoại</strong>
      ${hintText}
    </div>
    <div class="push-permission-actions">
      <button type="button" class="secondary-button" data-push-later>Để sau</button>
      <button type="button" class="primary-button" data-enable-push>${iosNotInstalled ? 'Xem hướng dẫn' : 'Bật ngay'}</button>
    </div>`;

  const anchor = document.querySelector('.manager-strip') || document.querySelector('.topbar');
  const mainArea = document.querySelector('.main-area') || document.querySelector('.app-shell');
  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(prompt, anchor.nextSibling);
  } else if (mainArea) {
    mainArea.prepend(prompt);
  }

  prompt.querySelector('[data-push-later]')?.addEventListener('click', () => {
    sessionStorage.setItem('5s_push_prompt_later', '1');
    prompt.remove();
  });

  prompt.querySelector('[data-enable-push]')?.addEventListener('click', async (event) => {
    if (iosNotInstalled) {
      alert('Hướng dẫn cài đặt trên iPhone:\n1. Nhấn nút biểu tượng Chia sẻ (Share [↑]) ở cạnh dưới Safari.\n2. Chọn "Thêm vào Màn hình chính" (Add to Home Screen).\n3. Nhấn "Thêm". Sau đó mở biểu tượng Nha Khoa 5S trên màn hình chính và nhấn "Bật thông báo".');
      return;
    }
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Đang bật…';
    try {
      await requestPushPermissionAndSubscribe();
      prompt.remove();
      showToast('🔔 Đã bật thông báo trên điện thoại thành công!');
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Bật ngay';
      showToast(error.message || 'Không thể bật thông báo.', true);
    }
  });
}

// Chiến lược triển khai an toàn theo yêu cầu: Bật trước cho admin_it để thử nghiệm & cô lập lỗi
export const PUSH_ALLOWED_ROLES = new Set(['admin_it']);

export function isPushAllowedForRole(role) {
  return PUSH_ALLOWED_ROLES.has(role);
}

export async function initPushNotifications(authInfo) {
  if (!authInfo?.user) return;
  const role = authInfo.profile?.role;
  // Cô lập lỗi an toàn: Chỉ kích hoạt cho vai trò admin_it trong giai đoạn pilot
  if (!isPushAllowedForRole(role)) return;

  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'granted') {
    ensurePushSubscription().catch((error) => console.warn('[Push] Subscription refresh failed:', error));
    return;
  }
  if (Notification.permission === 'default' && sessionStorage.getItem('5s_push_prompt_later') !== '1') {
    renderPermissionPrompt();
  }
}

export function destroyPushNotifications() {
  document.getElementById('pushPermissionPrompt')?.remove();
}

export async function dispatchNotificationPush(notificationId) {
  if (!notificationId) return;
  try {
    await apiRequest('/api/push-dispatch', { method: 'POST', body: JSON.stringify({ notificationId }) });
  } catch (error) {
    console.warn('[Push] Dispatch failed:', error);
  }
}

