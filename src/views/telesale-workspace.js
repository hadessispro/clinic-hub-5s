import { getMarketingLeads, exportLeadsToCSV, getTelesaleDailySummary } from '../services/marketing.js';
import { LEAD_STATUS } from '../constants.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { leadStatusPill, pill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { initLeadConsultationDrawer, leadConsultationDrawer } from '../components/lead-consultation-drawer.js';
import { navigateTo } from '../router.js';

let cachedLeads = [];
let telesalePage = 1;
let telesalePageSize = 12;
let telesaleViewMode = 'cards';
let telesaleDateFrom = '';
let telesaleDateTo = '';
let telesaleDataClass = '';
let telesaleServiceGroup = '';
let telesaleServiceType = '';
let telesaleSearch = '';
const BASIC_SERVICES = ['Cạo vôi răng', 'Trám răng', 'Nhổ răng khôn', 'Thăm khám răng', 'Phục hình tháo lắp', 'Điều trị tủy', 'Tẩy trắng'];
const ADVANCED_SERVICES = ['Implant', 'Răng sứ', 'Niềng răng'];

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const isLeaderOrAdmin = ['admin', 'admin_marketing', 'telesale_leader'].includes(profile.role);
  
  // Filter leads assigned to current telesale staff, or all leads if leader/admin
  const filters = {
    ...(isLeaderOrAdmin ? {} : { assigned_telesale_id: profile.employee_code || profile.id }),
    date_from: telesaleDateFrom || undefined,
    date_to: telesaleDateTo || undefined,
    data_class: telesaleDataClass || undefined,
    service_group: telesaleServiceGroup || undefined,
    service_type: telesaleServiceType || undefined,
    search: telesaleSearch || undefined,
  };
  const [leads, quickSummary] = await Promise.all([
    getMarketingLeads(filters),
    isLeaderOrAdmin ? Promise.resolve(null) : getTelesaleDailySummary({
      date_from: telesaleDateFrom || undefined,
      date_to: telesaleDateTo || undefined,
    }),
  ]);
  cachedLeads = leads;
  const quickTotals = quickSummary?.totals || {};
  const serviceOptions = telesaleServiceGroup === 'advanced' ? ADVANCED_SERVICES : telesaleServiceGroup === 'basic' ? BASIC_SERVICES : [];

  const leadsListHtml = leads.length
    ? leads.map((lead) => {
        const creatorName = lead.created_by_name || lead.created_by_pg || 'Không xác định';
        const creatorCode = lead.created_by_pg || '';
        const creatorLabel = lead.created_by_role === 'pg_staff'
          ? `PG nhập: ${creatorName}${creatorCode ? ` · ${creatorCode}` : ''}`
          : `Nguồn nhập: ${creatorName}${creatorCode ? ` · ${creatorCode}` : ''}`;
        return `
          <article class="task-card telesale-lead-card" data-workspace-lead="${escapeHTML(lead.id)}" data-name="${escapeHTML(lead.full_name).toLowerCase()}" data-phone="${escapeHTML(lead.phone)}" data-status="${escapeHTML(lead.status)}" data-branch="${escapeHTML(lead.branch_id)}" style="border-left: 4px solid var(--teal); background:#ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border-radius:12px; padding:16px;">
            <div class="telesale-card-summary">
              <div class="telesale-card-identity">
                <h4>${escapeHTML(lead.full_name)}</h4>
                <span><i class="ri-phone-line"></i>${escapeHTML(lead.phone || 'Chưa có số điện thoại')}</span>
              </div>
              <div class="telesale-card-actions">
                <span data-workspace-lead-status>${leadStatusPill(lead.status)}</span>
                <button type="button" class="telesale-card-toggle" data-toggle-workspace-card="${escapeHTML(lead.id)}" aria-expanded="false" title="Mở nội dung chăm sóc" aria-label="Mở nội dung chăm sóc"><i class="ri-arrow-down-s-line"></i></button>
              </div>
            </div>
            <div id="workspace-card-body-${escapeHTML(lead.id)}" hidden>
            <div class="task-meta" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
              ${pill(`<i class="ri-phone-line" style="color:var(--teal-dark); margin-right:4px;"></i>${escapeHTML(lead.phone)}`, true)}
              ${pill(lead.source)}
              ${pill(lead.data_class === 'net' ? `Data net ${lead.net_level === 'advanced' ? 'chuyên sâu' : 'cơ bản'}` : 'Data thô')}
              ${pill(lead.service_interest)}
              ${pill(lead.branch_id === 'le-van-tho' ? '5S Lê Văn Thọ' : '5S Phạm Văn Chiêu')}
              ${pill(`<i class="ri-user-received-line" style="margin-right:4px"></i>${escapeHTML(creatorLabel)}`, true)}
            </div>
            <p class="subtle" style="margin:8px 0; font-size:0.86rem; color:#49544e;"><strong>Ghi chú nhu cầu:</strong> ${escapeHTML(lead.notes || 'Không có')}</p>
            <button type="button" class="primary-button" data-open-lead-consultation="${escapeHTML(lead.id)}" style="width:100%;justify-content:center;margin-top:10px"><i class="ri-customer-service-2-line"></i> Mở trình tư vấn khách hàng</button>
            </div>
          </article>
        `;
      }).join('')
    : emptyState();

  const leadTableRows = leads.length ? leads.map((lead, index) => {
    const creatorName = lead.created_by_name || lead.created_by_pg || lead.source || 'Không xác định';
    const dataLabel = lead.data_class === 'net' ? `Data net ${lead.net_level === 'advanced' ? 'chuyên sâu' : 'cơ bản'}` : 'Data thô';
    return `<tr data-workspace-lead-row="${escapeHTML(lead.id)}" data-name="${escapeHTML(lead.full_name || '').toLowerCase()}" data-phone="${escapeHTML(lead.phone || '')}" data-status="${escapeHTML(lead.status || '')}" data-branch="${escapeHTML(lead.branch_id || '')}">
      <td data-label="STT">${index + 1}</td><td data-label="Khách hàng"><strong>${escapeHTML(lead.full_name || 'Chưa có tên')}</strong><small>${escapeHTML(lead.phone || 'Chưa có SĐT')}</small></td>
      <td data-label="Phân loại"><span class="tsm-data-tag ${lead.data_class === 'net' ? 'is-net' : ''}">${escapeHTML(dataLabel)}</span></td><td data-label="Dịch vụ">${escapeHTML(lead.service_interest || 'Chưa cập nhật')}</td>
      <td data-label="Chi nhánh">${escapeHTML(lead.branch_id === 'le-van-tho' ? '5S Lê Văn Thọ' : '5S Phạm Văn Chiêu')}</td><td data-label="Trạng thái" data-workspace-lead-status>${leadStatusPill(lead.status)}</td>
      <td data-label="Nguồn nhập"><strong>${escapeHTML(creatorName)}</strong><small>${escapeHTML(lead.created_by_pg || lead.source || '')}</small></td><td data-label="Ngày tiếp nhận"><time>${formatDateTime(lead.created_at)}</time></td>
      <td data-label="Hồ sơ"><button type="button" class="secondary-button" data-open-lead-consultation="${escapeHTML(lead.id)}"><i class="ri-customer-service-2-line"></i> Tư vấn</button></td></tr>`;
  }).join('') : '<tr><td colspan="9" class="tsm-empty">Không có Lead phù hợp bộ lọc.</td></tr>';

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Telesale Workspace</p>
        <h3>Bàn làm việc Telesale: Gọi điện tư vấn, nhập nhật ký và chốt lịch hẹn khám.</h3>
      </div>
    </div>

    <section class="panel">
      <div class="section-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <h3 style="margin:0;">Danh sách Lead cần chăm sóc (${leads.length})</h3>
          <span style="font-size:0.8rem; color:#64748b;">${isLeaderOrAdmin ? "Toàn bộ Lead" : "Lead cá nhân được gán"}</span>
        </div>
        <div class="telesale-workspace-actions">
          <div class="workspace-view-toggle" aria-label="Chế độ hiển thị">
            <button type="button" data-workspace-view="cards" class="secondary-button${telesaleViewMode === 'cards' ? ' is-active' : ''}"><i class="ri-layout-grid-line"></i> Thẻ</button>
            <button type="button" data-workspace-view="sheet" class="secondary-button${telesaleViewMode === 'sheet' ? ' is-active' : ''}"><i class="ri-table-line"></i> Bảng</button>
          </div>
        ${isLeaderOrAdmin ? `
          <button type="button" id="btnExportTelesaleCSV" class="primary-button" style="background:#107c41; color:#ffffff; border:0; font-size:0.82rem; padding:6px 14px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; min-height:34px; cursor:pointer; font-weight:600;">
            <i class="ri-file-excel-2-line" style="font-size:1.05rem;"></i> Xuất Data Excel (CSV)
          </button>
        ` : ''}
        </div>
      </div>

      <!-- Filter Toolbar -->
      <div class="telesale-filter-toolbar">
        <div class="telesale-filter-main">
          <label class="telesale-filter-field telesale-filter-search">
            <span>Tìm khách hàng</span>
            <span class="telesale-search-input"><i class="ri-search-line" aria-hidden="true"></i><input id="searchTelesaleInput" value="${escapeHTML(telesaleSearch)}" placeholder="Nhập tên hoặc số điện thoại..." autocomplete="off" inputmode="search" /></span>
          </label>
          <label class="telesale-filter-field">
            <span>Trạng thái</span>
            <select id="filterTelesaleStatus">
            <option value="">Tất cả Trạng thái</option>
            <option value="new">Mới nạp</option>
            <option value="contacted">Đã liên hệ</option>
            <option value="appointment_booked">Đã hẹn khám</option>
            <option value="converted">Chốt thành công</option>
            <option value="cancelled">Hủy/Thất bại</option>
            <option value="appointment_cancelled">Khách hủy hẹn</option>
            <option value="low_quality">Khách không chất lượng (KCL)</option>
            </select>
          </label>
          <label class="telesale-filter-field">
            <span>Chi nhánh</span>
            <select id="filterTelesaleBranch">
            <option value="">Tất cả Chi nhánh</option>
            <option value="le-van-tho">5S Lê Văn Thọ</option>
            <option value="pham-van-chieu">5S Phạm Văn Chiêu</option>
            </select>
          </label>
          <label class="telesale-filter-field">
            <span>Phân loại data</span>
            <select id="filterTelesaleDataClass"><option value="">Tất cả data</option><option value="raw"${telesaleDataClass === 'raw' ? ' selected' : ''}>Data thô</option><option value="net"${telesaleDataClass === 'net' ? ' selected' : ''}>Data net</option></select>
          </label>
        </div>
        <div class="telesale-filter-advanced">
          <div class="telesale-filter-period">
            <span class="telesale-filter-caption">Ngày được giao</span>
            <label class="telesale-filter-field"><span>Từ ngày</span><input id="filterTelesaleDateFrom" type="date" value="${escapeHTML(telesaleDateFrom)}"></label>
            <label class="telesale-filter-field"><span>Đến ngày</span><input id="filterTelesaleDateTo" type="date" value="${escapeHTML(telesaleDateTo)}"></label>
          </div>
          <label class="telesale-filter-field"><span>Nhóm dịch vụ</span><select id="filterTelesaleServiceGroup"><option value="">Tất cả dịch vụ</option><option value="basic"${telesaleServiceGroup === 'basic' ? ' selected' : ''}>Dịch vụ cơ bản</option><option value="advanced"${telesaleServiceGroup === 'advanced' ? ' selected' : ''}>Dịch vụ chuyên sâu · Data net</option></select></label>
          <label class="telesale-filter-field"><span>Dịch vụ cụ thể</span><select id="filterTelesaleServiceType"${telesaleServiceGroup ? '' : ' disabled'}><option value="">Tất cả trong nhóm</option>${serviceOptions.map((serviceName) => option(serviceName, serviceName, telesaleServiceType === serviceName)).join('')}</select></label>
          <button type="button" class="secondary-button telesale-filter-reset" id="resetTelesaleAdvancedFilters"><i class="ri-restart-line"></i> Xóa bộ lọc</button>
        </div>
      </div>

      ${!isLeaderOrAdmin ? `<section class="tsm-kpis telesale-own-kpis" aria-label="Thống kê nhanh data cá nhân">
        <article><i class="ri-database-2-line"></i><div><small>Tổng data</small><strong>${Number(quickTotals.total_data || 0).toLocaleString('vi-VN')}</strong><span>${telesaleDateFrom || telesaleDateTo ? 'Được giao trong khoảng đã lọc' : 'Toàn bộ data được giao'}</span></div></article>
        <article><i class="ri-checkbox-circle-line"></i><div><small>Đã xử lý</small><strong>${Number(quickTotals.processed_total || 0).toLocaleString('vi-VN')}</strong><span>Đã đổi trạng thái và lưu</span></div></article>
        <article><i class="ri-time-line"></i><div><small>Chưa xử lý</small><strong>${Number(quickTotals.unprocessed_total || 0).toLocaleString('vi-VN')}</strong><span>Chưa có cập nhật của bạn</span></div></article>
        <article><i class="ri-hospital-line"></i><div><small>Tổng khách đến</small><strong>${Number(quickTotals.visited_total || 0).toLocaleString('vi-VN')}</strong><span>Đã đến hoặc chốt thành công</span></div></article>
        <article><i class="ri-user-unfollow-line"></i><div><small>Tổng khách KCL</small><strong>${Number(quickTotals.low_quality_total || 0).toLocaleString('vi-VN')}</strong><span>Khách không chất lượng</span></div></article>
      </section>` : ''}

      <div class="telesale-card-grid" id="telesaleCardView"${telesaleViewMode === 'sheet' ? ' hidden' : ''}>
        ${leadsListHtml}
      </div>
      <div class="table-wrap telesale-sheet-wrap" id="telesaleSheetView"${telesaleViewMode === 'cards' ? ' hidden' : ''}><table class="workspace-lead-table" data-auto-pagination="off"><colgroup><col class="workspace-col-index"><col class="workspace-col-customer"><col class="workspace-col-class"><col class="workspace-col-service"><col class="workspace-col-branch"><col class="workspace-col-status"><col class="workspace-col-source"><col class="workspace-col-date"><col class="workspace-col-action"></colgroup><thead><tr><th>STT</th><th>Khách hàng</th><th>Phân loại</th><th>Dịch vụ</th><th>Chi nhánh</th><th>Trạng thái</th><th>Nguồn nhập</th><th>Ngày tiếp nhận</th><th>Hồ sơ</th></tr></thead><tbody>${leadTableRows}</tbody></table></div>
      <div class="data-pagination" id="telesalePagination" aria-label="Phân trang danh sách Lead">
        <div class="data-pagination-summary" id="telesalePaginationSummary"></div>
        <div class="data-pagination-actions">
          <label class="data-page-size">Hiển thị
            <select id="telesalePageSize">
              ${[6, 12, 24, 48].map((size) => option(size, `${size} Lead`, telesalePageSize === size)).join('')}
            </select>
          </label>
          <button type="button" class="data-page-nav" id="telesalePrevPage" aria-label="Trang trước"><i class="ri-arrow-left-s-line"></i><span>Trước</span></button>
          <div class="data-page-numbers" id="telesalePageNumbers"></div>
          <button type="button" class="data-page-nav" id="telesaleNextPage" aria-label="Trang sau"><span>Sau</span><i class="ri-arrow-right-s-line"></i></button>
        </div>
      </div>
    </section>
    ${leadConsultationDrawer()}
  `;
}

export function initView() {
  const profile = store.getState().profile || {};

  document.querySelectorAll('[data-toggle-workspace-card]').forEach((button) => {
    button.addEventListener('click', () => {
      const body = document.getElementById(`workspace-card-body-${button.dataset.toggleWorkspaceCard}`);
      if (!body) return;
      const willOpen = body.hidden;
      body.hidden = !willOpen;
      button.setAttribute('aria-expanded', String(willOpen));
      button.title = willOpen ? 'Thu gọn nội dung chăm sóc' : 'Mở nội dung chăm sóc';
      const icon = button.querySelector('i');
      if (icon) icon.className = willOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line';
    });
  });

  const btnExport = document.getElementById('btnExportTelesaleCSV');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      if (!cachedLeads || !cachedLeads.length) {
        showToast("Không có dữ liệu Lead để xuất!", true);
        return;
      }
      exportLeadsToCSV(cachedLeads, 'Bao_cao_Telesale_Lead.csv');
      showToast("✅ Đã xuất báo cáo Telesale sang file Excel (CSV) thành công!");
    });
  }

  // Filter toolbar logic
  const searchInput = document.getElementById('searchTelesaleInput');
  const statusSelect = document.getElementById('filterTelesaleStatus');
  const branchSelect = document.getElementById('filterTelesaleBranch');
  const dateFromInput = document.getElementById('filterTelesaleDateFrom');
  const dateToInput = document.getElementById('filterTelesaleDateTo');
  const dataClassSelect = document.getElementById('filterTelesaleDataClass');
  const serviceGroupSelect = document.getElementById('filterTelesaleServiceGroup');
  const serviceTypeSelect = document.getElementById('filterTelesaleServiceType');
  const pageSizeSelect = document.getElementById('telesalePageSize');
  const previousPageButton = document.getElementById('telesalePrevPage');
  const nextPageButton = document.getElementById('telesaleNextPage');
  const pageNumbers = document.getElementById('telesalePageNumbers');
  const paginationSummary = document.getElementById('telesalePaginationSummary');

  function renderTelesalePagination(matchedCards) {
    const total = matchedCards.length;
    const totalPages = Math.max(1, Math.ceil(total / telesalePageSize));
    telesalePage = Math.min(Math.max(1, telesalePage), totalPages);
    const start = total ? (telesalePage - 1) * telesalePageSize : 0;
    const end = Math.min(start + telesalePageSize, total);

    matchedCards.forEach((card, index) => {
      card.style.display = index >= start && index < end ? '' : 'none';
    });
    if (paginationSummary) {
      paginationSummary.textContent = total
        ? `Hiển thị ${start + 1}–${end} trong ${total} Lead`
        : 'Không có Lead phù hợp';
    }
    if (previousPageButton) previousPageButton.disabled = telesalePage <= 1;
    if (nextPageButton) nextPageButton.disabled = telesalePage >= totalPages;
    if (pageNumbers) {
      const candidates = Array.from(new Set([1, telesalePage - 1, telesalePage, telesalePage + 1, totalPages]))
        .filter((page) => page >= 1 && page <= totalPages)
        .sort((a, b) => a - b);
      pageNumbers.innerHTML = candidates.map((page, index) => {
        const previous = candidates[index - 1];
        const gap = previous && page - previous > 1 ? '<span class="data-page-gap">…</span>' : '';
        return `${gap}<button type="button" class="data-page-number${page === telesalePage ? ' is-active' : ''}" data-telesale-page="${page}" aria-label="Trang ${page}" ${page === telesalePage ? 'aria-current="page"' : ''}>${page}</button>`;
      }).join('');
      pageNumbers.querySelectorAll('[data-telesale-page]').forEach((button) => {
        button.addEventListener('click', () => {
          telesalePage = Number(button.dataset.telesalePage) || 1;
          applyTelesaleFilters();
        });
      });
    }
  }

  function applyTelesaleFilters(resetPage = false) {
    if (resetPage) telesalePage = 1;
    const q = (searchInput?.value || '').trim().toLowerCase();
    const st = statusSelect?.value || '';
    const br = branchSelect?.value || '';

    const matchedCards = [];
    const selector = telesaleViewMode === 'sheet' ? '[data-workspace-lead-row]' : '.telesale-lead-card';
    document.querySelectorAll(selector).forEach(card => {
      const name = card.dataset.name || '';
      const phone = card.dataset.phone || '';
      const cardStatus = card.dataset.status || '';
      const cardBranch = card.dataset.branch || '';

      const matchQ = !q || name.includes(q) || phone.includes(q);
      const matchSt = !st || cardStatus === st;
      const matchBr = !br || cardBranch === br;

      const matches = matchQ && matchSt && matchBr;
      card.style.display = 'none';
      if (matches) matchedCards.push(card);
    });
    renderTelesalePagination(matchedCards);
  }

  let telesaleSearchTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(telesaleSearchTimer);
    telesaleSearchTimer = setTimeout(() => {
      telesaleSearch = searchInput.value.trim();
      telesalePage = 1;
      navigateTo('telesale-workspace');
    }, 260);
  });
  searchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearTimeout(telesaleSearchTimer);
    telesaleSearch = searchInput.value.trim();
    telesalePage = 1;
    navigateTo('telesale-workspace');
  });
  if (statusSelect) statusSelect.addEventListener('change', () => applyTelesaleFilters(true));
  if (branchSelect) branchSelect.addEventListener('change', () => applyTelesaleFilters(true));
  dateFromInput?.addEventListener('change', () => { telesaleDateFrom = dateFromInput.value; telesalePage = 1; navigateTo('telesale-workspace'); });
  dateToInput?.addEventListener('change', () => { telesaleDateTo = dateToInput.value; telesalePage = 1; navigateTo('telesale-workspace'); });
  dataClassSelect?.addEventListener('change', () => {
    telesaleDataClass = dataClassSelect.value;
    if (telesaleDataClass === 'raw' && telesaleServiceGroup === 'advanced') { telesaleServiceGroup = ''; telesaleServiceType = ''; }
    telesalePage = 1;
    navigateTo('telesale-workspace');
  });
  serviceGroupSelect?.addEventListener('change', () => {
    telesaleServiceGroup = serviceGroupSelect.value;
    telesaleServiceType = '';
    if (telesaleServiceGroup === 'advanced') telesaleDataClass = 'net';
    telesalePage = 1;
    navigateTo('telesale-workspace');
  });
  serviceTypeSelect?.addEventListener('change', () => { telesaleServiceType = serviceTypeSelect.value; telesalePage = 1; navigateTo('telesale-workspace'); });
  document.getElementById('resetTelesaleAdvancedFilters')?.addEventListener('click', () => { telesaleSearch = ''; telesaleDateFrom = ''; telesaleDateTo = ''; telesaleDataClass = ''; telesaleServiceGroup = ''; telesaleServiceType = ''; telesalePage = 1; navigateTo('telesale-workspace'); });
  document.querySelectorAll('[data-workspace-view]').forEach((button) => button.addEventListener('click', () => {
    telesaleViewMode = button.dataset.workspaceView === 'sheet' ? 'sheet' : 'cards';
    document.getElementById('telesaleCardView').hidden = telesaleViewMode === 'sheet';
    document.getElementById('telesaleSheetView').hidden = telesaleViewMode === 'cards';
    document.querySelectorAll('[data-workspace-view]').forEach((item) => item.classList.toggle('is-active', item === button));
    applyTelesaleFilters(true);
  }));
  pageSizeSelect?.addEventListener('change', () => {
    telesalePageSize = Number(pageSizeSelect.value) || 12;
    applyTelesaleFilters(true);
  });
  previousPageButton?.addEventListener('click', () => {
    telesalePage = Math.max(1, telesalePage - 1);
    applyTelesaleFilters();
  });
  nextPageButton?.addEventListener('click', () => {
    telesalePage += 1;
    applyTelesaleFilters();
  });
  applyTelesaleFilters();

  initLeadConsultationDrawer({
    getLead: (id) => cachedLeads.find((lead) => String(lead.id) === String(id)),
    onSaved: (lead) => {
      const index = cachedLeads.findIndex((item) => String(item.id) === String(lead.id));
      if (index >= 0) cachedLeads[index] = lead;
      document.querySelectorAll(`[data-workspace-lead="${CSS.escape(String(lead.id))}"], [data-workspace-lead-row="${CSS.escape(String(lead.id))}"]`).forEach((item) => {
        item.dataset.status = lead.status;
        const status = item.querySelector('[data-workspace-lead-status]');
        if (status) status.innerHTML = leadStatusPill(lead.status);
      });
    },
  });
}
