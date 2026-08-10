export function showToast(message, isError = false, variant = '') {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}${variant ? ` ${variant}-toast` : ''}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  window.setTimeout(() => {
    toast.remove();
  }, 3600);
}
