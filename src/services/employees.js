import { supabase } from '../supabase.js';
import { defaultShiftForDepartment } from '../constants.js';

/**
 * Maps database employee representation to UI model
 */
export function mapEmployeeToUI(db) {
  if (!db) return null;
  return {
    id: db.code,
    employeeNumber: db.employee_number || '',
    branchId: db.branch_id || 'pham-van-chieu',
    name: db.full_name,
    department: db.department,
    role: db.title,
    shift: db.shift_code || defaultShiftForDepartment(db.department),
    phone: db.phone || '',
    email: db.email || '',
    status: db.status || 'onboarding',
    manager: db.manager_code || 'Tổng vận hành',
    hireDate: db.hire_date || '',
    insuranceDate: db.insurance_date || '',
    salaryOffer: Number(db.salary_offer || 0),
    hourlyRate: Number(db.hourly_rate || 0),
    profileLocked: !!db.profile_locked,
    certificates: db.certificates || [],
    confidentialNotes: db.confidential_notes || '',
  };
}

/**
 * Maps UI employee model to database representation
 */
export function mapEmployeeToDB(ui) {
  return {
    code: ui.id,
    employee_number: ui.employeeNumber || undefined,
    branch_id: ui.branchId || undefined,
    full_name: ui.name,
    department: ui.department,
    title: ui.role,
    phone: ui.phone,
    email: ui.email === undefined ? undefined : (ui.email || null),
    shift_code: ui.shift === undefined ? undefined : (ui.shift || defaultShiftForDepartment(ui.department)),
    status: ui.status,
    manager_code: ui.manager,
    hire_date: ui.hireDate || null,
    insurance_date: ui.insuranceDate || null,
    salary_offer: ui.salaryOffer || 0,
    hourly_rate: ui.hourlyRate || 0,
    profile_locked: !!ui.profileLocked,
    certificates: ui.certificates || [],
    confidential_notes: ui.confidentialNotes || '',
  };
}

