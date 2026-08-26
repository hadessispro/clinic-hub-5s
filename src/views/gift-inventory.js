import { escapeHTML, formatDateTime } from '../utils.js';
import { showToast } from '../components/toast.js';
import { getGiftOverview, getGiftMovements, createGiftItem, createGiftCategory, createGiftMovement } from '../services/gifts.js';
import { getPgAccounts } from '../services/marketing.js';
import { navigateTo } from '../router.js';
import { uploadFile } from '../services/storage.js';

let state = { page: 1, pageSize: 20, period: 'month', recipient: '', quantityMin: '', quantityMax: '', itemId: '', movementType: '', pgCode: '', dateFrom: '', dateTo: '' };
let overview = { items: [], summary: {} };
let movementPage = { data: [], meta: {} };
let pgAccounts = [];
let currentRole = '';

const labels = { stock_in: 'Nhập kho', issue: 'Trao quà', return: 'Hoàn trả', adjustment_in: 'Điều chỉnh tăng', adjustment_out: 'Điều chỉnh giảm', legacy_issue: 'Lịch sử cũ' };
const tones = { stock_in: 'in', issue: 'out', return: 'in', adjustment_in: 'in', adjustment_out: 'out', legacy_issue: 'legacy' };
const dateISO = (date) => date.toISOString().slice(0, 10);
function periodDates(period) {
  const now = new Date();
  if (period === 'today') return [dateISO(now), dateISO(now)];
  if (period === 'month') return [dateISO(new Date(now.getFullYear(), now.getMonth(), 1)), dateISO(now)];
  if (period === 'year') return [dateISO(new Date(now.getFullYear(), 0, 1)), dateISO(now)];
  return [state.dateFrom, state.dateTo];
}
function options(items, valueKey, labelFn, selected = '') {
  return items.map(item => `<option value="${escapeHTML(String(item[valueKey]))}" ${String(item[valueKey]) === String(selected) ? 'selected' : ''}>${escapeHTML(labelFn(item))}</option>`).join('');
}
function itemCard(item, manager) {
  const stock = Number(item.stock || 0); const low = stock <= Number(item.min_stock || 0);
  return `<article class="gift-item-card ${!item.active ? 'is-disabled' : ''}">
    <div class="gift-item-icon"><i class="ri-gift-2-line"></i></div>
    <div class="gift-item-copy"><span class="gift-item-code">${escapeHTML(item.code)}</span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.category_name || item.category)} · ${escapeHTML(item.unit)}</small></div>
    <div class="gift-stock-number ${low ? 'is-low' : ''}"><strong>${stock.toLocaleString('vi-VN')}</strong><span>${escapeHTML(item.unit)}</span>${low && item.active ? '<em>Sắp hết</em>' : ''}</div>
    ${manager && item.active ? `<button class="gift-quick-in" data-quick-in="${item.id}" title="Nhập thêm"><i class="ri-add-line"></i></button>` : ''}
  </article>`;
}
function row(movement) {
  const recipient = movement.recipient_name || (movement.movement_type.includes('stock') || movement.movement_type.includes('adjustment') ? 'Kho quà tặng' : 'Chưa rõ');
  const evidence = (url, name, label) => url
    ? `<a class="gift-proof" href="${escapeHTML(url)}" target="_blank" rel="noopener" title="${escapeHTML(name || label)}"><img src="${escapeHTML(url)}" alt="${escapeHTML(label)}" loading="lazy"><span>${escapeHTML(label)}</span></a>`
    : '<span class="gift-proof-empty">Chưa có</span>';
  return `<tr>
    <td><span class="gift-type ${tones[movement.movement_type] || 'legacy'}"><i class="${movement.movement_type === 'issue' ? 'ri-gift-line' : 'ri-archive-stack-line'}"></i>${escapeHTML(labels[movement.movement_type] || movement.movement_type)}</span></td>
    <td><strong>${escapeHTML(movement.item_name)}</strong><small>${escapeHTML(movement.item_code)}</small></td>
    <td class="gift-qty ${tones[movement.movement_type] === 'out' ? 'negative' : 'positive'}">${tones[movement.movement_type] === 'out' ? '−' : '+'}${Number(movement.quantity).toLocaleString('vi-VN')} ${escapeHTML(movement.unit)}</td>
    <td><strong>${escapeHTML(recipient)}</strong><small>${escapeHTML(movement.recipient_phone || '')}</small></td>
    <td><strong>${escapeHTML(movement.pg_name || movement.pg_code || 'Hệ thống')}</strong><small>${escapeHTML(movement.branch_id || '')}</small></td>
    <td>${evidence(movement.customer_image_url, movement.customer_image_name, 'Ảnh khách')}</td>
    <td>${evidence(movement.receipt_url, movement.receipt_name, 'Bill / biên lai')}</td>
    <td>${escapeHTML(formatDateTime(movement.occurred_at))}<small>${escapeHTML(movement.note || '')}</small></td>
  </tr>`;
}

