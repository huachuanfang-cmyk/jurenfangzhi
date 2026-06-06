// sync-core.mjs
// 纯函数：复现 pullFromSupabase 的脏表处理核心算法
// 无网络、无 side effect，可直接用于单元测试

export const TABLE_MAP = {
  o: 'orders', c: 'customers', f: 'factories', mat: 'materials',
  t: 'trks', wd: 'weave', qt: 'quots', ar: 'arecs', rc: 'recons',
  dd: 'ddocs', yn: 'yarns', yo: 'yarnouts', fgi: 'fgins', gfy: 'greyfabs',
  fgo: 'fgouts', ret: 'fgreturns', fgr: 'fabric_rolls', cnotices: 'color_notices',
};

export const ALL_KEYS = Object.keys(TABLE_MAP);

/**
 * 去掉只属于界面的临时字段，避免把 _isLegacy / _uiExpanded 等不存在的列上传到 Supabase。
 * 业务字段即使是 false / 0 / 空字符串也必须保留。
 */
export function stripTransientFieldsForCloud(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
  var cleaned = {};
  Object.keys(row).forEach(function(key){
    if (key.charAt(0) === '_') return;
    if (typeof row[key] === 'function') return;
    cleaned[key] = row[key];
  });
  return cleaned;
}

export function cloudConflictKey(key) {
  return key === 'dd' || key === 'wd' ? 'ord_id' : 'id';
}

export function hasInvalidCloudSerialId(value) {
  if (value === null || value === undefined || value === '') return true;
  var text = String(value).trim().toLowerCase();
  return text === 'null' || text === 'undefined' || text === 'nan' || !Number.isFinite(Number(value));
}

export function prepareCloudRow(key, row) {
  var cleaned = stripTransientFieldsForCloud(row);
  if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) return cleaned;
  if ((key === 'dd' || key === 'wd') && hasInvalidCloudSerialId(cleaned.id)) {
    var copy = { ...cleaned };
    delete copy.id;
    return copy;
  }
  return cleaned;
}

export function normalizeLocalRowsBeforeSave(key, rows) {
  if (!Array.isArray(rows)) return rows;
  if (key !== 'dd' && key !== 'wd') return rows.map(stripTransientFieldsForCloud);
  return rows.map(function(row) {
    var cleaned = stripTransientFieldsForCloud(row);
    if (cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned) && hasInvalidCloudSerialId(cleaned.id)) {
      var copy = { ...cleaned };
      delete copy.id;
      return copy;
    }
    return cleaned;
  });
}

export function stableCloudSerialId(key, row, idx) {
  var seed = key + '|' + (row.ord_id || row.ordId || row.no || row.id || idx || 0);
  var hash = 2166136261;
  String(seed).split('').forEach(function(ch) {
    hash ^= ch.charCodeAt(0);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  });
  return 1000000 + (Math.abs(hash >>> 0) % 1900000000);
}

export function withFallbackSerialIds(key, payload) {
  if (key !== 'wd' && key !== 'dd') return payload;
  return (payload || []).map(function(row, idx) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    if (!hasInvalidCloudSerialId(row.id)) return row;
    return { ...row, id: stableCloudSerialId(key, row, idx) };
  });
}

export function withoutCloudColumns(payload, columns) {
  var skip = {};
  (columns || []).forEach(function(column) {
    skip[column] = true;
  });
  return (payload || []).map(function(row) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    var copy = {};
    Object.keys(row).forEach(function(key) {
      if (!skip[key]) copy[key] = row[key];
    });
    return copy;
  });
}

export function missingCloudColumnsForSchemaError(key, message) {
  var msg = String(message || '').toLowerCase();
  if (key === 'ret' && msg.indexOf("'deduct_kg' column") >= 0) {
    return ['deduct_kg', 'deduct_kG'];
  }
  if (key === 'fgo' && (
    msg.indexOf("'status' column") >= 0 ||
    msg.indexOf("'duplicate_of' column") >= 0 ||
    msg.indexOf("'no_restock_on_void' column") >= 0 ||
    msg.indexOf("'void_reason' column") >= 0 ||
    msg.indexOf("'voided_at' column") >= 0
  )) {
    return ['status', 'duplicate_of', 'no_restock_on_void', 'void_reason', 'voided_at'];
  }
  if (key === 'ar' && msg.indexOf("'receipt_account_") >= 0) {
    return [
      'receipt_account_type',
      'receipt_account_name',
      'receipt_account_bank',
      'receipt_account_no',
      'receipt_account_note',
    ];
  }
  return [];
}

export function pendingDeleteIdsForKey(key, deleteQueue, tableMap = TABLE_MAP) {
  var table = tableMap[key];
  var ids = {};
  (deleteQueue || []).forEach(function(item) {
    if (!item || !item.id) return;
    if (item.key === key || item.table === table) ids[item.id] = true;
  });
  return ids;
}

export function filterRowsPendingDelete(key, rows, deleteQueue, tableMap = TABLE_MAP) {
  var ids = pendingDeleteIdsForKey(key, deleteQueue, tableMap);
  return (rows || []).filter(function(row) {
    return !(row && row.id && ids[row.id]);
  });
}

/**
 * 从墓碑列表中提取指定业务键的已删除记录 ID。
 * 墓碑格式：{ bizKey, tableName, recordId }
 */
export function tombstoneIdsForKey(key, tombstones, tableMap = TABLE_MAP) {
  var table = tableMap[key];
  var ids = {};
  (tombstones || []).forEach(function(t) {
    if (!t || !t.recordId) return;
    if (t.bizKey === key || t.tableName === table) ids[t.recordId] = true;
  });
  return ids;
}

