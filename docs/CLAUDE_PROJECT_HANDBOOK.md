# Clinic Hub 5S — Sổ tay dự án dành cho Claude

> Cập nhật theo mã nguồn tại commit `c22ff89`, ngày 26/08/2026.
>
> Tài liệu này là điểm bắt đầu bắt buộc trước khi sửa dự án. Nó mô tả hệ thống đang chạy thật, các luồng nghiệp vụ, quyền, dữ liệu, API, PWA, triển khai và những vùng dễ gây mất hoặc hiển thị thiếu dữ liệu.

## 1. Mục tiêu sản phẩm

Clinic Hub 5S là webapp/PWA nội bộ cho hai chi nhánh Nha Khoa 5S. Hệ thống gom các nghiệp vụ:

- Điều hành, công việc, tin nhắn và thông báo.
- Nhân sự, tuyển dụng, onboarding, đồng phục và sự vụ.
- Chấm công GPS, lịch làm, nghỉ phép và công lương.
- Đề xuất, cung ứng, tài sản, báo cáo và quản trị hệ thống.
- Marketing, kho Lead, Telesale, PG, địa điểm/ca PG và kho quà tặng.
- Báo cáo quản trị và xuất dữ liệu theo quyền.

Đây không còn là ứng dụng Vercel/Supabase thuần. Production hiện chạy trên VPS bằng Docker, Caddy, NestJS/Fastify, PostgreSQL và Redis. Supabase vẫn tồn tại như lớp tương thích, nguồn cũ và đích backup cho một số dữ liệu.

## 2. Những nguyên tắc Claude phải tuân thủ

1. Không đưa mật khẩu, JWT, API key, SSH key hoặc nội dung `.env*` vào tài liệu, commit, log hay câu trả lời.
2. Không chạy migration trực tiếp khi chưa backup PostgreSQL và so sánh `app.schema_migrations` trên VPS.
3. Không thay toàn bộ source trên VPS. Chỉ đồng bộ file thuộc phạm vi task, build lại đúng service và kiểm tra health/log.
4. Không coi Git, local, VPS và Supabase là cùng một trạng thái. Luôn xác minh từng nơi.
5. Không xóa hồ sơ, Lead, tài khoản hay lịch sử để “làm sạch” nếu chưa có danh sách đối chiếu và bản sao lưu.
6. UI ẩn menu không phải là bảo mật. Mọi quyền ghi/đọc nhạy cảm phải được backend kiểm tra.
7. Số tổng và danh sách chi tiết phải dùng cùng bộ lọc, cùng múi giờ và cùng quy tắc phân trang.
8. Không tải toàn bộ tập dữ liệu lớn về trình duyệt để lọc. Dùng pagination/filter ở SQL hoặc API chuyên biệt.
9. Mọi mutation phải có phản hồi ngay trên UI, phát revision/realtime và vẫn đúng sau reload.
10. Mỗi task phải kết thúc bằng build, test luồng vai trò liên quan, kiểm tra dữ liệu trước/sau và ghi rõ file đã sửa.

## 3. Bản đồ repository

| Đường dẫn | Vai trò |
|---|---|
| `index.html`, `app.css` | App shell và stylesheet chính của frontend. |
| `src/main.js` | Khởi động app, auth, realtime refresh, PWA và các listener toàn cục. |
| `src/router.js` | Lazy-load 27 route đang hoạt động, kiểm tra quyền trước khi render. |
| `src/permissions.js` | Nguồn chuẩn phía client cho route, action và menu theo role. |
| `src/views/` | Các màn hình nghiệp vụ. |
| `src/services/` | Adapter dữ liệu theo từng domain. |
| `src/local-client.js` | Lớp giả lập Supabase query API khi chạy backend VPS. |
| `src/supabase.js` | Chọn VPS adapter hoặc Supabase theo `VITE_DATA_BACKEND`. |
| `src/components/` | Sidebar, toast, bảng dùng chung, hồ sơ Lead, chart. |
| `apps/backend/src/` | NestJS/Fastify API, auth, marketing, quà, file, dữ liệu tổng quát. |
| `infra/postgres/migrations/` | Schema và migration PostgreSQL. |
| `public/sw.js` | Service worker PWA, cache shell và push notification. |
| `docker-compose.yml` | PostgreSQL, Redis, backend, migrate, backup worker, Caddy web. |
| `Dockerfile.*`, `deploy/` | Build và triển khai VPS. |
| `api/`, `server/`, `supabase-*.sql`, `vercel.json` | Stack cũ/tương thích. Không được xóa nếu chưa hoàn tất chuyển đổi và kiểm chứng. |
| `docs/` | Tài liệu triển khai, audit dữ liệu và sổ tay này. |

`monthly-schedule.js` và `pilot-schedule.js` có source nhưng hiện không nằm trong `viewImports` của router; xem chúng là module chưa gắn route, không phải màn hình production chính thức.

## 4. Kiến trúc runtime

