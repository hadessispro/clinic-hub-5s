import {
  getSystemHealth, getBugLogs, createBugLog, updateBugLog,
  publishSystemAnnouncement, getSystemAnnouncements, getSystemProfiles,
  updateUserAccess, updateUserProfile, unlockAccount, datLaiMatKhau, deleteUserAccount, getAccountStates, getTechnicalAudit, getIntegrationFailures,
  getSystemErrorLogs, resolveSystemError, subscribeToSystemErrors,
  getDatabaseCatalog, runDatabaseQuery,
  getAttendanceAdjustments, createAttendanceAdjustment, updateAttendanceAdjustment, deleteAttendanceAdjustment,
  getReminderConfig, saveReminderConfig, sendImmediateReminder,
  getSystemSmtp, saveSystemSmtp, testSystemSmtp,
  getNotificationRules, updateNotificationRule,
  getGeminiBotConfig, saveGeminiBotConfig, processGeminiBotDemo,
  approveGeminiBotDemo, sendTelegramTestApproval,
  getGeminiActivities, testGeminiKeys,
  deleteSystemRequest, getSystemRequests, getDeletedRequestsAudit,
} from '../services/system-admin.js';
import { playChime, CHIME_OPTIONS } from '../services/audio-chime.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction, requestInput } from '../components/app-dialog.js';
import { store } from '../store.js';
import { DEPARTMENTS, ROLE_PROFILES } from '../constants.js';
import {
  MOI_NHAN, NHOM_VIEW, VIEW_BAT_BUOC, viewsHieuLuc, viewsMacDinh,
} from '../permissions.js';
import {
  VAI_TRO_KHOA, layGhiDe, luuGhiDeNhanSu, luuGhiDeVaiTro, xoaGhiDe,
} from '../services/phan-quyen.js';
import { updateEmployee } from '../services/employees.js';

// Thẻ đang mở. Giữ ngoài hàm dựng vì router dựng lại cả view mỗi lần điều
// hướng, và nhảy về thẻ đầu sau mỗi thao tác thì không ai làm việc được.
let theDangMo = 'tai-khoan';

/* Trạng thái thẻ Phân quyền. Giữ ngoài hàm dựng như mọi thẻ khác: router dựng
 * lại cả view sau mỗi thao tác, nhảy về vai trò đầu danh sách sau mỗi lần lưu
 * thì không ai chỉnh xong được một vai trò. */
let pqVaiTro = '';
let pqNhanSu = '';
let pqGhiDe = { vaiTro: {}, nhanSu: {} };

// Bộ lọc bảng tài khoản. Giữ ngoài hàm dựng vì store.notify() dựng lại cả
// view sau mỗi thao tác, và mất bộ lọc sau mỗi lần cập nhật quyền thì phải
// lọc lại từ đầu mỗi người.
let tkTim = ''; let tkVaiTro = ''; let tkTrangThai = ''; let tkBoPhan = ''; let tkChiNhanh = '';
let tkProfiles = [];
let tkAccountStates = new Map();
let dbCatalog = [];
let dbQueryResult = null;
let dbSql = 'SELECT *\nFROM marketing.leads\nORDER BY created_at DESC\nLIMIT 100';
let ccMonth = new Date().toISOString().slice(0, 7);
let ccSearch = '';
let ccPage = 1;
let ccPageSize = 20;
let ccData = null;
let reminderConfigData = null;
let notificationRulesData = [];
let smtpConfigData = null;
let geminiBotConfigData = null;
let geminiActivitiesData = null;
let geminiKeyTestResults = null;
let geminiDemoCurrentResult = null;
let geminiStaffFeedback = null;

let dtSearch = '';
let dtType = '';
let dtStatus = '';
let dtOnlyTest = false;
let dtRequestsData = [];
let dtDeletedAuditData = [];
const TEN_THE = {
  'tai-khoan': 'Tài khoản và phân quyền',
  'phan-quyen': 'Phân quyền màn hình',
  'thong-bao': 'Cảnh báo Telegram & An ninh',
  'chuong-bao': 'Chuông báo & Lời chúc 5S Care',
  'cham-cong': 'Điều chỉnh chấm công',
  database: 'Truy vấn cơ sở dữ liệu',
  bug: 'Bug và thông báo',
  log: 'Log lỗi hệ thống',
  audit: 'Lịch sử thay đổi',
  'smtp': 'Cấu hình Mail SMTP',
  'gemini-bot': 'Trợ lý AI Gemini (Chấm công & Ca trực)',
  'don-tu': 'Xóa đơn lỗi & Test',
};

