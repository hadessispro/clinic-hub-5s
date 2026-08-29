/**
 * RBAC Permission System for 5S Clinic Hub
 *
 * 5 roles: admin, hr, leader, finance, staff
 * Permissions are checked both client-side (UI filtering) and server-side (Supabase RLS).
 */

/* ── Views accessible per role ── */
const ROLE_VIEWS = {
  admin: ['dashboard', 'tasks', 'chat', 'recruitment', 'people', 'onboarding', 'uniforms', 'incidents', 'attendance', 'schedule', 'leave', 'payroll', 'proposals', 'supplies', 'assets', 'reports', 'integrations', 'system-admin', 'marketing-leads', 'telesale-management', 'telesale-workspace', 'marketing-analytics', 'pg-management', 'pg-locations', 'pg-workflow', 'gift-inventory', 'pg-attendance', 'hoa-hong', 'luong-pg', 'le-tan', 'so-benh-an'],
  admin_it: ['system-admin', 'tasks', 'attendance', 'schedule', 'leave', 'reports', 'integrations', 'pg-workflow', 'pg-attendance', 'hoa-hong', 'luong-pg', 'le-tan', 'so-benh-an'],
  admin_marketing: ['dashboard', 'marketing-leads', 'telesale-management', 'telesale-workspace', 'marketing-analytics', 'pg-management', 'pg-locations', 'pg-workflow', 'gift-inventory', 'people', 'schedule', 'chat', 'tasks', 'pg-attendance', 'hoa-hong', 'luong-pg'],
  support_marketing: ['dashboard', 'pg-locations', 'pg-workflow', 'gift-inventory', 'chat', 'tasks', 'pg-attendance', 'hoa-hong', 'luong-pg'],
  pg_staff: ['marketing-leads', 'attendance', 'pg-workflow', 'gift-inventory'],
  telesale_leader: ['dashboard', 'telesale-management', 'marketing-analytics', 'people', 'schedule', 'chat', 'tasks', 'hoa-hong', 'luong-pg'],
  telesale_staff: ['dashboard', 'telesale-workspace', 'chat', 'tasks', 'attendance', 'schedule', 'leave'],
  // Backend xep superadmin vao adminRoles va cho toan quyen. De rong o day
  // nghia la tai khoan dang nhap duoc nhung menu trong va khong mo duoc man nao.
  superadmin: ['dashboard', 'tasks', 'chat', 'recruitment', 'people', 'onboarding', 'uniforms', 'incidents', 'attendance', 'schedule', 'leave', 'payroll', 'proposals', 'supplies', 'assets', 'reports', 'integrations', 'system-admin', 'marketing-leads', 'telesale-management', 'telesale-workspace', 'marketing-analytics', 'pg-management', 'pg-locations', 'pg-workflow', 'gift-inventory', 'pg-attendance', 'hoa-hong', 'luong-pg', 'le-tan', 'so-benh-an'],
  bac_si: ['dashboard', 'so-benh-an', 'le-tan', 'chat', 'tasks', 'attendance', 'schedule', 'leave'],
  le_tan: ['dashboard', 'le-tan', 'so-benh-an', 'chat', 'tasks', 'attendance', 'schedule', 'leave'],
  hr: ['dashboard', 'tasks', 'chat', 'recruitment', 'people', 'onboarding', 'uniforms', 'incidents', 'attendance', 'schedule', 'leave', 'payroll'],
  leader: ['dashboard', 'tasks', 'chat', 'attendance', 'schedule', 'leave'],
  finance: ['dashboard', 'tasks', 'chat', 'attendance', 'leave', 'payroll'],
  staff: ['dashboard', 'tasks', 'chat', 'attendance', 'schedule', 'leave'],
};