```text
Trình duyệt/PWA
  ├─ Vite frontend (HTML/CSS/JS thuần, lazy-loaded views)
  ├─ localClient → /api/v2/* khi VITE_DATA_BACKEND=vps
  └─ Supabase client khi dùng cấu hình cloud/legacy

Caddy (HTTPS)
  ├─ static frontend
  └─ reverse proxy /api → NestJS/Fastify backend

Backend
  ├─ PostgreSQL: nguồn dữ liệu chính trên VPS
  ├─ Redis: presence, revision/realtime signal
  ├─ uploads volume: ảnh/tệp bằng chứng
  └─ backup-sync: app.backup_outbox → Supabase backup
```

Các service Docker:

- `postgres`: PostgreSQL 17, volume `postgres_data`.
- `redis`: Redis 8, AOF, volume `redis_data`.
- `migrate`: chạy migration một lần trước backend.
- `backend`: API port nội bộ 4000, volume `uploads_data`.
- `backup-sync`: đẩy outbox sang Supabase theo lô.
- `web`: Caddy, public 80/443, frontend và reverse proxy.
- `shadow-sync`: chỉ profile `migration`, dùng khi chủ động nhập dữ liệu nguồn cũ.
- `api` và `scheduler`: chỉ profile `legacy`.

Production hiện dùng `https://srv1892344.hstgr.cloud/`, source deploy tại `/opt/clinic-hub-5s`. Thư mục production có thể không có `.git`; không dùng `git pull` như một giả định. Marker đã xác nhận gần nhất là `c22ff89`.

## 5. Frontend và vòng đời màn hình

Mỗi view thường xuất:

- `renderView(state)`: đọc dữ liệu và trả HTML.
- `initView()`: gắn event sau khi HTML được mount.

`router.js`:

- Kiểm tra `canAccessView(role, view)` trước khi mở.
- Lazy import module để giảm bundle ban đầu.
- Có `renderRequestId` để kết quả render chậm không ghi đè view mới.
- Mutation có thể `await navigateTo(...)` để chỉ báo thành công sau khi view mới render xong.
- Khi chunk PWA cũ không còn tồn tại, router yêu cầu service worker update và reload một lần.

`main.js` và store:

- Giữ user, profile, role, branch và current view.
- Re-render khi data revision thay đổi.
- Hoãn refresh khi người dùng đang nhập form hoặc drawer/modal mở để tránh mất nội dung đang gõ.
- Sau focus-out/đóng overlay, refresh chờ được áp dụng.

Không viết DOM state quan trọng chỉ ở biến cục bộ nếu mutation cần sống qua re-render. Sau mutation, cập nhật server trước, phát revision, rồi render lại hoặc patch UI nhất quán.

## 6. Vai trò và quyền truy cập

Nguồn client chính là `src/permissions.js`; backend có bộ kiểm tra riêng theo endpoint. Bảng dưới là quyền view hiện tại:

| Role | Màn hình chính |
|---|---|
| `admin` | Toàn bộ module vận hành, HR, tài chính, Marketing/PG/quà. |
| `admin_it` | Quản trị hệ thống, task, chấm công, lịch, nghỉ phép, báo cáo, tích hợp, điều phối PG. |
| `admin_marketing` | Dashboard, Lead, quản lý/chăm sóc Telesale, báo cáo Marketing, PG, địa điểm/điều phối PG, quà, người, công/lịch/chat/task. |
| `support_marketing` | Dashboard, địa điểm PG, điều phối PG, kho quà, chat, task. Không có `pg-management` và không có báo cáo Marketing. |
| `pg_staff` | Tiếp nhận Lead, chấm công, điều phối PG, kho quà. |
| `telesale_leader` | Dashboard chuyên Telesale, quản lý Telesale, báo cáo Marketing, người, công/lịch/chat/task. |
| `telesale_staff` | Dashboard cá nhân, workspace Telesale, chat, task, công/lịch/nghỉ phép. |
| `hr` | Dashboard, task/chat, tuyển dụng, người, onboarding, đồng phục, sự vụ, công/lịch/nghỉ/lương. |
| `leader` | Dashboard, task/chat, công/lịch/nghỉ. |
| `finance` | Dashboard, task/chat, công, nghỉ, lương. |
| `staff` | Dashboard, task/chat, công/lịch/nghỉ. |
| `superadmin` | Hiện `ROLE_VIEWS` và `ROLE_ACTIONS` là mảng rỗng; đây là bất nhất cần xử lý có chủ đích, không tự suy diễn là toàn quyền. |

Quy tắc xuất dữ liệu:

- Không cho `telesale_staff`, `pg_staff`, `support_marketing`, `staff` xuất dữ liệu khách hàng.
- `admin`, `admin_marketing`, `telesale_leader`, `leader`, `hr`, `finance`, `admin_it` có thể xuất theo module/quyền cụ thể.

Lưu ý: `src/components/sidebar.js` chỉ xây menu từ `getNavForRole`; danh sách ưu tiên mobile không cấp thêm quyền. Nếu một route không có trong `ROLE_VIEWS`, router sẽ chuyển về view mặc định dù sidebar cũ/HTML stale còn hiện nút.

