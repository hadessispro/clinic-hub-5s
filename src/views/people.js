import { getEmployees, createEmployee, updateEmployee } from '../services/employees.js';
import { DEPARTMENTS, SHIFTS, defaultShiftForDepartment } from '../constants.js';
import { todayISO, addDaysISO, escapeHTML, formatCurrency, formatShortDate, smartMatch, departmentName, splitList, makeId } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let selectedDept = "all";
let selectedPeopleBranch = 'all';
let selectedPeopleStatus = 'all';
let selectedPeopleSearch = '';
let selectedPeopleSearchMode = 'near';
let cachedEmployees = [];

function renderPersonCard(employee, canManageEmployees = false) {
  const initials = employee.name
    .split(" ")
    .map((part) => part[0])
    .slice(-2)
    .join("")
    .toUpperCase();
  const shift = SHIFTS.find(s => s.id === employee.shift);
  return `
    <article class="person-card">
      <span class="avatar">${escapeHTML(initials)}</span>
      <div>
        <h4 style="margin:0 0 6px 0;font-size:0.95rem;line-height:1.3;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
          <span>${escapeHTML(employee.name)}</span>
          <span class="badge" style="font-family:ui-monospace,monospace;font-weight:700;font-size:0.75rem;background:#eff6ff;color:#2563eb;padding:2px 6px;border-radius:4px;">${escapeHTML(employee.id)}</span>
        </h4>
        <div class="person-meta">
          ${pill(departmentName(employee.department))}
          ${pill(employee.role)}
          ${statusPill(employee.status === "active" ? "Đang làm" : (employee.status === "inactive" ? "Đã nghỉ" : "Onboard"), employee.status === "active" ? "good" : (employee.status === "inactive" ? "neutral" : "warn"))}
          ${employee.profileLocked ? statusPill("Hồ sơ khóa", "neutral") : ""}
        </div>
        <p class="subtle">${escapeHTML(employee.phone)} · ${shift ? `${escapeHTML(shift.start)}-${escapeHTML(shift.end)}` : "Chưa gán ca"}</p>
        <p class="subtle">Phụ trách: ${escapeHTML(employee.manager || "Chưa gán")} · BH ${employee.insuranceDate ? formatShortDate(employee.insuranceDate) : "chưa có"}</p>
        <p class="subtle">Offer ${formatCurrency(employee.salaryOffer || 0)} · giờ ${formatCurrency(employee.hourlyRate || 0)}</p>
        <p class="subtle">Chứng chỉ: ${employee.certificates?.length ? escapeHTML(employee.certificates.join(", ")) : "Chưa cập nhật"}</p>
        ${canManageEmployees ? `
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9;">
            <button type="button" class="secondary-button btn-sm" data-action="edit-employee" data-code="${escapeHTML(employee.id)}" style="width:100%;font-size:0.78rem;padding:5px 8px;display:inline-flex;align-items:center;justify-content:center;gap:4px;">
              <i class="ri-edit-line"></i> Sửa hồ sơ / Đổi mã NV
            </button>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const canManageEmployees = ['admin', 'hr', 'superadmin'].includes(profile.role);
  const marketingScoped = ['admin_marketing', 'support_marketing', 'telesale_leader', 'telesale_staff', 'pg_staff'].includes(profile.role);
  const availableDepartments = marketingScoped ? DEPARTMENTS.filter((department) => department.id === 'mkt') : DEPARTMENTS;
  if (marketingScoped && selectedDept === 'all') {
    selectedDept = 'mkt';
  }

  const { searchTerm } = state;
  const employees = await getEmployees();
  cachedEmployees = employees;

  // Filter employees based on department and search term
  const filteredEmployees = employees.filter((employee) => {
    const deptMatch = selectedDept === "all" || employee.department === selectedDept;
    const branchMatch = selectedPeopleBranch === 'all' || employee.branchId === selectedPeopleBranch;
    const statusMatch = selectedPeopleStatus === 'all' || employee.status === selectedPeopleStatus;
    const activeSearch = selectedPeopleSearch || searchTerm;
    if (!activeSearch) return deptMatch && branchMatch && statusMatch;
    return deptMatch && branchMatch && statusMatch && smartMatch(
      `${employee.id} ${employee.name} ${employee.role} ${employee.phone} ${employee.email} ${departmentName(employee.department)} ${employee.certificates?.join(" ") || ""}`,
      activeSearch,
      selectedPeopleSearchMode
    );
  });

function renderEmployeeEditModal(availableDepartments) {
  return `
    <div class="attendance-adjust-dialog" id="employeeEditModal" hidden>
      <button class="attendance-adjust-backdrop" type="button" data-action="close-edit-employee-modal" aria-label="Đóng"></button>
      <section class="attendance-adjust-sheet" role="dialog" aria-modal="true" aria-labelledby="employeeEditDialogTitle" style="max-width:680px;">
        <div class="attendance-adjust-header">
          <div>
            <p class="eyebrow">Hồ sơ nhân sự</p>
            <h2 id="employeeEditDialogTitle" style="margin:0;font-size:1.15rem;">Sửa thông tin &amp; Đổi mã nhân viên</h2>
          </div>
          <button class="icon-button" type="button" data-action="close-edit-employee-modal" aria-label="Đóng"><i class="ri-close-line"></i></button>
        </div>

        <form id="employeeEditForm">
          <input type="hidden" id="editEmployeeOriginalCode" name="originalCode">
          
          <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:0.82rem; color:#1e40af; line-height:1.45;">
            <strong><i class="ri-shield-check-line"></i> Cơ chế an toàn khi đổi mã nhân viên:</strong> Hệ thống tự động liên kết và đồng bộ toàn bộ bảng phân ca, dữ liệu chấm công, đơn nghỉ phép và tài khoản đăng nhập. Mã nhân viên cũ sẽ được lưu song song trong hệ thống để nhân sự vẫn có thể đăng nhập bằng mã cũ hoặc mã mới mà không bao giờ bị khóa tài khoản đột ngột.
          </div>

          <div class="attendance-adjust-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <label>
              <span>Mã nhân viên (MNV) *</span>
              <input id="editEmployeeCode" name="code" required pattern="[A-Za-z0-9_.-]+" placeholder="VD: GD001, CS001.PVC, BS001.LVT" />
              <small class="subtle" style="display:block;font-size:0.75rem;margin-top:2px;">Chỉ gồm chữ, số, gạch nối hoặc dấu chấm.</small>
            </label>
            <label>
              <span>Họ và tên *</span>
              <input id="editEmployeeName" name="name" required placeholder="VD: Nguyễn Văn A" />
            </label>
            <label>
              <span>Số điện thoại *</span>
              <input id="editEmployeePhone" name="phone" required placeholder="VD: 0901 234 567" />
            </label>
            <label>
              <span>Email</span>
              <input id="editEmployeeEmail" name="email" type="email" placeholder="ten@nhakhoa5s.vn" />
            </label>
            <label>
              <span>Phòng ban *</span>
              <select id="editEmployeeDepartment" name="department">
                ${availableDepartments.map(dept => option(dept.id, dept.name)).join('')}
              </select>
            </label>
            <label>
              <span>Chức danh *</span>
              <input id="editEmployeeRole" name="role" required placeholder="VD: Phụ tá, Bác sĩ" />
            </label>
            <label>
              <span>Chi nhánh *</span>
              <select id="editEmployeeBranch" name="branchId">
                <option value="pham-van-chieu">5S Phạm Văn Chiêu</option>
                <option value="le-van-tho">5S Lê Văn Thọ</option>
              </select>
            </label>
            <label>
              <span>Ca mặc định</span>
              <select id="editEmployeeShift" name="shift">
                ${SHIFTS.map(shift => option(shift.id, `${shift.group} / ${shift.name} (${shift.start}-${shift.end})`)).join('')}
              </select>
            </label>
            <label>
              <span>Trạng thái</span>
              <select id="editEmployeeStatus" name="status">
                <option value="active">Đang làm</option>
                <option value="onboarding">Đang onboard</option>
                <option value="inactive">Đã nghỉ</option>
              </select>
            </label>
            <label>
              <span>Người phụ trách</span>
              <input id="editEmployeeManager" name="manager" placeholder="VD: Trưởng bộ phận / HR" />
            </label>
            <label>
              <span>Ngày vào làm</span>
              <input id="editEmployeeHireDate" name="hireDate" type="date" />
            </label>
            <label>
              <span>Ngày đóng BH</span>
              <input id="editEmployeeInsuranceDate" name="insuranceDate" type="date" />
            </label>
            <label>
              <span>Mức offer</span>
              <input id="editEmployeeSalaryOffer" name="salaryOffer" type="number" min="0" />
            </label>
            <label>
              <span>Lương theo giờ</span>
              <input id="editEmployeeHourlyRate" name="hourlyRate" type="number" min="0" />
            </label>
            <label class="full" style="grid-column: 1 / -1;">
              <span>Khóa hồ sơ bảo mật</span>
              <select id="editEmployeeProfileLocked" name="profileLocked">
                <option value="false">Không khóa (Bình thường)</option>
                <option value="true">Khóa hồ sơ bảo mật</option>
              </select>
            </label>
            <label class="full" style="grid-column: 1 / -1;">
              <span>Bằng cấp / chứng chỉ</span>
              <textarea id="editEmployeeCertificates" name="certificates" rows="2" placeholder="VD: Chứng chỉ hành nghề RHM, Implant cơ bản, PCCC cơ sở"></textarea>
            </label>
          </div>

          <div class="attendance-adjust-actions" style="margin-top:18px; display:flex; justify-content:flex-end; gap:8px;">
            <button class="secondary-button" type="button" data-action="close-edit-employee-modal">Hủy</button>
            <button class="primary-button" type="submit" id="editEmployeeSubmitBtn"><i class="ri-save-3-line"></i> Lưu thay đổi</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

  const rosterRows = filteredEmployees.map((employee) => {
    const shift = SHIFTS.find(s => s.id === employee.shift);
    return `
      <tr>
        <td><code style="font-weight:700; color:#2563eb; font-size:0.85rem;">${escapeHTML(employee.id)}</code></td>
        <td><strong>${escapeHTML(employee.name)}</strong><br><span class="subtle">${escapeHTML(employee.phone)}</span></td>
        <td>${escapeHTML(departmentName(employee.department))}</td>
        <td>${escapeHTML(employee.role)}</td>
        <td>${shift ? `${escapeHTML(shift.start)}-${escapeHTML(shift.end)}` : "Chưa gán"}</td>
        <td>${statusPill(employee.status === "active" ? "Đang làm" : (employee.status === "inactive" ? "Đã nghỉ" : "Đang onboard"), employee.status === "active" ? "good" : (employee.status === "inactive" ? "neutral" : "warn"))}</td>
        ${canManageEmployees ? `<td><button type="button" class="secondary-button btn-sm" data-action="edit-employee" data-code="${escapeHTML(employee.id)}" style="padding:4px 8px; font-size:0.75rem; white-space:nowrap;"><i class="ri-edit-line"></i> Sửa</button></td>` : ''}
      </tr>
    `;
  }).join("");

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">People operations</p>
        <h3>Quản lý hồ sơ nhân sự, phòng ban, ca làm và tình trạng vận hành mỗi ngày.</h3>
      </div>
    </div>

    ${canManageEmployees ? `<section class="panel">
      <div class="section-title">
        <h3>Thêm nhân sự</h3>
        ${pill("Gán ca ngay khi tạo")}
      </div>
      <form class="form-grid three" data-form="employee" id="employeeForm">
        <div class="form-field">
          <label for="employeeName">Họ tên *</label>
          <input id="employeeName" name="name" required placeholder="VD: Nguyễn Văn A" />
        </div>
        <div class="form-field">
          <label for="employeeCode">Mã nhân viên</label>
          <input id="employeeCode" name="code" placeholder="Để trống tự sinh (VD: PVC-10260)" />
        </div>
        <div class="form-field">
          <label for="employeeBranch">Chi nhánh *</label>
          <select id="employeeBranch" name="branchId">
            <option value="pham-van-chieu">5S Phạm Văn Chiêu</option>
            <option value="le-van-tho">5S Lê Văn Thọ</option>
          </select>
        </div>
        <div class="form-field">
          <label for="employeeDepartment">Phòng ban *</label>
          <select id="employeeDepartment" name="department">
            ${availableDepartments.map(dept => option(dept.id, dept.name)).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="employeeRole">Chức danh *</label>
          <input id="employeeRole" name="role" required placeholder="VD: Phụ tá" />
        </div>
        <div class="form-field">
          <label for="employeeShift">Ca mặc định</label>
          <select id="employeeShift" name="shift">
            ${SHIFTS.map(shift => option(shift.id, `${shift.group} / ${shift.name} (${shift.start}-${shift.end})`)).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="employeePhone">Số điện thoại *</label>
          <input id="employeePhone" name="phone" required placeholder="VD: 0901 234 567" />
        </div>
        <div class="form-field">
          <label for="employeeEmail">Email</label>
          <input id="employeeEmail" name="email" type="email" placeholder="ten@nhakhoa5s.vn" />
        </div>
        <div class="form-field">
          <label for="employeeManager">Người phụ trách</label>
          <input id="employeeManager" name="manager" placeholder="VD: Trưởng bộ phận / HR" />
        </div>
        <div class="form-field">
          <label for="employeeHireDate">Ngày vào làm</label>
          <input id="employeeHireDate" name="hireDate" type="date" value="${todayISO()}" />
        </div>
        <div class="form-field">
          <label for="employeeInsuranceDate">Ngày đóng bảo hiểm</label>
          <input id="employeeInsuranceDate" name="insuranceDate" type="date" value="${addDaysISO(60)}" />
        </div>
        <div class="form-field">
          <label for="employeeSalaryOffer">Mức offer</label>
          <input id="employeeSalaryOffer" name="salaryOffer" type="number" min="0" value="0" />
        </div>
        <div class="form-field">
          <label for="employeeHourlyRate">Lương theo giờ</label>
          <input id="employeeHourlyRate" name="hourlyRate" type="number" min="0" value="0" />
        </div>
        <div class="form-field">
          <label for="employeeStatus">Trạng thái</label>
          <select id="employeeStatus" name="status">
            <option value="active">Đang làm</option>
            <option value="onboarding">Đang onboard</option>
          </select>
        </div>
        <div class="form-field">
          <label for="employeeProfileLocked">Khóa hồ sơ bảo mật</label>
          <select id="employeeProfileLocked" name="profileLocked">
            <option value="false">Không</option>
            <option value="true">Có</option>
          </select>
        </div>
        <div class="form-field full">
          <label for="employeeCertificates">Bằng cấp / chứng chỉ</label>
          <textarea id="employeeCertificates" name="certificates" placeholder="VD: Chứng chỉ hành nghề RHM, Implant cơ bản, PCCC cơ sở"></textarea>
        </div>
        <div class="form-field full">
          <button class="primary-button" type="submit"><span>+</span>Thêm nhân sự</button>
        </div>
      </form>
    </section>` : ''}

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Danh bạ</h3>
        <span class="subtle">${filteredEmployees.length} nhân sự</span>
      </div>
      <div class="operation-filterbar people-controls">
        <label class="is-search">Tìm thông minh<input type="search" id="peopleSearchFilter" value="${escapeHTML(selectedPeopleSearch)}" placeholder="Gõ gần đúng tên, MNV, email hoặc số điện thoại" autocomplete="off"></label>
        <label>Kiểu dò<select id="peopleSearchMode"><option value="near" ${selectedPeopleSearchMode === 'near' ? 'selected' : ''}>Gần đúng, bỏ dấu</option><option value="exact" ${selectedPeopleSearchMode === 'exact' ? 'selected' : ''}>Đúng cụm từ</option></select></label>
        <label>Phòng ban<select data-action="people-filter" id="peopleFilter">
          <option value="all"${selectedDept === "all" ? " selected" : ""}>Tất cả phòng ban</option>
          ${availableDepartments.map((dept) => option(dept.id, dept.name, selectedDept === dept.id)).join("")}
        </select></label>
        <label>Chi nhánh<select id="peopleBranchFilter"><option value="all">Cả hai chi nhánh</option><option value="le-van-tho" ${selectedPeopleBranch === 'le-van-tho' ? 'selected' : ''}>Lê Văn Thọ</option><option value="pham-van-chieu" ${selectedPeopleBranch === 'pham-van-chieu' ? 'selected' : ''}>Phạm Văn Chiêu</option></select></label>
        <label>Trạng thái<select id="peopleStatusFilter"><option value="all">Tất cả trạng thái</option><option value="active" ${selectedPeopleStatus === 'active' ? 'selected' : ''}>Đang làm</option><option value="onboarding" ${selectedPeopleStatus === 'onboarding' ? 'selected' : ''}>Đang onboard</option><option value="inactive" ${selectedPeopleStatus === 'inactive' ? 'selected' : ''}>Đã nghỉ</option></select></label>
        <button class="secondary-button" type="button" id="clearPeopleFilters">Xóa bộ lọc</button>
      </div>
      <div class="grid cols-4">
        ${filteredEmployees.map((emp) => renderPersonCard(emp, canManageEmployees)).join("")}
      </div>
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Bảng phân ca</h3>
        ${pill("Theo tài liệu giờ làm")}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã NV</th>
              <th>Nhân sự</th>
              <th>Phòng ban</th>
              <th>Chức danh</th>
              <th>Ca mặc định</th>
              <th>Trạng thái</th>
              ${canManageEmployees ? '<th>Thao tác</th>' : ''}
            </tr>
          </thead>
          <tbody>${rosterRows}</tbody>
        </table>
      </div>
    </section>

    ${canManageEmployees ? renderEmployeeEditModal(availableDepartments) : ''}
  `;
}

export function initView() {
  document.getElementById('peopleSearchFilter')?.addEventListener('input', (event) => {
    selectedPeopleSearch = event.target.value;
    window.clearTimeout(event.target._peopleFilterTimer);
    event.target._peopleFilterTimer = window.setTimeout(() => store.notify(), 180);
  });
  document.getElementById('peopleBranchFilter')?.addEventListener('change', (event) => { selectedPeopleBranch = event.target.value; store.notify(); });
  document.getElementById('peopleSearchMode')?.addEventListener('change', (event) => { selectedPeopleSearchMode = event.target.value; store.notify(); });
  document.getElementById('peopleStatusFilter')?.addEventListener('change', (event) => { selectedPeopleStatus = event.target.value; store.notify(); });
  document.getElementById('clearPeopleFilters')?.addEventListener('click', () => {
    selectedDept = 'all';
    selectedPeopleBranch = 'all';
    selectedPeopleStatus = 'all';
    selectedPeopleSearch = '';
    selectedPeopleSearchMode = 'near';
    store.notify();
  });
  const departmentSelect = document.getElementById('employeeDepartment');
  const shiftSelect = document.getElementById('employeeShift');
  if (departmentSelect && shiftSelect) {
    const applyDepartmentDefault = () => {
      shiftSelect.value = defaultShiftForDepartment(departmentSelect.value);
    };
    applyDepartmentDefault();
    departmentSelect.addEventListener('change', applyDepartmentDefault);
  }

  // 1. Employee Form Submission Handler
  const form = document.getElementById("employeeForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      try {
        const customCode = (data.code || '').trim();
        const branch = (data.branchId || '').trim() || 'pham-van-chieu';
        const prefix = branch === 'le-van-tho' ? 'LVT' : 'PVC';
        const fallbackCode = `${prefix}-${Date.now().toString().slice(-5)}`;
        const code = customCode || fallbackCode;

        await createEmployee({
          id: code,
          employeeNumber: code,
          branchId: branch,
          name: data.name.trim(),
          email: (data.email || '').trim() || null,
          department: data.department,
          role: data.role.trim(),
          shift: data.shift,
          phone: data.phone.trim() || "Chưa cập nhật",
          status: data.status,
          manager: data.manager.trim() || "Chưa gán",
          hireDate: data.hireDate || todayISO(),
          insuranceDate: data.insuranceDate || addDaysISO(60),
          salaryOffer: Number(data.salaryOffer || 0),
          hourlyRate: Number(data.hourlyRate || 0),
          profileLocked: data.profileLocked === "true",
          certificates: splitList(data.certificates),
        });

        showToast(`Đã thêm nhân sự ${data.name.trim()} (${code}).`);
        form.reset();
        store.notify();
      } catch (err) {
        console.error('[People View] createEmployee failed:', err);
        showToast("Lỗi khi thêm nhân viên mới.", true);
      }
    });
  }

  // 2. Department filter listener
  const filter = document.getElementById("peopleFilter");
  if (filter) {
    filter.addEventListener("change", (e) => {
      selectedDept = e.target.value;
      store.notify();
    });
  }

  // 3. Edit Employee Modal handlers
  document.querySelectorAll('[data-action="close-edit-employee-modal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('employeeEditModal');
      if (modal) modal.hidden = true;
    });
  });

  const editDeptSelect = document.getElementById('editEmployeeDepartment');
  const editShiftSelect = document.getElementById('editEmployeeShift');
  if (editDeptSelect && editShiftSelect) {
    editDeptSelect.addEventListener('change', () => {
      editShiftSelect.value = defaultShiftForDepartment(editDeptSelect.value);
    });
  }

  document.querySelectorAll('[data-action="edit-employee"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code');
      const employee = cachedEmployees.find(emp => String(emp.id).toLowerCase() === String(code).toLowerCase());
      if (!employee) {
        showToast('Không tìm thấy thông tin nhân viên: ' + code, true);
        return;
      }
      const modal = document.getElementById('employeeEditModal');
      if (!modal) return;

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val !== undefined && val !== null ? val : '';
      };

      setVal('editEmployeeOriginalCode', employee.id);
      setVal('editEmployeeCode', employee.id);
      setVal('editEmployeeName', employee.name || '');
      setVal('editEmployeePhone', employee.phone || '');
      setVal('editEmployeeEmail', employee.email || '');
      setVal('editEmployeeDepartment', employee.department || 'other');
      setVal('editEmployeeRole', employee.role || '');
      setVal('editEmployeeBranch', employee.branchId || 'pham-van-chieu');
      setVal('editEmployeeShift', employee.shift || '');
      setVal('editEmployeeStatus', employee.status || 'active');
      setVal('editEmployeeManager', employee.manager || '');
      setVal('editEmployeeHireDate', employee.hireDate || '');
      setVal('editEmployeeInsuranceDate', employee.insuranceDate || '');
      setVal('editEmployeeSalaryOffer', employee.salaryOffer || 0);
      setVal('editEmployeeHourlyRate', employee.hourlyRate || 0);
      setVal('editEmployeeProfileLocked', employee.profileLocked ? 'true' : 'false');
      setVal('editEmployeeCertificates', (employee.certificates || []).join(', '));

      modal.hidden = false;
    });
  });

  const editForm = document.getElementById('employeeEditForm');
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('editEmployeeSubmitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang lưu...';
      }

      const originalCode = document.getElementById('editEmployeeOriginalCode').value;
      const newCode = (document.getElementById('editEmployeeCode').value || '').trim();
      const name = (document.getElementById('editEmployeeName').value || '').trim();
      const phone = (document.getElementById('editEmployeePhone').value || '').trim();
      const email = (document.getElementById('editEmployeeEmail').value || '').trim();
      const department = document.getElementById('editEmployeeDepartment').value;
      const role = (document.getElementById('editEmployeeRole').value || '').trim();
      const branchId = document.getElementById('editEmployeeBranch').value;
      const shift = document.getElementById('editEmployeeShift').value;
      const status = document.getElementById('editEmployeeStatus').value;
      const manager = (document.getElementById('editEmployeeManager').value || '').trim();
      const hireDate = document.getElementById('editEmployeeHireDate').value;
      const insuranceDate = document.getElementById('editEmployeeInsuranceDate').value;
      const salaryOffer = Number(document.getElementById('editEmployeeSalaryOffer').value || 0);
      const hourlyRate = Number(document.getElementById('editEmployeeHourlyRate').value || 0);
      const profileLocked = document.getElementById('editEmployeeProfileLocked').value === 'true';
      const certificates = splitList(document.getElementById('editEmployeeCertificates').value || '');

      try {
        await updateEmployee(originalCode, {
          id: newCode,
          code: newCode,
          name,
          phone,
          email: email || null,
          department,
          role,
          branchId,
          shift,
          status,
          manager,
          hireDate,
          insuranceDate,
          salaryOffer,
          hourlyRate,
          profileLocked,
          certificates,
        });

        const modal = document.getElementById('employeeEditModal');
        if (modal) modal.hidden = true;
        showToast(originalCode !== newCode 
          ? `Đã đổi mã nhân sự từ ${originalCode} sang ${newCode} thành công!` 
          : `Đã cập nhật thông tin nhân sự ${newCode} thành công!`
        );
        store.notify();
      } catch (err) {
        console.error('[People View] updateEmployee error:', err);
        showToast(err?.message || 'Lỗi khi cập nhật nhân sự.', true);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="ri-save-3-line"></i> Lưu thay đổi';
        }
      }
    });
  }
}
