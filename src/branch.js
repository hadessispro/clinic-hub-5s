export const BRANCH = Object.freeze({
  id: 'pham-van-chieu',
  name: 'Nha Khoa 5S - Lê Văn Thọ',
  shortName: '5S Lê Văn Thọ',
  address: '60 Lê Văn Thọ, Phường Thông Tây Hội, TP.HCM',
  latitude: 10.8381574,
  longitude: 106.6579553,
  allowedRadius: 100,
  maxGpsAccuracy: 50,
  checkinTime: '08:00',
  checkinGraceMinutes: 0,
  timeZone: 'Asia/Ho_Chi_Minh',
});

export function branchSettings() {
  return {
    branchId: BRANCH.id,
    clinicName: BRANCH.name,
    clinicAddress: BRANCH.address,
    latitude: BRANCH.latitude,
    longitude: BRANCH.longitude,
    allowedRadius: BRANCH.allowedRadius,
    maxGpsAccuracy: BRANCH.maxGpsAccuracy,
    checkinTime: BRANCH.checkinTime,
    checkinGraceMinutes: BRANCH.checkinGraceMinutes,
    timeZone: BRANCH.timeZone,
  };
}

export function clinicDateISO(value = new Date(), timeZone = BRANCH.timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function clinicTimeLabel(value = new Date(), timeZone = BRANCH.timeZone) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value instanceof Date ? value : new Date(value));
}