const SEED_EMPLOYEES = [
  // 📍 Chi nhánh 1: Phạm Văn Chiêu
  { code: 'PVC-ADM01', full_name: 'Admin IT', department: 'it', title: 'Quản trị IT / System Admin', phone: '0901111111', email: 'admin.it@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-HR01', full_name: 'Minh Hạnh', department: 'ns', title: 'Trưởng Phòng Nhân Sự / HR Leader', phone: '0909999888', email: 'hanh.minh@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-HR02', full_name: 'Emily', department: 'ns', title: 'HR Specialist / Chuyên viên HR', phone: '0909123888', email: 'emily.hr@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-MKT01', full_name: 'Lan Anh', department: 'mkt', title: 'Trưởng Phòng Marketing / MKT Lead', phone: '0901234567', email: 'lananh@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-FIN01', full_name: 'Hoài Nam', department: 'kt', title: 'Trưởng Phòng Kế Toán / Finance Leader', phone: '0907777666', email: 'nam.hoai@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-CS01', full_name: 'Thu Ngân', department: 'dvkh', title: 'Trưởng Phòng DVKH & Lễ Tân', phone: '0905555444', email: 'ngan.thu@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-DOC00', full_name: 'BS. Huy', department: 'bs', title: 'Bác sĩ Trưởng Khoa / Chief Doctor', phone: '0903333222', email: 'huy.bs@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-DOC01', full_name: 'BS. Phạm Minh Tuấn', department: 'bs', title: 'Bác sĩ Chỉnh nha', phone: '0903333333', email: 'tuan.pham@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-TS01', full_name: 'Trần Thị Thu', department: 'mkt', title: 'Quản lý Telesale / Telesale Leader', phone: '0902345678', email: 'thu.tran@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-NUR01', full_name: 'Ngọc Mai', department: 'phuta', title: 'Phụ tá Trưởng', phone: '0905555555', email: 'mai.ngoc@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-NUR02', full_name: 'Thanh Vy', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0906666666', email: 'vy.thanh@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-SEC01', full_name: 'Anh Dũng', department: 'baove', title: 'Trưởng Đội Bảo Vệ', phone: '0908888777', email: 'dung.anh@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-CLN01', full_name: 'Cô Hoa', department: 'laocong', title: 'Trưởng Bộ Phận Tạp Vụ', phone: '0909999000', email: 'hoa.co@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-PG01', full_name: 'Nguyễn Thị Hoa', department: 'mkt', title: 'PG Field Staff', phone: '0904567890', email: 'hoa.nguyen@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },

  // 📍 Chi nhánh 2: Lê Văn Thọ
  { code: 'LVT-DOC01', full_name: 'BS. Nguyễn Văn Hùng', department: 'bs', title: 'Bác sĩ Trưởng CN Lê Văn Thọ', phone: '0907777111', email: 'hung.bs@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
  { code: 'LVT-DOC02', full_name: 'BS. Lê Thị Mai', department: 'bs', title: 'Bác sĩ Phục hình', phone: '0904444444', email: 'mai.le@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
  { code: 'LVT-TS01', full_name: 'Hoàng Kim Anh', department: 'mkt', title: 'Telesale Staff', phone: '0902222333', email: 'anh.kim@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
  { code: 'LVT-TS02', full_name: 'Lê Văn Nam', department: 'mkt', title: 'Telesale Staff', phone: '0903456789', email: 'nam.le@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
  { code: 'LVT-NUR01', full_name: 'Bùi Quang Thái', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0908888999', email: 'thai.bui@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
  { code: 'LVT-NUR02', full_name: 'Võ Đăng Khang', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0907777888', email: 'khang.vo@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
  { code: 'LVT-CS01', full_name: 'Nguyễn Thị Như Ý', department: 'dvkh', title: 'Nhân viên Tư vấn Online', phone: '0905555666', email: 'y.nguyen@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
  { code: 'LVT-CS02', full_name: 'Nguyễn Thị Thanh Trúc', department: 'dvkh', title: 'Nhân viên DVKH', phone: '0904444555', email: 'truc.nguyen@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' },
];

export async function getEmployees() {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('code');

    const dbMapped = (data && !error) ? data.map(mapEmployeeToUI) : [];
    const existingNames = new Set(dbMapped.map(e => e.name.trim().toLowerCase()));
    const existingCodes = new Set(dbMapped.map(e => e.id));
    const merged = [...dbMapped];

    // Always merge SEED_EMPLOYEES management hierarchy so Admin IT and Leaders can drag all team members
    SEED_EMPLOYEES.forEach(seed => {
      const normName = seed.full_name.trim().toLowerCase();
      if (!existingCodes.has(seed.code) && !existingNames.has(normName)) {
        merged.push(mapEmployeeToUI(seed));
        existingNames.add(normName);
      }
    });

    return merged;
  } catch (error) {
    console.warn('[Employee Service] getEmployees error, fallback to seed management list:', error);
    return SEED_EMPLOYEES.map(mapEmployeeToUI);
  }
}

export async function getEmployeeByCode(code) {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;
    return mapEmployeeToUI(data);
  } catch (error) {
    console.error(`[Employee Service] getEmployeeByCode (${code}) error:`, error);
    throw error;
  }
}

export async function createEmployee(employee) {
  try {
    const dbData = mapEmployeeToDB(employee);
    const { data, error } = await supabase
      .from('employees')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;
    return mapEmployeeToUI(data);
  } catch (error) {
    console.error('[Employee Service] createEmployee error:', error);
    throw error;
  }
}

export async function updateEmployee(code, updates) {
  try {
    const dbData = mapEmployeeToDB({ ...updates, id: code });
    // Remove code since it is unique and immutable primary identifier in UI logic
    delete dbData.code;

    const { data, error } = await supabase
      .from('employees')
      .update(dbData)
      .eq('code', code)
      .select()
      .single();

    if (error) throw error;
    return mapEmployeeToUI(data);
  } catch (error) {
    console.error(`[Employee Service] updateEmployee (${code}) error:`, error);
    throw error;
  }
}

export async function deleteEmployee(code) {
  try {
    const { error } = await supabase
      .from('employees')
      .delete()
      .eq('code', code);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error(`[Employee Service] deleteEmployee (${code}) error:`, error);
    throw error;
  }
}
