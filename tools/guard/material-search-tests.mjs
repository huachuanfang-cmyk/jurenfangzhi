import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { materialCode, materialMatches, mergeMaterialResults } from './material-search-core.mjs';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('material search reads snake_case cloud material numbers', () => {
  assert.equal(materialCode({ prod_no: 'G26724' }), 'G26724');
  assert.equal(materialMatches({ prod_no: 'G26724', fab: '鎏金丝光平纹' }, 'G26724'), true);
});

test('material search matches real cloud G26724 shape', () => {
  const cloud = {
    id: 'mt_1778221034380',
    mid: 'G26724',
    fab: '鎏金丝光平纹',
    alias: '鎏金丝光平纹',
    width_unit: 'cm',
    orig_co: '实益长丰',
    orig_no: 'S1017#',
    comps: [{ nm: '棉', pct: '100' }],
  };
  assert.equal(materialMatches(cloud, 'g 26724'), true);
  assert.equal(materialMatches(cloud, '实益长丰'), true);
});

test('cloud fallback merges missing remote material without duplicating local records', () => {
  const local = [{ id: 'a', mid: 'G26700', fab: '旧物料' }];
  const remote = [{ id: 'b', mid: 'G26724', fab: '鎏金丝光平纹' }, { id: 'c', mid: 'G26700', fab: '旧物料' }];
  const results = mergeMaterialResults(local, remote, 'G26724');
  assert.deepEqual(results.map((m) => m.mid), ['G26724']);
});

test('sales order material picker has online fallback when local materials are stale', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /async function fetchRemoteMaterialMatches\s*\(/);
  assert.match(html, /fetchRemoteMaterialMatches\(q\)/);
  assert.match(html, /async function renderMatList\s*\(/);
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log('PASS', t.name);
  } catch (err) {
    console.error('FAIL', t.name);
    console.error(' ', err.message);
    process.exitCode = 1;
  }
}

if (process.exitCode) {
  console.error(`Material search guard failed: ${passed}/${tests.length}`);
} else {
  console.log(`Material search guard passed: ${passed}/${tests.length}`);
}