## 7. Danh mục toàn bộ màn hình đang hoạt động

| Route | File | Mục đích và dữ liệu chính |
|---|---|---|
| `dashboard` | `src/views/dashboard.js` | Tổng quan theo role; công, task, nhân sự; với Marketing/Telesale hiển thị số Lead và KPI phù hợp vai trò. |
| `tasks` | `src/views/tasks.js` | Tạo, giao, cập nhật, xóa công việc; liên kết nhân viên và thông báo thay đổi. |
| `chat` | `src/views/chat.js` | Danh bạ, tin nhắn nội bộ, subscription/realtime. |
| `recruitment` | `src/views/recruitment.js` | Danh sách ứng viên và trạng thái tuyển dụng. |
| `people` | `src/views/people.js` | Hồ sơ nhân viên, tạo nhân sự và dữ liệu tài khoản liên quan. |
| `onboarding` | `src/views/onboarding.js` | Tài liệu hội nhập, tiến độ, upload tài liệu. |
| `uniforms` | `src/views/uniforms.js` | Nhật ký cấp phát đồng phục. |
| `incidents` | `src/views/incidents.js` | Sự vụ và kiểm kê/audit tài sản, có file đính kèm. |
| `attendance` | `src/views/attendance.js` | Chấm vào/ra GPS, ảnh nơi làm việc, ca hợp lệ, queue offline. |
| `schedule` | `src/views/schedule.js` | Đăng ký, phân ca, duyệt lịch và cấu hình ca. |
| `leave` | `src/views/leave.js` | Đơn nghỉ, duyệt theo quyền và lưu trữ dữ liệu cũ. |
| `payroll` | `src/views/payroll.js` | Công/lịch/nghỉ, phản hồi bảng lương và tạm ứng. |
| `proposals` | `src/views/proposals.js` | Phiếu đề xuất, phê duyệt, đính kèm. |
| `supplies` | `src/views/supplies.js` | Danh mục vật tư và yêu cầu mua. |
| `assets` | `src/views/assets.js` | Danh mục, người giữ và trạng thái tài sản. |
| `reports` | `src/views/reports.js` | KPI vận hành, công/task; xuất báo cáo giàu định dạng. |
| `integrations` | `src/views/integrations.js` | Cấu hình tích hợp và thiết lập báo cáo. |
| `system-admin` | `src/views/system-admin.js` | Bug log, lỗi hệ thống, thông báo và công cụ quản trị. |
| `marketing-leads` | `src/views/marketing-leads.js` | Kho Lead/tiếp nhận Lead; PG nhập và phân loại; admin Marketing phân bổ. |
| `telesale-workspace` | `src/views/telesale-workspace.js` | Danh sách Lead của Telesale, bộ lọc, tư vấn, nhật ký, trạng thái và lịch hẹn. |
| `telesale-management` | `src/views/telesale-management.js` | Quản lý đội Telesale, lọc người/ngày/data/dịch vụ, phân lại Lead, KPI ngày. |
| `marketing-analytics` | `src/views/marketing-analytics.js` | Chart Marketing/Telesale toàn hệ thống và xuất báo cáo theo quyền. |
| `pg-management` | `src/views/pg-management.js` | Tài khoản/hồ sơ PG cho vai trò quản trị được phép. |
| `pg-locations` | `src/views/pg-locations.js` | Địa điểm làm PG, tọa độ, bán kính và đề xuất địa điểm. |
| `pg-workflow` | `src/views/pg-workflow.js` | Ca PG, hỗ trợ PG, dữ liệu PG có phân trang, xác nhận khách đến để đủ điều kiện hoa hồng. |
| `pg-attendance` | `src/views/pg-attendance.js` | Màn chấm công PG chuyên biệt và xuất lịch sử; hiện không được gắn trực tiếp vào `ROLE_VIEWS`. |
| `gift-inventory` | `src/views/gift-inventory.js` | Danh mục/quà, tồn kho, nhập/xuất, người nhận, ảnh khách và biên lai. |

## 8. Luồng đăng nhập và tài khoản

Backend `apps/backend/src/auth.ts` dùng JWT HS256:

- Access token mặc định 15 phút.
- Refresh session mặc định 30 ngày.
- Mật khẩu local dùng `scrypt`, không lưu plaintext.
- Identifier có thể là mã nhân viên, employee number, email hoặc họ tên tùy dữ liệu hồ sơ.
- Lần đầu có thể đối chiếu số điện thoại nhân viên đã chuẩn hóa, sau đó tạo local account hash.
- Có chọn chi nhánh; PG có quy tắc chi nhánh linh hoạt theo nghiệp vụ.
- Có khóa tạm thời sau nhiều lần đăng nhập sai.
- Tài khoản bootstrap admin chỉ lấy từ biến môi trường.

Không ghi danh sách mật khẩu vào Markdown. Khi bàn giao tài khoản, chỉ xuất mã/email/role/chi nhánh/trạng thái; mật khẩu phải cấp qua kênh riêng hoặc đặt lại.

## 9. Hai lớp lưu trữ dữ liệu

