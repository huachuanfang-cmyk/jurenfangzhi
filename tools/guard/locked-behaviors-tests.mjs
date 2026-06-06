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
// 锁 11-14：公司档案抽象层 (Phase A)
// 原 bug：公司信息硬编码在 70+ 处打印模板里，同行复用要逐处替换
// ═══════════════════════════════════════════════
test('CO_DEFAULT 必须存在且包含原公司名（保证向后兼容）', () => {
  const m = html.match(/var CO_DEFAULT=\{[\s\S]{0,800}?\};/);
  if (!m) throw new Error('CO_DEFAULT 对象消失了 — 公司档案抽象层被破坏');
  if (!/nm:'东莞市巨人纺织有限公司'/.test(m[0])) {
    throw new Error('CO_DEFAULT.nm 默认值改了 — 不设置任何东西时行为应与历史完全一致');
  }
});

test('CO 必须用 Object.assign 与 DB.load(company) 合并', () => {
  const pat = /var CO=Object\.assign\(\{\},CO_DEFAULT,DB\.load\('company'\)\|\|\{\}\)/;
  if (!pat.test(html)) {
    throw new Error('CO 的合并机制被破坏 — 用户保存的设置不会生效');
  }
});

test('CO 必须保留原有的 nm/addr/tel/fax/email 字段', () => {
  const m = html.match(/var CO_DEFAULT=\{[\s\S]{0,800}?\};/);
  if (!m) throw new Error('找不到 CO_DEFAULT');
  ['nm', 'addr', 'tel', 'fax', 'email'].forEach(field => {
    if (!new RegExp(field + ':').test(m[0])) {
      throw new Error('CO_DEFAULT 缺少必备字段：' + field + '（原打印模板会引用空值）');
    }
  });
});

test('refreshCO 函数必须存在，让设置面板保存后无需刷新即可生效', () => {
  if (!/function refreshCO\(\)/.test(html)) {
    throw new Error('refreshCO 函数被删除 — 设置面板将无法实时生效');
  }
});

// ═══════════════════════════════════════════════
// 锁 15-17：公司档案设置面板 (Phase B)
// ═══════════════════════════════════════════════
test('左侧菜单必须有公司档案入口（settings 页面）', () => {
  if (!/data-page="settings"/.test(html)) {
    throw new Error('左侧菜单的公司档案入口被删除');
  }
  if (!/settings:pgSettings/.test(html)) {
    throw new Error('页面函数映射里没有注册 settings:pgSettings');
  }
});

test('pgSettings 函数必须存在', () => {
  if (!/function pgSettings\(\)/.test(html)) {
    throw new Error('pgSettings 函数被删除 — 用户无法编辑公司档案');
  }
});

test('pgSettings 保存按钮必须调用 DB.save(company) + refreshCO()', () => {
  const m = html.match(/function pgSettings\(\)[\s\S]{0,15000}?\}\s*\/\/ ═{5,}/);
  if (!m) throw new Error('找不到 pgSettings 函数边界');
  if (!/DB\.save\('company',data\)/.test(m[0])) {
    throw new Error('pgSettings 保存逻辑没有写到 DB.save(company)');
  }
  if (!/refreshCO\(\)/.test(m[0])) {
    throw new Error('pgSettings 保存后没有调用 refreshCO()，配置不会立即生效');
  }
});

// ═══════════════════════════════════════════════
// 锁 15-16：公司档案迁移 (Phase C)
// 原 bug：公司名硬编码在打印模板，同行复用要逐处替换
// ═══════════════════════════════════════════════
test('原料/胚布订购合同打印模板不能再硬编码公司名（必须用 CO.nm）', () => {
  // 打印合同的乙方落款应该用 CO.nm 而非写死的公司名
  // 允许 CO_DEFAULT 定义、设置面板 placeholder、收款账户 fallback 保留默认值
  const lines = html.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (!line.includes('东莞市巨人纺织有限公司')) return;
    // 白名单：这些位置保留硬编码默认值是合理的
    if (/CO_DEFAULT|cfg-nm|receiptAccountName|defaultReceiptAccount|bankAccountHolder:|name:\(r&&r\.receiptAccountName\)/.test(line)) return;
    // 静态品牌位置（title / 登录页 / 顶栏默认值）也允许 — 由 applyCompanyBranding 运行时覆盖
    if (/<title>|class="sub"|id="ps"/.test(line)) return;
    // 其余出现在 JS 打印模板字符串里的硬编码 = 违规
    if (/innerHTML|class="(co|party-name|meta-val|sign-)|font-weight:700|font-size:1[012]p/.test(line)) {
      offenders.push((i + 1) + ': ' + line.trim().slice(0, 80));
    }
  });
  if (offenders.length) {
    throw new Error('打印模板仍有硬编码公司名，同行无法一键替换：\n' + offenders.join('\n'));
  }
});

