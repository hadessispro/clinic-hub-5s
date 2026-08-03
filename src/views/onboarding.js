import { getOnboardingDocs, createOnboardingDoc, getOnboardingProgress, updateOnboardingProgress } from '../services/onboarding.js';
import { getEmployees } from '../services/employees.js';
import { uploadFile } from '../services/storage.js';
import { DEPARTMENTS } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let selectedEmployeeId = null;
let cachedDocs = [];
let cachedProgress = [];
let cachedEmployees = [];

function onboardingStatus(employeeId, docId) {
  return cachedProgress.find((item) => item.employee === employeeId && item.doc === docId)?.status || "todo";
}

function renderOnboardingDocCard(doc, employeeId) {
  const owner = cachedEmployees.find(e => e.id === doc.owner);
  const status = onboardingStatus(employeeId, doc.id);
  const tone = status === "done" ? "good" : status === "reading" ? "warn" : "neutral";
  const label = status === "done" ? "Hoàn thành" : status === "reading" ? "Đang đọc" : "Chưa đọc";
  const attachment = doc.attachmentUrl
    ? `<a href="${escapeHTML(doc.attachmentUrl)}" target="_blank" rel="noreferrer">Mở link tài liệu</a>`
    : doc.fileName
      ? escapeHTML(doc.fileName)
      : "Chưa đính kèm";

  return `
    <article class="request-card">
      <div class="section-title">
        <h4>${escapeHTML(doc.title)}</h4>
        ${statusPill(label, tone)}
      </div>
      <div class="request-meta">
        ${pill(doc.category)}
        ${doc.required ? statusPill("Bắt buộc", "warn") : pill("Không bắt buộc")}
        ${pill(`Cập nhật ${formatShortDate(doc.updatedAt)}`)}
      </div>
      <p class="subtle">Phụ trách: ${escapeHTML(owner?.name || "Nhân sự")}</p>
      <p class="subtle">Tài liệu: ${attachment}</p>
      <div class="request-actions">
        <span class="subtle">Nhân sự tự đánh dấu sau khi đọc</span>
        <div class="pill-row">
          <button class="secondary-button" type="button" data-action="onboarding-reading" data-employee="${escapeHTML(employeeId)}" data-doc="${escapeHTML(doc.id)}"><span>◐</span>Đang đọc</button>
          <button class="primary-button" type="button" data-action="onboarding-done" data-employee="${escapeHTML(employeeId)}" data-doc="${escapeHTML(doc.id)}"><span>✓</span>Hoàn thành</button>
        </div>
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  
  const [docs, employees] = await Promise.all([
    getOnboardingDocs(),
    getEmployees()
  ]);

  cachedDocs = docs;
  cachedEmployees = employees;

  if (!selectedEmployeeId && employees.length) {
    selectedEmployeeId = employees[0].id;
  }

  const employee = employees.find(e => e.id === selectedEmployeeId) || employees[0];
  
  if (employee) {
    cachedProgress = await getOnboardingProgress(employee.id);
  } else {
    cachedProgress = [];
  }

  const doneCount = docs.filter((doc) => onboardingStatus(employee?.id, doc.id) === "done").length;
  const requiredTotal = docs.filter((doc) => doc.required).length;
  const requiredDone = docs.filter((doc) => doc.required && onboardingStatus(employee?.id, doc.id) === "done").length;

  // Filter docs based on global search
  const filteredDocs = docs.filter((doc) => {
    if (!searchTerm) return true;
    const owner = employees.find(e => e.id === doc.owner);
    const textToMatch = [
      doc.title,
      doc.category,
      doc.attachmentUrl,
      doc.fileName,
      owner?.name || "",
      doc.required ? "bat buoc required" : "khong bat buoc"
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">New staff onboarding</p>
        <h3>Nhân sự mới mở app điện thoại, đọc nội quy/hướng dẫn/chính sách và đánh dấu hoàn thành từng tài liệu.</h3>
      </div>
      <div class="pill-row">
        ${pill(`${doneCount}/${docs.length} tài liệu hoàn thành`)}
        ${statusPill(`${requiredDone}/${requiredTotal} bắt buộc`, requiredDone === requiredTotal ? "good" : "warn")}
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Tài liệu hội nhập</h3>
          ${pill("Có link / tên file")}
        </div>
        <form class="form-grid three" data-form="onboarding-doc" id="onboardingForm">
          <div class="form-field">
            <label for="onboardingTitle">Tên tài liệu</label>
            <input id="onboardingTitle" name="title" required placeholder="VD: Nội quy phòng khám" />
          </div>
          <div class="form-field">
            <label for="onboardingCategory">Nhóm</label>
            <select id="onboardingCategory" name="category">
              <option>Nội quy</option>
              <option>Chấm công</option>
              <option>Chính sách</option>
              <option>Quy trình</option>
              <option>Ký văn bản</option>
              <option>Hồ sơ thực tập</option>
              <option>Tài khoản</option>
              <option>Hồ sơ</option>
              <option>Nghỉ việc</option>
              <option>Đào tạo chuyên môn</option>
            </select>
          </div>
          <div class="form-field">
            <label for="onboardingRequired">Bắt buộc</label>
            <select id="onboardingRequired" name="required">
              <option value="true">Có</option>
              <option value="false">Không</option>
            </select>
          </div>
          <div class="form-field">
            <label for="onboardingLink">Link đính kèm</label>
            <input id="onboardingLink" name="attachmentUrl" type="url" placeholder="https://..." />
          </div>
          <div class="form-field">
            <label for="onboardingFile">File đính kèm</label>
            <input id="onboardingFile" name="fileAttachment" type="file" />
          </div>
          <div class="form-field">
            <label for="onboardingOwner">Người phụ trách</label>
            <select id="onboardingOwner" name="owner">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Thêm tài liệu</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Trạng thái nhân sự mới</h3>
          ${pill(employee?.name || "Chưa chọn")}
        </div>
        <div class="form-field">
          <label for="onboardingEmployee">Chọn nhân sự</label>
          <select id="onboardingEmployee" data-action="onboarding-employee">
            ${employees.map((item) => option(item.id, `${item.name} - ${departmentName(item.department)}`, item.id === employee?.id)).join("")}
          </select>
        </div>
        <div style="margin-top:12px">
          <div class="progress-track">
            <div class="progress-fill" style="width:${docs.length ? (doneCount / docs.length) * 100 : 0}%"></div>
          </div>
          <p class="subtle" style="margin-top:8px">${employee?.name || "Nhân sự"} đã hoàn thành ${doneCount}/${docs.length} tài liệu.</p>
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Checklist đọc tài liệu trên mobile</h3>
        <span class="subtle">${filteredDocs.length} tài liệu</span>
      </div>
      <div class="mobile-card-grid">
        ${filteredDocs.length ? filteredDocs.map((doc) => renderOnboardingDocCard(doc, employee?.id)).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  // 1. Onboarding Doc Form submit handler
  const form = document.getElementById("onboardingForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const file = formData.get("fileAttachment");

      let attachmentUrl = null;
      let fileName = null;

      try {
        if (file && file.size > 0) {
          showToast("Đang tải tệp đính kèm lên...");
          const uploadRes = await uploadFile(file, 'onboarding');
          if (uploadRes) {
            attachmentUrl = uploadRes.url;
            fileName = uploadRes.name;
          }
        } else if (data.attachmentUrl) {
          attachmentUrl = data.attachmentUrl.trim();
        }

        await createOnboardingDoc({
          title: data.title.trim(),
          category: data.category,
          required: data.required === "true",
          attachmentUrl,
          fileName,
          owner: data.owner,
        });

        showToast("Đã thêm tài liệu hội nhập.");
        form.reset();
        store.notify();
      } catch (err) {
        console.error('[Onboarding View] createOnboardingDoc failed:', err);
        showToast("Lỗi khi thêm tài liệu mới.", true);
      }
    });
  }

  // 2. Select onboarding employee filter dropdown
  const empSelect = document.getElementById("onboardingEmployee");
  if (empSelect) {
    empSelect.addEventListener("change", (e) => {
      selectedEmployeeId = e.target.value;
      store.notify();
    });
  }

  // 3. Mark progress reading / done buttons
  const readingBtns = document.querySelectorAll('[data-action="onboarding-reading"]');
  readingBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const employeeId = btn.dataset.employee;
      const docId = btn.dataset.doc;
      try {
        await updateOnboardingProgress(employeeId, docId, 'reading');
        showToast("Đã đánh dấu đang đọc.");
        store.notify();
      } catch (err) {
        console.error('[Onboarding View] update progress failed:', err);
        showToast("Lỗi khi cập nhật trạng thái.", true);
      }
    });
  });

  const doneBtns = document.querySelectorAll('[data-action="onboarding-done"]');
  doneBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const employeeId = btn.dataset.employee;
      const docId = btn.dataset.doc;
      try {
        await updateOnboardingProgress(employeeId, docId, 'done');
        showToast("Đã đánh dấu hoàn thành tài liệu.");
        store.notify();
      } catch (err) {
        console.error('[Onboarding View] update progress failed:', err);
        showToast("Lỗi khi cập nhật trạng thái.", true);
      }
    });
  });
}
