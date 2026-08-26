import { getIncidents, createIncident, updateIncident } from '../services/incidents.js';
import { getAssetAudits, createAssetAudit, updateAssetAudit } from '../services/assets.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS } from '../constants.js';
import { uploadFile } from '../services/storage.js';
import { todayISO, addDaysISO, escapeHTML, formatShortDate, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedIncidents = [];
let cachedAudits = [];

// Static mock offboarding cases as in original app
const MOCK_OFFBOARDING = [
  { id: "ob-001", employee: "e-010", lastWorkingDate: addDaysISO(20), status: "draft", checklist: ["Chốt công lương", "Trả sổ bảo hiểm", "Thu hồi quyền lợi", "Bàn giao công việc"], note: "Mẫu hội nhập nghỉ việc để HR theo dõi khi phát sinh." }
];

function renderIncidentCard(item) {
  const employee = cachedEmployees.find(e => e.id === item.employee);
  const reporter = cachedEmployees.find(e => e.id === item.reporter);
  const attachment = item.proofUrl
    ? `<a href="${escapeHTML(item.proofUrl)}" target="_blank" rel="noreferrer">Mở hình/link</a>`
    : item.fileName
      ? escapeHTML(item.fileName)
      : "Chưa có";
      
  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(item.title)}</h4>
        ${statusPill(item.status === "closed" ? "Đã đóng" : "Đang theo dõi", item.status === "closed" ? "good" : "warn")}
      </div>
      <div class="request-meta">
        ${pill(item.category)}
        ${pill(employee?.name || "Không rõ")}
        ${pill(`Báo cáo: ${reporter?.name || "Quản lý"}`)}
      </div>
      <p class="subtle">${escapeHTML(item.note)}</p>
      <p class="subtle">Bằng chứng: ${attachment}</p>
      <div class="request-actions">
        <span class="subtle">${formatShortDate(item.date)}</span>
        ${item.status !== "closed" ? `
          <button class="secondary-button" type="button" data-action="incident-close" data-id="${escapeHTML(item.id)}"><span>✓</span>Đóng</button>
        ` : ''}
      </div>
    </article>
  `;
}

function renderAssetAuditCard(item) {
  const owner = cachedEmployees.find(e => e.id === item.owner);
  const attachment = item.attachmentUrl
    ? `<a href="${escapeHTML(item.attachmentUrl)}" target="_blank" rel="noreferrer">Xem bảng</a>`
    : item.fileName
      ? escapeHTML(item.fileName)
      : "Không có file";

  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(item.title)}</h4>
        ${statusPill(item.status === "done" ? "Hoàn tất" : item.status === "doing" ? "Đang làm" : "Chờ xử lý", item.status === "done" ? "good" : "warn")}
      </div>
      <div class="request-meta">
        ${pill(departmentName(item.department))}
        ${pill(owner?.name || "Chưa gán")}
        ${pill(`Hạn ${formatShortDate(item.due)}`)}
      </div>
      <p class="subtle">${escapeHTML(item.note || "Không có ghi chú")}</p>
      <p class="subtle">File: ${attachment}</p>
      <div class="request-actions">
        <span class="subtle">Giao tác vụ kiểm kê</span>
        ${item.status !== "done" ? `
          <button class="secondary-button" type="button" data-action="audit-done" data-id="${escapeHTML(item.id)}"><span>✓</span>Hoàn tất</button>
        ` : ''}
      </div>
    </article>
  `;
}

