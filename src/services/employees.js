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
  // ── Admin IT (Tài khoản Quản trị Kỹ thuật) ──
  { code: '10001', employee_number: '10001', full_name: 'Admin IT', department: 'it', title: 'Quản trị IT / System Admin', phone: '0901111111', email: 'admin.it@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },

  // ── Ban Giám đốc ──
  { code: '10096', employee_number: '10096', full_name: 'Trần Đức Mạnh', department: 'bgd', title: 'Giám Đốc Vận Hành / BGD', phone: '0909999100', email: 'tran.duc.manh@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },

  // ── Phòng Marketing ──
  { code: '10162', employee_number: '10162', full_name: 'Phan Ngọc Đức', department: 'mkt', title: 'Trưởng Phòng Marketing', phone: '0909162162', email: 'phan.ngoc.duc@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10198', employee_number: '10198', full_name: 'Phạm Minh Phát', department: 'mkt', title: 'Chuyên viên Marketing', phone: '0909198198', email: 'pham.minh.phat@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10222', employee_number: '10222', full_name: 'Nguyễn Thái Yên', department: 'mkt', title: 'Chuyên viên Marketing', phone: '0909222222', email: 'nguyen.thai.yen@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10202', employee_number: '10202', full_name: 'Nguyễn Thị Phương Thủy', department: 'mkt', title: 'Chuyên viên Marketing', phone: '0909202202', email: 'phuong.thuy@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10203', employee_number: '10203', full_name: 'Trác Tự Cường', department: 'mkt', title: 'Chuyên viên Marketing', phone: '0909203203', email: 'trac.tu.cuong@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10234', employee_number: '10234', full_name: 'Ngô Đình Như Ý', department: 'mkt', title: 'Chuyên viên Marketing', phone: '0909234234', email: 'ngo.dinh.nhu.y@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10237', employee_number: '10237', full_name: 'Trần Thị Như Ngọc', department: 'mkt', title: 'Chuyên viên Marketing', phone: '0909237237', email: 'tran.nhu.ngoc@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10251', employee_number: '10251', full_name: 'Nguyễn Cao Hồng Ngọc', department: 'mkt', title: 'Chuyên viên Marketing', phone: '0909251251', email: 'nguyen.hong.ngoc@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10257', employee_number: '10257', full_name: 'Nguyễn Thị Như Ý', department: 'mkt', title: 'Telesale / Marketing', phone: '0909257257', email: 'nguyen.nhu.y@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },

  // ── Phòng Dịch vụ khách hàng (DVKH) ──
  { code: '10196', employee_number: '10196', full_name: 'Nguyễn Thị Vân Anh', department: 'dvkh', title: 'Trưởng Phòng DVKH', phone: '0909196196', email: 'nguyen.van.anh@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10210', employee_number: '10210', full_name: 'Phạm Thị Hoài Thư', department: 'dvkh', title: 'Nhân viên DVKH / Lễ Tân', phone: '0909210210', email: 'pham.hoai.thu@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10225', employee_number: '10225', full_name: 'Võ Thị Hậu', department: 'dvkh', title: 'Nhân viên DVKH', phone: '0909225225', email: 'vo.thi.hau@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10246', employee_number: '10246', full_name: 'Huỳnh Thị Diễm Hương', department: 'dvkh', title: 'Nhân viên DVKH', phone: '0909246246', email: 'huynh.diem.huong@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10255', employee_number: '10255', full_name: 'Nguyễn Thị Thanh Trúc', department: 'dvkh', title: 'Nhân viên DVKH', phone: '0909255255', email: 'nguyen.thanh.truc@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10256', employee_number: '10256', full_name: 'Lê Kha Thy', department: 'dvkh', title: 'Nhân viên DVKH', phone: '0909256256', email: 'le.kha.thy@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10258', employee_number: '10258', full_name: 'Nguyễn Thị Thuỳ Dương', department: 'dvkh', title: 'Nhân viên DVKH', phone: '0909258258', email: 'nguyen.thuy.duong@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },

  // ── Phòng Bác sĩ ──
  { code: '10179', employee_number: '10179', full_name: 'Hoàng Thị Phương Nam', department: 'bs', title: 'Bác sĩ Trưởng Khoa', phone: '0909179179', email: 'hoang.phuong.nam@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10180', employee_number: '10180', full_name: 'Mai Quốc Việt', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909180180', email: 'mai.quoc.viet@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10181', employee_number: '10181', full_name: 'Nguyễn Phương Quỳnh', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909181181', email: 'nguyen.phuong.quynh@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10140', employee_number: '10140', full_name: 'Nguyễn Việt Tân', department: 'bs', title: 'Bác sĩ Chỉnh nha', phone: '0909140140', email: 'nguyen.viet.tan@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10187', employee_number: '10187', full_name: 'Huỳnh Kim Thy', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909187187', email: 'huynh.kim.thy@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10188', employee_number: '10188', full_name: 'Bùi Thị Thanh Thái', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909188188', email: 'bui.thanh.thai@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10241', employee_number: '10241', full_name: 'Trần Văn Nguyên', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909241241', email: 'tran.van.nguyen@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10242', employee_number: '10242', full_name: 'Nguyễn Tuấn Ngọc', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909242242', email: 'nguyen.tuan.ngoc@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10243', employee_number: '10243', full_name: 'Triệu Văn Hoài', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909243243', email: 'trieu.van.hoai@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10244', employee_number: '10244', full_name: 'Lâm Hưng Long', department: 'bs', title: 'Bác sĩ Nha khoa', phone: '0909244244', email: 'lam.hung.long@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },

  // ── Phòng Phụ tá ──
  { code: '10219', employee_number: '10219', full_name: 'Bùi Thiện Chương', department: 'phuta', title: 'Phụ tá Trưởng', phone: '0909219219', email: 'bui.thien.chuong@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10199', employee_number: '10199', full_name: 'Võ Đoàn Thái Tuấn', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909199199', email: 'vo.doan.thai.tuan@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10207', employee_number: '10207', full_name: 'Trần Huỳnh Yến Thư', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909207207', email: 'tran.huynh.yen.thu@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10214', employee_number: '10214', full_name: 'Kim Thị Việt Trinh', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909214214', email: 'kim.viet.trinh@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10216', employee_number: '10216', full_name: 'Nguyễn Thị Như Huỳnh', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909216216', email: 'nguyen.nhu.huynh@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10231', employee_number: '10231', full_name: 'Kiên Thị Ngọc Hương', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909231231', email: 'kien.ngoc.huong@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10232', employee_number: '10232', full_name: 'Nguyễn Kim Quỳnh Quyên', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909232232', email: 'nguyen.quynh.quyen@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10240', employee_number: '10240', full_name: 'Võ Đăng Khang', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909240240', email: 'vo.dang.khang@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10250', employee_number: '10250', full_name: 'Đỗ Thị Yến Linh', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909250250', email: 'do.thi.yen.linh@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10245', employee_number: '10245', full_name: 'Trần Xuân Nhân', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909245245', email: 'tran.xuan.nhan@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10247', employee_number: '10247', full_name: 'Trần Mỹ Phụng', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909247247', email: 'tran.my.phung@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10254', employee_number: '10254', full_name: 'Nguyễn Quốc Huân', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909254254', email: 'nguyen.quoc.huan@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10259', employee_number: '10259', full_name: 'Nguyễn Thị Thu Hà', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909259259', email: 'nguyen.thu.ha@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },
  { code: '10260', employee_number: '10260', full_name: 'Bùi Quang Thái', department: 'phuta', title: 'Phụ tá Nha khoa', phone: '0909260260', email: 'bui.quang.thai@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },

  // ── Phòng HCTH (Hành chính Tổng hợp) ──
  { code: '10249', employee_number: '10249', full_name: 'Nguyễn Thị Thương', department: 'hcth', title: 'Trưởng Phòng HCTH', phone: '0909249249', email: 'nguyen.thi.thuong@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10239', employee_number: '10239', full_name: 'Phạm Thị Thu Trang', department: 'hcth', title: 'Nhân viên HCTH', phone: '0909239239', email: 'pham.thu.trang@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10190', employee_number: '10190', full_name: 'Đỗ Thị Cảnh', department: 'hcth', title: 'Nhân viên Tạp vụ / HCTH', phone: '0909190190', email: 'do.thi.canh@nhakhoa5s.vn', branch_id: 'pham-van-chieu', status: 'active' },
  { code: '10253', employee_number: '10253', full_name: 'Ngô Thị Thanh Thuý', department: 'hcth', title: 'Nhân viên HCTH', phone: '0909253253', email: 'ngo.thanh.thuy@nhakhoa5s.vn', branch_id: 'le-van-tho', status: 'active' },

  // ── Danh sách Trưởng phòng / Leader Mẫu Cũ (Giữ lại song song) ──
  { code: 'PVC-HR01', employee_number: 'PVC-HR01', full_name: 'Minh Hạnh', department: 'hcth', title: 'Trưởng Phòng Nhân Sự / HR Leader', phone: '0909999888', email: 'hanh.minh@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-HR02', employee_number: 'PVC-HR02', full_name: 'Emily', department: 'hcth', title: 'HR Specialist / Chuyên viên HR', phone: '0909123888', email: 'emily.hr@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-MKT01', employee_number: 'PVC-MKT01', full_name: 'Lan Anh', department: 'mkt', title: 'Trưởng Phòng Marketing / MKT Lead', phone: '0901234567', email: 'lananh@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-FIN01', employee_number: 'PVC-FIN01', full_name: 'Hoài Nam', department: 'hcth', title: 'Trưởng Phòng Kế Toán / Finance Leader', phone: '0907777666', email: 'nam.hoai@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-CS01', employee_number: 'PVC-CS01', full_name: 'Thu Ngân', department: 'dvkh', title: 'Trưởng Phòng DVKH & Lễ Tân', phone: '0905555444', email: 'ngan.thu@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-DOC00', employee_number: 'PVC-DOC00', full_name: 'BS. Huy', department: 'bs', title: 'Bác sĩ Trưởng Khoa / Chief Doctor', phone: '0903333222', email: 'huy.bs@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-NUR01', employee_number: 'PVC-NUR01', full_name: 'Ngọc Mai', department: 'phuta', title: 'Phụ tá Trưởng', phone: '0905555555', email: 'mai.ngoc@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-SEC01', employee_number: 'PVC-SEC01', full_name: 'Anh Dũng', department: 'hcth', title: 'Trưởng Đội Bảo Vệ', phone: '0908888777', email: 'dung.anh@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'PVC-CLN01', employee_number: 'PVC-CLN01', full_name: 'Cô Hoa', department: 'hcth', title: 'Trưởng Bộ Phận Tạp Vụ', phone: '0909999000', email: 'hoa.co@nhakhoa5s.com', branch_id: 'pham-van-chieu', status: 'active' },
  { code: 'LVT-DOC01', employee_number: 'LVT-DOC01', full_name: 'BS. Nguyễn Văn Hùng', department: 'bs', title: 'Bác sĩ Trưởng CN Lê Văn Thọ', phone: '0907777111', email: 'hung.bs@nhakhoa5s.com', branch_id: 'le-van-tho', status: 'active' }
];

export async function getEmployees() {
  const officialSeeds = SEED_EMPLOYEES.map(mapEmployeeToUI);
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('code');

    if (!error && data && data.length > 0) {
      const dbMapped = data.map(mapEmployeeToUI);
      const officialNames = new Set(officialSeeds.map(e => e.name.trim().toLowerCase()));
      const officialCodes = new Set(officialSeeds.map(e => e.id));
      
      // Filter DB records so only official employees from company records remain
      const validDbRecords = dbMapped.filter(e => 
        officialCodes.has(e.id) || officialNames.has(e.name.trim().toLowerCase())
      );

      const existingNames = new Set(validDbRecords.map(e => e.name.trim().toLowerCase()));
      const existingCodes = new Set(validDbRecords.map(e => e.id));
      const merged = [...validDbRecords];

      // Append any official seeds missing from DB
      officialSeeds.forEach(seed => {
        const normName = seed.name.trim().toLowerCase();
        if (!existingCodes.has(seed.id) && !existingNames.has(normName)) {
          merged.push(seed);
          existingNames.add(normName);
        }
      });

      return merged;
    }
  } catch (error) {
    console.warn('[Employee Service] getEmployees error, fallback to official list:', error);
  }

  return officialSeeds;
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
