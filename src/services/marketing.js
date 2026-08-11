import { supabase } from '../supabase.js';

const useVps = Boolean(supabase?.isLocal && supabase?.request);

function mapVpsLead(row) {
  if (!row) return row;
  return {
    ...row,
    full_name: row.customer_name,
    appointment_date: row.appointment_at,
    service_interest: row.service_type,
    assigned_telesale_id: row.assigned_telesale_code,
    created_by_pg: row.created_by_pg_code,
  };
}

async function vpsRequest(path, options = {}) {
  return supabase.request(`/marketing${path}`, options);
}

// Local storage fallback key for demo/offline resilience
const LEADS_STORAGE_KEY = 'clinic_hub_marketing_leads';
const CALL_LOGS_STORAGE_KEY = 'clinic_hub_telesale_call_logs';
const CAMPAIGNS_STORAGE_KEY = 'clinic_hub_marketing_campaigns';

function getLocalData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setLocalData(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.error('[Marketing Service] localStorage save error:', err);
  }
}

// Default Seed Data for Demo & Initial Testing
const SEED_LEADS = [
  { id: 'lead-001', full_name: 'Nguyễn Văn Hải', phone: '0908123456', email: 'hai.nguyen@gmail.com', source: 'Facebook Ads', campaign_name: 'ImplantThang8', branch_id: 'le-van-tho', service_interest: 'Trồng răng Implant', status: 'new', assigned_telesale_id: 'PVC-TS01', notes: 'Quan tâm cấy 1 răng hàm dưới', created_at: new Date(Date.now() - 3600000 * 4).toISOString() },
  { id: 'lead-002', full_name: 'Trần Thị Thu Hà', phone: '0912987654', email: 'thuha92@yahoo.com', source: 'Google Ads', campaign_name: 'NiengRangDep', branch_id: 'pham-van-chieu', service_interest: 'Niềng răng trong suốt', status: 'contacted', assigned_telesale_id: 'PVC-TS01', notes: 'Hỏi giá niềng trong suốt Invisalign', created_at: new Date(Date.now() - 3600000 * 24).toISOString() },
  { id: 'lead-003', full_name: 'Lê Hoàng Nam', phone: '0983112233', email: 'hoangnam@gmail.com', source: 'Zalo OA', campaign_name: 'TayTrangRang', branch_id: 'le-van-tho', service_interest: 'Tẩy trắng răng Laser', status: 'appointment_booked', assigned_telesale_id: 'PVC-TS02', notes: 'Đã chốt lịch hẹn 15:00 ngày mai', created_at: new Date(Date.now() - 3600000 * 48).toISOString() },
  { id: 'lead-004', full_name: 'Phạm Minh Phụng', phone: '0937445566', email: 'phung.pm@gmail.com', source: 'TikTok Ads', campaign_name: 'BocSu2026', branch_id: 'pham-van-chieu', service_interest: 'Bọc răng sứ Zirconia', status: 'converted', assigned_telesale_id: 'PVC-TS02', notes: 'Đã đến khám và cọc làm 4 răng sứ', created_at: new Date(Date.now() - 3600000 * 72).toISOString() },
];

const SEED_CAMPAIGNS = [
  { id: 'camp-001', name: 'ImplantThang8', channel: 'Facebook', budget: 15000000, spent: 11200000, leads_count: 45, appointments_count: 18, start_date: '2026-08-01', end_date: '2026-08-31', status: 'active' },
  { id: 'camp-002', name: 'NiengRangDep', channel: 'Google', budget: 20000000, spent: 18500000, leads_count: 62, appointments_count: 24, start_date: '2026-08-01', end_date: '2026-08-31', status: 'active' },
  { id: 'camp-003', name: 'TayTrangRang', channel: 'Zalo', budget: 8000000, spent: 6500000, leads_count: 28, appointments_count: 12, start_date: '2026-08-05', end_date: '2026-08-25', status: 'active' },
];

