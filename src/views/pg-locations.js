import {
  createPgSite, deletePgSite, getPgSites, searchPgLocations, updatePgSite,
} from '../services/marketing.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/app-dialog.js';
import { navigateTo } from '../router.js';
import { escapeHTML } from '../utils.js';

let sites = [];

function selectLocation(form, location) {
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!form || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  form.elements.latitude.value = String(latitude);
  form.elements.longitude.value = String(longitude);
  form.elements.address.value = location.address || `GPS ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  if (!form.elements.name.value.trim()) form.elements.name.value = location.name || '';
  const query = document.getElementById('pgLocationQuery');
  if (query) query.value = location.name || location.address || query.value;
  const preview = document.getElementById('pgMapPreview');
  if (preview) {
    const mapUrl = `https://maps.google.com/maps?q=${latitude},${longitude}&z=17&output=embed`;
    preview.classList.remove('is-empty');
    preview.innerHTML = `<iframe title="Bản đồ điểm chấm công PG" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${mapUrl}"></iframe><a href="https://www.google.com/maps?q=${latitude},${longitude}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> Mở trên Google Maps</a>`;
  }
  document.getElementById('pgLocationResults')?.setAttribute('hidden', '');
}

function savedSitesHtml() {
  if (!sites.length) return '<div class="empty-state"><strong>Chưa có địa điểm đã lưu</strong><p>Hãy tìm địa chỉ hoặc dùng GPS để tạo điểm chấm công đầu tiên.</p></div>';
  return sites.map((site) => `<article>
    <div><strong>${escapeHTML(site.name)}</strong><p>${escapeHTML(site.address)}</p><small>Bán kính ${site.allowed_radius_m} m · GPS ±${site.max_accuracy_m} m</small></div>
    <div class="pg-saved-site-actions">
      <button class="secondary-button" type="button" data-use-pg-site="${site.id}">Dùng lại</button>
      <button class="secondary-button" type="button" data-edit-pg-site="${site.id}"><i class="ri-edit-line"></i> Sửa</button>
      <button class="danger-button" type="button" data-delete-pg-site="${site.id}"><i class="ri-delete-bin-line"></i> Xóa</button>
    </div>
  </article>`).join('');
}

export async function renderView() {
  sites = await getPgSites();
  return `
    <div class="view-header"><div><p class="eyebrow">PG ATTENDANCE LOCATIONS</p><h3>Quản lý địa điểm chấm công PG</h3><p class="subtle">Tạo, kiểm tra và cập nhật các vị trí do Support phân công cho PG.</p></div><span class="pill">${sites.length} địa điểm</span></div>
    <div class="grid cols-2 pg-location-workspace">
      <section class="panel">
        <div class="section-title"><div><h3>Thiết lập địa điểm</h3><p class="subtle">Tìm địa chỉ hoặc dùng GPS, không cần nhập tọa độ.</p></div><span class="pill">Admin & Support</span></div>
        <form id="pgSiteForm" class="pg-site-form">
          <input name="editingSiteId" type="hidden">
          <div class="pg-location-search-row">
            <label class="form-field"><span>Tìm địa điểm</span><input id="pgLocationQuery" placeholder="VD: Emart Phan Văn Trị, Gò Vấp" autocomplete="off"></label>
            <button id="searchPgLocation" class="secondary-button" type="button"><i class="ri-search-line"></i> Tìm</button>
            <button id="usePgCurrentLocation" class="secondary-button" type="button"><i class="ri-map-pin-user-line"></i> GPS hiện tại</button>
          </div>
          <div id="pgLocationResults" class="pg-location-results" hidden></div>
          <div id="pgMapPreview" class="pg-map-preview is-empty"><div><i class="ri-map-2-line"></i><strong>Chưa chọn vị trí</strong><span>Tìm địa chỉ hoặc dùng GPS thiết bị để xem bản đồ.</span></div></div>
          <div class="form-grid two pg-compact-form">
            <label class="form-field"><span>Tên điểm làm việc</span><input name="name" required placeholder="Booth PG Gò Vấp"></label>
            <label class="form-field"><span>Địa chỉ đã chọn</span><input name="address" required readonly></label>
            <input name="latitude" type="hidden" required><input name="longitude" type="hidden" required>
            <details class="pg-location-advanced full"><summary>Thiết lập GPS nâng cao</summary><div class="form-grid two">
              <label class="form-field"><span>Bán kính hợp lệ (m)</span><input name="allowedRadiusM" type="number" value="100" min="20" max="500"></label>
              <label class="form-field"><span>Sai số GPS tối đa (m)</span><input name="maxAccuracyM" type="number" value="100" min="10" max="200"></label>
            </div></details>
          </div>
          <div class="pg-site-form-actions"><button class="secondary-button" id="cancelPgSiteEdit" type="button" hidden>Hủy chỉnh sửa</button><button class="primary-button pg-save-site-button" type="submit"><i class="ri-map-pin-add-line"></i> <span>Lưu điểm chấm công</span></button></div>
        </form>
      </section>
      <section class="panel pg-saved-sites">
        <div class="section-title"><div><h3>Địa điểm đã lưu</h3><p class="subtle">Dùng lại, chỉnh sửa hoặc ngừng sử dụng địa điểm.</p></div><span class="pill">${sites.length} điểm</span></div>
        <div class="pg-saved-site-list">${savedSitesHtml()}</div>
      </section>
    </div>`;
}

