import fs from 'fs';
import path from 'path';

const sqlPath = path.join(process.cwd(), 'sqlpgnhakhoa5s', 'nckynhfqhosting_pgnhakhoa5s.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

function extractTableRows(sql, tableName) {
  const pattern = new RegExp(`INSERT INTO \\\`${tableName}\\\` \\(([^)]+)\\) VALUES([\\s\\S]*?);`, 'gi');
  let match;
  const allRows = [];

  while ((match = pattern.exec(sql)) !== null) {
    const colNames = match[1].split(',').map(c => c.trim().replace(/[`"]/g, ''));
    const valuesChunk = match[2];
    const tuples = parseTuples(valuesChunk);
    
    tuples.forEach(tuple => {
      const rowObj = {};
      colNames.forEach((col, idx) => {
        rowObj[col] = tuple[idx] !== undefined ? tuple[idx] : null;
      });
      allRows.push(rowObj);
    });
  }

  return allRows;
}

function parseTuples(str) {
  const tuples = [];
  let currentTuple = [];
  let currentVal = '';
  let inString = false;
  let stringChar = '';
  let escapeNext = false;
  let tupleStarted = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (escapeNext) {
      currentVal += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if ((char === "'" || char === '"') && (!inString || stringChar === char)) {
      if (inString && str[i + 1] === char) {
        currentVal += char;
        i++;
        continue;
      }
      inString = !inString;
      stringChar = inString ? char : '';
      continue;
    }

    if (!inString) {
      if (char === '(' && !tupleStarted) {
        tupleStarted = true;
        currentTuple = [];
        currentVal = '';
        continue;
      }
      if (char === ')' && tupleStarted) {
        currentTuple.push(cleanVal(currentVal));
        tuples.push(currentTuple);
        tupleStarted = false;
        currentVal = '';
        continue;
      }
      if (char === ',' && tupleStarted) {
        currentTuple.push(cleanVal(currentVal));
        currentVal = '';
        continue;
      }
    }

    if (tupleStarted) {
      currentVal += char;
    }
  }

  return tuples;
}

function cleanVal(v) {
  v = v.trim();
  if (v.toUpperCase() === 'NULL') return null;
  return v;
}

console.log('Extracting 39urY3_fspg_pg_staff...');
const pgStaff = extractTableRows(sqlContent, '39urY3_fspg_pg_staff');
console.log(`Extracted ${pgStaff.length} PG staff rows.`);

console.log('Extracting 39urY3_fspg_customers...');
const customers = extractTableRows(sqlContent, '39urY3_fspg_customers');
console.log(`Extracted ${customers.length} Customer rows.`);

const outputPath = path.join(process.cwd(), 'src', 'data', 'seed-pg-customers.js');
const fileContent = `/**
 * Official PG Staff & Customer Personas imported directly from sqlpgnhakhoa5s database dump.
 * Total Customers: ${customers.length}
 * Total PG Staff: ${pgStaff.length}
 */

export const SEED_PG_STAFF = ${JSON.stringify(pgStaff, null, 2)};

export const SEED_PG_CUSTOMERS = ${JSON.stringify(customers, null, 2)};
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, fileContent, 'utf8');
console.log(`Saved datasets to ${outputPath}`);
