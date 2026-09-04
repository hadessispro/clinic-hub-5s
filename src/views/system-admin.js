import {
  getSystemHealth, getBugLogs, createBugLog, updateBugLog,
  publishSystemAnnouncement, getSystemAnnouncements, getSystemProfiles,
  updateUserAccess, updateUserProfile, unlockAccount, datLaiMatKhau, getAccountStates, getTechnicalAudit, getIntegrationFailures,
  getSystemErrorLogs, resolveSystemError, subscribeToSystemErrors,
} from '../services/system-admin.js';
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
const TEN_THE = {
  'tai-khoan': 'Tài khoản và phân quyền',
  'phan-quyen': 'Phân quyền màn hình',
  bug: 'Bug và thông báo',
  log: 'Log lỗi hệ thống',
  audit: 'Lịch sử thay đổi',
};

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
  if (/database|supabase|rls|permission|phân quyền|data/.test(text)) return 'data';
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
  return `<article class="system-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(String(value ?? 0))}</strong><small>${escapeHTML(note)}</small></article>`;
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
        : `<button class="secondary-button compact-button" type="button" data-save-access="${profile.id}">Cập nhật</button>`}
        ${profile.id === currentUserId || !VAI_TRO_BAO_VE.includes(profile.role) ? `<button class="secondary-button compact-button" type="button"
          data-edit-profile="${profile.id}" title="Sửa hồ sơ và thông tin đăng nhập"><i class="ri-edit-line"></i> Sửa thông tin</button>` : ''}
        ${profile.employee_code ? `<button class="secondary-button compact-button" type="button"
          data-unlock="${escapeHTML(profile.employee_code)}"
          title="Xoá bộ đếm nhập sai mật khẩu. KHÔNG đổi mật khẩu.">Mở khoá</button>
        <button class="secondary-button compact-button" type="button"
          data-reset-pw="${escapeHTML(profile.employee_code)}"
          data-ten="${escapeHTML(profile.full_name || profile.employee_code)}"
          title="Đặt mật khẩu mới. Dùng khi người dùng quên hẳn mật khẩu.">Đặt lại mật khẩu</button>` : ''}</td></tr>`;
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
          <div><p class="eyebrow">TÀI KHOẢN HỆ THỐNG</p><h3 id="saProfileTitle">Cập nhật thông tin người dùng</h3></div>
          <button class="icon-button system-dialog-close" type="button" aria-label="Đóng">×</button>
        </header>
        <p class="system-dialog-message">Thông tin được đồng bộ sang hồ sơ nhân sự và tài khoản đăng nhập. Mã nhân viên không đổi để bảo toàn lịch sử.</p>
        <form class="sa-profile-form" id="saProfileForm">
          <label><span>Họ và tên *</span><input name="fullName" required maxlength="160" value="${escapeHTML(profile.full_name || '')}"></label>
          <label><span>Mã nhân viên</span><input value="${escapeHTML(profile.employee_code || '')}" readonly aria-readonly="true"><small>Khóa liên kết dữ liệu, không sửa tại đây.</small></label>
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
    'audit': `<section class="panel"><div class="section-title"><div><p class="eyebrow">AUDIT TRAIL</p><h3>Lịch sử thay đổi hệ thống</h3></div><span class="subtle">${audits.length} thao tác gần nhất</span></div><div class="system-audit-list">${audits.slice(0, 30).map((item) => `<article><strong>${escapeHTML(item.action)} · ${escapeHTML(item.entity)}</strong><span>${escapeHTML(item.entity_id || '')}</span><small>${formatDateTime(item.created_at)}</small></article>`).join('') || '<p class="subtle">Chưa có audit log.</p>'}</div></section>`,
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

export function initView() {
  document.getElementById('refreshSystem')?.addEventListener('click', () => store.notify());
  document.getElementById('announcementForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(event.currentTarget)); button.disabled = true; button.textContent = 'Đang phát hành…'; try { await publishSystemAnnouncement(data); showToast('Đã phát hành thông báo đến người dùng.'); event.currentTarget.reset(); store.notify(); } catch (error) { button.disabled = false; button.textContent = '🔔 Phát hành thông báo realtime'; showToast(error.message || 'Không thể phát hành thông báo.', true); } });
  document.getElementById('bugForm')?.addEventListener('submit', async (event) => { event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); const data = Object.fromEntries(new FormData(event.currentTarget)); button.disabled = true; button.textContent = 'Đang lưu bug…'; try { await createBugLog(data); showToast('Đã thêm bug log.'); event.currentTarget.reset(); store.notify(); } catch (error) { button.disabled = false; button.textContent = '+ Thêm bug log'; showToast(error.message || 'Không thể thêm bug log.', true); } });
  bindLiveFilters(); bindBugActions(); bindLogActions();
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
      await updateUserProfile(profile.id, updates);
      showToast(`Đã cập nhật và đồng bộ thông tin của ${profile.employee_code || profile.full_name}.`);
      store.notify();
    } catch (error) {
      showToast(error.message || 'Không thể cập nhật thông tin người dùng.', true);
      button.disabled = false;
    }
  }));

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
  logSub?.unsubscribe(); logSub = subscribeToSystemErrors(() => { if (store.getState().currentView === 'system-admin') store.notify(); });
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
