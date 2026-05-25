import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const mainSchemaPath = path.join(root, 'supabase-schema.sql');
const syncFixPath = path.join(root, 'supabase-sync-fix-2026-05-25.sql');

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

function extractCreateTableColumns(sqlText) {
  const result = new Map();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s*\(([\s\S]*?)\);/gi;
  let item;
  while ((item = re.exec(sqlText))) {
    const table = item[1];
    const body = item[2];
    const columns = new Set();
    for (const rawLine of lines(body)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('--')) continue;
      const match = line.match(/^"?([A-Za-z0-9_]+)"?\s+/);
      if (!match) continue;
      const col = match[1].toLowerCase();
      if (['primary', 'unique', 'constraint', 'foreign', 'check'].includes(col)) continue;
      columns.add(col);
    }
    result.set(table, columns);
  }
  return result;
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
const syncFixSql = fs.existsSync(syncFixPath) ? read(syncFixPath) : '';
const tableMap = extractTableMap(indexHtml);
const mainTables = extractCreateTables(mainSchema);
const mainColumns = extractCreateTableColumns(mainSchema);
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

const requiredColumns = {
  fg_ins: ['color_code', 'wv_fac', 'roll_count', 'status', 'void_reason', 'voided_at'],
  fg_rolls: ['fab', 'color_code', 'wv_fac', 'resolved_at', 'grade', 'returned', 'ret_id', 'repair_note', 'void_reason', 'voided_at'],
  fg_outs: ['cust_ord_no', 'cust_no', 'approx_m', 'fee_nm', 'fee_amt', 'is_quick', 'fab', 'clr', 'color_nm', 'lot', 'width', 'gsm', 'pr_unit', 'unit_pr', 'pcs_data'],
  fg_returns: ['resolved_at', 'repair_note', 'deduct_kg'],
  ar_records: ['ret_ids', 'ship_fee_total', 'return_total'],
};

for (const [table, cols] of Object.entries(requiredColumns)) {
  const known = mainColumns.get(table) || new Set();
  for (const col of cols) {
    if (!known.has(col)) {
      errors.push(`schema table ${table} is missing required column ${col}`);
    }
    const alterPattern = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}[\\s\\S]*?ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\b`, 'i');
    if (!alterPattern.test(syncFixSql)) {
      errors.push(`supabase-sync-fix-2026-05-25.sql must add missing column ${table}.${col}`);
    }
  }
}

if (!/GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+authenticated\s*;/i.test(mainSchema)) {
  errors.push('supabase-schema.sql must grant table privileges to authenticated');
}

if (!/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.fg_returns\s*\(/i.test(syncFixSql)) {
  errors.push('supabase-sync-fix-2026-05-25.sql must create missing fg_returns before altering it');
}

if (!/NOTIFY\s+pgrst\s*,\s*'reload schema'\s*;/i.test(syncFixSql)) {
  errors.push('supabase-sync-fix-2026-05-25.sql must reload the PostgREST schema cache');
}

for (const table of ['weaving_docs', 'dyeing_docs']) {
  const seqPattern = new RegExp(`CREATE\\s+SEQUENCE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${table}_id_seq`, 'i');
  const defaultPattern = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ALTER\\s+COLUMN\\s+id\\s+SET\\s+DEFAULT\\s+nextval`, 'i');
  if (!seqPattern.test(syncFixSql) || !defaultPattern.test(syncFixSql)) {
    errors.push(`supabase-sync-fix-2026-05-25.sql must repair ${table}.id auto numbering`);
  }
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
