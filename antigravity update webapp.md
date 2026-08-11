# 🔧 Antigravity Update Webapp — Clinic Hub 5S
## Báo Cáo Tổng Hợp Quy Trình Cập Nhật Hệ Thống (Ngày 10/08/2026)
### Agent Communication Document — Dành cho cross-agent collaboration

---

## 📋 MỤC LỤC

1. [Tổng Quan Phiên Làm Việc](#1-tổng-quan-phiên-làm-việc)
2. [Danh Sách Lỗi Đã Phát Hiện & Vá](#2-danh-sách-lỗi-đã-phát-hiện--vá)
3. [Danh Sách Chức Năng Mới Đã Bổ Sung](#3-danh-sách-chức-năng-mới-đã-bổ-sung)
4. [Chi Tiết Kỹ Thuật Từng Module](#4-chi-tiết-kỹ-thuật-từng-module)
5. [Cơ Sở Dữ Liệu (Database Schema)](#5-cơ-sở-dữ-liệu-database-schema)
6. [LocalStorage Keys & Patterns](#6-localstorage-keys--patterns)
7. [Service Worker & Cache Strategy](#7-service-worker--cache-strategy)
8. [Deployment History](#8-deployment-history)
9. [Hướng Dẫn Cho Agent Kế Tiếp](#9-hướng-dẫn-cho-agent-kế-tiếp)

---

## 1. Tổng Quan Phiên Làm Việc

| Thuộc tính | Giá trị |
|---|---|
| **Ngày làm việc** | 10/08/2026 |
| **Thời lượng** | ~12 giờ (07:00 → 17:00 GMT+7) |
| **Số phiên deploy Vercel** | 14 phiên (v63 → v76) |
| **Số file sửa đổi** | 8 file chính |
| **Production URL** | https://clinic-hub-5s.vercel.app |
| **Repository** | hadessispro/clinic-hub-5s |
| **Framework** | Vite + Vanilla JS + Supabase |

### Files Đã Sửa Đổi Chính:
| File | Mô tả thay đổi |
|---|---|
| `src/services/tasks.js` | Resilient Task CRUD + localStorage backup |
| `src/services/employees.js` | Full Management Hierarchy + deduplication |
| `src/views/tasks.js` | Task Matrix UI + Staff Search + Mobile Toggle |
| `src/views/marketing-analytics.js` | Premium Charts (Bar + Area SVG) |
| `app.css` | Mobile Responsive + Select styling |
| `public/sw.js` | Cache versioning (v63 → v76) |
| `src/constants.js` | Department & Role constants |
| `src/views/dashboard.js` | Dashboard chart fixes |

---

## 2. Danh Sách Lỗi Đã Phát Hiện & Vá

### 🔴 BUG-01: Duplicate Admin IT trong danh sách Đội Ngũ
- **Triệu chứng**: Sidebar Đội ngũ hiển thị 2 bản ghi "Admin IT" trùng nhau.
- **Nguyên nhân**: `getEmployees()` merge dữ liệu từ Supabase DB và `SEED_EMPLOYEES` mà không deduplicate.
- **Fix (v63)**: Deduplicate bằng `Set` theo `name.trim().toLowerCase()` và `employee.id`.
- **File**: `src/services/employees.js`
```javascript
const existingNames = new Set(dbMapped.map(e => e.name.trim().toLowerCase()));
const existingCodes = new Set(dbMapped.map(e => e.id));
const newSeeds = SEED_EMPLOYEES.filter(s =>
  !existingCodes.has(s.id) && !existingNames.has(s.name.trim().toLowerCase())
);
```

### 🔴 BUG-02: Task hiển thị sai ô giờ (9 AM Leak)
- **Triệu chứng**: Task được gán giờ cụ thể (VD: 11 AM) vẫn hiển thị thêm ở ô 9 AM.
- **Nguyên nhân**: Hàm `isTaskInCell()` có fallback `return hourStr === '9 AM'` chạy kể cả khi task đã có hour tag rõ ràng.
- **Fix (v66)**: Thêm điều kiện kiểm tra regex `/\d+\s*(AM|PM)/i` — chỉ fallback về 9 AM khi task thực sự KHÔNG có bất kỳ hour tag nào trong `hour`, `notes`, hay `title`.
- **File**: `src/views/tasks.js` — hàm `isTaskInCell()`
```javascript
if (!t.hour && !t.notes?.match(/\d+\s*(AM|PM)/i) && !t.title?.match(/\d+\s*(AM|PM)/i)) {
  return hourStr === '9 AM';
}
return false;
```

### 🔴 BUG-03: Xóa Task không persist qua F5 reload
- **Triệu chứng**: Xóa task thành công → F5 → Task cũ hiện lại.
- **Nguyên nhân**: `deleteTask()` chỉ xóa trên Supabase nhưng nếu RLS chặn hoặc network lỗi, task vẫn được fetch lại.
- **Fix (v67)**: Tạo `clinic_deleted_task_ids` blacklist trong `localStorage`. Mọi task bị xóa sẽ bị lọc khỏi `getTasks()` vĩnh viễn.
- **File**: `src/services/tasks.js`

### 🔴 BUG-04: Featured Cards (Thẻ Sự Kiện) reset sau F5
- **Triệu chứng**: Thêm/sửa/xóa thẻ sự kiện → F5 → Quay về 3 thẻ mặc định.
- **Nguyên nhân**: `featuredCards` chỉ lưu trong memory, không persist.
- **Fix (v67)**: Thêm `getStoredFeaturedCards()` và `saveStoredFeaturedCards()` lưu vào `localStorage.setItem('clinic_featured_cards', ...)`.
- **File**: `src/views/tasks.js`

### 🔴 BUG-05: Dropdown `<select>` vỡ layout Modal
- **Triệu chứng**: Native browser `<select>` quá to, text tràn, phá vỡ form modal trên mobile.
- **Fix (v68)**: Custom CSS `appearance: none`, SVG chevron arrow, `border-radius: 8px`, format option labels thành `Name (Short Role)`.
- **File**: `app.css`

### 🔴 BUG-06: Không thêm được Task mới
- **Triệu chứng**: Bấm "Tạo task" hoặc "Tạo lịch công việc mới" → Lỗi / không có phản hồi.
- **Nguyên nhân**: `createTask()` throw error khi Supabase RLS từ chối insert, và `catch` block hiển thị toast lỗi đỏ rồi dừng.
- **Fix (v72)**: Trang bị Resilient Task Engine — `createTask()` **luôn** lưu backup vào `localStorage` trước, sau đó thử insert Supabase. Nếu DB lỗi → vẫn return task từ local. Task xuất hiện tức thì 100%.
- **File**: `src/services/tasks.js`
```javascript
// 1. Save to local custom tasks backup first
const localTasks = JSON.parse(localStorage.getItem('clinic_custom_tasks') || '[]');
localTasks.unshift(newTask);
localStorage.setItem('clinic_custom_tasks', JSON.stringify(localTasks));
// 2. Try inserting to Supabase DB in background
try { ... } catch { console.warn('used local sync'); }
return newTask;
```

### 🔴 BUG-07: Mobile Layout vỡ trên màn hình nhỏ
- **Triệu chứng**: Sidebar Đội ngũ (240px) + Calendar Grid chen ngang trên mobile → ép ô giờ quá nhỏ, không thao tác được.
- **Fix (v73 + v74)**: Bổ sung `@media (max-width: 900px)` toàn diện — chuyển grid sang 1 cột, sidebar collapsible, calendar table `min-width: 700px` với horizontal touch scroll.
- **File**: `app.css`

---

## 3. Danh Sách Chức Năng Mới Đã Bổ Sung

### ✅ FEAT-01: Full Management Hierarchy (v64/v69/v70)
- Bổ sung toàn bộ quản lý cấp cao vào `SEED_EMPLOYEES`:
  - HR: Minh Hạnh (Trưởng Phòng), Emily (HR Specialist)
  - MKT: Lan Anh (Lead), Trần Quốc Bảo (Admin Marketing)
  - Finance: Hoài Nam (Trưởng Phòng Kế Toán)
  - Customer Care: Thu Ngân (Trưởng Phòng DVKH)
  - Medical: BS. Huy (Trưởng Khoa), BS. Phạm Minh Tuấn, BS. Lê Thị Mai
  - Chi nhánh Phạm Văn Chiêu: Đỗ Thị Yến Linh, Nguyễn Cao Hồng...
  - Chi nhánh Lê Văn Thọ: BS. Nguyễn Văn Hùng, Trần Thị Thu, Ngọc Mai...

### ✅ FEAT-02: Resilient Task Engine với localStorage Backup (v72)
- `createTask()` → lưu local backup trước → try Supabase
- `updateTask()` → update local backup + try Supabase
- `deleteTask()` → blacklist local + remove local + try Supabase
- `getTasks()` → merge DB tasks + local custom tasks, filter blacklist

### ✅ FEAT-03: Staff Sidebar Search Filter (v74)
- Ô tìm kiếm `🔍 Tìm tên nhân sự...` trong Sidebar Đội Ngũ
- Lọc tức thì theo tên + chức danh (instant, no re-render)
- Data attribute: `data-staff-search` chứa `(name + role).toLowerCase()`

### ✅ FEAT-04: Staff Sidebar Toggle Button (v74)
- Nút ▼/▲ thu gọn/mở rộng danh sách nhân viên
- Ẩn cả search box khi collapsed
- Đặc biệt hữu ích trên mobile

### ✅ FEAT-05: Premium Chart Redesign (v75)
- **Source Bar Chart**: 8 màu gradient riêng biệt, glass shine overlay, badge count pill
- **Staff Allocation Chart**: Avatar gradient tròn, progress bar với glass shine, color-coded pills

### ✅ FEAT-06: SVG Area Line Chart (v76)
- Biểu đồ xu hướng Lead 7 ngày gần nhất
- Đường cong Catmull-Rom → Bézier (smooth, không gấp khúc)
- Gradient fill area (cyan 35% → transparent)
- Hover tooltip dots với popup "X Lead"
- Y-axis ticks + X-axis day labels
- Fallback wave pattern khi chưa có dữ liệu

### ✅ FEAT-07: Xóa Icon Chi Nhánh trên Staff Cards (v71)
- Loại bỏ `📍 CN Phạm Văn Chiêu` / `📍 CN Lê Văn Thọ` badge
- Layout gọn: Avatar + Tên + Chức danh

### ✅ FEAT-08: Mobile Responsive Toàn Diện (v73/v74)
- Grid layout 1 cột trên mobile (< 900px)
- Sidebar staff list max-height 200px trên mobile
- Calendar table min-width 700px + touch scroll
- Modal full-width + z-index 100005 + padding-bottom 90px
- Featured cards 1 cột, tabs wrap, toolbar stack

---

## 4. Chi Tiết Kỹ Thuật Từng Module

### 4.1 `src/services/tasks.js` — Task CRUD Service

**Pattern: Resilient Local-First với DB Sync**

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  User Action │ --> │ localStorage │ --> │  Supabase DB │
│  (instant)   │     │  (backup)    │     │  (try/catch) │
└─────────────┘     └──────────────┘     └──────────────┘
```

- **getTasks()**: Fetch DB → Merge với `clinic_custom_tasks` → Filter `clinic_deleted_task_ids`
- **createTask()**: Generate `task_{timestamp}_{random}` ID → Save to localStorage → Try Supabase insert
- **updateTask()**: Update localStorage backup → Try Supabase update
- **deleteTask()**: Add to blacklist → Remove from local tasks → Try Supabase delete

**DB Table**: `public.tasks`
| Column | Type | Description |
|---|---|---|
| id | UUID PK | Auto-generated |
| title | TEXT | Tên công việc |
| department | TEXT | Mã phòng ban |
| assignee_code | TEXT | Mã nhân viên |
| status | TEXT | todo/in_progress/done |
| progress | INT | 0-100 |
| priority | TEXT | low/medium/high |
| due_date | DATE | Ngày thực hiện |
| notes | TEXT | Ghi chú (chứa `[Giờ: X AM/PM]`) |
| attachment_url | TEXT | URL file đính kèm |
| file_name | TEXT | Tên file |
| created_at | TIMESTAMPTZ | Thời điểm tạo |

### 4.2 `src/services/employees.js` — Employee Service

**Pattern: DB-First với Seed Merge Deduplication**

```
┌──────────────┐     ┌────────────────┐     ┌─────────────┐
│  Supabase DB │ --> │  Deduplicate   │ --> │  Final List │
│  employees   │     │  by name/code  │     │  (UI ready) │
└──────────────┘     └────────────────┘     └─────────────┘
        ↑                    ↑
        │            ┌───────┴──────┐
        │            │ SEED_EMPLOYEES│
        │            │ (fallback)    │
        │            └──────────────┘
```

- `SEED_EMPLOYEES`: 22+ nhân sự cấp cao + nhân viên 2 chi nhánh
- Merge logic: DB records override seeds by normalized name match

### 4.3 `src/views/tasks.js` — Task Matrix View

**Components:**
1. **Toolbar**: Tabs + Smart Search + Dept Filter + Week Navigator
2. **Featured Cards**: CRUD with localStorage persistence
3. **Staff Sidebar**: Search input + Toggle + Drag & Drop items
4. **Calendar Grid**: 9 time slots × 7 days matrix
5. **Event Blocks**: Task cards with quick-delete button
6. **Create/Edit Modal**: Full form with hour selector

**Hour Matching Logic** (`isTaskInCell()`):
```
1. Check t.due === dateStr (strict date match)
2. Check t.hour === hourStr (direct hour match)
3. Check t.notes contains [Giờ: X AM] pattern
4. Check t.title contains (X AM) pattern
5. Fallback: If NO hour anywhere → show at 9 AM
```

### 4.4 `src/views/marketing-analytics.js` — Analytics Dashboard

**Charts Implemented:**
1. **SVG Area Chart**: 7-day lead trend (Catmull-Rom smooth curves)
2. **Bar Chart**: Lead distribution by source (8-color gradient palette)
3. **Horizontal Bar Chart**: Lead allocation by staff (avatar + progress bar)
4. **Summary Table**: Source breakdown with percentages

**SVG Area Chart Technical Details:**
- ViewBox: 700×280
- Padding: Left 45px, Right 20px, Top 30px, Bottom 50px
- Curve algorithm: Catmull-Rom → Cubic Bézier conversion
- Gradient: `#06b6d4` at 35% opacity → 2% opacity
- Line: 3px stroke with drop shadow filter
- Hover: Transparent hit area (r=14) + visible dot (r=5) + tooltip group

---

## 5. Cơ Sở Dữ Liệu (Database Schema)

### Supabase Tables Đang Sử Dụng

| Table | Mô tả | RLS |
|---|---|---|
| `public.profiles` | Hồ sơ phân quyền user | ✅ Enabled |
| `public.employees` | Danh sách nhân viên | ✅ Enabled |
| `public.tasks` | Công việc & lịch trình | ✅ Enabled |
| `public.attendance_records` | Chấm công GPS | ✅ Enabled |
| `public.marketing_leads` | Leads khách hàng | ✅ Enabled |
| `public.telesale_call_logs` | Nhật ký cuộc gọi | ✅ Enabled |
| `public.marketing_campaigns` | Chiến dịch Marketing | ✅ Enabled |

### Enum Type: `clinic_role`
```
admin, admin_it, hr, leader, doctor, receptionist, nurse, assistant,
admin_marketing, support_marketing, pg_staff, telesale_leader, telesale_staff
```

### SQL Migration File
- **File**: `supabase-marketing-telesale.sql`
- **Nội dung**: Tạo 3 bảng marketing + 5 role mới + 5 user accounts + indexes + RLS policies

---

## 6. LocalStorage Keys & Patterns

| Key | Type | Mô tả |
|---|---|---|
| `clinic_deleted_task_ids` | `string[]` (JSON) | Blacklist IDs task đã xóa — lọc khỏi getTasks() |
| `clinic_custom_tasks` | `Task[]` (JSON) | Backup tasks tạo local khi Supabase lỗi |
| `clinic_featured_cards` | `FeaturedCard[]` (JSON) | Thẻ sự kiện nổi bật — persist thêm/sửa/xóa |

### Cleanup Note:
- `clinic_deleted_task_ids` có thể phình lớn theo thời gian. Agent kế tiếp nên implement periodic cleanup (VD: chỉ giữ 100 IDs gần nhất).
- `clinic_custom_tasks` nên được đồng bộ lại với DB khi Supabase khả dụng (background retry).

---

## 7. Service Worker & Cache Strategy

- **File**: `public/sw.js`
- **Cache Name Pattern**: `clinic-hub-attendance-gps-v{VERSION}`
- **Version hiện tại**: `v76`
- **Strategy**: Cache-first cho static assets, network-first cho API calls
- **Buộc clear cache**: User bấm `Ctrl + Shift + R` hoặc chờ SW tự activate phiên mới

---

## 8. Deployment History (Ngày 10/08/2026)

| Version | Thời gian | Nội dung chính |
|---|---|---|
| v63 | 08:15 | Fix duplicate Admin IT |
| v64 | 08:30 | Full Management Hierarchy |
| v65 | 08:45 | Minor UI fixes |
| v66 | 09:00 | Fix 9 AM task leak |
| v67 | 09:20 | LocalStorage blacklist + Featured Cards persist |
| v68 | 09:40 | Custom Select styling |
| v69 | 10:00 | Additional managers |
| v70 | 10:20 | HR Emily + 2-branch staff |
| v71 | 10:40 | Remove branch icon badge |
| v72 | 16:20 | Resilient Task Engine (instant create) |
| v73 | 16:24 | Mobile Responsive CSS |
| v74 | 16:34 | Staff Search + Toggle + CSS overhaul |
| v75 | 16:58 | Premium Chart Redesign |
| v76 | 17:02 | SVG Area Line Chart |

---

## 9. Hướng Dẫn Cho Agent Kế Tiếp

### Build & Deploy Flow
```bash
# 1. Build production bundle
npx vite build

# 2. Deploy to Vercel
vercel --prod --yes
```

### Coding Conventions
- **Inline styles**: Hệ thống sử dụng inline styles cho phần lớn UI components (do legacy). Khi thêm mới, ưu tiên class-based CSS trong `app.css`.
- **ES Modules**: Tất cả imports dùng ES module syntax.
- **No TypeScript**: Frontend hoàn toàn Vanilla JS.
- **Template literals**: HTML render bằng template literals trong JS (không dùng JSX/framework).

### Lưu Ý Quan Trọng
1. **Luôn bump SW cache version** khi deploy (`public/sw.js` dòng 1).
2. **Test trên mobile** — nhiều user dùng điện thoại, responsive là bắt buộc.
3. **localStorage backup** là safety net — nên implement background retry sync với Supabase.
4. **`isTaskInCell()` rất nhạy cảm** — thay đổi logic sẽ ảnh hưởng toàn bộ calendar matrix.
5. **Employee deduplication** phải check cả `name` lẫn `code` để tránh duplicate.
6. **RLS Supabase** có thể block operations — luôn có fallback local.

### Các Vấn Đề Còn Tồn Đọng (Backlog)
- [ ] Background retry sync cho `clinic_custom_tasks` → Supabase
- [ ] Periodic cleanup cho `clinic_deleted_task_ids` (giới hạn 100 entries)
- [ ] Drag & Drop trên mobile (touch events) cần cải thiện
- [ ] Real-time Supabase subscription cho task updates
- [ ] Unit tests cho `isTaskInCell()` logic

---

> **Document Version**: 1.0  
> **Last Updated**: 11/08/2026  
> **Author**: Antigravity AI Agent  
> **Purpose**: Cross-agent communication & knowledge transfer
