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
    created_by_name: row.created_by_name || row.customer_profile?.pgName || null,
    created_by_role: row.created_by_role || null,
  };
}

async function vpsRequest(path, options = {}) {
  return supabase.request(`/marketing${path}`, options);
}

const pendingPgSiteDeletes = new Map();

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
    if (filters.pg_unhandled_only) query.set('pgUnassignedOnly', 'true');
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
    notifyDataChange('marketing_leads');
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
      notifyDataChange('marketing_leads');
      return mapVpsLead(payload.data);
    }
    const payload = await vpsRequest(`/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ status: updates.status, notes: updates.notes }),
    });
    notifyDataChange('marketing_leads');
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
    notifyDataChange('marketing_leads');
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
  if (useVps) {
    const payload = await vpsRequest(`/leads/${encodeURIComponent(leadId)}/calls`);
    return payload.data || [];
  }
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
  if (useVps) return [];
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
  if (useVps) throw new Error('Quản lý chiến dịch chưa được bật trên VPS.');
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
    notifyDataChange('marketing_leads');
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
  notifyDataChange('marketing_leads');
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

/**
 * Danh sách lead có phân trang cho màn điều hành Telesale.
 * Backend hiện trả tối đa 5.000 bản ghi; việc lọc ngày và chia trang được thực
 * hiện tại client để tương thích với dữ liệu hiện hữu mà không đổi schema.
 */
export async function getMarketingLeadPage(filters = {}) {
  const leads = await getMarketingLeads({
    status: filters.status,
    assigned_telesale_id: filters.assigned_telesale_id,
    data_class: filters.data_class,
    net_level: filters.net_level,
    pg_unhandled_only: filters.pg_unhandled_only,
  });
  const from = filters.date_from ? new Date(`${filters.date_from}T00:00:00+07:00`) : null;
  const to = filters.date_to ? new Date(`${filters.date_to}T23:59:59.999+07:00`) : null;
  const filtered = leads.filter((lead) => {
    if (filters.pg_unhandled_only && !(lead.created_by_role === 'pg_staff' && !lead.assigned_telesale_id)) return false;
    if (!from && !to) return true;
    const created = new Date(lead.created_at || 0);
    if (Number.isNaN(created.getTime())) return false;
    return (!from || created >= from) && (!to || created <= to);
  });
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(filters.page_size || 50)));
  const start = (page - 1) * pageSize;
  return {
    data: filtered.slice(start, start + pageSize),
    meta: { page, pageSize, total: filtered.length },
  };
}

/** Tổng hợp nhanh theo ngày cho Quản lý Telesale. */
export async function getTelesaleDailySummary(reportDate) {
  const [accounts, leads] = await Promise.all([getTelesaleAccounts(), getMarketingLeads()]);
  const day = String(reportDate || '').trim();
  const isSameDay = (value) => {
    if (!value || !day) return false;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)) === day;
  };
  const closed = new Set(['converted', 'cancelled', 'lost']);
  const visited = new Set(['arrived', 'visited', 'converted']);
  const staff = accounts.filter((item) => item.active !== false && ['telesale_staff', 'telesale_leader'].includes(item.role)).map((member) => {
    const owned = leads.filter((lead) => lead.assigned_telesale_id === member.employee_code);
    const changed = owned.filter((lead) => isSameDay(lead.updated_at));
    return {
      ...member,
      full_name: member.name,
      assigned_total: owned.length,
      assigned_active: owned.filter((lead) => !closed.has(lead.status)).length,
      handled_today: changed.length,
      status_changes_today: changed.length,
      calls_today: 0,
      appointments_today: changed.filter((lead) => lead.status === 'appointment_booked').length,
      visited_today: changed.filter((lead) => visited.has(lead.status)).length,
    };
  });
  const totals = staff.reduce((sum, row) => {
    for (const key of ['assigned_total', 'assigned_active', 'handled_today', 'status_changes_today', 'calls_today', 'appointments_today', 'visited_today']) {
      sum[key] = (sum[key] || 0) + Number(row[key] || 0);
    }
    return sum;
  }, {});
  return { date: day, totals, staff };
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

export async function searchPgLocations(query) {
  const value = String(query || '').trim();
  if (value.length < 3) throw new Error('Nhập ít nhất 3 ký tự để tìm vị trí.');
  const payload = await vpsRequest(`/pg-location-search?q=${encodeURIComponent(value)}`);
  return payload.data || [];
}

export async function createPgSite(input) {
  const payload = await vpsRequest('/pg-sites', { method: 'POST', body: JSON.stringify(input) });
  return payload.data;
}

export async function updatePgSite(id, input) {
  const payload = await vpsRequest(`/pg-sites/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  return payload.data;
}

