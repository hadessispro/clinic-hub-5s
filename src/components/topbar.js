import { store } from '../store.js';
import { signOut } from '../auth.js';
import { ROLE_PROFILES } from '../constants.js';
import { escapeHTML, formatTime } from '../utils.js';
import { markAsRead, markAllAsRead } from '../services/notifications.js';
import { navigateTo } from '../router.js';
import { BRANCH, BRANCHES, branchSettings, setActiveBranch } from '../branch.js';
import { loadClinicLocation } from '../services/clinic.js';
import { showToast } from './toast.js';
import { confirmAction } from './app-dialog.js';
import { getPushNotificationStatus, requestPushPermissionAndSubscribe, sendTestPushNotification, canTestPushBells } from '../services/push-notifications.js';

let isDropdownOpen = false;

// Global listener to close notification dropdown when clicking outside
document.addEventListener('click', (e) => {
  const container = document.getElementById('notifContainer');
  if (container && !container.contains(e.target)) {
    isDropdownOpen = false;
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  const branchSwitcher = document.getElementById('topbarBranchSwitcher');
  if (branchSwitcher && !branchSwitcher.contains(e.target)) {
    const branchMenu = document.getElementById('topbarBranchMenu');
    const branchButton = document.getElementById('topbarBranchButton');
    if (branchMenu) branchMenu.hidden = true;
    if (branchButton) branchButton.setAttribute('aria-expanded', 'false');
  }
});

function getNotifIcon(type) {
  switch (type) {
    case 'task': return '📋';
    case 'leave': return '📅';
    case 'attendance': return '⏰';
    case 'proposal': return '⇧';
    case 'care': return '💖';
    case 'schedule': return '🗓️';
    default: return '🔔';
  }
}

function formatShortDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function positionMobileNotification(dropdown, bellButton) {
  if (!dropdown || !bellButton || !window.matchMedia('(max-width: 760px)').matches) return;
  const bellRect = bellButton.getBoundingClientRect();
  dropdown.style.setProperty('--notif-mobile-top', `${Math.round(bellRect.bottom + 8)}px`);
}

/**
 * Updates the topbar elements: date label and auth chip area.
 * @param {Object} state - The current application state
 */
export function renderTopbar(state) {
  const { profile, role, notifications } = state;
  
  // 1. Update Date Label
  const dateLabel = document.getElementById('currentDateLabel');
  if (dateLabel) {
    const today = new Date();
    dateLabel.textContent = `Hôm nay, ${today.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}`;
  }

  // 2. Update Auth Chip & Notification Bell Area
  const authArea = document.getElementById('authArea');
  if (!authArea) return;

  if (profile) {
    const roleLabel = ROLE_PROFILES[role]?.label || role || 'Nhân viên';
    const isCheckedIn = Boolean(state.todayAttendance?.checkedIn);
    const isCheckedOut = Boolean(state.todayAttendance?.checkedOut);

    // Lọc thông báo: nếu đã chấm công vào ca rồi, không làm sáng chấm cam vì thông báo nhắc đi check-in
    const listNotifs = (notifications || []).filter((n) => {
      if (isCheckedIn && n.type === 'attendance' && /nhắc|check-in|vào ca|chưa chấm/i.test(`${n.title} ${n.body}`)) {
        return false;
      }
      return true;
    });
    const unreadCount = listNotifs.filter(n => !n.read).length;
    const isManager = ['admin', 'hr', 'leader', 'admin_it', 'superadmin', 'admin_marketing', 'support_marketing', 'telesale_leader'].includes(role);

    authArea.innerHTML = `
      <div class="topbar-right-container">
        ${isManager ? `
          <!-- Branch Switcher for Managers -->
          <div class="topbar-branch-switcher" id="topbarBranchSwitcher">
            <button id="topbarBranchButton" class="topbar-branch-button" type="button" aria-haspopup="listbox" aria-expanded="false" title="Chuyển chi nhánh chấm công và GPS">
              <span class="branch-switcher-icon" aria-hidden="true" style="display:inline-flex; align-items:center; color:var(--teal-dark);"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
              <span class="topbar-branch-label">${escapeHTML(BRANCH.shortName)}</span>
              <svg class="topbar-branch-chevron" aria-hidden="true" viewBox="0 0 16 16" focusable="false"><path d="M4 6l4 4 4-4" /></svg>
            </button>
            <div id="topbarBranchMenu" class="topbar-branch-menu" role="listbox" aria-label="Đổi chi nhánh" hidden>
              ${Object.values(BRANCHES).map(b => `<button type="button" role="option" data-branch-id="${b.id}" aria-selected="${b.id === BRANCH.id}" class="topbar-branch-option ${b.id === BRANCH.id ? 'is-active' : ''}"><span aria-hidden="true">${b.id === BRANCH.id ? '✓' : ''}</span><span>${escapeHTML(b.shortName)}</span></button>`).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Notification Bell -->
        <div class="notif-container" id="notifContainer">
          <button class="notif-bell-btn" id="notifBellBtn" type="button" title="Thông báo">
            <span class="bell-icon" style="font-size: 16px;">🔔</span>
            ${unreadCount > 0 ? `<span class="notif-badge" id="notifBadge">${unreadCount}</span>` : ''}
          </button>
          <div class="notif-dropdown" id="notifDropdown" style="display: none;">
            <div class="notif-dropdown-header" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-bottom: 1px solid rgba(8, 127, 123, 0.15);">
              <strong style="font-size: 13px; color: var(--teal-dark);">Thông báo</strong>
              ${unreadCount > 0 ? `<button class="link-button" id="notifMarkAllBtn" style="font-size: 11px; background: none; border: none; color: var(--teal); cursor: pointer; font-weight: 600;">Đọc tất cả</button>` : ''}
            </div>
            <div class="notif-push-bar" id="notifPushBar" style="padding: 8px 12px; background: #f0fdfa; border-bottom: 1px solid rgba(8, 127, 123, 0.12); display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #134e4a;">
              <span style="display: flex; align-items: center; gap: 5px;">📱 Đang kiểm tra thông báo…</span>
            </div>
            <div class="notif-dropdown-list" style="max-height: 280px; overflow-y: auto;">
              ${listNotifs.length === 0 ? `
                <div class="notif-empty" style="padding: 24px; text-align: center; font-size: 12px; color: #66736d;">Không có thông báo mới</div>
              ` : listNotifs.slice(0, 8).map(n => `
                <div class="notif-item ${n.read ? 'read' : 'unread'}" data-id="${n.id}" data-view="${n.link_view || ''}" style="display: flex; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.04); transition: background 0.2s; background: ${n.read ? 'transparent' : 'rgba(8, 127, 123, 0.04)'};">
                  <div class="notif-item-icon" style="font-size: 18px; display: flex; align-items: center;">${getNotifIcon(n.type)}</div>
                  <div class="notif-item-body" style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                    <span class="notif-item-title" style="font-size: 12px; font-weight: 700; color: #1d2421;">${escapeHTML(n.title)}</span>
                    <span class="notif-item-desc" style="font-size: 11px; color: #66736d; line-height: 1.3;">${escapeHTML(n.body)}</span>
                    <span class="notif-item-time" style="font-size: 10px; color: #99a6a0; margin-top: 2px;">${formatShortDateTime(n.created_at)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Auth Status Chip (Đồng bộ trực tiếp trạng thái chấm công) -->
        <div class="auth-chip">
          <span class="auth-dot online" style="${isCheckedIn ? 'background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);' : (isCheckedOut ? 'background: #9ca3af;' : '')}"></span>
          <button class="auth-summary" type="button" data-action="jump-integrations" title="Mở bảo mật hệ thống">
            <strong>${escapeHTML(profile.full_name)}</strong>
            <small>${escapeHTML(roleLabel)} · ${isCheckedIn
              ? `<span style="color: #047857; font-weight: 700;">Đã vào ca (${formatTime(state.todayAttendance.checkinTime)})</span>`
              : (isCheckedOut
                ? `<span style="color: #4b5563; font-weight: 600;">Đã kết ca</span>`
                : 'Online')}</small>
          </button>
        </div>

        <button class="topbar-logout-button" type="button" id="topbarLogoutBtn" title="Đăng xuất" aria-label="Đăng xuất">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          </svg>
          <span>Đăng xuất</span>
        </button>
      </div>
    `;

    // 3. Re-apply dropdown visibility state
    const dropdown = document.getElementById('notifDropdown');
    if (dropdown) {
      dropdown.style.display = isDropdownOpen ? 'block' : 'none';
    }

    // Bind Topbar Branch Switcher for Managers
    const branchButton = document.getElementById('topbarBranchButton');
    const branchMenu = document.getElementById('topbarBranchMenu');
    if (branchButton && branchMenu) {
      branchButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = branchMenu.hidden;
        branchMenu.hidden = !willOpen;
        branchButton.setAttribute('aria-expanded', String(willOpen));
      });

      branchMenu.querySelectorAll('[data-branch-id]').forEach((option) => {
        option.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const newBranchId = option.dataset.branchId;
          branchMenu.hidden = true;
          branchButton.setAttribute('aria-expanded', 'false');
          if (!newBranchId || newBranchId === BRANCH.id) return;
        setActiveBranch(newBranchId);
        localStorage.setItem('5s_clinic_active_branch', newBranchId);
        localStorage.setItem('5s_clinic_last_branch', newBranchId);
        // Update GPS coordinates immediately. Previously the label changed but
        // state.settings still pointed to the old branch.
        store.updateSettings(branchSettings());
        showToast(`📍 Đã chuyển chi nhánh chấm công sang ${BRANCHES[newBranchId].shortName}`);
        
        const managerNotesTitle = document.getElementById('managerNotesTitle');
        if (managerNotesTitle) {
          managerNotesTitle.textContent = `Chấm công tại ${BRANCH.address} bằng GPS trực tiếp; dữ liệu ngoại tuyến sẽ tự đồng bộ.`;
        }
        try {
          const cloudLocation = await loadClinicLocation(newBranchId);
          if (cloudLocation && BRANCH.id === newBranchId) store.updateSettings(cloudLocation);
        } catch (error) {
          console.warn('[Topbar] Could not load cloud branch location; using verified local coordinates.', error);
        }
        });
      });
    }

    // 4. Push Notification Bar Logic: Hiển thị trạng thái cho toàn bộ nhân viên; Admin & Admin-IT có bộ thử các loại chuông
    const renderPushBar = async () => {
      const pushBar = document.getElementById('notifPushBar');
      if (!pushBar) return;
      try {
        const status = await getPushNotificationStatus();
        if (!status.supported) {
          pushBar.innerHTML = `<span style="color: #66736d; font-size: 10.5px;">📱 Thiết bị không hỗ trợ Web Push</span>`;
          return;
        }
        const hasBellTestPermission = canTestPushBells(role);

        if (status.permission === 'granted') {
          if (hasBellTestPermission) {
            pushBar.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 6px; width: 100%;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                  <span style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #0f766e; font-size: 11px;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px rgba(16, 185, 129, 0.7);"></span>
                    Thông báo đẩy: Đã kích hoạt
                  </span>
                  <button type="button" id="notifPushTestBtn" style="background: #0d9488; color: #fff; border: none; border-radius: 6px; padding: 4px 9px; font-size: 10.5px; font-weight: 600; cursor: pointer; white-space: nowrap;">
                    🔔 Bắn chuông
                  </button>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 10px; color: #64748b; white-space: nowrap;">Loại chuông thử:</span>
                  <select id="adminBellTypeSelect" style="font-size: 10.5px; padding: 3px 6px; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff; color: #1e293b; flex: 1; outline: none;">
                    <option value="checkin">⏰ Nhắc Check-in ca làm việc</option>
                    <option value="lunch">🍱 Nghỉ trưa & nạp năng lượng (12:00)</option>
                    <option value="afternoon">☕ Tiếp sức & động viên chiều (15:00)</option>
                    <option value="checkout">🏁 Nhắc Check-out hết ca làm</option>
                    <option value="evening">🌙 Động viên ca tối (18:15)</option>
                    <option value="message">💬 Tin nhắn / Thông báo khẩn</option>
                    <option value="default">🔔 Chuông thử nghiệm chung</option>
                  </select>
                </div>
              </div>
            `;
            const testBtn = document.getElementById('notifPushTestBtn');
            const bellSelect = document.getElementById('adminBellTypeSelect');
            testBtn?.addEventListener('click', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const selectedBell = bellSelect?.value || 'default';
              const bellText = bellSelect?.options[bellSelect.selectedIndex]?.text || selectedBell;
              testBtn.disabled = true;
              testBtn.textContent = 'Đang bắn…';
              try {
                const res = await sendTestPushNotification(selectedBell);
                if (res && res.sent > 0) {
                  showToast(`🔔 Đã bắn chuông [${bellText}] tới ${res.sent} thiết bị của bạn!`);
                } else {
                  showToast('🔔 Tín hiệu đã gửi! Hãy kiểm tra thông báo trên điện thoại.');
                }
              } catch (err) {
                showToast('Chưa gửi được: ' + (err.message || 'Lỗi mạng'), true);
              } finally {
                testBtn.disabled = false;
                testBtn.textContent = '🔔 Bắn chuông';
              }
            });
          } else {
            pushBar.innerHTML = `
              <span style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #0f766e;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px rgba(16, 185, 129, 0.7);"></span>
                Thông báo đẩy: Đã kích hoạt
              </span>
              <span style="font-size: 10px; color: #0d9488;">🟢 Sẵn sàng nhận tin</span>
            `;
          }
        } else if (status.permission === 'denied') {
          pushBar.innerHTML = `
            <span style="display: flex; align-items: center; gap: 6px; color: #b91c1c; font-weight: 600;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
              Thông báo: Bị chặn
            </span>
            <span style="font-size: 10px; color: #991b1b;">Mở trong Cài đặt</span>
          `;
        } else {
          pushBar.innerHTML = `
            <span style="display: flex; align-items: center; gap: 6px; color: #475569;">
              📱 Thông báo máy: Chưa bật
            </span>
            <button type="button" id="notifPushEnableBtn" style="background: #0d9488; color: #fff; border: none; border-radius: 6px; padding: 4px 9px; font-size: 10.5px; font-weight: 600; cursor: pointer; white-space: nowrap;">
              Bật ngay
            </button>
          `;
          const enableBtn = document.getElementById('notifPushEnableBtn');
          enableBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            enableBtn.disabled = true;
            enableBtn.textContent = 'Đang bật…';
            try {
              await requestPushPermissionAndSubscribe();
              showToast('🔔 Đã bật thông báo trên điện thoại thành công!');
              await renderPushBar();
            } catch (err) {
              showToast(err.message || 'Không thể bật thông báo.', true);
              enableBtn.disabled = false;
              enableBtn.textContent = 'Bật ngay';
            }
          });
        }
      } catch (e) {
        console.warn('[Topbar] renderPushBar error:', e);
      }
    };

    renderPushBar().catch(() => {});

    // 5. Bind Dropdown Toggle
    const bellBtn = document.getElementById('notifBellBtn');
    if (bellBtn && dropdown) {
      if (isDropdownOpen) {
        window.requestAnimationFrame(() => positionMobileNotification(dropdown, bellBtn));
      }
      bellBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDropdownOpen = !isDropdownOpen;
        if (isDropdownOpen) {
          positionMobileNotification(dropdown, bellBtn);
          renderPushBar().catch(() => {});
        }
        dropdown.style.display = isDropdownOpen ? 'block' : 'none';
      });
    }

    // 5. Bind Mark All Read
    const markAllBtn = document.getElementById('notifMarkAllBtn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await markAllAsRead();
        const updated = listNotifs.map(n => ({ ...n, read: true }));
        store.setNotifications(updated);
      });
    }

    // 6. Bind Notification Items click
    const items = authArea.querySelectorAll('.notif-item');
    items.forEach(item => {
      item.addEventListener('click', async (e) => {
        const id = item.dataset.id;
        const targetView = item.dataset.view;
        
        // Mark as read
        await markAsRead(id);
        
        // Update store state
        const updated = listNotifs.map(n => n.id === id ? { ...n, read: true } : n);
        store.setNotifications(updated);
        
        // Close dropdown
        isDropdownOpen = false;
        if (dropdown) dropdown.style.display = 'none';

        // Navigate if needed
        if (targetView) {
          navigateTo(targetView);
        }
      });
    });

    // 7. Bind logout button click
    const logoutBtn = document.getElementById('topbarLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (await confirmAction('Bạn có muốn đăng xuất khỏi hệ thống không?', { title: 'Đăng xuất', confirmText: 'Đăng xuất' })) {
          try {
            await signOut();
          } catch (err) {
            console.error('[Topbar] Failed to logout:', err);
          }
        }
      });
    }
  } else {
    authArea.innerHTML = `
      <div class="auth-chip">
        <span class="auth-dot offline"></span>
        <span class="auth-summary" style="padding: 6px 12px; cursor: default;">
          <strong>Chưa đăng nhập</strong>
        </span>
      </div>
    `;
  }
}
