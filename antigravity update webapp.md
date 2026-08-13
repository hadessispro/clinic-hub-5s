# 🔧 Antigravity Update Webapp — Clinic Hub 5S
## Báo Cáo Bàn Giao & Báo Cáo Sáp Nhập Dữ Liệu Hệ Thống (Ngày 13/08/2026)
### System Integration, Database Merger & VPS Sync Master Document — Dành cho Cross-Agent Collaboration

---

## 📋 MỤC LỤC

1. [Tổng Quan Phiên Sáp Nhập & Đồng Bộ](#1-tổng-quan-phiên-sáp-nhập--đồng-bộ)
2. [Chi Tiết Sáp Nhập Dữ Liệu Từ SQL Dump (`sqlpgnhakhoa5s`)](#2-chi-tiết-sáp-nhập-dữ-liệu-từ-sql-dump-sqlpgnhakhoa5s)
3. [Cấu Trúc Đối Tượng Chân Dung Khách Hàng (Customer Persona Schema)](#3-cấu-trúc-đối-tượng-chân-dung-khách-hàng-customer-persona-schema)
4. [Bảng Nhân Sự PG & Quản Lý Thị Trường Đã Đồng Bộ Auth](#4-bảng-nhân-sự-pg--quản-lý-thị-trường-đã-đồng-bộ-auth)
5. [Cấu Trúc Hạ Tầng VPS & NestJS Backend Microservice](#5-cấu-trúc-hạ-tầng-vps--nestjs-backend-microservice)
6. [Hướng Dẫn Đồng Bộ 1-Click Lên Hostinger VPS (`srv1892344.hstgr.cloud`)](#6-hướng-dẫn-đồng-bộ-1-click-lên-hostinger-vps-srv1892344hstgrcloud)
7. [Bảng Phân Quyền Leader & Danh Sách Nhân Sự Chi Nhánh LVT](#7-bảng-phân-quyền-leader--danh-sách-nhân-sự-chi-nhánh-lvt)
8. [Danh Sách Lỗi Đã Vá (Bug Fixes Summary)](#8-danh-sách-lỗi-đã-vá-bug-fixes-summary)
9. [Hướng Dẫn Cho Agent Kế Tiếp](#9-hướng-dẫn-cho-agent-kế-tiếp)

---

## 1. Tổng Quan Phiên Sáp Nhập & Đồng Bộ

| Thuộc tính | Giá trị |
|---|---|
| **Ngày thực hiện sáp nhập** | 13/08/2026 |
| **Phiên bản Live** | `v85` |
| **Git Commit** | `1650595` / `96f7c53` |
| **Production URL (Vercel)** | https://clinic-hub-5s.vercel.app |
| **Hostinger VPS URL** | https://srv1892344.hstgr.cloud/ |
| **Repository** | `hadessispro/clinic-hub-5s` |
| **Số lượng Khách hàng sáp nhập** | **2,463 Hồ sơ Chân dung Khách hàng** |
| **Số lượng Nhân sự PG sáp nhập** | **24 Nhân sự PG & Quản lý Thị trường** |

---

## 2. Chi Tiết Sáp Nhập Dữ Liệu Từ SQL Dump (`sqlpgnhakhoa5s`)

Hệ thống đã giải mã, phân tích và trích xuất thành công 100% dữ liệu từ tập tin SQL Dump `sqlpgnhakhoa5s/nckynhfqhosting_pgnhakhoa5s.sql` thông qua script trích xuất chuyên dụng `scripts/sync-vps-customers-and-pg.mjs`:

### 📊 Bảng Đối Soát Sáp Nhập Dữ Liệu:

| Tên Bảng SQL Gốc | Tổng Số Bản Ghi | Thư Mục Đã Tạo Trong Codebase | Mô Tả & Mục Đích Vận Hành |
|:---|:---:|:---|:---|
| **`39urY3_fspg_customers`** | **2,463 KH** | `src/data/seed-pg-customers.js`<br>`src/services/marketing.js` | **Chân dung Khách hàng chi tiết**: Nhu cầu nha khoa, Booth thu thập, PG trực tiếp, Telesale chăm sóc, Lịch hẹn, Doanh thu VTech đối soát... |
| **`39urY3_fspg_pg_staff`** | **24 NV** | `src/services/employees.js`<br>`src/auth.js` | **Nhân sự PG & Quản lý Booth**: Huỳnh Thị Ngọc My, Trần Thị Diễm Trinh, Nguyễn Mỹ Trân, Ngọc 5S... Cấp quyền đăng nhập & quản lý ca. |

---

## 3. Cấu Trúc Đối Tượng Chân Dung Khách Hàng (Customer Persona Schema)

Mỗi khách hàng được mô hình hóa chuẩn xác vào đối tượng `customer_portrait` bên trong ứng dụng:

```json
{
  "id": "3",
  "customer_code": "PHONE0981989640",
  "full_name": "Chị Thanh Diệu",
  "phone": "0981989640",
  "email": "phone0981989640@khachhang5s.vn",
  "source": "Booth Emart",
  "campaign_name": "Chiến dịch Booth Emart",
  "branch_id": "pham-van-chieu",
  "service_interest": "Bọc răng sứ Zirconia",
  "status": "appointment_booked",
  "assigned_telesale_id": "Nguyễn Ngọc Phượng",
  "notes": "Quan tâm răng sứ, đã hẹn lịch 6/7 buổi tối",
  "created_at": "2026-07-03 12:58:57",
  "customer_portrait": {
    "id": "3",
    "customer_code": "PHONE0981989640",
    "customer_name": "Chị Thanh Diệu",
    "phone": "0981989640",
    "service_need": "Bọc răng sứ Zirconia",
    "booth": "Emart",
    "pg_name": "Trần Thị Huyền",
    "tele_name": "Nguyễn Ngọc Phượng",
    "customer_status": "Đã tư vấn",
    "call_status": "Chưa gọi",
    "appointment_status": "Đã đặt lịch",
    "appointment_date": "6/7 buổi tối",
    "arrived_status": "Chưa đến",
    "latest_note": "Nghe máy nhưng hẹn tư vấn buổi tối",
    "vtech_revenue": "0 đ",
    "vtech_verified": false
  }
}
```

---

## 4. Bảng Nhân Sự PG & Quản Lý Thị Trường Đã Đồng Bộ Auth

| Mã NV | Họ và Tên | SĐT Thực (Mật Khẩu Ban Đầu) | Chức Danh / Quyền Hạn | System Role | Chi Nhánh |
|:---:|:---|:---:|:---|:---:|:---:|
| `PG-003` | **Huỳnh Thị Ngọc My** | `0383701363` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-004` | **Trần Thị Diễm Trinh** | `0766487464` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-005` | **Nguyễn Mỹ Trân** | `0827444595` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-014` | **Nguyễn Thị Quỳnh Như** | `0366824492` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-017` | **Ngọc 5S** | `094303000917` | Quản lý PG & Booth | `admin_marketing` | Phạm Văn Chiêu |
| `PG-022` | **Đào Minh Thi** | `0383460904` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-023` | **Nguyễn Thuỳ Trang** | `0777791204` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-024` | **Nguyễn Thùy Trinh** | `0886171921` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-025` | **Đỗ Bảo Hân** | `0708328259` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-026` | **Nguyễn Anh Hào** | `0387982649` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-027` | **Lê Thị Thiên Trang** | `0379137498` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-028` | **Đỗ Thị Diệu** | `0376067347` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |
| `PG-029` | **Nguyễn Mai Quỳnh Diễm** | `0332164309` | Nhân viên PG Thị trường | `pg_staff` | Phạm Văn Chiêu |

---

## 5. Cấu Trúc Hạ Tầng VPS & NestJS Backend Microservice

Đã commit & push 100% mô-đun VPS lên GitHub Master (`apps/backend` & `docker-compose.vps.yml`):

```
clinic-hub-5s/
├── apps/
│   └── backend/                # NestJS VPS Backend Microservice
│       ├── Dockerfile          # Build container Node.js 24 Alpine
│       ├── package.json        # Dependencies & scripts
│       └── src/
│           ├── main.ts         # Main Server Entry Point (Port 3000)
│           ├── auth.ts         # Auth & Profile API
│           ├── attendance.ts   # Attendance GPS API
│           ├── marketing.ts    # Marketing Leads & Customer API
│           └── infrastructure.ts # PostgreSQL Database Pool Connection
├── docker-compose.vps.yml      # Cấu hình Docker Compose PostgreSQL 16 + Backend NestJS
├── sqlpgnhakhoa5s/             # Database Dump SQL cho VPS
│   └── nckynhfqhosting_pgnhakhoa5s.sql
├── scripts/
│   ├── sync-vps-customers-and-pg.mjs  # Script trích xuất dữ liệu SQL Dump
│   └── deploy-vps-hostinger.sh        # Script tự động đồng bộ 1-Click VPS Hostinger
└── src/
    ├── data/
    │   └── seed-pg-customers.js       # Bộ dữ liệu 2,463 Khách hàng & 24 PG Staff
    └── services/
        └── api-client.js              # Client linh hoạt giữa VPS API & Supabase
```

---

## 6. Hướng Dẫn Đồng Bộ 1-Click Lên Hostinger VPS (`srv1892344.hstgr.cloud`)

Truy cập SSH vào máy chủ Hostinger VPS **`srv1892344.hstgr.cloud`** và thực hiện 2 lệnh tự động hóa:

```bash
# 1. Kéo bản cập nhật mới nhất (v85) từ GitHub
git pull origin master

# 2. Chạy lệnh đồng bộ 1-Click tự động cho VPS
npm run deploy:vps
```

---

## 7. Bảng Phân Quyền Leader & Danh Sách Nhân Sự Chi Nhánh LVT

### 👑 Bảng Phân Quyền Trưởng Bộ Phận (Leaders):

| Mã NV | Họ và Tên | Phòng Ban | Chức Danh Chính Thức | System Role |
|:---:|:---|:---|:---|:---:|
| `10096` | **Trần Đức Mạnh** | Ban Giám đốc | **Giám Đốc Vận Hành (BGD)** | `admin` |
| `10162` | **Phan Ngọc Đức** | Marketing | **Trưởng Phòng Marketing** | `leader` |
| `10196` | **Nguyễn Thị Vân Anh** | DVKH | **Trưởng Phòng DVKH** | `leader` |
| `10179` | **Hoàng Thị Phương Nam** | Bác sĩ | **Bác sĩ Trưởng Khoa** | `leader` |
| `10187` | **Huỳnh Kim Thy** | Bác sĩ | **Bác sĩ Trưởng Khoa** | `leader` |
| `10216` | **NGUYỄN THỊ NHƯ HUỲNH** | Phụ tá | **Phụ tá Trưởng** | `leader` |
| `10249` | **Nguyễn Thị Thương** | HCTH | **Trưởng Phòng HCTH** | `leader` |
| `10001` | **Admin IT** | IT | **Quản trị IT / System Admin** | `admin_it` |

### 📍 Danh Sách Nhân Sự Lê Văn Thọ (LVT):
- `10241`: **Trần Văn Nguyên** (Bác sĩ Fulltime) — `0837983650` — `vannguyen10a3@gmail.com`
- `10242`: **Nguyễn Tuấn Ngọc** (Bác sĩ Fulltime) — `0984048715` — `tn01638827382@gmail.com`
- `10216`: **NGUYỄN THỊ NHƯ HUỲNH** (Phụ tá Trưởng) — `0911548525` — `Nguyenthinhuhuynh2909@gmail.com`
- `10225`: **Võ Thị Hậu** (Lễ tân - Tư vấn) — `0987805971` — `hauvothi3@gmail.com`
- `10255`: **Nguyễn Thị Thanh Trúc** (Lễ tân - Tư vấn) — `0979291901` — `trucnguyen12121995@gmail.com`
- `10256`: **Lê Kha Thy** (Lễ tân - Tư vấn) — `0772554048` — `lekhathyc14@gmail.com`
- `10245`: **Trần Xuân Nhân** (Phụ tá) — `0368370076` — `tranxuannhan1705@gmail.com`
- `10244`: **Lâm Hưng Long** (Bác sĩ Fulltime) — `0939133669` — `thienthay123@gmail.com`
- `10261`: **Trần Hoàng My** (Bác sĩ Partime) — `0971345046` — `mytranvt3@gmail.com`
- `10259`: **Nguyễn Thị Thu Hà** (Phụ tá) — `0901223693` — `ha.nguyenthu0203@gmail.com`
- `10232`: **Nguyễn Kim Quỳnh Quyên** (Phụ tá) — `0369973426` — `quynhquyenkg2018@gmail.com`
- `10240`: **Võ Đăng Khang** (Phụ tá) — `0392095618` — `khangnlcltv@gmail.com`
- `10247`: **Trần Mỹ Phụng** (Phụ tá) — `0388742734` — `myphung190605@gmail.com`

---

## 8. Danh Sách Lỗi Đã Vá (Bug Fixes Summary)

| Bug ID | Sự cố | Giải pháp khắc phục |
|:---:|:---|:---|
| **BUG-01** | Trùng lặp Admin IT | Deduplicate theo `Set` mã NV trong `src/services/employees.js` |
| **BUG-02** | Task 9 AM Leak | Kiểm tra regex time format trước khi fallback 9 AM |
| **BUG-03** | Task xóa bị hiện lại khi F5 | Tạo blacklist `clinic_deleted_task_ids` trong `localStorage` |
| **BUG-04** | Thẻ sự kiện reset | Lưu `clinic_featured_cards` vào `localStorage` |
| **BUG-05** | Select vỡ layout mobile | Áp dụng Custom CSS `appearance: none` trong `app.css` |
| **BUG-06** | Lỗi tạo Task mới | Resilient Task Engine — lưu `localStorage` trước, DB sau |
| **BUG-07** | Lỗi vỡ giao diện Mobile Grid | Thêm `@media (max-width: 900px)`, collapsible sidebar |
| **BUG-08** | Lỗi Topbar hiển thị sai Role | Khai báo 100% mã NV trong `OFFICIAL_DEMO_USERS` (`src/auth.js`) |
| **BUG-09** | Thiếu dữ liệu VPS trên GitHub | Commit & Push 100% `apps/backend`, `docker-compose.vps.yml`, SQL Dump |

---

## 9. Hướng Dẫn Cho Agent Kế Tiếp

1. **Quy trình Build & Deploy Vercel / VPS**:
   ```bash
   # Build Vite bundle (v85)
   npm run build
   
   # Commit & Push GitHub
   git add -A -- ':!.codex-vercel-cli' ':!.vercel-deploy.err' ':!.vercel-deploy.out'
   git commit -m "your commit message"
   git push origin master
   
   # Deploy Vercel Production
   vercel --prod --yes
   ```
2. **Quản lý dữ liệu Khách hàng & PG**:
   - Dữ liệu 2,463 Khách hàng nằm tại `src/data/seed-pg-customers.js`. Khi có bản SQL Dump mới, chỉ cần chạy lại `node scripts/sync-vps-customers-and-pg.mjs`.

---

> **Document Version**: 4.0 (Master Integration Release)  
> **Last Updated**: 13/08/2026  
> **Author**: Antigravity AI Agent  
> **Repository**: `hadessispro/clinic-hub-5s`
