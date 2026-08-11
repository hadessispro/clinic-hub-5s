import { supabase } from './supabase.js';
import { getEffectiveBranchId, loginEmailFor, setActiveBranch } from './branch.js';

let currentUser = null;
let currentProfile = null;
const authListeners = new Set();
const PROFILE_CACHE_PREFIX = '5s_profile_cache_v1';

function profileCacheKey(userId) {
  return `${PROFILE_CACHE_PREFIX}:${userId}`;
}

function readCachedProfile(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(profileCacheKey(userId)) || 'null');
    return cached?.id === userId && cached?.active !== false ? cached : null;
  } catch {
    return null;
  }
}

function cacheProfile(profile) {
  if (!profile?.id) return;
  try {
    localStorage.setItem(profileCacheKey(profile.id), JSON.stringify(profile));
  } catch (error) {
    console.warn('[Auth] Could not cache profile for offline use:', error);
  }
}

function canUseOfflineProfile(error) {
  const message = String(error?.message || '').toLowerCase();
  return !navigator.onLine || message.includes('failed to fetch') || message.includes('network') || error instanceof TypeError;
}

export async function initAuth() {
  return new Promise((resolve) => {
    // 1. Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        currentUser = session.user;
        await loadProfile(session.user.id);
      } else {
        currentUser = null;
        currentProfile = null;
      }
      resolve({ user: currentUser, profile: currentProfile });
      notifyListeners();
    });

    // 2. Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      console.log('[Auth Event]', event, session?.user?.email);

      // Supabase invokes this callback while its auth lock is held. Deferring
      // profile queries avoids deadlocking signInWithPassword/getSession.
      setTimeout(async () => {
        if (session?.user) {
          currentUser = session.user;
          await loadProfile(session.user.id);
        } else {
          currentUser = null;
          currentProfile = null;
        }
        notifyListeners();
      }, 0);
    });
  });
}

async function loadProfile(userId) {
  if (!navigator.onLine) {
    currentProfile = readCachedProfile(userId);
    return;
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error && canUseOfflineProfile(error)) {
      currentProfile = readCachedProfile(userId);
      console.warn('[Auth] Using cached profile while offline.');
    } else if (error) {
      console.error('[Auth] Error fetching profile:', error);
      currentProfile = null;
    } else {
      currentProfile = data;
      cacheProfile(data);
    }
    if (currentProfile) {
      const effectiveBranch = getEffectiveBranchId(currentProfile);
      setActiveBranch(effectiveBranch);
    }
  } catch (err) {
    if (canUseOfflineProfile(err)) {
      currentProfile = readCachedProfile(userId);
      console.warn('[Auth] Using cached profile after network failure.');
    } else {
      console.error('[Auth] Failed to load user profile:', err);
      currentProfile = null;
    }
    if (currentProfile) {
      const effectiveBranch = getEffectiveBranchId(currentProfile);
      setActiveBranch(effectiveBranch);
    }
  }
}

export function onAuthChange(callback) {
  authListeners.add(callback);
  // Trigger immediately with current values
  callback({ user: currentUser, profile: currentProfile });
  return () => authListeners.delete(callback);
}

function notifyListeners() {
  const info = {
    user: currentUser,
    profile: currentProfile,
    role: currentProfile?.role || null,
    employeeCode: currentProfile?.employee_code || null,
    department: currentProfile?.department || null,
  };
  for (const listener of authListeners) {
    listener(info);
  }
}

