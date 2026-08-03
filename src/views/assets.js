import { getAssets, createAsset, updateAsset } from '../services/assets.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS } from '../constants.js';
import { todayISO, escapeHTML, formatShortDate, smartMatch, departmentName } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedAssets = [];

function renderAssetCard(asset) {
  const custodian = cachedEmployees.find(e => e.id === asset.custodian);
  const tone = asset.condition === "good" ? "good" : asset.condition === "maintenance" ? "warn" : "bad";
  const label = asset.condition === "good" ? "Tốt" : asset.condition === "maintenance" ? "Cần bảo trì" : "Thiếu/mất";
  return `
    <article class="inventory-card">
      <div class="section-title">
        <h4>${escapeHTML(asset.name)}</h4>
        ${statusPill(label, tone)}
      </div>
      <div class="task-meta">
        ${pill(asset.code)}
        ${pill(departmentName(asset.department))}
        ${pill(custodian?.name || "Chưa gán")}
      </div>
      <p class="subtle">${escapeHTML(asset.location)} · kiểm kê ${formatShortDate(asset.checkedAt)}</p>
      <p class="subtle">${escapeHTML(asset.notes || "Không có ghi chú")}</p>
      <div class="task-actions">
        <span class="subtle">Lưu trữ tài sản</span>
        <button class="secondary-button" type="button" data-action="asset-check" data-id="${escapeHTML(asset.id)}" data-condition="${escapeHTML(asset.condition)}"><span>✓</span>Đã kiểm kê</button>
      </div>
    </article>
  `;
}

export async function renderView(state) {
  const { searchTerm } = state;
  const [assets, employees] = await Promise.all([
    getAssets(),
    getEmployees()
  ]);

  cachedEmployees = employees;
  cachedAssets = assets;

  // Filter based on search query
  const filteredAssets = assets.filter(item => {
    if (!searchTerm) return true;
    const custodian = employees.find(e => e.id === item.custodian);
    const textToMatch = [
      item.name,
      item.code,
      departmentName(item.department),
      custodian?.name,
      item.location,
      item.condition,
      item.notes
    ].join(" ");
    return smartMatch(textToMatch, searchTerm);
  });

  const needsCareCount = assets.filter((asset) => asset.condition !== "good").length;

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Asset audit</p>
        <h3>Kiểm kê, lưu trữ và phân công người chịu trách nhiệm cho tài sản phòng khám.</h3>
      </div>
      ${statusPill(`${needsCareCount} tài sản cần chú ý`, needsCareCount ? "warn" : "good")}
    </div>

    <section class="panel">
      <div class="section-title">
        <h3>Thêm tài sản / phiếu kiểm kê</h3>
        ${pill("Lưu vị trí và người giữ")}
      </div>
      <form class="form-grid three" data-form="asset" id="assetForm">
        <div class="form-field">
          <label for="assetCode">Mã tài sản</label>
          <input id="assetCode" name="code" required placeholder="5S-GV-..." />
        </div>
        <div class="form-field">
          <label for="assetName">Tên tài sản</label>
          <input id="assetName" name="name" required placeholder="Máy, tủ, camera..." />
        </div>
        <div class="form-field">
          <label for="assetDepartment">Phòng ban</label>
          <select id="assetDepartment" name="department">
            ${DEPARTMENTS.map(d => option(d.id, d.name)).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="assetLocation">Vị trí lưu trữ</label>
          <input id="assetLocation" name="location" required placeholder="Phòng điều trị 1" />
        </div>
        <div class="form-field">
          <label for="assetCustodian">Người phụ trách</label>
          <select id="assetCustodian" name="custodian">
            ${employees.map(emp => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('')}
          </select>
        </div>
        <div class="form-field">
          <label for="assetCondition">Tình trạng</label>
          <select id="assetCondition" name="condition">
            <option value="good">Tốt</option>
            <option value="maintenance">Cần bảo trì</option>
            <option value="missing">Thiếu/mất</option>
          </select>
        </div>
        <div class="form-field full">
          <label for="assetNotes">Ghi chú kiểm kê</label>
          <textarea id="assetNotes" name="notes" placeholder="Tình trạng, ảnh/link biên bản, lưu ý bàn giao"></textarea>
        </div>
        <div class="form-field full">
          <button class="primary-button" type="submit"><span>+</span>Lưu tài sản</button>
        </div>
      </form>
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Danh sách tài sản</h3>
        <span class="subtle">${filteredAssets.length} tài sản</span>
      </div>
      <div class="mobile-card-grid animate-fade">
        ${filteredAssets.length ? filteredAssets.map(renderAssetCard).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  const assetForm = document.getElementById("assetForm");
  if (assetForm) {
    assetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(assetForm);
      const data = Object.fromEntries(formData.entries());

      try {
        await createAsset({
          code: data.code.trim(),
          name: data.name.trim(),
          department: data.department,
          location: data.location.trim(),
          custodian: data.custodian,
          condition: data.condition,
          checkedAt: todayISO(),
          notes: data.notes.trim()
        });

        showToast("Đã lưu tài sản.");
        assetForm.reset();
        store.notify();
      } catch (err) {
        console.error('[Assets View] createAsset failed:', err);
        showToast("Lỗi khi thêm tài sản.", true);
      }
    });
  }

  document.querySelectorAll("[data-action='asset-check']").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const condition = btn.dataset.condition;
      const nextCondition = condition === "missing" ? "maintenance" : condition;
      try {
        await updateAsset(id, {
          checkedAt: todayISO(),
          condition: nextCondition
        });
        showToast("Đã cập nhật ngày kiểm kê tài sản.");
        store.notify();
      } catch (err) {
        console.error('[Assets View] updateAsset failed:', err);
        showToast("Lỗi cập nhật kiểm kê.", true);
      }
    });
  });
}
