import { store } from './store.js';
import { canAccessView, getDefaultView, khongPhaiChamCong, scheduleTitleForRole } from './permissions.js';
import { formatTime } from './utils.js';

// Map of view names to their lazy loaded module import functions
const viewImports = {
  dashboard: () => import('./views/dashboard.js'),
  tasks: () => import('./views/tasks.js'),
  chat: () => import('./views/chat.js'),
  recruitment: () => import('./views/recruitment.js'),
  people: () => import('./views/people.js'),
  onboarding: () => import('./views/onboarding.js'),
  uniforms: () => import('./views/uniforms.js'),
  incidents: () => import('./views/incidents.js'),
  attendance: () => import('./views/attendance.js'),
  schedule: () => import('./views/schedule.js'),
  leave: () => import('./views/leave.js'),
  payroll: () => import('./views/payroll.js'),
  proposals: () => import('./views/proposals.js'),
  supplies: () => import('./views/supplies.js'),
  assets: () => import('./views/assets.js'),
  reports: () => import('./views/reports.js'),
  integrations: () => import('./views/integrations.js'),
  'system-admin': () => import('./views/system-admin.js'),
  'marketing-leads': () => import('./views/marketing-leads.js'),
  'telesale-workspace': () => import('./views/telesale-workspace.js'),
  'telesale-management': () => import('./views/telesale-management.js'),
  'marketing-analytics': () => import('./views/marketing-analytics.js'),
  'pg-management': () => import('./views/pg-management.js'),
  'pg-locations': () => import('./views/pg-locations.js'),
  'pg-workflow': () => import('./views/pg-workflow.js'),
  'pg-attendance': () => import('./views/pg-attendance.js'),
  'hoa-hong': () => import('./views/hoa-hong.js'),
  'luong-pg': () => import('./views/luong-pg.js'),
  'gift-inventory': () => import('./views/gift-inventory.js'),
  'le-tan': () => import('./views/le-tan.js'),
  'so-benh-an': () => import('./views/so-benh-an.js'),
  'kho-hang': () => import('./views/kho-hang.js'),
};

const viewTitles = {
  'so-benh-an': 'Sổ bệnh án điện tử',
  'kho-hang': 'Kho vật tư',
  'le-tan': 'Lễ tân · tiếp đón và chăm sóc',
  dashboard: 'Tổng quan vận hành',
  tasks: 'Quản lý công việc',
  chat: 'Tin nhắn nội bộ',
  recruitment: 'Quy trình tuyển dụng',
  people: 'Hồ sơ nhân viên',
  onboarding: 'Hành trình hội nhập',
  uniforms: 'Cấp phát đồng phục',
  incidents: 'Ghi nhận sự vụ',
  attendance: 'Chấm công GPS',
  schedule: 'Lịch làm việc',
  leave: 'Đơn từ & Nghỉ phép',
  payroll: 'Tra cứu lương',
  proposals: 'Đề xuất & Phê duyệt',
  supplies: 'Quản lý cung ứng',
  assets: 'Quản lý tài sản',
  reports: 'Báo cáo hiệu suất',
  integrations: 'Cấu hình tích hợp',
  'system-admin': 'Quản trị hệ thống',
  'marketing-leads': 'Tiếp nhận Lead Marketing',
  'telesale-workspace': 'Chăm sóc khách hàng Telesale',
  'telesale-management': 'Quản lý Telesale',
  'marketing-analytics': 'Báo cáo Marketing & Telesale',
  'pg-management': 'Quản lý PG',
  'pg-locations': 'Địa điểm chấm công PG',
  'pg-workflow': 'Điều phối & hỗ trợ PG',
  'pg-attendance': 'Chấm công PG',
  'hoa-hong': 'Duyệt hoa hồng PG & SUP',
  'luong-pg': 'Lương PG',
  'gift-inventory': 'Kho quà tặng khách hàng',
};

let renderRequestId = 0;
// The previous implementation started rendering asynchronously but returned
// from navigateTo immediately. Callers that had just saved data could show a
// success toast while the old screen was still mounted, which looked like the
// new record only appeared after a browser reload. Keep the current render
// promise so mutations can await a completed, fresh view.
let activeRender = Promise.resolve();

