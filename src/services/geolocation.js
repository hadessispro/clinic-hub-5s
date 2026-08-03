const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_TARGET_ACCURACY_M = 30;

function normalizeGeolocationError(error) {
  const normalized = new Error(geolocationErrorMessage(error));
  normalized.code = Number(error?.code || 0);
  normalized.permissionDenied = normalized.code === 1
    || normalized.code === Number(error?.PERMISSION_DENIED || -1);
  return normalized;
}

export function geolocationErrorMessage(error) {
  if (!window.isSecureContext) return 'Định vị chỉ hoạt động trên website HTTPS an toàn.';
  if (error?.code === error?.PERMISSION_DENIED) return 'Bạn chưa cho phép website truy cập vị trí. Hãy bật quyền Vị trí trong cài đặt trình duyệt.';
  if (error?.code === error?.POSITION_UNAVAILABLE) return 'Điện thoại chưa xác định được vị trí. Hãy bật GPS và đứng gần cửa sổ rồi thử lại.';
  if (error?.code === error?.TIMEOUT) return 'GPS phản hồi quá chậm. Hãy kiểm tra định vị trên điện thoại rồi thử lại.';
  return error?.message || 'Không thể lấy vị trí từ thiết bị.';
}

export function isGeolocationPermissionDenied(error) {
  return !!error?.permissionDenied || Number(error?.code) === 1;
}

export async function getGeolocationPermissionState() {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    return ['granted', 'denied', 'prompt'].includes(permission.state)
      ? permission.state
      : 'unknown';
  } catch {
    // Safari versions without geolocation support in Permissions API land here.
    return 'unknown';
  }
}

/**
 * Collects multiple high-accuracy readings and returns the best one. Mobile
 * browsers often emit a coarse network position before the real GPS fix.
 */
export function acquirePrecisePosition({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  targetAccuracyM = DEFAULT_TARGET_ACCURACY_M,
  onReading,
} = {}) {
  if (!window.isSecureContext) {
    return Promise.reject(new Error('Định vị chỉ hoạt động trên website HTTPS an toàn.'));
  }
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Thiết bị hoặc trình duyệt này không hỗ trợ GPS.'));
  }

  return new Promise((resolve, reject) => {
    let best = null;
    let settled = false;
    let watchId = null;
    let timerId = null;

    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (timerId != null) clearTimeout(timerId);
      if (value) resolve(value);
      else reject(error || new Error('Không lấy được vị trí.'));
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const reading = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracy: Math.max(0, Math.round(Number(position.coords.accuracy || 9999))),
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
          source: 'gps',
        };

        if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lng)) return;
        if (!best || reading.accuracy < best.accuracy) best = reading;
        onReading?.(reading, best);
        if (best.accuracy <= targetAccuracyM) finish(best);
      },
      (error) => {
        if (best) finish(best);
        else finish(null, normalizeGeolocationError(error));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );

    timerId = window.setTimeout(() => {
      if (best) finish(best);
      else finish(null, new Error('Hết thời gian chờ GPS. Hãy bật định vị và thử lại.'));
    }, timeoutMs);
  });
}

/**
 * Requests one fresh reading directly from the device. This is used as a
 * fallback when the multi-sample GPS watcher cannot settle, while preserving
 * the same no-cache and high-accuracy requirements.
 */
export function acquireCurrentPosition({ timeoutMs = 15000 } = {}) {
  if (!window.isSecureContext) {
    return Promise.reject(new Error('Định vị chỉ hoạt động trên website HTTPS an toàn.'));
  }
  if (!navigator.geolocation) {
    return Promise.reject(new Error('Thiết bị hoặc trình duyệt này không hỗ trợ GPS.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const reading = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
          accuracy: Math.max(0, Math.round(Number(position.coords.accuracy || 9999))),
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
          source: 'device-current-position',
        };
        if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lng)) {
          reject(new Error('Thiết bị trả về tọa độ không hợp lệ.'));
          return;
        }
        resolve(reading);
      },
      (error) => reject(normalizeGeolocationError(error)),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export function getOrCreateDeviceId() {
  const key = '5s_clinic_device_id';
  let value = localStorage.getItem(key);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, value);
  }
  return value;
}
