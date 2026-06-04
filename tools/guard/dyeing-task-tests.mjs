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

function mustText(text, label) {
  if (!html.includes(text)) throw new Error(`missing ${label}`);
}

test('dyeing docs support multiple process tasks under one sales order', () => {
  must(/function\s+ddTaskKey\s*\(/, 'ddTaskKey helper');
  must(/function\s+ddBaseOrdId\s*\(/, 'ddBaseOrdId helper');
  must(/function\s+getDDTasks\s*\(/, 'getDDTasks helper');
  must(/window\._ddActiveTaskKey/, 'active dyeing task key');
  must(/ddBaseOrdId\(x\.ordId\)===oid/, 'task lookup by base order id');
  must(/key&&ddBaseOrdId\(key\)===oid[\s\S]{0,240}return hit\|\|\{\};/, 'new unsaved dyeing task starts blank instead of cloning first task');
  must(/ordId:taskKey/, 'save config with task-specific ordId');
});

test('dyeing doc cloud sync uses ord_id conflict key', () => {
  must(/function\s+cloudConflictKey\s*\(/, 'cloud conflict helper');
  must(/\(key==='dd'\|\|key==='wd'\)\?'ord_id':'id'/, 'dyeing/weaving docs upsert conflict on ord_id');
});

test('dyeing print prefers document color-code override over sales order code', () => {
  must(/savedVatCode=savedCfg\.vatCode\|\|\[\]/, 'load saved dyeing color-code overrides');
  mustText("mkInput('dvc-'+i,savedVatCode[i]||c.code)", 'dyeing color-code input restores saved override');
  must(/var savedCode=savedVatCode\[i\]\|\|'';/, 'saved dyeing color-code fallback');
  must(/code:\(domCode\|\|savedCode\|\|liveCode\)/, 'print prefers manual document color code');
  mustText("vatCode:(function(){var a=[];for(var vi=0;vi<20;vi++){var el=document.getElementById('dvc-'+vi);a.push(el?el.value:'');}while(a.length&&!a[a.length-1])a.pop();return a;})(),", 'save dyeing color-code overrides');
});

test('dyeing docs can be issued and locked until explicitly unlocked', () => {
  must(/status:\(existing&&existing\.status\)\|\|'draft'/, 'default draft status preserves existing status');
  must(/function\s+issueDDcfg\s*\(/, 'issue dyeing doc helper');
  must(/status='issued'/, 'issued status assignment');
  must(/issuedAt=new Date\(\)\.toISOString\(\)/, 'issued timestamp');
  must(/function\s+unlockDDcfg\s*\(/, 'unlock dyeing doc helper');
  must(/unlockReason/, 'unlock reason audit field');
  must(/function\s+setDDReadOnly\s*\(/, 'dyeing read-only helper');
  must(/setDDReadOnly\(ddCfg&&ddCfg\.status==='issued'\)/, 'issued docs switch UI to read-only');
  mustText('确认下达给染厂', 'explicit issue button');
  mustText('解锁修改', 'explicit unlock button');
});

test('dyeing issue preserves manually selected vat colors', () => {
  must(/selectedVatColors:\(function\(\)\{var a=\[\];document\.querySelectorAll\('\.dd-clr-chk'\)/, 'save selected dyeing vat colors');
  must(/var savedVatSelected=Array\.isArray\(savedCfg\.selectedVatColors\)\?savedCfg\.selectedVatColors:null;/, 'load saved vat color selection');
  must(/clrCb\.checked=savedVatSelected\?savedVatSelected\.indexOf\(c\.nm\)>=0:\(inferVatSelected\?\!\!String\(savedVatQ1\[i\]\|\|''\)\.trim\(\):true\);/, 'restore saved vat color checkboxes instead of defaulting all checked');
});

test('legacy dyeing docs infer selected vat colors from non-empty vat quantity', () => {
  must(/var inferVatSelected=!savedVatSelected&&savedVatQ1\.some\(function\(v\)\{return String\(v\|\|''\)\.trim\(\);\}\);/, 'infer legacy vat color selection from quantities');
  must(/inferVatSelected\?\!\!String\(savedVatQ1\[i\]\|\|''\)\.trim\(\):true/, 'legacy docs do not re-check blank-quantity colors');
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
  console.error(`Dyeing task guard failed: ${passed}/${tests.length}`);
  process.exit(1);
}

console.log(`Dyeing task guard passed: ${passed}/${tests.length}`);
