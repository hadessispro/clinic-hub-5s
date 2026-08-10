import { supabase } from '../supabase.js';

const DB_NAME = 'clinic-hub-attendance';
const DB_VERSION = 1;
const STORE_NAME = 'proofs';

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Thiết bị không hỗ trợ vùng lưu ảnh ngoại tuyến.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'clientEventId' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không mở được vùng lưu ảnh ngoại tuyến.'));
  });
}

async function runTransaction(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Không thể cập nhật ảnh chấm công trên thiết bị.'));
    };
    transaction.onabort = transaction.onerror;
  });
}

export function savePendingProof({ clientEventId, userId, blob, capturedAt }) {
  if (!clientEventId || !userId || !(blob instanceof Blob)) {
    return Promise.reject(new Error('Dữ liệu ảnh chấm công chưa đầy đủ.'));
  }
  return runTransaction('readwrite', (store) => store.put({ clientEventId, userId, blob, capturedAt, queuedAt: new Date().toISOString() }));
}

export function removePendingProof(clientEventId) {
  if (!clientEventId) return Promise.resolve();
  return runTransaction('readwrite', (store) => store.delete(clientEventId));
}

export async function movePendingProof(fromClientEventId, toClientEventId) {
  if (!fromClientEventId || !toClientEventId || fromClientEventId === toClientEventId) return;
  const entries = await listPendingProofs();
  const existing = entries.find((item) => item.clientEventId === fromClientEventId);
  if (!existing) return;
  await savePendingProof({ ...existing, clientEventId: toClientEventId });
  await removePendingProof(fromClientEventId);
}

export function listPendingProofs(userId) {
  return new Promise(async (resolve, reject) => {
    let database;
    try {
      database = await openDatabase();
    } catch (error) {
      reject(error);
      return;
    }
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = userId ? store.index('userId').getAll(userId) : store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Không đọc được ảnh chờ đồng bộ.'));
    transaction.oncomplete = () => database.close();
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Không đọc được ảnh camera.'));
    reader.readAsDataURL(blob);
  });
}

export async function uploadAttendanceProof({ clientEventId, blob, capturedAt }) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');

  const imageBase64 = await blobToBase64(blob);
  if (supabase.isLocal) {
    const uploaded = await supabase.request('/files/upload', { method: 'POST',
      body: JSON.stringify({ name: `${clientEventId}.jpg`, type: 'image/jpeg', data: imageBase64 }) });
    const { error } = await supabase.from('attendance_records')
      .update({ proof_url: uploaded.publicUrl, proof_captured_at: capturedAt || new Date().toISOString() })
      .eq('client_event_id', clientEventId);
    if (error) throw error;
    return { proofUrl: uploaded.publicUrl };
  }
  const response = await fetch('/api/attendance-proof', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clientEventId, capturedAt, mimeType: 'image/jpeg', imageBase64 }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Không thể lưu ảnh chấm công.');
  return payload;
}

export async function syncPendingProofs(userId) {
  if (!userId || !navigator.onLine) return { synced: 0, failed: 0 };
  const entries = await listPendingProofs(userId).catch(() => []);
  let synced = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      await uploadAttendanceProof(entry);
      await removePendingProof(entry.clientEventId);
      synced += 1;
    } catch (error) {
      failed += 1;
      console.warn('[Attendance Proof] Pending upload failed:', error);
      if (error instanceof TypeError || String(error?.message || '').toLowerCase().includes('network')) break;
    }
  }
  return { synced, failed };
}
