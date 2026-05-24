import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('show all orders clears warning/status/search filters and un-hides completed orders', () => {
  assert.match(html, /function\s+showAllOrders\s*\(/, 'missing showAllOrders helper');
  assert.match(html, /window\._ordHideCompleted\s*=\s*false/, 'show all should disable completed-order hiding');
  assert.match(html, /window\._ordWarnFilter\s*=\s*''/, 'show all should clear warning quick filter');
  assert.match(html, /document\.getElementById\('oq'\)/, 'show all should reset search input');
  assert.match(html, /document\.getElementById\('os'\)/, 'show all should reset status select');
});

test('orders hide/show button uses the show all helper when currently hiding completed orders', () => {
  assert.match(html, /if\(window\._ordHideCompleted\)\{showAllOrders\(\);return;\}/);
});

test('warning chips and warning-filtered order list use the same predicate', () => {
  assert.match(html, /function\s+orderWarningMatch\s*\(/, 'missing shared order warning predicate');
  assert.match(html, /orderWarningMatch\(o,'overdue'\)/, 'overdue count/filter should use shared predicate');
  assert.match(html, /orderWarningMatch\(o,_wf\)/, 'warning-filtered list should use shared predicate');
});

test('clicking a warning chip clears unrelated filters so the matching orders are visible', () => {
  assert.match(html, /activateOrderWarningFilter\s*\(/, 'missing warning activation helper');
  assert.match(html, /window\._ordHideCompleted\s*=\s*false/, 'warning activation should disable completed-order hiding');
  assert.match(html, /document\.getElementById\('oq'\)/, 'warning activation should clear search input');
  assert.match(html, /document\.getElementById\('os'\)/, 'warning activation should clear status select');
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
  console.log(`Order filter guard passed: ${passed}/${tests.length}`);
}
