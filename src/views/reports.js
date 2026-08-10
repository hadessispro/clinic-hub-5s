import { getPerformanceMetrics, loadSettings, saveSettings } from '../services/reports.js';
import { getAttendance } from '../services/attendance.js';
import { getTasks } from '../services/tasks.js';
import { DEPARTMENTS } from '../constants.js';
import { escapeHTML, formatCurrency, downloadText, countBy, clamp, departmentName } from '../utils.js';
import { pill, statusPill, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';
import { exportRichAnalyticsReport } from '../services/rich-export.js';

let cachedMetrics = [];
let cachedAttendance = [];
let cachedTasks = [];

// Static notes as references
const STATIC_NOTES = [
  { id: "n-001", title: "Quy tắc ca", text: "Áp dụng ca làm theo tài liệu 5S - HCM, mỗi check-in cần trước giờ làm ít nhất 5 phút.", owner: "Quản lý vận hành" },
  { id: "n-002", title: "Luồng duyệt", text: "Nghỉ phép và đổi ca cần HR/Quản lý duyệt trước khi tính công.", owner: "Nhân sự" },
  { id: "n-003", title: "Kiểm tra vị trí", text: "Bán kính mặc định 180m quanh phòng khám; quản lý có thể chỉnh trong Báo cáo.", owner: "Admin" },
];

export async function renderView(state) {
  const { settings } = state;

  const [metrics, attendance, tasks] = await Promise.all([
    getPerformanceMetrics(),
    getAttendance(),
    getTasks()
  ]);

  cachedMetrics = metrics;
  cachedAttendance = attendance;
  cachedTasks = tasks;

  const attendanceByStatus = countBy(attendance, "status");
  const taskByDept = DEPARTMENTS.map((dept) => {
    const deptTasks = tasks.filter((task) => task.department === dept.id);
    const progress = deptTasks.length
      ? Math.round(deptTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / deptTasks.length)
      : 0;
    return { ...dept, total: deptTasks.length, progress };
  });

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Manager report</p>
        <h3>Cấu hình vị trí phòng khám, ghi chú quản lý và xem nhanh rủi ro vận hành.</h3>
      </div>
      <div class="pill-row">
        ${statusPill(`${attendanceByStatus.valid || 0} hợp lệ`, "good")}
        ${statusPill(`${attendanceByStatus.late || 0} đi muộn`, "warn")}
        ${statusPill(`${attendanceByStatus.outside || 0} ngoài bán kính`, "bad")}
      </div>
    </div>

    <div class="grid cols-2">
      <section class="panel">
        <div class="section-title">
          <h3>Cấu hình chấm công</h3>
          ${pill("Dùng cho Geolocation API")}
        </div>
        <form class="form-grid" data-form="settings" id="settingsForm">
          <div class="form-field full">
            <label for="clinicName">Tên điểm làm việc</label>
            <input id="clinicName" name="clinicName" value="${escapeHTML(settings.clinicName)}" />
          </div>
          <div class="form-field full">
            <label for="clinicAddress">Địa chỉ</label>
            <input id="clinicAddress" name="clinicAddress" value="${escapeHTML(settings.clinicAddress)}" />
          </div>
          <div class="form-field">
            <label for="clinicLat">Vĩ độ</label>
            <input id="clinicLat" name="latitude" inputmode="decimal" value="${escapeHTML(String(settings.latitude))}" />
          </div>
          <div class="form-field">
            <label for="clinicLng">Kinh độ</label>
            <input id="clinicLng" name="longitude" inputmode="decimal" value="${escapeHTML(String(settings.longitude))}" />
          </div>
          <div class="form-field">
            <label for="allowedRadius">Bán kính hợp lệ (m)</label>
            <input id="allowedRadius" name="allowedRadius" type="number" min="30" max="1000" value="${escapeHTML(String(settings.allowedRadius))}" />
          </div>
          <div class="form-field">
            <label for="revenueTarget">Mục tiêu doanh thu</label>
            <input id="revenueTarget" name="revenueTarget" type="number" min="0" value="${escapeHTML(String(settings.revenueTarget || 0))}" />
          </div>
          <div class="form-field full">
            <label for="reportExport">Xuất báo cáo phân tích</label>
            <div class="pill-row">
              <button class="primary-button" id="exportRichAnalyticsBtn" type="button" style="background:#087f7b;">
                <span>📊</span>Xuất Báo Cáo Phân Tích (Ảnh & Số liệu nổi bật)
              </button>
              <button class="secondary-button" id="reportExportBtn" type="button"><span>•</span>Xuất JSON</button>
            </div>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>✓</span>Lưu cấu hình</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="section-title">
          <h3>Ghi chú quản lý</h3>
          ${pill("Hiển thị ở đầu app")}
        </div>
        <form class="form-grid" data-form="manager-note" id="noteForm">
          <div class="form-field full">
            <label for="managerNote">Nội dung</label>
            <textarea id="managerNote" name="managerNote" rows="3">${escapeHTML(settings.managerNote)}</textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>✓</span>Lưu ghi chú</button>
          </div>
        </form>
        <div class="grid" style="margin-top:12px">
          ${STATIC_NOTES.map((note) => `
            <article class="schedule-card">
              <div class="section-title">
                <h3>${escapeHTML(note.title)}</h3>
                ${pill(note.owner)}
              </div>
              <p class="subtle">${escapeHTML(note.text)}</p>
            </article>
          `).join("")}
        </div>
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Tiến độ theo phòng ban</h3>
        ${pill("Dựa trên task đang lưu")}
      </div>
      <div class="grid cols-4">
        ${taskByDept.map((dept) => `
          <article class="metric-card">
            <p class="metric-label">${escapeHTML(dept.name)}</p>
            <p class="metric-value">${dept.progress}%</p>
            <div class="progress-track" aria-label="Tien do ${escapeHTML(dept.name)}">
              <div class="progress-fill" style="width:${dept.progress}%"></div>
            </div>
            <p class="metric-detail">${dept.total} task</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="panel" style="margin-top:14px">
      <div class="section-title">
        <h3>Đánh giá dữ liệu & hiệu suất phòng khám</h3>
        ${pill("Doanh thu · lead · mục tiêu")}
      </div>
      <div class="grid cols-3 animate-fade">
        ${metrics.length ? metrics.map((item) => {
          const targetRate = item.target ? Math.round(Number(item.revenue || 0) / Number(item.target) * 100) : item.score;
          return `
            <article class="metric-card">
              <p class="metric-label">${escapeHTML(departmentName(item.department))} · ${escapeHTML(item.month)}</p>
              <p class="metric-value">${targetRate}%</p>
              <div class="progress-track" aria-label="KPI ${escapeHTML(departmentName(item.department))}">
                <div class="progress-fill" style="width:${clamp(targetRate, 0, 100)}%"></div>
              </div>
              <p class="metric-detail">${formatCurrency(item.revenue)} / ${formatCurrency(item.target)} · ${item.leads} lead · ${item.appointments} lịch hẹn</p>
              <p class="subtle">${escapeHTML(item.note)}</p>
            </article>
          `;
        }).join("") : emptyState()}
      </div>
    </section>
  `;
}

export function initView() {
  const settingsForm = document.getElementById("settingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(settingsForm);
      const data = Object.fromEntries(formData.entries());
      const state = store.getState();

      const newSettings = {
        clinicName: data.clinicName.trim(),
        clinicAddress: data.clinicAddress.trim(),
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        allowedRadius: Number(data.allowedRadius),
        revenueTarget: Number(data.revenueTarget || 0),
        monthlyPayrollCycle: state.settings.monthlyPayrollCycle,
        managerNote: state.settings.managerNote,
      };

      try {
        const userId = state.user?.id;
        await saveSettings(newSettings, userId);
        store.updateSettings(newSettings);
        showToast("Đã lưu cấu hình định vị.");
      } catch (err) {
        console.error('[Reports View] saveSettings failed:', err);
        showToast("Lỗi khi lưu cấu hình.", true);
      }
    });
  }

  const noteForm = document.getElementById("noteForm");
  if (noteForm) {
    noteForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const formData = new FormData(noteForm);
      const data = Object.fromEntries(formData.entries());
      const state = store.getState();

      const newSettings = {
        ...state.settings,
        managerNote: data.managerNote.trim(),
      };

      try {
        const userId = state.user?.id;
        await saveSettings(newSettings, userId);
        store.updateSettings(newSettings);
        showToast("Đã lưu ghi chú quản lý.");
      } catch (err) {
        console.error('[Reports View] saveSettings (note) failed:', err);
        showToast("Lỗi khi lưu ghi chú.", true);
      }
    });
  }

  const richExportBtn = document.getElementById("exportRichAnalyticsBtn");
  if (richExportBtn) {
    richExportBtn.addEventListener("click", async () => {
      try {
        showToast("Đang kết xuất báo cáo phân tích & hình ảnh...");
        await exportRichAnalyticsReport();
        showToast("Đã tải xuống Báo cáo Phân tích Excel & HTML nổi bật!");
      } catch (err) {
        console.error('[Reports View] exportRichAnalyticsReport failed:', err);
        showToast("Lỗi khi kết xuất báo cáo: " + (err.message || err), true);
      }
    });
  }

  const exportBtn = document.getElementById("reportExportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const dataToExport = {
        settings: store.getState().settings,
        metrics: cachedMetrics,
        tasksSummary: cachedTasks.map(t => ({ id: t.id, title: t.title, dept: t.department, progress: t.progress, status: t.status })),
        attendanceCount: cachedAttendance.length
      };
      downloadText("clinic_hub_state_export.json", JSON.stringify(dataToExport, null, 2), "application/json");
      showToast("Đã xuất file cấu hình JSON.");
    });
  }
}
