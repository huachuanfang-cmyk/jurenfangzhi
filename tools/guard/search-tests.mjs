import assert from 'node:assert/strict';
import { normalizeSearchText, searchIncludes, sameSearchCode } from './search-core.mjs';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('material code search ignores case and surrounding spaces', () => {
  assert.equal(searchIncludes('  g26724  ', 'G26724'), true);
  assert.equal(sameSearchCode(' g26724 ', 'G26724'), true);
});

test('material code search tolerates full-width letters and digits', () => {
  assert.equal(normalizeSearchText('Ｇ２６７２４'), 'g26724');
  assert.equal(searchIncludes('Ｇ２６７２４', 'G26724'), true);
});

test('material code search tolerates separators in stored codes', () => {
  assert.equal(searchIncludes('G-26724', 'G26724'), true);
  assert.equal(searchIncludes('G 26724', 'G26724'), true);
  assert.equal(sameSearchCode('G-26724', 'G26724'), true);
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
  console.log(`Search guard passed: ${passed}/${tests.length}`);
}