/** Fetch all Marketing Leads */
export async function getMarketingLeads(filters = {}) {
  if (useVps) {
    const query = new URLSearchParams();
    if (filters.branch_id) query.set('branchId', filters.branch_id);
    if (filters.status) query.set('status', filters.status);
    if (filters.assigned_telesale_id) query.set('assignedTo', filters.assigned_telesale_id);
    if (filters.data_class) query.set('dataClass', filters.data_class);
    if (filters.net_level) query.set('netLevel', filters.net_level);
    const payload = await vpsRequest(`/leads${query.size ? `?${query}` : ''}`);
    return (payload.data || []).map(mapVpsLead);
  }
  try {
    let query = supabase.from('marketing_leads').select('*').order('created_at', { ascending: false });
    if (filters.branch_id) query = query.eq('branch_id', filters.branch_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.assigned_telesale_id) query = query.eq('assigned_telesale_id', filters.assigned_telesale_id);

    const { data, error } = await query;
    if (error || !data || data.length === 0) {
      const local = getLocalData(LEADS_STORAGE_KEY, SEED_LEADS);
      setLocalData(LEADS_STORAGE_KEY, local);
      return local.filter(l => {
        if (filters.branch_id && l.branch_id !== filters.branch_id) return false;
        if (filters.status && l.status !== filters.status) return false;
        if (filters.assigned_telesale_id && l.assigned_telesale_id !== filters.assigned_telesale_id) return false;
        return true;
      });
    }
    return data;
  } catch (err) {
    console.warn('[Marketing Service] Fetching leads fallback to local:', err);
    return getLocalData(LEADS_STORAGE_KEY, SEED_LEADS);
  }
}

/** Create a new Lead */
export async function createMarketingLead(leadData) {
  if (useVps) {
    const payload = await vpsRequest('/leads', {
      method: 'POST',
      body: JSON.stringify({
        customerName: leadData.customerName || leadData.full_name,
        phone: leadData.phone,
        appointmentAt: leadData.appointmentAt || leadData.appointment_at,
        dataClass: leadData.dataClass || leadData.data_class || 'raw',
        netLevel: leadData.netLevel || leadData.net_level || null,
        serviceType: leadData.serviceType || leadData.service_interest,
        source: leadData.source || 'PG',
        branchId: leadData.branchId || leadData.branch_id,
        notes: leadData.notes,
      }),
    });
    return mapVpsLead(payload.data);
  }
  const newLead = {
    id: `lead-${Date.now()}`,
    full_name: leadData.full_name,
    phone: leadData.phone,
    email: leadData.email || '',
    source: leadData.source || 'Facebook Ads',
    campaign_name: leadData.campaign_name || 'Chiến dịch MKT',
    branch_id: leadData.branch_id || 'le-van-tho',
    service_interest: leadData.service_interest || 'Tư vấn tổng quát',
    status: 'new',
    assigned_telesale_id: leadData.assigned_telesale_id || null,
    notes: leadData.notes || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('marketing_leads').insert([newLead]).select().single();
    notifyDataChange('marketing_leads');
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Marketing Service] DB insert error, using local fallback:', err);
    const local = getLocalData(LEADS_STORAGE_KEY, SEED_LEADS);
    local.unshift(newLead);
    setLocalData(LEADS_STORAGE_KEY, local);
    notifyDataChange('marketing_leads');
    return newLead;
  }
}

