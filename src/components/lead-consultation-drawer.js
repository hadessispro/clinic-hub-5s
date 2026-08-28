import { addTelesaleCallLog, getLeadCallLogs, updateMarketingLead } from '../services/marketing.js';
import { CALL_STATUS, LEAD_STATUS, LOW_QUALITY_REASONS } from '../constants.js';
import { escapeHTML, formatDateTime, tenNguoiPhuTrach } from '../utils.js';
import { showToast } from './toast.js';
import { store } from '../store.js';
import { leadStatusTone } from './shared.js';

const branchName = (id) => id === 'le-van-tho'
  ? '5S Lê Văn Thọ'
  : id === 'pham-van-chieu' ? '5S Phạm Văn Chiêu' : (id || 'Chưa xác định');
const safe = (value, fallback = 'Chưa cập nhật') => escapeHTML(String(value ?? '').trim() || fallback);

export function leadConsultationDrawer() {
  return `<aside id="leadConsultationDrawer" class="lead-dossier-drawer lead-consultation-drawer" hidden aria-hidden="true">
    <button type="button" class="lead-dossier-backdrop" data-close-lead-consultation aria-label="Đóng trình tư vấn"></button>
    <section class="lead-dossier-sheet" role="dialog" aria-modal="true" aria-labelledby="leadConsultationTitle" tabindex="-1">
      <button type="button" class="lead-dossier-close" data-close-lead-consultation aria-label="Đóng">×</button>
      <div id="leadConsultationContent" class="lead-dossier-loading"><i class="ri-loader-4-line"></i><span>Đang tải hồ sơ...</span></div>
    </section>
  </aside>`;
}

function facts(lead) {
  const customer = lead.customer_profile || {};
  const appointment = lead.appointment_at || lead.appointment_date || customer.appointmentText;
  const lowQualityReason = lead.low_quality_reason || customer.lowQualityReason;
  return `<div class="lead-dossier-head">
    <span class="lead-dossier-eyebrow">TRÌNH TƯ VẤN KHÁCH HÀNG</span>
    <h3 id="leadConsultationTitle">${safe(lead.full_name || customer.customerName, 'Khách hàng')}</h3>
    <p>${safe(lead.phone || customer.phone, 'Chưa có số điện thoại')} · ${safe(branchName(lead.branch_id || customer.arrivalBranch))}</p>
    <span class="lead-dossier-status status-pill lead-status ${leadStatusTone(lead.status)}" data-consultation-current-status>${safe(LEAD_STATUS[lead.status] || lead.status, 'Mới tiếp nhận')}</span>
  </div>
  <div class="lead-dossier-facts">
    <div><small>Mã hồ sơ</small><strong>${safe(customer.customerCode || lead.id)}</strong></div>
    <div><small>Dịch vụ quan tâm</small><strong>${safe(lead.service_interest || customer.serviceNeed)}</strong></div>
    <div><small>Nguồn tiếp nhận</small><strong>${safe(lead.created_by_name || customer.pgName || lead.source)}</strong></div>
    <div><small>Lịch hẹn</small><strong>${appointment ? safe(String(appointment).includes('T') ? formatDateTime(appointment) : appointment) : 'Chưa có lịch hẹn'}</strong></div>
    ${lead.status === 'low_quality' ? `<div class="full"><small>Lý do khách KCL</small><strong>${safe(LOW_QUALITY_REASONS[lowQualityReason] || lowQualityReason)}</strong></div>` : ''}
  </div>`;
}

