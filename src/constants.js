/* ── Departments ── */
export const DEPARTMENTS = [
  { id: 'bgd', name: 'Ban Giám đốc', lead: 'Trần Đức Mạnh' },
  { id: 'mkt', name: 'Marketing', lead: 'Phan Ngọc Đức' },
  { id: 'dvkh', name: 'Dịch vụ khách hàng', lead: 'Nguyễn Thị Vân Anh' },
  { id: 'bs', name: 'Bác sĩ', lead: 'Huỳnh Kim Thy' },
  { id: 'phuta', name: 'Phụ tá', lead: 'Nguyễn Thị Như Huỳnh' },
  { id: 'hcth', name: 'Hành chính Tổng hợp', lead: 'Nguyễn Thị Thương' },
  { id: 'it', name: 'Quản trị IT', lead: 'Admin IT' },
];

/* ── Shifts ── */
export const SHIFTS = [
  { id: 'clinic-0800', group: 'Chi nhánh Lê Văn Thọ', name: 'Ca 08:00', start: '08:00', end: '17:00', breakText: 'Theo lịch phân công', checkinRule: 'Check-in khi có mặt tại phòng khám lúc 08:00' },
  { id: 'front-office', group: 'Lễ tân, Phụ tá', name: 'Ca hành chính', start: '07:30', end: '17:00', breakText: 'Nghỉ trưa 1 tiếng', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'front-full', group: 'Lễ tân, Phụ tá', name: 'Ca full', start: '07:30', end: '20:00', breakText: 'Nghỉ trưa 1 tiếng', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'front-afternoon', group: 'Lễ tân, Phụ tá', name: 'Ca chiều', start: '09:30', end: '20:00', breakText: 'Nghỉ trưa 1 tiếng', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'front-morning', group: 'Lễ tân, Phụ tá', name: 'Ca sáng', start: '07:30', end: '18:00', breakText: 'Nghỉ trưa 1 tiếng', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-office', group: 'Bác sĩ', name: 'Ca hành chính', start: '08:00', end: '17:00', breakText: 'Nghỉ 1 giờ', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-morning', group: 'Bác sĩ', name: 'Ca sáng', start: '08:00', end: '18:00', breakText: 'Nghỉ 1 giờ', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-afternoon', group: 'Bác sĩ', name: 'Ca chiều', start: '10:00', end: '20:00', breakText: 'Nghỉ 1 giờ', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-full', group: 'Bác sĩ', name: 'Ca full', start: '08:00', end: '20:00', breakText: 'Nghỉ 60 phút', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'security-weekday', group: 'Bảo vệ', name: 'Ngày thường', start: '07:00', end: '20:00', breakText: 'Theo bàn giao ca', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'security-sunday', group: 'Bảo vệ', name: 'Chủ nhật', start: '07:00', end: '17:00', breakText: 'Theo bàn giao ca', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'cleaning-weekday', group: 'Tạp vụ', name: 'Ngày thường', start: '06:00', end: '16:00', breakText: 'Nghỉ trưa 11h-12h', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'cleaning-sunday', group: 'Tạp vụ', name: 'Chủ nhật', start: '06:00', end: '15:00', breakText: 'Nghỉ trưa 11h-12h', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
];

export function defaultShiftForDepartment(department) {
  if (department === 'bs') return 'doctor-office';
  if (department === 'dvkh' || department === 'phuta') return 'front-office';
  if (department === 'baove') return 'security-weekday';
  if (department === 'laocong') return 'cleaning-weekday';
  return 'clinic-0800';
}

export function effectiveShiftId({ assignedShift, defaultShift, department, workDate }) {
  let shiftId = assignedShift || defaultShift || defaultShiftForDepartment(department);
  const day = workDate ? new Date(`${workDate}T12:00:00+07:00`).getUTCDay() : null;
  if (day === 0 && shiftId === 'security-weekday') shiftId = 'security-sunday';
  if (day === 0 && shiftId === 'cleaning-weekday') shiftId = 'cleaning-sunday';
  return shiftId;
}

/* ── Role profiles ── */
export const ROLE_PROFILES = {
  admin: { label: 'Admin', scope: 'Toàn quyền vận hành, phân luồng tài khoản, duyệt cuối.' },
  admin_it: { label: 'Admin IT', scope: 'Quản trị kỹ thuật, cấu hình hệ thống, theo dõi lỗi/bug log và gửi/quản lý đơn từ nhân sự.' },
  admin_marketing: { label: 'Admin Marketing', scope: 'Quản trị Marketing, ngân sách Ads, phân tích ROI và KPI đội Telesale.' },
  support_marketing: { label: 'Support Marketing', scope: 'Tiếp nhận Lead từ các kênh (FB/Google/Zalo), nạp file Excel & hỗ trợ chia lead.' },
  pg_staff: { label: 'Nhân viên PG', scope: 'Thu thập & cung cấp dữ liệu Lead thị trường trực tiếp cho đội Telesale.' },
  telesale_leader: { label: 'Quản lý Telesale', scope: 'Trưởng nhóm Telesale, chia chỉ tiêu cuộc gọi/lịch hẹn, quản lý đội ngũ.' },
  telesale_staff: { label: 'Nhân viên Telesale', scope: 'Giao diện Telesale chuyên dụng: Gọi điện, nhập nhật ký cuộc gọi và chốt lịch hẹn.' },
  superadmin: { label: 'Superadmin', scope: 'Role dự phòng; chưa kích hoạt chức năng hoặc tài khoản.' },
  bac_si: { label: 'Bác sĩ', scope: 'Khám, ghi sơ đồ răng, chẩn đoán và diễn biến điều trị trong sổ bệnh án điện tử.' },
  le_tan: { label: 'Lễ tân', scope: 'Tiếp đón khách tại quầy, đặt và đổi lịch hẹn, check-in, và các hàng đợi chăm sóc khách hàng.' },
  hr: { label: 'Nhân sự', scope: 'Tuyển dụng, hồ sơ, hội nhập, đơn từ, lịch làm, công lương.' },
  leader: { label: 'Trưởng bộ phận', scope: 'Giao việc, duyệt đơn cấp 1, xác nhận lịch và hiệu suất đội nhóm.' },
  finance: { label: 'Kế toán', scope: 'Duyệt chi, hóa đơn, ứng lương, account chính và phản hồi lương.' },
  staff: { label: 'Nhân viên', scope: 'Chấm công, nhận task, gửi đơn, đọc hội nhập, xem hồ sơ cá nhân.' },
};

/* ── View titles ── */
export const VIEW_TITLES = {
  dashboard: 'Tổng quan vận hành',
  attendance: 'Chấm công GPS',
  tasks: 'Công việc đội nhóm',
  supplies: 'Cung ứng vật tư',
  assets: 'Kiểm kê tài sản',
  proposals: 'Phiếu đề xuất',
  recruitment: 'Tuyển dụng & offer',
  schedule: 'Lịch làm & tăng ca',
  leave: 'Đơn từ nhân sự',
  payroll: 'Công lương',
  uniforms: 'Nhật ký đồng phục',
  onboarding: 'Đào tạo hội nhập',
  people: 'Nhân sự phòng khám',
  incidents: 'Sự vụ nhân viên',
  chat: 'Tin nhắn đội nhóm',
  reports: 'Báo cáo quản lý',
  integrations: 'Tích hợp & bảo mật',
  'marketing-leads': 'Tiếp nhận Lead Marketing',
  'telesale-workspace': 'Workspace Telesale',
  'marketing-analytics': 'Báo cáo Marketing & Telesale',
  'pg-management': 'Quản lý PG',
  'hoa-hong': 'Duyệt hoa hồng PG & SUP',
  'luong-pg': 'Lương PG',
  'pg-attendance': 'Chấm công PG',
};

/* ── Marketing & Telesale Statuses ── */
export const LEAD_STATUS = {
  new: 'Mới nạp',
  contacted: 'Đã liên hệ',
  appointment_booked: 'Đã hẹn khám',
  visited: 'Đã đến PK',
  converted: 'Chốt thành công',
  appointment_cancelled: 'Khách hủy hẹn',
  low_quality: 'Khách không chất lượng (KCL)',
  cancelled: 'Hủy/Không nhu cầu',
};

export const LOW_QUALITY_REASONS = {
  subscriber_unavailable: 'Thuê bao/không liên lạc được',
  wrong_phone: 'Sai số điện thoại',
  wrong_person: 'Nhầm máy/không đúng khách',
  duplicate: 'Trùng dữ liệu',
  spam: 'Data rác/không có nhu cầu thực',
  other: 'Lý do khác',
};

export const CALL_STATUS = {
  not_consulted: 'Chưa tư vấn',
  not_appointment_booked: 'Chưa chốt hẹn',
  interested: 'Quan tâm/Tư vấn',
  appointment_booked: 'Chốt hẹn khám',
  busy: 'Máy bận',
  no_answer: 'Không nghe máy',
  rejected: 'Từ chối/Hủy',
};

export const MARKETING_SOURCES = ['Facebook Ads', 'Google Ads', 'TikTok Ads', 'Zalo OA', 'PG Field Intake', 'Referral', 'Website', 'Hotline Direct'];

/* ── Task status labels ── */
export const TASK_STATUS = { todo: 'Cần làm', doing: 'Đang xử lý', done: 'Hoàn tất' };

/* ── Priority labels ── */
export const PRIORITY_LABELS = { high: 'Cao', medium: 'Vừa', low: 'Thấp' };

/* ── Leave status labels ── */
export const LEAVE_STATUS = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };

