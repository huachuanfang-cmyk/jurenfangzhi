import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('sales order delete path uses data integrity guard', () => {
  assert.match(html, /function\s+canDeleteOrder\s*\(/);
  assert.match(html, /function\s+findOrderDeleteRefs\s*\(/);
  assert.match(html, /function\s+delO\s*\([^)]*\)\s*\{[\s\S]*canDeleteOrder/);
});

test('sales order list offers cancel before hard delete', () => {
  assert.match(html, /function\s+cancelOrder\s*\(/);
  assert.match(html, /canDeleteOrder\(o\.id\)/);
  assert.match(html, /mkBtn\('作废'[\s\S]*cancelOrder/);
  assert.match(html, /mkBtn\('删除'[\s\S]*delO/);
});

test('data integrity scanner checks orphan business records', () => {
  assert.match(html, /function\s+findDataIntegrityIssues\s*\(/);
  assert.match(html, /不存在的销售订单/);
  assert.match(html, /不存在的送货单/);
  assert.match(html, /不存在的布卷/);
  assert.match(html, /不存在的退货单/);
  assert.match(html, /不属于该销售订单/);
  assert.match(html, /重复订单号/);
});

test('master-data delete paths use reference guards', () => {
  assert.match(html, /function\s+canDeleteCustomer\s*\(/);
  assert.match(html, /function\s+canDeleteFactory\s*\(/);
  assert.match(html, /function\s+canDeleteMaterial\s*\(/);
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
  console.log(`Data integrity guard passed: ${passed}/${tests.length}`);
}
