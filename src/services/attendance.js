import { dataClient } from '../data-client.js';

const QUEUE_PREFIX = '5s_attendance_queue_v2';

export function mapAttendanceToUI(db) {
  if (!db) return null;
  const noteBranch = String(db.note || '').match(/\[BRANCH:([^\]]+)\]/i)?.[1] || '';
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
    branchId: db.branch_id || noteBranch,
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
  const payload = await dataClient.request('/attendance-record', { method: 'POST', body: JSON.stringify(record) });
  if (!payload.data) throw new Error('Máy chủ không trả về bản ghi chấm công.');
  return payload.data;
}

async function submitCheckIn(record) {
  const row = await submitToAttendanceApi(record);
  return mapAttendanceToUI(row);
}

async function submitCheckOut(record) {
  const row = await submitToAttendanceApi(record);
  return mapAttendanceToUI(row);
}

export async function getAttendanceWorkSummary(month, employeeCode = '') {
  const params = new URLSearchParams();
  const m = String(month || '').trim();
  if (m) params.set('month', m);
  const emp = String(employeeCode || '').trim();
  if (emp) params.set('employeeCode', emp);
  const q = params.toString();
  return dataClient.request(`/attendance-work${q ? '?' + q : ''}`);
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
  let query = dataClient.from('attendance_records').select('*');
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
    const { data } = await dataClient.auth.getSession();
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

/**
 * Điều chỉnh & Bổ sung công nhân viên (Dành cho Quản lý / Admin / HR)
 * Hỗ trợ tạo mới hoặc cập nhật giờ vào, giờ ra, ca làm việc, chi nhánh, lý do điều chỉnh.
 */
export async function adjustAttendanceRecord({
  employeeCode,
  workDate,
  branchId = 'le-van-tho',
  shiftCode = 'clinic-0800',
  checkinTime = '',
  checkoutTime = '',
  reason = 'Điều chỉnh bởi Quản trị viên',
  note = '',
}) {
  if (!employeeCode || !workDate) {
    throw new Error('Vui lòng chọn nhân viên và ngày cần điều chỉnh công.');
  }

  const fullNote = `[ĐIỀU CHỈNH QUẢN LÝ: ${reason}] ${note || ''}`.trim();

  // 1. Tìm bản ghi chấm công hiện có của ngày này
  const { data: existingRecords, error: fetchErr } = await dataClient
    .from('attendance_records')
    .select('*')
    .eq('employee_code', employeeCode)
    .eq('work_date', workDate);

  if (fetchErr) {
    console.warn('[Attendance] Lỗi truy vấn bản ghi cũ:', fetchErr);
  }

  const existingIn = (existingRecords || []).find((r) => r.record_type === 'checkin');
  const existingOut = (existingRecords || []).find((r) => r.record_type === 'checkout');

  // 2. Xử lý Giờ Vào (checkin)
  if (checkinTime) {
    const timeStr = checkinTime.length === 5 ? `${checkinTime}:00` : checkinTime;
    const recordedAt = `${workDate}T${timeStr}+07:00`;
    if (existingIn?.id) {
      await dataClient.from('attendance_records').update({
        recorded_at: recordedAt,
        shift_code: shiftCode,
        branch_id: branchId,
        status: 'valid',
        note: fullNote,
        updated_at: new Date().toISOString(),
      }).eq('id', existingIn.id);
    } else {
      const id = globalThis.crypto?.randomUUID?.() || `adj-in-${Date.now()}`;
      await dataClient.from('attendance_records').insert({
        id,
        client_event_id: id,
        employee_code: employeeCode,
        work_date: workDate,
        record_type: 'checkin',
        shift_code: shiftCode,
        branch_id: branchId,
        recorded_at: recordedAt,
        distance_m: 0,
        accuracy_m: 10,
        status: 'valid',
        note: fullNote,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } else if (existingIn?.id) {
    await dataClient.from('attendance_records').delete().eq('id', existingIn.id);
  }

  // 3. Xử lý Giờ Ra (checkout)
  if (checkoutTime) {
    const timeStr = checkoutTime.length === 5 ? `${checkoutTime}:00` : checkoutTime;
    const recordedAt = `${workDate}T${timeStr}+07:00`;
    if (existingOut?.id) {
      await dataClient.from('attendance_records').update({
        recorded_at: recordedAt,
        shift_code: shiftCode,
        branch_id: branchId,
        status: 'valid',
        note: fullNote,
        updated_at: new Date().toISOString(),
      }).eq('id', existingOut.id);
    } else {
      const id = globalThis.crypto?.randomUUID?.() || `adj-out-${Date.now()}`;
      await dataClient.from('attendance_records').insert({
        id,
        client_event_id: id,
        employee_code: employeeCode,
        work_date: workDate,
        record_type: 'checkout',
        shift_code: shiftCode,
        branch_id: branchId,
        recorded_at: recordedAt,
        distance_m: 0,
        accuracy_m: 10,
        status: 'valid',
        note: fullNote,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  } else if (existingOut?.id) {
    await dataClient.from('attendance_records').delete().eq('id', existingOut.id);
  }

  // 4. Đồng bộ ca làm việc vào schedule_assignments nếu có
  try {
    const { data: assignments } = await dataClient
      .from('schedule_assignments')
      .select('*')
      .eq('employee_code', employeeCode)
      .eq('work_date', workDate);
    if (assignments && assignments.length > 0) {
      await dataClient.from('schedule_assignments').update({
        shift_code: shiftCode,
        branch_id: branchId,
        updated_at: new Date().toISOString(),
      }).eq('id', assignments[0].id);
    }
  } catch (err) {
    console.warn('[Attendance] Cập nhật schedule_assignments lỗi nhẹ:', err);
  }

  // 5. Yêu cầu backend tính lại bảng công tháng đó
  const month = workDate.slice(0, 7);
  return getAttendanceWorkSummary(month, employeeCode).catch((err) => {
    console.warn('[Attendance] Recompute work summary:', err);
    return null;
  });
}

/**
 * Xóa toàn bộ lượt chấm công trong ngày của nhân viên (khi chấm nhầm/trùng lặp)
 */
export async function deleteAttendanceDayRecords(employeeCode, workDate) {
  if (!employeeCode || !workDate) return false;
  const { data: records } = await dataClient
    .from('attendance_records')
    .select('id')
    .eq('employee_code', employeeCode)
    .eq('work_date', workDate);

  if (records && records.length) {
    for (const r of records) {
      await dataClient.from('attendance_records').delete().eq('id', r.id);
    }
  }

  const month = workDate.slice(0, 7);
  await getAttendanceWorkSummary(month, employeeCode).catch(() => null);
  return true;
}
