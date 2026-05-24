import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('dashboard exposes refresh safety check button', () => {
  assert.match(html, /openSyncSafetyModal\s*\(/);
  assert.match(html, /刷新前检查/);
});

test('refresh safety check covers critical business tables', () => {
  for (const key of ['o', 'fgi', 'fgr', 'fgo', 'ret', 'ar']) {
    assert.match(html, new RegExp(`${key}\\s*:`));
  }
});

test('refresh safety check reports dirty flags and local snapshots', () => {
  assert.match(html, /gjr5_dirty_/);
  assert.match(html, /gjr5_snap_/);
  assert.match(html, /未同步/);
  assert.match(html, /快照/);
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
  console.log(`Sync safety guard passed: ${passed}/${tests.length}`);
}
