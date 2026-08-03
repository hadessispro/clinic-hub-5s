import { supabase } from '../supabase.js';

export async function loadClinicLocation(branchId = 'pham-van-chieu') {
  const { data, error } = await supabase
    .from('clinic_locations')
    .select('*')
    .eq('id', branchId)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    branchId: data.id,
    clinicName: data.name,
    clinicAddress: data.address,
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    allowedRadius: Number(data.allowed_radius_m),
    maxGpsAccuracy: Number(data.max_gps_accuracy_m),
    checkinTime: String(data.checkin_time || '08:00').slice(0, 5),
    checkinGraceMinutes: Number(data.checkin_grace_minutes || 0),
    timeZone: data.time_zone || 'Asia/Ho_Chi_Minh',
  };
}