### 9.1 Kho tổng quát `app.records`

Backend `DataService` mô phỏng `.from(table)` của Supabase trên PostgreSQL bằng JSONB. Các entity được hỗ trợ:

`profiles`, `employees`, `attendance_records`, `tasks`, `leave_requests`, `proposals`, `inventory_items`, `purchase_requests`, `assets`, `asset_audits`, `uniform_logs`, `onboarding_docs`, `onboarding_progress`, `recruitment`, `schedule_requests`, `schedule_assignments`, `payroll_feedback`, `incidents`, `messages`, `notifications`, `performance_metrics`, `audit_logs`, `clinic_state_snapshots`, `clinic_locations`, `integration_outbox`, `system_bug_logs`, `system_announcements`, `system_error_logs`, `work_shifts`, `employee_allowed_shifts`, `leader_scopes`, `push_subscriptions`.

Mỗi record có `entity_type`, `record_key`, `payload JSONB`, `origin`, `version`, timestamps và soft-delete. Trigger ghi thay đổi vào `app.backup_outbox`.

Giới hạn quan trọng: `DataService` hiện đọc tối đa 5.000 record mỗi entity rồi mới filter/sort trong Node. Vì vậy module tổng quát vượt 5.000 dòng có nguy cơ tổng đúng nhưng danh sách thiếu. Không tăng limit như giải pháp lâu dài; hãy chuyển query lớn sang SQL filter/pagination chuyên biệt.

### 9.2 Schema nghiệp vụ chuyên biệt

Các phần dữ liệu lớn/nhạy cảm dùng bảng SQL thật trong schema `marketing`:

- `marketing.leads`: hồ sơ Lead, nguồn PG, phân loại, dịch vụ, chi nhánh, Telesale, trạng thái, lịch hẹn, xác nhận khách đến và hoa hồng PG.
- `marketing.call_logs`: cuộc gọi/tư vấn, kết quả, dịch vụ, next action.
- `marketing.customer_journey_events`: timeline khách hàng.
- `marketing.audit_log`: lịch sử chỉnh sửa/phân công.
- `marketing.pg_work_sites`: địa điểm, tọa độ, bán kính.
- `marketing.pg_shift_assignments`, `pg_assignment_events`: ca và vòng đời phân công PG.
- `marketing.pg_attendance`: chấm công PG trực tuyến/offline.
- `marketing.pg_location_suggestions`: PG đề xuất địa điểm.
- `marketing.pg_support_requests`: yêu cầu hỗ trợ PG.
- `marketing.gift_categories`, `gift_items`, `gift_stock_movements`: kho quà và bằng chứng.
- `marketing.import_batches`, `lead_staging`, `customers`, `lead_assignment_history`: nền ETL/ERP đã có schema nhưng không phải UI nhập liệu chính hiện tại.

Marketing và quà phải dùng endpoint chuyên biệt, không đưa ngược vào `app.records`.

## 10. Luồng Marketing, Lead và Telesale

### 10.1 Tiếp nhận Lead

1. PG nhập khách trực tiếp và chọn `data_class`: `raw` hoặc `net`.
2. Data net có mức `basic`/`advanced` tùy dịch vụ; data thô không ép vào nhóm dịch vụ net.
3. Điện thoại Việt Nam được chuẩn hóa và có index chống trùng.
4. Hồ sơ lưu người nhập (`created_by_pg_code`), thời gian, chi nhánh, nguồn, dịch vụ và ghi chú.
5. Admin Marketing/leader phân Lead cho Telesale theo quyền; data net thường gán trực tiếp, data thô có thể phân đều/ngẫu nhiên.

### 10.2 Chăm sóc Telesale

- `telesale_staff` chỉ xem Lead được gán cho chính mình; backend phải enforce, không chỉ dựa trên filter UI.
- Workspace có card/bảng, tìm tên/SĐT, trạng thái, chi nhánh, data class, nhóm/dịch vụ và khoảng ngày được giao.
- Telesale mở hồ sơ tư vấn, ghi call log, đổi trạng thái, dịch vụ, lịch hẹn và next action.
- Timeline phải hiển thị tên/mã người thực hiện, thay đổi trước/sau và thời gian.
- Trạng thái nghiệp vụ hiện gặp trong code: `new`, `contacted`, `appointment_booked`, trạng thái đã đến khám, `converted`, `cancelled`, `appointment_cancelled`, `low_quality`. Trước khi thêm trạng thái, kiểm tra constraint SQL và mọi chart/filter.

### 10.3 Quản lý Telesale

- `telesale_leader` có màn riêng `telesale-management`, không dùng kho Lead PG như màn quản lý chính.
- Có filter thành viên dưới quyền, ngày/tháng/năm, chi nhánh, trạng thái, data class, nhóm/dịch vụ.
- Có quyền gán lại Telesale phù hợp.
- KPI phải phản ánh: tổng data quản lý, đã xử lý, chưa xử lý, số đổi trạng thái trong kỳ, khách đến chi nhánh, KCL và hiệu suất theo nhân viên.
- Số tổng và bảng chi tiết phải cùng timezone `Asia/Ho_Chi_Minh` và cùng cột ngày (`assigned_at` hay `created_at`) đã được ghi rõ trên UI.

