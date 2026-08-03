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
};

let renderRequestId = 0;

export async function navigateTo(viewName) {
  const { role } = store.getState();
  
  // 1. Fallback to default if no view specified or role can't access
  let targetView = viewName;
  if (!targetView || !viewImports[targetView]) {
    targetView = getDefaultView(role);
  }
  
  if (!canAccessView(role, targetView)) {
    console.warn(`[Router] Access denied for view "${targetView}" under role "${role}". Redirecting to dashboard.`);
    targetView = 'dashboard';
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

      viewContainer.innerHTML = content;
      
      // Bind event listeners if view exports a post-render init function
      if (typeof module.initView === 'function') {
        module.initView();
      }
    } else {
      viewContainer.innerHTML = `<h3>View "${currentView}" not found</h3>`;
    }
  } catch (error) {
    console.error(`[Router] Error loading view "${currentView}":`, error);
    viewContainer.innerHTML = `
      <div class="empty-state error">
        <strong>Lỗi tải trang</strong>
        <span>Đã xảy ra lỗi khi tải nội dung: ${error.message}</span>
        <button class="primary-button" onclick="window.location.reload()">Tải lại trang</button>
      </div>
    `;
  }
});
