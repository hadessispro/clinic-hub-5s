const icon = (name) => {
  const paths = {
    home: '<path d="M3 11.5 12 4l9 7.5V21h-6v-6H9v6H3z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-11a3 3 0 0 1 0 6m0 1a5 5 0 0 1 4 4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/>',
    pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
    alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9v4m0 3h.01"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chart: '<path d="M4 20V10m6 10V4m6 16v-7m5 7H2"/>',
    file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6m-6 4h4"/>',
    filter: '<path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M6 14v6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.home}</svg>`;
};

const panels = {
  overview: `
    <section class="preview-welcome">
      <div><small>Thứ tư, 09 tháng 09</small><h1>Chào buổi sáng, Bảo</h1><p>Hôm nay có 2 việc cần bạn kiểm tra.</p></div>
    </section>
    <div class="preview-discovery">
      <label>${icon('search')}<input aria-label="Tìm kiếm" placeholder="Tìm nhân sự, lịch hoặc công việc"></label>
      <button type="button" aria-label="Bộ lọc" data-demo-toast="Mở bộ lọc nhanh">${icon('filter')}</button>
    </div>
    <section class="preview-hero">
      <div class="preview-hero-top"><span>Ca làm hôm nay</span><span class="preview-live"><i></i> GPS sẵn sàng</span></div>
      <strong>08:00–17:00</strong>
      <p>5S Phạm Văn Chiêu · Ca bác sĩ</p>
      <button type="button" data-demo-toast="Mở quy trình chấm công GPS">${icon('pin')}<span><b>Xác nhận chấm công</b><small>Kiểm tra vị trí trước khi ghi nhận</small></span>${icon('arrow')}</button>
    </section>
    <section class="preview-section">
      <header><div><span>Tổng quan hôm nay</span><h2>Vận hành phòng khám</h2></div><button class="preview-link" data-demo-toast="Đã làm mới dữ liệu">Làm mới</button></header>
      <div class="preview-metrics">
        <article class="mint"><span class="preview-metric-icon">${icon('users')}</span><b>18</b><small>Nhân sự vào ca</small><em>16/18 đã vào</em></article>
        <article class="blue"><span class="preview-metric-icon">${icon('calendar')}</span><b>12</b><small>Lịch hẹn</small><em>3 đang điều trị</em></article>
        <article class="amber"><span class="preview-metric-icon">${icon('clock')}</span><b>2</b><small>Cần đối chiếu</small><em>2 hồ sơ</em></article>
      </div>
    </section>
    <section class="preview-section">
      <header><div><span>Cần chú ý</span><h2>Việc ưu tiên</h2></div><button class="preview-link" data-nav="admin">Xem tất cả</button></header>
      <div class="preview-focus-list">
        <button data-demo-toast="Mở chi tiết công Nguyễn Thị Như Huỳnh"><span class="preview-status red">${icon('alert')}</span><span><b>Thiếu giờ ra ngày 08/09</b><small>Nguyễn Thị Như Huỳnh · Phụ tá</small></span><time>09:22</time></button>
        <button data-demo-toast="Mở đơn tăng ca đang chờ"><span class="preview-status amber">${icon('clock')}</span><span><b>3 đơn tăng ca chờ duyệt</b><small>Chỉ cộng công sau khi duyệt cuối</small></span><time>3 đơn</time></button>
        <button data-demo-toast="Mở lịch bác sĩ"><span class="preview-status green">${icon('calendar')}</span><span><b>Lịch bác sĩ đã đồng bộ</b><small>6 bác sĩ · 2 chi nhánh</small></span><time>Đủ</time></button>
      </div>
    </section>
    <section class="preview-section doctors">
      <header><div><span>Điều phối</span><h2>Lịch bác sĩ sắp tới</h2></div><button class="preview-link" data-nav="schedule">Mở lịch</button></header>
      <article><div class="preview-avatar">QN</div><div><b>BS. Trần Minh Quân</b><small>08:00–17:00 · PVC</small></div><span>Đang làm</span></article>
      <article><div class="preview-avatar violet">NN</div><div><b>BS. Nguyễn Tuấn Ngọc</b><small>10:00–20:00 · LVT</small></div><span class="later">10:00</span></article>
    </section>`,
  attendance: `
    <section class="preview-title"><span>CHẤM CÔNG GPS</span><h1>Công làm việc</h1><p>Dữ liệu tháng 09/2026 đã xác nhận</p></section>
    <section class="preview-work-summary"><div><small>Ngày công</small><b>6</b></div><div><small>Công thường</small><b>51 giờ</b></div><div><small>Tăng ca duyệt</small><b>2 giờ</b></div></section>
    <section class="preview-section compact"><header><div><span>Bảng công</span><h2>7 ngày gần nhất</h2></div><button class="preview-filter">Tháng 09⌄</button></header>
      <div class="preview-day-list">
        <article><time><b>09</b><small>Thứ tư</small></time><div><b>Ca hành chính</b><small>07:24 → Đang trong ca · LVT</small></div><span class="working">Đang làm</span></article>
        <article><time><b>08</b><small>Thứ ba</small></time><div><b>Ca chiều</b><small>09:22 → 20:00 · LVT</small></div><span>1 công</span></article>
        <article><time><b>07</b><small>Thứ hai</small></time><div><b>Ca hành chính</b><small>07:22 → 17:30 · LVT</small></div><span>1 công</span></article>
        <article><time><b>06</b><small>Chủ nhật</small></time><div><b>Ca hành chính</b><small>07:18 → 17:04 · LVT</small></div><span>1 công</span></article>
      </div>
    </section>`,
  schedule: `
    <section class="preview-title"><span>LỊCH LÀM BÁC SĨ</span><h1>Điều phối theo bác sĩ</h1><p>Chi nhánh 5S Phạm Văn Chiêu</p></section>
    <div class="preview-date-strip"><button>08<small>T3</small></button><button class="active">09<small>T4</small></button><button>10<small>T5</small></button><button>11<small>T6</small></button><button>12<small>T7</small></button></div>
    <section class="preview-section compact"><header><div><span>Hôm nay</span><h2>3 bác sĩ có lịch</h2></div><button class="preview-filter">PVC⌄</button></header>
      <div class="preview-schedule-list">
        <article><i class="teal"></i><time>08:00<small>17:00</small></time><div><b>BS. Trần Minh Quân</b><small>Phòng 02 · Ca hành chính</small><em>4 lịch hẹn</em></div></article>
        <article><i class="blue"></i><time>09:30<small>20:00</small></time><div><b>BS. Lâm Hưng Long</b><small>Phòng 03 · Ca chiều</small><em>5 lịch hẹn</em></div></article>
        <article><i class="violet"></i><time>10:00<small>20:00</small></time><div><b>BS. Nguyễn Tuấn Ngọc</b><small>Phòng 01 · Ca chiều</small><em>3 lịch hẹn</em></div></article>
      </div>
    </section>`,
  admin: `
    <section class="preview-title"><span>QUẢN TRỊ HỆ THỐNG</span><h1>Kiểm tra & điều chỉnh</h1><p>Canary dành cho tài khoản Admin IT</p></section>
    <label class="preview-search">${icon('search')}<input placeholder="Tìm tên, mã nhân viên hoặc chức danh"></label>
    <div class="preview-admin-tabs"><button class="active">Cần xử lý <b>2</b></button><button>Đã xác nhận</button><button>Nhật ký</button></div>
    <section class="preview-section compact admin-list">
      <article><div class="preview-avatar">NH</div><div class="grow"><b>Nguyễn Thị Như Huỳnh</b><small>PVC003 · Phụ tá · LVT</small><p><span>08/09</span> Thiếu giờ ra · Ca chiều</p></div><button data-demo-toast="Mở form điều chỉnh công">Sửa</button></article>
      <article><div class="preview-avatar amber-bg">TN</div><div class="grow"><b>Trần Xuân Nhân</b><small>PVC007 · Phụ tá · PVC</small><p><span>05/09</span> Thiếu check-out</p></div><button data-demo-toast="Mở form điều chỉnh công">Sửa</button></article>
    </section>
    <button class="preview-primary" data-demo-toast="Mở màn hình bổ sung công">${icon('file')} Điều chỉnh / Bổ sung công</button>`,
};

export function renderMobileAdminPreview() {
  const designVersion = new URLSearchParams(window.location.search).get('design') === 'v2' ? 'v2' : 'v1';
  document.title = `Mobile Preview ${designVersion.toUpperCase()} · Clinic Hub 5S`;
  document.body.className = `mobile-admin-preview preview-theme-${designVersion}`;
  document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="/mobile-admin-preview.css"><link rel="stylesheet" href="/mobile-admin-preview-dock.css"><link rel="stylesheet" href="/mobile-admin-preview-${designVersion}.css">`);
  document.body.innerHTML = `
    <div class="preview-device">
      <header class="preview-topbar">
        <div class="preview-brand"><img src="/images/app-icon-192.png" alt="Logo 5S"><span><small>Clinic Hub</small><b>Chào Bảo</b></span></div>
        <div class="preview-actions"><button aria-label="Thông báo">${icon('bell')}<i></i></button><button class="preview-user">TB</button></div>
      </header>
      <div class="preview-context"><span>${icon('pin')} 5S Phạm Văn Chiêu</span><b>Admin IT · Bản thử nghiệm</b></div>
      <main id="previewScreen" class="preview-screen"></main>
      <div class="preview-toast" id="previewToast"></div>
      <nav class="preview-bottom-nav" aria-label="Điều hướng chính">
        <button class="active" data-nav="overview" aria-label="Tổng quan">${icon('home')}<span>Tổng quan</span></button>
        <button data-nav="attendance" aria-label="Chấm công">${icon('clock')}<span>Chấm công</span></button>
        <button data-nav="schedule" aria-label="Lịch bác sĩ">${icon('calendar')}<span>Lịch BS</span></button>
        <button data-nav="admin" aria-label="Quản trị">${icon('users')}<span>Quản trị</span></button>
        <button class="preview-nav-more" data-nav="more" aria-label="Mở chức năng nhanh">${icon('more')}<span>Thêm</span></button>
      </nav>
      <div class="preview-sheet" id="previewSheet" hidden>
        <button class="preview-sheet-backdrop" data-close-sheet aria-label="Đóng"></button>
        <section><i></i><header><div><span>CHỨC NĂNG KHÁC</span><h2>Không gian làm việc</h2></div><button data-close-sheet>×</button></header>
          <div><button data-demo-toast="Mở công việc">${icon('check')}<span><b>Công việc</b><small>Giao việc và theo dõi tiến độ</small></span></button><button data-demo-toast="Mở đơn từ">${icon('file')}<span><b>Đơn từ</b><small>Nghỉ phép, tăng ca, đổi ca</small></span></button><button data-demo-toast="Mở báo cáo">${icon('chart')}<span><b>Báo cáo</b><small>Vận hành và đối chiếu</small></span></button></div>
        </section>
      </div>
    </div>`;

  const screen = document.getElementById('previewScreen');
  const sheet = document.getElementById('previewSheet');
  const toast = document.getElementById('previewToast');
  let toastTimer;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  };
  const openPanel = (name) => {
    if (name === 'more') {
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add('open'));
      return;
    }
    screen.innerHTML = panels[name] || panels.overview;
    screen.scrollTop = 0;
    document.querySelectorAll('.preview-bottom-nav [data-nav]').forEach((button) => button.classList.toggle('active', button.dataset.nav === name));
  };

  document.body.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) openPanel(nav.dataset.nav);
    const action = event.target.closest('[data-demo-toast]');
    if (action) showToast(action.dataset.demoToast);
    if (event.target.closest('[data-close-sheet]')) {
      sheet.classList.remove('open');
      setTimeout(() => { sheet.hidden = true; }, 180);
    }
  });
  openPanel('overview');
}