/* ── Leave request types ── */
export const LEAVE_TYPES = [
  'Nghỉ phép năm', 'Nghỉ ốm', 'Đổi ca', 'Đơn xin đi trễ',
  'Đơn bổ sung công vào/ra', 'Đơn tăng ca', 'Tạm ứng lương',
  'Duyệt tiền mặt', 'Nghỉ việc', 'Nghỉ không lương',
];

/* ── Proposal types ── */
export const PROPOSAL_TYPES = ['Đề xuất ý kiến', 'Duyệt chi PNS', 'Duyệt chi MKT', 'Chi phí vận hành', 'Khác'];

/* ── Chat channels ── */
export const CHANNELS = [
  { id: 'all', name: 'Toàn phòng khám' },
  { id: 'ops', name: 'Vận hành trong ngày' },
  { id: 'mkt', name: 'MKT' },
  { id: 'ns', name: 'Nhân sự' },
  { id: 'kt', name: 'Kế toán' },
  { id: 'dvkh', name: 'DVKH' },
  { id: 'clinical', name: 'BS & Phụ tá' },
  { id: 'facility', name: 'Bảo vệ & Lao công' },
];

/* ── Uniform catalog ── */
export const UNIFORM_CATALOG = [
  { id: 'clinical', matcher: ['bac si', 'bs', 'phu ta'], title: 'Bác sĩ / Phụ tá', items: ['3 bộ crop', '2 áo blue', '1 đôi dép', '1 bảng tên'] },
  { id: 'reception', matcher: ['dvkh', 'le tan', 'cskh'], title: 'Lễ tân / DVKH', items: ['3 bộ đầm liền', 'Note hẹn may đồ', '1 kẹp tóc', '1 đôi dép', '1 bảng tên'] },
  { id: 'default', matcher: [], title: 'Nhân sự khác', items: ['3 bộ đồng phục phòng khám', '1 bảng tên'] },
];

/* ── Recruitment stages ── */
export const RECRUITMENT_STAGES = ['screening', 'interview', 'trial', 'offer', 'onboarding'];
export const RECRUITMENT_STAGE_LABELS = {
  screening: 'Sàng lọc',
  interview: 'Phỏng vấn',
  trial: 'Thử việc',
  offer: 'Offer',
  onboarding: 'Hội nhập',
};

/* ── Incident categories ── */
export const INCIDENT_CATEGORIES = ['Chấm công', 'Tài sản', 'Nội quy', 'CSKH', 'Khác'];

/* ── Asset conditions ── */
export const ASSET_CONDITIONS = {
  good: 'Tốt',
  maintenance: 'Bảo trì',
  missing: 'Thiếu/Mất',
};
