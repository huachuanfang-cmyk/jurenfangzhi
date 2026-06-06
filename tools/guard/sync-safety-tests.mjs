import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');
const safetyKeysMatch = html.match(/var\s+SYNC_SAFETY_KEYS\s*=\s*\{([\s\S]*?)\};/);
assert.ok(safetyKeysMatch, 'SYNC_SAFETY_KEYS must be present');
const safetyKeysBody = safetyKeysMatch[1];

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
    assert.match(safetyKeysBody, new RegExp(`${key}\\s*:`));
  }
});

test('refresh safety check covers base archive tables', () => {
  for (const key of ['c', 'f', 'mat']) {
    assert.match(safetyKeysBody, new RegExp(`${key}\\s*:`));
  }
  for (const label of ['客户档案', '加工厂档案', '物料档案']) {
    assert.match(safetyKeysBody, new RegExp(label));
  }
});

test('refresh safety check reports dirty flags and local snapshots', () => {
  assert.match(html, /gjr5_dirty_/);
  assert.match(html, /gjr5_snap_/);
  assert.match(html, /未同步/);
  assert.match(html, /快照/);
});

test('refresh safety check compares local, cloud, and snapshot counts', () => {
  assert.match(html, /async\s+function\s+getSyncSafetyRows\s*\(/);
  assert.match(html, /云端条数/);
  assert.match(html, /select\('\*',\s*\{count:'exact',\s*head:true\}\)/);
  assert.match(html, /本机少于云端/);
  assert.match(html, /云端少于本机/);
});

test('sync status wording does not claim cloud is fully synced from dirty count only', () => {
  assert.doesNotMatch(html, /云端已同步/);
  assert.match(html, /本机无待上传/);
  assert.match(html, /本机有 \'\+dirtySyncCnt\+\' 项待上传/);
});

test('backup computer workflow exposes force-pull latest cloud data', () => {
  assert.match(html, /拉取主电脑最新版/);
  assert.match(html, /备用电脑/);
  assert.match(html, /出差电脑/);
  assert.match(html, /普通重试同步不会覆盖本机已有旧记录/);
  assert.match(html, /id="_syncsafe_force"/);
  assert.match(html, /forceFullSync\(\)/);
});

test('refresh safety modal has reliable close interactions', () => {
  assert.match(html, /function\s+closeSyncSafetyModal\s*\(/);
  assert.match(html, /data-syncsafe-close="1"/);
  assert.match(html, /keydown/);
  assert.match(html, /Escape/);
  assert.match(html, /removeEventListener\('keydown',syncSafeEscHandler\)/);
});

test('refresh safety check verifies required cloud schema columns before switching computers', () => {
  // 新约定（用户要求）：schema 缺字段时静默自动适配，不再弹窗逼用户跑 SQL
  // 旧测试要求"数据库未升级"警告字样和 SQL 文件路径，已废弃 — 替换为新行为约定：
  assert.match(html, /var\s+REQUIRED_CLOUD_COLUMNS\s*=/);
  assert.match(html, /async\s+function\s+checkRequiredCloudSchema\s*\(/);
  assert.match(html, /missingCloudColumnsForSchemaError/); // 通用错误解析必须存在
  assert.match(html, /_addSkippedCols/); // 自动学习并跳过缺失字段
  assert.match(html, /upsertCloudRows/); // 推送层有自适应重试
  assert.match(html, /duplicate_of/); // 关键字段仍记录在 REQUIRED_CLOUD_COLUMNS 里
  assert.match(html, /no_restock_on_void/);
  assert.match(html, /receipt_account_bank/);
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
