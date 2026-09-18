/**
 * In-memory Payslip Parser
 * Pure client-side parsing using SheetJS (xlsx).
 * Zero database persistence, zero sensitive data leakage.
 */

function parseNum(val) {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = String(val).replace(/,/g, '').trim();
  const n = Number(clean);
  return isNaN(n) ? 0 : n;
}

function normalizeKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Detect department name from code or section header
 */
function inferDepartment(mnv, sectionDept) {
  const code = String(mnv || '').toUpperCase();
  if (code.startsWith('GD')) return 'Ban Giám Đốc';
  if (code.startsWith('KT')) return 'Phòng Kế Toán';
  if (code.startsWith('HC')) return 'Hành Chính - Tổng Hợp';
  if (code.startsWith('MT') || code.startsWith('MKT')) return 'Phòng Marketing';
  if (code.startsWith('CS')) return 'Dịch Vụ Khách Hàng / Lễ Tân';
  if (code.startsWith('BS')) return 'Phòng Bác Sĩ';
  if (code.startsWith('PT')) return 'Phòng Phụ Tá';
  if (code.startsWith('PG')) return 'Nhân Sự PG';
  if (code.startsWith('BV')) return 'Bảo Vệ';
  return sectionDept || 'Khác';
}

/**
 * Match an employee in Excel with the system employees list to find their email
 */
function findSystemEmail(excelEmp, systemEmployees = []) {
  if (!systemEmployees.length) return '';
  const mnvNorm = normalizeKey(excelEmp.mnv);
  const nameNorm = normalizeKey(excelEmp.name);

  // 1. Match by normalized code
  const byCode = systemEmployees.find((e) => {
    const code = normalizeKey(e.code || e.id);
    return code && (code === mnvNorm || code.includes(mnvNorm) || mnvNorm.includes(code));
  });
  if (byCode?.email) return byCode.email;

  // 2. Match by exact normalized full name
  const byName = systemEmployees.find((e) => {
    const eName = normalizeKey(e.full_name || e.name);
    return eName && eName === nameNorm;
  });
  if (byName?.email) return byName.email;

  // 4. Special IT Admin mapping fallback for test & production
  if (nameNorm.includes('daothaibao') || mnvNorm === 'hc002' || mnvNorm === 'pvcit') {
    return 'thaibaoleo123@gmail.com';
  }

  return '';
}

/**
 * Parse uploaded Excel workbook buffer into structured payslip objects
 * @param {ArrayBuffer} arrayBuffer - Raw file buffer from <input type="file">
 * @param {Array} systemEmployees - Existing employee list from getEmployees()
 * @returns {Promise<{ period: string, count: number, payslips: Array }>}
 */
