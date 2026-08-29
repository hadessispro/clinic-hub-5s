import { getNavForRole } from '../permissions.js';
import { escapeHTML } from '../utils.js';
import { store } from '../store.js';

const MOBILE_NAV_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5z"/></svg>',
  attendance: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>',
  schedule: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8M8 15l1.5 1.5L12 14M14 9h3M14 15h3"/></svg>',
  leave: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M16 8.5a3 3 0 0 1 0 5.8M17 15.5a4.5 4.5 0 0 1 3.5 4.5"/></svg>',
  reports: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  'system-admin': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>',
  'marketing-leads': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>',
  'telesale-management': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="11" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>',
  'telesale-workspace': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  'marketing-analytics': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

function mobileNavIcon(view) {
  return MOBILE_NAV_ICONS[view]
    || '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg>';
}

const MOBILE_NAV_LABELS = {
  dashboard: 'Tổng quan',
  attendance: 'Chấm công',
  schedule: 'Lịch làm',
  chat: 'Tin nhắn',
  'system-admin': 'Quản trị',
  reports: 'Báo cáo',
  'marketing-leads': 'Nạp Lead',
  'telesale-management': 'QL Telesale',
  'hoa-hong': 'Hoa hồng',
  'luong-pg': 'Lương PG',
  'telesale-workspace': 'Telesale',
  'marketing-analytics': 'Báo cáo MKT',
};

function mobileNavLabel(item) {
  return MOBILE_NAV_LABELS[item.view] || item.label;
}

/**
 * Dynamically render the navigation sidebar group items based on the user's role.
 * @param {string} role - The user's role (admin, hr, leader, finance, staff)
 * @returns {string} - HTML string representing navigation
 */
export function renderSidebar(role) {
  const currentView = store.getState()?.currentView || 'dashboard';
  const navGroups = getNavForRole(role);
  const desktopNavigation = navGroups
    .map((group) => {
      const hasActive = group.items.some((item) => item.view === currentView);
      const isExpanded = hasActive || group.group === 'Điều hành' || group.group === 'Marketing & Telesale';

      const itemsHtml = group.items
        .map((item) => `
          <button class="nav-item ${item.view === currentView ? 'active' : ''}" type="button" data-view="${escapeHTML(item.view)}">
            <span class="nav-icon"><i class="${escapeHTML(item.icon)}"></i></span>
            <span>${escapeHTML(item.label)}</span>
          </button>
        `)
        .join('');
        
      return `
        <div class="nav-group ${isExpanded ? 'is-open' : 'is-collapsed'}${hasActive ? ' co-man-dang-mo' : ''}">
          <button type="button" class="nav-group-title" aria-expanded="${isExpanded}">
            <div class="nav-group-title-content">
              <svg class="nav-group-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              <span>${escapeHTML(group.group)}</span>
            </div>
            <span class="nav-group-dem">${group.items.length}</span>
            <span class="nav-group-plus" title="Đóng/Mở">+</span>
          </button>
          <div class="nav-group-items">
            ${itemsHtml}
          </div>
        </div>
      `;
    })
    .join('');

  const allItems = navGroups.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.group })),
  );
  const preferredByRole = {
    admin_it: ['system-admin', 'attendance', 'schedule', 'reports'],
    telesale_leader: ['telesale-management', 'dashboard', 'marketing-analytics', 'chat'],
    telesale_staff: ['telesale-workspace', 'tasks', 'attendance', 'chat'],
    pg_staff: ['marketing-leads', 'attendance', 'pg-workflow', 'tasks'],
    admin_marketing: ['telesale-management', 'hoa-hong', 'marketing-leads', 'pg-management'],
    support_marketing: ['pg-management', 'hoa-hong', 'pg-workflow', 'pg-locations'],
  };
  const preferredViews = preferredByRole[role] || ['dashboard', 'attendance', 'schedule', 'chat'];
  const preferredItems = preferredViews
    .map((view) => allItems.find((item) => item.view === view))
    .filter(Boolean);
  const fallbackItems = allItems.filter((item) =>
    !preferredItems.some((preferred) => preferred.view === item.view),
  );
  const primaryItems = [...preferredItems, ...fallbackItems].slice(0, 4);
  const primaryViews = new Set(primaryItems.map((item) => item.view));
  const overflowItems = allItems.filter((item) => !primaryViews.has(item.view));

  const mobilePrimary = primaryItems.map((item) => `
    <button class="mobile-nav-item" type="button" data-view="${escapeHTML(item.view)}">
      <span class="mobile-nav-icon" aria-hidden="true">${mobileNavIcon(item.view)}</span>
      <span>${escapeHTML(mobileNavLabel(item))}</span>
    </button>
  `).join('');

  const mobileOverflow = overflowItems.map((item) => `
    <button class="mobile-nav-menu-item" type="button" data-view="${escapeHTML(item.view)}">
      <span class="mobile-nav-menu-icon" aria-hidden="true">${mobileNavIcon(item.view)}</span>
      <span class="mobile-nav-menu-copy">
        <strong>${escapeHTML(item.label)}</strong>
        <small>${escapeHTML(item.group)}</small>
      </span>
      <span class="mobile-nav-menu-arrow" aria-hidden="true">&rsaquo;</span>
    </button>
  `).join('');

  return `
    <div class="desktop-nav-groups">${desktopNavigation}</div>
    <div class="mobile-nav-popover" id="mobileNavPopover" hidden>
      <div class="mobile-nav-popover-head">
        <div>
          <strong>Tất cả chức năng</strong>
          <small>Chọn nhanh khu vực cần mở</small>
        </div>
        <button type="button" class="mobile-nav-close" data-mobile-nav-close aria-label="Đóng menu">&times;</button>
      </div>
      <div class="mobile-nav-menu-list">${mobileOverflow}</div>
    </div>
    <div class="mobile-nav-shell" aria-label="Điều hướng nhanh" style="--mobile-nav-count:${primaryItems.length + (overflowItems.length ? 1 : 0)}">
      ${mobilePrimary}
      ${overflowItems.length ? `
        <button class="mobile-nav-item mobile-nav-more" type="button" data-mobile-nav-toggle aria-expanded="false" aria-controls="mobileNavPopover">
          <span class="mobile-nav-icon mobile-nav-more-icon" aria-hidden="true"><i></i><i></i><i></i></span>
          <span>Thêm</span>
        </button>
      ` : ''}
    </div>
  `;
}
