import { getUniformLogs, createUniformLog } from '../services/uniforms.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS, UNIFORM_CATALOG } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, smartMatch, departmentName, uniformPackageFor } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedLogs = [];

function renderUniformCard(log) {
  const employee = cachedEmployees.find(e => e.id === log.employee);
  const issuer = cachedEmployees.find(e => e.id === log.issuer);
  const tone = log.status === "issued" ? "good" : log.status === "partial" ? "warn" : "bad";
  const label = log.status === "issued" ? "Đã cấp đủ" : log.status === "partial" ? "Cập nhật một phần" : "Cần kiểm tra";
  return `
    <article class="inventory-card">
      <div class="section-title">
        <h4>${escapeHTML(employee?.name || "Không rõ")}</h4>
        ${statusPill(label, tone)}
      </div>
      <div class="task-meta">
        ${pill(log.year)}
        ${pill(log.item)}
        ${pill(`${log.quantity} bộ`)}
        ${pill(`Size ${log.size}`)}
      </div>
      <p class="subtle">${escapeHTML(departmentName(employee?.department))} · cấp ngày ${formatShortDate(log.issuedAt)} · người cấp ${escapeHTML(issuer?.name || "Quản lý")}</p>
      <p class="subtle">${escapeHTML(log.note || "Không có ghi chú")}</p>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  const [logs, employees] = await Promise.all([
    getUniformLogs(),
    getEmployees()
  ]);

  cachedLogs = logs;
  cachedEmployees = employees;

  const currentYear = new Date().getFullYear();
  const yearlySummary = employees.map((employee) => {
    const issued = logs
      .filter((log) => log.employee === employee.id && Number(log.year) === currentYear)
      .reduce((sum, log) => sum + Number(log.quantity || 0), 0);
    return { employee, issued, remaining: Math.max(3 - issued, 0) };
  });

  const needMore = yearlySummary.filter((item) => item.remaining > 0);

  // Filter logs based on global search
  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const employee = employees.find(e => e.id === log.employee);
    const issuer = employees.find(e => e.id === log.issuer);
    const textToMatch = [
      employee?.name,
      employee?.role,
      departmentName(employee?.department),
      issuer?.name,
      log.year,
      log.item,
      log.quantity,
      log.size,
      log.status,
      log.note
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Uniform allocation</p>
        <h3>Nhật ký cấp phát đồng phục theo năm. Quy định mặc định: mỗi nhân sự được cấp lại 1 lần/năm, 3 bộ.</h3>
      </div>
      <div class="pill-row">
        ${pill(`${currentYear}`)}
        ${statusPill(`${needMore.length} người chưa đủ 3 bộ`, needMore.length ? "warn" : "good")}
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Cấp phát đồng phục</h3>
          ${pill("3 bộ / năm")}
        </div>
        <form class="form-grid three" data-form="uniform" id="uniformForm">
          <div class="form-field">
            <label for="uniformEmployee">Nhân sự</label>
            <select id="uniformEmployee" name="employee">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field">
            <label for="uniformYear">Năm</label>
            <input id="uniformYear" name="year" type="number" min="2024" max="2100" value="${currentYear}" />
          </div>
          <div class="form-field">
            <label for="uniformItem">Loại đồng phục</label>
            <input id="uniformItem" name="item" value="Đồng phục phòng khám" />
          </div>
          <div class="form-field">
            <label for="uniformQuantity">Số bộ cấp</label>
            <input id="uniformQuantity" name="quantity" type="number" min="1" max="3" value="3" />
          </div>
          <div class="form-field">
            <label for="uniformSize">Size</label>
            <select id="uniformSize" name="size">
              <option>XS</option>
              <option>S</option>
              <option selected>M</option>
              <option>L</option>
              <option>XL</option>
              <option>XXL</option>
            </select>
          </div>
          <div class="form-field">
            <label for="uniformIssuer">Người cấp</label>
            <select id="uniformIssuer" name="issuer">
              ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
            </select>
          </div>
          <div class="form-field full">
            <label for="uniformNote">Ghi chú</label>
            <textarea id="uniformNote" name="note" placeholder="VD: cấp mới, cấp bù size, còn thiếu 1 bộ..."></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Lưu cấp phát</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Định mức theo chức danh</h3>
          ${pill("Cấp lại hằng năm")}
        </div>
        <div class="grid animate-fade">
          ${UNIFORM_CATALOG.map((pack) => `
            <article class="mini-card">
              <strong>${escapeHTML(pack.title)}</strong>
              <span>${escapeHTML(pack.items.join(" · "))}</span>
            </article>
          `).join("")}
        </div>
        <div class="mobile-card-grid compact" style="margin-top:12px">
          ${yearlySummary.slice(0, 6).map((item) => {
            const pkg = uniformPackageFor(item.employee.department, item.employee.role);
            return `
              <article class="mini-card">
                <strong>${escapeHTML(item.employee.name)}</strong>
                <span>${escapeHTML(departmentName(item.employee.department))}</span>
                <span>${escapeHTML(pkg.items.join(" · "))}</span>
                <div class="progress-track" aria-label="Đồng phục ${escapeHTML(item.employee.name)}">
                  <div class="progress-fill" style="width:${Math.min((item.issued / 3) * 100, 100)}%"></div>
                </div>
                <small>Đã cấp ${item.issued}/3 bộ${item.remaining ? ` · còn ${item.remaining}` : ""}</small>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Bảng nhật ký cấp phát</h3>
        <span class="subtle">${filteredLogs.length} dòng</span>
      </div>
      <div class="mobile-card-grid">
        ${filteredLogs.length ? filteredLogs.map(renderUniformCard).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  const form = document.getElementById("uniformForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      
      const year = Number(data.year);
      const quantity = Number(data.quantity);

      const issuedThisYear = cachedLogs
        .filter((log) => log.employee === data.employee && Number(log.year) === year)
        .reduce((sum, log) => sum + Number(log.quantity || 0), 0);

      try {
        await createUniformLog({
          employee: data.employee,
          year,
          item: data.item.trim() || "Đồng phục phòng khám",
          quantity,
          size: data.size,
          issuedAt: todayISO(),
          issuer: data.issuer,
          status: issuedThisYear + quantity >= 3 ? "issued" : "partial",
          note: data.note.trim() || `Cấp ${quantity}/3 bộ trong năm ${year}.`,
        });

        showToast(issuedThisYear + quantity > 3 ? "Đã lưu cấp phát. Lưu ý vượt định mức 3 bộ/năm." : "Đã lưu nhật ký cấp phát đồng phục.", issuedThisYear + quantity > 3);
        form.reset();
        store.notify();
      } catch (err) {
        console.error('[Uniforms View] createUniformLog failed:', err);
        showToast("Lỗi khi thêm nhật ký cấp phát.", true);
      }
    });
  }
}
