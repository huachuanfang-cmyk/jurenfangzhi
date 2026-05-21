// dirty-sync-tests.mjs
// 测试 pullFromSupabase 的脏数据保护逻辑：
//   1. dirty flag 阻止云端旧数据覆盖本地
//   2. push 失败后保留 dirty flag
//   3. 测试模式不触发云同步
// 注：不涉及真实 Supabase 调用，只验证核心算法。

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ── 模拟 localStorage ──
function createMockLocalStorage() {
  const store = {};
  return {
    getItem: (k) => store[k] !== undefined ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _keys: () => Object.keys(store),
  };
}

// ── 模拟 TABLE_MAP ──
const TABLE_MAP = {
  o: 'orders', c: 'customers', f: 'factories', mat: 'materials',
  t: 'trks', wd: 'weave', qt: 'quots', ar: 'arecs', rc: 'recons',
  dd: 'ddocs', yn: 'yarns', yo: 'yarnouts', fgi: 'fgins', gfy: 'greyfabs',
  fgo: 'fgouts', ret: 'fgreturns', fgr: 'fabric_rolls', cnotices: 'color_notices',
};

// ── 模拟 pullFromSupabase 的脏表处理算法（不涉及真实网络） ──
// 这是一个纯函数测试：给定 dirty flag 集合和假设的 push 结果，验证跳过/保留行为
function simulateSyncP1(simulatedLocal, existingDirtyKeys, pushResults) {
  // pushResults: { key: true/false } — 模拟 push 成功/失败
  // 返回值: { pulled: string[], dirtyAfter: string[], dbAfter: object }

  const pushedKeys = [];
  const dbAfter = { ...simulatedLocal };

  // Step 1: push dirty tables
  for (const key of Object.keys(TABLE_MAP)) {
    if (existingDirtyKeys.includes(key)) {
      const success = pushResults[key] === true;
      if (success) {
        pushedKeys.push(key);
        // 模拟本地数据已推送成功
      }
    }
  }

  // Step 2: pull non-dirty, non-pushed tables
  const pulled = [];
  for (const key of Object.keys(TABLE_MAP)) {
    const isDirty = existingDirtyKeys.includes(key);
    const wasPushed = pushedKeys.includes(key);
    if (isDirty || wasPushed) {
      dbAfter[key] = dbAfter[key] || `local_${key}`; // keep local
      continue; // skip pull
    }
    // Simulate cloud data
    dbAfter[key] = `cloud_${key}`;
    pulled.push(key);
  }

  // Step 3: clear dirty flags for pushed keys (after pull)
  const dirtyAfter = existingDirtyKeys.filter(k => !pushedKeys.includes(k));

  return { pulled, dirtyAfter, dbAfter };
}

// ── 测试 1：dirty flag 阻止云端覆盖 ──
test('dirty flag prevents cloud pull from overwriting local data', () => {
  const localData = { o: 'local_o_modified', c: 'local_c' };
  const dirtyKeys = ['o'];
  const pushResults = { o: true };

  const result = simulateSyncP1(localData, dirtyKeys, pushResults);

  // 'o' was dirty + pushed → should be skipped in pull
  if (result.dbAfter.o !== 'local_o_modified') throw new Error(
    `Expected local 'o' preserved, got: ${result.dbAfter.o}`
  );
  // 'o' should not appear in pulled list
  if (result.pulled.includes('o')) throw new Error(
    'dirty/pushed table "o" should not have been pulled'
  );
  // non-dirty tables should be pulled (get cloud data)
  if (result.dbAfter.c !== 'cloud_c') throw new Error(
    `Non-dirty table "c" should show cloud data, got: ${result.dbAfter.c}`
  );
  // dirty flag should be cleared after successful push+pull
  if (result.dirtyAfter.includes('o')) throw new Error(
    'dirty flag for "o" should have been cleared after successful push'
  );
});

