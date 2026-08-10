export const BRANCHES = Object.freeze({
  'pham-van-chieu': Object.freeze({
    id: 'pham-van-chieu', code: 'PVC', name: 'Nha Khoa 5S - Phạm Văn Chiêu', shortName: '5S Phạm Văn Chiêu',
    address: '248 Phạm Văn Chiêu, Phường Thông Tây Hội, TP.HCM', latitude: 10.848632, longitude: 106.649181,
    allowedRadius: 100, maxGpsAccuracy: 100, checkinTime: '08:00', checkinGraceMinutes: 0, timeZone: 'Asia/Ho_Chi_Minh',
  }),
  'le-van-tho': Object.freeze({
    id: 'le-van-tho', code: 'LVT', name: 'Nha Khoa 5S - Lê Văn Thọ', shortName: '5S Lê Văn Thọ',
    address: '60 Lê Văn Thọ, Phường Thông Tây Hội, TP.HCM', latitude: 10.8381574, longitude: 106.6579553,
    allowedRadius: 100, maxGpsAccuracy: 100, checkinTime: '08:00', checkinGraceMinutes: 0, timeZone: 'Asia/Ho_Chi_Minh',
  }),
});

export let BRANCH = BRANCHES['pham-van-chieu'];

export function setActiveBranch(branchId) {
  BRANCH = BRANCHES[branchId] || BRANCHES['pham-van-chieu'];
  return BRANCH;
}

export function getEffectiveBranchId(profile, candidateBranchId = null) {
  const isManager = ['admin', 'hr', 'leader', 'admin_it'].includes(profile?.role);
  if (isManager) {
    const saved = localStorage.getItem('5s_clinic_active_branch');
    return candidateBranchId || saved || profile?.branch_id || 'pham-van-chieu';
  }
  return profile?.branch_id || candidateBranchId || 'pham-van-chieu';
}

export function loginEmailFor(branchId, employeeNumber) {
  const branch = BRANCHES[branchId];
  const mnv = String(employeeNumber || '').trim().toUpperCase();
  if (!branch || !/^[A-Z0-9_-]{2,30}$/.test(mnv)) throw new Error('Mã nhân viên hoặc chi nhánh không hợp lệ.');
  return `${branch.code.toLowerCase()}.${mnv.toLowerCase()}@login.nhakhoa5s.vn`;
}

export function branchSettings() {
  return { branchId: BRANCH.id, clinicName: BRANCH.name, clinicAddress: BRANCH.address, latitude: BRANCH.latitude,
    longitude: BRANCH.longitude, allowedRadius: BRANCH.allowedRadius, maxGpsAccuracy: BRANCH.maxGpsAccuracy,
    checkinTime: BRANCH.checkinTime, checkinGraceMinutes: BRANCH.checkinGraceMinutes, timeZone: BRANCH.timeZone };
}

export function clinicDateISO(value = new Date(), timeZone = BRANCH.timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function clinicTimeLabel(value = new Date(), timeZone = BRANCH.timeZone) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(value instanceof Date ? value : new Date(value));
}
