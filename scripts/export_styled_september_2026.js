import fs from 'fs';
import path from 'path';
import { exportLateCheckinWorkbook } from '../src/services/leave-export.js';
import { departmentName } from '../src/utils.js';

// 1. Lấy dữ liệu sạch nhất từ file đã nạp trực tiếp từ VPS PostgreSQL
console.log('Đang đọc dữ liệu từ scripts/vps_late_data.json...');
const rawJson = fs.readFileSync(path.join(process.cwd(), 'scripts/vps_late_data.json'), 'utf8');
const data = JSON.parse(rawJson);
const empMap = new Map((data.employees || []).map((e) => [String(e.code || e.id || '').toLowerCase(), e]));
const leaveReqs = data.leave_requests || [];
const totalDaysMap = data.work_days_count || {};

console.log(`Đã nạp: ${data.work_days?.length} lượt đi trễ Tháng 9, ${data.employees?.length} nhân sự.`);

const DAY_OF_WEEK = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

// 2. Map sang định dạng giàu thông tin cho exportLateCheckinWorkbook
const sortedWorkDays = (data.work_days || []).sort((a, b) => {
  if (a.work_date !== b.work_date) return a.work_date.localeCompare(b.work_date);
  return a.employee_code.localeCompare(b.employee_code);
});

const lateRows = sortedWorkDays.map((w, idx) => {
  const code = w.employee_code || '';
  const emp = empMap.get(code.toLowerCase()) || {};
  const branchId = w.branch_id || emp.branch_id || '';
  const branchName = branchId === 'pham-van-chieu'
    ? 'Nha Khoa 5S - Phạm Văn Chiêu'
    : (branchId === 'le-van-tho' ? 'Nha Khoa 5S - Lê Văn Thọ' : branchId);

  // Tìm đơn xin đi trễ phù hợp (ưu tiên Đơn xin đi trễ, loại bỏ đơn tăng ca / ứng lương)
  const matchedReq = leaveReqs.find(
    (r) =>
      String(r.employee_code || '').toLowerCase() === code.toLowerCase() &&
      r.from_date <= w.work_date &&
      w.work_date <= (r.to_date || r.from_date) &&
      (String(r.request_type || '').toLowerCase().includes('trễ') ||
       String(r.request_type || '').toLowerCase().includes('muộn') ||
       String(r.request_type || '').toLowerCase().includes('bổ sung') ||
       String(r.reason || '').toLowerCase().includes('trễ') ||
       String(r.reason || '').toLowerCase().includes('kẹt xe') ||
       String(r.reason || '').toLowerCase().includes('lủng bánh') ||
       String(r.reason || '').toLowerCase().includes('quên'))
  );

  const late5sMin = Number(w.late_checkin_minutes || 0);
  const lateShiftMin = Number(w.late_minutes || 0);

  let statusText = 'Trễ không phép';
  let leaveRequest = '—';
  let hasApprovedLeave = false;

  if (matchedReq) {
    leaveRequest = matchedReq.reason ? matchedReq.reason.trim().replace(/\r?\n/g, ' ') : (matchedReq.request_type || 'Đơn xin đi trễ');
    if (matchedReq.status === 'approved') {
      statusText = 'Đã duyệt đơn (Miễn phạt)';
      hasApprovedLeave = true;
    } else if (matchedReq.status === 'pending') {
      statusText = 'Chờ duyệt đơn';
    } else if (matchedReq.status === 'rejected') {
      statusText = 'Từ chối đơn';
    }
  } else if (lateShiftMin === 0 && late5sMin <= 5) {
    statusText = 'Trễ 5S nhẹ (<5p)';
  } else if (lateShiftMin > 0) {
    statusText = `Trễ vào ca (${lateShiftMin}p)`;
  }

  // Giờ check-in format UTC+7
  let checkinDisplay = '—';
  if (w.checkin_at) {
    try {
      const d = new Date(w.checkin_at);
      if (!isNaN(d.getTime())) {
        checkinDisplay = d.toLocaleTimeString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      } else {
        checkinDisplay = String(w.checkin_at);
      }
    } catch {
      checkinDisplay = String(w.checkin_at);
    }
  }

  const parts = String(w.work_date || '').split('-');
  const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : w.work_date;

  let dayOfWeek = '—';
  try {
    const dObj = new Date(w.work_date);
    if (!isNaN(dObj.getTime())) dayOfWeek = DAY_OF_WEEK[dObj.getDay()];
  } catch {}

  let note = '';
  if (hasApprovedLeave) {
    note = `Đã duyệt đơn (${leaveRequest})`;
  } else if (lateShiftMin > 0) {
    note = `Vào trễ sau giờ bắt đầu ca ${lateShiftMin} phút (Chưa có đơn)`;
  } else {
    note = `Check-in sau mốc 5S quy định ${late5sMin} phút (Trước giờ ca)`;
  }

  return {
    stt: idx + 1,
    empCode: code,
    empName: emp.full_name || emp.name || code,
    deptName: departmentName(emp.department),
    branchName,
    empRole: emp.role || '—',
    dayOfWeek,
    workDate: formattedDate,
    rawDate: w.work_date,
    shiftName: w.shift_name || w.shift_code || '—',
    requiredCheckin: w.required_checkin_time ? `${w.required_checkin_time} (Trước 5p)` : '—',
    actualCheckin: checkinDisplay,
    lateMinutes: late5sMin,
    shiftLateMinutes: lateShiftMin,
    leaveRequest,
    hasApprovedLeave,
    statusText,
    note,
    totalShifts: totalDaysMap[code] || 0,
  };
});

// 3. Tạo Workbook OpenXML 5 Sheet có màu sắc nhận diện 5S đẳng cấp
console.log('Đang xuất file OpenXML 5 Sheet chuẩn nhận diện thương hiệu 5S...');
const zipBytes = await exportLateCheckinWorkbook({
  lateCheckins: lateRows,
  employees: data.employees,
  filterSummary: 'Tháng 09/2026 — Toàn viện 2 Chi nhánh (Quy chuẩn check-in trước 5 phút)',
  filename: 'Danh_Sach_Checkin_Tre_5S_Thang_09_2026.xlsx',
  month: '2026-09',
});

// 4. Lưu ra các đường dẫn máy tính
const artifactDir = path.resolve('C:/Users/admin/.gemini/antigravity/brain/dcf78339-43a3-48b8-b164-f17315368818');
const artifactFile = path.join(artifactDir, 'Danh_Sach_Checkin_Tre_5S_Thang_09_2026.xlsx');
const localFile = path.resolve('Danh_Sach_Checkin_Tre_5S_Thang_09_2026.xlsx');
const downloadsFile = path.resolve('C:/Users/admin/Downloads/Danh_Sach_Checkin_Tre_5S_Thang_09_2026.xlsx');
const desktopFile = path.resolve('C:/Users/admin/Desktop/Danh_Sach_Checkin_Tre_5S_Thang_09_2026.xlsx');

const buffer = Buffer.from(zipBytes);
fs.writeFileSync(artifactFile, buffer);
fs.writeFileSync(localFile, buffer);
try { fs.writeFileSync(downloadsFile, buffer); } catch {}
try { fs.writeFileSync(desktopFile, buffer); } catch {}

console.log('✅ ĐÃ TẠO THÀNH CÔNG FILE OPENXML 5 SHEET DẠNG ĐẸP CHUẨN 5S:');
console.log('1. Artifact:', artifactFile, `(${buffer.length} bytes)`);
console.log('2. Downloads:', downloadsFile);
console.log('3. Desktop:', desktopFile);
console.log('4. Local:', localFile);