/* ── Actions allowed per role ── */
const ROLE_ACTIONS = {
  admin: ['*'],
  admin_it: ['system.read', 'system.configure', 'buglog.read', 'buglog.update', 'attendance.read_all', 'attendance.verify', 'schedule.manage', 'employee.read_all', 'leave.create', 'leave.read_self', 'leave.read_all', 'leave.approve'],
  admin_marketing: ['marketing.*', 'telesale.*', 'analytics.marketing', 'data.export', 'employee.read_all', 'message.send', 'task.create'],
  support_marketing: ['marketing.leads.create', 'marketing.leads.import', 'telesale.assign', 'message.send', 'task.create'],
  pg_staff: ['marketing.leads.create', 'attendance.self', 'schedule.read_self', 'leave.create', 'message.send'],
  telesale_leader: ['telesale.team.manage', 'telesale.leads.assign', 'telesale.analytics', 'telesale.calls.create', 'data.export', 'message.send', 'task.create'],
  telesale_staff: ['telesale.leads.view_own', 'telesale.calls.create', 'telesale.appointment.create', 'attendance.self', 'schedule.read_self', 'leave.create', 'message.send', 'task.create'],
  superadmin: ['*'],
  bac_si: [
    'benh_an.read', 'benh_an.write', 'benh_an.ky', 'benh_an.rang.write',
    'attendance.self', 'schedule.read_self', 'leave.create', 'message.send',
    'task.create', 'task.update_self',
  ],
  le_tan: [
    'le_tan.appointment.crud', 'le_tan.checkin', 'le_tan.care.handle',
    'attendance.self', 'schedule.read_self', 'leave.create', 'message.send',
    'task.create', 'task.update_self',
  ],
  hr: [
    'employee.read_all', 'employee.write',
    'attendance.read_all', 'attendance.verify',
    'task.create', 'task.read_all', 'task.update_any',
    'leave.read_all', 'leave.approve',
    'uniform.issue',
    'incident.crud',
    'schedule.manage',
    'payroll.read_all', 'payroll.manage',
  ],
  leader: [
    'employee.read_department',
    'attendance.read_department',
    'task.create', 'task.read_department', 'task.update_any',
    'leave.read_department', 'leave.approve_l1',
    'recruitment.crud',
    'onboarding.manage',
    'incident.crud',
    'schedule.read_department', 'schedule.approve_department',
  ],
  finance: [
    'attendance.read_all',
    'task.create', 'task.update_self',
    'leave.read_all',
    'payroll.read_all', 'payroll.manage',
  ],
  staff: [
    'attendance.self',
    'task.read_self', 'task.update_self',
    'leave.create', 'leave.read_self',
    'schedule.read_self', 'schedule.register',
    'onboarding.read_self', 'onboarding.update_self',
    'payroll.read_self', 'payroll.feedback',
    'employee.read_self',
    'message.send',
  ],
};

/* ── Nav items with icons ── */
const NAV_ITEMS = [
  { group: 'Điều hành', items: [
    { view: 'dashboard', label: 'Tổng quan', icon: 'ri-dashboard-3-line' },
    { view: 'tasks', label: 'Công việc', icon: 'ri-checkbox-circle-line' },
    { view: 'chat', label: 'Tin nhắn', icon: 'ri-chat-3-line' },
    { view: 'system-admin', label: 'Quản trị hệ thống', icon: 'ri-shield-keyhole-line' },
  ]},
  { group: 'Nhân sự', items: [
    { view: 'recruitment', label: 'Tuyển dụng', icon: 'ri-user-add-line' },
    { view: 'people', label: 'Hồ sơ nhân sự', icon: 'ri-team-line' },
    { view: 'onboarding', label: 'Hội nhập', icon: 'ri-compass-3-line' },
    { view: 'uniforms', label: 'Đồng phục', icon: 'ri-t-shirt-line' },
    { view: 'incidents', label: 'Sự vụ', icon: 'ri-alert-line' },
  ]},
  { group: 'Công & lịch', items: [
    { view: 'attendance', label: 'Chấm công GPS', icon: 'ri-map-pin-time-line' },
    { view: 'schedule', label: 'Lịch làm việc', icon: 'ri-calendar-event-line' },
    { view: 'leave', label: 'Đơn từ nghỉ phép', icon: 'ri-file-text-line' },
    { view: 'payroll', label: 'Công lương', icon: 'ri-money-dollar-circle-line' },
  ]},
  { group: 'Tài chính & kho', items: [
    { view: 'proposals', label: 'Phiếu đề xuất', icon: 'ri-file-paper-line' },
    { view: 'supplies', label: 'Cung ứng vật tư', icon: 'ri-box-3-line' },
    { view: 'assets', label: 'Tài sản', icon: 'ri-safe-2-line' },
    { view: 'reports', label: 'Báo cáo quản lý', icon: 'ri-bar-chart-2-line' },
    { view: 'integrations', label: 'Tích hợp', icon: 'ri-settings-4-line' },
  ]},
  { group: 'Phòng khám', items: [
    { view: 'le-tan', label: 'Lễ tân', icon: 'ri-service-line' },
    { view: 'so-benh-an', label: 'Sổ bệnh án', icon: 'ri-file-user-line' },
  ]},
  { group: 'Marketing & Telesale', items: [
    { view: 'marketing-leads', label: 'Tiếp nhận Lead', icon: 'ri-megaphone-line' },
    { view: 'telesale-management', label: 'Quản lý Telesale', icon: 'ri-team-line' },
    { view: 'telesale-workspace', label: 'Chăm sóc khách hàng', icon: 'ri-headset-line' },
    { view: 'marketing-analytics', label: 'Báo cáo Marketing', icon: 'ri-line-chart-line' },
    { view: 'pg-management', label: 'Quản lý PG', icon: 'ri-user-location-line' },
    { view: 'pg-locations', label: 'Địa điểm PG', icon: 'ri-map-pin-2-line' },
    { view: 'pg-workflow', label: 'Điều phối PG', icon: 'ri-route-line' },
    { view: 'pg-attendance', label: 'Chấm công PG', icon: 'ri-time-line' },
    { view: 'gift-inventory', label: 'Kho quà tặng', icon: 'ri-gift-2-line' },
    // Thêm mục vào ROLE_VIEWS thôi thì CHƯA ĐỦ. getNavForRole lọc NAV_ITEMS
    // theo danh sách quyền, nên view nào không có mặt ở đây thì quyền có cho
    // phép cũng không hiện ra menu. Hai danh sách phải khớp nhau.
    { view: 'hoa-hong', label: 'Duyệt hoa hồng', icon: 'ri-hand-coin-line' },
    { view: 'luong-pg', label: 'Lương PG', icon: 'ri-money-dollar-circle-line' },
  ]},
];

