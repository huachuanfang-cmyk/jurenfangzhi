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

test('legacy unreconciled shipment warning cross-checks receivable outIds', () => {
  must(/var liveArecOutIds=\{\};/, 'live receivable out-id map');
  must(/\(DB\.arecs\|\|\[\]\)\.forEach\(function\(ar\)\{if\(ar&&ar\.status!=='voided'\)\(ar\.outIds\|\|\[\]\)\.forEach\(function\(oid\)\{liveArecOutIds\[oid\]=true;\}\);\}\);/, 'live receivable outIds collection');
  must(/if\(o\.arecId\|\|liveArecOutIds\[o\.id\]\)return;/, 'warning skips shipments already listed in receivable outIds');
});

test('legacy unreconciled shipment warning ignores voided delivery notes', () => {
  must(/if\(arOutIsVoided\(o\)\)return;/, 'warning skips voided or cancelled shipments');
});

test('receivable statements never print or export voided delivery notes', () => {
  must(/function arOutIsVoided\(o\)\{return !!\(o&&\(o\.voided\|\|o\.status==='voided'\|\|o\.status==='cancelled'\)\);\}/, 'shared voided shipment helper');
  must(/var out=fgoutsDB\.find\(function\(x\)\{return x\.id===oid;\}\);if\(!out\|\|arOutIsVoided\(out\)\)return;/, 'Excel skips voided delivery notes in saved outIds');
  must(/var out=fgoutsDB\.find\(function\(x\)\{return x\.id===oid;\}\);if\(!out\|\|arOutIsVoided\(out\)\)return;/, 'PDF skips voided delivery notes in saved outIds');
});

test('receivable edit refetch drops voided delivery notes even if saved before', () => {
  must(/if\(arOutIsVoided\(o\)\)return false;/, 'edit fetch excludes voided saved shipment rows');
});

test('legacy warning exposes delivery note numbers for true unmatched shipments', () => {
  must(/legacyMap\[cust\]=\{count:0,maxDays:0,amt:0,nos:\[\]\}/, 'warning stores delivery note numbers');
  must(/legacyMap\[cust\]\.nos\.push\(o\.no\|\|o\.id\|\|''\)/, 'warning records unmatched delivery number');
  must(/row\.title="送货单："\+esc\(info\.nos\.join\('、'\)\);/, 'warning row title exposes delivery numbers');
  must(/送货单：'\+esc\(info\.nos\.slice\(0,6\)\.join\('、'\)\)/, 'warning displays delivery note numbers');
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
  console.error(`Receivable reconciliation guard failed: ${passed}/${tests.length}`);
  process.exit(1);
}

console.log(`Receivable reconciliation guard passed: ${passed}/${tests.length}`);