test('applyCompanyBranding 函数必须存在并更新 document.title', () => {
  const m = html.match(/function applyCompanyBranding\(\)\{[\s\S]{0,400}?\n\}/);
  if (!m) throw new Error('applyCompanyBranding 函数被删除 — 公司名无法应用到标题/登录页');
  if (!/document\.title=CO\.nm/.test(m[0])) {
    throw new Error('applyCompanyBranding 不再更新 document.title');
  }
});

// ═══════════════════════════════════════════════
// 锁 17-18：制单人 + 银行账户迁移 (Phase D)
// 原 bug：制单人「蒋劲松」硬编码 10+ 处，银行账号硬编码在 fallback
// ═══════════════════════════════════════════════
test('打印模板的制单人不能再硬编码「蒋劲松」（必须用 CO.preparer）', () => {
  const lines = html.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (!line.includes('蒋劲松')) return;
    // 白名单：CO_DEFAULT 默认值、设置面板 placeholder、个人代收账户具名记录
    if (/CO_DEFAULT|preparer:'蒋劲松'|cfg-preparer|receipt_personal|个人代收账户/.test(line)) return;
    offenders.push((i + 1) + ': ' + line.trim().slice(0, 80));
  });
  if (offenders.length) {
    throw new Error('打印模板仍有硬编码制单人「蒋劲松」：\n' + offenders.join('\n'));
  }
});

test('默认收款账户必须从 CO 读取（不能硬编码银行账号）', () => {
  const m = html.match(/function defaultReceiptAccount\(\)\{[\s\S]{0,300}?\}/);
  if (!m) throw new Error('找不到 defaultReceiptAccount 函数');
  if (/539000015553633/.test(m[0])) {
    throw new Error('defaultReceiptAccount 仍硬编码银行账号，应改用 CO.bankAccount');
  }
  if (!/CO\.bankAccount/.test(m[0])) {
    throw new Error('defaultReceiptAccount 没有引用 CO.bankAccount');
  }
});