/**
 * 过滤掉已被墓碑标记的行（防止云端已删除数据重新被拉回本地）。
 */
export function filterRowsBlockedByTombstones(key, rows, tombstones, tableMap = TABLE_MAP) {
  var ids = tombstoneIdsForKey(key, tombstones, tableMap);
  return (rows || []).filter(function(row) {
    return !(row && row.id && ids[row.id]);
  });
}

/**
 * 合并云端数据与本地独有记录，同时阻止被墓碑标记的旧缓存重新上传。
 * 返回合并结果、可恢复的本地独有记录、和被拦截的墓碑记录。
 */
export function mergeCloudRowsWithLocalOnly(key, cloudRows, allLocalRows, localOnlyDirty, tombstones, tableMap = TABLE_MAP) {
  var tombIds = tombstoneIdsForKey(key, tombstones, tableMap);
  var cloudIdSet = {};
  (cloudRows || []).forEach(function(r) { if (r && r.id) cloudIdSet[r.id] = true; });

  var localOnly = [];
  var blockedLocalOnly = [];

  (allLocalRows || []).forEach(function(row) {
    if (!row || !row.id) return;
    if (cloudIdSet[row.id]) return;
    if (tombIds[row.id]) {
      blockedLocalOnly.push(row);
    } else {
      localOnly.push(row);
    }
  });

  return {
    localOnly: localOnly,
    blockedLocalOnly: blockedLocalOnly,
    merged: (cloudRows || []).concat(localOnly),
  };
}

/**
 * 计算同步计划：给定脏表集合和推送结果，返回哪些表应跳过快照、哪些应拉取、
 * 哪些 dirty flag 应清除、哪些应保留。
 *
 * 对应 index.html 中 pullFromSupabase() 的 push → skip dirty → pull → clear 流程。
 *
 * @param {string[]} dirtyKeys  — 同步开始前 dirty flag 已设置的键
 * @param {string[]} pushedKeys — 成功推送的键
 * @param {string[]} allKeys    — 所有可能的键（默认 ALL_KEYS）
 * @returns {{ skipPull: string[], pullKeys: string[], clearedDirty: string[], remainingDirty: string[] }}
 */
export function computeSyncPlan(dirtyKeys, pushedKeys, allKeys) {
  allKeys = allKeys || ALL_KEYS;
  var dirtySet = {};
  dirtyKeys.forEach(function(k){ dirtySet[k] = true; });

  var skipPull = [];
  var pullKeys = [];

  allKeys.forEach(function(key){
    if (dirtySet[key] || pushedKeys.indexOf(key) >= 0) {
      skipPull.push(key);
    } else {
      pullKeys.push(key);
    }
  });

  var clearedDirty = pushedKeys.filter(function(k){ return dirtySet[k]; });
  var remainingDirty = dirtyKeys.filter(function(k){ return pushedKeys.indexOf(k) < 0; });

  return {
    skipPull: skipPull,
    pullKeys: pullKeys,
    clearedDirty: clearedDirty,
    remainingDirty: remainingDirty,
  };
}

/**
 * 模拟完整 pullFromSupabase 决策流。
 * 纯函数：无 I/O、无 side effect。
 *
 * @param {string[]}          dirtyKeys   — dirty flag 已设置的键
 * @param {object}            pushResults — { key: true/false } 模拟 push 结果
 * @param {string[]}          allKeys     — 所有可能的键
 * @returns {{ pushedKeys, skipPull, pullKeys, clearedDirty, remainingDirty }}
 */
export function simulateSyncFlow(dirtyKeys, pushResults, allKeys) {
  allKeys = allKeys || ALL_KEYS;
  // Step 1: 根据 push 结果确定成功推送的表
  var pushedKeys = dirtyKeys.filter(function(k){ return pushResults[k] === true; });

  // Step 2 & 3: 计算同步计划
  return computeSyncPlan(dirtyKeys, pushedKeys, allKeys);
}

/**
 * 带版本保险的同步计划。
 * 在 computeSyncPlan 基础上增加版本检查：
 * 如果某个表在推送期间版本发生变化（有新本地保存），则不清理其 dirty flag。
 *
 * @param {string[]} dirtyKeys     — dirty flag 已设置的键
 * @param {string[]} pushedKeys    — 成功推送的键
 * @param {object}   preSyncVers   — { key: version } 推送发起前的版本号
 * @param {object}   postSyncVers  — { key: version } 推送完成后的版本号
 * @param {string[]} allKeys       — 所有可能的键
 */
export function computeSyncPlanWithVersion(dirtyKeys, pushedKeys, preSyncVers, postSyncVers, allKeys) {
  var plan = computeSyncPlan(dirtyKeys, pushedKeys, allKeys);

  // 版本检查：推送期间版本变了 → 不清除 dirty flag
  var versionedDirty = plan.clearedDirty.filter(function(k){
    var pre = preSyncVers[k] || 0;
    var post = postSyncVers[k] || 0;
    return post === pre; // 版本未变 → 允许清除
  });
  var versionBlocked = plan.clearedDirty.filter(function(k){
    var pre = preSyncVers[k] || 0;
    var post = postSyncVers[k] || 0;
    return post !== pre; // 版本变了 → 保留 dirty
  });

  return {
    skipPull: plan.skipPull,
    pullKeys: plan.pullKeys,
    clearedDirty: versionedDirty,
    remainingDirty: plan.remainingDirty.concat(versionBlocked),
    versionBlocked: versionBlocked,
  };
}
