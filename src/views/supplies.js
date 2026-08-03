import { getInventoryItems, createInventoryItem, updateInventoryItem, getPurchaseRequests, createPurchaseRequest, updatePurchaseRequest } from '../services/inventory.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS, LEAVE_STATUS } from '../constants.js';
import { todayISO, escapeHTML, smartMatch, departmentName, formatDateTime, formatShortDate } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedSupplies = [];
let cachedPurchaseRequests = [];

export async function renderView(state) {
  const { searchTerm } = state;

  // 1. Fetch supplies, purchase requests, and employees in parallel
  const [employees, supplies, purchaseRequests] = await Promise.all([
    getEmployees(),
    getInventoryItems(),
    getPurchaseRequests()
  ]);

  cachedEmployees = employees;
  cachedSupplies = supplies;
  cachedPurchaseRequests = purchaseRequests;

  // 2. Filter inventories & requests
  const filteredSupplies = supplies.filter(item => {
    if (!searchTerm) return true;
    return smartMatch([item.name, item.category, item.location, item.supplier, item.notes], searchTerm);
  });

  const filteredPurchaseRequests = purchaseRequests.filter(req => {
    const requesterObj = employees.find(e => e.id === req.requester);
    if (!searchTerm) return true;
    return smartMatch([req.itemName, req.category, requesterObj?.name, departmentName(req.department), req.reason, req.status], searchTerm);
  });

  const lowStock = supplies.filter(item => item.stock <= item.minStock);

  // Render Single Supply Card
  const renderSupplyCard = (item) => {
    const isLow = item.stock <= item.minStock;
    return `
      <article class="inventory-card">
        <div class="section-title">
          <h4>${escapeHTML(item.name)}</h4>
          ${statusPill(isLow ? "Cần nhập" : "Đủ tồn", isLow ? "warn" : "good")}
        </div>
        <div class="task-meta">
          ${pill(item.category)}
          ${pill(`${item.stock} ${item.unit}`)}
          ${pill(`Tối thiểu ${item.minStock}`)}
        </div>
        <p class="subtle" style="margin: 4px 0;">${escapeHTML(item.location)} · ${escapeHTML(item.supplier)}</p>
        <p class="subtle">Nhập gần nhất ${formatShortDate(item.lastImport)} · ${escapeHTML(item.notes || "Không có ghi chú")}</p>
      </article>
    `;
  };

  // Render Single Purchase Request Card
  const renderPurchaseCard = (req) => {
    const requesterObj = employees.find(e => e.id === req.requester);
    const tone = req.status === 'approved' ? 'good' : req.status === 'pending' ? 'warn' : 'bad';
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(req.itemName)}</h4>
          ${statusPill(LEAVE_STATUS[req.status] || req.status, tone)}
        </div>
        <div class="request-meta">
          ${pill(req.category)}
          ${pill(`${req.quantity} ${req.unit}`)}
          ${pill(requesterObj?.name || "Không rõ")}
          ${pill(departmentName(req.department))}
        </div>
        <p class="subtle" style="margin: 8px 0;">${escapeHTML(req.reason)}</p>
        <div class="request-actions" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
          <span class="subtle">${formatDateTime(req.createdAt)}</span>
          ${req.status === 'pending' ? `
            <div class="pill-row">
              <button class="secondary-button" type="button" data-purchase-action="approve" data-id="${escapeHTML(req.id)}" style="font-size: 11px; padding: 4px 8px;"><span>✓</span>Duyệt</button>
              <button class="danger-button" type="button" data-purchase-action="reject" data-id="${escapeHTML(req.id)}" style="font-size: 11px; padding: 4px 8px; color: var(--coral);"><span>×</span>Từ chối</button>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  };

  const deptOptionsHtml = DEPARTMENTS.map(d => option(d.id, d.name)).join('');
  const empOptionsHtml = employees.map(e => option(e.id, `${e.name} - ${departmentName(e.department)}`)).join('');
  const supplySuggestionsDatalist = supplies.map(item => `<option value="${escapeHTML(item.name)}"></option>`).join('');

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Supply & inventory</p>
        <h3>Nhập tồn, kiểm soát định mức và đề xuất mua vật tư như Beotem, ETK, Dentium hoặc nhóm niềng.</h3>
      </div>
      <div class="pill-row">
        ${statusPill(`${lowStock.length} dưới định mức`, lowStock.length ? "warn" : "good")}
        ${pill(`${purchaseRequests.filter(r => r.status === 'pending').length} đề xuất chờ duyệt`)}
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Nhập vật tư / cập nhật tồn</h3>
          ${pill("Tự cộng vào tồn nếu trùng tên")}
        </div>
        <form class="form-grid three" id="supplyImportForm">
          <div class="form-field">
            <label for="supplyItemName">Tên vật tư</label>
            <input id="supplyItemName" name="itemName" list="supplySuggestions" required placeholder="Beotem, ETK, Dentium..." autocomplete="off" />
            <datalist id="supplySuggestions">${supplySuggestionsDatalist}</datalist>
          </div>
          <div class="form-field">
            <label for="supplyCategory">Nhóm</label>
            <select id="supplyCategory" name="category">
              <option>Trụ implant</option>
              <option>Niềng</option>
              <option>Vật tư tiêu hao</option>
              <option>Dụng cụ lâm sàng</option>
            </select>
          </div>
          <div class="form-field">
            <label for="supplyQuantity">Số lượng nhập</label>
            <input id="supplyQuantity" name="quantity" type="number" min="1" value="1" />
          </div>
          <div class="form-field">
            <label for="supplyUnit">Đơn vị</label>
            <input id="supplyUnit" name="unit" value="trụ" />
          </div>
          <div class="form-field">
            <label for="supplyLocation">Vị trí lưu</label>
            <input id="supplyLocation" name="location" placeholder="Tủ implant A" />
          </div>
          <div class="form-field">
            <label for="supplySupplier">Nguồn/nhà cung ứng</label>
            <input id="supplySupplier" name="supplier" placeholder="Kho tổng" />
          </div>
          <div class="form-field full">
            <label for="supplyNotes">Ghi chú</label>
            <textarea id="supplyNotes" name="notes" placeholder="Lot, hạn dùng, lịch cần vật tư"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Nhập tồn</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Đề xuất mua</h3>
          ${pill("Gửi lên quản lý duyệt")}
        </div>
        <form class="form-grid three" id="purchaseRequestForm">
          <div class="form-field">
            <label for="purchaseItemName">Tên vật tư</label>
            <input id="purchaseItemName" name="itemName" required placeholder="VD: Dây cung NiTi" />
          </div>
          <div class="form-field">
            <label for="purchaseCategory">Nhóm</label>
            <select id="purchaseCategory" name="category">
              <option>Trụ implant</option>
              <option>Niềng</option>
              <option>Vật tư tiêu hao</option>
              <option>Dụng cụ lâm sàng</option>
            </select>
          </div>
          <div class="form-field">
            <label for="purchaseQuantity">Số lượng</label>
            <input id="purchaseQuantity" name="quantity" type="number" min="1" value="1" />
          </div>
          <div class="form-field">
            <label for="purchaseUnit">Đơn vị</label>
            <input id="purchaseUnit" name="unit" value="gói" />
          </div>
          <div class="form-field">
            <label for="purchaseRequester">Người đề xuất</label>
            <select id="purchaseRequester" name="requester">${empOptionsHtml}</select>
          </div>
          <div class="form-field">
            <label for="purchaseDepartment">Phòng ban</label>
            <select id="purchaseDepartment" name="department">${deptOptionsHtml}</select>
          </div>
          <div class="form-field full">
            <label for="purchaseReason">Lý do</label>
            <textarea id="purchaseReason" name="reason" required placeholder="Tồn dưới định mức, phục vụ lịch điều trị..."></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Gửi đề xuất mua</button>
          </div>
        </form>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Tồn kho vật tư</h3>
        <span class="subtle">${filteredSupplies.length} vật tư</span>
      </div>
      <div class="mobile-card-grid">
        ${filteredSupplies.length ? filteredSupplies.map(renderSupplyCard).join('') : emptyState()}
      </div>
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Phiếu đề xuất mua</h3>
        <span class="subtle">${filteredPurchaseRequests.length} phiếu</span>
      </div>
      <div class="grid cols-3">
        ${filteredPurchaseRequests.length ? filteredPurchaseRequests.map(renderPurchaseCard).join('') : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  // 1. Supply Import Form Submission
  const importForm = document.getElementById('supplyImportForm');
  if (importForm) {
    importForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(importForm);
      const name = formData.get('itemName').trim();
      const category = formData.get('category');
      const quantity = Number(formData.get('quantity') || 1);
      const unit = formData.get('unit');
      const location = formData.get('location');
      const supplier = formData.get('supplier');
      const notes = formData.get('notes');

      // Check if item already exists by name
      const existing = cachedSupplies.find(item => item.name.toLowerCase() === name.toLowerCase());
      
      try {
        if (existing) {
          // Increment stock of existing item
          const newStock = existing.stock + quantity;
          await updateInventoryItem(existing.id, {
            ...existing,
            stock: newStock,
            lastImport: todayISO(),
            notes: notes ? `${existing.notes}\n[${todayISO()}] ${notes}` : existing.notes
          });
          showToast(`Đã cộng thêm ${quantity} vào tồn kho của ${name}.`);
        } else {
          // Create new supply item
          await createInventoryItem({
            name,
            category,
            stock: quantity,
            minStock: category === 'Trụ implant' ? 8 : 12, // Default threshold values
            unit,
            location,
            supplier,
            lastImport: todayISO(),
            notes
          });
          showToast(`Đã thêm mới vật tư ${name} vào kho.`);
        }
        store.setView(store.getState().currentView);
      } catch (err) {
        console.error('[Supplies View] Import failed:', err);
        showToast('Lỗi khi nhập vật tư.', true);
      }
    });
  }

  // 2. Purchase Request Form Submission
  const requestForm = document.getElementById('purchaseRequestForm');
  if (requestForm) {
    requestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(requestForm);
      const itemName = formData.get('itemName').trim();
      const category = formData.get('category');
      const quantity = Number(formData.get('quantity') || 1);
      const unit = formData.get('unit');
      const requester = formData.get('requester');
      const department = formData.get('department');
      const reason = formData.get('reason');

      try {
        await createPurchaseRequest({
          itemName,
          category,
          quantity,
          unit,
          requester,
          department,
          reason,
          status: 'pending'
        });
        showToast('Đã gửi đề xuất mua vật tư.');
        store.setView(store.getState().currentView);
      } catch (err) {
        console.error('[Supplies View] Purchase request failed:', err);
        showToast('Lỗi gửi đề xuất mua.', true);
      }
    });
  }

  // 3. Approve/Reject Purchase Requests listeners
  document.querySelectorAll('[data-purchase-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.purchaseAction;
      const status = action === 'approve' ? 'approved' : 'rejected';
      const req = cachedPurchaseRequests.find(r => r.id === id);
      if (!req) return;

      try {
        await updatePurchaseRequest(id, { ...req, status });
        
        // If approved, automatically add/increment stock in inventory
        if (status === 'approved') {
          const existing = cachedSupplies.find(item => item.name.toLowerCase() === req.itemName.toLowerCase());
          if (existing) {
            await updateInventoryItem(existing.id, {
              ...existing,
              stock: existing.stock + req.quantity,
              lastImport: todayISO(),
              notes: `${existing.notes}\n[Tự động] Nhập ${req.quantity} theo đề xuất của ${req.requester}`
            });
          } else {
            await createInventoryItem({
              name: req.itemName,
              category: req.category,
              stock: req.quantity,
              minStock: req.category === 'Trụ implant' ? 8 : 12,
              unit: req.unit,
              location: 'Kho chung',
              supplier: 'Kho tổng',
              lastImport: todayISO(),
              notes: `Nhập theo đề xuất mua đã duyệt của ${req.requester}`
            });
          }
          showToast('Đã duyệt đề xuất mua và cập nhật vào kho.');
        } else {
          showToast('Đã từ chối đề xuất mua.', true);
        }
        store.setView(store.getState().currentView);
      } catch (err) {
        console.error('[Supplies View] Request status update failed:', err);
        showToast('Lỗi khi phê duyệt đề xuất.', true);
      }
    });
  });
}