function renderOffboardingCard(item) {
  const employee = cachedEmployees.find(e => e.id === item.employee);
  return `
    <article class="request-card">
      <div class="section-title">
        <h4>Hội nhập nghỉ việc</h4>
        ${statusPill(item.status === "done" ? "Hoàn tất" : "Nháp", item.status === "done" ? "good" : "neutral")}
      </div>
      <div class="request-meta">
        ${pill(employee?.name || "Mẫu")}
        ${pill(`Ngày cuối ${formatShortDate(item.lastWorkingDate)}`)}
      </div>
      <div class="check-list">
        ${item.checklist.map((text) => `<span>✓ ${escapeHTML(text)}</span>`).join("")}
      </div>
      <p class="subtle">${escapeHTML(item.note)}</p>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  const [incidents, audits, employees] = await Promise.all([
    getIncidents(),
    getAssetAudits(),
    getEmployees()
  ]);

  cachedEmployees = employees;
  cachedIncidents = incidents;
  cachedAudits = audits;

  // Filter based on search query
  const filteredIncidents = incidents.filter(item => {
    if (!searchTerm) return true;
    const employee = employees.find(e => e.id === item.employee);
    const reporter = employees.find(e => e.id === item.reporter);
    const textToMatch = [
      item.title,
      item.category,
      item.note,
      employee?.name,
      reporter?.name,
      item.status
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  const filteredAudits = audits.filter(item => {
    if (!searchTerm) return true;
    const owner = employees.find(e => e.id === item.owner);
    const textToMatch = [
      item.title,
      departmentName(item.department),
      owner?.name,
      item.note,
      item.status
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  const activeIncidentsCount = incidents.filter((item) => item.status !== "closed").length;

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Employee evidence & handover</p>
        <h3>Lưu hình ảnh chứng minh sự vụ nhân viên, giao file kiểm kê tài sản và quy trình hội nhập nghỉ việc.</h3>
      </div>
      <div class="pill-row">
        ${statusPill(`${activeIncidentsCount} sự vụ mở`, activeIncidentsCount ? "warn" : "good")}
        ${pill(`${audits.length} bảng kiểm kê`)}
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Ghi nhận sự vụ</h3>
          ${pill("Link/file chứng minh")}
        </div>
        <form class="form-grid three" data-form="incident" id="incidentForm">
          <div class="form-field">
            <label for="incidentEmployee">Nhân sự liên quan</label>
            <select id="incidentEmployee" name="employee">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="incidentReporter">Người báo cáo</label>
            <select id="incidentReporter" name="reporter">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="incidentDate">Ngày</label>
            <input id="incidentDate" name="date" type="date" value="${todayISO()}" />
          </div>
          <div class="form-field">
            <label for="incidentCategory">Nhóm</label>
            <select id="incidentCategory" name="category">
              <option>Chấm công</option>
              <option>Tài sản</option>
              <option>Khách hàng</option>
              <option>Hồ sơ</option>
              <option>Khác</option>
            </select>
          </div>
          <div class="form-field full">
            <label for="incidentTitle">Tiêu đề</label>
            <input id="incidentTitle" name="title" required placeholder="VD: Quên checkout cuối ca" />
          </div>
          <div class="form-field">
            <label for="incidentProof">Link hình ảnh</label>
            <input id="incidentProof" name="proofUrl" type="url" placeholder="https://drive.google.com/..." />
          </div>
          <div class="form-field">
            <label for="incidentFile">File chứng minh</label>
            <input id="incidentFile" name="fileAttachment" type="file" />
          </div>
          <div class="form-field full">
            <label for="incidentNote">Ghi chú</label>
            <textarea id="incidentNote" name="note" required placeholder="Mô tả sự vụ, bằng chứng, người đã xác nhận"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Lưu sự vụ</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Tạo bảng kiểm kê tài sản</h3>
          ${pill("Excel / Doc / PDF")}
        </div>
        <form class="form-grid three" data-form="asset-audit" id="auditForm">
          <div class="form-field full">
            <label for="auditTitle">Tên bảng kiểm kê</label>
            <input id="auditTitle" name="title" required placeholder="VD: Kiểm kê ghế máy tháng 6" />
          </div>
          <div class="form-field">
            <label for="auditDepartment">Phòng ban</label>
            <select id="auditDepartment" name="department">
              ${DEPARTMENTS.map(d => option(d.id, d.name)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="auditOwner">Người phụ trách</label>
            <select id="auditOwner" name="owner">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="auditDue">Deadline</label>
            <input id="auditDue" name="due" type="date" value="${addDaysISO(3)}" />
          </div>
          <div class="form-field">
            <label for="auditLink">Link file</label>
            <input id="auditLink" name="attachmentUrl" type="url" placeholder="https://..." />
          </div>
          <div class="form-field">
            <label for="auditFile">File</label>
            <input id="auditFile" name="fileAttachment" type="file" />
          </div>
          <div class="form-field full">
            <label for="auditNote">Ghi chú giao việc</label>
            <textarea id="auditNote" name="note" placeholder="Tag tên, phòng ban, yêu cầu kiểm kê"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Giao kiểm kê</button>
          </div>
        </form>
      </section>
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      <section class="panel">
        <div class="section-title">
          <h3>Danh sách sự vụ</h3>
          <span class="subtle">${filteredIncidents.length} dòng</span>
        </div>
        <div class="grid animate-fade">
          ${filteredIncidents.length ? filteredIncidents.map(renderIncidentCard).join("") : emptyState()}
        </div>
      </section>
      <section class="panel">
        <div class="section-title">
          <h3>Kiểm kê & nghỉ việc</h3>
          ${pill("Bàn giao")}
        </div>
        <div class="grid animate-fade">
          ${filteredAudits.length ? filteredAudits.map(renderAssetAuditCard).join("") : emptyState()}
          ${MOCK_OFFBOARDING.map(renderOffboardingCard).join("")}
        </div>
      </section>
    </div>
  `;
}

