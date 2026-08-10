import { getTasks, createTask, updateTask } from '../services/tasks.js';
import { getEmployees } from '../services/employees.js';
import { DEPARTMENTS, TASK_STATUS } from '../constants.js';
import { todayISO, escapeHTML, smartMatch, departmentName, clamp } from '../utils.js';
import { pill, priorityPill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedEmployees = [];
let cachedTasks = [];

export async function renderView(state) {
  const { searchTerm } = state;
  
  // 1. Fetch tasks and employees
  const [employees, allTasks] = await Promise.all([
    getEmployees(),
    getTasks()
  ]);
  
  cachedEmployees = employees;
  cachedTasks = allTasks;

  // 2. Filter tasks by search term
  const filteredTasks = allTasks.filter((task) => {
    if (!searchTerm) return true;
    const assigneeObj = employees.find(e => e.id === task.assignee);
    return smartMatch([
      task.title,
      task.notes,
      departmentName(task.department),
      assigneeObj?.name,
      TASK_STATUS[task.status] || task.status,
      task.priority
    ], searchTerm);
  });

  // Render Kanban Columns
  const renderTaskColumn = (status) => {
    const items = filteredTasks.filter(t => t.status === status);
    return `
      <div class="kanban-column">
        <div class="column-title">
          <span>${escapeHTML(TASK_STATUS[status])}</span>
          ${pill(items.length)}
        </div>
        <div class="column-body" style="display: flex; flex-direction: column; gap: 12px; min-height: 200px;">
          ${items.length ? items.map(renderTaskCard).join('') : emptyState()}
        </div>
      </div>
    `;
  };

  // Render Single Task Card
  const renderTaskCard = (task) => {
    const assigneeObj = employees.find(e => e.id === task.assignee);
    const formattedDue = task.due ? new Date(task.due).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—';
    return `
      <article class="task-card">
        <div class="section-title">
          <h4>${escapeHTML(task.title)}</h4>
          ${priorityPill(task.priority)}
        </div>
        <div class="task-meta">
          ${pill(departmentName(task.department))}
          ${pill(assigneeObj?.name || "Chưa gán")}
          ${pill(`Hạn ${formattedDue}`)}
        </div>
        <p class="subtle" style="margin: 8px 0;">${escapeHTML(task.notes || "Không có ghi chú")}</p>
        <div class="progress-track" style="margin-top:10px">
          <div class="progress-fill" style="width:${Number(task.progress || 0)}%"></div>
        </div>
        <div class="task-actions" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
          <div class="pill-row">
            <button class="icon-button" type="button" title="Giảm tiến độ" data-task-progress-btn data-id="${escapeHTML(task.id)}" data-delta="-10">−</button>
            ${pill(`${task.progress}%`)}
            <button class="icon-button" type="button" title="Tăng tiến độ" data-task-progress-btn data-id="${escapeHTML(task.id)}" data-delta="10">+</button>
          </div>
          <select data-task-status-select data-id="${escapeHTML(task.id)}" aria-label="Đổi trạng thái task" style="font-size: 11px; padding: 4px; border-radius: 4px;">
            ${Object.keys(TASK_STATUS).map((status) => option(status, TASK_STATUS[status], task.status === status)).join('')}
          </select>
        </div>
      </article>
    `;
  };

  const deptOptionsHtml = DEPARTMENTS.map((dept) => option(dept.id, dept.name)).join('');
  const empOptionsHtml = employees.map((emp) => option(emp.id, `${emp.name} - ${departmentName(emp.department)}`)).join('');

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Task management</p>
        <h3>Giao việc theo phòng ban, người phụ trách, deadline, trạng thái và tiến độ hoàn thành.</h3>
      </div>
    </div>

    <section class="panel">
      <div class="section-title">
        <h3>Tạo task mới</h3>
        ${pill("Mỗi task cần owner")}
      </div>
      <form class="form-grid three" id="createTaskForm">
        <div class="form-field">
          <label for="taskTitle">Tên việc</label>
          <input id="taskTitle" name="title" required placeholder="VD: Chuẩn bị hồ sơ bệnh nhân" />
        </div>
        <div class="form-field">
          <label for="taskDepartment">Phòng ban</label>
          <select id="taskDepartment" name="department">${deptOptionsHtml}</select>
        </div>
        <div class="form-field">
          <label for="taskAssignee">Người phụ trách</label>
          <select id="taskAssignee" name="assignee">${empOptionsHtml}</select>
        </div>
        <div class="form-field">
          <label for="taskDue">Deadline</label>
          <input id="taskDue" name="due" type="date" value="${todayISO()}" />
        </div>
        <div class="form-field">
          <label for="taskPriority">Ưu tiên</label>
          <select id="taskPriority" name="priority">
            <option value="high">Cao</option>
            <option value="medium" selected>Vừa</option>
            <option value="low">Thấp</option>
          </select>
        </div>
        <div class="form-field">
          <label for="taskProgress">Tiến độ (%)</label>
          <input id="taskProgress" name="progress" type="number" min="0" max="100" value="0" />
        </div>
        <div class="form-field full">
          <label for="taskNotes">Ghi chú</label>
          <textarea id="taskNotes" name="notes" placeholder="Yêu cầu, tài liệu, điều kiện hoàn thành"></textarea>
        </div>
        <div class="form-field full">
          <button class="primary-button" type="submit"><span>+</span>Thêm task</button>
        </div>
      </form>
    </section>

    <section class="kanban">
      ${Object.keys(TASK_STATUS).map((status) => renderTaskColumn(status)).join('')}
    </section>
  `;
}

export function initView() {
  // 1. Task progress +/- buttons listener
  document.querySelectorAll('[data-task-progress-btn]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const delta = Number(btn.dataset.delta);
      const task = cachedTasks.find(t => t.id === id);
      if (!task) return;

      const newProgress = clamp(Number(task.progress || 0) + delta, 0, 100);
      let newStatus = task.status;
      if (newProgress === 100) newStatus = 'done';
      else if (newProgress > 0 && task.status === 'todo') newStatus = 'doing';

      try {
        await updateTask(id, { progress: newProgress, status: newStatus });
        showToast('Đã cập nhật tiến độ công việc.');
        // Refresh store view to trigger re-render
        store.setView(store.getState().currentView);
      } catch (err) {
        console.error('[Tasks View] Progress update failed:', err);
        showToast('Lỗi khi cập nhật tiến độ.', true);
      }
    });
  });

  // 2. Task status dropdown listener
  document.querySelectorAll('[data-task-status-select]').forEach(select => {
    select.addEventListener('change', async () => {
      const id = select.dataset.id;
      const newStatus = select.value;
      const task = cachedTasks.find(t => t.id === id);
      if (!task) return;

      let newProgress = task.progress;
      if (newStatus === 'done') newProgress = 100;
      else if (newStatus === 'todo') newProgress = 0;

      try {
        await updateTask(id, { status: newStatus, progress: newProgress });
        showToast('Đã cập nhật trạng thái công việc.');
        store.setView(store.getState().currentView);
      } catch (err) {
        console.error('[Tasks View] Status update failed:', err);
        showToast('Lỗi khi cập nhật trạng thái.', true);
      }
    });
  });

  // 3. New task form submission listener
  const form = document.getElementById('createTaskForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const title = formData.get('title');
      const department = formData.get('department');
      const assignee = formData.get('assignee');
      const due = formData.get('due');
      const priority = formData.get('priority');
      const progress = Number(formData.get('progress') || 0);
      const notes = formData.get('notes');

      try {
        await createTask({
          title,
          department,
          assignee,
          due,
          priority,
          progress,
          notes,
          status: progress === 100 ? 'done' : progress > 0 ? 'doing' : 'todo'
        });
        showToast('Đã thêm task mới thành công.');
        store.setView(store.getState().currentView);
      } catch (err) {
        console.error('[Tasks View] Create failed:', err);
        showToast('Lỗi khi thêm task mới.', true);
      }
    });
  }
}