function renderNotificationPolicyPanel(rules) {
  const dsRules = Array.isArray(rules) ? rules : [];
  const categoryLabels = {
    media: 'Kho ảnh lâm sàng',
    security: 'Hệ thống & An ninh',
    auth: 'Đăng nhập & Tài khoản',
    attendance: 'Chấm công & Ca trực',
  };

  const severityBadges = {
    critical: '<span class="status-pill is-danger" style="background:#fee2e2;color:#b91c1c;font-weight:700;padding:3px 8px;border-radius:6px;font-size:11px;">🚨 CRITICAL</span>',
    high: '<span class="status-pill is-warning" style="background:#fef3c7;color:#b45309;font-weight:700;padding:3px 8px;border-radius:6px;font-size:11px;">⚠️ HIGH</span>',
    info: '<span class="status-pill is-info" style="background:#e0f2fe;color:#0369a1;font-weight:700;padding:3px 8px;border-radius:6px;font-size:11px;">ℹ️ INFO</span>',
  };

  const notifyingCount = dsRules.filter((r) => r.should_notify).length;

  return `<section class="panel">
    <div class="section-title">
      <div>
        <p class="eyebrow">CHÍNH SÁCH CẢNH BÁO AN NINH VÀ TELEGRAM</p>
        <h3>Quy tắc Thông báo & Nhật ký Kiểm toán</h3>
      </div>
      <span class="subtle">Đang kích hoạt ${notifyingCount}/${dsRules.length} cảnh báo tức thì</span>
    </div>

    <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:13px;line-height:1.6;color:#334155;">
      <strong style="color:#0f172a;font-size:14px;">💡 Chiến lược tối ưu hóa vận hành & Giảm nhiễu kênh Telegram:</strong>
      <ul style="margin:8px 0 0 18px;padding:0;">
        <li><b>Cảnh báo tức thì (Telegram):</b> Ưu tiên các sự cố <strong style="color:#dc2626;">CRITICAL</strong> (xóa ảnh, xóa thư mục, thay đổi quyền admin, khóa tài khoản) và <strong style="color:#d97706;">HIGH</strong> (đăng nhập ngoài giờ hành chính 22h-6h hoặc IP lạ, can thiệp F12 DevTools, tải ảnh hàng loạt > 30 ảnh).</li>
        <li><b>Gom Báo cáo ngày (22:00):</b> Các tác vụ thường nhật <strong style="color:#0284c7;">INFO</strong> (tải ảnh lên, tạo thư mục mới, xem ảnh, đăng nhập ban ngày) được ghi nhận 100% vào Database và tự động tổng hợp số liệu gửi 1 lần duy nhất lúc 22:00, chấm dứt hoàn toàn tình trạng loãng kênh chat.</li>
      </ul>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Loại sự kiện & Mô tả</th>
            <th>Nhóm</th>
            <th>Mức độ</th>
            <th>Phương thức</th>
            <th style="text-align:center;">Bắn Telegram</th>
          </tr>
        </thead>
        <tbody>
          ${!dsRules.length ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:#64748b;">Chưa tải được danh sách quy tắc. Bấm Làm mới dữ liệu để tải lại.</td></tr>' : ''}
          ${dsRules.map((r) => `
            <tr>
              <td>
                <div style="font-weight:600;color:#0f172a;">${escapeHTML(r.description || r.action_type)}</div>
                <code style="font-size:11px;color:#64748b;background:#f1f5f9;padding:1px 5px;border-radius:4px;">${escapeHTML(r.action_type)}</code>
              </td>
              <td>
                <span style="font-size:12px;color:#475569;font-weight:500;">${escapeHTML(categoryLabels[r.category] || r.category)}</span>
              </td>
              <td>
                ${severityBadges[r.severity] || escapeHTML(r.severity)}
              </td>
              <td>
                <span id="rule-status-${escapeHTML(r.action_type)}" style="font-size:12px;font-weight:600;color:${r.should_notify ? '#dc2626' : '#0284c7'};">
                  ${r.should_notify ? '⚡ Bắn tức thì' : '📅 Gom báo cáo 22h'}
                </span>
              </td>
              <td style="text-align:center;">
                <input type="checkbox" data-rule-action="${escapeHTML(r.action_type)}"${r.should_notify ? ' checked' : ''} style="transform:scale(1.25);cursor:pointer;" />
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderReminderControlPanel(config) {
  const cfg = config || {};
  const scenarios = [
    {
      key: 'checkin_morning',
      label: 'Nhắc Check-in ca sáng (07:15 – 07:45)',
      badge: 'Đầu ngày',
      icon: 'ri-sun-cloudy-line',
      desc: 'Tự động nhắc nhân sự và bác sĩ có lịch trực sáng chưa chấm công vào ca.',
    },
    {
      key: 'checkin_afternoon',
      label: 'Nhắc Check-in ca chiều (09:15 – 09:45)',
      badge: 'Ca chiều',
      icon: 'ri-sun-fill',
      desc: 'Nhắc nhở chấm công cho các ca làm việc bắt đầu vào buổi trưa / chiều.',
    },
    {
      key: 'lunch_break',
      label: 'Nghỉ trưa & nạp năng lượng 5S Care (12:00 – 12:15)',
      badge: 'Nghỉ trưa',
      icon: 'ri-cup-line',
      desc: 'Gửi lời chúc ấm áp, nhắc gác lại công việc thưởng thức bữa trưa và chợp mắt nạp năng lượng.',
    },
    {
      key: 'afternoon_care',
      label: 'Tiếp năng lượng giữa giờ chiều (15:00 – 15:15)',
      badge: 'Giữa chiều',
      icon: 'ri-heart-pulse-line',
      desc: 'Động viên uống nước, thư giãn mắt và tiếp thêm năng lượng tích cực cho toàn thể phòng khám.',
    },
    {
      key: 'checkout',
      label: 'Nhắc Check-out hết ca làm việc (17:05, 18:05, 20:05)',
      badge: 'Tan ca',
      icon: 'ri-flag-line',
      desc: 'Nhắc nhở chấm công về và bàn giao công việc khi ca làm kết thúc.',
    },
    {
      key: 'evening_care',
      label: 'Động viên chặng cuối của ngày (18:15 – 18:30)',
      badge: 'Ca tối',
      icon: 'ri-moon-clear-line',
      desc: 'Lời tri ân và động viên các Bác sĩ & Nhân sự trực ca tối hoàn thành ca an toàn.',
    },
  ];

  const chimeOptionsHtml = (selected) => CHIME_OPTIONS.map((opt) =>
    `<option value="${opt.id}"${opt.id === selected ? ' selected' : ''}>${escapeHTML(opt.name)}</option>`
  ).join('');

  return `<div class="attendance-adjustment-dashboard">
    <section class="attendance-adjustment-metrics">
      <article>
        <span>Công nghệ chuông</span>
        <strong>Web Audio & Push</strong>
        <small>Âm thanh pha lê & thông báo đẩy</small>
      </article>
      <article>
        <span>Kịch bản tự động</span>
        <strong>6 Kịch bản 5S</strong>
        <small>Tách biệt Bác sĩ & Nhân viên</small>
      </article>
      <article>
        <span>Biến số cá nhân hoá</span>
        <strong>{ten}, {ma}, {ca}, {gio}</strong>
        <small>Tự động ghép tên từng người</small>
      </article>
      <article>
        <span>Lưu trữ cấu hình</span>
        <strong>PostgreSQL Record</strong>
        <small>Đồng bộ tức thì, không mất dữ liệu</small>
      </article>
    </section>

    <section class="panel attendance-adjustment-editor" style="border-top: 4px solid #0f8b7f;">
      <div class="section-title">
        <div>
          <p class="eyebrow">PHÁT CHUÔNG TRỰC TIẾP</p>
          <h3>Gửi lời chúc & bắn chuông tức thì đến phòng khám</h3>
        </div>
        <span class="subtle">Gửi thông báo đẩy và phát chuông âm thanh ngay lập tức</span>
      </div>

      <form id="reminderImmediateForm" style="margin-top: 16px; display: flex; flex-direction: column; gap: 14px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; align-items: end;">
          <label style="display: grid; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--ink);">
            <span>Người nhận thông báo</span>
            <select name="target" id="immTarget" style="width: 100%; min-height: 42px; padding: 8px 12px; border: 1px solid #cfddd5; border-radius: 8px; background: #fff; font-size: 0.9rem; outline: none;">
              <option value="all">Toàn thể phòng khám (Bác sĩ & Nhân viên)</option>
              <option value="doctors">Chỉ riêng Bác sĩ điều trị</option>
              <option value="staff">Chỉ riêng Nhân viên / Phụ tá / Lễ tân</option>
              <option value="me">🔔 Bắn thử nghiệm cho chính tôi (Admin)</option>
            </select>
          </label>

          <label style="display: grid; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--ink);">
            <span>Âm thanh chuông</span>
            <div style="display: flex; gap: 8px; width: 100%;">
              <select name="chime" id="immChime" style="flex: 1; min-width: 0; min-height: 42px; padding: 8px 12px; border: 1px solid #cfddd5; border-radius: 8px; background: #fff; font-size: 0.9rem; outline: none;">
                ${chimeOptionsHtml('crystal')}
              </select>
              <button type="button" class="secondary-button" id="immTestChimeBtn" style="min-height: 42px; padding: 0 14px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;" title="Nghe thử âm thanh này">
                🔊 Thử âm
              </button>
            </div>
          </label>

          <label style="display: grid; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--ink);">
            <span>Màn hình chuyển đến khi bấm</span>
            <select name="view" id="immView" style="width: 100%; min-height: 42px; padding: 8px 12px; border: 1px solid #cfddd5; border-radius: 8px; background: #fff; font-size: 0.9rem; outline: none;">
              <option value="dashboard">Trang chủ (Dashboard)</option>
              <option value="attendance">Chấm công (Attendance)</option>
              <option value="messages">Tin nhắn nội bộ (Chat)</option>
              <option value="tasks">Nhiệm vụ (Tasks)</option>
            </select>
          </label>
        </div>

        <label style="display: grid; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--ink);">
          <span>Tiêu đề thông báo</span>
          <input type="text" name="title" id="immTitle" required maxlength="180"
            style="width: 100%; min-height: 42px; padding: 8px 12px; border: 1px solid #cfddd5; border-radius: 8px; background: #fff; font-size: 0.9rem; outline: none;"
            placeholder="VD: 💖 Lời chúc ngọt ngào từ Ban Giám Đốc Nha Khoa 5S"
            value="💖 Lời chúc ngọt ngào từ Ban Giám Đốc Nha Khoa 5S">
        </label>

        <label style="display: grid; gap: 6px; font-size: 0.85rem; font-weight: 700; color: var(--ink);">
          <span>Nội dung lời chúc / nhắc nhở (hỗ trợ {ten}, {ma})</span>
          <textarea name="body" id="immBody" required rows="3" maxlength="1000"
            style="width: 100%; min-height: 75px; padding: 10px 12px; border: 1px solid #cfddd5; border-radius: 8px; background: #fff; font-size: 0.9rem; font-family: inherit; line-height: 1.5; resize: vertical; outline: none;"
            placeholder="Nhập nội dung gửi đến nhân sự. Dùng {ten} để tự động gắn tên người nhận...">Chúc {ten} một ngày làm việc thật nhiều năng lượng, hạnh phúc và luôn giữ nụ cười rạng rỡ cùng đại gia đình 5S nhé! ✨🌸</textarea>
        </label>

        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 4px;">
          <span style="font-size: 0.84rem; color: var(--muted);">
            💡 Hỗ trợ biến số: <code>{ten}</code> (Họ tên người nhận), <code>{ma}</code> (Mã nhân sự)
          </span>
          <button type="submit" class="primary-button" id="immSubmitBtn" style="min-width: 220px; min-height: 42px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.92rem; font-weight: 700;">
            🔔 Phát chuông & Gửi ngay
          </button>
        </div>
      </form>
    </section>

    <section class="panel attendance-adjustment-list" style="border-top: 4px solid #2563eb;">
      <div class="section-title">
        <div>
          <p class="eyebrow">CẤU HÌNH KỊCH BẢN & LỜI CHÚC CÁ NHÂN HOÁ</p>
          <h3>Tuỳ chỉnh chuông báo & lời chúc cho Bác sĩ và Nhân sự</h3>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="secondary-button" id="reminderResetDefaultBtn">↺ Trả về mặc định</button>
          <button type="button" class="primary-button" id="reminderSaveConfigBtn">💾 Lưu cấu hình chuông báo</button>
        </div>
      </div>
      <p style="color: var(--muted); font-size: 0.88rem; margin: 8px 0 16px;">
        💡 <b>Quy tắc cá nhân hoá:</b> Bạn có thể dùng <code>{ten}</code> (Họ tên), <code>{ma}</code> (Mã nhân sự), <code>{ca}</code> (Tên ca), <code>{gio}</code> (Giờ ca). Hệ thống sẽ tự động ghép tên của từng Bác sĩ và Nhân viên khi gửi chuông nhắc việc!
      </p>

      <div class="reminder-scenarios-container" style="display: grid; gap: 18px;">
        ${scenarios.map((sc) => {
          const item = cfg[sc.key] || {};
          const isEnabled = item.enabled !== false;
          return `
          <div class="reminder-scenario-card" data-scenario="${sc.key}" style="border: 1px solid #d7e4df; border-radius: 12px; padding: 18px; background: #fafdfc;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; border-bottom: 1px dashed #cfddd5; padding-bottom: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.3rem; color: var(--teal);"><i class="${sc.icon}"></i></span>
                <div>
                  <h4 style="margin: 0; font-size: 1.05rem; color: var(--ink); font-weight: 700;">${sc.label}</h4>
                  <small style="color: var(--muted);">${sc.desc}</small>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 14px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; font-size: 0.9rem;">
                  <input type="checkbox" class="sc-enabled" ${isEnabled ? 'checked' : ''}>
                  <span>${isEnabled ? 'Đang bật' : 'Đang tắt'}</span>
                </label>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <select class="sc-chime" style="padding: 6px 10px; border-radius: 8px; border: 1px solid #cfddd5; font-size: 0.85rem;">
                    ${chimeOptionsHtml(item.chime || 'crystal')}
                  </select>
                  <button type="button" class="secondary-button compact-button sc-test-chime" title="Nghe thử chuông này">🔊</button>
                </div>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <span style="font-weight: 700; color: #15803d; font-size: 0.9rem;">🩺 Lời chúc & Tiêu đề cho BÁC SĨ</span>
                  <span class="badge" style="background: #dcfce7; color: #166534; font-size: 11px;">Bác sĩ điều trị</span>
                </div>
                <div style="display: grid; gap: 8px;">
                  <label style="font-size: 0.82rem; font-weight: 600; color: #166534;">
                    Tiêu đề thông báo
                    <input type="text" class="sc-doctor-title" style="width: 100%; margin-top: 4px; padding: 7px 10px; border-radius: 6px; border: 1px solid #86efac; background: #fff;"
                      value="${escapeHTML(item.doctor_title || '')}">
                  </label>
                  <label style="font-size: 0.82rem; font-weight: 600; color: #166534;">
                    Nội dung lời chúc & nhắc việc
                    <textarea class="sc-doctor-body" rows="3" style="width: 100%; margin-top: 4px; padding: 7px 10px; border-radius: 6px; border: 1px solid #86efac; background: #fff; font-family: inherit;">${escapeHTML(item.doctor_body || '')}</textarea>
                  </label>
                </div>
              </div>

              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <span style="font-weight: 700; color: #1d4ed8; font-size: 0.9rem;">🌟 Lời chúc & Tiêu đề cho NHÂN VIÊN</span>
                  <span class="badge" style="background: #dbeafe; color: #1e40af; font-size: 11px;">Phụ tá / Lễ tân / CSKH</span>
                </div>
                <div style="display: grid; gap: 8px;">
                  <label style="font-size: 0.82rem; font-weight: 600; color: #1e40af;">
                    Tiêu đề thông báo
                    <input type="text" class="sc-staff-title" style="width: 100%; margin-top: 4px; padding: 7px 10px; border-radius: 6px; border: 1px solid #93c5fd; background: #fff;"
                      value="${escapeHTML(item.staff_title || '')}">
                  </label>
                  <label style="font-size: 0.82rem; font-weight: 600; color: #1e40af;">
                    Nội dung lời chúc & nhắc việc
                    <textarea class="sc-staff-body" rows="3" style="width: 100%; margin-top: 4px; padding: 7px 10px; border-radius: 6px; border: 1px solid #93c5fd; background: #fff; font-family: inherit;">${escapeHTML(item.staff_body || '')}</textarea>
                  </label>
                </div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
        <button type="button" class="primary-button" id="reminderSaveConfigBtnBottom">💾 Lưu cấu hình chuông báo & Lời chúc</button>
      </div>
    </section>
  </div>`;
}

function bindNotificationRuleActions() {
  document.querySelectorAll('[data-rule-action]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const actionType = chk.dataset.ruleAction;
      const shouldNotify = chk.checked;
      const badge = document.getElementById(`rule-status-${actionType}`);
      if (badge) {
        badge.textContent = shouldNotify ? '⚡ Bắn tức thì' : '📅 Gom báo cáo 22h';
        badge.style.color = shouldNotify ? '#dc2626' : '#0284c7';
      }
      try {
        await updateNotificationRule(actionType, shouldNotify);
        showToast(`Đã cập nhật quy tắc: ${actionType}`);
      } catch (err) {
        chk.checked = !shouldNotify;
        if (badge) {
          badge.textContent = !shouldNotify ? '⚡ Bắn tức thì' : '📅 Gom báo cáo 22h';
          badge.style.color = !shouldNotify ? '#dc2626' : '#0284c7';
        }
        showToast(err.message || 'Không thể cập nhật quy tắc thông báo.', true);
      }
    });
  });
}

function bindReminderActions() {
  document.getElementById('immTestChimeBtn')?.addEventListener('click', () => {
    const chime = document.getElementById('immChime')?.value || 'crystal';
    playChime(chime);
  });

  document.querySelectorAll('.sc-test-chime').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.reminder-scenario-card');
      const chime = card?.querySelector('.sc-chime')?.value || 'crystal';
      playChime(chime);
    });
  });

  document.querySelectorAll('.sc-enabled').forEach((chk) => {
    chk.addEventListener('change', () => {
      const label = chk.closest('label')?.querySelector('span');
      if (label) label.textContent = chk.checked ? 'Đang bật' : 'Đang tắt';
    });
  });

  document.getElementById('reminderImmediateForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('immSubmitBtn');
    const target = document.getElementById('immTarget')?.value || 'all';
    const chime = document.getElementById('immChime')?.value || 'crystal';
    const view = document.getElementById('immView')?.value || 'dashboard';
    const title = document.getElementById('immTitle')?.value || '';
    const body = document.getElementById('immBody')?.value || '';

    if (!title.trim() || !body.trim()) {
      showToast('Vui lòng nhập đầy đủ tiêu đề và nội dung thông báo.', true);
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Đang phát chuông…';
    try {
      playChime(chime);
      const res = await sendImmediateReminder({ target, chime, view, title, body });
      showToast(`🔔 Đã phát chuông thành công! (${res?.sentNotifications || 0} thông báo in-app, ${res?.sentPush || 0} push)`);
    } catch (err) {
      showToast('Lỗi phát chuông: ' + (err.message || 'Không thể kết nối'), true);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔔 Phát chuông & Gửi ngay';
    }
  });

  const handleSaveConfig = async (btn) => {
    const cards = document.querySelectorAll('.reminder-scenario-card');
    if (!cards.length) return;

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Đang lưu…';

    try {
      const newConfig = {};
      cards.forEach((card) => {
        const key = card.dataset.scenario;
        if (!key) return;
        newConfig[key] = {
          enabled: card.querySelector('.sc-enabled')?.checked ?? true,
          chime: card.querySelector('.sc-chime')?.value || 'crystal',
          doctor_title: card.querySelector('.sc-doctor-title')?.value || '',
          doctor_body: card.querySelector('.sc-doctor-body')?.value || '',
          staff_title: card.querySelector('.sc-staff-title')?.value || '',
          staff_body: card.querySelector('.sc-staff-body')?.value || '',
        };
      });

      await saveReminderConfig(newConfig);
      showToast('💾 Đã lưu cấu hình chuông báo & lời chúc 5S Care thành công!');
      reminderConfigData = newConfig;
    } catch (err) {
      showToast('Lỗi lưu cấu hình: ' + (err.message || 'Không thể lưu'), true);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  };

  document.getElementById('reminderSaveConfigBtn')?.addEventListener('click', (e) => handleSaveConfig(e.currentTarget));
  document.getElementById('reminderSaveConfigBtnBottom')?.addEventListener('click', (e) => handleSaveConfig(e.currentTarget));

  document.getElementById('reminderResetDefaultBtn')?.addEventListener('click', async () => {
    const ok = await confirmAction(
      'Khôi phục toàn bộ 6 kịch bản chuông báo và lời chúc về mặc định chuẩn của hệ thống?',
      { title: 'Khôi phục mặc định', confirmText: 'Khôi phục' }
    );
    if (!ok) return;

    try {
      await saveReminderConfig({});
      showToast('Đã khôi phục cài đặt mặc định.');
      const res = await getReminderConfig().catch(() => ({ config: null }));
      reminderConfigData = res?.config || null;
      store.notify();
    } catch (err) {
      showToast('Lỗi khôi phục: ' + (err.message || 'Thao tác thất bại'), true);
    }
  });
}

function attendanceClock(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function attendanceAdjustmentPanel(data) {
  const rows = data?.rows || [];
  const employees = data?.employees || [];
  const shifts = data?.shifts || [];
  const total = Number(data?.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / ccPageSize));
  const pageStart = Math.min(Math.max(1, ccPage - 2), Math.max(1, pageCount - 4));
  const visiblePages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => pageStart + index);
  const employeeOptions = employees.map((item) => `<option value="${escapeHTML(item.code)}">${escapeHTML(item.full_name || item.name || item.code)} · ${escapeHTML(item.code)}</option>`).join('');
  const shiftOptions = shifts.map((item) => `<option value="${escapeHTML(item.code)}">${escapeHTML(item.name || item.code)} · ${String(item.start_time || '').slice(0, 5)}–${String(item.end_time || '').slice(0, 5)}</option>`).join('');
  const start = total ? (ccPage - 1) * ccPageSize + 1 : 0;
  const end = Math.min(ccPage * ccPageSize, total);
  return `<div class="attendance-adjustment-dashboard">
    <section class="attendance-adjustment-metrics">
      <article><span>Tổng lượt trong tháng</span><strong>${total.toLocaleString('vi-VN')}</strong><small>Dữ liệu đang hoạt động</small></article>
      <article><span>Lượt vào ca</span><strong>${Number(data?.stats?.checkins || 0).toLocaleString('vi-VN')}</strong><small>Check-in</small></article>
      <article><span>Lượt ra ca</span><strong>${Number(data?.stats?.checkouts || 0).toLocaleString('vi-VN')}</strong><small>Check-out</small></article>
      <article><span>Đã điều chỉnh tay</span><strong>${Number(data?.stats?.manual || 0).toLocaleString('vi-VN')}</strong><small>Có nhật ký kiểm toán</small></article>
    </section>
    <section class="panel attendance-adjustment-editor">
      <div class="section-title"><div><p class="eyebrow">QUYỀN QUẢN TRỊ CẤP CAO</p><h3 id="ccFormTitle">Thêm lượt chấm công</h3></div><span class="status-pill warn"><i class="ri-shield-keyhole-line"></i> Mọi thay đổi đều lưu audit</span></div>
      <form id="ccAdjustmentForm" class="attendance-adjustment-form">
        <input type="hidden" name="id">
        <label><span>Nhân viên</span><select name="employeeCode" required><option value="">— Chọn nhân viên —</option>${employeeOptions}</select></label>
        <label><span>Ngày làm việc</span><input type="date" name="workDate" required></label>
        <label><span>Loại lượt chấm</span><select name="recordType" required><option value="checkin">Vào ca</option><option value="checkout">Ra ca</option></select></label>
        <label><span>Thời gian</span><input type="time" name="time" step="1" required></label>
        <label><span>Ca làm việc</span><select name="shiftCode" required><option value="">— Chọn ca —</option>${shiftOptions}</select></label>
        <label><span>Chi nhánh trong ngày</span><select name="branchId" required><option value="le-van-tho">5S Lê Văn Thọ</option><option value="pham-van-chieu">5S Phạm Văn Chiêu</option></select></label>
        <label class="span-2"><span>Lý do điều chỉnh</span><input name="reason" minlength="5" maxlength="300" required placeholder="VD: Nhân viên quên chấm công, đã đối chiếu với quản lý"></label>
        <div class="attendance-adjustment-actions span-2"><button class="secondary-button" id="ccCancelEdit" type="button" hidden>Hủy sửa</button><button class="primary-button" type="submit"><i class="ri-save-3-line"></i> <span id="ccSaveLabel">Thêm lượt chấm công</span></button></div>
      </form>
    </section>
    <section class="panel attendance-adjustment-list">
      <div class="section-title"><div><p class="eyebrow">DỮ LIỆU CHẤM CÔNG</p><h3>Kiểm tra và điều chỉnh</h3></div><span class="subtle">Hiển thị ${start}–${end} trong ${total} lượt</span></div>
      <form id="ccFilters" class="attendance-adjustment-filters"><label><span>Tháng</span><input type="month" name="month" value="${escapeHTML(ccMonth)}"></label><label class="is-search"><span>Tìm nhân viên</span><input type="search" name="search" value="${escapeHTML(ccSearch)}" placeholder="Tên hoặc mã nhân viên"></label><label><span>Số dòng</span><select name="pageSize">${[10, 20, 50, 100].map((size) => `<option value="${size}" ${ccPageSize === size ? 'selected' : ''}>${size} dòng</option>`).join('')}</select></label><button class="secondary-button" type="submit"><i class="ri-filter-3-line"></i> Lọc dữ liệu</button></form>
      <div class="table-wrap"><table><thead><tr><th>Nhân viên</th><th>Ngày</th><th>Loại</th><th>Thời gian</th><th>Ca</th><th>Chi nhánh</th><th>Nguồn</th><th>Thao tác</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr><td><strong>${escapeHTML(row.employee_name || row.employee_code)}</strong><small>${escapeHTML(row.employee_code)}</small></td><td>${new Date(`${row.work_date}T00:00:00`).toLocaleDateString('vi-VN')}</td><td><span class="status-pill ${row.record_type === 'checkin' ? 'good' : 'neutral'}">${row.record_type === 'checkin' ? 'Vào ca' : 'Ra ca'}</span></td><td><strong>${attendanceClock(row.recorded_at)}</strong></td><td>${escapeHTML(row.shift_code || '—')}</td><td>${row.branch_id === 'pham-van-chieu' ? 'Phạm Văn Chiêu' : row.branch_id === 'le-van-tho' ? 'Lê Văn Thọ' : 'Chưa xác định'}</td><td>${row.origin === 'manual-reconciliation' ? '<span class="status-pill warn">Điều chỉnh tay</span>' : '<span class="subtle">Chấm công GPS</span>'}</td><td class="attendance-adjustment-row-actions"><button class="secondary-button compact-button" type="button" data-cc-edit="${escapeHTML(row.id)}"><i class="ri-edit-line"></i> Sửa</button><button class="secondary-button compact-button danger-button" type="button" data-cc-delete="${escapeHTML(row.id)}"><i class="ri-delete-bin-6-line"></i> Xóa</button></td></tr>`).join('') : '<tr><td colspan="8" class="empty-table-cell">Không có lượt chấm công phù hợp.</td></tr>'}</tbody></table></div>
      <nav class="attendance-adjustment-pagination" aria-label="Phân trang điều chỉnh chấm công"><button type="button" class="secondary-button compact-button" data-cc-page="1" ${ccPage <= 1 ? 'disabled' : ''}>« Đầu</button><button type="button" class="secondary-button compact-button" data-cc-page="${ccPage - 1}" ${ccPage <= 1 ? 'disabled' : ''}>‹ Trước</button><span class="attendance-adjustment-page-numbers">${visiblePages.map((page) => `<button type="button" data-cc-page="${page}" class="${page === ccPage ? 'is-active' : ''}" ${page === ccPage ? 'aria-current="page"' : ''}>${page}</button>`).join('')}</span><span>Trang <b>${ccPage}</b> / ${pageCount}</span><button type="button" class="secondary-button compact-button" data-cc-page="${ccPage + 1}" ${ccPage >= pageCount ? 'disabled' : ''}>Sau ›</button><button type="button" class="secondary-button compact-button" data-cc-page="${pageCount}" ${ccPage >= pageCount ? 'disabled' : ''}>Cuối »</button></nav>
    </section>
  </div>`;
}

function databaseCell(value) {
  if (value === null || value === undefined) return '<span class="db-null">NULL</span>';
  if (typeof value === 'object') return escapeHTML(JSON.stringify(value));
  return escapeHTML(String(value));
}

function databaseResults(result) {
  if (!result) return '<div class="db-empty"><i class="ri-table-2"></i><strong>Chưa có kết quả truy vấn</strong><span>Chọn một bảng hoặc nhập câu SELECT rồi bấm Chạy truy vấn.</span></div>';
  const columns = result.columns || [];
  const rows = result.rows || [];
  return `<div class="db-result-head"><div><strong>${rows.length.toLocaleString('vi-VN')} dòng</strong><span>${Number(result.duration_ms || 0).toLocaleString('vi-VN')} ms${result.truncated ? ' · đã giới hạn 500 dòng' : ''}</span></div>${rows.length ? '<button class="secondary-button compact-button" type="button" id="dbExportCsv"><i class="ri-file-excel-2-line"></i> Xuất CSV</button>' : ''}</div>
    ${columns.length ? `<div class="table-wrap db-result-wrap"><table class="db-result-table"><thead><tr>${columns.map((column) => `<th>${escapeHTML(column.name || column)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${databaseCell(row[column.name || column])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="subtle">Câu truy vấn không trả về cột dữ liệu.</p>'}`;
}

function databasePanel(catalog) {
  const bySchema = new Map();
  catalog.forEach((column) => {
    const schema = String(column.schema_name || 'public');
    const table = String(column.table_name || '');
    if (!bySchema.has(schema)) bySchema.set(schema, new Map());
    if (!bySchema.get(schema).has(table)) bySchema.get(schema).set(table, []);
    bySchema.get(schema).get(table).push(column);
  });
  const tree = [...bySchema].map(([schema, tables]) => `<details class="db-schema" open><summary><i class="ri-database-2-line"></i>${escapeHTML(schema)}<small>${tables.size} bảng</small></summary>${[...tables].map(([table, columns]) => `<details class="db-table"><summary><button type="button" data-db-table="${escapeHTML(`${schema}.${table}`)}" title="Tạo câu truy vấn bảng này">${escapeHTML(table)}</button><small>${columns.length} cột</small></summary><ul>${columns.map((column) => `<li><span>${escapeHTML(column.column_name)}</span><small>${escapeHTML(column.data_type)}</small></li>`).join('')}</ul></details>`).join('')}</details>`).join('');
  return `<div class="db-console-layout">
    <aside class="panel db-catalog"><div class="section-title"><div><p class="eyebrow">DANH MỤC CHỈ ĐỌC</p><h3>Schema và bảng</h3></div><span class="status-pill good">READ ONLY</span></div>${tree || '<p class="subtle">Không tải được danh mục bảng.</p>'}</aside>
    <section class="panel db-console"><div class="section-title"><div><p class="eyebrow">POSTGRESQL QUERY CONSOLE</p><h3>Kiểm tra dữ liệu hệ thống</h3></div></div>
      <div class="db-safety"><i class="ri-shield-check-line"></i><span>Chỉ chấp nhận một câu <b>SELECT</b> hoặc <b>WITH</b>. Không thể thêm, sửa hay xóa dữ liệu. Kết quả tối đa 500 dòng, thời gian chạy tối đa 8 giây.</span></div>
      <form id="dbQueryForm"><label class="db-editor-label" for="dbSql">Câu truy vấn SQL</label><textarea id="dbSql" name="sql" spellcheck="false" required>${escapeHTML(dbSql)}</textarea><div class="db-actions"><button type="button" class="secondary-button" id="dbClear"><i class="ri-eraser-line"></i> Xóa câu lệnh</button><button type="submit" class="primary-button" id="dbRun"><i class="ri-play-fill"></i> Chạy truy vấn</button></div></form>
      <div id="dbQueryResult" class="db-results" aria-live="polite">${databaseResults(dbQueryResult)}</div>
    </section>
  </div>`;
}

const severityLabel = { low: 'Thấp', medium: 'Trung bình', high: 'Cao', critical: 'Nghiêm trọng' };
const statusLabel = { open: 'Mới', investigating: 'Đang kiểm tra', resolved: 'Đã sửa', closed: 'Đã đóng' };
// Nhãn vai trò lấy từ danh mục chuẩn ROLE_PROFILES, không chép lại.
//
// Bản chép tay trước đây chỉ có bảy vai trò và THIẾU cả năm vai trò marketing.
// Hậu quả không dừng ở hiển thị sai: ô chọn không tìm thấy mục nào khớp
// admin_marketing nên trình duyệt hiện mục đầu tiên là "Nhân viên", và bấm
// Cập nhật là hạ thẳng Admin Marketing xuống nhân viên thường. Một bản sao
// thiếu sót của danh mục là một cái bẫy chứ không phải một tiện lợi.
const roleLabel = Object.fromEntries(
  Object.entries(ROLE_PROFILES).map(([ma, v]) => [ma, v.label]),
);

// Vai trò không cấp được từ màn này. Muốn cấp thì phải đi đường khác.
const VAI_TRO_BAO_VE = ['admin', 'admin_it', 'superadmin'];
const VAI_TRO_CAP_DUOC = Object.keys(ROLE_PROFILES).filter((r) => !VAI_TRO_BAO_VE.includes(r));
let logSub = null;
let bugFilterTimer = null;
let logFilterTimer = null;

const functionalAreas = {
  authentication: { label: 'Đăng nhập & tài khoản', icon: 'A' },
  attendance: { label: 'Chấm công & GPS', icon: 'C' },
  schedule: { label: 'Lịch làm & ca làm', icon: 'L' },
  chat: { label: 'Tin nhắn & thông báo', icon: 'T' },
  sync: { label: 'Đồng bộ & tích hợp', icon: 'Đ' },
  data: { label: 'Dữ liệu & phân quyền', icon: 'D' },
  other: { label: 'Hệ thống khác', icon: 'H' },
};

function functionalArea(item) {
  const context = JSON.stringify(item.context || {});
  const text = `${item.area || ''} ${item.title || ''} ${item.message || ''} ${item.source || ''} ${item.page_url || ''} ${context}`.toLocaleLowerCase('vi');
  if (/đăng nhập|login|auth|credential|tài khoản|account|profile/.test(text)) return 'authentication';
  if (/chấm công|attendance|checkin|checkout|gps|geolocation/.test(text)) return 'attendance';
  if (/lịch làm|schedule|ca làm|shift/.test(text)) return 'schedule';
  if (/tin nhắn|message|chat|notification|thông báo/.test(text)) return 'chat';
  if (/đồng bộ|sync|sheet|integration|api|outbox/.test(text)) return 'sync';
  if (/database|postgresql|rls|permission|phân quyền|data/.test(text)) return 'data';
  return 'other';
}

function groupedPanels(items, rowRenderer, type) {
  const groups = new Map();
  items.forEach((item) => {
    const key = functionalArea(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  const overview = `<div class="system-log-category-nav">${Object.entries(functionalAreas).map(([key, meta]) => `<span class="${groups.has(key) ? 'has-records' : ''}"><b>${meta.icon}</b>${meta.label}<small>${groups.get(key)?.length || 0}</small></span>`).join('')}</div>`;
  if (!items.length) return `${overview}<div class="system-log-empty">Không có ${type === 'bug' ? 'bug' : 'lỗi hệ thống'} phù hợp bộ lọc.</div>`;
  return overview + Object.keys(functionalAreas).filter((key) => groups.has(key)).map((key) => {
    const meta = functionalAreas[key];
    const rows = groups.get(key);
    const header = type === 'bug'
      ? '<tr><th>Lỗi</th><th>Khu vực</th><th>Mức độ</th><th>Trạng thái</th><th>Kết quả xử lý</th><th></th></tr>'
      : '<tr><th>Mức độ</th><th>Thông báo</th><th>Thời gian</th><th>Ngữ cảnh</th><th>Trạng thái</th><th></th></tr>';
    return `<section class="system-log-group"><div class="system-log-group-title"><span>${meta.icon}</span><div><strong>${meta.label}</strong><small>${rows.length} bản ghi</small></div></div><div class="table-wrap"><table><thead>${header}</thead><tbody>${rowRenderer(rows)}</tbody></table></div></section>`;
  }).join('');
}

function metric(label, value, note = '') {
  const icons = {
    Database: 'ri-database-2-line',
    'Tài khoản hoạt động': 'ri-user-follow-line',
    'Dữ liệu chấm công': 'ri-time-line',
    'Đồng bộ lỗi': 'ri-loop-left-line',
    'Lỗi ứng dụng': 'ri-bug-line',
  };
  return `<article class="system-metric"><div class="system-metric-head"><i class="${icons[label] || 'ri-bar-chart-box-line'}"></i><em>Hệ thống</em></div><span>${escapeHTML(label)}</span><strong>${escapeHTML(String(value ?? 0))}</strong><small>${escapeHTML(note)}</small></article>`;
}

function filterOptions(map, selected = 'all') {
  return `<option value="all">Tất cả</option>${Object.entries(map).map(([value, label]) => `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`).join('')}`;
}

function bugRows(bugs) {
  if (!bugs.length) return '<tr><td colspan="6" class="empty-table-cell">Không có bug phù hợp bộ lọc.</td></tr>';
  return bugs.map((bug) => `<tr>
    <td><strong>${escapeHTML(bug.title)}</strong><small>${escapeHTML(bug.description || '')}</small></td>
    <td>${escapeHTML(bug.area)}</td>
    <td><span class="status-pill ${bug.severity === 'critical' ? 'bad' : bug.severity === 'high' ? 'warn' : 'neutral'}">${escapeHTML(severityLabel[bug.severity] || bug.severity)}</span></td>
    <td><select data-bug-status="${bug.id}">${Object.entries(statusLabel).map(([value, label]) => `<option value="${value}" ${bug.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td>
    <td><input data-bug-resolution="${bug.id}" value="${escapeHTML(bug.resolution || '')}" placeholder="Ghi chú xử lý"></td>
    <td><button class="secondary-button compact-button" type="button" data-save-bug="${bug.id}">Lưu</button></td>
  </tr>`).join('');
}

function errorRows(logs) {
  if (!logs.length) return '<tr><td colspan="6" class="empty-table-cell">Không có lỗi hệ thống phù hợp bộ lọc.</td></tr>';
  return logs.map((log) => {
    const details = JSON.stringify(log.context || {}, null, 2);
    return `<tr class="${log.resolved ? 'is-muted-row' : ''}">
      <td><span class="status-pill ${log.level === 'critical' || log.level === 'error' ? 'bad' : log.level === 'warning' ? 'warn' : 'neutral'}">${escapeHTML(log.level)}</span></td>
      <td><strong>${escapeHTML(log.message)}</strong><small>${escapeHTML(log.source || 'client')}</small></td>
      <td>${formatDateTime(log.created_at)}</td>
      <td><button class="text-button" type="button" data-log-detail="${log.id}">Xem chi tiết</button><pre id="logDetail-${log.id}" class="system-log-detail" hidden>${escapeHTML(details)}</pre></td>
      <td>${log.resolved ? '<span class="status-pill good">Đã xử lý</span>' : '<span class="status-pill warn">Chưa xử lý</span>'}</td>
      <td><button class="secondary-button compact-button" type="button" data-resolve-log="${log.id}" data-resolved="${log.resolved}">${log.resolved ? 'Mở lại' : 'Đánh dấu xử lý'}</button></td>
    </tr>`;
  }).join('');
}

function profileRows(profiles, currentUserId, trangThaiMap) {
  return profiles.map((profile) => {
    const tk = trangThaiMap.get(String(profile.employee_code || '').toLowerCase());
    const protectedRole = VAI_TRO_BAO_VE.includes(profile.role) || profile.id === currentUserId;
    // Vai trò hiện tại LUÔN có mặt trong danh sách, kể cả khi nó không thuộc
    // nhóm cấp được. Thiếu nó thì ô chọn rơi về mục đầu tiên và người dùng
    // nhìn thấy một vai trò không phải của mình.
    const dsVaiTro = VAI_TRO_CAP_DUOC.includes(profile.role)
      ? VAI_TRO_CAP_DUOC : [profile.role, ...VAI_TRO_CAP_DUOC];
    return `<tr><td><strong>${escapeHTML(profile.full_name)}</strong><small>${escapeHTML(profile.employee_code || 'Tài khoản hệ thống')}</small></td>
      <td>${escapeHTML(profile.department || '—')}</td><td>${escapeHTML(profile.branch_id || '—')}</td>
      <td><select data-user-role="${profile.id}" ${protectedRole ? 'disabled' : ''}>${dsVaiTro.map((role) => `<option value="${escapeHTML(role)}" ${profile.role === role ? 'selected' : ''}>${escapeHTML(roleLabel[role] || role)}</option>`).join('')}</select></td>
      <td><label class="system-toggle"><input type="checkbox" data-user-active="${profile.id}" ${profile.active ? 'checked' : ''} ${protectedRole ? 'disabled' : ''}><span>${profile.active ? 'Hoạt động' : 'Đã khóa'}</span></label></td>
      <td>${!tk ? '<span class="subtle">Chưa có tài khoản</span>'
        : tk.dang_khoa ? `<span class="status-pill bad">Đang khoá đăng nhập</span>`
        : tk.failed_attempts > 0 ? `<span class="status-pill warn">Sai ${tk.failed_attempts} lần</span>`
        : `<span class="status-pill good">Đăng nhập được</span>`}
        ${tk?.last_login_at ? `<small class="subtle">Vào lần cuối ${formatDateTime(tk.last_login_at)}</small>` : ''}</td>
      <td class="sa-thaotac">${protectedRole ? '<span class="subtle">Được bảo vệ</span>'
        : `<button class="secondary-button compact-button" type="button" data-save-access="${profile.id}" title="Lưu nhanh vai trò và trạng thái hoạt động">Lưu quyền</button>`}
        ${profile.id === currentUserId || !VAI_TRO_BAO_VE.includes(profile.role) ? `<button class="secondary-button compact-button" type="button"
          data-edit-profile="${profile.id}" title="Sửa thông tin cá nhân và đổi mã nhân viên (MNV)"><i class="ri-edit-line"></i> Sửa thông tin / Mã NV</button>` : ''}
        ${profile.employee_code ? `<button class="secondary-button compact-button" type="button"
          data-unlock="${escapeHTML(profile.employee_code)}"
          title="Xoá bộ đếm nhập sai mật khẩu. KHÔNG đổi mật khẩu.">Mở khoá</button>
        <button class="secondary-button compact-button" type="button"
          data-reset-pw="${escapeHTML(profile.employee_code)}"
          data-ten="${escapeHTML(profile.full_name || profile.employee_code)}"
          title="Đặt mật khẩu mới. Dùng khi người dùng quên hẳn mật khẩu.">Đặt lại mật khẩu</button>` : ''}
        ${!protectedRole ? `<button class="secondary-button compact-button is-danger" type="button"
          data-delete-user="${escapeHTML(profile.id)}"
          data-delete-code="${escapeHTML(profile.employee_code || '')}"
          data-delete-name="${escapeHTML(profile.full_name || profile.employee_code || '')}"
          style="color:#dc2626; border-color:#fecaca; background:#fff5f5;"
          title="Xóa nhân sự khỏi hệ thống (Ẩn vĩnh viễn và hủy quyền)"><i class="ri-delete-bin-line"></i> Xóa</button>` : ''}</td></tr>`;
  }).join('');
}

function editProfileDialog(profile, account) {
  return new Promise((resolve) => {
    const branch = String(profile.branch_id || account?.branch_id || '');
    const departmentSuggestions = [...new Set([
      profile.department,
      ...DEPARTMENTS.flatMap((item) => [item.id, item.name]),
      'marketing', 'Bác sĩ', 'Phụ tá', 'Dịch vụ khách hàng', 'Hành chính Tổng hợp',
    ].filter(Boolean))];
    const branches = [
      ['', 'Chưa xác định'], ['all', 'Cả hai chi nhánh'],
      ['le-van-tho', '5S Lê Văn Thọ'], ['pham-van-chieu', '5S Phạm Văn Chiêu'],
    ];
    if (branch && !branches.some(([value]) => value === branch)) branches.push([branch, branch]);
    const root = document.createElement('div');
    root.className = 'system-dialog-layer sa-profile-layer';
    root.innerHTML = `
      <button class="system-dialog-backdrop" type="button" aria-label="Đóng"></button>
      <section class="system-dialog-panel sa-profile-panel" role="dialog" aria-modal="true" aria-labelledby="saProfileTitle">
        <header class="system-dialog-header">
          <span class="system-dialog-icon"><i class="ri-user-settings-line"></i></span>
          <div><p class="eyebrow">TÀI KHOẢN HỆ THỐNG</p><h3 id="saProfileTitle">Cập nhật thông tin &amp; Mã nhân viên</h3></div>
          <button class="icon-button system-dialog-close" type="button" aria-label="Đóng">×</button>
        </header>
        <p class="system-dialog-message">Thông tin được đồng bộ sang hồ sơ nhân sự và tài khoản đăng nhập. Khi đổi mã nhân sự, hệ thống tự động liên kết phân ca, chấm công và giữ mã cũ để nhân sự đăng nhập kép không bị gián đoạn.</p>
        <form class="sa-profile-form" id="saProfileForm">
          <label><span>Họ và tên *</span><input name="fullName" required maxlength="160" value="${escapeHTML(profile.full_name || '')}"></label>
          <label><span>Mã nhân viên (MNV) *</span><input name="employeeCode" required pattern="[A-Za-z0-9_.-]+" maxlength="30" value="${escapeHTML(profile.employee_code || '')}"><small>Mã định danh duy nhất (Admin IT có quyền điều chỉnh mã mới).</small></label>
          <label><span>Email đăng nhập</span><input name="email" type="email" maxlength="254" value="${escapeHTML(account?.email || profile.email || '')}" placeholder="ten@nhakhoa5s.vn"></label>
          <label><span>Số điện thoại</span><input name="phone" inputmode="tel" maxlength="30" value="${escapeHTML(profile.phone || '')}" placeholder="0901 234 567"></label>
          <label><span>Bộ phận *</span><input name="department" list="saDepartmentList" required maxlength="100" value="${escapeHTML(profile.department || '')}"><datalist id="saDepartmentList">${departmentSuggestions.map((value) => `<option value="${escapeHTML(value)}"></option>`).join('')}</datalist></label>
          <label><span>Chức danh</span><input name="title" maxlength="120" value="${escapeHTML(profile.title || '')}" placeholder="VD: Bác sĩ, Phụ tá, Trưởng bộ phận"></label>
          <label class="span-2"><span>Chi nhánh *</span><select name="branchId" required>${branches.map(([value, label]) => `<option value="${escapeHTML(value)}"${branch === value ? ' selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
          <footer class="system-dialog-actions span-2"><button class="secondary-button" type="button" data-profile-cancel>Hủy</button><button class="primary-button" type="submit"><i class="ri-save-line"></i> Lưu thông tin</button></footer>
        </form>
      </section>`;
    document.body.appendChild(root);
    document.body.classList.add('app-modal-open');
    const close = (value = null) => {
      root.classList.add('is-closing');
      document.body.classList.remove('app-modal-open');
      window.setTimeout(() => root.remove(), 150);
      resolve(value);
    };
    root.querySelector('.system-dialog-backdrop').addEventListener('click', () => close());
    root.querySelector('.system-dialog-close').addEventListener('click', () => close());
    root.querySelector('[data-profile-cancel]').addEventListener('click', () => close());
    root.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    root.querySelector('#saProfileForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      close({
        fullName: String(form.get('fullName') || '').trim(),
        employeeCode: String(form.get('employeeCode') || '').trim(),
        email: String(form.get('email') || '').trim(),
        phone: String(form.get('phone') || '').trim(),
        department: String(form.get('department') || '').trim(),
        title: String(form.get('title') || '').trim(),
        branchId: String(form.get('branchId') || '').trim(),
      });
    });
    requestAnimationFrame(() => root.classList.add('is-open'));
    root.querySelector('[name="fullName"]').focus();
  });
}

function renderSmtpConfigPanel(data) {
  const cfg = data?.config || {};
  const isConfigured = cfg.isConfigured;
  return `<section class="panel">
    <div class="section-title">
      <div>
        <p class="eyebrow">CẤU HÌNH HỆ THỐNG</p>
        <h3>Máy Chủ SMTP Gửi Email Phiếu Lương</h3>
      </div>
      <span class="status-pill ${isConfigured ? 'is-success' : 'is-danger'}" style="font-size:12px;">
        <i class="ri-${isConfigured ? 'checkbox-circle' : 'error-warning'}-line"></i>
        ${isConfigured ? 'Đã cấu hình' : 'Chưa thiết lập'}
      </span>
    </div>

    <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:13px;line-height:1.6;color:#334155;">
      <strong style="color:#0f172a;"><i class="ri-information-line"></i> Hướng dẫn cấu hình Gmail SMTP:</strong>
      <ol style="margin:8px 0 0 18px;padding:0;">
        <li>Đăng nhập Gmail → Vào <a href="https://myaccount.google.com/security" target="_blank" rel="noopener">Google Account Security</a></li>
        <li>Bật <strong>Xác minh 2 bước (2-Step Verification)</strong></li>
        <li>Vào <strong>App Passwords</strong> → Tạo mật khẩu ứng dụng 16 ký tự</li>
        <li>Nhập mật khẩu ứng dụng đó vào ô bên dưới (không phải mật khẩu Gmail thường)</li>
      </ol>
    </div>

    <form id="systemSmtpForm" class="form-grid">
      <div class="form-field">
        <label>Máy chủ SMTP (Host)</label>
        <input name="host" id="sysSmtpHost" value="${escapeHTML(cfg.host || 'smtp.gmail.com')}" placeholder="smtp.gmail.com" />
      </div>
      <div class="form-field">
        <label>Cổng (Port)</label>
        <select name="port" id="sysSmtpPort">
          <option value="465" ${cfg.port === 465 || !cfg.port ? 'selected' : ''}>465 (SSL — Khuyên dùng)</option>
          <option value="587" ${cfg.port === 587 ? 'selected' : ''}>587 (STARTTLS)</option>
        </select>
      </div>
      <div class="form-field full">
        <label>Tài khoản gửi (Email SMTP / Gmail)</label>
        <input name="user" id="sysSmtpUser" type="email" required value="${escapeHTML(cfg.user || '')}" placeholder="hr@nhakhoa5s.vn hoặc example@gmail.com" />
      </div>
      <div class="form-field full">
        <label>Mật khẩu ứng dụng (App Password)</label>
        <input name="pass" id="sysSmtpPass" type="password" value="${escapeHTML(cfg.passMasked || '')}" placeholder="Nhập mật khẩu ứng dụng 16 ký tự" />
        <small class="subtle" style="font-size:0.72rem;">Đối với Gmail: Bật 2FA → Tạo "Mật khẩu ứng dụng" (App Password) tại Google Account. Để trống nếu không thay đổi.</small>
      </div>
      <div class="form-field full">
        <label>Tên hiển thị người gửi</label>
        <input name="fromName" id="sysSmtpFromName" value="${escapeHTML(cfg.fromName || 'CÔNG TY CỔ PHẦN 5S SÀI GÒN - PHÒNG NHÂN SỰ')}" />
      </div>
      <div class="form-field full">
        <label>Email phản hồi (From Email)</label>
        <input name="fromEmail" id="sysSmtpFromEmail" type="email" value="${escapeHTML(cfg.fromEmail || cfg.user || '')}" placeholder="Để trống = dùng tài khoản SMTP" />
      </div>

      <div id="sysSmtpTestResult" style="display:none; margin:10px 0; padding:10px 12px; border-radius:8px; font-size:0.82rem; grid-column:1/-1;"></div>

      <div class="form-field full" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:10px;">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input type="email" id="sysSmtpTestEmail" placeholder="Email nhận thử nghiệm..." style="padding:7px 12px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.82rem; width:240px;" />
          <button type="button" class="secondary-button" id="btnTestSystemSmtp" style="white-space:nowrap;">
            <i class="ri-send-plane-line"></i> Gửi thư thử nghiệm
          </button>
        </div>
        <button type="submit" class="primary-button" id="btnSaveSystemSmtp">
          <i class="ri-save-line"></i> Lưu cấu hình hệ thống
        </button>
      </div>
    </form>

    ${cfg.updatedAt ? `<p class="subtle" style="margin-top:14px; font-size:0.75rem;"><i class="ri-time-line"></i> Cập nhật lần cuối: ${escapeHTML(cfg.updatedAt)} bởi ${escapeHTML(cfg.updatedBy || 'admin_it')}</p>` : ''}
  </section>`;
}

function renderStaffFeedbackBox(feedback) {
  if (!feedback) {
    return `<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:12px; font-size:12px; color:#64748b; text-align:center;">
      <i class="ri-feedback-line" style="font-size:20px; display:block; margin-bottom:4px; opacity:0.6;"></i>
      <span><b>Hộp phản hồi máy chủ cho nhân viên test</b>: Sau khi gửi tin hoặc khi Sếp phê duyệt, thông báo xác nhận gửi về máy chủ và tài khoản nhân viên sẽ hiển thị tại đây.</span>
    </div>`;
  }

  if (feedback.status === 'pending') {
    return `<div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 14px; font-size:13px; color:#1e40af;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <span style="font-weight:700; display:flex; align-items:center; gap:6px; color:#1d4ed8;">
          <i class="ri-robot-2-line" style="font-size:16px;"></i> Phản hồi tự động từ Trợ lý 5S:
        </span>
        <span class="status-pill is-warning" style="font-size:11px;">⏳ Đang chờ Sếp duyệt</span>
      </div>
      <p style="margin:0 0 6px 0; line-height:1.5;">
        "Chào <b>${escapeHTML(feedback.employeeName)}</b> (<code>${escapeHTML(feedback.employeeCode)}</code>), em đã tiếp nhận yêu cầu <b>${escapeHTML(feedback.intentLabel)}</b> ngày <b>${escapeHTML(feedback.workDate)}</b>. Đã chuyển thẻ duyệt chi tiết sang Telegram cho Sếp thẩm định từ xa. Vui lòng chờ thông báo xác nhận nhé!"
      </p>
      <div style="font-size:11px; color:#3b82f6; display:flex; align-items:center; gap:4px;">
        <i class="ri-time-line"></i> Đã gửi lúc: ${escapeHTML(feedback.timeFormatted || new Date().toLocaleTimeString('vi-VN'))} • Kênh: Trợ lý AI Clinic Hub
      </div>
    </div>`;
  }

  if (feedback.status === 'approved') {
    return `<div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:14px; font-size:13px; color:#166534; box-shadow:0 2px 8px rgba(34,197,94,0.12);">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid #bbf7d0; padding-bottom:6px;">
        <span style="font-weight:700; font-size:14px; display:flex; align-items:center; gap:6px; color:#15803d;">
          <i class="ri-checkbox-circle-fill" style="font-size:18px;"></i> PHẢN HỒI TỪ MÁY CHỦ CHO NHÂN VIÊN (${escapeHTML(feedback.employeeCode)})
        </span>
        <span class="status-pill is-success" style="font-size:11px;">✅ ĐÃ DUYỆT XONG</span>
      </div>
      <div style="line-height:1.5; margin-bottom:10px;">
        🎉 <b>Chào ${escapeHTML(feedback.employeeName)}</b>, yêu cầu <b>${escapeHTML(feedback.intentLabel)}</b> ngày <b>${escapeHTML(feedback.workDate)}</b> của bạn đã được <b>${escapeHTML(feedback.approver || 'Admin Sếp')} PHÊ DUYỆT THÀNH CÔNG</b>!
      </div>
      <div style="background:#ffffff; border:1px solid #bbf7d0; border-radius:6px; padding:10px; font-size:12px; margin-bottom:10px;">
        <div style="font-weight:600; color:#15803d; margin-bottom:4px;">📋 Kết quả ghi nhận trên hệ thống máy chủ:</div>
        <ul style="margin:0; padding-left:18px; color:#374151; line-height:1.6;">
          ${feedback.intent === 'bo_sung_cham_cong' ? `
          <li><b>Chấm công GPS (attendance_records):</b> Đã sinh lượt <b>Vào ca (${escapeHTML(feedback.startTime || '08:00')})</b> & <b>Ra ca (${escapeHTML(feedback.endTime || '18:30')})</b> hợp lệ tại chi nhánh <b>${escapeHTML(feedback.branch || 'Phạm Văn Chiêu')}</b>.</li>
          <li><b>Bảng tính ngày công (attendance_work_days):</b> Ghi nhận hoàn thành <b>1.0 công</b> (540 phút).</li>
          ` : feedback.intent === 'doi_ca_truc' ? `
          <li><b>Lịch làm việc (schedule_assignments):</b> Đã cập nhật ca ${escapeHTML(feedback.shift || 'Chiều')} cho đồng nghiệp ${escapeHTML(feedback.targetEmployeeName || 'được bàn giao')}.</li>
          ` : `
          <li><b>Đơn nghỉ phép (leave_requests):</b> Đã duyệt chính thức trên hệ thống nhân sự.</li>
          `}
          <li><b>Chuông thông báo (notifications):</b> Đã gửi thông báo xác nhận vào tài khoản nhân viên <code>${escapeHTML(feedback.employeeCode)}</code>.</li>
          <li><b>Thời gian máy chủ ghi nhận:</b> ${escapeHTML(feedback.timeFormatted || new Date().toLocaleTimeString('vi-VN'))}</li>
        </ul>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="secondary-button compact-button" id="btnGoToAttendanceTab" data-emp="${escapeHTML(feedback.employeeCode)}" style="font-size:12px;">
          <i class="ri-calendar-check-line"></i> Kiểm tra Bảng Chấm Công (${escapeHTML(feedback.employeeCode)})
        </button>
        <button type="button" class="secondary-button compact-button" id="btnGoToAuditTab" style="font-size:12px;">
          <i class="ri-shield-keyhole-line"></i> Xem Lịch Sử Thay Đổi
        </button>
      </div>
    </div>`;
  }

  if (feedback.status === 'rejected') {
    return `<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px 14px; font-size:13px; color:#991b1b;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
        <span style="font-weight:700; display:flex; align-items:center; gap:6px; color:#b91c1c;">
          <i class="ri-close-circle-fill" style="font-size:16px;"></i> PHẢN HỒI TỪ MÁY CHỦ CHO NHÂN VIÊN (${escapeHTML(feedback.employeeCode)}):
        </span>
        <span class="status-pill is-danger" style="font-size:11px;">❌ BỊ TỪ CHỐI</span>
      </div>
      <p style="margin:0 0 6px 0; line-height:1.5;">
        "Chào <b>${escapeHTML(feedback.employeeName)}</b>, rất tiếc yêu cầu <b>${escapeHTML(feedback.intentLabel)}</b> ngày <b>${escapeHTML(feedback.workDate)}</b> của bạn chưa được Sếp chấp thuận. Vui lòng liên hệ trực tiếp Quản lý chi nhánh để được hướng dẫn thêm."
      </p>
      <div style="font-size:11px; color:#991b1b;">
        <i class="ri-time-line"></i> Thời gian phản hồi: ${escapeHTML(feedback.timeFormatted || new Date().toLocaleTimeString('vi-VN'))}
      </div>
    </div>`;
  }

  return '';
}

function renderAiResultBox(data) {
  if (!data) return '';
  return `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:700; color:#2563eb; text-transform:uppercase;">
            <i class="ri-scan-2-line"></i> Ý định nhận diện:
          </span>
          <span class="status-pill is-success" style="font-size:12px; font-weight:700;">
            ${escapeHTML(data.intentLabel || data.intent)}
          </span>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; line-height:1.5;">
          <div><span style="color:#64748b;">Nhân viên:</span> <b>${escapeHTML(data.employeeName)}</b> <small>(${escapeHTML(data.employeeCode)})</small></div>
          <div><span style="color:#64748b;">Chi nhánh:</span> <b>${escapeHTML(data.branch || 'PVC')}</b></div>
          <div><span style="color:#64748b;">Ngày áp dụng:</span> <b>${escapeHTML(data.workDate)}</b> ${data.toDate && data.toDate !== data.workDate ? `đến <b>${escapeHTML(data.toDate)}</b>` : ''}</div>
          <div><span style="color:#64748b;">Ca làm:</span> <b>${escapeHTML(data.shift || '')}</b> ${data.startTime ? `(${escapeHTML(data.startTime)})` : ''}</div>
          ${data.targetEmployeeName ? `<div style="grid-column:1/-1;"><span style="color:#64748b;">Người đổi/bàn giao:</span> <b>${escapeHTML(data.targetEmployeeName)}</b></div>` : ''}
          <div style="grid-column:1/-1;"><span style="color:#64748b;">Lý do:</span> <i>${escapeHTML(data.reason || data.summary || '')}</i></div>
        </div>
      </div>

      <!-- Khối Kiểm tra logic / Sanity Check -->
      <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:10px 12px; font-size:12px; color:#065f46;">
        <strong style="display:block; margin-bottom:4px;"><i class="ri-shield-check-line"></i> Thẩm định logic vận hành:</strong>
        <span>${escapeHTML(data.sanityCheck || 'Hợp lệ theo quy chuẩn vận hành của hệ thống.')}</span>
      </div>

      <!-- JSON Raw Accordion -->
      <details style="border:1px solid #e2e8f0; border-radius:6px; padding:8px; font-size:11px; background:#f8fafc;">
        <summary style="cursor:pointer; font-weight:600; color:#475569;"><i class="ri-code-box-line"></i> Xem cấu trúc JSON Schema trích xuất</summary>
        <pre style="margin:6px 0 0 0; background:#0f172a; color:#f8fafc; padding:8px; border-radius:4px; overflow-x:auto; font-size:11px;">${escapeHTML(JSON.stringify(data, null, 2))}</pre>
      </details>
    </div>
  `;
}

function renderTelegramApprovalCard(data) {
  if (!data) return '';
  return `
    <div id="simulatedTelegramCard" style="background:#229ED9; padding:2px; border-radius:12px; box-shadow:0 4px 12px rgba(34,158,217,0.25);">
      <div style="background:#ffffff; border-radius:10px; padding:14px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <!-- Header Telegram -->
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:8px;">
          <div style="width:36px; height:36px; border-radius:50%; overflow:hidden; flex-shrink:0; box-shadow:0 2px 8px rgba(34,158,217,0.3); border:1.5px solid #229ED9; display:flex; align-items:center; justify-content:center; background:#0f172a;">
            <img src="/images/ai-bot-avatar.jpg" alt="AI Sentinel" style="width:100%; height:100%; object-fit:cover; display:block;" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
            <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
              <i class="ri-terminal-box-fill" style="color:#38bdf8; font-size:20px;"></i>
            </div>
          </div>
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:4px;">
              <strong style="font-size:13px; color:#0f172a;">Clinic Hub 5S Sentinel</strong>
              <i class="ri-checkbox-circle-fill" style="color:#229ED9; font-size:14px;"></i>
            </div>
            <span style="font-size:11px; color:#64748b;">bot • vừa xong</span>
          </div>
        </div>

        <!-- Nội dung tin nhắn -->
        <div style="font-size:13px; line-height:1.55; color:#1e293b;">
          <div style="background:#f1f5f9; padding:4px 8px; border-radius:4px; font-weight:700; color:#0369a1; font-size:12px; margin-bottom:8px; display:inline-block;">
            📌 YÊU CẦU CẦN SẾP DUYỆT TỪ XA
          </div>
          <div><b>📋 Loại yêu cầu:</b> ${escapeHTML(data.intentLabel || data.intent)}</div>
          <div><b>👤 Nhân sự:</b> <b>${escapeHTML(data.employeeName)}</b> (${escapeHTML(data.employeeCode)})</div>
          <div><b>📅 Ngày:</b> <code>${escapeHTML(data.workDate)}</code> ${data.toDate && data.toDate !== data.workDate ? `đến <code>${escapeHTML(data.toDate)}</code>` : ''}</div>
          <div><b>⏰ Ca / Giờ:</b> ${escapeHTML(data.shift || '')} ${data.startTime ? `(${escapeHTML(data.startTime)})` : ''}</div>
          <div><b>🏥 Chi nhánh:</b> ${escapeHTML(data.branch || 'PVC')}</div>
          ${data.targetEmployeeName ? `<div><b>👥 Đổi với:</b> <b>${escapeHTML(data.targetEmployeeName)}</b></div>` : ''}
          <div><b>📝 Lý do:</b> <i>${escapeHTML(data.reason || data.summary || '')}</i></div>
          <div style="margin-top:8px; padding-top:6px; border-top:1px dashed #cbd5e1; font-size:12px; color:#047857;">
            <b>🔍 Thẩm định:</b> ${escapeHTML(data.sanityCheck || 'Hợp lệ theo tiêu chuẩn')}
          </div>
        </div>

        <!-- Trạng thái sau khi bấm duyệt -->
        <div id="approvalCardStatus" style="display:none; margin-top:12px; padding:10px; border-radius:6px; font-size:12px; font-weight:600; text-align:center;"></div>

        <!-- Nút bấm tương tác của Sếp -->
        <div id="approvalActionButtons" style="display:flex; flex-direction:column; gap:8px; margin-top:14px;">
          <div style="display:flex; gap:8px;">
            <button type="button" id="btnApproveRequest" style="flex:1; background:#16a34a; color:#fff; border:none; border-radius:6px; padding:9px 12px; font-weight:700; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
              <i class="ri-checkbox-circle-line"></i> Phê duyệt ngay
            </button>
            <button type="button" id="btnRejectRequest" style="flex:1; background:#ef4444; color:#fff; border:none; border-radius:6px; padding:9px 12px; font-weight:700; font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
              <i class="ri-close-circle-line"></i> Từ chối
            </button>
          </div>

          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:#475569; cursor:pointer; margin-top:2px;">
            <input type="checkbox" id="chkCommitDb" checked />
            <span>Tự động cập nhật bảng dữ liệu thật (<code>leave_requests</code> / <code>schedule_assignments</code>)</span>
          </label>

          <button type="button" class="secondary-button" id="btnSendRealTelegram" style="width:100%; justify-content:center; font-size:12px; margin-top:4px;">
            <i class="ri-send-plane-fill" style="color:#229ED9;"></i> Bắn thử tin nhắn này vào Telegram thật của tôi
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderGeminiBotStudioPanel(data, actData, profiles) {
  const cfg = data || {};
  const isConfigured = cfg.isConfigured;
  const cur = geminiDemoCurrentResult;
  const dsNhanSu = Array.isArray(profiles) ? profiles.filter((p) => p.employee_code && p.active !== false) : [];

  const stats = actData?.stats || {
    totalToday: 0,
    dailyLimit: cfg.dailyLimit || 1000,
    keysCount: cfg.apiKeysCount || 1,
    activeKeyIndex: 0,
    successAiCount: 0,
    fallbackCount: 0,
    rateLimitHits: 0,
  };
  const activities = Array.isArray(actData?.activities) ? actData.activities : [];

  const quotaPercent = Math.min(100, Math.round((stats.totalToday / Math.max(1, stats.dailyLimit)) * 100));
  const aiSuccessPercent = Math.round((stats.successAiCount / Math.max(1, stats.totalToday || 1)) * 100);

  return `<section class="panel gemini-bot-panel">
    <div class="section-title">
      <div>
        <p class="eyebrow">AI STUDIO & AUTOMATION</p>
        <h3>Trợ Lý AI Gemini — Điều Phối Ca Trực, Bổ Sung Công & Giám Sát Usage</h3>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <span class="status-pill ${isConfigured ? 'is-success' : 'is-warning'}" style="font-size:12px;">
          <i class="ri-${isConfigured ? 'sparkling' : 'flashlight'}-line"></i>
          ${isConfigured ? `${cfg.model || 'Gemini'} Active (${stats.keysCount} Keys)` : 'Chế độ Bóc tách Tự động'}
        </span>
        <button type="button" class="secondary-button compact-button" id="btnToggleGeminiConfig">
          <i class="ri-settings-4-line"></i> Cấu hình Multi-Key & Quota
        </button>
      </div>
    </div>

    <!-- 4 THẺ THỐNG KÊ USAGE & RATE LIMIT TRỰC QUAN -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:12px; margin-bottom:18px;">
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:600; color:#64748b;">LƯỢT GỌI HÔM NAY</span>
          <i class="ri-dashboard-3-line" style="color:#0284c7; font-size:18px;"></i>
        </div>
        <div style="font-size:20px; font-weight:800; color:#0f172a;">
          ${stats.totalToday} <span style="font-size:13px; font-weight:500; color:#64748b;">/ ${stats.dailyLimit} limit</span>
        </div>
        <div style="background:#f1f5f9; height:6px; border-radius:3px; margin-top:8px; overflow:hidden;">
          <div style="background:${quotaPercent > 85 ? '#ef4444' : quotaPercent > 60 ? '#f59e0b' : '#0284c7'}; width:${quotaPercent}%; height:100%; border-radius:3px;"></div>
        </div>
        <span style="font-size:11px; color:#64748b; margin-top:4px; display:block;">Đã dùng ${quotaPercent}% quota ngày</span>
      </div>

      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:600; color:#64748b;">KEY POOL (FAILOVER)</span>
          <i class="ri-key-2-line" style="color:#10b981; font-size:18px;"></i>
        </div>
        <div style="font-size:20px; font-weight:800; color:#0f172a;">
          ${stats.keysCount} <span style="font-size:13px; font-weight:500; color:#64748b;">API Keys</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
          <span class="status-pill is-success" style="font-size:11px; padding:2px 8px;">
            <i class="ri-checkbox-circle-fill"></i> Đang chạy: Key #${stats.activeKeyIndex + 1}
          </span>
        </div>
        <span style="font-size:11px; color:#64748b; margin-top:4px; display:block;">Tự động nhảy key khi gặp 429</span>
      </div>

      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:600; color:#64748b;">TỶ LỆ AI THÀNH CÔNG</span>
          <i class="ri-sparkling-fill" style="color:#8b5cf6; font-size:18px;"></i>
        </div>
        <div style="font-size:20px; font-weight:800; color:#0f172a;">
          ${stats.successAiCount} <span style="font-size:13px; font-weight:500; color:#64748b;">(${aiSuccessPercent}%)</span>
        </div>
        <div style="font-size:11px; color:#64748b; margin-top:6px;">
          <b>${stats.fallbackCount}</b> lượt Fallback rule dự phòng
        </div>
        <span style="font-size:11px; color:#10b981; margin-top:4px; display:block;">Hoạt động liên tục 24/7</span>
      </div>

      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <span style="font-size:12px; font-weight:600; color:#64748b;">FAILOVER RATE LIMIT</span>
          <i class="ri-shield-flash-line" style="color:#f59e0b; font-size:18px;"></i>
        </div>
        <div style="font-size:20px; font-weight:800; color:#0f172a;">
          ${stats.rateLimitHits} <span style="font-size:13px; font-weight:500; color:#64748b;">lần hoán đổi</span>
        </div>
        <div style="font-size:11px; color:#64748b; margin-top:6px;">
          Tự đổi key khi hết lượt gọi API
        </div>
        <span style="font-size:11px; color:#0284c7; margin-top:4px; display:block;">Bảo vệ trải nghiệm người dùng</span>
      </div>
    </div>

    <!-- Khối Cấu hình Gemini Multi-Key & Quota (mặc định ẩn) -->
    <div id="geminiConfigBox" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:18px; margin-bottom:20px; box-shadow:0 2px 6px rgba(0,0,0,0.04);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
        <h4 style="margin:0; font-size:14px; color:#0f172a; display:flex; align-items:center; gap:6px;">
          <i class="ri-settings-line" style="color:#0284c7;"></i> Cài đặt Google Gemini Multi-Key Pool & Telegram Quản trị
        </h4>
        <button type="button" class="secondary-button compact-button" id="btnTestGeminiKeys">
          <i class="ri-heart-pulse-line" style="color:#10b981;"></i> Kiểm tra sức khỏe Key Pool
        </button>
      </div>

      <div id="geminiKeyTestResultsBox" style="display:none; margin-bottom:14px;"></div>

      <form id="geminiConfigForm" class="form-grid">
        <div class="form-field full">
          <label>Google Gemini API Keys (Hỗ trợ nhập nhiều key — Mỗi dòng 1 key để tự động đổi khi gặp 429)</label>
          <textarea name="apiKeysRaw" id="geminiApiKeysRaw" rows="3" style="width:100%; font-family:monospace; font-size:12px; padding:8px 12px; border:1px solid #cbd5e1; border-radius:6px;" placeholder="Nhập 1 hoặc nhiều API Key Gemini (mỗi dòng 1 key)...">${escapeHTML(cfg.apiKeysMasked && cfg.apiKeysMasked.length ? cfg.apiKeysMasked.join('\n') : (cfg.apiKeyMasked || ''))}</textarea>
          <small class="subtle" style="font-size:0.75rem;">Khi 1 key chạm giới hạn Rate Limit (HTTP 429 / Quota exhausted), hệ thống lập tức tự nhảy sang key tiếp theo mà không làm gián đoạn nhân viên.</small>
        </div>
        <div class="form-field">
          <label>Giới hạn lượt gọi AI / ngày (Daily Limit)</label>
          <input type="number" name="dailyLimit" id="geminiDailyLimit" min="50" max="100000" value="${escapeHTML(String(cfg.dailyLimit || 1000))}" />
        </div>
        <div class="form-field">
          <label>Mô hình AI (Model)</label>
          <select name="model" id="geminiModel">
            <option value="gemini-3.6-flash" ${cfg.model === 'gemini-3.6-flash' || !cfg.model ? 'selected' : ''}>gemini-3.6-flash (Mới nhất, siêu nhanh & chính xác)</option>
            <option value="gemini-3.8-flash" ${cfg.model === 'gemini-3.8-flash' ? 'selected' : ''}>gemini-3.8-flash (Tốc độ cao & thông minh nhất)</option>
            <option value="gemini-flash-latest" ${cfg.model === 'gemini-flash-latest' ? 'selected' : ''}>gemini-flash-latest (Tự động cập nhật)</option>
            <option value="gemini-pro-latest" ${cfg.model === 'gemini-pro-latest' ? 'selected' : ''}>gemini-pro-latest (Suy luận chuyên sâu)</option>
          </select>
        </div>
        <div class="form-field full">
          <label>Telegram Admin Chat ID (Để nhận tin duyệt thật trên điện thoại của Sếp)</label>
          <input name="telegramChatId" id="geminiChatId" value="${escapeHTML(cfg.telegramChatId || '')}" placeholder="VD: 5412345678" />
        </div>
        <div class="form-field full" style="display:flex; justify-content:flex-end; gap:8px;">
          <button type="submit" class="primary-button" id="btnSaveGeminiConfig">
            <i class="ri-save-line"></i> Lưu cấu hình Multi-Key & Hạn mức
          </button>
        </div>
      </form>
    </div>

    <!-- STUDIO 3 CỘT (GIẢ LẬP NHÂN VIÊN & THẺ TELEGRAM DUYỆT TỪ XA) -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:18px; align-items:start;">
      
      <!-- CỘT 1: GIẢ LẬP NHÂN VIÊN GỬI YÊU CẦU -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
          <span style="background:#dbeafe; color:#1d4ed8; width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">1</span>
          <h4 style="margin:0; font-size:14px; color:#1e293b;">Nhân sự gửi yêu cầu tự nhiên</h4>
        </div>

        <form id="geminiPromptForm" style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Nhân sự gửi tin:</label>
            <select id="geminiStaffSelect" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">
              <option value="">— Chọn nhân viên thử nghiệm —</option>
              ${dsNhanSu.map((p) => `<option value="${escapeHTML(p.employee_code)}" data-name="${escapeHTML(p.full_name)}" data-dept="${escapeHTML(p.department || '')}" data-branch="${escapeHTML(p.branch_id || '')}">${escapeHTML(p.full_name)} (${escapeHTML(p.employee_code)}) · ${escapeHTML(p.branch_id || 'PVC')}</option>`).join('')}
            </select>
          </div>

          <div>
            <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:6px;">Mẫu tình huống thực tế thường gặp:</label>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <button type="button" class="secondary-button compact-button gemini-quick-chip" style="text-align:left; font-size:12px; padding:6px 10px; white-space:normal; line-height:1.4;" data-prompt="Em xin đổi ca chiều thứ 6 (26/09) ở PVC với bạn Lan Anh ca sáng do em bận lịch học đột xuất ạ">
                🔄 <b>Đổi ca thứ 6 (26/09):</b> Chiều PVC đổi bạn Lan Anh
              </button>
              <button type="button" class="secondary-button compact-button gemini-quick-chip" style="text-align:left; font-size:12px; padding:6px 10px; white-space:normal; line-height:1.4;" data-prompt="Hôm qua em quên bấm check-out lúc 18h30 do hỗ trợ bác sĩ phẫu thuật gấp, xin sếp bổ sung công ca chiều ạ">
                ⏰ <b>Quên chấm công ra:</b> 18h30 hôm qua ca chiều
              </button>
              <button type="button" class="secondary-button compact-button gemini-quick-chip" style="text-align:left; font-size:12px; padding:6px 10px; white-space:normal; line-height:1.4;" data-prompt="Tuần sau em xin nghỉ phép 2 ngày từ 29/09 đến 30/09 về quê có việc gia đình, em đã bàn giao việc cho bạn Thu Trang">
                🏖️ <b>Xin nghỉ phép 2 ngày:</b> 29-30/09 việc gia đình
              </button>
              <button type="button" class="secondary-button compact-button gemini-quick-chip" style="text-align:left; font-size:12px; padding:6px 10px; white-space:normal; line-height:1.4;" data-prompt="Em bị sốt xuất huyết đột ngột, xin phép đổi ca trực tối hôm nay ở LVT cho bạn Minh Quân hỗ trợ">
                🚑 <b>Đổi ca tối khẩn cấp:</b> Tối nay LVT cho Minh Quân
              </button>
            </div>
          </div>

          <div>
            <label style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:4px;">Nội dung tin nhắn:</label>
            <textarea id="geminiPromptInput" rows="4" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; resize:vertical; font-family:inherit;" placeholder="Nhập câu nhắn bằng tiếng Việt tự nhiên... (VD: Em xin đổi ca chiều thứ 6 ở PVC với bạn Lan Anh...)"></textarea>
          </div>

          <button type="submit" class="primary-button" id="btnRunGeminiProcess" style="justify-content:center; padding:10px;">
            <i class="ri-sparkling-fill"></i> Gửi Trợ lý AI Phân tích
          </button>
        </form>

        <div id="geminiStaffFeedbackBox" style="margin-top:14px;">
          ${renderStaffFeedbackBox(geminiStaffFeedback)}
        </div>
      </div>

      <!-- CỘT 2: AI THẨM ĐỊNH & BÓC TÁCH DỮ LIỆU -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="background:#e0e7ff; color:#4338ca; width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">2</span>
            <h4 style="margin:0; font-size:14px; color:#1e293b;">Gemini AI thẩm định & trích xuất</h4>
          </div>
          <span id="geminiAiBadge" class="status-pill is-info" style="font-size:11px;">Chờ dữ liệu</span>
        </div>

        <div id="geminiOutputContainer">
          ${cur ? renderAiResultBox(cur) : `
          <div style="text-align:center; padding:40px 10px; color:#94a3b8;">
            <i class="ri-cpu-line" style="font-size:36px; display:block; margin-bottom:8px; opacity:0.6;"></i>
            <p style="font-size:13px; margin:0;">Chọn kịch bản bên trái hoặc nhập tin nhắn rồi bấm <b>"Gửi Trợ lý AI Phân tích"</b></p>
          </div>
          `}
        </div>
      </div>

      <!-- CỘT 3: SẾP DUYỆT TỪ XA (TELEGRAM CARD) -->
      <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="background:#dcfce7; color:#15803d; width:28px; height:28px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">3</span>
            <h4 style="margin:0; font-size:14px; color:#1e293b;">Sếp duyệt từ xa (Thẻ Telegram)</h4>
          </div>
          <span class="subtle" style="font-size:11px;">Mô phỏng Mobile App</span>
        </div>

        <div id="geminiApprovalCardContainer">
          ${cur ? renderTelegramApprovalCard(cur) : `
          <div style="text-align:center; padding:40px 10px; color:#94a3b8;">
            <i class="ri-telegram-fill" style="font-size:36px; display:block; margin-bottom:8px; color:#229ED9; opacity:0.5;"></i>
            <p style="font-size:13px; margin:0;">Thẻ tin nhắn Telegram tương tác sẽ hiển thị tại đây khi AI bóc tách xong.</p>
          </div>
          `}
        </div>
      </div>

    </div>

    <!-- BẢNG GIÁM SÁT THỜI GIAN THỰC: AI ĐANG LÀM GÌ & ĐẦU RA -->
    <div style="margin-top:24px; background:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:18px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="margin:0; font-size:15px; color:#0f172a; display:flex; align-items:center; gap:6px;">
            <i class="ri-radar-line" style="color:#0284c7;"></i> Bảng Giám Sát Hoạt Động & Đầu Ra AI Thời Gian Thực
          </h4>
          <p style="margin:3px 0 0 0; font-size:12px; color:#64748b;">Theo dõi yêu cầu của nhân viên, quyết định của AI, tốc độ xử lý và trạng thái duyệt</p>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button type="button" class="secondary-button compact-button" id="btnRefreshGeminiActivities">
            <i class="ri-refresh-line"></i> Làm mới nhật ký (${activities.length})
          </button>
        </div>
      </div>

      <div class="table-wrap" style="max-height:480px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
          <thead>
            <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#475569; text-align:left;">
              <th style="padding:10px 12px; width:120px;">Thời gian</th>
              <th style="padding:10px 12px; width:160px;">Nhân sự</th>
              <th style="padding:10px 12px; width:220px;">Tin nhắn nhân viên</th>
              <th style="padding:10px 12px; width:140px;">Ý định</th>
              <th style="padding:10px 12px; width:170px;">Model & Key</th>
              <th style="padding:10px 12px;">AI Trả lời / Hành động</th>
              <th style="padding:10px 12px; text-align:center; width:90px;">Telegram</th>
              <th style="padding:10px 12px; text-align:center; width:110px;">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${activities.length ? activities.map((act) => {
              const isPending = act.approval_status === 'pending';
              const isApproved = act.approval_status === 'approved';
              const statusBadge = isApproved
                ? '<span class="status-pill is-success" style="font-size:11px;"><i class="ri-checkbox-circle-fill"></i> Đã duyệt</span>'
                : isPending
                ? '<span class="status-pill is-warning" style="font-size:11px;"><i class="ri-time-line"></i> Chờ duyệt</span>'
                : '<span class="status-pill is-info" style="font-size:11px;">ℹ️ Thông tin</span>';

              const intentBadge = act.intent === 'doi_ca_truc'
                ? '<span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:4px; font-weight:600; font-size:11px;">🔄 Đổi ca</span>'
                : act.intent === 'bo_sung_cham_cong'
                ? '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:4px; font-weight:600; font-size:11px;">⏰ Bổ sung công</span>'
                : act.intent === 'xin_nghi_phep'
                ? '<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:4px; font-weight:600; font-size:11px;">🏖️ Nghỉ phép</span>'
                : '<span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:4px; font-weight:600; font-size:11px;">❓ Hỏi đáp</span>';

              return `<tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:10px 12px; color:#64748b; font-size:11px; white-space:nowrap;">
                  ${formatDateTime(act.created_at)}
                </td>
                <td style="padding:10px 12px;">
                  <strong style="color:#0f172a;">${escapeHTML(act.employee_name || act.employee_code)}</strong>
                  <div style="font-size:11px; color:#64748b;">${escapeHTML(act.employee_code)} · ${escapeHTML(act.branch || 'PVC')}</div>
                </td>
                <td style="padding:10px 12px;">
                  <span style="color:#334155; font-style:italic;">"${escapeHTML(act.raw_prompt || '')}"</span>
                </td>
                <td style="padding:10px 12px;">
                  ${intentBadge}
                </td>
                <td style="padding:10px 12px;">
                  <div style="font-weight:600; font-size:11px; color:#0284c7;">
                    ${escapeHTML(act.model || 'Gemini')}
                    ${act.key_index ? `<span style="color:#64748b;">[Key #${act.key_index}]</span>` : ''}
                  </div>
                  <div style="font-size:10px; color:#94a3b8;">${act.latency_ms ? `${act.latency_ms}ms` : ''} ${act.used_ai ? '• AI' : '• Smart Fallback'}</div>
                </td>
                <td style="padding:10px 12px;">
                  <div style="font-size:12px; color:#1e293b; max-height:48px; overflow:hidden; text-overflow:ellipsis;">
                    ${escapeHTML(act.ai_reply || act.details?.summary || '')}
                  </div>
                </td>
                <td style="padding:10px 12px; text-align:center;">
                  ${act.telegram_notified 
                    ? '<i class="ri-telegram-fill" style="color:#229ED9; font-size:16px;" title="Đã gửi thông báo Telegram cho Sếp"></i>' 
                    : '<span style="color:#cbd5e1;">—</span>'}
                </td>
                <td style="padding:10px 12px; text-align:center;">
                  ${statusBadge}
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="8" style="text-align:center; padding:30px 10px; color:#94a3b8;">Chưa có hoạt động AI nào được ghi nhận. Hãy gửi tin nhắn thử nghiệm ở trên hoặc trong mục Chat.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

function bindGeminiBotEvents() {
  document.getElementById('btnToggleGeminiConfig')?.addEventListener('click', () => {
    const box = document.getElementById('geminiConfigBox');
    if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('btnTestGeminiKeys')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnTestGeminiKeys');
    const box = document.getElementById('geminiKeyTestResultsBox');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang ping Key Pool...';
    }
    if (box) {
      box.style.display = 'block';
      box.innerHTML = '<div style="background:#eff6ff; color:#1e40af; padding:10px 14px; border-radius:6px; font-size:12px;"><i class="ri-loader-4-line ri-spin"></i> Đang kiểm tra lần lượt từng API Key trong hệ thống...</div>';
    }
    try {
      const apiKeysRaw = document.getElementById('geminiApiKeysRaw')?.value || '';
      const model = document.getElementById('geminiModel')?.value || 'gemini-3.6-flash';
      const res = await testGeminiKeys({ apiKeysRaw, model });
      if (box) {
        if (res?.keys && res.keys.length > 0) {
          box.innerHTML = `<div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:12px; font-size:12px;">
            <div style="font-weight:700; margin-bottom:8px; color:#0f172a; display:flex; align-items:center; gap:6px;">
              <i class="ri-shield-check-line" style="color:#10b981;"></i> Kết quả kiểm tra ${res.keys.length} API Key:
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${res.keys.map((k) => `
                <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; background:${k.status === 'healthy' ? '#f0fdf4' : k.status === 'rate_limited' ? '#fef3c7' : '#fef2f2'}; border-radius:6px; border:1px solid ${k.status === 'healthy' ? '#bbf7d0' : k.status === 'rate_limited' ? '#fde68a' : '#fecaca'};">
                  <div>
                    <b>Key #${k.index + 1}</b> (<code>${escapeHTML(k.keyMasked)}</code>)
                    <span style="margin-left:8px; color:#64748b;">${escapeHTML(k.message)}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:600; font-size:11px; color:#475569;">${k.latencyMs}ms</span>
                    <span class="status-pill ${k.status === 'healthy' ? 'is-success' : k.status === 'rate_limited' ? 'is-warning' : 'is-danger'}" style="font-size:10px; padding:1px 6px;">
                      ${k.status === 'healthy' ? 'Hoạt động' : k.status === 'rate_limited' ? 'Hết Quota (429)' : 'Lỗi'}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>`;
        } else {
          box.innerHTML = `<div style="background:#fef2f2; color:#b91c1c; padding:10px; border-radius:6px; font-size:12px;">${escapeHTML(res?.message || 'Không có key để kiểm tra.')}</div>`;
        }
      }
    } catch (err) {
      if (box) box.innerHTML = `<div style="background:#fef2f2; color:#b91c1c; padding:10px; border-radius:6px; font-size:12px;">Lỗi: ${escapeHTML(err.message || 'Không kiểm tra được')}</div>`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-heart-pulse-line" style="color:#10b981;"></i> Kiểm tra sức khỏe Key Pool';
      }
    }
  });

  document.getElementById('btnRefreshGeminiActivities')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnRefreshGeminiActivities');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang tải...';
    }
    try {
      geminiActivitiesData = await getGeminiActivities();
      showToast('Đã làm mới dữ liệu giám sát AI.');
      store.notify();
    } catch (err) {
      showToast(err.message || 'Lỗi cập nhật nhật ký AI.', true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.querySelectorAll('.gemini-quick-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      const input = document.getElementById('geminiPromptInput');
      if (input) {
        input.value = prompt;
        input.focus();
      }
      const staffSelect = document.getElementById('geminiStaffSelect');
      if (staffSelect && !staffSelect.value && staffSelect.options.length > 1) {
        staffSelect.selectedIndex = 1;
      }
    });
  });

  document.getElementById('geminiConfigForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSaveGeminiConfig');
    const apiKeysRaw = document.getElementById('geminiApiKeysRaw')?.value?.trim();
    const dailyLimit = Number(document.getElementById('geminiDailyLimit')?.value || 1000);
    const model = document.getElementById('geminiModel')?.value?.trim() || 'gemini-3.6-flash';
    const telegramChatId = document.getElementById('geminiChatId')?.value?.trim();
    if (btn) btn.disabled = true;
    try {
      await saveGeminiBotConfig({ apiKeysRaw, dailyLimit, model, telegramChatId });
      showToast('Đã lưu cấu hình Multi-Key & Hạn mức Gemini thành công.');
      store.notify();
    } catch (err) {
      showToast(err.message || 'Lỗi lưu cấu hình Gemini.', true);
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById('geminiPromptForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const staffSelect = document.getElementById('geminiStaffSelect');
    const employeeCode = staffSelect?.value || 'NV-DEMO';
    const employeeName = staffSelect?.selectedOptions?.[0]?.getAttribute('data-name') || 'Nhân sự thử nghiệm';
    const text = document.getElementById('geminiPromptInput')?.value?.trim();
    if (!text) {
      showToast('Vui lòng nhập nội dung tin nhắn hoặc chọn mẫu nhanh.', true);
      return;
    }

    const btn = document.getElementById('btnRunGeminiProcess');
    const outBox = document.getElementById('geminiOutputContainer');
    const cardBox = document.getElementById('geminiApprovalCardContainer');
    const badge = document.getElementById('geminiAiBadge');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang bóc tách dữ liệu…';
    }
    if (badge) {
      badge.className = 'status-pill is-warning';
      badge.textContent = 'AI Đang xử lý...';
    }
    if (outBox) {
      outBox.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#475569;"><i class="ri-loader-4-line ri-spin" style="font-size:30px; display:block; margin-bottom:8px; color:#2563eb;"></i><span>Gemini đang phân tích ngữ cảnh, ý định và thực thể...</span></div>';
    }

    try {
      const res = await processGeminiBotDemo({ text, employeeCode, employeeName });
      if (!res?.data) throw new Error(res?.message || 'Không trích xuất được kết quả.');
      geminiDemoCurrentResult = res.data;

      if (badge) {
        badge.className = 'status-pill is-success';
        badge.textContent = `${res.data.model} (${res.data.processingTimeMs}ms)`;
      }

      if (outBox) outBox.innerHTML = renderAiResultBox(res.data);
      if (cardBox) cardBox.innerHTML = renderTelegramApprovalCard(res.data);

      geminiStaffFeedback = {
        ...res.data,
        status: 'pending',
        timeFormatted: new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', dateStyle: 'short' }).format(new Date()),
      };
      const feedbackBox = document.getElementById('geminiStaffFeedbackBox');
      if (feedbackBox) {
        feedbackBox.innerHTML = renderStaffFeedbackBox(geminiStaffFeedback);
      }

      bindApprovalCardActions();
      showToast('Trợ lý AI đã bóc tách dữ liệu và sẵn sàng duyệt!');
    } catch (err) {
      if (badge) {
        badge.className = 'status-pill is-danger';
        badge.textContent = 'Lỗi xử lý';
      }
      if (outBox) {
        outBox.innerHTML = `<div style="background:#fef2f2; color:#b91c1c; padding:12px; border-radius:6px; font-size:13px;"><i class="ri-error-warning-line"></i> ${escapeHTML(err.message || 'Lỗi xử lý yêu cầu.')}</div>`;
      }
      showToast(err.message || 'Lỗi bóc tách với AI.', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-sparkling-fill"></i> Gửi Trợ lý AI Phân tích';
      }
    }
  });

  if (geminiDemoCurrentResult) {
    bindApprovalCardActions();
  }
  bindFeedbackBoxActions();
}

function bindApprovalCardActions() {
  const statusDiv = document.getElementById('approvalCardStatus');
  const btnApprove = document.getElementById('btnApproveRequest');
  const btnReject = document.getElementById('btnRejectRequest');
  const btnSendTelegram = document.getElementById('btnSendRealTelegram');
  const chkCommitDb = document.getElementById('chkCommitDb');

  btnApprove?.addEventListener('click', async () => {
    if (!geminiDemoCurrentResult) return;
    btnApprove.disabled = true;
    btnReject.disabled = true;
    btnApprove.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang duyệt…';

    try {
      let msg = 'Đã phê duyệt yêu cầu.';
      let approvalRes = null;
      if (chkCommitDb?.checked) {
        approvalRes = await approveGeminiBotDemo(geminiDemoCurrentResult);
        msg = approvalRes?.message || 'Đã phê duyệt và lưu vào hệ thống thành công.';
      }
      if (statusDiv) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#f0fdf4';
        statusDiv.style.color = '#15803d';
        statusDiv.style.border = '1px solid #bbf7d0';
        const nowStr = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', dateStyle: 'short' }).format(new Date());
        statusDiv.innerHTML = `✅ <b>ĐÃ PHÊ DUYỆT BỞI SẾP</b><br><small>Thời gian: ${nowStr} • Trạng thái: Đã cập nhật CSDL phòng khám (chấm công & thông báo)</small>`;
      }

      const feedbackData = approvalRes?.feedbackForEmployee || {
        ...geminiDemoCurrentResult,
        status: 'approved',
        approver: 'Admin Sếp',
        timeFormatted: new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', dateStyle: 'short' }).format(new Date()),
      };
      geminiStaffFeedback = { ...feedbackData, status: 'approved' };
      const feedbackBox = document.getElementById('geminiStaffFeedbackBox');
      if (feedbackBox) {
        feedbackBox.innerHTML = renderStaffFeedbackBox(geminiStaffFeedback);
        bindFeedbackBoxActions();
      }

      showToast(msg);
    } catch (err) {
      showToast(err.message || 'Lỗi khi phê duyệt.', true);
      btnApprove.disabled = false;
      btnReject.disabled = false;
      btnApprove.innerHTML = '<i class="ri-checkbox-circle-line"></i> Phê duyệt ngay';
    }
  });

  btnReject?.addEventListener('click', async () => {
    btnApprove.disabled = true;
    btnReject.disabled = true;
    if (statusDiv) {
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#fef2f2';
      statusDiv.style.color = '#b91c1c';
      statusDiv.style.border = '1px solid #fecaca';
      const nowStr = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', dateStyle: 'short' }).format(new Date());
      statusDiv.innerHTML = `❌ <b>ĐÃ TỪ CHỐI BỞI SẾP</b><br><small>Thời gian: ${nowStr} • Yêu cầu không được chấp thuận</small>`;
    }

    geminiStaffFeedback = {
      ...geminiDemoCurrentResult,
      status: 'rejected',
      approver: 'Admin Sếp',
      timeFormatted: new Intl.DateTimeFormat('vi-VN', { timeStyle: 'medium', dateStyle: 'short' }).format(new Date()),
    };
    const feedbackBox = document.getElementById('geminiStaffFeedbackBox');
    if (feedbackBox) {
      feedbackBox.innerHTML = renderStaffFeedbackBox(geminiStaffFeedback);
    }

    showToast('Đã từ chối yêu cầu.');
  });

  btnSendTelegram?.addEventListener('click', async () => {
    if (!geminiDemoCurrentResult) return;
    const targetChatId = document.getElementById('geminiChatId')?.value?.trim();
    btnSendTelegram.disabled = true;
    btnSendTelegram.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang bắn tin nhắn…';
    try {
      const res = await sendTelegramTestApproval(geminiDemoCurrentResult, targetChatId);
      showToast(res?.message || 'Đã gửi thẻ duyệt sang Telegram của Sếp!');
    } catch (err) {
      showToast(err.message || 'Chưa gửi được sang Telegram (vui lòng kiểm tra Chat ID).', true);
    } finally {
      btnSendTelegram.disabled = false;
      btnSendTelegram.innerHTML = '<i class="ri-send-plane-fill" style="color:#229ED9;"></i> Bắn thử tin nhắn này vào Telegram thật của tôi';
    }
  });
}

function bindFeedbackBoxActions() {
  document.getElementById('btnGoToAttendanceTab')?.addEventListener('click', (e) => {
    const code = e.currentTarget.getAttribute('data-emp') || '';
    theDangMo = 'cham-cong';
    ccSearch = code;
    ccPage = 1;
    store.notify();
  });

  document.getElementById('btnGoToAuditTab')?.addEventListener('click', () => {
    theDangMo = 'audit';
    store.notify();
  });
}

function showSnapshotModal(title, snapshotData) {
  let modal = document.getElementById('auditSnapshotModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'auditSnapshotModal';
    modal.className = 'system-dialog-layer is-open';
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  modal.innerHTML = `
    <button class="system-dialog-backdrop" type="button" id="closeSnapshotBackdrop"></button>
    <section class="system-dialog-panel" style="max-width:720px; width:92%; max-height:85vh; display:flex; flex-direction:column; padding:0; overflow:hidden;">
      <header class="system-dialog-header" style="padding:16px 20px; border-bottom:1px solid #e2e8f0;">
        <span class="system-dialog-icon info">ℹ</span>
        <div>
          <p class="eyebrow">AUDIT TRAIL SNAPSHOT</p>
          <h3 id="snapshotTitle">${escapeHTML(title)}</h3>
        </div>
        <button class="icon-button system-dialog-close" type="button" id="closeSnapshotBtn">×</button>
      </header>
      <div style="padding:16px 20px; overflow-y:auto; flex:1; background:#f8fafc;">
        <p style="margin:0 0 10px 0; font-size:13px; color:#475569;">
          Dữ liệu JSON lưu trữ nguyên trạng bản ghi trước khi bị xóa (bảo lưu bằng chứng kiểm toán):
        </p>
        <pre style="background:#0f172a; color:#38bdf8; padding:14px; border-radius:8px; font-size:12px; line-height:1.5; overflow-x:auto; margin:0; font-family:monospace; border:1px solid #1e293b;">${escapeHTML(JSON.stringify(snapshotData, null, 2))}</pre>
      </div>
      <footer class="system-dialog-actions" style="padding:12px 20px; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; background:#fff;">
        <button class="primary-button" type="button" id="closeSnapshotDone">Đóng hộp thoại</button>
      </footer>
    </section>
  `;

  const close = () => { modal.style.display = 'none'; };
  modal.querySelector('#closeSnapshotBackdrop')?.addEventListener('click', close);
  modal.querySelector('#closeSnapshotBtn')?.addEventListener('click', close);
  modal.querySelector('#closeSnapshotDone')?.addEventListener('click', close);
}

function renderTechnicalAuditPanel(audits) {
  const dsAudits = Array.isArray(audits) ? audits : [];
  return `<section class="panel">
    <div class="section-title">
      <div>
        <p class="eyebrow">AUDIT TRAIL HỆ THỐNG</p>
        <h3>Lịch sử thay đổi và kiểm toán dữ liệu</h3>
      </div>
      <span class="subtle">${dsAudits.length} thao tác gần nhất · Đầy đủ Snapshot dữ liệu</span>
    </div>
    <div class="system-audit-list" style="display:flex; flex-direction:column; gap:12px;">
      ${dsAudits.length ? dsAudits.map((item) => {
        const isDeleteReq = item.action === 'delete_test_request' || item.action === 'delete_request';
        const isAttAction = String(item.action || '').startsWith('attendance_');
        const borderColor = isDeleteReq ? '#f87171' : isAttAction ? '#60a5fa' : '#cbd5e1';
        const bgColor = isDeleteReq ? '#fff5f5' : '#ffffff';
        const icon = isDeleteReq ? 'ri-delete-bin-line' : isAttAction ? 'ri-calendar-check-line' : 'ri-shield-keyhole-line';
        const titleLabel = isDeleteReq
          ? `🗑️ Xóa đơn lỗi/test: ${escapeHTML(item.request_summary?.request_type || item.entity)} (${escapeHTML(item.request_summary?.employee_code || item.entity_id)})`
          : `${escapeHTML(item.action)} · ${escapeHTML(item.entity)}`;

        return `<article style="border:1px solid ${borderColor}; background:${bgColor}; border-radius:8px; padding:12px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
            <div style="font-weight:700; color:${isDeleteReq ? '#b91c1c' : '#1e293b'}; font-size:14px; display:flex; align-items:center; gap:6px;">
              <i class="${icon}"></i> ${titleLabel}
            </div>
            <small style="color:#64748b; font-size:12px;"><i class="ri-time-line"></i> ${formatDateTime(item.created_at)}</small>
          </div>

          <div style="font-size:13px; color:#334155; line-height:1.5; margin-bottom:8px;">
            <div><b>Người thực hiện:</b> ${escapeHTML(item.actor_name || item.actor_employee_code || 'Quản trị viên')} <code>(${escapeHTML(item.actor_employee_code || '—')})</code> · Vai trò: <code>${escapeHTML(item.actor_role || 'admin_it')}</code></div>
            ${item.reason ? `<div style="margin-top:4px;"><span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:4px; font-weight:700; font-size:12px;">Lý do: ${escapeHTML(item.reason)}</span></div>` : ''}
          </div>

          ${isDeleteReq && item.request_summary ? `
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; font-size:12px; margin-bottom:8px; line-height:1.6;">
            <div><b>Mã đơn đã xóa:</b> <code>${escapeHTML(item.request_summary.id)}</code></div>
            <div><b>Ngày áp dụng:</b> ${escapeHTML(item.request_summary.from_date || '—')} ${item.request_summary.to_date && item.request_summary.to_date !== item.request_summary.from_date ? '→ ' + escapeHTML(item.request_summary.to_date) : ''}</div>
            <div><b>Lý do gốc của đơn:</b> <i>"${escapeHTML(item.request_summary.original_reason || 'Không có')}"</i></div>
            ${item.cleaned_attendance_records?.length ? `<div style="color:#15803d; font-weight:600; margin-top:4px;"><i class="ri-checkbox-circle-fill"></i> Đã thu hồi ${item.cleaned_attendance_records.length} lượt chấm công GPS và ${item.cleaned_work_days?.length || 0} ngày công.</div>` : ''}
          </div>
          ` : ''}

          ${(item.before || item.after) ? `
          <div>
            <button type="button" class="secondary-button compact-button btn-view-audit-snapshot" data-audit-snapshot="${escapeHTML(JSON.stringify(item.before || item.after || item))}" style="font-size:11px; padding:3px 10px;">
              <i class="ri-file-code-line"></i> Xem chi tiết Snapshot (${item.before ? 'Trước xóa' : 'Dữ liệu'})
            </button>
          </div>
          ` : ''}
        </article>`;
      }).join('') : '<p class="subtle" style="text-align:center; padding:24px 0;">Chưa có nhật ký kiểm toán nào.</p>'}
    </div>
  </section>`;
}

function renderDonTuPanel(requests, deletedAudits, profiles) {
  const dsRequests = Array.isArray(requests) ? requests : [];
  const dsDeleted = Array.isArray(deletedAudits) ? deletedAudits : [];
  const empMap = new Map((profiles || []).map((p) => [String(p.employee_code || p.id || '').toLowerCase(), p.full_name || p.name || p.employee_code]));

  const testKeywords = ['test', 'thử', 'demo', 'lỗi', 'nhầm', 'bs01', 'quên', 'sai', 'fake'];
  const isTestRequest = (req) => {
    const text = `${req.reason || ''} ${req.employee_code || ''} ${req.id || ''} ${req.note || ''}`.toLowerCase();
    return testKeywords.some((kw) => text.includes(kw));
  };

  const countTest = dsRequests.filter(isTestRequest).length;

  const sTerm = dtSearch.trim().toLowerCase();
  const filtered = dsRequests.filter((req) => {
    if (dtOnlyTest && !isTestRequest(req)) return false;
    if (dtType && req.request_type !== dtType) return false;
    if (dtStatus && req.status !== dtStatus) return false;
    if (sTerm) {
      const empName = empMap.get(String(req.employee_code || '').toLowerCase()) || '';
      const searchable = `${req.id || ''} ${req.employee_code || ''} ${empName} ${req.reason || ''} ${req.request_type || ''}`.toLowerCase();
      if (!searchable.includes(sTerm)) return false;
    }
    return true;
  });

  const dsLoaiDon = [...new Set(dsRequests.map((r) => r.request_type).filter(Boolean))].sort();

  return `<section class="panel">
    <div class="section-title">
      <div>
        <p class="eyebrow">QUẢN TRỊ DỮ LIỆU & KIỂM TOÁN</p>
        <h3>Thu hồi & Xóa đơn lỗi / Đơn test (Admin-IT)</h3>
      </div>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <span class="status-pill is-info" style="font-size:12px;">
          <i class="ri-file-list-3-line"></i> ${filtered.length}/${dsRequests.length} đơn hiện hành
        </span>
        ${countTest > 0 ? `
        <span class="status-pill is-warning" style="font-size:12px; font-weight:700;">
          <i class="ri-flask-line"></i> ${countTest} đơn Test / Nghi ngờ
        </span>` : ''}
        <span class="status-pill is-danger" style="font-size:12px;">
          <i class="ri-delete-bin-line"></i> ${dsDeleted.length} đơn đã xóa & lưu nhật ký
        </span>
      </div>
    </div>

    <!-- Hướng dẫn an toàn & quy trình -->
    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 16px; margin-bottom:18px; font-size:13px; line-height:1.6; color:#166534;">
      <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:13px;">
        <i class="ri-shield-check-line" style="font-size:16px;"></i> Quy trình an toàn tuyệt đối cho Admin-IT:
      </div>
      <ul style="margin:0; padding-left:18px; line-height:1.5;">
        <li><b>Soft-Delete an toàn:</b> Đơn xóa sẽ được ẩn an toàn khỏi hệ thống nhân sự và bảng tính công, không làm đứt gãy quan hệ bảng.</li>
        <li><b>Tự động thu hồi công:</b> Tùy chọn thu hồi ngay các lượt chấm công GPS và ngày công phát sinh từ đơn test đó.</li>
        <li><b>Audit Trail bắt buộc:</b> Bắt buộc nhập lý do xóa tối thiểu 5 ký tự. Hệ thống tự động sao lưu toàn bộ Snapshot dữ liệu gốc và hiển thị ở phần Nhật ký bên dưới.</li>
      </ul>
    </div>

    <!-- Bộ lọc tìm kiếm -->
    <form id="dtFilterForm" class="system-filterbar" style="margin-bottom:16px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
      <label style="flex:1; min-width:200px;">
        <span style="display:block; font-size:11px; font-weight:600; margin-bottom:2px; color:#475569;">Tìm kiếm</span>
        <input type="search" id="dtSearchInput" value="${escapeHTML(dtSearch)}" placeholder="Mã đơn, mã NV, tên, lý do..." style="width:100%;" />
      </label>
      <label style="min-width:160px;">
        <span style="display:block; font-size:11px; font-weight:600; margin-bottom:2px; color:#475569;">Loại đơn</span>
        <select id="dtTypeSelect" style="width:100%;">
          <option value="">— Tất cả loại đơn —</option>
          ${dsLoaiDon.map((t) => `<option value="${escapeHTML(t)}"${dtType === t ? ' selected' : ''}>${escapeHTML(t)}</option>`).join('')}
        </select>
      </label>
      <label style="min-width:140px;">
        <span style="display:block; font-size:11px; font-weight:600; margin-bottom:2px; color:#475569;">Trạng thái</span>
        <select id="dtStatusSelect" style="width:100%;">
          <option value="">— Tất cả —</option>
          <option value="pending"${dtStatus === 'pending' ? ' selected' : ''}>Chờ duyệt</option>
          <option value="approved"${dtStatus === 'approved' ? ' selected' : ''}>Đã duyệt</option>
          <option value="rejected"${dtStatus === 'rejected' ? ' selected' : ''}>Từ chối</option>
        </select>
      </label>
      <div style="display:flex; gap:8px; align-items:flex-end; padding-top:16px;">
        <button type="button" class="secondary-button ${dtOnlyTest ? 'is-active' : ''}" id="btnDtToggleTest" style="${dtOnlyTest ? 'background:#fef3c7; color:#b45309; border-color:#f59e0b; font-weight:700;' : ''}">
          <i class="ri-flask-line"></i> ${dtOnlyTest ? 'Đang lọc: Chỉ đơn Test/Lỗi' : 'Lọc nhanh đơn Test/Lỗi'}
        </button>
        ${(dtSearch || dtType || dtStatus || dtOnlyTest) ? `
        <button type="button" class="secondary-button" id="btnDtClearFilter">
          <i class="ri-close-line"></i> Xóa lọc
        </button>` : ''}
      </div>
    </form>

    <!-- Bảng danh sách đơn hiện hành -->
    <div style="margin-bottom:28px;">
      <h4 style="margin:0 0 10px 0; font-size:14px; color:#0f172a; display:flex; align-items:center; gap:6px;">
        <i class="ri-file-list-line" style="color:#2563eb;"></i> Danh sách đơn từ hiện hành trong hệ thống (${filtered.length})
      </h4>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:120px;">Mã đơn</th>
              <th>Nhân sự</th>
              <th>Loại đơn</th>
              <th>Ngày áp dụng</th>
              <th>Lý do gửi đơn</th>
              <th>Trạng thái</th>
              <th style="width:130px; text-align:right;">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length ? filtered.map((req) => {
              const empName = empMap.get(String(req.employee_code || '').toLowerCase()) || req.employee_name || req.employee_code;
              const isTest = isTestRequest(req);
              const statusPill = req.status === 'approved'
                ? '<span class="status-pill is-success" style="font-size:11px;">Đã duyệt</span>'
                : req.status === 'rejected'
                ? '<span class="status-pill is-danger" style="font-size:11px;">Từ chối</span>'
                : '<span class="status-pill is-warning" style="font-size:11px;">Chờ duyệt</span>';

              return `<tr style="${isTest ? 'background:#fffbeb;' : ''}">
                <td><code style="font-size:11px; word-break:break-all;">${escapeHTML(String(req.id || '').slice(0, 16))}…</code></td>
                <td>
                  <strong>${escapeHTML(empName)}</strong><br>
                  <small style="color:#64748b;">${escapeHTML(req.employee_code || '—')}</small>
                </td>
                <td>
                  <span class="status-pill ${req.request_type === 'Bổ sung công' ? 'is-info' : 'neutral'}" style="font-size:11px; white-space:nowrap;">
                    ${escapeHTML(req.request_type || 'Đơn từ')}
                  </span>
                </td>
                <td style="white-space:nowrap; font-size:12px;">
                  ${escapeHTML(req.from_date || '—')}
                  ${req.to_date && req.to_date !== req.from_date ? `<br><small style="color:#64748b;">đến ${escapeHTML(req.to_date)}</small>` : ''}
                </td>
                <td style="font-size:12px; line-height:1.4; max-width:280px;">
                  <div>${escapeHTML(req.reason || '—')}</div>
                  ${isTest ? '<span class="status-pill is-warning" style="font-size:10px; padding:1px 5px; margin-top:3px; display:inline-block;"><i class="ri-flask-line"></i> Đơn test / nghi ngờ</span>' : ''}
                </td>
                <td>${statusPill}</td>
                <td style="text-align:right;">
                  <button type="button" class="secondary-button compact-button danger-button btn-delete-request"
                    data-req-id="${escapeHTML(req.id)}"
                    data-req-emp="${escapeHTML(req.employee_code || '')}"
                    data-req-type="${escapeHTML(req.request_type || '')}"
                    data-req-date="${escapeHTML(req.from_date || '')}"
                    data-req-reason="${escapeHTML(req.reason || '')}"
                    style="color:#b91c1c; border-color:#fca5a5; background:#fff1f2; font-size:11px; white-space:nowrap;">
                    <i class="ri-delete-bin-line"></i> Xóa đơn
                  </button>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="7" class="empty-table-cell" style="padding:24px; text-align:center; color:#64748b;">Không có đơn từ nào khớp bộ lọc.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <!-- KHỐI NHẬT KÝ KIỂM TOÁN CÁC ĐƠN ĐÃ XÓA (YÊU CẦU BẮT BUỘC) -->
    <div style="border-top:2px solid #e2e8f0; padding-top:20px;">
      <div class="section-title" style="margin-bottom:12px;">
        <div>
          <p class="eyebrow" style="color:#b91c1c;">LỊCH SỬ BẢO LƯU KIỂM TOÁN (AUDIT TRAIL)</p>
          <h4 style="margin:0; font-size:15px; color:#0f172a;">Nhật ký các đơn đã xóa & thu hồi (${dsDeleted.length} bản ghi)</h4>
        </div>
        <span class="subtle" style="font-size:12px;">Lưu giữ vĩnh viễn trên máy chủ</span>
      </div>

      <div class="system-audit-list" style="display:flex; flex-direction:column; gap:10px;">
        ${dsDeleted.length ? dsDeleted.map((item) => {
          const reqSum = item.request_summary || item.before || {};
          const actorStr = `${item.actor_name || item.actor_employee_code || 'Admin IT'} (${item.actor_employee_code || '—'} · ${item.actor_role || 'admin_it'})`;

          return `<article style="border:1px solid #fecaca; background:#fffbfb; border-radius:8px; padding:12px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="status-pill is-danger" style="font-size:11px; font-weight:700;">
                  <i class="ri-delete-bin-line"></i> ĐÃ XÓA ĐƠN
                </span>
                <span style="font-weight:700; color:#1e293b; font-size:13px;">
                  ${escapeHTML(reqSum.request_type || 'Đơn')} · Mã: <code>${escapeHTML(reqSum.id || item.entity_id)}</code>
                </span>
              </div>
              <small style="color:#64748b; font-size:12px;">
                <i class="ri-time-line"></i> Xóa lúc: ${formatDateTime(item.created_at)}
              </small>
            </div>

            <div style="font-size:13px; color:#334155; line-height:1.5; margin-bottom:8px;">
              <div><b>Người thực hiện xóa:</b> <span style="color:#0f172a; font-weight:600;">${escapeHTML(actorStr)}</span></div>
              <div style="margin-top:3px;">
                <b>Lý do xóa:</b> <span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:4px; font-weight:700; font-size:12px;">${escapeHTML(item.reason || '—')}</span>
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:12px; line-height:1.6; margin-bottom:8px;">
              <div style="color:#475569; font-weight:600; margin-bottom:2px;">📋 Chi tiết đơn trước khi xóa:</div>
              <div>• Nhân sự: <b>${escapeHTML(reqSum.employee_name || reqSum.employee_code || '—')}</b> (<code>${escapeHTML(reqSum.employee_code || '')}</code>)</div>
              <div>• Ngày áp dụng: <b>${escapeHTML(reqSum.from_date || '—')}</b> ${reqSum.to_date && reqSum.to_date !== reqSum.from_date ? 'đến <b>' + escapeHTML(reqSum.to_date) + '</b>' : ''}</div>
              <div>• Lý do gửi ban đầu: <i>"${escapeHTML(reqSum.original_reason || reqSum.reason || 'Không có')}"</i></div>
              ${item.cleaned_attendance_records?.length ? `
              <div style="color:#15803d; font-weight:600; margin-top:4px;">
                <i class="ri-checkbox-circle-fill"></i> Đã thu hồi kèm theo: <b>${item.cleaned_attendance_records.length} lượt chấm công GPS</b> và <b>${item.cleaned_work_days?.length || 0} ngày công</b>.
              </div>` : ''}
            </div>

            <div style="display:flex; justify-content:flex-end;">
              <button type="button" class="secondary-button compact-button btn-view-audit-snapshot" data-audit-snapshot="${escapeHTML(JSON.stringify(item.before || item))}" style="font-size:11px;">
                <i class="ri-code-box-line"></i> Xem toàn bộ Snapshot dữ liệu gốc
              </button>
            </div>
          </article>`;
        }).join('') : `<p class="subtle" style="text-align:center; padding:18px 0;">Chưa có đơn nào bị xóa trong hệ thống.</p>`}
      </div>
    </div>
  </section>`;
}

export async function renderView(state) {
  /* Mỗi nguồn tự chịu lỗi của mình.
   *
   * Trước đây bảy lời gọi nằm chung một Promise.all, nên MỘT bảng thiếu quyền
   * đọc là cả trung tâm quản trị ra màn trắng — kể cả những phần không liên
   * quan như danh sách tài khoản hay phân quyền. Mà đây chính là màn người ta
   * vào để sửa những trục trặc kiểu đó, nên nó là màn ít được phép chết nhất.
   *
   * Nay hỏng phần nào mất phần đó, phần còn lại vẫn dựng. */
  const [health, bugs, announcements, profiles, audits, outbox, errorLogs] = await Promise.all([
    getSystemHealth().catch(() => ({})),
    getBugLogs().catch(() => []),
    getSystemAnnouncements().catch(() => []),
    getSystemProfiles().catch(() => []),
    getTechnicalAudit().catch(() => []),
    getIntegrationFailures().catch(() => []),
    getSystemErrorLogs().catch(() => []),
  ]);
  // Trạng thái đăng nhập là nguồn dữ liệu KHÁC với hồ sơ. Lấy riêng rồi ghép
  // theo mã nhân sự; hỏng thì bảng vẫn dựng được, chỉ thiếu cột khoá.
  const accountStates = await getAccountStates().catch(() => []);
  // Ghi đè phân quyền: chỉ đọc khi đang mở thẻ đó, đỡ một lời gọi mạng cho
  // mọi lần mở màn quản trị vì việc khác.
  if (theDangMo === 'phan-quyen') pqGhiDe = await layGhiDe();
  if (theDangMo === 'database' && !dbCatalog.length) {
    dbCatalog = await getDatabaseCatalog().catch(() => []);
  }
  if (theDangMo === 'cham-cong') {
    ccData = await getAttendanceAdjustments({ month: ccMonth, search: ccSearch, page: ccPage, pageSize: ccPageSize })
      .catch((error) => ({ rows: [], employees: [], shifts: [], total: 0, stats: {}, error: error.message }));
  }
  if (theDangMo === 'chuong-bao') {
    const res = await getReminderConfig().catch(() => ({ config: null }));
    reminderConfigData = res?.config || null;
  }
  if (theDangMo === 'thong-bao') {
    notificationRulesData = await getNotificationRules().catch(() => []);
  }
  if (theDangMo === 'smtp') {
    try { smtpConfigData = await getSystemSmtp(); } catch { smtpConfigData = null; }
  }
  if (theDangMo === 'gemini-bot') {
    const [cfgRes, actRes] = await Promise.all([
      getGeminiBotConfig().catch(() => null),
      getGeminiActivities().catch(() => null),
    ]);
    geminiBotConfigData = cfgRes;
    geminiActivitiesData = actRes;
  }
  if (theDangMo === 'don-tu') {
    const [reqs, delAudits] = await Promise.all([
      getSystemRequests().catch(() => []),
      getDeletedRequestsAudit().catch(() => []),
    ]);
    dtRequestsData = reqs;
    dtDeletedAuditData = delAudits;
  }
  const tkTrangThaiMap = new Map(accountStates.map((a) => [String(a.employee_code || '').toLowerCase(), a]));
  tkProfiles = profiles;
  tkAccountStates = tkTrangThaiMap;
  const failed = outbox.filter((item) => item.status === 'failed');
  const the = theDangMo;
  const chon = (v, t, dang) => `<option value="${escapeHTML(v)}"${dang === v ? ' selected' : ''}>${escapeHTML(t)}</option>`;
  const dsBoPhan = [...new Set(profiles.map((x) => x.department).filter(Boolean))].sort();
  const dsChiNhanh = [...new Set(profiles.map((x) => x.branch_id).filter(Boolean))].sort();
  const tim = tkTim.trim().toLocaleLowerCase('vi');
  const daLoc = profiles.filter((x) => {
    const tk = tkTrangThaiMap.get(String(x.employee_code || '').toLowerCase());
    if (tim && !`${x.full_name || ''} ${x.employee_code || ''}`.toLocaleLowerCase('vi').includes(tim)) return false;
    if (tkVaiTro && x.role !== tkVaiTro) return false;
    if (tkBoPhan && x.department !== tkBoPhan) return false;
    if (tkChiNhanh && x.branch_id !== tkChiNhanh) return false;
    if (tkTrangThai === 'khoa'   && !tk?.dang_khoa) return false;
    if (tkTrangThai === 'sai'    && !(tk && tk.failed_attempts > 0)) return false;
    if (tkTrangThai === 'ok'     && !(tk && !tk.dang_khoa && !tk.failed_attempts)) return false;
    if (tkTrangThai === 'chua'   && tk) return false;
    if (tkTrangThai === 'vohieu' && x.active !== false) return false;
    return true;
  });
  // Bốn thẻ thay vì bảy khối chồng lên nhau. Trước đó màn này nhồi sức khỏe,
  // thông báo, form bug, danh sách bug, log realtime, tài khoản và audit vào
  // cùng một trang; muốn sửa quyền một người phải cuộn qua toàn bộ nhật ký
  // lỗi. Dải sức khỏe giữ nguyên ở trên vì nó là tóm tắt, đúng với mọi thẻ.
  const KHOI = {
    'tai-khoan': `<section class="panel">
      <div class="section-title"><div><p class="eyebrow">PHÂN QUYỀN CÓ KIỂM SOÁT</p><h3>Tài khoản hệ thống</h3></div>
        <span class="subtle">${daLoc.length}/${profiles.length} tài khoản · không cấp được Admin IT hay Superadmin tại đây</span></div>
      <form id="tkLoc" class="hh-loc">
        <label><span>Tìm tên hoặc mã nhân sự</span><input type="search" name="tim" value="${escapeHTML(tkTim)}" placeholder="VD: Ngọc Đức hoặc PVC-10162"></label>
        <label><span>Vai trò</span><select name="vaiTro">${chon('', 'Tất cả vai trò', tkVaiTro)}${Object.keys(ROLE_PROFILES).map((r) => chon(r, roleLabel[r], tkVaiTro)).join('')}</select></label>
        <label><span>Trạng thái đăng nhập</span><select name="trangThai">
          ${chon('', 'Tất cả', tkTrangThai)}${chon('khoa', 'Đang khoá đăng nhập', tkTrangThai)}${chon('sai', 'Có lần nhập sai', tkTrangThai)}
          ${chon('ok', 'Đăng nhập được', tkTrangThai)}${chon('chua', 'Chưa có tài khoản', tkTrangThai)}${chon('vohieu', 'Hồ sơ đã khoá', tkTrangThai)}</select></label>
        <label><span>Bộ phận</span><select name="boPhan">${chon('', 'Tất cả bộ phận', tkBoPhan)}${dsBoPhan.map((x) => chon(x, x, tkBoPhan)).join('')}</select></label>
        <label><span>Chi nhánh</span><select name="chiNhanh">${chon('', 'Tất cả chi nhánh', tkChiNhanh)}${dsChiNhanh.map((x) => chon(x, x, tkChiNhanh)).join('')}</select></label>
        <button type="submit" class="secondary-button"><i class="ri-filter-3-line"></i> Lọc</button>
        ${tkTim || tkVaiTro || tkTrangThai || tkBoPhan || tkChiNhanh ? '<p class="hh-ghi"><button type="button" id="tkXoaLoc" class="secondary-button">Xóa lọc</button></p>' : ''}
      </form>
      ${!daLoc.length ? '<p class="hh-ghi">Không có tài khoản nào khớp bộ lọc.</p>'
        : `<div class="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Bộ phận</th><th>Chi nhánh</th><th>Vai trò</th><th>Hồ sơ</th><th>Đăng nhập</th><th></th></tr></thead><tbody>${profileRows(daLoc, state.user.id, tkTrangThaiMap)}</tbody></table></div>`}
    </section>`,
    'phan-quyen': veThePhanQuyen(profiles),
    'chuong-bao': renderReminderControlPanel(reminderConfigData),
    'cham-cong': ccData?.error
      ? `<section class="panel"><div class="db-query-error"><strong>Không tải được dữ liệu chấm công</strong><span>${escapeHTML(ccData.error)}</span></div></section>`
      : attendanceAdjustmentPanel(ccData),
    'database': databasePanel(dbCatalog),
    'bug': `<div class="grid cols-2 system-admin-grid">
      <section class="panel"><div class="section-title"><div><p class="eyebrow">THÔNG BÁO PHÁT HÀNH</p><h3>Gửi cập nhật đến người dùng</h3></div></div>
        <form id="announcementForm" class="system-form"><label class="span-2">Tiêu đề<input name="title" required maxlength="160" placeholder="VD: Đã cập nhật chức năng chấm công"></label><label>Loại<select name="category"><option value="feature">Tính năng mới</option><option value="maintenance">Bảo trì</option><option value="security">Bảo mật</option><option value="general">Thông báo chung</option></select></label><label>Người nhận<select name="audience"><option value="all">Tất cả người dùng</option><option value="staff">Nhân viên</option><option value="leader">Trưởng bộ phận</option><option value="hr">Nhân sự</option><option value="finance">Kế toán</option><option value="admin">Admin</option></select></label><label class="span-2">Nội dung<textarea name="body" required maxlength="2000" placeholder="Mô tả thay đổi, thời gian áp dụng và hướng dẫn..."></textarea></label><button class="primary-button span-2" type="submit">🔔 Phát hành thông báo realtime</button></form>
        <div class="system-recent-list">${announcements.slice(0, 3).map((item) => `<article><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.body)}</span><small>${formatDateTime(item.created_at)} · ${escapeHTML(item.audience)}</small></article>`).join('') || '<p class="subtle">Chưa có thông báo phát hành.</p>'}</div>
      </section>
      <section class="panel"><div class="section-title"><div><p class="eyebrow">BUG LOG</p><h3>Ghi nhận lỗi cần xử lý</h3></div></div>
        <form id="bugForm" class="system-form"><label class="span-2">Tên lỗi<input name="title" required maxlength="180" placeholder="Mô tả ngắn lỗi cần kiểm tra"></label><label>Khu vực<input name="area" required placeholder="VD: Chấm công / Đăng nhập"></label><label>Mức độ<select name="severity"><option value="low">Thấp</option><option value="medium" selected>Trung bình</option><option value="high">Cao</option><option value="critical">Nghiêm trọng</option></select></label><label class="span-2">Chi tiết<textarea name="description" placeholder="Các bước tái hiện, thiết bị, tài khoản và kết quả mong đợi..."></textarea></label><button class="primary-button span-2" type="submit">+ Thêm bug log</button></form>
        <div class="system-sync-status"><strong>Hàng đợi đồng bộ</strong><span>${failed.length ? `${failed.length} lỗi cần kiểm tra` : 'Không có lỗi đồng bộ gần đây'}</span></div>
      </section>
    </div>
<section class="panel"><div class="section-title"><div><p class="eyebrow">BỘ LỌC BUG</p><h3>Danh sách bug</h3></div><span class="subtle" id="bugResultCount">${bugs.length} bản ghi</span></div>
      <div class="system-filterbar" id="bugFilters"><label>Tìm kiếm<input type="search" name="search" placeholder="Tên lỗi hoặc mô tả"></label><label>Khu vực<input name="area" placeholder="VD: Chấm công"></label><label>Mức độ<select name="severity">${filterOptions(severityLabel)}</select></label><label>Trạng thái<select name="status">${filterOptions(statusLabel)}</select></label><button class="secondary-button" type="button" data-clear-filters="bug">Xóa lọc</button></div>
      <div class="system-log-groups" id="bugTableBody">${groupedPanels(bugs, bugRows, 'bug')}</div></section>`,
    'log': `<section class="panel"><div class="section-title"><div><p class="eyebrow">LOG HỆ THỐNG REALTIME</p><h3>Lỗi ứng dụng và lỗi đồng bộ</h3></div><span class="live-indicator">Đang theo dõi</span></div>
      <div class="system-filterbar" id="logFilters"><label>Tìm trong log<input type="search" name="search" placeholder="Thông báo, nguồn hoặc URL"></label><label>Nguồn<select name="source"><option value="all">Tất cả</option><option value="client">Ứng dụng client</option><option value="sync">Đồng bộ dữ liệu</option></select></label><label>Mức độ<select name="level"><option value="all">Tất cả</option><option value="warning">Cảnh báo</option><option value="error">Lỗi</option><option value="critical">Nghiêm trọng</option></select></label><label>Trạng thái<select name="resolved"><option value="all">Tất cả</option><option value="false">Chưa xử lý</option><option value="true">Đã xử lý</option></select></label><button class="secondary-button" type="button" data-clear-filters="log">Xóa lọc</button></div>
      <div class="system-log-groups" id="systemLogBody">${groupedPanels(errorLogs, errorRows, 'log')}</div>
      <details class="sync-error-details"><summary>Lỗi đồng bộ dữ liệu (${failed.length})</summary>${failed.length ? failed.map((item) => `<article><strong>${escapeHTML(item.entity_type)} · ${escapeHTML(item.entity_id || '')}</strong><span>${escapeHTML(item.last_error || 'Không có mô tả')}</span><small>${formatDateTime(item.created_at)} · thử ${item.attempts || 0} lần</small></article>`).join('') : '<p class="subtle">Không có lỗi đồng bộ.</p>'}</details>
    </section>`,
    'audit': renderTechnicalAuditPanel(audits),
    'thong-bao': renderNotificationPolicyPanel(notificationRulesData),
    'smtp': renderSmtpConfigPanel(smtpConfigData),
    'gemini-bot': renderGeminiBotStudioPanel(geminiBotConfigData, geminiActivitiesData, profiles),
    'don-tu': renderDonTuPanel(dtRequestsData, dtDeletedAuditData, profiles),
  };
  return `<div class="view-header"><div><p class="eyebrow">TRUNG TÂM QUẢN TRỊ</p><h3>${escapeHTML(TEN_THE[the])}</h3></div><button class="secondary-button" type="button" id="refreshSystem">↻ Làm mới dữ liệu</button></div>
    <section class="system-health-grid">${metric('Database', health.database === 'online' ? 'Đang hoạt động' : 'Có lỗi', `Kiểm tra ${formatDateTime(health.checked_at)}`)}${metric('Tài khoản hoạt động', health.active_profiles, `${health.inactive_profiles || 0} tài khoản bị khóa`)}${metric('Dữ liệu chấm công', health.attendance_records, `Lần cuối ${health.last_attendance_at ? formatDateTime(health.last_attendance_at) : 'chưa có'}`)}${metric('Đồng bộ lỗi', health.failed_sync, `${health.pending_sync || 0} đang chờ`)}${metric('Lỗi ứng dụng', errorLogs.filter((x) => !x.resolved).length, `${errorLogs.filter((x) => x.level === 'critical' && !x.resolved).length} nghiêm trọng`)}</section>
    <nav class="sa-the">${Object.entries(TEN_THE).map(([ma, ten]) => `<button type="button" class="sa-the-nut ${ma === the ? 'is-active' : ''}" data-the="${ma}">${escapeHTML(ten)}</button>`).join('')}</nav>
    ${KHOI[the]}`;
}

function bindLiveFilters() {
  const bugBox = document.getElementById('bugFilters');
  bugBox?.addEventListener('input', () => {
    clearTimeout(bugFilterTimer);
    bugFilterTimer = setTimeout(async () => {
      const values = Object.fromEntries([...bugBox.querySelectorAll('input,select')].map((el) => [el.name, el.value]));
      const count = document.getElementById('bugResultCount');
      count.textContent = 'Đang lọc…';
      try {
        const rows = await getBugLogs(values);
        document.getElementById('bugTableBody').innerHTML = groupedPanels(rows, bugRows, 'bug');
        count.textContent = `${rows.length} bản ghi`;
        bindBugActions();
      } catch (error) {
        count.textContent = 'Không thể tải dữ liệu';
        showToast(error.message || 'Không thể lọc bug.', true);
      }
    }, 250);
  });
  const logBox = document.getElementById('logFilters');
  logBox?.addEventListener('input', () => {
    clearTimeout(logFilterTimer);
    logFilterTimer = setTimeout(async () => {
      const values = Object.fromEntries([...logBox.querySelectorAll('input,select')].map((el) => [el.name, el.value]));
      try {
        let rows = await getSystemErrorLogs();
        rows = rows.filter((x) => (values.source === 'all' || x.source === values.source) && (values.level === 'all' || x.level === values.level) && (values.resolved === 'all' || String(x.resolved) === values.resolved) && (!values.search || `${x.message} ${x.source} ${x.page_url || ''}`.toLowerCase().includes(values.search.toLowerCase())));
        document.getElementById('systemLogBody').innerHTML = groupedPanels(rows, errorRows, 'log');
        bindLogActions();
      } catch (error) { showToast(error.message || 'Không thể lọc log hệ thống.', true); }
    }, 250);
  });
  document.querySelectorAll('[data-clear-filters]').forEach((button) => button.addEventListener('click', () => { const box = document.getElementById(`${button.dataset.clearFilters}Filters`); box.querySelectorAll('input').forEach((x) => x.value = ''); box.querySelectorAll('select').forEach((x) => x.value = 'all'); box.dispatchEvent(new Event('input')); }));
}

function bindBugActions() {
  document.querySelectorAll('[data-save-bug]').forEach((button) => button.addEventListener('click', async () => { const id = button.dataset.saveBug; try { await updateBugLog(id, { status: document.querySelector(`[data-bug-status="${id}"]`).value, resolution: document.querySelector(`[data-bug-resolution="${id}"]`).value }); showToast('Đã cập nhật bug log.'); } catch (error) { showToast(error.message || 'Không thể cập nhật bug.', true); } }));
}

function bindLogActions() {
  document.querySelectorAll('[data-log-detail]').forEach((button) => button.addEventListener('click', () => { const detail = document.getElementById(`logDetail-${button.dataset.logDetail}`); detail.hidden = !detail.hidden; button.textContent = detail.hidden ? 'Xem chi tiết' : 'Thu gọn'; }));
  document.querySelectorAll('[data-resolve-log]').forEach((button) => button.addEventListener('click', async () => { try { await resolveSystemError(button.dataset.resolveLog, button.dataset.resolved !== 'true'); showToast('Đã cập nhật trạng thái log.'); store.notify(); } catch (error) { showToast(error.message || 'Không thể cập nhật log.', true); } }));
}

function bindSmtpEvents() {
  document.getElementById('systemSmtpForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = document.getElementById('sysSmtpHost')?.value?.trim() || 'smtp.gmail.com';
    const port = Number(document.getElementById('sysSmtpPort')?.value || 465);
    const user = document.getElementById('sysSmtpUser')?.value?.trim();
    const pass = document.getElementById('sysSmtpPass')?.value?.trim();
    const fromName = document.getElementById('sysSmtpFromName')?.value?.trim();
    const fromEmail = document.getElementById('sysSmtpFromEmail')?.value?.trim();
    if (!user) { showToast('Vui lòng nhập tài khoản email SMTP.', true); return; }
    try {
      await saveSystemSmtp({ host, port, user, pass, fromName, fromEmail });
      showToast('Đã lưu cấu hình SMTP hệ thống thành công.');
      store.notify();
    } catch (err) {
      showToast(err.message || 'Lỗi lưu cấu hình SMTP.', true);
    }
  });

  document.getElementById('btnTestSystemSmtp')?.addEventListener('click', async () => {
    const statusDiv = document.getElementById('sysSmtpTestResult');
    const host = document.getElementById('sysSmtpHost')?.value?.trim();
    const port = Number(document.getElementById('sysSmtpPort')?.value || 465);
    const user = document.getElementById('sysSmtpUser')?.value?.trim();
    const pass = document.getElementById('sysSmtpPass')?.value?.trim();
    const fromName = document.getElementById('sysSmtpFromName')?.value?.trim();
    const testEmail = document.getElementById('sysSmtpTestEmail')?.value?.trim();
    if (!user) { showToast('Vui lòng nhập tài khoản email SMTP trước.', true); return; }
    if (statusDiv) { statusDiv.style.display = 'block'; statusDiv.style.background = '#eff6ff'; statusDiv.style.color = '#1e40af'; statusDiv.style.border = '1px solid #bfdbfe'; statusDiv.textContent = '⏳ Đang kết nối và xác thực SMTP...'; }
    try {
      const res = await testSystemSmtp({ host, port, user, pass, fromName, testEmail });
      if (statusDiv) {
        if (res.success) {
          statusDiv.style.background = '#f0fdf4'; statusDiv.style.color = '#15803d'; statusDiv.style.border = '1px solid #bbf7d0';
          statusDiv.innerHTML = `<strong><i class="ri-checkbox-circle-line"></i> Thành công:</strong> ${escapeHTML(res.message)}`;
        } else {
          statusDiv.style.background = '#fef2f2'; statusDiv.style.color = '#dc2626'; statusDiv.style.border = '1px solid #fecaca';
          statusDiv.innerHTML = `<strong><i class="ri-error-warning-line"></i> Thất bại:</strong> ${escapeHTML(res.message)}`;
        }
      }
    } catch (err) {
      if (statusDiv) { statusDiv.style.background = '#fef2f2'; statusDiv.style.color = '#dc2626'; statusDiv.style.border = '1px solid #fecaca'; statusDiv.innerHTML = `<strong><i class="ri-error-warning-line"></i> Lỗi:</strong> ${escapeHTML(err.message || 'Không thể kết nối.')}`; }
    }
  });
}

function bindDonTuEvents() {
  document.getElementById('dtFilterForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    dtSearch = document.getElementById('dtSearchInput')?.value?.trim() || '';
    store.notify();
  });

  document.getElementById('dtSearchInput')?.addEventListener('change', (e) => {
    dtSearch = e.target.value.trim();
    store.notify();
  });

  document.getElementById('dtTypeSelect')?.addEventListener('change', (e) => {
    dtType = e.target.value;
    store.notify();
  });

  document.getElementById('dtStatusSelect')?.addEventListener('change', (e) => {
    dtStatus = e.target.value;
    store.notify();
  });

  document.getElementById('btnDtToggleTest')?.addEventListener('click', () => {
    dtOnlyTest = !dtOnlyTest;
    store.notify();
  });

  document.getElementById('btnDtClearFilter')?.addEventListener('click', () => {
    dtSearch = '';
    dtType = '';
    dtStatus = '';
    dtOnlyTest = false;
    store.notify();
  });

  document.querySelectorAll('.btn-delete-request').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reqId = btn.dataset.reqId;
      const emp = btn.dataset.reqEmp || '';
      const type = btn.dataset.reqType || 'đơn từ';
      const date = btn.dataset.reqDate || '';
      const reasonOld = btn.dataset.reqReason || '';

      const reason = await requestInput(
        `XÓA ĐƠN LỖI / ĐƠN TEST KHỎI HỆ THỐNG:\n\n• Mã đơn: ${reqId}\n• Nhân viên: ${emp}\n• Loại đơn: ${type}\n• Ngày áp dụng: ${date}\n• Lý do nộp đơn: "${reasonOld}"\n\nVui lòng nhập lý do xóa để lưu lại vào Nhật ký Kiểm toán (Audit Trail):`,
        { title: 'Xóa đơn lỗi / đơn test', label: 'Lý do xóa (bắt buộc, tối thiểu 5 ký tự)', placeholder: 'VD: Dọn dữ liệu test bot Gemini BS01...', confirmText: 'Tiếp tục', tone: 'danger' }
      );

      if (!reason || String(reason).trim().length < 5) {
        if (reason !== null) showToast('Lý do xóa phải có ít nhất 5 ký tự.', true);
        return;
      }

      const cleanupAtt = await confirmAction(
        `Bạn có muốn TỰ ĐỘNG THU HỒI các lượt chấm công GPS và ngày công đã phát sinh từ đơn này của ${emp} vào ngày ${date} không?\n\n• Chọn "Có, thu hồi chấm công" để xóa đơn + thu hồi các lượt chấm công GPS phát sinh.\n• Chọn "Chỉ xóa đơn" nếu muốn giữ lại chấm công.`,
        { title: 'Thu hồi chấm công phát sinh?', confirmText: 'Có, thu hồi chấm công', cancelText: 'Chỉ xóa đơn', tone: 'danger' }
      );

      btn.disabled = true;
      try {
        const res = await deleteSystemRequest({
          requestId: reqId,
          reason: String(reason).trim(),
          cleanupAttendance: cleanupAtt === true,
        });
        showToast(res?.message || 'Đã xóa đơn và lưu nhật ký kiểm toán thành công!');
        store.notify();
      } catch (err) {
        showToast(err.message || 'Lỗi khi xóa đơn.', true);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('.btn-view-audit-snapshot').forEach((btn) => {
    btn.addEventListener('click', () => {
      try {
        const snapshotStr = btn.getAttribute('data-audit-snapshot') || '{}';
        const snapshot = JSON.parse(snapshotStr);
        showSnapshotModal('Snapshot dữ liệu gốc bảo lưu kiểm toán', snapshot);
      } catch {
        showToast('Không thể đọc dữ liệu snapshot.', true);
      }
    });
  });
}

export function initView() {
  document.getElementById('refreshSystem')?.addEventListener('click', () => store.notify());
  document.getElementById('announcementForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(event.currentTarget)); button.disabled = true; button.textContent = 'Đang phát hành…'; try { await publishSystemAnnouncement(data); showToast('Đã phát hành thông báo đến người dùng.'); event.currentTarget.reset(); store.notify(); } catch (error) { button.disabled = false; button.textContent = '🔔 Phát hành thông báo realtime'; showToast(error.message || 'Không thể phát hành thông báo.', true); } });
  document.getElementById('bugForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(event.currentTarget)); button.disabled = true; button.textContent = 'Đang lưu bug…'; try { await createBugLog(data); showToast('Đã thêm bug log.'); event.currentTarget.reset(); store.notify(); } catch (error) { button.disabled = false; button.textContent = '+ Thêm bug log'; showToast(error.message || 'Không thể thêm bug log.', true); } });
  bindLiveFilters(); bindBugActions(); bindLogActions();
  bindReminderActions();
  bindNotificationRuleActions();
  bindSmtpEvents();
  bindGeminiBotEvents();
  bindDonTuEvents();
  document.querySelectorAll('[data-the]').forEach((b) => b.addEventListener('click', () => {
    theDangMo = b.dataset.the;
    store.notify();
  }));

  /* ── Thẻ Phân quyền ── */
  const maToi = store.getState()?.profile?.employee_code || '';
  const tickDangChon = (thuocTinh) => [...document.querySelectorAll(`[${thuocTinh}]`)]
    .filter((o) => o.checked).map((o) => o.getAttribute(thuocTinh));

  document.getElementById('pqVaiTro')?.addEventListener('change', (e) => {
    pqVaiTro = e.target.value; store.notify();
  });
  document.getElementById('pqChonNguoi')?.addEventListener('change', (e) => {
    pqNhanSu = e.target.value; store.notify();
  });

  /* Phản hồi ngay khi tick, không đợi bấm Lưu.
   *
   * Nhãn "đã bật thêm" / "đã tắt" được dựng từ dữ liệu đã lưu, nên nếu chỉ có
   * nó thì người dùng tick xong nhìn không thấy gì đổi và không biết mình vừa
   * làm lệch khỏi mặc định ở đâu. Ghi mốc mặc định vào chính ô tick lúc dựng,
   * rồi so tại chỗ mỗi lần đổi. */
  const noiDauKhac = (o, mocMacDinh) => {
    const nhan = o.closest('.pq-o');
    if (!nhan) return;
    const them = o.checked && !mocMacDinh;
    const bot = !o.checked && mocMacDinh;
    nhan.classList.toggle('pq-them', them);
    nhan.classList.toggle('pq-bot', bot);
    nhan.querySelectorAll('.pq-nhan-them, .pq-nhan-bot').forEach((x) => x.remove());
    if (them || bot) {
      const b = document.createElement('b');
      b.className = `pq-nhan pq-nhan-${them ? 'them' : 'bot'}`;
      b.textContent = them ? 'đã bật thêm' : 'đã tắt';
      nhan.appendChild(b);
    }
  };
  document.querySelectorAll('[data-pq-view]').forEach((o) => {
    const moc = viewsMacDinh(document.getElementById('pqVaiTro')?.value)
      .includes(o.getAttribute('data-pq-view'));
    o.addEventListener('change', () => noiDauKhac(o, moc));
  });

  document.getElementById('pqLuuVaiTro')?.addEventListener('click', async (e) => {
    const vt = document.getElementById('pqVaiTro')?.value;
    const b = e.currentTarget; b.disabled = true;
    try {
      const kq = await luuGhiDeVaiTro(vt, tickDangChon('data-pq-view'), maToi);
      showToast(kq.khong_con_chenh
        ? `Vai trò ${ROLE_PROFILES[vt].label} đã trùng mặc định, không còn chỉnh tay nào.`
        : `Đã lưu: bật thêm ${kq.bat.length}, tắt ${kq.tat.length} màn.`);
      pqGhiDe = await layGhiDe();
      store.notify();
    } catch (err) { showToast(err.message, true); b.disabled = false; }
  });

  document.getElementById('pqTraVe')?.addEventListener('click', async () => {
    const vt = document.getElementById('pqVaiTro')?.value;
    const ok = await confirmAction(
      `Bỏ mọi chỉnh tay của vai trò ${ROLE_PROFILES[vt].label} và quay về đúng mặc định?`,
      { title: 'Trả về mặc định', confirmText: 'Trả về' });
    if (!ok) return;
    try {
      await xoaGhiDe('vai_tro', vt);
      showToast('Đã trả vai trò về mặc định của hệ thống.');
      pqGhiDe = await layGhiDe();
      store.notify();
    } catch (err) { showToast(err.message, true); }
  });

  document.getElementById('pqLuuNguoi')?.addEventListener('click', async (e) => {
    const p = (await getSystemProfiles()).find((x) => x.employee_code === pqNhanSu);
    if (!p) { showToast('Không tìm thấy hồ sơ này.', true); return; }
    const b = e.currentTarget; b.disabled = true;
    try {
      const kq = await luuGhiDeNhanSu(pqNhanSu, p.role, tickDangChon('data-pq-nview'), maToi, maToi);
      showToast(kq.khong_con_chenh
        ? 'Tài khoản này giờ đúng bằng quyền vai trò, ngoại lệ đã được gỡ.'
        : `Đã lưu ngoại lệ: bật thêm ${kq.bat.length}, tắt ${kq.tat.length} màn.`);
      pqGhiDe = await layGhiDe();
      store.notify();
    } catch (err) { showToast(err.message, true); b.disabled = false; }
  });

  document.querySelectorAll('[data-pq-sua]').forEach((b) => b.addEventListener('click', () => {
    pqNhanSu = b.dataset.pqSua; store.notify();
  }));
  document.querySelectorAll('[data-pq-bo]').forEach((b) => b.addEventListener('click', async () => {
    const ma = b.dataset.pqBo;
    const ok = await confirmAction(`Gỡ ngoại lệ của ${ma}? Tài khoản này sẽ quay về đúng `
      + 'quyền của vai trò họ đang mang.', { title: 'Gỡ ngoại lệ', confirmText: 'Gỡ' });
    if (!ok) return;
    try {
      await xoaGhiDe('nhan_su', ma);
      showToast('Đã gỡ ngoại lệ.');
      pqGhiDe = await layGhiDe();
      store.notify();
    } catch (err) { showToast(err.message, true); }
  }));

  document.getElementById('tkLoc')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    tkTim = f.get('tim') || ''; tkVaiTro = f.get('vaiTro') || '';
    tkTrangThai = f.get('trangThai') || ''; tkBoPhan = f.get('boPhan') || '';
    tkChiNhanh = f.get('chiNhanh') || '';
    store.notify();
  });
  document.getElementById('tkXoaLoc')?.addEventListener('click', () => {
    tkTim = ''; tkVaiTro = ''; tkTrangThai = ''; tkBoPhan = ''; tkChiNhanh = '';
    store.notify();
  });

  document.querySelectorAll('[data-edit-profile]').forEach((button) => button.addEventListener('click', async () => {
    const profile = tkProfiles.find((item) => String(item.id) === String(button.dataset.editProfile));
    if (!profile) return showToast('Không tìm thấy hồ sơ người dùng.', true);
    const account = tkAccountStates.get(String(profile.employee_code || '').toLowerCase());
    const updates = await editProfileDialog(profile, account);
    if (!updates) return;
    if (!updates.fullName || !updates.department || !updates.branchId) {
      return showToast('Họ tên, bộ phận và chi nhánh là thông tin bắt buộc.', true);
    }
    button.disabled = true;
    try {
      const oldCode = profile.employee_code || profile.id;
      const newCode = updates.employeeCode || oldCode;
      await updateEmployee(oldCode, {
        id: newCode,
        code: newCode,
        name: updates.fullName,
        email: updates.email || null,
        phone: updates.phone,
        department: updates.department,
        role: updates.title,
        branchId: updates.branchId,
      });
      showToast(oldCode !== newCode
        ? `Đã đổi mã nhân sự từ ${oldCode} sang ${newCode} và đồng bộ toàn hệ thống!`
        : `Đã cập nhật và đồng bộ thông tin của ${newCode} (${updates.fullName}).`
      );
      store.notify();
    } catch (error) {
      showToast(error.message || 'Không thể cập nhật thông tin người dùng.', true);
      button.disabled = false;
    }
  }));

  /* ── Điều chỉnh chấm công cấp cao ── */
  document.getElementById('ccFilters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    ccMonth = String(values.month || ccMonth);
    ccSearch = String(values.search || '').trim();
    ccPageSize = Number(values.pageSize || 20);
    ccPage = 1;
    store.notify();
  });
  document.querySelectorAll('[data-cc-page]').forEach((button) => button.addEventListener('click', () => {
    if (button.disabled) return;
    ccPage = Math.max(1, Number(button.dataset.ccPage || 1));
    store.notify();
  }));

  const resetAttendanceForm = () => {
    const form = document.getElementById('ccAdjustmentForm');
    if (!form) return;
    form.reset();
    form.elements.id.value = '';
    document.getElementById('ccFormTitle').textContent = 'Thêm lượt chấm công';
    document.getElementById('ccSaveLabel').textContent = 'Thêm lượt chấm công';
    document.getElementById('ccCancelEdit').hidden = true;
  };
  document.getElementById('ccCancelEdit')?.addEventListener('click', resetAttendanceForm);
  document.querySelectorAll('[data-cc-edit]').forEach((button) => button.addEventListener('click', () => {
    const row = ccData?.rows?.find((item) => String(item.id) === String(button.dataset.ccEdit));
    const form = document.getElementById('ccAdjustmentForm');
    if (!row || !form) return;
    form.elements.id.value = row.id;
    form.elements.employeeCode.value = row.employee_code || '';
    form.elements.workDate.value = row.work_date || '';
    form.elements.recordType.value = row.record_type || 'checkin';
    form.elements.time.value = attendanceClock(row.recorded_at);
    form.elements.shiftCode.value = row.shift_code || '';
    form.elements.branchId.value = row.branch_id || 'le-van-tho';
    form.elements.reason.value = '';
    document.getElementById('ccFormTitle').textContent = `Sửa lượt chấm công · ${row.employee_code}`;
    document.getElementById('ccSaveLabel').textContent = 'Lưu thay đổi';
    document.getElementById('ccCancelEdit').hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  document.getElementById('ccAdjustmentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const id = String(values.id || '');
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (id) await updateAttendanceAdjustment(id, values);
      else await createAttendanceAdjustment(values);
      showToast(id ? 'Đã sửa lượt chấm công và tính lại ngày công.' : 'Đã thêm lượt chấm công và tính lại ngày công.');
      ccPage = 1;
      store.notify();
    } catch (error) {
      showToast(error.message || 'Không thể lưu điều chỉnh chấm công.', true);
      button.disabled = false;
    }
  });
  document.querySelectorAll('[data-cc-delete]').forEach((button) => button.addEventListener('click', async () => {
    const row = ccData?.rows?.find((item) => String(item.id) === String(button.dataset.ccDelete));
    if (!row) return;
    const reason = await requestInput(
      `Nhập lý do xóa ${row.record_type === 'checkin' ? 'giờ vào' : 'giờ ra'} lúc ${attendanceClock(row.recorded_at)} ngày ${row.work_date} của ${row.employee_name || row.employee_code}. Dữ liệu sẽ được ẩn nhưng vẫn còn trong nhật ký kiểm toán.`,
      { title: 'Xóa lượt chấm công', label: 'Lý do xóa', placeholder: 'Ít nhất 5 ký tự', confirmText: 'Tiếp tục', tone: 'danger' },
    );
    if (!reason || String(reason).trim().length < 5) return;
    if (!await confirmAction('Ngày công của nhân viên sẽ được tính lại ngay sau khi xóa. Xác nhận thực hiện?', { title: 'Xác nhận xóa dữ liệu', confirmText: 'Xóa và tính lại', tone: 'danger' })) return;
    button.disabled = true;
    try {
      await deleteAttendanceAdjustment(row.id, String(reason).trim());
      showToast('Đã xóa lượt chấm công và tính lại ngày công.');
      store.notify();
    } catch (error) {
      showToast(error.message || 'Không thể xóa lượt chấm công.', true);
      button.disabled = false;
    }
  }));

  /* ── SQL Console chỉ đọc ── */
  document.querySelectorAll('[data-db-table]').forEach((button) => button.addEventListener('click', () => {
    const [schema, table] = String(button.dataset.dbTable || '').split('.');
    if (!schema || !table) return;
    const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
    dbSql = `SELECT *\nFROM ${quote(schema)}.${quote(table)}\nLIMIT 100`;
    const editor = document.getElementById('dbSql');
    if (editor) { editor.value = dbSql; editor.focus(); }
  }));
  document.getElementById('dbClear')?.addEventListener('click', () => {
    dbSql = '';
    dbQueryResult = null;
    const editor = document.getElementById('dbSql');
    if (editor) { editor.value = ''; editor.focus(); }
    const result = document.getElementById('dbQueryResult');
    if (result) result.innerHTML = databaseResults(null);
  });
  document.getElementById('dbQueryForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const editor = document.getElementById('dbSql');
    const button = document.getElementById('dbRun');
    dbSql = String(editor?.value || '').trim();
    if (!dbSql) return showToast('Nhập câu SELECT cần truy vấn.', true);
    button.disabled = true;
    button.innerHTML = '<i class="ri-loader-4-line"></i> Đang truy vấn…';
    const resultBox = document.getElementById('dbQueryResult');
    resultBox.innerHTML = '<div class="db-empty"><i class="ri-loader-4-line"></i><strong>Đang chạy truy vấn</strong><span>Máy chủ sẽ tự dừng nếu quá 8 giây.</span></div>';
    try {
      dbQueryResult = await runDatabaseQuery(dbSql);
      resultBox.innerHTML = databaseResults(dbQueryResult);
      bindDatabaseExport();
    } catch (error) {
      dbQueryResult = null;
      resultBox.innerHTML = `<div class="db-query-error"><strong>Không chạy được truy vấn</strong><span>${escapeHTML(error.message || 'Câu SQL không hợp lệ.')}</span></div>`;
      showToast(error.message || 'Không chạy được truy vấn.', true);
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="ri-play-fill"></i> Chạy truy vấn';
    }
  });
  bindDatabaseExport();

  document.querySelectorAll('[data-reset-pw]').forEach((button) => button.addEventListener('click', async () => {
    const ma = button.dataset.resetPw;
    const ten = button.dataset.ten;
    const matKhau = await requestInput(
      `Đặt mật khẩu mới cho ${ten} (${ma}). Bạn tự nhập rồi báo lại cho họ — hệ thống không `
      + 'sinh mật khẩu hộ và không gửi đi đâu. Tài khoản sẽ được mở khoá, và mọi phiên đang '
      + 'mở của họ bị đăng xuất.',
      { title: 'Đặt lại mật khẩu', label: 'Mật khẩu mới', placeholder: 'Ít nhất 8 ký tự',
        confirmText: 'Đặt lại', tone: 'danger' });
    if (!matKhau) return;
    if (String(matKhau).length < 8) return showToast('Mật khẩu phải có ít nhất 8 ký tự.', true);
    try {
      await datLaiMatKhau(ma, String(matKhau));
      showToast(`Đã đặt lại mật khẩu cho ${ma}. Báo lại cho họ và nhắc đổi sau lần đăng nhập đầu.`);
      store.notify();
    } catch (error) { showToast(error.message || 'Không đặt lại được mật khẩu.', true); }
  }));

  document.querySelectorAll('[data-unlock]').forEach((button) => button.addEventListener('click', async () => {
    const ma = button.dataset.unlock;
    if (!await confirmAction(
      `Xoá bộ đếm nhập sai mật khẩu của ${ma} để họ đăng nhập lại ngay. `
      + 'Mật khẩu KHÔNG đổi — nếu họ quên hẳn mật khẩu thì mở khoá không giúp được gì.',
      { title: `Mở khoá tài khoản ${ma}?`, confirmText: 'Mở khoá' })) return;
    try {
      await unlockAccount(ma);
      showToast(`Đã mở khoá ${ma}. Mật khẩu giữ nguyên.`);
      store.notify();
    } catch (error) { showToast(error.message || 'Không mở khoá được.', true); }
  }));

  document.querySelectorAll('[data-save-access]').forEach((button) => button.addEventListener('click', async () => { const id = button.dataset.saveAccess; const role = document.querySelector(`[data-user-role="${id}"]`).value; const active = document.querySelector(`[data-user-active="${id}"]`).checked; if (!await confirmAction(`Xác nhận cập nhật quyền ${roleLabel[role]} và trạng thái tài khoản?`, { title: 'Cập nhật phân quyền', confirmText: 'Lưu phân quyền' })) return; try { await updateUserAccess(id, role, active); showToast('Đã cập nhật quyền tài khoản và lưu audit.'); store.notify(); } catch (error) { showToast(error.message || 'Không thể cập nhật tài khoản.', true); } }));

  document.querySelectorAll('[data-delete-user]').forEach((button) => button.addEventListener('click', async () => {
    const id = button.dataset.deleteUser;
    const code = button.dataset.deleteCode;
    const name = button.dataset.deleteName;
    const targetLabel = code ? `${name} (Mã: ${code})` : name;
    if (!await confirmAction(
      `Bạn có chắc chắn muốn XÓA nhân sự ${targetLabel} khỏi hệ thống?\n\n• Nhân sự sẽ bị ẩn hoàn toàn khỏi danh sách tài khoản và HR.\n• Toàn bộ quyền truy cập và đăng nhập bị hủy bỏ.\n• Dữ liệu lịch sử (chấm công, phiếu lương, chứng từ cũ) vẫn được bảo toàn an toàn.`,
      { title: `Xóa nhân sự ${name}?`, confirmText: 'Xác nhận xóa', tone: 'danger' }
    )) return;

    try {
      button.disabled = true;
      button.innerHTML = '<i class="ri-loader-4-line ri-spin"></i>';
      await deleteUserAccount(id, code);
      showToast(`Đã xóa nhân sự ${targetLabel} khỏi hệ thống thành công.`);
      store.notify();
    } catch (error) {
      button.disabled = false;
      button.innerHTML = '<i class="ri-delete-bin-line"></i> Xóa';
      showToast(error.message || 'Không thể xóa nhân sự.', true);
    }
  }));
  logSub?.unsubscribe(); logSub = subscribeToSystemErrors(() => { if (store.getState().currentView === 'system-admin') store.notify(); });
}

function bindDatabaseExport() {
  document.getElementById('dbExportCsv')?.addEventListener('click', () => {
    if (!dbQueryResult?.rows?.length) return;
    const columns = (dbQueryResult.columns || []).map((column) => column.name || column);
    const csvCell = (value) => {
      const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `"${text.replaceAll('"', '""')}"`;
    };
    const csv = `\uFEFF${columns.map(csvCell).join(',')}\r\n${dbQueryResult.rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `postgres-query-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, { once: true });
}

/* ── Thẻ Phân quyền ─────────────────────────────────────────────────────
 *
 * Chỗ đổi "vai trò nào thấy màn nào" mà không phải sửa mã nguồn rồi triển
 * khai lại. Mã nguồn giữ mặc định, màn này giữ phần chênh.
 *
 * Hai mức, cố ý tách rời:
 *   VAI TRÒ   đổi một lần, áp cho mọi người mang vai trò đó
 *   TÀI KHOẢN bật tắt riêng cho một người, không đụng người cùng vai trò
 *
 * Ô tick hiện KẾT QUẢ CUỐI CÙNG chứ không hiện phần chênh, vì câu hỏi thật
 * của người dùng là "người này rốt cuộc thấy những gì". Phần chênh so với mặc
 * định được đánh dấu bằng nhãn nhỏ để vẫn biết chỗ nào đã bị chỉnh tay.
 */
function veThePhanQuyen(profiles) {
  const dsVaiTro = Object.keys(ROLE_PROFILES).filter((r) => !VAI_TRO_KHOA.includes(r));
  const vt = pqVaiTro || dsVaiTro[0];
  const macDinh = viewsMacDinh(vt);
  const hieuLuc = viewsHieuLuc(vt, pqGhiDe.vaiTro[vt], null);
  const daChinh = pqGhiDe.vaiTro[vt];
  const soChinh = daChinh ? (daChinh.bat.length + daChinh.tat.length) : 0;

  const oTick = (view, dangCo, laMacDinh, ten) => {
    const them = dangCo && !laMacDinh;
    const bot = !dangCo && laMacDinh;
    return `<label class="pq-o${them ? ' pq-them' : ''}${bot ? ' pq-bot' : ''}">
      <input type="checkbox" data-pq-view="${escapeHTML(view)}"${dangCo ? ' checked' : ''}
        ${VIEW_BAT_BUOC.includes(view) ? ' disabled' : ''}>
      <span>${escapeHTML(ten)}</span>
      ${them ? '<b class="pq-nhan pq-nhan-them">đã bật thêm</b>' : ''}
      ${bot ? '<b class="pq-nhan pq-nhan-bot">đã tắt</b>' : ''}
      ${VIEW_BAT_BUOC.includes(view) ? '<b class="pq-nhan">bắt buộc</b>' : ''}
    </label>`;
  };

  const luoi = NHOM_VIEW.map((g) => `<div class="pq-nhom">
    <h5>${escapeHTML(g.group)}</h5>
    ${g.items.map((i) => oTick(i.view, hieuLuc.includes(i.view),
      macDinh.includes(i.view), i.label)).join('')}
  </div>`).join('');

  /* Danh sách tài khoản đã có ghi đè riêng. Chỉ hiện người ĐÃ chỉnh, không
   * liệt kê cả trăm tài khoản: muốn chỉnh một người mới thì chọn từ ô bên
   * dưới, còn danh sách này trả lời câu "ai đang có quyền khác thường". */
  const dsRieng = Object.entries(pqGhiDe.nhanSu).map(([ma, gd]) => {
    const p = profiles.find((x) => String(x.employee_code || '').toLowerCase() === ma);
    return { ma, gd, p };
  }).filter((x) => x.gd.bat.length || x.gd.tat.length);

  const tenView = (v) => MOI_NHAN[v] || v;

  return `<div class="grid cols-2 system-admin-grid pq-luoi-chinh">
    <section class="panel">
      <div class="section-title">
        <div><p class="eyebrow">QUYỀN THEO VAI TRÒ</p><h3>Vai trò thấy những màn nào</h3></div>
        <span class="subtle">${hieuLuc.length} màn đang bật${soChinh ? ` · ${soChinh} khác mặc định` : ''}</span>
      </div>

      <label class="pq-chon">
        <span>Chọn vai trò</span>
        <select id="pqVaiTro">
          ${dsVaiTro.map((r) => `<option value="${escapeHTML(r)}"${r === vt ? ' selected' : ''}>
            ${escapeHTML(ROLE_PROFILES[r].label)}${pqGhiDe.vaiTro[r] ? ' · đã chỉnh' : ''}</option>`).join('')}
        </select>
      </label>
      <p class="pq-mota">${escapeHTML(ROLE_PROFILES[vt].scope)}</p>

      <div class="pq-luoi">${luoi}</div>

      <div class="pq-nut">
        ${soChinh ? `<button class="secondary-button" type="button" id="pqTraVe">
          ↺ Trả về mặc định</button>` : ''}
        <button class="primary-button" type="button" id="pqLuuVaiTro">Lưu quyền vai trò</button>
      </div>
      <p class="pq-ghi">Đổi ở đây áp cho <b>mọi tài khoản</b> mang vai trò này. Người đang
        đăng nhập sẽ thấy thay đổi ở lần đăng nhập kế tiếp.</p>
    </section>

    <section class="panel">
      <div class="section-title">
        <div><p class="eyebrow">BẬT TẮT RIÊNG TỪNG NGƯỜI</p><h3>Ngoại lệ theo tài khoản</h3></div>
        <span class="subtle">${dsRieng.length} tài khoản đang có quyền khác vai trò</span>
      </div>

      ${dsRieng.length ? `<ul class="pq-ds">
        ${dsRieng.map((x) => `<li>
          <div>
            <strong>${escapeHTML(x.p?.full_name || x.ma)}</strong>
            <small>${escapeHTML(x.ma)}${x.p ? ` · ${escapeHTML(ROLE_PROFILES[x.p.role]?.label || x.p.role)}` : ' · không còn hồ sơ'}</small>
            <div class="pq-chenh">
              ${x.gd.bat.map((v) => `<span class="pq-nhan pq-nhan-them">+ ${escapeHTML(tenView(v))}</span>`).join('')}
              ${x.gd.tat.map((v) => `<span class="pq-nhan pq-nhan-bot">− ${escapeHTML(tenView(v))}</span>`).join('')}
            </div>
          </div>
          <div class="pq-ds-nut">
            <button class="secondary-button compact-button" type="button"
              data-pq-sua="${escapeHTML(x.ma)}">Sửa</button>
            <button class="secondary-button compact-button" type="button"
              data-pq-bo="${escapeHTML(x.ma)}">Bỏ ngoại lệ</button>
          </div>
        </li>`).join('')}
      </ul>` : '<p class="subtle">Chưa tài khoản nào có quyền khác vai trò của họ. Đây là trạng thái nên có — ngoại lệ càng ít càng dễ hiểu ai thấy được gì.</p>'}

      <div class="pq-them-nguoi">
        <label class="pq-chon">
          <span>Thêm ngoại lệ cho một tài khoản</span>
          <select id="pqChonNguoi">
            <option value="">— chọn nhân sự —</option>
            ${profiles.filter((p) => p.employee_code && !VAI_TRO_KHOA.includes(p.role))
              .map((p) => `<option value="${escapeHTML(p.employee_code)}"${
                pqNhanSu === p.employee_code ? ' selected' : ''}>${escapeHTML(p.full_name)} · ${
                escapeHTML(p.employee_code)}</option>`).join('')}
          </select>
        </label>
        ${veNganNguoi(profiles)}
      </div>
    </section>
  </div>`;
}

/* Lưới tick cho MỘT tài khoản, chỉ hiện khi đã chọn người. Dựng lại cùng một
 * hàm ô tick với phần vai trò để hai chỗ không bao giờ lệch cách hiển thị. */
function veNganNguoi(profiles) {
  if (!pqNhanSu) return '';
  const p = profiles.find((x) => x.employee_code === pqNhanSu);
  if (!p) return '<p class="subtle">Không tìm thấy hồ sơ này.</p>';

  const gdVaiTro = pqGhiDe.vaiTro[p.role];
  const nenCo = viewsHieuLuc(p.role, gdVaiTro, null);   // mức của vai trò
  const dangCo = viewsHieuLuc(p.role, gdVaiTro, pqGhiDe.nhanSu[pqNhanSu.toLowerCase()]);

  const luoi = NHOM_VIEW.map((g) => `<div class="pq-nhom">
    <h5>${escapeHTML(g.group)}</h5>
    ${g.items.map((i) => {
      const co = dangCo.includes(i.view);
      const theoVaiTro = nenCo.includes(i.view);
      const them = co && !theoVaiTro;
      const bot = !co && theoVaiTro;
      return `<label class="pq-o${them ? ' pq-them' : ''}${bot ? ' pq-bot' : ''}">
        <input type="checkbox" data-pq-nview="${escapeHTML(i.view)}"${co ? ' checked' : ''}
          ${VIEW_BAT_BUOC.includes(i.view) ? ' disabled' : ''}>
        <span>${escapeHTML(i.label)}</span>
        ${them ? '<b class="pq-nhan pq-nhan-them">bật thêm</b>' : ''}
        ${bot ? '<b class="pq-nhan pq-nhan-bot">tắt riêng</b>' : ''}
      </label>`;
    }).join('')}
  </div>`).join('');

  return `<div class="pq-nguoi">
    <p class="pq-mota">So với vai trò <b>${escapeHTML(ROLE_PROFILES[p.role]?.label || p.role)}</b>.
      Ô nào khác vai trò sẽ được đánh dấu.</p>
    <div class="pq-luoi">${luoi}</div>
    <div class="pq-nut">
      <button class="primary-button" type="button" id="pqLuuNguoi">Lưu ngoại lệ</button>
    </div>
  </div>`;
}
