import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function must(pattern, label) {
  if (!pattern.test(html)) throw new Error(`missing ${label}`);
}

test('dyeing docs support multiple process tasks under one sales order', () => {
  must(/function\s+ddTaskKey\s*\(/, 'ddTaskKey helper');
  must(/function\s+ddBaseOrdId\s*\(/, 'ddBaseOrdId helper');
  must(/function\s+getDDTasks\s*\(/, 'getDDTasks helper');
  must(/window\._ddActiveTaskKey/, 'active dyeing task key');
  must(/ddBaseOrdId\(x\.ordId\)===oid/, 'task lookup by base order id');
  must(/ordId:taskKey/, 'save config with task-specific ordId');
});

test('dyeing doc cloud sync uses ord_id conflict key', () => {
  must(/function\s+cloudConflictKey\s*\(/, 'cloud conflict helper');
  must(/\(key==='dd'\|\|key==='wd'\)\?'ord_id':'id'/, 'dyeing/weaving docs upsert conflict on ord_id');
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed++;
    console.log('PASS', t.name);
  } catch (err) {
    console.error('FAIL', t.name);
    console.error(' ', err.message);
  }
}

if (passed !== tests.length) {
  console.error(`Dyeing task guard failed: ${passed}/${tests.length}`);
  process.exit(1);
}

console.log(`Dyeing task guard passed: ${passed}/${tests.length}`);
