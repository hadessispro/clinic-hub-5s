/**
 * Audio Chime Service - Phát âm thanh chuông thông báo trực tiếp từ trình duyệt
 * Sử dụng Web Audio API thuần túy, không cần tải file MP3 hay phụ thuộc bên ngoài.
 */

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Phát chuông pha lê 2 nốt trong trẻo (Ting-ting)
 */
function playCrystalChime(ctx) {
  const now = ctx.currentTime;
  const notes = [
    { freq: 659.25, time: now, duration: 0.8 },       // E5
    { freq: 987.77, time: now + 0.12, duration: 1.2 }  // B5
  ];

  notes.forEach(({ freq, time, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.28, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  });
}

/**
 * Giai điệu nhẹ nhàng 3 nốt ấm áp (Nghỉ trưa, tiếp sức chiều)
 */
function playMelodyChime(ctx) {
  const now = ctx.currentTime;
  const notes = [
    { freq: 523.25, time: now, duration: 0.6 },        // C5
    { freq: 659.25, time: now + 0.14, duration: 0.7 }, // E5
    { freq: 783.99, time: now + 0.28, duration: 1.1 }  // G5
  ];

  notes.forEach(({ freq, time, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.25, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  });
}

/**
 * Âm báo ca rõ ràng (Checkin / Checkout)
 */
function playAlertChime(ctx) {
  const now = ctx.currentTime;
  const notes = [
    { freq: 880.00, time: now, duration: 0.35 },       // A5
    { freq: 1174.66, time: now + 0.15, duration: 0.7 } // D6
  ];

  notes.forEach(({ freq, time, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.32, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  });
}

/**
 * Tiếng gõ nhẹ nhàng êm tai
 */
function playSoftChime(ctx) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(587.33, now); // D5

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.5);
}

/**
 * Phát chuông theo loại âm thanh
 * @param {'crystal'|'melody'|'alert'|'soft'} type
 */
export function playChime(type = 'crystal') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    switch (type) {
      case 'melody':
      case 'lunch':
      case 'afternoon':
        playMelodyChime(ctx);
        break;
      case 'alert':
      case 'checkin':
      case 'checkout':
        playAlertChime(ctx);
        break;
      case 'soft':
      case 'evening':
        playSoftChime(ctx);
        break;
      case 'crystal':
      default:
        playCrystalChime(ctx);
        break;
    }
  } catch (err) {
    console.warn('[AudioChime] Không thể phát âm thanh chuông:', err);
  }
}

export const CHIME_OPTIONS = [
  { id: 'crystal', name: 'Chuông pha lê (Ting-ting)', desc: 'Trong trẻo, thanh thoát' },
  { id: 'melody', name: 'Giai điệu 3 nốt ấm áp', desc: 'Nhẹ nhàng, thư thái' },
  { id: 'alert', name: 'Âm báo ca rõ ràng', desc: 'Dứt khoát, dễ chú ý' },
  { id: 'soft', name: 'Tiếng gõ êm dịu', desc: 'Tinh tế, không phiền' },
];
