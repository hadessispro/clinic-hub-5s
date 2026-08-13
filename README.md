# 5S Clinic Hub

Web app quản lý và chấm công GPS cho chi nhánh 5S Lê Văn Thọ.

## Chạy cục bộ

```bash
npm install
copy .env.example .env
npm run dev
```

Cập nhật các biến Supabase trong `.env` trước khi chạy. Không commit `.env` hoặc secret key lên Git.

## Các lệnh chính

```bash
npm run dev
npm run build
npm run backend:build
npm run backend:dev
npm run provision:pvc
npm run location:update
```

## Hạ tầng

- Frontend/API: Vercel (`clinic-hub-5s`)
- Database/Auth/Storage: Supabase
- VPS API tùy chọn: NestJS + PostgreSQL (`apps/backend`), xem `apps/backend/README.md`
- Production: https://clinic-hub-5s.vercel.app

Xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md) để thiết lập database, tài khoản nhân viên và biến môi trường.

Khi nâng cấp database đang chạy, áp dụng `supabase-working-hours-migration.sql` để đồng bộ đầy đủ ca làm, lịch theo ngày và cách tính chấm công theo tài liệu 5S.
