# Triển khai Clinic Hub 5S lên VPS

Gói này đưa phiên bản hiện tại lên Docker theo mô hình hai container: Caddy phục vụ PWA/HTTPS và Node chạy toàn bộ API hiện có. Dữ liệu vẫn dùng Supabase trong giai đoạn chuyển tiếp để không làm gián đoạn chấm công, lịch làm và đơn từ.

## Điều kiện

- Ubuntu 22.04/24.04, tối thiểu 2 vCPU và 4 GB RAM.
- Domain đã trỏ bản ghi A/AAAA về IP VPS.
- Mở TCP 22, 80, 443 và UDP 443.
- Có giá trị môi trường production hiện dùng trên Vercel/Supabase.

## Cài đặt lần đầu

```sh
git clone https://github.com/hadessispro/clinic-hub-5s.git
cd clinic-hub-5s
sudo sh deploy/deploy.sh
```

Lần chạy đầu tạo `/opt/clinic-hub-5s/.env.vps` và dừng lại. Điền biến thật vào file đó, không đưa file lên Git. Sau đó chạy lại:

```sh
sudo sh /opt/clinic-hub-5s/deploy/deploy.sh
```

## Kiểm tra và rollback

```sh
cd /opt/clinic-hub-5s
docker compose ps
docker compose logs --tail=200 api web
curl -fsS https://your-domain.example/healthz

# Rollback về commit đã biết
git checkout <commit-an-toan>
docker compose --env-file .env.vps build
docker compose --env-file .env.vps up -d
```

Không tắt Vercel trước khi domain VPS qua healthcheck, đăng nhập, check-in thử nghiệm, push notification và đồng bộ Sheet. Việc thay Supabase bằng PostgreSQL riêng là giai đoạn tiếp theo và cần migration/đối soát dữ liệu riêng.