export function initView() {
  const incidentForm = document.getElementById("incidentForm");
  if (incidentForm) {
    incidentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(incidentForm);
      const data = Object.fromEntries(formData.entries());
      const file = formData.get("fileAttachment");

      try {
        let proofUrl = data.proofUrl.trim();
        let fileName = "";

        if (file && file.size > 0) {
          const uploadRes = await uploadFile(file, "incidents");
          if (uploadRes) {
            proofUrl = uploadRes.url;
            fileName = uploadRes.name;
          }
        }

        await createIncident({
          employee: data.employee,
          reporter: data.reporter,
          date: data.date || todayISO(),
          category: data.category,
          title: data.title.trim(),
          proofUrl,
          fileName,
          status: "open",
          note: data.note.trim()
        });

        showToast("Đã lưu sự vụ nhân viên.");
        incidentForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Incidents View] createIncident failed:', err);
        showToast("Lỗi khi thêm sự vụ.", true);
      }
    });
  }

  const auditForm = document.getElementById("auditForm");
  if (auditForm) {
    auditForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(auditForm);
      const data = Object.fromEntries(formData.entries());
      const file = formData.get("fileAttachment");

      try {
        let attachmentUrl = data.attachmentUrl.trim();
        let fileName = "";

        if (file && file.size > 0) {
          const uploadRes = await uploadFile(file, "audits");
          if (uploadRes) {
            attachmentUrl = uploadRes.url;
            fileName = uploadRes.name;
          }
        }

        await createAssetAudit({
          title: data.title.trim(),
          department: data.department,
          owner: data.owner,
          due: data.due || todayISO(),
          attachmentUrl,
          fileName,
          status: "pending",
          note: data.note.trim()
        });

        showToast("Đã giao bảng kiểm kê tài sản.");
        auditForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Incidents View] createAssetAudit failed:', err);
        showToast("Lỗi khi tạo kiểm kê.", true);
      }
    });
  }

  // Handle actions using delegation or direct attachment
  document.querySelectorAll("[data-action='incident-close']").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      try {
        await updateIncident(id, { status: "closed" });
        showToast("Đã đóng sự vụ.");
        store.notify();
      } catch (err) {
        console.error('[Incidents View] updateIncident failed:', err);
        showToast("Lỗi khi đóng sự vụ.", true);
      }
    });
  });

  document.querySelectorAll("[data-action='audit-done']").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      try {
        await updateAssetAudit(id, { status: "done" });
        showToast("Đã đánh dấu hoàn tất kiểm kê.");
        store.notify();
      } catch (err) {
        console.error('[Incidents View] updateAssetAudit failed:', err);
        showToast("Lỗi khi cập nhật kiểm kê.", true);
      }
    });
  });
}
