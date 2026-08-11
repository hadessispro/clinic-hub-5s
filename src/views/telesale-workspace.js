import { getMarketingLeads, addTelesaleCallLog, getLeadCallLogs, exportLeadsToCSV } from '../services/marketing.js';
import { LEAD_STATUS, CALL_STATUS } from '../constants.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { pill, statusPill, option, emptyState } from '../components/shared.js';
import { showToast } from '../components/toast.js';
import { store } from '../store.js';

let cachedLeads = [];

export async function renderView(state) {
  const profile = store.getState().profile || {};
  const isLeaderOrAdmin = ['admin', 'admin_marketing', 'telesale_leader'].includes(profile.role);
  
  // Filter leads assigned to current telesale staff, or all leads if leader/admin
  const filters = isLeaderOrAdmin ? {} : { assigned_telesale_id: profile.employee_code || profile.id };
  const leads = await getMarketingLeads(filters);
  cachedLeads = leads;

  const leadsListHtml = leads.length
    ? leads.map((lead) => {
        return `
          <article class="task-card telesale-lead-card" data-name="${escapeHTML(lead.full_name).toLowerCase()}" data-phone="${escapeHTML(lead.phone)}" data-status="${escapeHTML(lead.status)}" data-branch="${escapeHTML(lead.branch_id)}" style="border-left: 4px solid var(--teal); background:#ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border-radius:12px; padding:16px;">
            <div class="section-title" style="margin-bottom:8px;">
              <h4 style="font-size:1.05rem; font-weight:700; color:#1d2421;">${escapeHTML(lead.full_name)}</h4>
              ${statusPill(LEAD_STATUS[lead.status] || lead.status, lead.status === 'converted' ? 'approved' : lead.status === 'cancelled' ? 'rejected' : 'pending')}
            </div>
            <div class="task-meta" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px;">
              ${pill(`<i class="ri-phone-line" style="color:var(--teal-dark); margin-right:4px;"></i>${escapeHTML(lead.phone)}`, true)}
              ${pill(lead.source)}
              ${pill(lead.data_class === 'net' ? `Data net ${lead.net_level === 'advanced' ? 'chuyên sâu' : 'cơ bản'}` : 'Data thô')}
              ${pill(lead.service_interest)}
              ${pill(lead.branch_id === 'le-van-tho' ? '5S Lê Văn Thọ' : '5S Phạm Văn Chiêu')}
            </div>
            <p class="subtle" style="margin:8px 0; font-size:0.86rem; color:#49544e;"><strong>Ghi chú nhu cầu:</strong> ${escapeHTML(lead.notes || 'Không có')}</p>
            <button type="button" class="secondary-button" data-view-call-logs="${escapeHTML(lead.id)}" data-lead-name="${escapeHTML(lead.full_name)}" style="width:100%;justify-content:center;margin-top:4px"><i class="ri-history-line"></i> Xem lịch sử chăm sóc</button>
            <div style="margin-top:12px; padding:12px; background:#f2f7f5; border-radius:10px; border:1px solid #d8e6e1; width:100%; box-sizing:border-box;">
              <strong style="font-size:0.84rem; color:var(--teal-dark); display:block; margin-bottom:8px;">+ Nhập Nhật ký cuộc gọi mới:</strong>
              <form class="call-log-form" data-lead-id="${escapeHTML(lead.id)}" style="display:flex; flex-direction:column; gap:8px; width:100%; box-sizing:border-box;">
                <div style="display:flex; flex-direction:column; gap:8px; width:100%; box-sizing:border-box;">
                  <div style="width:100%; box-sizing:border-box;">
                    <label style="font-size:0.75rem; font-weight:600; color:#374151; display:block; margin-bottom:3px;">Trạng thái cuộc gọi</label>
                    <select name="call_status" required style="width:100%; box-sizing:border-box; font-size:0.83rem; padding:8px 10px; border-radius:8px; border:1px solid #bce0d6; background:#fff; font-family:inherit; color:#1d2421;">
                      ${Object.keys(CALL_STATUS).map(st => option(st, CALL_STATUS[st])).join('')}
                    </select>
                  </div>
                  <div style="width:100%; box-sizing:border-box;">
                    <label style="font-size:0.75rem; font-weight:600; color:#374151; display:block; margin-bottom:3px;">Lịch hẹn khám (nếu có)</label>
                    <input name="appointment_date" type="datetime-local" style="width:100%; box-sizing:border-box; font-size:0.83rem; padding:8px 10px; border-radius:8px; border:1px solid #bce0d6; background:#fff; font-family:inherit; color:#1d2421;" />
                  </div>
                </div>
                <div style="width:100%; box-sizing:border-box;">
                  <label style="font-size:0.75rem; font-weight:600; color:#374151; display:block; margin-bottom:3px;">Nội dung tư vấn</label>
                  <input name="note" placeholder="Nội dung trao đổi với khách..." required style="width:100%; box-sizing:border-box; font-size:0.84rem; padding:8px 10px; border-radius:8px; border:1px solid #bce0d6; background:#fff; font-family:inherit;" />
                </div>
                <button type="submit" class="primary-button" style="width:100%; box-sizing:border-box; min-height:38px; padding:0 14px; font-size:0.84rem; display:inline-flex; align-items:center; justify-content:center; gap:6px; margin-top:4px;">
                  <i class="ri-phone-fill"></i>
                  Lưu cuộc gọi & Đặt hẹn
                </button>
              </form>
            </div>
          </article>
        `;
      }).join('')
    : emptyState();

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Telesale Workspace</p>
        <h3>Bàn làm việc Telesale: Gọi điện tư vấn, nhập nhật ký và chốt lịch hẹn khám.</h3>
      </div>
    </div>

    <section class="panel">
      <div class="section-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <h3 style="margin:0;">Danh sách Lead cần chăm sóc (${leads.length})</h3>
          <span style="font-size:0.8rem; color:#64748b;">${isLeaderOrAdmin ? "Toàn bộ Lead" : "Lead cá nhân được gán"}</span>
        </div>
        ${isLeaderOrAdmin ? `
          <button type="button" id="btnExportTelesaleCSV" class="primary-button" style="background:#107c41; color:#ffffff; border:0; font-size:0.82rem; padding:6px 14px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; min-height:34px; cursor:pointer; font-weight:600;">
            <i class="ri-file-excel-2-line" style="font-size:1.05rem;"></i> Xuất Data Excel (CSV)
          </button>
        ` : ''}
      </div>

      <!-- Filter Toolbar -->
      <div style="margin-top:12px; padding:10px 14px; background:#f1f5f9; border-radius:10px; display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
        <div style="flex:1; min-width:220px; display:flex; align-items:center;">
          <input id="searchTelesaleInput" placeholder="🔍 Tìm theo Tên hoặc Số điện thoại..." style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 12px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none;" />
        </div>
        <div style="min-width:160px; display:flex; align-items:center;">
          <select id="filterTelesaleStatus" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none; cursor:pointer; font-weight:600;">
            <option value="">Tất cả Trạng thái</option>
            <option value="new">Mới nạp</option>
            <option value="contacted">Đã liên hệ</option>
            <option value="appointment_booked">Đã hẹn khám</option>
            <option value="converted">Chốt thành công</option>
            <option value="cancelled">Hủy/Thất bại</option>
          </select>
        </div>
        <div style="min-width:160px; display:flex; align-items:center;">
          <select id="filterTelesaleBranch" style="width:100%; height:38px; box-sizing:border-box; font-size:0.83rem; padding:0 10px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; outline:none; cursor:pointer; font-weight:600;">
            <option value="">Tất cả Chi nhánh</option>
            <option value="le-van-tho">5S Lê Văn Thọ</option>
            <option value="pham-van-chieu">5S Phạm Văn Chiêu</option>
          </select>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap:14px; margin-top:12px;">
        ${leadsListHtml}
      </div>
    </section>
    <dialog id="callHistoryDialog" class="app-dialog"><div class="dialog-card"><div class="section-title"><div><p class="eyebrow">LỊCH SỬ CHĂM SÓC</p><h3 id="callHistoryTitle">Khách hàng</h3></div><button type="button" class="icon-button" id="closeCallHistory" aria-label="Đóng">×</button></div><div id="callHistoryContent" class="call-history-list"></div></div></dialog>
  `;
}

export function initView() {
  const profile = store.getState().profile || {};

  const btnExport = document.getElementById('btnExportTelesaleCSV');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      if (!cachedLeads || !cachedLeads.length) {
        showToast("Không có dữ liệu Lead để xuất!", true);
        return;
      }
      exportLeadsToCSV(cachedLeads, 'Bao_cao_Telesale_Lead.csv');
      showToast("✅ Đã xuất báo cáo Telesale sang file Excel (CSV) thành công!");
    });
  }

  // Filter toolbar logic
  const searchInput = document.getElementById('searchTelesaleInput');
  const statusSelect = document.getElementById('filterTelesaleStatus');
  const branchSelect = document.getElementById('filterTelesaleBranch');

  function applyTelesaleFilters() {
    const q = (searchInput?.value || '').trim().toLowerCase();
    const st = statusSelect?.value || '';
    const br = branchSelect?.value || '';

    document.querySelectorAll('.telesale-lead-card').forEach(card => {
      const name = card.dataset.name || '';
      const phone = card.dataset.phone || '';
      const cardStatus = card.dataset.status || '';
      const cardBranch = card.dataset.branch || '';

      const matchQ = !q || name.includes(q) || phone.includes(q);
      const matchSt = !st || cardStatus === st;
      const matchBr = !br || cardBranch === br;

      card.style.display = (matchQ && matchSt && matchBr) ? 'block' : 'none';
    });
  }

  if (searchInput) searchInput.addEventListener('input', applyTelesaleFilters);
  if (statusSelect) statusSelect.addEventListener('change', applyTelesaleFilters);
  if (branchSelect) branchSelect.addEventListener('change', applyTelesaleFilters);

  const historyDialog = document.getElementById('callHistoryDialog');
  const historyContent = document.getElementById('callHistoryContent');
  document.getElementById('closeCallHistory')?.addEventListener('click', () => historyDialog?.close());
  document.querySelectorAll('[data-view-call-logs]').forEach((button) => button.addEventListener('click', async () => {
    if (!historyDialog || !historyContent) return;
    document.getElementById('callHistoryTitle').textContent = button.dataset.leadName || 'Khách hàng';
    historyContent.innerHTML = '<p class="subtle">Đang tải lịch sử...</p>'; historyDialog.showModal();
    try {
      const logs = await getLeadCallLogs(button.dataset.viewCallLogs);
      historyContent.innerHTML = logs.length ? logs.map((log) => `<article><div><strong>${escapeHTML(CALL_STATUS[log.call_status] || log.call_status)}</strong><time>${formatDateTime(log.created_at)}</time></div><p>${escapeHTML(log.note || 'Không có ghi chú')}</p>${log.appointment_at ? `<small>Lịch hẹn: ${formatDateTime(log.appointment_at)}</small>` : ''}</article>`).join('') : '<div class="empty-state"><strong>Chưa có lịch sử gọi</strong><p>Nhật ký sẽ xuất hiện sau lần chăm sóc đầu tiên.</p></div>';
    } catch (error) { historyContent.innerHTML = `<p class="subtle">${escapeHTML(error.message || 'Không tải được lịch sử.')}</p>`; }
  }));

  document.querySelectorAll('.call-log-form').forEach(form => {
    const callStatus = form.elements.call_status;
    const appointment = form.elements.appointment_date;
    const syncAppointmentRequirement = () => {
      const required = callStatus?.value === 'appointment_booked';
      if (appointment) appointment.required = required;
    };
    callStatus?.addEventListener('change', syncAppointmentRequirement);
    syncAppointmentRequirement();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const lead_id = form.dataset.leadId;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      try {
        showToast("Đang lưu cuộc gọi...");
        await addTelesaleCallLog({
          lead_id,
          telesale_id: profile.employee_code || profile.id || 'PVC-TS01',
          call_status: data.call_status,
          note: data.note,
          appointment_date: data.appointment_date ? new Date(data.appointment_date).toISOString() : null
        });
        showToast("✅ Đã lưu nhật ký cuộc gọi và cập nhật trạng thái Lead thành công!");
        form.reset();
      } catch (err) {
        showToast("Lỗi khi lưu cuộc gọi: " + err.message, true);
      }
    });
  });
}
