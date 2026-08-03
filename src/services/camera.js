let activeCameraStream = null;

export function cameraErrorMessage(error) {
  if (!window.isSecureContext) return 'Camera chỉ hoạt động trên website HTTPS an toàn.';
  if (!navigator.mediaDevices?.getUserMedia) return 'Thiết bị hoặc trình duyệt này không hỗ trợ chụp ảnh trực tiếp.';
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Bạn chưa cho phép website dùng camera. Hãy bật quyền Camera trong cài đặt trình duyệt.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
    return 'Không tìm thấy camera phù hợp trên thiết bị.';
  }
  if (error?.name === 'NotReadableError') return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.';
  return error?.message || 'Không thể mở camera trực tiếp.';
}

export function stopWorkplaceCamera() {
  if (!activeCameraStream) return;
  activeCameraStream.getTracks().forEach((track) => track.stop());
  activeCameraStream = null;
}

export async function startWorkplaceCamera(videoElement) {
  if (!window.isSecureContext) throw new Error('Camera chỉ hoạt động trên website HTTPS an toàn.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Thiết bị hoặc trình duyệt này không hỗ trợ chụp ảnh trực tiếp.');
  if (!videoElement) throw new Error('Không tìm thấy khung camera.');

  stopWorkplaceCamera();
  try {
    activeCameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });
    videoElement.srcObject = activeCameraStream;
    videoElement.muted = true;
    videoElement.playsInline = true;
    await videoElement.play();
    return activeCameraStream;
  } catch (error) {
    stopWorkplaceCamera();
    throw new Error(cameraErrorMessage(error));
  }
}

export function captureWorkplacePhoto(videoElement, { maxWidth = 1280, quality = 0.82 } = {}) {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
    return Promise.reject(new Error('Camera chưa sẵn sàng. Giữ máy ổn định rồi thử lại.'));
  }

  const scale = Math.min(1, maxWidth / videoElement.videoWidth);
  const width = Math.max(1, Math.round(videoElement.videoWidth * scale));
  const height = Math.max(1, Math.round(videoElement.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return Promise.reject(new Error('Thiết bị không thể xử lý ảnh camera.'));
  context.drawImage(videoElement, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Không thể tạo ảnh từ camera.')),
      'image/jpeg',
      quality,
    );
  });
}
