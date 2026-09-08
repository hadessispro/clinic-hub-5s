import { dataClient } from './data-client.js';
import { getEffectiveBranchId, setActiveBranch } from './branch.js';

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
    dataClient.auth.getSession().then(async ({ data: { session } }) => {
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
    dataClient.auth.onAuthStateChange((event, session) => {
      console.log('[Auth Event]', event, session?.user?.email);

      // Defer profile loading until the local auth event has completed.
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
    const { data, error } = await dataClient
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
  const { data, error } = await dataClient.auth.signInWithIdentifier({ identifier: normalized, password, branchId });
  if (error) throw error;
  currentUser = data.user;
  await loadProfile(data.user.id);
  if (!currentProfile || currentProfile.active === false) {
    await dataClient.auth.signOut();
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

export async function signOut() {
  const { error } = await dataClient.auth.signOut();
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
