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
  const pat = /墓碑清理|syncTombstonesAndPurge/;
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

test('防丢数：弹窗未保存改动需确认才能关(×/遮罩/取消/ESC) + 存储配额预警', () => {
  // cmSafe:有未保存改动时确认;保存成功走 cm() 不弹
  if (!/function cmSafe\(\)\{/.test(html)) throw new Error('缺少 cmSafe(未保存确认关闭)');
  if (!/window\._modalDirty&&!confirm/.test(html)) throw new Error('cmSafe 未检查未保存改动');
  // 三个关闭入口都必须走 cmSafe(不能退回直接 cm 静默丢数)
  if (!/if\(e\.target===o\)cmSafe\(\)/.test(html)) throw new Error('点遮罩关闭未走 cmSafe');
  if (!/x\.onclick=function\(e\)\{if\(e\)e\.preventDefault\(\);cmSafe\(\);\}/.test(html)) throw new Error('× 按钮关闭未走 cmSafe');
  if (!/mkBtn\('取消','btn bs',cmSafe\)/.test(html)) throw new Error('取消按钮未走 cmSafe');
  // 弹窗内输入即标记 dirty(事件委托)
  if (!/window\._modalDirty=true/.test(html)) throw new Error('缺少弹窗输入 dirty 标记');
  // ESC 全局关闭:先关 .lite-ov 轻量浮层,再关主弹窗
  if (!/e\.key!=='Escape'/.test(html)) throw new Error('缺少 ESC 全局关闭');
  if (!/querySelectorAll\('\.lite-ov'\)/.test(html)) throw new Error('ESC 未优先关闭轻量浮层 .lite-ov');
  // localStorage 配额预警(>4MB)
  if (!/function checkStorageQuota\(\)/.test(html)) throw new Error('缺少 checkStorageQuota 存储配额预警');
  if (!/checkStorageQuota\(\);/.test(html)) throw new Error('登录后未调用存储配额检查');
});

test('applyCompanyBranding 函数必须存在并更新 document.title', () => {
  const m = html.match(/function applyCompanyBranding\(\)\{[\s\S]{0,800}?\n\}/);
  if (!m) throw new Error('applyCompanyBranding 函数被删除 — 公司名无法应用到标题/登录页');
  if (!/document\.title=CO\.nm/.test(m[0])) {
    throw new Error('applyCompanyBranding 不再更新 document.title');
  }
  // 侧边栏公司名也要由配置驱动(白标用)
  if (!/\.la \.ln'\)/.test(m[0])) throw new Error('applyCompanyBranding 未更新侧边栏公司名');
  // 起动时必须调用一次(自定义社名首屏即生效)
  if (!/applyCompanyBranding\(\); \/\/ 起动/.test(html)) throw new Error('启动时未调用 applyCompanyBranding(自定义公司名首屏不生效)');
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
// 锁 27：工作台财务数据按角色隐藏 + 登录角色快速解析
// ═══════════════════════════════════════════════
test('canSeeFinance 必须存在且仅 admin/finance/readonly 可见财务', () => {
  const fn = html.match(/function canSeeFinance\(\)\{[\s\S]*?\n\}/);
  if (!fn) throw new Error('canSeeFinance 被删除 — 工作台财务数据无法按角色隐藏');
  if (!/role==='admin'\|\|role==='finance'\|\|role==='readonly'/.test(fn[0])) {
    throw new Error('canSeeFinance 角色判断被改 — 财务可见性边界错误');
  }
});

test('工作台财务数据（金额/应收催款）必须用 canSeeFinance 门控', () => {
  // 本月出货金额、有产无收款、应收催款 都应被 canSeeFinance 包裹
  if (!/if\(canSeeFinance\(\)\)overdueArecs/.test(html)) {
    throw new Error('今日要事的逾期应收催款没有用 canSeeFinance 门控 — 仓管能看到收款数据');
  }
  if (!/_showAmt=canSeeFinance\(\)/.test(html)) {
    throw new Error('本月出货金额卡片没有用 canSeeFinance 门控');
  }
});

test('登录后先快速拉 app_users 表，避免退出再登的管理员闪现', () => {
  if (!/from\('app_users'\)\.select\('\*'\)[\s\S]{0,300}?resolveCurrentUser/.test(html)) {
    throw new Error('登录流程不再先拉 app_users 解析角色 — 退出再登会出现管理员闪现');
  }
});

test('全新设备防闪现三层防线（角色缓存 + 最小权限默认 + CSS）', () => {
  if (!/function applyCachedRoleEarly\(\)/.test(html)) throw new Error('applyCachedRoleEarly 被删除 — 缓存角色无法秒级应用');
  if (!/role-pending-min/.test(html)) throw new Error('role-pending-min 最小权限默认丢失 — 全新设备会闪现管理员菜单');
  if (!/gjr5_role_cache/.test(html)) throw new Error('角色缓存 gjr5_role_cache 丢失');
  // role_cache 必须在退出时保留，否则退出再登仍闪现
  if (!/_keep\s*=\s*\[[^\]]*gjr5_role_cache/.test(html)) throw new Error('退出时未保留 gjr5_role_cache — 退出再登会闪现');
  // CSS 必须存在最小权限规则
  if (!/body\.role-pending-min #sb \.ni/.test(html)) throw new Error('CSS 最小权限规则缺失');
});

// ═══════════════════════════════════════════════
// 锁 28：操作日志/审计
// ═══════════════════════════════════════════════
test('操作日志核心必须存在（logAction + pgAuditLog + 云端插入）', () => {
  if (!/function logAction\(/.test(html)) throw new Error('logAction 被删除 — 操作无法留痕');
  if (!/function pgAuditLog\(/.test(html)) throw new Error('pgAuditLog 查看页被删除');
  if (!/from\('audit_logs'\)\.insert/.test(html)) throw new Error('logAction 不再写云端 audit_logs — 跨设备审计失效');
  if (!/auditlog:pgAuditLog/.test(html)) throw new Error('操作日志页未注册到 go()');
});

test('关键操作必须留痕（订单/出货/对账/收款/作废）', () => {
  const hooks = [
    { name: '订单保存', pat: /logAction\(id\?'编辑订单':'新增订单'/ },
    { name: '订单作废', pat: /logAction\('作废订单'/ },
    { name: '登记出货', pat: /logAction\('登记出货'/ },
    { name: '对账单保存', pat: /logAction\(isNew\?'新增对账单':'编辑对账单'/ },
    { name: '对账单作废', pat: /logAction\('作废对账单'/ },
    { name: '录入收款', pat: /logAction\('录入收款'/ },
    { name: '公司档案', pat: /logAction\('修改公司档案'/ },
    { name: '用户管理', pat: /logAction\('修改用户档案'/ },
  ];
  const missing = hooks.filter(h => !h.pat.test(html)).map(h => h.name);
  if (missing.length) throw new Error('以下关键操作未接入审计日志：' + missing.join('、'));
});

// ═══════════════════════════════════════════════
// 锁 29：备份页可达 + 切回标签自动同步
// ═══════════════════════════════════════════════
test('备份/恢复页必须接入菜单和路由（不能是孤儿页）', () => {
  if (!/backup:pgBackup/.test(html)) throw new Error('pgBackup 未接入 go() 路由 — 备份页无法访问');
  if (!/data-page="backup"/.test(html)) throw new Error('备份页菜单项缺失');
});

test('切回标签页自动静默同步（含编辑保护+节流）', () => {
  if (!/visibilitychange/.test(html)) throw new Error('缺少 visibilitychange 自动同步监听');
  if (!/pullFromSupabase\(true\)/.test(html)) throw new Error('自动同步未用静默模式 pullFromSupabase(true)');
  // 必须有"有弹窗不打断"保护
  if (!/querySelector\('\.mo'\)\)return/.test(html)) throw new Error('自动同步缺少"编辑中不打断"保护');
  // pullFromSupabase 必须支持静默参数
  if (!/async function pullFromSupabase\(_quiet\)/.test(html)) throw new Error('pullFromSupabase 不再支持静默参数');
});

// ═══════════════════════════════════════════════
// 锁 30：应收账龄分析
// ═══════════════════════════════════════════════
test('应收账龄分析页存在且接入路由/菜单', () => {
  if (!/function pgArAging\(/.test(html)) throw new Error('pgArAging 被删除');
  if (!/araging:pgArAging/.test(html)) throw new Error('账龄分析未接入 go() 路由');
  if (!/data-page="araging"/.test(html)) throw new Error('账龄分析菜单项缺失');
});

test('账龄分析必须排除已结清/作废，按到期日分档', () => {
  // 账龄页过滤未结清非作废 + 用 getDaysStatus 分档
  if (!/recs=\(DB\.arecs\|\|\[\]\)\.filter\(function\(r\)\{return r&&r\.status!=='settled'&&r\.status!=='voided'/.test(html)) {
    throw new Error('账龄分析未排除已结清/作废对账单');
  }
  if (!/function bucketOf\(r\)\{[\s\S]{0,120}?getDaysStatus/.test(html)) {
    throw new Error('账龄分档未使用到期日（getDaysStatus）');
  }
});

// ═══════════════════════════════════════════════
// 锁 31：客户毛利分析
// ═══════════════════════════════════════════════
test('客户毛利分析页存在且接入路由/菜单', () => {
  if (!/function pgGrossProfit\(/.test(html)) throw new Error('pgGrossProfit 被删除');
  if (!/profit:pgGrossProfit/.test(html)) throw new Error('毛利分析未接入 go() 路由');
  if (!/data-page="profit"/.test(html)) throw new Error('毛利分析菜单项缺失');
});

test('毛利成本必须从加工跟踪费用+纱线采购按订单联动汇总', () => {
  // 成本来自 trks.fee 和 yarns.amt（按订单聚合到 OS），且有成本完整度提醒
  if (!/os\.feeCost\+=fee/.test(html)) throw new Error('毛利未汇总加工跟踪加工费');
  if (!/matCost\+=amtRaw/.test(html)) throw new Error('毛利未汇总纱线采购成本');
  if (!/os\.procCost\[pk\]/.test(html)) throw new Error('未按工序拆分加工成本（成本构成展开失效）');
  if (!/成本未录/.test(html)) throw new Error('毛利缺少成本漏录提醒');
});

test('利润分析必须有 按客户/按订单/按月份 三视图', () => {
  if (!/function renderCust\(\)/.test(html)) throw new Error('缺少按客户视图');
  if (!/function renderOrd\(\)/.test(html)) throw new Error('缺少按订单视图');
  if (!/function renderMonth\(\)/.test(html)) throw new Error('缺少按月份视图');
});

// ═══════════════════════════════════════════════
// 锁 32：质量加固 — ESC 关弹窗 + 作废水印统一
// ═══════════════════════════════════════════════
test('全局 ESC 关闭标准弹窗', () => {
  if (!/e\.key!=='Escape'\)return;[\s\S]{0,200}?getElementById\('ov'\)/.test(html)) {
    throw new Error('全局 ESC 关弹窗逻辑缺失');
  }
});

test('作废单据打印必须带统一水印（出货/退货/快速出货）', () => {
  if (!/function voidPrintStamp\(/.test(html)) throw new Error('voidPrintStamp 水印助手被删除');
  if (!/voidPrintStamp\(out\.voided\)/.test(html)) throw new Error('送货单打印未注入作废水印');
  if (!/voidPrintStamp\(ret\.status==='cancelled'\|\|ret\.voided\)/.test(html)) throw new Error('退货单打印未注入作废水印');
  if (!/voidPrintStamp\(r\.voided\)/.test(html)) throw new Error('快速出货单打印未注入作废水印');
});

// ═══════════════════════════════════════════════
// 锁 33：删除复活根治 — 推送前先应用墓碑
// ═══════════════════════════════════════════════
test('推送脏数据前必须先同步墓碑清本地（防删除复活）', () => {
  if (!/async function syncTombstonesAndPurge\(\)/.test(html)) {
    throw new Error('syncTombstonesAndPurge 被删除 — 删除的数据会复活');
  }
  // 必须在 Step 1 推送之前调用
  if (!/await syncTombstonesAndPurge\(\);\s*\n\s*\/\/ Step 1/.test(html)) {
    throw new Error('syncTombstonesAndPurge 不在推送之前调用 — 脏表会把已删数据重新插回云端');
  }
});

// ═══════════════════════════════════════════════
// 锁 34：数据巡检跳过作废单据（杜绝作废单误报）
// ═══════════════════════════════════════════════
test('数据巡检的布卷/引用检查必须跳过作废单据', () => {
  // 取 findDataIntegrityIssues 函数体
  var m = html.match(/function findDataIntegrityIssues\(\)\{[\s\S]*?\n\}\n/);
  if (!m) throw new Error('找不到 findDataIntegrityIssues');
  var body = m[0];
  // 出货单布卷检查、退货单布卷检查、孤儿订单引用 都要有 arOutIsVoided 跳过
  var skips = (body.match(/if\(arOutIsVoided\([a-z]+\)\)return;/g) || []).length;
  if (skips < 4) {
    throw new Error('数据巡检跳过作废单据的守卫不足（应≥4处），作废单会误报。当前=' + skips);
  }
});

// ═══════════════════════════════════════════════
// 锁 35：应付账龄分析
// ═══════════════════════════════════════════════
test('应付账龄分析页存在且接入路由/菜单', () => {
  if (!/function pgApAging\(/.test(html)) throw new Error('pgApAging 被删除');
  if (!/apaging:pgApAging/.test(html)) throw new Error('应付账龄未接入 go() 路由');
  if (!/data-page="apaging"/.test(html)) throw new Error('应付账龄菜单项缺失');
});

test('应付账龄必须排除已付/作废，按账单日期分档', () => {
  if (!/recs=\(DB\.recons\|\|\[\]\)\.filter\(function\(r\)\{[\s\S]{0,120}?status!=='paid'&&r\.status!=='voided'/.test(html)) {
    throw new Error('应付账龄未排除已付款/作废对账单');
  }
  if (!/function baseDate\(r\)\{return r\.billDate/.test(html)) {
    throw new Error('应付账龄账龄基准未用账单日期');
  }
});

// ═══════════════════════════════════════════════
// 锁 36：隐形成本（运费/杂费）录入并计入毛利
// ═══════════════════════════════════════════════
test('销售订单有其它成本字段且保存', () => {
  if (!/o-misc/.test(html)) throw new Error('订单其它成本字段 o-misc 缺失');
  if (!/miscCost:\(document\.getElementById\('o-misc'\)/.test(html)) throw new Error('订单保存未写入 miscCost');
});

test('毛利成本必须计入订单其它成本(miscCost)', () => {
  if (!/miscCost\+=mcRaw/.test(html)) throw new Error('毛利未汇总订单其它成本');
  if (!/s\.cost=s\.feeCost\+s\.matCost\+\(s\.gfCost\|\|0\)\+\(s\.miscCost\|\|0\)\+\(s\.stockCost\|\|0\);/.test(html)) throw new Error('毛利成本合计有误（增值税不应计入成本）');
});

test('侧边栏分组折叠用CSS类(.mcol)，不动角色隐藏的 inline display', () => {
  if (!/initMenuCollapse/.test(html)) throw new Error('缺少菜单折叠初始化');
  // 折叠必须用 class，不能用 inline style.display（否则会破坏 applyRoleMenu 的角色隐藏）
  if (!/\.ni\.mcol\{display:none !important\}/.test(html)) throw new Error('折叠未用 .mcol 类');
  if (!/classList\.toggle\('mcol'/.test(html)) throw new Error('折叠未用 classList 切换 mcol');
  // applyRoleMenu 仍用 inline display 控制角色可见性，二者独立
  if (!/el\.style\.display=canAccessPage\(pg\)\?''/.test(html)) throw new Error('角色隐藏逻辑被破坏');
});

test('现货倒卖：现货采购单(按毛重付款·纸筒空差算实际单价)计入毛利', () => {
  // 模块存在
  if (!/function openSpotM\(id\)/.test(html)) throw new Error('缺少现货采购单 openSpotM');
  if (!/function pgFabStall\(\)/.test(html)) throw new Error('缺少布行档案 pgFabStall');
  if (!/sp:'spot_purchases'/.test(html)) throw new Error('spot_purchases 未接入 TABLE_MAP(同步)');
  // 金额(成本)只按「实际重量」算；未填实际重量则金额=0(避免提前按采购量误导)
  // 退货红冲后：净成本 = 留用量×单价 + 退货量×(搬运费+包装费)，未填实际重量仍=0
  if (!/var amt=act>0\?\(keptQty\*unitPr\+fee\):0;/.test(html)) throw new Error('金额应=留用量×单价+退货承担费用(未填实际重量则0)');
  if (!/function openSpotReturn\(tr\)/.test(html)) throw new Error('缺少退货红冲弹窗 openSpotReturn');
  if (!/function _spotRowNet\(row,base\)/.test(html)) throw new Error('缺少现货行净成本计算 _spotRowNet(退货红冲)');
  // 退货扣费用通用「扣费率(元/KG)」一本表示，由我方承担、计入成本(不能直接归零)；说明写备注
  if (!/function _retFeeRate\(ret\)/.test(html)) throw new Error('缺少通用退货扣费率 _retFeeRate(避免搬运/包装等子项目散乱)');
  if (!/var fee=retQty\*feeRate;/.test(html)) throw new Error('退货扣费必须 退货量×扣费率 计入我方成本');
  if (!/mkSearchableSelect\('sp-mat'/.test(html)) throw new Error('选物料应为可搜索下拉');
  // 现货采购单金额挂到关联订单毛利
  if (!/os\.stockCost\+=amt/.test(html)) throw new Error('现货采购未计入关联订单毛利');
  if (!/现货进货：/.test(html)) throw new Error('成本构成缺少现货进货明细');
  // 采购合同要带「对方货号(原编号)+规格」，让布行能识别(按选中物料或订单物料编号prodNo匹配)
  if (!/function _spotResolveMat\(matId,ordId\)/.test(html)) throw new Error('缺少现货物料解析 _spotResolveMat(带对方货号/规格)');
  if (!/d\.matOrigNo=rmat\.origNo/.test(html)) throw new Error('保存现货采购未快照对方货号(原编号)');
  if (!/对方货号\(贵司编号\)/.test(html)) throw new Error('采购合同未打印对方货号(布行无法识别)');
  // 保存必须 try/catch，避免静默闪退(可见错误提示)
  if (!/catch\(err\)\{alert\('保存失败：/.test(html)) throw new Error('现货采购保存缺少 try/catch 错误提示(防静默闪退)');
  // 可打印面料采购合同
  if (!/function prtSpot\(id\)/.test(html)) throw new Error('缺少现货采购合同打印 prtSpot');
  // 旧的订单单字段 o-stock 已删除(避免两处重复录)
  if (/getElementById\('o-stock'\)/.test(html)) throw new Error('订单旧 o-stock 字段应已删除');
  // 防回归：颜色明细渲染必须用本地引用 clrBody（build 时 modal 未挂载，getElementById 会 null 崩溃）
  if (/var tb=document\.getElementById\('sp-clr-body'\)/.test(html)) throw new Error('现货采购颜色渲染又用了 getElementById(build时崩溃)，应用本地 clrBody');
});

test('操作日志：关键单据(采购/对账/加工跟踪/报价/档案)都要留痕', () => {
  // 各模块埋点必须存在(防止有人改价/改量不留痕)
  var must=[
    "'新增纱线采购'", "'新增胚布采购'", "'新增现货采购'",
    "'新增加工跟踪'", "'作废加工跟踪'",
    "'新增应付对账'", "'标记付款'", "'作废应付对账'",
    "'新增报价单'", "'编辑物料档案'", "'新增客户档案'", "'新增加工厂档案'", "'新增布行档案'"
  ];
  must.forEach(function(k){
    if (html.indexOf('logAction('+k.slice(1)) === -1 && html.indexOf(k) === -1)
      throw new Error('操作日志缺少埋点：'+k);
  });
  // 日志本身仍是 append-only + 本地仅留最近500条(防臃肿)
  if (!/arr\.length>500\)arr=arr\.slice/.test(html)) throw new Error('操作日志本地500条上限被移除(防臃肿)');
  if (!/from\('audit_logs'\)\.insert/.test(html)) throw new Error('操作日志云端 append-only 写入被移除');
});

test('对账单金额：列表/查看/打印同一实时口径(不再三处不一致)', () => {
  if (!/function arecComputeTotals\(rec\)/.test(html)) throw new Error('缺少对账单实时合计 arecComputeTotals(单一口径)');
  // 进入对账单页时把保存值刷新成实时值,使列表=打印
  if (!/if\(refreshARecStored\(r\)\)anyChg=true/.test(html)) throw new Error('pgARec 未在进入时刷新对账单实时合计');
  // 应收口径必须与 printARec 一致：货款+附加费−退货−扣减+附加−已收(下限0)
  if (!/var balance=Math\.max\(0,grandTotal\+totalFee-returnTotal-deductTotal\+addTotal-paidTotal\)/.test(html)) throw new Error('printARec 应收公式被改,需与 arecComputeTotals 保持一致');
  if (!/balance=Math\.max\(0,billable-paidTotal\)/.test(html)) throw new Error('arecComputeTotals 应收公式被改');
  // ── 收入唯一口径(单一真相)：避免"改一处漏一处" ──
  // 颜色加价(撞白等)只有一个出处 orderColorExtra；一张出货单应收只有一个算法 outBillAmount
  if (!/function orderColorExtra\(ord,clrNm\)/.test(html)) throw new Error('缺少颜色加价唯一出处 orderColorExtra');
  if (!/function outBillAmount\(out,ord,allRolls\)/.test(html)) throw new Error('缺少出货单应收唯一口径 outBillAmount');
  // outBillAmount 必须逐疋加该色加价(extraPr)，否则少收客户
  if (!/s\+qq\*\(unitPr\+orderColorExtra\(ord,r\.colorNm\)\)/.test(html)) throw new Error('outBillAmount 未逐疋加颜色加价 extraPr');
  // 对账单实时合计 与 毛利收入 都必须走 outBillAmount(同一口径)
  if (!/grandTotal\+=outBillAmount\(out,ord,rolls\)\.amt/.test(html)) throw new Error('arecComputeTotals 未走收入唯一口径 outBillAmount');
  if (!/var b=outBillAmount\(o,ord,rolls\)/.test(html)) throw new Error('毛利收入未走收入唯一口径 outBillAmount');
  // printARec 也必须走 outBillAmount(打印=列表=毛利)
  if (!/var _bill=outBillAmount\(out,ord,rolls\)/.test(html)) throw new Error('printARec 未走收入唯一口径 outBillAmount');
  // 退货行金额含颜色加价(退货红冲才平)
  if (!/unitPr=unitPr\+_retExtra/.test(html)) throw new Error('退货行金额未含颜色加价,退货红冲会不平');
  // 单一真相：禁止任何地方再内联 parseFloat(clr.extraPr)，必须走 orderColorExtra(否则又会改一处漏一处)
  if (/parseFloat\(clr\.extraPr\)/.test(html)) throw new Error('发现内联颜色加价(parseFloat(clr.extraPr))，必须改用唯一出处 orderColorExtra');
});

test('客户退货→退回布行：自动红冲现货采购(布行退款−扣费、成本回冲)', () => {
  if (!/function openSupplierReturn\(gd,onDone\)/.test(html)) throw new Error('缺少退回布行 openSupplierReturn');
  if (!/function findSpotForColor\(ordId,colorNm\)/.test(html)) throw new Error('缺少现货采购单匹配 findSpotForColor');
  // 退回布行按钮仅对现货货(有对应现货采购单)出现
  if (!/findSpotForColor\(retGroup\[k\]\.ordId,retGroup\[k\]\.colorNm\)/.test(html)) throw new Error('退回布行按钮未限定为现货货');
  // 自动在原现货采购单红冲(写 col.ret + 重算总额)，并把退货疋移出账
  if (!/_spotRecalcTotal\(sp\)/.test(html)) throw new Error('退回布行未重算现货采购净额(成本回冲)');
  if (!/resolveRetGroup\(gd,'returned_to_supplier','returned_supplier'/.test(html)) throw new Error('退回布行未把疋标记移出账');
  if (!/returned_supplier:'↩ 已退回布行'/.test(html)) throw new Error('退货记录缺少「已退回布行」状态');
  // 退回布行的疋(returned_to_supplier)已离开本仓，必须排除出库存台账/在库统计(否则又显示回到仓库)
  if (!/\['returned','voided','repaired','written_off','returned_to_supplier'\]/.test(html)) throw new Error('isInactiveFgRoll 未排除 returned_to_supplier');
  if (!/r\.status==='returned_to_supplier'\)return;/.test(html)) throw new Error('库存台账分组未排除 returned_to_supplier(会错误显示在库)');
});

test('多色合并送货单：青色按钮可用 + 打印即出库进出货记录', () => {
  // 打印函数引用暴露给保存回调(修复跨作用域导致青色按钮无反应)
  if (!/_mcPrint=printMultiColorSheet;/.test(html)) throw new Error('多色送货单打印函数未暴露给保存回调(青色按钮会无反应)');
  if (!/if\(_mcPrint\)_mcPrint\(o,rec\.no\)/.test(html)) throw new Error('多色送货单保存回调未调用打印');
  // 出库:勾选颜色在库疋全部出库+生成fgout(与登记出货同口径)
  if (!/function shipMultiColor\(o\)/.test(html)) throw new Error('缺少多色送货单出库 shipMultiColor');
  if (!/var rec=shipMultiColor\(o\);/.test(html)) throw new Error('多色送货单保存未触发出库');
  if (!/rm:'多色合并送货单',rollIds:rollIds/.test(html)) throw new Error('多色送货单出库未生成fgout记录');
  // 防重复出货
  if (!/findDuplicateShipmentByRollIds\(rollIds,DB\.fgouts/.test(html)) throw new Error('多色送货单缺少重复出货防护');
});

test('成品入库：支持多色合并入库(一次多色·每色逐卷重量)', () => {
  if (!/function openMultiColorIn\(\)/.test(html)) throw new Error('缺少多色合并入库 openMultiColorIn');
  if (!/openMultiColorIn\(\);/.test(html)) throw new Error('成品库存页缺少「多色合并入库」入口按钮');
  // 逐卷重量：空格/逗号分隔解析成多疋
  if (!/split\(\/\[\\s,，、\]\+\//.test(html)) throw new Error('多色入库未按空格/逗号解析逐卷重量');
  // 每卷生成独立疋记录(status:in)，送货单才能展开每卷
  if (!/saveFgRolls\(existRolls\);savedN/.test(html)) throw new Error('多色入库未保存疋记录');
  // 自动核对现货采购实际重量(actQty)
  if (!/tgtByClr\[c\.nm\]=\(tgtByClr\[c\.nm\]\|\|0\)\+\(parseFloat\(c\.actQty\)/.test(html)) throw new Error('多色入库未核对现货采购实际重量');
});

test('纱线采购：单号扫描已有取最大(多设备防撞号) + 搜索筛选 + 量大保护', () => {
  // 旧版本机计数器(yarnPoSeq)多设备各数各的会撞号 — 必须扫描已有采购单取最大+1
  if (/DB\.save\('yarnPoSeq'/.test(html)) throw new Error('yarnPoNo 又用回本机计数器,多设备会撞号');
  if (!/while\(nos\[cand\]\)\{n\+\+;cand=prefix/.test(html)) throw new Error('yarnPoNo 缺少撞号兜底循环');
  // 列表必须有搜索+付款筛选(对齐其他页standard)
  if (!/mkInput\('y-q'/.test(html)) throw new Error('纱线采购列表缺少搜索框');
  if (!/mkSelect\('y-pf'/.test(html)) throw new Error('纱线采购列表缺少付款状态筛选');
  // 量大保护:默认最近100条+显示全部
  if (!/window\._yarnShowAll/.test(html)) throw new Error('纱线采购缺少量大保护(最近100条)');
  if (!/listAll\.slice\(0,100\)/.test(html)) throw new Error('纱线采购未按100条截断');
});

test('原料管理四页：搜索/筛选/量大保护 + 发料单号编辑保留', () => {
  // 胚布采购：搜索+付款筛选+100条截断+待付款卡可点
  if (!/mkInput\('gf-q'/.test(html) || !/mkSelect\('gf-pf'/.test(html)) throw new Error('胚布采购缺少搜索/付款筛选');
  if (!/window\._gfShowAll/.test(html)) throw new Error('胚布采购缺少量大保护');
  // 现货采购：付款筛选+100条截断(搜索原有)
  if (!/mkSelect\('sp-pf'/.test(html)) throw new Error('现货采购缺少付款筛选');
  if (!/window\._spotShowAll/.test(html)) throw new Error('现货采购缺少量大保护');
  // 发料/回仓：搜索+类型筛选+100条截断
  if (!/mkInput\('yo-q'/.test(html) || !/mkSelect\('yo-tf'/.test(html)) throw new Error('发料/回仓缺少搜索/类型筛选');
  if (!/window\._yoShowAll/.test(html)) throw new Error('发料/回仓缺少量大保护');
  // 发料单号：编辑必须保留原号(旧版每次保存重新随机会换号)；新建防同日撞号
  if (!/var _frNo=rec\.frNo;/.test(html)) throw new Error('发料单号编辑未保留原号');
  if (!/while\(DB\.yarnouts\.some\(function\(x\)\{return x\.frNo===_frNo;\}\)\)/.test(html)) throw new Error('发料单号缺少防撞兜底');
  // 库存总览：搜索+只看有余量(默认勾选)
  if (!/mkInput\('ys-q'/.test(html)) throw new Error('库存总览缺少搜索');
  if (!/onlyCk\.checked=true/.test(html)) throw new Error('库存总览「只看有余量」应默认勾选');
  // 工具栏下拉必须压住全局 select{width:100%}，否则在flex工具栏被顶成整页巨条(胶囊严重不协调)
  if ((html.match(/cursor:pointer;width:auto;flex:0 0 auto/g)||[]).length < 4) throw new Error('工具栏筛选下拉(y-pf/sp-pf/yo-tf/gf-pf)缺少 width:auto 压制,会被全局select{width:100%}顶成整页宽');
  if (!/全部操作人[\s\S]{0,300}width:auto|width:auto;flex:0 0 auto';\/\* 压住全局/.test(html)) throw new Error('操作日志「全部操作人」下拉未压宽度');
  if (!/max-width:170px[^']*'.{0,60}原flex:1无上限/.test(html)) throw new Error('物料档案「所有来源」下拉缺少 max-width 上限');
});

test('物料档案：列表按编号排序 + 中文搜索不闪退(异步竞态防护)', () => {
  // 列表必须按编号数值倒序(不再混乱)
  if (!/filtered\.sort\(function\(a,b\)\{var d=_matNum/.test(html)) throw new Error('物料列表未按编号排序');
  // 云端异步搜索必须有序号守卫,过期结果不得覆盖新结果(中文输入法连续触发会闪退)
  if (!/var _matRenderSeq=0/.test(html)) throw new Error('物料搜索缺少异步序号守卫(中文搜索会闪退)');
  if ((html.match(/if\(_seq!==_matRenderSeq\)return;/g)||[]).length < 2) throw new Error('物料搜索异步守卫不足(await后与渲染前都要核对)');
});

test('物料档案：单价/布行单价支持 含税切换 + 元KG/元米切换', () => {
  if (!/function priceGrp\(idBase,label/.test(html)) throw new Error('缺少复合价格控件 priceGrp');
  // 含税/不含税 + 元KG/元米 两个切换都要存
  if (!/priceTax:g\('priceTax'\)/.test(html) || !/priceUnit:g\('priceUnit'\)/.test(html)) throw new Error('单价缺少 含税/单位 字段');
  if (!/origPriceTax:g\('origPriceTax'\)/.test(html) || !/origPriceUnit:g\('origPriceUnit'\)/.test(html)) throw new Error('布行单价缺少 含税/单位 字段');
  // 原单价 已更名为 布行单价
  if (!/'布行单价'/.test(html)) throw new Error('原单价应更名为 布行单价');
});

test('报价单：录入物料编号自动带入规格/单价(全部可编辑)', () => {
  // 用 matCode(m) 做匹配(兼容 mid/prodNo/code 等)，不再只看 m.mid
  if (!/sameCode\(matCode\(m\),mid\)/.test(html)) throw new Error('报价单编号联动应用 matCode 匹配');
  // blur 与 Enter 都能触发补全
  if (!/noI\.addEventListener\('blur',fillFromMat\)/.test(html)) throw new Error('报价单编号 blur 未触发自动带入');
  if (!/noI\.addEventListener\('keydown'/.test(html)) throw new Error('报价单编号 Enter 未触发自动带入');
  // 单价也要带入(物料档案的 price/origPrice)
  if (!/prInp&&!prInp\.value&&\(mat\.price\|\|mat\.origPrice\)/.test(html)) throw new Error('报价单未带入物料单价');
});

test('毛利成本必须计入胚布采购（直接购胚模式材料成本）', () => {
  // 胚布采购金额按订单汇总进 gfCost
  if (!/gfCost\+=amtRaw/.test(html)) throw new Error('毛利未汇总胚布采购成本');
  if (!/DB\.greyfabs\|\|\[\]\)\.forEach/.test(html)) throw new Error('毛利未遍历胚布采购记录');
  // 成本合计必须含 gfCost
  if (!/\+\(s\.gfCost\|\|0\)/.test(html)) throw new Error('毛利成本合计未计入 gfCost（胚布采购）');
  // 胚布采购成本须按「实收」结算（实收优先，未填用下单数）
  if (!/gf-akg/.test(html)) throw new Error('胚布采购缺少实收(gf-akg)字段');
  if (!/parseFloat\(c\.akg\)>0\?parseFloat\(c\.akg\):/.test(html)) throw new Error('胚布成本未按实收优先结算');
});

test('应付对账「两边对账」：自动汇总加工跟踪我方应付并与厂家账单比差额', () => {
  if (!/rc-sys-banner/.test(html)) throw new Error('应付对账缺少两边对账比对条');
  // 我方应付 = 该加工厂(+月份)的加工跟踪 fee 汇总
  if (!/function _sysOwe\(\)/.test(html)) throw new Error('缺少 _sysOwe 汇总助手');
  if (!/if\(t\.factNm!==factNm\)return;[\s\S]{0,90}?sum\+=parseFloat\(t\.fee\)/.test(html)) {
    throw new Error('未按加工厂汇总加工跟踪应付');
  }
  if (!/我方加工跟踪应付/.test(html)) throw new Error('缺少我方应付展示');
  // 厂家账单留空时自动用我方应付（不再硬性逼填）
  if (!/function _prefillBill\(\)/.test(html)) throw new Error('缺少厂家账单自动带入');
  // 对账单可打印（含明细），打印入口已接到列表
  if (!/function printAPRec\(id\)/.test(html)) throw new Error('缺少应付对账单打印 printAPRec');
  if (!/printAPRec\(id\);/.test(html)) throw new Error('应付对账列表缺少打印入口');
  if (!/加 工 费 对 账 单/.test(html)) throw new Error('打印模板标题缺失');
});

test('单位/应付汇总用共享助手（去重，避免改一处漏一处）', () => {
  if (!/function trkUnit\(t\)/.test(html)) throw new Error('缺少 trkUnit 共享助手');
  if (!/function apReconItems\(factNm,month\)/.test(html)) throw new Error('缺少 apReconItems 共享助手');
  // 不应再有内联重复的"按厂按月累计 fee"循环（已收敛到 apReconItems）
  if (/if\(t\.factNm!==r\.factNm\)return;/.test(html)) throw new Error('应付汇总仍有内联重复(应改用 apReconItems)');
});

test('多设备改动冲突提醒（fail-safe，云端权威表生效）', () => {
  if (!/function noteEditOpen\(tag,rec\)/.test(html)) throw new Error('缺少 noteEditOpen');
  if (!/function checkSaveConflict\(tag,id,list\)/.test(html)) throw new Error('缺少 checkSaveConflict');
  if (!/改动冲突提醒/.test(html)) throw new Error('缺少冲突提醒文案');
  // 异常一律放行，绝不卡正常保存
  if (!/\}catch\(e\)\{return true;\}/.test(html)) throw new Error('冲突检测必须 fail-safe 放行');
  // 关键表保存处已接入
  if (!/checkSaveConflict\('t',id,DB\.trks\)/.test(html)) throw new Error('加工跟踪未接冲突检测');
  if (!/checkSaveConflict\('y',id,DB\.yarns\)/.test(html)) throw new Error('纱线采购未接冲突检测');
  if (!/checkSaveConflict\('gf',id,DB\.greyfabs\)/.test(html)) throw new Error('胚布采购未接冲突检测');
  if (!/checkSaveConflict\('rc',rec\.id,DB\.recons\)/.test(html)) throw new Error('应付对账未接冲突检测');
});

test('胚布采购：金额合计须挂载后再算 + 有付款状态', () => {
  // build 时 modal 未挂载，必须在 om(modal) 之后再调一次 calcGFTotal
  if (!/om\(modal\);[\s\S]{0,260}?calcGFTotal\(\);\s*\}/.test(html)) {
    throw new Error('胚布采购未在 om(modal) 后重算 calcGFTotal，金额/合计会显示 0');
  }
  // 付款状态可编辑并保存
  if (!/mkSelect\('gf-paid'/.test(html)) throw new Error('胚布采购缺少付款状态选择器 gf-paid');
  if (!/paid:\(document\.getElementById\('gf-paid'\)/.test(html)) throw new Error('胚布采购保存未写入 paid');
});

test('毛利用「落袋口径·综合税耗」：实收−实付成本−综合税耗', () => {
  // 综合税耗率（默认6%，可配置，不写死）
  if (!/var TB=\(parseFloat\(window\._taxBurden/.test(html)) throw new Error('缺少综合税耗率 TB（默认6%）');
  if (!/CO\.taxBurden!=null\?CO\.taxBurden:6/.test(html)) throw new Error('综合税耗率默认应为6且可配置');
  // 成本=实付原值；税金=开票订单×综合税耗率，现金不开票=0
  if (!/s\.cost=s\.feeCost\+s\.matCost\+\(s\.gfCost\|\|0\)\+\(s\.miscCost\|\|0\)\+\(s\.stockCost\|\|0\);/.test(html)) throw new Error('成本合计应为实付原值');
  if (!/s\.taxed=!\(s\.ord&&s\.ord\.taxType==='excl'\)/.test(html)) throw new Error('开票订单判定缺失');
  // 税金 = 综合税耗率 × max(0, 实收 − 有票采购)：含税(有票)采购可抵进项,从计税基数扣
  if (!/s\.taxAmt=s\.taxed\?\(TB\*Math\.max\(0,s\.rev-\(s\.invoicedCost\|\|0\)\)\):0/.test(html)) throw new Error('税金应=综合税耗率×max(0,实收−有票采购)');
  if (!/if\(sp\.taxIncl\)os\.invoicedCost\+=amt/.test(html)) throw new Error('现货含税(有票)未计入进项抵扣 invoicedCost');
  if (!/if\(t\.taxIncl\)os\.invoicedCost\+=feeRaw/.test(html)) throw new Error('加工费含税(有票)未计入进项抵扣');
  if (!/if\(y\.taxIncl\)os\.invoicedCost\+=amtRaw/.test(html)) throw new Error('纱线含税(有票)未计入进项抵扣');
  if (!/if\(g\.taxIncl\)os\.invoicedCost\+=amtRaw/.test(html)) throw new Error('胚布含税(有票)未计入进项抵扣');
  if (!/if\(o\.miscCostTaxIncl\)os\.invoicedCost\+=mcRaw/.test(html)) throw new Error('其它成本含税(有票)未计入进项抵扣');
  if (!/o-misc-tax/.test(html)) throw new Error('其它成本缺少含税/不含税开关');
  // 加工/纱线/胚布 表单都有「含税/不含税」开关供标记(统一为彩色 taxPill 药丸)
  if (!/taxPill\('t-tax'/.test(html)) throw new Error('加工跟踪缺少含税/不含税开关');
  if (!/taxPill\('y-tax'/.test(html)) throw new Error('纱线采购缺少含税/不含税开关');
  if (!/taxPill\('gf-tax'/.test(html)) throw new Error('胚布采购缺少含税/不含税开关');
  if (!/function taxPill\(id,isIncl,vals\)/.test(html)) throw new Error('缺少统一含税药丸 taxPill(色差分明·内容自适应)');
  if (!/s\.profit=s\.rev-s\.cost-s\.taxAmt/.test(html)) throw new Error('落袋利润应=实收−实付成本−税金');
  // 收入(实收)必须走收入唯一口径 outBillAmount(含每色加价)，与对账单/打印一致
  if (!/var b=outBillAmount\(o,ord,rolls\)/.test(html)) throw new Error('毛利收入未走收入唯一口径(与对账单不一致)');
  if (!/getOS\(ord\)\.rev\+=rev/.test(html)) throw new Error('毛利收入聚合被改');
  if (/\+s\.taxB/.test(html)) throw new Error('不应有旧的税负当成本逻辑(taxB)');
  // 综合税耗率可调
  if (!/window\._taxBurden=parseFloat/.test(html)) throw new Error('缺少可调综合税耗率');
  // 综合税耗模型下不应保留每单发票状态/含税标记
  if (/mkSelect\('t-inv'/.test(html)) throw new Error('综合税耗模型下不应保留 t-inv');
  if (/mkSelect\('gf-inv'/.test(html)) throw new Error('综合税耗模型下不应保留 gf-inv');
});

test('加工跟踪：应付加工费只读且始终自动重算', () => {
  if (!/feeInp\.readOnly=true/.test(html)) throw new Error('应付加工费未设为只读');
  // 保存时加工费直接由 基准数量×单价 算出，不取手填值
  if (!/var fee=\(baseQ&&up\)\?\(baseQ\*up\)\.toFixed\(2\):''/.test(html)) {
    throw new Error('saveT 的加工费应始终按 基准数量×单价 计算（只读派生）');
  }
});

// ═══════════════════════════════════════════════
// 锁 37：染整加工单工厂下拉包含印花厂/后整理厂
// ═══════════════════════════════════════════════
test('染整加工单/打办的工厂筛选必须含印花厂/后整理厂', () => {
  if (!/function isDyeFinishFactory\(f\)/.test(html)) throw new Error('isDyeFinishFactory 助手缺失');
  var m = html.match(/function isDyeFinishFactory[\s\S]{0,200}?\}/);
  if (!m || !/印花厂/.test(m[0]) || !/后整理厂/.test(m[0])) {
    throw new Error('isDyeFinishFactory 未包含印花厂/后整理厂');
  }
  // 染整加工单下拉用该助手
  if (!/mkSelect\('dd-f'[\s\S]{0,120}?filter\(isDyeFinishFactory\)/.test(html)) {
    throw new Error('染整加工单工厂下拉未用 isDyeFinishFactory，印花厂会选不到');
  }
});

test('加工跟踪/颜色明细必须支持 KG/米 单位切换（印花按米计价）', () => {
  // 加工跟踪：单位选择器 + 保存 unit 字段
  if (!/mkSelect\('t-un'/.test(html)) throw new Error('加工跟踪缺少计量单位选择器 t-un');
  if (!/unit:\(document\.getElementById\('t-un'\)/.test(html)) throw new Error('加工跟踪保存未写入 unit 字段');
  // 防回归：modal bodyFn 在挂载前执行，_tRelabel 立即调用必须用本地引用 unSel.value，
  // 不能用 document.getElementById('t-un')（build 时返回 null → 整个 openTM 崩溃、按钮失灵）
  if (/_tRelabel=function\(\)\{var u=document\.getElementById\('t-un'\)\.value/.test(html)) {
    throw new Error('openTM 的 _tRelabel 在 build 时用了 getElementById（modal 未挂载会崩），应改用 unSel.value');
  }
  // 颜色明细：投产/落缸/成品 表头可切换并保存 procUnit
  if (!/cwp\.dataset\.procUnit/.test(html)) throw new Error('颜色明细缺少 procUnit 单位切换');
  if (!/procUnit:\(document\.getElementById\('cwp'\)/.test(html)) throw new Error('订单保存未写入 procUnit');
});

test('加工跟踪：工序物料勾稽 + 损耗预警（防虚报加工量/防回扣）', () => {
  if (!/function upstreamQty\(ordId,ordNo,proc\)/.test(html)) throw new Error('缺少上游可用量 upstreamQty');
  if (!/function procSentTotal\(ordId,ordNo,proc,exceptId\)/.test(html)) throw new Error('缺少本工序累计发出 procSentTotal');
  // 超上游可用量(含容差)红字预警
  if (!/var over=total>up\*1\.06;/.test(html)) throw new Error('缺少超量容差判定');
  if (!/谨防虚报加工量/.test(html)) throw new Error('缺少防虚报预警文案');
  // 损耗>10% 预警
  if (!/lossPct>10/.test(html)) throw new Error('缺少损耗偏高预警');
});

test('加工跟踪必须支持计费基准（默认按实际入库）', () => {
  if (!/mkSelect\('t-fb'/.test(html)) throw new Error('加工跟踪缺少计费基准选择器 t-fb');
  if (!/feeBase:fb/.test(html)) throw new Error('加工跟踪保存未写入 feeBase 字段');
  // 计费基准默认：按实际入库(act)
  if (!/var _fbDef=t\.feeBase\|\|'act'/.test(html)) throw new Error('计费基准默认应为按实际入库(act)');
  // 加工费按基准取数（默认实际入库），且基准为空时回退
  if (!/baseQ=fb==='ret'\?rqv:\(fb==='sent'\?sq:awv\)/.test(html)) throw new Error('加工费未按计费基准取数');
  if (!/if\(!baseQ\)baseQ=awv\|\|rqv\|\|sq/.test(html)) throw new Error('加工费基准为空时未回退');
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
