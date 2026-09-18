#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  'tools',
  'archive',
  'deploy'
]);

const ALLOWED_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.css', '.html', '.sql', '.sh', '.py', '.md'
]);

const markers = [];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.agents') continue;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        scanDir(path.join(dir, entry.name));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTS.has(ext)) {
        scanFile(path.join(dir, entry.name));
      }
    }
  }
}

function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const match = line.match(/(?:\/\/|#|<!--|\/\*)\s*ponytail:\s*(.*?)(?:-->|\*\/|$)/i);
      if (match) {
        const text = match[1].trim();
        const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
        // Check if ceiling and upgrade trigger are specified
        const hasTrigger = text.includes(',') || text.toLowerCase().includes('upgrade') || text.toLowerCase().includes('khi');
        markers.push({
          file: relPath,
          line: idx + 1,
          comment: text,
          hasTrigger
        });
      }
    });
  } catch (err) {
    // Ignore unreadable files
  }
}

console.log('🔍 Scanning Clinic Hub 5S codebase for ponytail: markers...\n');
scanDir(ROOT);

if (markers.length === 0) {
  console.log('✅ No ponytail: technical debt markers found. Clean ledger!');
} else {
  console.log(`📋 Found ${markers.length} ponytail: marker(s):\n`);
  console.log('| File:Line | Debt & Simplification | Status |');
  console.log('|---|---|---|');
  let noTriggerCount = 0;
  for (const m of markers) {
    const status = m.hasTrigger ? '✅ Tracked' : '⚠️ No upgrade trigger';
    if (!m.hasTrigger) noTriggerCount++;
    console.log(`| \`${m.file}:${m.line}\` | ${m.comment} | ${status} |`);
  }
  console.log(`\nSummary: ${markers.length} markers found, ${noTriggerCount} without an upgrade trigger.`);
}