### 10.4 Phân trang và báo cáo

- `GET /api/v2/marketing/leads` là server-side pagination/filter.
- `meta.total`, `page`, `pageSize`, `pageCount` là nguồn chuẩn cho footer.
- STT = `(page - 1) * pageSize + index + 1`.
- Không xuất CSV chỉ từ `cachedLeads` của trang hiện tại khi người dùng kỳ vọng toàn bộ kết quả; cần endpoint/export truy vấn tất cả theo filter hoặc ghi rõ “trang hiện tại”. Đây vẫn là điểm cần rà lại trong `telesale-workspace.js`.
- Chart báo cáo lấy số toàn CSDL từ API reports, không suy ra từ 12/48/100 dòng đang hiển thị.

## 11. Luồng PG

### 11.1 Tài khoản PG

- Quản trị được phép tạo/cập nhật/vô hiệu tài khoản PG qua endpoint `pg-accounts`.
- Không xóa “nhân sự ảo” bằng tên cảm tính; phải đối chiếu roster chính thức, app profile, local account và dữ liệu Lead lịch sử.
- Hồ sơ cũ đã tạo Lead cần được vô hiệu hóa/merge có audit thay vì xóa cascade.

### 11.2 Địa điểm và ca

- Support/Admin quản lý `pg_work_sites`: tên, địa chỉ, lat/lng, bán kính, trạng thái.
- PG có thể đề xuất địa điểm; Support/Admin duyệt theo workflow.
- Phân ca lưu ngày, PG, site, thời gian, trạng thái và event history.
- `pg-workflow` là màn Support PG chính: phân ca, yêu cầu hỗ trợ và kiểm soát dữ liệu PG.

### 11.3 Chấm công PG online/offline

- Khi online: lấy GPS, độ chính xác, thời điểm và đối chiếu site/ca/bán kính ở backend.
- Khi offline: lưu event cùng `client_event_id`, `captured_at`, lat/lng, accuracy, device/offline metadata vào IndexedDB; đồng bộ khi có mạng.
- Backend migration `019` đảm bảo idempotency bằng unique `client_event_id` và kiểm tra thời điểm không quá hạn, tọa độ hợp lệ, accuracy, ca và bán kính.
- Service worker không cache response `/api/`; queue nghiệp vụ nằm ở IndexedDB/service, không nằm trong HTTP cache.
- GPS offline chỉ có nghĩa là thiết bị vẫn lấy được tọa độ khi mất mạng. Không được bịa tọa độ, dùng tọa độ cuối hoặc tự đánh dấu hợp lệ phía client.

### 11.4 Xác nhận khách đến và hoa hồng PG

- Support/Admin dùng cột “Xác nhận khách đến” trong bảng dữ liệu PG.
- Endpoint `POST /api/v2/marketing/leads/:id/confirm-pg-arrival` cập nhật nguyên tử và idempotent.
- Lưu `pg_arrival_confirmed_at`, người xác nhận và trạng thái điều kiện hoa hồng; nếu chưa converted thì cập nhật trạng thái khách đã đến.
- Chỉ Lead có nguồn PG hợp lệ mới được xác nhận.
- Đây mới là xác nhận đủ điều kiện tính hoa hồng; hệ thống chưa được coi là đã có bảng đơn giá/tính tiền hoa hồng hoàn chỉnh nếu chưa có module riêng.

## 12. Kho quà tặng

Quyền backend:

- Được xem/trao: `admin`, `admin_it`, `superadmin`, `admin_marketing`, `support_marketing`, `pg_staff`.
- Quản lý danh mục, vật phẩm, nhập kho/điều chỉnh: nhóm quản trị và Support; PG không được điều chỉnh tồn.
- PG chỉ thấy giao dịch của chính mình theo mã PG.

Luồng:

1. Support tạo danh mục và mặt hàng.
2. Nhập kho tạo stock movement dương.
3. PG/Support trao quà cho khách, ghi vật phẩm, số lượng, người nhận, SĐT, PG/người thực hiện và ghi chú.
4. Giao dịch `issue` bắt buộc đủ ảnh khách nhận quà và ảnh bill/biên lai.
5. File phải upload trước qua `/api/v2/files/upload`; DB chỉ lưu URL/file id hợp lệ dạng `/api/v2/files/...`.
6. Movement là sổ bất biến; không sửa tồn trực tiếp. Tồn = tổng movement tăng trừ movement giảm.
7. Filter có ngày từ/đến, người nhận, số lượng min/max, mặt hàng, loại giao dịch và PG (đối với quản lý).

Không lưu base64 ảnh trong PostgreSQL. File ở uploads volume; cần backup cả DB lẫn `uploads_data`.

## 13. Các module vận hành khác

