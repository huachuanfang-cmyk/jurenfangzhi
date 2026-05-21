import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const polish = html.slice(html.indexOf('function printPolishCSS'), html.indexOf('function applyPrintPolish'));

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
});

test('print polish changes typography only, not grids, backgrounds, or page geometry', () => {
  assert(!/print-color-adjust|-webkit-print-color-adjust/.test(polish), 'must not force browsers to print solid color blocks');
  assert(!/@page/.test(polish), 'must not override original page setup');
  assert(!/background\s*:/.test(polish), 'must not add or force print backgrounds');
  assert(!/padding\s*:/.test(polish), 'must not change original grid spacing');
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