const STALE_MODULE_RECOVERY_KEY = 'clinic:stale-module-recovery';

function isStaleModuleError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('failed to fetch dynamically imported module')
    || message.includes('error loading dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('failed to fetch module');
}

async function recoverFromStaleModule(error) {
  if (!isStaleModuleError(error)) return false;

  const now = Date.now();
  const lastRecovery = Number(sessionStorage.getItem(STALE_MODULE_RECOVERY_KEY) || 0);
  // Avoid an endless refresh loop if the server is genuinely unavailable.
  if (now - lastRecovery < 60_000) return false;
  sessionStorage.setItem(STALE_MODULE_RECOVERY_KEY, String(now));

  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
  } catch (updateError) {
    console.warn('[Router] Service worker update before module recovery failed:', updateError);
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('_app_refresh', String(now));
  window.location.replace(nextUrl.toString());
  return true;
}

export async function navigateTo(viewName) {
  const { role } = store.getState();
  
  // 1. Fallback to default if no view specified or role can't access
  let targetView = viewName;
  if (!targetView || !viewImports[targetView]) {
    targetView = getDefaultView(role);
  }
  
  if (!canAccessView(role, targetView)) {
    console.warn(`[Router] Access denied for view "${targetView}" under role "${role}". Redirecting to dashboard.`);
    targetView = getDefaultView(role);
  }

  // 2. Update store state
  store.setView(targetView);
  return activeRender;
}

