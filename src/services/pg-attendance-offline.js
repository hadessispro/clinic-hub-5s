/**
 * Hàng đợi chấm công PG ngoại tuyến, lưu trong IndexedDB.
 *
 * PG làm việc ngoài hiện trường nên mất sóng là chuyện thường. Trước đây
 * recordPgAttendance() gọi thẳng API: mất mạng là lượt chấm công biến mất, và
 * thông báo lỗi còn hiện nhầm thành lỗi GPS.
 *
 * Nguyên tắc:
 * - GPS vẫn phải lấy thật tại thời điểm bấm nút. Không bao giờ bịa tọa độ,
 *   không dùng vị trí cũ, không tự đánh dấu hợp lệ ở phía máy.
 * - Thời điểm bấm nút được giữ nguyên và gửi lên làm captured_at, để máy chủ
 *   chấm công theo lúc PG có mặt chứ không phải lúc đồng bộ.
 * - Mỗi lượt mang một clientEventId cố định, nên gửi lại bao nhiêu lần cũng
 *   chỉ tạo đúng một bản ghi.
 * - Lượt bị máy chủ từ chối vĩnh viễn thì dừng gửi lại và hiện lý do, thay vì
 *   lặp vô hạn mỗi lần có mạng.
 */

const DB_NAME = 'clinic-hub-pg-attendance';
const DB_VERSION = 1;
const STORE = 'queue';

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Thiết bị không hỗ trợ lưu chấm công ngoại tuyến.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: 'clientEventId' });
        store.createIndex('pgCode', 'pgCode', { unique: false });
        store.createIndex('capturedAt', 'capturedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không mở được vùng lưu chấm công ngoại tuyến.'));
  });
}

function runTransaction(mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    let request;
    try {
      request = operation(transaction.objectStore(STORE));
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(request?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Không ghi được chấm công lên thiết bị.'));
    };
    transaction.onabort = transaction.onerror;
  }));
}

export function makeClientEventId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Dự phòng cho WebView cũ không có randomUUID: vẫn phải đúng định dạng UUID v4
  // vì máy chủ kiểm tra bằng regex trước khi nhận.
  const bytes = new Uint8Array(16);
  (globalThis.crypto?.getRandomValues || ((array) => {
    for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * 256);
    return array;
  }))(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Toàn bộ mục trong hàng đợi, kể cả mục đã bị từ chối. */
export function listAll(pgCode) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const store = transaction.objectStore(STORE);
    const request = pgCode ? store.index('pgCode').getAll(pgCode) : store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Không đọc được hàng đợi chấm công.'));
    transaction.oncomplete = () => database.close();
  })).catch(() => []);
}

/** Mục còn chờ gửi lên máy chủ. */
export async function listPending(pgCode) {
  return (await listAll(pgCode)).filter((item) => !item.rejectedAt);
}

/** Mục máy chủ đã từ chối vĩnh viễn; gửi lại cũng hỏng y hệt. */
export async function listRejected(pgCode) {
  return (await listAll(pgCode)).filter((item) => !!item.rejectedAt);
}

export function enqueue(entry) {
  if (!entry?.clientEventId) return Promise.reject(new Error('Thiếu mã lượt chấm công.'));
  return runTransaction('readwrite', (store) => store.put({ ...entry, queuedAt: new Date().toISOString() }));
}

export function remove(clientEventId) {
  if (!clientEventId) return Promise.resolve();
  return runTransaction('readwrite', (store) => store.delete(clientEventId));
}

function markRejected(entry, message) {
  return runTransaction('readwrite', (store) => store.put({
    ...entry,
    rejectedAt: new Date().toISOString(),
    syncError: String(message || 'Máy chủ từ chối lượt chấm công này.'),
  }));
}

export async function discardRejected(pgCode) {
  for (const entry of await listRejected(pgCode)) {
    await remove(entry.clientEventId);
  }
}

function isNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return !navigator.onLine
    || error instanceof TypeError
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('load failed');
}

/**
 * Đẩy hàng đợi lên máy chủ, cũ trước mới sau để check-in luôn tới trước
 * check-out của cùng một ca.
 *
 * @param {(payload: object) => Promise<any>} submit Hàm gọi API thật.
 * @returns {Promise<{synced:number, rejected:number, pending:number}>}
 */
export async function syncQueue(submit, pgCode) {
  if (!navigator.onLine) {
    const all = await listAll(pgCode);
    return { synced: 0, rejected: all.filter((i) => i.rejectedAt).length, pending: all.filter((i) => !i.rejectedAt).length };
  }

  const pending = (await listPending(pgCode)).sort((a, b) => String(a.capturedAt).localeCompare(String(b.capturedAt)));
  let synced = 0;

  for (const entry of pending) {
    try {
      await submit({
        clientEventId: entry.clientEventId,
        type: entry.type,
        latitude: entry.latitude,
        longitude: entry.longitude,
        accuracy: entry.accuracy,
        capturedAt: entry.capturedAt,
        offline: true,
      });
      await remove(entry.clientEventId);
      synced += 1;
    } catch (error) {
      if (isNetworkError(error)) break; // mạng chập chờn, giữ nguyên phần còn lại
      await markRejected(entry, error?.message);
    }
  }

  const all = await listAll(pgCode);
  return {
    synced,
    rejected: all.filter((item) => item.rejectedAt).length,
    pending: all.filter((item) => !item.rejectedAt).length,
  };
}