export async function parsePayrollWorkbook(arrayBuffer, systemEmployees = []) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const sheetName = workbook.SheetNames.includes('BANG LUONG') ? 'BANG LUONG' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error('Không tìm thấy sheet "BANG LUONG" trong file Excel.');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length < 10) {
    throw new Error('Dữ liệu bảng lương không đúng định dạng hoặc quá ít dòng.');
  }

  // Detect Month/Period from title (Row 1-5)
  let period = '08/2026';
  for (let r = 0; r < 6; r++) {
    const rowStr = (rows[r] || []).join(' ');
    const match = rowStr.match(/tháng\s*(\d{1,2})[\s/.-]+(\d{4})/i);
    if (match) {
      period = `${match[1].padStart(2, '0')}/${match[2]}`;
      break;
    }
  }

  const payslips = [];
  let currentSection = 'Ban Giám Đốc';

  for (let r = 8; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const col1 = String(row[1] || '').trim();
    const col2 = String(row[2] || '').trim();

    // Track section headers
    if (col1.startsWith('BAN') || col1.startsWith('PHÒNG')) {
      currentSection = col1;
      continue;
    }

    // Skip summary or non-employee rows
    if (!col1 || col1.startsWith('TỔNG') || col1.startsWith('STT') || !col2) {
      continue;
    }

    const mnv = col1;
    const name = col2;
    const role = String(row[3] || '').trim();
    const department = inferDepartment(mnv, currentSection);

    // Time & Attendance
    const totalHours = parseNum(row[35]);
    const workDays = parseNum(row[36]);
    const leaveDays = parseNum(row[37]);
    const otHours = parseNum(row[39]);
    const remainingLeave = parseNum(row[42]);

    // Income
    const agreedIncome = parseNum(row[43]);
    const timeSalary = parseNum(row[45]);
    const leaveSalary = parseNum(row[46]);
    const otSalary = parseNum(row[48]);
    const totalTimeSalary = parseNum(row[50]) || timeSalary + leaveSalary + otSalary;

    // Doctor Performance
    const doctorConsultBonus = parseNum(row[51]);
    const doctorOrthoBonus = parseNum(row[55]);
    const totalDoctorBonus = parseNum(row[66]);

    // CSKH Performance
    const csCheckinBonus = parseNum(row[67]);
    const csLeadsBonus = parseNum(row[68]);
    const csGoogleBonus = parseNum(row[69]);
    const csVoucherBonus = parseNum(row[70]);
    const totalCsBonus = parseNum(row[72]);

    // Marketing Performance
    const mktRevenueBonus = parseNum(row[73]);
    const mktPageBonus = parseNum(row[74]);
    const totalMktBonus = parseNum(row[78]);

    // General Allowances & Bonuses
    const deptPerfBonus = parseNum(row[79]);
    const diligenceBonus = parseNum(row[80]); // Chuyên cần
    const responsibilityBonus = parseNum(row[81]); // Trách nhiệm
    const rankBonus = parseNum(row[82]); // Bậc
    const certificateBonus = parseNum(row[83]); // CCHN
    const motiveBonus = parseNum(row[84]); // Thưởng động lực
    const assistantSupport = parseNum(row[85]); // Hỗ trợ phụ tá

    // Total gross & deductions
    const grossIncome = parseNum(row[86]);
    const bhxh = parseNum(row[87]);
    const personalTax = parseNum(row[88]);
    const totalDeductions = parseNum(row[89]);
    const advance = parseNum(row[90]); // Tạm ứng
    const netSalary = parseNum(row[91]); // Thực lãnh
    const notes = String(row[92] || '').trim();

    // Bank account
    const bankAccountName = String(row[100] || name).trim().toUpperCase();
    const bankAccountNumber = String(row[101] || '').trim();
    const bankName = String(row[102] || '').trim();

    // Auto-match email
    const email = findSystemEmail({ mnv, name }, systemEmployees);

    payslips.push({
      id: `ps_${mnv}_${r}`,
      mnv,
      name,
      role,
      department,
      period,
      email,
      // Time details
      totalHours,
      workDays,
      leaveDays,
      otHours,
      remainingLeave,
      // Income details
      agreedIncome,
      timeSalary,
      totalTimeSalary,
      // Bonuses
      totalDoctorBonus,
      totalCsBonus,
      csDetails: {
        checkin: csCheckinBonus,
        leads: csLeadsBonus,
        google: csGoogleBonus,
        voucher: csVoucherBonus,
      },
      totalMktBonus,
      mktDetails: {
        revenue: mktRevenueBonus,
        page: mktPageBonus,
      },
      deptPerfBonus,
      diligenceBonus,
      responsibilityBonus,
      rankBonus,
      certificateBonus,
      motiveBonus,
      assistantSupport,
      // Final sums
      grossIncome,
      bhxh,
      personalTax,
      totalDeductions,
      advance,
      netSalary,
      notes,
      // Bank info
      bankAccountName,
      bankAccountNumber,
      bankName,
      // Dispatch status (in-memory)
      status: 'pending', // 'pending' | 'sending' | 'sent' | 'failed'
      errorMsg: '',
      sentAt: null,
    });
  }

  return {
    period,
    count: payslips.length,
    payslips,
  };
}
