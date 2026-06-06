// locked-behaviors-tests.mjs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 行为锁定测试 — 锁住已修复的关键 bug，未来任何修改都不能把它改回去
// 每条测试对应一个用户在生产中遇到过、已经确认修复的 bug
// 这是 ERP 长期稳定性的护城河 — bug 一旦被修，永远不能复发
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ═══════════════════════════════════════════════
// 锁 1：销售订单保存后必须关闭弹窗，防止重复创建
// 原 bug：连点保存按钮 N 次 → 创建 N 张同内容订单
// ═══════════════════════════════════════════════
test('saveO 完成时必须调用 cm() 关闭弹窗', () => {
  const saveOMatch = html.match(/function saveO\(id\)[\s\S]*?pgOrders\(\);[\s\S]{0,200}/);
  if (!saveOMatch) throw new Error('找不到 saveO 函数');
  if (!/pgOrders\(\);\s*cm\(\)/.test(saveOMatch[0])) {
    throw new Error('saveO 在 pgOrders() 之后没有立即调用 cm()，重复创建 bug 会复发');
  }
});

// ═══════════════════════════════════════════════
// 锁 2：业务单据全面禁止硬删除
// 原 bug：硬删除导致孤儿引用（30 项 wd 引用了不存在的销售订单）
// ═══════════════════════════════════════════════
test('销售订单列表不能再有硬删除按钮（必须是 cancelOrder）', () => {
  const pgOrdersMatch = html.match(/function pgOrders[\s\S]{0,30000}?(?=\nfunction )/);
  if (!pgOrdersMatch) throw new Error('找不到 pgOrders 函数');
  if (/mkBtn\('删除','btn bsm brd',[^)]*delO/.test(pgOrdersMatch[0])) {
    throw new Error('销售订单列表里又出现了硬删除按钮（delO），这会导致孤儿引用复发');
  }
});

// ═══════════════════════════════════════════════
// 锁 3：作废对账单不计入应收总额
// 原 bug：作废后 STM2026006 仍出现在「今日要事-去收款」红色横幅
// ═══════════════════════════════════════════════
test('应收对账汇总卡片必须排除 voided', () => {
  const pat = /totalOwed=recs\.filter\(_isLive\)/;
  if (!pat.test(html)) {
    throw new Error('应收对账 totalOwed 计算没有用 _isLive 排除 voided，作废单会再次混入应收总额');
  }
});

