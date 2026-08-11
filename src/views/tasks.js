import { getTasks, createTask, updateTask, deleteTask } from '../services/tasks.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS, TASK_STATUS } from '../constants.js';
import { todayISO, escapeHTML, smartMatch, departmentName } from '../utils.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { notifyDataChange } from '../services/marketing.js';

let cachedEmployees = [];
let cachedTasks = [];
let customTabs = ['Tất cả lịch', 'Cuộc họp', 'Sự kiện', 'Trùng lịch'];
let activeTab = 'Tất cả lịch';
let currentWeekOffset = 0;
let selectedDept = 'all';
let searchKeyword = '';
let editingTaskId = null;
let editingFeaturedId = null;

const DEFAULT_FEATURED_CARDS = [
  { id: 'f1', title: 'Weekly Team Meeting', time: '🕒 3:00 PM - 4:30 PM · Phòng Họp 5S', badge: '🟢 Realtime Active', badgeColor: '#10b981', actionText: 'Tham gia trao đổi' },
  { id: 'f2', title: 'Tổng số công việc tuần này', time: 'Đã ghi nhận task trên hệ thống', badge: '📊 Live Database', badgeColor: '#087f7b', actionText: 'Đồng bộ Supabase' },
  { id: 'f3', title: 'Thông Báo Realtime', time: 'Khi gán task, nhân viên nhận alert tức thì', badge: '🔔 Tự động', badgeColor: '#3b82f6', actionText: 'Kích hoạt Broadcast' },
];

function getStoredFeaturedCards() {
  try {
    const stored = localStorage.getItem('clinic_featured_cards');
    if (stored) return JSON.parse(stored);
  } catch (e) { console.warn('Load featured cards error:', e); }
  return DEFAULT_FEATURED_CARDS;
}

function saveStoredFeaturedCards(cards) {
  try {
    localStorage.setItem('clinic_featured_cards', JSON.stringify(cards));
  } catch (e) { console.warn('Save featured cards error:', e); }
}

let featuredCards = getStoredFeaturedCards();

function getWeekDates(offsetInWeeks = 0) {
  const now = new Date();
  const currentDay = now.getDay();
  const diffToMonday = now.getDate() - currentDay + (currentDay === 0 ? -6 : 1) + (offsetInWeeks * 7);
  
  const monday = new Date(now.setDate(diffToMonday));
  const week = [];
  const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateStr = day.toISOString().split('T')[0];
    const formatted = `${day.getDate().toString().padStart(2, '0')}/${(day.getMonth() + 1).toString().padStart(2, '0')}`;
    week.push({
      dateStr,
      label: `${dayNames[i]} (${formatted})`,
      isToday: new Date().toISOString().split('T')[0] === dateStr
    });
  }
  return week;
}

function isTaskInCell(t, dateStr, hourStr) {
  if (t.due !== dateStr) return false;
  if (t.hour && t.hour === hourStr) return true;
  if (t.notes) {
    if (t.notes.includes(`lúc ${hourStr}`) || t.notes.includes(`(${hourStr})`) || t.notes.includes(`[Giờ: ${hourStr}]`) || t.notes.includes(hourStr)) {
      return true;
    }
  }
  if (t.title) {
    if (t.title.includes(`(${hourStr})`) || t.title.includes(hourStr)) {
      return true;
    }
  }
  // If task has NO hour specified anywhere, only show if hourStr is '9 AM' AND task has no other hour string in notes
  if (!t.hour && !t.notes?.match(/\d+\s*(AM|PM)/i) && !t.title?.match(/\d+\s*(AM|PM)/i)) {
    return hourStr === '9 AM';
  }
  return false;
}

