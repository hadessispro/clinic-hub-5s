-- Permit controlled indoor GPS readings while keeping the 100 m geofence.
-- Application code narrows the effective radius when accuracy is above 50 m.
update public.clinic_locations
set max_gps_accuracy_m = 100,
    updated_at = now()
where id in ('pham-van-chieu', 'le-van-tho');