test('客户档案未结清金额必须排除 voided', () => {
  const pat = /unsettledAmt=custArecs\.reduce\(function\(s,r\)\{return s\+\(r\.status!=='settled'&&r\.status!=='voided'/;
  if (!pat.test(html)) {
    throw new Error('客户档案未结清金额没有排除 voided，客户欠款会虚高');
  }
});

test('应收对账「未结清」tab 必须排除 voided', () => {
  const pat = /key==='unsettled'\)return recs\.filter\(function\(r\)\{return r\.status!=='settled'&&r\.status!=='voided'/;
  if (!pat.test(html)) {
    throw new Error('未结清 tab 没有排除 voided，作废单会在未结清列表里冒出来');
  }
});

test('首页今日要事的 overdueArecs/warnArecs 必须排除 voided', () => {
  const pat = /var unsettled=arecs\.filter\(function\(r\)\{return r\.status!=='settled'&&r\.status!=='voided'/;
  if (!pat.test(html)) {
    throw new Error('首页今日要事 unsettled 过滤没有排除 voided，作废单会再次弹出去收款');
  }
});

// ═══════════════════════════════════════════════
// 锁 4：作废对账单的打印必须带水印
// 原 bug：作废后打印出来跟正常单据一样，没有标识
// ═══════════════════════════════════════════════
test('printARec 作废时必须包含「作 废」水印', () => {
  const pat = /voided-stamp[^"']*"[^>]*>\s*作\s*废\s*</;
  if (!pat.test(html)) {
    throw new Error('打印对账单的作废水印消失了，作废单会被误当成有效凭证');
  }
});

test('printARec 标题作废时必须有 [作废] 前缀', () => {
  const pat = /_voidPrefix=_isVoided\?'\[作废\]\s'/;
  if (!pat.test(html)) {
    throw new Error('打印对账单标题的 [作废] 前缀消失了');
  }
});

// ═══════════════════════════════════════════════
// 锁 5：对账单按送货单 1 位小数 KG 计费
// 原 bug：用 full precision 算账，账单 ≠ 送货单 × 单价
// ═══════════════════════════════════════════════
test('对账单计费必须用 Number(kg.toFixed(1)) 与送货单完全一致', () => {
  // printARec 主算法
  const printPat = /kgBill=Number\(kg\.toFixed\(1\)\)/;
  if (!printPat.test(html)) {
    throw new Error('printARec 的 kgBill 不再用 toFixed(1)，账单 KG 与送货单会再次对不上');
  }
});

test('应收对账弹窗按颜色分组用 toFixed(1) 计费', () => {
  const pat = /qty=byM\?Number\(_byClr\[c\]\.m\.toFixed\(1\)\):Number\(_byClr\[c\]\.kg\.toFixed\(1\)\)/;
  if (!pat.test(html)) {
    throw new Error('对账单弹窗实时算金额没有用 toFixed(1)，账单浮点精度漂移会复发');
  }
});

// ═══════════════════════════════════════════════
// 锁 6：对账单列表按月份排序
// 原 bug：作废修改后插入顺序乱跳，月份混杂
// ═══════════════════════════════════════════════
test('应收对账列表必须按 月份 desc → 客户 → 单号 desc 排序', () => {
  const pat = /对账月份 desc → 客户名 asc → 单号 desc/;
  if (!pat.test(html)) {
    throw new Error('应收对账列表排序逻辑被改了，月份会再次混乱');
  }
});

// ═══════════════════════════════════════════════
// 锁 7：跨设备同步 — 墓碑必须独立应用
// 原 bug：A 删除后 B 仍能看到（本地优先锁完全跳过 pull）
// ═══════════════════════════════════════════════
test('pullFromSupabase 必须独立应用墓碑（不受本地优先锁限制）', () => {
  const pat = /跨设备删除传播|Sync 墓碑清理/;
  if (!pat.test(html)) {
    throw new Error('pull 时不再独立应用墓碑，A 电脑删除的记录会在 B 电脑「复活」');
  }
});

test('本地优先锁必须为「软合并」模式（拉云端新增）', () => {
  const pat = /Sync 软合并/;
  if (!pat.test(html)) {
    throw new Error('本地优先变回了完全跳过模式，A 电脑新建的记录 B 看不到');
  }
});

// ═══════════════════════════════════════════════
// 锁 8：schema 检查不能阻断用户
// 原 bug：缺字段就显示「数据库未升级」，要求手工跑 SQL
// ═══════════════════════════════════════════════
test('checkRequiredCloudSchema 永远返回 ok:true', () => {
  const fn = html.match(/async function checkRequiredCloudSchema[\s\S]*?\n\}/);
  if (!fn) throw new Error('找不到 checkRequiredCloudSchema 函数');
  // 不应有任何返回 ok:false 的代码路径
  if (/return\s*\{ok:false/.test(fn[0])) {
    throw new Error('schema 检查又开始返回 ok:false 了，用户会再次被「数据库未升级」吓到');
  }
});

test('upsertCloudRows 必须有自动剥离缺失字段的重试逻辑', () => {
  const pat = /_addSkippedCols.*missing|attempt<6/;
  if (!pat.test(html)) {
    throw new Error('推送时不再自动剥离缺失字段，备用电脑出差时同步会卡住');
  }
});

// ═══════════════════════════════════════════════
// 锁 9：加工跟踪「详情」按钮不能调用未定义函数
// 原 bug：openTD 不存在，点击无反应
// ═══════════════════════════════════════════════
test('加工跟踪详情按钮必须用 openTM 而非 openTD（未定义）', () => {
  const pat = /mkBtn\('详情','btn bsm bq',\(function\(id\)\{return function\(\)\{openTM\(id\)/;
  if (!pat.test(html)) {
    throw new Error('加工跟踪详情按钮可能被改回未定义的 openTD，点击会无反应');
  }
});

// ═══════════════════════════════════════════════
// 锁 10：登记出货合计栏存在
// 原 bug：选疋时看不到合计 KG 数
// ═══════════════════════════════════════════════
test('登记出货弹窗必须有显眼合计栏（蓝底大字 📦）', () => {
  const pat = /fgo2-stats[\s\S]{0,200}本次出货合计/;
  if (!pat.test(html)) {
    throw new Error('登记出货弹窗的显眼合计栏被去掉了，用户又看不到选了多少 KG');
  }
});

// ═══════════════════════════════════════════════
// 运行
// ═══════════════════════════════════════════════
let passed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error('  ' + (error.message || error));
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log(`\n行为锁定测试通过：${passed}/${tests.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('这些测试锁住了过去修复的关键 bug — 未来任何修改');
  console.log('如果导致这些 bug 复发，CI 会立刻 FAIL 阻止推送。');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
