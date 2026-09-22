import { store } from '../store.js';
import { escapeHTML } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/app-dialog.js';
import { nenWebp, doKb } from '../components/nen-anh.js';
import { navigateTo } from '../router.js';
import {
  taoThuMucDongBo,
  layDanhSachThuMuc,
  taiLenMediaPhuTa,
  layMediaCuaKhach,
  layNhatKyKiemToan,
  layTrangThaiAdminDrive,
  xoaMediaAnh,
  xoaThuMucPhuTa,
  layDanhSachPhuTa,
} from '../services/phu-ta-drive.js';
import { layDanhSachHoSo, LOAI_ANH } from '../services/so-benh-an.js';

/* ── Trạng thái màn hình ─────────────────────────────────────────────── */

let activeTab = 'folders'; // 'folders' | 'audit' | 'admin'
let folders = [];
let folderMeta = { page: 1, pageSize: 50, total: 0 };
let auditLogs = [];
let auditMeta = { page: 1, pageSize: 25, total: 0 };
let adminStatus = null;
let selectedFolder = null;
let folderMedia = [];
let dsHoSoGoiY = [];
let dsNhanVienPhuTa = [];

// Bộ lọc
let filterSearch = '';
let filterAssistant = '';
let filterBranch = '';
let filterAction = '';
let filterDateFrom = '';
let filterDateTo = '';
let selectedCategory = ''; // '' = tất cả
let auditPage = 1;

// Hàm hỗ trợ vẽ lại view nhanh trong trang mà không nhảy router
async function veLaiTrang() {
  const container = document.getElementById('appView');
  if (!container) return;
  container.innerHTML = await renderView();
  initView();
}