- **Nhân sự:** `profiles` và `employees` đang cùng tồn tại; mã nhân viên là khóa nghiệp vụ liên kết nhiều module. Không tự đổi mã.
- **Chấm công chung:** check-in/out GPS, ảnh bằng chứng, ca được phép và IndexedDB queue. Khác với bảng chấm công PG chuyên biệt.
- **Lịch:** yêu cầu lịch và phân ca là hai entity khác nhau; quyền staff/leader/HR khác nhau.
- **Nghỉ phép:** staff tạo, cấp quản lý/HR duyệt; archive cũ không đồng nghĩa xóa.
- **Payroll:** tổng hợp công/lịch/nghỉ và phản hồi, không nên tính trực tiếp từ DOM.
- **Task/chat:** có realtime/revision; tin nhắn phải giới hạn theo người gửi/người nhận ở backend.
- **Cung ứng/tài sản:** danh mục và transaction/audit phải tách nhau để giữ lịch sử.
- **System admin:** lỗi, bug log, thông báo; không mở cho role nghiệp vụ chỉ vì menu bị thiếu.

## 14. API backend

### Auth

- `POST /api/v2/auth/login`
- `POST /api/v2/auth/refresh`
- `GET /api/v2/auth/me`
- `POST /api/v2/auth/provision`
- `POST /api/v2/auth/pg-register`

### Dữ liệu tổng quát và file

- `POST /api/v2/data/query`
- `GET /api/v2/data/version`
- `POST /api/v2/attendance-record`
- `POST /api/v2/rpc/call`
- `POST /api/v2/files/upload`
- `GET /api/v2/files/:id`

### Marketing/Telesale

- Tài khoản: `GET/POST /marketing/pg-accounts`, `PATCH/DELETE /marketing/pg-accounts/:code`, `GET /marketing/telesale-accounts`.
- Lead: `GET/POST /marketing/leads`, `PATCH/DELETE /marketing/leads/:id`.
- Gán: `POST /leads/:id/assign-net`, `/leads/distribute-raw`, `/leads/bulk-assign`.
- Tư vấn: `GET/POST /leads/:id/calls`.
- Xác nhận đến: `POST /leads/:id/confirm-pg-arrival`.
- KPI: `GET /telesale-daily-summary`, `GET /reports`.

### PG

- Sites: `GET/POST /pg-sites`, `PATCH/DELETE /pg-sites/:id`, `GET /pg-location-search`.
- Ca: `GET/POST /pg-assignments`, `GET /pg-assignment-history`, `PATCH /pg-assignments/:id/cancel`.
- Đề xuất địa điểm: `GET/POST /pg-location-suggestions`, `PATCH /pg-location-suggestions/:id`.
- Support: `GET/POST /pg-support-requests`, `PATCH /pg-support-requests/:id`.
- Chấm công: `POST/GET /pg-attendance`, `GET /pg-attendance/export`.

### Quà tặng

- `GET /marketing/gifts/overview`
- `GET /marketing/gifts/movements`
- `POST /marketing/gifts/items`
- `PATCH /marketing/gifts/items/:id`
- `POST /marketing/gifts/categories`
- `POST /marketing/gifts/movements`

### Push

- `GET/POST/DELETE /api/v2/push-subscription`
- `POST /api/v2/push-dispatch`

Tất cả endpoint nghiệp vụ phải qua `AuthGuard` và kiểm tra role/ownership trong service.

## 15. Migration map

| File | Nội dung chính |
|---|---|
| `002-primary-store.sql` | `app.records`, accounts, refresh sessions, backup outbox. |
| `003-backup-delete-semantics.sql` | Đồng bộ soft delete/backup. |
| `004-marketing-pg-telesale.sql` | Lead, call log, site, ca, công PG, audit. |
| `005-pg-operation-workflow.sql` | Đề xuất địa điểm và support request. |
| `006-marketing-personnel-reconciliation.sql` | Audit dọn/đối chiếu nhân sự Marketing. |
| `007-marketing-official-roster-sync.sql` | Đồng bộ roster chính thức. |
| `008-classify-pg-legacy-leads.sql` | Phân loại Lead PG legacy. |
| `008-hr-emily-role-sync.sql` | Đồng bộ role HR cụ thể có audit. |
| `009-lead-cancelled-and-low-quality.sql` | Trạng thái hủy/KCL. |
| `009-marketing-etl-erp.sql` | Batch/staging/customer/assignment history nền ETL. |
| `010-marketing-lead-dossier.sql` | Dịch vụ/next action và timeline hồ sơ. |
| `010-pg-assignment-lifecycle.sql` | Vòng đời ca PG và event. |
| `011-ngoc-phuong-phone-sync.sql` | Đồng bộ contact cụ thể có chủ đích. |
| `011-prevent-duplicate-lead-phones.sql` | Index chống SĐT Lead trùng. |
| `012-canonicalize-vietnam-lead-phones.sql` | Chuẩn hóa số Việt Nam và unique index. |
| `013-activate-internally-created-pg.sql` | Kích hoạt PG tạo nội bộ. |
| `014-add-pending-consultation-results.sql` | Kết quả tư vấn pending. |
| `015-customer-journey-legacy-history.sql` | Hành trình khách từ dữ liệu cũ. |
| `016-gift-inventory.sql` | Vật phẩm và stock movement. |
| `017-gift-categories-and-legacy-correction.sql` | Danh mục quà và sửa legacy. |
| `018-gift-evidence.sql` | Ảnh khách/biên lai. |
| `019-pg-offline-attendance.sql` | Idempotency và metadata chấm công offline. |
| `020-pg-arrival-commission-confirmation.sql` | Xác nhận khách đến/đủ điều kiện hoa hồng PG. |

