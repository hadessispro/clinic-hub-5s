import { store } from './store.js';
import { canAccessView, getDefaultView } from './permissions.js';

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
};

const viewTitles = {
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
};

let renderRequestId = 0;

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
}

// Listen to state changes to trigger rendering of views
store.subscribe(async (state) => {
  const requestId = ++renderRequestId;
  const viewContainer = document.getElementById('appView');
  const viewTitle = document.getElementById('viewTitle');
  
  if (!viewContainer) return;
  
  const currentView = state.currentView;
  
  // Update view title
  if (viewTitle) {
    viewTitle.textContent = viewTitles[currentView] || 'Clinic Hub';
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
});
