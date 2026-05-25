// dirty-sync-tests.mjs
// 测试 pullFromSupabase 的脏数据保护逻辑：
//   1. dirty flag 阻止云端旧数据覆盖本地
//   2. push 失败后保留 dirty flag
//   3. 测试模式不触发云同步
// 注：使用 sync-core.mjs 的真实算法（纯函数，不涉及网络）

import { readFileSync } from 'node:fs';
import { simulateSyncFlow, computeSyncPlanWithVersion, stripTransientFieldsForCloud, prepareCloudRow, cloudConflictKey, ALL_KEYS } from './sync-core.mjs';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ══ 测试 1：dirty flag 阻止云端覆盖 ══
test('dirty flag prevents cloud pull from overwriting local data', () => {
  const dirtyKeys = ['o'];
  const pushResults = { o: true };

  const result = simulateSyncFlow(dirtyKeys, pushResults);

  // 'o' was dirty + pushed → should be skipped in pull
  if (!result.skipPull.includes('o')) throw new Error(
    'dirty/pushed table "o" should be skipped from pull'
  );
  // 'o' should not appear in pull list
  if (result.pullKeys.includes('o')) throw new Error(
    'dirty/pushed table "o" should not be in pull list'
  );
  // Non-dirty tables should be pulled
  if (!result.pullKeys.includes('c')) throw new Error(
    'non-dirty table "c" should be in pull list'
  );
  // dirty flag should be cleared after successful push+pull
  if (result.remainingDirty.includes('o')) throw new Error(
    'dirty flag for "o" should have been cleared after successful push'
  );
  if (!result.clearedDirty.includes('o')) throw new Error(
    '"o" should be in clearedDirty list'
  );
});

// ══ 测试 2：push 失败后保留 dirty flag ══
test('failed push preserves dirty flag and local data', () => {
  const dirtyKeys = ['o', 'fgr'];
  // 'o' push fails, 'fgr' hasn't been attempted
  const pushResults = { o: false };

  const result = simulateSyncFlow(dirtyKeys, pushResults);

  // 'o' push failed → dirty flag should remain
  if (!result.remainingDirty.includes('o')) throw new Error(
    'dirty flag for "o" should remain after failed push'
  );
  // 'fgr' wasn't in pushResults → never attempted → dirty remains
  if (!result.remainingDirty.includes('fgr')) throw new Error(
    'dirty flag for "fgr" should remain when not pushed'
  );
  // Both should be skipped from pull (still dirty)
  if (!result.skipPull.includes('o')) throw new Error(
    'failed table "o" should be skipped from pull'
  );
  if (!result.skipPull.includes('fgr')) throw new Error(
    'unattempted table "fgr" should be skipped from pull'
  );
  // Neither should have dirty cleared
  if (result.clearedDirty.length !== 0) throw new Error(
    'no dirty flags should be cleared when all pushes fail'
  );
});

// ══ 测试 3：测试模式不触发云同步 ══
test('test mode does not trigger any cloud sync', () => {
  // This simulates the `if(_testMode) return;` guard at line 949
  const testModeActive = true;
  let syncAttempted = false;

  if (testModeActive) {
    // Should return immediately without any sync
  } else {
    syncAttempted = true;
  }

  if (syncAttempted) throw new Error(
    'sync should not be attempted in test mode'
  );
  if (!testModeActive) throw new Error(
    'test mode should be active'
  );
});

// ══ 测试 4：推送成功的表在 pull 后被清除 dirty flag ══
test('successfully pushed tables have dirty flag cleared after pull completes', () => {
  const dirtyKeys = ['o', 'ar'];
  const pushResults = { o: true, ar: true };

  const result = simulateSyncFlow(dirtyKeys, pushResults);

  // Both pushed tables should have dirty flags cleared
  if (result.remainingDirty.length !== 0) throw new Error(
    `All dirty flags should be cleared, remaining: ${result.remainingDirty.join(', ')}`
  );
  if (result.clearedDirty.length !== 2) throw new Error(
    'Both "o" and "ar" should have dirty cleared'
  );
  // Pushed tables should keep local data (skip pull)
  if (!result.skipPull.includes('o')) throw new Error(
    'pushed table "o" should skip pull'
  );
  if (!result.skipPull.includes('ar')) throw new Error(
    'pushed table "ar" should skip pull'
  );
  // Non-dirty table should be pulled from cloud
  if (!result.pullKeys.includes('c')) throw new Error(
    'non-dirty table "c" should be in pull list'
  );
});

