const DEFAULT_GRACE_MINUTES = 5;

export function timeToSeconds(value) {
  const [hour = 0, minute = 0, second = 0] = String(value || '').split(':').map(Number);
  return hour * 3600 + minute * 60 + second;
}

export function classifyAttendance({ type, recordedTime, startTime, endTime, graceMinutes = DEFAULT_GRACE_MINUTES }) {
  const recorded = timeToSeconds(recordedTime);
  const grace = Math.max(0, Number(graceMinutes || 0)) * 60;
  if (type === 'checkout') {
    return recorded < timeToSeconds(endTime) - grace ? 'early_leave' : 'valid';
  }
  return recorded > timeToSeconds(startTime) + grace ? 'late' : 'valid';
}
