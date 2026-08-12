let activeDialog = null;

function closeDialog(value) {
  if (!activeDialog) return;
  const { root, resolve, previousFocus } = activeDialog;
  activeDialog = null;
  root.classList.add('is-closing');
  document.body.classList.remove('app-modal-open');
  window.setTimeout(() => root.remove(), 150);
  previousFocus?.focus?.();
  resolve(value);
}

function openDialog({ title, message, confirmText, cancelText, tone = 'default', input = null }) {
  if (activeDialog) closeDialog(null);
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'system-dialog-layer';
    root.innerHTML = `
      <button class="system-dialog-backdrop" type="button" aria-label="Đóng hộp thoại"></button>
      <section class="system-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="systemDialogTitle">
        <header class="system-dialog-header">
          <span class="system-dialog-icon ${tone}" aria-hidden="true">${tone === 'danger' ? '!' : tone === 'success' ? '✓' : '?'}</span>
          <div><p class="eyebrow">CLINIC HUB</p><h3 id="systemDialogTitle"></h3></div>
          <button class="icon-button system-dialog-close" type="button" aria-label="Đóng">×</button>
        </header>
        <p class="system-dialog-message"></p>
        ${input ? `<label class="system-dialog-field"><span>${input.label || 'Nội dung'}</span><textarea rows="4" maxlength="${input.maxLength || 1000}" placeholder="${input.placeholder || ''}"></textarea><small>Không nhập thông tin nhạy cảm.</small></label>` : ''}
        <footer class="system-dialog-actions">
          ${cancelText ? `<button class="secondary-button" type="button" data-dialog-cancel>${cancelText}</button>` : ''}
          <button class="primary-button ${tone === 'danger' ? 'danger-action' : ''}" type="button" data-dialog-confirm>${confirmText}</button>
        </footer>
      </section>`;
    root.querySelector('#systemDialogTitle').textContent = title;
    root.querySelector('.system-dialog-message').textContent = message;
    document.body.appendChild(root);
    document.body.classList.add('app-modal-open');
    const previousFocus = document.activeElement;
    activeDialog = { root, resolve, previousFocus };
    requestAnimationFrame(() => root.classList.add('is-open'));
    const textarea = root.querySelector('textarea');
    const confirm = root.querySelector('[data-dialog-confirm]');
    const cancel = () => closeDialog(input ? null : false);
    root.querySelector('.system-dialog-backdrop').addEventListener('click', cancel);
    root.querySelector('.system-dialog-close').addEventListener('click', cancel);
    root.querySelector('[data-dialog-cancel]')?.addEventListener('click', cancel);
    confirm.addEventListener('click', () => closeDialog(input ? textarea.value.trim() : true));
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') cancel();
      if (event.key === 'Enter' && !event.shiftKey && document.activeElement !== textarea) confirm.click();
    });
    (textarea || confirm).focus();
  });
}

export function confirmAction(message, options = {}) {
  return openDialog({ title: options.title || 'Xác nhận thao tác', message, confirmText: options.confirmText || 'Xác nhận', cancelText: options.cancelText || 'Hủy', tone: options.tone || 'default' });
}

export function requestInput(message, options = {}) {
  return openDialog({ title: options.title || 'Bổ sung thông tin', message, confirmText: options.confirmText || 'Tiếp tục', cancelText: options.cancelText || 'Hủy', tone: options.tone || 'default', input: { label: options.label, placeholder: options.placeholder, maxLength: options.maxLength } });
}

export function showNotice(message, options = {}) {
  return openDialog({ title: options.title || 'Thông báo', message, confirmText: options.confirmText || 'Đã hiểu', tone: options.tone || 'default' });
}
