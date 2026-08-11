import { supabase } from './supabase.js';
import { BRANCHES, getEffectiveBranchId, loginEmailFor, setActiveBranch } from './branch.js';

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

export async function signIn(identifier, password, branchId = 'pham-van-chieu') {
  const normalized = String(identifier || '').trim().toLowerCase();
  if (supabase.isLocal) {
    const { data, error } = await supabase.auth.signInWithIdentifier({ identifier: normalized, password, branchId });
    if (error) throw error;
    currentUser = data.user;
    await loadProfile(data.user.id);
    if (!currentProfile || currentProfile.active === false) {
      await supabase.auth.signOut();
      currentUser = null;
      currentProfile = null;
      throw new Error('Tài khoản chưa có hồ sơ hoạt động trên hệ thống VPS.');
    }
    const effectiveBranch = getEffectiveBranchId(currentProfile, branchId);
    setActiveBranch(effectiveBranch);
    localStorage.setItem('5s_clinic_active_branch', effectiveBranch);
    localStorage.setItem('5s_clinic_last_branch', effectiveBranch);
    notifyListeners();
    return data;
  }
  let email = normalized.includes('@') ? normalized : null;
  const branchCandidates = branchId === 'all' ? Object.keys(BRANCHES) : [branchId];
  for (const candidate of branchCandidates) {
    const { data: resolvedEmail, error: resolveError } = await supabase.rpc('resolve_login_email', {
      p_branch_id: candidate,
      p_identifier: normalized,
    });
    if (!resolveError && resolvedEmail) { email = resolvedEmail; break; }
  }
  if (!email) email = loginEmailFor(branchCandidates[0], normalized);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  await loadProfile(data.user.id);
  
  if (!currentProfile || currentProfile.active === false) {
    // If auth succeeds but database profile is missing, clear session and throw error
    await supabase.auth.signOut();
    currentUser = null;
    currentProfile = null;
    notifyListeners();
    throw new Error(currentProfile?.active === false ? 'Tài khoản đang tạm khóa. Vui lòng liên hệ Nhân sự.' : 'Tài khoản đã đăng ký nhưng chưa có hồ sơ phân quyền trong hệ thống.');
  }
  const canUseManagedBranch = ['admin', 'hr', 'leader', 'admin_it', 'pg_staff'].includes(currentProfile.role);
  if (branchId !== 'all' && !normalized.includes('@') && !canUseManagedBranch && currentProfile.branch_id && currentProfile.branch_id !== branchId) {
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
  return data;
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
