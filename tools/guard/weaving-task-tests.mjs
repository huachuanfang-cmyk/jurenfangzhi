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

function mustText(text, label) {
  if (!html.includes(text)) throw new Error(`missing ${label}`);
}

test('weaving docs support multiple sub-docs under one sales order', () => {
  must(/function\s+wdTaskKey\s*\(/, 'wdTaskKey helper');
  must(/function\s+wdBaseOrdId\s*\(/, 'wdBaseOrdId helper');
  must(/function\s+getWDTasks\s*\(/, 'getWDTasks helper');
  must(/window\._wdActiveTaskKey/, 'active weaving task key');
  must(/wdBaseOrdId\(x\.ordId\)===oid/, 'task lookup by base order id');
  must(/ordId:taskKey/, 'save config with task-specific ordId');
  mustText('+ 新增织厂单', 'add weaving sub-doc button');
});

test('weaving docs can be issued and locked until explicitly unlocked', () => {
  must(/status:\(existing&&existing\.status\)\|\|'draft'/, 'default draft status preserves existing status');
  must(/function\s+issueWDcfg\s*\(/, 'issue weaving doc helper');
  must(/status='issued'/, 'issued status assignment');
  must(/issuedAt=new Date\(\)\.toISOString\(\)/, 'issued timestamp');
  must(/function\s+unlockWDcfg\s*\(/, 'unlock weaving doc helper');
  must(/unlockReason/, 'unlock reason audit field');
  mustText('确认下达给织厂', 'explicit issue button');
  mustText('解锁修改', 'explicit unlock button');
  must(/setWDReadOnly\(isIssued\)/, 'issued docs switch UI to read-only');
});

test('weaving sales-order selector remains usable after saved docs load', () => {
  must(/function\s+resetWDFormForOrder\s*\(/, 'order-switch form reset helper');
  must(/if\(oid!==window\._wdCurrentOrderId\)/, 'detect order switch');
  must(/window\._wdCurrentOrderId=oid/, 'track current selected order');
  must(/ordSel\.disabled=false/, 'sales-order selector stays enabled');
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
  console.error(`Weaving task guard failed: ${passed}/${tests.length}`);
  process.exit(1);
}

console.log(`Weaving task guard passed: ${passed}/${tests.length}`);