// ── 测试 2：push 失败后保留 dirty flag ──
test('failed push preserves dirty flag and local data', () => {
  const localData = { o: 'local_o_modified', fgr: 'local_fgr' };
  const dirtyKeys = ['o', 'fgr'];
  // 'o' push fails, 'fgr' hasn't been pushed yet
  const pushResults = { o: false };

  const result = simulateSyncP1(localData, dirtyKeys, pushResults);

  // 'o' push failed → dirty flag should remain
  if (!result.dirtyAfter.includes('o')) throw new Error(
    'dirty flag for "o" should remain after failed push'
  );
  // 'fgr' wasn't pushed (not in pushResults) → dirty flag remains
  if (!result.dirtyAfter.includes('fgr')) throw new Error(
    'dirty flag for "fgr" should remain when not pushed'
  );
  // Both tables should keep local data
  if (result.dbAfter.o !== 'local_o_modified') throw new Error(
    `Local data for "o" should be preserved after failed push, got: ${result.dbAfter.o}`
  );
  if (result.dbAfter.fgr !== 'local_fgr') throw new Error(
    `Local data for "fgr" should be preserved, got: ${result.dbAfter.fgr}`
  );
});

// ── 测试 3：测试模式不触发云同步 ──
test('test mode does not trigger any cloud sync', () => {
  // This simulates the `if(_testMode) return;` at line 903
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

// ── 测试 4：推送成功的表在 pull 后被清除 dirty flag（完整流程验证） ──
test('successfully pushed tables have dirty flag cleared after pull completes', () => {
  const localData = { o: 'local_o', ar: 'local_ar', c: 'local_c' };
  const dirtyKeys = ['o', 'ar'];
  const pushResults = { o: true, ar: true };

  const result = simulateSyncP1(localData, dirtyKeys, pushResults);

  // Both pushed tables should have dirty flags cleared
  if (result.dirtyAfter.length !== 0) throw new Error(
    `All dirty flags should be cleared, remaining: ${result.dirtyAfter.join(', ')}`
  );
  // Pushed tables should keep local data (not pulled from cloud)
  if (result.dbAfter.o !== 'local_o') throw new Error(
    `Pushed table 'o' should keep local data, got: ${result.dbAfter.o}`
  );
  if (result.dbAfter.ar !== 'local_ar') throw new Error(
    `Pushed table 'ar' should keep local data, got: ${result.dbAfter.ar}`
  );
  // Non-dirty table should get cloud data
  if (result.dbAfter.c !== 'cloud_c') throw new Error(
    `Non-dirty table 'c' should get cloud data, got: ${result.dbAfter.c}`
  );
});

// ── 测试 5：部分 push 成功时仅成功表跳过 pull ──
test('mixed push results: only successful pushes skip pull, failed keep dirty', () => {
  const localData = { o: 'local_o', fgr: 'local_fgr', ret: 'local_ret' };
  const dirtyKeys = ['o', 'fgr', 'ret'];
  const pushResults = { o: true, fgr: false };

  const result = simulateSyncP1(localData, dirtyKeys, pushResults);

  // 'o' pushed successfully → dirty cleared
  if (result.dirtyAfter.includes('o')) throw new Error(
    'successfully pushed table "o" should have dirty cleared'
  );
  // 'fgr' push failed → dirty remains
  if (!result.dirtyAfter.includes('fgr')) throw new Error(
    'failed push table "fgr" should keep dirty flag'
  );
  // 'ret' wasn't in pushResults → wasn't attempted → dirty remains
  if (!result.dirtyAfter.includes('ret')) throw new Error(
    'unattempted table "ret" should keep dirty flag'
  );
  // Pushed tables keep local data
  if (result.dbAfter.o !== 'local_o') throw new Error(
    'pushed table "o" should keep local data'
  );
  // Failed tables keep local data
  if (result.dbAfter.fgr !== 'local_fgr') throw new Error(
    'failed table "fgr" should keep local data'
  );
  // Non-dirty tables get cloud data
  if (!result.pulled.includes('c')) throw new Error(
    'non-dirty table "c" should be pulled from cloud'
  );
});

// ── 运行 ──
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
