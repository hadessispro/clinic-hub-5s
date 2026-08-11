const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZES = [15, 30, 50, 100];
let activePaginators = [];

function visibleToFeatureFilters(row) {
  return row.style.display !== 'none'
    && !row.hidden
    && !row.classList.contains('hidden')
    && !row.classList.contains('is-filtered-out');
}

function pageCandidates(current, total) {
  return Array.from(new Set([1, current - 1, current, current + 1, total]))
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
}

function attachTablePagination(table) {
  const body = table.tBodies?.[0];
  if (!body || table.dataset.autoPagination === 'off' || table.dataset.paginationManaged === 'true') return null;
  table.dataset.paginationManaged = 'true';

  let currentPage = 1;
  let pageSize = DEFAULT_PAGE_SIZE;
  let refreshQueued = false;

  const pagination = document.createElement('div');
  pagination.className = 'data-pagination auto-table-pagination';
  pagination.innerHTML = `
    <div class="data-pagination-summary"></div>
    <div class="data-pagination-actions">
      <label class="data-page-size">Hiển thị
        <select>${PAGE_SIZES.map((size) => `<option value="${size}"${size === pageSize ? ' selected' : ''}>${size} dòng</option>`).join('')}</select>
      </label>
      <button type="button" class="data-page-nav" data-page-previous aria-label="Trang trước"><i class="ri-arrow-left-s-line"></i><span>Trước</span></button>
      <div class="data-page-numbers"></div>
      <button type="button" class="data-page-nav" data-page-next aria-label="Trang sau"><span>Sau</span><i class="ri-arrow-right-s-line"></i></button>
    </div>`;

  const host = table.closest('.table-wrap') || table;
  host.insertAdjacentElement('afterend', pagination);
  const summary = pagination.querySelector('.data-pagination-summary');
  const numbers = pagination.querySelector('.data-page-numbers');
  const sizeSelect = pagination.querySelector('select');
  const previous = pagination.querySelector('[data-page-previous]');
  const next = pagination.querySelector('[data-page-next]');

  function refresh(resetPage = false) {
    if (!table.isConnected) return;
    if (resetPage) currentPage = 1;
    const allRows = [...body.rows];
    const rows = allRows.filter(visibleToFeatureFilters);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = total ? (currentPage - 1) * pageSize : 0;
    const end = Math.min(start + pageSize, total);

    allRows.forEach((row) => { row.classList.add('is-pagination-hidden'); });
    rows.forEach((row, index) => {
      row.classList.toggle('is-pagination-hidden', !(index >= start && index < end));
    });
    pagination.hidden = total <= pageSize;
    summary.textContent = total ? `Hiển thị ${start + 1}–${end} trong ${total} dòng` : 'Không có dữ liệu phù hợp';
    previous.disabled = currentPage <= 1;
    next.disabled = currentPage >= totalPages;

    const candidates = pageCandidates(currentPage, totalPages);
    numbers.innerHTML = candidates.map((page, index) => {
      const last = candidates[index - 1];
      const gap = last && page - last > 1 ? '<span class="data-page-gap">…</span>' : '';
      return `${gap}<button type="button" class="data-page-number${page === currentPage ? ' is-active' : ''}" data-page="${page}" ${page === currentPage ? 'aria-current="page"' : ''}>${page}</button>`;
    }).join('');
    numbers.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page) || 1;
      refresh();
    }));
  }

  function queueRefresh(resetPage = true) {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      refresh(resetPage);
    });
  }

  sizeSelect.addEventListener('change', () => {
    pageSize = Number(sizeSelect.value) || DEFAULT_PAGE_SIZE;
    refresh(true);
  });
  previous.addEventListener('click', () => {
    currentPage = Math.max(1, currentPage - 1);
    refresh();
  });
  next.addEventListener('click', () => {
    currentPage += 1;
    refresh();
  });

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => mutation.type === 'childList'
      || (mutation.type === 'attributes' && ['style', 'hidden'].includes(mutation.attributeName)));
    if (relevant) queueRefresh(true);
  });
  observer.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] });
  refresh();

  return {
    destroy() {
      observer.disconnect();
      [...body.rows].forEach((row) => row.classList.remove('is-pagination-hidden'));
      pagination.remove();
      delete table.dataset.paginationManaged;
    },
  };
}

export function initAutomaticDataPagination(root = document) {
  destroyAutomaticDataPagination();
  activePaginators = [...root.querySelectorAll('table')]
    .map(attachTablePagination)
    .filter(Boolean);
}

export function destroyAutomaticDataPagination() {
  activePaginators.forEach((paginator) => paginator.destroy());
  activePaginators = [];
}