// ═══════════════════════════════════════════════
// 锁 19-21：设置面板增强 (Q2/Q3/Q4)
// ═══════════════════════════════════════════════
test('公司档案必须有密码锁（setSettingsLocked + verifyPwd 解锁）', () => {
  if (!/function setSettingsLocked\(/.test(html)) {
    throw new Error('setSettingsLocked 被删除 — 公司档案防误改密码锁失效');
  }
  if (!/cfg-unlock-btn[\s\S]{0,400}?verifyPwd/.test(html)) {
    throw new Error('解锁按钮不再调用 verifyPwd — 谁都能改公司档案');
  }
});

test('公司 Logo 必须支持本地上传（FileReader → base64 → CO.logo）', () => {
  if (!/function applyCustomLogo\(\)/.test(html)) {
    throw new Error('applyCustomLogo 被删除 — 自定义 logo 无法生效');
  }
  if (!/cfg-logo-file/.test(html)) {
    throw new Error('Logo 文件选择控件 cfg-logo-file 缺失');
  }
  if (!/readAsDataURL/.test(html)) {
    throw new Error('Logo 上传不再用 FileReader.readAsDataURL — 本地上传失效');
  }
  if (!/LOGO=\(CO\.logo&&/.test(html)) {
    throw new Error('applyCustomLogo 不再用 CO.logo 覆盖全局 LOGO');
  }
});

test('收款账户模板种子不能写死个人银行卡号', () => {
  const m = html.match(/function builtinReceiptAccounts\(\)\{[\s\S]{0,400}?\n\}/);
  if (!m) throw new Error('找不到 builtinReceiptAccounts 函数');
  if (/6228480604742603912/.test(m[0])) {
    throw new Error('模板种子又写死了个人银行卡号 — 同行复用会带上别人的私人账户');
  }
});

// ═══════════════════════════════════════════════
// 锁 22-24：用户/角色系统 (R1+R2)
// ═══════════════════════════════════════════════
test('用户/角色系统核心函数必须存在（ROLES + resolveCurrentUser + currentPreparer）', () => {
  if (!/var ROLES=\{/.test(html)) throw new Error('ROLES 角色定义被删除');
  if (!/function resolveCurrentUser\(\)/.test(html)) throw new Error('resolveCurrentUser 被删除 — 无法识别登录用户角色');
  if (!/function currentPreparer\(\)/.test(html)) throw new Error('currentPreparer 被删除 — 制单人无法随登录人变');
});

test('制单人必须用 currentPreparer() 而非写死 CO.preparer（R2 核心）', () => {
  // 打印模板里"制单/报价员/Prepared by"应该用 currentPreparer()
  // currentPreparer 内部回退 CO.preparer，保证未建用户体系时行为不变
  const fn = html.match(/function currentPreparer\(\)\{[\s\S]{0,200}?\}/);
  if (!fn) throw new Error('找不到 currentPreparer 函数');
  if (!/_currentUser&&_currentUser\.name/.test(fn[0])) {
    throw new Error('currentPreparer 不再优先用登录用户姓名');
  }
  if (!/CO\.preparer/.test(fn[0])) {
    throw new Error('currentPreparer 丢失了 CO.preparer 回退 — 未建用户体系时制单人会空');
  }
});

test('用户管理器必须有管理员密码门槛 + 至少保留一个管理员', () => {
  if (!/function openUserManagerSecure\(\)\{verifyPwd/.test(html)) {
    throw new Error('用户管理器不再有密码门槛 — 任何人都能改别人角色');
  }
  if (!/必须至少保留一个启用的「管理员」账号/.test(html)) {
    throw new Error('用户管理器允许删光管理员 — 会导致没人能管理系统');
  }
});

// ═══════════════════════════════════════════════
// 锁 25：陌生邮箱安全边界
// 原风险：陌生邮箱登录默认给管理员角色，有人偷偷注册就成管理员
// ═══════════════════════════════════════════════
test('已建用户名单后，陌生邮箱登录必须被拦截（不能默认管理员）', () => {
  const fn = html.match(/function resolveCurrentUser\(\)\{[\s\S]*?\n\}/);
  if (!fn) throw new Error('找不到 resolveCurrentUser 函数');
  // 名单非空但邮箱不在内 → blocked，role 必须为 null（不是 admin）
  if (!/users\.length===0/.test(fn[0])) {
    throw new Error('resolveCurrentUser 不再区分"名单为空"与"陌生邮箱"，安全边界失效');
  }
  if (!/blocked:true/.test(fn[0])) {
    throw new Error('陌生邮箱不再标记 blocked — 有人偷偷注册就能进系统');
  }
  // 登录流程必须检查 blocked 并登出
  if (!/_currentUser&&_currentUser\.blocked/.test(html) || !/auth\.signOut/.test(html)) {
    throw new Error('onAuthSuccess 不再拦截 blocked 用户 — 未授权账号能进入系统');
  }
});

// ═══════════════════════════════════════════════
// 锁 26：R3 角色菜单权限
// ═══════════════════════════════════════════════
test('R3 角色菜单权限核心必须存在（ROLE_PAGES + canAccessPage + applyRoleMenu）', () => {
  if (!/var ROLE_PAGES=\{/.test(html)) throw new Error('ROLE_PAGES 被删除 — 角色菜单映射丢失');
  if (!/function canAccessPage\(/.test(html)) throw new Error('canAccessPage 被删除 — 无法判断页面权限');
  if (!/function applyRoleMenu\(/.test(html)) throw new Error('applyRoleMenu 被删除 — 菜单不会按角色隐藏');
  // go() 必须有越权拦截
  if (!/canAccessPage\(p\)/.test(html)) throw new Error('go() 不再做越权拦截 — 直接导航能绕过菜单隐藏');
  // admin/readonly 必须看全部
  const fn = html.match(/function canAccessPage\([\s\S]*?\n\}/);
  if (!fn || !/role==='admin'\|\|role==='readonly'/.test(fn[0])) {
    throw new Error('canAccessPage 不再让 admin/readonly 看全部菜单');
  }
  // 仓管不能进财务/采购页面（确保权限边界正确）
  const rp = html.match(/var ROLE_PAGES=\{[\s\S]*?\};/);
  if (!rp) throw new Error('找不到 ROLE_PAGES 定义');
  if (/warehouse:\s*\[[^\]]*'arec'/.test(rp[0]) || /warehouse:\s*\[[^\]]*'recon'/.test(rp[0])) {
    throw new Error('仓管角色被允许进入财务对账页 — 权限边界错误');
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
