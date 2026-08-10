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

export async function getEmployees() {
  try {
    const { data, error } = await supabase
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
