-- Migration SQL: Phân hệ Marketing & Telesale cho 5S Clinic Hub
-- Tương thích với Supabase PostgreSQL và PostgreSQL VPS

-- 1. Bảng Trạng thái & Danh sách Lead (Khách hàng tiềm năng)
CREATE TABLE IF NOT EXISTS public.marketing_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    source TEXT NOT NULL DEFAULT 'Facebook Ads', -- Facebook Ads, Google Ads, TikTok, Zalo OA, Referral, Website, Direct
    campaign_name TEXT DEFAULT 'Chiến dịch Chung',
    branch_id TEXT NOT NULL DEFAULT 'le-van-tho', -- le-van-tho, pham-van-chieu
    service_interest TEXT DEFAULT 'Tư vấn tổng quát', -- Trồng răng Implant, Niềng răng, Bọc sứ, Tẩy trắng, Khám tổng quát
    status TEXT NOT NULL DEFAULT 'new', -- new, contacted, appointment_booked, visited, converted, cancelled
    assigned_telesale_id TEXT, -- User ID / Employee Code của Telesale
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Bảng Nhật ký Cuộc gọi & Hẹn tái gọi của Telesale
CREATE TABLE IF NOT EXISTS public.telesale_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
    telesale_id TEXT NOT NULL,
    call_status TEXT NOT NULL DEFAULT 'interested', -- busy, no_answer, interested, appointment_booked, rejected
    note TEXT,
    appointment_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Bảng Quản lý Chiến dịch Marketing & Ngân sách
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'Facebook',
    budget NUMERIC(15, 2) DEFAULT 0,
    spent NUMERIC(15, 2) DEFAULT 0,
    leads_count INT DEFAULT 0,
    appointments_count INT DEFAULT 0,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tạo Index tìm kiếm nhanh
CREATE INDEX IF NOT EXISTS idx_marketing_leads_phone ON public.marketing_leads(phone);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_status ON public.marketing_leads(status);
CREATE INDEX IF NOT EXISTS idx_marketing_leads_assigned ON public.marketing_leads(assigned_telesale_id);
CREATE INDEX IF NOT EXISTS idx_telesale_call_logs_lead ON public.telesale_call_logs(lead_id);

-- Bật RLS (Row Level Security)
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telesale_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

-- Cấp quyền truy cập công khai/authenticated tạm thời
CREATE POLICY "Allow public read leads" ON public.marketing_leads FOR SELECT USING (true);
CREATE POLICY "Allow public insert/update leads" ON public.marketing_leads FOR ALL USING (true);
CREATE POLICY "Allow public call logs" ON public.telesale_call_logs FOR ALL USING (true);
CREATE POLICY "Allow public campaigns" ON public.marketing_campaigns FOR ALL USING (true);

-- ================================================================
-- BƯỚC 1: Bổ sung 5 Enum value mới vào clinic_role (Chạy riêng câu lệnh này trước, bấm Run)
-- ================================================================
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'admin_marketing';
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'support_marketing';
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'pg_staff';
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'telesale_leader';
ALTER TYPE clinic_role ADD VALUE IF NOT EXISTS 'telesale_staff';

-- ================================================================
-- BƯỚC 2: Tạo User Auth, Nhân viên & Phân quyền Profile
-- ================================================================

-- 1. Chèn Tài khoản vào auth.users (Gỡ rào cản Khóa ngoại Foreign Key profiles_id_fkey)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES 
  ('00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin.mkt@login.nhakhoa5s.vn', crypt('0909111222', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Trần Quốc Bảo"}', now(), now()),
  ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'support.mkt@login.nhakhoa5s.vn', crypt('0909333444', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Nguyễn Thị Mai"}', now(), now()),
  ('00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pg.field@login.nhakhoa5s.vn', crypt('0909555666', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Lê Văn Nam"}', now(), now()),
  ('00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lead.telesale@login.nhakhoa5s.vn', crypt('0909777888', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Phạm Thu Hương"}', now(), now()),
  ('00000000-0000-0000-0000-000000000095', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pvc.ts01@login.nhakhoa5s.vn', crypt('0909999000', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Hoàng Kim Anh"}', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- 2. Chèn Thông tin Nhân viên vào public.employees
INSERT INTO public.employees (code, employee_number, full_name, department, title, phone, email, branch_id, status)
VALUES 
  ('MKT-01', 'MKT-01', 'Trần Quốc Bảo', 'mkt', 'admin_marketing', '0909111222', 'admin.mkt@login.nhakhoa5s.vn', 'pham-van-chieu', 'active'),
  ('MKT-SUP', 'MKT-SUP', 'Nguyễn Thị Mai', 'mkt', 'support_marketing', '0909333444', 'support.mkt@login.nhakhoa5s.vn', 'pham-van-chieu', 'active'),
  ('PG-FIELD', 'PG-FIELD', 'Lê Văn Nam', 'mkt', 'pg_staff', '0909555666', 'pg.field@login.nhakhoa5s.vn', 'le-van-tho', 'active'),
  ('TS-LEAD', 'TS-LEAD', 'Phạm Thu Hương', 'mkt', 'telesale_leader', '0909777888', 'lead.telesale@login.nhakhoa5s.vn', 'pham-van-chieu', 'active'),
  ('PVC-TS01', 'PVC-TS01', 'Hoàng Kim Anh', 'mkt', 'telesale_staff', '0909999000', 'pvc.ts01@login.nhakhoa5s.vn', 'pham-van-chieu', 'active')
ON CONFLICT (code) DO UPDATE SET 
  full_name = EXCLUDED.full_name,
  title = EXCLUDED.title,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  status = EXCLUDED.status;

-- 3. Chèn Hồ sơ Phân quyền Profile vào public.profiles
INSERT INTO public.profiles (id, employee_code, full_name, role, department, branch_id, active)
VALUES 
  ('00000000-0000-0000-0000-000000000091', 'MKT-01', 'Trần Quốc Bảo (Admin Marketing)', 'admin_marketing', 'mkt', 'pham-van-chieu', true),
  ('00000000-0000-0000-0000-000000000092', 'MKT-SUP', 'Nguyễn Thị Mai (Support Marketing)', 'support_marketing', 'mkt', 'pham-van-chieu', true),
  ('00000000-0000-0000-0000-000000000093', 'PG-FIELD', 'Lê Văn Nam (PG Thị trường)', 'pg_staff', 'mkt', 'le-van-tho', true),
  ('00000000-0000-0000-0000-000000000094', 'TS-LEAD', 'Phạm Thu Hương (Quản lý Telesale)', 'telesale_leader', 'mkt', 'pham-van-chieu', true),
  ('00000000-0000-0000-0000-000000000095', 'PVC-TS01', 'Hoàng Kim Anh (Telesale Staff 01)', 'telesale_staff', 'mkt', 'pham-van-chieu', true)
ON CONFLICT (id) DO UPDATE SET 
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  active = EXCLUDED.active;
