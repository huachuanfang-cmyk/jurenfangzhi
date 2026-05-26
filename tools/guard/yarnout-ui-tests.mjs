import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const next = html.indexOf('\nfunction ', start + 1);
  return html.slice(start, next === -1 ? html.length : next);
}

const yarnOutModal = extractFunction('openYarnOutM');
const yarnPurchaseSave = extractFunction('saveYarn');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('yarn issue modal puts linked sales order before yarn selector', () => {
  const orderIndex = yarnOutModal.indexOf("fv('关联销售订单");
  const yarnIndex = yarnOutModal.indexOf("fv('纱支（从采购库选）");
  assert.ok(orderIndex >= 0, 'missing linked sales order field');
  assert.ok(yarnIndex >= 0, 'missing yarn selector field');
  assert.ok(orderIndex < yarnIndex, 'linked sales order should be the first priority field');
});

test('selecting a sales order can import linked yarn purchase fields', () => {
  assert.match(yarnOutModal, /function\s+findYarnForOrder\s*\(/, 'missing yarn lookup by sales order');
  assert.match(yarnOutModal, /function\s+applyYarnToOutForm\s*\(/, 'missing yarn purchase auto-fill helper');
  assert.match(yarnOutModal, /ordSel\.onchange\s*=\s*function/, 'sales order select should trigger auto-fill');
  assert.match(yarnOutModal, /ordNo\s*===\s*ordNo/, 'lookup should match yarn purchase ordNo');
  assert.match(yarnOutModal, /ord\.id\s*&&\s*y\.ordId\s*===\s*ord\.id/, 'lookup should also match yarn purchase ordId');
  assert.match(yarnOutModal, /delFacId/, 'auto-fill should reuse yarn purchase delivery factory when available');
});

test('yarn issue factory selector only lists weaving factories', () => {
  assert.match(yarnOutModal, /function\s+isYarnIssueFactory\s*\(/, 'missing yarn issue factory filter');
  assert.match(yarnOutModal, /ps\.indexOf\('织厂'\)\s*>=\s*0/, 'factory filter should include 织厂 process');
  assert.match(yarnOutModal, /ps\.indexOf\('织布厂'\)\s*>=\s*0/, 'factory filter should include 织布厂 process');
  assert.doesNotMatch(yarnOutModal, /!f\.type\|\|f\.type==='织布厂'\|\|f\.type==='工厂'/, 'should not list all legacy generic factories');
});

test('yarn purchase save requires linked sales order before writing', () => {
  assert.match(yarnPurchaseSave, /if\s*\(!ordId\)\s*return\s+alert\('请选择关联销售订单'\)/, 'saveYarn should reject purchases without a linked sales order');
  assert.match(yarnPurchaseSave, /if\s*\(!ordRec\)\s*return\s+alert\('关联销售订单不存在，请重新选择'\)/, 'saveYarn should reject stale order selections');
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`Yarn issue UI guard passed: ${passed}/${tests.length}`);
}
