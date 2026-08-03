export function showToast(message, isError = false) {
  // Remove existing toasts
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}`;
  toast.textContent = message;
  
  document.body.appendChild(toast);
  
  window.setTimeout(() => {
    toast.remove();
  }, 3600);
}
