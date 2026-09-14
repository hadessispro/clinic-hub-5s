import { dataClient } from '../data-client.js';
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

export async function getEmployees() {
  try {
    const { data, error } = await dataClient
      .from('employees')
      .select('*')
      .order('code');

    if (error) throw error;
    return data.map(mapEmployeeToUI);
  } catch (error) {
    console.error('[Employee Service] getEmployees error:', error);
    throw error;
  }
}

export async function getEmployeeByCode(code) {
  try {
    const { data, error } = await dataClient
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
    const { data, error } = await dataClient
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
    const targetCode = updates.id || updates.code || code;
    const { data, error } = await dataClient.rpc('update_employee_full', {
      p_old_code: code,
      p_new_code: targetCode,
      p_full_name: updates.name,
      p_phone: updates.phone,
      p_email: updates.email,
      p_department: updates.department,
      p_title: updates.role,
      p_branch_id: updates.branchId,
      p_shift_code: updates.shift,
      p_status: updates.status,
      p_salary_offer: updates.salaryOffer,
      p_hourly_rate: updates.hourlyRate,
      p_manager_code: updates.manager,
      p_certificates: updates.certificates,
      p_hire_date: updates.hireDate,
      p_insurance_date: updates.insuranceDate,
      p_profile_locked: updates.profileLocked,
    });

    if (error) throw error;
    if (data?.employee) {
      return mapEmployeeToUI(data.employee);
    }
    return mapEmployeeToUI(data);
  } catch (error) {
    console.error(`[Employee Service] updateEmployee (${code}) error:`, error);
    throw error;
  }
}

export async function deleteEmployee(code) {
  try {
    const { error } = await dataClient
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
