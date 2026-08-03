/* ── Departments ── */
export const DEPARTMENTS = [
  { id: 'mkt', name: 'MKT', lead: 'Lan Anh' },
  { id: 'ns', name: 'Nhân sự', lead: 'Minh Hạnh' },
  { id: 'kt', name: 'Kế toán', lead: 'Hoài Nam' },
  { id: 'dvkh', name: 'DVKH', lead: 'Thu Ngân' },
  { id: 'bs', name: 'Bác sĩ', lead: 'BS. Huy' },
  { id: 'phuta', name: 'Phụ tá', lead: 'Ngọc Mai' },
  { id: 'baove', name: 'Bảo vệ', lead: 'Anh Dũng' },
  { id: 'laocong', name: 'Lao công', lead: 'Cô Hoa' },
];

/* ── Shifts ── */
export const SHIFTS = [
  { id: 'clinic-0800', group: 'Chi nhánh Lê Văn Thọ', name: 'Ca 08:00', start: '08:00', end: '17:00', breakText: 'Theo lịch phân công', checkinRule: 'Check-in khi có mặt tại phòng khám lúc 08:00' },
  { id: 'front-office', group: 'Lễ tân, Phụ tá', name: 'Ca hành chính', start: '07:30', end: '17:00', breakText: 'Nghỉ trưa 1 tiếng', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'front-full', group: 'Lễ tân, Phụ tá', name: 'Ca full', start: '07:30', end: '20:00', breakText: 'Nghỉ trưa 1 tiếng', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'front-afternoon', group: 'Lễ tân, Phụ tá', name: 'Ca chiều', start: '09:30', end: '20:00', breakText: 'Theo điều phối phòng khám', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'front-morning', group: 'Lễ tân, Phụ tá', name: 'Ca sáng', start: '07:30', end: '18:00', breakText: 'Theo điều phối phòng khám', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-office', group: 'Bác sĩ', name: 'Ca hành chính', start: '08:00', end: '17:00', breakText: 'Theo lịch khám', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-morning', group: 'Bác sĩ', name: 'Ca sáng', start: '08:00', end: '18:00', breakText: 'Theo lịch khám', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-afternoon', group: 'Bác sĩ', name: 'Ca chiều', start: '10:00', end: '20:00', breakText: 'Theo lịch khám', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'doctor-full', group: 'Bác sĩ', name: 'Ca full', start: '08:00', end: '20:00', breakText: 'Nghỉ 60 phút', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'security-weekday', group: 'Bảo vệ', name: 'Ngày thường', start: '07:00', end: '20:00', breakText: 'Theo bàn giao ca', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'security-sunday', group: 'Bảo vệ', name: 'Chủ nhật', start: '07:00', end: '17:00', breakText: 'Theo bàn giao ca', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'cleaning-weekday', group: 'Tạp vụ', name: 'Ngày thường', start: '06:00', end: '16:00', breakText: 'Nghỉ trưa 11h-12h', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
  { id: 'cleaning-sunday', group: 'Tạp vụ', name: 'Chủ nhật', start: '06:00', end: '15:00', breakText: 'Nghỉ trưa 11h-12h', checkinRule: 'Check-in trước giờ làm ít nhất 5 phút' },
];

/* ── Role profiles ── */
export const ROLE_PROFILES = {
  admin: { label: 'Admin', scope: 'Toàn quyền vận hành, phân luồng tài khoản, duyệt cuối.' },
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
};

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