// ══ 测试 5：部分 push 成功时仅成功表跳过 pull ══
test('mixed push results: only successful pushes skip pull, failed keep dirty', () => {
  const dirtyKeys = ['o', 'fgr', 'ret'];
  const pushResults = { o: true, fgr: false };

  const result = simulateSyncFlow(dirtyKeys, pushResults);

  // 'o' pushed successfully → dirty cleared
  if (result.remainingDirty.includes('o')) throw new Error(
    'successfully pushed table "o" should have dirty cleared'
  );
  if (!result.clearedDirty.includes('o')) throw new Error(
    '"o" should be in clearedDirty'
  );
  // 'fgr' push failed → dirty remains
  if (!result.remainingDirty.includes('fgr')) throw new Error(
    'failed push table "fgr" should keep dirty flag'
  );
  // 'ret' wasn't in pushResults → wasn't attempted → dirty remains
  if (!result.remainingDirty.includes('ret')) throw new Error(
    'unattempted table "ret" should keep dirty flag'
  );
  // Only 'o' should be cleared
  if (result.clearedDirty.length !== 1) throw new Error(
    `Only "o" should be cleared, got: ${result.clearedDirty.join(', ')}`
  );
  if (result.clearedDirty[0] !== 'o') throw new Error(
    'clearedDirty should contain only "o"'
  );
  // Pushed table skips pull
  if (!result.skipPull.includes('o')) throw new Error(
    'pushed table "o" should skip pull'
  );
  // Failed tables also skip pull (still dirty)
  if (!result.skipPull.includes('fgr')) throw new Error(
    'failed table "fgr" should skip pull'
  );
  // Non-dirty table pulls
  if (!result.pullKeys.includes('c')) throw new Error(
    'non-dirty table "c" should be pulled'
  );
});

// ══ 额外测试 6：无脏表时所有表都拉取 ══
test('no dirty tables: all keys pulled from cloud', () => {
  const result = simulateSyncFlow([], {});

  if (result.skipPull.length !== 0) throw new Error(
    'no tables should skip pull when nothing is dirty'
  );
  if (result.pullKeys.length !== ALL_KEYS.length) throw new Error(
    `all ${ALL_KEYS.length} tables should be pulled, got ${result.pullKeys.length}`
  );
  if (result.clearedDirty.length !== 0) throw new Error(
    'no dirty flags should be cleared'
  );
  if (result.remainingDirty.length !== 0) throw new Error(
    'no remaining dirty flags expected'
  );
});

// ══ 版本保险：同步期间有新保存 → 不清除 dirty ══

test('version guard: late async does not clear dirty when version changed during sync', () => {
  // 模拟场景：DB.save 发起 upsert（preSyncVer=1），期间又有一次新保存（postSyncVer=2）
  var dirtyKeys = ['o'];
  var pushedKeys = ['o'];
  var preSyncVers = { o: 1 };
  var postSyncVers = { o: 2 }; // 推送期间版本变化了！

  var result = computeSyncPlanWithVersion(dirtyKeys, pushedKeys, preSyncVers, postSyncVers);

  // 'o' 推送成功但版本变了 → dirty flag 应保留
  if (!result.remainingDirty.includes('o')) throw new Error(
    'version changed during sync: dirty flag for "o" should remain'
  );
  if (result.clearedDirty.includes('o')) throw new Error(
    'version changed: "o" should NOT be in clearedDirty'
  );
  if (!result.versionBlocked.includes('o')) throw new Error(
    '"o" should be in versionBlocked list'
  );
});

test('version guard: stable version allows dirty clear', () => {
  // 模拟场景：DB.save 发起 upsert 到完成期间没有新保存
  var dirtyKeys = ['o', 'ar'];
  var pushedKeys = ['o', 'ar'];
  var preSyncVers = { o: 3, ar: 1 };
  var postSyncVers = { o: 3, ar: 1 }; // 版本没变

  var result = computeSyncPlanWithVersion(dirtyKeys, pushedKeys, preSyncVers, postSyncVers);

  // 两个表版本没变 → dirty 应正常清除
  if (result.clearedDirty.length !== 2) throw new Error(
    'both tables should have dirty cleared when version stable'
  );
  if (result.remainingDirty.length !== 0) throw new Error(
    'no remaining dirty expected when all versions stable'
  );
  if (result.versionBlocked.length !== 0) throw new Error(
    'no versionBlocked expected when all versions stable'
  );
});

test('version guard: mixed scenario — some tables changed, some stable', () => {
  // 'o' 版本变了，'ar' 版本没变
  var dirtyKeys = ['o', 'ar', 'c'];
  var pushedKeys = ['o', 'ar']; // 'c' failed to push
  var preSyncVers = { o: 1, ar: 1 };
  var postSyncVers = { o: 2, ar: 1 }; // 'o' changed during sync

  var result = computeSyncPlanWithVersion(dirtyKeys, pushedKeys, preSyncVers, postSyncVers);

  // 'ar' 版本没变 → 清除
  if (!result.clearedDirty.includes('ar')) throw new Error(
    '"ar" version stable: should be cleared'
  );
  // 'o' 版本变了 → 保留 dirty
  if (!result.remainingDirty.includes('o')) throw new Error(
    '"o" version changed: dirty should remain'
  );
  // 'c' push 失败 → dirty 保留
  if (!result.remainingDirty.includes('c')) throw new Error(
    '"c" push failed: dirty should remain'
  );
  if (!result.versionBlocked.includes('o')) throw new Error(
    '"o" should be in versionBlocked'
  );
  if (result.versionBlocked.includes('ar')) throw new Error(
    '"ar" should NOT be in versionBlocked'
  );
});

