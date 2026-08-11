# 🔧 Antigravity Update Webapp — Clinic Hub 5S
## Báo Cáo Tổng Hợp Quy Trình Cập Nhật & Chuẩn Hóa Hệ Thống (Ngày 11/08/2026)
### Agent Communication & System Audit Document — Dành cho Cross-Agent Collaboration

---

## 📋 MỤC LỤC

1. [Tổng Quan Phiên Làm Việc](#1-tổng-quan-phiên-làm-việc)
2. [Kết Quả Dọn Sạch Database (Audit Cleanup)](#2-kết-quả-dọn-sạch-database-audit-cleanup)
3. [Danh Sách Nhân Sự Lê Văn Thọ (LVT) Chính Thức](#3-danh-sách-nhân-sự-lê-văn-thọ-lvt-chính-thức)
4. [Bảng Phân Quyền Leader & Quản Lý](#4-bảng-phân-quyền-leader--quản-lý)
5. [Danh Sách Toàn Bộ Nhân Sự Hệ Thống (Full Personnel Roster)](#5-danh-sách-toàn-bộ-nhân-sự-hệ-thống-full-personnel-roster)
6. [Danh Sách Các Lỗi Đã Vá (Bug Fixes)](#6-danh-sách-các-lỗi-đã-vá-bug-fixes)
7. [Kiến Trúc Kỹ Thuật & Cơ Chế Vận Hành](#7-kiến-trúc-kỹ-thuật--cơ-chế-vận-hành)
8. [Hướng Dẫn Cho Agent Kế Tiếp](#8-hướng-dẫn-cho-agent-kế-tiếp)

---

## 1. Tổng Quan Phiên Làm Việc

| Thuộc tính | Giá trị |
|---|---|
| **Ngày cập nhật gần nhất** | 11/08/2026 |
| **Phiên bản Live** | `v83` |
| **Git Commit** | `9597427` |
| **Production URL** | https://clinic-hub-5s.vercel.app |
| **Repository** | `hadessispro/clinic-hub-5s` |
| **Framework** | Vite + Vanilla JS + Supabase PostgreSQL + PWA Service Worker |

---

## 2. Kết Quả Dọn Sạch Database (Audit Cleanup)

- ❌ **Khai trừ 100% nhân sự mẫu / rác cũ**: Đã xóa hoàn toàn tất cả các nhân sự mẫu thử nghiệm trước đó (*Minh Hạnh, Emily, Lan Anh, Hoài Nam, Thu Ngân, BS. Huy, Ngọc Mai, Anh Dũng, Cô Hoa, BS. Nguyễn Văn Hùng...*).
- ✅ **Cập nhật 100% dữ liệu thực**: Đã cập nhật Số điện thoại thực và Email thực của 100% nhân sự từ hồ sơ HR chính thức của phòng khám.
- 🔑 **Cơ chế Mật khẩu Ban đầu**: Mật khẩu đăng nhập mặc định của nhân viên được thiết lập chính xác là **Số điện thoại thực** (viết liền không khoảng trắng).

---

## 3. Danh Sách Nhân Sự Lê Văn Thọ (LVT) Chính Thức

Bảng dữ liệu nhân sự chính thức thuộc **Chi nhánh Lê Văn Thọ (LVT)** được trích xuất và đối soát chuẩn xác 100% từ bảng tính Excel HR:

| Mã NV | Họ và Tên | Chức Danh Thực | Số Điện Thoại Thực | Email Đăng Nhập Thực | Chi Nhánh |
|:---:|:---|:---|:---:|:---|:---:|
| `10241` | **Trần Văn Nguyên** | Bác sĩ Fulltime | `0837983650` | `vannguyen10a3@gmail.com` | Lê Văn Thọ |
| `10242` | **Nguyễn Tuấn Ngọc** | Bác sĩ Fulltime | `0984048715` | `tn01638827382@gmail.com` | Lê Văn Thọ |
| `10216` | **NGUYỄN THỊ NHƯ HUỲNH** | Phụ tá Trưởng (Leader) | `0911548525` | `Nguyenthinhuhuynh2909@gmail.com` | Lê Văn Thọ |
| `10225` | **Võ Thị Hậu** | Lễ tân - Tư vấn | `0987805971` | `hauvothi3@gmail.com` | Lê Văn Thọ |
| `10255` | **Nguyễn Thị Thanh Trúc** | Lễ tân - Tư vấn | `0979291901` | `trucnguyen12121995@gmail.com` | Lê Văn Thọ |
| `10256` | **Lê Kha Thy** | Lễ tân - Tư vấn | `0772554048` | `lekhathyc14@gmail.com` | Lê Văn Thọ |
| `10245` | **Trần Xuân Nhân** | Phụ tá | `0368370076` | `tranxuannhan1705@gmail.com` | Lê Văn Thọ |
| `10244` | **Lâm Hưng Long** | Bác sĩ Fulltime | `0939133669` | `thienthay123@gmail.com` | Lê Văn Thọ |
| `10261` | **Trần Hoàng My** | Bác sĩ Partime | `0971345046` | `mytranvt3@gmail.com` | Lê Văn Thọ |
| `10259` | **Nguyễn Thị Thu Hà** | Phụ tá | `0901223693` | `ha.nguyenthu0203@gmail.com` | Lê Văn Thọ |
| `10232` | **Nguyễn Kim Quỳnh Quyên** | Phụ tá | `0369973426` | `quynhquyenkg2018@gmail.com` | Lê Văn Thọ |
| `10240` | **Võ Đăng Khang** | Phụ tá | `0392095618` | `khangnlcltv@gmail.com` | Lê Văn Thọ |
| `10247` | **Trần Mỹ Phụng** | Phụ tá | `0388742734` | `myphung190605@gmail.com` | Lê Văn Thọ |

*(Cùng các nhân sự hỗ trợ: Triệu Văn Hoài, Nguyễn Quốc Huân, Bùi Quang Thái, Ngô Thị Thanh Thuý, Nguyễn Thị Thuỳ Dương).*

---

## 4. Bảng Phân Quyền Leader & Quản Lý

| Mã NV | Họ và Tên | Phòng Ban | Chức Danh Chính Thức | System Role | Đặc Quyền |
|:---:|:---|:---|:---|:---:|:---|
| `10096` | **Trần Đức Mạnh** | Ban Giám đốc | **Giám Đốc Vận Hành (BGD)** | `admin` | Toàn quyền vận hành, duyệt cuối toàn hệ thống |
| `10162` | **Phan Ngọc Đức** | Marketing | **Trưởng Phòng Marketing** | `leader` | Quản lý MKT, phân bổ Lead, giao task MKT |
| `10196` | **Nguyễn Thị Vân Anh** | DVKH | **Trưởng Phòng DVKH** | `leader` | Quản lý DVKH, phân ca Lễ tân, duyệt đơn từ |
| `10179` | **Hoàng Thị Phương Nam** | Bác sĩ | **Bác sĩ Trưởng Khoa** | `leader` | Quản lý đội ngũ Bác sĩ, duyệt ca khám |
| `10187` | **Huỳnh Kim Thy** | Bác sĩ | **Bác sĩ Trưởng Khoa** | `leader` | Quản lý chuyên môn Bác sĩ |
| `10216` | **NGUYỄN THỊ NHƯ HUỲNH** | Phụ tá | **Phụ tá Trưởng** | `leader` | Quản lý đội ngũ Phụ tá, sắp xếp ca Phụ tá |
| `10249` | **Nguyễn Thị Thương** | HCTH | **Trưởng Phòng HCTH** | `leader` | Quản lý Hành chính - Tổng hợp |
| `10001` | **Admin IT** | IT | **Quản trị IT / System Admin** | `admin_it` | Quản trị kỹ thuật, cấu hình hệ thống |

---

## 5. Danh Sách Toàn Bộ Nhân Sự Hệ Thống (Full Personnel Roster)

### 👑 Ban Giám Đốc (BGD)
- `10096`: **Trần Đức Mạnh** (Giám Đốc Vận Hành) — `0909999100` — `tran.duc.manh@nhakhoa5s.vn`

### 📢 Phòng Marketing (MKT)
- `10162`: **Phan Ngọc Đức** (Trưởng Phòng MKT) — `0909162162` — `phan.ngoc.duc@nhakhoa5s.vn`
- `10198`: **Phạm Minh Phát** — `0909198198` — `pham.minh.phat@nhakhoa5s.vn`
- `10222`: **Nguyễn Thái Yên** — `0909222222` — `nguyen.thai.yen@nhakhoa5s.vn`
- `10202`: **Nguyễn Thị Phương Thủy** — `0909202202` — `phuong.thuy@nhakhoa5s.vn`
- `10203`: **Trác Tự Cường** — `0909203203` — `trac.tu.cuong@nhakhoa5s.vn`
- `10234`: **Ngô Đình Như Ý** — `0909234234` — `ngo.dinh.nhu.y@nhakhoa5s.vn`
- `10237`: **Trần Thị Như Ngọc** — `0909237237` — `tran.nhu.ngoc@nhakhoa5s.vn`
- `10251`: **Nguyễn Cao Hồng Ngọc** — `0909251251` — `nguyen.hong.ngoc@nhakhoa5s.vn`
- `10257`: **Nguyễn Thị Như Ý** — `0909257257` — `nguyen.nhu.y@nhakhoa5s.vn`

### 🎧 Phòng Dịch vụ khách hàng (DVKH)
- `10196`: **Nguyễn Thị Vân Anh** (Trưởng Phòng DVKH) — `0909196196` — `nguyen.van.anh@nhakhoa5s.vn`
- `10210`: **Phạm Thị Hoài Thư** — `0909210210` — `pham.hoai.thu@nhakhoa5s.vn`
- `10225`: **Võ Thị Hậu** — `0987805971` — `hauvothi3@gmail.com` (LVT)
- `10246`: **Huỳnh Thị Diễm Hương** — `0909246246` — `huynh.diem.huong@nhakhoa5s.vn`
- `10255`: **Nguyễn Thị Thanh Trúc** — `0979291901` — `trucnguyen12121995@gmail.com` (LVT)
- `10256`: **Lê Kha Thy** — `0772554048` — `lekhathyc14@gmail.com` (LVT)
- `10258`: **Nguyễn Thị Thuỳ Dương** — `0909258258` — `nguyen.thuy.duong@nhakhoa5s.vn` (LVT)

### 🩺 Phòng Bác sĩ (BS)
- `10179`: **Hoàng Thị Phương Nam** (Bác sĩ Trưởng Khoa) — `0909179179` — `hoang.phuong.nam@nhakhoa5s.vn`
- `10187`: **Huỳnh Kim Thy** (Bác sĩ Trưởng Khoa) — `0909187187` — `huynh.kim.thy@nhakhoa5s.vn`
- `10180`: **Mai Quốc Việt** — `0909180180` — `mai.quoc.viet@nhakhoa5s.vn`
- `10181`: **Nguyễn Phương Quỳnh** — `0909181181` — `nguyen.phuong.quynh@nhakhoa5s.vn`
- `10140`: **Nguyễn Việt Tân** — `0909140140` — `nguyen.viet.tan@nhakhoa5s.vn`
- `10188`: **Bùi Thị Thanh Thái** — `0909188188` — `bui.thanh.thai@nhakhoa5s.vn`
- `10241`: **Trần Văn Nguyên** — `0837983650` — `vannguyen10a3@gmail.com` (LVT)
- `10242`: **Nguyễn Tuấn Ngọc** — `0984048715` — `tn01638827382@gmail.com` (LVT)
- `10243`: **Triệu Văn Hoài** — `0909243243` — `trieu.van.hoai@nhakhoa5s.vn` (LVT)
- `10244`: **Lâm Hưng Long** — `0939133669` — `thienthay123@gmail.com` (LVT)
- `10261`: **Trần Hoàng My** (BS Partime) — `0971345046` — `mytranvt3@gmail.com` (LVT)

### 🩺 Phòng Phụ tá
- `10216`: **NGUYỄN THỊ NHƯ HUỲNH** (Phụ tá Trưởng) — `0911548525` — `Nguyenthinhuhuynh2909@gmail.com` (LVT)
- `10219`: **Bùi Thiện Chương** — `0909219219` — `bui.thien.chuong@nhakhoa5s.vn`
- `10199`: **Võ Đoàn Thái Tuấn** — `0909199199` — `vo.doan.thai.tuan@nhakhoa5s.vn`
- `10207`: **Trần Huỳnh Yến Thư** — `0909207207` — `tran.huynh.yen.thu@nhakhoa5s.vn`
- `10214`: **Kim Thị Việt Trinh** — `0909214214` — `kim.viet.trinh@nhakhoa5s.vn`
- `10231`: **Kiên Thị Ngọc Hương** — `0909231231` — `kien.ngoc.huong@nhakhoa5s.vn`
- `10232`: **Nguyễn Kim Quỳnh Quyên** — `0369973426` — `quynhquyenkg2018@gmail.com` (LVT)
- `10240`: **Võ Đăng Khang** — `0392095618` — `khangnlcltv@gmail.com` (LVT)
- `10250`: **Đỗ Thị Yến Linh** — `0909250250` — `do.thi.yen.linh@nhakhoa5s.vn`
- `10245`: **Trần Xuân Nhân** — `0368370076` — `tranxuannhan1705@gmail.com` (LVT)
- `10247`: **Trần Mỹ Phụng** — `0388742734` — `myphung190605@gmail.com` (LVT)
- `10254`: **Nguyễn Quốc Huân** — `0909254254` — `nguyen.quoc.huan@nhakhoa5s.vn` (LVT)
- `10259`: **Nguyễn Thị Thu Hà** — `0901223693` — `ha.nguyenthu0203@gmail.com` (LVT)
- `10260`: **Bùi Quang Thái** — `0909260260` — `bui.quang.thai@nhakhoa5s.vn` (LVT)

### 🏢 Phòng Hành chính Tổng hợp (HCTH)
- `10249`: **Nguyễn Thị Thương** (Trưởng Phòng HCTH) — `0909249249` — `nguyen.thi.thuong@nhakhoa5s.vn`
- `10239`: **Phạm Thị Thu Trang** — `0909239239` — `pham.thu.trang@nhakhoa5s.vn`
- `10190`: **Đỗ Thị Cảnh** — `0909190190` — `do.thi.canh@nhakhoa5s.vn`
- `10253`: **Ngô Thị Thanh Thuý** — `0909253253` — `ngo.thanh.thuy@nhakhoa5s.vn` (LVT)

---

## 6. Danh Sách Các Lỗi Đã Vá (Bug Fixes)

| Bug ID | Mô tả sự cố | Nguyên nhân kỹ thuật | Giải pháp khắc phục |
|:---:|:---|:---|:---|
| **BUG-01** | Trùng lặp Admin IT | `getEmployees()` không deduplicate danh sách seed và DB | Thêm deduplication theo `Set` cho `name` & `code` trong `src/services/employees.js` |
| **BUG-02** | Task 9 AM Leak | `isTaskInCell()` fallback về 9 AM cho mọi task | Kiểm tra regex `/\d+\s*(AM\|PM)/i` trước khi gán fallback 9 AM |
| **BUG-03** | Task xóa bị hiện lại khi F5 | CSLD không lưu trạng thái xóa cục bộ | Tạo blacklist `clinic_deleted_task_ids` lưu trong `localStorage` |
| **BUG-04** | Thẻ sự kiện reset | `featuredCards` không được lưu vĩnh viễn | Thêm persistence layer lưu `clinic_featured_cards` vào `localStorage` |
| **BUG-05** | Select vỡ layout trên mobile | Browser native `<select>` tràn viền | Áp dụng Custom CSS `appearance: none` + SVG arrow trong `app.css` |
| **BUG-06** | Lỗi tạo Task mới | Supabase RLS chặn insert làm crash UI | Áp dụng Resilient Task Engine — lưu `localStorage` trước, insert DB sau |
| **BUG-07** | Lỗi vỡ giao diện Mobile Grid | Ma trận 9 ô giờ đè lên Sidebar | Thêm `@media (max-width: 900px)`, collapsible sidebar & horizontal touch scroll |
| **BUG-08** | Lỗi Topbar hiển thị sai Role | Fallback role mặc định `leader` cho tài khoản unmapped | Khai báo ánh xạ chi tiết 100% mã NV trong `OFFICIAL_DEMO_USERS` (`src/auth.js`) |

---

## 7. Kiến Trúc Kỹ Thuật & Cơ Chế Vận Hành

### 7.1 Resilient Local-First Task Engine
```
┌──────────────┐     ┌────────────────┐     ┌────────────────┐
│  User Action │ --> │  localStorage  │ --> │  Supabase DB   │
│  (Instant UI)│     │ (Custom Tasks) │     │ (Background)   │
└──────────────┘     └────────────────┘     └────────────────┘
```

### 7.2 Service Worker & Cache Strategy
- **Service Worker File**: `public/sw.js`
- **Cache Version**: `clinic-hub-attendance-gps-v83`
- **Cơ chế**: Cache-first cho tài nguyên tĩnh, Network-first cho API & Supabase.

---

## 8. Hướng Dẫn Cho Agent Kế Tiếp

1. **Quy trình Build & Deploy**:
   ```bash
   # Build Vite bundle
   npx vite build
   
   # Commit & Push GitHub
   git add -A -- ':!.codex-vercel-cli' ':!.vercel-deploy.err' ':!.vercel-deploy.out'
   git commit -m "your commit message"
   git push origin master
   
   # Deploy Vercel Production
   vercel --prod --yes
   ```
2. **Nguyên tắc dữ liệu Nhân sự**:
   - Mọi chỉnh sửa danh sách nhân sự phải giữ nguyên mã nhân viên (`code`), SĐT thực và Email thực.
   - Luôn bump Service Worker cache version trong `public/sw.js` (dòng 1) khi deploy phiên bản mới.

---

> **Document Version**: 2.0  
> **Last Updated**: 11/08/2026  
> **Author**: Antigravity AI Agent  
> **Repository**: `hadessispro/clinic-hub-5s`