export async function renderView(state) {
  const { searchTerm, role } = state;
  const canManageTasks = ['admin', 'hr', 'admin_it', 'leader', 'admin_marketing', 'telesale_leader'].includes(role);

  const [employees, allTasks] = await Promise.all([
    getEmployees(),
    getTasks()
  ]);

  cachedEmployees = employees;
  cachedTasks = allTasks;

  const weekDays = getWeekDates(currentWeekOffset);
  const weekRangeLabel = `${weekDays[0].label.split(' ')[1]} - ${weekDays[6].label.split(' ')[1]}`;
  const hours = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'];

  // Filter tasks
  const effectiveSearch = searchKeyword || searchTerm || '';
  const filteredTasks = allTasks.filter(t => {
    if (selectedDept !== 'all' && t.department !== selectedDept) return false;
    if (!effectiveSearch) return true;
    const assigneeObj = employees.find(e => e.id === t.assignee);
    return smartMatch([t.title, t.notes, departmentName(t.department), assigneeObj?.name], effectiveSearch);
  });

  // Dynamic Featured Top Cards HTML
  const featuredCardsHtml = `
    <div style="margin-bottom:14px;">
      <div class="featured-events-header">
        <h4 style="margin:0; font-size:0.95rem; font-weight:700; color:#0f172a;">Sự kiện & Tiêu điểm quan trọng</h4>
        ${canManageTasks ? `<button type="button" class="secondary-button" id="btnAddFeaturedCard" style="padding:4px 10px; font-size:0.75rem;"><i class="ri-add-line"></i> Thêm thẻ sự kiện</button>` : ''}
      </div>
      <div class="featured-events-row" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
        ${featuredCards.map(c => `
          <article class="featured-event-card" style="border-left:4px solid ${c.badgeColor || '#0f172a'};">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <h4 style="margin:0; font-size:0.92rem; font-weight:700; color:#0f172a;">${escapeHTML(c.title)}</h4>
              <span style="padding:2px 8px; background:#f1f5f9; color:${c.badgeColor || '#0f172a'}; font-size:0.72rem; font-weight:700; border-radius:12px;">${escapeHTML(c.badge)}</span>
            </div>
            <p style="margin:6px 0 8px; font-size:0.78rem; color:#64748b;">${escapeHTML(c.time)}</p>
            <div class="featured-card-actions" style="display:flex; align-items:center; justify-content:space-between;">
              <span class="status-pill neutral" style="font-size:0.72rem;">${escapeHTML(c.actionText)}</span>
              ${canManageTasks ? `
                <div style="display:flex; gap:4px;">
                  <button type="button" class="icon-btn-action" data-edit-featured="${c.id}" title="Chỉnh sửa thẻ"><i class="ri-pencil-line"></i></button>
                  <button type="button" class="icon-btn-action danger" data-delete-featured="${c.id}" title="Xóa thẻ"><i class="ri-delete-bin-6-line"></i></button>
                </div>
              ` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    </div>
  `;

  // Staff Drag Sidebar with Full Role Hierarchy + Smart Search
  const staffSidebarHtml = `
    <div class="staff-drag-sidebar" id="staffSidebarPanel">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:6px;">
        <h4 style="margin:0; font-size:0.9rem; font-weight:700; color:#0f172a;">Đội ngũ (${employees.length})</h4>
        <div style="display:flex; gap:6px; align-items:center;">
          ${canManageTasks ? `<button class="primary-button" type="button" id="btnOpenCreateTaskModal" style="padding:4px 10px; font-size:0.75rem;">+ Tạo task</button>` : ''}
          <button type="button" class="icon-button staff-sidebar-toggle-btn" id="btnToggleStaffList" title="Thu gọn / Mở rộng" style="font-size:0.85rem; padding:4px 8px;">▼</button>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <input type="search" id="staffSearchInput" placeholder="🔍 Tìm tên nhân sự..." style="width:100%; padding:7px 12px; border:1px solid #cbd5e1; border-radius:20px; font-size:0.78rem; box-sizing:border-box; background:#f8fafc;" />
      </div>
      <p style="font-size:0.72rem; color:#94a3b8; margin:0 0 8px;">Kéo thả nhân viên vào ô giờ bên phải hoặc bấm trực tiếp ô giờ:</p>
      
      <div class="staff-list-container" id="staffListContainer" style="max-height:420px; overflow-y:auto; padding-right:4px;">
        ${employees.map(emp => `
          <div class="staff-drag-item" draggable="true" data-staff-id="${escapeHTML(emp.id)}" data-staff-name="${escapeHTML(emp.name)}" data-staff-search="${escapeHTML((emp.name + ' ' + (emp.role || '')).toLowerCase())}">
            <div style="width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg, #0f172a 0%, #334155 100%); color:#ffffff; font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${escapeHTML(emp.name.trim().charAt(0))}
            </div>
            <div style="flex:1; overflow:hidden;">
              <div style="font-size:0.8rem; font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(emp.name)}</div>
              <div style="font-size:0.7rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(emp.role || 'Nhân viên')}</div>
            </div>
            <i class="ri-drag-move-fill" style="color:#94a3b8; font-size:0.9rem;"></i>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const gridTableHtml = `
    <div class="calendar-weekly-grid">
      <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
        <thead>
          <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1;">
            <th style="width:70px; padding:10px; font-size:0.78rem; text-align:center; color:#475569;">GIỜ</th>
            ${weekDays.map(d => `<th style="padding:10px; font-size:0.78rem; text-align:center; color:#0f172a; font-weight:700; ${d.isToday ? 'background:#e0f2fe;' : ''}">${escapeHTML(d.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${hours.map(h => `
            <tr>
              <td style="padding:10px; font-size:0.78rem; font-weight:700; color:#64748b; text-align:center; border-right:1px solid #e2e8f0; border-bottom:1px solid #f1f5f9; background:#fafafa;">
                ${h}
              </td>
              ${weekDays.map(d => {
                const cellTasks = filteredTasks.filter(t => isTaskInCell(t, d.dateStr, h));
                return `
                  <td class="calendar-time-cell" data-date="${d.dateStr}" data-hour="${h}" style="cursor:pointer;" title="Bấm vào ô này để tạo công việc mới">
                    ${cellTasks.map(t => {
                      const assigneeObj = employees.find(e => e.id === t.assignee);
                      return `
                        <div class="calendar-event-block green" data-task-id="${escapeHTML(t.id)}" title="Nhấp để xem, chỉnh sửa hoặc xóa công việc">
                          <span class="event-quick-delete" data-quick-delete-task="${escapeHTML(t.id)}" title="Xóa nhanh công việc này">✕</span>
                          <div style="font-weight:700; padding-right:16px;">${escapeHTML(t.title)}</div>
                          <div style="font-size:0.7rem; opacity:0.9;">👤 ${escapeHTML(assigneeObj?.name || 'Chưa gán')}</div>
                          ${t.notes ? `<div style="font-size:0.68rem; opacity:0.85; font-style:italic;">📝 ${escapeHTML(t.notes)}</div>` : ''}
                        </div>
                      `;
                    }).join('')}
                  </td>
                `;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const tabsHtml = customTabs.map((tab, idx) => `
    <button type="button" class="calendar-tab-btn ${activeTab === tab ? 'active' : ''}" data-tab-name="${escapeHTML(tab)}">
      ${escapeHTML(tab)}
      ${idx > 0 ? `<span class="tab-delete-btn" data-delete-tab="${idx}" title="Xóa tab">✕</span>` : ''}
    </button>
  `).join('');

  return `
    <div class="calendar-schedule-container">
      <div class="view-header" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <p class="eyebrow">Realtime Task Schedule & Team Allocation Matrix</p>
          <h3>Bảng Lịch Trình Công Việc Realtime & Phân Bổ Đội Ngũ</h3>
        </div>
        ${canManageTasks ? `
          <button class="primary-button" type="button" id="btnHeaderCreateTask">
            <span>+</span>Tạo lịch công việc mới
          </button>
        ` : ''}
      </div>

      <!-- Toolbar with Smart Search Bar & Filters -->
      <div class="calendar-top-bar">
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div class="calendar-category-tabs" style="display:flex; align-items:center; gap:8px;">
            ${tabsHtml}
            ${canManageTasks ? `<button type="button" class="calendar-tab-btn" id="btnAddCustomTab" style="border-style:dashed;">+ Thêm Tab</button>` : ''}
          </div>

          <div style="position:relative; min-width:200px;">
            <input type="search" id="taskSmartSearch" value="${escapeHTML(searchKeyword)}" placeholder="🔍 Tìm nhân viên, công việc..." style="padding:6px 12px; border:1px solid #cbd5e1; border-radius:20px; font-size:0.78rem; width:100%;" />
          </div>

          <label style="font-size:0.8rem; font-weight:700; color:#475569; display:flex; align-items:center; gap:6px;">
            Phòng ban:
            <select id="taskFilterDept" style="padding:4px 8px; border-radius:6px; font-size:0.78rem;">
              <option value="all">Tất cả phòng ban</option>
              ${DEPARTMENTS.map(d => `<option value="${d.id}" ${selectedDept === d.id ? 'selected' : ''}>${escapeHTML(d.name)}</option>`).join('')}
            </select>
          </label>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" class="icon-button" id="btnPrevWeek" title="Tuần trước">‹</button>
          <span style="font-size:0.82rem; font-weight:700; color:#0f172a;">Tuần ${weekRangeLabel}</span>
          <button type="button" class="icon-button" id="btnNextWeek" title="Tuần sau">›</button>
          <button class="secondary-button" type="button" id="btnTodayWeek" style="padding:4px 10px; font-size:0.78rem;">Hôm nay</button>
        </div>
      </div>

      ${featuredCardsHtml}

      <div class="calendar-grid-layout">
        ${staffSidebarHtml}
        ${gridTableHtml}
      </div>
    </div>

    <!-- Create / Edit Task Modal -->
    <div id="taskModal" class="modal-backdrop">
      <div style="background:#ffffff; border-radius:14px; padding:22px; width:90%; max-width:520px; box-shadow:0 10px 25px rgba(0,0,0,0.2); position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:1.1rem;" id="modalTitle">Tạo Lịch Phân Bổ Công Việc Mới</h3>
          <button type="button" id="btnCloseTaskModal" class="icon-button" style="border:none; font-size:1.2rem; cursor:pointer;">✕</button>
        </div>
        <form id="modalCreateTaskForm" class="form-grid">
          <input type="hidden" name="taskId" id="modalTaskId" value="" />
          <div class="form-field full">
            <label>Tên công việc / cuộc họp</label>
            <input name="title" id="inputTaskTitle" required placeholder="VD: Họp giao ban phòng ban" />
          </div>
          <div class="form-field">
            <label>Phòng ban</label>
            <select name="department" id="inputTaskDept">${DEPARTMENTS.map(d => `<option value="${d.id}">${escapeHTML(d.name)}</option>`).join('')}</select>
          </div>
          <div class="form-field">
            <label>Người phụ trách (Bấm chọn)</label>
            <select name="assignee" id="inputTaskAssignee">${employees.map(e => {
              const shortRole = (e.role || '').replace('/ System Admin', '').replace(' / Admin', '').replace('Nhân viên Dịch vụ khách hàng', 'DVKH').trim();
              return `<option value="${e.id}">${escapeHTML(e.name)}${shortRole ? ` (${escapeHTML(shortRole)})` : ''}</option>`;
            }).join('')}</select>
          </div>
          <div class="form-field">
            <label>Ngày thực hiện</label>
            <input name="due" id="inputTaskDue" type="date" value="${todayISO()}" required />
          </div>
          <div class="form-field">
            <label>Khung giờ</label>
            <select name="hour" id="inputTaskHour">${hours.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
          </div>
          <div class="form-field full">
            <label>Ghi chú & Nội dung chi tiết công việc</label>
            <textarea name="notes" id="inputTaskNotes" placeholder="Mô tả nội dung công việc cụ thể..."></textarea>
          </div>
          <div class="form-field full" style="margin-top:14px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <button type="button" id="btnDeleteTaskModal" class="danger-button" hidden><i class="ri-delete-bin-6-line"></i> Xóa công việc</button>
            <div style="display:flex; gap:8px; margin-left:auto;">
              <button type="button" id="btnCancelModal" class="secondary-button">Hủy</button>
              <button type="submit" class="primary-button" id="btnSubmitModal"><i class="ri-notification-3-line"></i> Lưu & Phát Thông Báo Realtime</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Create / Edit Featured Event Card Modal -->
    <div id="featuredModal" class="modal-backdrop">
      <div style="background:#ffffff; border-radius:14px; padding:22px; width:90%; max-width:480px; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <h3 style="margin:0; font-size:1.1rem;" id="featuredModalTitle">Thêm Thẻ Sự Kiện Nổi Bật</h3>
          <button type="button" id="btnCloseFeaturedModal" class="icon-button" style="border:none; font-size:1.2rem; cursor:pointer;">✕</button>
        </div>
        <form id="featuredCardForm" class="form-grid">
          <div class="form-field full">
            <label>Tiêu đề sự kiện / tiêu điểm</label>
            <input name="title" id="inputFeaturedTitle" required placeholder="VD: Cuộc họp chiến lược quý 3" />
          </div>
          <div class="form-field full">
            <label>Thời gian / Địa điểm</label>
            <input name="time" id="inputFeaturedTime" required placeholder="VD: 🕒 2:00 PM - 4:00 PM · Hall B" />
          </div>
          <div class="form-field">
            <label>Nội dung Badge</label>
            <input name="badge" id="inputFeaturedBadge" required placeholder="VD: 🟢 Đang diễn ra" />
          </div>
          <div class="form-field">
            <label>Màu Badge</label>
            <select name="badgeColor" id="inputFeaturedBadgeColor">
              <option value="#10b981">🟢 Xanh lá (Hoạt động)</option>
              <option value="#087f7b">🟢 Xanh ngọc (Cơ sở dữ liệu)</option>
              <option value="#3b82f6">🔵 Xanh dương (Thông báo)</option>
              <option value="#f59e0b">🟠 Vàng cam (Cảnh báo)</option>
              <option value="#ef4444">🔴 Đỏ (Tạm ngưng)</option>
            </select>
          </div>
          <div class="form-field full">
            <label>Tên nút hành động</label>
            <input name="actionText" id="inputFeaturedAction" required placeholder="VD: Xem chi tiết" />
          </div>
          <div class="form-field full" style="margin-top:12px; display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" id="btnCancelFeaturedModal" class="secondary-button">Hủy</button>
            <button type="submit" class="primary-button">Lưu thẻ sự kiện</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initView() {
  // Modal helpers
  const taskModal = document.getElementById('taskModal');
  const featuredModal = document.getElementById('featuredModal');

  const openTaskModal = () => taskModal?.classList.add('is-open');
  const closeTaskModal = () => { taskModal?.classList.remove('is-open'); editingTaskId = null; };

  const openFeaturedModal = () => featuredModal?.classList.add('is-open');
  const closeFeaturedModal = () => { featuredModal?.classList.remove('is-open'); editingFeaturedId = null; };

  document.getElementById('btnCloseTaskModal')?.addEventListener('click', closeTaskModal);
  document.getElementById('btnCancelModal')?.addEventListener('click', closeTaskModal);
  taskModal?.addEventListener('click', (e) => { if (e.target === taskModal) closeTaskModal(); });

  document.getElementById('btnCloseFeaturedModal')?.addEventListener('click', closeFeaturedModal);
  document.getElementById('btnCancelFeaturedModal')?.addEventListener('click', closeFeaturedModal);
  featuredModal?.addEventListener('click', (e) => { if (e.target === featuredModal) closeFeaturedModal(); });

  // Smart Search Input Listener
  document.getElementById('taskSmartSearch')?.addEventListener('input', (e) => {
    searchKeyword = e.target.value;
    store.setView(store.getState().currentView);
  });

  // Staff Sidebar Search Filter (instant, no re-render)
  document.getElementById('staffSearchInput')?.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.staff-drag-item').forEach(item => {
      const searchData = item.dataset.staffSearch || '';
      item.style.display = searchData.includes(keyword) ? '' : 'none';
    });
  });

  // Staff Sidebar Toggle (collapse/expand)
  document.getElementById('btnToggleStaffList')?.addEventListener('click', () => {
    const container = document.getElementById('staffListContainer');
    const searchBox = document.getElementById('staffSearchInput');
    const btn = document.getElementById('btnToggleStaffList');
    if (!container) return;
    const isHidden = container.style.display === 'none';
    container.style.display = isHidden ? '' : 'none';
    if (searchBox) searchBox.parentElement.style.display = isHidden ? '' : 'none';
    btn.textContent = isHidden ? '▼' : '▲';
  });

  // Featured Cards CRUD
  document.getElementById('btnAddFeaturedCard')?.addEventListener('click', () => {
    editingFeaturedId = null;
    document.getElementById('featuredModalTitle').textContent = 'Thêm Thẻ Sự Kiện Nổi Bật';
    document.getElementById('inputFeaturedTitle').value = '';
    document.getElementById('inputFeaturedTime').value = '';
    document.getElementById('inputFeaturedBadge').value = '🟢 Hoạt động';
    document.getElementById('inputFeaturedAction').value = 'Xem chi tiết';
    openFeaturedModal();
  });

  document.querySelectorAll('[data-edit-featured]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.editFeatured;
      const card = featuredCards.find(c => c.id === id);
      if (!card) return;
      editingFeaturedId = id;
      document.getElementById('featuredModalTitle').textContent = 'Chỉnh Sửa Thẻ Sự Kiện Nổi Bật';
      document.getElementById('inputFeaturedTitle').value = card.title;
      document.getElementById('inputFeaturedTime').value = card.time;
      document.getElementById('inputFeaturedBadge').value = card.badge;
      document.getElementById('inputFeaturedBadgeColor').value = card.badgeColor || '#0f172a';
      document.getElementById('inputFeaturedAction').value = card.actionText;
      openFeaturedModal();
    });
  });

  document.querySelectorAll('[data-delete-featured]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.deleteFeatured;
      if (confirm('Xóa thẻ sự kiện này khỏi trang chủ?')) {
        featuredCards = featuredCards.filter(c => c.id !== id);
        saveStoredFeaturedCards(featuredCards);
        showToast('🗑️ Đã xóa thẻ sự kiện nổi bật!');
        store.setView(store.getState().currentView);
      }
    });
  });

  document.getElementById('featuredCardForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const title = formData.get('title');
    const time = formData.get('time');
    const badge = formData.get('badge');
    const badgeColor = formData.get('badgeColor');
    const actionText = formData.get('actionText');

    if (editingFeaturedId) {
      const card = featuredCards.find(c => c.id === editingFeaturedId);
      if (card) {
        card.title = title;
        card.time = time;
        card.badge = badge;
        card.badgeColor = badgeColor;
        card.actionText = actionText;
      }
      showToast('✅ Đã cập nhật thẻ sự kiện nổi bật!');
    } else {
      featuredCards.push({ id: 'f_' + Date.now(), title, time, badge, badgeColor, actionText });
      showToast('✅ Đã thêm thẻ sự kiện nổi bật mới!');
    }
    saveStoredFeaturedCards(featuredCards);
    closeFeaturedModal();
    store.setView(store.getState().currentView);
  });

  // Week navigation
  document.getElementById('btnPrevWeek')?.addEventListener('click', () => { currentWeekOffset--; store.setView(store.getState().currentView); });
  document.getElementById('btnNextWeek')?.addEventListener('click', () => { currentWeekOffset++; store.setView(store.getState().currentView); });
  document.getElementById('btnTodayWeek')?.addEventListener('click', () => { currentWeekOffset = 0; store.setView(store.getState().currentView); });

  // Add Custom Tab
  document.getElementById('btnAddCustomTab')?.addEventListener('click', () => {
    const tabName = prompt('Nhập tên Tab công việc mới:');
    if (tabName && tabName.trim()) {
      customTabs.push(tabName.trim());
      activeTab = tabName.trim();
      store.setView(store.getState().currentView);
    }
  });

  // Delete Custom Tab
  document.querySelectorAll('[data-delete-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.deleteTab);
      if (idx > 0 && idx < customTabs.length) {
        const deleted = customTabs.splice(idx, 1);
        if (activeTab === deleted[0]) activeTab = customTabs[0];
        store.setView(store.getState().currentView);
      }
    });
  });

  // Tab switch
  document.querySelectorAll('[data-tab-name]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tabName;
      store.setView(store.getState().currentView);
    });
  });

  // Dept filter
  document.getElementById('taskFilterDept')?.addEventListener('change', (e) => {
    selectedDept = e.target.value;
    store.setView(store.getState().currentView);
  });

  // Create Task button clicks
  const resetFormForNew = (dateStr = todayISO(), hourStr = '9 AM') => {
    editingTaskId = null;
    document.getElementById('modalTitle').textContent = 'Tạo Lịch Phân Bổ Công Việc Mới';
    document.getElementById('modalTaskId').value = '';
    document.getElementById('inputTaskTitle').value = `Họp công việc`;
    document.getElementById('inputTaskDue').value = dateStr;
    document.getElementById('inputTaskHour').value = hourStr || '9 AM';
    document.getElementById('inputTaskNotes').value = '';
    document.getElementById('btnDeleteTaskModal').hidden = true;
    openTaskModal();
  };

  document.getElementById('btnOpenCreateTaskModal')?.addEventListener('click', () => resetFormForNew());
  document.getElementById('btnHeaderCreateTask')?.addEventListener('click', () => resetFormForNew());

  // Click on Time Cell directly to create Task
  document.querySelectorAll('.calendar-time-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.calendar-event-block')) return;
      const dateStr = cell.dataset.date || todayISO();
      const hourStr = cell.dataset.hour || '9 AM';
      resetFormForNew(dateStr, hourStr);
    });
  });

  // Quick 1-Click Delete Button on Event Block
  document.querySelectorAll('[data-quick-delete-task]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.quickDeleteTask;
      if (!taskId) return;
      try {
        await deleteTask(taskId);
        cachedTasks = cachedTasks.filter(t => t.id !== taskId);
        notifyDataChange('task_deleted');
        showToast('🗑️ Đã xóa công việc khỏi lịch trình!');
        store.setView(store.getState().currentView);
      } catch (err) {
        console.error('Quick delete task failed:', err);
        showToast('Lỗi khi xóa công việc.', true);
      }
    });
  });

  // Click on Event Block to View / Edit / Delete Task
  document.querySelectorAll('.calendar-event-block[data-task-id]').forEach(block => {
    block.addEventListener('click', (e) => {
      if (e.target.closest('.event-quick-delete')) return;
      e.stopPropagation();
      const taskId = block.dataset.taskId;
      const task = cachedTasks.find(t => t.id === taskId);
      if (!task) return;

      editingTaskId = taskId;
      document.getElementById('modalTitle').textContent = 'Chỉnh Sửa / Xóa Lịch Công Việc';
      document.getElementById('modalTaskId').value = task.id;
      document.getElementById('inputTaskTitle').value = task.title || '';
      document.getElementById('inputTaskDept').value = task.department || 'all';
      document.getElementById('inputTaskAssignee').value = task.assignee || '';
      document.getElementById('inputTaskDue').value = task.due || todayISO();
      document.getElementById('inputTaskHour').value = task.hour || '9 AM';
      document.getElementById('inputTaskNotes').value = task.notes || '';
      document.getElementById('btnDeleteTaskModal').hidden = false;
      openTaskModal();
    });
  });

  // Delete Task Button inside Modal
  document.getElementById('btnDeleteTaskModal')?.addEventListener('click', async () => {
    if (!editingTaskId) return;
    if (!confirm('Bạn có chắc chắn muốn xóa công việc này khỏi lịch trình?')) return;
    try {
      await deleteTask(editingTaskId);
      cachedTasks = cachedTasks.filter(t => t.id !== editingTaskId);
      closeTaskModal();
      notifyDataChange('task_deleted');
      showToast('🗑️ Đã xóa công việc khỏi lịch trình!');
      store.setView(store.getState().currentView);
    } catch (err) {
      console.error('Delete task failed:', err);
      showToast('Lỗi khi xóa công việc.', true);
    }
  });

  // Form Submit (Create or Edit)
  document.getElementById('modalCreateTaskForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const taskId = formData.get('taskId');
    const title = formData.get('title');
    const department = formData.get('department');
    const assignee = formData.get('assignee');
    const due = formData.get('due');
    const hour = formData.get('hour');
    const priority = formData.get('priority') || 'medium';
    const notes = formData.get('notes');

    const assigneeObj = cachedEmployees.find(emp => emp.id === assignee);

    try {
      const formattedNotes = notes ? `[Giờ: ${hour}] ${notes}` : `[Giờ: ${hour}] Công việc lúc ${hour}`;
      if (taskId) {
        const updated = await updateTask(taskId, { title, department, assignee, due, hour, priority, notes: formattedNotes });
        if (updated) {
          const idx = cachedTasks.findIndex(t => t.id === taskId);
          if (idx !== -1) cachedTasks[idx] = updated;
        }
        showToast(`✅ Đã cập nhật công việc cho ${assigneeObj?.name || 'nhân sự'}!`);
      } else {
        const created = await createTask({ title, department, assignee, due, hour, priority, progress: 0, notes: formattedNotes, status: 'todo' });
        if (created) cachedTasks.unshift(created);
        showToast(`✅ Đã tạo lịch công việc & bắn thông báo Realtime tới ${assigneeObj?.name || 'nhân sự'}!`);
      }
      closeTaskModal();
      notifyDataChange('task_updated');
      store.setView(store.getState().currentView);
    } catch (err) {
      console.error('Task save failed:', err);
      showToast('Lỗi khi lưu công việc.', true);
    }
  });

  // Drag and Drop Staff into Calendar Cells
  document.querySelectorAll('.staff-drag-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', JSON.stringify({
        id: item.dataset.staffId,
        name: item.dataset.staffName
      }));
    });
  });

  document.querySelectorAll('.calendar-time-cell').forEach(cell => {
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      cell.style.background = '#e0f2fe';
    });

    cell.addEventListener('dragleave', () => {
      cell.style.background = '#ffffff';
    });

    cell.addEventListener('drop', async (e) => {
      e.preventDefault();
      cell.style.background = '#ffffff';
      try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data && data.name) {
          const dateStr = cell.dataset.date || todayISO();
          const hour = cell.dataset.hour || '9 AM';
          
          const created = await createTask({
            title: `Phân công công việc (${hour})`,
            department: 'all',
            assignee: data.id,
            due: dateStr,
            hour: hour,
            priority: 'medium',
            progress: 0,
            notes: `[Giờ: ${hour}] Phân bổ tự động từ ma trận lịch trình lúc ${hour}`,
            status: 'todo'
          });

          if (created) cachedTasks.unshift(created);
          notifyDataChange('task_assigned');
          showToast(`🔔 ĐÃ GỬI THÔNG BÁO REALTIME: Đã phân công ${data.name} vào ngày ${dateStr} (${hour})!`);
          store.setView(store.getState().currentView);
        }
      } catch (err) {
        console.warn('Drop error:', err);
      }
    });
  });
}
