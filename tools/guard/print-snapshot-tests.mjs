// print-snapshot-tests.mjs
// HTML 输出快照护栏：用真实函数生成打印 HTML，逐字对比基线快照
// 防止修改一个打印模板时意外破坏其他模板的输出
//
// 用法：
//   node tools/guard/print-snapshot-tests.mjs       # 跑测试
//   UPDATE_SNAPSHOTS=1 node tools/guard/print-snapshot-tests.mjs  # 刷新快照

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ══ 从 index.html 提取函数的工具 ══

function findMatchingBrace(str, startIdx) {
  var depth = 1, idx = startIdx + 1;
  while (depth > 0 && idx < str.length) {
    if (str[idx] === '{') depth++;
    else if (str[idx] === '}') depth--;
    idx++;
  }
  if (depth !== 0) throw new Error('Unbalanced braces at index ' + startIdx);
  return idx;
}

function extractFn(name) {
  var re = new RegExp('function\\s+' + name + '\\s*\\(');
  var m = html.match(re);
  if (!m) throw new Error('Function ' + name + ' not found in index.html');
  var start = m.index;
  var brace = html.indexOf('{', m.index + m[0].length);
  if (brace < 0) throw new Error('Cannot find opening brace for ' + name);
  var end = findMatchingBrace(html, brace);
  return html.slice(start, end);
}

