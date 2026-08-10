import { getNavForRole } from '../permissions.js';
import { escapeHTML } from '../utils.js';

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
  const navGroups = getNavForRole(role);
  const desktopNavigation = navGroups
    .map((group) => {
      const itemsHtml = group.items
        .map((item) => `
          <button class="nav-item" type="button" data-view="${escapeHTML(item.view)}">
            <span class="nav-icon">${escapeHTML(item.icon)}</span>
            <span>${escapeHTML(item.label)}</span>
          </button>
        `)
        .join('');
        
      return `
        <div class="nav-group">
          <p class="nav-group-title">${escapeHTML(group.group)}</p>
          ${itemsHtml}
        </div>
      `;
    })
    .join('');

  const allItems = navGroups.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.group })),
  );
  const preferredViews = role === 'admin_it'
    ? ['system-admin', 'attendance', 'schedule', 'reports']
    : ['dashboard', 'attendance', 'schedule', 'chat'];
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
