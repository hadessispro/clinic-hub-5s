/**
 * Barcode & QR Code Scanner Service for Clinic Hub 5S
 * Tích hợp chuẩn thư viện ZXing độc lập (Zebra Crossing) chạy 100% offline,
 * hỗ trợ đầy đủ mọi thiết bị di động (iOS Safari, Android Chrome, Tablet, Desktop)
 * và mọi định dạng mã vạch thông dụng: EAN-13, Code 128, Code 39, QR Code, DataMatrix...
 */

let activeStream = null;
let activeReader = null;
let lastScannedCode = null;
let lastScannedTimestamp = 0;
let isTorchOn = false;

/**
 * Phát âm thanh Beep điện tử bằng Web Audio API
 * Không cần tải bất kỳ file audio/mp3 nào, âm lượng rõ, phản hồi tức thì
 */
export function playBeepSound(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Âm chuẩn "Tít" cao tần 1800Hz trong 100ms
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'warn') {
      // Âm cảnh báo 2 nhịp ngắn
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch {}

  // Rung phản hồi (Haptic feedback) nếu thiết bị hỗ trợ
  try {
    if (navigator.vibrate) {
      navigator.vibrate(type === 'success' ? [45] : [60, 50, 60]);
    }
  } catch {}
}

let zxingLoadingPromise = null;

/**
 * Nạp động bộ giải mã ZXing từ tệp tĩnh cục bộ (tự động chuyển CDN dự phòng nếu mạng chậm)
 */
