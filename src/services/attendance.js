import { supabase } from '../supabase.js';
import { requestSheetSync } from './sheet-sync.js';

const QUEUE_PREFIX = '5s_attendance_queue_v2';

export function mapAttendanceToUI(db) {
  if (!db) return null;
  return {
    id: db.id,
    clientEventId: db.client_event_id,
    employee: db.employee_code,
    shift: db.shift_code || 'clinic-0800',
    type: db.record_type,
    date: db.work_date,
    time: db.recorded_at,
    lat: Number(db.lat || 0),
    lng: Number(db.lng || 0),
    distance: Number(db.distance_m || 0),
    accuracy: Number(db.accuracy_m || 0),
    status: db.status || 'valid',
    deviceId: db.device_id || '',
    capturedOffline: !!db.captured_offline,
    syncedAt: db.synced_at || null,
    proofUrl: db.proof_url || '',
  };
}

function isNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return !navigator.onLine
    || error instanceof TypeError
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('load failed')
    || error?.status === 0;
}

function queueKey(userId) {
  return userId ? `${QUEUE_PREFIX}:${userId}` : null;
}

function readQueue(userId) {
  const key = queueKey(userId);
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[Attendance] Invalid offline queue:', error);
    return [];
  }
}

/** Ban ghi con cho gui len may chu. */
export function getOfflineQueue(userId) {
  return readQueue(userId).filter((item) => !item.rejectedAt);
}

/**
 * Ban ghi may chu da tu choi vinh vien: ngoai ban kinh, GPS qua kem, khong co
 * ca hop le. Gui lai bao nhieu lan cung hong, nen phai tach ra de nhan vien
 * thay ly do va bao quan ly bo sung cong thu cong.
 */
export function getRejectedQueue(userId) {
  return readQueue(userId).filter((item) => !!item.rejectedAt);
}

export function discardRejectedAttendance(userId) {
  const remaining = getOfflineQueue(userId);
  writeOfflineQueue(userId, remaining);
  return remaining;
}

function writeOfflineQueue(userId, queue) {
  const key = queueKey(userId);
  if (!key) throw new Error('Không xác định được tài khoản đang chấm công.');
  localStorage.setItem(key, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('clinic:attendance-queue', { detail: { count: queue.length } }));
}

function saveToOfflineQueue(record, userId) {
  const queue = readQueue(userId);
  const duplicate = queue.find((item) =>
    item.clientEventId === record.clientEventId
    || (item.employee === record.employee && item.date === record.date && item.type === record.type)
  );
  if (duplicate) return duplicate;

  const localRecord = {
    ...record,
    id: `offline-${record.clientEventId}`,
    capturedOffline: true,
    isOfflinePending: true,
    queuedAt: new Date().toISOString(),
  };
  writeOfflineQueue(userId, [...queue, localRecord]);
  return localRecord;
}

async function submitToAttendanceApi(record) {
  if (supabase.isLocal) {
    const payload = await supabase.request('/attendance-record', { method: 'POST', body: JSON.stringify(record) });
    if (!payload.data) throw new Error('Máy chủ không trả về bản ghi chấm công.');
    return payload.data;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/api/attendance-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(record),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Không thể ghi nhận chấm công.');
    if (!payload.data) throw new Error('Máy chủ không trả về bản ghi chấm công.');
    return payload.data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Kết nối chấm công quá 20 giây. Dữ liệu sẽ được giữ an toàn và tự đồng bộ lại.');
      timeoutError.status = 0;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function submitCheckIn(record) {
  const row = await submitToAttendanceApi(record);
  await requestSheetSync().catch((syncError) => {
    console.warn('[Attendance] Check-in saved; Google Sheet sync will retry:', syncError);
  });
  return mapAttendanceToUI(row);
}

async function submitCheckOut(record) {
  const row = await submitToAttendanceApi(record);
  await requestSheetSync().catch((syncError) => {
    console.warn('[Attendance] Check-out saved; Google Sheet sync will retry:', syncError);
  });
  return mapAttendanceToUI(row);
}

async function submitAttendance(record) {
  return record.type === 'checkout' ? submitCheckOut(record) : submitCheckIn(record);
}

export async function clockIn(record, userId) {
  if (!record?.clientEventId || !record?.employee || !record?.date) {
    throw new Error('Dữ liệu chấm công chưa đầy đủ.');
  }
  if (!navigator.onLine) return saveToOfflineQueue(record, userId);

  try {
    return await submitCheckIn(record);
  } catch (error) {
    if (isNetworkError(error)) return saveToOfflineQueue(record, userId);
    throw error;
  }
}

export async function clockOut(record, userId) {
  const hasValidGps = Number.isFinite(Number(record?.lat))
    && Number.isFinite(Number(record?.lng))
    && Number(record?.accuracy) > 0;
  if (!record?.clientEventId || !record?.employee || !record?.date || record.type !== 'checkout' || !hasValidGps) {
    throw new Error('Dữ liệu kết ca chưa đầy đủ.');
  }
  if (!navigator.onLine) return saveToOfflineQueue(record, userId);

  try {
    return await submitCheckOut(record);
  } catch (error) {
    if (isNetworkError(error)) return saveToOfflineQueue(record, userId);
    throw error;
  }
}

export async function getAttendance(filters = {}) {
  let query = supabase.from('attendance_records').select('*');
  if (filters.employee) query = query.eq('employee_code', filters.employee);
  if (filters.date) query = query.eq('work_date', filters.date);

  const { data, error } = await query
    .order('recorded_at', { ascending: false })
    .limit(Number(filters.limit || 200));
  if (error) throw error;
  return (data || []).map(mapAttendanceToUI);
}

export async function checkTodayAttendance(employeeCode, workDate) {
  if (!employeeCode || !workDate) return [];
  return getAttendance({ employee: employeeCode, date: workDate, limit: 10 });
}

export async function syncOfflineAttendance(userId) {
  let activeUserId = userId;
  if (!activeUserId) {
    const { data } = await supabase.auth.getSession();
    activeUserId = data.session?.user?.id;
  }
  const empty = { synced: 0, rejected: 0, pending: 0 };
  if (!activeUserId || !navigator.onLine) return empty;

  const stored = readQueue(activeUserId);
  const alreadyRejected = stored.filter((item) => item.rejectedAt);
  const queue = stored.filter((item) => !item.rejectedAt);
  if (!queue.length) return { ...empty, rejected: alreadyRejected.length };

  let synced = 0;
  const remaining = [];
  for (let index = 0; index < queue.length; index += 1) {
    const record = queue[index];
    try {
      await submitAttendance({ ...record, capturedOffline: true });
      synced += 1;
    } catch (error) {
      console.error('[Attendance] Offline sync failed:', error);
      if (isNetworkError(error)) {
        // Mang chap chon: giu nguyen ban ghi nay va toan bo phan con lai.
        remaining.push(record, ...queue.slice(index + 1));
        break;
      }
      // May chu tu choi vi ban than ban ghi sai. Thu lai cung se hong y het,
      // nen danh dau de dung vong lap gui lai vo han moi lan co mang.
      remaining.push({
        ...record,
        rejectedAt: new Date().toISOString(),
        syncError: String(error?.message || 'May chu tu choi luot cham cong nay.'),
      });
    }
  }

  const nextQueue = [...alreadyRejected, ...remaining];
  writeOfflineQueue(activeUserId, nextQueue);
  return {
    synced,
    rejected: nextQueue.filter((item) => item.rejectedAt).length,
    pending: nextQueue.filter((item) => !item.rejectedAt).length,
  };
}