function historyHtml(logs) {
  if (!logs.length) return '<div class="tsm-empty">Chưa có nhật ký chăm sóc. Hãy tạo lượt tư vấn đầu tiên bên dưới.</div>';
  const legacyLabels = {
    gift_voucher: 'Đổi quà / Voucher', pg_create: 'PG tiếp nhận khách hàng',
    tele_assign: 'Phân công Telesale', tele_assign_specific: 'Phân công Telesale',
    tele_assign_specific_cb: 'Phân công chăm sóc cơ bản', tele_assign_specific_cs: 'Phân công chăm sóc chuyên sâu',
    tele_save_all: 'Cập nhật chăm sóc', tele_update: 'Cập nhật chăm sóc',
    tele_bulk_update: 'Cập nhật hàng loạt', arrival_confirm: 'Xác nhận khách đến',
    arrival_unconfirm: 'Hủy xác nhận khách đến', sheet_update: 'Cập nhật dữ liệu nguồn',
  };
  return `<div class="lead-timeline">${logs.map((log) => {
    const label = CALL_STATUS[log.call_status] || legacyLabels[log.call_status] || log.call_status;
    const icon = log.event_category === 'gift' ? 'ri-gift-line' : log.is_legacy ? 'ri-history-line' : 'ri-phone-line';
    return `<article class="${log.is_legacy ? 'is-legacy-event' : ''}">
    <i class="${icon}"></i>
    <div><strong>${safe(label, 'Đã liên hệ')}</strong>
      <p>${safe(log.note, 'Không có ghi chú')}</p>
      ${log.appointment_at || log.appointment_date ? `<p><i class="ri-calendar-check-line"></i> Hẹn: ${safe(formatDateTime(log.appointment_at || log.appointment_date))}</p>` : ''}
      <time>${safe(tenNguoiPhuTrach(log.telesale_name, log.telesale_code || log.telesale_id, log.is_legacy ? 'Dữ liệu lịch sử' : 'Người chăm sóc'))} · ${log.created_at ? safe(formatDateTime(log.created_at)) : 'Chưa rõ thời gian'}${log.is_legacy ? ' · Đã nhập từ hệ thống cũ' : ''}</time>
    </div>
  </article>`;
  }).join('')}</div>`;
}

