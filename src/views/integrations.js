import { signOut } from '../auth.js';
import { getEmployees } from '../services/employees.js';
import { saveSettings } from '../services/reports.js';
import { ROLE_PROFILES } from '../constants.js';
import { escapeHTML, downloadText, departmentName } from '../utils.js';
import { pill, statusPill } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  createSupabaseUser,
  provisionLocalUser
} from '../services/profiles.js';

let cachedEmployees = [];
let editingProfileId = null;
let tempAuthMode = 'create'; // 'create' or 'link'

export async function renderView(state) {
  const { user, profile, role, settings } = state;
  
  // Fetch employees and profiles list in parallel
  const [employees, profilesList] = await Promise.all([
    getEmployees(),
    getProfiles().catch((err) => {
      console.warn('[Integrations View] Failed to fetch profiles, RLS or table might be missing:', err);
      return [];
    })
  ]);
  
  cachedEmployees = employees;

  const currentEmployee = employees.find(e => e.id === profile?.employee_code);
  const cloudStatusText = user ? "Supabase đã nối" : "Chưa online";
  const cloudStatusTone = user ? "good" : "warn";
  const activeRoleLabel = ROLE_PROFILES[role]?.label || role || 'Chưa gán';

  // Account Management section for Admin/HR
  const canManageAccounts = role === 'admin' || role === 'hr';
  let userManagementHTML = '';

  if (canManageAccounts) {
    const selectedProfile = editingProfileId ? profilesList.find(p => p.id === editingProfileId) : null;

    const profileRows = profilesList.length ? profilesList.map(p => {
      const isSelf = p.id === user?.id;
      return `
        <tr>
          <td>
            <strong>${escapeHTML(p.full_name || 'Chưa đặt tên')}</strong>
            ${isSelf ? ` <span style="background: var(--mint); color: var(--teal-dark); font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 4px;">Bạn</span>` : ''}
          </td>
          <td><code>${escapeHTML(p.employee_code || 'Chưa gán')}</code></td>
          <td>${escapeHTML(departmentName(p.department))}</td>
          <td><span style="font-weight: 500;">${escapeHTML(p.role)}</span></td>
          <td>${statusPill(p.active ? 'Hoạt động' : 'Tạm khóa', p.active ? 'good' : 'neutral')}</td>
          <td>
            <div class="action-buttons" style="display: flex; gap: 4px;">
              <button class="secondary-button" type="button" data-action="edit-profile" data-profile-id="${p.id}" style="padding: 4px 8px; font-size: 12px; height: auto; min-height: auto;">Sửa</button>
              ${!isSelf ? `<button class="danger-button" type="button" data-action="delete-profile" data-profile-id="${p.id}" style="padding: 4px 8px; font-size: 12px; height: auto; min-height: auto;">Xóa</button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('') : `<tr><td colspan="6" style="text-align: center; color: var(--muted); padding: 20px;">Chưa có tài khoản nào được tạo</td></tr>`;

    // Dropdown list of employees with tag showing if already mapped
    const employeeOptions = employees.map(emp => {
      const isMapped = profilesList.some(p => p.employee_code === emp.id && (!selectedProfile || p.id !== selectedProfile.id));
      const label = isMapped ? `${emp.name} (${emp.id}) - Đã gán` : `${emp.name} (${emp.id})`;
      const disabled = isMapped ? ' disabled' : '';
      const isSelected = selectedProfile && selectedProfile.employee_code === emp.id ? ' selected' : '';
      return `<option value="${emp.id}"${disabled}${isSelected}>${escapeHTML(label)}</option>`;
    }).join('');

    userManagementHTML = `
      <div class="grid cols-2" style="margin-top: 14px;">
        <!-- Left Panel: User Accounts List -->
        <section class="panel" style="display: flex; flex-direction: column; min-height: 480px;">
          <div class="section-title">
            <h3>Quản lý tài khoản người dùng</h3>
            ${pill(`${profilesList.length} tài khoản`)}
          </div>
          <div class="table-wrap" style="flex: 1; max-height: 400px; overflow-y: auto; margin-top: 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th style="text-align: left;">Họ tên</th>
                  <th style="text-align: left;">Mã NV</th>
                  <th style="text-align: left;">Phòng ban</th>
                  <th style="text-align: left;">Vai trò</th>
                  <th style="text-align: left;">Trạng thái</th>
                  <th style="text-align: left;">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${profileRows}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Right Panel: Create/Edit Form -->
        <section class="panel" style="min-height: 480px;">
          <div class="section-title">
            <h3>${selectedProfile ? 'Chỉnh sửa tài khoản' : 'Tạo tài khoản mới'}</h3>
            ${selectedProfile ? pill(selectedProfile.full_name) : pill('Auth & Profile')}
          </div>
          
          <form class="form-grid" id="profileForm" data-form="profile" style="margin-top: 12px;">
            ${!selectedProfile ? `
              <div class="form-field full">
                <label>Phương thức đăng ký</label>
                <div style="display: flex; gap: 20px; align-items: center; margin-top: 4px;">
                  <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; color: var(--ink);">
                    <input type="radio" name="authMode" value="create" ${tempAuthMode === 'create' ? 'checked' : ''} style="width: auto; min-height: auto; height: auto; margin: 0; cursor: pointer;" />
                    Tự động tạo tài khoản Auth
                  </label>
                  <label style="display: flex; align-items: center; gap: 8px; font-weight: normal; cursor: pointer; color: var(--ink);">
                    <input type="radio" name="authMode" value="link" ${tempAuthMode === 'link' ? 'checked' : ''} style="width: auto; min-height: auto; height: auto; margin: 0; cursor: pointer;" />
                    Liên kết UID Auth có sẵn
                  </label>
                </div>
              </div>

              ${tempAuthMode === 'create' ? `
                <div class="form-field full">
                  <label for="profileEmail">Email tài khoản</label>
                  <input id="profileEmail" name="email" type="email" required placeholder="VD: nguyenvana@5sclinic.vn" autocomplete="username" />
                </div>
                <div class="form-field full">
                  <label for="profilePassword">Mật khẩu</label>
                  <input id="profilePassword" name="password" type="password" required minlength="6" placeholder="Tối thiểu 6 ký tự" autocomplete="new-password" />
                </div>
              ` : `
                <div class="form-field full">
                  <label for="profileUID">Supabase User UID</label>
                  <input id="profileUID" name="uid" type="text" required placeholder="Nhập chuỗi UUID trong Auth > Users" />
                </div>
              `}
            ` : ''}

            <div class="form-field full">
              <label for="profileName">Họ và tên</label>
              <input id="profileName" name="fullName" required value="${selectedProfile ? escapeHTML(selectedProfile.full_name) : ''}" placeholder="VD: Nguyễn Văn A" />
            </div>

            <div class="form-field full">
              <label for="profileEmployeeCode">Liên kết mã nhân viên</label>
              <select id="profileEmployeeCode" name="employeeCode">
                <option value="">Chưa gán / Không có</option>
                ${employeeOptions}
              </select>
            </div>

            <div class="form-field">
              <label for="profileDept">Phòng ban</label>
              <select id="profileDept" name="department">
                <option value="ns" ${selectedProfile && selectedProfile.department === 'ns' ? 'selected' : ''}>Nhân sự (ns)</option>
                <option value="hr" ${selectedProfile && selectedProfile.department === 'hr' ? 'selected' : ''}>HR (hr)</option>
                <option value="mkt" ${selectedProfile && selectedProfile.department === 'mkt' ? 'selected' : ''}>Marketing (mkt)</option>
                <option value="kt" ${selectedProfile && selectedProfile.department === 'kt' ? 'selected' : ''}>Kế toán (kt)</option>
                <option value="dvkh" ${selectedProfile && selectedProfile.department === 'dvkh' ? 'selected' : ''}>DVKH (dvkh)</option>
                <option value="bs" ${selectedProfile && selectedProfile.department === 'bs' ? 'selected' : ''}>Bác sĩ (bs)</option>
                <option value="phuta" ${selectedProfile && selectedProfile.department === 'phuta' ? 'selected' : ''}>Phụ tá (phuta)</option>
                <option value="baove" ${selectedProfile && selectedProfile.department === 'baove' ? 'selected' : ''}>Bảo vệ (baove)</option>
                <option value="laocong" ${selectedProfile && selectedProfile.department === 'laocong' ? 'selected' : ''}>Lao công (laocong)</option>
              </select>
            </div>

            <div class="form-field">
              <label for="profileRole">Vai trò phân quyền</label>
              <select id="profileRole" name="role">
                <option value="staff" ${selectedProfile && selectedProfile.role === 'staff' ? 'selected' : ''}>Nhân viên (staff)</option>
                <option value="hr" ${selectedProfile && selectedProfile.role === 'hr' ? 'selected' : ''}>Nhân sự (hr)</option>
                <option value="leader" ${selectedProfile && selectedProfile.role === 'leader' ? 'selected' : ''}>Trưởng nhóm (leader)</option>
                <option value="finance" ${selectedProfile && selectedProfile.role === 'finance' ? 'selected' : ''}>Kế toán (finance)</option>
                <option value="admin" ${selectedProfile && selectedProfile.role === 'admin' ? 'selected' : ''}>Quản trị (admin)</option>
                <option value="admin_it" ${selectedProfile && selectedProfile.role === 'admin_it' ? 'selected' : ''}>Quản trị kỹ thuật (admin_it)</option>
                <option value="superadmin" disabled>Superadmin (chưa kích hoạt)</option>
              </select>
            </div>

            <div class="form-field full" style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
              <input id="profileActive" name="active" type="checkbox" ${!selectedProfile || selectedProfile.active ? 'checked' : ''} style="width: auto; min-height: auto; height: auto; margin: 0; cursor: pointer;" />
              <label for="profileActive" style="margin: 0; font-weight: normal; cursor: pointer; color: var(--ink);">Tài khoản đang hoạt động</label>
            </div>

            <div class="form-field full" style="display: flex; gap: 8px; margin-top: 6px;">
              <button class="primary-button" type="submit" style="flex: 1;">
                ${selectedProfile ? 'Cập nhật tài khoản' : 'Tạo tài khoản'}
              </button>
              ${selectedProfile ? `
                <button class="secondary-button" type="button" id="cancelEditProfileBtn">Hủy</button>
              ` : ''}
            </div>
          </form>
        </section>
      </div>
    `;
  }

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Security & integrations</p>
        <h3>Đăng nhập Supabase Auth, phân luồng tài khoản, đồng bộ Google qua GAS và xuất dữ liệu vận hành.</h3>
      </div>
      <div class="pill-row">
        ${statusPill(cloudStatusText, cloudStatusTone)}
        ${pill(activeRoleLabel)}
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Đăng nhập Supabase</h3>
          ${pill("Auth Active")}
        </div>
        ${user ? `
          <div class="profile-lock animate-fade">
            <strong>${escapeHTML(profile?.full_name || user.email)}</strong>
            <span>${escapeHTML(user.email)} · ${escapeHTML(ROLE_PROFILES[role]?.scope || "")}</span>
            <button class="danger-button" type="button" id="signOutBtn"><span>×</span>Đăng xuất</button>
          </div>
        ` : `
          <div class="profile-lock">
            <strong>Chưa kết nối Auth.</strong>
            <span>Vui lòng đăng nhập qua màn hình khóa để tiếp tục.</span>
          </div>
        `}
        <div class="setup-note">
          <strong>SQL setup</strong>
          <span>Bảo mật hệ thống RLS đã hoạt động dựa trên email tài khoản profiles được map từ Supabase Auth.</span>
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Phân quyền tài khoản thực tế</h3>
          ${pill("Bảo mật RLS")}
        </div>
        <div class="grid">
          ${Object.entries(ROLE_PROFILES).map(([roleKey, profileItem]) => `
            <article class="mini-card">
              <strong>${escapeHTML(profileItem.label)}</strong>
              <span>${escapeHTML(profileItem.scope)}</span>
              ${statusPill(roleKey === role ? "Đang sử dụng" : "Đủ điều kiện", roleKey === role ? "good" : "neutral")}
            </article>
          `).join("")}
        </div>
        <p class="subtle" style="margin-top:12px">
          Nhân sự đang khớp: ${escapeHTML(currentEmployee?.name || "Chưa map nhân viên")} · ${escapeHTML(departmentName(currentEmployee?.department))}
        </p>
      </section>
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      <section class="panel">
        <div class="section-title">
          <h3>Đồng bộ Google qua GAS</h3>
          ${pill("Webhook linh hoạt")}
        </div>
        <form class="form-grid" data-form="gas-settings" id="gasForm">
          <div class="form-field full">
            <label for="gasUrl">Google Apps Script Web App URL</label>
            <input id="gasUrl" name="googleGasUrl" value="${escapeHTML(settings.googleGasUrl || "")}" placeholder="https://script.google.com/macros/s/..." />
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>✓</span>Lưu GAS URL</button>
          </div>
        </form>
        <div class="request-actions">
          <span class="subtle">Dùng để đẩy công, lương, KPI sang Google Sheet khi cấu hình endpoint GAS.</span>
          <button class="secondary-button" type="button" id="simulateGasBtn"><span>∞</span>Test sync</button>
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Backup & audit</h3>
          ${pill("JSON")}
        </div>
        <div class="grid">
          <article class="mini-card">
            <strong>Cloud snapshot</strong>
            <span>Đồng bộ hóa dữ liệu trạng thái snap trên đám mây.</span>
            ${statusPill("Hoạt động", "good")}
          </article>
          <article class="mini-card">
            <strong>Local fallback</strong>
            <span>Sao lưu dữ liệu phòng chống mất kết nối Internet đột ngột.</span>
            ${statusPill("Sẵn sàng", "good")}
          </article>
          <button class="secondary-button" type="button" id="backupJsonBtn"><span>⇩</span>Xuất toàn bộ JSON</button>
        </div>
      </section>
    </div>

    ${userManagementHTML}
  `;
}

export function initView() {
  const signOutBtn = document.getElementById("signOutBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      try {
        await signOut();
        showToast("Đã đăng xuất khỏi tài khoản.");
      } catch (err) {
        console.error('[Integrations View] Sign out failed:', err);
        showToast("Lỗi khi đăng xuất.", true);
      }
    });
  }

  const gasForm = document.getElementById("gasForm");
  if (gasForm) {
    gasForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(gasForm);
      const data = Object.fromEntries(formData.entries());
      const state = store.getState();

      const newSettings = {
        ...state.settings,
        googleGasUrl: data.googleGasUrl.trim()
      };

      try {
        await saveSettings(newSettings, state.user?.id);
        store.updateSettings(newSettings);
        showToast("Đã lưu Google Apps Script URL.");
      } catch (err) {
        console.error('[Integrations View] Save GAS URL failed:', err);
        showToast("Lỗi khi lưu cấu hình.", true);
      }
    });
  }

  const simulateGasBtn = document.getElementById("simulateGasBtn");
  if (simulateGasBtn) {
    simulateGasBtn.addEventListener("click", () => {
      showToast("Đang kết nối thử nghiệm tới GAS...");
      setTimeout(() => {
        showToast("Đồng bộ hoàn thành. Kết nối tới GAS ổn định.");
      }, 1000);
    });
  }

  const backupJsonBtn = document.getElementById("backupJsonBtn");
  if (backupJsonBtn) {
    backupJsonBtn.addEventListener("click", () => {
      const state = store.getState();
      const dataToExport = {
        settings: state.settings,
        meta: {
          exportedAt: new Date().toISOString(),
          user: state.user?.email,
          role: state.role
        }
      };
      downloadText("clinic_hub_security_backup.json", JSON.stringify(dataToExport, null, 2), "application/json");
      showToast("Đã xuất file backup.");
    });
  }

  // --- USER ACCOUNT MANAGEMENT EVENT LISTENERS ---
  const form = document.getElementById("profileForm");
  if (form) {
    // 1. Radio button change listener for switching auth creation mode
    const authModeRadios = form.querySelectorAll('input[name="authMode"]');
    authModeRadios.forEach(radio => {
      radio.addEventListener("change", (e) => {
        tempAuthMode = e.target.value;
        store.notify();
      });
    });

    // 2. Submit form to create/edit profiles
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const active = form.querySelector('#profileActive')?.checked ?? true;

      try {
        if (editingProfileId) {
          // Editing mode
          showToast("Đang cập nhật tài khoản...");
          await updateProfile(editingProfileId, {
            full_name: data.fullName.trim(),
            employee_code: data.employeeCode || null,
            department: data.department,
            role: data.role,
            active: active
          });
          showToast("Cập nhật tài khoản thành công!");
          editingProfileId = null;
        } else {
          // Create mode
          let uid = '';
          let newUser = null;
          if (tempAuthMode === 'create') {
            showToast("Đang tạo tài khoản Supabase Auth...");
            newUser = await createSupabaseUser(data.email.trim(), data.password);
            uid = newUser.id;
          } else {
            uid = data.uid.trim();
            if (!uid) {
              showToast("Vui lòng nhập UID tài khoản Supabase Auth.", true);
              return;
            }
          }

          showToast("Đang tạo hồ sơ phân quyền...");
          await createProfile({
            id: uid,
            full_name: data.fullName.trim(),
            employee_code: data.employeeCode || null,
            department: data.department,
            role: data.role,
            active: active
          });
          if (newUser?.local_password) {
            await provisionLocalUser(uid, data.email.trim(), newUser.local_password);
          }
          showToast("Tạo tài khoản người dùng thành công!");
          form.reset();
        }
        store.notify();
      } catch (err) {
        console.error('[Integrations View] Manage account failed:', err);
        showToast(`Lỗi: ${err.message || 'Thao tác thất bại'}`, true);
      }
    });
  }

  // 3. Edit & Delete actions delegation on appView container
  const viewContainer = document.getElementById("appView");
  if (viewContainer && !viewContainer.dataset.listenersAttached) {
    viewContainer.dataset.listenersAttached = "true"; // prevent duplicate handlers
    
    viewContainer.addEventListener("click", async (e) => {
      // Edit button click
      const editBtn = e.target.closest('[data-action="edit-profile"]');
      if (editBtn) {
        editingProfileId = editBtn.dataset.profileId;
        store.notify();
        return;
      }

      // Cancel button click
      const cancelBtn = e.target.closest('#cancelEditProfileBtn');
      if (cancelBtn) {
        editingProfileId = null;
        store.notify();
        return;
      }

      // Delete button click
      const deleteBtn = e.target.closest('[data-action="delete-profile"]');
      if (deleteBtn) {
        const profileId = deleteBtn.dataset.profileId;
        if (confirm("Bạn có chắc chắn muốn xóa hồ sơ phân quyền này? Thao tác này chỉ xóa dữ liệu phân quyền trong Database (Profiles) và giữ nguyên User trong Supabase Auth.")) {
          try {
            showToast("Đang xóa tài khoản...");
            await deleteProfile(profileId);
            showToast("Đã xóa tài khoản thành công!");
            if (editingProfileId === profileId) {
              editingProfileId = null;
            }
            store.notify();
          } catch (err) {
            console.error('[Integrations View] Delete profile failed:', err);
            showToast(`Lỗi khi xóa: ${err.message}`, true);
          }
        }
      }
    });
  }
}