export async function ensureZXing() {
  if (typeof window === 'undefined') return null;
  if (window.ZXing) return window.ZXing;
  if (zxingLoadingPromise) return zxingLoadingPromise;

  zxingLoadingPromise = (async () => {
    if (window.ZXing) return window.ZXing;

    function loadScript(src, timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        const cleanSrc = src.split('?')[0];
        let s = document.querySelector(`script[src*="${cleanSrc}"]`);
        if (s && window.ZXing) return resolve(window.ZXing);

        let timer = null;
        let pollTimer = null;

        const cleanup = () => {
          if (timer) clearTimeout(timer);
          if (pollTimer) clearInterval(pollTimer);
        };

        timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Quá thời gian tải script (${Math.round(timeoutMs / 1000)}s): ${src}`));
        }, timeoutMs);

        if (!s) {
          s = document.createElement('script');
          s.src = src;
          s.async = true;
          document.head.appendChild(s);
        }

        s.addEventListener('load', () => {
          cleanup();
          if (window.ZXing) resolve(window.ZXing);
          else reject(new Error('Thư viện ZXing không khởi tạo được đối tượng toàn cục window.ZXing.'));
        }, { once: true });

        s.addEventListener('error', () => {
          cleanup();
          reject(new Error(`Không thể kết nối tải tệp ${src}`));
        }, { once: true });

        pollTimer = setInterval(() => {
          if (window.ZXing) {
            cleanup();
            resolve(window.ZXing);
          }
        }, 80);
      });
    }

    try {
      // 1. Ưu tiên nạp từ tệp nội bộ tĩnh (nhanh, offline, bảo mật)
      return await loadScript('/libs/zxing.min.js?v=20260930_zx1', 12000);
    } catch (localErr) {
      console.warn('[BarcodeScanner] Nạp ZXing nội bộ không kịp hoặc lỗi, chuyển sang CDN dự phòng:', localErr);
      try {
        // 2. Dự phòng CDN jsDelivr chính thức nếu PWA/máy trạm chưa tải được tệp tĩnh
        return await loadScript('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js', 15000);
      } catch (cdnErr) {
        zxingLoadingPromise = null; // Cho phép bấm thử lại
        throw new Error('Không thể tải thư viện giải mã mã vạch ZXing. Vui lòng kiểm tra lại kết nối mạng hoặc bấm thử lại.');
      }
    }
  })();

  return zxingLoadingPromise;
}

/**
 * Kiểm tra xem trình duyệt có hỗ trợ mở Camera không
 */
export function isCameraSupported() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Khởi tạo đầu đọc mã vạch đa định dạng với cấu hình tối ưu độ nhạy cho mã hàng hóa
 */
async function createReaderInstance() {
  const ZXing = await ensureZXing();
  if (!ZXing) throw new Error('Không thể khởi tạo động cơ giải mã mã vạch.');

  const hints = new Map();
  const formats = [
    ZXing.BarcodeFormat.CODE_128,
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.CODE_93,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.ITF,
    ZXing.BarcodeFormat.CODABAR,
    ZXing.BarcodeFormat.QR_CODE,
    ZXing.BarcodeFormat.DATA_MATRIX,
  ];
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

  return new ZXing.BrowserMultiFormatReader(hints, 180);
}

/**
 * Bắt đầu camera và giải mã trực tiếp luồng video liên tục
 */
export async function startBarcodeScanner(videoElement, onDetected, { debounceMs = 1200 } = {}) {
  if (!window.isSecureContext) {
    throw new Error('Camera chỉ hoạt động trên kết nối an toàn (HTTPS hoặc localhost).');
  }
  if (!isCameraSupported()) {
    throw new Error('Thiết bị hoặc trình duyệt không hỗ trợ mở camera trực tiếp.');
  }
  if (!videoElement) {
    throw new Error('Không tìm thấy khung video hiển thị camera.');
  }

  stopBarcodeScanner();

  // 1. Đảm bảo động cơ quét mã ZXing đã sẵn sàng TRƯỚC khi bật camera
  const reader = await createReaderInstance();
  activeReader = reader;

  try {
    // 2. Ưu tiên camera sau (environment), độ phân giải cao để nhận diện rõ nét vạch 1D nhỏ
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      });
    } catch {
      // Fallback constraints nếu camera không hỗ trợ độ phân giải cao
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      });
    }

    activeStream = stream;

    // Tự động bật Continuous Autofocus trên thiết bị hỗ trợ
    const track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' }],
        });
      } catch {}
    }

    videoElement.setAttribute('autoplay', '');
    videoElement.setAttribute('muted', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.srcObject = activeStream;

    // Chờ metadata sẵn sàng trước khi play() để tránh lỗi WebKit iOS
    await new Promise((resolve) => {
      if (videoElement.readyState >= 1) {
        resolve();
      } else {
        videoElement.onloadedmetadata = () => resolve();
        setTimeout(resolve, 350);
      }
    });

    try {
      await videoElement.play();
    } catch (playErr) {
      if (playErr.name !== 'AbortError') {
        console.warn('[BarcodeScanner] video.play notice:', playErr);
      }
    }

    // Bắt đầu quét liên tục trên luồng video
    activeReader.decodeFromVideoElementContinuously(videoElement, (result, err) => {
      if (!result) return;
      const code = String(result.getText() || '').trim();
      if (!code) return;

      const now = Date.now();
      // Chống quét trùng lặp trong khoảng thời gian debounce
      if (code !== lastScannedCode || now - lastScannedTimestamp > debounceMs) {
        lastScannedCode = code;
        lastScannedTimestamp = now;

        const formatIndex = result.getBarcodeFormat();
        const formatName = (window.ZXing?.BarcodeFormat && window.ZXing.BarcodeFormat[formatIndex]) || 'BARCODE';

        playBeepSound('success');
        if (typeof onDetected === 'function') {
          onDetected({
            code,
            format: formatName,
            rawResult: result,
          });
        }
      }
    });

    return {
      stream: activeStream,
      hasTorch: checkTorchSupport(),
      reader: activeReader,
    };
  } catch (err) {
    stopBarcodeScanner();
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      throw new Error('Vui lòng cấp quyền sử dụng Camera trong Cài đặt Safari/Chrome trên điện thoại.');
    }
    if (err.name === 'NotFoundError') {
      throw new Error('Không tìm thấy camera phù hợp trên thiết bị.');
    }
    throw new Error(err.message || 'Không thể khởi động camera quét mã vạch.');
  }
}

/**
 * Giải mã mã vạch từ tệp ảnh tĩnh (Chụp ảnh từ camera gốc hoặc tải ảnh từ Album)
 * Rất hữu ích khi camera quay trực tiếp bị rung, mờ hoặc ánh sáng yếu
 */
export async function scanBarcodeFromImage(fileOrBlob, onDetected) {
  if (!fileOrBlob) throw new Error('Chưa chọn ảnh để quét.');
  const ZXing = await ensureZXing();

  const hints = new Map();
  const formats = [
    ZXing.BarcodeFormat.CODE_128,
    ZXing.BarcodeFormat.EAN_13,
    ZXing.BarcodeFormat.CODE_39,
    ZXing.BarcodeFormat.CODE_93,
    ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.ITF,
    ZXing.BarcodeFormat.CODABAR,
    ZXing.BarcodeFormat.QR_CODE,
    ZXing.BarcodeFormat.DATA_MATRIX,
  ];
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

  const reader = new ZXing.BrowserMultiFormatReader(hints);
  const url = URL.createObjectURL(fileOrBlob);

  try {
    const result = await reader.decodeFromImageUrl(url);
    if (result) {
      const code = String(result.getText() || '').trim();
      const formatIndex = result.getBarcodeFormat();
      const formatName = (ZXing.BarcodeFormat && ZXing.BarcodeFormat[formatIndex]) || 'BARCODE';

      playBeepSound('success');
      if (typeof onDetected === 'function') {
        onDetected({ code, format: formatName });
      }
      return { code, format: formatName };
    }
  } catch (err) {
    throw new Error('Không nhận diện được mã vạch trong ảnh. Hãy chụp gần và rõ nét phần mã vạch.');
  } finally {
    URL.revokeObjectURL(url);
    try { reader.reset(); } catch {}
  }
}

/**
 * Kiểm tra xem camera hiện tại có hỗ trợ đèn flash/torch không
 */
export function checkTorchSupport() {
  if (!activeStream) return false;
  const track = activeStream.getVideoTracks()[0];
  if (!track || !track.getCapabilities) return false;
  const caps = track.getCapabilities();
  return Boolean(caps.torch);
}

/**
 * Bật / tắt đèn Flash (Torch)
 */
export async function toggleTorch(forceState = null) {
  if (!activeStream) return false;
  const track = activeStream.getVideoTracks()[0];
  if (!track) return false;

  const targetState = forceState !== null ? forceState : !isTorchOn;
  try {
    await track.applyConstraints({
      advanced: [{ torch: targetState }],
    });
    isTorchOn = targetState;
    return isTorchOn;
  } catch {
    return false;
  }
}

/**
 * Dừng camera và giải phóng tài nguyên
 */
export function stopBarcodeScanner() {
  if (activeReader) {
    try {
      activeReader.reset();
    } catch {}
    activeReader = null;
  }
  if (activeStream) {
    try {
      activeStream.getTracks().forEach((track) => track.stop());
    } catch {}
    activeStream = null;
  }
  isTorchOn = false;
  lastScannedCode = null;
  lastScannedTimestamp = 0;
}
