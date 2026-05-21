import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const mainSchemaPath = path.join(root, 'supabase-schema.sql');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function lines(text) {
  return text.split(/\r?\n/);
}

function extractTableMap(indexHtml) {
  const match = indexHtml.match(/var\s+TABLE_MAP\s*=\s*\{([\s\S]*?)\};/);
  if (!match) throw new Error('TABLE_MAP not found in index.html');

  const map = {};
  const re = /([A-Za-z0-9_]+)\s*:\s*['"]([^'"]+)['"]/g;
  let item;
  while ((item = re.exec(match[1]))) {
    map[item[1]] = item[2];
  }
  return map;
}

function extractCreateTables(sqlText) {
  const names = new Set();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s*\(/gi;
  let item;
  while ((item = re.exec(sqlText))) names.add(item[1]);
  return names;
}

function readExtraSqlTables() {
  const result = new Map();
  for (const entry of fs.readdirSync(root)) {
    if (!entry.endsWith('.sql') || entry === 'supabase-schema.sql') continue;
    const filePath = path.join(root, entry);
    const tables = extractCreateTables(read(filePath));
    for (const table of tables) {
      if (!result.has(table)) result.set(table, []);
      result.get(table).push(entry);
    }
  }
  return result;
}

function findRiskyDeletePatterns(indexHtml) {
  const findings = [];
  const patterns = [
    /DB\.[A-Za-z0-9_]+\s*=\s*\(?DB\.[A-Za-z0-9_]+[^;]*\.filter\s*\(/,
    /DB\.[A-Za-z0-9_]+\s*=\s*\([^)]*DB\.[A-Za-z0-9_]+[^;]*\.filter\s*\(/,
    /DB\.save\([^,]+,\s*[^;]*\.filter\s*\(/,
  ];

  lines(indexHtml).forEach((line, index) => {
    if (patterns.some((pattern) => pattern.test(line))) {
      if (line.indexOf('DB.remove(') >= 0) return; // 统一删除方法，安全
      findings.push({
        line: index + 1,
        text: line.trim().slice(0, 220),
      });
    }
  });

  return findings;
}

function printSection(title, items) {
  console.log(`\n${title}`);
  if (!items.length) {
    console.log('  none');
    return;
  }
  for (const item of items) console.log(`  - ${item}`);
}

const indexHtml = read(indexPath);
const mainSchema = read(mainSchemaPath);
const tableMap = extractTableMap(indexHtml);
const mainTables = extractCreateTables(mainSchema);
const extraTables = readExtraSqlTables();

const errors = [];
const warnings = [];

for (const [key, table] of Object.entries(tableMap)) {
  if (mainTables.has(table)) continue;
  if (extraTables.has(table)) {
    warnings.push(`TABLE_MAP ${key}:${table} is only defined outside supabase-schema.sql in ${extraTables.get(table).join(', ')}`);
  } else {
    errors.push(`TABLE_MAP ${key}:${table} is missing from supabase-schema.sql and extra SQL files`);
  }
}

const riskyDeletes = findRiskyDeletePatterns(indexHtml);
for (const finding of riskyDeletes) {
  warnings.push(`raw local delete pattern at index.html:${finding.line}: ${finding.text}`);
}

console.log('ERP data audit');
console.log(`TABLE_MAP entries: ${Object.keys(tableMap).length}`);
console.log(`Main schema tables: ${mainTables.size}`);

printSection('Errors', errors);
printSection('Warnings', warnings);

if (errors.length) {
  console.error(`\nData audit failed with ${errors.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log('\nData audit passed with no blocking errors.');
}
