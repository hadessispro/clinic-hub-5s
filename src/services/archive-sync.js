import { supabase } from '../supabase.js';

export async function triggerArchive2Months() {
  if (!navigator.onLine) {
    throw new Error('Vui lòng kết nối mạng để thực hiện xuất archive.');
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (supabase.isLocal) {
    const { data: result, error } = await supabase.rpc('archive_old_records');
    if (error) throw error;
    return result;
  }
  
  const response = await fetch('/api/archive-2months', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Lỗi khi kích hoạt xuất archive 2 tháng.');
  }

  return result;
}
