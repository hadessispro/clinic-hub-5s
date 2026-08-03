import { signIn } from '../auth.js';
import { BRANCH } from '../branch.js';
import { showToast } from './toast.js';

const LAST_EMAIL_KEY = '5s_clinic_last_email';
let loginContainer = null;

function updateNetworkLabel() {
  const label = loginContainer?.querySelector('[data-login-network]');
  if (!label) return;
  label.className = `login-network ${navigator.onLine ? 'online' : 'offline'}`;
  label.textContent = navigator.onLine ? 'Đang kết nối hệ thống' : 'Đang ngoại tuyến';
}

export function showLogin() {
  const appShell = document.querySelector('.app-shell');
  if (appShell) appShell.style.display = 'none';

  if (!loginContainer) {
    loginContainer = document.createElement('main');
    loginContainer.id = 'loginScreen';
    loginContainer.className = 'login-screen-container';
    loginContainer.innerHTML = `
      <section class="login-card" aria-labelledby="loginTitle">
        <div class="login-brand">
          <img src="/images/nino-clinic-room.jpg" alt="Không gian Nha Khoa 5S" class="login-photo" />
          <div class="login-brand-overlay">
            <span class="login-branch-badge">Chi nhánh Lê Văn Thọ</span>
            <h1 id="loginTitle">Chấm công 5S</h1>
            <p>${BRANCH.address}</p>
          </div>
        </div>

        <div class="login-content">
          <div class="login-heading">
            <div>
              <p class="eyebrow">Clinic Hub</p>
              <h2>Đăng nhập nhân viên</h2>
            </div>
            <span class="login-network" data-login-network></span>
          </div>

          <form class="login-form" id="loginForm">
            <div class="input-group">
              <label for="loginEmail">Email</label>
              <input type="email" id="loginEmail" placeholder="tennhanvien@gmail.com" required autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" />
            </div>
            <div class="input-group">
              <label for="loginPassword">Mật khẩu</label>
              <div class="password-field">
                <input type="password" id="loginPassword" placeholder="Nhập số điện thoại" required autocomplete="current-password" inputmode="numeric" />
                <button type="button" class="password-toggle" data-action="toggle-password" aria-label="Hiện mật khẩu">Hiện</button>
              </div>
              <small>Mật khẩu ban đầu là số điện thoại của bạn, viết liền không khoảng trắng.</small>
            </div>
            <button type="submit" class="login-btn" id="loginSubmitBtn">
              <span>Đăng nhập và chấm công</span>
            </button>
          </form>

          <div class="login-trust-row" aria-label="Thông tin chấm công">
            <span>GPS trực tiếp</span>
            <span>08:00</span>
            <span>Có lưu ngoại tuyến</span>
          </div>
          <p class="login-privacy">Vị trí chỉ được ghi nhận khi bạn bấm xác nhận chấm công.</p>
        </div>
      </section>
    `;

    document.body.appendChild(loginContainer);
    loginContainer.querySelector('#loginForm').addEventListener('submit', handleLoginSubmit);
    loginContainer.querySelector('[data-action="toggle-password"]').addEventListener('click', togglePassword);
    window.addEventListener('online', updateNetworkLabel);
    window.addEventListener('offline', updateNetworkLabel);
  } else {
    loginContainer.style.display = 'grid';
  }

  const emailInput = loginContainer.querySelector('#loginEmail');
  if (emailInput && !emailInput.value) {
    emailInput.value = localStorage.getItem(LAST_EMAIL_KEY) || '';
  }
  updateNetworkLabel();
  requestAnimationFrame(() => (emailInput?.value ? loginContainer.querySelector('#loginPassword') : emailInput)?.focus());
}

export function hideLogin() {
  if (loginContainer) loginContainer.style.display = 'none';
  const appShell = document.querySelector('.app-shell');
  if (appShell) appShell.style.removeProperty('display');
}

function togglePassword(event) {
  const input = loginContainer?.querySelector('#loginPassword');
  if (!input) return;
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  event.currentTarget.textContent = reveal ? 'Ẩn' : 'Hiện';
  event.currentTarget.setAttribute('aria-label', reveal ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const emailInput = loginContainer?.querySelector('#loginEmail');
  const passwordInput = loginContainer?.querySelector('#loginPassword');
  const submitBtn = loginContainer?.querySelector('#loginSubmitBtn');
  if (!emailInput || !passwordInput || !submitBtn) return;

  if (!navigator.onLine) {
    showToast('Lần đăng nhập đầu tiên cần có Internet. Nếu đã đăng nhập trước đó, hãy mở lại ứng dụng.', true);
    return;
  }

  const email = emailInput.value.trim().toLowerCase();
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Đang xác thực...</span>';

  try {
    await signIn(email, passwordInput.value);
    localStorage.setItem(LAST_EMAIL_KEY, email);
    passwordInput.value = '';
    showToast('Đăng nhập thành công.');
    hideLogin();
  } catch (error) {
    console.error('[Login] Auth error:', error);
    showToast('Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra lại.', true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Đăng nhập và chấm công</span>';
  }
}
