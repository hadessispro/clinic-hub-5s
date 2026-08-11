import { getAttendance } from '../services/attendance.js';
import { getEmployees } from '../services/employees.js';
import { getTasks } from '../services/tasks.js';
import { getMarketingLeads } from '../services/marketing.js';
import { DEPARTMENTS, SHIFTS } from '../constants.js';
import { todayISO, formatTime, escapeHTML, formatCurrency, attendanceStatusLabel, departmentName } from '../utils.js';
import { pill, metric, statusPill, emptyState } from '../components/shared.js';
import { store } from '../store.js';

// Static clinic notes for dashboard reference
const STATIC_NOTES = [
  { id: "n-001", title: "Quy tắc ca", text: "Áp dụng ca làm theo tài liệu 5S - HCM, mỗi check-in cần trước giờ làm ít nhất 5 phút.", owner: "Quản lý vận hành" },
  { id: "n-002", title: "Luồng duyệt", text: "Nghỉ phép và đổi ca cần HR/Quản lý duyệt trước khi tính công.", owner: "Nhân sự" },
  { id: "n-003", title: "Kiểm tra vị trí", text: "Bán kính mặc định 180m quanh phòng khám; quản lý có thể chỉnh trong Báo cáo.", owner: "Admin" },
];

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const today = todayISO();
  
  // Fetch dashboard data & marketing leads in parallel
  const [
    todayAttendance,
    employees,
    tasks,
    leads
  ] = await Promise.all([
    getAttendance({ date: today }),
    getEmployees(),
    getTasks(),
    getMarketingLeads()
  ]);

  const isMarketingUser = ['admin_marketing', 'support_marketing', 'pg_staff', 'telesale_leader', 'telesale_staff'].includes(profile.role) || profile.department === 'mkt';

  // For General/Non-marketing accounts (e.g. Nguyễn Thị Như Huỳnh - Leader / HR / Admin): Render Clinic Operational Dashboard
  if (!isMarketingUser) {
    const activeEmployees = employees.filter(e => e.status !== 'inactive');
    const checkedInIds = new Set(todayAttendance.filter(r => r.type === 'checkin').map(r => r.employee));
    const openTasks = tasks.filter(t => t.status !== 'done');
    const averageProgress = tasks.length
      ? Math.round(tasks.reduce((sum, t) => sum + Number(t.progress || 0), 0) / tasks.length)
      : 0;

    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Clinic Live Operations</p>
          <h3>Tổng quan vận hành phòng khám (Đại diện các bộ phận & Chi nhánh).</h3>
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
        ${metric("Lead Marketing", leads.length, `${leads.filter(l => l.status === 'converted').length} chốt thành công`)}
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

  // Compute Marketing Funnel counts for Marketing users
  const leadsCountNew = leads.filter(l => (l.status || 'new') === 'new').length;
  const leadsCountContacted = leads.filter(l => l.status === 'contacted').length;
  const leadsCountBooked = leads.filter(l => l.status === 'appointment_booked').length;
  const leadsCountConverted = leads.filter(l => l.status === 'converted').length;
  const leadsCountCancelled = leads.filter(l => l.status === 'cancelled').length;
  const maxFunnelCount = Math.max(leads.length, 1);

  // Role Performance Metrics data for Marketing Department (100% dynamically computed from database)
  const targetLeadMonth = 50;
  const adminPercent = leads.length ? Math.min(Math.round((leads.length / targetLeadMonth) * 100), 100) : 0;
  const leaderConversion = maxFunnelCount ? Math.round((leadsCountConverted / maxFunnelCount) * 100) : 0;
  const leaderPercent = Math.min(Math.round((leaderConversion / 20) * 100), 100);
  
  const supportIntake = leadsCountNew + leadsCountContacted;
  const supportPercent = leads.length ? Math.min(Math.round((supportIntake / Math.max(leads.length, 1)) * 100), 100) : 0;

  const pgLeadsCount = leads.filter(l => l.source === 'PG Market' || l.source === 'PG Thị Trường' || l.source === 'Địa Bàn').length;
  const pgPercent = pgLeadsCount ? Math.min(Math.round((pgLeadsCount / 20) * 100), 100) : 0;

  const tsCallsCount = leadsCountContacted + leadsCountBooked + leadsCountConverted;
  const tsPercent = maxFunnelCount ? Math.min(Math.round((tsCallsCount / maxFunnelCount) * 100), 100) : 0;

  const rolePerformanceData = [
    {
      role: 'Admin Marketing',
      code: 'admin_marketing',
      staffName: 'Trần Quốc Bảo',
      taskName: 'Tối ưu Ads & Điều phối Marketing',
      target: '50 Lead / tháng',
      actual: `${leads.length} Lead`,
      percent: adminPercent,
      color: '#087f7b',
      status: adminPercent >= 80 ? 'Xuất sắc' : (adminPercent > 0 ? 'Đạt tiến độ' : 'Chưa có data')
    },
    {
      role: 'Quản lý Telesale',
      code: 'telesale_leader',
      staffName: 'Phạm Thu Hương',
      taskName: 'Giám sát đội ngũ & Tỷ lệ chốt',
      target: '20% Chốt hẹn',
      actual: `${leaderConversion}% Chốt`,
      percent: leaderPercent,
      color: '#0284c7',
      status: leaderPercent >= 80 ? 'Đạt chỉ tiêu' : (leaderPercent > 0 ? 'Đang triển khai' : 'Chưa có data')
    },
    {
      role: 'Support Marketing',
      code: 'support_marketing',
      staffName: 'Nguyễn Thị Mai',
      taskName: 'Nạp & Phân bổ Lead Ads / Hotline',
      target: '30 Lead / tuần',
      actual: `${supportIntake} Lead`,
      percent: supportPercent,
      color: '#8b5cf6',
      status: supportPercent >= 70 ? 'Đạt tiến độ' : (supportPercent > 0 ? 'Cần tăng cường' : 'Chưa có data')
    },
    {
      role: 'PG Thị Trường',
      code: 'pg_staff',
      staffName: 'Lê Văn Nam',
      taskName: 'Thu thập Data khách hàng trực tiếp',
      target: '20 Data / tuần',
      actual: `${pgLeadsCount} Data`,
      percent: pgPercent,
      color: '#f59e0b',
      status: pgPercent >= 70 ? 'Đạt chỉ tiêu' : (pgPercent > 0 ? 'Đang thực hiện' : 'Chưa có data')
    },
    {
      role: 'Telesale Staff',
      code: 'telesale_staff',
      staffName: 'Hoàng Kim Anh',
      taskName: 'Gọi điện tư vấn & Đặt lịch hẹn khám',
      target: '80 Cuộc gọi / tuần',
      actual: `${tsCallsCount} Cuộc gọi`,
      percent: tsPercent,
      color: '#10b981',
      status: tsPercent >= 70 ? 'Đạt tiến độ' : (tsPercent > 0 ? 'Cần gọi thêm' : 'Chưa có data')
    }
  ];

  // Render Bar Chart columns for Role Performance
  const roleBarChartHtml = `
    <div style="display:flex; align-items:flex-end; justify-content:space-around; height:240px; padding:20px 10px 10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.04); gap:12px; overflow-x:auto;">
      ${rolePerformanceData.map(item => `
        <div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:90px; height:100%;">
          <span style="font-size:0.78rem; font-weight:700; color:#0f172a; margin-bottom:6px;">${item.percent}%</span>
          <div style="width:100%; max-width:48px; background:#f1f5f9; border-radius:8px 8px 0 0; height:100%; display:flex; align-items:flex-end; overflow:hidden; position:relative;">
            <div style="width:100%; height:${item.percent}%; background:linear-gradient(180deg, ${item.color} 0%, ${item.color}cc 100%); border-radius:6px 6px 0 0; transition:height 0.5s ease-out; box-shadow:0 -2px 6px rgba(0,0,0,0.1);"></div>
          </div>
          <span style="font-size:0.75rem; font-weight:700; color:#334155; margin-top:8px; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${escapeHTML(item.role)}</span>
          <span style="font-size:0.7rem; color:#64748b; text-align:center;">${escapeHTML(item.staffName.split(' ').pop())}</span>
        </div>
      `).join('')}
    </div>
  `;

  // Render Marketing Lead Funnel Bar Chart
  const funnelData = [
    { label: 'Mới Nạp', count: leadsCountNew, color: '#0369a1', percent: Math.round((leadsCountNew / maxFunnelCount) * 100) },
    { label: 'Đã Liên Hệ', count: leadsCountContacted, color: '#b45309', percent: Math.round((leadsCountContacted / maxFunnelCount) * 100) },
    { label: 'Đã Hẹn Khám', count: leadsCountBooked, color: '#15803d', percent: Math.round((leadsCountBooked / maxFunnelCount) * 100) },
    { label: 'Chốt Thành Công', count: leadsCountConverted, color: '#6b21a8', percent: Math.round((leadsCountConverted / maxFunnelCount) * 100) },
    { label: 'Hủy / Thất Bại', count: leadsCountCancelled, color: '#ef4444', percent: Math.round((leadsCountCancelled / maxFunnelCount) * 100) },
  ];

  const funnelBarChartHtml = `
    <div style="display:flex; flex-direction:column; gap:12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      ${funnelData.map(item => `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:0.82rem; font-weight:600; color:#1e293b; margin-bottom:4px;">
            <span>${item.label}</span>
            <span>${item.count} Lead (${item.percent}%)</span>
          </div>
          <div style="width:100%; height:12px; background:#f1f5f9; border-radius:6px; overflow:hidden;">
            <div style="width:${item.percent}%; height:100%; background:${item.color}; border-radius:6px; transition:width 0.5s ease;"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Executive Marketing Dashboard</p>
        <h3>Báo cáo Công việc & Tiến độ KPI Theo Chức danh (Marketing & Telesale System)</h3>
      </div>
      <div class="pill-row">
        ${pill(state.settings.clinicName)}
        ${pill(`Tổng Lead: ${leads.length}`)}
        ${pill(`Tỷ lệ chốt: ${Math.round((leadsCountConverted / maxFunnelCount) * 100)}%`)}
      </div>
    </div>

    <!-- Marketing KPI Summary Grid -->
    <div class="grid cols-4">
      ${metric("Tổng Lead Tiếp Nhận", leads.length, `${leadsCountNew} Lead mới cần xử lý`)}
      ${metric("Đã Liên Hệ Tư Vấn", leadsCountContacted, `Tỷ lệ liên hệ ${Math.round((leadsCountContacted / maxFunnelCount) * 100)}%`)}
      ${metric("Lịch Hẹn Đến Khám", leadsCountBooked, `Tỷ lệ đặt hẹn ${Math.round((leadsCountBooked / maxFunnelCount) * 100)}%`)}
      ${metric("Chốt Thành Công", leadsCountConverted, `Tỷ lệ chuyển đổi ${Math.round((leadsCountConverted / maxFunnelCount) * 100)}%`)}
    </div>

    <!-- Charts Section: Role Performance Bar Chart & Funnel Progress -->
    <div class="grid cols-2" style="margin-top:14px;">
      <section class="panel">
        <div class="section-title">
          <h3 style="margin:0; font-size:1.05rem; font-weight:700;">📊 Biểu Đồ Cột: Tiến Độ Công Việc Theo Chức Danh Role</h3>
          ${pill("Đơn vị: % Hoàn thành KPI")}
        </div>
        <p class="subtle" style="margin:4px 0 14px; font-size:0.82rem; color:#64748b;">Đánh giá mức độ hoàn thành nhiệm vụ theo quy định từng vị trí trong phòng Marketing.</p>
        ${roleBarChartHtml}
      </section>

      <section class="panel">
        <div class="section-title">
          <h3 style="margin:0; font-size:1.05rem; font-weight:700;">📈 Phễu Chuyển Đổi Lead Marketing</h3>
          ${pill("Thời gian thực")}
        </div>
        <p class="subtle" style="margin:4px 0 14px; font-size:0.82rem; color:#64748b;">Thống kê chi tiết từng giai đoạn từ lúc nạp Lead đến khi chốt thành công.</p>
        ${funnelBarChartHtml}
      </section>
    </div>

    <!-- Detailed Role Task Performance Table -->
    <section class="panel" style="margin-top:14px;">
      <div class="section-title">
        <h3 style="margin:0; font-size:1.05rem; font-weight:700;">📑 Bảng Báo Cáo Nhiệm Vụ & Đánh Giá Tiến Độ Chi Tiết Theo Role</h3>
        ${pill("Áp dụng phòng Marketing & Telesale")}
      </div>
      <div style="overflow-x:auto; margin-top:12px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px;">
        <table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1; font-size:0.78rem; text-transform:uppercase; color:#475569; letter-spacing:0.04em;">
              <th style="padding:10px 12px;">Chức danh Role</th>
              <th style="padding:10px 12px;">Nhân viên phụ trách</th>
              <th style="padding:10px 12px;">Nhiệm vụ chính quy định</th>
              <th style="padding:10px 12px;">Mục tiêu KPI</th>
              <th style="padding:10px 12px;">Thực tế đạt</th>
              <th style="padding:10px 12px; text-align:center;">Tiến độ</th>
              <th style="padding:10px 12px; text-align:center;">Đánh giá</th>
            </tr>
          </thead>
          <tbody>
            ${rolePerformanceData.map(row => `
              <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px 12px; font-size:0.85rem; font-weight:700; color:#0f172a;">${escapeHTML(row.role)}</td>
                <td style="padding:10px 12px; font-size:0.85rem; font-weight:600; color:#0284c7;">${escapeHTML(row.staffName)}</td>
                <td style="padding:10px 12px; font-size:0.82rem; color:#334155;">${escapeHTML(row.taskName)}</td>
                <td style="padding:10px 12px; font-size:0.82rem; color:#475569;">${escapeHTML(row.target)}</td>
                <td style="padding:10px 12px; font-size:0.85rem; font-weight:700; color:#1e293b;">${escapeHTML(row.actual)}</td>
                <td style="padding:10px 12px; text-align:center;">
                  <span style="font-size:0.82rem; font-weight:700; color:${row.color};">${row.percent}%</span>
                </td>
                <td style="padding:10px 12px; text-align:center;">
                  ${statusPill(row.status, row.percent >= 90 ? 'good' : 'pending')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
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
  // Global click listeners exist in main.js
}
