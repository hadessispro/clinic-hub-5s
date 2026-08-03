import { getEmployees, createEmployee } from '../services/employees.js';
import { DEPARTMENTS, SHIFTS } from '../constants.js';
import { todayISO, addDaysISO, escapeHTML, formatCurrency, formatShortDate, smartMatch, departmentName, splitList, makeId } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let selectedDept = "all";
let cachedEmployees = [];

function renderPersonCard(employee) {
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
        <h4>${escapeHTML(employee.name)}</h4>
        <div class="person-meta">
          ${pill(departmentName(employee.department))}
          ${pill(employee.role)}
          ${statusPill(employee.status === "active" ? "Đang làm" : "Onboard", employee.status === "active" ? "good" : "warn")}
          ${employee.profileLocked ? statusPill("Hồ sơ khóa", "neutral") : ""}
        </div>
        <p class="subtle">${escapeHTML(employee.phone)} · ${shift ? `${escapeHTML(shift.start)}-${escapeHTML(shift.end)}` : "Chưa gán ca"}</p>
        <p class="subtle">Phụ trách: ${escapeHTML(employee.manager || "Chưa gán")} · BH ${employee.insuranceDate ? formatShortDate(employee.insuranceDate) : "chưa có"}</p>
        <p class="subtle">Offer ${formatCurrency(employee.salaryOffer || 0)} · giờ ${formatCurrency(employee.hourlyRate || 0)}</p>
        <p class="subtle">Chứng chỉ: ${employee.certificates?.length ? escapeHTML(employee.certificates.join(", ")) : "Chưa cập nhật"}</p>
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  const employees = await getEmployees();
  cachedEmployees = employees;

  // Filter employees based on department and search term
  const filteredEmployees = employees.filter((employee) => {
    const deptMatch = selectedDept === "all" || employee.department === selectedDept;
    if (!searchTerm) return deptMatch;
    return deptMatch && smartMatch(
      `${employee.name} ${employee.role} ${employee.phone} ${departmentName(employee.department)} ${employee.certificates?.join(" ") || ""}`,
      searchTerm
    );
  });

  const rosterRows = filteredEmployees.map((employee) => {
    const shift = SHIFTS.find(s => s.id === employee.shift);
    return `
      <tr>
        <td><strong>${escapeHTML(employee.name)}</strong><br><span class="subtle">${escapeHTML(employee.phone)}</span></td>
        <td>${escapeHTML(departmentName(employee.department))}</td>
        <td>${escapeHTML(employee.role)}</td>
        <td>${shift ? `${escapeHTML(shift.start)}-${escapeHTML(shift.end)}` : "Chưa gán"}</td>
        <td>${statusPill(employee.status === "active" ? "Đang làm" : "Đang onboard", employee.status === "active" ? "good" : "warn")}</td>
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

    <section class="panel">
      <div class="section-title">
        <h3>Thêm nhân sự</h3>
        ${pill("Gán ca ngay khi tạo")}
      </div>
      <form class="form-grid three" data-form="employee" id="employeeForm">
        <div class="form-field">
          <label for="employeeName">Họ tên</label>
          <input id="employeeName" name="name" required placeholder="VD: Nguyễn Văn A" />
        </div>
        <div class="form-field">
          <label for="employeeDepartment">Phòng ban</label>
          <select id="employeeDepartment" name="department">
            ${DEPARTMENTS.map(dept => option(dept.id, dept.name)).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="employeeRole">Chức danh</label>
          <input id="employeeRole" name="role" required placeholder="VD: Phụ tá" />
        </div>
        <div class="form-field">
          <label for="employeeShift">Ca mặc định</label>
          <select id="employeeShift" name="shift">
            ${SHIFTS.map(shift => option(shift.id, `${shift.group} / ${shift.name} (${shift.start}-${shift.end})`)).join('')}
          </select>
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
          <label for="employeePhone">Số điện thoại</label>
          <input id="employeePhone" name="phone" placeholder="090..." />
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
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Danh bạ</h3>
        <span class="subtle">${filteredEmployees.length} nhân sự</span>
      </div>
      <div class="people-controls">
        <select data-action="people-filter" id="peopleFilter">
          <option value="all"${selectedDept === "all" ? " selected" : ""}>Tất cả phòng ban</option>
          ${DEPARTMENTS.map((dept) => option(dept.id, dept.name, selectedDept === dept.id)).join("")}
        </select>
      </div>
      <div class="grid cols-4">
        ${filteredEmployees.map(renderPersonCard).join("")}
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
              <th>Nhân sự</th>
              <th>Phòng ban</th>
              <th>Chức danh</th>
              <th>Ca mặc định</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>${rosterRows}</tbody>
        </table>
      </div>
    </section>
  `;
}

export function initView() {
  // 1. Employee Form Submission Handler
  const form = document.getElementById("employeeForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      try {
        await createEmployee({
          id: makeId("e"),
          name: data.name.trim(),
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

        showToast("Đã thêm nhân sự.");
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
}
