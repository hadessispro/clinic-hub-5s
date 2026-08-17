import { getMarketingLeads, exportLeadsToCSV } from '../services/marketing.js';
import { LEAD_STATUS } from '../constants.js';
import { escapeHTML } from '../utils.js';
import { leadStatusPill, pill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { initLeadConsultationDrawer, leadConsultationDrawer } from '../components/lead-consultation-drawer.js';

let cachedLeads = [];
let telesalePage = 1;
let telesalePageSize = 12;

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const isLeaderOrAdmin = ['admin', 'admin_marketing', 'telesale_leader'].includes(profile.role);
  
  // Filter leads assigned to current telesale staff, or all leads if leader/admin
  const filters = isLeaderOrAdmin ? {} : { assigned_telesale_id: profile.employee_code || profile.id };
  const leads = await getMarketingLeads(filters);
  cachedLeads = leads;

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
        ${isLeaderOrAdmin ? `
          <button type="button" id="btnExportTelesaleCSV" class="primary-button" style="background:#107c41; color:#ffffff; border:0; font-size:0.82rem; padding:6px 14px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; min-height:34px; cursor:pointer; font-weight:600;">
            <i class="ri-file-excel-2-line" style="font-size:1.05rem;"></i> Xuất Data Excel (CSV)
          </button>
        ` : ''}
      </div>

      <!-- Filter Toolbar -->
      <div style="margin-top:12px; padding:10px 14px; background:#f1f5f9; border-radius:10px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
        <div style="flex:1; min-width:220px; display:flex; align-items:center;">
          <input id="searchTelesaleInput" placeholder="🔍 Tìm theo Tên hoặc Số điện thoại..." style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none;" />
        </div>
        <div style="min-width:160px; display:flex; align-items:center;">
          <select id="filterTelesaleStatus" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none; cursor:pointer; font-weight:600;">
            <option value="">Tất cả Trạng thái</option>
            <option value="new">Mới nạp</option>
            <option value="contacted">Đã liên hệ</option>
            <option value="appointment_booked">Đã hẹn khám</option>
            <option value="converted">Chốt thành công</option>
            <option value="cancelled">Hủy/Thất bại</option>
          </select>
        </div>
        <div style="min-width:160px; display:flex; align-items:center;">
          <select id="filterTelesaleBranch" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none; cursor:pointer; font-weight:600;">
            <option value="">Tất cả Chi nhánh</option>
            <option value="le-van-tho">5S Lê Văn Thọ</option>
            <option value="pham-van-chieu">5S Phạm Văn Chiêu</option>
          </select>
        </div>
      </div>

      <div class="telesale-card-grid">
        ${leadsListHtml}
      </div>
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
      card.style.display = index >= start && index < end ? 'block' : 'none';
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
    document.querySelectorAll('.telesale-lead-card').forEach(card => {
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

  if (searchInput) searchInput.addEventListener('input', () => applyTelesaleFilters(true));
  if (statusSelect) statusSelect.addEventListener('change', () => applyTelesaleFilters(true));
  if (branchSelect) branchSelect.addEventListener('change', () => applyTelesaleFilters(true));
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
      const card = document.querySelector(`[data-workspace-lead="${CSS.escape(String(lead.id))}"]`);
      if (card) card.dataset.status = lead.status;
      const status = card?.querySelector('[data-workspace-lead-status]');
      if (status) status.innerHTML = leadStatusPill(lead.status);
    },
  });
}
