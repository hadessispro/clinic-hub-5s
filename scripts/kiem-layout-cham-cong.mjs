import { readFile } from 'node:fs/promises';

const [html, appCss, attendanceCss] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('app.css', 'utf8'),
  readFile('public/attendance-layout.css', 'utf8'),
]);

const failures = [];
const appCssPosition = html.indexOf('href="app.css"');
const attendanceCssPosition = html.indexOf('href="/attendance-layout.css"');

if (appCssPosition < 0 || attendanceCssPosition < 0) {
  failures.push('index.html phải nạp cả app.css và /attendance-layout.css.');
} else if (attendanceCssPosition < appCssPosition) {
  failures.push('attendance-layout.css phải được nạp sau app.css.');
}

if (!attendanceCss.includes('.attendance-admin-workspace')) {
  failures.push('attendance-layout.css thiếu namespace .attendance-admin-workspace.');
}

if (!/\.attendance-page\s+\.attendance-work-summary-line b[\s\S]*?text-overflow:\s*clip/.test(attendanceCss)) {
  failures.push('Giá trị tổng công phải dùng text-overflow: clip để không hiện dấu ba chấm.');
}

// Remove comments before checking so the documented legacy block may remain
// visible to git blame without being treated as active CSS.
const activeAppCss = appCss.replace(/\/\*[\s\S]*?\*\//g, '');
if (/\.attendance-admin-workspace\b/.test(activeAppCss)) {
  failures.push('Không khai báo layout quản trị chấm công trong app.css; hãy sửa public/attendance-layout.css.');
}

if (failures.length) {
  for (const failure of failures) console.error(`LOI · ${failure}`);
  process.exit(1);
}

console.log('OK · Layout chấm công có một nguồn CSS chính thức và đúng thứ tự tải.');
