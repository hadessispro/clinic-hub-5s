(function () {
  "use strict";

  const STORAGE_KEY = "clinicHub5sStateV1";
  const ACCOUNT_KEY = "clinicHub5sAccountV1";
  const SUPABASE_CONFIG = {
    url: "https://kynxfwnkbbdxtcgabcli.supabase.co",
    key: "sb_publishable_UrBN8kdg1HffNzwSkxykTA_MWNNxblD",
  };
  const today = new Date();
  const todayISO = toISODate(today);

  const departments = [
    { id: "mkt", name: "MKT", lead: "Lan Anh" },
    { id: "ns", name: "Nhân sự", lead: "Minh Hạnh" },
    { id: "kt", name: "Kế toán", lead: "Hoài Nam" },
    { id: "dvkh", name: "DVKH", lead: "Thu Ngân" },
    { id: "bs", name: "Bác sĩ", lead: "BS. Huy" },
    { id: "phuta", name: "Phụ tá", lead: "Ngọc Mai" },
    { id: "baove", name: "Bảo vệ", lead: "Anh Dũng" },
    { id: "laocong", name: "Lao công", lead: "Cô Hoa" },
  ];

  const shifts = [
    {
      id: "front-office",
      group: "Lễ tân, Phụ tá",
      name: "Ca hành chính",
      start: "07:30",
      end: "17:00",
      breakText: "Nghỉ trưa 1 tiếng",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "front-full",
      group: "Lễ tân, Phụ tá",
      name: "Ca full",
      start: "07:30",
      end: "20:00",
      breakText: "Nghỉ trưa 1 tiếng",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "front-afternoon",
      group: "Lễ tân, Phụ tá",
      name: "Ca chiều",
      start: "09:30",
      end: "20:00",
      breakText: "Theo điều phối phòng khám",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "front-morning",
      group: "Lễ tân, Phụ tá",
      name: "Ca sáng",
      start: "07:30",
      end: "18:00",
      breakText: "Theo điều phối phòng khám",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "doctor-office",
      group: "Bác sĩ",
      name: "Ca hành chính",
      start: "08:00",
      end: "17:00",
      breakText: "Theo lịch khám",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "doctor-morning",
      group: "Bác sĩ",
      name: "Ca sáng",
      start: "08:00",
      end: "18:00",
      breakText: "Theo lịch khám",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "doctor-afternoon",
      group: "Bác sĩ",
      name: "Ca chiều",
      start: "10:00",
      end: "20:00",
      breakText: "Theo lịch khám",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "doctor-full",
      group: "Bác sĩ",
      name: "Ca full",
      start: "08:00",
      end: "20:00",
      breakText: "Nghỉ 60 phút",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "security-weekday",
      group: "Bảo vệ",
      name: "Ngày thường",
      start: "07:00",
      end: "20:00",
      breakText: "Theo bàn giao ca",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "security-sunday",
      group: "Bảo vệ",
      name: "Chủ nhật",
      start: "07:00",
      end: "17:00",
      breakText: "Theo bàn giao ca",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "cleaning-weekday",
      group: "Tạp vụ",
      name: "Ngày thường",
      start: "06:00",
      end: "16:00",
      breakText: "Nghỉ trưa 11h-12h",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
    {
      id: "cleaning-sunday",
      group: "Tạp vụ",
      name: "Chủ nhật",
      start: "06:00",
      end: "15:00",
      breakText: "Nghỉ trưa 11h-12h",
      checkinRule: "Check-in trước giờ làm ít nhất 5 phút",
    },
  ];

  const demoAccounts = [
    { id: "admin", employee: "e-001", role: "admin", label: "Admin / Tổng vận hành", pin: "0000" },
    { id: "hr", employee: "e-001", role: "hr", label: "Phòng nhân sự", pin: "1111" },
    { id: "leader", employee: "e-007", role: "leader", label: "Trưởng bộ phận", pin: "2222" },
    { id: "finance", employee: "e-003", role: "finance", label: "Kế toán / Account chính", pin: "3333" },
    { id: "staff", employee: "e-012", role: "staff", label: "Nhân viên", pin: "4444" },
  ];

  const roleProfiles = {
    admin: { label: "Admin", scope: "Toàn quyền vận hành, phân luồng tài khoản, duyệt cuối." },
    hr: { label: "Nhân sự", scope: "Tuyển dụng, hồ sơ, hội nhập, đơn từ, lịch làm, công lương." },
    leader: { label: "Trưởng bộ phận", scope: "Giao việc, duyệt đơn cấp 1, xác nhận lịch và hiệu suất đội nhóm." },
    finance: { label: "Kế toán", scope: "Duyệt chi, hóa đơn, ứng lương, account chính và phản hồi lương." },
    staff: { label: "Nhân viên", scope: "Chấm công, nhận task, gửi đơn, đọc hội nhập, xem hồ sơ cá nhân." },
  };

  const uniformCatalog = [
    { id: "clinical", matcher: ["bac si", "bs", "phu ta"], title: "Bác sĩ / Phụ tá", items: ["3 bộ crop", "2 áo blue", "1 đôi dép", "1 bảng tên"] },
    { id: "reception", matcher: ["dvkh", "le tan", "cskh"], title: "Lễ tân / DVKH", items: ["3 bộ đầm liền", "Note hẹn may đồ", "1 kẹp tóc", "1 đôi dép", "1 bảng tên"] },
    { id: "default", matcher: [], title: "Nhân sự khác", items: ["3 bộ đồng phục phòng khám", "1 bảng tên"] },
  ];

  const DEFAULT_STATE = {
    settings: {
      clinicName: "Nha Khoa 5S - Lê Văn Thọ",
      clinicAddress: "60 Lê Văn Thọ, Phường Thông Tây Hội, TP.HCM",
      latitude: 10.8519,
      longitude: 106.6574,
      allowedRadius: 180,
      googleGasUrl: "",
      gasLastSync: "",
      revenueTarget: 1200000000,
      monthlyPayrollCycle: "Chốt công ngày 25 hằng tháng, duyệt lương cuối tháng.",
      managerNote:
        "Ưu tiên vận hành: chấm công GPS đúng bán kính, task phải có người chịu trách nhiệm, nghỉ phép cần duyệt trước ca, các phòng MKT/NS/KT/DVKH/BS/Phụ tá/Bảo vệ/Lao công đều dùng chung một luồng theo dõi.",
    },
    departments,
    shifts,
    employees: [
      { id: "e-001", name: "Minh Hạnh", department: "ns", role: "Quản lý nhân sự", shift: "front-office", phone: "0901 111 001", status: "active", manager: "Tổng vận hành", hireDate: "2025-04-12", insuranceDate: "2025-06-01", salaryOffer: 18000000, hourlyRate: 86000, profileLocked: true, certificates: ["C&B căn bản", "Quản trị nhân sự phòng khám"] },
      { id: "e-002", name: "Lan Anh", department: "mkt", role: "Lead MKT", shift: "front-office", phone: "0901 111 002", status: "active", manager: "Tổng vận hành", hireDate: "2025-03-08", insuranceDate: "2025-05-01", salaryOffer: 17000000, hourlyRate: 82000, profileLocked: true, certificates: ["Digital Marketing", "Google Ads Search"] },
      { id: "e-003", name: "Hoài Nam", department: "kt", role: "Kế toán", shift: "front-office", phone: "0901 111 003", status: "active", manager: "Tổng vận hành", hireDate: "2024-11-20", insuranceDate: "2025-01-01", salaryOffer: 16000000, hourlyRate: 77000, profileLocked: true, certificates: ["Kế toán doanh nghiệp", "Excel tài chính"] },
      { id: "e-004", name: "Thu Ngân", department: "dvkh", role: "Lễ tân trưởng", shift: "front-full", phone: "0901 111 004", status: "active", manager: "Minh Hạnh", hireDate: "2025-07-16", insuranceDate: "2025-09-01", salaryOffer: 13500000, hourlyRate: 65000, profileLocked: false, certificates: ["CSKH y tế", "Xử lý phản hồi khách hàng"] },
      { id: "e-005", name: "BS. Huy", department: "bs", role: "Bác sĩ điều trị", shift: "doctor-full", phone: "0901 111 005", status: "active", manager: "Tổng vận hành", hireDate: "2024-08-01", insuranceDate: "2024-10-01", salaryOffer: 42000000, hourlyRate: 210000, profileLocked: true, certificates: ["Chứng chỉ hành nghề RHM", "Implant cơ bản"] },
      { id: "e-006", name: "BS. Trang", department: "bs", role: "Bác sĩ chỉnh nha", shift: "doctor-office", phone: "0901 111 006", status: "active", manager: "BS. Huy", hireDate: "2025-01-11", insuranceDate: "2025-03-01", salaryOffer: 38000000, hourlyRate: 190000, profileLocked: true, certificates: ["Chứng chỉ hành nghề RHM", "Chỉnh nha lâm sàng"] },
      { id: "e-007", name: "Ngọc Mai", department: "phuta", role: "Phụ tá trưởng", shift: "front-morning", phone: "0901 111 007", status: "active", manager: "Minh Hạnh", hireDate: "2024-10-10", insuranceDate: "2025-01-01", salaryOffer: 13500000, hourlyRate: 65000, profileLocked: true, certificates: ["Phụ tá nha khoa", "Kiểm soát nhiễm khuẩn"] },
      { id: "e-008", name: "Thanh Vy", department: "phuta", role: "Phụ tá", shift: "front-afternoon", phone: "0901 111 008", status: "active", manager: "Ngọc Mai", hireDate: "2025-09-18", insuranceDate: "2025-12-01", salaryOffer: 11000000, hourlyRate: 53000, profileLocked: false, certificates: ["Phụ tá nha khoa"] },
      { id: "e-009", name: "Anh Dũng", department: "baove", role: "Bảo vệ", shift: "security-weekday", phone: "0901 111 009", status: "active", manager: "Minh Hạnh", hireDate: "2025-02-15", insuranceDate: "2025-04-01", salaryOffer: 9500000, hourlyRate: 46000, profileLocked: false, certificates: ["PCCC cơ sở", "An ninh cơ sở"] },
      { id: "e-010", name: "Cô Hoa", department: "laocong", role: "Lao công", shift: "cleaning-weekday", phone: "0901 111 010", status: "active", manager: "Minh Hạnh", hireDate: "2025-06-01", insuranceDate: "2025-08-01", salaryOffer: 9000000, hourlyRate: 43000, profileLocked: false, certificates: ["Vệ sinh y tế cơ bản"] },
      { id: "e-011", name: "Gia Bảo", department: "mkt", role: "Content", shift: "front-office", phone: "0901 111 011", status: "active", manager: "Lan Anh", hireDate: "2025-10-05", insuranceDate: "2026-01-01", salaryOffer: 11500000, hourlyRate: 55000, profileLocked: false, certificates: ["Content Marketing"] },
      { id: "e-012", name: "Phương Linh", department: "dvkh", role: "CSKH", shift: "front-afternoon", phone: "0901 111 012", status: "onboarding", manager: "Thu Ngân", hireDate: todayISO, insuranceDate: addDaysISO(60), salaryOffer: 10500000, hourlyRate: 50000, profileLocked: false, certificates: ["Đào tạo DVKH nội bộ"] },
    ],
    tasks: [
      { id: "t-001", title: "Tổng hợp lịch bác sĩ tuần này", department: "ns", assignee: "e-001", status: "doing", progress: 65, priority: "high", due: todayISO, notes: "Đồng bộ với lịch khám và danh sách phụ tá." },
      { id: "t-002", title: "Kịch bản chăm sóc sau niềng", department: "dvkh", assignee: "e-004", status: "todo", progress: 20, priority: "medium", due: addDaysISO(1), notes: "Gửi BS duyệt trước khi áp dụng." },
      { id: "t-003", title: "Báo cáo chi phí ads tuần", department: "mkt", assignee: "e-002", status: "doing", progress: 40, priority: "medium", due: addDaysISO(2), notes: "So sánh lead đặt lịch và lead chưa nghe máy." },
      { id: "t-004", title: "Kiểm tra vật tư implant", department: "kt", assignee: "e-003", status: "todo", progress: 10, priority: "high", due: todayISO, notes: "Đối soát tồn kho với phụ tá." },
      { id: "t-005", title: "Rà soát checklist vô trùng phòng điều trị", department: "phuta", assignee: "e-007", status: "done", progress: 100, priority: "high", due: addDaysISO(-1), notes: "Đã cập nhật checklist cuối ngày." },
      { id: "t-006", title: "Bàn giao camera và cổng cuối ca", department: "baove", assignee: "e-009", status: "todo", progress: 0, priority: "low", due: todayISO, notes: "Ghi nhận bất thường trong nhóm vận hành." },
    ],
    leaveRequests: [
      { id: "l-001", employee: "e-012", type: "Nghỉ phép năm", from: addDaysISO(2), to: addDaysISO(2), status: "pending", reason: "Việc gia đình, đã báo lead DVKH.", reviewer: "e-001" },
      { id: "l-002", employee: "e-006", type: "Đổi ca", from: todayISO, to: todayISO, status: "approved", reason: "Đổi sang ca chiều theo lịch bệnh nhân.", reviewer: "e-001" },
      { id: "l-003", employee: "e-010", type: "Nghỉ ốm", from: addDaysISO(-1), to: addDaysISO(-1), status: "rejected", reason: "Thiếu người thay ca vệ sinh buổi sáng.", reviewer: "e-001" },
      { id: "l-004", employee: "e-004", type: "Đơn xin đi trễ", from: todayISO, to: todayISO, status: "pending", reason: "Xin vào trễ 20 phút do kẹt xe, đã nhờ Linh nhận bàn giao DVKH.", reviewer: "e-001" },
      { id: "l-005", employee: "e-007", type: "Đơn bổ sung công vào/ra", from: addDaysISO(-1), to: addDaysISO(-1), status: "pending", reason: "Quên checkout cuối ca, đề nghị bổ sung giờ ra 18h05.", reviewer: "e-001" },
      { id: "l-006", employee: "e-002", type: "Đơn tăng ca", from: todayISO, to: todayISO, status: "approved", reason: "Tăng ca xử lý báo cáo lead và duyệt nội dung MKT.", reviewer: "e-001" },
    ],
    supplies: [
      { id: "s-001", name: "Beotem", category: "Trụ implant", unit: "trụ", stock: 18, minStock: 10, location: "Tủ implant A", supplier: "Kho tổng", lastImport: todayISO, notes: "Theo dõi lot khi xuất cho bác sĩ." },
      { id: "s-002", name: "ETK", category: "Trụ implant", unit: "trụ", stock: 7, minStock: 8, location: "Tủ implant A", supplier: "Kho tổng", lastImport: addDaysISO(-3), notes: "Dưới định mức, cần đề xuất mua." },
      { id: "s-003", name: "Dentium", category: "Trụ implant", unit: "trụ", stock: 12, minStock: 8, location: "Tủ implant B", supplier: "Kho tổng", lastImport: addDaysISO(-5), notes: "Ưu tiên lịch implant cuối tuần." },
      { id: "s-004", name: "Mắc cài kim loại", category: "Niềng", unit: "bộ", stock: 24, minStock: 12, location: "Kho chỉnh nha", supplier: "Nhà cung ứng chỉnh nha", lastImport: addDaysISO(-8), notes: "Dùng cho gói niềng tiêu chuẩn." },
      { id: "s-005", name: "Dây cung NiTi", category: "Niềng", unit: "gói", stock: 9, minStock: 15, location: "Kho chỉnh nha", supplier: "Nhà cung ứng chỉnh nha", lastImport: addDaysISO(-10), notes: "Cần nhập bổ sung size phổ biến." },
    ],
    purchaseRequests: [
      { id: "pr-001", itemName: "ETK", category: "Trụ implant", quantity: 10, unit: "trụ", requester: "e-007", department: "phuta", status: "pending", reason: "Tồn dưới định mức cho lịch implant tuần tới.", createdAt: `${todayISO}T09:00:00` },
      { id: "pr-002", itemName: "Dây cung NiTi", category: "Niềng", quantity: 20, unit: "gói", requester: "e-006", department: "bs", status: "approved", reason: "Bổ sung vật tư chỉnh nha theo lịch bệnh nhân.", createdAt: `${addDaysISO(-1)}T14:30:00` },
    ],
    assets: [
      { id: "as-001", code: "5S-GV-001", name: "Máy scan trong miệng", department: "bs", location: "Phòng điều trị 2", custodian: "e-005", condition: "good", checkedAt: todayISO, notes: "Đã kiểm tra dây nguồn và đầu scan." },
      { id: "as-002", code: "5S-GV-018", name: "Camera cổng", department: "baove", location: "Sảnh bảo vệ", custodian: "e-009", condition: "maintenance", checkedAt: addDaysISO(-2), notes: "Hình tối, cần kiểm tra nguồn." },
      { id: "as-003", code: "5S-GV-026", name: "Tủ lưu mẫu hàm", department: "phuta", location: "Kho lâm sàng", custodian: "e-007", condition: "good", checkedAt: addDaysISO(-4), notes: "Đã dán nhãn lại ngăn số 3." },
    ],
    proposals: [
      { id: "p-001", type: "Đề xuất ý kiến", title: "Tách checklist cuối ca theo phòng", department: "phuta", requester: "e-007", amount: 0, attachmentUrl: "https://docs.google.com", fileName: "", status: "pending", reason: "Giúp quản lý dễ kiểm tra ca tối.", createdAt: `${todayISO}T08:45:00` },
      { id: "p-002", type: "Duyệt chi PNS", title: "Chi phí đồng phục nhân sự mới", department: "ns", requester: "e-001", amount: 1800000, attachmentUrl: "", fileName: "bao-gia-dong-phuc.pdf", status: "pending", reason: "Phục vụ onboarding DVKH và phụ tá.", createdAt: `${todayISO}T10:15:00` },
      { id: "p-003", type: "Duyệt chi MKT", title: "Ngân sách ads lead niềng răng", department: "mkt", requester: "e-002", amount: 5000000, attachmentUrl: "https://docs.google.com/spreadsheets", fileName: "", status: "approved", reason: "Đẩy chiến dịch trong 7 ngày.", createdAt: `${addDaysISO(-1)}T16:20:00` },
    ],
    uniformLogs: [
      { id: "u-001", employee: "e-012", year: 2026, item: "Đồng phục DVKH", quantity: 3, size: "M", issuedAt: todayISO, issuer: "e-001", status: "issued", note: "Cấp mới khi hội nhập, đủ 3 bộ/năm." },
      { id: "u-002", employee: "e-007", year: 2026, item: "Đồng phục phụ tá", quantity: 3, size: "S", issuedAt: addDaysISO(-12), issuer: "e-001", status: "issued", note: "Cấp định kỳ năm 2026." },
      { id: "u-003", employee: "e-009", year: 2026, item: "Đồng phục bảo vệ", quantity: 2, size: "L", issuedAt: addDaysISO(-20), issuer: "e-001", status: "partial", note: "Còn thiếu 1 bộ, chờ hàng về." },
    ],
    onboardingDocs: [
      { id: "od-001", title: "Nội quy phòng khám", category: "Nội quy", attachmentUrl: "https://docs.google.com/document", fileName: "noi-quy-nha-khoa-5s.pdf", owner: "e-001", required: true, updatedAt: todayISO },
      { id: "od-002", title: "Hướng dẫn chấm công GPS", category: "Chấm công", attachmentUrl: "", fileName: "huong-dan-cham-cong.pdf", owner: "e-001", required: true, updatedAt: todayISO },
      { id: "od-003", title: "Chính sách nghỉ phép và tăng ca", category: "Chính sách", attachmentUrl: "https://docs.google.com/document", fileName: "", owner: "e-001", required: true, updatedAt: addDaysISO(-2) },
      { id: "od-004", title: "Quy trình CSKH sau điều trị", category: "DVKH", attachmentUrl: "", fileName: "quy-trinh-cskh.docx", owner: "e-004", required: false, updatedAt: addDaysISO(-5) },
      { id: "od-005", title: "Ký cam kết bảo mật thông tin", category: "Ký văn bản", attachmentUrl: "", fileName: "cam-ket-bao-mat.pdf", owner: "e-001", required: true, updatedAt: todayISO },
      { id: "od-006", title: "Hồ sơ thực tập và bàn giao người hướng dẫn", category: "Hồ sơ thực tập", attachmentUrl: "", fileName: "ho-so-thuc-tap.docx", owner: "e-001", required: true, updatedAt: todayISO },
      { id: "od-007", title: "Hướng dẫn cài tài khoản nhân viên và vân tay", category: "Tài khoản", attachmentUrl: "", fileName: "huong-dan-cai-tai-khoan-van-tay.pdf", owner: "e-001", required: true, updatedAt: todayISO },
      { id: "od-008", title: "Giấy phép hành nghề và bằng cấp chứng chỉ", category: "Hồ sơ", attachmentUrl: "", fileName: "checklist-giay-phep-hanh-nghe.xlsx", owner: "e-001", required: true, updatedAt: todayISO },
      { id: "od-009", title: "Quy trình phòng ban, làm việc và bàn giao", category: "Quy trình", attachmentUrl: "", fileName: "quy-trinh-phong-ban-ban-giao.pdf", owner: "e-001", required: true, updatedAt: todayISO },
    ],
    onboardingProgress: [
      { id: "op-001", employee: "e-012", doc: "od-001", status: "done", completedAt: todayISO },
      { id: "op-002", employee: "e-012", doc: "od-002", status: "reading", completedAt: "" },
      { id: "op-003", employee: "e-012", doc: "od-003", status: "todo", completedAt: "" },
      { id: "op-004", employee: "e-008", doc: "od-001", status: "done", completedAt: addDaysISO(-9) },
    ],
    attendance: [
      {
        id: "a-001",
        employee: "e-001",
        shift: "front-office",
        type: "checkin",
        date: todayISO,
        time: `${todayISO}T07:19:00`,
        lat: 10.8519,
        lng: 106.6573,
        distance: 12,
        accuracy: 28,
        status: "valid",
      },
      {
        id: "a-002",
        employee: "e-004",
        shift: "front-full",
        type: "checkin",
        date: todayISO,
        time: `${todayISO}T07:38:00`,
        lat: 10.8524,
        lng: 106.6578,
        distance: 74,
        accuracy: 35,
        status: "late",
      },
      {
        id: "a-003",
        employee: "e-009",
        shift: "security-weekday",
        type: "checkin",
        date: todayISO,
        time: `${todayISO}T06:50:00`,
        lat: 10.8517,
        lng: 106.6572,
        distance: 32,
        accuracy: 24,
        status: "valid",
      },
    ],
    channels: [
      { id: "all", name: "Toàn phòng khám" },
      { id: "ops", name: "Vận hành trong ngày" },
      { id: "mkt", name: "MKT" },
      { id: "ns", name: "Nhân sự" },
      { id: "kt", name: "Kế toán" },
      { id: "dvkh", name: "DVKH" },
      { id: "clinical", name: "BS & Phụ tá" },
      { id: "facility", name: "Bảo vệ & Lao công" },
    ],
    messages: [
      { id: "m-001", channel: "all", author: "e-001", text: "Các phòng ban xác nhận ca trực và check-in trước giờ làm ít nhất 5 phút.", time: `${todayISO}T07:05:00` },
      { id: "m-002", channel: "ops", author: "e-009", text: "Cổng mở lúc 6h45, khu vực gửi xe ổn định.", time: `${todayISO}T06:55:00` },
      { id: "m-003", channel: "clinical", author: "e-007", text: "Phòng 2 đã chuẩn bị khay vô trùng cho lịch chỉnh nha sáng nay.", time: `${todayISO}T07:25:00` },
      { id: "m-004", channel: "mkt", author: "e-002", text: "MKT sẽ gửi danh sách lead cần DVKH gọi lại trước 10h.", time: `${todayISO}T08:10:00` },
    ],
    recruitment: [
      { id: "r-001", candidate: "Trần Mỹ Duyên", role: "Lễ tân", department: "dvkh", responsible: "e-001", stage: "interview", interviewDate: addDaysISO(1), autoSchedule: true, salaryExpected: 12000000, offerAmount: 11500000, insuranceDate: addDaysISO(75), status: "pending", note: "Set lịch phỏng vấn với Thu Ngân, kiểm tra ngoại hình và khả năng dùng app." },
      { id: "r-002", candidate: "Nguyễn Quốc Bảo", role: "Phụ tá thực tập", department: "phuta", responsible: "e-007", stage: "trial", interviewDate: addDaysISO(-2), autoSchedule: true, salaryExpected: 9000000, offerAmount: 8500000, insuranceDate: addDaysISO(90), status: "approved", note: "Có hồ sơ thực tập, cần ký bảo mật thông tin và hướng dẫn vô trùng." },
      { id: "r-003", candidate: "BS. Khánh", role: "Bác sĩ tổng quát", department: "bs", responsible: "e-005", stage: "offer", interviewDate: addDaysISO(3), autoSchedule: false, salaryExpected: 36000000, offerAmount: 34000000, insuranceDate: addDaysISO(60), status: "pending", note: "Cần bổ sung giấy phép hành nghề trước khi khóa hồ sơ." },
    ],
    scheduleRequests: [
      { id: "sr-001", employee: "e-007", month: "2026-06", submittedAt: "2026-05-25T08:15:00", preference: "Xin ưu tiên ca sáng 5 ngày/tuần, hỗ trợ implant cuối tuần.", status: "approved", reviewer: "e-001" },
      { id: "sr-002", employee: "e-006", month: "2026-06", submittedAt: "2026-05-25T09:30:00", preference: "Bác sĩ chỉnh nha đăng ký ca hành chính, tăng ca thứ 7 khi có lịch niềng.", status: "pending", reviewer: "e-001" },
      { id: "sr-003", employee: "e-004", month: "2026-06", submittedAt: "2026-05-24T17:40:00", preference: "Lễ tân đăng ký ca full các ngày cao điểm, cần chia ca với Phương Linh.", status: "approved", reviewer: "e-001" },
    ],
    scheduleAssignments: [
      { id: "sa-001", employee: "e-005", date: todayISO, shift: "doctor-full", owner: "e-001", swapWith: "", status: "confirmed", overtimeMinutes: 60, earlyArrivalMinutes: 10, earlyLeaveMinutes: 0, note: "Có lịch implant, phụ tá Ngọc Mai hỗ trợ.", proofUrl: "" },
      { id: "sa-002", employee: "e-007", date: todayISO, shift: "front-morning", owner: "e-001", swapWith: "e-008", status: "confirmed", overtimeMinutes: 30, earlyArrivalMinutes: 20, earlyLeaveMinutes: 0, note: "Đến sớm chuẩn bị phòng điều trị 2, tính công phần đến sớm.", proofUrl: "" },
      { id: "sa-003", employee: "e-004", date: todayISO, shift: "front-full", owner: "e-001", swapWith: "e-012", status: "planned", overtimeMinutes: 0, earlyArrivalMinutes: 0, earlyLeaveMinutes: 0, note: "Chia lịch DVKH, Linh hỗ trợ cuối ngày.", proofUrl: "" },
    ],
    salaryAdvances: [
      { id: "av-001", employee: "e-008", amount: 2000000, bankAccount: "Thanh Vy - 9704 1234 5678", reason: "Ứng lương cá nhân, trừ vào kỳ lương tháng 6.", status: "pending", reviewer: "e-001", routedTo: "ns", createdAt: `${todayISO}T09:20:00` },
      { id: "av-002", employee: "e-011", amount: 1500000, bankAccount: "Gia Bảo - Techcombank 1903...", reason: "Duyệt tiền mặt cho sản xuất nội dung ngắn.", status: "approved", reviewer: "e-003", routedTo: "kt", createdAt: `${addDaysISO(-1)}T15:05:00` },
    ],
    payrollFeedback: [
      { id: "pf-001", employee: "e-004", month: "2026-06", text: "Cần kiểm tra lại ca tăng cường DVKH ngày cuối tuần.", status: "open", createdAt: `${todayISO}T11:00:00` },
      { id: "pf-002", employee: "e-007", month: "2026-06", text: "Đã xác nhận công đến sớm khi setup implant.", status: "resolved", createdAt: `${addDaysISO(-1)}T18:10:00` },
    ],
    incidents: [
      { id: "i-001", employee: "e-012", reporter: "e-004", date: todayISO, category: "Chấm công", title: "Quên check-out cuối ca", proofUrl: "https://drive.google.com", fileName: "anh-man-hinh-zalo.png", status: "open", note: "Có hình ảnh chứng minh bàn giao lúc 20h05." },
      { id: "i-002", employee: "e-009", reporter: "e-001", date: addDaysISO(-2), category: "Tài sản", title: "Camera cổng hình tối", proofUrl: "", fileName: "bien-ban-camera.pdf", status: "tracking", note: "Giao task kiểm tra nguồn và lưu biên bản." },
    ],
    assetAudits: [
      { id: "aa-001", title: "Kiểm kê tài sản tháng 6", department: "phuta", owner: "e-007", due: addDaysISO(5), fileName: "bang-kiem-ke-thang-6.xlsx", attachmentUrl: "", status: "doing", note: "Giao bảng excel cho phụ tá phụ trách từng phòng điều trị." },
      { id: "aa-002", title: "Biên bản camera và cổng", department: "baove", owner: "e-009", due: todayISO, fileName: "bien-ban-camera.pdf", attachmentUrl: "", status: "pending", note: "Bảo vệ cập nhật ảnh và gửi tổng vận hành." },
    ],
    offboardingCases: [
      { id: "ob-001", employee: "e-010", lastWorkingDate: addDaysISO(20), status: "draft", checklist: ["Chốt công lương", "Trả sổ bảo hiểm", "Thu hồi quyền lợi", "Bàn giao công việc"], note: "Mẫu hội nhập nghỉ việc để HR theo dõi khi phát sinh." },
    ],
    performanceMetrics: [
      { id: "kpi-001", month: "2026-06", department: "mkt", revenue: 420000000, target: 500000000, leads: 320, appointments: 146, score: 84, note: "Lead niềng tốt, cần tối ưu tỉ lệ nghe máy." },
      { id: "kpi-002", month: "2026-06", department: "dvkh", revenue: 0, target: 0, leads: 146, appointments: 112, score: 91, note: "DVKH bám lịch tốt, còn 8 phản hồi cần xử lý." },
      { id: "kpi-003", month: "2026-06", department: "bs", revenue: 680000000, target: 700000000, leads: 0, appointments: 0, score: 88, note: "Hiệu suất ghế cao, cần cân lịch implant và chỉnh nha." },
    ],
    notes: [
      { id: "n-001", title: "Quy tắc ca", text: "Áp dụng ca làm theo tài liệu 5S - HCM, mỗi check-in cần trước giờ làm ít nhất 5 phút.", owner: "Quản lý vận hành" },
      { id: "n-002", title: "Luồng duyệt", text: "Nghỉ phép và đổi ca cần HR/Quản lý duyệt trước khi tính công.", owner: "Nhân sự" },
      { id: "n-003", title: "Kiểm tra vị trí", text: "Bán kính mặc định 180m quanh phòng khám; quản lý có thể chỉnh trong Báo cáo.", owner: "Admin" },
    ],
  };

  let state = loadState();
  let currentView = "dashboard";
  let activeChannel = "all";
  let lastLocation = null;
  let searchTerm = "";
  let attendanceHistoryTerm = "";
  let currentAccount = loadAccount();
  let supabaseClient = null;
  let supabaseUser = null;
  let supabaseProfile = null;
  let cloudStatus = "offline";
  let cloudMessage = "Chạy demo local";
  let syncTimer = null;

  const viewTitles = {
    dashboard: "Tổng quan vận hành",
    attendance: "Chấm công GPS",
    tasks: "Công việc đội nhóm",
    supplies: "Cung ứng vật tư",
    assets: "Kiểm kê tài sản",
    proposals: "Phiếu đề xuất",
    recruitment: "Tuyển dụng & offer",
    schedule: "Lịch làm & tăng ca",
    leave: "Đơn từ nhân sự",
    payroll: "Công lương",
    uniforms: "Nhật ký đồng phục",
    onboarding: "Đào tạo hội nhập",
    people: "Nhân sự phòng khám",
    incidents: "Sự vụ nhân viên",
    chat: "Tin nhắn đội nhóm",
    reports: "Báo cáo quản lý",
    integrations: "Tích hợp & bảo mật",
  };

  const taskStatus = {
    todo: "Cần làm",
    doing: "Đang xử lý",
    done: "Hoàn tất",
  };

  const priorityLabels = {
    high: "Cao",
    medium: "Vừa",
    low: "Thấp",
  };

  const leaveStatus = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    rejected: "Từ chối",
  };

  const appView = document.getElementById("appView");
  const currentDateLabel = document.getElementById("currentDateLabel");
  const viewTitle = document.getElementById("viewTitle");
  const mainNav = document.getElementById("mainNav");
  const globalSearch = document.getElementById("globalSearch");
  const resetDemoBtn = document.getElementById("resetDemoBtn");
  const authArea = document.getElementById("authArea");

  currentDateLabel.textContent = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(today);

  mainNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    setView(button.dataset.view);
  });

  document.body.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-view-jump]");
    if (jump) setView(jump.dataset.viewJump);
  });

  resetDemoBtn.addEventListener("click", () => {
    state = clone(DEFAULT_STATE);
    saveState();
    lastLocation = null;
    showToast("Đã nạp lại dữ liệu mẫu.");
    render();
  });

  globalSearch.addEventListener("input", () => {
    searchTerm = globalSearch.value.trim().toLowerCase();
    render();
  });

  appView.addEventListener("click", handleViewClick);
  appView.addEventListener("change", handleViewChange);
  appView.addEventListener("input", handleViewInput);
  appView.addEventListener("submit", handleViewSubmit);
  authArea.addEventListener("change", handleAuthChange);
  authArea.addEventListener("click", handleAuthClick);

  render();
  initCloud();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved) return clone(DEFAULT_STATE);
      const base = clone(DEFAULT_STATE);
      return {
        ...base,
        ...saved,
        settings: { ...base.settings, ...(saved.settings || {}) },
        departments: saved.departments || base.departments,
        shifts: saved.shifts || base.shifts,
        employees: (saved.employees || base.employees).map((employee) => ({
          manager: "Chưa gán",
          hireDate: todayISO,
          insuranceDate: "",
          salaryOffer: 0,
          hourlyRate: 0,
          profileLocked: false,
          certificates: [],
          ...employee,
        })),
        tasks: saved.tasks || base.tasks,
        leaveRequests: saved.leaveRequests || base.leaveRequests,
        supplies: saved.supplies || base.supplies,
        purchaseRequests: saved.purchaseRequests || base.purchaseRequests,
        assets: saved.assets || base.assets,
        proposals: saved.proposals || base.proposals,
        uniformLogs: saved.uniformLogs || base.uniformLogs,
        onboardingDocs: mergeById(saved.onboardingDocs, base.onboardingDocs),
        onboardingProgress: saved.onboardingProgress || base.onboardingProgress,
        attendance: saved.attendance || base.attendance,
        channels: saved.channels || base.channels,
        messages: saved.messages || base.messages,
        recruitment: saved.recruitment || base.recruitment,
        scheduleRequests: saved.scheduleRequests || base.scheduleRequests,
        scheduleAssignments: saved.scheduleAssignments || base.scheduleAssignments,
        salaryAdvances: saved.salaryAdvances || base.salaryAdvances,
        payrollFeedback: saved.payrollFeedback || base.payrollFeedback,
        incidents: saved.incidents || base.incidents,
        assetAudits: saved.assetAudits || base.assetAudits,
        offboardingCases: saved.offboardingCases || base.offboardingCases,
        performanceMetrics: saved.performanceMetrics || base.performanceMetrics,
        notes: saved.notes || base.notes,
      };
    } catch (error) {
      return clone(DEFAULT_STATE);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    scheduleCloudSync();
  }

  function render() {
    viewTitle.textContent = viewTitles[currentView];
    renderAuthArea();
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === currentView);
    });

    const renderers = {
      dashboard: renderDashboard,
      attendance: renderAttendance,
      tasks: renderTasks,
      supplies: renderSupplies,
      assets: renderAssets,
      proposals: renderProposals,
      recruitment: renderRecruitment,
      schedule: renderSchedule,
      leave: renderLeave,
      payroll: renderPayroll,
      uniforms: renderUniforms,
      onboarding: renderOnboarding,
      people: renderPeople,
      incidents: renderIncidents,
      chat: renderChat,
      reports: renderReports,
      integrations: renderIntegrations,
    };
    const body = renderers[currentView]();
    appView.innerHTML = searchTerm ? `${renderSmartSearchPanel()}${body}` : body;
  }

  function setView(view) {
    if (!viewTitles[view]) return;
    currentView = view;
    render();
  }

  function renderAuthArea() {
    const employee = employeeById(currentAccount.employee);
    const cloudTone = cloudStatus === "online" ? "good" : cloudStatus === "syncing" ? "warn" : "neutral";
    authArea.innerHTML = `
      <div class="auth-chip">
        <span class="auth-dot ${escapeAttr(cloudStatus)}"></span>
        <button class="auth-summary" type="button" data-action="jump-integrations" title="Mở bảo mật và Supabase">
          <strong>${escapeHTML(supabaseProfile?.full_name || employee?.name || "Demo")}</strong>
          <small>${escapeHTML(roleProfiles[currentAccount.role]?.label || currentAccount.role)} · ${escapeHTML(cloudMessage)}</small>
        </button>
        ${statusPill(cloudStatus === "online" ? "Supabase" : "Demo", cloudTone)}
      </div>
    `;
  }

  function handleAuthChange(event) {
    const target = event.target;
    if (!target.matches("[data-action='demo-account']")) return;
    const account = demoAccounts.find((item) => item.id === target.value);
    if (!account) return;
    currentAccount = account;
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(currentAccount));
    showToast(`Đã chuyển vai trò demo: ${account.label}.`);
    render();
  }

  function handleAuthClick(event) {
    const target = event.target.closest("[data-action='jump-integrations']");
    if (target) setView("integrations");
  }

  function loadAccount() {
    try {
      const saved = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "null");
      return demoAccounts.find((account) => account.id === saved?.id) || demoAccounts[0];
    } catch (error) {
      return demoAccounts[0];
    }
  }

  async function initCloud() {
    if (!window.supabase?.createClient) {
      cloudStatus = "offline";
      cloudMessage = "Thiếu supabase-js";
      render();
      return;
    }

    try {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data } = await supabaseClient.auth.getSession();
      supabaseUser = data.session?.user || null;
      if (supabaseUser) await loadCloudProfileAndState();
      else {
        cloudStatus = "offline";
        cloudMessage = "Chưa login";
        render();
      }

      supabaseClient.auth.onAuthStateChange(async (_event, session) => {
        supabaseUser = session?.user || null;
        if (supabaseUser) await loadCloudProfileAndState();
        else {
          supabaseProfile = null;
          cloudStatus = "offline";
          cloudMessage = "Chạy demo local";
          render();
        }
      });
    } catch (error) {
      cloudStatus = "offline";
      cloudMessage = "Chưa chạy SQL/RLS";
      render();
    }
  }

  async function loadCloudProfileAndState() {
    if (!supabaseClient || !supabaseUser) return;
    cloudStatus = "syncing";
    cloudMessage = "Đang đồng bộ";
    render();

    const profileResult = await supabaseClient
      .from("profiles")
      .select("id, employee_code, full_name, department, role, active")
      .eq("id", supabaseUser.id)
      .maybeSingle();

    if (profileResult.error) {
      cloudStatus = "offline";
      cloudMessage = "Cần map profile";
      render();
      return;
    }

    supabaseProfile = profileResult.data;
    if (supabaseProfile?.role) {
      currentAccount = {
        id: `supabase-${supabaseProfile.role}`,
        employee: supabaseProfile.employee_code || "e-001",
        role: supabaseProfile.role,
        label: roleProfiles[supabaseProfile.role]?.label || supabaseProfile.role,
        pin: "",
      };
    }

    const snapshot = await supabaseClient
      .from("clinic_state_snapshots")
      .select("payload, updated_at")
      .eq("id", "main")
      .maybeSingle();

    if (snapshot.data?.payload && hasOpsAccess()) {
      state = mergeState(snapshot.data.payload);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      cloudMessage = `Sync ${formatDateTime(snapshot.data.updated_at)}`;
    } else {
      cloudMessage = "Đã login";
    }

    cloudStatus = "online";
    render();
  }

  function mergeState(payload) {
    const base = clone(DEFAULT_STATE);
    return {
      ...base,
      ...payload,
      settings: { ...base.settings, ...(payload.settings || {}) },
      departments: payload.departments || base.departments,
      shifts: payload.shifts || base.shifts,
    };
  }

  function scheduleCloudSync() {
    if (!supabaseClient || !supabaseUser || !hasOpsAccess()) return;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(syncCloudSnapshot, 900);
  }

  async function syncCloudSnapshot() {
    if (!supabaseClient || !supabaseUser || !hasOpsAccess()) return;
    cloudStatus = "syncing";
    cloudMessage = "Đang lưu cloud";
    renderAuthArea();
    const { error } = await supabaseClient.from("clinic_state_snapshots").upsert({
      id: "main",
      payload: state,
      updated_by: supabaseUser.id,
      updated_at: new Date().toISOString(),
    });
    cloudStatus = error ? "offline" : "online";
    cloudMessage = error ? "Cloud lỗi/RLS" : "Đã lưu cloud";
    renderAuthArea();
  }

  function hasOpsAccess() {
    return ["admin", "hr", "leader", "finance"].includes(currentAccount.role);
  }

  function renderDashboard() {
    const todayRecords = state.attendance.filter((record) => record.date === todayISO && record.type === "checkin");
    const checkedInIds = new Set(todayRecords.map((record) => record.employee));
    const activeEmployees = state.employees.filter((employee) => employee.status !== "inactive");
    const openTasks = state.tasks.filter((task) => task.status !== "done");
    const averageProgress = state.tasks.length
      ? Math.round(state.tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / state.tasks.length)
      : 0;
    const pendingLeaves = state.leaveRequests.filter((request) => request.status === "pending");
    const issues = todayRecords.filter((record) => record.status !== "valid");
    const pendingOps = [
      ...state.recruitment.filter((item) => item.status === "pending"),
      ...state.scheduleRequests.filter((item) => item.status === "pending"),
      ...state.salaryAdvances.filter((item) => item.status === "pending"),
      ...state.proposals.filter((item) => item.status === "pending"),
    ];
    const revenue = state.performanceMetrics.reduce((sum, item) => sum + Number(item.revenue || 0), 0);

    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Live clinic operations</p>
          <h3>Điều phối phòng MKT, NS, KT, DVKH, BS, Phụ tá, Bảo vệ, Lao công trong một màn hình.</h3>
        </div>
        <div class="pill-row">
          ${pill(state.settings.clinicName)}
          ${pill(`${state.settings.allowedRadius}m GPS`)}
          ${pill(`${state.shifts.length} ca làm`)}
        </div>
      </div>

      <div class="grid cols-4">
        ${metric("Nhân sự đang hoạt động", activeEmployees.length, `${departments.length} phòng ban`)}
        ${metric("Đã check-in hôm nay", checkedInIds.size, `${Math.max(activeEmployees.length - checkedInIds.size, 0)} người chưa ghi nhận`)}
        ${metric("Task đang mở", openTasks.length, `Tiến độ trung bình ${averageProgress}%`)}
        ${metric("Đơn nghỉ chờ duyệt", pendingLeaves.length, issues.length ? `${issues.length} ca cần xác minh` : "Không có cảnh báo lớn")}
        ${metric("Luồng chờ duyệt", pendingOps.length, "Tuyển dụng, lịch, ứng lương, đề xuất")}
        ${metric("Lịch tháng", state.scheduleAssignments.length, `${state.scheduleRequests.length} đăng ký lịch`)}
        ${metric("Doanh thu/KPI", formatCurrency(revenue), `Mục tiêu ${formatCurrency(state.settings.revenueTarget)}`)}
        ${metric("Sự vụ mở", state.incidents.filter((item) => item.status !== "closed").length, "Có hình/file chứng minh")}
      </div>

      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel">
          <div class="section-title">
            <h3>Dòng chảy trong ngày</h3>
            <button class="ghost-button" type="button" data-view-jump="attendance"><span>⌖</span>Xem chấm công</button>
          </div>
          <div class="timeline">
            ${renderTimeline(todayRecords)}
          </div>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Ghi chú quản lý</h3>
            <button class="ghost-button" type="button" data-view-jump="reports"><span>▣</span>Chỉnh ghi chú</button>
          </div>
          <p class="subtle">${escapeHTML(state.settings.managerNote)}</p>
          <div class="grid" style="margin-top:12px">
            ${state.notes.map((note) => `
              <article class="schedule-card">
                <div class="section-title">
                  <h3>${escapeHTML(note.title)}</h3>
                  ${pill(note.owner)}
                </div>
                <p class="subtle">${escapeHTML(note.text)}</p>
              </article>
            `).join("")}
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Ca làm theo tài liệu 5S - HCM</h3>
          ${pill("Check-in trước ca 5 phút")}
        </div>
        <div class="grid cols-4">
          ${state.shifts.slice(0, 8).map(renderScheduleCard).join("")}
        </div>
      </section>
    `;
  }

  function renderAttendance() {
    const selectedEmployee = state.employees[0] || {};
    const recentRecords = filteredAttendanceHistory();
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">GPS attendance</p>
          <h3>Chấm công bằng định vị trực tiếp, tính khoảng cách tới phòng khám và đánh dấu ca cần quản lý xác minh.</h3>
        </div>
        <button class="secondary-button" type="button" data-action="export-attendance"><span>⇩</span>Xuất CSV</button>
      </div>

      <div class="clock-panel">
        <section class="panel">
          <div class="section-title">
            <h3>Ghi nhận chấm công</h3>
            ${pill(state.settings.clinicAddress)}
          </div>
          <form id="attendanceForm" class="form-grid">
            <div class="form-field">
              <label for="attendanceEmployee">Tên nhân sự</label>
              <input id="attendanceEmployee" name="employeeName" list="employeeSuggestions" autocomplete="off" placeholder="Gõ tên, phòng ban hoặc chức danh" />
              <datalist id="employeeSuggestions">
                ${state.employees.map((employee) => `<option value="${escapeAttr(employeeSuggestionValue(employee))}"></option>`).join("")}
              </datalist>
            </div>
            <div class="form-field">
              <label for="attendanceShift">Ca làm</label>
              <select id="attendanceShift" name="shift">
                ${state.shifts.map((shift) => option(shift.id, `${shift.group} / ${shift.name} (${shift.start}-${shift.end})`, shift.id === selectedEmployee.shift)).join("")}
              </select>
            </div>
            <div class="form-field">
              <label for="manualLat">Vĩ độ thủ công</label>
              <input id="manualLat" name="manualLat" inputmode="decimal" placeholder="VD: ${state.settings.latitude}" />
            </div>
            <div class="form-field">
              <label for="manualLng">Kinh độ thủ công</label>
              <input id="manualLng" name="manualLng" inputmode="decimal" placeholder="VD: ${state.settings.longitude}" />
            </div>
            <div class="form-field full">
              <label>Vị trí hiện tại</label>
              <div class="location-result" id="locationResult">
                ${renderLocationResult()}
              </div>
            </div>
            <div class="form-field full">
              <div class="pill-row">
                <button class="secondary-button" type="button" data-action="get-location"><span>⌖</span>Lấy vị trí trực tiếp</button>
                <button class="primary-button" type="button" data-action="record-attendance" data-type="checkin"><span>✓</span>Check-in</button>
                <button class="ghost-button" type="button" data-action="record-attendance" data-type="checkout"><span>↗</span>Check-out</button>
              </div>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Quy tắc kiểm tra</h3>
            ${pill(`${state.settings.allowedRadius}m`)}
          </div>
          <div class="grid">
            ${renderScheduleCard(shiftById("front-office"))}
            ${renderScheduleCard(shiftById("doctor-full"))}
            ${renderScheduleCard(shiftById("cleaning-weekday"))}
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title history-title">
          <h3>Lịch sử chấm công</h3>
          <label class="inline-search" for="attendanceHistorySearch">
            <span>⌕</span>
            <input
              id="attendanceHistorySearch"
              type="search"
              data-action="attendance-history-search"
              placeholder="Tìm tên, ca, ngày, trạng thái"
              value="${escapeAttr(attendanceHistoryTerm)}"
              autocomplete="off"
            />
          </label>
          <span class="subtle">${recentRecords.length} bản ghi</span>
        </div>
        ${renderAttendanceTable(recentRecords)}
      </section>
    `;
  }

  function renderTasks() {
    const tasks = filteredTasks();
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Task management</p>
          <h3>Giao việc theo phòng ban, người phụ trách, deadline, trạng thái và tiến độ hoàn thành.</h3>
        </div>
      </div>

      <section class="panel">
        <div class="section-title">
          <h3>Tạo task mới</h3>
          ${pill("Mỗi task cần owner")}
        </div>
        <form class="form-grid three" data-form="task">
          <div class="form-field">
            <label for="taskTitle">Tên việc</label>
            <input id="taskTitle" name="title" required placeholder="VD: Chuẩn bị hồ sơ bệnh nhân" />
          </div>
          <div class="form-field">
            <label for="taskDepartment">Phòng ban</label>
            <select id="taskDepartment" name="department">${departmentOptions()}</select>
          </div>
          <div class="form-field">
            <label for="taskAssignee">Người phụ trách</label>
            <select id="taskAssignee" name="assignee">${employeeOptions()}</select>
          </div>
          <div class="form-field">
            <label for="taskDue">Deadline</label>
            <input id="taskDue" name="due" type="date" value="${todayISO}" />
          </div>
          <div class="form-field">
            <label for="taskPriority">Ưu tiên</label>
            <select id="taskPriority" name="priority">
              <option value="high">Cao</option>
              <option value="medium" selected>Vừa</option>
              <option value="low">Thấp</option>
            </select>
          </div>
          <div class="form-field">
            <label for="taskProgress">Tiến độ (%)</label>
            <input id="taskProgress" name="progress" type="number" min="0" max="100" value="0" />
          </div>
          <div class="form-field full">
            <label for="taskNotes">Ghi chú</label>
            <textarea id="taskNotes" name="notes" placeholder="Yêu cầu, tài liệu, điều kiện hoàn thành"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Thêm task</button>
          </div>
        </form>
      </section>

      <section class="kanban" style="margin-top:14px">
        ${Object.keys(taskStatus).map((status) => renderTaskColumn(status, tasks)).join("")}
      </section>
    `;
  }

  function renderSupplies() {
    const supplies = filteredSupplies();
    const purchaseRequests = filteredPurchaseRequests();
    const lowStock = state.supplies.filter((item) => Number(item.stock) <= Number(item.minStock));
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Supply & inventory</p>
          <h3>Nhập tồn, kiểm soát định mức và đề xuất mua vật tư như Beotem, ETK, Dentium hoặc nhóm niềng.</h3>
        </div>
        <div class="pill-row">
          ${statusPill(`${lowStock.length} dưới định mức`, lowStock.length ? "warn" : "good")}
          ${pill(`${state.purchaseRequests.filter((request) => request.status === "pending").length} đề xuất chờ duyệt`)}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Nhập vật tư / cập nhật tồn</h3>
            ${pill("Tự cộng vào tồn nếu trùng tên")}
          </div>
          <form class="form-grid three" data-form="supply-import">
            <div class="form-field">
              <label for="supplyItemName">Tên vật tư</label>
              <input id="supplyItemName" name="itemName" list="supplySuggestions" required placeholder="Beotem, ETK, Dentium..." />
              <datalist id="supplySuggestions">
                ${state.supplies.map((item) => `<option value="${escapeAttr(item.name)}"></option>`).join("")}
              </datalist>
            </div>
            <div class="form-field">
              <label for="supplyCategory">Nhóm</label>
              <select id="supplyCategory" name="category">
                <option>Trụ implant</option>
                <option>Niềng</option>
                <option>Vật tư tiêu hao</option>
                <option>Dụng cụ lâm sàng</option>
              </select>
            </div>
            <div class="form-field">
              <label for="supplyQuantity">Số lượng nhập</label>
              <input id="supplyQuantity" name="quantity" type="number" min="1" value="1" />
            </div>
            <div class="form-field">
              <label for="supplyUnit">Đơn vị</label>
              <input id="supplyUnit" name="unit" value="trụ" />
            </div>
            <div class="form-field">
              <label for="supplyLocation">Vị trí lưu</label>
              <input id="supplyLocation" name="location" placeholder="Tủ implant A" />
            </div>
            <div class="form-field">
              <label for="supplySupplier">Nguồn/nhà cung ứng</label>
              <input id="supplySupplier" name="supplier" placeholder="Kho tổng" />
            </div>
            <div class="form-field full">
              <label for="supplyNotes">Ghi chú</label>
              <textarea id="supplyNotes" name="notes" placeholder="Lot, hạn dùng, lịch cần vật tư"></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Nhập tồn</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Đề xuất mua</h3>
            ${pill("Gửi lên quản lý duyệt")}
          </div>
          <form class="form-grid three" data-form="purchase-request">
            <div class="form-field">
              <label for="purchaseItemName">Tên vật tư</label>
              <input id="purchaseItemName" name="itemName" required placeholder="VD: Dây cung NiTi" />
            </div>
            <div class="form-field">
              <label for="purchaseCategory">Nhóm</label>
              <select id="purchaseCategory" name="category">
                <option>Trụ implant</option>
                <option>Niềng</option>
                <option>Vật tư tiêu hao</option>
                <option>Dụng cụ lâm sàng</option>
              </select>
            </div>
            <div class="form-field">
              <label for="purchaseQuantity">Số lượng</label>
              <input id="purchaseQuantity" name="quantity" type="number" min="1" value="1" />
            </div>
            <div class="form-field">
              <label for="purchaseUnit">Đơn vị</label>
              <input id="purchaseUnit" name="unit" value="gói" />
            </div>
            <div class="form-field">
              <label for="purchaseRequester">Người đề xuất</label>
              <select id="purchaseRequester" name="requester">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="purchaseDepartment">Phòng ban</label>
              <select id="purchaseDepartment" name="department">${departmentOptions()}</select>
            </div>
            <div class="form-field full">
              <label for="purchaseReason">Lý do</label>
              <textarea id="purchaseReason" name="reason" required placeholder="Tồn dưới định mức, phục vụ lịch điều trị..."></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Gửi đề xuất mua</button>
            </div>
          </form>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Tồn kho vật tư</h3>
          <span class="subtle">${supplies.length} vật tư</span>
        </div>
        <div class="mobile-card-grid">
          ${supplies.length ? supplies.map(renderSupplyCard).join("") : emptyState()}
        </div>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Phiếu đề xuất mua</h3>
          <span class="subtle">${purchaseRequests.length} phiếu</span>
        </div>
        <div class="grid cols-3">
          ${purchaseRequests.length ? purchaseRequests.map(renderPurchaseCard).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function renderAssets() {
    const assets = filteredAssets();
    const needsCare = state.assets.filter((asset) => asset.condition !== "good");
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Asset audit</p>
          <h3>Kiểm kê, lưu trữ và phân công người chịu trách nhiệm cho tài sản phòng khám.</h3>
        </div>
        ${statusPill(`${needsCare.length} tài sản cần chú ý`, needsCare.length ? "warn" : "good")}
      </div>

      <section class="panel">
        <div class="section-title">
          <h3>Thêm tài sản / phiếu kiểm kê</h3>
          ${pill("Lưu vị trí và người giữ")}
        </div>
        <form class="form-grid three" data-form="asset">
          <div class="form-field">
            <label for="assetCode">Mã tài sản</label>
            <input id="assetCode" name="code" required placeholder="5S-GV-..." />
          </div>
          <div class="form-field">
            <label for="assetName">Tên tài sản</label>
            <input id="assetName" name="name" required placeholder="Máy, tủ, camera..." />
          </div>
          <div class="form-field">
            <label for="assetDepartment">Phòng ban</label>
            <select id="assetDepartment" name="department">${departmentOptions()}</select>
          </div>
          <div class="form-field">
            <label for="assetLocation">Vị trí lưu trữ</label>
            <input id="assetLocation" name="location" required placeholder="Phòng điều trị 1" />
          </div>
          <div class="form-field">
            <label for="assetCustodian">Người phụ trách</label>
            <select id="assetCustodian" name="custodian">${employeeOptions()}</select>
          </div>
          <div class="form-field">
            <label for="assetCondition">Tình trạng</label>
            <select id="assetCondition" name="condition">
              <option value="good">Tốt</option>
              <option value="maintenance">Cần bảo trì</option>
              <option value="missing">Thiếu/mất</option>
            </select>
          </div>
          <div class="form-field full">
            <label for="assetNotes">Ghi chú kiểm kê</label>
            <textarea id="assetNotes" name="notes" placeholder="Tình trạng, ảnh/link biên bản, lưu ý bàn giao"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Lưu tài sản</button>
          </div>
        </form>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Danh sách tài sản</h3>
          <span class="subtle">${assets.length} tài sản</span>
        </div>
        <div class="mobile-card-grid">
          ${assets.length ? assets.map(renderAssetCard).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function renderProposals() {
    const proposals = filteredProposals();
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Proposal workflow</p>
          <h3>Gửi đề xuất ý kiến, duyệt chi PNS hoặc duyệt chi MKT; hỗ trợ link và tên file đính kèm.</h3>
        </div>
        ${pill(`${state.proposals.filter((proposal) => proposal.status === "pending").length} phiếu chờ duyệt`)}
      </div>

      <section class="panel">
        <div class="section-title">
          <h3>Tạo phiếu đề xuất</h3>
          ${pill("Link/file lưu theo tên")}
        </div>
        <form class="form-grid three" data-form="proposal">
          <div class="form-field">
            <label for="proposalType">Loại phiếu</label>
            <select id="proposalType" name="type">
              <option>Đề xuất ý kiến</option>
              <option>Duyệt chi PNS</option>
              <option>Duyệt chi MKT</option>
            </select>
          </div>
          <div class="form-field">
            <label for="proposalDepartment">Phòng gửi</label>
            <select id="proposalDepartment" name="department">${departmentOptions()}</select>
          </div>
          <div class="form-field">
            <label for="proposalRequester">Người gửi</label>
            <select id="proposalRequester" name="requester">${employeeOptions()}</select>
          </div>
          <div class="form-field full">
            <label for="proposalTitle">Tiêu đề</label>
            <input id="proposalTitle" name="title" required placeholder="VD: Duyệt chi chiến dịch MKT tháng 6" />
          </div>
          <div class="form-field">
            <label for="proposalAmount">Số tiền duyệt chi</label>
            <input id="proposalAmount" name="amount" type="number" min="0" value="0" />
          </div>
          <div class="form-field">
            <label for="proposalLink">Link đính kèm</label>
            <input id="proposalLink" name="attachmentUrl" type="url" placeholder="https://..." />
          </div>
          <div class="form-field">
            <label for="proposalFile">File đính kèm</label>
            <input id="proposalFile" name="fileAttachment" type="file" />
          </div>
          <div class="form-field full">
            <label for="proposalReason">Nội dung</label>
            <textarea id="proposalReason" name="reason" required placeholder="Lý do, chi tiết chi phí hoặc ý kiến đề xuất"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Gửi phiếu</button>
          </div>
        </form>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Danh sách phiếu</h3>
          <span class="subtle">${proposals.length} phiếu</span>
        </div>
        <div class="grid cols-3">
          ${proposals.length ? proposals.map(renderProposalCard).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function renderRecruitment() {
    const items = filteredRecruitment();
    const pending = state.recruitment.filter((item) => item.status === "pending");
    const totalOffer = state.recruitment.reduce((sum, item) => sum + Number(item.offerAmount || 0), 0);
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Recruitment workflow</p>
          <h3>Quản lý ứng viên, người phụ trách, set lịch tự động, mức offer, ngày đóng bảo hiểm và duyệt thông tin lương.</h3>
        </div>
        <div class="pill-row">
          ${statusPill(`${pending.length} hồ sơ chờ`, pending.length ? "warn" : "good")}
          ${pill(`Offer dự kiến ${formatCurrency(totalOffer)}`)}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Thêm hồ sơ tuyển dụng</h3>
            ${pill("Auto set lịch")}
          </div>
          <form class="form-grid three" data-form="recruitment">
            <div class="form-field">
              <label for="candidateName">Họ tên ứng viên</label>
              <input id="candidateName" name="candidate" required placeholder="VD: Nguyễn Thị A" />
            </div>
            <div class="form-field">
              <label for="candidateRole">Vị trí</label>
              <input id="candidateRole" name="role" required placeholder="Lễ tân, Phụ tá, Bác sĩ..." />
            </div>
            <div class="form-field">
              <label for="candidateDept">Phòng ban</label>
              <select id="candidateDept" name="department">${departmentOptions()}</select>
            </div>
            <div class="form-field">
              <label for="candidateOwner">Người phụ trách</label>
              <select id="candidateOwner" name="responsible">${employeeOptions("e-001")}</select>
            </div>
            <div class="form-field">
              <label for="candidateStage">Giai đoạn</label>
              <select id="candidateStage" name="stage">
                <option value="screening">Lọc hồ sơ</option>
                <option value="interview">Phỏng vấn</option>
                <option value="trial">Thử việc/thực tập</option>
                <option value="offer">Offer</option>
                <option value="onboarding">Hội nhập</option>
              </select>
            </div>
            <div class="form-field">
              <label for="candidateDate">Lịch hẹn</label>
              <input id="candidateDate" name="interviewDate" type="date" value="${addDaysISO(1)}" />
            </div>
            <div class="form-field">
              <label for="salaryExpected">Mức lương mong muốn</label>
              <input id="salaryExpected" name="salaryExpected" type="number" min="0" value="0" />
            </div>
            <div class="form-field">
              <label for="offerAmount">Mức offer xét duyệt</label>
              <input id="offerAmount" name="offerAmount" type="number" min="0" value="0" />
            </div>
            <div class="form-field">
              <label for="insuranceDate">Ngày đóng bảo hiểm</label>
              <input id="insuranceDate" name="insuranceDate" type="date" value="${addDaysISO(60)}" />
            </div>
            <div class="form-field full">
              <label for="candidateNote">Ghi chú</label>
              <textarea id="candidateNote" name="note" placeholder="Hồ sơ thực tập, giấy phép hành nghề, lịch phỏng vấn, điều kiện offer..."></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Lưu hồ sơ tuyển dụng</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Checklist tuyển dụng</h3>
            ${pill("HR + trưởng bộ phận")}
          </div>
          <div class="grid">
            ${["Tự động nhắc lịch phỏng vấn và người phụ trách", "Kiểm tra bằng cấp, chứng chỉ, giấy phép hành nghề", "Xét duyệt mức offer, ngày bảo hiểm và phản hồi lương", "Chuyển sang hội nhập: ký văn bản, bảo mật, cài tài khoản, cài vân tay"].map((text) => `
              <article class="mini-card">
                <strong>${escapeHTML(text)}</strong>
                <span>Trạng thái được lưu theo từng ứng viên</span>
              </article>
            `).join("")}
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Pipeline tuyển dụng</h3>
          <span class="subtle">${items.length} hồ sơ</span>
        </div>
        <div class="grid cols-3">
          ${items.length ? items.map(renderRecruitmentCard).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function renderSchedule() {
    const monthKey = todayISO.slice(0, 7);
    const assignments = filteredScheduleAssignments();
    const requests = filteredScheduleRequests();
    const detailedGroups = ["bs", "phuta", "dvkh"];
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Roster & overtime</p>
          <h3>Đăng ký lịch làm ngày 25 hằng tháng, chia lịch cho nhân viên khác, theo dõi tăng ca, đến sớm và đi sớm tính công.</h3>
        </div>
        <div class="pill-row">
          ${pill(`Kỳ ${monthKey}`)}
          ${statusPill("Hạn đăng ký ngày 25", Number(todayISO.slice(-2)) <= 25 ? "good" : "warn")}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Đăng ký lịch làm</h3>
            ${pill("Mỗi tháng ngày 25")}
          </div>
          <form class="form-grid three" data-form="schedule-request">
            <div class="form-field">
              <label for="scheduleRequestEmployee">Nhân sự</label>
              <select id="scheduleRequestEmployee" name="employee">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="scheduleMonth">Tháng đăng ký</label>
              <input id="scheduleMonth" name="month" type="month" value="${monthKey}" />
            </div>
            <div class="form-field">
              <label for="scheduleReviewer">Người duyệt</label>
              <select id="scheduleReviewer" name="reviewer">${employeeOptions("e-001")}</select>
            </div>
            <div class="form-field full">
              <label for="schedulePreference">Nội dung đăng ký</label>
              <textarea id="schedulePreference" name="preference" required placeholder="Ca mong muốn, ngày nghỉ, lịch bác sĩ/phụ tá/lễ tân..."></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Gửi đăng ký lịch</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Chia ca / đổi ca</h3>
            ${pill("Trưởng bộ phận gán")}
          </div>
          <form class="form-grid three" data-form="schedule-assignment">
            <div class="form-field">
              <label for="assignmentEmployee">Nhân sự</label>
              <select id="assignmentEmployee" name="employee">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="assignmentDate">Ngày làm</label>
              <input id="assignmentDate" name="date" type="date" value="${todayISO}" />
            </div>
            <div class="form-field">
              <label for="assignmentShift">Ca làm</label>
              <select id="assignmentShift" name="shift">${shiftOptions()}</select>
            </div>
            <div class="form-field">
              <label for="assignmentOwner">Người phụ trách</label>
              <select id="assignmentOwner" name="owner">${employeeOptions("e-001")}</select>
            </div>
            <div class="form-field">
              <label for="assignmentSwap">Chia/đổi với</label>
              <select id="assignmentSwap" name="swapWith"><option value="">Không đổi ca</option>${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="assignmentStatus">Trạng thái</label>
              <select id="assignmentStatus" name="status">
                <option value="planned">Đã lên lịch</option>
                <option value="confirmed">Đã xác nhận</option>
                <option value="changed">Đã đổi ca</option>
              </select>
            </div>
            <div class="form-field">
              <label for="assignmentOt">Tăng ca (phút)</label>
              <input id="assignmentOt" name="overtimeMinutes" type="number" min="0" value="0" />
            </div>
            <div class="form-field">
              <label for="assignmentEarly">Đến sớm tính công (phút)</label>
              <input id="assignmentEarly" name="earlyArrivalMinutes" type="number" min="0" value="0" />
            </div>
            <div class="form-field">
              <label for="assignmentLeave">Đi sớm (phút)</label>
              <input id="assignmentLeave" name="earlyLeaveMinutes" type="number" min="0" value="0" />
            </div>
            <div class="form-field full">
              <label for="assignmentNote">Ghi chú</label>
              <textarea id="assignmentNote" name="note" placeholder="Lý do đổi ca, lịch bệnh nhân, người nhận bàn giao"></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Lưu lịch làm</button>
            </div>
          </form>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Bảng chi tiết BS / Phụ tá / Lễ tân</h3>
          <span class="subtle">${assignments.length} lịch</span>
        </div>
        <div class="grid cols-3">
          ${detailedGroups.map((dept) => renderDepartmentSchedule(dept, assignments)).join("")}
        </div>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Đăng ký lịch chờ duyệt</h3>
          <span class="subtle">${requests.length} phiếu</span>
        </div>
        <div class="grid cols-3">
          ${requests.length ? requests.map(renderScheduleRequestCard).join("") : emptyState()}
        </div>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Hiển thị chấm công hôm nay / tháng / năm</h3>
          ${pill("Tự tổng hợp theo record")}
        </div>
        <div class="grid cols-4">
          ${renderAttendanceSummaryCards()}
        </div>
      </section>
    `;
  }

  function renderPayroll() {
    const monthKey = todayISO.slice(0, 7);
    const payrollRows = filteredPayrollRows();
    const advances = filteredSalaryAdvances();
    const feedback = filteredPayrollFeedback();
    const grossTotal = payrollRows.reduce((sum, row) => sum + row.netPay, 0);
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Payroll formula</p>
          <h3>Tính lương theo giờ, chuyên cần, tăng ca, đến sớm tính công, ứng lương và phản hồi công lương theo kỳ.</h3>
        </div>
        <div class="pill-row">
          ${pill(`Kỳ ${monthKey}`)}
          ${pill(`Tạm tính ${formatCurrency(grossTotal)}`)}
        </div>
      </div>

      <section class="panel">
        <div class="section-title">
          <h3>Công thức lương theo giờ</h3>
          ${pill("Cấu hình mẫu")}
        </div>
        <div class="formula-box">
          <strong>Lương tạm tính = Giờ công hợp lệ × lương giờ + tăng ca × 150% + đến sớm tính công − đi sớm − ứng lương</strong>
          <span>${escapeHTML(state.settings.monthlyPayrollCycle)}</span>
        </div>
      </section>

      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel">
          <div class="section-title">
            <h3>Ứng lương / duyệt tiền mặt</h3>
            ${pill("Đổ về PNS/KT")}
          </div>
          <form class="form-grid three" data-form="salary-advance">
            <div class="form-field">
              <label for="advanceEmployee">Nhân sự</label>
              <select id="advanceEmployee" name="employee">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="advanceType">Loại yêu cầu</label>
              <select id="advanceType" name="type">
                <option>Ứng lương</option>
                <option>Duyệt tiền mặt</option>
              </select>
            </div>
            <div class="form-field">
              <label for="advanceAmount">Số tiền</label>
              <input id="advanceAmount" name="amount" type="number" min="0" value="0" />
            </div>
            <div class="form-field full">
              <label for="advanceBank">Thông tin STK / người nhận</label>
              <input id="advanceBank" name="bankAccount" placeholder="Tên ngân hàng, số tài khoản, chủ tài khoản" />
            </div>
            <div class="form-field full">
              <label for="advanceReason">Lý do</label>
              <textarea id="advanceReason" name="reason" required placeholder="Lý do ứng lương hoặc duyệt tiền mặt"></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Gửi yêu cầu</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Phản hồi lương</h3>
            ${pill("Nhân sự xác nhận")}
          </div>
          <form class="form-grid" data-form="payroll-feedback">
            <div class="form-field">
              <label for="payrollEmployee">Nhân sự</label>
              <select id="payrollEmployee" name="employee">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="payrollMonth">Kỳ lương</label>
              <input id="payrollMonth" name="month" type="month" value="${monthKey}" />
            </div>
            <div class="form-field full">
              <label for="payrollText">Nội dung phản hồi</label>
              <textarea id="payrollText" name="text" required placeholder="VD: kiểm tra lại tăng ca, công đi sớm, đơn bổ sung công..."></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Gửi phản hồi lương</button>
            </div>
          </form>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Bảng công lương tháng</h3>
          <span class="subtle">${payrollRows.length} nhân sự</span>
        </div>
        ${renderPayrollTable(payrollRows)}
      </section>

      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel">
          <div class="section-title">
            <h3>Đơn ứng lương / tiền mặt</h3>
            <span class="subtle">${advances.length} đơn</span>
          </div>
          <div class="grid cols-2">
            ${advances.length ? advances.map(renderSalaryAdvanceCard).join("") : emptyState()}
          </div>
        </section>
        <section class="panel">
          <div class="section-title">
            <h3>Phản hồi công lương</h3>
            <span class="subtle">${feedback.length} phản hồi</span>
          </div>
          <div class="grid">
            ${feedback.length ? feedback.map(renderPayrollFeedbackCard).join("") : emptyState()}
          </div>
        </section>
      </div>
    `;
  }

  function renderIncidents() {
    const incidents = filteredIncidents();
    const audits = filteredAssetAudits();
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Employee evidence & handover</p>
          <h3>Lưu hình ảnh chứng minh sự vụ nhân viên, giao file kiểm kê tài sản và quy trình hội nhập nghỉ việc.</h3>
        </div>
        <div class="pill-row">
          ${statusPill(`${incidents.filter((item) => item.status !== "closed").length} sự vụ mở`, incidents.some((item) => item.status !== "closed") ? "warn" : "good")}
          ${pill(`${audits.length} bảng kiểm kê`)}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Ghi nhận sự vụ</h3>
            ${pill("Link/file chứng minh")}
          </div>
          <form class="form-grid three" data-form="incident">
            <div class="form-field">
              <label for="incidentEmployee">Nhân sự liên quan</label>
              <select id="incidentEmployee" name="employee">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="incidentReporter">Người báo cáo</label>
              <select id="incidentReporter" name="reporter">${employeeOptions("e-001")}</select>
            </div>
            <div class="form-field">
              <label for="incidentDate">Ngày</label>
              <input id="incidentDate" name="date" type="date" value="${todayISO}" />
            </div>
            <div class="form-field">
              <label for="incidentCategory">Nhóm</label>
              <select id="incidentCategory" name="category">
                <option>Chấm công</option>
                <option>Tài sản</option>
                <option>Khách hàng</option>
                <option>Hồ sơ</option>
                <option>Khác</option>
              </select>
            </div>
            <div class="form-field full">
              <label for="incidentTitle">Tiêu đề</label>
              <input id="incidentTitle" name="title" required placeholder="VD: Quên checkout cuối ca" />
            </div>
            <div class="form-field">
              <label for="incidentProof">Link hình ảnh</label>
              <input id="incidentProof" name="proofUrl" type="url" placeholder="https://drive.google.com/..." />
            </div>
            <div class="form-field">
              <label for="incidentFile">File chứng minh</label>
              <input id="incidentFile" name="fileAttachment" type="file" />
            </div>
            <div class="form-field full">
              <label for="incidentNote">Ghi chú</label>
              <textarea id="incidentNote" name="note" required placeholder="Mô tả sự vụ, bằng chứng, người đã xác nhận"></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Lưu sự vụ</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Tạo bảng kiểm kê tài sản</h3>
            ${pill("Excel / Doc / PDF")}
          </div>
          <form class="form-grid three" data-form="asset-audit">
            <div class="form-field full">
              <label for="auditTitle">Tên bảng kiểm kê</label>
              <input id="auditTitle" name="title" required placeholder="VD: Kiểm kê ghế máy tháng 6" />
            </div>
            <div class="form-field">
              <label for="auditDepartment">Phòng ban</label>
              <select id="auditDepartment" name="department">${departmentOptions()}</select>
            </div>
            <div class="form-field">
              <label for="auditOwner">Người phụ trách</label>
              <select id="auditOwner" name="owner">${employeeOptions("e-007")}</select>
            </div>
            <div class="form-field">
              <label for="auditDue">Deadline</label>
              <input id="auditDue" name="due" type="date" value="${addDaysISO(3)}" />
            </div>
            <div class="form-field">
              <label for="auditLink">Link file</label>
              <input id="auditLink" name="attachmentUrl" type="url" placeholder="https://..." />
            </div>
            <div class="form-field">
              <label for="auditFile">File</label>
              <input id="auditFile" name="fileAttachment" type="file" />
            </div>
            <div class="form-field full">
              <label for="auditNote">Ghi chú giao việc</label>
              <textarea id="auditNote" name="note" placeholder="Tag tên, phòng ban, yêu cầu kiểm kê"></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Giao kiểm kê</button>
            </div>
          </form>
        </section>
      </div>

      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel">
          <div class="section-title">
            <h3>Danh sách sự vụ</h3>
            <span class="subtle">${incidents.length} dòng</span>
          </div>
          <div class="grid">
            ${incidents.length ? incidents.map(renderIncidentCard).join("") : emptyState()}
          </div>
        </section>
        <section class="panel">
          <div class="section-title">
            <h3>Kiểm kê & nghỉ việc</h3>
            ${pill("Bàn giao")}
          </div>
          <div class="grid">
            ${audits.length ? audits.map(renderAssetAuditCard).join("") : emptyState()}
            ${state.offboardingCases.map(renderOffboardingCard).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderIntegrations() {
    const account = employeeById(currentAccount.employee);
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Security & integrations</p>
          <h3>Đăng nhập Supabase Auth, phân luồng tài khoản, đồng bộ Google qua GAS và xuất dữ liệu vận hành.</h3>
        </div>
        <div class="pill-row">
          ${statusPill(cloudStatus === "online" ? "Supabase đã nối" : "Chưa online", cloudStatus === "online" ? "good" : "warn")}
          ${pill(roleProfiles[currentAccount.role]?.label || currentAccount.role)}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Đăng nhập Supabase</h3>
            ${pill(SUPABASE_CONFIG.url.replace("https://", ""))}
          </div>
          ${supabaseUser ? `
            <div class="profile-lock">
              <strong>${escapeHTML(supabaseProfile?.full_name || supabaseUser.email)}</strong>
              <span>${escapeHTML(supabaseUser.email)} · ${escapeHTML(roleProfiles[currentAccount.role]?.scope || "")}</span>
              <button class="danger-button" type="button" data-action="supabase-logout"><span>×</span>Đăng xuất</button>
            </div>
          ` : `
            <form class="form-grid" data-form="supabase-login">
              <div class="form-field full">
                <label for="authEmail">Email</label>
                <input id="authEmail" name="email" type="email" required placeholder="email quản lý hoặc nhân viên" />
              </div>
              <div class="form-field full">
                <label for="authPassword">Mật khẩu</label>
                <input id="authPassword" name="password" type="password" required placeholder="Mật khẩu Supabase Auth" />
              </div>
              <div class="form-field full">
                <button class="primary-button" type="submit"><span>✓</span>Đăng nhập</button>
              </div>
            </form>
          `}
          <div class="setup-note">
            <strong>SQL setup</strong>
            <span>Chạy file <code>supabase-schema.sql</code> trong SQL Editor, sau đó map user Auth vào bảng <code>profiles</code>.</span>
          </div>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Phân quyền tài khoản</h3>
            ${pill("Demo + Auth")}
          </div>
          <div class="form-field" style="margin-bottom:12px">
            <label for="demoAccountRole">Chọn vai trò demo</label>
            <select id="demoAccountRole" data-action="demo-account" aria-label="Chọn vai trò demo">
              ${demoAccounts.map((item) => option(item.id, item.label, item.id === currentAccount.id)).join("")}
            </select>
          </div>
          <div class="grid">
            ${Object.entries(roleProfiles).map(([role, profile]) => `
              <article class="mini-card">
                <strong>${escapeHTML(profile.label)}</strong>
                <span>${escapeHTML(profile.scope)}</span>
                ${statusPill(role === currentAccount.role ? "Đang dùng" : "Khả dụng", role === currentAccount.role ? "good" : "neutral")}
              </article>
            `).join("")}
          </div>
          <p class="subtle" style="margin-top:12px">Tài khoản hiện tại: ${escapeHTML(account?.name || "Chưa map nhân sự")} · ${escapeHTML(departmentName(account?.department))}</p>
        </section>
      </div>

      <div class="grid cols-2" style="margin-top:14px">
        <section class="panel">
          <div class="section-title">
            <h3>Đồng bộ Google qua GAS</h3>
            ${pill("Webhook linh hoạt")}
          </div>
          <form class="form-grid" data-form="gas-settings">
            <div class="form-field full">
              <label for="gasUrl">Google Apps Script Web App URL</label>
              <input id="gasUrl" name="googleGasUrl" value="${escapeAttr(state.settings.googleGasUrl || "")}" placeholder="https://script.google.com/macros/s/..." />
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>✓</span>Lưu GAS URL</button>
            </div>
          </form>
          <div class="request-actions">
            <span class="subtle">Dùng để đẩy công, lương, KPI sang Google Sheet khi chị có endpoint GAS.</span>
            <button class="secondary-button" type="button" data-action="simulate-gas-sync"><span>∞</span>Test sync</button>
          </div>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Backup & audit</h3>
            ${pill("JSON")}
          </div>
          <div class="grid">
            <article class="mini-card">
              <strong>Cloud snapshot</strong>
              <span>${escapeHTML(cloudMessage)}</span>
              ${statusPill(cloudStatus, cloudStatus === "online" ? "good" : cloudStatus === "syncing" ? "warn" : "neutral")}
            </article>
            <article class="mini-card">
              <strong>Local fallback</strong>
              <span>App vẫn chạy khi chưa login hoặc chưa chạy SQL.</span>
              ${statusPill("LocalStorage", "neutral")}
            </article>
            <button class="secondary-button" type="button" data-action="export-state"><span>⇩</span>Xuất toàn bộ JSON</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderLeave() {
    const requests = filteredLeave();
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">People request workflow</p>
          <h3>Nhân sự gửi đơn nghỉ phép, đi trễ, bổ sung công vào/ra hoặc tăng ca; quản lý duyệt và lưu trạng thái vận hành.</h3>
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Tạo đơn</h3>
            ${pill("HR duyệt trước ca")}
          </div>
          <form class="form-grid" data-form="leave">
            <div class="form-field">
              <label for="leaveEmployee">Nhân sự</label>
              <select id="leaveEmployee" name="employee">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="leaveType">Loại đơn</label>
              <select id="leaveType" name="type">
                <option>Nghỉ phép năm</option>
                <option>Nghỉ ốm</option>
                <option>Đổi ca</option>
                <option>Đơn xin đi trễ</option>
                <option>Đơn bổ sung công vào/ra</option>
                <option>Đơn tăng ca</option>
                <option>Ứng lương</option>
                <option>Duyệt tiền mặt</option>
                <option>Đơn xin nghỉ việc</option>
                <option>Nghỉ không lương</option>
              </select>
            </div>
            <div class="form-field">
              <label for="leaveFrom">Từ ngày</label>
              <input id="leaveFrom" name="from" type="date" value="${todayISO}" />
            </div>
            <div class="form-field">
              <label for="leaveTo">Đến ngày</label>
              <input id="leaveTo" name="to" type="date" value="${todayISO}" />
            </div>
            <div class="form-field full">
              <label for="leaveReason">Lý do</label>
              <textarea id="leaveReason" name="reason" required placeholder="Nhập lý do, số tiền/STK nếu ứng lương, người đã bàn giao nếu nghỉ/đổi ca"></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Gửi đơn</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Chính sách nhanh</h3>
            ${pill("Theo ca làm thực tế")}
          </div>
          <div class="grid">
            <article class="schedule-card">
              <h3>Duyệt trước ca</h3>
              <p class="subtle">Đơn nghỉ hoặc đổi ca cần có người thay thế với DVKH, BS, Phụ tá, Bảo vệ và Lao công.</p>
            </article>
            <article class="schedule-card">
              <h3>Tính công</h3>
              <p class="subtle">Chấm công hợp lệ khi có định vị trong bán kính phòng khám và đúng quy tắc check-in trước 5 phút.</p>
            </article>
            <article class="schedule-card">
              <h3>Bàn giao</h3>
              <p class="subtle">Task đang mở của người nghỉ phép cần cập nhật owner hoặc ghi rõ tình trạng trước khi duyệt.</p>
            </article>
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Danh sách đơn</h3>
          <span class="subtle">${requests.length} đơn theo bộ lọc</span>
        </div>
        <div class="grid cols-3">
          ${requests.length ? requests.map(renderLeaveCard).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function renderUniforms() {
    const logs = filteredUniformLogs();
    const currentYear = new Date().getFullYear();
    const yearlySummary = state.employees.map((employee) => {
      const issued = state.uniformLogs
        .filter((log) => log.employee === employee.id && Number(log.year) === currentYear)
        .reduce((sum, log) => sum + Number(log.quantity || 0), 0);
      return { employee, issued, remaining: Math.max(3 - issued, 0) };
    });
    const needMore = yearlySummary.filter((item) => item.remaining > 0);

    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Uniform allocation</p>
          <h3>Nhật ký cấp phát đồng phục theo năm. Quy định mặc định: mỗi nhân sự được cấp lại 1 lần/năm, 3 bộ.</h3>
        </div>
        <div class="pill-row">
          ${pill(`${currentYear}`)}
          ${statusPill(`${needMore.length} người chưa đủ 3 bộ`, needMore.length ? "warn" : "good")}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Cấp phát đồng phục</h3>
            ${pill("3 bộ / năm")}
          </div>
          <form class="form-grid three" data-form="uniform">
            <div class="form-field">
              <label for="uniformEmployee">Nhân sự</label>
              <select id="uniformEmployee" name="employee">${employeeOptions()}</select>
            </div>
            <div class="form-field">
              <label for="uniformYear">Năm</label>
              <input id="uniformYear" name="year" type="number" min="2024" max="2100" value="${currentYear}" />
            </div>
            <div class="form-field">
              <label for="uniformItem">Loại đồng phục</label>
              <input id="uniformItem" name="item" value="Đồng phục phòng khám" />
            </div>
            <div class="form-field">
              <label for="uniformQuantity">Số bộ cấp</label>
              <input id="uniformQuantity" name="quantity" type="number" min="1" max="3" value="3" />
            </div>
            <div class="form-field">
              <label for="uniformSize">Size</label>
              <select id="uniformSize" name="size">
                <option>XS</option>
                <option>S</option>
                <option selected>M</option>
                <option>L</option>
                <option>XL</option>
                <option>XXL</option>
              </select>
            </div>
            <div class="form-field">
              <label for="uniformIssuer">Người cấp</label>
              <select id="uniformIssuer" name="issuer">${employeeOptions("e-001")}</select>
            </div>
            <div class="form-field full">
              <label for="uniformNote">Ghi chú</label>
              <textarea id="uniformNote" name="note" placeholder="VD: cấp mới, cấp bù size, còn thiếu 1 bộ..."></textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Lưu cấp phát</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Định mức theo chức danh</h3>
            ${pill("Cấp lại hằng năm")}
          </div>
          <div class="grid">
            ${uniformCatalog.map((pack) => `
              <article class="mini-card">
                <strong>${escapeHTML(pack.title)}</strong>
                <span>${escapeHTML(pack.items.join(" · "))}</span>
              </article>
            `).join("")}
          </div>
          <div class="mobile-card-grid compact" style="margin-top:12px">
            ${yearlySummary.slice(0, 6).map((item) => `
              <article class="mini-card">
                <strong>${escapeHTML(item.employee.name)}</strong>
                <span>${escapeHTML(departmentName(item.employee.department))}</span>
                <span>${escapeHTML(uniformPackageFor(item.employee).items.join(" · "))}</span>
                <div class="progress-track" aria-label="Đồng phục ${escapeHTML(item.employee.name)}">
                  <div class="progress-fill" style="width:${Math.min(item.issued / 3 * 100, 100)}%"></div>
                </div>
                <small>Đã cấp ${item.issued}/3 bộ${item.remaining ? ` · còn ${item.remaining}` : ""}</small>
              </article>
            `).join("")}
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Bảng nhật ký cấp phát</h3>
          <span class="subtle">${logs.length} dòng</span>
        </div>
        <div class="mobile-card-grid">
          ${logs.length ? logs.map(renderUniformCard).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function renderOnboarding() {
    const selectedEmployee = sessionStorage.getItem("onboardingEmployee") || "e-012";
    const employee = employeeById(selectedEmployee) || state.employees[0];
    const docs = filteredOnboardingDocs();
    const doneCount = state.onboardingDocs.filter((doc) => onboardingStatus(employee?.id, doc.id) === "done").length;
    const requiredTotal = state.onboardingDocs.filter((doc) => doc.required).length;
    const requiredDone = state.onboardingDocs.filter((doc) => doc.required && onboardingStatus(employee?.id, doc.id) === "done").length;

    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">New staff onboarding</p>
          <h3>Nhân sự mới mở app điện thoại, đọc nội quy/hướng dẫn/chính sách và đánh dấu hoàn thành từng tài liệu.</h3>
        </div>
        <div class="pill-row">
          ${pill(`${doneCount}/${state.onboardingDocs.length} tài liệu hoàn thành`)}
          ${statusPill(`${requiredDone}/${requiredTotal} bắt buộc`, requiredDone === requiredTotal ? "good" : "warn")}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Tài liệu hội nhập</h3>
            ${pill("Có link / tên file")}
          </div>
          <form class="form-grid three" data-form="onboarding-doc">
            <div class="form-field">
              <label for="onboardingTitle">Tên tài liệu</label>
              <input id="onboardingTitle" name="title" required placeholder="VD: Nội quy phòng khám" />
            </div>
            <div class="form-field">
              <label for="onboardingCategory">Nhóm</label>
              <select id="onboardingCategory" name="category">
                <option>Nội quy</option>
                <option>Chấm công</option>
                <option>Chính sách</option>
                <option>Quy trình</option>
                <option>Ký văn bản</option>
                <option>Hồ sơ thực tập</option>
                <option>Tài khoản</option>
                <option>Hồ sơ</option>
                <option>Nghỉ việc</option>
                <option>Đào tạo chuyên môn</option>
              </select>
            </div>
            <div class="form-field">
              <label for="onboardingRequired">Bắt buộc</label>
              <select id="onboardingRequired" name="required">
                <option value="true">Có</option>
                <option value="false">Không</option>
              </select>
            </div>
            <div class="form-field">
              <label for="onboardingLink">Link đính kèm</label>
              <input id="onboardingLink" name="attachmentUrl" type="url" placeholder="https://..." />
            </div>
            <div class="form-field">
              <label for="onboardingFile">File đính kèm</label>
              <input id="onboardingFile" name="fileAttachment" type="file" />
            </div>
            <div class="form-field">
              <label for="onboardingOwner">Người phụ trách</label>
              <select id="onboardingOwner" name="owner">${employeeOptions("e-001")}</select>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>+</span>Thêm tài liệu</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Trạng thái nhân sự mới</h3>
            ${pill(employee?.name || "Chưa chọn")}
          </div>
          <div class="form-field">
            <label for="onboardingEmployee">Chọn nhân sự</label>
            <select id="onboardingEmployee" data-action="onboarding-employee">
              ${state.employees.map((item) => option(item.id, `${item.name} - ${departmentName(item.department)}`, item.id === employee?.id)).join("")}
            </select>
          </div>
          <div style="margin-top:12px">
            <div class="progress-track">
              <div class="progress-fill" style="width:${state.onboardingDocs.length ? doneCount / state.onboardingDocs.length * 100 : 0}%"></div>
            </div>
            <p class="subtle" style="margin-top:8px">${employee?.name || "Nhân sự"} đã hoàn thành ${doneCount}/${state.onboardingDocs.length} tài liệu.</p>
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Checklist đọc tài liệu trên mobile</h3>
          <span class="subtle">${docs.length} tài liệu</span>
        </div>
        <div class="mobile-card-grid">
          ${docs.length ? docs.map((doc) => renderOnboardingDocCard(doc, employee?.id)).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function renderPeople() {
    const selectedDept = sessionStorage.getItem("peopleDepartment") || "all";
    const people = filteredPeople(selectedDept);
    const rosterRows = people.map((employee) => {
      const shift = shiftById(employee.shift);
      return `
        <tr>
          <td><strong>${escapeHTML(employee.name)}</strong><br><span class="subtle">${escapeHTML(employee.phone)}</span></td>
          <td>${escapeHTML(departmentName(employee.department))}</td>
          <td>${escapeHTML(employee.role)}</td>
          <td>${shift ? `${escapeHTML(shift.start)}-${escapeHTML(shift.end)}` : "Chưa gán"}</td>
          <td>${statusPill(employee.status === "active" ? "Đang làm" : "Đang onboard", employee.status === "active" ? "good" : "warn")}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">People operations</p>
          <h3>Quản lý hồ sơ nhân sự, phòng ban, ca làm và tình trạng vận hành mỗi ngày.</h3>
        </div>
      </div>

      <section class="panel">
        <div class="section-title">
          <h3>Thêm nhân sự</h3>
          ${pill("Gán ca ngay khi tạo")}
        </div>
        <form class="form-grid three" data-form="employee">
          <div class="form-field">
            <label for="employeeName">Họ tên</label>
            <input id="employeeName" name="name" required placeholder="VD: Nguyễn Văn A" />
          </div>
          <div class="form-field">
            <label for="employeeDepartment">Phòng ban</label>
            <select id="employeeDepartment" name="department">${departmentOptions()}</select>
          </div>
          <div class="form-field">
            <label for="employeeRole">Chức danh</label>
            <input id="employeeRole" name="role" required placeholder="VD: Phụ tá" />
          </div>
          <div class="form-field">
            <label for="employeeShift">Ca mặc định</label>
            <select id="employeeShift" name="shift">${shiftOptions()}</select>
          </div>
          <div class="form-field">
            <label for="employeeManager">Người phụ trách</label>
            <input id="employeeManager" name="manager" placeholder="VD: Trưởng bộ phận / HR" />
          </div>
          <div class="form-field">
            <label for="employeeHireDate">Ngày vào làm</label>
            <input id="employeeHireDate" name="hireDate" type="date" value="${todayISO}" />
          </div>
          <div class="form-field">
            <label for="employeeInsuranceDate">Ngày đóng bảo hiểm</label>
            <input id="employeeInsuranceDate" name="insuranceDate" type="date" value="${addDaysISO(60)}" />
          </div>
          <div class="form-field">
            <label for="employeePhone">Số điện thoại</label>
            <input id="employeePhone" name="phone" placeholder="090..." />
          </div>
          <div class="form-field">
            <label for="employeeSalaryOffer">Mức offer</label>
            <input id="employeeSalaryOffer" name="salaryOffer" type="number" min="0" value="0" />
          </div>
          <div class="form-field">
            <label for="employeeHourlyRate">Lương theo giờ</label>
            <input id="employeeHourlyRate" name="hourlyRate" type="number" min="0" value="0" />
          </div>
          <div class="form-field">
            <label for="employeeStatus">Trạng thái</label>
            <select id="employeeStatus" name="status">
              <option value="active">Đang làm</option>
              <option value="onboarding">Đang onboard</option>
            </select>
          </div>
          <div class="form-field">
            <label for="employeeProfileLocked">Khóa hồ sơ bảo mật</label>
            <select id="employeeProfileLocked" name="profileLocked">
              <option value="false">Không</option>
              <option value="true">Có</option>
            </select>
          </div>
          <div class="form-field full">
            <label for="employeeCertificates">Bằng cấp / chứng chỉ</label>
            <textarea id="employeeCertificates" name="certificates" placeholder="VD: Chứng chỉ hành nghề RHM, Implant cơ bản, PCCC cơ sở"></textarea>
          </div>
          <div class="form-field full">
            <button class="primary-button" type="submit"><span>+</span>Thêm nhân sự</button>
          </div>
        </form>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Danh bạ</h3>
          <span class="subtle">${people.length} nhân sự</span>
        </div>
        <div class="people-controls">
          <select data-action="people-filter">
            <option value="all"${selectedDept === "all" ? " selected" : ""}>Tất cả phòng ban</option>
            ${state.departments.map((dept) => option(dept.id, dept.name, selectedDept === dept.id)).join("")}
          </select>
        </div>
        <div class="grid cols-4">
          ${people.map(renderPersonCard).join("")}
        </div>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Bảng phân ca</h3>
          ${pill("Theo tài liệu giờ làm")}
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Phòng ban</th>
                <th>Chức danh</th>
                <th>Ca mặc định</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>${rosterRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderChat() {
    const channel = state.channels.find((item) => item.id === activeChannel) || state.channels[0];
    const messages = filteredMessages().filter((message) => message.channel === activeChannel);
    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Team chat</p>
          <h3>Nhắn tin đội nhóm theo kênh phòng ban, lưu lại trao đổi vận hành trong trình duyệt.</h3>
        </div>
      </div>

      <div class="split-layout">
        <aside class="panel">
          <div class="section-title">
            <h3>Kênh</h3>
            ${pill(state.channels.length)}
          </div>
          <div class="channel-list">
            ${state.channels.map((item) => `
              <button class="channel-button${item.id === activeChannel ? " active" : ""}" type="button" data-action="switch-channel" data-channel="${escapeHTML(item.id)}">
                <span>${escapeHTML(item.name)}</span>
                <span>${state.messages.filter((message) => message.channel === item.id).length}</span>
              </button>
            `).join("")}
          </div>
        </aside>

        <section class="panel">
          <div class="section-title">
            <h3>${escapeHTML(channel.name)}</h3>
            ${pill(`${messages.length} tin`)}
          </div>
          <div class="chat-window">
            <div class="message-list" id="messageList">
              ${messages.length ? messages.map(renderMessage).join("") : emptyState()}
            </div>
            <form class="chat-form" data-form="message">
              <input name="text" required placeholder="Nhập tin nhắn cho ${escapeHTML(channel.name)}" />
              <button class="primary-button" type="submit"><span>↵</span>Gửi</button>
            </form>
          </div>
        </section>
      </div>
    `;
  }

  function renderReports() {
    const attendanceByStatus = countBy(state.attendance, "status");
    const taskByDept = state.departments.map((dept) => {
      const deptTasks = state.tasks.filter((task) => task.department === dept.id);
      const progress = deptTasks.length
        ? Math.round(deptTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / deptTasks.length)
        : 0;
      return { ...dept, total: deptTasks.length, progress };
    });

    return `
      <div class="view-header">
        <div>
          <p class="eyebrow">Manager report</p>
          <h3>Cấu hình vị trí phòng khám, ghi chú quản lý và xem nhanh rủi ro vận hành.</h3>
        </div>
        <div class="pill-row">
          ${statusPill(`${attendanceByStatus.valid || 0} hợp lệ`, "good")}
          ${statusPill(`${attendanceByStatus.late || 0} đi muộn`, "warn")}
          ${statusPill(`${attendanceByStatus.outside || 0} ngoài bán kính`, "bad")}
        </div>
      </div>

      <div class="grid cols-2">
        <section class="panel">
          <div class="section-title">
            <h3>Cấu hình chấm công</h3>
            ${pill("Dùng cho Geolocation API")}
          </div>
          <form class="form-grid" data-form="settings">
            <div class="form-field full">
              <label for="clinicName">Tên điểm làm việc</label>
              <input id="clinicName" name="clinicName" value="${escapeAttr(state.settings.clinicName)}" />
            </div>
            <div class="form-field full">
              <label for="clinicAddress">Địa chỉ</label>
              <input id="clinicAddress" name="clinicAddress" value="${escapeAttr(state.settings.clinicAddress)}" />
            </div>
            <div class="form-field">
              <label for="clinicLat">Vĩ độ</label>
              <input id="clinicLat" name="latitude" inputmode="decimal" value="${escapeAttr(state.settings.latitude)}" />
            </div>
            <div class="form-field">
              <label for="clinicLng">Kinh độ</label>
              <input id="clinicLng" name="longitude" inputmode="decimal" value="${escapeAttr(state.settings.longitude)}" />
            </div>
            <div class="form-field">
              <label for="allowedRadius">Bán kính hợp lệ (m)</label>
              <input id="allowedRadius" name="allowedRadius" type="number" min="30" max="1000" value="${escapeAttr(state.settings.allowedRadius)}" />
            </div>
            <div class="form-field">
              <label for="revenueTarget">Mục tiêu doanh thu</label>
              <input id="revenueTarget" name="revenueTarget" type="number" min="0" value="${escapeAttr(state.settings.revenueTarget || 0)}" />
            </div>
            <div class="form-field">
              <label for="reportExport">Xuất dữ liệu</label>
              <button class="secondary-button" id="reportExport" type="button" data-action="export-state"><span>⇩</span>JSON</button>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>✓</span>Lưu cấu hình</button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="section-title">
            <h3>Ghi chú quản lý</h3>
            ${pill("Hiển thị ở đầu app")}
          </div>
          <form class="form-grid" data-form="manager-note">
            <div class="form-field full">
              <label for="managerNote">Nội dung</label>
              <textarea id="managerNote" name="managerNote">${escapeHTML(state.settings.managerNote)}</textarea>
            </div>
            <div class="form-field full">
              <button class="primary-button" type="submit"><span>✓</span>Lưu ghi chú</button>
            </div>
          </form>
          <div class="grid" style="margin-top:12px">
            ${state.notes.map((note) => `
              <article class="schedule-card">
                <div class="section-title">
                  <h3>${escapeHTML(note.title)}</h3>
                  ${pill(note.owner)}
                </div>
                <p class="subtle">${escapeHTML(note.text)}</p>
              </article>
            `).join("")}
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Tiến độ theo phòng ban</h3>
          ${pill("Dựa trên task đang lưu")}
        </div>
        <div class="grid cols-4">
          ${taskByDept.map((dept) => `
            <article class="metric-card">
              <p class="metric-label">${escapeHTML(dept.name)}</p>
              <p class="metric-value">${dept.progress}%</p>
              <div class="progress-track" aria-label="Tien do ${escapeHTML(dept.name)}">
                <div class="progress-fill" style="width:${dept.progress}%"></div>
              </div>
              <p class="metric-detail">${dept.total} task</p>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="panel" style="margin-top:14px">
        <div class="section-title">
          <h3>Đánh giá dữ liệu & hiệu suất phòng khám</h3>
          ${pill("Doanh thu · lead · mục tiêu")}
        </div>
        <div class="grid cols-3">
          ${state.performanceMetrics.map((item) => {
            const targetRate = item.target ? Math.round(Number(item.revenue || 0) / Number(item.target) * 100) : item.score;
            return `
              <article class="metric-card">
                <p class="metric-label">${escapeHTML(departmentName(item.department))} · ${escapeHTML(item.month)}</p>
                <p class="metric-value">${targetRate}%</p>
                <div class="progress-track" aria-label="KPI ${escapeHTML(departmentName(item.department))}">
                  <div class="progress-fill" style="width:${clamp(targetRate, 0, 100)}%"></div>
                </div>
                <p class="metric-detail">${formatCurrency(item.revenue)} / ${formatCurrency(item.target)} · ${item.leads} lead · ${item.appointments} lịch hẹn</p>
                <p class="subtle">${escapeHTML(item.note)}</p>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderSmartSearchPanel() {
    const results = buildSmartResults().slice(0, 8);
    return `
      <section class="smart-search-panel">
        <div class="section-title">
          <h3>Kết quả thông minh cho “${escapeHTML(searchTerm)}”</h3>
          ${pill(`${results.length} gợi ý`)}
        </div>
        <div class="smart-result-grid">
          ${results.length ? results.map((result) => `
            <button class="smart-result" type="button" data-view-jump="${escapeHTML(result.view)}">
              <span>${escapeHTML(result.module)}</span>
              <strong>${escapeHTML(result.title)}</strong>
              <small>${escapeHTML(result.detail)}</small>
            </button>
          `).join("") : emptyState()}
        </div>
      </section>
    `;
  }

  function buildSmartResults() {
    const results = [];
    const add = (view, module, title, detail, haystack) => {
      if (smartMatch(haystack, searchTerm)) results.push({ view, module, title, detail });
    };

    state.employees.forEach((employee) => add("people", "Nhân sự", employee.name, `${departmentName(employee.department)} · ${employee.role}`, [employee.name, employee.role, employee.phone, departmentName(employee.department), employee.certificates?.join(" ")]));
    state.tasks.forEach((task) => add("tasks", "Task", task.title, `${departmentName(task.department)} · ${taskStatus[task.status]}`, [task.title, task.notes, departmentName(task.department), employeeById(task.assignee)?.name, task.status]));
    state.leaveRequests.forEach((request) => add("leave", "Đơn từ", request.type, `${employeeById(request.employee)?.name || "Không rõ"} · ${leaveStatus[request.status]}`, [request.type, request.reason, request.status, employeeById(request.employee)?.name, departmentName(employeeById(request.employee)?.department)]));
    state.supplies.forEach((item) => add("supplies", "Cung ứng", item.name, `${item.category} · tồn ${item.stock} ${item.unit}`, [item.name, item.category, item.location, item.supplier, item.notes]));
    state.purchaseRequests.forEach((request) => add("supplies", "Đề xuất mua", request.itemName, `${request.quantity} ${request.unit} · ${leaveStatus[request.status]}`, [request.itemName, request.category, request.reason, employeeById(request.requester)?.name, departmentName(request.department)]));
    state.assets.forEach((asset) => add("assets", "Tài sản", asset.name, `${asset.code} · ${asset.location}`, [asset.code, asset.name, asset.location, asset.condition, asset.notes, employeeById(asset.custodian)?.name, departmentName(asset.department)]));
    state.proposals.forEach((proposal) => add("proposals", "Phiếu đề xuất", proposal.title, `${proposal.type} · ${departmentName(proposal.department)}`, [proposal.type, proposal.title, proposal.reason, proposal.attachmentUrl, proposal.fileName, employeeById(proposal.requester)?.name, departmentName(proposal.department), proposal.amount]));
    state.recruitment.forEach((item) => add("recruitment", "Tuyển dụng", item.candidate, `${item.role} · offer ${formatCurrency(item.offerAmount)}`, [item.candidate, item.role, item.stage, item.status, item.note, departmentName(item.department), employeeById(item.responsible)?.name, item.salaryExpected, item.offerAmount]));
    state.scheduleRequests.forEach((item) => add("schedule", "Đăng ký lịch", employeeById(item.employee)?.name || "Không rõ", `${item.month} · ${leaveStatus[item.status] || item.status}`, [employeeById(item.employee)?.name, item.month, item.preference, item.status]));
    state.scheduleAssignments.forEach((item) => add("schedule", "Lịch làm", employeeById(item.employee)?.name || "Không rõ", `${formatShortDate(item.date)} · ${shiftById(item.shift)?.name || "Ca"}`, [employeeById(item.employee)?.name, employeeById(item.swapWith)?.name, shiftById(item.shift)?.name, item.note, item.status, item.overtimeMinutes, item.earlyArrivalMinutes]));
    state.salaryAdvances.forEach((item) => add("payroll", "Ứng lương", employeeById(item.employee)?.name || "Không rõ", `${formatCurrency(item.amount)} · ${leaveStatus[item.status] || item.status}`, [employeeById(item.employee)?.name, item.type, item.amount, item.bankAccount, item.reason, item.status]));
    state.payrollFeedback.forEach((item) => add("payroll", "Phản hồi lương", employeeById(item.employee)?.name || "Không rõ", `${item.month} · ${item.status}`, [employeeById(item.employee)?.name, item.month, item.text, item.status]));
    state.uniformLogs.forEach((log) => add("uniforms", "Đồng phục", employeeById(log.employee)?.name || "Không rõ", `${log.year} · ${log.quantity} bộ · ${log.item}`, [employeeById(log.employee)?.name, employeeById(log.issuer)?.name, log.year, log.item, log.quantity, log.size, log.status, log.note]));
    state.onboardingDocs.forEach((doc) => add("onboarding", "Hội nhập", doc.title, `${doc.category} · ${doc.required ? "bắt buộc" : "không bắt buộc"}`, [doc.title, doc.category, doc.attachmentUrl, doc.fileName, employeeById(doc.owner)?.name]));
    state.incidents.forEach((item) => add("incidents", "Sự vụ", item.title, `${employeeById(item.employee)?.name || "Không rõ"} · ${item.category}`, [item.title, item.category, item.note, item.status, item.proofUrl, item.fileName, employeeById(item.employee)?.name, employeeById(item.reporter)?.name]));
    state.assetAudits.forEach((item) => add("incidents", "Kiểm kê", item.title, `${departmentName(item.department)} · ${employeeById(item.owner)?.name || "Chưa gán"}`, [item.title, item.note, item.fileName, item.attachmentUrl, item.status, employeeById(item.owner)?.name, departmentName(item.department)]));
    state.performanceMetrics.forEach((item) => add("reports", "KPI", departmentName(item.department), `${item.month} · ${item.score}%`, [departmentName(item.department), item.month, item.revenue, item.target, item.leads, item.appointments, item.score, item.note]));
    state.messages.forEach((message) => add("chat", "Tin nhắn", employeeById(message.author)?.name || "Quản lý", message.text, [message.text, employeeById(message.author)?.name, state.channels.find((channel) => channel.id === message.channel)?.name]));
    state.attendance.forEach((record) => add("attendance", "Chấm công", employeeById(record.employee)?.name || "Không rõ", `${record.type} · ${attendanceStatusLabel(record.status)}`, [employeeById(record.employee)?.name, record.type, record.status, shiftById(record.shift)?.name]));

    return results;
  }

  function handleViewClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const { action } = actionTarget.dataset;

    if (action === "get-location") {
      requestCurrentLocation();
    }

    if (action === "record-attendance") {
      recordAttendance(actionTarget.dataset.type || "checkin");
    }

    if (action === "export-attendance") {
      exportAttendanceCSV();
    }

    if (action === "task-progress") {
      adjustTaskProgress(actionTarget.dataset.id, Number(actionTarget.dataset.delta || 0));
    }

    if (action === "leave-approve" || action === "leave-reject") {
      updateLeaveStatus(actionTarget.dataset.id, action === "leave-approve" ? "approved" : "rejected");
    }

    if (action === "purchase-approve" || action === "purchase-reject") {
      updateRequestStatus("purchaseRequests", actionTarget.dataset.id, action === "purchase-approve" ? "approved" : "rejected");
    }

    if (action === "proposal-approve" || action === "proposal-reject") {
      updateRequestStatus("proposals", actionTarget.dataset.id, action === "proposal-approve" ? "approved" : "rejected");
    }

    if (action === "recruitment-approve" || action === "recruitment-reject") {
      updateRequestStatus("recruitment", actionTarget.dataset.id, action === "recruitment-approve" ? "approved" : "rejected");
    }

    if (action === "schedule-approve" || action === "schedule-reject") {
      updateRequestStatus("scheduleRequests", actionTarget.dataset.id, action === "schedule-approve" ? "approved" : "rejected");
    }

    if (action === "advance-approve" || action === "advance-reject") {
      updateRequestStatus("salaryAdvances", actionTarget.dataset.id, action === "advance-approve" ? "approved" : "rejected");
    }

    if (action === "asset-check") {
      markAssetChecked(actionTarget.dataset.id);
    }

    if (action === "incident-close") {
      updateRequestStatus("incidents", actionTarget.dataset.id, "closed");
    }

    if (action === "audit-done") {
      updateRequestStatus("assetAudits", actionTarget.dataset.id, "done");
    }

    if (action === "onboarding-reading" || action === "onboarding-done") {
      updateOnboardingProgress(
        actionTarget.dataset.employee,
        actionTarget.dataset.doc,
        action === "onboarding-done" ? "done" : "reading"
      );
    }

    if (action === "switch-channel") {
      activeChannel = actionTarget.dataset.channel || "all";
      render();
    }

    if (action === "export-state") {
      downloadText("clinic-hub-data.json", JSON.stringify(state, null, 2), "application/json");
      showToast("Đã xuất dữ liệu JSON.");
    }

    if (action === "supabase-logout") {
      signOutSupabase();
    }

    if (action === "simulate-gas-sync") {
      simulateGasSync();
    }
  }

  function handleViewChange(event) {
    const target = event.target;
    if (target.matches("[data-action='people-filter']")) {
      sessionStorage.setItem("peopleDepartment", target.value);
      render();
    }

    if (target.matches("[data-action='onboarding-employee']")) {
      sessionStorage.setItem("onboardingEmployee", target.value);
      render();
    }

    if (target.matches("[data-action='task-status']")) {
      const task = state.tasks.find((item) => item.id === target.dataset.id);
      if (task) {
        task.status = target.value;
        if (task.status === "done") task.progress = 100;
        saveState();
        render();
      }
    }
  }

  function handleViewInput(event) {
    const target = event.target;
    if (target.matches("[data-action='attendance-history-search']")) {
      attendanceHistoryTerm = target.value;
      const caret = target.selectionStart || attendanceHistoryTerm.length;
      render();
      const searchInput = document.getElementById("attendanceHistorySearch");
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(caret, caret);
      }
      return;
    }

    if (target.id === "attendanceEmployee") {
      const employee = resolveEmployeeInput(target.value);
      const shiftSelect = document.getElementById("attendanceShift");
      if (employee && shiftSelect) shiftSelect.value = employee.shift;
    }
  }

  async function handleViewSubmit(event) {
    const form = event.target.closest("form[data-form]");
    if (!form) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    if (form.dataset.form === "supabase-login") {
      await signInSupabase(data.email, data.password);
      return;
    }

    if (form.dataset.form === "task") {
      state.tasks.unshift({
        id: makeId("t"),
        title: data.title.trim(),
        department: data.department,
        assignee: data.assignee,
        status: "todo",
        progress: clamp(Number(data.progress || 0), 0, 100),
        priority: data.priority,
        due: data.due || todayISO,
        notes: data.notes.trim(),
      });
      saveState();
      showToast("Đã thêm task mới.");
      render();
    }

    if (form.dataset.form === "supply-import") {
      const existing = state.supplies.find((item) => normalizeText(item.name) === normalizeText(data.itemName));
      if (existing) {
        existing.stock = Number(existing.stock || 0) + Number(data.quantity || 0);
        existing.category = data.category;
        existing.unit = data.unit.trim() || existing.unit;
        existing.location = data.location.trim() || existing.location;
        existing.supplier = data.supplier.trim() || existing.supplier;
        existing.lastImport = todayISO;
        existing.notes = data.notes.trim() || existing.notes;
      } else {
        state.supplies.unshift({
          id: makeId("s"),
          name: data.itemName.trim(),
          category: data.category,
          unit: data.unit.trim() || "cái",
          stock: Number(data.quantity || 0),
          minStock: 0,
          location: data.location.trim() || "Chưa gán vị trí",
          supplier: data.supplier.trim() || "Chưa cập nhật",
          lastImport: todayISO,
          notes: data.notes.trim(),
        });
      }
      saveState();
      showToast("Đã cập nhật tồn kho vật tư.");
      render();
    }

    if (form.dataset.form === "purchase-request") {
      state.purchaseRequests.unshift({
        id: makeId("pr"),
        itemName: data.itemName.trim(),
        category: data.category,
        quantity: Number(data.quantity || 0),
        unit: data.unit.trim() || "cái",
        requester: data.requester,
        department: data.department,
        status: "pending",
        reason: data.reason.trim(),
        createdAt: new Date().toISOString(),
      });
      saveState();
      showToast("Đã gửi đề xuất mua vật tư.");
      render();
    }

    if (form.dataset.form === "leave") {
      state.leaveRequests.unshift({
        id: makeId("l"),
        employee: data.employee,
        type: data.type,
        from: data.from || todayISO,
        to: data.to || data.from || todayISO,
        status: "pending",
        reason: data.reason.trim(),
        reviewer: "e-001",
      });
      saveState();
      showToast("Đã gửi đơn nghỉ phép.");
      render();
    }

    if (form.dataset.form === "employee") {
      state.employees.unshift({
        id: makeId("e"),
        name: data.name.trim(),
        department: data.department,
        role: data.role.trim(),
        shift: data.shift,
        phone: data.phone.trim() || "Chưa cập nhật",
        status: data.status,
        manager: data.manager.trim() || "Chưa gán",
        hireDate: data.hireDate || todayISO,
        insuranceDate: data.insuranceDate || addDaysISO(60),
        salaryOffer: Number(data.salaryOffer || 0),
        hourlyRate: Number(data.hourlyRate || 0),
        profileLocked: data.profileLocked === "true",
        certificates: splitList(data.certificates),
      });
      saveState();
      showToast("Đã thêm nhân sự.");
      render();
    }

    if (form.dataset.form === "asset") {
      state.assets.unshift({
        id: makeId("as"),
        code: data.code.trim(),
        name: data.name.trim(),
        department: data.department,
        location: data.location.trim(),
        custodian: data.custodian,
        condition: data.condition,
        checkedAt: todayISO,
        notes: data.notes.trim(),
      });
      saveState();
      showToast("Đã lưu tài sản kiểm kê.");
      render();
    }

    if (form.dataset.form === "proposal") {
      const file = new FormData(form).get("fileAttachment");
      state.proposals.unshift({
        id: makeId("p"),
        type: data.type,
        title: data.title.trim(),
        department: data.department,
        requester: data.requester,
        amount: Number(data.amount || 0),
        attachmentUrl: data.attachmentUrl.trim(),
        fileName: file && file.name ? file.name : "",
        status: "pending",
        reason: data.reason.trim(),
        createdAt: new Date().toISOString(),
      });
      saveState();
      showToast("Đã gửi phiếu đề xuất.");
      render();
    }

    if (form.dataset.form === "recruitment") {
      state.recruitment.unshift({
        id: makeId("r"),
        candidate: data.candidate.trim(),
        role: data.role.trim(),
        department: data.department,
        responsible: data.responsible,
        stage: data.stage,
        interviewDate: data.interviewDate || todayISO,
        autoSchedule: true,
        salaryExpected: Number(data.salaryExpected || 0),
        offerAmount: Number(data.offerAmount || 0),
        insuranceDate: data.insuranceDate || addDaysISO(60),
        status: "pending",
        note: data.note.trim(),
      });
      saveState();
      showToast("Đã lưu hồ sơ tuyển dụng.");
      render();
    }

    if (form.dataset.form === "schedule-request") {
      state.scheduleRequests.unshift({
        id: makeId("sr"),
        employee: data.employee,
        month: data.month || todayISO.slice(0, 7),
        submittedAt: new Date().toISOString(),
        preference: data.preference.trim(),
        status: "pending",
        reviewer: data.reviewer,
      });
      saveState();
      showToast("Đã gửi đăng ký lịch làm.");
      render();
    }

    if (form.dataset.form === "schedule-assignment") {
      state.scheduleAssignments.unshift({
        id: makeId("sa"),
        employee: data.employee,
        date: data.date || todayISO,
        shift: data.shift,
        owner: data.owner,
        swapWith: data.swapWith,
        status: data.status,
        overtimeMinutes: Number(data.overtimeMinutes || 0),
        earlyArrivalMinutes: Number(data.earlyArrivalMinutes || 0),
        earlyLeaveMinutes: Number(data.earlyLeaveMinutes || 0),
        note: data.note.trim(),
        proofUrl: "",
      });
      saveState();
      showToast("Đã lưu lịch làm.");
      render();
    }

    if (form.dataset.form === "salary-advance") {
      state.salaryAdvances.unshift({
        id: makeId("av"),
        employee: data.employee,
        type: data.type,
        amount: Number(data.amount || 0),
        bankAccount: data.bankAccount.trim(),
        reason: data.reason.trim(),
        status: "pending",
        reviewer: "e-001",
        routedTo: data.type === "Duyệt tiền mặt" ? "kt" : "ns",
        createdAt: new Date().toISOString(),
      });
      saveState();
      showToast("Đã gửi yêu cầu ứng lương/tiền mặt.");
      render();
    }

    if (form.dataset.form === "payroll-feedback") {
      state.payrollFeedback.unshift({
        id: makeId("pf"),
        employee: data.employee,
        month: data.month || todayISO.slice(0, 7),
        text: data.text.trim(),
        status: "open",
        createdAt: new Date().toISOString(),
      });
      saveState();
      showToast("Đã gửi phản hồi công lương.");
      render();
    }

    if (form.dataset.form === "incident") {
      const file = new FormData(form).get("fileAttachment");
      state.incidents.unshift({
        id: makeId("i"),
        employee: data.employee,
        reporter: data.reporter,
        date: data.date || todayISO,
        category: data.category,
        title: data.title.trim(),
        proofUrl: data.proofUrl.trim(),
        fileName: file && file.name ? file.name : "",
        status: "open",
        note: data.note.trim(),
      });
      saveState();
      showToast("Đã lưu sự vụ nhân viên.");
      render();
    }

    if (form.dataset.form === "asset-audit") {
      const file = new FormData(form).get("fileAttachment");
      state.assetAudits.unshift({
        id: makeId("aa"),
        title: data.title.trim(),
        department: data.department,
        owner: data.owner,
        due: data.due || todayISO,
        attachmentUrl: data.attachmentUrl.trim(),
        fileName: file && file.name ? file.name : "",
        status: "pending",
        note: data.note.trim(),
      });
      saveState();
      showToast("Đã giao bảng kiểm kê tài sản.");
      render();
    }

    if (form.dataset.form === "uniform") {
      const quantity = Number(data.quantity || 0);
      const year = Number(data.year || new Date().getFullYear());
      const issuedThisYear = state.uniformLogs
        .filter((log) => log.employee === data.employee && Number(log.year) === year)
        .reduce((sum, log) => sum + Number(log.quantity || 0), 0);
      state.uniformLogs.unshift({
        id: makeId("u"),
        employee: data.employee,
        year,
        item: data.item.trim() || "Đồng phục phòng khám",
        quantity,
        size: data.size,
        issuedAt: todayISO,
        issuer: data.issuer,
        status: issuedThisYear + quantity >= 3 ? "issued" : "partial",
        note: data.note.trim() || `Cấp ${quantity}/3 bộ trong năm ${year}.`,
      });
      saveState();
      showToast(issuedThisYear + quantity > 3 ? "Đã lưu cấp phát. Lưu ý vượt định mức 3 bộ/năm." : "Đã lưu nhật ký cấp phát đồng phục.", issuedThisYear + quantity > 3);
      render();
    }

    if (form.dataset.form === "onboarding-doc") {
      const file = new FormData(form).get("fileAttachment");
      state.onboardingDocs.unshift({
        id: makeId("od"),
        title: data.title.trim(),
        category: data.category,
        attachmentUrl: data.attachmentUrl.trim(),
        fileName: file && file.name ? file.name : "",
        owner: data.owner,
        required: data.required === "true",
        updatedAt: todayISO,
      });
      saveState();
      showToast("Đã thêm tài liệu hội nhập.");
      render();
    }

    if (form.dataset.form === "message") {
      state.messages.push({
        id: makeId("m"),
        channel: activeChannel,
        author: "e-001",
        text: data.text.trim(),
        time: new Date().toISOString(),
      });
      saveState();
      render();
      const list = document.getElementById("messageList");
      if (list) list.scrollTop = list.scrollHeight;
    }

    if (form.dataset.form === "settings") {
      state.settings.clinicName = data.clinicName.trim();
      state.settings.clinicAddress = data.clinicAddress.trim();
      state.settings.latitude = Number(data.latitude);
      state.settings.longitude = Number(data.longitude);
      state.settings.allowedRadius = Number(data.allowedRadius);
      state.settings.revenueTarget = Number(data.revenueTarget || state.settings.revenueTarget || 0);
      saveState();
      showToast("Đã lưu cấu hình định vị.");
      render();
    }

    if (form.dataset.form === "gas-settings") {
      state.settings.googleGasUrl = data.googleGasUrl.trim();
      saveState();
      showToast("Đã lưu Google Apps Script URL.");
      render();
    }

    if (form.dataset.form === "manager-note") {
      state.settings.managerNote = data.managerNote.trim();
      saveState();
      showToast("Đã lưu ghi chú quản lý.");
      render();
    }
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      showToast("Trình duyệt không hỗ trợ định vị. Có thể nhập vĩ độ/kinh độ thủ công.", true);
      return;
    }

    showToast("Đang lấy định vị trực tiếp...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = Math.round(position.coords.accuracy || 0);
        const distance = Math.round(distanceMeters(lat, lng, state.settings.latitude, state.settings.longitude));
        lastLocation = {
          lat,
          lng,
          accuracy,
          distance,
          time: new Date().toISOString(),
          inside: distance <= Number(state.settings.allowedRadius),
        };
        showToast(lastLocation.inside ? "Vị trí nằm trong bán kính hợp lệ." : "Vị trí ngoài bán kính, quản lý cần xác minh.", !lastLocation.inside);
        render();
      },
      (error) => {
        showToast(`Không lấy được vị trí: ${error.message}. Có thể nhập tọa độ thủ công.`, true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function recordAttendance(type) {
    const form = document.getElementById("attendanceForm");
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const employee = resolveEmployeeInput(data.employeeName);
    const manualLat = Number(data.manualLat);
    const manualLng = Number(data.manualLng);
    let point = lastLocation;

    if (!employee) {
      showToast("Cần chọn đúng nhân sự từ gợi ý trước khi chấm công.", true);
      return;
    }

    if (Number.isFinite(manualLat) && Number.isFinite(manualLng)) {
      const distance = Math.round(distanceMeters(manualLat, manualLng, state.settings.latitude, state.settings.longitude));
      point = {
        lat: manualLat,
        lng: manualLng,
        accuracy: 0,
        distance,
        time: new Date().toISOString(),
        inside: distance <= Number(state.settings.allowedRadius),
      };
    }

    if (!point) {
      showToast("Cần lấy vị trí trực tiếp hoặc nhập tọa độ trước khi chấm công.", true);
      return;
    }

    const shift = shiftById(data.shift);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const shiftStart = shift ? timeToMinutes(shift.start) : 0;
    const isLate = type === "checkin" && nowMinutes > shiftStart - 5;
    const status = !point.inside ? "outside" : isLate ? "late" : "valid";

    state.attendance.unshift({
      id: makeId("a"),
      employee: employee.id,
      shift: data.shift,
      type,
      date: toISODate(now),
      time: now.toISOString(),
      lat: point.lat,
      lng: point.lng,
      distance: point.distance,
      accuracy: point.accuracy,
      status,
    });
    saveState();
    showToast(type === "checkin" ? "Đã ghi nhận check-in." : "Đã ghi nhận check-out.", status !== "valid");
    render();
  }

  function filteredTasks() {
    if (!searchTerm) return state.tasks;
    return state.tasks.filter((task) => {
      const employee = employeeById(task.assignee);
      return smartMatch([task.title, task.notes, departmentName(task.department), employee?.name, task.status, task.priority], searchTerm);
    });
  }

  function filteredAttendance() {
    const records = [...state.attendance].sort((a, b) => new Date(b.time) - new Date(a.time));
    if (!searchTerm) return records;
    return records.filter((record) => {
      const employee = employeeById(record.employee);
      const shift = shiftById(record.shift);
      return smartMatch([employee?.name, employee?.role, departmentName(employee?.department), shift?.name, record.status, record.type, record.distance], searchTerm);
    });
  }

  function filteredAttendanceHistory() {
    const records = filteredAttendance();
    if (!attendanceHistoryTerm) return records;
    return records.filter((record) => {
      const employee = employeeById(record.employee);
      const shift = shiftById(record.shift);
      return smartMatch(
        [
          employee?.name,
          employee?.role,
          departmentName(employee?.department),
          record.type === "checkin" ? "check in checkin vào vao" : "check out checkout ra",
          shift?.group,
          shift?.name,
          shift ? `${shift.start}-${shift.end}` : "",
          formatDateTime(record.time),
          formatShortDate(record.date),
          attendanceStatusLabel(record.status),
          record.status,
          `${record.distance}m`,
          `sai so ${record.accuracy}m`,
        ],
        attendanceHistoryTerm
      );
    });
  }

  function filteredLeave() {
    const requests = [...state.leaveRequests].sort((a, b) => new Date(b.from) - new Date(a.from));
    if (!searchTerm) return requests;
    return requests.filter((request) => {
      const employee = employeeById(request.employee);
      return smartMatch([employee?.name, request.type, request.reason, request.status, departmentName(employee?.department)], searchTerm);
    });
  }

  function filteredSupplies() {
    if (!searchTerm) return state.supplies;
    return state.supplies.filter((item) => smartMatch([item.name, item.category, item.unit, item.location, item.supplier, item.notes, item.stock], searchTerm));
  }

  function filteredPurchaseRequests() {
    const requests = [...state.purchaseRequests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!searchTerm) return requests;
    return requests.filter((request) => {
      const requester = employeeById(request.requester);
      return smartMatch([request.itemName, request.category, request.reason, request.status, requester?.name, departmentName(request.department)], searchTerm);
    });
  }

  function filteredAssets() {
    if (!searchTerm) return state.assets;
    return state.assets.filter((asset) => {
      const custodian = employeeById(asset.custodian);
      return smartMatch([asset.code, asset.name, asset.location, asset.condition, asset.notes, custodian?.name, departmentName(asset.department)], searchTerm);
    });
  }

  function filteredProposals() {
    const proposals = [...state.proposals].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!searchTerm) return proposals;
    return proposals.filter((proposal) => {
      const requester = employeeById(proposal.requester);
      return smartMatch([proposal.type, proposal.title, proposal.reason, proposal.status, proposal.attachmentUrl, proposal.fileName, requester?.name, departmentName(proposal.department), proposal.amount], searchTerm);
    });
  }

  function filteredUniformLogs() {
    const logs = [...state.uniformLogs].sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt));
    if (!searchTerm) return logs;
    return logs.filter((log) => {
      const employee = employeeById(log.employee);
      const issuer = employeeById(log.issuer);
      return smartMatch([employee?.name, employee?.role, departmentName(employee?.department), issuer?.name, log.year, log.item, log.quantity, log.size, log.status, log.note], searchTerm);
    });
  }

  function filteredOnboardingDocs() {
    if (!searchTerm) return state.onboardingDocs;
    return state.onboardingDocs.filter((doc) => {
      const owner = employeeById(doc.owner);
      return smartMatch([doc.title, doc.category, doc.attachmentUrl, doc.fileName, owner?.name, doc.required ? "bat buoc required" : "khong bat buoc"], searchTerm);
    });
  }

  function filteredPeople(selectedDept) {
    return state.employees.filter((employee) => {
      const deptMatch = selectedDept === "all" || employee.department === selectedDept;
      if (!searchTerm) return deptMatch;
      return deptMatch && smartMatch([employee.name, employee.role, employee.phone, departmentName(employee.department), employee.certificates?.join(" ")], searchTerm);
    });
  }

  function filteredMessages() {
    if (!searchTerm) return state.messages;
    return state.messages.filter((message) => {
      const author = employeeById(message.author);
      const channel = state.channels.find((item) => item.id === message.channel);
      return smartMatch([message.text, author?.name, channel?.name], searchTerm);
    });
  }

  function filteredRecruitment() {
    const items = [...state.recruitment].sort((a, b) => new Date(b.interviewDate) - new Date(a.interviewDate));
    if (!searchTerm) return items;
    return items.filter((item) => {
      const owner = employeeById(item.responsible);
      return smartMatch([item.candidate, item.role, item.stage, item.status, item.note, departmentName(item.department), owner?.name, item.salaryExpected, item.offerAmount], searchTerm);
    });
  }

  function filteredScheduleRequests() {
    const items = [...state.scheduleRequests].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    if (!searchTerm) return items;
    return items.filter((item) => {
      const employee = employeeById(item.employee);
      return smartMatch([employee?.name, employee?.role, departmentName(employee?.department), item.month, item.preference, item.status], searchTerm);
    });
  }

  function filteredScheduleAssignments() {
    const items = [...state.scheduleAssignments].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!searchTerm) return items;
    return items.filter((item) => {
      const employee = employeeById(item.employee);
      const swap = employeeById(item.swapWith);
      const shift = shiftById(item.shift);
      return smartMatch([employee?.name, employee?.role, departmentName(employee?.department), swap?.name, shift?.name, item.status, item.note, item.date], searchTerm);
    });
  }

  function filteredSalaryAdvances() {
    const items = [...state.salaryAdvances].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!searchTerm) return items;
    return items.filter((item) => {
      const employee = employeeById(item.employee);
      return smartMatch([employee?.name, employee?.role, departmentName(employee?.department), item.type, item.amount, item.bankAccount, item.reason, item.status, item.routedTo], searchTerm);
    });
  }

  function filteredPayrollFeedback() {
    const items = [...state.payrollFeedback].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!searchTerm) return items;
    return items.filter((item) => {
      const employee = employeeById(item.employee);
      return smartMatch([employee?.name, employee?.role, departmentName(employee?.department), item.month, item.text, item.status], searchTerm);
    });
  }

  function filteredPayrollRows() {
    const rows = buildPayrollRows();
    if (!searchTerm) return rows;
    return rows.filter((row) => smartMatch([row.employee.name, row.employee.role, departmentName(row.employee.department), row.month, row.regularHours, row.overtimeHours, row.netPay], searchTerm));
  }

  function filteredIncidents() {
    const items = [...state.incidents].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!searchTerm) return items;
    return items.filter((item) => {
      const employee = employeeById(item.employee);
      const reporter = employeeById(item.reporter);
      return smartMatch([employee?.name, reporter?.name, item.category, item.title, item.note, item.status, item.proofUrl, item.fileName], searchTerm);
    });
  }

  function filteredAssetAudits() {
    const items = [...state.assetAudits].sort((a, b) => new Date(a.due) - new Date(b.due));
    if (!searchTerm) return items;
    return items.filter((item) => {
      const owner = employeeById(item.owner);
      return smartMatch([item.title, departmentName(item.department), owner?.name, item.due, item.fileName, item.attachmentUrl, item.status, item.note], searchTerm);
    });
  }

  function renderTimeline(records) {
    if (!records.length) return emptyState();
    return records
      .slice(0, 6)
      .map((record) => {
        const employee = employeeById(record.employee);
        const label = attendanceStatusLabel(record.status);
        return `
          <div class="timeline-item">
            <span class="timeline-dot ${record.status === "valid" ? "" : record.status === "late" ? "warn" : "bad"}"></span>
            <div>
              <strong>${escapeHTML(employee?.name || "Không rõ")}</strong>
              <p class="subtle">${formatTime(record.time)} · ${escapeHTML(departmentName(employee?.department))} · ${Math.round(record.distance)}m</p>
            </div>
            ${statusPill(label, record.status === "valid" ? "good" : record.status === "late" ? "warn" : "bad")}
          </div>
        `;
      })
      .join("");
  }

  function renderLocationResult() {
    if (!lastLocation) {
      return `
        <strong>Chưa lấy vị trí</strong>
        <span class="subtle">Bấm lấy vị trí trực tiếp trên điện thoại hoặc nhập tọa độ thủ công để kiểm tra.</span>
      `;
    }
    const mapUrl = `https://www.google.com/maps?q=${lastLocation.lat},${lastLocation.lng}`;
    return `
      <div class="section-title">
        <strong>${lastLocation.inside ? "Trong bán kính phòng khám" : "Ngoài bán kính hợp lệ"}</strong>
        ${statusPill(lastLocation.inside ? "Hợp lệ" : "Cần xác minh", lastLocation.inside ? "good" : "bad")}
      </div>
      <p class="subtle">Lat ${lastLocation.lat.toFixed(6)}, Lng ${lastLocation.lng.toFixed(6)} · ${lastLocation.distance}m tới phòng khám · sai số ${lastLocation.accuracy}m</p>
      <a class="secondary-button" href="${mapUrl}" target="_blank" rel="noreferrer"><span>⌖</span>Mở bản đồ</a>
    `;
  }

  function renderAttendanceTable(records) {
    if (!records.length) return emptyState();
    const rows = records.map((record) => {
      const employee = employeeById(record.employee);
      const shift = shiftById(record.shift);
      return `
        <tr>
          <td><strong>${escapeHTML(employee?.name || "Không rõ")}</strong><br><span class="subtle">${escapeHTML(departmentName(employee?.department))}</span></td>
          <td>${record.type === "checkin" ? "Check-in" : "Check-out"}</td>
          <td>${escapeHTML(shift ? `${shift.name} ${shift.start}-${shift.end}` : "Chưa gán ca")}</td>
          <td>${formatDateTime(record.time)}</td>
          <td>${record.distance}m<br><span class="subtle">Sai số ${record.accuracy}m</span></td>
          <td>${statusPill(attendanceStatusLabel(record.status), record.status === "valid" ? "good" : record.status === "late" ? "warn" : "bad")}</td>
        </tr>
      `;
    }).join("");
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân sự</th>
              <th>Loại</th>
              <th>Ca</th>
              <th>Thời gian</th>
              <th>Vị trí</th>
              <th>Trạng thái</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderTaskColumn(status, tasks) {
    const items = tasks.filter((task) => task.status === status);
    return `
      <div class="kanban-column">
        <div class="column-title">
          <span>${taskStatus[status]}</span>
          ${pill(items.length)}
        </div>
        ${items.length ? items.map(renderTaskCard).join("") : emptyState()}
      </div>
    `;
  }

  function renderTaskCard(task) {
    const employee = employeeById(task.assignee);
    return `
      <article class="task-card">
        <div class="section-title">
          <h4>${escapeHTML(task.title)}</h4>
          ${priorityPill(task.priority)}
        </div>
        <div class="task-meta">
          ${pill(departmentName(task.department))}
          ${pill(employee?.name || "Chưa gán")}
          ${pill(`Hạn ${formatShortDate(task.due)}`)}
        </div>
        <p class="subtle">${escapeHTML(task.notes || "Không có ghi chú")}</p>
        <div class="progress-track" style="margin-top:10px">
          <div class="progress-fill" style="width:${Number(task.progress || 0)}%"></div>
        </div>
        <div class="task-actions">
          <div class="pill-row">
            <button class="icon-button" type="button" title="Giảm tiến độ" data-action="task-progress" data-id="${escapeHTML(task.id)}" data-delta="-10">−</button>
            ${pill(`${task.progress}%`)}
            <button class="icon-button" type="button" title="Tăng tiến độ" data-action="task-progress" data-id="${escapeHTML(task.id)}" data-delta="10">+</button>
          </div>
          <select data-action="task-status" data-id="${escapeHTML(task.id)}" aria-label="Đổi trạng thái task">
            ${Object.keys(taskStatus).map((status) => option(status, taskStatus[status], task.status === status)).join("")}
          </select>
        </div>
      </article>
    `;
  }

  function renderSupplyCard(item) {
    const isLow = Number(item.stock) <= Number(item.minStock);
    return `
      <article class="inventory-card">
        <div class="section-title">
          <h4>${escapeHTML(item.name)}</h4>
          ${statusPill(isLow ? "Cần nhập" : "Đủ tồn", isLow ? "warn" : "good")}
        </div>
        <div class="task-meta">
          ${pill(item.category)}
          ${pill(`${item.stock} ${item.unit}`)}
          ${pill(`Tối thiểu ${item.minStock}`)}
        </div>
        <p class="subtle">${escapeHTML(item.location)} · ${escapeHTML(item.supplier)}</p>
        <p class="subtle">Nhập gần nhất ${formatShortDate(item.lastImport)} · ${escapeHTML(item.notes || "Không có ghi chú")}</p>
      </article>
    `;
  }

  function renderPurchaseCard(request) {
    const requester = employeeById(request.requester);
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(request.itemName)}</h4>
          ${statusPill(leaveStatus[request.status] || request.status, request.status === "approved" ? "good" : request.status === "pending" ? "warn" : "bad")}
        </div>
        <div class="request-meta">
          ${pill(request.category)}
          ${pill(`${request.quantity} ${request.unit}`)}
          ${pill(requester?.name || "Không rõ")}
          ${pill(departmentName(request.department))}
        </div>
        <p class="subtle">${escapeHTML(request.reason)}</p>
        <div class="request-actions">
          <span class="subtle">${formatDateTime(request.createdAt)}</span>
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="purchase-approve" data-id="${escapeHTML(request.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="purchase-reject" data-id="${escapeHTML(request.id)}"><span>×</span>Từ chối</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderAssetCard(asset) {
    const custodian = employeeById(asset.custodian);
    const tone = asset.condition === "good" ? "good" : asset.condition === "maintenance" ? "warn" : "bad";
    const label = asset.condition === "good" ? "Tốt" : asset.condition === "maintenance" ? "Cần bảo trì" : "Thiếu/mất";
    return `
      <article class="inventory-card">
        <div class="section-title">
          <h4>${escapeHTML(asset.name)}</h4>
          ${statusPill(label, tone)}
        </div>
        <div class="task-meta">
          ${pill(asset.code)}
          ${pill(departmentName(asset.department))}
          ${pill(custodian?.name || "Chưa gán")}
        </div>
        <p class="subtle">${escapeHTML(asset.location)} · kiểm kê ${formatShortDate(asset.checkedAt)}</p>
        <p class="subtle">${escapeHTML(asset.notes || "Không có ghi chú")}</p>
        <div class="task-actions">
          <span class="subtle">Lưu trữ tài sản</span>
          <button class="secondary-button" type="button" data-action="asset-check" data-id="${escapeHTML(asset.id)}"><span>✓</span>Đã kiểm kê</button>
        </div>
      </article>
    `;
  }

  function renderLeaveCard(request) {
    const employee = employeeById(request.employee);
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(request.type)}</h4>
          ${statusPill(leaveStatus[request.status], request.status === "approved" ? "good" : request.status === "pending" ? "warn" : "bad")}
        </div>
        <div class="request-meta">
          ${pill(employee?.name || "Không rõ")}
          ${pill(departmentName(employee?.department))}
          ${pill(`${formatShortDate(request.from)} - ${formatShortDate(request.to)}`)}
          ${pill("Trưởng BP → Tổng vận hành")}
        </div>
        <p class="subtle">${escapeHTML(request.reason)}</p>
        <div class="request-actions">
          <span class="subtle">Duyệt bởi ${escapeHTML(employeeById(request.reviewer)?.name || "Quản lý")}</span>
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="leave-approve" data-id="${escapeHTML(request.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="leave-reject" data-id="${escapeHTML(request.id)}"><span>×</span>Từ chối</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProposalCard(proposal) {
    const requester = employeeById(proposal.requester);
    const attachment = proposal.attachmentUrl
      ? `<a href="${escapeAttr(proposal.attachmentUrl)}" target="_blank" rel="noreferrer">${escapeHTML(proposal.attachmentUrl)}</a>`
      : proposal.fileName
        ? escapeHTML(proposal.fileName)
        : "Không có";
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(proposal.title)}</h4>
          ${statusPill(leaveStatus[proposal.status] || proposal.status, proposal.status === "approved" ? "good" : proposal.status === "pending" ? "warn" : "bad")}
        </div>
        <div class="request-meta">
          ${pill(proposal.type)}
          ${pill(departmentName(proposal.department))}
          ${pill(requester?.name || "Không rõ")}
          ${Number(proposal.amount) ? pill(formatCurrency(proposal.amount)) : pill("Không chi phí")}
          ${pill("Duyệt → account chính")}
        </div>
        <p class="subtle">${escapeHTML(proposal.reason)}</p>
        <p class="subtle">Đính kèm: ${attachment}</p>
        <div class="request-actions">
          <span class="subtle">${formatDateTime(proposal.createdAt)}</span>
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="proposal-approve" data-id="${escapeHTML(proposal.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="proposal-reject" data-id="${escapeHTML(proposal.id)}"><span>×</span>Từ chối</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderRecruitmentCard(item) {
    const owner = employeeById(item.responsible);
    const tone = statusTone(item.status);
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(item.candidate)}</h4>
          ${statusPill(leaveStatus[item.status] || item.status, tone)}
        </div>
        <div class="request-meta">
          ${pill(item.role)}
          ${pill(departmentName(item.department))}
          ${pill(owner?.name || "Chưa gán")}
          ${pill(item.stage)}
        </div>
        <p class="subtle">Lịch hẹn ${formatShortDate(item.interviewDate)} · mong muốn ${formatCurrency(item.salaryExpected)} · offer ${formatCurrency(item.offerAmount)}</p>
        <p class="subtle">BH dự kiến ${formatShortDate(item.insuranceDate)} · ${escapeHTML(item.note || "Không có ghi chú")}</p>
        <div class="request-actions">
          <span class="subtle">${item.autoSchedule ? "Có set lịch tự động" : "Set lịch thủ công"}</span>
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="recruitment-approve" data-id="${escapeHTML(item.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="recruitment-reject" data-id="${escapeHTML(item.id)}"><span>×</span>Từ chối</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderDepartmentSchedule(departmentId, assignments) {
    const deptAssignments = assignments.filter((item) => employeeById(item.employee)?.department === departmentId);
    return `
      <article class="schedule-card">
        <div class="section-title">
          <h3>${escapeHTML(departmentName(departmentId))}</h3>
          ${pill(deptAssignments.length)}
        </div>
        <div class="grid">
          ${deptAssignments.length ? deptAssignments.slice(0, 4).map(renderScheduleAssignmentCard).join("") : `<p class="subtle">Chưa có lịch trong bộ lọc.</p>`}
        </div>
      </article>
    `;
  }

  function renderScheduleAssignmentCard(item) {
    const employee = employeeById(item.employee);
    const shift = shiftById(item.shift);
    const swap = employeeById(item.swapWith);
    return `
      <article class="mini-card">
        <strong>${escapeHTML(employee?.name || "Không rõ")} · ${formatShortDate(item.date)}</strong>
        <span>${escapeHTML(shift ? `${shift.name} ${shift.start}-${shift.end}` : "Chưa gán ca")}</span>
        <span>${swap ? `Đổi/chia với ${escapeHTML(swap.name)} · ` : ""}Tăng ca ${item.overtimeMinutes || 0}p · đến sớm ${item.earlyArrivalMinutes || 0}p · đi sớm ${item.earlyLeaveMinutes || 0}p</span>
        ${statusPill(item.status === "confirmed" ? "Đã xác nhận" : item.status === "changed" ? "Đã đổi ca" : "Đã lên lịch", item.status === "confirmed" ? "good" : "neutral")}
      </article>
    `;
  }

  function renderScheduleRequestCard(item) {
    const employee = employeeById(item.employee);
    const reviewer = employeeById(item.reviewer);
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(employee?.name || "Không rõ")}</h4>
          ${statusPill(leaveStatus[item.status] || item.status, statusTone(item.status))}
        </div>
        <div class="request-meta">
          ${pill(item.month)}
          ${pill(departmentName(employee?.department))}
          ${pill(`Duyệt: ${reviewer?.name || "Quản lý"}`)}
        </div>
        <p class="subtle">${escapeHTML(item.preference)}</p>
        <div class="request-actions">
          <span class="subtle">Gửi ${formatDateTime(item.submittedAt)}</span>
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="schedule-approve" data-id="${escapeHTML(item.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="schedule-reject" data-id="${escapeHTML(item.id)}"><span>×</span>Từ chối</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderAttendanceSummaryCards() {
    const monthKey = todayISO.slice(0, 7);
    const yearKey = todayISO.slice(0, 4);
    const todayRecords = state.attendance.filter((record) => record.date === todayISO);
    const monthRecords = state.attendance.filter((record) => String(record.date).startsWith(monthKey));
    const yearRecords = state.attendance.filter((record) => String(record.date).startsWith(yearKey));
    const validMonth = monthRecords.filter((record) => record.status === "valid").length;
    const lateMonth = monthRecords.filter((record) => record.status === "late").length;
    return [
      metric("Hôm nay", todayRecords.length, `${todayRecords.filter((record) => record.type === "checkin").length} check-in`),
      metric("Tháng này", monthRecords.length, `${validMonth} hợp lệ · ${lateMonth} đi muộn`),
      metric("Năm nay", yearRecords.length, `${new Set(yearRecords.map((record) => record.employee)).size} nhân sự có công`),
      metric("Chuyên cần", monthRecords.length ? `${Math.round(validMonth / monthRecords.length * 100)}%` : "0%", "Dựa trên bản ghi hợp lệ"),
    ].join("");
  }

  function buildPayrollRows() {
    const monthKey = todayISO.slice(0, 7);
    return state.employees.map((employee) => {
      const checkins = state.attendance.filter((record) => record.employee === employee.id && record.type === "checkin" && String(record.date).startsWith(monthKey));
      const assignments = state.scheduleAssignments.filter((item) => item.employee === employee.id && String(item.date).startsWith(monthKey));
      const regularHours = checkins.length * 8;
      const overtimeMinutes = assignments.reduce((sum, item) => sum + Number(item.overtimeMinutes || 0) + Number(item.earlyArrivalMinutes || 0) - Number(item.earlyLeaveMinutes || 0), 0);
      const overtimeHours = Math.max(overtimeMinutes / 60, 0);
      const advanceTotal = state.salaryAdvances
        .filter((item) => item.employee === employee.id && item.status === "approved" && String(item.createdAt).slice(0, 7) === monthKey)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const hourlyRate = Number(employee.hourlyRate || 0);
      const grossPay = Math.round(regularHours * hourlyRate + overtimeHours * hourlyRate * 1.5);
      return {
        employee,
        month: monthKey,
        days: checkins.length,
        regularHours,
        overtimeHours,
        hourlyRate,
        grossPay,
        advanceTotal,
        netPay: Math.max(grossPay - advanceTotal, 0),
      };
    });
  }

  function renderPayrollTable(rows) {
    if (!rows.length) return emptyState();
    const body = rows.map((row) => `
      <tr>
        <td><strong>${escapeHTML(row.employee.name)}</strong><br><span class="subtle">${escapeHTML(departmentName(row.employee.department))}</span></td>
        <td>${row.days} ngày<br><span class="subtle">${row.regularHours} giờ công</span></td>
        <td>${row.overtimeHours.toFixed(1)} giờ<br><span class="subtle">Tăng ca/đến sớm</span></td>
        <td>${formatCurrency(row.hourlyRate)}</td>
        <td>${formatCurrency(row.grossPay)}</td>
        <td>${formatCurrency(row.advanceTotal)}</td>
        <td><strong>${formatCurrency(row.netPay)}</strong></td>
      </tr>
    `).join("");
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nhân sự</th>
              <th>Công</th>
              <th>Tăng ca</th>
              <th>Lương giờ</th>
              <th>Tạm tính</th>
              <th>Ứng</th>
              <th>Thực nhận</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  }

  function renderSalaryAdvanceCard(item) {
    const employee = employeeById(item.employee);
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(item.type || "Ứng lương")}</h4>
          ${statusPill(leaveStatus[item.status] || item.status, statusTone(item.status))}
        </div>
        <div class="request-meta">
          ${pill(employee?.name || "Không rõ")}
          ${pill(formatCurrency(item.amount))}
          ${pill(item.routedTo === "kt" ? "Kế toán" : "PNS")}
        </div>
        <p class="subtle">STK: ${escapeHTML(item.bankAccount || "Chưa nhập")}</p>
        <p class="subtle">${escapeHTML(item.reason)}</p>
        <div class="request-actions">
          <span class="subtle">${formatDateTime(item.createdAt)}</span>
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="advance-approve" data-id="${escapeHTML(item.id)}"><span>✓</span>Duyệt</button>
            <button class="danger-button" type="button" data-action="advance-reject" data-id="${escapeHTML(item.id)}"><span>×</span>Từ chối</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderPayrollFeedbackCard(item) {
    const employee = employeeById(item.employee);
    return `
      <article class="mini-card">
        <strong>${escapeHTML(employee?.name || "Không rõ")} · ${escapeHTML(item.month)}</strong>
        <span>${escapeHTML(item.text)}</span>
        ${statusPill(item.status === "resolved" ? "Đã xử lý" : "Đang mở", item.status === "resolved" ? "good" : "warn")}
      </article>
    `;
  }

  function renderIncidentCard(item) {
    const employee = employeeById(item.employee);
    const reporter = employeeById(item.reporter);
    const attachment = item.proofUrl
      ? `<a href="${escapeAttr(item.proofUrl)}" target="_blank" rel="noreferrer">Mở hình/link</a>`
      : item.fileName
        ? escapeHTML(item.fileName)
        : "Chưa có";
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(item.title)}</h4>
          ${statusPill(item.status === "closed" ? "Đã đóng" : "Đang theo dõi", item.status === "closed" ? "good" : "warn")}
        </div>
        <div class="request-meta">
          ${pill(item.category)}
          ${pill(employee?.name || "Không rõ")}
          ${pill(`Báo cáo: ${reporter?.name || "Quản lý"}`)}
        </div>
        <p class="subtle">${escapeHTML(item.note)}</p>
        <p class="subtle">Bằng chứng: ${attachment}</p>
        <div class="request-actions">
          <span class="subtle">${formatShortDate(item.date)}</span>
          <button class="secondary-button" type="button" data-action="incident-close" data-id="${escapeHTML(item.id)}"><span>✓</span>Đóng sự vụ</button>
        </div>
      </article>
    `;
  }

  function renderAssetAuditCard(item) {
    const owner = employeeById(item.owner);
    const attachment = item.attachmentUrl
      ? `<a href="${escapeAttr(item.attachmentUrl)}" target="_blank" rel="noreferrer">Mở file</a>`
      : item.fileName
        ? escapeHTML(item.fileName)
        : "Chưa đính kèm";
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(item.title)}</h4>
          ${statusPill(item.status === "done" ? "Hoàn tất" : item.status === "doing" ? "Đang làm" : "Chờ xử lý", item.status === "done" ? "good" : "warn")}
        </div>
        <div class="request-meta">
          ${pill(departmentName(item.department))}
          ${pill(owner?.name || "Chưa gán")}
          ${pill(`Hạn ${formatShortDate(item.due)}`)}
        </div>
        <p class="subtle">${escapeHTML(item.note || "Không có ghi chú")}</p>
        <p class="subtle">File: ${attachment}</p>
        <div class="request-actions">
          <span class="subtle">Giao tác vụ kiểm kê</span>
          <button class="secondary-button" type="button" data-action="audit-done" data-id="${escapeHTML(item.id)}"><span>✓</span>Hoàn tất</button>
        </div>
      </article>
    `;
  }

  function renderOffboardingCard(item) {
    const employee = employeeById(item.employee);
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>Hội nhập nghỉ việc</h4>
          ${statusPill(item.status === "done" ? "Hoàn tất" : "Nháp", item.status === "done" ? "good" : "neutral")}
        </div>
        <div class="request-meta">
          ${pill(employee?.name || "Mẫu")}
          ${pill(`Ngày cuối ${formatShortDate(item.lastWorkingDate)}`)}
        </div>
        <div class="check-list">
          ${item.checklist.map((text) => `<span>✓ ${escapeHTML(text)}</span>`).join("")}
        </div>
        <p class="subtle">${escapeHTML(item.note)}</p>
      </article>
    `;
  }

  function renderUniformCard(log) {
    const employee = employeeById(log.employee);
    const issuer = employeeById(log.issuer);
    const tone = log.status === "issued" ? "good" : log.status === "partial" ? "warn" : "bad";
    const label = log.status === "issued" ? "Đã cấp đủ" : log.status === "partial" ? "Cấp một phần" : "Cần kiểm tra";
    return `
      <article class="inventory-card">
        <div class="section-title">
          <h4>${escapeHTML(employee?.name || "Không rõ")}</h4>
          ${statusPill(label, tone)}
        </div>
        <div class="task-meta">
          ${pill(log.year)}
          ${pill(log.item)}
          ${pill(`${log.quantity} bộ`)}
          ${pill(`Size ${log.size}`)}
        </div>
        <p class="subtle">${escapeHTML(departmentName(employee?.department))} · cấp ngày ${formatShortDate(log.issuedAt)} · người cấp ${escapeHTML(issuer?.name || "Quản lý")}</p>
        <p class="subtle">${escapeHTML(log.note || "Không có ghi chú")}</p>
      </article>
    `;
  }

  function renderOnboardingDocCard(doc, employeeId) {
    const owner = employeeById(doc.owner);
    const status = onboardingStatus(employeeId, doc.id);
    const tone = status === "done" ? "good" : status === "reading" ? "warn" : "neutral";
    const label = status === "done" ? "Hoàn thành" : status === "reading" ? "Đang đọc" : "Chưa đọc";
    const attachment = doc.attachmentUrl
      ? `<a href="${escapeAttr(doc.attachmentUrl)}" target="_blank" rel="noreferrer">Mở link tài liệu</a>`
      : doc.fileName
        ? escapeHTML(doc.fileName)
        : "Chưa đính kèm";
    return `
      <article class="request-card">
        <div class="section-title">
          <h4>${escapeHTML(doc.title)}</h4>
          ${statusPill(label, tone)}
        </div>
        <div class="request-meta">
          ${pill(doc.category)}
          ${doc.required ? statusPill("Bắt buộc", "warn") : pill("Không bắt buộc")}
          ${pill(`Cập nhật ${formatShortDate(doc.updatedAt)}`)}
        </div>
        <p class="subtle">Phụ trách: ${escapeHTML(owner?.name || "Nhân sự")}</p>
        <p class="subtle">Tài liệu: ${attachment}</p>
        <div class="request-actions">
          <span class="subtle">Nhân sự tự đánh dấu sau khi đọc</span>
          <div class="pill-row">
            <button class="secondary-button" type="button" data-action="onboarding-reading" data-employee="${escapeAttr(employeeId)}" data-doc="${escapeAttr(doc.id)}"><span>◐</span>Đang đọc</button>
            <button class="primary-button" type="button" data-action="onboarding-done" data-employee="${escapeAttr(employeeId)}" data-doc="${escapeAttr(doc.id)}"><span>✓</span>Hoàn thành</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderPersonCard(employee) {
    const initials = employee.name
      .split(" ")
      .map((part) => part[0])
      .slice(-2)
      .join("")
      .toUpperCase();
    const shift = shiftById(employee.shift);
    return `
      <article class="person-card">
        <span class="avatar">${escapeHTML(initials)}</span>
        <div>
          <h4>${escapeHTML(employee.name)}</h4>
          <div class="person-meta">
            ${pill(departmentName(employee.department))}
            ${pill(employee.role)}
            ${statusPill(employee.status === "active" ? "Đang làm" : "Onboard", employee.status === "active" ? "good" : "warn")}
            ${employee.profileLocked ? statusPill("Hồ sơ khóa", "neutral") : ""}
          </div>
          <p class="subtle">${escapeHTML(employee.phone)} · ${shift ? `${escapeHTML(shift.start)}-${escapeHTML(shift.end)}` : "Chưa gán ca"}</p>
          <p class="subtle">Phụ trách: ${escapeHTML(employee.manager || "Chưa gán")} · BH ${employee.insuranceDate ? formatShortDate(employee.insuranceDate) : "chưa có"}</p>
          <p class="subtle">Offer ${formatCurrency(employee.salaryOffer || 0)} · giờ ${formatCurrency(employee.hourlyRate || 0)}</p>
          <p class="subtle">Chứng chỉ: ${employee.certificates?.length ? escapeHTML(employee.certificates.join(", ")) : "Chưa cập nhật"}</p>
        </div>
      </article>
    `;
  }

  function renderMessage(message) {
    const author = employeeById(message.author);
    return `
      <article class="message-card">
        <div class="message-head">
          <strong>${escapeHTML(author?.name || "Quản lý")}</strong>
          <span class="message-time">${formatDateTime(message.time)}</span>
        </div>
        <p>${escapeHTML(message.text)}</p>
      </article>
    `;
  }

  function renderScheduleCard(shift) {
    if (!shift) return "";
    return `
      <article class="schedule-card">
        <div class="section-title">
          <h3>${escapeHTML(shift.group)}</h3>
          ${pill(shift.name)}
        </div>
        <p class="metric-value" style="font-size:1.45rem">${escapeHTML(shift.start)}-${escapeHTML(shift.end)}</p>
        <p class="subtle">${escapeHTML(shift.breakText)} · ${escapeHTML(shift.checkinRule)}</p>
      </article>
    `;
  }

  function metric(label, value, detail) {
    return `
      <article class="metric-card">
        <p class="metric-label">${escapeHTML(label)}</p>
        <p class="metric-value">${escapeHTML(String(value))}</p>
        <p class="metric-detail">${escapeHTML(detail)}</p>
      </article>
    `;
  }

  function pill(text) {
    return `<span class="pill">${escapeHTML(String(text))}</span>`;
  }

  function statusPill(text, tone) {
    return `<span class="status-pill ${tone || "neutral"}">${escapeHTML(String(text))}</span>`;
  }

  function priorityPill(priority) {
    return `<span class="priority-pill ${escapeHTML(priority)}">${escapeHTML(priorityLabels[priority] || priority)}</span>`;
  }

  function statusTone(status) {
    if (status === "approved" || status === "done" || status === "confirmed" || status === "resolved") return "good";
    if (status === "rejected" || status === "closed") return status === "closed" ? "good" : "bad";
    return "warn";
  }

  function emptyState() {
    return document.getElementById("emptyStateTemplate").innerHTML;
  }

  function departmentOptions() {
    return state.departments.map((dept) => option(dept.id, dept.name)).join("");
  }

  function employeeOptions(selectedId) {
    return state.employees.map((employee) => option(employee.id, `${employee.name} - ${departmentName(employee.department)}`, employee.id === selectedId)).join("");
  }

  function shiftOptions() {
    return state.shifts.map((shift) => option(shift.id, `${shift.group} / ${shift.name} (${shift.start}-${shift.end})`)).join("");
  }

  function option(value, text, selected) {
    return `<option value="${escapeAttr(value)}"${selected ? " selected" : ""}>${escapeHTML(text)}</option>`;
  }

  function updateLeaveStatus(id, status) {
    const request = state.leaveRequests.find((item) => item.id === id);
    if (!request) return;
    request.status = status;
    request.reviewer = "e-001";
    saveState();
    showToast(status === "approved" ? "Đã duyệt đơn." : "Đã từ chối đơn.", status !== "approved");
    render();
  }

  function updateRequestStatus(collection, id, status) {
    const request = state[collection]?.find((item) => item.id === id);
    if (!request) return;
    request.status = status;
    saveState();
    const message = status === "approved"
      ? "Đã duyệt."
      : status === "rejected"
        ? "Đã từ chối."
        : status === "done"
          ? "Đã đánh dấu hoàn tất."
          : status === "closed"
            ? "Đã đóng sự vụ."
            : "Đã cập nhật trạng thái.";
    showToast(message, status === "rejected");
    render();
  }

  function markAssetChecked(id) {
    const asset = state.assets.find((item) => item.id === id);
    if (!asset) return;
    asset.checkedAt = todayISO;
    if (asset.condition === "missing") asset.condition = "maintenance";
    saveState();
    showToast("Đã cập nhật ngày kiểm kê tài sản.");
    render();
  }

  function updateOnboardingProgress(employeeId, docId, status) {
    if (!employeeId || !docId) return;
    let progress = state.onboardingProgress.find((item) => item.employee === employeeId && item.doc === docId);
    if (!progress) {
      progress = { id: makeId("op"), employee: employeeId, doc: docId, status: "todo", completedAt: "" };
      state.onboardingProgress.push(progress);
    }
    progress.status = status;
    progress.completedAt = status === "done" ? todayISO : "";
    saveState();
    showToast(status === "done" ? "Đã đánh dấu hoàn thành tài liệu." : "Đã đánh dấu đang đọc.");
    render();
  }

  function adjustTaskProgress(id, delta) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    task.progress = clamp(Number(task.progress || 0) + delta, 0, 100);
    if (task.progress === 100) task.status = "done";
    if (task.progress > 0 && task.progress < 100 && task.status === "todo") task.status = "doing";
    saveState();
    render();
  }

  function exportAttendanceCSV() {
    const rows = [
      ["Nhan su", "Phong ban", "Loai", "Ca", "Thoi gian", "Khoang cach m", "Sai so m", "Trang thai"],
      ...filteredAttendance().map((record) => {
        const employee = employeeById(record.employee);
        const shift = shiftById(record.shift);
        return [
          employee?.name || "",
          departmentName(employee?.department),
          record.type,
          shift ? `${shift.name} ${shift.start}-${shift.end}` : "",
          formatDateTime(record.time),
          record.distance,
          record.accuracy,
          attendanceStatusLabel(record.status),
        ];
      }),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    downloadText(`attendance-${todayISO}.csv`, csv, "text/csv;charset=utf-8");
    showToast("Đã xuất file CSV chấm công.");
  }

  async function signInSupabase(email, password) {
    if (!supabaseClient) {
      showToast("Supabase client chưa sẵn sàng. Kiểm tra internet hoặc CDN supabase-js.", true);
      return;
    }
    cloudStatus = "syncing";
    cloudMessage = "Đang đăng nhập";
    render();
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      cloudStatus = "offline";
      cloudMessage = "Login lỗi";
      showToast(`Không đăng nhập được: ${error.message}`, true);
      render();
      return;
    }
    showToast("Đã đăng nhập Supabase.");
  }

  async function signOutSupabase() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    supabaseUser = null;
    supabaseProfile = null;
    cloudStatus = "offline";
    cloudMessage = "Đã đăng xuất";
    showToast("Đã đăng xuất Supabase.");
    render();
  }

  function simulateGasSync() {
    if (!state.settings.googleGasUrl) {
      showToast("Chưa có Google Apps Script URL. Khi chị có endpoint GAS, dán vào đây để đồng bộ Sheet.", true);
      return;
    }
    state.settings.gasLastSync = new Date().toISOString();
    saveState();
    showToast("Đã ghi nhận test sync GAS. Endpoint thật sẽ nhận payload khi mình bật Apps Script.");
    render();
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function showToast(message, isError) {
    document.querySelectorAll(".toast").forEach((toast) => toast.remove());
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " error" : ""}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3600);
  }

  function employeeById(id) {
    return state.employees.find((employee) => employee.id === id);
  }

  function onboardingStatus(employeeId, docId) {
    return state.onboardingProgress.find((item) => item.employee === employeeId && item.doc === docId)?.status || "todo";
  }

  function employeeSuggestionValue(employee) {
    return `${employee.name} - ${departmentName(employee.department)} - ${employee.role}`;
  }

  function resolveEmployeeInput(value) {
    const normalized = normalizeText(value);
    if (!normalized) return null;
    return (
      state.employees.find((employee) => normalizeText(employeeSuggestionValue(employee)) === normalized) ||
      state.employees.find((employee) => normalizeText(employee.name) === normalized) ||
      state.employees.find((employee) => smartMatch(`${employee.name} ${employee.role} ${departmentName(employee.department)}`, value))
    );
  }

  function shiftById(id) {
    return state.shifts.find((shift) => shift.id === id);
  }

  function uniformPackageFor(employee) {
    const text = normalizeText(`${employee?.department || ""} ${employee?.role || ""}`);
    return uniformCatalog.find((pack) => pack.matcher.some((needle) => text.includes(needle))) || uniformCatalog.find((pack) => pack.id === "default");
  }

  function departmentName(id) {
    return state.departments.find((dept) => dept.id === id)?.name || "Chưa phân phòng";
  }

  function attendanceStatusLabel(status) {
    if (status === "valid") return "Hợp lệ";
    if (status === "late") return "Đi muộn";
    if (status === "outside") return "Ngoài bán kính";
    return "Cần xác minh";
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatShortDate(value) {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDaysISO(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  function timeToMinutes(time) {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const radius = 6371000;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function normalizeText(value) {
    return String(Array.isArray(value) ? value.filter(Boolean).join(" ") : value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function smartMatch(haystack, query) {
    const normalizedHaystack = normalizeText(haystack);
    const terms = normalizeText(query).split(" ").filter(Boolean);
    if (!terms.length) return true;
    return terms.every((term) => normalizedHaystack.includes(term));
  }

  function countBy(items, key) {
    return items.reduce((acc, item) => {
      acc[item[key]] = (acc[item[key]] || 0) + 1;
      return acc;
    }, {});
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeById(savedItems, baseItems) {
    if (!Array.isArray(savedItems)) return baseItems;
    const ids = new Set(savedItems.map((item) => item.id));
    return [...savedItems, ...baseItems.filter((item) => !ids.has(item.id))];
  }

  function splitList(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(value) {
    return escapeHTML(value);
  }
})();