export async function renderView() {
  const profile = store.getState().profile || {};
  const role = profile.role || 'staff';
  const isItAdmin = ['admin', 'admin_it', 'superadmin'].includes(role);
  const isDoctor = role === 'bac_si';
  const assistantName = profile.full_name || profile.employee_code || (isDoctor ? 'Bác sĩ' : 'Phụ tá');
  const assistantCode = profile.employee_code || '';

  // Nạp dữ liệu song song an toàn - Cho phép Phụ tá và Bác sĩ xem toàn bộ 2 chi nhánh
  try {
    const [folderRes, hoSoRes, asstList, statusRes] = await Promise.all([
      layDanhSachThuMuc({
        assistantCode: filterAssistant,
        branchId: filterBranch,
        search: filterSearch,
        page: 1,
        pageSize: 50,
      }),
      layDanhSachHoSo().catch(() => []),
      layDanhSachPhuTa().catch(() => []),
      isItAdmin ? layTrangThaiAdminDrive().catch(() => null) : Promise.resolve(null),
    ]);

    folders = folderRes?.folders || [];
    folderMeta = folderRes?.meta || { page: 1, pageSize: 50, total: 0 };
    dsHoSoGoiY = hoSoRes || [];
    adminStatus = statusRes;

    // Hợp nhất danh sách phụ tá từ API và các thư mục hiện hữu cho mọi người dùng
    const mapPhuTa = new Map();
    (asstList || []).forEach((e) => {
      if (e && e.code) mapPhuTa.set(e.code, { code: e.code, name: e.name || e.code, branchId: e.branch_id });
    });
    folders.forEach((f) => {
      if (f && f.assistant_code && !mapPhuTa.has(f.assistant_code)) {
        mapPhuTa.set(f.assistant_code, { code: f.assistant_code, name: f.assistant_name || f.assistant_code, branchId: f.branch_id });
      }
    });
    dsNhanVienPhuTa = Array.from(mapPhuTa.values());

    if (activeTab === 'audit' || isItAdmin) {
      const auditRes = await layNhatKyKiemToan({
        assistantCode: filterAssistant,
        action: filterAction,
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        page: auditPage,
        pageSize: 25,
      }).catch(() => ({ logs: [], meta: { page: 1, pageSize: 25, total: 0 } }));
      auditLogs = auditRes?.logs || [];
      auditMeta = auditRes?.meta || { page: 1, pageSize: 25, total: 0 };
    }

    // Nếu đang chọn một thư mục, tải lại ảnh của thư mục đó
    if (selectedFolder) {
      folderMedia = await layMediaCuaKhach(selectedFolder.patient_code);
    }
  } catch (err) {
    console.error('Lỗi nạp dữ liệu Kho ảnh Phụ tá:', err);
  }

  const totalPhotos = folders.reduce((sum, f) => sum + Number(f.media_count || 0), 0);
  const totalBytes = folders.reduce((sum, f) => sum + Number(f.total_size || 0), 0);

  return `
    <style>
      .ptd-wrap {
        display: flex;
        flex-direction: column;
        gap: 16px;
        width: 100%;
        max-width: 100%;
      }
      .ptd-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .ptd-eyebrow {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #087f7b;
        margin: 0 0 2px;
      }
      .ptd-title {
        font-size: 1.35rem;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 4px;
        letter-spacing: -0.01em;
      }
      .ptd-subtitle {
        font-size: 13px;
        color: #64748b;
        margin: 0;
      }

      /* Grid 3 chỉ số đối xứng hoàn hảo (ĐÃ BỎ Ô TELEGRAM THEO YÊU CẦU) */
      .ptd-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }
      @media (max-width: 768px) {
        .ptd-metrics {
          grid-template-columns: 1fr;
        }
      }
      .ptd-metric-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .ptd-metric-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        transform: translateY(-1px);
      }
      .ptd-metric-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        flex-shrink: 0;
      }
      .ptd-metric-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .ptd-metric-info span {
        font-size: 12px;
        color: #64748b;
        font-weight: 500;
      }
      .ptd-metric-info strong {
        font-size: 1.55rem;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.15;
      }
      .ptd-metric-info small {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Segmented Navigation Tab bar */
      .ptd-tab-bar {
        display: inline-flex;
        background: #f1f5f9;
        padding: 4px;
        border-radius: 10px;
        gap: 4px;
        align-self: flex-start;
      }
      .ptd-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        color: #64748b;
        border: none;
        background: transparent;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .ptd-tab-btn:hover {
        color: #0f172a;
        background: rgba(255, 255, 255, 0.6);
      }
      .ptd-tab-btn.is-active {
        background: #ffffff;
        color: #087f7b;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }

      /* Split Layout */
      .ptd-layout {
        display: grid;
        grid-template-columns: 350px 1fr;
        gap: 16px;
        align-items: start;
      }
      @media (max-width: 960px) {
        .ptd-layout {
          grid-template-columns: 1fr;
        }
      }

      /* Sidebar (Clean flush layout with internal sections) */
      .ptd-sidebar {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 0;
        display: flex;
        flex-direction: column;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        overflow: hidden;
      }
      .ptd-sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: #ffffff;
        border-bottom: 1px solid #f1f5f9;
      }
      .ptd-sidebar-add-btn {
        height: 28px;
        min-height: 28px !important;
        max-height: 28px !important;
        padding: 0 10px !important;
        font-size: 12px;
        font-weight: 600;
        border-radius: 6px;
        background: #087f7b;
        color: #ffffff;
        border: none;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: background 0.15s;
        line-height: 1;
        box-sizing: border-box;
      }
      .ptd-sidebar-add-btn:hover {
        background: #065f5b;
      }

      /* Admin-IT Filter Box in Sidebar */
      .ptd-admin-filter-box {
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ptd-admin-filter-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ptd-admin-filter-title {
        font-size: 11px;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .ptd-admin-filter-reset {
        font-size: 11px;
        color: #087f7b;
        background: transparent;
        border: none;
        cursor: pointer;
        font-weight: 600;
        padding: 0;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .ptd-admin-filter-reset:hover {
        text-decoration: underline;
        color: #065f5b;
      }
      .ptd-filter-fields {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .ptd-filter-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ptd-filter-label {
        font-size: 11px;
        font-weight: 600;
        color: #475569;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .ptd-filter-select {
        width: 100%;
        height: 34px;
        min-height: 34px !important;
        font-size: 12px;
        color: #1e293b;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 0 8px;
        outline: none;
        cursor: pointer;
        transition: border-color 0.15s, box-shadow 0.15s;
        box-sizing: border-box;
      }
      .ptd-filter-select:focus {
        border-color: #087f7b;
        box-shadow: 0 0 0 2px rgba(8, 127, 123, 0.12);
      }

      /* Search Box */
      .ptd-search-box {
        position: relative;
        padding: 10px 14px;
        border-bottom: 1px solid #f1f5f9;
        background: #ffffff;
      }
      .ptd-search-box input {
        width: 100%;
        height: 34px;
        min-height: 34px !important;
        padding: 0 10px 0 32px;
        font-size: 12.5px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        outline: none;
        box-sizing: border-box;
        background: #f8fafc;
        transition: all 0.15s;
      }
      .ptd-search-box input:focus {
        background: #ffffff;
        border-color: #087f7b;
        box-shadow: 0 0 0 2px rgba(8, 127, 123, 0.12);
      }
      .ptd-search-box i {
        position: absolute;
        left: 22px;
        top: 50%;
        transform: translateY(-50%);
        color: #94a3b8;
        font-size: 14px;
        pointer-events: none;
      }

      /* Folder List & Items */
      .ptd-folder-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: calc(100vh - 360px);
        min-height: 260px;
        overflow-y: auto;
        padding: 10px 12px;
      }
      .ptd-folder-item {
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        cursor: pointer;
        transition: all 0.15s ease;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .ptd-folder-item:hover {
        border-color: #99f6e4;
        background: #f0fdfa;
      }
      .ptd-folder-item.is-selected {
        border-color: #087f7b;
        background: #f0fdfa;
        box-shadow: 0 2px 6px rgba(8, 127, 123, 0.08);
      }

      /* Folder Delete Button (Crisp 26x26px square, never distorted) */
      .ptd-folder-del-btn {
        width: 26px;
        height: 26px;
        min-height: 26px !important;
        max-height: 26px !important;
        padding: 0 !important;
        border: 1px solid #fecaca !important;
        background: #fef2f2 !important;
        color: #ef4444 !important;
        border-radius: 5px !important;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        transition: all 0.15s ease;
        flex-shrink: 0;
        line-height: 1;
        box-sizing: border-box;
      }
      .ptd-folder-del-btn:hover {
        background: #ef4444 !important;
        color: #ffffff !important;
        border-color: #ef4444 !important;
      }

      /* Action Buttons in Canvas Header */
      .ptd-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 34px;
        min-height: 34px !important;
        max-height: 34px !important;
        padding: 0 12px !important;
        border-radius: 7px !important;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.15s ease;
        white-space: nowrap;
        box-sizing: border-box;
        line-height: 1;
      }
      .ptd-action-btn-primary {
        background: #087f7b !important;
        color: #ffffff !important;
        border: 1px solid #087f7b !important;
      }
      .ptd-action-btn-primary:hover {
        background: #065f5b !important;
        border-color: #065f5b !important;
      }
      .ptd-action-btn-secondary {
        background: #f0fdfa !important;
        color: #087f7b !important;
        border: 1px solid #99f6e4 !important;
      }
      .ptd-action-btn-secondary:hover {
        background: #ccfbf1 !important;
        border-color: #5eead4 !important;
      }
      .ptd-action-btn-danger {
        background: #fef2f2 !important;
        color: #ef4444 !important;
        border: 1px solid #fca5a5 !important;
      }
      .ptd-action-btn-danger:hover {
        background: #fee2e2 !important;
        border-color: #f87171 !important;
        color: #dc2626 !important;
      }

      /* Workspace Canvas */
      .ptd-canvas {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 20px;
        min-height: 480px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      }
      .ptd-canvas-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 14px;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }

      /* Category Filter Chips */
      .ptd-chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }
      .ptd-chip {
        padding: 5px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #475569;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .ptd-chip:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
      }
      .ptd-chip.is-active {
        background: #087f7b;
        color: #ffffff;
        border-color: #087f7b;
      }

      /* Photo Gallery */
      .ptd-photo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 14px;
      }
      .ptd-photo-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: all 0.15s ease;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      }
      .ptd-photo-card:hover {
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
        transform: translateY(-2px);
      }
      .ptd-photo-thumb {
        position: relative;
        width: 100%;
        aspect-ratio: 4/3;
        background: #0f172a;
        overflow: hidden;
        cursor: pointer;
      }
      .ptd-photo-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.2s ease;
      }
      .ptd-photo-card:hover .ptd-photo-thumb img {
        transform: scale(1.04);
      }
      .ptd-photo-badge {
        position: absolute;
        top: 8px;
        left: 8px;
        background: rgba(15, 23, 42, 0.75);
        color: #ffffff;
        font-size: 10px;
        font-weight: 500;
        padding: 3px 8px;
        border-radius: 6px;
        backdrop-filter: blur(4px);
      }
      .ptd-photo-size {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(8, 127, 123, 0.85);
        color: #ffffff;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .ptd-photo-body {
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .ptd-photo-actions {
        border-top: 1px solid #f1f5f9;
        padding: 6px 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #fafafa;
      }
      .ptd-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        min-height: 28px !important;
        max-height: 28px !important;
        padding: 0 !important;
        border-radius: 6px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        color: #64748b;
        font-size: 13px;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.15s ease;
        box-sizing: border-box;
        line-height: 1;
      }
      .ptd-icon-btn:hover {
        background: #f1f5f9;
        color: #0f172a;
        border-color: #cbd5e1;
      }
      .ptd-icon-btn.is-teal {
        color: #087f7b;
      }
      .ptd-icon-btn.is-teal:hover {
        background: #f0fdfa;
        border-color: #99f6e4;
      }
      .ptd-icon-btn.is-danger {
        color: #ef4444;
      }
      .ptd-icon-btn.is-danger:hover {
        background: #fef2f2;
        border-color: #fca5a5;
      }

      /* Empty states */
      .ptd-empty-state {
        text-align: center;
        padding: 56px 20px;
        color: #64748b;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .ptd-empty-icon {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: #f0fdfa;
        color: #087f7b;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 30px;
        margin-bottom: 12px;
      }
    </style>

    <div class="ptd-wrap">
      <!-- Tiêu đề trang -->
      <div class="ptd-header">
        <div>
          <p class="ptd-eyebrow">
            <i class="ri-camera-lens-fill"></i> KHO ẢNH LÂM SÀNG · HỒ SƠ ĐIỆN TỬ
          </p>
          <h2 class="ptd-title">Quản Lý Ảnh Lâm Sàng & Hồ Sơ Điều Trị</h2>
          <p class="ptd-subtitle">
            Lưu trữ ảnh bệnh nhân dành cho Phụ tá · Tự động chuẩn hóa WebP và phân loại theo ca điều trị
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <span class="pill" style="background:#f0fdfa;color:#087f7b;font-weight:600;padding:6px 12px;border:1px solid #ccfbf1;">
            <i class="ri-user-heart-line"></i> ${escapeHTML(assistantName)} (${escapeHTML(assistantCode || 'N/A')})
          </span>
          <button type="button" class="primary-button" id="ptBtnMoModalTao" style="display:inline-flex;align-items:center;gap:6px;">
            <i class="ri-folder-add-line"></i> Tạo thư mục bệnh nhân mới
          </button>
        </div>
      </div>

      <!-- 3 thẻ chỉ số đối xứng hoàn hảo -->
      <div class="ptd-metrics">
        <div class="ptd-metric-card">
          <div class="ptd-metric-icon" style="background:#eff6ff;color:#2563eb;">
            <i class="ri-folder-user-line"></i>
          </div>
          <div class="ptd-metric-info">
            <span>Thư mục bệnh nhân</span>
            <strong>${folders.length}</strong>
            <small>${filterAssistant ? 'Đang lọc theo phụ tá' : filterBranch ? (filterBranch === 'le_van_tho' ? 'Chi nhánh Lê Văn Thọ' : 'Chi nhánh Phạm Văn Chiêu') : 'Toàn bộ 2 chi nhánh'}</small>
          </div>
        </div>

        <div class="ptd-metric-card">
          <div class="ptd-metric-icon" style="background:#f0fdf4;color:#16a34a;">
            <i class="ri-image-2-line"></i>
          </div>
          <div class="ptd-metric-info">
            <span>Tổng ảnh lâm sàng</span>
            <strong>${totalPhotos.toLocaleString('vi-VN')}</strong>
            <small>Đã lưu trữ trong hồ sơ (cả 2 chi nhánh)</small>
          </div>
        </div>

        <div class="ptd-metric-card">
          <div class="ptd-metric-icon" style="background:#faf5ff;color:#9333ea;">
            <i class="ri-hard-drive-2-line"></i>
          </div>
          <div class="ptd-metric-info">
            <span>Dung lượng tối ưu</span>
            <strong>${doKb(totalBytes)}</strong>
            <small>Đã nén WebP chuẩn y tế</small>
          </div>
        </div>
      </div>

      <!-- Thanh chuyển Tab dạng Segmented Pill -->
      <div class="ptd-tab-bar">
        <button type="button" class="ptd-tab-btn ${activeTab === 'folders' ? 'is-active' : ''}" data-pt-tab="folders">
          <i class="ri-folder-shared-line"></i> Thư mục bệnh nhân (${folders.length})
        </button>
        <button type="button" class="ptd-tab-btn ${activeTab === 'audit' ? 'is-active' : ''}" data-pt-tab="audit">
          <i class="ri-history-line"></i> Lịch sử thao tác (${auditMeta.total || 0})
        </button>
        ${isItAdmin ? `
          <button type="button" class="ptd-tab-btn ${activeTab === 'admin' ? 'is-active' : ''}" data-pt-tab="admin" style="color:#0284c7;">
            <i class="ri-settings-4-line"></i> Quản trị Quota Lưu Trữ
          </button>
        ` : ''}
      </div>

      ${activeTab === 'folders' ? renderTabFolders(isItAdmin) : ''}
      ${activeTab === 'audit' ? renderTabAudit(isItAdmin) : ''}
      ${activeTab === 'admin' && isItAdmin ? renderTabAdmin() : ''}
    </div>
  `;
}