/** Update Lead status or assigned telesale */
export async function updateMarketingLead(id, updates) {
  if (useVps) {
    if (updates.assigned_telesale_id) {
      const payload = await vpsRequest(`/leads/${encodeURIComponent(id)}/assign-net`, {
        method: 'POST', body: JSON.stringify({ telesaleCode: updates.assigned_telesale_id }),
      });
      return mapVpsLead(payload.data);
    }
    const payload = await vpsRequest(`/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ status: updates.status, notes: updates.notes }),
    });
    return mapVpsLead(payload.data);
  }
  try {
    const { data, error } = await supabase.from('marketing_leads').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    notifyDataChange('marketing_leads');
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('[Marketing Service] DB update fallback to local:', err);
    const local = getLocalData(LEADS_STORAGE_KEY, SEED_LEADS);
    const idx = local.findIndex(l => l.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...updates, updated_at: new Date().toISOString() };
      setLocalData(LEADS_STORAGE_KEY, local);
      notifyDataChange('marketing_leads');
      return local[idx];
    }
    return null;
  }
}

/** Add a Telesale Call Log */
export async function addTelesaleCallLog(logData) {
  if (useVps) {
    const payload = await vpsRequest(`/leads/${encodeURIComponent(logData.lead_id)}/calls`, {
      method: 'POST', body: JSON.stringify({
        callStatus: logData.call_status, note: logData.note, appointmentAt: logData.appointment_date,
      }),
    });
    return payload.data;
  }
  const newLog = {
    id: `log-${Date.now()}`,
    lead_id: logData.lead_id,
    telesale_id: logData.telesale_id,
    call_status: logData.call_status,
    note: logData.note || '',
    appointment_date: logData.appointment_date || null,
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('telesale_call_logs').insert([newLog]).select().single();
    if (error) throw error;
    
    // Auto update lead status
    let leadStatus = 'contacted';
    if (logData.call_status === 'appointment_booked') leadStatus = 'appointment_booked';
    else if (logData.call_status === 'rejected') leadStatus = 'cancelled';
    await updateMarketingLead(logData.lead_id, { status: leadStatus });
    
    return data;
  } catch (err) {
    console.warn('[Marketing Service] Call log DB insert error, using local:', err);
    const logs = getLocalData(CALL_LOGS_STORAGE_KEY, []);
    logs.unshift(newLog);
    setLocalData(CALL_LOGS_STORAGE_KEY, logs);

    let leadStatus = 'contacted';
    if (logData.call_status === 'appointment_booked') leadStatus = 'appointment_booked';
    else if (logData.call_status === 'rejected') leadStatus = 'cancelled';
    await updateMarketingLead(logData.lead_id, { status: leadStatus });

    return newLog;
  }
}

/** Fetch Call Logs for a Lead */
export async function getLeadCallLogs(leadId) {
  try {
    const { data, error } = await supabase.from('telesale_call_logs').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    if (error || !data) throw error;
    return data;
  } catch {
    const logs = getLocalData(CALL_LOGS_STORAGE_KEY, []);
    return logs.filter(l => l.lead_id === leadId);
  }
}

/** Fetch Marketing Campaigns */
export async function getMarketingCampaigns() {
  try {
    const { data, error } = await supabase.from('marketing_campaigns').select('*').order('created_at', { ascending: false });
    if (error || !data || data.length === 0) return getLocalData(CAMPAIGNS_STORAGE_KEY, SEED_CAMPAIGNS);
    return data;
  } catch {
    return getLocalData(CAMPAIGNS_STORAGE_KEY, SEED_CAMPAIGNS);
  }
}

/** Create Marketing Campaign */
export async function createMarketingCampaign(campData) {
  const newCamp = {
    id: `camp-${Date.now()}`,
    name: campData.name,
    channel: campData.channel || 'Facebook',
    budget: Number(campData.budget || 0),
    spent: Number(campData.spent || 0),
    leads_count: 0,
    appointments_count: 0,
    start_date: campData.start_date || new Date().toISOString().split('T')[0],
    end_date: campData.end_date || null,
    status: 'active',
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('marketing_campaigns').insert([newCamp]).select().single();
    if (error) throw error;
    return data;
  } catch {
    const camps = getLocalData(CAMPAIGNS_STORAGE_KEY, SEED_CAMPAIGNS);
    camps.unshift(newCamp);
    setLocalData(CAMPAIGNS_STORAGE_KEY, camps);
    return newCamp;
  }
}

/** Export Marketing Leads data to Excel (CSV with UTF-8 BOM) */
export function exportLeadsToCSV(leads, filename = 'Danh_sach_Lead_Marketing.csv') {
  if (!leads || !leads.length) {
    return false;
  }

  const headers = [
    'STT',
    'Họ tên khách hàng',
    'Số điện thoại',
    'Nguồn Lead',
    'Dịch vụ quan tâm',
    'Chi nhánh đăng ký',
    'Mã Telesale phụ trách',
    'Trạng thái',
    'Ghi chú nhu cầu',
    'Thời gian nạp Lead'
  ];

  const statusMap = {
    new: 'Mới nạp',
    contacted: 'Đã liên hệ',
    appointment_booked: 'Đã hẹn khám',
    converted: 'Chốt thành công',
    cancelled: 'Hủy/Thất bại'
  };

  const rows = leads.map((l, index) => [
    index + 1,
    `"${(l.full_name || '').replace(/"/g, '""')}"`,
    `"${(l.phone || '').replace(/"/g, '""')}"`,
    `"${(l.source || '').replace(/"/g, '""')}"`,
    `"${(l.service_interest || '').replace(/"/g, '""')}"`,
    `"${l.branch_id === 'le-van-tho' ? '5S Lê Văn Thọ' : '5S Phạm Văn Chiêu'}"`,
    `"${(l.assigned_telesale_id || 'Chưa gán').replace(/"/g, '""')}"`,
    `"${(statusMap[l.status] || l.status || '').replace(/"/g, '""')}"`,
    `"${(l.notes || '').replace(/"/g, '""')}"`,
    `"${new Date(l.created_at || Date.now()).toLocaleString('vi-VN')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

/** Delete a Marketing Lead */
export async function deleteMarketingLead(leadId) {
  if (useVps) {
    const payload = await vpsRequest(`/leads/${encodeURIComponent(leadId)}`, { method: 'DELETE' });
    return Boolean(payload.data?.deleted);
  }
  try {
    const { error } = await supabase.from('marketing_leads').delete().eq('id', leadId);
    if (error) console.warn('[Marketing Service] Supabase delete error:', error);
  } catch (err) {
    console.warn('[Marketing Service] deleteLead fallback to local:', err);
  }
  const leads = getLocalData(LEADS_STORAGE_KEY, SEED_LEADS);
  const updated = leads.filter(l => l.id !== leadId);
  setLocalData(LEADS_STORAGE_KEY, updated);
  notifyDataChange('marketing_leads');
  return true;
}

export async function distributeRawLeads(quantity) {
  if (!useVps) throw new Error('Chức năng chia data thô chỉ khả dụng trên VPS.');
  const payload = await vpsRequest('/leads/distribute-raw', {
    method: 'POST', body: JSON.stringify({ quantity: Number(quantity || 0) }),
  });
  return payload.data;
}

export async function getMarketingReports() {
  if (!useVps) return { totals: {}, pg: [], telesale: [] };
  const payload = await vpsRequest('/reports');
  return payload.data;
}

export async function getPgAccounts() {
  if (!useVps) return [];
  const payload = await vpsRequest('/pg-accounts');
  return payload.data || [];
}

export async function getTelesaleAccounts() {
  if (!useVps) return [];
  const payload = await vpsRequest('/telesale-accounts');
  return (payload.data || []).map((row) => ({
    id: row.employee_code, employee_code: row.employee_code, name: row.full_name, role: row.role, active: row.active,
  }));
}

export async function createPgAccount(input) {
  const payload = await vpsRequest('/pg-accounts', { method: 'POST', body: JSON.stringify(input) });
  return payload.data;
}

export async function updatePgAccount(code, input) {
  const payload = await vpsRequest(`/pg-accounts/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(input) });
  return payload.data;
}

