/**
 * RBAC Permission System for 5S Clinic Hub
 *
 * 5 roles: admin, hr, leader, finance, staff
 * Permissions are checked both client-side (UI filtering) and server-side (Supabase RLS).
 */

/* ── Views accessible per role ── */
const ROLE_VIEWS = {
  admin: ['dashboard', 'tasks', 'chat', 'recruitment', 'people', 'onboarding', 'uniforms', 'incidents', 'attendance', 'schedule', 'leave', 'payroll', 'proposals', 'supplies', 'assets', 'reports', 'integrations', 'system-admin'],
  admin_it: ['system-admin', 'attendance', 'schedule', 'leave', 'reports', 'integrations'],
  superadmin: [],
  hr: ['dashboard', 'tasks', 'chat', 'recruitment', 'people', 'onboarding', 'uniforms', 'incidents', 'attendance', 'schedule', 'leave', 'payroll'],
  leader: ['dashboard', 'tasks', 'chat', 'attendance', 'schedule', 'leave'],
  finance: ['dashboard', 'tasks', 'chat', 'attendance', 'leave', 'payroll'],
  staff: ['dashboard', 'tasks', 'chat', 'attendance', 'schedule', 'leave'],
};

/* ── Actions allowed per role ── */
const ROLE_ACTIONS = {
  admin: ['*'],
  admin_it: ['system.read', 'system.configure', 'buglog.read', 'buglog.update', 'attendance.read_all', 'attendance.verify', 'schedule.manage', 'employee.read_all', 'leave.create', 'leave.read_self', 'leave.read_all', 'leave.approve'],
  superadmin: [],
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
    { view: 'dashboard', label: 'Tổng quan', icon: '⌂' },
    { view: 'tasks', label: 'Công việc', icon: '✓' },
    { view: 'chat', label: 'Tin nhắn', icon: '☰' },
    { view: 'system-admin', label: 'Quản trị hệ thống', icon: '⚙' },
  ]},
  { group: 'Nhân sự', items: [
    { view: 'recruitment', label: 'Tuyển dụng', icon: '◌' },
    { view: 'people', label: 'Hồ sơ', icon: '◎' },
    { view: 'onboarding', label: 'Hội nhập', icon: '▱' },
    { view: 'uniforms', label: 'Đồng phục', icon: '▥' },
    { view: 'incidents', label: 'Sự vụ', icon: '!' },
  ]},
  { group: 'Công & lịch', items: [
    { view: 'attendance', label: 'Chấm công', icon: '⌖' },
    { view: 'schedule', label: 'Lịch làm', icon: '▦' },
    { view: 'leave', label: 'Đơn từ', icon: '◇' },
    { view: 'payroll', label: 'Lương', icon: '₫' },
  ]},
  { group: 'Tài chính & kho', items: [
    { view: 'proposals', label: 'Đề xuất', icon: '⇧' },
    { view: 'supplies', label: 'Cung ứng', icon: '⊞' },
    { view: 'assets', label: 'Tài sản', icon: '▤' },
    { view: 'reports', label: 'Báo cáo', icon: '▣' },
    { view: 'integrations', label: 'Tích hợp', icon: '∞' },
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
  if (role === 'admin_it') return 'system-admin';
  return role === 'staff' ? 'attendance' : 'dashboard';
}

/** Get all views a role can access */
export function getAccessibleViews(role) {
  return ROLE_VIEWS[role] || [];
}