Có nhiều file trùng prefix số. Runner dùng toàn tên file làm version và sort theo tên. Migration mới nên dùng prefix chưa dùng, bắt đầu từ `021-...`, nhưng vẫn phải kiểm tra live DB trước.

Một số file migration hiện có thể chưa được Git track dù đã chạy thủ công trên production. Claude phải xem:

```sql
select version, applied_at from app.schema_migrations order by applied_at;
```

rồi so với thư mục local trước khi chạy `migrate`.

## 16. Realtime, revision và cache

- Redis giữ data revision/presence. Lỗi Redis không được rollback transaction PostgreSQL đã thành công.
- `localClient` poll `/api/v2/data/version` khoảng mỗi giây và phát sự kiện cho store.
- Các code path cloud vẫn có Supabase realtime subscription.
- Service worker dùng cache name theo build version.
- Navigation/script/style dùng network-first; asset tĩnh dùng cache-first và background update.
- Mọi `/api/` dùng network `no-store`; tuyệt đối không cache danh sách Lead hoặc báo cáo nghiệp vụ.
- Push notification mở lại view theo payload.

Khi người dùng nói “đã sửa nhưng không thấy cập nhật”, kiểm tra theo thứ tự:

1. API mutation có thành công và DB đã đổi không.
2. `markDataChanged` có được gọi không.
3. Client có nhận revision mới không.
4. Render có bị hoãn vì input/drawer đang mở không.
5. Service worker/chunk có stale không.
6. UI đang đọc đúng backend (`VITE_DATA_BACKEND`) hay Supabase cũ.

## 17. Quy trình triển khai an toàn

### Trước khi sửa

1. `git status --short`; không đụng các thay đổi ngoài task.
2. Ghi commit/marker hiện chạy trên VPS.
3. Backup PostgreSQL; nếu liên quan ảnh/file, backup uploads volume.
4. Chụp số kiểm soát trước thay đổi: count theo bảng/trạng thái/ngày/assignee.
5. Kiểm tra migration live và schema thực tế.

### Sau khi sửa local

1. Chạy build frontend và backend liên quan.
2. Test vai trò được phép và bị cấm.
3. Test mobile/PWA nếu sửa layout, navigation, form hoặc offline.
4. Đối chiếu `meta.total`, tổng SQL và tổng các trang.
5. Chỉ stage file của task; không gom dirty worktree của người dùng.

### Triển khai VPS

1. Copy đúng file đã thay đổi vào `/opt/clinic-hub-5s`.
2. Nếu có migration: backup, chạy migration one-shot và xác nhận version.
3. Rebuild đúng service (`backend`, `web` hoặc cả hai).
4. Không xóa volume và không chạy lệnh down kèm volume.
5. Kiểm tra `docker compose ps`, `/healthz`, log backend/web.
6. Smoke test bằng tài khoản thuộc role liên quan.
7. Đối chiếu count sau deploy với count trước deploy.
8. Xác nhận PWA nhận build mới; không dùng cache API làm bằng chứng dữ liệu.

### Git

- Commit nhỏ, nêu đúng domain.
- Không commit `.env`, dump DB, upload khách hàng hoặc thư mục deploy tạm.
- VPS không có `.git` thì GitHub và VPS là hai bước độc lập; báo rõ bước nào đã hoàn tất.

## 18. Checklist kiểm thử theo rủi ro

### Dữ liệu/Lead

- Tổng SQL = `meta.total` API = tổng số dòng qua tất cả trang.
- Filter ngày bao gồm đúng đầu/cuối ngày theo `Asia/Ho_Chi_Minh`.
- Đổi page size không làm mất filter.
- Cập nhật status/assignee thấy ngay và giữ nguyên sau reload.
- Telesale staff không xem/sửa Lead người khác bằng gọi API trực tiếp.
- SĐT chuẩn hóa không tạo duplicate giả.

### PG

- Role Support không thấy `pg-management` nếu không có quyền.
- Phân ca mới hiện ngay, có history và không mất sau deploy.
- Offline attendance sync đúng một lần dù retry.
- Sai vị trí, accuracy kém, quá hạn hoặc không có ca bị backend từ chối.
- Xác nhận khách đến idempotent, lưu đúng người/thời gian và không tự tính tiền hoa hồng.

### Kho quà

- PG chỉ thấy movement của mình.
- PG không nhập/điều chỉnh kho.
- Trao quà thiếu một trong hai ảnh bị từ chối.
- Tồn sau issue/return/adjustment đúng theo ledger.
- Ảnh mở được sau restart container.

