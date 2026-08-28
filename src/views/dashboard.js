import { getAttendance } from '../services/attendance.js';
import { getEmployees } from '../services/employees.js';
import { getTasks } from '../services/tasks.js';
import { getMarketingLeads, getMarketingReports } from '../services/marketing.js';
import { DEPARTMENTS, SHIFTS } from '../constants.js';
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

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const today = todayISO();
  
  // Fetch dashboard data & marketing leads in parallel
  const [
    todayAttendance,
    employees,
    tasks,
    leads,
    marketingReport
  ] = await Promise.all([
    getAttendance({ date: today }),
    getEmployees(),
    getTasks(),
    getMarketingLeads(),
    ['admin_marketing', 'telesale_leader'].includes(profile.role)
      ? getMarketingReports().catch(() => ({})) : Promise.resolve({})
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
