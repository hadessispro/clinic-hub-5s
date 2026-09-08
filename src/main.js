import { initAuth, onAuthChange } from './auth.js';
import { store } from './store.js';
import { navigateTo } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { renderTopbar } from './components/topbar.js';
import { showLogin, hideLogin } from './components/login.js';
import { loadSettings } from './services/reports.js';
import { getNotifications, subscribeToNotifications } from './services/notifications.js';
import { checkTodayAttendance, getOfflineQueue, syncOfflineAttendance } from './services/attendance.js';
import { syncPendingProofs } from './services/attendance-proofs.js';
import { showToast } from './components/toast.js';
import { canAccessView, getDefaultView, isOpsRole, khongPhaiChamCong, napGhiDePhanQuyen } from './permissions.js';
import { layGhiDe } from './services/phan-quyen.js';
import { loadClinicLocation } from './services/clinic.js';
import { BRANCH, branchSettings, clinicDateISO, getEffectiveBranchId, setActiveBranch } from './branch.js';
import { subscribeToLeaveRequests } from './services/leave.js';
import { initSmartChat, destroySmartChat } from './components/smart-chat.js';
import { initErrorMonitoring } from './services/error-monitor.js';
import { initPushNotifications, destroyPushNotifications } from './services/push-notifications.js';
import { subscribeToVpsChanges } from './local-client.js';

let notifSub = null;
let leaveSub = null;
let hasEnteredApp = false;
let pendingAttendanceSync = null;
let vpsChangeSub = null;
let marketingSub = null;
let deferredRealtimeRefresh = false;
let authTransitionId = 0;
const SIDEBAR_COLLAPSED_KEY = 'clinic-hub-sidebar-collapsed';

function setSidebarCollapsed(collapsed) {
  const appShell = document.querySelector('.app-shell');
  const toggle = document.getElementById('sidebarCollapseToggle');
  if (!appShell) return;
  appShell.classList.toggle('sidebar-collapsed', collapsed);
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng');
    toggle.title = collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng';
  }
}

function hasBlockingInteraction() {
  const active = document.activeElement;
  const isEditing = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
  // dialog-open la dialog cham cong. Bo sot no nghia la bat ky thay doi du lieu
  // nao trong phong kham - poll revision chay moi giay - cung dung giua luong
  // check-in: renderView goi stopWorkplaceCamera(), xoa lastLocation va
  // capturedPhoto, roi innerHTML= pha luon dialog. Nhan vien mat GPS va anh
  // vua chup, phai lam lai tu dau.
  const hasOverlay = document.body.classList.contains('has-open-drawer')
    || document.body.classList.contains('app-modal-open')
    || document.body.classList.contains('dialog-open');
  return isEditing || hasOverlay;
}

function refreshActiveViewFromRealtime(detail) {
  if (hasBlockingInteraction()) {
    deferredRealtimeRefresh = true;
    return;
  }
  deferredRealtimeRefresh = false;
  window.dispatchEvent(new CustomEvent('clinic:data-changed', { detail }));
  store.notify();
}

document.addEventListener('focusout', () => {
  if (deferredRealtimeRefresh) window.setTimeout(() => refreshActiveViewFromRealtime({ source: 'vps-deferred' }), 0);
});
window.addEventListener('clinic:overlay-closed', () => {
  if (deferredRealtimeRefresh) window.setTimeout(() => refreshActiveViewFromRealtime({ source: 'overlay-deferred' }), 0);
});

initErrorMonitoring();

export async function syncTodayAttendance(employeeCode, userId) {
  if (!employeeCode) return;
  try {
    const settings = branchSettings();
    const workDate = clinicDateISO(new Date(), settings.timeZone);
    const remoteRecords = navigator.onLine ? await checkTodayAttendance(employeeCode, workDate).catch(() => []) : [];
    const offlineQueue = userId ? getOfflineQueue(userId) : [];
    const todayOffline = offlineQueue.filter((item) => item.employee === employeeCode && item.date === workDate);
    const todayRecords = [...todayOffline, ...remoteRecords];
    const checkin = todayRecords.find((r) => r.type === 'checkin');
    const checkout = todayRecords.find((r) => r.type === 'checkout');
    store.setTodayAttendance({
      checkedIn: Boolean(checkin),
      checkinTime: checkin ? (checkin.recorded_at || checkin.time) : null,
      checkedOut: Boolean(checkout),
      checkoutTime: checkout ? (checkout.recorded_at || checkout.time) : null,
      branchName: BRANCH.shortName,
    });
  } catch (error) {
    console.warn('[Clinic Hub] Failed to sync today attendance status:', error);
  }
}