export function deletePgSite(id) {
  const key = String(id || '').trim();
  if (!key) return Promise.reject(new Error('Thiếu mã địa điểm chấm công.'));
  if (pendingPgSiteDeletes.has(key)) return pendingPgSiteDeletes.get(key);

  const request = vpsRequest(`/pg-sites/${encodeURIComponent(key)}`, { method: 'DELETE' })
    .then((payload) => payload.data)
    .finally(() => pendingPgSiteDeletes.delete(key));
  pendingPgSiteDeletes.set(key, request);
  return request;
}

export async function getPgAssignments(date) {
  const payload = await vpsRequest(`/pg-assignments${date ? `?date=${encodeURIComponent(date)}` : ''}`);
  return payload.data || [];
}

export async function createPgAssignment(input) {
  const payload = await vpsRequest('/pg-assignments', { method: 'POST', body: JSON.stringify(input) });
  return payload.data;
}

export async function deletePgAssignment(id) {
  const payload = await vpsRequest(`/pg-assignments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return payload.data;
}

export async function getPgLocationSuggestions() { return (await vpsRequest('/pg-location-suggestions')).data || []; }
export async function createPgLocationSuggestion(input) { return (await vpsRequest('/pg-location-suggestions', { method: 'POST', body: JSON.stringify(input) })).data; }
export async function reviewPgLocationSuggestion(id, decision, note = '') { return (await vpsRequest(`/pg-location-suggestions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ decision, note }) })).data; }
export async function getPgSupportRequests() { return (await vpsRequest('/pg-support-requests')).data || []; }
export async function createPgSupportRequest(input) { return (await vpsRequest('/pg-support-requests', { method: 'POST', body: JSON.stringify(input) })).data; }
export async function actionPgSupportRequest(id, action, note = '') { return (await vpsRequest(`/pg-support-requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action, note }) })).data; }

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
  if (useVps) {
    let stopped = false;
    let fingerprint = '';
    let timer = null;
    const poll = async () => {
      if (stopped) return;
      try {
        const leads = await getMarketingLeads();
        const next = leads.map((lead) => `${lead.id}:${lead.updated_at || lead.created_at}:${lead.status}:${lead.assigned_telesale_id || ''}`).join('|');
        if (fingerprint && next !== fingerprint && callback) callback({ type: 'marketing_leads', source: 'vps-poll' });
        fingerprint = next;
      } catch (error) {
        console.warn('[Marketing Realtime] VPS polling error:', error?.message || error);
      } finally {
        if (!stopped) timer = window.setTimeout(poll, document.hidden ? 15000 : 5000);
      }
    };
    const handleUpdate = (event) => callback?.(event.detail);
    const handleVisibility = () => { if (!document.hidden && !stopped) { clearTimeout(timer); poll(); } };
    window.addEventListener('clinic_data_updated', handleUpdate);
    document.addEventListener('visibilitychange', handleVisibility);
    poll();
    return () => {
      stopped = true; clearTimeout(timer);
      window.removeEventListener('clinic_data_updated', handleUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }
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