async function refresh(message) {
  if (message) showToast(message);
  await navigateTo('pg-locations');
}

export function initView() {
  const form = document.getElementById('pgSiteForm');
  const query = document.getElementById('pgLocationQuery');
  const results = document.getElementById('pgLocationResults');
  const saveLabel = form?.querySelector('.pg-save-site-button span');
  const cancel = document.getElementById('cancelPgSiteEdit');
  let timer;
  let visibleResults = [];

  const resetForm = () => {
    form?.reset();
    if (form?.elements.editingSiteId) form.elements.editingSiteId.value = '';
    if (saveLabel) saveLabel.textContent = 'Lưu điểm chấm công';
    if (cancel) cancel.hidden = true;
    results?.setAttribute('hidden', '');
    const preview = document.getElementById('pgMapPreview');
    if (preview) { preview.className = 'pg-map-preview is-empty'; preview.innerHTML = '<div><i class="ri-map-2-line"></i><strong>Chưa chọn vị trí</strong><span>Tìm địa chỉ hoặc dùng GPS thiết bị để xem bản đồ.</span></div>'; }
  };
  const loadSite = (site, editing) => {
    if (!form || !site) return;
    form.elements.editingSiteId.value = editing ? site.id : '';
    form.elements.name.value = site.name || '';
    form.elements.allowedRadiusM.value = site.allowed_radius_m || 100;
    form.elements.maxAccuracyM.value = site.max_accuracy_m || 100;
    selectLocation(form, site);
    if (saveLabel) saveLabel.textContent = editing ? 'Lưu thay đổi' : 'Lưu điểm chấm công';
    if (cancel) cancel.hidden = !editing;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const renderResults = (rows) => {
    visibleResults = rows;
    results.hidden = false;
    results.innerHTML = rows.length ? rows.map((row, index) => `<button type="button" data-location-index="${index}"><i class="ri-map-pin-line"></i><span><strong>${escapeHTML(row.name || 'Địa điểm')}</strong><small>${escapeHTML(row.address || '')}</small></span><i class="ri-arrow-right-s-line"></i></button>`).join('') : '<p class="subtle">Không tìm thấy địa điểm phù hợp.</p>';
    results.querySelectorAll('[data-location-index]').forEach((button) => button.addEventListener('click', () => selectLocation(form, visibleResults[Number(button.dataset.locationIndex)])));
  };
  const search = async () => {
    const value = query?.value.trim();
    if (!value || value.length < 2) return results?.setAttribute('hidden', '');
    try { renderResults(await searchPgLocations(value)); } catch (error) { showToast(error.message, true); }
  };

  document.getElementById('searchPgLocation')?.addEventListener('click', search);
  query?.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 250); });
  query?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } });
  document.getElementById('usePgCurrentLocation')?.addEventListener('click', () => {
    if (!navigator.geolocation) return showToast('Thiết bị không hỗ trợ định vị.', true);
    const button = document.getElementById('usePgCurrentLocation'); button.disabled = true;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      selectLocation(form, { latitude: coords.latitude, longitude: coords.longitude, name: 'Điểm làm việc PG', address: `Vị trí GPS (${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})` });
      if (form?.elements.maxAccuracyM) form.elements.maxAccuracyM.value = String(Math.max(30, Math.min(200, Math.ceil(coords.accuracy || 100))));
      button.disabled = false;
    }, (error) => { button.disabled = false; showToast(error.message || 'Không lấy được GPS.', true); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(form).entries());
    if (!data.latitude || !data.longitude) return showToast('Hãy tìm và chọn một vị trí trên bản đồ trước.', true);
    const id = data.editingSiteId; delete data.editingSiteId;
    try { if (id) await updatePgSite(id, data); else await createPgSite(data); await refresh(id ? 'Đã cập nhật địa điểm chấm công.' : 'Đã lưu địa điểm chấm công PG.'); } catch (error) { showToast(error.message, true); }
  });
  cancel?.addEventListener('click', resetForm);
  document.querySelectorAll('[data-use-pg-site]').forEach((button) => button.addEventListener('click', () => loadSite(sites.find((site) => String(site.id) === button.dataset.usePgSite), false)));
  document.querySelectorAll('[data-edit-pg-site]').forEach((button) => button.addEventListener('click', () => loadSite(sites.find((site) => String(site.id) === button.dataset.editPgSite), true)));
  document.querySelectorAll('[data-delete-pg-site]').forEach((button) => button.addEventListener('click', async () => {
    const site = sites.find((item) => String(item.id) === button.dataset.deletePgSite);
    if (!site || !await confirmAction(`Xóa địa điểm “${site.name}”?`, { title: 'Xóa địa điểm PG', confirmText: 'Xóa địa điểm', tone: 'danger' })) return;
    try { await deletePgSite(site.id); await refresh('Đã xóa địa điểm chấm công.'); } catch (error) { showToast(error.message, true); }
  }));
}