async function syncAllPendingAttendance(userId) {
  if (!userId || !navigator.onLine) return { attendance: 0, proofs: 0, rejected: 0 };
  if (pendingAttendanceSync) return pendingAttendanceSync;
  pendingAttendanceSync = (async () => {
    const attendance = await syncOfflineAttendance(userId);
    const proofResult = await syncPendingProofs(userId);
    return { attendance: attendance.synced, proofs: proofResult.synced, rejected: attendance.rejected };
  })();
  try {
    return await pendingAttendanceSync;
  } finally {
    pendingAttendanceSync = null;
  }
}

// Global online/offline network listeners
window.addEventListener('online', async () => {
  window.dispatchEvent(new CustomEvent('clinic:network-change', { detail: { online: true } }));
  showToast('📶 Đang kết nối lại mạng...');
  try {
    const synced = await syncAllPendingAttendance(store.getState().user?.id);
    const syncedCount = synced.attendance + synced.proofs;
    if (syncedCount > 0) {
      showToast(`✅ Đã đồng bộ thành công ${syncedCount} bản ghi và ảnh chấm công!`);
      // Re-trigger current view if it is attendance to show updated table
      const state = store.getState();
      if (state.currentView === 'attendance') {
        navigateTo('attendance');
      }
    }
  } catch (err) {
    console.error('[Main] Offline sync error:', err);
  }
});

window.addEventListener('offline', () => {
  window.dispatchEvent(new CustomEvent('clinic:network-change', { detail: { online: false } }));
  showToast('⚠️ Mất kết nối mạng! Chấm công sẽ chuyển sang lưu tạm ngoại tuyến.', true);
});

/**
 * Main application bootstrap function.
 * Initializes authentication, sets up layout updates, and handles global events.
 */
