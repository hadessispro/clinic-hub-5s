const PROP = PropertiesService.getScriptProperties();
const ATTENDANCE_HEADERS = ['Ngày','Mã nhân viên','Họ và tên','Giờ vào','Giờ ra','Ca làm việc','Giờ công','Ngày công','Offline'];
const REQUEST_HEADERS = ['Ngày tạo','Mã nhân viên','Họ và tên','Loại đơn','Từ ngày','Đến ngày','Bắt đầu','Kết thúc','Phút tăng ca','Số tiền','Trạng thái','Trưởng BP','Tổng vận hành','Lý do'];
const SHIFT_WORK_HOURS = {
  'front-office': 8.5,
  'front-morning': 9.5,
  'front-afternoon': 9.5,
  'front-full': 11.5,
  'doctor-office': 8,
  'doctor-morning': 9,
  'doctor-afternoon': 9,
  'doctor-full': 11,
  'security-weekday': 13,
  'security-sunday': 10,
  'cleaning-weekday': 9,
  'cleaning-sunday': 8,
  'clinic-0800': 8
};

function setupClinicHub() {
  const ss = SpreadsheetApp.getActive();
  const attendance = ensureAttendanceSheet_(ss);
  const requests = ensureSheet_(ss, 'DonTu', REQUEST_HEADERS);
  let dashboard = ss.getSheetByName('TongQuan');
  if (!dashboard) dashboard = ss.insertSheet('TongQuan');
  dashboard.clear();
  dashboard.getRange('A1:F1').merge().setValue('PHÂN TÍCH CHẤM CÔNG & ĐƠN TỪ 5S').setFontSize(16).setFontWeight('bold').setBackground('#0f766e').setFontColor('#ffffff').setHorizontalAlignment('center');
  dashboard.getRange('A3:B7').setValues([
    ['Chỉ số','Giá trị'],
    ['Ngày công đã ghi','=SUM(ChamCong!H:H)'],
    ['Tổng giờ công','=SUM(ChamCong!G:G)'],
    ['Ca chưa đủ dữ liệu','=COUNTIFS(ChamCong!D:D;"<>";ChamCong!E:E;"")'],
    ['Chưa checkout','=COUNTIFS(ChamCong!A:A;"<>";ChamCong!E:E;"")']
  ]);
  dashboard.getRange('D3:E7').setValues([
    ['Tình trạng đơn','Số lượng'],
    ['Chờ Trưởng BP','=COUNTIFS(DonTu!L:L;"pending";DonTu!K:K;"pending")'],
    ['Chờ Tổng vận hành','=COUNTIFS(DonTu!L:L;"approved";DonTu!M:M;"pending")'],
    ['Đã duyệt','=COUNTIF(DonTu!K:K;"approved")'],
    ['Từ chối','=COUNTIF(DonTu!K:K;"rejected")']
  ]);
  dashboard.getRange('A3:B3').setBackground('#d1fae5').setFontWeight('bold');
  dashboard.getRange('D3:E3').setBackground('#dbeafe').setFontWeight('bold');
  dashboard.setFrozenRows(1); dashboard.autoResizeColumns(1,6);
  [attendance, requests].forEach(s => { s.setFrozenRows(1); s.getRange(1,1,1,s.getLastColumn()).setBackground('#164e63').setFontColor('#fff').setFontWeight('bold'); s.autoResizeColumns(1,s.getLastColumn()); });
  rebuildAttendanceWorktime();
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
  const secret = e.parameter.secret || '';
  if (!PROP.getProperty('SYNC_SECRET') || secret !== PROP.getProperty('SYNC_SECRET')) return ContentService.createTextOutput('unauthorized');
  const item = JSON.parse(e.postData.contents); const p = item.payload || {};
  const isAttendance = item.type === 'attendance';
  const sheet = SpreadsheetApp.getActive().getSheetByName(isAttendance ? 'ChamCong' : 'DonTu');
  if (!sheet) setupClinicHub();
  const target = SpreadsheetApp.getActive().getSheetByName(isAttendance ? 'ChamCong' : 'DonTu');
  const key = isAttendance ? `attendance-day:${p.work_date}:${p.employee_code}` : `${item.type}:${item.id}`;
  if (isAttendance) upsertAttendance_(target,key,p);
  else upsert_(target,key,[p.created_at,p.employee_code,p.employee_name || '',p.request_type,p.from_date,p.to_date,p.request_start_time,p.request_end_time,p.overtime_minutes,p.amount,p.status,p.leader_status,p.operations_status,p.reason]);
  return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.getRange(1,1,1,headers.length).setValues([headers]); return sheet;
}