export async function deletePgAccount(code) {
  const payload = await vpsRequest(`/pg-accounts/${encodeURIComponent(code)}`, { method: 'DELETE' });
  return payload.data;
}

export async function getPgSites() {
  const payload = await vpsRequest('/pg-sites');
  return payload.data || [];
}

export async function createPgSite(input) {
  const payload = await vpsRequest('/pg-sites', { method: 'POST', body: JSON.stringify(input) });
  return payload.data;
}

export async function getPgAssignments(date) {
  const payload = await vpsRequest(`/pg-assignments${date ? `?date=${encodeURIComponent(date)}` : ''}`);
  return payload.data || [];
}

export async function createPgAssignment(input) {
  const payload = await vpsRequest('/pg-assignments', { method: 'POST', body: JSON.stringify(input) });
  return payload.data;
}

export async function recordPgAttendance(input) {
  const payload = await vpsRequest('/pg-attendance', { method: 'POST', body: JSON.stringify(input) });
  return payload.data;
}

export async function getPgAttendance(from, to) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const payload = await vpsRequest(`/pg-attendance${query.size ? `?${query}` : ''}`);
  return payload.data || [];
}

export async function exportPgAttendanceCsv(from, to) {
  const rows = await getPgAttendance(from, to);
  const headers = ['Mã PG', 'Ngày', 'Loại', 'Thời gian', 'Địa điểm', 'Địa chỉ', 'Khoảng cách (m)', 'Sai số GPS (m)', 'Trạng thái'];
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row) => [row.pg_code, row.work_date, row.record_type, row.recorded_at, row.site_name, row.address, row.distance_m, row.accuracy_m, row.status].map(cell).join(','));
  const blob = new Blob(['\uFEFF' + [headers.map(cell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Cham_cong_PG_${from || 'tu-ngay'}_${to || 'den-ngay'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  return rows.length;
}

const broadcastChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('clinic_hub_realtime_channel') : null;

if (broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    console.log('[Realtime Broadcast] Received event:', event.data);
    window.dispatchEvent(new CustomEvent('clinic_data_updated', { detail: event.data }));
  };
}

export function notifyDataChange(type = 'marketing_leads') {
  window.dispatchEvent(new CustomEvent('clinic_data_updated', { detail: { type } }));
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({ type, timestamp: Date.now() });
    } catch (err) {
      console.warn('[Realtime Broadcast] Error posting message:', err);
    }
  }
}

export function subscribeToRealtime(callback) {
  const channel = supabase
    .channel('public_realtime_leads')
    .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
      console.log('[Supabase Realtime] Change detected:', payload);
      notifyDataChange(payload.table || 'marketing_leads');
      if (callback) callback(payload);
    })
    .subscribe();

  const handleUpdate = (e) => {
    if (callback) callback(e.detail);
  };
  window.addEventListener('clinic_data_updated', handleUpdate);

  return () => {
    supabase.removeChannel(channel);
    window.removeEventListener('clinic_data_updated', handleUpdate);
  };
}