function consultationForm(lead) {
  const lowQualityReason = lead.low_quality_reason || lead.customer_profile?.lowQualityReason || '';
  const callStatusByLeadStatus = {
    new: 'not_consulted',
    contacted: 'not_appointment_booked',
    appointment_booked: 'appointment_booked',
    cancelled: 'rejected',
  };
  const currentCallStatus = callStatusByLeadStatus[lead.status] || 'interested';
  return `<section class="lead-dossier-section lead-consultation-form-section">
    <div class="lead-dossier-section-title"><h4>Cập nhật tư vấn</h4><span>Lưu ngay vào hồ sơ khách hàng</span></div>
    <form id="leadConsultationForm" class="lead-dossier-form" data-lead-id="${safe(lead.id)}">
      <label>Trạng thái khách hàng
        <select name="status" required>${Object.entries(LEAD_STATUS).map(([value, label]) => `<option value="${escapeHTML(value)}" ${lead.status === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select>
      </label>
      <label>Kết quả tư vấn
        <select name="call_status" required>${Object.entries(CALL_STATUS).map(([value, label]) => `<option value="${escapeHTML(value)}" ${currentCallStatus === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select>
      </label>
      <label class="full" data-consultation-appointment hidden>Ngày giờ hẹn khám
        <input type="datetime-local" name="appointment_date">
      </label>
      <label class="full" data-consultation-low-quality hidden>Lý do khách không chất lượng (KCL)
        <select name="low_quality_reason">
          <option value="">Chọn lý do KCL</option>
          ${Object.entries(LOW_QUALITY_REASONS).map(([value, label]) => `<option value="${escapeHTML(value)}" ${lowQualityReason === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}
        </select>
        <small>Áp dụng cho thuê bao, sai số điện thoại, nhầm máy hoặc dữ liệu không thể chăm sóc.</small>
      </label>
      <label class="full">Nội dung tư vấn
        <textarea name="note" required placeholder="Ghi rõ nội dung trao đổi, nhu cầu và bước chăm sóc tiếp theo..."></textarea>
      </label>
      <button type="submit" class="primary-button full"><i class="ri-save-3-line"></i> Lưu tư vấn và cập nhật trạng thái</button>
    </form>
  </section>`;
}

export function initLeadConsultationDrawer({ getLead, onSaved } = {}) {
  const drawer = document.getElementById('leadConsultationDrawer');
  const content = document.getElementById('leadConsultationContent');
  if (!drawer || !content) return;
  let activeLead = null;
  let closeTimer = null;

  const close = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('has-open-drawer');
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      drawer.hidden = true;
      window.dispatchEvent(new CustomEvent('clinic:overlay-closed', { detail: { overlay: 'lead-consultation' } }));
    }, 220);
  };

  const wireForm = () => {
    const form = document.getElementById('leadConsultationForm');
    if (!form || !activeLead) return;
    const callStatus = form.elements.call_status;
    const customerStatus = form.elements.status;
    const appointmentWrap = form.querySelector('[data-consultation-appointment]');
    const appointment = form.elements.appointment_date;
    const lowQualityWrap = form.querySelector('[data-consultation-low-quality]');
    const lowQualityReason = form.elements.low_quality_reason;
    const syncAppointment = () => {
      const isAppointment = callStatus.value === 'appointment_booked';
      appointmentWrap.hidden = !isAppointment;
      appointment.required = isAppointment;
      if (!isAppointment) appointment.value = '';
    };
    const syncLowQualityReason = () => {
      const isLowQuality = customerStatus.value === 'low_quality';
      lowQualityWrap.hidden = !isLowQuality;
      lowQualityReason.required = isLowQuality;
      if (!isLowQuality) lowQualityReason.value = '';
    };
    const syncCustomerStatus = () => {
      const statusByResult = {
        not_consulted: 'new',
        not_appointment_booked: 'contacted',
        interested: 'contacted',
        appointment_booked: 'appointment_booked',
        busy: 'contacted',
        no_answer: 'contacted',
        rejected: 'cancelled',
      };
      customerStatus.value = statusByResult[callStatus.value] || customerStatus.value;
      syncAppointment();
      syncLowQualityReason();
    };
    callStatus.addEventListener('change', syncCustomerStatus);
    customerStatus.addEventListener('change', syncLowQualityReason);
    syncAppointment();
    syncLowQualityReason();
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const data = Object.fromEntries(new FormData(form).entries());
      submit.disabled = true;
      try {
        const profile = store.getState().profile || {};
        await addTelesaleCallLog({
          lead_id: activeLead.id,
          telesale_id: profile.employee_code || profile.id,
          call_status: data.call_status,
          note: data.note,
          appointment_date: data.appointment_date ? new Date(data.appointment_date).toISOString() : null,
        });
        const updated = await updateMarketingLead(activeLead.id, {
          status: data.status,
          notes: data.note,
          low_quality_reason: data.status === 'low_quality' ? data.low_quality_reason : null,
        });
        activeLead = {
          ...activeLead,
          ...(updated || {}),
          status: data.status,
          notes: data.note,
          low_quality_reason: data.status === 'low_quality' ? data.low_quality_reason : null,
        };
        const currentStatus = content.querySelector('[data-consultation-current-status]');
        if (currentStatus) {
          currentStatus.textContent = LEAD_STATUS[data.status] || data.status;
          currentStatus.className = `lead-dossier-status status-pill lead-status ${leadStatusTone(data.status)}`;
        }
        const logs = await getLeadCallLogs(activeLead.id);
        const history = content.querySelector('[data-consultation-history]');
        if (history) history.innerHTML = historyHtml(logs);
        form.elements.note.value = '';
        showToast('Đã lưu tư vấn và cập nhật trạng thái khách hàng.');
        onSaved?.(activeLead);
      } catch (error) {
        showToast(error.message || 'Không thể lưu nội dung tư vấn.', true);
      } finally { submit.disabled = false; }
    });
  };

  const open = async (lead) => {
    if (!lead) { showToast('Không tìm thấy hồ sơ khách hàng.', true); return; }
    activeLead = lead;
    clearTimeout(closeTimer);
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('has-open-drawer');
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    drawer.querySelector('.lead-dossier-sheet')?.focus();
    content.innerHTML = `${facts(lead)}
      <section class="lead-dossier-section"><div class="lead-dossier-section-title"><h4>Lịch sử chăm sóc</h4><span>Toàn bộ lượt tư vấn đã lưu</span></div><div data-consultation-history><div class="lead-dossier-loading"><i class="ri-loader-4-line"></i><span>Đang tải lịch sử...</span></div></div></section>
      ${consultationForm(lead)}`;
    wireForm();
    try {
      const logs = await getLeadCallLogs(lead.id);
      const history = content.querySelector('[data-consultation-history]');
      if (history) history.innerHTML = historyHtml(logs);
    } catch (error) {
      const history = content.querySelector('[data-consultation-history]');
      if (history) history.innerHTML = `<div class="tsm-empty">${safe(error.message, 'Không thể tải lịch sử chăm sóc.')}</div>`;
    }
  };

  drawer.querySelectorAll('[data-close-lead-consultation]').forEach((button) => button.addEventListener('click', close));
  drawer.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  document.querySelectorAll('[data-open-lead-consultation]').forEach((button) => button.addEventListener('click', () => open(getLead?.(button.dataset.openLeadConsultation))));
}