function ensureAttendanceSheet_(ss) {
  const sheet = ss.getSheetByName('ChamCong') || ss.insertSheet('ChamCong');
  migrateAttendanceSchema_(sheet);
  sheet.getRange(1, 1, 1, ATTENDANCE_HEADERS.length).setValues([ATTENDANCE_HEADERS]);
  return sheet;
}

function migrateAttendanceSchema_(sheet) {
  if (sheet.getMaxColumns() < 10) sheet.insertColumnsAfter(sheet.getMaxColumns(), 10 - sheet.getMaxColumns());
  const headers = sheet.getRange(1, 1, 1, Math.max(10, sheet.getLastColumn())).getDisplayValues()[0];
  const hasWorkday = headers.some(value => normalizeText_(value) === 'ngay cong');
  const oldOfflineAtH = normalizeText_(headers[7]) === 'offline';
  if (!hasWorkday && oldOfflineAtH) sheet.insertColumnAfter(7);
  sheet.getRange(1, 1, 1, ATTENDANCE_HEADERS.length).setValues([ATTENDANCE_HEADERS]);
}

function upsert_(sheet,key,row) {
  const keyColumn = REQUEST_HEADERS.length + 1;
  const lastRow = sheet.getLastRow();
  const keys = lastRow > 1 ? sheet.getRange(2,keyColumn,lastRow-1,1).getDisplayValues().flat() : [];
  const foundIndex = keys.indexOf(key);
  if (foundIndex >= 0) {
    sheet.getRange(foundIndex + 2,1,1,row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
    sheet.getRange(sheet.getLastRow(),keyColumn).setValue(key);
    sheet.hideColumns(keyColumn);
  }
}

function resetDonTuForResync() {
  const sheet = SpreadsheetApp.getActive().getSheetByName('DonTu');
  if (sheet && sheet.getLastRow() > 1) sheet.getRange(2,1,sheet.getLastRow()-1,Math.max(sheet.getLastColumn(),REQUEST_HEADERS.length+1)).clearContent();
}

function upsertAttendance_(sheet,key,p) {
  migrateAttendanceSchema_(sheet);
  const keyColumn=ATTENDANCE_HEADERS.length+1;
  const lastRow=sheet.getLastRow();
  const keys=lastRow>1?sheet.getRange(2,keyColumn,lastRow-1,1).getDisplayValues().flat():[];
  let rowNumber=keys.indexOf(key)+2;
  if(rowNumber<2){
    const rows=lastRow>1?sheet.getRange(2,1,lastRow-1,2).getDisplayValues():[];
    const legacyIndex=rows.findIndex(row=>String(row[0])===String(p.work_date)&&String(row[1])===String(p.employee_code));
    rowNumber=legacyIndex>=0?legacyIndex+2:0;
  }
  if(!rowNumber){
    sheet.appendRow([p.work_date,p.employee_code,p.employee_name||'','','',shiftName_(p.shift_code),0,0,p.captured_offline?'Có':'Không']);
    rowNumber=sheet.getLastRow();
  }
  sheet.getRange(rowNumber,keyColumn).setValue(key);
  sheet.hideColumns(keyColumn);
  const row=sheet.getRange(rowNumber,1,1,ATTENDANCE_HEADERS.length).getValues()[0];
  const checkinAt=p.checkin_at||(p.record_type==='checkin'?p.recorded_at:'');
  const checkoutAt=p.checkout_at||(p.record_type==='checkout'?p.recorded_at:'');
  if(checkinAt) row[3]=Utilities.formatDate(new Date(checkinAt),'Asia/Ho_Chi_Minh','HH:mm:ss');
  if(checkoutAt) row[4]=Utilities.formatDate(new Date(checkoutAt),'Asia/Ho_Chi_Minh','HH:mm:ss');
  row[0]=p.work_date;
  row[1]=p.employee_code;
  row[2]=p.employee_name||row[2];
  row[5]=shiftName_(p.shift_code);
  if(p.captured_offline) row[8]='Có';
  const credit=calculateWorkCredit_(p.shift_code,row[5],row[3],row[4]);
  row[6]=credit.hours;
  row[7]=credit.days;
  sheet.getRange(rowNumber,1,1,row.length).setValues([row]);
  sheet.getRange(rowNumber,7).setFormula(`=IF(OR(D${rowNumber}="";E${rowNumber}="");0;CLINIC_WORK_CREDIT(D${rowNumber};E${rowNumber};F${rowNumber};"hours"))`);
  sheet.getRange(rowNumber,8).setFormula(`=IF(OR(D${rowNumber}="";E${rowNumber}="");0;CLINIC_WORK_CREDIT(D${rowNumber};E${rowNumber};F${rowNumber};"days"))`);
  sheet.getRange(rowNumber,4,1,2).setNumberFormat('HH:mm:ss');
  sheet.getRange(rowNumber,7,1,2).setNumberFormat('0.##');
  SpreadsheetApp.flush();
}

function rebuildAttendanceWorktime() {
  const ss=SpreadsheetApp.getActive();
  const sheet=ensureAttendanceSheet_(ss);
  deduplicateAttendanceDays_(sheet);
  const lastRow=sheet.getLastRow();
  if(lastRow<2)return;
  sheet.getRange(2,7,lastRow-1,1).setFormulaR1C1('=IF(OR(RC[-3]="";RC[-2]="");0;CLINIC_WORK_CREDIT(RC[-3];RC[-2];RC[-1];"hours"))');
  sheet.getRange(2,8,lastRow-1,1).setFormulaR1C1('=IF(OR(RC[-4]="";RC[-3]="");0;CLINIC_WORK_CREDIT(RC[-4];RC[-3];RC[-2];"days"))');
  sheet.getRange(2,4,lastRow-1,2).setNumberFormat('HH:mm:ss');
  sheet.getRange(2,7,lastRow-1,2).setNumberFormat('0.##');
  SpreadsheetApp.flush();
}

function repairAttendanceSheet() {
  rebuildAttendanceWorktime();
}

function deduplicateAttendanceDays_(sheet) {
  const lastRow=sheet.getLastRow();
  if(lastRow<2)return;
  const keyColumn=ATTENDANCE_HEADERS.length+1;
  const rows=sheet.getRange(2,1,lastRow-1,keyColumn).getValues();
  const merged=new Map();
  rows.forEach(row=>{
    const workDate=String(row[0]||'').trim();
    const employeeCode=String(row[1]||'').trim();
    if(!workDate||!employeeCode)return;
    const key=`attendance-day:${workDate}:${employeeCode}`;
    const existing=merged.get(key);
    if(!existing){
      const copy=row.slice(0,keyColumn);
      copy[keyColumn-1]=key;
      merged.set(key,copy);
      return;
    }
    if(!existing[2]&&row[2])existing[2]=row[2];
    if(row[3]&&(!existing[3]||String(row[3])<String(existing[3])))existing[3]=row[3];
    if(row[4]&&(!existing[4]||String(row[4])>String(existing[4])))existing[4]=row[4];
    if(!existing[5]&&row[5])existing[5]=row[5];
    if(normalizeText_(row[8])==='co')existing[8]='Có';
  });
  const output=[...merged.values()];
  sheet.getRange(2,1,lastRow-1,keyColumn).clearContent();
  if(output.length)sheet.getRange(2,1,output.length,keyColumn).setValues(output);
  sheet.hideColumns(keyColumn);
}

function workHoursForShift_(code,label) {
  if(code&&Object.prototype.hasOwnProperty.call(SHIFT_WORK_HOURS,code))return SHIFT_WORK_HOURS[code];
  const text=normalizeText_(label);
  const isDoctor=text.includes('bac si');
  if(text.includes('07:30')&&text.includes('17:00'))return 8.5;
  if(text.includes('07:30')&&text.includes('18:00'))return 9.5;
  if(text.includes('09:30')&&text.includes('20:00'))return 9.5;
  if(text.includes('07:30')&&text.includes('20:00'))return 11.5;
  if(isDoctor&&text.includes('08:00')&&text.includes('17:00'))return 8;
  if(isDoctor&&text.includes('08:00')&&text.includes('18:00'))return 9;
  if(isDoctor&&text.includes('10:00')&&text.includes('20:00'))return 9;
  if(isDoctor&&text.includes('08:00')&&text.includes('20:00'))return 11;
  if(text.includes('bao ve')&&text.includes('07:00')&&text.includes('20:00'))return 13;
  if(text.includes('bao ve')&&text.includes('07:00')&&text.includes('17:00'))return 10;
  if((text.includes('tap vu')||text.includes('lao cong'))&&text.includes('06:00')&&text.includes('16:00'))return 9;
  if((text.includes('tap vu')||text.includes('lao cong'))&&text.includes('06:00')&&text.includes('15:00'))return 8;
  if(text.includes('08:00')&&text.includes('17:00'))return 8;
  return 0;
}

function calculateWorkCredit_(code,label,checkin,checkout) {
  if(!String(checkin||'').trim()||!String(checkout||'').trim())return {hours:0,days:0};
  const standard=workHoursForShift_(code,label);
  if(!standard)return {hours:0,days:0};
  return {hours:standard,days:1};
}

function CLINIC_WORK_CREDIT(checkin,checkout,label,mode) {
  const credit=calculateWorkCredit_('',label,checkin,checkout);
  return String(mode||'hours').toLowerCase()==='days'?credit.days:credit.hours;
}

function minutesFromTime_(value) {
  const parts=String(value||'').trim().split(':').map(Number);
  if(parts.length<2||parts.some(value=>!Number.isFinite(value)))return NaN;
  return parts[0]*60+parts[1]+(parts[2]||0)/60;
}

function normalizeText_(value) {
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().trim();
}

function shiftName_(code) {
  const names={
    'doctor-afternoon':'Ca bác sĩ 10:00–20:00',
    'doctor-office':'Ca bác sĩ 08:00–17:00',
    'doctor-morning':'Ca bác sĩ 08:00–18:00',
    'doctor-full':'Ca bác sĩ 08:00–20:00',
    'front-afternoon':'Ca chiều 09:30–20:00',
    'front-office':'Ca hành chính 07:30–17:00',
    'front-morning':'Ca sáng 07:30–18:00',
    'front-full':'Ca toàn ngày 07:30–20:00',
    'security-weekday':'Ca bảo vệ 07:00–20:00',
    'security-sunday':'Ca bảo vệ Chủ nhật 07:00–17:00',
    'cleaning-weekday':'Ca tạp vụ 06:00–16:00',
    'cleaning-sunday':'Ca tạp vụ Chủ nhật 06:00–15:00',
    'clinic-0800':'Ca 08:00–17:00'
  };
  return names[code]||code||'';
}
