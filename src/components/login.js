import { signIn } from '../auth.js';
import { BRANCHES } from '../branch.js';
import { showToast } from './toast.js';
import { registerPgAccount } from '../services/pg-registration.js';

const LAST_LOGIN_KEY = '5s_clinic_last_identifier';
const LAST_BRANCH_KEY = '5s_clinic_last_branch';
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
          <img src="/images/nha-khoa-5s-wall.jpg" alt="Không gian Nha Khoa 5S" class="login-photo" />
          <div class="login-brand-overlay">
            <span class="login-branch-badge">Hai chi nhánh PVC & LVT</span>
            <h1 id="loginTitle">Chấm công 5S</h1>
            <p>Chọn đúng chi nhánh trước khi đăng nhập</p>
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
              <label for="loginBranch">Chi nhánh</label>
              <select id="loginBranch" required>
                <option value="all">Chi nhánh tổng / PG linh hoạt</option>
                ${Object.values(BRANCHES).map((branch) => `<option value="${branch.id}">${branch.name}</option>`).join('')}
              </select>
              <small>PG có thể chọn Chi nhánh tổng. Điểm chấm công vẫn theo lịch và vị trí Support đã giao.</small>
            </div>
            <div class="input-group">
              <label for="loginIdentifier">Mã nhân viên hoặc email</label>
              <input type="text" id="loginIdentifier" placeholder="Ví dụ: 10241" required autocomplete="username" autocapitalize="none" spellcheck="false" />
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

          <button type="button" class="login-mode-switch" data-action="show-pg-register">
            <span>Chưa có tài khoản PG?</span><strong>Tự đăng ký</strong>
          </button>

          <form class="login-form pg-register-form" id="pgRegisterForm" hidden>
            <div class="pg-register-intro">
              <button type="button" class="pg-register-back" data-action="show-login" aria-label="Quay lại đăng nhập">←</button>
              <div><strong>Đăng ký tài khoản PG</strong><small>Tài khoản sẽ được Support/Admin kiểm tra trước khi kích hoạt.</small></div>
            </div>
            <div class="pg-register-grid">
              <div class="input-group">
                <label for="pgRegisterName">Họ và tên</label>
                <input type="text" id="pgRegisterName" name="fullName" maxlength="100" autocomplete="name" required placeholder="Nguyễn Văn A" />
              </div>
              <div class="input-group">
                <label for="pgRegisterPhone">Số điện thoại</label>
                <input type="tel" id="pgRegisterPhone" name="phone" maxlength="15" inputmode="tel" autocomplete="tel" required placeholder="09xxxxxxxx" />
              </div>
              <div class="input-group pg-register-wide">
                <label for="pgRegisterEmail">Email</label>
                <input type="email" id="pgRegisterEmail" name="email" maxlength="180" autocomplete="email" required placeholder="tenpg@gmail.com" />
              </div>
              <div class="input-group">
                <label for="pgRegisterPassword">Mật khẩu</label>
                <input type="password" id="pgRegisterPassword" name="password" minlength="8" maxlength="72" autocomplete="new-password" required placeholder="Tối thiểu 8 ký tự" />
              </div>
              <div class="input-group">
                <label for="pgRegisterConfirm">Nhập lại mật khẩu</label>
                <input type="password" id="pgRegisterConfirm" name="confirmPassword" minlength="8" maxlength="72" autocomplete="new-password" required placeholder="Nhập lại mật khẩu" />
              </div>
            </div>
            <button type="submit" class="login-btn" id="pgRegisterSubmitBtn"><span>Gửi đăng ký PG</span></button>
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
    loginContainer.querySelector('#pgRegisterForm').addEventListener('submit', handlePgRegistration);
    loginContainer.querySelector('[data-action="toggle-password"]').addEventListener('click', togglePassword);
    loginContainer.querySelector('[data-action="show-pg-register"]').addEventListener('click', () => setLoginMode('register'));
    loginContainer.querySelector('[data-action="show-login"]').addEventListener('click', () => setLoginMode('login'));
    window.addEventListener('online', updateNetworkLabel);
    window.addEventListener('offline', updateNetworkLabel);
  } else {
    loginContainer.style.display = 'grid';
  }

  const identifierInput = loginContainer.querySelector('#loginIdentifier');
  const branchInput = loginContainer.querySelector('#loginBranch');
  if (identifierInput && !identifierInput.value) {
    identifierInput.value = localStorage.getItem(LAST_LOGIN_KEY) || '';
  }
  if (branchInput) branchInput.value = localStorage.getItem(LAST_BRANCH_KEY) || 'pham-van-chieu';
  updateNetworkLabel();
  requestAnimationFrame(() => (identifierInput?.value ? loginContainer.querySelector('#loginPassword') : identifierInput)?.focus());
}

