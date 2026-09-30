/**
 * Barcode & QR Code Scanner Service for Clinic Hub 5S
 * Tận dụng chuẩn Web API BarcodeDetector trên điện thoại di động (Android / iOS Safari 17+)
 * Hỗ trợ Web Audio BEEP, rung phản hồi, đèn Flash/Torch, chống quét lặp Debounce.
 */

let activeStream = null;
let scanIntervalId = null;
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

/**
 * Kiểm tra xem trình duyệt có hỗ trợ BarcodeDetector gốc không
 */
export function isNativeBarcodeSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Nạp polyfill dự phòng nếu thiết bị hoặc trình duyệt cũ chưa có BarcodeDetector
 */
async function ensureBarcodeDetector() {
  if (isNativeBarcodeSupported()) {
    try {
      return new window.BarcodeDetector({
        formats: [
          'code_128', 'code_39', 'code_93', 'codabar',
          'ean_13', 'ean_8', 'upc_a', 'upc_e',
          'qr_code', 'data_matrix', 'itf',
        ],
      });
    } catch {
      // Một số phiên bản chỉ hỗ trợ một tập con
      return new window.BarcodeDetector();
    }
  }

  // Tải polyfill dự phòng nhẹ từ CDN nếu chưa có
  if (!window.BarcodeDetector) {
    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@undecaf/barcode-detector-polyfill@0.9.21/dist/index.min.js';
      script.onload = () => {
        if (window.BarcodeDetectorPolyfill) {
          window.BarcodeDetector = window.BarcodeDetectorPolyfill;
        }
        resolve();
      };
      script.onerror = () => resolve(); // Tiếp tục kể cả khi offline
      document.head.appendChild(script);
    });
  }

  if (window.BarcodeDetector) {
    try {
      return new window.BarcodeDetector();
    } catch {}
  }
  return null;
}

/**
 * Bắt đầu camera và vòng lặp quét mã
 */
export async function startBarcodeScanner(videoElement, onDetected, { debounceMs = 1200 } = {}) {
  if (!window.isSecureContext) {
    throw new Error('Camera chỉ hoạt động trên kết nối HTTPS an toàn.');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Thiết bị hoặc trình duyệt không hỗ trợ mở camera.');
  }
  if (!videoElement) {
    throw new Error('Không tìm thấy khung video hiển thị camera.');
  }

  stopBarcodeScanner();

  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch {
      // Fallback constraints nếu thiết bị không hỗ trợ width/height ideal
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      });
    }

    activeStream = stream;

    videoElement.setAttribute('autoplay', '');
    videoElement.setAttribute('muted', '');
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('webkit-playsinline', '');
    videoElement.muted = true;
    videoElement.playsInline = true;
    videoElement.srcObject = activeStream;

    // Chờ metadata sẵn sàng trước khi play() để tránh AbortError trên iOS WebKit
    await new Promise((resolve) => {
      if (videoElement.readyState >= 1) {
        resolve();
      } else {
        videoElement.onloadedmetadata = () => resolve();
        setTimeout(resolve, 300);
      }
    });

    try {
      await videoElement.play();
    } catch (playErr) {
      if (playErr.name !== 'AbortError') {
        console.warn('video.play notice:', playErr);
      }
    }
  } catch (err) {
    stopBarcodeScanner();
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      throw new Error('Vui lòng cấp quyền sử dụng Camera trong Cài đặt Safari/Chrome trên điện thoại.');
    }
    if (err.name === 'NotFoundError') {
      throw new Error('Không tìm thấy camera phù hợp trên thiết bị.');
    }
    throw new Error(err.message || 'Không thể khởi động camera.');
  }

  const detector = await ensureBarcodeDetector();
  if (!detector) {
    console.warn('Thiết bị không hỗ trợ BarcodeDetector. Cho phép người dùng nhập mã bằng tay.');
  }

  let isScanning = false;
  scanIntervalId = setInterval(async () => {
    if (isScanning || !detector || videoElement.readyState < 2) return;
    isScanning = true;
    try {
      const barcodes = await detector.detect(videoElement);
      if (barcodes && barcodes.length > 0) {
        const first = barcodes[0];
        const code = (first.rawValue || first.displayValue || '').trim();
        const now = Date.now();

        // Chống quét trùng lặp trong khoảng thời gian debounce
        if (code && (code !== lastScannedCode || now - lastScannedTimestamp > debounceMs)) {
          lastScannedCode = code;
          lastScannedTimestamp = now;
          playBeepSound('success');
          if (typeof onDetected === 'function') {
            onDetected({
              code,
              format: first.format || 'unknown',
              boundingBox: first.boundingBox,
            });
          }
        }
      }
    } catch (detectErr) {
      // Bỏ qua lỗi nhận diện từng frame
    } finally {
      isScanning = false;
    }
  }, 100); // Tần suất quét 10 lần/giây, vừa siêu mượt vừa không nóng máy

  return {
    stream: activeStream,
    hasTorch: checkTorchSupport(),
  };
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
 * Dừng camera và giải phóng bộ nhớ
 */
export function stopBarcodeScanner() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
  isTorchOn = false;
  lastScannedCode = null;
  lastScannedTimestamp = 0;
}