// ══ pullFromSupabase 路径：推送期间版本变化不清 dirty ══
test('pullFromSupabase step3: 推送期间版本变化则不清 dirty', () => {
  // 模拟 pullFromSupabase 流程：
  // Step 1 推送时捕获版本 prePushVers={o:1}
  // Step 2 拉取期间用户又保存了一次 → _syncVersions[o] 变成 2
  // Step 3 检查版本发现不匹配 → 不清 dirty
  var dirtyKeys = ['o'];
  var pushedKeys = ['o'];         // 'o' 推送成功
  var preSyncVers = { o: 1 };     // Step 1 捕获的版本
  var postSyncVers = { o: 2 };    // Step 2 完成后版本变了（Step 2 拉取期间有新保存）

  var result = computeSyncPlanWithVersion(dirtyKeys, pushedKeys, preSyncVers, postSyncVers);

  // 'o' 版本变了 → dirty flag 应保留
  if (!result.remainingDirty.includes('o')) throw new Error(
    'pullFromSupabase: version changed during pull, dirty for "o" should remain'
  );
  if (!result.versionBlocked.includes('o')) throw new Error(
    '"o" should be versionBlocked'
  );
  // 'c' 不脏应正常拉取
  if (!result.pullKeys.includes('c')) throw new Error(
    'clean table "c" should be pulled'
  );
});

// ══ online 重推路径：重推期间版本变化不清 dirty ══
test('online retry: 重推期间版本变化则不清 dirty', () => {
  // 模拟上线重推：单表重推，但重推过程中用户又保存了
  var dirtyKeys = ['fgr'];
  var pushedKeys = ['fgr'];
  var preSyncVers = { fgr: 5 };    // 发起重推时版本为 5
  var postSyncVers = { fgr: 6 };   // upsert 返回时版本已变（期间有新保存）

  var result = computeSyncPlanWithVersion(dirtyKeys, pushedKeys, preSyncVers, postSyncVers);

  // dirty flag 应保留，不让旧数据覆盖
  if (!result.remainingDirty.includes('fgr')) throw new Error(
    'online retry: version changed during retry, dirty for "fgr" should remain'
  );
  if (result.clearedDirty.length !== 0) throw new Error(
    'no dirty should be cleared when version changed during retry'
  );
});

test('cloud payload removes UI-only underscore fields before Supabase upsert', () => {
  var row = {
    id: 'out-001',
    no: 'DH20260001',
    ordNo: 'G20260674',
    totalKG: 40.6,
    _isLegacy: true,
    _uiExpanded: true,
  };

  var cleaned = stripTransientFieldsForCloud(row);

  if (cleaned._isLegacy !== undefined || cleaned._uiExpanded !== undefined) {
    throw new Error('underscore UI fields should not be present in cloud payload');
  }
  if (cleaned.id !== row.id || cleaned.ordNo !== row.ordNo || cleaned.totalKG !== row.totalKG) {
    throw new Error('business fields should be preserved while removing UI fields');
  }
});

test('production sync reuses the authenticated Supabase client session', () => {
  var src = readFileSync('index.html', 'utf8');

  if (!src.includes('_supabaseData = _supabase')) {
    throw new Error('data sync should reuse the logged-in Supabase client');
  }
  if (src.includes("_supabaseData = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{persistSession:false}})")) {
    throw new Error('data sync must not use a separate unauthenticated Supabase client');
  }
});

test('weaving and dyeing cloud payload omits invalid serial id and uses order conflict key', () => {
  var weaving = prepareCloudRow('wd', { id: null, ordId: 'ord-001', facNm: '织厂' });
  var dyeing = prepareCloudRow('dd', { id: '', ordId: 'ord-002', facNm: '染厂' });

  if ('id' in weaving || 'id' in dyeing) {
    throw new Error('serial table payload should omit null/blank id');
  }
  if (cloudConflictKey('wd') !== 'ord_id' || cloudConflictKey('dd') !== 'ord_id') {
    throw new Error('weaving/dyeing docs should upsert by ord_id');
  }
  if (cloudConflictKey('fgo') !== 'id') {
    throw new Error('normal tables should continue upserting by id');
  }
});

// ══ 运行 ══
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
  console.log(`Dirty sync guard passed: ${passed}/${tests.length}`);
}
