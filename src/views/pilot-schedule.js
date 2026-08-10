import { getPilotSchedule, savePilotScheduleChanges } from '../services/pilot-schedule.js';
import { DEPARTMENTS } from '../constants.js';
import { escapeHTML, todayISO } from '../utils.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let pilotMonth = todayISO().slice(0, 7);
let pilotBranch = 'le-van-tho';
let pilotDepartment = 'bs';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function dateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shiftHours(shift) {
  const [startHour, startMinute] = String(shift.start_time || '00:00').split(':').map(Number);
  const [endHour, endMinute] = String(shift.end_time || '00:00').split(':').map(Number);
  const configuredBreak = Number(shift.break_minutes || 0);
  const breakMinutes = ['front-morning', 'front-afternoon'].includes(shift.code) ? Math.max(60, configuredBreak) : configuredBreak;
  return Math.max(0, ((endHour * 60 + endMinute) - (startHour * 60 + startMinute) - breakMinutes) / 60);
}

function shiftCodeLabel(shift) {
  const labels = {
    'doctor-office': 'HC', 'doctor-morning': 'S', 'doctor-afternoon': 'C', 'doctor-full': 'F',
    'front-office': 'HC', 'front-morning': 'S', 'front-afternoon': 'C', 'front-full': 'F',
    'security-weekday': 'NT', 'security-sunday': 'CN',
    'cleaning-weekday': 'NT', 'cleaning-sunday': 'CN', 'clinic-0800': 'HC',
  };
  return labels[shift.code] || shift.name || shift.code;
}

function renderLegend(shifts) {
  return shifts.map((shift) => `
    <span class="pilot-shift-legend-item"><b>${escapeHTML(shiftCodeLabel(shift))}</b>${escapeHTML(shift.name)} · ${String(shift.start_time).slice(0, 5)}–${String(shift.end_time).slice(0, 5)} · ${shiftHours(shift).toLocaleString('vi-VN')} giờ</span>
  `).join('');
}

