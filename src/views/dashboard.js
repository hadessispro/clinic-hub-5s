import { getAttendance, getAttendanceWorkSummary } from '../services/attendance.js';
import { getEmployees } from '../services/employees.js';
import { getTasks } from '../services/tasks.js';
import { getMarketingLeads, getMarketingReports } from '../services/marketing.js';
import { getLeaveRequests } from '../services/leave.js';
import { getScheduleAssignments } from '../services/schedule.js';
import { BRANCHES } from '../branch.js';
import { SHIFTS } from '../constants.js';
import { todayISO, formatTime, escapeHTML, formatCurrency, attendanceStatusLabel, departmentName } from '../utils.js';
import { pill, metric, statusPill, emptyState } from '../components/shared.js';
import { initMarketingChart, funnelOption, dataClassOption, sourceOption, roleOption, staffOption, resizeMarketingCharts } from '../components/marketing-charts.js';
import { store } from '../store.js';

let dashboardMarketingReport = {};
let dashboardCharts = [];
let dashboardResizeHandler = null;

// Static clinic notes for dashboard reference
const STATIC_NOTES = [
  { id: "n-001", title: "Quy tắc ca", text: "Áp dụng ca làm theo tài liệu 5S - HCM, mỗi check-in cần trước giờ làm ít nhất 5 phút.", owner: "Quản lý vận hành" },
  { id: "n-002", title: "Luồng duyệt", text: "Nghỉ phép và đổi ca cần HR/Quản lý duyệt trước khi tính công.", owner: "Nhân sự" },
  { id: "n-003", title: "Kiểm tra vị trí", text: "Bán kính mặc định 180m quanh phòng khám; quản lý có thể chỉnh trong Báo cáo.", owner: "Admin" },
];

async function safeDashboardLoad(label, operation, fallback = []) {
  try {
    return await operation();
  } catch (error) {
    console.warn(`[Dashboard] Không tải được ${label}:`, error);
    return fallback;
  }
}

