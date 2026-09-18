-- Cập nhật vai trò cho toàn bộ nhân sự bộ phận Phụ tá sang phu_ta / phu_ta_truong
-- để kích hoạt quyền truy cập Kho ảnh Phụ tá (phu-ta-drive) và Kho vật tư (kho-hang).

BEGIN;

-- 1. Cập nhật các nhân sự bộ phận phụ tá (ngoại trừ trưởng bộ phận) sang vai trò 'phu_ta'
UPDATE app.records
SET payload = jsonb_set(payload, '{role}', '"phu_ta"'),
    updated_at = now()
WHERE entity_type = 'profiles'
  AND deleted_at IS NULL
  AND payload->>'employee_code' IN (
    SELECT payload->>'code'
    FROM app.records
    WHERE entity_type = 'employees'
      AND deleted_at IS NULL
      AND (
        payload->>'department' ILIKE '%phuta%'
        OR payload->>'department' ILIKE '%phu_ta%'
        OR payload->>'title' ILIKE '%phụ tá%'
      )
      AND payload->>'code' NOT IN ('PVC003')
  );

-- 2. Đảm bảo trưởng bộ phận phụ tá (Nguyễn Thị Như Huỳnh - PVC003) mang vai trò 'phu_ta_truong'
UPDATE app.records
SET payload = jsonb_set(payload, '{role}', '"phu_ta_truong"'),
    updated_at = now()
WHERE entity_type = 'profiles'
  AND deleted_at IS NULL
  AND payload->>'employee_code' = 'PVC003';

COMMIT;

-- 3. Kiểm tra lại kết quả
SELECT record_key,
       payload->>'employee_code' AS ma_nv,
       payload->>'full_name' AS ho_ten,
       payload->>'role' AS vai_tro_moi,
       updated_at
FROM app.records
WHERE entity_type = 'profiles'
  AND deleted_at IS NULL
  AND payload->>'employee_code' IN (
    SELECT payload->>'code'
    FROM app.records
    WHERE entity_type = 'employees'
      AND deleted_at IS NULL
      AND (
        payload->>'department' ILIKE '%phuta%'
        OR payload->>'department' ILIKE '%phu_ta%'
        OR payload->>'title' ILIKE '%phụ tá%'
      )
  )
ORDER BY payload->>'employee_code';
