/**
 * Payslip HTML Email Generator
 * Produces a responsive, branded HTML email for Nha Khoa 5S payslips.
 */

function formatVND(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 đ';
  return Number(amount).toLocaleString('vi-VN') + ' đ';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate full HTML email content for an employee payslip
 * @param {Object} ps - Payslip data object
 * @returns {string} - Complete HTML document string
 */
export function generatePayslipHtml(ps) {
  const bonusRows = [];

  if (ps.totalDoctorBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Lương hiệu quả Bác sĩ (tư vấn / thủ thuật / chỉnh nha)</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.totalDoctorBonus)}</td></tr>`);
  }
  if (ps.totalCsBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Thưởng CSKH (Check-in/out, Khách tiềm năng, Google review, Voucher)</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.totalCsBonus)}</td></tr>`);
  }
  if (ps.totalMktBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Thưởng Marketing (Hoa hồng dịch vụ, Trực page)</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.totalMktBonus)}</td></tr>`);
  }
  if (ps.deptPerfBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Thưởng hiệu quả kinh doanh phòng ban</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.deptPerfBonus)}</td></tr>`);
  }
  if (ps.diligenceBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Thưởng chuyên cần</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.diligenceBonus)}</td></tr>`);
  }
  if (ps.responsibilityBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Lương trách nhiệm / Kiêm nhiệm</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.responsibilityBonus)}</td></tr>`);
  }
  if (ps.rankBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Phụ cấp bậc / thâm niên</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.rankBonus)}</td></tr>`);
  }
  if (ps.certificateBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Phụ cấp Bằng cấp / CCHN</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.certificateBonus)}</td></tr>`);
  }
  if (ps.motiveBonus > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Thưởng động lực</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.motiveBonus)}</td></tr>`);
  }
  if (ps.assistantSupport > 0) {
    bonusRows.push(`<tr><td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Hỗ trợ phụ tá khi chưa đạt lương đảm bảo</td><td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.assistantSupport)}</td></tr>`);
  }

  const bonusSection = bonusRows.length > 0 ? `
    <div style="margin-top:20px;">
      <h3 style="margin:0 0 8px 0; font-size:14px; font-weight:700; color:#1e293b; text-transform:uppercase; border-left:4px solid #10b981; padding-left:8px;">
        II. THƯỞNG HIỆU QUẢ & PHỤ CẤP
      </h3>
      <table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
        <tbody>
          ${bonusRows.join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phiếu Lương Tháng ${escapeHtml(ps.period)} - ${escapeHtml(ps.name)}</title>
</head>
<body style="margin:0; padding:24px 12px; background-color:#f1f5f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155; line-height:1.5;">
  <div style="max-width:620px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.06); border:1px solid #e2e8f0;">
    
    <!-- BRAND HEADER -->
    <div style="background: linear-gradient(135deg, #0f766e 0%, #047857 100%); color:#ffffff; padding:24px 28px;">
      <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; opacity:0.85; margin-bottom:4px;">CÔNG TY CỔ PHẦN 5S SÀI GÒN</div>
      <h1 style="margin:0; font-size:20px; font-weight:700; letter-spacing:-0.3px;">PHIẾU LƯƠNG THÁNG ${escapeHtml(ps.period)}</h1>
      <div style="font-size:12px; opacity:0.8; margin-top:4px;">68 Nguyễn Huệ, Phường Sài Gòn, TP. Hồ Chí Minh • MST: 0317638465</div>
    </div>

    <!-- EMPLOYEE INFO CARD -->
    <div style="padding:20px 28px; background-color:#f8fafc; border-bottom:1px solid #e2e8f0;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <tr>
          <td style="padding:4px 0; color:#64748b; width:130px;">Họ và tên:</td>
          <td style="padding:4px 0; font-weight:700; color:#0f172a; font-size:14px;">${escapeHtml(ps.name)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0; color:#64748b;">Mã nhân viên (MNV):</td>
          <td style="padding:4px 0; font-weight:600; color:#0284c7;">${escapeHtml(ps.mnv)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0; color:#64748b;">Chức danh / Vị trí:</td>
          <td style="padding:4px 0; font-weight:600; color:#334155;">${escapeHtml(ps.role || 'Nhân viên')} — ${escapeHtml(ps.department)}</td>
        </tr>
        ${ps.bankAccountNumber ? `
        <tr>
          <td style="padding:4px 0; color:#64748b;">Tài khoản nhận:</td>
          <td style="padding:4px 0; font-weight:600; color:#0f766e;">
            ${escapeHtml(ps.bankAccountNumber)} (${escapeHtml(ps.bankName || 'Ngân hàng')} — ${escapeHtml(ps.bankAccountName || ps.name)})
          </td>
        </tr>
        ` : ''}
      </table>
    </div>

    <!-- DETAILS CONTENT -->
    <div style="padding:24px 28px;">

      <!-- SECTION I: TIME & WORK -->
      <div>
        <h3 style="margin:0 0 8px 0; font-size:14px; font-weight:700; color:#1e293b; text-transform:uppercase; border-left:4px solid #0284c7; padding-left:8px;">
          I. LƯƠNG THỜI GIAN & CÔNG TÁC
        </h3>
        <table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
          <tbody>
            <tr>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Mức thu nhập thỏa thuận</td>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; font-weight:600;">${formatVND(ps.agreedIncome)}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Ngày công thực tế / Giờ công</td>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right;">
                ${ps.workDays > 0 ? `<strong>${ps.workDays}</strong> ngày` : ''} 
                ${ps.totalHours > 0 ? `(${ps.totalHours.toFixed(1)} giờ)` : ''}
                ${ps.otHours > 0 ? `• Tăng ca: <strong>${ps.otHours}h</strong>` : ''}
              </td>
            </tr>
            ${ps.leaveDays > 0 ? `
            <tr>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Nghỉ phép hưởng lương</td>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right;">${ps.leaveDays} ngày (còn lại: ${ps.remainingLeave || 0})</td>
            </tr>
            ` : ''}
            <tr style="background:#f8fafc;">
              <td style="padding:9px 12px; font-weight:600; color:#0f172a;">Tổng lương thời gian (A)</td>
              <td style="padding:9px 12px; text-align:right; font-weight:700; color:#0f172a;">${formatVND(ps.totalTimeSalary)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SECTION II: BONUSES & ALLOWANCES -->
      ${bonusSection}

      <!-- SECTION III: TOTAL GROSS -->
      <div style="margin-top:16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; font-size:14px; color:#1e40af;">TỔNG THU NHẬP (Gross)</span>
        <span style="font-weight:800; font-size:16px; color:#1e40af; float:right;">${formatVND(ps.grossIncome)}</span>
        <div style="clear:both;"></div>
      </div>

      <!-- SECTION IV: DEDUCTIONS & ADVANCES -->
      <div style="margin-top:20px;">
        <h3 style="margin:0 0 8px 0; font-size:14px; font-weight:700; color:#1e293b; text-transform:uppercase; border-left:4px solid #ef4444; padding-left:8px;">
          III. CÁC KHOẢN KHẤU TRỪ & TẠM ỨNG
        </h3>
        <table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
          <tbody>
            <tr>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">BHXH - BHYT - BHTN (10.5%)</td>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; color:#dc2626;">${ps.bhxh > 0 ? '-' + formatVND(ps.bhxh) : '0 đ'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Thuế TNCN</td>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; color:#dc2626;">${ps.personalTax > 0 ? '-' + formatVND(ps.personalTax) : '0 đ'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7;">Đã tạm ứng trong tháng</td>
              <td style="padding:8px 12px; border-bottom:1px solid #edf2f7; text-align:right; color:#dc2626;">${ps.advance > 0 ? '-' + formatVND(ps.advance) : '0 đ'}</td>
            </tr>
            <tr style="background:#fff5f5;">
              <td style="padding:9px 12px; font-weight:600; color:#991b1b;">Tổng các khoản trừ</td>
              <td style="padding:9px 12px; text-align:right; font-weight:700; color:#dc2626;">
                -${formatVND(ps.totalDeductions + ps.advance)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- SECTION V: NET SALARY HIGHLIGHT (HERO) -->
      <div style="margin-top:24px; background:linear-gradient(135deg, #059669 0%, #10b981 100%); color:#ffffff; border-radius:10px; padding:20px; text-align:center; box-shadow:0 4px 12px rgba(16,185,129,0.25);">
        <div style="font-size:13px; text-transform:uppercase; letter-spacing:1px; opacity:0.9; margin-bottom:4px; font-weight:600;">LƯƠNG THỰC LÃNH (NET)</div>
        <div style="font-size:30px; font-weight:800; letter-spacing:-0.5px;">${formatVND(ps.netSalary)}</div>
        <div style="font-size:12px; opacity:0.85; margin-top:6px;">Chuyển khoản qua tài khoản ngân hàng đã đăng ký</div>
      </div>

      ${ps.notes ? `
      <div style="margin-top:16px; padding:10px 14px; background:#f8fafc; border-left:3px solid #94a3b8; font-size:12px; color:#475569;">
        <strong>Ghi chú:</strong> ${escapeHtml(ps.notes)}
      </div>
      ` : ''}

    </div>

    <!-- FOOTER / CONFIDENTIALITY -->
    <div style="background:#f8fafc; padding:18px 28px; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b; line-height:1.6;">
      <p style="margin:0 0 6px 0;">
        🔒 <strong>Bảo mật thông tin:</strong> Phiếu lương là thông tin bảo mật giữa người lao động và Công ty CP 5S Sài Gòn. Vui lòng không tiết lộ hoặc chia sẻ dưới mọi hình thức.
      </p>
      <p style="margin:0;">
        💬 Mọi thắc mắc về công lương, xin vui lòng phản hồi về Phòng Hành Chính - Tổng Hợp (HCTH) trong vòng <strong>03 ngày</strong> kể từ khi nhận phiếu lương này.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain-text email version for anti-spam multipart/alternative
 */
export function generatePayslipText(ps) {
  return `
CÔNG TY CỔ PHẦN 5S SÀI GÒN - PHÒNG NHÂN SỰ
PHIẾU LƯƠNG THÁNG ${ps.period}
------------------------------------------------------------
Kính gửi: ${ps.name} (Mã NV: ${ps.mnv})
Chức danh: ${ps.role || 'Nhân viên'} - ${ps.department}
Tài khoản nhận: ${ps.bankAccountNumber || 'Chưa nhập'} (${ps.bankName || 'Ngân hàng'} - ${ps.bankAccountName || ps.name})

THÔNG TIN CHI TIẾT THU NHẬP:
- Lương thỏa thuận: ${formatVND(ps.baseSalary)}
- Ngày công chuẩn: ${ps.standardWorkingDays || 26} ngày
- Ngày công làm việc thực tế: ${ps.actualWorkingDays || 0} ngày
- Lương thời gian thực nhận: ${formatVND(ps.actualTimeSalary)}

TỔNG THU NHẬP (GROSS): ${formatVND(ps.grossIncome)}

CÁC KHOẢN KHẤU TRỪ & TẠM ỨNG:
- BHXH - BHYT - BHTN: ${formatVND(ps.bhxh)}
- Thuế TNCN: ${formatVND(ps.personalTax)}
- Đã tạm ứng: ${formatVND(ps.advance)}
- Tổng các khoản trừ: -${formatVND(ps.totalDeductions + ps.advance)}

------------------------------------------------------------
LƯƠNG THỰC LÃNH (NET): ${formatVND(ps.netSalary)}
------------------------------------------------------------
${ps.notes ? `Ghi chú: ${ps.notes}\n` : ''}
BẢO MẬT THÔNG TIN:
Phiếu lương là thông tin bảo mật giữa người lao động và Công ty CP 5S Sài Gòn.
Mọi thắc mắc về công lương xin vui lòng phản hồi về Phòng Hành chính - Tổng hợp trong vòng 03 ngày kể từ khi nhận phiếu.
`.trim();
}

