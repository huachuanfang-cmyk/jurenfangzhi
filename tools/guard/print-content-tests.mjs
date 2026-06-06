// print-content-tests.mjs
// 打印单据内容护栏：验证关键单据的 HTML 模板包含应有的数据字段引用
// 不做样式检查（已在 print-style-tests.mjs 中覆盖），只检查必现字段是否出现在函数源码中

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// 提取指定函数名的完整函数体（支持 function name(...){...} 格式）
function extractFunction(name) {
  const re = new RegExp(`function\\s+${name}\\s*\\([\\s\\S]*?\\{[\\s\\S]*?\\n\\}`,'m');
  const match = html.match(re);
  return match ? match[0] : null;
}

// ══ 销售合同 · printSalesContract ══
test('销售合同包含客户名称、订单号、布类、单价单位、交货日期', () => {
  const fn = extractFunction('printSalesContract');
  if (!fn) throw new Error('printSalesContract not found in index.html');

  const checks = [
    { field: '客户名称', pattern: /o\.custNm/ },
    { field: '订单号', pattern: /o\.no\b/ },
    { field: '布类/货号', pattern: /o\.fab\b/ },
    { field: '单单位', pattern: /o\.prUnit/ },
    { field: '交日期', pattern: /o\.delDate/ },
    { field: '颜色代码', pattern: /c\.code/ },
    { field: '颜色数量', pattern: /c\.qty/ },
    { field: '单价', pattern: /unitPr/ },
    { field: '客户编号', pattern: /o\.custNo/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 送货单 · printFGOut ══
test('送货单包含客户名称、订单号、布类、色号、匹号、重量、米数', () => {
  const fn = extractFunction('printFGOut');
  if (!fn) throw new Error('printFGOut not found in index.html');

  const checks = [
    { field: '客户名称', pattern: /(out\.custNm|o\.custNm|ret\.custNm)/ },
    { field: '订单号', pattern: /out\.ordNo/ },
    { field: '布类', pattern: /o\.fab/ },
    { field: '颜色名', pattern: /colorNm|\.clr/ },
    { field: '匹号', pattern: /rollNo|piNo/ },
    { field: '重量', pattern: /\.kg\b/ },
    { field: '米数', pattern: /\.m\b/ },
    { field: '总匹数', pattern: /rolls\.length|pieces|totalPieces/ },
    { field: '总重量', pattern: /totKG|totalKG|totalKg/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

test('+登记出货多色多缸时拆成多张正式送货单打印', () => {
  const fn = extractFunction('openFGOutM');
  if (!fn) throw new Error('openFGOutM not found in index.html');

  const checks = [
    { field: '按颜色缸号拆组', pattern: /fgoGroupsByKey|shipGroupsByKey/ },
    { field: '每组生成出货单', pattern: /createdOutIds/ },
    { field: '每组独立单号', pattern: /fgOutNoFromList/ },
    { field: '批量打印', pattern: /printFGOutMany/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('批量多色出货缺少: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 报价单 · printQuot ══
test('报价单包含报价编号、客户名称、布类、单价、有效日期', () => {
  const fn = extractFunction('printQuot');
  if (!fn) throw new Error('printQuot not found in index.html');

  const checks = [
    { field: '报价单号', pattern: /r\.no\b/ },
    { field: '客户名称', pattern: /r\.custNm/ },
    { field: '布类', pattern: /item\.fab/ },
    { field: '单价', pattern: /item\.price/ },
    { field: '有效日期', pattern: /r\.validTo/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 对账单 · printARec ══
test('对账单包含客户名称、月份、应收金额、出货记录', () => {
  const fn = extractFunction('printARec');
  if (!fn) throw new Error('printARec not found in index.html');

  const checks = [
    { field: '客户名称', pattern: /r\.custNm/ },
    { field: '月份', pattern: /r\.month/ },
    { field: '应收金额', pattern: /totalAmt|hisAmt|amt/ },
    { field: '出货明细', pattern: /outbound|fgouts/ },
    { field: '已付金额', pattern: /paid/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

test('应收对账拉取出货记录时自动带入送货单附加费', () => {
  const checks = [
    { field: '出货单附加费写入勾选项', pattern: /dataset\.fee\s*=\s*feeAmt\.toFixed\(2\)/ },
    { field: '底部余额包含出货单附加费', pattern: /gross-retDeductTotal\+shipFee-deduct\+add-paid|total\+shipFee-deduct\+add-paid/ },
    { field: '保存对账单记录出货单附加费合计', pattern: /shipFeeTotal:String\(shipFeeTotal\)/ },
    { field: '保存余额包含出货单附加费', pattern: /netAmt=total\+shipFeeTotal-deductTotal\+addTotal/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(html));
  if (failures.length) {
    throw new Error('应收对账附加费自动带入缺少: ' + failures.map(f => f.field).join(', '));
  }
});

test('应收对账支持快速无订单出货金额', () => {
  const checks = [
    { field: '快速出货金额函数', pattern: /function calcQuickOutAmount\(out\)/ },
    { field: '快速出货按pcsData汇总', pattern: /function quickOutTotals\(out\)/ },
    { field: '对账拉取快速出货金额', pattern: /if\(o\.isQuick\)\{[\s\S]*?var qInfo=calcQuickOutAmount\(o\);[\s\S]*?amt=qInfo\.amt/ },
    { field: '对账打印快速出货金额', pattern: /if\(out\.isQuick\)\{[\s\S]*?var qInfo=calcQuickOutAmount\(out\);[\s\S]*?grandTotal\+=qInfo\.amt/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(html));
  if (failures.length) {
    throw new Error('应收对账快速出货金额缺少: ' + failures.map(f => f.field).join(', '));
  }
});

test('应收对账单支持选择收款账户并打印账户风险提示', () => {
  const checks = [
    { field: '保存收款账户类型', pattern: /receiptAccountType:receiptAccount\.type/ },
    { field: '保存收款账户名称', pattern: /receiptAccountName:receiptAccount\.name/ },
    { field: '保存收款账户开户行', pattern: /receiptAccountBank:receiptAccount\.bank/ },
    { field: '保存收款账号', pattern: /receiptAccountNo:receiptAccount\.no/ },
    { field: '打印读取对账单收款账户', pattern: /resolveARecReceiptAccount\(r\)/ },
    { field: '个人代收风险提示', pattern: /个人代收账户/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(html));
  if (failures.length) {
    throw new Error('应收对账收款账户功能缺少: ' + failures.map(f => f.field).join(', '));
  }
});

test('应收对账单从独立收款账户档案读取并只读展示', () => {
  const checks = [
    { field: '收款账户档案函数', pattern: /function receiptAccounts\(\)/ },
    // 模板化后不再写死个人账户种子，改为验证默认对公账户从 CO 读取
    { field: '默认对公账户从CO读取', pattern: /name:CO\.bankAccountHolder\|\|CO\.nm/ },
    { field: '收款账户设置路径', pattern: /function openReceiptAccountManager\(\)/ },
    { field: '对账单账户只读展示', pattern: /accNameView\.textContent=acc\.name/ },
    { field: '保存仍使用隐藏字段快照', pattern: /accNameHid\.type='hidden';accNameHid\.id='ar-acc-name'/ },
    { field: '账户资料不在对账单内直接编辑', pattern: /账户资料请在右上角「收款账户设置」维护/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(html));
  if (failures.length) {
    throw new Error('应收对账收款账户只读化缺少: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 加工单 · prtD → buildDH ══
test('染整加工单包含订单号、布类、颜色分配', () => {
  const fn = extractFunction('buildDH');
  if (!fn) throw new Error('buildDH not found in index.html');

  const checks = [
    { field: '订单号', pattern: /ord\.no/ },
    { field: '布类', pattern: /ord\.fab/ },
    { field: '颜色', pattern: /c\.nm/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 退货单 · printFGReturn ══
test('退货单包含客户名称、原送货单号、退货原因、匹号、重量', () => {
  const fn = extractFunction('printFGReturn');
  if (!fn) throw new Error('printFGReturn not found in index.html');

  const checks = [
    { field: '客户名称', pattern: /ret\.custNm/ },
    { field: '原送货单号', pattern: /ret\.outNo/ },
    { field: '退货原因', pattern: /ret\.reason/ },
    { field: '匹号', pattern: /rollNo/ },
    { field: '重量', pattern: /\.kg\b/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 色卡通知单 · prtColorNotice ══
test('打办通知单包含收件人、布类、颜色代码、数量', () => {
  const fn = extractFunction('prtColorNotice');
  if (!fn) throw new Error('prtColorNotice not found in index.html');

  const checks = [
    { field: '收件人', pattern: /n\.to\b/ },
    { field: '布类', pattern: /n\.fab/ },
    { field: '颜色代码', pattern: /c\.code/ },
    { field: '数量', pattern: /n\.qty/ },
    { field: '日期', pattern: /n\.date/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 织厂加工单 · prtW → buildWH ══
test('织厂加工单包含订单号、布类、规格、颜色', () => {
  const fn = extractFunction('buildWH');
  if (!fn) throw new Error('buildWH not found in index.html');

  const checks = [
    { field: '订单号', pattern: /ord\.no/ },
    { field: '布类', pattern: /\bfab\b/ },
    { field: '规格', pattern: /\bsp\b/ },
    { field: '颜色', pattern: /c\.nm/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
  }
});

// ══ 多色合并送货单 · printMultiColorSheet ══
test('多色合并送货单包含客户、合同号、布类、颜色、匹重', () => {
  const fn = extractFunction('printMultiColorSheet');
  if (!fn) throw new Error('printMultiColorSheet not found in index.html');

  const checks = [
    { field: '客户名称', pattern: /o\.custNm/ },
    { field: '合同号', pattern: /o\.no\b/ },
    { field: '布类', pattern: /o\.fab/ },
    { field: '颜色名称', pattern: /clrNm/ },
    { field: '匹重', pattern: /rollKGs|\.kg\b/ },
    { field: '总金额', pattern: /totalAmount|totalAmt/ },
  ];

  const failures = checks.filter(c => !c.pattern.test(fn));
  if (failures.length) {
    throw new Error('缺少字段引用: ' + failures.map(f => f.field).join(', '));
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
  console.log(`Print content guard passed: ${passed}/${tests.length}`);
}
