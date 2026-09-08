import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const [hubLogo, financeLogo, html, login, deploy] = await Promise.all([
  readFile('public/images/app-icon-192.png'),
  readFile('apps/finance/public/logo-5s.png'),
  readFile('index.html', 'utf8'),
  readFile('src/components/login.js', 'utf8'),
  readFile('scripts/deploy.sh', 'utf8'),
]);

const digest = (value) => createHash('sha256').update(value).digest('hex');
const failures = [];
const brandedLogo = '/images/app-icon-192.png?v=5s-star-20260908';

if (digest(hubLogo) !== digest(financeLogo)) {
  failures.push('Logo Clinic Hub phải đúng cùng asset ngôi sao 5S của hệ thống két tiền.');
}
if (!html.includes(brandedLogo)) failures.push('Sidebar chưa dùng URL logo 5S có phiên bản cache.');
if (!login.includes(brandedLogo)) failures.push('Màn đăng nhập chưa dùng URL logo 5S có phiên bản cache.');
if (!deploy.includes('"public/**/*|web"')) {
  failures.push('deploy.sh phải triển khai file nằm trong public/images và các thư mục public con.');
}

if (failures.length) {
  for (const failure of failures) console.error(`LOI · ${failure}`);
  process.exit(1);
}

console.log(`OK · Clinic Hub dùng đúng logo 5S (${digest(hubLogo).slice(0, 12)}) và deploy được asset lồng thư mục.`);
