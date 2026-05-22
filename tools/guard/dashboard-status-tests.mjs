// dashboard-status-tests.mjs
// 工作台状态护栏：销售订单主状态保持手动，颜色进度从实际布卷出货状态派生显示

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

test('dashboard color progress derives shipped display from actual roll shipment', () => {
  assert(/function\s+calcColorShipStatus\s*\(/.test(html), 'missing calcColorShipStatus helper');
  assert(/function\s+displayColorStatusForDashboard\s*\(/.test(html), 'missing dashboard display status helper');
  assert(/displayColorStatusForDashboard\(o\.id,\s*c\)/.test(html), 'dashboard should render color status through shipment-aware helper');
  assert(/clrStatusBadge\(displayStatus/.test(html), 'dashboard badge should use shipment-aware status');
});

test('dashboard archive logic treats fully shipped orders as done without mutating manual order status', () => {
  assert(/calcShipStatus\(o\.id\)==='fully_out'/.test(html), 'fully shipped order should be considered done on dashboard');
  assert(/status:\s*document\.getElementById\('o-st'\)\.value/.test(html), 'sales order status should still be saved from manual select');
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
  console.log(`Dashboard status guard passed: ${passed}/${tests.length}`);
}