function minuteLabel(value) {
  const minutes = Math.max(0, Number(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function leaveStatusLabel(request) {
  if (request.status === 'approved') return ['Đã duyệt', 'good'];
  if (request.status === 'rejected') return ['Đã từ chối', 'bad'];
  if (request.leaderStatus === 'approved') return ['Chờ duyệt cuối', 'warn'];
  return ['Chờ duyệt', 'warn'];
}

function renderWorkDashboard({ state, profile, today, attendance, employees, tasks, requests, workSummary, assignments }) {
  const employeeCode = state.employeeCode || profile.employee_code || '';
  const isDepartmentManager = ['leader', 'phu_ta_truong'].includes(profile.role);
  const isCompanyManager = ['admin', 'hr', 'superadmin'].includes(profile.role);
  const isManager = isDepartmentManager || isCompanyManager;
  const ownAttendance = attendance.filter((row) => row.employee === employeeCode);
  const ownCheckin = ownAttendance.find((row) => row.type === 'checkin');
  const ownCheckout = ownAttendance.find((row) => row.type === 'checkout');
  const ownAssignment = assignments.find((row) => row.employee === employeeCode);
  const shift = SHIFTS.find((row) => row.id === (ownAssignment?.shift || ownCheckin?.shift));
  const activeEmployees = employees.filter((row) => row.status !== 'inactive');
  const checkedInCodes = new Set(attendance.filter((row) => row.type === 'checkin').map((row) => row.employee));
  const openTasks = tasks.filter((row) => row.status !== 'done');
  const pendingRequests = requests.filter((row) => row.status === 'pending');
  const ownTasks = tasks.filter((row) => row.assignee === employeeCode);
  const ownRequests = requests.filter((row) => row.employee === employeeCode);
  const totals = workSummary?.totals || {};
  const attendanceState = ownCheckout ? 'Đã hoàn thành ca' : ownCheckin ? 'Đang trong ca' : 'Chưa vào ca';
  const teamLabel = isCompanyManager ? 'toàn hệ thống' : `bộ phận ${departmentName(profile.department)}`;
  const visibleTasks = isManager ? openTasks : ownTasks.filter((row) => row.status !== 'done');
  const visibleRequests = isManager ? requests : ownRequests;

  return `<div class="view-header">
    <div><p class="eyebrow">Tổng quan công việc</p><h3>${isManager ? `Điều hành ${escapeHTML(teamLabel)}` : `Ngày làm việc của ${escapeHTML(profile.full_name || state.user?.email || 'nhân viên')}`}</h3></div>
    <div class="pill-row">${pill(departmentName(profile.department))}${pill(new Date(`${today}T12:00:00+07:00`).toLocaleDateString('vi-VN'))}</div>
  </div>

  <div class="grid cols-4 dashboard-metric-grid">
    ${isManager
      ? `${metric('Nhân sự đang hoạt động', activeEmployees.length, teamLabel)}${metric('Đã vào ca hôm nay', checkedInCodes.size, `${Math.max(activeEmployees.length - checkedInCodes.size, 0)} người chưa ghi nhận`)}${metric('Công việc đang mở', openTasks.length, `${openTasks.filter((row) => row.status === 'in_progress').length} việc đang thực hiện`)}${metric('Đơn đang chờ duyệt', pendingRequests.length, `${pendingRequests.filter((row) => row.type === 'Đơn tăng ca').length} đơn tăng ca`)}`
      : `${metric('Chấm công hôm nay', attendanceState, ownCheckin ? `Vào ${formatTime(ownCheckin.time)}${ownCheckout ? ` · Ra ${formatTime(ownCheckout.time)}` : ''}` : 'Chưa có lượt vào ca')}${metric('Ngày công tháng này', Number(totals.workdays || 0).toFixed(3).replace(/\.?0+$/, '') || '0', `${minuteLabel(totals.regularMinutes)} công thường`)}${metric('Tăng ca đã duyệt', minuteLabel(totals.overtimeMinutes), `${minuteLabel(totals.payableMinutes)} tổng tính công`)}${metric('Công việc đang mở', visibleTasks.length, `${pendingRequests.length} đơn đang chờ duyệt`)}`}
  </div>

  <div class="grid cols-2" style="margin-top:14px">
    <section class="panel dashboard-section is-attendance">
      <div class="section-title"><div><p class="eyebrow">Chuỗi làm việc</p><h3>${isManager ? 'Chấm công trong ngày' : 'Ca làm việc của tôi'}</h3></div><button class="ghost-button" type="button" data-view-jump="attendance">Xem bảng công</button></div>
      ${isManager ? `<div class="table-wrap"><table><thead><tr><th>Nhân sự</th><th>Phòng ban</th><th>Vào</th><th>Ra</th><th>Chi nhánh</th></tr></thead><tbody>${activeEmployees.slice(0, 12).map((employee) => {
        const rows = attendance.filter((row) => row.employee === employee.id);
        const checkin = rows.find((row) => row.type === 'checkin');
        const checkout = rows.find((row) => row.type === 'checkout');
        return `<tr><td><strong>${escapeHTML(employee.name)}</strong></td><td>${escapeHTML(departmentName(employee.department))}</td><td>${checkin ? formatTime(checkin.time) : '—'}</td><td>${checkout ? formatTime(checkout.time) : '—'}</td><td>${escapeHTML(BRANCHES[checkin?.branchId]?.shortName || '—')}</td></tr>`;
      }).join('') || '<tr><td colspan="5">Chưa có nhân sự trong phạm vi quản lý.</td></tr>'}</tbody></table></div>` : `<div class="dashboard-work-chain">
        <div><span>Ca hôm nay</span><strong>${escapeHTML(shift ? `${shift.name} · ${shift.start}–${shift.end}` : 'Chưa được phân ca')}</strong></div>
        <div><span>Chi nhánh thực tế</span><strong>${escapeHTML(BRANCHES[ownCheckin?.branchId]?.shortName || 'Chưa xác nhận')}</strong></div>
        <div><span>Giờ vào</span><strong>${ownCheckin ? formatTime(ownCheckin.time) : '—'}</strong></div>
        <div><span>Giờ ra</span><strong>${ownCheckout ? formatTime(ownCheckout.time) : '—'}</strong></div>
        <div><span>Đi muộn / về sớm tháng</span><strong>${minuteLabel(totals.lateMinutes)} / ${minuteLabel(totals.earlyLeaveMinutes)}</strong></div>
        <div><span>Cần đối chiếu</span><strong>${Number(totals.incompleteDays || 0)} ngày</strong></div>
      </div>`}
    </section>

    <section class="panel dashboard-section is-tasks">
      <div class="section-title"><div><p class="eyebrow">Công việc</p><h3>${isManager ? 'Việc của bộ phận' : 'Việc được giao cho tôi'}</h3></div><button class="ghost-button" type="button" data-view-jump="tasks">Mở công việc</button></div>
      <div class="dashboard-compact-list">${visibleTasks.slice(0, 7).map((task) => `<article><div><strong>${escapeHTML(task.title || 'Công việc')}</strong><span>${escapeHTML(task.due ? `Hạn ${task.due}` : 'Chưa đặt hạn')} · Tiến độ ${Number(task.progress || 0)}%</span></div>${statusPill(task.status === 'done' ? 'Hoàn thành' : task.status === 'in_progress' ? 'Đang làm' : 'Cần thực hiện', task.status === 'done' ? 'good' : 'warn')}</article>`).join('') || '<div class="attendance-empty"><strong>Chưa có công việc đang mở</strong><span>Công việc mới được giao sẽ xuất hiện tại đây.</span></div>'}</div>
    </section>
  </div>

  <section class="panel dashboard-section is-requests" style="margin-top:14px">
    <div class="section-title"><div><p class="eyebrow">Đơn từ và tăng ca</p><h3>${isManager ? 'Đơn trong phạm vi quản lý' : 'Đơn của tôi'}</h3></div><button class="ghost-button" type="button" data-view-jump="leave">Xem tất cả đơn</button></div>
    <div class="table-wrap"><table><thead><tr><th>Nhân sự</th><th>Loại đơn</th><th>Ngày</th><th>Thời lượng tăng ca</th><th>Trạng thái</th></tr></thead><tbody>${visibleRequests.slice(0, 10).map((request) => {
      const employee = employees.find((row) => row.id === request.employee);
      const [label, tone] = leaveStatusLabel(request);
      return `<tr><td><strong>${escapeHTML(employee?.name || request.employee)}</strong></td><td>${escapeHTML(request.type || 'Đơn từ')}</td><td>${escapeHTML(request.from || '—')}</td><td>${request.type === 'Đơn tăng ca' ? minuteLabel(request.overtimeMinutes) : '—'}</td><td>${statusPill(label, tone)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">Chưa có đơn từ trong phạm vi hiển thị.</td></tr>'}</tbody></table></div>
  </section>`;
}

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const today = todayISO();
  const isMarketingUser = ['admin_marketing', 'support_marketing', 'pg_staff', 'telesale_leader', 'telesale_staff'].includes(profile.role) || profile.department === 'mkt';
  const isManager = ['admin', 'superadmin', 'hr', 'leader', 'phu_ta_truong'].includes(profile.role);
  const employeeCode = state.employeeCode || profile.employee_code || '';
  const [todayAttendance, employees, tasks, requests, workSummary, assignments] = await Promise.all([
    safeDashboardLoad('chấm công hôm nay', () => getAttendance({ date: today })),
    safeDashboardLoad('danh sách nhân sự', () => getEmployees()),
    safeDashboardLoad('công việc', () => getTasks(isManager ? (profile.department && !['admin', 'superadmin', 'hr'].includes(profile.role) ? { department: profile.department } : {}) : { assignee: employeeCode })),
    safeDashboardLoad('đơn từ', () => getLeaveRequests(isManager ? {} : { employee: employeeCode })),
    employeeCode ? safeDashboardLoad('bảng công cá nhân', () => getAttendanceWorkSummary(today.slice(0, 7)), null) : Promise.resolve(null),
    safeDashboardLoad('ca làm hôm nay', () => getScheduleAssignments(today)),
  ]);

  if (!isMarketingUser) {
    return renderWorkDashboard({ state, profile, today, attendance: todayAttendance, employees, tasks, requests, workSummary, assignments });
  }

  const [leads, marketingReport] = await Promise.all([
    safeDashboardLoad('dữ liệu khách hàng', () => getMarketingLeads()),
    ['admin_marketing', 'telesale_leader'].includes(profile.role)
      ? safeDashboardLoad('báo cáo Marketing', () => getMarketingReports(), {}) : Promise.resolve({}),
  ]);

  // Managers receive database aggregates. Other marketing roles retain a
  // restricted, small personal view and never receive department-wide reports.
  const totals = marketingReport.totals || {};
  dashboardMarketingReport = marketingReport;
  const totalLeads = Number(totals.total || leads.length || 0);
  const leadsCountNew = Number(totals.new_count ?? leads.filter((lead) => (lead.status || 'new') === 'new').length);
  const leadsCountContacted = Number(totals.contacted_count ?? leads.filter((lead) => lead.status === 'contacted').length);
  const leadsCountBooked = Number(totals.appointment_count ?? leads.filter((lead) => lead.status === 'appointment_booked').length);
  const leadsCountVisited = Number(totals.visited_count || 0);
  const leadsCountConverted = Number(totals.converted || 0);
  const leadsCountCancelled = Number(totals.cancelled_count || 0);
  const maxFunnelCount = Math.max(totalLeads, 1);
  const funnelData = [
    { label: 'Mới nạp', count: leadsCountNew, color: '#0369a1' },
    { label: 'Đã liên hệ', count: leadsCountContacted, color: '#b45309' },
    { label: 'Đã hẹn khám', count: leadsCountBooked, color: '#15803d' },
    { label: 'Đã đến khám', count: leadsCountVisited, color: '#0f766e' },
    { label: 'Chốt thành công', count: leadsCountConverted, color: '#6b21a8' },
    { label: 'Hủy / thất bại', count: leadsCountCancelled, color: '#dc2626' },
  ];
  const funnelBarChartHtml = `
    <div style="display:grid; gap:11px; padding:4px 0;">
      ${funnelData.map((item) => {
        const percent = Math.round((item.count / maxFunnelCount) * 100);
        return `<div><div style="display:flex;justify-content:space-between;gap:12px;font-size:.84rem;font-weight:700;color:#334155;margin-bottom:5px"><span>${item.label}</span><span>${item.count.toLocaleString('vi-VN')} · ${percent}%</span></div><div style="height:10px;background:#edf2f7;border-radius:999px;overflow:hidden"><div style="width:${percent}%;height:100%;background:${item.color};border-radius:inherit"></div></div></div>`;
      }).join('')}
    </div>`;
  const rawCount = Number(totals.raw_count || 0);
  const netCount = Number(totals.net_count || 0);
  const rawPercent = totalLeads ? Math.round((rawCount / totalLeads) * 100) : 0;
  const sourceRows = (marketingReport.sources || []).slice(0, 6);
  const sourceMax = Math.max(...sourceRows.map((row) => Number(row.total || 0)), 1);
  const roleLabels = {
    admin_marketing: 'Admin Marketing', telesale_leader: 'Quản lý Telesale',
    support_marketing: 'Support Marketing', pg_staff: 'PG thị trường', telesale_staff: 'Telesale',
  };
  const roleColors = { admin_marketing: '#0f766e', telesale_leader: '#2563eb', support_marketing: '#7c3aed', pg_staff: '#d97706', telesale_staff: '#059669' };
  const roleRows = marketingReport.roles || [];
  const isTelesaleLeader = profile.role === 'telesale_leader';

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">${isTelesaleLeader ? 'Telesale Data Center' : 'Marketing Command Center'}</p>
        <h3>${isTelesaleLeader ? 'Tổng quan khách hàng, Data & hiệu suất Telesale' : 'Tổng quan điều hành Marketing & Telesale'}</h3>
      </div>
      <div class="pill-row">
        ${pill(state.settings.clinicName)}
        ${pill(`${totalLeads.toLocaleString('vi-VN')} hồ sơ`)}
        ${pill(`Tỷ lệ chốt: ${Math.round((leadsCountConverted / maxFunnelCount) * 100)}%`)}
        ${['admin_marketing', 'telesale_leader'].includes(profile.role) ? '<button class="primary-button" type="button" data-view-jump="marketing-analytics">Báo cáo chi tiết</button>' : ''}
      </div>
    </div>

    <!-- Marketing KPI Summary Grid -->
    <div class="grid cols-4">
      ${metric("Tổng hồ sơ", totalLeads.toLocaleString('vi-VN'), `${leadsCountNew.toLocaleString('vi-VN')} hồ sơ mới cần xử lý`)}
      ${metric("Đã Liên Hệ Tư Vấn", leadsCountContacted, `Tỷ lệ liên hệ ${Math.round((leadsCountContacted / maxFunnelCount) * 100)}%`)}
      ${metric("Lịch Hẹn Đến Khám", leadsCountBooked, `Tỷ lệ đặt hẹn ${Math.round((leadsCountBooked / maxFunnelCount) * 100)}%`)}
      ${metric("Chốt Thành Công", leadsCountConverted, `Tỷ lệ chuyển đổi ${Math.round((leadsCountConverted / maxFunnelCount) * 100)}%`)}
    </div>

    <div class="grid cols-2" style="margin-top:14px;">
      <section class="panel">
        <div class="section-title">
          <h3 style="margin:0; font-size:1.05rem; font-weight:700;">Hành trình chuyển đổi toàn hệ thống</h3>
          ${pill("Số liệu CSDL")}
        </div>
        <p class="subtle" style="margin:4px 0 14px; font-size:0.82rem; color:#64748b;">Toàn bộ hồ sơ được tổng hợp tại máy chủ, không bị giới hạn 100 dòng hiển thị.</p>
        <div id="overviewFunnelChart" style="height:330px"></div>
      </section>
      <section class="panel">
        <div class="section-title"><h3>Cơ cấu kho dữ liệu</h3>${pill('Thô / Net')}</div>
        <div id="overviewDataClassChart" style="height:330px"></div>
      </section>
    </div>

    ${isTelesaleLeader ? `
      <section class="panel" style="margin-top:14px">
        <div class="section-title"><h3>Phân bổ hồ sơ theo Telesale</h3>${pill(`${marketingReport.telesale?.length || 0} nhân sự`)}</div>
        <p class="subtle" style="margin:4px 0 8px">Khối lượng khách hàng đang được từng Telesale trực tiếp quản lý.</p>
        <div id="overviewTelesaleChart" style="height:340px"></div>
      </section>
    ` : `
      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel">
          <div class="section-title"><h3>Top nguồn tiếp nhận</h3>${pill(`${sourceRows.length} nguồn`)}</div>
          <div id="overviewSourceChart" style="height:320px"></div>
        </section>
        <section class="panel">
          <div class="section-title"><h3>Nhân sự Marketing đang hoạt động</h3>${pill(`${roleRows.reduce((sum, row) => sum + Number(row.total || 0), 0)} người`)}</div>
          <div id="overviewRoleChart" style="height:320px"></div>
        </section>
      </div>
    `}
  `;
}

function renderTimeline(records, employees) {
  if (!records.length) return emptyState();
  
  return records
    .slice(0, 6)
    .map(record => {
      const employee = employees.find(e => e.id === record.employee);
      const label = attendanceStatusLabel(record.status, record.record_type);
      const ngoaiVung = record.status === 'outside';
      const dotColor = ngoaiVung ? 'bad' : '';
      const tone = ngoaiVung ? 'bad' : 'good';
      
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
  if (!document.getElementById('overviewFunnelChart')) return;
  const labels = { admin_marketing: 'Admin Marketing', telesale_leader: 'Quản lý Telesale', support_marketing: 'Support Marketing', pg_staff: 'PG thị trường', telesale_staff: 'Telesale' };
  dashboardCharts = [
    initMarketingChart('overviewFunnelChart', funnelOption(dashboardMarketingReport.totals)),
    initMarketingChart('overviewDataClassChart', dataClassOption(dashboardMarketingReport.totals)),
    initMarketingChart('overviewSourceChart', sourceOption(dashboardMarketingReport.sources || [])),
    initMarketingChart('overviewRoleChart', roleOption(dashboardMarketingReport.roles || [], labels)),
    initMarketingChart('overviewTelesaleChart', staffOption(dashboardMarketingReport.telesale || [])),
  ].filter(Boolean);
  if (dashboardResizeHandler) window.removeEventListener('resize', dashboardResizeHandler);
  dashboardResizeHandler = () => resizeMarketingCharts(dashboardCharts);
  window.addEventListener('resize', dashboardResizeHandler, { passive: true });
}
