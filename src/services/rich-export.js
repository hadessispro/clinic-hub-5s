import { downloadText, formatDate, formatDateTime, formatCurrency, departmentName, escapeHTML } from '../utils.js';
import { getAttendance } from './attendance.js';
import { getEmployees } from './employees.js';
import { getLeaveRequests } from './leave.js';

/**
 * Generates and downloads a Rich Executive Analytics Report (HTML/Excel) with 
 * highlighted KPI numbers, visual status badges, and clickable photo/GPS proof links.
 */
export async function exportRichAnalyticsReport() {
  const [attendance, employees, leaveRequests] = await Promise.all([
    getAttendance().catch(() => []),
    getEmployees().catch(() => []),
    getLeaveRequests().catch(() => []),
  ]);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  // Calculate Key Metrics
  const totalCheckins = attendance.length;
  const validCheckins = attendance.filter(a => a.status === 'valid' || !a.status).length;
  const lateCheckins = attendance.filter(a => a.status === 'late').length;
  const outsideRadius = attendance.filter(a => a.status === 'outside').length;
  const attendanceRate = totalCheckins ? Math.round((validCheckins / totalCheckins) * 100) : 100;

  const totalLeaves = leaveRequests.length;
  const approvedLeaves = leaveRequests.filter(l => l.status === 'approved').length;
  const pendingLeaves = leaveRequests.filter(l => l.status === 'pending').length;
  const rejectedLeaves = leaveRequests.filter(l => l.status === 'rejected').length;

  const totalOvertimeMinutes = leaveRequests.reduce((sum, l) => sum + (Number(l.overtimeMinutes) || 0), 0);
  const totalOvertimeHours = Math.round((totalOvertimeMinutes / 60) * 10) / 10;
  const totalAdvanceAmount = leaveRequests.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const reportDateStr = formatDate(new Date().toISOString());

  // Generate Rich HTML Report
  const htmlContent = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Báo Cáo Phân Tích Dữ Liệu Vận Hành & Chấm Công - Nha Khoa 5S</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; color: #1d2421; margin: 0; padding: 24px; }
    .report-container { max-width: 1200px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    .header { border-bottom: 2px solid #087f7b; padding-bottom: 20px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { color: #055c59; margin: 0 0 6px 0; font-size: 1.8rem; }
    .header p { color: #66736d; margin: 0; font-size: 0.9rem; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi-card { background: #f8fbfa; border: 1px solid #d9e3dd; border-radius: 12px; padding: 18px; text-align: center; }
    .kpi-card.highlight-green { background: #e8f5e9; border-color: #a5d6a7; color: #1b5e20; }
    .kpi-card.highlight-amber { background: #fff3e0; border-color: #ffe0b2; color: #e65100; }
    .kpi-card.highlight-red { background: #ffebee; border-color: #ffcdd2; color: #b71c1c; }
    .kpi-card.highlight-teal { background: #e0f2f1; border-color: #80cbc4; color: #004d40; }
    .kpi-title { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .kpi-value { font-size: 2rem; font-weight: 900; line-height: 1.1; margin-bottom: 4px; }
    .kpi-sub { font-size: 0.78rem; opacity: 0.85; }
    .section-title { font-size: 1.2rem; color: #055c59; margin: 28px 0 14px 0; border-left: 4px solid #087f7b; padding-left: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.86rem; }
    th { background: #087f7b; color: #ffffff; padding: 10px 12px; text-align: left; font-weight: 700; }
    td { padding: 10px 12px; border-bottom: 1px solid #e0e6e3; vertical-align: middle; }
    tr:nth-child(even) { background: #fbfdfc; }
    tr:hover { background: #f0f7f4; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 99px; font-weight: 800; font-size: 0.75rem; text-align: center; }
    .badge-approved { background: #c8e6c9; color: #1b5e20; }
    .badge-pending { background: #ffe0b2; color: #e65100; }
    .badge-rejected { background: #ffcdd2; color: #b71c1c; }
    .badge-valid { background: #e8f5e9; color: #2e7d32; }
    .badge-late { background: #fff3e0; color: #ef6c00; }
    .badge-outside { background: #ffebee; color: #c62828; }
    .btn-link { display: inline-flex; align-items: center; gap: 4px; color: #087f7b; font-weight: 700; text-decoration: none; padding: 4px 8px; border: 1px solid #b2dfdb; border-radius: 6px; background: #e0f2f1; font-size: 0.78rem; }
    .btn-link:hover { background: #b2dfdb; }
    .photo-thumb { width: 42px; height: 42px; border-radius: 6px; object-fit: cover; border: 1px solid #ccc; vertical-align: middle; margin-right: 6px; }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header">
      <div>
        <h1>📊 Báo Cáo Phân Tích Vận Hành & Chấm Công 5S</h1>
        <p>Hệ thống Clinic Hub 5S · Ngày xuất báo cáo: <strong>${reportDateStr}</strong></p>
      </div>
      <div>
        <span class="badge badge-approved" style="font-size:0.9rem;padding:8px 16px;">✓ Dữ liệu chuẩn xác</span>
      </div>
    </div>

    <!-- HIGHLIGHTED NUMERICAL METRICS DASHBOARD -->
    <div class="kpi-grid">
      <div class="kpi-card highlight-green">
        <div class="kpi-title">Tỷ lệ Chấm công Chuẩn</div>
        <div class="kpi-value">${attendanceRate}%</div>
        <div class="kpi-sub">${validCheckins} / ${totalCheckins} lượt hợp lệ</div>
      </div>
      <div class="kpi-card highlight-red">
        <div class="kpi-title">Đi muộn / Ngoài vị trí</div>
        <div class="kpi-value">${lateCheckins + outsideRadius}</div>
        <div class="kpi-sub">${lateCheckins} muộn · ${outsideRadius} ngoài bán kính</div>
      </div>
      <div class="kpi-card highlight-teal">
        <div class="kpi-title">Đơn từ Đã Duyệt</div>
        <div class="kpi-value">${approvedLeaves}</div>
        <div class="kpi-sub">${pendingLeaves} chờ duyệt · ${rejectedLeaves} từ chối</div>
      </div>
      <div class="kpi-card highlight-amber">
        <div class="kpi-title">Tổng Tăng ca & Ứng lương</div>
        <div class="kpi-value">${totalOvertimeHours}h</div>
        <div class="kpi-sub">Ứng: ${formatCurrency(totalAdvanceAmount)}</div>
      </div>
    </div>

    <!-- SECTION 1: NHẬT KÝ CHẤM CÔNG GPS & ẢNH BẰNG CHỨNG -->
    <div class="section-title">📷 Nhật Ký Chấm Công GPS & Ảnh Bằng Chứng (${totalCheckins} lượt)</div>
    <table>
      <thead>
        <tr>
          <th>Nhân sự</th>
          <th>Phòng ban</th>
          <th>Thời gian</th>
          <th>Chi nhánh</th>
          <th>Trạng thái GPS</th>
          <th>Ảnh & Bằng chứng</th>
        </tr>
      </thead>
      <tbody>
        ${attendance.length ? attendance.map(item => {
          const emp = empMap[item.employee] || empMap[item.employeeCode] || { name: item.employeeName || item.employee || 'Nhân viên', department: '' };
          const statusClass = item.status === 'valid' || !item.status ? 'badge-valid' : item.status === 'late' ? 'badge-late' : 'badge-outside';
          const statusLabel = item.status === 'valid' || !item.status ? '✓ Hợp lệ' : item.status === 'late' ? '⏱ Đi muộn' : '📍 Ngoài bán kính';
          const photoUrl = item.photoUrl || item.proofUrl || '';
          const gpsLink = item.lat && item.lng ? `https://www.google.com/maps?q=${item.lat},${item.lng}` : null;
          return `
            <tr>
              <td><strong>${escapeHTML(emp.name)}</strong><br><small style="color:#66736d">${escapeHTML(item.employee || '')}</small></td>
              <td>${escapeHTML(departmentName(emp.department))}</td>
              <td>${formatDateTime(item.timestamp || item.created_at || item.time)}</td>
              <td>${item.branchId === 'le-van-tho' ? 'Lê Văn Thọ' : 'Phạm Văn Chiêu'}</td>
              <td><span class="badge ${statusClass}">${statusLabel}</span> ${item.distance ? `<br><small>${item.distance}m</small>` : ''}</td>
              <td>
                ${photoUrl ? `<a href="${photoUrl}" target="_blank" class="btn-link">📷 Xem Ảnh Check-in</a>` : ''}
                ${gpsLink ? `<a href="${gpsLink}" target="_blank" class="btn-link">📍 Bản đồ GPS</a>` : (!photoUrl && !gpsLink ? '—' : '')}
              </td>
            </tr>
          `;
        }).join('') : '<tr><td colspan="6" style="text-align:center;color:#66736d">Chưa có dữ liệu chấm công.</td></tr>'}
      </tbody>
    </table>

    <!-- SECTION 2: QUẢN LÝ ĐƠN TỪ & NGHỈ PHÉP -->
    <div class="section-title">◇ Danh Sách Đơn Từ & Xem Xét Nổi Bật (${totalLeaves} đơn)</div>
    <table>
      <thead>
        <tr>
          <th>Mã & Nhân sự</th>
          <th>Loại đơn</th>
          <th>Thời gian xin</th>
          <th>Lý do & Số tiền</th>
          <th>Trạng thái duyệt</th>
          <th>Người duyệt</th>
        </tr>
      </thead>
      <tbody>
        ${leaveRequests.length ? leaveRequests.map(item => {
          const emp = empMap[item.employee] || { name: item.employee === 'PVC-IT' ? 'Admin IT' : (item.employee || 'Nhân sự'), department: '' };
          const statusClass = item.status === 'approved' ? 'badge-approved' : item.status === 'rejected' ? 'badge-rejected' : 'badge-pending';
          const statusLabel = item.status === 'approved' ? '✓ Đã duyệt' : item.status === 'rejected' ? '× Từ chối' : '⏱ Chờ duyệt';
          const reviewerEmp = empMap[item.reviewer];
          return `
            <tr>
              <td><strong>${escapeHTML(emp.name)}</strong><br><small style="color:#66736d">${escapeHTML(item.employee)}</small></td>
              <td><strong>${escapeHTML(item.type)}</strong></td>
              <td>${formatDate(item.from)}${item.to && item.to !== item.from ? ` - ${formatDate(item.to)}` : ''}${item.startTime ? `<br><small>${item.startTime}–${item.endTime} (${item.overtimeMinutes}m)</small>` : ''}</td>
              <td>
                ${escapeHTML(item.reason)}
                ${item.amount ? `<br><strong style="color:#087f7b">${formatCurrency(item.amount)}</strong>` : ''}
              </td>
              <td><span class="badge ${statusClass}">${statusLabel}</span></td>
              <td>${reviewerEmp ? escapeHTML(reviewerEmp.name) : (item.reviewer || 'Quản lý / HR')}</td>
            </tr>
          `;
        }).join('') : '<tr><td colspan="6" style="text-align:center;color:#66736d">Chưa có dữ liệu đơn từ.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`;

  // Download HTML Report
  downloadText(`BAO_CAO_PHAN_TICH_5S_${new Date().toISOString().slice(0, 10)}.html`, htmlContent, 'text/html');

  // Also Generate & Download CSV Spreadsheet for Excel Analysis
  const csvHeader = 'Mã NV,Họ Tên,Phòng Ban,Loại Dữ Liệu,Ngày/Thời Gian,Loại Đơn/Trạng Thái,Chi Tiết/Lý Do,Ảnh/GPS Bằng Chứng\n';
  const csvRows = [
    ...attendance.map(a => {
      const emp = empMap[a.employee] || { name: a.employeeName || a.employee || '', department: '' };
      return [
        `"${a.employee || ''}"`,
        `"${emp.name || ''}"`,
        `"${departmentName(emp.department)}"`,
        '"Chấm công GPS"',
        `"${formatDateTime(a.timestamp || a.created_at || a.time)}"`,
        `"${a.status || 'valid'}"`,
        `"${a.distance ? a.distance + 'm' : 'Trong bán kính'}"`,
        `"${a.photoUrl || a.proofUrl || ''}"`
      ].join(',');
    }),
    ...leaveRequests.map(l => {
      const emp = empMap[l.employee] || { name: l.employee === 'PVC-IT' ? 'Admin IT' : (l.employee || ''), department: '' };
      return [
        `"${l.employee || ''}"`,
        `"${emp.name || ''}"`,
        `"${departmentName(emp.department)}"`,
        `"${l.type || 'Đơn từ'}"`,
        `"${formatDate(l.from)}"`,
        `"${l.status || 'pending'}"`,
        `"${String(l.reason || '').replace(/"/g, '""')}"`,
        `"${l.amount ? formatCurrency(l.amount) : ''}"`
      ].join(',');
    })
  ];

  const csvContent = '\uFEFF' + csvHeader + csvRows.join('\n');
  downloadText(`BAO_CAO_DU_LIEU_EXCEL_5S_${new Date().toISOString().slice(0, 10)}.csv`, csvContent, 'text/csv');
}