/* ── Public API ── */

/** Check if a role can access a specific view */
export function canAccessView(role, view) {
  if (!role || !ROLE_VIEWS[role]) return false;
  return ROLE_VIEWS[role].includes(view);
}
/** Check if a role can perform a specific action */
export function canPerform(role, action) {
  if (!role || !ROLE_ACTIONS[role]) return false;
  const actions = ROLE_ACTIONS[role];
  if (actions.includes('*')) return true;
  return actions.includes(action);
}

/** Check if role is an ops role (admin/hr/leader/finance) */
/* Vai trò KHÔNG tự chấm công GPS.
 *
 * Trưởng bộ phận và trưởng phòng đi lại giữa hai chi nhánh và ra ngoài gặp
 * đối tác, nên bắt họ đứng trong bán kính 100 m mới bấm được là bắt họ nói
 * dối hoặc bỏ chấm. Cả hai kết cục đều làm số liệu chấm công kém tin hơn là
 * bỏ hẳn yêu cầu.
 *
 * Miễn CHẤM CÔNG, không miễn XEM CÔNG. Nhân sự và trưởng bộ phận vẫn cần
 * bảng theo dõi công của đội, nên màn Chấm công vẫn mở với họ — chỉ ẩn phần
 * tự bấm và dải nhắc, giữ lại phần lịch sử.
 */
export const VAI_TRO_KHONG_CHAM_CONG = [
  'admin', 'admin_it', 'superadmin',
  'admin_marketing', 'support_marketing',
  'leader', 'telesale_leader', 'hr', 'finance',
];

export function khongPhaiChamCong(role) {
  return VAI_TRO_KHONG_CHAM_CONG.includes(role);
}

export function isOpsRole(role) {
  return ['admin', 'hr', 'leader', 'finance', 'admin_it'].includes(role);
}

/** Get nav items filtered by role */
export function getNavForRole(role) {
  if (!role) return [];
  const allowed = ROLE_VIEWS[role] || [];
  return NAV_ITEMS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.includes(item.view)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Get the default/fallback view for a role */
export function getDefaultView(role) {
  const roleDefaults = {
    admin_it: 'system-admin',
    pg_staff: 'marketing-leads',
    telesale_staff: 'telesale-workspace',
    support_marketing: 'pg-workflow',
    telesale_leader: 'telesale-management',
  };
  if (roleDefaults[role]) return roleDefaults[role];
  return role === 'staff' ? 'attendance' : 'dashboard';
}

/** Get all views a role can access */
export function getAccessibleViews(role) {
  return ROLE_VIEWS[role] || [];
}

/** Check if a role is allowed to export/download customer data */
export function canExportData(role) {
  if (!role) return false;
  if (['telesale_staff', 'pg_staff', 'support_marketing', 'staff'].includes(role)) return false;
  return ['admin', 'admin_marketing', 'telesale_leader', 'leader', 'hr', 'finance', 'admin_it'].includes(role);
}
