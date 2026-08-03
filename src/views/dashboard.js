import { getAttendance } from '../services/attendance.js';
import { getEmployees } from '../services/employees.js';
import { getTasks } from '../services/tasks.js';
import { getLeaveRequests, getSalaryAdvances } from '../services/leave.js';
import { getProposals } from '../services/proposals.js';
import { getRecruitmentList } from '../services/recruitment.js';
import { getScheduleRequests, getScheduleAssignments } from '../services/schedule.js';
import { getPerformanceMetrics } from '../services/reports.js';
import { getIncidents } from '../services/incidents.js';
import { DEPARTMENTS, SHIFTS } from '../constants.js';
import { todayISO, formatTime, escapeHTML, formatCurrency, attendanceStatusLabel, departmentName } from '../utils.js';
import { pill, metric, statusPill, emptyState } from '../components/shared.js';

// Static clinic notes for dashboard reference
const STATIC_NOTES = [
  { id: "n-001", title: "Quy tắc ca", text: "Áp dụng ca làm theo tài liệu 5S - HCM, mỗi check-in cần trước giờ làm ít nhất 5 phút.", owner: "Quản lý vận hành" },
  { id: "n-002", title: "Luồng duyệt", text: "Nghỉ phép và đổi ca cần HR/Quản lý duyệt trước khi tính công.", owner: "Nhân sự" },
  { id: "n-003", title: "Kiểm tra vị trí", text: "Bán kính mặc định 180m quanh phòng khám; quản lý có thể chỉnh trong Báo cáo.", owner: "Admin" },
];

export async function renderView(state) {
  const today = todayISO();
  
  // 1. Fetch all dashboard data in parallel from Supabase
  const [
    todayAttendance,
    employees,
    tasks,
    leaveRequests,
    salaryAdvances,
    proposals,
    recruitmentList,
    scheduleRequests,
    scheduleAssignments,
    performanceMetrics,
    incidents
  ] = await Promise.all([
    getAttendance({ date: today }),
    getEmployees(),
    getTasks(),
    getLeaveRequests(),
    getSalaryAdvances(),
    getProposals(),
    getRecruitmentList(),
    getScheduleRequests(),
    getScheduleAssignments(),
    getPerformanceMetrics(),
    getIncidents()
  ]);

  // 2. Compute live operational metrics
  const activeEmployees = employees.filter(e => e.status !== 'inactive');
  const checkedInIds = new Set(todayAttendance.filter(r => r.type === 'checkin').map(r => r.employee));
  const openTasks = tasks.filter(t => t.status !== 'done');
  
  const averageProgress = tasks.length
    ? Math.round(tasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / tasks.length)
    : 0;
    
  const pendingLeaves = leaveRequests.filter(r => r.status === 'pending');
  const gpsIssues = todayAttendance.filter(r => r.status !== 'valid');
  
  const pendingApprovalsCount = [
    ...recruitmentList.filter(item => item.status === 'pending'),
    ...scheduleRequests.filter(item => item.status === 'pending'),
    ...salaryAdvances.filter(item => item.status === 'pending'),
    ...proposals.filter(item => item.status === 'pending'),
  ].length;
  
  const totalRevenue = performanceMetrics.reduce((sum, item) => sum + Number(item.revenue || 0), 0);
  const openIncidents = incidents.filter(item => item.status !== 'closed');

  // 3. Render dashboard layout HTML
  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Clinic Live Operations</p>
        <h3>Điều phối phòng MKT, NS, KT, DVKH, BS, Phụ tá, Bảo vệ, Lao công trong một màn hình.</h3>
      </div>
      <div class="pill-row">
        ${pill(state.settings.clinicName)}
        ${pill(`${state.settings.allowedRadius}m GPS`)}
        ${pill(`${SHIFTS.length} ca làm`)}
      </div>
    </div>

    <div class="grid cols-4">
      ${metric("Nhân sự hoạt động", activeEmployees.length, `${DEPARTMENTS.length} phòng ban`)}
      ${metric("Đã check-in hôm nay", checkedInIds.size, `${Math.max(activeEmployees.length - checkedInIds.size, 0)} người chưa check-in`)}
      ${metric("Task đang mở", openTasks.length, `Tiến độ trung bình ${averageProgress}%`)}
      ${metric("Đơn nghỉ chờ duyệt", pendingLeaves.length, gpsIssues.length ? `${gpsIssues.length} ca GPS cần xác minh` : "Không có cảnh báo GPS")}
      ${metric("Luồng chờ duyệt", pendingApprovalsCount, "Tuyển dụng, lịch, ứng lương, đề xuất")}
      ${metric("Phân ca làm việc", scheduleAssignments.length, `${scheduleRequests.length} đăng ký lịch`)}
      ${metric("Doanh thu thực tế", formatCurrency(totalRevenue), `Mục tiêu ${formatCurrency(state.settings.revenueTarget)}`)}
      ${metric("Sự vụ chưa đóng", openIncidents.length, "Có hình ảnh/file đính kèm")}
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      <section class="panel">
        <div class="section-title">
          <h3>Dòng chảy trong ngày</h3>
          <button class="ghost-button" type="button" data-view-jump="attendance"><span>⌖</span>Xem chấm công</button>
        </div>
        <div class="timeline">
          ${renderTimeline(todayAttendance, employees)}
        </div>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Ghi chú quản lý</h3>
          <button class="ghost-button" type="button" data-view-jump="reports"><span>▣</span>Chỉnh ghi chú</button>
        </div>
        <p class="subtle" style="margin-bottom: 16px;">${escapeHTML(state.settings.managerNote)}</p>
        <div class="grid cols-1">
          ${STATIC_NOTES.map(note => `
            <article class="schedule-card" style="margin-bottom: 10px;">
              <div class="section-title">
                <h3>${escapeHTML(note.title)}</h3>
                ${pill(note.owner)}
              </div>
              <p class="subtle">${escapeHTML(note.text)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Ca làm theo tài liệu 5S - HCM</h3>
        ${pill("Check-in trước ca 5 phút")}
      </div>
      <div class="grid cols-4" style="margin-top: 10px;">
        ${SHIFTS.slice(0, 4).map(shift => `
          <article class="metric-card">
            <div class="section-title">
              <h3>${escapeHTML(shift.group)}</h3>
              ${pill(shift.name)}
            </div>
            <p class="metric-value" style="font-size:1.45rem">${escapeHTML(shift.start)}-${escapeHTML(shift.end)}</p>
            <p class="subtle">${escapeHTML(shift.breakText)} · ${escapeHTML(shift.checkinRule)}</p>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderTimeline(records, employees) {
  if (!records.length) return emptyState();
  
  return records
    .slice(0, 6)
    .map(record => {
      const employee = employees.find(e => e.id === record.employee);
      const label = attendanceStatusLabel(record.status);
      const dotColor = record.status === 'valid' ? '' : record.status === 'late' ? 'warn' : 'bad';
      const tone = record.status === 'valid' ? 'good' : record.status === 'late' ? 'warn' : 'bad';
      
      return `
        <div class="timeline-item">
          <span class="timeline-dot ${dotColor}"></span>
          <div>
            <strong>${escapeHTML(employee?.name || record.employee || 'Nhân viên')}</strong>
            <p class="subtle">${formatTime(record.time)} · ${escapeHTML(departmentName(employee?.department))} · ${Math.round(record.distance)}m</p>
          </div>
          ${statusPill(label, tone)}
        </div>
      `;
    })
    .join('');
}

export function initView() {
  // Binding static jump actions since they are handled globally, but we can do extra checks here if needed
}
