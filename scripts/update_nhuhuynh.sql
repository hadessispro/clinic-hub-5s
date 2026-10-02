-- 1. Ngày 19/09: Ca chiều, Huỳnh vào lúc 7h45 để hỗ trợ imp Phạm Văn Chiêu. Tăng ca 1h50p (110 phút)
UPDATE app.records
SET payload = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(payload, '{request_type}', '"Đơn tăng ca"'),
              '{overtime_minutes}', '110'
            ),
            '{status}', '"approved"'
          ),
          '{leader_status}', '"approved"'
        ),
        '{operations_status}', '"approved"'
      ),
      '{reviewer_code}', '"admin_it"'
    ),
    '{reason}', '"Huỳnh vào lúc 7h45 để hỗ trợ imp Phạm Văn Chiêu. Tăng ca 1h50p"'
  ),
  '{updated_at}', to_jsonb(now())
),
updated_at = now()
WHERE entity_type = 'leave_requests'
  AND payload->>'id' = 'd2940afd-9809-4dfb-b557-46d0252f90b6';

-- 2. Ngày 22/09: Tăng ca 45 phút, ra ca lúc 18h45
UPDATE app.records
SET payload = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(payload, '{request_type}', '"Đơn tăng ca"'),
              '{overtime_minutes}', '45'
            ),
            '{status}', '"approved"'
          ),
          '{leader_status}', '"approved"'
        ),
        '{operations_status}', '"approved"'
      ),
      '{reviewer_code}', '"admin_it"'
    ),
    '{reason}', '"Tăng ca 45 phút, ra ca lúc 18h45"'
  ),
  '{updated_at}', to_jsonb(now())
),
updated_at = now()
WHERE entity_type = 'leave_requests'
  AND payload->>'id' = 'd1f75ef0-e909-4804-b53b-6fbfb2ff9e00';

-- Xóa đơn trùng bị reject ngày 22/09
DELETE FROM app.records
WHERE entity_type = 'leave_requests'
  AND payload->>'id' = '5da7d5a0-bb4c-483e-a96e-a744bfd0d7b1';

-- 3. Ngày 23/09: Chuẩn hóa tăng ca thành 45 phút
UPDATE app.records
SET payload = jsonb_set(
  jsonb_set(
    jsonb_set(payload, '{overtime_minutes}', '45'),
    '{reason}', '"Ca full thẩm Định, từ 6h40 đến 20h00. Tăng ca 45p"'
  ),
  '{updated_at}', to_jsonb(now())
),
updated_at = now()
WHERE entity_type = 'leave_requests'
  AND payload->>'id' = '74d50c01-ba1e-45ea-ba90-e02b6b558845';
