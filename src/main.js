import { initAuth, onAuthChange } from './auth.js';
import { store } from './store.js';
import { navigateTo } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { renderTopbar } from './components/topbar.js';
import { showLogin, hideLogin } from './components/login.js';
import { loadSettings } from './services/reports.js';
import { getNotifications, subscribeToNotifications } from './services/notifications.js';
import { syncOfflineAttendance } from './services/attendance.js';
import { syncPendingProofs } from './services/attendance-proofs.js';
import { showToast } from './components/toast.js';
import { getDefaultView, isOpsRole } from './permissions.js';
import { loadClinicLocation } from './services/clinic.js';

let notifSub = null;
let hasEnteredApp = false;
let pendingAttendanceSync = null;

async function syncAllPendingAttendance(userId) {
  if (!userId || !navigator.onLine) return { attendance: 0, proofs: 0 };
  if (pendingAttendanceSync) return pendingAttendanceSync;
  pendingAttendanceSync = (async () => {
    const attendance = await syncOfflineAttendance(userId);
    const proofResult = await syncPendingProofs(userId);
    return { attendance, proofs: proofResult.synced };
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
    store.updateUser(authInfo);
    
    const mainNav = document.getElementById('mainNav');
    
    if (authInfo.user && authInfo.profile) {
      // User is authenticated
      hideLogin();
      document.body.dataset.role = authInfo.profile.role || 'staff';

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
            if (cloudSettings) store.updateSettings(cloudSettings);
          } catch (err) {
            console.warn('[Clinic Hub] Failed to load cloud settings on boot:', err);
          }
        }

        // Public-to-authenticated branch configuration is authoritative for GPS.
        try {
          const locationSettings = await loadClinicLocation();
          if (locationSettings) store.updateSettings(locationSettings);
        } catch (err) {
          console.warn('[Clinic Hub] Failed to load branch location:', err);
        }

        // Load notifications
        try {
          const notifs = await getNotifications();
          store.setNotifications(notifs);
        } catch (err) {
          console.warn('[Clinic Hub] Failed to load notifications:', err);
        }

        // Setup realtime notifications subscription
        if (notifSub) notifSub.unsubscribe();
        notifSub = subscribeToNotifications(authInfo.user.id, (newNotif) => {
          store.addNotification(newNotif);
          showToast(`🔔 ${newNotif.title}: ${newNotif.body}`);
        });
      }
      
      // Render the sidebar menu dynamically based on their role permissions
      if (mainNav) {
        mainNav.innerHTML = renderSidebar(authInfo.profile.role);
      }
      
      // Nhân viên vào thẳng màn hình chấm công trong lần mở ứng dụng đầu tiên.
      const state = store.getState();
      navigateTo(hasEnteredApp ? state.currentView : getDefaultView(authInfo.profile.role));
      hasEnteredApp = true;
    } else {
      // User is logged out
      showLogin();
      hasEnteredApp = false;
      delete document.body.dataset.role;
      
      // Clean up notifications subscription
      if (notifSub) {
        notifSub.unsubscribe();
        notifSub = null;
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
      const button = event.target.closest('[data-view]');
      if (button) {
        navigateTo(button.dataset.view);
      }
    });
  }

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

// Start application
bootstrap();

// Cache the app shell after the first successful online visit so an existing
// signed-in employee can reopen the check-in screen without a network signal.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[Clinic Hub] Service worker registration failed:', error);
    });
  });
}