### PWA/mobile

- 320/360/390/768px không tràn ngang ngoài bảng chủ ý.
- Bottom navigation không che phân trang/nút hành động.
- Modal/drawer có scroll riêng, close được và không khóa body sau realtime refresh.
- Mất mạng vẫn mở app shell; API không trả dữ liệu cũ từ cache.

## 19. Các bất nhất và nợ kỹ thuật đã biết

1. README cũ có thể mô tả Vercel/Supabase là production chính; thực tế VPS stack mới là nguồn chạy hiện tại.
2. `superadmin` được backend nhắc đến như manager ở một số module nhưng client không có view/action. Cần thống nhất, không tự mở toàn quyền.
3. `pg-attendance` có route import nhưng không được role nào cấp trong `ROLE_VIEWS`; chấm công PG chủ yếu đi qua workflow hiện tại.
4. Data tổng quát filter trong Node sau khi lấy tối đa 5.000 record; phải tái cấu trúc trước khi entity lớn.
5. Code Supabase legacy và VPS adapter cùng tồn tại; mỗi bug phải xác định code path thật.
6. Có migration trùng prefix và file chưa tracked; live schema là bằng chứng cuối cùng.
7. Export trong một số view có thể chỉ xuất trang cache hiện tại; phải xác nhận kỳ vọng “trang” hay “toàn bộ kết quả”.
8. ETL schema đã tồn tại nhưng UI chính hiện là PG nhập/phân loại trực tiếp; không tự bật lại màn ETL khi chưa có yêu cầu.
9. Commission PG hiện mới có eligibility confirmation, chưa phải engine tính hoa hồng tiền.
10. `profiles`, `employees`, `local_accounts` có thể chứa bản ghi cùng người; merge cần khóa nghiệp vụ và audit.
11. Working tree có nhiều thay đổi chưa commit của người dùng. Không reset/checkout hoặc commit gom.

## 20. Cách bắt đầu theo loại task

| Task | File cần đọc trước |
|---|---|
| Menu/quyền | `src/permissions.js`, `src/components/sidebar.js`, `src/router.js`, endpoint backend liên quan. |
| Lead/Telesale | `src/services/marketing.js`, view liên quan, `apps/backend/src/marketing.ts`, migrations `004`–`020`. |
| Hồ sơ/timeline | `src/components/lead-consultation-drawer.js`, `marketing.ts`, `010`, `015`. |
| PG/ca/GPS | `pg-workflow.js`, `pg-locations.js`, `pg-attendance.js`, `marketing.ts`, `005`, `010`, `019`. |
| Quà tặng | `gift-inventory.js`, `services/gifts.js`, `apps/backend/src/gifts.ts`, `016`–`018`, file upload. |
| Chấm công chung | `attendance.js`, `services/attendance.js`, `attendance-proofs.js`, backend attendance/RPC. |
| Realtime | `main.js`, `local-client.js`, store, `infrastructure.ts`, `public/sw.js`. |
| Dashboard/chart | `dashboard.js`, `marketing-analytics.js`, `marketing-charts.js`, reports endpoints. |
| Deploy | `docker-compose.yml`, Dockerfiles, `deploy/deploy.sh`, `docs/VPS_DEPLOYMENT.md`. |

## 21. Mẫu bàn giao một task cho Claude

Khi nhận task mới, Claude nên ghi ngắn gọn trước khi code:

```md
### Phạm vi
- Vai trò sử dụng:
- Màn hình/API/bảng liên quan:
- Dữ liệu production có thể bị tác động:

### Trạng thái trước sửa
- Git commit/local diff:
- VPS marker và container health:
- Migration live:
- Count kiểm soát:

### Thiết kế
- Quy tắc nghiệp vụ:
- Quyền đọc/ghi:
- Phân trang/filter/timezone:
- Realtime/offline:
- Kế hoạch rollback:

### Xác minh sau sửa
- Build/test:
- Test theo role:
- Count trước/sau:
- Git đã đẩy:
- VPS đã triển khai:
```

## 22. Định nghĩa hoàn tất

Một thay đổi chỉ được coi là hoàn tất khi:

- Đúng nghiệp vụ và đúng vai trò cả UI lẫn API.
- Không làm mất/sai count dữ liệu cũ.
- Có pagination/filter đúng cho dữ liệu lớn.
- Có audit/người thực hiện cho hành động quan trọng.
- Cập nhật nhanh và đúng sau reload/reconnect.
- Responsive trên desktop/mobile/PWA.
- Build qua; API health và container ổn.
- Git, local và VPS được báo trạng thái riêng, không nói “đã đồng bộ” nếu mới xong một nơi.
- Có backup/rollback cho mọi thay đổi schema hoặc dữ liệu production.

---

Tài liệu này mô tả trạng thái hiện tại, không thay thế việc đọc source và kiểm tra production trước từng task. Khi kiến trúc, role, endpoint hoặc migration thay đổi, cập nhật file này trong cùng commit để Claude tiếp theo không làm việc dựa trên hiểu biết cũ.
