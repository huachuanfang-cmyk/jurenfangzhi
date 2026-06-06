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

test('receivable edit mode can split an accidental merged statement by order', () => {
  must(/var selectedOuts=Array\.from\(outWrap\.querySelectorAll\('\.ar-out-cb:checked:not\(\.ar-ret-cb\)'\)\)/, 'split uses selected shipment rows');
  must(/if\(rec&&rec\.status!=='voided'\)\{/, 'split handles existing receivable records');
  must(/rec\.status='voided';/, 'existing merged statement is voided during split rebuild');
  must(/rec\.voidReason='按'\+dimLabel\+'拆分重建';/, 'split rebuild keeps an audit reason');
  must(/按订单号拆分/, 'order-number split control exists');
});

test('receivable save warns before merging multiple order numbers', () => {
  must(/var selectedOrderNos=\{\};/, 'save collects selected order numbers');
  must(/Object\.keys\(selectedOrderNos\)\.filter\(function\(k\)\{return k;\}\);/, 'save counts distinct order numbers');
  must(/本次勾选包含多个订单号/, 'save warns about multi-order merge');
  must(/按订单号拆分/, 'warning points user to split by order');
});

test('receivable keeps quick no-order shipments explicit for grouping', () => {
  must(/快速出货（无订单）/, 'quick no-order shipment entry exists');
  must(/ordNo:'—',\/\/ 无订单/, 'quick shipments save an explicit no-order marker');
  must(/if\(dim==='ordNo'\)key=o\.ordNo\|\|'\(无订单号\)'/, 'split-by-order keeps no-order shipments in their own bucket');
});

test('receivable account fields are readonly snapshot displays', () => {
  must(/function resolveARecReceiptAccount/, 'receipt account snapshot resolver exists');
  must(/accSel\.disabled=!!rec;/, 'saved receivable account preset is locked while editing');
  must(/function roBox\(\)/, 'readonly account display boxes exist');
  must(/accWrap\.appendChild\(mFld\('账户类型',accTypeView\)\);/, 'account type renders as readonly display');
  must(/accWrap\.appendChild\(mFld\('账户名称',accNameView\)\);/, 'account name renders as readonly display');
  must(/accWrap\.appendChild\(mFld\('开户银行',accBankView\)\);/, 'account bank renders as readonly display');
  must(/accWrap\.appendChild\(mFld\('账号',accNoView\)\);/, 'account number renders as readonly display');
  must(/对账单内只保存并打印账户快照/, 'account snapshot help text exists');
});

test('personal receipt account is supported but never auto-default', () => {
  // 新约定（模板化）：不再写死个人银行卡号种子，用户自行在管理器添加
  // 但「个人账户类型」「不强制为默认」「合规警告」三项契约必须保留
  must(/type:a\.type==='personal'\?'personal':'company'/, 'personal account type supported');
  must(/个人代收账户仅作为特殊收款渠道记录/, 'personal account UI warning exists');
  must(/不开票不等于不入账/, 'personal account compliance warning exists');
  // 模板种子不再含个人卡号
  if (/6228480604742603912/.test(html)) {
    throw new Error('模板种子仍写死个人银行卡号，应已移除');
  }
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
