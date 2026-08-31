/**
 * RBAC Permission System for 5S Clinic Hub
 *
 * 5 roles: admin, hr, leader, finance, staff
 * Permissions are checked both client-side (UI filtering) and server-side (Supabase RLS).
 */

/* ── Views accessible per role ── */
const ROLE_VIEWS = {
  admin: ['dashboard', 'tasks', 'chat', 'recruitment', 'people', 'onboarding', 'uniforms', 'incidents', 'attendance', 'schedule', 'leave', 'payroll', 'proposals', 'supplies', 'assets', 'reports', 'integrations', 'system-admin', 'marketing-leads', 'telesale-management', 'telesale-workspace', 'marketing-analytics', 'pg-management', 'pg-locations', 'pg-workflow', 'gift-inventory', 'pg-attendance', 'hoa-hong', 'luong-pg', 'le-tan', 'so-benh-an', 'kho-hang'],
  // Hai vai trò cho bộ phận phụ tá, vì trưởng bộ phận KHÔNG chỉ là phụ tá có
  // thêm quyền kho: chị ấy vẫn duyệt đơn, xem chấm công và lịch của cả bộ
  // phận. Gộp làm một vai trò thì hoặc trưởng bộ phận mất quyền duyệt, hoặc
  // mọi phụ tá đều duyệt được đơn nghỉ của nhau.
  phu_ta: ['dashboard', 'kho-hang', 'chat', 'tasks', 'attendance', 'schedule', 'leave'],
  phu_ta_truong: ['dashboard', 'kho-hang', 'chat', 'tasks', 'attendance', 'schedule', 'leave'],
  admin_it: ['system-admin', 'tasks', 'attendance', 'schedule', 'leave', 'reports', 'integrations', 'pg-workflow', 'pg-attendance', 'hoa-hong', 'luong-pg', 'le-tan', 'so-benh-an'],
  admin_marketing: ['dashboard', 'marketing-leads', 'telesale-management', 'telesale-workspace', 'marketing-analytics', 'pg-management', 'pg-locations', 'pg-workflow', 'gift-inventory', 'people', 'schedule', 'chat', 'tasks', 'pg-attendance', 'hoa-hong', 'luong-pg'],
  support_marketing: ['dashboard', 'pg-locations', 'pg-workflow', 'gift-inventory', 'chat', 'tasks', 'pg-attendance', 'hoa-hong', 'luong-pg'],
  pg_staff: ['marketing-leads', 'attendance', 'pg-workflow', 'gift-inventory'],
  telesale_leader: ['dashboard', 'telesale-management', 'marketing-analytics', 'people', 'schedule', 'chat', 'tasks', 'hoa-hong', 'luong-pg'],
  telesale_staff: ['dashboard', 'telesale-workspace', 'chat', 'tasks', 'attendance', 'schedule', 'leave'],
  // Backend xep superadmin vao adminRoles va cho toan quyen. De rong o day
  // nghia la tai khoan dang nhap duoc nhung menu trong va khong mo duoc man nao.
  superadmin: ['dashboard', 'tasks', 'chat', 'recruitment', 'people', 'onboarding', 'uniforms', 'incidents', 'attendance', 'schedule', 'leave', 'payroll', 'proposals', 'supplies', 'assets', 'reports', 'integrations', 'system-admin', 'marketing-leads', 'telesale-management', 'telesale-workspace', 'marketing-analytics', 'pg-management', 'pg-locations', 'pg-workflow', 'gift-inventory', 'pg-attendance', 'hoa-hong', 'luong-pg', 'le-tan', 'so-benh-an', 'kho-hang'],
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
  // Quyền kho dùng chung cho cả hai vai trò phụ tá; khác nhau ở phần quản lý
  // bộ phận bên dưới.
  phu_ta: [
    'kho.read', 'kho.don.create', 'kho.don.receive', 'kho.xuat.create',
    'kho.hoadon.manage',
    'attendance.self', 'task.read_self', 'task.update_self',
    'leave.create', 'leave.read_self', 'schedule.read_self', 'schedule.register',
    'employee.read_self', 'message.send',
  ],
  phu_ta_truong: [
    'kho.read', 'kho.don.create', 'kho.don.approve', 'kho.don.receive',
    'kho.xuat.create', 'kho.xuat.approve', 'kho.hoadon.manage',
    'employee.read_department', 'attendance.read_department',
    'task.create', 'task.read_department', 'task.update_any',
    'leave.read_department', 'leave.approve_l1',
    'schedule.read_department', 'schedule.approve_department',
    'attendance.self', 'leave.create', 'message.send',
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
    { view: 'kho-hang', label: 'Kho vật tư', icon: 'ri-archive-2-line' },
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

/* ── Ghi đè phân quyền từ cơ sở dữ liệu ──────────────────────────────────
 *
 * ROLE_VIEWS ở trên là MẶC ĐỊNH của mã nguồn. Admin IT chỉnh được phần chênh
 * trên giao diện (màn Quản trị hệ thống → Phân quyền), phần chênh đó nằm
 * trong cơ sở dữ liệu và được nạp vào đây ngay sau khi đăng nhập.
 *
 * Nạp một lần vào bộ nhớ chứ không hỏi lại mỗi lần kiểm tra: canAccessView bị
 * gọi ở mọi lần chuyển màn và mọi lần dựng menu, để nó thành lời gọi mạng là
 * biến việc bấm menu thành việc chờ.
 *
 * MẶC ĐỊNH LÀ RỖNG. Chưa nạp được ghi đè thì hệ thống chạy đúng như mã nguồn,
 * không phải chạy sai — mất mạng lúc đăng nhập không được biến thành mất
 * quyền hay thừa quyền.
 */
let GHI_DE_VAI_TRO = {};
let GHI_DE_CUA_TOI = null;

export const BANG_VAI_TRO = ROLE_VIEWS;
export const MOI_VIEW = [...new Set(NAV_ITEMS.flatMap((g) => g.items.map((i) => i.view)))];
/* Cấu trúc menu và nhãn tiếng Việt, mở ra cho màn phân quyền dùng lại.
 *
 * Màn đó phải dựng lưới tick theo ĐÚNG nhóm và ĐÚNG tên mà người dùng nhìn
 * thấy trên menu. Chép một danh sách thứ hai sang bên đó là bảo đảm hai bên
 * lệch nhau ngay lần thêm màn tiếp theo — và khi đó Admin IT cấp quyền cho
 * một cái tên không còn tồn tại. */
export const NHOM_VIEW = NAV_ITEMS;
export const MOI_NHAN = Object.fromEntries(
  NAV_ITEMS.flatMap((g) => g.items.map((i) => [i.view, i.label])),
);

/* Màn KHÔNG được bỏ: nơi hệ thống đưa người dùng tới ngay sau khi đăng nhập.
 * Bỏ mất nó là đăng nhập xong rơi vào màn trắng, và người đó không tự sửa
 * được vì cũng không vào được màn nào khác. */
export const VIEW_BAT_BUOC = ['dashboard'];

/** Danh sách view mặc định của mã nguồn, chưa tính ghi đè. */
export function viewsMacDinh(role) {
  return ROLE_VIEWS[role] ? [...ROLE_VIEWS[role]] : [];
}

/** Áp phần chênh lên một danh sách. Dùng chung cho cả lúc chạy lẫn lúc Admin
 * IT xem trước kết quả của người khác, nên chỉ có MỘT cách hợp nhất. */
export function gopGhiDe(goc, ghiDe) {
  if (!ghiDe) return [...goc];
  const ra = new Set(goc);
  (ghiDe.tat || []).forEach((v) => ra.delete(v));
  (ghiDe.bat || []).forEach((v) => ra.add(v));
  return [...ra];
}

/** Kết quả cuối cùng cho một người: mặc định → ghi đè vai trò → ghi đè cá nhân. */
export function viewsHieuLuc(role, ghiDeVaiTro, ghiDeNhanSu) {
  return gopGhiDe(gopGhiDe(viewsMacDinh(role), ghiDeVaiTro), ghiDeNhanSu);
}

export function napGhiDePhanQuyen({ vaiTro = {}, cuaToi = null } = {}) {
  GHI_DE_VAI_TRO = vaiTro || {};
  GHI_DE_CUA_TOI = cuaToi || null;
}

/** View của người ĐANG ĐĂNG NHẬP, đã tính mọi ghi đè. */
function viewsHienHanh(role) {
  return viewsHieuLuc(role, GHI_DE_VAI_TRO[role], GHI_DE_CUA_TOI);
}

/* ── Public API ── */

/** Check if a role can access a specific view */
export function canAccessView(role, view) {
  if (!role || !ROLE_VIEWS[role]) return false;
  return viewsHienHanh(role).includes(view);
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
  const allowed = viewsHienHanh(role);
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
  return viewsHienHanh(role);
}

/** Check if a role is allowed to export/download customer data */
export function canExportData(role) {
  if (!role) return false;
  if (['telesale_staff', 'pg_staff', 'support_marketing', 'staff'].includes(role)) return false;
  return ['admin', 'admin_marketing', 'telesale_leader', 'leader', 'hr', 'finance', 'admin_it'].includes(role);
}
