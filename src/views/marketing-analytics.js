import { getMarketingLeads, getMarketingReports, getTelesaleAccounts } from '../services/marketing.js';
import { getEmployees } from '../services/employees.js';
import { escapeHTML, formatCurrency, oNguoiPhuTrach, tenNguoiPhuTrach } from '../utils.js';
import { pill, statusPill } from '../components/shared.js';
import { store } from '../store.js';
import { navigateTo } from '../router.js';

let cachedLeads = [];
let cachedEmployees = [];
let analyticsSearch = '';
let analyticsBranch = '';
let analyticsPeriod = 'all';

function clinicDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const [loadedLeads, employees, operationalReport, telesaleAccounts] = await Promise.all([
    getMarketingLeads(),
    getEmployees(),
    getMarketingReports(),
    getTelesaleAccounts(),
  ]);
  const now = new Date();
  const periodStart = analyticsPeriod === 'this_week'
    ? new Date(now.getTime() - 7 * 86400000)
    : analyticsPeriod === 'this_month' ? new Date(now.getFullYear(), now.getMonth(), 1) : null;
  const needle = analyticsSearch.trim().toLocaleLowerCase('vi');
  const leads = loadedLeads.filter((lead) => {
    if (analyticsBranch && lead.branch_id !== analyticsBranch) return false;
    if (periodStart && new Date(lead.created_at) < periodStart) return false;
    // Gõ tên telesale hay gõ mã đều ra, giống hệt ô tìm kiếm ở màn Lead.
    const dongTim = `${lead.full_name || ''} ${lead.phone || ''} ${lead.assigned_telesale_name || ''} ${lead.assigned_telesale_id || ''}`;
    if (needle && !dongTim.toLocaleLowerCase('vi').includes(needle)) return false;
    return true;
  });

  cachedLeads = leads;
  cachedEmployees = employees;

  // Tên trước, mã sau. Trước đây hàm này trả `MÃ · Tên`, tức là bắt người
  // đọc lướt qua dãy mã mới tới phần đọc được. Danh bạ tài khoản chỉ dùng khi
  // máy chủ không kèm sẵn tên.
  const formatTelesaleIdentity = (staffCode, staffNameFromServer) => {
    if (!staffCode || staffCode === 'Chưa gán') return 'Chưa gán Telesale';
    const staff = telesaleAccounts.find((item) => item.id === staffCode || item.employee_code === staffCode)
      || employees.find((item) => item.id === staffCode || item.employeeNumber === staffCode);
    const staffName = staffNameFromServer || staff?.name || staff?.full_name || '';
    return tenNguoiPhuTrach(staffName, staffCode, 'Chưa gán Telesale');
  };

  const totalLeads = leads.length;
  const contactedLeads = leads.filter(l => l.status !== 'new').length;
  const appointmentLeads = leads.filter(l => ['appointment_booked', 'visited', 'converted'].includes(l.status)).length;
  const convertedLeads = leads.filter(l => l.status === 'converted').length;
  const lowQualityLeads = leads.filter(l => l.status === 'low_quality').length;

  const contactRate = totalLeads ? Math.round((contactedLeads / totalLeads) * 100) : 0;
  const appointmentRate = totalLeads ? Math.round((appointmentLeads / totalLeads) * 100) : 0;
  const conversionRate = totalLeads ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  // Group leads by Source
  const sourceCounts = {};
  leads.forEach(l => {
    const src = l.source || 'Khác';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });
  const maxSourceCount = Math.max(...Object.values(sourceCounts), 1);

  // Group leads by Assigned Staff (Telesale / PG)
  const staffCounts = {};
  leads.forEach(l => {
    const staff = l.assigned_telesale_id || l.assigned_telesale_code || 'Chưa gán';
    staffCounts[staff] = (staffCounts[staff] || 0) + 1;
  });

  // Color palette for charts
  const chartColors = [
    { bar: 'linear-gradient(180deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%)', label: '#0e7490', bg: '#ecfeff' },
    { bar: 'linear-gradient(180deg, #8b5cf6 0%, #7c3aed 50%, #6d28d9 100%)', label: '#6d28d9', bg: '#f5f3ff' },
    { bar: 'linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #b45309 100%)', label: '#b45309', bg: '#fffbeb' },
    { bar: 'linear-gradient(180deg, #10b981 0%, #059669 50%, #047857 100%)', label: '#047857', bg: '#ecfdf5' },
    { bar: 'linear-gradient(180deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%)', label: '#b91c1c', bg: '#fef2f2' },
    { bar: 'linear-gradient(180deg, #ec4899 0%, #db2777 50%, #be185d 100%)', label: '#be185d', bg: '#fdf2f8' },
    { bar: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)', label: '#1d4ed8', bg: '#eff6ff' },
    { bar: 'linear-gradient(180deg, #14b8a6 0%, #0d9488 50%, #0f766e 100%)', label: '#0f766e', bg: '#f0fdfa' },
  ];

  const sourceKeys = Object.keys(sourceCounts);

  // Premium Source Bar Chart with animated bars
  const sourceChartHtml = `
    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:20px; position:relative;">
      <div style="display:flex; align-items:flex-end; justify-content:center; gap:16px; height:240px; padding-top:20px;">
        ${sourceKeys.map((src, i) => {
          const cnt = sourceCounts[src];
          const pct = Math.max(Math.round((cnt / maxSourceCount) * 100), 8);
          const color = chartColors[i % chartColors.length];
          return `
            <div style="display:flex; flex-direction:column; align-items:center; flex:1; max-width:90px; height:100%; justify-content:flex-end; cursor:pointer;" title="${src}: ${cnt} Lead">
              <div style="background:${color.bg}; color:${color.label}; font-size:0.72rem; font-weight:800; padding:3px 8px; border-radius:10px; margin-bottom:6px; white-space:nowrap;">
                ${cnt}
              </div>
              <div style="width:100%; max-width:48px; background:#f1f5f9; border-radius:10px 10px 4px 4px; height:${pct}%; min-height:20px; position:relative; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06); transition:all 0.4s cubic-bezier(0.34,1.56,0.64,1);">
                <div style="width:100%; height:100%; background:${color.bar}; border-radius:10px 10px 4px 4px; position:relative;">
                  <div style="position:absolute; top:0; left:0; right:0; height:40%; background:linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%); border-radius:10px 10px 0 0;"></div>
                </div>
              </div>
              <span style="font-size:0.68rem; font-weight:700; color:#475569; margin-top:8px; text-align:center; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; width:100%;">${escapeHTML(src)}</span>
            </div>
          `;
        }).join('')}
      </div>
      ${sourceKeys.length === 0 ? '<div style="text-align:center; padding:40px; color:#94a3b8; font-size:0.85rem;">Chưa có dữ liệu Lead</div>' : ''}
    </div>
  `;

  // Staff allocation colors
  const staffColors = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#3b82f6', '#14b8a6'];

  const staffChartHtml = `
    <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:20px;">
      <div style="display:flex; flex-direction:column; gap:14px;">
        ${Object.keys(staffCounts).map((staffCode, i) => {
          const cnt = staffCounts[staffCode];
          const name = formatTelesaleIdentity(staffCode);
          const pct = Math.round((cnt / Math.max(totalLeads, 1)) * 100);
          const barColor = staffColors[i % staffColors.length];
          const initial = name.trim().charAt(0).toUpperCase();
          return `
            <div style="cursor:pointer;" title="${name}: ${cnt} Lead (${pct}%)">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
                <div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg, ${barColor} 0%, ${barColor}cc 100%); color:#fff; font-size:0.72rem; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 2px 6px ${barColor}40;">
                  ${escapeHTML(initial)}
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span style="font-size:0.82rem; font-weight:700; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(name)}</span>
                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                      <span style="font-size:0.75rem; font-weight:800; color:${barColor};">${cnt} Lead</span>
                      <span style="background:${barColor}15; color:${barColor}; font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:10px;">${pct}%</span>
                    </div>
                  </div>
                  <div style="width:100%; height:10px; background:#f1f5f9; border-radius:8px; overflow:hidden; box-shadow:inset 0 1px 2px rgba(0,0,0,0.04);">
                    <div style="width:${Math.max(pct, 3)}%; height:100%; background:linear-gradient(90deg, ${barColor} 0%, ${barColor}bb 100%); border-radius:8px; transition:width 0.6s cubic-bezier(0.34,1.56,0.64,1); position:relative;">
                      <div style="position:absolute; top:0; left:0; right:0; height:50%; background:linear-gradient(180deg, rgba(255,255,255,0.3) 0%, transparent 100%); border-radius:8px 8px 0 0;"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
        ${Object.keys(staffCounts).length === 0 ? '<div style="text-align:center; padding:30px; color:#94a3b8; font-size:0.85rem;">Chưa có dữ liệu phân bổ</div>' : ''}
      </div>
    </div>
  `;

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Marketing & Telesale Analytics</p>
        <h3>Báo cáo Phân tích Dữ liệu Tiếp nhận Lead & Tỷ lệ Chốt Telesale (Kết nối Data CSDL)</h3>
      </div>
      <div class="pill-row">
        ${pill(`Vai trò: ${profile.role || 'Admin'}`)}
        ${pill(`Tổng Lead: ${totalLeads}`)}
      </div>
    </div>

    <!-- Filter Toolbar for Marketing Analytics -->
    <div style="margin-bottom:14px; padding:10px 14px; background:#f1f5f9; border-radius:10px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
      <div style="flex:1; min-width:200px; display:flex; align-items:center;">
        <input id="searchAnalyticsInput" value="${escapeHTML(analyticsSearch)}" placeholder="🔍 Tìm theo Tên hoặc SĐT Lead..." style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; outline:none;" />
      </div>
      <div style="min-width:150px; display:flex; align-items:center;">
        <select id="filterAnalyticsBranch" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer; font-weight:600;">
          <option value="" ${!analyticsBranch ? 'selected' : ''}>Tất cả Chi nhánh</option>
          <option value="le-van-tho" ${analyticsBranch === 'le-van-tho' ? 'selected' : ''}>5S Lê Văn Thọ</option>
          <option value="pham-van-chieu" ${analyticsBranch === 'pham-van-chieu' ? 'selected' : ''}>5S Phạm Văn Chiêu</option>
        </select>
      </div>
      <div style="min-width:150px; display:flex; align-items:center;">
        <select id="filterAnalyticsPeriod" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; cursor:pointer; font-weight:600;">
          <option value="all" ${analyticsPeriod === 'all' ? 'selected' : ''}>Tất cả thời gian</option>
          <option value="this_week" ${analyticsPeriod === 'this_week' ? 'selected' : ''}>Tuần này</option>
          <option value="this_month" ${analyticsPeriod === 'this_month' ? 'selected' : ''}>Tháng này</option>
        </select>
      </div>
    </div>

    <!-- Executive KPI Metric Dashboard -->
    <div class="shift-overview-metrics" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:14px;">
      <div class="metric-card" style="padding:14px; background:#e8f4f1; border-radius:12px; border:1px solid #bce0d6;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="subtle" style="font-size:0.82rem; font-weight:700; color:#23584e;">Tổng Lead tiếp nhận</span>
          <span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center; background:#d2ebd9; border-radius:8px; color:var(--teal-dark); font-size:1.15rem;">
            <i class="ri-user-add-line"></i>
          </span>
        </div>
        <strong style="font-size:1.65rem; color:var(--teal-dark); display:block; margin-top:6px;">${totalLeads}</strong>
      </div>

      <div class="metric-card" style="padding:14px; background:#edf7f4; border-radius:12px; border:1px solid #c8e8df;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="subtle" style="font-size:0.82rem; font-weight:700; color:#23584e;">Tỷ lệ Nghe máy (%)</span>
          <span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center; background:#d4f0e7; border-radius:8px; color:#087f7b; font-size:1.15rem;">
            <i class="ri-phone-line"></i>
          </span>
        </div>
        <strong style="font-size:1.65rem; color:#087f7b; display:block; margin-top:6px;">${contactRate}%</strong>
      </div>

      <div class="metric-card" style="padding:14px; background:#fff7e8; border-radius:12px; border:1px solid #ffe3b3;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="subtle" style="font-size:0.82rem; font-weight:700; color:#8a5300;">Tỷ lệ Hẹn khám (%)</span>
          <span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center; background:#ffeabf; border-radius:8px; color:#b56f00; font-size:1.15rem;">
            <i class="ri-calendar-check-line"></i>
          </span>
        </div>
        <strong style="font-size:1.65rem; color:#b56f00; display:block; margin-top:6px;">${appointmentRate}%</strong>
      </div>

      <div class="metric-card" style="padding:14px; background:#e3f5eb; border-radius:12px; border:1px solid #abdec3;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="subtle" style="font-size:0.82rem; font-weight:700; color:#185c37;">Tỷ lệ Chốt thành công (%)</span>
          <span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center; background:#c5edaa; border-radius:8px; color:#197a44; font-size:1.15rem;">
            <i class="ri-award-line"></i>
          </span>
        </div>
        <strong style="font-size:1.65rem; color:#197a44; display:block; margin-top:6px;">${conversionRate}%</strong>
      </div>

      <div class="metric-card" style="padding:14px; background:#f1f5f9; border-radius:12px; border:1px solid #cbd5e1;">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <span class="subtle" style="font-size:0.82rem; font-weight:700; color:#334155;">Khách không chất lượng (KCL)</span>
          <span style="display:inline-flex; width:32px; height:32px; align-items:center; justify-content:center; background:#e2e8f0; border-radius:8px; color:#475569; font-size:1.15rem;">
            <i class="ri-user-unfollow-line"></i>
          </span>
        </div>
        <strong style="font-size:1.65rem; color:#334155; display:block; margin-top:6px;">${lowQualityLeads}</strong>
      </div>
    </div>

    <!-- SVG Area Line Chart: Lead Trend 7 Days -->
    <section class="panel" style="margin-bottom:14px;">
      <div class="section-title">
        <h3 style="margin:0; font-size:1rem; font-weight:700;">📈 Biểu Đồ Xu Hướng Lead Tiếp Nhận (7 Ngày Gần Nhất)</h3>
        ${pill("Realtime Data")}
      </div>
      <p class="subtle" style="margin:4px 0 14px; font-size:0.8rem; color:#64748b;">Xu hướng Lead nhận được mỗi ngày kết nối từ Database CSDL hệ thống.</p>
      <div id="areaChartContainer" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:20px 16px 12px; position:relative; overflow:hidden;"></div>
    </section>

    <!-- Charts Section: Source Bar Chart & Staff Allocation Chart -->
    <div class="grid cols-2" style="margin-bottom:14px;">
      <section class="panel">
        <div class="section-title">
          <h3 style="margin:0; font-size:1rem; font-weight:700;">📊 Biểu Đồ Cột: Phân Bổ Lead Theo Nguồn Marketing</h3>
          ${pill("Chuẩn Data CSDL")}
        </div>
        <p class="subtle" style="margin:4px 0 12px; font-size:0.8rem; color:#64748b;">Số lượng Lead thu được từ các chiến dịch Quảng cáo Facebook, Google, TikTok, Hotline, PG.</p>
        ${sourceChartHtml}
      </section>

      <section class="panel">
        <div class="section-title">
          <h3 style="margin:0; font-size:1rem; font-weight:700;">👥 Biểu Đồ Cột: Phân Bổ Lead Cho Nhân Sự Dưới Quyền</h3>
          ${pill("Theo Telesale / PG")}
        </div>
        <p class="subtle" style="margin:4px 0 12px; font-size:0.8rem; color:#64748b;">Tỷ lệ phân bổ Lead cho từng nhân viên Telesale & Nhân viên PG Thị trường.</p>
        ${staffChartHtml}
      </section>
    </div>

    <div class="grid cols-2" style="margin-bottom:14px;">
      <section class="panel">
        <div class="section-title"><h3>Hiệu suất nhập data theo PG</h3>${pill(`${operationalReport.pg?.length || 0} tài khoản`)}</div>
        <div class="table-wrap"><table><thead><tr><th>PG</th><th>Tổng</th><th>Thô</th><th>Net cơ bản</th><th>Net chuyên sâu</th></tr></thead><tbody>
          ${operationalReport.pg?.length ? operationalReport.pg.map((row) => `<tr><td><strong>${escapeHTML(row.pg_code)}</strong></td><td>${row.total}</td><td>${row.raw_count}</td><td>${row.net_basic_count}</td><td>${row.net_advanced_count}</td></tr>`).join('') : '<tr><td colspan="5">Chưa có dữ liệu PG.</td></tr>'}
        </tbody></table></div>
      </section>
      <section class="panel">
        <div class="section-title"><h3>Hiệu suất theo tài khoản Telesale</h3>${pill(`${operationalReport.telesale?.length || 0} tài khoản`)}</div>
        <div class="table-wrap"><table><thead><tr><th>Telesale</th><th>Được giao</th><th>Đã gọi</th><th>Hẹn khám</th><th>Chốt</th><th>Khách KCL</th></tr></thead><tbody>
          ${operationalReport.telesale?.length ? operationalReport.telesale.map((row) => `<tr><td>${oNguoiPhuTrach(row.full_name, row.telesale_code, 'Chưa gán Telesale')}</td><td>${row.assigned}</td><td>${row.contacted}</td><td>${row.appointments}</td><td>${row.converted}</td><td>${row.low_quality || 0}</td></tr>`).join('') : '<tr><td colspan="6">Chưa có dữ liệu Telesale.</td></tr>'}
        </tbody></table></div>
      </section>
    </div>

    <!-- Detailed Source Table -->
    <section class="panel">
      <div class="section-title">
        <h3>Bảng Tổng Hợp Chi Tiết Theo Nguồn Quảng Cáo</h3>
        ${pill(`Tổng số: ${totalLeads} lead`)}
      </div>
      <div class="table-wrap" style="overflow-x:auto; margin-top:10px;">
        <table style="width:100%; border-collapse:collapse; text-align:center; font-size:0.85rem;">
          <thead>
            <tr style="background:#eef6f3; color:var(--teal-dark);">
              <th style="padding:10px; text-align:left;">Nguồn tiếp nhận</th>
              <th style="padding:10px;">Số lượng Lead</th>
              <th style="padding:10px;">Tỷ lệ (%)</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(sourceCounts).map(src => {
              const count = sourceCounts[src];
              const pct = totalLeads ? Math.round((count / totalLeads) * 100) : 0;
              return `
                <tr>
                  <td style="padding:10px; border-bottom:1px solid #e1e9e5; text-align:left;"><strong>${escapeHTML(src)}</strong></td>
                  <td style="padding:10px; border-bottom:1px solid #e1e9e5; font-weight:800; color:var(--teal-dark);">${count}</td>
                  <td style="padding:10px; border-bottom:1px solid #e1e9e5; font-weight:700; color:#087f7b;">${pct}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function initView() {
  let searchTimer = null;
  document.getElementById('searchAnalyticsInput')?.addEventListener('input', (event) => {
    analyticsSearch = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => navigateTo('marketing-analytics'), 220);
  });
  document.getElementById('filterAnalyticsBranch')?.addEventListener('change', (event) => {
    analyticsBranch = event.target.value; navigateTo('marketing-analytics');
  });
  document.getElementById('filterAnalyticsPeriod')?.addEventListener('change', (event) => {
    analyticsPeriod = event.target.value; navigateTo('marketing-analytics');
  });

  // Render SVG Area Line Chart
  const container = document.getElementById('areaChartContainer');
  if (!container || !cachedLeads) return;

  const leads = cachedLeads;

  // Build 7-day data
  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const today = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = clinicDateKey(d);
    const dayLabel = dayNames[d.getDay()];
    const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;
    const count = leads.filter(l => {
      if (!l.created_at) return false;
      return l.created_at.startsWith(dateStr);
    }).length;
    days.push({ dateStr, dayLabel, dateLabel, count });
  }

  // Never fabricate operational figures when there is no production data.
  const hasData = days.some(d => d.count > 0);

  const maxVal = Math.max(...days.map(d => d.count), 1);
  const W = 700, H = 280;
  const padL = 45, padR = 20, padT = 30, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Calculate points
  const points = days.map((d, i) => ({
    x: padL + (i / (days.length - 1)) * chartW,
    y: padT + chartH - (d.count / maxVal) * chartH,
    count: d.count,
    label: d.dayLabel,
    dateLabel: d.dateLabel
  }));

  // Smooth curve path (catmull-rom to bezier)
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let path = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return path;
  }

  const linePath = smoothPath(points);
  const areaPath = linePath + ` L ${points[points.length - 1].x},${padT + chartH} L ${points[0].x},${padT + chartH} Z`;

  // Y-axis ticks
  const yTicks = 5;
  let yLines = '';
  let yLabels = '';
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((maxVal / yTicks) * i);
    const y = padT + chartH - (i / yTicks) * chartH;
    yLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>`;
    yLabels += `<text x="${padL - 10}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11" font-weight="600">${val}</text>`;
  }

  // X-axis labels
  let xLabels = '';
  points.forEach(p => {
    xLabels += `<text x="${p.x}" y="${H - 10}" text-anchor="middle" fill="#64748b" font-size="11" font-weight="700">${p.label}</text>`;
    xLabels += `<text x="${p.x}" y="${H - 22}" text-anchor="middle" fill="#94a3b8" font-size="9" font-weight="600">${p.dateLabel}</text>`;
  });

  // Hover dots
  let dots = '';
  points.forEach(p => {
    dots += `
      <g class="chart-hover-dot" style="cursor:pointer;">
        <circle cx="${p.x}" cy="${p.y}" r="14" fill="transparent"/>
        <circle cx="${p.x}" cy="${p.y}" r="5" fill="#ffffff" stroke="#0891b2" stroke-width="2.5" style="transition:all 0.2s ease;"/>
        <g class="chart-tooltip" style="opacity:0; transition:opacity 0.2s ease; pointer-events:none;">
          <rect x="${p.x - 42}" y="${p.y - 42}" width="84" height="30" rx="8" fill="#0f172a" opacity="0.9"/>
          <text x="${p.x}" y="${p.y - 22}" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700">${p.count} Lead</text>
          <polygon points="${p.x - 5},${p.y - 12} ${p.x + 5},${p.y - 12} ${p.x},${p.y - 6}" fill="#0f172a" opacity="0.9"/>
        </g>
      </g>
    `;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; max-height:320px; display:block;">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.35"/>
          <stop offset="50%" stop-color="#06b6d4" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.02"/>
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0891b2"/>
          <stop offset="50%" stop-color="#06b6d4"/>
          <stop offset="100%" stop-color="#22d3ee"/>
        </linearGradient>
        <filter id="lineShadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0891b2" flood-opacity="0.3"/>
        </filter>
      </defs>
      ${yLines}
      ${yLabels}
      ${xLabels}
      <path d="${areaPath}" fill="url(#areaGrad)"/>
      <path d="${linePath}" fill="none" stroke="url(#lineGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" filter="url(#lineShadow)"/>
      ${dots}
    </svg>
    ${!hasData ? '<div style="text-align:center; margin-top:8px; font-size:0.75rem; color:#94a3b8;">Chưa có Lead trong 7 ngày gần nhất.</div>' : ''}
    <style>
      .chart-hover-dot:hover circle:nth-child(2) { r: 7; stroke-width: 3; stroke: #06b6d4; }
      .chart-hover-dot:hover .chart-tooltip { opacity: 1 !important; }
    </style>
  `;
}
