import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

test('A4 print output uses one shared readability polish layer', () => {
  assert(/function\s+printPolishCSS\s*\(/.test(html), 'missing printPolishCSS helper');
  assert(/function\s+applyPrintPolish\s*\(/.test(html), 'missing applyPrintPolish helper');
  assert(/printPolishCSS\(\)/.test(html), 'print polish CSS is not injected');
});

test('print polish improves customer-facing delivery typography', () => {
  assert(/\.lbl\{[^}]*font-size:8\.6pt!important/.test(html), 'delivery labels should be at least 8.6pt');
  assert(/\.val\{[^}]*font-size:9\.5pt!important/.test(html), 'delivery values should be at least 9.5pt');
  assert(/table\.rolls td\{[^}]*font-size:9pt!important/.test(html), 'roll table body should be at least 9pt');
  assert(/\.sc-lbl\{[^}]*font-size:8pt!important/.test(html), 'signature labels should be at least 8pt');
});

test('print polish preserves compact one-page contracts', () => {
  assert(/\.terms-body\{[^}]*font-size:8pt!important/.test(html), 'contract terms should stay compact at 8pt');
  assert(/\.dt td,\s*\.dt th\{[^}]*font-size:9pt!important/.test(html), 'shared contract tables should use readable 9pt text');
  assert(/margin:5mm 8mm/.test(html), 'A4 print page should keep compact margins');
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
  console.error(`Print style guard failed: ${passed}/${tests.length}`);
} else {
  console.log(`Print style guard passed: ${passed}/${tests.length}`);
}
