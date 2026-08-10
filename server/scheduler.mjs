const apiBaseUrl = process.env.INTERNAL_API_URL || 'http://api:3000';
const cronSecret = process.env.CRON_SECRET || '';
let lastSheetSyncDate = '';

function bangkokParts(date = new Date()) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(values.map(({ type, value }) => [type, value]));
}

async function runSheetSync() {
  if (!cronSecret) {
    console.error('CRON_SECRET is missing; scheduled Sheet sync is disabled.');
    return;
  }
  const response = await fetch(`${apiBaseUrl}/api/sheet-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Sheet sync ${response.status}: ${body.slice(0, 500)}`);
  console.log(`Sheet sync completed: ${body.slice(0, 500)}`);
}

async function tick() {
  const parts = bangkokParts();
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.hour !== '01' || Number(parts.minute) > 4 || lastSheetSyncDate === dateKey) return;
  lastSheetSyncDate = dateKey;
  try {
    await runSheetSync();
  } catch (error) {
    lastSheetSyncDate = '';
    console.error(String(error?.message || error));
  }
}

console.log('Clinic Hub scheduler started (Asia/Bangkok, Sheet sync at 01:00).');
await tick();
setInterval(tick, 60_000);
