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

const MKT_DEMO_USERS = {
  'mkt-01': { id: 'usr-mkt-01', full_name: 'Trần Quốc Bảo (Admin Marketing)', employee_code: 'MKT-01', role: 'admin_marketing', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909111222', active: true },
  'mkt-01': { id: 'usr-mkt-01', full_name: 'Trần Quốc Bảo (Admin Marketing)', employee_code: 'MKT-01', role: 'admin_marketing', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909111222', active: true },
  '0909111222': { id: 'usr-mkt-01', full_name: 'Trần Quốc Bảo (Admin Marketing)', employee_code: 'MKT-01', role: 'admin_marketing', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909111222', active: true },
  'admin.mkt@login.nhakhoa5s.vn': { id: 'usr-mkt-01', full_name: 'Trần Quốc Bảo (Admin Marketing)', employee_code: 'MKT-01', role: 'admin_marketing', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909111222', active: true },

  'mkt-sup': { id: 'usr-mkt-sup', full_name: 'Nguyễn Thị Mai (Support Marketing)', employee_code: 'MKT-SUP', role: 'support_marketing', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909333444', active: true },
  '0909333444': { id: 'usr-mkt-sup', full_name: 'Nguyễn Thị Mai (Support Marketing)', employee_code: 'MKT-SUP', role: 'support_marketing', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909333444', active: true },
  'support.mkt@login.nhakhoa5s.vn': { id: 'usr-mkt-sup', full_name: 'Nguyễn Thị Mai (Support Marketing)', employee_code: 'MKT-SUP', role: 'support_marketing', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909333444', active: true },

  'pg-field': { id: 'usr-pg-field', full_name: 'Lê Văn Nam (PG Thị trường)', employee_code: 'PG-FIELD', role: 'pg_staff', department: 'mkt', branch_id: 'le-van-tho', phone: '0909555666', active: true },
  '0909555666': { id: 'usr-pg-field', full_name: 'Lê Văn Nam (PG Thị trường)', employee_code: 'PG-FIELD', role: 'pg_staff', department: 'mkt', branch_id: 'le-van-tho', phone: '0909555666', active: true },
  'pg.field@login.nhakhoa5s.vn': { id: 'usr-pg-field', full_name: 'Lê Văn Nam (PG Thị trường)', employee_code: 'PG-FIELD', role: 'pg_staff', department: 'mkt', branch_id: 'le-van-tho', phone: '0909555666', active: true },

  'ts-lead': { id: 'usr-ts-lead', full_name: 'Phạm Thu Hương (Quản lý Telesale)', employee_code: 'TS-LEAD', role: 'telesale_leader', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909777888', active: true },
  '0909777888': { id: 'usr-ts-lead', full_name: 'Phạm Thu Hương (Quản lý Telesale)', employee_code: 'TS-LEAD', role: 'telesale_leader', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909777888', active: true },
  'lead.telesale@login.nhakhoa5s.vn': { id: 'usr-ts-lead', full_name: 'Phạm Thu Hương (Quản lý Telesale)', employee_code: 'TS-LEAD', role: 'telesale_leader', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909777888', active: true },

  'pvc-ts01': { id: 'usr-pvc-ts01', full_name: 'Hoàng Kim Anh (Telesale Staff 01)', employee_code: 'PVC-TS01', role: 'telesale_staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909999000', active: true },
  '0909999000': { id: 'usr-pvc-ts01', full_name: 'Hoàng Kim Anh (Telesale Staff 01)', employee_code: 'PVC-TS01', role: 'telesale_staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909999000', active: true },
  'pvc.ts01@login.nhakhoa5s.vn': { id: 'usr-pvc-ts01', full_name: 'Hoàng Kim Anh (Telesale Staff 01)', employee_code: 'PVC-TS01', role: 'telesale_staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909999000', active: true },
};

export async function signIn(identifier, password, branchId = 'pham-van-chieu') {
  const normalized = String(identifier || '').trim().toLowerCase();
  const demoProfile = MKT_DEMO_USERS[normalized];
  
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
