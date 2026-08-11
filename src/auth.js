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
  
  // Trưởng các phòng ban (Leaders)
  '10162': { id: 'usr-10162', full_name: 'Phan Ngọc Đức', employee_code: '10162', role: 'leader', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909162162', active: true },
  '10196': { id: 'usr-10196', full_name: 'Nguyễn Thị Vân Anh', employee_code: '10196', role: 'leader', department: 'dvkh', branch_id: 'pham-van-chieu', phone: '0909196196', active: true },
  '10179': { id: 'usr-10179', full_name: 'Hoàng Thị Phương Nam', employee_code: '10179', role: 'leader', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909179179', active: true },
  '10187': { id: 'usr-10187', full_name: 'Huỳnh Kim Thy', employee_code: '10187', role: 'leader', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909187187', active: true },
  '10219': { id: 'usr-10219', full_name: 'Bùi Thiện Chương', employee_code: '10219', role: 'leader', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909219219', active: true },
  '10249': { id: 'usr-10249', full_name: 'Nguyễn Thị Thương', employee_code: '10249', role: 'leader', department: 'hcth', branch_id: 'pham-van-chieu', phone: '0909249249', active: true },
  '10001': { id: 'usr-10001', full_name: 'Admin IT', employee_code: '10001', role: 'admin_it', department: 'it', branch_id: 'pham-van-chieu', phone: '0901111111', active: true },

  // Phòng Marketing (Staff)
  '10198': { id: 'usr-10198', full_name: 'Phạm Minh Phát', employee_code: '10198', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909198198', active: true },
  '10222': { id: 'usr-10222', full_name: 'Nguyễn Thái Yên', employee_code: '10222', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909222222', active: true },
  '10202': { id: 'usr-10202', full_name: 'Nguyễn Thị Phương Thủy', employee_code: '10202', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909202202', active: true },
  '10203': { id: 'usr-10203', full_name: 'Trác Tự Cường', employee_code: '10203', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909203203', active: true },
  '10234': { id: 'usr-10234', full_name: 'Ngô Đình Như Ý', employee_code: '10234', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909234234', active: true },
  '10237': { id: 'usr-10237', full_name: 'Trần Thị Như Ngọc', employee_code: '10237', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909237237', active: true },
  '10251': { id: 'usr-10251', full_name: 'Nguyễn Cao Hồng Ngọc', employee_code: '10251', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909251251', active: true },
  '10257': { id: 'usr-10257', full_name: 'Nguyễn Thị Như Ý', employee_code: '10257', role: 'staff', department: 'mkt', branch_id: 'pham-van-chieu', phone: '0909257257', active: true },

  // Phòng DVKH (Staff)
  '10210': { id: 'usr-10210', full_name: 'Phạm Thị Hoài Thư', employee_code: '10210', role: 'staff', department: 'dvkh', branch_id: 'pham-van-chieu', phone: '0909210210', active: true },
  '10225': { id: 'usr-10225', full_name: 'Võ Thị Hậu', employee_code: '10225', role: 'staff', department: 'dvkh', branch_id: 'pham-van-chieu', phone: '0909225225', active: true },
  '10246': { id: 'usr-10246', full_name: 'Huỳnh Thị Diễm Hương', employee_code: '10246', role: 'staff', department: 'dvkh', branch_id: 'pham-van-chieu', phone: '0909246246', active: true },
  '10255': { id: 'usr-10255', full_name: 'Nguyễn Thị Thanh Trúc', employee_code: '10255', role: 'staff', department: 'dvkh', branch_id: 'le-van-tho', phone: '0909255255', active: true },
  '10256': { id: 'usr-10256', full_name: 'Lê Kha Thy', employee_code: '10256', role: 'staff', department: 'dvkh', branch_id: 'le-van-tho', phone: '0909256256', active: true },
  '10258': { id: 'usr-10258', full_name: 'Nguyễn Thị Thuỳ Dương', employee_code: '10258', role: 'staff', department: 'dvkh', branch_id: 'le-van-tho', phone: '0909258258', active: true },

  // Phòng Bác sĩ (Staff)
  '10180': { id: 'usr-10180', full_name: 'Mai Quốc Việt', employee_code: '10180', role: 'staff', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909180180', active: true },
  '10181': { id: 'usr-10181', full_name: 'Nguyễn Phương Quỳnh', employee_code: '10181', role: 'staff', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909181181', active: true },
  '10140': { id: 'usr-10140', full_name: 'Nguyễn Việt Tân', employee_code: '10140', role: 'staff', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909140140', active: true },
  '10188': { id: 'usr-10188', full_name: 'Bùi Thị Thanh Thái', employee_code: '10188', role: 'staff', department: 'bs', branch_id: 'pham-van-chieu', phone: '0909188188', active: true },
  '10241': { id: 'usr-10241', full_name: 'Trần Văn Nguyên', employee_code: '10241', role: 'staff', department: 'bs', branch_id: 'le-van-tho', phone: '0909241241', active: true },
  '10242': { id: 'usr-10242', full_name: 'Nguyễn Tuấn Ngọc', employee_code: '10242', role: 'staff', department: 'bs', branch_id: 'le-van-tho', phone: '0909242242', active: true },
  '10243': { id: 'usr-10243', full_name: 'Triệu Văn Hoài', employee_code: '10243', role: 'staff', department: 'bs', branch_id: 'le-van-tho', phone: '0909243243', active: true },
  '10244': { id: 'usr-10244', full_name: 'Lâm Hưng Long', employee_code: '10244', role: 'staff', department: 'bs', branch_id: 'le-van-tho', phone: '0909244244', active: true },

  // Phòng Phụ tá (Staff)
  '10199': { id: 'usr-10199', full_name: 'Võ Đoàn Thái Tuấn', employee_code: '10199', role: 'staff', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909199199', active: true },
  '10207': { id: 'usr-10207', full_name: 'Trần Huỳnh Yến Thư', employee_code: '10207', role: 'staff', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909207207', active: true },
  '10214': { id: 'usr-10214', full_name: 'Kim Thị Việt Trinh', employee_code: '10214', role: 'staff', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909214214', active: true },
  '10216': { id: 'usr-10216', full_name: 'Nguyễn Thị Như Huỳnh', employee_code: '10216', role: 'staff', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909216216', active: true },
  '10231': { id: 'usr-10231', full_name: 'Kiên Thị Ngọc Hương', employee_code: '10231', role: 'staff', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909231231', active: true },
  '10232': { id: 'usr-10232', full_name: 'Nguyễn Kim Quỳnh Quyên', employee_code: '10232', role: 'staff', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909232232', active: true },
  '10240': { id: 'usr-10240', full_name: 'Võ Đăng Khang', employee_code: '10240', role: 'staff', department: 'phuta', branch_id: 'le-van-tho', phone: '0909240240', active: true },
  '10250': { id: 'usr-10250', full_name: 'Đỗ Thị Yến Linh', employee_code: '10250', role: 'staff', department: 'phuta', branch_id: 'pham-van-chieu', phone: '0909250250', active: true },
  '10245': { id: 'usr-10245', full_name: 'Trần Xuân Nhân', employee_code: '10245', role: 'staff', department: 'le-van-tho', phone: '0909245245', active: true },
  '10247': { id: 'usr-10247', full_name: 'Trần Mỹ Phụng', employee_code: '10247', role: 'staff', department: 'phuta', branch_id: 'le-van-tho', phone: '0909247247', active: true },
  '10254': { id: 'usr-10254', full_name: 'Nguyễn Quốc Huân', employee_code: '10254', role: 'staff', department: 'phuta', branch_id: 'le-van-tho', phone: '0909254254', active: true },
  '10259': { id: 'usr-10259', full_name: 'Nguyễn Thị Thu Hà', employee_code: '10259', role: 'staff', department: 'phuta', branch_id: 'le-van-tho', phone: '0909259259', active: true },
  '10260': { id: 'usr-10260', full_name: 'Bùi Quang Thái', employee_code: '10260', role: 'staff', department: 'phuta', branch_id: 'le-van-tho', phone: '0909260260', active: true },

  // Phòng HCTH (Staff)
  '10239': { id: 'usr-10239', full_name: 'Phạm Thị Thu Trang', employee_code: '10239', role: 'staff', department: 'hcth', branch_id: 'pham-van-chieu', phone: '0909239239', active: true },
  '10190': { id: 'usr-10190', full_name: 'Đỗ Thị Cảnh', employee_code: '10190', role: 'staff', department: 'hcth', branch_id: 'pham-van-chieu', phone: '0909190190', active: true },
  '10253': { id: 'usr-10253', full_name: 'Ngô Thị Thanh Thuý', employee_code: '10253', role: 'staff', department: 'hcth', branch_id: 'le-van-tho', phone: '0909253253', active: true },
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
