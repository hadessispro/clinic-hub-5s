# Clinic Hub NestJS API

Backend dành cho VPS. API lắng nghe tại `0.0.0.0:3000`, có global prefix `/api` và xác thực Bearer token bằng Supabase Auth.

## Chạy cục bộ

Từ thư mục gốc:

```bash
pnpm install
pnpm backend:build
pnpm backend:start
```

Các biến bắt buộc: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (hoặc service-role key), `POSTGRES_*`/`DATABASE_URL`, và `CORS_ORIGINS`.

## Triển khai VPS

1. Điền `.env.vps` trên máy chủ; không commit file này.
2. Trỏ `CORS_ORIGINS` về domain frontend chính xác.
3. Chạy `docker compose -f docker-compose.vps.yml up -d --build`.
4. Reverse proxy HTTPS tới `127.0.0.1:3000`.
5. Kiểm tra `GET https://<api-domain>/api/healthz`.
6. Build frontend với `VITE_API_BASE_URL=https://<api-domain>/api`.

`healthz` không yêu cầu đăng nhập. Các endpoint dữ liệu còn lại yêu cầu access token hợp lệ. PostgreSQL không được publish ra Internet; Compose chỉ publish NestJS trên loopback để đi qua reverse proxy.
