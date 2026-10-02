-- Migration 058: Đồng bộ mã telesale PG-LEGACY-17 / PG-LEGACY-16 về PVC-17 cho Nguyễn Thị Khánh My
-- Lý do: Dữ liệu lead import từ hệ thống cũ gắn mã PG-LEGACY-17/16, trong khi tài khoản hoạt động của Khánh My là PVC-17.

UPDATE marketing.leads
SET assigned_telesale_code = 'PVC-17',
    updated_at = now()
WHERE assigned_telesale_code IN ('PG-LEGACY-17', 'PG-LEGACY-16');

UPDATE marketing.call_logs
SET telesale_code = 'PVC-17'
WHERE telesale_code IN ('PG-LEGACY-17', 'PG-LEGACY-16');