export async function renderAdminItPilot() {
  let data;
  try {
    data = await getPilotSchedule({ month: pilotMonth, branch: pilotBranch, department: pilotDepartment });
  } catch (error) {
    return `<section class="panel pilot-schedule-error"><h3>Không tải được lịch thử nghiệm</h3><p>${escapeHTML(error.message)}</p></section>`;
  }

  const [year, monthNumber] = pilotMonth.split('-').map(Number);
  const monthIndex = monthNumber - 1;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, monthIndex, day);
    return { day, weekday: WEEKDAYS[date.getDay()], key: dateKey(year, monthIndex, day), sunday: date.getDay() === 0 };
  });
  const shiftByCode = new Map(data.shifts.map((shift) => [shift.code, shift]));
  const allowedByEmployee = new Map();
  data.allowed.forEach((row) => {
    if (!allowedByEmployee.has(row.employee_code)) allowedByEmployee.set(row.employee_code, []);
    allowedByEmployee.get(row.employee_code).push(row.shift_code);
  });
  const assignmentByKey = new Map(data.assignments.map((item) => [`${item.employee_code}:${item.work_date}`, item]));
  const visibleShiftCodes = [...new Set(data.allowed.map((row) => row.shift_code))];
  const visibleShifts = visibleShiftCodes.map((code) => shiftByCode.get(code)).filter(Boolean);

  const rows = data.employees.map((employee) => {
    const allowedCodes = allowedByEmployee.get(employee.code) || [employee.shift_code].filter(Boolean);
    let totalHours = 0;
    const cells = dates.map((date) => {
      const assignment = assignmentByKey.get(`${employee.code}:${date.key}`);
      const selectedCode = assignment?.shift_code || '';
      totalHours += selectedCode && shiftByCode.has(selectedCode) ? shiftHours(shiftByCode.get(selectedCode)) : 0;
      const options = allowedCodes.map((code) => {
        const shift = shiftByCode.get(code);
        if (!shift) return '';
        return `<option value="${escapeHTML(code)}" data-hours="${shiftHours(shift)}" ${selectedCode === code ? 'selected' : ''}>${escapeHTML(shiftCodeLabel(shift))}</option>`;
      }).join('');
      return `<td class="pilot-day-cell ${date.sunday ? 'is-sunday' : ''}"><select class="pilot-schedule-select" aria-label="${escapeHTML(employee.full_name)} ngày ${date.day}" data-employee="${escapeHTML(employee.code)}" data-date="${date.key}" data-original="${escapeHTML(selectedCode)}"><option value="" data-hours="0">—</option>${options}</select></td>`;
    }).join('');
    return `<tr data-pilot-employee="${escapeHTML(employee.code)}"><th class="pilot-employee-cell"><strong>${escapeHTML(employee.full_name)}</strong><small>${escapeHTML(employee.title || employee.code)}</small></th>${cells}<td class="pilot-total-cell"><strong data-pilot-total>${totalHours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong><span>giờ</span></td></tr>`;
  }).join('');

  const registeredCells = data.assignments.length;
  const totalHours = data.assignments.reduce((sum, assignment) => sum + (shiftByCode.has(assignment.shift_code) ? shiftHours(shiftByCode.get(assignment.shift_code)) : 0), 0);
  return `
    <div class="pilot-schedule-page">
      <section class="pilot-banner"><div><p class="eyebrow">BETA · CHỈ ADMIN IT</p><h3>Đăng ký lịch làm việc theo tháng</h3><p>Mô phỏng bảng PVC/LVT trong file Excel. Dữ liệu thử nghiệm chưa mở cho các vai trò khác.</p></div><span>Chờ nghiệm thu</span></section>
      <section class="panel pilot-schedule-panel">
        <div class="pilot-schedule-toolbar">
          <label>Tháng<input type="month" id="pilotScheduleMonth" value="${pilotMonth}"></label>
          <label>Chi nhánh<select id="pilotScheduleBranch"><option value="le-van-tho" ${pilotBranch === 'le-van-tho' ? 'selected' : ''}>Lê Văn Thọ</option><option value="pham-van-chieu" ${pilotBranch === 'pham-van-chieu' ? 'selected' : ''}>Phạm Văn Chiêu</option></select></label>
          <label>Phòng ban<select id="pilotScheduleDepartment">${DEPARTMENTS.map((department) => `<option value="${department.id}" ${pilotDepartment === department.id ? 'selected' : ''}>${escapeHTML(department.name)}</option>`).join('')}</select></label>
          <button class="primary-button" type="button" id="savePilotSchedule" disabled>Lưu các ô đã đổi</button>
        </div>
        <div class="pilot-schedule-metrics"><article><span>Nhân sự</span><strong>${data.employees.length}</strong></article><article><span>Ô đã đăng ký</span><strong>${registeredCells}</strong></article><article><span>Tổng giờ dự kiến</span><strong>${totalHours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</strong></article><article><span>Thay đổi chưa lưu</span><strong id="pilotDirtyCount">0</strong></article></div>
        <div class="pilot-shift-legend">${visibleShifts.length ? renderLegend(visibleShifts) : '<span>Chưa có ca được phép cho nhóm nhân sự này.</span>'}</div>
        <div class="pilot-schedule-table-wrap">
          <table class="pilot-schedule-table">
            <thead><tr><th class="pilot-employee-cell">Nhân sự</th>${dates.map((date) => `<th class="${date.sunday ? 'is-sunday' : ''}"><span>${date.day}</span><small>${date.weekday}</small></th>`).join('')}<th class="pilot-total-cell">Tổng</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="${daysInMonth + 2}" class="pilot-empty">Không có nhân sự phù hợp tại chi nhánh/phòng ban đã chọn.</td></tr>`}</tbody>
          </table>
        </div>
        <p class="pilot-schedule-note">Mã theo mẫu Excel: HC = hành chính, S = sáng, C = chiều, F = full. Ô trống là chưa đăng ký/nghỉ. Ca chỉ được chọn trong danh sách đã gán cho nhân viên.</p>
      </section>
    </div>`;
}

function recalculatePilotRow(select) {
  const row = select.closest('[data-pilot-employee]');
  if (!row) return;
  const total = [...row.querySelectorAll('.pilot-schedule-select')].reduce((sum, item) => sum + Number(item.selectedOptions[0]?.dataset.hours || 0), 0);
  const output = row.querySelector('[data-pilot-total]');
  if (output) output.textContent = total.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function refreshDirtyState() {
  const dirty = [...document.querySelectorAll('.pilot-schedule-select')].filter((select) => select.value !== select.dataset.original);
  const count = document.getElementById('pilotDirtyCount');
  const save = document.getElementById('savePilotSchedule');
  if (count) count.textContent = String(dirty.length);
  if (save) {
    save.disabled = dirty.length === 0;
    save.textContent = dirty.length ? `Lưu ${dirty.length} ô đã đổi` : 'Lưu các ô đã đổi';
  }
  return dirty;
}

export function initAdminItPilot() {
  const rerender = () => store.notify();
  document.getElementById('pilotScheduleMonth')?.addEventListener('change', (event) => { pilotMonth = event.target.value || pilotMonth; rerender(); });
  document.getElementById('pilotScheduleBranch')?.addEventListener('change', (event) => { pilotBranch = event.target.value; rerender(); });
  document.getElementById('pilotScheduleDepartment')?.addEventListener('change', (event) => { pilotDepartment = event.target.value; rerender(); });
  document.querySelectorAll('.pilot-schedule-select').forEach((select) => select.addEventListener('change', () => {
    select.classList.toggle('is-dirty', select.value !== select.dataset.original);
    recalculatePilotRow(select);
    refreshDirtyState();
  }));
  document.getElementById('savePilotSchedule')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const dirty = refreshDirtyState();
    if (!dirty.length) return;
    button.disabled = true;
    button.textContent = 'Đang lưu lịch thử nghiệm…';
    try {
      const changes = dirty.map((select) => ({ employee: select.dataset.employee, date: select.dataset.date, shift: select.value }));
      const result = await savePilotScheduleChanges(changes);
      showToast(`Đã lưu ${result.saved || 0} ca và xóa ${result.removed || 0} ô lịch.`);
      store.notify();
    } catch (error) {
      showToast(error.message || 'Không thể lưu lịch thử nghiệm.', true);
      button.disabled = false;
      refreshDirtyState();
    }
  });
}