function extractDOC_CSS() {
  var m = html.match(/var DOC_CSS=\[([\s\S]*?)\]\s*\.join\(/);
  if (!m) throw new Error('DOC_CSS not found');
  try {
    var arr = eval('[' + m[1] + ']');
    if (!Array.isArray(arr)) throw new Error('DOC_CSS is not an array');
    return arr.join('');
  } catch (e) {
    throw new Error('Failed to parse DOC_CSS: ' + e.message);
  }
}

// ══ 快照文件读写 ══

function snapshotPath(name) {
  return path.join(SNAPSHOT_DIR, name + '.snapshot.html');
}

function readSnapshot(name) {
  var fp = snapshotPath(name);
  try { return fs.readFileSync(fp, 'utf8'); }
  catch (e) { return null; }
}

function writeSnapshot(name, content) {
  var fp = snapshotPath(name);
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  fs.writeFileSync(fp, content, 'utf8');
  console.log('  [snapshot saved] ' + name + '.snapshot.html');
}

function diffPos(a, b) {
  var len = Math.min(a.length, b.length);
  for (var i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  if (a.length !== b.length) return len;
  return -1;
}

function assertSnapshot(name, actual) {
  var expected = readSnapshot(name);
  if (expected === null) {
    // First run — create baseline
    writeSnapshot(name, actual);
    return;
  }
  if (actual === expected) return;

  var pos = diffPos(actual, expected);
  var contextStart = Math.max(0, pos - 40);
  var contextEnd = Math.min(actual.length, pos + 40);
  throw new Error(
    'Snapshot mismatch at byte ' + pos + '\n' +
    '  actual:   ' + JSON.stringify(actual.slice(contextStart, contextEnd)) + '\n' +
    '  expected: ' + JSON.stringify(expected.slice(contextStart, contextEnd)) + '\n' +
    (UPDATE ? '' : '  Set UPDATE_SNAPSHOTS=1 to update snapshots')
  );
}

// ══ VM 沙箱 ══

function createSandbox(mockDB) {
  var captured = [];
  var sandbox = {
    // Mock data + DB.load/k (some print functions use DB.load instead of direct access)
    DB: Object.assign(mockDB, {
      load: function (key) { return mockDB[key] || []; },
      k: function (prefix) {
        var results = [];
        for (var k in mockDB) {
          if (k.indexOf(prefix) === 0) results.push(k);
        }
        return results;
      },
    }),

    // Globals used by helpers/print functions
    LOGO: '',
    CO: { nm: '测试布业有限公司', shortNm: '测试布业', addr: '广东省东莞市虎门镇', tel: '0769-88888888', fax: '0769-88888888', email: 'test@example.com', preparer: '测试制单员', preparerTel: '0769-88888888', bankName: '测试银行测试支行', bankAccount: '1234567890123456', bankAccountHolder: '测试布业有限公司' },
    DOC_CSS: '',
    WV_RMK: '备注：以上数量仅供参考，具体以实际交货数量结算。',
    DY_RMK_LINES: [
      '3>. 无异味,甲醛含量≤75mg/kg,环保染料,PH值4.0~7.5之间,手感要好;',
      '4>. 耐洗/干擦/湿擦/耐晒/光汗复合牢度4级或以上;',
      '5>. 用我司贴纸,胶袋外要注明布类、缸号、颜色、磅数、公斤数、码数、款号；',
      '6>. 染损请控制:全棉7%;涤棉4%;全涤3%.',
      '7>. 定型后下车仔冷却全验布(检验标准:美标4分制,25分合格)并提供验布记录.',
      '8>. 货期按要求完成,迟期一天扣款1%,迟期超过五天有权取消订单,损失由加工厂负责.'
    ],

    // Mock browser APIs
    alert: function (msg) { throw new Error('Unexpected alert: ' + msg); },
    confirm: function () { return true; },

    // Mock printHTML: capture instead of printing
    printHTML: function (htmlContent) { captured.push(htmlContent); },

    // Allow reading captured HTML
    getCaptured: function () { return captured.join(''); },

    console: console,
  };

  var ctx = vm.createContext(sandbox);

  // Define mock fgRolls (uses DB.fgr from sandbox)
  vm.runInContext('function fgRolls(){ return (DB.fgr || []).filter(function(r){ return r.status !== "returned"; }); }', ctx);
  // R2: 制单人 helper — mock 无登录用户时回退 CO.preparer
  vm.runInContext('var _currentUser=null; function currentPreparer(){ return (_currentUser&&_currentUser.name)||CO.preparer||""; }', ctx);

  return { ctx: ctx, sandbox: sandbox, captured: captured };
}

function runInVM(name, helpers, fnCode, sandbox) {
  // First: define all helper functions in the context
  for (var i = 0; i < helpers.length; i++) {
    vm.runInContext(helpers[i], sandbox.ctx);
  }
  // Then: define the target function
  vm.runInContext(fnCode, sandbox.ctx);
}

// ══ 测试数据 ══

var TEST_ORDER = {
  id: 'o1',
  no: 'HT2025001',
  custNm: '广州华丰服装有限公司',
  custNo: 'HF-001',
  fab: 'T/R 28/2×28/2 108×58 58/60"',
  prodNo: 'TR-10858',
  prUnit: '元/KG',
  unitPr: 28.5,
  width: 150,
  widthUnit: 'cm',
  weight: 280,
  delDate: '2026-06-15',
  ordDate: '2026-05-01',
  payTm: '月结30天',
  cpnm: '',
  rm: '按确认色办生产，大货质量按国标GB18401-2010',
  colors: [
    { nm: '漂白', code: 'WH001', qty: 1200, extraPr: 0, unit: '公斤' },
    { nm: '黑色', code: 'BK002', qty: 800, extraPr: 1.5, unit: '公斤' },
    { nm: '灰色', code: 'GY003', qty: 500, extraPr: 0.5, unit: '公斤' },
  ],
};

var TEST_ORDER2 = {
  id: 'o2',
  no: 'HT2025002',
  custNm: '深圳永昌制衣厂',
  custNo: 'YC-002',
  fab: '全棉 40×40 133×72 63"',
  prodNo: 'C-13372',
  prUnit: '元/米',
  unitPr: 12.8,
  width: 160,
  widthUnit: 'cm',
  weight: 145,
  delDate: '2026-06-30',
  ordDate: '2026-05-10',
  payTm: '现金',
  cpnm: '',
  rm: '',
  colors: [
    { nm: '白色', code: 'W001', qty: 2000, extraPr: 0, unit: '米' },
    { nm: '浅蓝', code: 'LB002', qty: 1500, extraPr: 0.3, unit: '米' },
  ],
};

var TEST_CUST = {
  nm: '广州华丰服装有限公司',
  ad: '广州市海珠区新港中路123号',
  ph: '020-88886666',
  cpd: '完整布类',
};

var TEST_MAT = {
  mid: 'TR-10858',
  fab: 'T/R 28/2×28/2 108×58 58/60"',
  alias: '双面斜(T/R)',
};

var TEST_ROLLS = [
  { id: 'r1', ordId: 'o1', colorNm: '漂白', colorCode: 'WH001', vatNo: 'V2201', rollNo: '1', kg: 25.3, m: 58.2, status: 'in', outId: '' },
  { id: 'r2', ordId: 'o1', colorNm: '漂白', colorCode: 'WH001', vatNo: 'V2201', rollNo: '2', kg: 24.8, m: 57.0, status: 'in', outId: '' },
  { id: 'r3', ordId: 'o1', colorNm: '漂白', colorCode: 'WH001', vatNo: 'V2201', rollNo: '3', kg: 25.1, m: 57.8, status: 'in', outId: '' },
  { id: 'r4', ordId: 'o1', colorNm: '黑色', colorCode: 'BK002', vatNo: 'V2202', rollNo: '4', kg: 26.0, m: 59.1, status: 'in', outId: '' },
  { id: 'r5', ordId: 'o1', colorNm: '黑色', colorCode: 'BK002', vatNo: 'V2202', rollNo: '5', kg: 25.5, m: 58.5, status: 'in', outId: '' },
  { id: 'r6', ordId: 'o1', colorNm: '灰色', colorCode: 'GY003', vatNo: 'V2203', rollNo: '6', kg: 24.2, m: 56.0, status: 'in', outId: '' },
  { id: 'r7', ordId: 'o2', colorNm: '白色', colorCode: 'W001', vatNo: 'V2101', rollNo: '7', kg: 22.0, m: 62.0, status: 'in', outId: '' },
  { id: 'r8', ordId: 'o2', colorNm: '浅蓝', colorCode: 'LB002', vatNo: 'V2102', rollNo: '8', kg: 23.5, m: 64.0, status: 'in', outId: '' },
];

var TEST_FGOUT = {
  id: 'fg1',
  ordId: 'o1',
  ordNo: 'HT2025001',
  no: 'SH20250001',
  rollIds: ['r1', 'r2', 'r3'],
  date: '2026-05-20',
  custOrdNo: 'HF-MAY-01',
  feeNm: '',
  feeAmt: '',
  dlvNo: 'SF1234567890',
  rm: '急用',
  approxM: '',
};

var TEST_FGOUT2 = {
  id: 'fg2',
  ordId: 'o2',
  ordNo: 'HT2025002',
  no: 'SH20250002',
  rollIds: ['r7', 'r8'],
  date: '2026-05-22',
  custOrdNo: '',
  feeNm: '运输费',
  feeAmt: '100',
  dlvNo: '',
  rm: '',
  approxM: '3500',
};

var TEST_QUOT = {
  id: 'q1',
  no: 'QT2025001',
  custNm: '广州华丰服装有限公司',
  items: [
    { no: '1', fab: 'T/R 28/2×28/2 108×58 58/60"', price: 29.0, moq: '1000KG', width: 150, widthUnit: 'cm', gsm: 280, comps: [{ nm: 'T', pct: '65' }, { nm: 'R', pct: '35' }] },
    { no: '2', fab: '全棉 40×40 133×72 63"', price: 13.5, moq: '2000米', width: 160, widthUnit: 'cm', gsm: 145, comps: [{ nm: '棉', pct: '100' }] },
  ],
  terms: ['qt-tax', 'qt-valid30', 'qt-ship'],
  moqNote: '订单数量低于MOQ需加收20%',
  showMeter: true,
  rm: '色办需提前5个工作日确认',
};

var TEST_AREC = {
  id: 'ar1',
  no: 'STM2025001',
  outIds: ['fg1', 'fg2'],
  paidTotal: 20000,
};

var TEST_FGRETURN = {
  id: 'ret1',
  outId: 'fg1',
  outNo: 'SH20250001',
  rollIds: ['r1', 'r2'],
  reason: '颜色与确认色办不符',
  custNm: '广州华丰服装有限公司',
  status: 'pending',
};

var TEST_COLORNOTICE = {
  id: 'cn1',
  to: '东莞宏盛染厂',
  fab: 'T/R 28/2×28/2 108×58 58/60"',
  qty: '3色共2500KG',
  date: '2026-05-08',
  colors: [
    { code: 'WH001', nm: '漂白', qty: '1200KG' },
    { code: 'BK002', nm: '黑色', qty: '800KG' },
    { code: 'GY003', nm: '灰色', qty: '500KG' },
  ],
};

// ══ 构建完整的 Mock DB ══

function buildMockDB() {
  return {
    orders: [TEST_ORDER, TEST_ORDER2],
    custs: [TEST_CUST],
    mats: [TEST_MAT],
    fgr: JSON.parse(JSON.stringify(TEST_ROLLS)),
    fgouts: [TEST_FGOUT, TEST_FGOUT2],
    arecs: [TEST_AREC],
    quots: [TEST_QUOT],
    fgreturns: [TEST_FGRETURN],
    cnotices: [TEST_COLORNOTICE],
    // Empty tables needed by various lookups
    trks: [],
    facts: [],
    weave: [],
    dd: [],
  };
}

// ══ 辅助函数：从 index.html 提取 helpers 并运行打印函数 ══

var HELPERS_CACHE = null;

function getHelpers() {
  if (!HELPERS_CACHE) {
    HELPERS_CACHE = [
      extractFn('esc'),
      extractFn('normSearch'),
      extractFn('sameCode'),
      extractFn('docHeader'),
      extractFn('getPayClause'),
      extractFn('metersToKG'),
      extractFn('getARecReturnRows'),
      extractFn('printDoc'),
    ];
  }
  return HELPERS_CACHE;
}

function capturePrintHTML(printFnName, fnCode, mockDB, extraCode) {
  var sb = createSandbox(mockDB);
  sb.sandbox.DOC_CSS = extractDOC_CSS();

  // Define helpers
  var helpers = getHelpers();
  for (var i = 0; i < helpers.length; i++) {
    vm.runInContext(helpers[i], sb.ctx);
  }

  // Define the print function
  vm.runInContext(fnCode, sb.ctx);

  // Run any extra setup code
  if (extraCode) {
    vm.runInContext(extraCode, sb.ctx);
  }

  // Return captured HTML
  return sb.sandbox.getCaptured();
}

// ══ 打印快照测试 ══

// ── 销售合同 ──
test('销售合同 HTML 快照一致', function () {
  var fnCode = extractFn('printSalesContract');
  var mockDB = buildMockDB();
  // printSalesContract(ordId) needs: o, cust, mat, colors
  var extra = "printSalesContract('o1');";
  var html = capturePrintHTML('printSalesContract', fnCode, mockDB, extra);

  if (UPDATE) writeSnapshot('printSalesContract', html);
  assertSnapshot('printSalesContract', html);
});

// ── 送货单 ──
test('送货单 HTML 快照一致', function () {
  var fnCode = extractFn('printFGOut');
  var mockDB = buildMockDB();
  // Set up outgoing shipment rolls
  mockDB.fgr.forEach(function (r) {
    if ((TEST_FGOUT.rollIds || []).indexOf(r.id) >= 0) {
      r.status = 'out';
      r.outId = 'fg1';
    }
  });
  var extra = "printFGOut('fg1');";
  var html = capturePrintHTML('printFGOut', fnCode, mockDB, extra);

  if (UPDATE) writeSnapshot('printFGOut', html);
  assertSnapshot('printFGOut', html);
});

// ── 报价单 ──
test('报价单 HTML 快照一致', function () {
  var fnCode = extractFn('printQuot');
  var mockDB = buildMockDB();
  var extra = "printQuot('q1');";
  var html = capturePrintHTML('printQuot', fnCode, mockDB, extra);

  if (UPDATE) writeSnapshot('printQuot', html);
  assertSnapshot('printQuot', html);
});

// ── 对账单 ──
test('对账单 HTML 快照一致', function () {
  var fnCode = extractFn('printARec');
  var mockDB = buildMockDB();
  var extra = "printARec('ar1');";
  var html = capturePrintHTML('printARec', fnCode, mockDB, extra);

  if (UPDATE) writeSnapshot('printARec', html);
  assertSnapshot('printARec', html);
});

// ── 退货单 ──
test('退货单 HTML 快照一致', function () {
  var fnCode = extractFn('printFGReturn');
  var mockDB = buildMockDB();
  // Mark returned rolls
  mockDB.fgr.forEach(function (r) {
    if ((TEST_FGRETURN.rollIds || []).indexOf(r.id) >= 0) {
      r.status = 'return_pending';
    }
  });
  var extra = "printFGReturn('ret1');";
  var html = capturePrintHTML('printFGReturn', fnCode, mockDB, extra);

  if (UPDATE) writeSnapshot('printFGReturn', html);
  assertSnapshot('printFGReturn', html);
});

// ── 打办通知单 ──
test('打办通知单 HTML 快照一致', function () {
  var fnCode = extractFn('prtColorNotice');
  var mockDB = buildMockDB();
  var extra = "prtColorNotice('cn1');";
  var html = capturePrintHTML('prtColorNotice', fnCode, mockDB, extra);

  if (UPDATE) writeSnapshot('prtColorNotice', html);
  assertSnapshot('prtColorNotice', html);
});

// ── 染整加工单 ──
test('染整加工单 HTML 快照一致', function () {
  var fnCode = extractFn('buildDH');

  // Build mock dyeing data (what getDDdata() would return)
  var dyeData = {
    ord: TEST_ORDER,
    facNm: '东莞宏盛染厂',
    ct: '张先生',
    due: '2026-06-10',
    wb: '漂白',
    ra: '5.0',
    rct: '',
    rph: '',
    da: '',
    dc: '',
    dp: '',
    sw: '5%',
    sl: '5%',
    sn: '3%',
    specWd: '150',
    specWu: 'cm',
    specWt: '280',
    sk: '',
    sm: '挂干',
    pj: '',
    rm: '注意色牢度要求',
    pjNote: '',
    pkg: ['贴纸', '胶袋'],
    vatColors: [
      { nm: '漂白', code: 'WH001', q1: 1200, q2: '', q3: '', rm: '' },
      { nm: '黑色', code: 'BK002', q1: 800, q2: '', q3: '', rm: '注意黑度' },
    ],
  };

  var mockDB = buildMockDB();

  // Wrap buildDH result with printDoc to get full HTML
  var helperCode = getHelpers().join('\n');
  var printFnSrc = extractFn('buildDH');

  var sb = createSandbox(mockDB);
  sb.sandbox.DOC_CSS = extractDOC_CSS();

  // Define helpers and buildDH
  vm.runInContext(helperCode, sb.ctx);
  vm.runInContext(printFnSrc, sb.ctx);

  // Call: printDoc('染整加工单', buildDH(dyeData), dyeData.ord.no)
  vm.runInContext(
    "printDoc('染整加工单', buildDH(" + JSON.stringify(dyeData) + "), '" + TEST_ORDER.no + "');",
    sb.ctx
  );
  var html = sb.sandbox.getCaptured();

  if (UPDATE) writeSnapshot('buildDH', html);
  assertSnapshot('buildDH', html);
});

// ── 织厂加工单 ──
test('织厂加工单 HTML 快照一致', function () {
  var fnCode = extractFn('buildWH');

  // Build mock weaving data (what getWD() would return)
  var weaveData = {
    ord: TEST_ORDER2,
    facNm: '佛山新明织造厂',
    ct: '李经理',
    due: '2026-06-20',
    pr: '28.00',
    taxType: '含税',
    ls: '平纹',
    yq: 'A级',
    gaugeN: '24',
    gaugeS: '34',
    specWd: '160',
    specWu: 'cm',
    specWt: '145',
    shrink: '3%',
    ra: '',
    raNm: '',
    raCt: '',
    raPh: '',
    da: '',
    note: '按确认板生产',
    rm: '急单，请优先安排',
    selectedColors: null, // all colors
    colorKgMap: { '白色': '2000', '浅蓝': '1500' },
  };

  var mockDB = buildMockDB();

  var helperCode = getHelpers().join('\n');
  var printFnSrc = extractFn('buildWH');

  var sb = createSandbox(mockDB);
  sb.sandbox.DOC_CSS = extractDOC_CSS();

  vm.runInContext(helperCode, sb.ctx);
  vm.runInContext(printFnSrc, sb.ctx);

  // TODO: if buildWH references WV_RMK, it's already in sandbox
  vm.runInContext(
    "printDoc('织厂加工单', buildWH(" + JSON.stringify(weaveData) + "), '" + TEST_ORDER2.no + "');",
    sb.ctx
  );
  var html = sb.sandbox.getCaptured();

  if (UPDATE) writeSnapshot('buildWH', html);
  assertSnapshot('buildWH', html);
});

// ══ 运行 ══

function run() {
  var passed = 0;
  var failed = 0;

  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      t.fn();
      passed++;
      console.log('PASS ' + t.name);
    } catch (e) {
      failed++;
      console.error('FAIL ' + t.name);
      console.error('  ' + (e.stack || e.message));
      process.exitCode = 1;
    }
  }

  var total = passed + failed;
  if (failed === 0) {
    console.log('Print snapshot guard passed: ' + passed + '/' + total);
  } else {
    console.error('Print snapshot guard failed: ' + passed + '/' + total);
  }
}

run();