async function bootstrap() {
  console.log('[Clinic Hub] Bootstrapping application...');

  const savedSidebarState = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (savedSidebarState === 'true') {
    setSidebarCollapsed(true);
  }
  document.getElementById('sidebarCollapseToggle')?.addEventListener('click', () => {
    const appShell = document.querySelector('.app-shell');
    const isCollapsed = !appShell?.classList.contains('sidebar-collapsed');
    setSidebarCollapsed(isCollapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  });

  // Hide the Reset Demo button from index.html (as we are completely moving to Supabase Auth)
  const resetDemoBtn = document.getElementById('resetDemoBtn');
  if (resetDemoBtn) {
    resetDemoBtn.style.display = 'none';
  }

  // 1. Subscribe to state changes to update the Topbar profile card dynamically
  store.subscribe((state) => {
    renderTopbar(state);
  });

  // 2. Listen to authentication changes
  onAuthChange(async (authInfo) => {
    const transitionId = ++authTransitionId;
    const mainNav = document.getElementById('mainNav');
    
    if (authInfo.user && authInfo.profile) {
      const role = authInfo.profile.role || 'staff';

      /* Nạp ghi đè phân quyền TRƯỚC khi tính màn đích và dựng menu.
       *
       * Nạp sau thì menu vẽ theo mặc định của mã nguồn rồi mới đổi, người
       * dùng thấy mục hiện ra rồi biến mất — và tệ hơn, canAccessView bên
       * dưới có thể đẩy họ sang màn khác vì lúc đó chưa biết quyền thật.
       *
       * Hỏng thì chạy tiếp với mặc định: mất mạng lúc đăng nhập không được
       * biến thành mất quyền. */
      try {
        const gd = await layGhiDe();
        napGhiDePhanQuyen({
          vaiTro: gd.vaiTro,
          cuaToi: gd.nhanSu[String(authInfo.profile.employee_code || '').toLowerCase()] || null,
        });
      } catch { napGhiDePhanQuyen({}); }

      const currentView = store.getState().currentView;
      const requestedView = hasEnteredApp ? currentView : getDefaultView(role);
      const safeView = canAccessView(role, requestedView)
        ? requestedView
        : getDefaultView(role);

      // Commit identity, permissions and target view in one store update.
      // Otherwise the new role briefly renders the previous account's view.
      if (mainNav) mainNav.innerHTML = renderSidebar(role);
      store.updateUser(authInfo, safeView);
      hasEnteredApp = true;

      // User is authenticated
      hideLogin();
      document.body.dataset.role = role;
      // Quản trị viên thao tác nhiều bảng dữ liệu: luôn khởi đầu bằng sidebar
      // đầy đủ trên desktop, không bị kẹt lại ở rail thu gọn của phiên trước.
      if (['admin', 'hr', 'admin_it', 'superadmin'].includes(role) && window.innerWidth > 760) {
        setSidebarCollapsed(false);
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
      }
      const activeBranchId = getEffectiveBranchId(authInfo.profile);
      setActiveBranch(activeBranchId);
      store.updateSettings(branchSettings());
      syncTodayAttendance(authInfo.profile?.employee_code, authInfo.user?.id);

      const managerNotesTitle = document.getElementById('managerNotesTitle');
      if (managerNotesTitle) {
        managerNotesTitle.textContent = `Chấm công tại ${BRANCH.address} bằng GPS trực tiếp; dữ liệu ngoại tuyến sẽ tự đồng bộ.`;
      }
      if (authInfo.profile.role === 'pg_staff') destroySmartChat();
      else initSmartChat(authInfo).catch((error) => console.warn('[Clinic Hub] Smart chat unavailable:', error));
      initPushNotifications(authInfo).catch((error) => console.warn('[Clinic Hub] Push notification unavailable:', error));

      if (navigator.onLine) {
        syncAllPendingAttendance(authInfo.user.id).then((synced) => {
          if (synced.attendance + synced.proofs > 0) {
            showToast(`Đã đồng bộ ${synced.attendance + synced.proofs} bản ghi và ảnh chấm công lưu tạm.`);
          }
        }).catch((err) => {
          console.warn('[Clinic Hub] Failed to sync pending attendance data:', err);
        });

        // Load settings from cloud
        if (isOpsRole(authInfo.profile.role)) {
          try {
            const cloudSettings = await loadSettings();
            if (transitionId !== authTransitionId) return;
            if (cloudSettings) store.updateSettings(cloudSettings);
          } catch (err) {
            console.warn('[Clinic Hub] Failed to load cloud settings on boot:', err);
          }
        }

        if (transitionId !== authTransitionId) return;

        // Public-to-authenticated branch configuration is authoritative for GPS.
        try {
          const locationSettings = await loadClinicLocation(activeBranchId);
          if (transitionId !== authTransitionId) return;
          if (locationSettings) store.updateSettings(locationSettings);
        } catch (err) {
          console.warn('[Clinic Hub] Failed to load branch location:', err);
        }

        if (transitionId !== authTransitionId) return;

        // Load notifications
        try {
          const notifs = await getNotifications();
          if (transitionId !== authTransitionId) return;
          store.setNotifications(notifs);
        } catch (err) {
          console.warn('[Clinic Hub] Failed to load notifications:', err);
        }

        if (transitionId !== authTransitionId) return;

        // Setup realtime notifications subscription
        if (notifSub) notifSub.unsubscribe();
        notifSub = subscribeToNotifications(authInfo.user.id, (newNotif) => {
          store.addNotification(newNotif);
          showToast(`🔔 ${newNotif.title}: ${newNotif.body}`);
        });

        if (leaveSub) leaveSub.unsubscribe();
        leaveSub = subscribeToLeaveRequests((payload) => {
          const currentState = store.getState();
          if (payload.eventType === 'INSERT' && ['admin', 'hr', 'leader', 'admin_it'].includes(currentState.role)) {
            showToast('Có đơn mới cần kiểm tra.');
          }
          if (currentState.currentView === 'leave') store.notify();
        });

        // Setup marketing & lead realtime sync for authorized marketing roles only
        const userRole = authInfo?.profile?.role || authInfo?.user?.role || store.getState()?.role;
        const MARKETING_SYNC_ROLES = ['admin', 'superadmin', 'admin_it', 'admin_marketing', 'telesale_leader', 'telesale_staff', 'support_marketing', 'pg_staff'];
        if (MARKETING_SYNC_ROLES.includes(userRole)) {
          import('./services/marketing.js').then(({ subscribeToRealtime }) => {
            marketingSub?.();
            marketingSub = subscribeToRealtime((change) => {
              const currentState = store.getState();
              const marketingViews = ['marketing-leads', 'telesale-workspace', 'telesale-management', 'marketing-analytics', 'pg-management'];
              const isMarketingDashboard = currentState.currentView === 'dashboard' && MARKETING_SYNC_ROLES.includes(currentState.role);
              if (marketingViews.includes(currentState.currentView) || isMarketingDashboard) {
                console.log('[Realtime Auto-Refresh] Updating active view:', currentState.currentView);
                refreshActiveViewFromRealtime({ ...(change || {}), source: 'marketing-realtime' });
              }
            });
          }).catch(err => console.warn('[Main] Realtime subscription init error:', err));
        } else {
          marketingSub?.();
          marketingSub = null;
        }

        if (!vpsChangeSub && import.meta.env.VITE_DATA_BACKEND === 'vps') {
          vpsChangeSub = subscribeToVpsChanges((change) => {
            refreshActiveViewFromRealtime({ ...change, source: 'vps-postgresql' });
          });
        }
      }
      
      // Render the sidebar menu dynamically based on their role permissions
      
      // Nhân viên vào thẳng màn hình chấm công trong lần mở ứng dụng đầu tiên.
    } else {
      // User is logged out
      store.updateUser(authInfo, 'dashboard');
      showLogin();
      hasEnteredApp = false;
      delete document.body.dataset.role;
      if (mainNav) mainNav.replaceChildren();
      destroySmartChat();
      destroyPushNotifications();
      vpsChangeSub?.unsubscribe();
      vpsChangeSub = null;
      marketingSub?.();
      marketingSub = null;
      
      // Clean up notifications subscription
      if (notifSub) {
        notifSub.unsubscribe();
        notifSub = null;
      }
      if (leaveSub) {
        leaveSub.unsubscribe();
        leaveSub = null;
      }
      store.setNotifications([]);
    }
  });

  // 3. Initialize auth check (triggers onAuthChange handler)
  await initAuth();

  // 4. Global navigation event delegation
  const mainNav = document.getElementById('mainNav');
  if (mainNav) {
    mainNav.addEventListener('click', (event) => {
      const groupTitle = event.target.closest('.nav-group-title');
      if (groupTitle) {
        const group = groupTitle.closest('.nav-group');
        const groupName = groupTitle.dataset.group;
        if (group) {
          const isOpen = group.classList.contains('is-open');
          const willOpen = !isOpen;
          group.classList.toggle('is-open', willOpen);
          group.classList.toggle('is-collapsed', !willOpen);
          groupTitle.setAttribute('aria-expanded', String(willOpen));
          if (groupName) {
            try {
              const tap = new Set(JSON.parse(localStorage.getItem('clinic_nhom_gap') || '[]'));
              if (willOpen) tap.delete(groupName); else tap.add(groupName);
              localStorage.setItem('clinic_nhom_gap', JSON.stringify([...tap]));
            } catch {}
          }
        }
        return;
      }

      const toggle = event.target.closest('[data-mobile-nav-toggle]');
      const popover = mainNav.querySelector('#mobileNavPopover');
      if (toggle && popover) {
        const willOpen = popover.hidden;
        popover.hidden = !willOpen;
        toggle.setAttribute('aria-expanded', String(willOpen));
        toggle.classList.toggle('is-open', willOpen);
        document.body.classList.toggle('mobile-nav-open', willOpen);
        return;
      }

      if (event.target.closest('[data-mobile-nav-close]')) {
        closeMobileNavigation();
        return;
      }

      const button = event.target.closest('[data-view]');
      if (button) {
        closeMobileNavigation();
        navigateTo(button.dataset.view);
      }
    });
  }

  document.addEventListener('click', (event) => {
    if (mainNav && !mainNav.contains(event.target)) closeMobileNavigation();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileNavigation();
  });

  document.body.addEventListener('click', (event) => {
    const jump = event.target.closest('[data-view-jump]');
    if (jump) {
      navigateTo(jump.dataset.viewJump);
    }
    
    // Support jumping to Integrations view when clicking on auth summary
    const authJump = event.target.closest("[data-action='jump-integrations']");
    if (authJump) {
      navigateTo('integrations');
    }
  });

  // 5. Global Search Handler
  const globalSearch = document.getElementById('globalSearch');
  if (globalSearch) {
    globalSearch.addEventListener('input', (event) => {
      store.setSearchTerm(event.target.value.trim().toLowerCase());
    });
  }
}

function closeMobileNavigation() {
  const popover = document.getElementById('mobileNavPopover');
  const toggle = document.querySelector('[data-mobile-nav-toggle]');
  if (popover) popover.hidden = true;
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.classList.remove('is-open');
  }
  document.body.classList.remove('mobile-nav-open');
}

// Start application
// Remove the one-time cache-busting query after a stale lazy module recovery.
// Keeping the URL clean also prevents users from sharing an internal refresh token.
const startupUrl = new URL(window.location.href);
if (startupUrl.searchParams.has('_app_refresh')) {
  startupUrl.searchParams.delete('_app_refresh');
  window.history.replaceState(window.history.state, '', `${startupUrl.pathname}${startupUrl.search}${startupUrl.hash}`);
}
bootstrap();

// Cache the app shell after the first successful online visit so an existing
// signed-in employee can reopen the check-in screen without a network signal.
if ('serviceWorker' in navigator) {
  let reloadingForServiceWorkerUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForServiceWorkerUpdate) return;
    reloadingForServiceWorkerUpdate = true;
    window.location.reload();
  });
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'clinic:open-view' && event.data.view) navigateTo(event.data.view);
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn('[Clinic Hub] Service worker registration failed:', error);
      });
  });
}