export async function renderView(appState) {
  currentRole = appState.role;
  const manager = ['admin','admin_it','superadmin','admin_marketing','support_marketing'].includes(currentRole);
  const [from, to] = periodDates(state.period);
  const filters = { ...state, dateFrom: from, dateTo: to };
  [overview, movementPage] = await Promise.all([getGiftOverview(), getGiftMovements(filters)]);
  overview = overview.data;
  if (manager && !pgAccounts.length) pgAccounts = await getPgAccounts().catch(() => []);
  const summary = overview.summary || {}; const meta = movementPage.meta || {};
  const activeItems = (overview.items || []).filter(item => item.active);
  return `<div class="gift-page">
    <header class="gift-hero">
      <div><p class="eyebrow">Customer Gift Inventory</p><h2>Kho quà tặng khách hàng</h2><p>Kiểm soát tồn kho, người nhận và lịch sử trao quà trên một sổ giao dịch thống nhất.</p></div>
      <div class="gift-hero-actions">${manager ? '<button class="secondary-button" id="giftNewCategory"><i class="ri-folder-add-line"></i> Danh mục</button><button class="secondary-button" id="giftNewItem"><i class="ri-gift-2-line"></i> Thêm quà tặng</button><button class="primary-button" id="giftStockIn"><i class="ri-inbox-archive-line"></i> Nhập kho</button>' : ''}<button class="primary-button" id="giftIssue"><i class="ri-hand-heart-line"></i> Trao quà</button></div>
    </header>
    <section class="gift-summary-grid">
      <article><span><i class="ri-archive-stack-line"></i> Tổng tồn khả dụng</span><strong>${Number(summary.totalStock || 0).toLocaleString('vi-VN')}</strong><small>${summary.activeItems || 0} loại đang sử dụng</small></article>
      <article><span><i class="ri-gift-line"></i> Giao dịch trong kỳ</span><strong>${Number(meta.total || 0).toLocaleString('vi-VN')}</strong><small>Đã trao hôm nay ${Number(summary.issued_today || 0).toLocaleString('vi-VN')} lượt</small></article>
      <article class="${summary.lowStock ? 'warn' : ''}"><span><i class="ri-alarm-warning-line"></i> Cần bổ sung</span><strong>${Number(summary.lowStock || 0)}</strong><small>Chạm hoặc dưới định mức</small></article>
      <article><span><i class="ri-user-heart-line"></i> Khách đã nhận</span><strong>${Number(summary.recipients || 0).toLocaleString('vi-VN')}</strong><small>Trong lịch sử được phép xem</small></article>
    </section>
    <section class="gift-inventory-panel">
      <div class="gift-section-head"><div><h3>Danh mục quà tặng & tồn kho</h3><p>${(overview.categories || []).length} nhóm nghiệp vụ · ${activeItems.length} mặt hàng có thể sử dụng.</p></div><span>${activeItems.length} mặt hàng</span></div>
      <div class="gift-category-strip">${(overview.categories || []).map(category => { const count = activeItems.filter(item => item.category_id === category.id).length; return `<article style="--gift-category-color:${escapeHTML(category.color)}"><i class="ri-folder-5-line"></i><div><strong>${escapeHTML(category.name)}</strong><small>${count} mặt hàng</small></div></article>`; }).join('')}</div>
      <div class="gift-item-grid">${activeItems.length ? activeItems.map(item => itemCard(item, manager)).join('') : '<div class="gift-empty">Chưa có danh mục quà tặng. Support PG hãy tạo danh mục và nhập kho đầu tiên.</div>'}</div>
    </section>
    <section class="gift-ledger-panel">
      <div class="gift-section-head"><div><h3>Sổ giao dịch quà tặng</h3><p>${Number(meta.total || 0).toLocaleString('vi-VN')} giao dịch phù hợp bộ lọc</p></div></div>
      <form id="giftFilters" class="gift-filters">
        <label><span>Thời gian</span><select name="period"><option value="today" ${state.period === 'today' ? 'selected' : ''}>Hôm nay</option><option value="month" ${state.period === 'month' ? 'selected' : ''}>Tháng này</option><option value="year" ${state.period === 'year' ? 'selected' : ''}>Năm nay</option><option value="custom" ${state.period === 'custom' ? 'selected' : ''}>Tùy chọn</option></select></label>
        <label class="gift-custom-date"><span>Từ ngày</span><input type="date" name="dateFrom" value="${escapeHTML(state.dateFrom)}"></label><label class="gift-custom-date"><span>Đến ngày</span><input type="date" name="dateTo" value="${escapeHTML(state.dateTo)}"></label>
        <label><span>Người nhận</span><input name="recipient" value="${escapeHTML(state.recipient)}" placeholder="Tên hoặc số điện thoại"></label>
        <label><span>Số lượng</span><div class="gift-range"><input type="number" min="1" name="quantityMin" value="${escapeHTML(state.quantityMin)}" placeholder="Từ"><input type="number" min="1" name="quantityMax" value="${escapeHTML(state.quantityMax)}" placeholder="Đến"></div></label>
        <label><span>Quà tặng</span><select name="itemId"><option value="">Tất cả</option>${options(overview.items || [], 'id', x => x.name, state.itemId)}</select></label>
        <label><span>Loại giao dịch</span><select name="movementType"><option value="">Tất cả</option>${Object.entries(labels).map(([v,l]) => `<option value="${v}" ${state.movementType === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${manager ? `<label><span>PG thực hiện</span><select name="pgCode"><option value="">Tất cả PG</option>${options(pgAccounts, 'employee_code', x => x.full_name || x.employee_code, state.pgCode)}</select></label>` : ''}
        <button class="primary-button" type="submit"><i class="ri-filter-3-line"></i> Lọc dữ liệu</button>
      </form>
      <div class="gift-table-wrap"><table class="gift-table"><thead><tr><th>Giao dịch</th><th>Quà tặng</th><th>Số lượng</th><th>Người nhận</th><th>Người thực hiện</th><th>Ảnh khách nhận</th><th>Bill / biên lai</th><th>Thời gian & ghi chú</th></tr></thead><tbody>${movementPage.data.length ? movementPage.data.map(row).join('') : '<tr><td colspan="8"><div class="gift-empty">Không có giao dịch phù hợp bộ lọc.</div></td></tr>'}</tbody></table></div>
      <footer class="gift-pagination"><span>Trang ${meta.page || 1}/${meta.pageCount || 1} · ${meta.total || 0} giao dịch</span><div><button class="secondary-button" data-gift-page="${Math.max(1,(meta.page || 1)-1)}" ${(meta.page || 1) <= 1 ? 'disabled' : ''}>Trước</button><button class="secondary-button" data-gift-page="${Math.min(meta.pageCount || 1,(meta.page || 1)+1)}" ${(meta.page || 1) >= (meta.pageCount || 1) ? 'disabled' : ''}>Sau</button></div></footer>
    </section>
    <div id="giftModal" class="gift-modal" hidden></div>
  </div>`;
}

function modal(title, body, submitLabel, mode) {
  const root = document.getElementById('giftModal'); root.hidden = false;
  root.innerHTML = `<div class="gift-modal-card"><button class="gift-modal-close" type="button"><i class="ri-close-line"></i></button><div class="gift-modal-title"><span><i class="ri-gift-2-line"></i></span><div><p>Kho quà tặng</p><h3>${escapeHTML(title)}</h3></div></div><form id="giftModalForm" data-mode="${mode}" class="gift-modal-form">${body}<div class="gift-modal-actions"><button type="button" class="secondary-button gift-modal-close">Hủy</button><button type="submit" class="primary-button">${escapeHTML(submitLabel)}</button></div></form></div>`;
  root.querySelectorAll('.gift-modal-close').forEach(button => button.addEventListener('click', () => { root.hidden = true; }));
}
function movementFields(type, fixedItem = '') {
  const manager = currentRole !== 'pg_staff';
  const recipient = type === 'issue';
  return `<input type="hidden" name="movementType" value="${type}"><label><span>Quà tặng</span><select name="itemId" required><option value="">Chọn quà tặng</option>${options((overview.items || []).filter(x => x.active), 'id', x => `${x.name} · còn ${x.stock} ${x.unit}`, fixedItem)}</select></label><label><span>Số lượng</span><input name="quantity" type="number" min="1" value="1" required></label>${recipient ? `<label><span>Người nhận *</span><input name="recipientName" required placeholder="Họ tên khách hàng"></label><label><span>Số điện thoại</span><input name="recipientPhone" inputmode="tel" placeholder="Số điện thoại khách"></label>` : ''}${manager && recipient ? `<label><span>PG thực hiện</span><select name="pgCode"><option value="">Support trực tiếp</option>${options(pgAccounts, 'employee_code', x => x.full_name || x.employee_code)}</select></label>` : ''}${recipient ? `<div class="gift-evidence full"><label class="gift-upload"><span><i class="ri-user-smile-line"></i> Ảnh khách nhận/lấy quà *</span><input name="customerImage" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required><small>Chụp rõ khách và sản phẩm được nhận.</small></label><label class="gift-upload"><span><i class="ri-receipt-line"></i> Ảnh bill / hóa đơn *</span><input name="receiptImage" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required><small>Chụp đủ nội dung bill hoặc biên lai đối soát.</small></label></div>` : ''}<label class="full"><span>Ghi chú</span><textarea name="note" rows="3" placeholder="Chương trình, lý do hoặc thông tin đối soát"></textarea></label>`;
}

function validateEvidenceFile(file, label) {
  if (!file || !file.size) throw new Error(`Vui lòng chọn ${label}.`);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${label} phải là ảnh JPG, PNG hoặc WEBP.`);
  if (file.size > 6 * 1024 * 1024) throw new Error(`${label} không được vượt quá 6 MB.`);
}
export function initView() {
  document.getElementById('giftFilters')?.addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget); Object.keys(state).forEach(key => { if (form.has(key)) state[key] = String(form.get(key) || ''); }); state.page = 1; await navigateTo('gift-inventory'); });
  document.querySelectorAll('[data-gift-page]').forEach(button => button.addEventListener('click', async () => { state.page = Number(button.dataset.giftPage); await navigateTo('gift-inventory'); }));
  document.getElementById('giftNewCategory')?.addEventListener('click', () => modal('Tạo nhóm danh mục', `<label><span>Mã danh mục *</span><input name="code" required placeholder="VD: QUA_SU_KIEN"></label><label><span>Tên danh mục *</span><input name="name" required placeholder="Quà sự kiện"></label><label><span>Màu nhận diện</span><input name="color" type="color" value="#0f8b7c"></label><label class="full"><span>Mô tả</span><textarea name="description" rows="3"></textarea></label>`, 'Tạo danh mục', 'category'));
  document.getElementById('giftNewItem')?.addEventListener('click', () => modal('Thêm quà tặng', `<label><span>Mã quà *</span><input name="code" required placeholder="VD: VOUCHER-500K"></label><label><span>Tên quà *</span><input name="name" required placeholder="Voucher chăm sóc răng"></label><label><span>Danh mục *</span><select name="categoryId" required><option value="">Chọn danh mục</option>${options(overview.categories || [], 'id', x => x.name)}</select></label><label><span>Đơn vị</span><input name="unit" value="phần"></label><label><span>Tồn tối thiểu</span><input name="minStock" type="number" min="0" value="5"></label><label class="full"><span>Ghi chú</span><textarea name="note" rows="3"></textarea></label>`, 'Tạo quà tặng', 'item'));
  document.getElementById('giftStockIn')?.addEventListener('click', () => modal('Nhập kho quà tặng', movementFields('stock_in'), 'Xác nhận nhập kho', 'movement'));
  document.getElementById('giftIssue')?.addEventListener('click', () => modal('Trao quà cho khách hàng', movementFields('issue'), 'Ghi nhận trao quà', 'movement'));
  document.querySelectorAll('[data-quick-in]').forEach(button => button.addEventListener('click', () => modal('Nhập thêm tồn kho', movementFields('stock_in', button.dataset.quickIn), 'Xác nhận nhập kho', 'movement')));
  document.getElementById('giftModal')?.addEventListener('submit', async event => {
    if (event.target.id !== 'giftModalForm') return; event.preventDefault(); const button = event.target.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const formData = new FormData(event.target);
      const data = Object.fromEntries(formData);
      if (event.target.dataset.mode === 'category') await createGiftCategory(data);
      else if (event.target.dataset.mode === 'item') await createGiftItem(data);
      else {
        if (data.movementType === 'issue') {
          const customerImage = formData.get('customerImage');
          const receiptImage = formData.get('receiptImage');
          validateEvidenceFile(customerImage, 'ảnh khách nhận quà');
          validateEvidenceFile(receiptImage, 'ảnh bill/biên lai');
          button.textContent = 'Đang tải ảnh…';
          const [customerUpload, receiptUpload] = await Promise.all([
            uploadFile(customerImage, 'gift-evidence/customer'),
            uploadFile(receiptImage, 'gift-evidence/receipt'),
          ]);
          data.customerImageUrl = customerUpload.url;
          data.customerImageName = customerUpload.name;
          data.receiptUrl = receiptUpload.url;
          data.receiptName = receiptUpload.name;
          delete data.customerImage;
          delete data.receiptImage;
          button.textContent = 'Đang ghi nhận…';
        }
        await createGiftMovement(data);
      }
      showToast(event.target.dataset.mode === 'category' ? 'Đã tạo danh mục.' : event.target.dataset.mode === 'item' ? 'Đã tạo quà tặng.' : 'Đã ghi nhận giao dịch kho.'); document.getElementById('giftModal').hidden = true; await navigateTo('gift-inventory');
    } catch (error) { showToast(error.message || 'Không thể lưu giao dịch.', 'error'); button.disabled = false; button.textContent = event.target.dataset.mode === 'movement' ? 'Ghi nhận giao dịch' : 'Lưu'; }
  });
}