function setLoginMode(mode) {
  if (!loginContainer) return;
  const registering = mode === 'register';
  loginContainer.querySelector('#loginForm').hidden = registering;
  loginContainer.querySelector('#pgRegisterForm').hidden = !registering;
  loginContainer.querySelector('[data-action="show-pg-register"]').hidden = registering;
  loginContainer.querySelector('.login-heading h2').textContent = registering ? 'Tạo tài khoản PG' : 'Đăng nhập nhân viên';
  loginContainer.querySelector('.login-trust-row').hidden = registering;
  loginContainer.querySelector('.login-privacy').hidden = registering;
  requestAnimationFrame(() => loginContainer.querySelector(registering ? '#pgRegisterName' : '#loginIdentifier')?.focus());
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
  const identifierInput = loginContainer?.querySelector('#loginIdentifier');
  const branchInput = loginContainer?.querySelector('#loginBranch');
  const passwordInput = loginContainer?.querySelector('#loginPassword');
  const submitBtn = loginContainer?.querySelector('#loginSubmitBtn');
  if (!identifierInput || !branchInput || !passwordInput || !submitBtn) return;

  if (!navigator.onLine) {
    showToast('Lần đăng nhập đầu tiên cần có Internet. Nếu đã đăng nhập trước đó, hãy mở lại ứng dụng.', true);
    return;
  }

  const identifier = identifierInput.value.trim();
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Đang xác thực...</span>';

  try {
    await signIn(identifier, passwordInput.value, branchInput.value);
    localStorage.setItem(LAST_LOGIN_KEY, identifier);
    localStorage.setItem(LAST_BRANCH_KEY, branchInput.value);
    passwordInput.value = '';
    showToast('Đăng nhập thành công.');
    hideLogin();
  } catch (error) {
    console.error('[Login] Auth error:', error);
    showToast(error?.message || 'Mã nhân viên/email, chi nhánh hoặc mật khẩu chưa đúng.', true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Đăng nhập và chấm công</span>';
  }
}

async function handlePgRegistration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitBtn = form.querySelector('#pgRegisterSubmitBtn');
  const values = Object.fromEntries(new FormData(form).entries());
  if (values.password !== values.confirmPassword) {
    showToast('Hai lần nhập mật khẩu chưa trùng nhau.', true);
    form.querySelector('#pgRegisterConfirm')?.focus();
    return;
  }
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Đang gửi đăng ký...</span>';
  try {
    const payload = await registerPgAccount({
      fullName: values.fullName,
      phone: values.phone,
      email: values.email,
      password: values.password,
    });
    form.reset();
    setLoginMode('login');
    const identifier = loginContainer?.querySelector('#loginIdentifier');
    if (identifier) identifier.value = values.email;
    showToast(payload?.data?.message || 'Đăng ký thành công. Vui lòng chờ Support/Admin duyệt.');
  } catch (error) {
    console.error('[PG registration] Failed:', error);
    showToast(error?.message || 'Không thể đăng ký tài khoản PG.', true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Gửi đăng ký PG</span>';
  }
}