/* ── TAB 1: Danh sách thư mục & Chi tiết ảnh ─────────────────────────── */

function renderTabFolders(isItAdmin) {
  // Lọc folders theo branch nếu chọn
  const displayFolders = filterBranch
    ? folders.filter((f) => f.branch_id === filterBranch)
    : folders;

  // Lọc media theo category
  const filteredMedia = selectedCategory
    ? folderMedia.filter((m) => m.category === selectedCategory)
    : folderMedia;

  return `
    <div class="ptd-layout">
      <!-- Cột trái: Danh sách thư mục bệnh nhân -->
      <aside class="ptd-sidebar">
        <div class="ptd-sidebar-header">
          <div style="display:flex;align-items:center;gap:6px;">
            <i class="ri-folders-line" style="color:#087f7b;font-size:16px;"></i>
            <strong style="font-size:13.5px;color:#0f172a;">Danh mục bệnh nhân</strong>
            <span class="pill" style="font-size:11px;background:#f1f5f9;color:#64748b;padding:2px 7px;border-radius:10px;">${displayFolders.length}</span>
          </div>
          <button type="button" class="ptd-sidebar-add-btn" id="ptBtnSidebarTaoMoi" title="Tạo thư mục bệnh nhân mới">
            <i class="ri-add-line"></i> Thêm
          </button>
        </div>

        <div class="ptd-admin-filter-box">
          <div class="ptd-admin-filter-header">
            <span class="ptd-admin-filter-title">
              <i class="ri-filter-3-line" style="color:#087f7b;"></i> BỘ LỌC HỒ SƠ & CHI NHÁNH
            </span>
            <div style="display:flex;align-items:center;gap:6px;">
              ${(filterAssistant || filterBranch) ? `
                <button type="button" class="ptd-admin-filter-reset" id="ptBtnResetAdminFilter" title="Xóa toàn bộ bộ lọc">
                  <i class="ri-refresh-line"></i> Bỏ lọc
                </button>
              ` : `
                <span class="pill" style="font-size:9.5px;background:#dcfce7;color:#15803d;padding:1px 6px;font-weight:600;">Cả 2 chi nhánh</span>
              `}
            </div>
          </div>

          <div class="ptd-filter-fields">
            <label class="ptd-filter-field">
              <span class="ptd-filter-label"><i class="ri-user-heart-line" style="color:#087f7b;"></i> Phụ tá phụ trách:</span>
              <select id="ptFilterAssistantSelect" class="ptd-filter-select">
                <option value="">-- Tất cả phụ tá (${dsNhanVienPhuTa.length}) --</option>
                ${dsNhanVienPhuTa.map((e) => `
                  <option value="${escapeHTML(e.code)}" ${filterAssistant === e.code ? 'selected' : ''}>
                    ${escapeHTML(e.name)} (${escapeHTML(e.code)})
                  </option>
                `).join('')}
              </select>
            </label>

            <label class="ptd-filter-field">
              <span class="ptd-filter-label"><i class="ri-building-line" style="color:#087f7b;"></i> Chi nhánh cơ sở:</span>
              <select id="ptFilterBranchSelect" class="ptd-filter-select">
                <option value="">-- Tất cả 2 chi nhánh --</option>
                <option value="le_van_tho" ${filterBranch === 'le_van_tho' ? 'selected' : ''}>Cơ sở 1: Lê Văn Thọ</option>
                <option value="pham_van_chieu" ${filterBranch === 'pham_van_chieu' ? 'selected' : ''}>Cơ sở 2: Phạm Văn Chiêu</option>
              </select>
            </label>
          </div>
        </div>

        <div class="ptd-search-box">
          <i class="ri-search-line"></i>
          <input type="text" id="ptSearchFolderInput" value="${escapeHTML(filterSearch)}" placeholder="Tìm theo mã hoặc tên BN..." />
        </div>

        <div class="ptd-folder-list">
          ${!displayFolders.length ? `
            <div style="text-align:center;padding:32px 12px;color:#94a3b8;font-size:12px;">
              <i class="ri-folder-user-line" style="font-size:32px;display:block;margin-bottom:8px;color:#cbd5e1;"></i>
              Chưa có thư mục bệnh nhân nào phù hợp.<br>
              Bấm <b>+ Thêm</b> ở trên để tạo thư mục mới.
            </div>
          ` : displayFolders.map((f) => {
            const isSelected = selectedFolder && String(selectedFolder.id) === String(f.id);
            return `
              <div class="ptd-folder-item ${isSelected ? 'is-selected' : ''}" data-folder-id="${escapeHTML(f.id)}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <strong style="font-size:13px;font-weight:600;color:${isSelected ? '#087f7b' : '#0f172a'};line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${escapeHTML(f.patient_name)}">
                    [${escapeHTML(f.patient_code)}] ${escapeHTML(f.patient_name)}
                  </strong>
                  <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
                    <span class="pill" style="font-size:10px;padding:2px 7px;background:${Number(f.media_count) > 0 ? '#ccfbf1' : '#f1f5f9'};color:${Number(f.media_count) > 0 ? '#0f766e' : '#64748b'};font-weight:600;border-radius:12px;">
                      ${f.media_count || 0} ảnh
                    </span>
                    <button type="button" class="ptd-folder-del-btn" data-pt-xoa-folder="${escapeHTML(f.id)}" title="Xóa thư mục bệnh nhân này">
                      <i class="ri-delete-bin-line"></i>
                    </button>
                  </div>
                </div>
                <div style="font-size:11px;color:#64748b;display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
                  <span style="display:inline-flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">
                    <i class="ri-user-heart-line" style="color:#087f7b;font-size:12px;"></i> ${escapeHTML(f.assistant_name)}
                  </span>
                  <span style="color:#94a3b8;flex-shrink:0;">${doKb(Number(f.total_size || 0))}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </aside>

      <!-- Cột phải: Chi tiết thư mục đã chọn & Lưới ảnh -->
      <main class="ptd-canvas">
        ${!selectedFolder ? `
          <div class="ptd-empty-state">
            <div class="ptd-empty-icon">
              <i class="ri-folder-image-line"></i>
            </div>
            <h3 style="margin:0 0 6px;font-size:16px;color:#1e293b;">Chưa chọn thư mục bệnh nhân</h3>
            <p style="margin:0 0 18px;font-size:13px;color:#64748b;max-width:420px;line-height:1.5;">
              Chọn một khách hàng ở danh sách bên trái hoặc bấm nút bên dưới để tạo thư mục đồng bộ ảnh lâm sàng mới.
            </p>
            <button type="button" class="primary-button" id="ptBtnTaoTuEmpty" style="display:inline-flex;align-items:center;gap:6px;">
              <i class="ri-folder-add-line"></i> Tạo thư mục bệnh nhân mới
            </button>
          </div>
        ` : `
          <!-- Header của thư mục được chọn -->
          <div class="ptd-canvas-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:14px;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
                <h3 style="margin:0;font-size:16px;color:#0f172a;display:flex;align-items:center;gap:6px;">
                  <i class="ri-folder-open-fill" style="color:#087f7b;"></i>
                  [${escapeHTML(selectedFolder.patient_code)}] ${escapeHTML(selectedFolder.patient_name)}
                </h3>
                <span class="pill" style="background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:600;">
                  ${selectedFolder.branch_id === 'le_van_tho' ? 'Lê Văn Thọ' : 'Phạm Văn Chiêu'}
                </span>
                <span class="pill" style="background:#f0fdfa;color:#087f7b;font-size:11px;">
                  Phụ tá: ${escapeHTML(selectedFolder.assistant_name)}
                </span>
              </div>
              <p style="margin:0;font-size:12px;color:#64748b;">
                Tổng số: <b>${folderMedia.length}</b> ảnh · Cập nhật gần nhất: ${new Date(selectedFolder.updated_at).toLocaleString('vi-VN')}
                ${selectedFolder.notes ? ` · <span style="color:#334155;font-style:italic;">Ghi chú: ${escapeHTML(selectedFolder.notes)}</span>` : ''}
              </p>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <!-- 1. Tải / Chụp ảnh mới -->
              <button type="button" class="ptd-action-btn ptd-action-btn-primary" id="ptBtnTaiAnhVaoThuMuc">
                <i class="ri-camera-lens-line"></i> Tải / Chụp ảnh mới
              </button>

              <!-- 2. Kiểm tra liên kết Drive -->
              <a href="${escapeHTML(selectedFolder.google_drive_web_link || 'https://drive.google.com')}" target="_blank" rel="noopener" class="ptd-action-btn ptd-action-btn-secondary" title="Kiểm tra mở thư mục trên Google Drive">
                <i class="ri-external-link-line"></i> Kiểm tra Drive
              </a>

              <!-- 3. Kiểm tra vết / Lịch sử hồ sơ -->
              <button type="button" class="ptd-action-btn ptd-action-btn-secondary" id="ptBtnKiemTraAudit" title="Kiểm tra vết thao tác của hồ sơ này">
                <i class="ri-shield-check-line"></i> Kiểm tra vết
              </button>

              <!-- 4. Xóa thư mục hồ sơ -->
              <button type="button" class="ptd-action-btn ptd-action-btn-danger" id="ptBtnXoaThuMucHienTai" title="Xóa thư mục bệnh nhân này">
                <i class="ri-delete-bin-line"></i> Xóa thư mục
              </button>
            </div>
          </div>

          <!-- Bộ lọc danh mục ảnh -->
          ${folderMedia.length ? `
            <div class="ptd-chips">
              <button type="button" class="ptd-chip ${selectedCategory === '' ? 'is-active' : ''}" data-cat-filter="">
                Tất cả (${folderMedia.length})
              </button>
              ${Object.entries(LOAI_ANH).map(([k, v]) => {
                const count = folderMedia.filter((m) => m.category === k).length;
                if (!count) return '';
                return `
                  <button type="button" class="ptd-chip ${selectedCategory === k ? 'is-active' : ''}" data-cat-filter="${k}">
                    ${escapeHTML(v)} (${count})
                  </button>
                `;
              }).join('')}
            </div>
          ` : ''}

          <!-- Lưới ảnh -->
          ${!folderMedia.length ? `
            <div class="ptd-empty-state" style="background:#f8fafc;border-radius:10px;border:1.5px dashed #cbd5e1;padding:42px 16px;">
              <div class="ptd-empty-icon" style="background:#f1f5f9;color:#94a3b8;">
                <i class="ri-camera-lens-line"></i>
              </div>
              <h4 style="margin:0 0 6px;color:#334155;font-size:15px;">Thư mục bệnh nhân này chưa có ảnh nào</h4>
              <p style="margin:0 0 16px;font-size:12px;color:#94a3b8;max-width:380px;">
                Chụp trực tiếp từ điện thoại hoặc tải ảnh từ máy tính. Ảnh sẽ được tự động tối ưu hóa WebP chuẩn y tế.
              </p>
              <button type="button" class="primary-button" id="ptBtnTaiAnhRong" style="display:inline-flex;align-items:center;gap:6px;">
                <i class="ri-upload-cloud-line"></i> Tải ảnh lâm sàng ngay
              </button>
            </div>
          ` : !filteredMedia.length ? `
            <div style="text-align:center;padding:36px;color:#94a3b8;font-size:13px;">
              Không có ảnh nào trong danh mục này.
            </div>
          ` : `
            <div class="ptd-photo-grid">
              ${filteredMedia.map((m) => `
                <div class="ptd-photo-card">
                  <div class="ptd-photo-thumb" data-pt-xem="${escapeHTML(m.id)}">
                    <img src="/api/v2/media/view/${escapeHTML(m.id)}" alt="${escapeHTML(m.file_name)}" loading="lazy" />
                    <span class="ptd-photo-badge">
                      ${escapeHTML(LOAI_ANH[m.category] || m.category || 'Ảnh')}
                    </span>
                    <span class="ptd-photo-size">
                      ${doKb(Number(m.file_size || 0))}
                    </span>
                  </div>
                  <div class="ptd-photo-body">
                    <div style="font-weight:600;font-size:12px;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHTML(m.file_name)}">
                      ${escapeHTML(m.file_name)}
                    </div>
                    <div style="font-size:11px;color:#475569;display:flex;align-items:center;gap:4px;">
                      <i class="ri-user-heart-line" style="color:#087f7b;"></i>
                      <span>${escapeHTML(m.assistant_name || 'Phụ tá')}</span>
                    </div>
                    <div style="font-size:10px;color:#94a3b8;">
                      ${new Date(m.created_at).toLocaleString('vi-VN')}
                    </div>
                    ${m.notes ? `<div style="font-size:11px;color:#64748b;font-style:italic;background:#f8fafc;padding:3px 6px;border-radius:4px;margin-top:2px;">${escapeHTML(m.notes)}</div>` : ''}
                  </div>
                  <div class="ptd-photo-actions">
                    <button type="button" class="ptd-action-btn ptd-action-btn-secondary" data-pt-xem="${escapeHTML(m.id)}" title="Xem phóng to" style="height:26px;min-height:26px!important;padding:0 8px!important;font-size:11.5px;">
                      <i class="ri-eye-line"></i> Xem
                    </button>
                    <div style="display:flex;align-items:center;gap:4px;">
                      <a href="/api/v2/media/download/${escapeHTML(m.id)}" class="ptd-icon-btn" title="Tải file gốc" download>
                        <i class="ri-download-2-line"></i>
                      </a>
                      <button type="button" class="ptd-icon-btn is-teal" data-pt-audit="${escapeHTML(m.id)}" title="Lịch sử xem ảnh">
                        <i class="ri-history-line"></i>
                      </button>
                      <button type="button" class="ptd-icon-btn is-danger" data-pt-xoa="${escapeHTML(m.id)}" title="Xóa ảnh">
                        <i class="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        `}
      </main>
    </div>
  `;
}

/* ── TAB 2: Nhật ký lưu trữ (Audit Logs) ─────────────────────────────── */

function renderTabAudit(isItAdmin) {
  const actionBadges = {
    create_folder: '<span class="pill" style="background:#e0e7ff;color:#4338ca;">Tạo thư mục</span>',
    upload: '<span class="pill" style="background:#dcfce7;color:#15803d;">Tải ảnh lên</span>',
    view: '<span class="pill" style="background:#f0f9ff;color:#0369a1;">Xem ảnh</span>',
    download: '<span class="pill" style="background:#fef3c7;color:#b45309;">Tải file về</span>',
    update_note: '<span class="pill" style="background:#f1f5f9;color:#475569;">Sửa ghi chú</span>',
    delete: '<span class="pill" style="background:#fee2e2;color:#b91c1c;">Xóa ảnh</span>',
  };

  return `
    <section class="panel" style="border-radius:12px;padding:18px;">
      <div class="section-title" style="margin-bottom:14px;">
        <div>
          <h3 style="margin:0 0 4px;font-size:16px;">Lịch sử Thao tác & Lưu trữ Ảnh</h3>
          <p class="subtle" style="margin:0;font-size:12px;">Ghi nhận mọi thao tác: Tạo thư mục, Tải ảnh, Xem ảnh, Tải về, Xóa ảnh</p>
        </div>
        <span class="pill">${auditMeta.total || 0} bản ghi</span>
      </div>

      <!-- Bộ lọc audit -->
      <form id="ptAuditFilterForm" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:10px;margin-bottom:14px;align-items:end;">
        <label class="form-field" style="margin:0;">
          <span style="font-size:11px;font-weight:600;">Hành động:</span>
          <select name="action" style="font-size:12px;padding:6px 10px;">
            <option value="">Tất cả thao tác</option>
            <option value="create_folder" ${filterAction === 'create_folder' ? 'selected' : ''}>Tạo thư mục</option>
            <option value="upload" ${filterAction === 'upload' ? 'selected' : ''}>Tải ảnh lên</option>
            <option value="view" ${filterAction === 'view' ? 'selected' : ''}>Xem ảnh</option>
            <option value="download" ${filterAction === 'download' ? 'selected' : ''}>Tải file về</option>
            <option value="delete" ${filterAction === 'delete' ? 'selected' : ''}>Xóa ảnh</option>
            <option value="delete_folder" ${filterAction === 'delete_folder' ? 'selected' : ''}>Xóa thư mục</option>
          </select>
        </label>
        <label class="form-field" style="margin:0;">
          <span style="font-size:11px;font-weight:600;">Từ ngày:</span>
          <input type="date" name="dateFrom" value="${escapeHTML(filterDateFrom)}" style="font-size:12px;padding:6px 10px;" />
        </label>
        <label class="form-field" style="margin:0;">
          <span style="font-size:11px;font-weight:600;">Đến ngày:</span>
          <input type="date" name="dateTo" value="${escapeHTML(filterDateTo)}" style="font-size:12px;padding:6px 10px;" />
        </label>
        <div style="display:flex;gap:6px;align-items:flex-end;">
          <button type="submit" class="ptd-action-btn ptd-action-btn-primary" style="flex:1;height:34px;font-size:12px;"><i class="ri-filter-line"></i> Lọc</button>
          <button type="button" id="ptBtnResetAuditFilter" class="ptd-action-btn ptd-action-btn-secondary" style="height:34px;font-size:12px;">Đặt lại</button>
        </div>
      </form>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thời gian</th>
              <th>Nhân viên</th>
              <th>Hành động</th>
              <th>Mã khách hàng</th>
              <th>Chi tiết thao tác</th>
              <th>IP & Thiết bị</th>
            </tr>
          </thead>
          <tbody>
            ${!auditLogs.length ? `
              <tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:28px;">Chưa có bản ghi lịch sử phù hợp.</td></tr>
            ` : auditLogs.map((log) => {
              const details = typeof log.details === 'object' ? log.details : {};
              const detailStr = log.file_name || details.fileName || details.folderName || details.assistantName || '—';
              return `
                <tr>
                  <td><small>${new Date(log.created_at).toLocaleString('vi-VN')}</small></td>
                  <td>
                    <strong>${escapeHTML(log.actor_name || log.actor_code)}</strong><br>
                    <small class="subtle">${escapeHTML(log.actor_code)} · ${escapeHTML(log.actor_role)}</small>
                  </td>
                  <td>${actionBadges[log.action] || log.action}</td>
                  <td><strong>${escapeHTML(log.patient_code || '—')}</strong></td>
                  <td>
                    <span>${escapeHTML(detailStr)}</span>
                    ${details.fileSize ? `<small class="subtle"> (${doKb(Number(details.fileSize))})</small>` : ''}
                  </td>
                  <td>
                    <small><code>${escapeHTML(log.client_ip || 'Internal')}</code></small><br>
                    <small class="subtle" title="${escapeHTML(log.user_agent || '')}">${escapeHTML((log.user_agent || '').slice(0, 26))}...</small>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

/* ── TAB 3: Quản trị Admin-IT & Quota Lưu Trữ ────────────────────────── */

function renderTabAdmin() {
  const drive = adminStatus?.drive || {};
  const stats = adminStatus?.stats || {};
  const quota = drive.storageQuota || {};
  const limitBytes = Number(quota.limit || 0);
  const usageBytes = Number(quota.usage || 0);
  const percentUsed = limitBytes > 0 ? ((usageBytes / limitBytes) * 100).toFixed(1) : '0';

  return `
    <div class="grid cols-2" style="gap:16px;margin-bottom:16px;">
      <!-- Thẻ trạng thái kết nối Cloud Storage -->
      <section class="panel" style="border:1.5px solid #bae6fd;border-radius:12px;padding:18px;">
        <div class="section-title">
          <div>
            <h3 style="color:#0369a1;display:flex;align-items:center;gap:8px;margin:0 0 4px;font-size:16px;">
              <i class="ri-cloud-line"></i> Trạng thái Lưu Trữ Đám Mây
            </h3>
            <p class="subtle" style="margin:0;font-size:12px;">Kết nối dịch vụ đám mây phòng khám</p>
          </div>
          <span class="pill" style="background:${drive.connected ? '#dcfce7' : '#fee2e2'};color:${drive.connected ? '#15803d' : '#b91c1c'};font-weight:600;">
            ${drive.connected ? 'Đã kết nối' : 'Lỗi kết nối'}
          </span>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;margin-top:12px;">
          <div><b>Tài khoản dịch vụ:</b> <code>${escapeHTML(drive.userEmail || 'Hệ thống phòng khám')}</code></div>
          <div><b>Dung lượng sử dụng:</b> ${doKb(usageBytes)} / ${limitBytes > 0 ? doKb(limitBytes) : 'Tiêu chuẩn'} (${percentUsed}%)</div>
          <div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">
            <div style="width:${percentUsed}%;height:100%;background:#087f7b;border-radius:4px;"></div>
          </div>
        </div>
      </section>

      <!-- Thẻ Thống kê tổng thể -->
      <section class="panel" style="border-radius:12px;padding:18px;">
        <div class="section-title">
          <div>
            <h3 style="display:flex;align-items:center;gap:8px;margin:0 0 4px;font-size:16px;">
              <i class="ri-database-2-line" style="color:#087f7b;"></i> Thống Kê Toàn Hệ Thống
            </h3>
            <p class="subtle" style="margin:0;font-size:12px;">Dữ liệu tổng hợp từ các chi nhánh và tài khoản</p>
          </div>
          <span class="pill is-success">Hoạt động</span>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;margin-top:12px;">
          <div><b>Tổng thư mục bệnh nhân:</b> <strong>${stats.totalFolders || 0}</strong> hồ sơ</div>
          <div><b>Tổng số ảnh lưu trữ:</b> <strong>${stats.totalFiles || 0}</strong> tệp lâm sàng</div>
          <div><b>Tổng dung lượng dữ liệu:</b> <strong>${doKb(Number(stats.totalSize || 0))}</strong></div>
        </div>
      </section>
    </div>
  `;
}

/* ── DIALOG 1: Tạo thư mục đồng bộ khách hàng mới ────────────────────── */

function moModalTaoThuMuc() {
  const existing = document.getElementById('ptModalTaoThuMuc');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'ptModalTaoThuMuc';
  div.className = 'system-dialog-layer is-open';
  div.innerHTML = `
    <div class="system-dialog-backdrop"></div>
    <section class="system-dialog-panel" style="max-width:500px; width:95%;">
      <header class="system-dialog-header">
        <span class="system-dialog-icon default" style="color:#087f7b;"><i class="ri-folder-add-line"></i></span>
        <div>
          <p class="eyebrow">HỒ SƠ ĐIỆN TỬ · KHO ẢNH LÂM SÀNG</p>
          <h3 style="margin:0;font-size:16px;color:#0f172a;">Tạo Thư Mục Bệnh Nhân Mới</h3>
        </div>
        <button class="icon-button system-dialog-close" type="button" id="ptBtnDongTaoX">×</button>
      </header>

      <form id="ptFormTaoThuMucDirect" style="display:flex;flex-direction:column;gap:12px;padding:4px 0 0;">
        <p style="margin:0;font-size:12px;color:#64748b;line-height:1.4;">
          Thư mục sẽ được tạo tự động và phân loại theo tài khoản Phụ tá của bạn.
        </p>

        <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Chọn từ Sổ bệnh án (hoặc nhập bên dưới):</span>
          <select id="ptGoiYSelectModal" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;">
            <option value="">-- Chọn khách hàng có sẵn --</option>
            ${dsHoSoGoiY.map((h) => `
              <option value="${escapeHTML(h.ma)}" data-ten="${escapeHTML(h.ten)}">
                ${escapeHTML(h.ma)} · ${escapeHTML(h.ten)} (${escapeHTML(h.dien_thoai || '')})
              </option>
            `).join('')}
          </select>
        </label>

        <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:10px;">
          <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
            <span>Mã bệnh nhân <b style="color:red;">*</b></span>
            <input name="patientCode" id="ptInputMaDirect" required placeholder="VD: BN-00001" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;" />
          </label>
          <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
            <span>Họ và tên <b style="color:red;">*</b></span>
            <input name="patientName" id="ptInputTenDirect" required placeholder="VD: Nguyễn Văn A" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;" />
          </label>
        </div>

        <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Chi nhánh điều trị:</span>
          <select name="branchId" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;">
            <option value="le_van_tho">Chi nhánh Lê Văn Thọ</option>
            <option value="pham_van_chieu">Chi nhánh Phạm Văn Chiêu</option>
          </select>
        </label>

        <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Ghi chú ban đầu:</span>
          <textarea name="notes" placeholder="VD: Chỉnh nha mắc cài, cấy ghép Implant..." rows="2" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical;"></textarea>
        </label>

        <footer class="system-dialog-actions" style="margin-top:8px;display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="secondary-button" id="ptBtnHuyTaoDirect">Hủy</button>
          <button type="submit" class="primary-button" id="ptBtnXacNhanTaoDirect" style="display:inline-flex;align-items:center;gap:6px;">
            <i class="ri-check-line"></i> Khởi tạo thư mục
          </button>
        </footer>
      </form>
    </section>
  `;
  document.body.appendChild(div);
  document.body.classList.add('app-modal-open');

  const dong = () => {
    div.remove();
    document.body.classList.remove('app-modal-open');
  };

  div.querySelector('.system-dialog-backdrop')?.addEventListener('click', dong);
  div.querySelector('#ptBtnDongTaoX')?.addEventListener('click', dong);
  div.querySelector('#ptBtnHuyTaoDirect')?.addEventListener('click', dong);

  // Điền nhanh mã và tên khi chọn từ danh sách gợi ý
  const goiYSelect = div.querySelector('#ptGoiYSelectModal');
  goiYSelect?.addEventListener('change', () => {
    const opt = goiYSelect.options[goiYSelect.selectedIndex];
    if (opt && opt.value) {
      const maInput = div.querySelector('#ptInputMaDirect');
      const tenInput = div.querySelector('#ptInputTenDirect');
      if (maInput) maInput.value = opt.value;
      if (tenInput) tenInput.value = opt.dataset.ten || '';
    }
  });

  // Gửi Form tạo thư mục
  const form = div.querySelector('#ptFormTaoThuMucDirect');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = div.querySelector('#ptBtnXacNhanTaoDirect');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Đang khởi tạo...';
    }
    const data = Object.fromEntries(new FormData(form));
    try {
      const res = await taoThuMucDongBo(data);
      showToast(`Đã khởi tạo thư mục bệnh nhân [${data.patientCode}] thành công!`);
      dong();
      if (res?.folder) {
        selectedFolder = res.folder;
      }
      await veLaiTrang();
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-check-line"></i> Khởi tạo thư mục';
      }
      showToast(err.message || 'Không thể tạo thư mục.', true);
    }
  });
}

/* ── DIALOG 2: Tải ảnh mới lên hồ sơ ─────────────────────────────────── */

function moModalUploadAnh() {
  if (!selectedFolder) {
    showToast('Vui lòng chọn một bệnh nhân ở danh sách bên trái trước.', true);
    return;
  }

  const currentProfile = store.getState().profile || {};
  const isDoc = currentProfile.role === 'bac_si';
  const defaultDoctorName = isDoc ? (currentProfile.full_name || '') : '';

  const existing = document.getElementById('ptModalUploadAnh');
  if (existing) existing.remove();

  let filesToUpload = [];

  const div = document.createElement('div');
  div.id = 'ptModalUploadAnh';
  div.className = 'system-dialog-layer is-open';
  div.innerHTML = `
    <div class="system-dialog-backdrop"></div>
    <section class="system-dialog-panel" style="max-width:540px; width:95%;">
      <header class="system-dialog-header">
        <span class="system-dialog-icon default" style="color:#087f7b;"><i class="ri-camera-lens-line"></i></span>
        <div>
          <p class="eyebrow">HỒ SƠ ĐIỆN TỬ · TẢI ẢNH LÂM SÀNG</p>
          <h3 style="margin:0;font-size:16px;color:#0f172a;">Tải / Chụp Ảnh Bệnh Nhân</h3>
        </div>
        <button class="icon-button system-dialog-close" type="button" id="ptBtnDongUploadX">×</button>
      </header>

      <form id="ptFormUploadDirect" style="display:flex;flex-direction:column;gap:12px;padding:4px 0 0;">
        <div style="background:#f0fdfa;border:1px solid #ccfbf1;padding:10px 14px;border-radius:8px;font-size:12px;color:#0f766e;line-height:1.4;">
          Đang tải vào: <b>[${escapeHTML(selectedFolder.patient_code)}] ${escapeHTML(selectedFolder.patient_name)}</b><br>
          Phụ tá thực hiện: <b>${escapeHTML(selectedFolder.assistant_name)}</b>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
            <span>Phân loại hình ảnh:</span>
            <select name="category" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;">
              ${Object.entries(LOAI_ANH).map(([k, v]) => `<option value="${k}">${escapeHTML(v)}</option>`).join('')}
            </select>
          </label>
          <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
            <span>Bác sĩ điều trị (tùy chọn):</span>
            <input name="doctorName" value="${escapeHTML(defaultDoctorName)}" placeholder="VD: BS. Quân" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;" />
          </label>
        </div>

        <!-- Khung chọn ảnh từ máy hoặc chụp từ camera -->
        <div style="border:2px dashed #087f7b;border-radius:12px;padding:18px 14px;text-align:center;background:#f8fafc;cursor:pointer;transition:all 0.15s;" id="ptDropZoneDirect">
          <div style="display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
            <button type="button" class="primary-button" id="ptBtnPickFiles" style="padding:7px 14px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;background:#087f7b;border-radius:7px;">
              <i class="ri-folder-image-line"></i> Tải ảnh từ máy / Thư viện
            </button>
            <button type="button" class="secondary-button" id="ptBtnCaptureCamera" style="padding:7px 14px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;background:#ffffff;border:1px solid #cbd5e1;border-radius:7px;color:#334155;">
              <i class="ri-camera-lens-line" style="color:#087f7b;"></i> Chụp ảnh trực tiếp
            </button>
          </div>
          <p style="font-size:12px;font-weight:500;color:#64748b;margin:0 0 2px;">
            Hoặc bấm vào ô này / kéo thả nhiều tệp ảnh vào đây
          </p>
          <small style="display:block;color:#94a3b8;font-size:11px;">
            Tự động nén WebP chuẩn y khoa trước khi lưu trữ · Cho phép chọn nhiều ảnh
          </small>

          <!-- Input 1: File picker chọn ảnh từ máy/thư viện (KHÔNG ép camera) -->
          <input type="file" id="ptFileInputDirect" multiple accept="image/*" style="display:none;" />
          <!-- Input 2: Chụp ảnh trực tiếp từ camera -->
          <input type="file" id="ptCameraInputDirect" accept="image/*" capture="environment" style="display:none;" />

          <div id="ptPreviewThumbsContainer" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;justify-content:center;"></div>
        </div>

        <label class="form-field" style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;">
          <span>Ghi chú lâm sàng:</span>
          <textarea name="notes" placeholder="VD: Mặt nhai răng 26 trước khi mài cùi..." rows="2" class="input" style="padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;resize:vertical;"></textarea>
        </label>

        <div id="ptUploadTienTrinhDirect" style="display:none;padding:10px;background:#f0fdfa;border:1px solid #ccfbf1;border-radius:8px;font-size:12px;color:#0f766e;text-align:center;">
          <i class="ri-loader-4-line ri-spin"></i> Đang nén WebP và lưu vào kho hồ sơ...
        </div>

        <footer class="system-dialog-actions" style="margin-top:8px;display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="secondary-button" id="ptBtnHuyUploadDirect">Hủy</button>
          <button type="submit" class="primary-button" id="ptBtnXacNhanUploadDirect" style="display:inline-flex;align-items:center;gap:6px;">
            <i class="ri-upload-2-line"></i> Bắt đầu lưu trữ
          </button>
        </footer>
      </form>
    </section>
  `;
  document.body.appendChild(div);
  document.body.classList.add('app-modal-open');

  const dong = () => {
    div.remove();
    document.body.classList.remove('app-modal-open');
  };

  div.querySelector('.system-dialog-backdrop')?.addEventListener('click', dong);
  div.querySelector('#ptBtnDongUploadX')?.addEventListener('click', dong);
  div.querySelector('#ptBtnHuyUploadDirect')?.addEventListener('click', dong);

  const dropZone = div.querySelector('#ptDropZoneDirect');
  const fileInput = div.querySelector('#ptFileInputDirect');
  const cameraInput = div.querySelector('#ptCameraInputDirect');
  const previewContainer = div.querySelector('#ptPreviewThumbsContainer');
  const btnPickFiles = div.querySelector('#ptBtnPickFiles');
  const btnCaptureCamera = div.querySelector('#ptBtnCaptureCamera');

  const renderThumbs = () => {
    if (!previewContainer) return;
    if (!filesToUpload.length) {
      previewContainer.innerHTML = '';
      return;
    }
    const totalSize = filesToUpload.reduce((s, f) => s + (f.size || 0), 0);
    previewContainer.innerHTML = `
      <div style="width:100%;font-size:11.5px;color:#0f766e;font-weight:600;margin-bottom:4px;text-align:left;">
        <i class="ri-check-line"></i> Đã chọn ${filesToUpload.length} ảnh (${doKb(totalSize)}):
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;width:100%;">
        ${filesToUpload.map((f, i) => `
          <div style="position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1;background:#0f172a;" title="${escapeHTML(f.name)} (${doKb(f.size)})">
            <img src="${URL.createObjectURL(f)}" alt="${escapeHTML(f.name)}" style="width:100%;height:100%;object-fit:cover;" />
            <button type="button" data-del-idx="${i}" style="position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(239,68,68,0.9);color:#fff;border:none;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;">×</button>
          </div>
        `).join('')}
      </div>
    `;

    previewContainer.querySelectorAll('[data-del-idx]').forEach((b) => {
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const idx = Number(b.dataset.delIdx);
        filesToUpload.splice(idx, 1);
        renderThumbs();
      });
    });
  };

  btnPickFiles?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    fileInput?.click();
  });

  btnCaptureCamera?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    cameraInput?.click();
  });

  dropZone?.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-del-idx]') && !ev.target.closest('#ptBtnPickFiles') && !ev.target.closest('#ptBtnCaptureCamera')) {
      fileInput?.click();
    }
  });

  fileInput?.addEventListener('change', () => {
    const picked = Array.from(fileInput.files || []);
    filesToUpload = [...filesToUpload, ...picked];
    renderThumbs();
    fileInput.value = '';
  });

  cameraInput?.addEventListener('change', () => {
    const picked = Array.from(cameraInput.files || []);
    filesToUpload = [...filesToUpload, ...picked];
    renderThumbs();
    cameraInput.value = '';
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#087f7b';
    dropZone.style.background = '#f0fdfa';
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '#087f7b';
    dropZone.style.background = '#f8fafc';
  });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#087f7b';
    dropZone.style.background = '#f8fafc';
    const dropped = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (dropped.length) {
      filesToUpload = [...filesToUpload, ...dropped];
      renderThumbs();
    }
  });

  const form = div.querySelector('#ptFormUploadDirect');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!filesToUpload.length) {
      showToast('Vui lòng chọn hoặc chụp ít nhất 1 ảnh.', true);
      return;
    }

    const btn = div.querySelector('#ptBtnXacNhanUploadDirect');
    const tienTrinh = div.querySelector('#ptUploadTienTrinhDirect');
    if (btn) btn.disabled = true;
    if (tienTrinh) tienTrinh.style.display = 'block';

    try {
      const compressedFiles = [];
      for (const file of filesToUpload) {
        try {
          const comp = await nenWebp(file);
          const base64 = String(comp.tep).split(',')[1];
          compressedFiles.push({
            name: `${file.name.replace(/\.[^/.]+$/, '')}.webp`,
            type: 'image/webp',
            data: base64,
          });
        } catch {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          compressedFiles.push({
            name: file.name,
            type: file.type || 'image/jpeg',
            data: base64,
          });
        }
      }

      const formData = Object.fromEntries(new FormData(form));
      await taiLenMediaPhuTa({
        patientCode: selectedFolder.patient_code,
        patientName: selectedFolder.patient_name,
        assistantName: selectedFolder.assistant_name,
        doctorName: formData.doctorName,
        category: formData.category,
        notes: formData.notes,
        files: compressedFiles,
      });

      showToast(`Đã lưu thành công ${compressedFiles.length} ảnh vào hồ sơ bệnh nhân!`);
      dong();
      folderMedia = await layMediaCuaKhach(selectedFolder.patient_code);
      await veLaiTrang();
    } catch (err) {
      if (btn) btn.disabled = false;
      if (tienTrinh) tienTrinh.style.display = 'none';
      showToast(err.message || 'Không thể tải ảnh lên.', true);
    }
  });
}

/* ── DIALOG 3: Xem ảnh phóng to (Lightbox) ───────────────────────────── */

function moModalXemAnh(media) {
  if (!media) return;
  const existing = document.getElementById('ptModalXemAnhLon');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'ptModalXemAnhLon';
  div.className = 'system-dialog-layer is-open';
  div.style.zIndex = '10050';
  div.innerHTML = `
    <div class="system-dialog-backdrop" style="background:rgba(0,0,0,0.92);backdrop-filter:blur(8px);"></div>
    <section class="system-dialog-panel" style="max-width:90vw;width:auto;max-height:92vh;padding:12px;background:#0f172a;border:1px solid #334155;border-radius:12px;display:flex;flex-direction:column;align-items:center;">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;color:#fff;margin-bottom:8px;padding:0 4px;">
        <span style="font-size:13px;font-weight:600;">${escapeHTML(media.file_name)} · <span style="color:#38bdf8;">${escapeHTML(LOAI_ANH[media.category] || media.category)}</span></span>
        <button type="button" class="icon-button system-dialog-close" id="ptBtnDongXemX" style="color:#fff;font-size:24px;background:none;border:none;cursor:pointer;">×</button>
      </div>
      <div style="flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;">
        <img src="/api/v2/media/view/${escapeHTML(media.id)}" alt="${escapeHTML(media.file_name)}" style="max-width:86vw;max-height:78vh;object-fit:contain;border-radius:6px;" />
      </div>
      <div style="color:#94a3b8;font-size:11px;margin-top:8px;display:flex;gap:16px;align-items:center;">
        <span>Phụ tá: <b>${escapeHTML(media.assistant_name || 'Phụ tá')}</b></span>
        <span>Dung lượng: <b>${doKb(Number(media.file_size || 0))}</b></span>
        <span>Thời gian: <b>${new Date(media.created_at).toLocaleString('vi-VN')}</b></span>
      </div>
    </section>
  `;
  document.body.appendChild(div);
  document.body.classList.add('app-modal-open');

  const dong = () => {
    div.remove();
    document.body.classList.remove('app-modal-open');
  };

  div.querySelector('.system-dialog-backdrop')?.addEventListener('click', dong);
  div.querySelector('#ptBtnDongXemX')?.addEventListener('click', dong);
}

/* ── DIALOG 4: Lịch sử thao tác ảnh ─────────────────────────────────── */

async function moModalAudit(mediaId) {
  const existing = document.getElementById('ptModalAuditLog');
  if (existing) existing.remove();

  let logs = [];
  try {
    const res = await layNhatKyKiemToan({ patientCode: selectedFolder?.patient_code });
    if (mediaId) {
      logs = (res?.logs || []).filter((l) => String(l.media_id) === String(mediaId));
    } else {
      logs = res?.logs || [];
    }
  } catch {
    showToast('Không thể đọc lịch sử thao tác.', true);
    return;
  }

  const titleText = mediaId
    ? 'Lịch Sử Thao Tác Ảnh Này'
    : `Lịch Sử Kiểm Tra Hồ Sơ [${escapeHTML(selectedFolder?.patient_code || '')}]`;

  const div = document.createElement('div');
  div.id = 'ptModalAuditLog';
  div.className = 'system-dialog-layer is-open';
  div.innerHTML = `
    <div class="system-dialog-backdrop"></div>
    <section class="system-dialog-panel" style="max-width:560px;width:95%;">
      <header class="system-dialog-header">
        <span class="system-dialog-icon default" style="color:#087f7b;"><i class="ri-history-line"></i></span>
        <div>
          <p class="eyebrow">HỒ SƠ ĐIỆN TỬ · NHẬT KÝ KIỂM TOÁN</p>
          <h3 style="margin:0;font-size:16px;color:#0f172a;">${titleText}</h3>
        </div>
        <button class="icon-button system-dialog-close" type="button" id="ptBtnDongAuditX">×</button>
      </header>

      <div style="padding:10px 0;max-height:60vh;overflow-y:auto;">
        ${!logs.length ? `
          <p style="text-align:center;color:#94a3b8;margin:20px 0;font-size:13px;">Chưa có lượt truy cập nào được ghi nhận.</p>
        ` : `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${logs.map((l) => `
              <div style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
                  <strong>${escapeHTML(l.actor_name)} (${escapeHTML(l.actor_code)})</strong>
                  <span class="pill" style="font-size:10px;">${escapeHTML(l.action)}</span>
                </div>
                <div style="font-size:11px;color:#64748b;">
                  ${new Date(l.created_at).toLocaleString('vi-VN')} · IP: <code>${escapeHTML(l.client_ip || 'Internal')}</code>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <footer class="system-dialog-actions" style="margin-top:8px;">
        <button type="button" class="secondary-button" id="ptBtnDongAuditBtn">Đóng</button>
      </footer>
    </section>
  `;
  document.body.appendChild(div);
  document.body.classList.add('app-modal-open');

  const dong = () => {
    div.remove();
    document.body.classList.remove('app-modal-open');
  };

  div.querySelector('.system-dialog-backdrop')?.addEventListener('click', dong);
  div.querySelector('#ptBtnDongAuditX')?.addEventListener('click', dong);
  div.querySelector('#ptBtnDongAuditBtn')?.addEventListener('click', dong);
}

/* ── Xử lý tương tác giao diện (EventListeners) ─────────────────────── */

export function initView() {
  // Chuyển Tab
  document.querySelectorAll('[data-pt-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeTab = btn.dataset.ptTab;
      await veLaiTrang();
    });
  });

  // Chọn Phụ tá (Admin-IT)
  document.getElementById('ptFilterAssistantSelect')?.addEventListener('change', async (e) => {
    filterAssistant = e.target.value;
    selectedFolder = null;
    await veLaiTrang();
  });

  // Chọn Chi nhánh (Admin-IT)
  document.getElementById('ptFilterBranchSelect')?.addEventListener('change', async (e) => {
    filterBranch = e.target.value;
    selectedFolder = null;
    await veLaiTrang();
  });

  // Bỏ lọc Admin-IT (Reset)
  document.getElementById('ptBtnResetAdminFilter')?.addEventListener('click', async () => {
    filterAssistant = '';
    filterBranch = '';
    selectedFolder = null;
    await veLaiTrang();
  });

  // Mở Modal Tạo Thư Mục (Nút trên Header, Nút Sidebar + Thêm, hoặc Canvas trống)
  document.getElementById('ptBtnMoModalTao')?.addEventListener('click', moModalTaoThuMuc);
  document.getElementById('ptBtnSidebarTaoMoi')?.addEventListener('click', moModalTaoThuMuc);
  document.getElementById('ptBtnTaoTuEmpty')?.addEventListener('click', moModalTaoThuMuc);

  // Kiểm tra vết (Audit) của toàn bộ hồ sơ đang chọn
  document.getElementById('ptBtnKiemTraAudit')?.addEventListener('click', () => {
    if (selectedFolder) moModalAudit(null);
  });

  // Xóa thư mục bệnh nhân đang xem
  document.getElementById('ptBtnXoaThuMucHienTai')?.addEventListener('click', async () => {
    if (!selectedFolder) return;
    const ok = await confirmAction(
      `Bạn có chắc chắn muốn xóa thư mục bệnh nhân [${selectedFolder.patient_code}] ${selectedFolder.patient_name} không? Thao tác này sẽ được lưu lại trong nhật ký an ninh.`,
      {
        title: 'Xóa thư mục bệnh nhân',
        confirmText: 'Xác nhận xóa',
        tone: 'danger',
      },
    );
    if (!ok) return;

    try {
      await xoaThuMucPhuTa(selectedFolder.id);
      showToast(`Đã xóa thư mục bệnh nhân [${selectedFolder.patient_code}] thành công.`);
      selectedFolder = null;
      await veLaiTrang();
    } catch (err) {
      showToast(err.message || 'Không thể xóa thư mục.', true);
    }
  });

  // Xóa thư mục từ nút thùng rác ở từng mục bên cột trái
  document.querySelectorAll('[data-pt-xoa-folder]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fId = btn.dataset.ptXoaFolder;
      const target = folders.find((f) => String(f.id) === String(fId));
      if (!target) return;

      const ok = await confirmAction(
        `Bạn có chắc chắn muốn xóa thư mục bệnh nhân [${target.patient_code}] ${target.patient_name} không?`,
        {
          title: 'Xóa thư mục bệnh nhân',
          confirmText: 'Xóa ngay',
          tone: 'danger',
        },
      );
      if (!ok) return;

      try {
        await xoaThuMucPhuTa(target.id);
        showToast(`Đã xóa thư mục [${target.patient_code}] thành công.`);
        if (selectedFolder && String(selectedFolder.id) === String(target.id)) {
          selectedFolder = null;
        }
        await veLaiTrang();
      } catch (err) {
        showToast(err.message || 'Không thể xóa thư mục.', true);
      }
    });
  });

  // Tìm kiếm thư mục bệnh nhân
  let searchTimeout = null;
  document.getElementById('ptSearchFolderInput')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      filterSearch = e.target.value.trim();
      await veLaiTrang();
    }, 300);
  });

  // Chọn thư mục để xem ảnh
  document.querySelectorAll('.ptd-folder-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      if (e.target.closest('[data-pt-xoa-folder]')) return;
      const fId = item.dataset.folderId;
      selectedFolder = folders.find((f) => String(f.id) === String(fId));
      selectedCategory = '';
      await veLaiTrang();
    });
  });

  // Bộ lọc danh mục ảnh
  document.querySelectorAll('[data-cat-filter]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      selectedCategory = chip.dataset.catFilter;
      await veLaiTrang();
    });
  });

  // Mở Modal Upload Ảnh
  document.getElementById('ptBtnTaiAnhVaoThuMuc')?.addEventListener('click', moModalUploadAnh);
  document.getElementById('ptBtnTaiAnhRong')?.addEventListener('click', moModalUploadAnh);

  // Xem ảnh lớn (Lightbox)
  document.querySelectorAll('[data-pt-xem]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.ptXem;
      const media = folderMedia.find((m) => String(m.id) === String(id));
      if (media) moModalXemAnh(media);
    });
  });

  // Xóa ảnh
  document.querySelectorAll('[data-pt-xoa]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.ptXoa;
      const ok = await confirmAction('Bạn có chắc muốn xóa ảnh này khỏi hồ sơ?', {
        title: 'Xóa ảnh lâm sàng',
        confirmText: 'Xóa ảnh',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await xoaMediaAnh(id);
        showToast('Đã xóa ảnh thành công.');
        folderMedia = folderMedia.filter((m) => String(m.id) !== String(id));
        await veLaiTrang();
      } catch (err) {
        showToast(err.message || 'Không thể xóa ảnh.', true);
      }
    });
  });

  // Xem kiểm toán ảnh
  document.querySelectorAll('[data-pt-audit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.ptAudit;
      moModalAudit(id);
    });
  });

  // Lọc Audit tab
  document.getElementById('ptAuditFilterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    filterAction = data.action || '';
    filterDateFrom = data.dateFrom || '';
    filterDateTo = data.dateTo || '';
    auditPage = 1;
    await veLaiTrang();
  });
  document.getElementById('ptBtnResetAuditFilter')?.addEventListener('click', async () => {
    filterAction = '';
    filterDateFrom = '';
    filterDateTo = '';
    auditPage = 1;
    await veLaiTrang();
  });
}
