import { supabase } from '../supabase.js';
import { showToast } from '../components/toast.js';

const PUSH_ROLES = new Set(['admin', 'hr', 'leader', 'admin_it']);

function base64ToBytes(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function apiRequest(path, options = {}) {
  if (supabase.isLocal) return supabase.request(path.replace(/^\/api/, ''), options);
  const token = await accessToken();
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'Không thể cấu hình thông báo trên thiết bị.');
  return payload;
}

async function ensurePushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const config = await apiRequest('/api/push-subscription');
    if (!config.publicKey) throw new Error('Máy chủ chưa có khóa thông báo Web Push.');
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

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function renderPermissionPrompt() {
  if (document.getElementById('pushPermissionPrompt')) return;
  const prompt = document.createElement('section');
  prompt.id = 'pushPermissionPrompt';
  prompt.className = 'push-permission-prompt';
  const iosHint = /iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()
    ? '<small>Trên iPhone: hãy “Thêm vào Màn hình chính” trước, sau đó mở lại ứng dụng để bật.</small>'
    : '<small>Thông báo đơn, lịch và tác vụ cần duyệt sẽ xuất hiện ngay cả khi PWA đang đóng.</small>';
  prompt.innerHTML = `
    <span class="push-permission-icon" aria-hidden="true">🔔</span>
    <div><strong>Bật thông báo quản lý</strong>${iosHint}</div>
    <div class="push-permission-actions">
      <button type="button" class="secondary-button" data-push-later>Để sau</button>
      <button type="button" class="primary-button" data-enable-push>Bật thông báo</button>
    </div>`;
  const anchor = document.querySelector('.manager-strip');
  (anchor?.parentElement || document.querySelector('.main-area'))?.insertBefore(prompt, anchor?.nextSibling || null);
  prompt.querySelector('[data-push-later]')?.addEventListener('click', () => {
    sessionStorage.setItem('5s_push_prompt_later', '1');
    prompt.remove();
  });
  prompt.querySelector('[data-enable-push]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Đang bật…';
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Bạn chưa cho phép ứng dụng gửi thông báo.');
      await ensurePushSubscription();
      prompt.remove();
      showToast('🔔 Đã bật thông báo quản lý trên thiết bị này.');
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Bật thông báo';
      showToast(error.message || 'Không thể bật thông báo.', true);
    }
  });
}

export async function initPushNotifications(authInfo) {
  if (!authInfo?.user || !PUSH_ROLES.has(authInfo.profile?.role)) return;
  if (!window.isSecureContext || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission === 'granted') {
    ensurePushSubscription().catch((error) => console.warn('[Push] Subscription refresh failed:', error));
    return;
  }
  if (Notification.permission === 'default' && sessionStorage.getItem('5s_push_prompt_later') !== '1') renderPermissionPrompt();
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
