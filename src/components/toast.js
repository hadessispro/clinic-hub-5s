function vietnameseMessage(message) {
  const text = String(message || '').trim();
  if (!text) return 'Đã xảy ra lỗi. Vui lòng thử lại.';
  if (/user denied geolocation|permission denied|geolocation permission/i.test(text)) return 'Bạn đã từ chối quyền vị trí. Hãy mở Cài đặt trang web, cho phép Vị trí rồi thử lại.';
  if (/position unavailable|location unavailable/i.test(text)) return 'Thiết bị chưa xác định được vị trí. Hãy bật GPS, đứng gần cửa sổ và thử lại.';
  if (/timeout|timed out/i.test(text)) return 'Thiết bị phản hồi quá chậm. Vui lòng kiểm tra kết nối và thử lại.';
  if (/unauthorized|invalid token|jwt/i.test(text)) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (/failed to fetch|network error|load failed/i.test(text)) return 'Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.';
  if (/body cannot be empty/i.test(text)) return 'Nội dung gửi lên đang trống. Vui lòng nhập đầy đủ thông tin.';
  return text;
}

export function showToast(message, isError = false, variant = '') {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}${variant ? ` ${variant}-toast` : ''}`;
  const displayMessage = isError ? vietnameseMessage(message) : String(message || '');
  toast.setAttribute('role', isError ? 'alert' : 'status');
  toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  toast.innerHTML = `<span class="toast-status-icon" aria-hidden="true">${isError ? '!' : '✓'}</span><span class="toast-copy"><strong>${isError ? 'Không thể thực hiện' : 'Đã cập nhật'}</strong><span></span></span><button class="toast-close" type="button" aria-label="Đóng thông báo">×</button><i class="toast-progress" aria-hidden="true"></i>`;
  toast.querySelector('.toast-copy span').textContent = displayMessage;
  
  document.body.appendChild(toast);
  
  const close = () => { toast.classList.add('is-leaving'); window.setTimeout(() => toast.remove(), 160); };
  toast.querySelector('.toast-close').addEventListener('click', close);
  window.setTimeout(close, isError ? 5600 : 3800);
}
