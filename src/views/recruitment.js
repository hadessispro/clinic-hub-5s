import { getRecruitmentList, createCandidate, updateCandidate } from '../services/recruitment.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS } from '../constants.js';
import { todayISO, addDaysISO, escapeHTML, formatCurrency, formatShortDate, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState, statusTone } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedCandidates = [];
let cachedEmployees = [];

function renderRecruitmentCard(item) {
  const owner = cachedEmployees.find(e => e.id === item.responsible);
  const tone = statusTone(item.status);
  
  // Custom stage labels mapping
  const stageLabels = {
    screening: 'Sàng lọc',
    interview: 'Phỏng vấn',
    trial: 'Thử việc',
    offer: 'Offer',
    onboarding: 'Hội nhập',
  };
  const stageLabel = stageLabels[item.stage] || item.stage;

  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(item.candidate)}</h4>
        ${statusPill(item.status === 'approved' ? 'Đã duyệt' : item.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt', tone)}
      </div>
      <div class="request-meta">
        ${pill(item.role)}
        ${pill(departmentName(item.department))}
        ${pill(owner?.name || "Chưa gán")}
        ${pill(stageLabel)}
      </div>
      <p class="subtle">Lịch hẹn ${formatShortDate(item.interviewDate)} · mong muốn ${formatCurrency(item.salaryExpected)} · offer ${formatCurrency(item.offerAmount)}</p>
      <p class="subtle">BH dự kiến ${formatShortDate(item.insuranceDate)} · ${escapeHTML(item.note || "Không có ghi chú")}</p>
      <div class="request-actions">
        <span class="subtle">${item.autoSchedule ? "Có set lịch tự động" : "Set lịch thủ công"}</span>
        <div class="pill-row">
          <button class="secondary-button" type="button" data-action="recruitment-approve" data-id="${escapeHTML(item.id)}"><span>✓</span>Duyệt</button>
          <button class="danger-button" type="button" data-action="recruitment-reject" data-id="${escapeHTML(item.id)}"><span>×</span>Từ chối</button>
        </div>
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  const [candidates, employees] = await Promise.all([
    getRecruitmentList(),
    getEmployees()
  ]);

  cachedCandidates = candidates;
  cachedEmployees = employees;

  const pending = candidates.filter((item) => item.status === "pending");
  const totalOffer = candidates.reduce((sum, item) => sum + Number(item.offerAmount || 0), 0);

  // Filter candidates based on global search
  const filteredCandidates = candidates.filter((item) => {
    if (!searchTerm) return true;
    const owner = employees.find(e => e.id === item.responsible);
    const textToMatch = [
      item.candidate,
      item.role,
      departmentName(item.department),
      owner?.name || "",
      item.stage,
      item.status,
      item.note
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Recruitment workflow</p>
        <h3>Quản lý ứng viên, người phụ trách, set lịch tự động, mức offer, ngày đóng bảo hiểm và duyệt thông tin lương.</h3>
      </div>
      <div class="pill-row">
        ${statusPill(`${pending.length} hồ sơ chờ`, pending.length ? "warn" : "good")}
        ${pill(`Offer dự kiến ${formatCurrency(totalOffer)}`)}
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Thêm hồ sơ tuyển dụng</h3>
          ${pill("Auto set lịch")}
        </div>
        <form class="form-grid three" data-form="recruitment" id="recruitmentForm">
          <div class="form-field">
            <label for="candidateName">Họ tên ứng viên</label>
            <input id="candidateName" name="candidate" required placeholder="VD: Nguyễn Thị A" />
          </div>
          <div class="form-field">
            <label for="candidateRole">Vị trí</label>
            <input id="candidateRole" name="role" required placeholder="Lễ tân, Phụ tá, Bác sĩ..." />
          </div>
          <div class="form-field">
            <label for="candidateDept">Phòng ban</label>
            <select id="candidateDept" name="department">
              ${DEPARTMENTS.map(dept => option(dept.id, dept.name)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="candidateOwner">Người phụ trách</label>
            <select id="candidateOwner" name="responsible">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="candidateStage">Giai đoạn</label>
            <select id="candidateStage" name="stage">
              <option value="screening">Lọc hồ sơ</option>
              <option value="interview">Phỏng vấn</option>
              <option value="trial">Thử việc/thực tập</option>
              <option value="offer">Offer</option>
              <option value="onboarding">Hội nhập</option>
            </select>
          </div>
          <div class="form-field">
            <label for="candidateDate">Lịch hẹn</label>
            <input id="candidateDate" name="interviewDate" type="date" value="${addDaysISO(1)}" />
          </div>
          <div class="form-field">
            <label for="salaryExpected">Mức lương mong muốn</label>
            <input id="salaryExpected" name="salaryExpected" type="number" min="0" value="0" />
          </div>
          <div class="form-field">
            <label for="offerAmount">Mức offer xét duyệt</label>
            <input id="offerAmount" name="offerAmount" type="number" min="0" value="0" />
          </div>
          <div class="form-field">
            <label for="insuranceDate">Ngày đóng bảo hiểm</label>
            <input id="insuranceDate" name="insuranceDate" type="date" value="${addDaysISO(60)}" />
          </div>
          <div class="form-field full">
            <label for="candidateNote">Ghi chú</label>
            <textarea id="candidateNote" name="note" placeholder="Hồ sơ thực tập, giấy phép hành nghề, lịch phỏng vấn, điều kiện offer..."></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Lưu hồ sơ tuyển dụng</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Checklist tuyển dụng</h3>
          ${pill("HR + trưởng bộ phận")}
        </div>
        <div class="grid">
          ${["Tự động nhắc lịch phỏng vấn và người phụ trách", "Kiểm tra bằng cấp, chứng chỉ, giấy phép hành nghề", "Xét duyệt mức offer, ngày bảo hiểm và phản hồi lương", "Chuyển sang hội nhập: ký văn bản, bảo mật, cài tài khoản, cài vân tay"].map((text) => `
            <article class="mini-card">
              <strong>${escapeHTML(text)}</strong>
              <span>Trạng thái được lưu theo từng ứng viên</span>
            </article>
          `).join("")}
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Pipeline tuyển dụng</h3>
        <span class="subtle">${filteredCandidates.length} hồ sơ</span>
      </div>
      <div class="grid cols-3">
        ${filteredCandidates.length ? filteredCandidates.map(renderRecruitmentCard).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  // 1. Candidate Form Submit Handler
  const form = document.getElementById("recruitmentForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      try {
        await createCandidate({
          candidate: data.candidate.trim(),
          role: data.role.trim(),
          department: data.department,
          responsible: data.responsible,
          stage: data.stage,
          interviewDate: data.interviewDate || todayISO(),
          autoSchedule: true,
          salaryExpected: Number(data.salaryExpected || 0),
          offerAmount: Number(data.offerAmount || 0),
          insuranceDate: data.insuranceDate || addDaysISO(60),
          status: "pending",
          note: data.note.trim(),
        });

        showToast("Đã lưu hồ sơ tuyển dụng.");
        form.reset();
        store.notify();
      } catch (err) {
        console.error('[Recruitment View] createCandidate failed:', err);
        showToast("Lỗi khi thêm ứng viên mới.", true);
      }
    });
  }

  // 2. Action buttons for approving / rejecting candidates
  const approveBtns = document.querySelectorAll('[data-action="recruitment-approve"]');
  approveBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const candidate = cachedCandidates.find(c => c.id === id);
      if (!candidate) return;

      try {
        await updateCandidate(id, { ...candidate, status: 'approved' });
        showToast("Đã duyệt.");
        store.notify();
      } catch (err) {
        console.error('[Recruitment View] approve candidate failed:', err);
        showToast("Lỗi khi duyệt hồ sơ.", true);
      }
    });
  });

  const rejectBtns = document.querySelectorAll('[data-action="recruitment-reject"]');
  rejectBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const candidate = cachedCandidates.find(c => c.id === id);
      if (!candidate) return;

      try {
        await updateCandidate(id, { ...candidate, status: 'rejected' });
        showToast("Đã từ chối.", true);
        store.notify();
      } catch (err) {
        console.error('[Recruitment View] reject candidate failed:', err);
        showToast("Lỗi khi từ chối hồ sơ.", true);
      }
    });
  });
}