// Listen to state changes to trigger rendering of views
async function renderCurrentView(state) {
  const requestId = ++renderRequestId;
  const viewContainer = document.getElementById('appView');
  const viewTitle = document.getElementById('viewTitle');
  
  if (!viewContainer) return;

  // Do not let a render from the previous account remain behind the login
  // screen while authentication is being replaced.
  if (!state.user || !state.profile) {
    document.body.classList.remove('has-open-drawer', 'app-modal-open');
    viewContainer.replaceChildren();
    return;
  }
  
  const currentView = state.currentView;
  
  // Update view title
  if (viewTitle) {
    viewTitle.textContent = currentView === 'schedule'
      ? scheduleTitleForRole(store.getState().role)
      : viewTitles[currentView] || 'Clinic Hub';
  }

  // Update navigation items active state
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === currentView);
  });
  document.querySelectorAll('.mobile-nav-item[data-view], .mobile-nav-menu-item[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === currentView);
  });
  const mobileMore = document.querySelector('[data-mobile-nav-toggle]');
  const activeOverflowItem = document.querySelector(`.mobile-nav-menu-item[data-view="${currentView}"]`);
  mobileMore?.classList.toggle('active', Boolean(activeOverflowItem));

  // ══ Đồng bộ Header, Manager Strip & Sidebar Note theo trạng thái chấm công ══
  const role = state.role || state.profile?.role;
  const khongCanCham = khongPhaiChamCong(role);
  const att = state.todayAttendance;
  const daVaoCa = Boolean(att?.checkedIn);
  const daKetCa = Boolean(att?.checkedOut);
  const dangOTrangChamCong = currentView === 'attendance';

  // 1. Dải nhắc nhở .manager-strip:
  // - Ẩn trên màn hình Chấm công để tránh trùng lặp tiêu đề và nút tự gọi chính nó
  // - Ẩn với vai trò quản trị không cần chấm công (Admin, IT, Marketing, Leader...) khi không có ca
  // - Khi đã vào ca mà chưa ra ca: hiển thị dải nhắc kết ca kèm nút Check-out!
  const dai = document.querySelector('.manager-strip');
  if (dai) {
    if (dangOTrangChamCong || khongCanCham || daKetCa) {
      dai.hidden = true;
      dai.style.display = 'none';
    } else if (daVaoCa) {
      dai.hidden = false;
      dai.style.display = '';
      dai.innerHTML = `
        <div>
          <p class="eyebrow" style="color: #047857; font-weight: 600;">✓ Đang trong ca làm việc · Vào lúc ${formatTime(att?.checkinTime)}</p>
          <h3 id="managerNotesTitle" style="color: #065f46;">Đừng quên Check-out GPS tại phòng khám khi kết thúc ngày làm việc.</h3>
        </div>
        <button class="primary-button" type="button" data-view-jump="attendance" style="background: #059669; color: white; border: none; font-weight: 600;">
          <span>↗</span>
          Check-out kết ca
        </button>
      `;
    } else {
      dai.hidden = false;
      dai.style.display = '';
      dai.innerHTML = `
        <div>
          <p class="eyebrow">Ghi chú vận hành</p>
          <h3 id="managerNotesTitle">Chấm công tại 60 Lê Văn Thọ bằng GPS trực tiếp; dữ liệu ngoại tuyến sẽ tự đồng bộ.</h3>
        </div>
        <button class="primary-button" type="button" data-view-jump="attendance">
          <span>⌖</span>
          Chấm công ngay
        </button>
      `;
    }
  }

  // 2. Sidebar Note (.sidebar-note) đồng bộ trạng thái:
  const sidebarNote = document.querySelector('.sidebar-note');
  if (sidebarNote) {
    if (khongCanCham) {
      sidebarNote.innerHTML = `
        <span class="note-dot" style="background: #0d9488;"></span>
        <p><strong>Nha Khoa 5S</strong><br/><small style="color: #6e7a76;">Vận hành hệ thống 2 chi nhánh</small></p>
      `;
    } else if (daKetCa) {
      sidebarNote.innerHTML = `
        <span class="note-dot" style="background: #6b7280;"></span>
        <p><strong style="color: #374151;">✓ Đã kết ca:</strong> ${formatTime(att?.checkoutTime)}<br/><small style="color: #6b7280;">Hoàn thành ca làm việc hôm nay</small></p>
      `;
    } else if (daVaoCa) {
      sidebarNote.innerHTML = `
        <span class="note-dot online" style="background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);"></span>
        <div style="flex: 1; min-width: 0;">
          <p><strong style="color: #065f46;">✓ Đã vào ca:</strong> ${formatTime(att?.checkinTime)}<br/><small style="color: #047857;">GPS hợp lệ · Đang làm việc</small></p>
        </div>
        <button type="button" data-view-jump="attendance" title="Đi tới Check-out kết ca" style="background: #059669; color: #fff; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600; white-space: nowrap;">↗ Ra ca</button>
      `;
    } else {
      sidebarNote.innerHTML = `
        <span class="note-dot" style="background: #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);"></span>
        <p><strong style="color: #92400e;">Chưa check-in ca hôm nay</strong><br/><small style="color: #b45309;">Bật GPS xác minh tại phòng khám</small></p>
      `;
    }
  }

  // Load the view and render it
  try {
    const importFn = viewImports[currentView];
    if (importFn) {
      // Lazy load view module
      const module = await importFn();
      // Render view content inside container
      const content = await module.renderView(state);

      // Ignore a slower render that belongs to a view/state already replaced
      // by a newer navigation request.
      if (requestId !== renderRequestId || store.getState().currentView !== currentView) return;

      // A realtime render can replace an open drawer. Always release global
      // scroll locks before replacing its DOM so the page never stays frozen.
      document.body.classList.remove('has-open-drawer', 'app-modal-open');
      viewContainer.innerHTML = content;
      
      // Bind event listeners if view exports a post-render init function
      if (typeof module.initView === 'function') {
        module.initView();
      }
    } else {
      viewContainer.innerHTML = `<h3>View "${currentView}" not found</h3>`;
    }
  } catch (error) {
    // A view started before authentication completed may fail with 401 after
    // the user has already signed in and triggered a newer render. Do not let
    // that stale failure overwrite the authenticated screen.
    if (requestId !== renderRequestId || store.getState().currentView !== currentView) return;
    console.error(`[Router] Error loading view "${currentView}":`, error);
    if (await recoverFromStaleModule(error)) return;
    viewContainer.innerHTML = `
      <div class="empty-state error">
        <strong>Lỗi tải trang</strong>
        <span>Đã xảy ra lỗi khi tải nội dung: ${error.message}</span>
        <button class="primary-button" onclick="window.location.reload()">Tải lại trang</button>
      </div>
    `;
  }
}

store.subscribe((state) => {
  activeRender = renderCurrentView(state);
});