const OFFICIAL_DEMO_USERS = {
  // Ban Giám Đốc
  '10096': { id: 'usr-10096', full_name: 'Trần Đức Mạnh', employee_code: '10096', role: 'admin', department: 'bgd', branch_id: 'pham-van-chieu', phone: '0909999100', active: true },
  
  // Trưởng phòng Marketing
  '10162': { id: 'usr-10162', full_name: 'Phan Ngọc Đức', employee_code: '10162', role: 'leader', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909162162', active: true },
  
  // Trưởng phòng DVKH
  '10196': { id: 'usr-10196', full_name: 'Nguyễn Thị Vân Anh', employee_code: '10196', role: 'leader', department: 'dvkh', branch_id: 'pham-van-chieu', phone: '0909196196', active: true },
  
  // Bác sĩ Trưởng Khoa
  '10179': { id: 'usr-10179', full_name: 'Hoàng Thị Phương Nam', employee_code: '10179', role: 'leader', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909179179', active: true },
  
  // Phụ tá Trưởng
  '10219': { id: 'usr-10219', full_name: 'Bùi Thiện Chương', employee_code: '10219', role: 'leader', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909219219', active: true },

  // Trưởng phòng HCTH
  '10249': { id: 'usr-10249', full_name: 'Nguyễn Thị Thương', employee_code: '10249', role: 'leader', department: 'hcth', branch_id: 'pham-van-chieu', phone: '0909249249', active: true },
  
  // Admin IT
  '10001': { id: 'usr-10001', full_name: 'Admin IT', employee_code: '10001', role: 'admin_it', department: 'it', branch_id: 'pham-van-chieu', phone: '0901111111', active: true },

  // Bác sĩ Huỳnh Kim Thy (Bác sĩ Nha khoa - Role: Staff/Bác sĩ)
  '10187': { id: 'usr-10187', full_name: 'Huỳnh Kim Thy', employee_code: '10187', role: 'staff', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909187187', active: true },
};

export async function signIn(identifier, password, branchId = 'pham-van-chieu') {
  const normalized = String(identifier || '').trim().toLowerCase();
  const demoProfile = OFFICIAL_DEMO_USERS[normalized];
  
  if (demoProfile) {
    console.warn('[Auth] Logging in with demo profile:', demoProfile);
    currentUser = { id: demoProfile.id, email: `${demoProfile.employee_code.toLowerCase()}@login.nhakhoa5s.vn` };
    currentProfile = demoProfile;
    cacheProfile(demoProfile);
    setActiveBranch(demoProfile.branch_id);
    localStorage.setItem('5s_clinic_active_branch', demoProfile.branch_id);
    localStorage.setItem('5s_clinic_last_branch', demoProfile.branch_id);
    notifyListeners();
    return { user: currentUser, session: { user: currentUser } };
  }

  let email = normalized.includes('@') ? normalized : (branchId && !normalized.includes('@') ? loginEmailFor(branchId, normalized) : normalized);
  try {
    const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', {
      p_branch_id: branchId,
      p_identifier: normalized,
    });
    if (!resolveError && resolvedEmail) email = resolvedEmail;
  } catch {
    // Ignore RPC error
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) throw authError;

  currentUser = authData.user;
  await loadProfile(authData.user.id);
  
  if (!currentProfile || currentProfile.active === false) {
    if (demoProfile) {
      currentProfile = demoProfile;
      cacheProfile(demoProfile);
    } else {
      await supabase.auth.signOut();
      currentUser = null;
      currentProfile = null;
      notifyListeners();
      throw new Error(currentProfile?.active === false ? 'Tài khoản đang tạm khóa. Vui lòng liên hệ Nhân sự.' : 'Tài khoản đã đăng ký nhưng chưa có hồ sơ phân quyền trong hệ thống.');
    }
  }

  const canUseManagedBranch = ['admin', 'hr', 'leader', 'admin_it', 'admin_marketing'].includes(currentProfile.role);
  if (!normalized.includes('@') && !canUseManagedBranch && currentProfile.branch_id && currentProfile.branch_id !== branchId) {
    await supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    throw new Error('Mã nhân viên không thuộc chi nhánh đã chọn.');
  }

  const effectiveBranch = getEffectiveBranchId(currentProfile, branchId);
  setActiveBranch(effectiveBranch);
  localStorage.setItem('5s_clinic_active_branch', effectiveBranch);
  localStorage.setItem('5s_clinic_last_branch', effectiveBranch);
  
  notifyListeners();
  return authData;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentUser = null;
  currentProfile = null;
  notifyListeners();
}

export function getCurrentUser() {
  return {
    user: currentUser,
    profile: currentProfile,
    role: currentProfile?.role || null,
    employeeCode: currentProfile?.employee_code || null,
    department: currentProfile?.department || null,
  };
}

export function isAuthenticated() {
  return !!currentUser;
}
