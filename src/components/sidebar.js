import { getNavForRole } from '../permissions.js';
import { escapeHTML } from '../utils.js';

/**
 * Dynamically render the navigation sidebar group items based on the user's role.
 * @param {string} role - The user's role (admin, hr, leader, finance, staff)
 * @returns {string} - HTML string representing navigation
 */
export function renderSidebar(role) {
  const navGroups = getNavForRole(role);
  
  return navGroups
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
}
