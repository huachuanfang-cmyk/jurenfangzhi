import assert from 'node:assert/strict';
import { createGuardStore } from './erp-core.mjs';

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('sales order can be saved and read back', () => {
  const store = createGuardStore();
  const order = store.createOrder({
    id: 'ord-001',
    no: 'G20260001',
    custNm: 'Test Customer',
    colors: [{ nm: 'Red', code: 'R-001' }],
  });

  assert.equal(store.getOrder(order.id).no, 'G20260001');
  assert.equal(store.getOrder(order.id).colors[0].code, 'R-001');
});

test('changed order colors are visible to production docs', () => {
  const store = createGuardStore();
  store.createOrder({
    id: 'ord-001',
    no: 'G20260001',
    colors: [{ nm: 'Red', code: 'R-001' }],
  });

  store.updateOrderColors('ord-001', [
    { nm: 'Red', code: 'R-002' },
    { nm: 'Blue', code: 'B-001' },
  ]);

  const docColors = store.getProductionDocColors('ord-001');
  assert.deepEqual(docColors, [
    { nm: 'Red', code: 'R-002' },
    { nm: 'Blue', code: 'B-001' },
  ]);
});

test('finished-goods receipt creates in-stock rolls', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-001', no: 'G20260001', custNm: 'Test Customer' });

  const receipt = store.receiveFinishedGoods({
    id: 'in-001',
    ordId: 'ord-001',
    vatNo: 'VAT-001',
    rolls: [
      { id: 'roll-001', rollNo: '1', kg: '20.5', m: '100' },
      { id: 'roll-002', rollNo: '2', kg: '19.5', m: '98' },
    ],
  });

  assert.equal(receipt.rollIds.length, 2);
  assert.equal(store.getRoll('roll-001').status, 'in');
  assert.equal(store.getInventoryRolls().length, 2);
});

test('shipment moves selected rolls out of stock', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-001', no: 'G20260001', custNm: 'Test Customer' });
  store.receiveFinishedGoods({
    id: 'in-001',
    ordId: 'ord-001',
    rolls: [{ id: 'roll-001', kg: '20.5' }],
  });

  const shipment = store.shipFinishedGoods({
    id: 'out-001',
    ordId: 'ord-001',
    rollIds: ['roll-001'],
  });

  assert.equal(shipment.rollIds[0], 'roll-001');
  assert.equal(store.getRoll('roll-001').status, 'out');
  assert.equal(store.getRoll('roll-001').outId, 'out-001');
  assert.equal(store.getInventoryRolls().length, 0);
});

test('return keeps rolls out of normal stock and marks them pending return', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-001', no: 'G20260001', custNm: 'Test Customer' });
  store.receiveFinishedGoods({
    id: 'in-001',
    ordId: 'ord-001',
    rolls: [{ id: 'roll-001', kg: '20.5' }],
  });
  store.shipFinishedGoods({ id: 'out-001', ordId: 'ord-001', rollIds: ['roll-001'] });

  const ret = store.returnFinishedGoods({
    id: 'ret-001',
    outId: 'out-001',
    rollIds: ['roll-001'],
    reason: 'Quality issue',
  });

  assert.equal(ret.status, 'pending');
  assert.equal(store.getRoll('roll-001').status, 'return_pending');
  assert.equal(store.getInventoryRolls().length, 0);
  assert.equal(store.getReturnPendingRolls().length, 1);
});

test('receivable record marks linked shipments as reconciled', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-001', no: 'G20260001', custNm: 'Test Customer' });
  store.receiveFinishedGoods({
    id: 'in-001',
    ordId: 'ord-001',
    rolls: [{ id: 'roll-001', kg: '20.5' }],
  });
  store.shipFinishedGoods({ id: 'out-001', ordId: 'ord-001', rollIds: ['roll-001'] });

  const ar = store.createReceivable({
    id: 'ar-001',
    no: 'AR20260001',
    outIds: ['out-001'],
  });

  assert.equal(ar.outIds[0], 'out-001');
  assert.equal(store.getShipment('out-001').arecId, 'ar-001');
});

test('delete operations produce delete intents instead of only local filtering', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-001', no: 'G20260001' });

  store.deleteRecord('o', 'ord-001');

  assert.equal(store.getOrder('ord-001'), null);
  assert.deepEqual(store.getDeleteIntents(), [{ key: 'o', id: 'ord-001' }]);
});

// ══ 订单核心字段护栏 ══

test('order core fields are preserved: fabric code, price unit, delivery date', () => {
  const store = createGuardStore();
  const order = store.createOrder({
    id: 'ord-010',
    no: 'G20260010',
    custNm: 'Field Test Customer',
    fab: 'JC60x60 143x120 67"',
    prUnit: 'M',
    delDate: '2026-06-15',
    colors: [{ nm: 'White', code: 'W-001', qty: '1000' }],
  });

  const loaded = store.getOrder('ord-010');
  assert.equal(loaded.fab, 'JC60x60 143x120 67"', 'fabric code preserved');
  assert.equal(loaded.prUnit, 'M', 'price unit preserved');
  assert.equal(loaded.delDate, '2026-06-15', 'delivery date preserved');
  assert.equal(loaded.colors[0].qty, '1000', 'color quantity preserved');
});

test('order core fields survive color update without corruption', () => {
  const store = createGuardStore();
  store.createOrder({
    id: 'ord-011',
    no: 'G20260011',
    fab: 'T/C65/35 45x45 133x72',
    prUnit: 'KG',
    delDate: '2026-07-01',
  });

  store.updateOrderColors('ord-011', [
    { nm: 'Red', code: 'R-001', qty: '500' },
    { nm: 'Blue', code: 'B-001', qty: '300' },
  ]);

  const loaded = store.getOrder('ord-011');
  assert.equal(loaded.fab, 'T/C65/35 45x45 133x72', 'fabric code intact after color update');
  assert.equal(loaded.prUnit, 'KG', 'price unit intact after color update');
  assert.equal(loaded.delDate, '2026-07-01', 'delivery date intact after color update');
  assert.equal(loaded.colors.length, 2, 'both colors present');
  assert.equal(loaded.colors[0].qty, '500', 'first color quantity preserved');
});

test('order field defaults are safe when optional fields omitted', () => {
  const store = createGuardStore();
  const order = store.createOrder({
    id: 'ord-012',
    no: 'G20260012',
    // omitting fab, prUnit, delDate, colors
  });

  assert.equal(order.fab, '', 'fabric code defaults to empty string');
  assert.equal(order.prUnit, '', 'price unit defaults to empty string');
  assert.equal(order.delDate, '', 'delivery date defaults to empty string');
  assert.deepEqual(order.colors, [], 'colors defaults to empty array');
});

// ══ 出货状态计算 calcShipStatus ══

test('calcShipStatus returns null when no rolls exist for order', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-020', no: 'G20260020' });
  assert.equal(store.calcShipStatus('ord-020'), null);
});

test('calcShipStatus returns stocked when all rolls are in stock', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-021', no: 'G20260021' });
  store.receiveFinishedGoods({ id: 'in-021', ordId: 'ord-021', rolls: [{ id: 'roll-021', kg: '20' }] });
  assert.equal(store.calcShipStatus('ord-021'), 'stocked');
});

test('calcShipStatus returns fully_out when all rolls are shipped', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-022', no: 'G20260022' });
  store.receiveFinishedGoods({ id: 'in-022', ordId: 'ord-022', rolls: [{ id: 'roll-022', kg: '20' }] });
  store.shipFinishedGoods({ id: 'out-022', ordId: 'ord-022', rollIds: ['roll-022'] });
  assert.equal(store.calcShipStatus('ord-022'), 'fully_out');
});

test('calcShipStatus returns partial_out when some rolls shipped', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-023', no: 'G20260023' });
  store.receiveFinishedGoods({ id: 'in-023', ordId: 'ord-023', rolls: [
    { id: 'roll-023a', kg: '20' },
    { id: 'roll-023b', kg: '30' },
  ]});
  store.shipFinishedGoods({ id: 'out-023', ordId: 'ord-023', rollIds: ['roll-023a'] });
  assert.equal(store.calcShipStatus('ord-023'), 'partial_out');
});

// ══ 库存汇总 getStockSummary ══

test('stockKG equals total in-stock rolls minus shipped rolls', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-024', no: 'G20260024' });
  store.receiveFinishedGoods({ id: 'in-024', ordId: 'ord-024', rolls: [
    { id: 'roll-024a', kg: '50' },
    { id: 'roll-024b', kg: '30' },
  ]});
  store.shipFinishedGoods({ id: 'out-024', ordId: 'ord-024', rollIds: ['roll-024a'] });
  const s = store.getStockSummary();
  assert.equal(s.totalKG, 80);
  assert.equal(s.outKG, 50);
  assert.equal(s.stockKG, 30);
  assert.equal(s.totalRolls, 2);
  assert.equal(s.outRolls, 1);
  assert.equal(s.inStockRolls, 1);
});

// ══ 应收金额计算 calcShipmentAmount ══

test('AR shipment amount computed by KG when prUnit is KG', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-025', no: 'G20260025', prUnit: 'KG', unitPr: 10,
    colors: [{ nm: 'Red', code: 'R-001' }] });
  store.receiveFinishedGoods({ id: 'in-025', ordId: 'ord-025',
    rolls: [{ id: 'roll-025a', kg: '20.5', m: '100', colorNm: 'Red' }] });
  store.shipFinishedGoods({ id: 'out-025', ordId: 'ord-025', rollIds: ['roll-025a'] });
  const info = store.calcShipmentAmount('out-025');
  assert.equal(info.kg, 20.5);
  assert.equal(info.amt, 205);  // 20.5 * 10
  assert.equal(info.byM, false);
});

test('AR shipment amount computed by M with extraPr when prUnit is M', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-026', no: 'G20260026', prUnit: 'M', unitPr: 8,
    colors: [{ nm: 'Blue', code: 'B-001', extraPr: '2' }] });
  store.receiveFinishedGoods({ id: 'in-026', ordId: 'ord-026',
    rolls: [{ id: 'roll-026a', kg: '30', m: '150', colorNm: 'Blue' }] });
  store.shipFinishedGoods({ id: 'out-026', ordId: 'ord-026', rollIds: ['roll-026a'] });
  const info = store.calcShipmentAmount('out-026');
  assert.equal(info.m, 150);
  assert.equal(info.amt, 1500);  // 150 * (8 + 2) = 1500
  assert.equal(info.byM, true);
});

// ══ 应收对账详情 getReceivableDetails ══

test('receivable details show balance and auto-settle when paid in full', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-027', no: 'G20260027', prUnit: 'KG', unitPr: 10 });
  store.receiveFinishedGoods({ id: 'in-027', ordId: 'ord-027',
    rolls: [{ id: 'roll-027a', kg: '100', colorNm: 'White' }] });
  store.shipFinishedGoods({ id: 'out-027', ordId: 'ord-027', rollIds: ['roll-027a'] });
  store.createReceivable({ id: 'ar-027', no: 'AR20260027', outIds: ['out-027'], paidTotal: 1000 });

  const details = store.getReceivableDetails('ar-027');
  assert.equal(details.totalAmt, 1000);
  assert.equal(details.paidTotal, 1000);
  assert.equal(details.balanceAmt, 0);
  assert.equal(details.status, 'settled');
});

test('receivable details show pending status when partially paid', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-028', no: 'G20260028', prUnit: 'KG', unitPr: 10 });
  store.receiveFinishedGoods({ id: 'in-028', ordId: 'ord-028',
    rolls: [{ id: 'roll-028a', kg: '100', colorNm: 'White' }] });
  store.shipFinishedGoods({ id: 'out-028', ordId: 'ord-028', rollIds: ['roll-028a'] });
  store.createReceivable({ id: 'ar-028', no: 'AR20260028', outIds: ['out-028'], paidTotal: 600 });

  const details = store.getReceivableDetails('ar-028');
  assert.equal(details.totalAmt, 1000);
  assert.equal(details.paidTotal, 600);
  assert.equal(details.balanceAmt, 400);
  assert.equal(details.status, 'pending');
});

// ══ 真实业务流程：多颜色入库 ══

test('同一订单多颜色入库后各色布卷独立管理', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-030', no: 'G20260030', colors: [
    { nm: 'Red', code: 'R-001' },
    { nm: 'Blue', code: 'B-001' },
  ]});
  store.receiveFinishedGoods({ id: 'in-030', ordId: 'ord-030', rolls: [
    { id: 'roll-030a', kg: '50', colorNm: 'Red', colorCode: 'R-001' },
    { id: 'roll-030b', kg: '30', colorNm: 'Blue', colorCode: 'B-001' },
  ]});
  var rolls = store.getRollsByOrder('ord-030');
  assert.equal(rolls.length, 2, '应生成 2 匹布');
  assert.equal(rolls[0].colorNm, 'Red');
  assert.equal(rolls[1].colorNm, 'Blue');
  assert.equal(store.getInventoryRolls().length, 2, '两匹布均在库存中');
});

// ══ 真实业务流程：多色出货按颜色缸号拆分 ══

test('同一订单多颜色出货时按颜色缸号自动分组', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-031', no: 'G20260031', colors: [
    { nm: 'Red', code: 'R-001' },
    { nm: 'Blue', code: 'B-001' },
    { nm: 'Red', code: 'R-001' },
  ]});
  store.receiveFinishedGoods({ id: 'in-031', ordId: 'ord-031',
    vatNo: 'VAT-A', rolls: [
    { id: 'roll-031a', colorNm: 'Red', vatNo: 'VAT-A' },
    { id: 'roll-031b', colorNm: 'Red', vatNo: 'VAT-A' },
  ]});
  store.receiveFinishedGoods({ id: 'in-032', ordId: 'ord-031',
    vatNo: 'VAT-B', rolls: [
    { id: 'roll-031c', colorNm: 'Blue', vatNo: 'VAT-B' },
  ]});

  var groups = store.groupRollsByColorVat('ord-031');
  assert.equal(groups.length, 2, '应按颜色+缸号拆为 2 组');
  var redGroup = groups.find(function(g){ return g.colorNm === 'Red'; });
  var blueGroup = groups.find(function(g){ return g.colorNm === 'Blue'; });
  assert.equal(redGroup.count, 2, '红色 2 匹在同一组');
  assert.equal(redGroup.vatNo, 'VAT-A');
  assert.equal(blueGroup.count, 1, '蓝色 1 匹单独一组');
  assert.equal(blueGroup.vatNo, 'VAT-B');
});

// ══ 真实业务流程：删除出货后布卷状态恢复 ══

test('删除出货记录后布卷状态恢复为在库', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-032', no: 'G20260032' });
  store.receiveFinishedGoods({ id: 'in-032', ordId: 'ord-032',
    rolls: [{ id: 'roll-032a', kg: '50' }] });
  store.shipFinishedGoods({ id: 'out-032', ordId: 'ord-032', rollIds: ['roll-032a'] });

  // 出货后状态为 out
  assert.equal(store.getRoll('roll-032a').status, 'out');
  assert.equal(store.getRoll('roll-032a').outId, 'out-032');

  // 删除出货
  store.deleteShipment('out-032');

  // 布卷恢复为在库
  assert.equal(store.getRoll('roll-032a').status, 'in', '删除出货后布卷应恢复为 in');
  assert.equal(store.getRoll('roll-032a').outId, '', 'outId 应清空');
  assert.equal(store.getInventoryRolls().length, 1, '布卷应回到可用库存');
  assert.equal(store.getShipment('out-032'), null, '出货记录应已删除');
});

// ══ 真实业务流程：退货后不回普通库存 ══

test('退货后布卷不回到普通可用库存', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-033', no: 'G20260033' });
  store.receiveFinishedGoods({ id: 'in-033', ordId: 'ord-033',
    rolls: [{ id: 'roll-033a', kg: '50' }] });
  store.shipFinishedGoods({ id: 'out-033', ordId: 'ord-033', rollIds: ['roll-033a'] });
  store.returnFinishedGoods({ id: 'ret-033', outId: 'out-033', rollIds: ['roll-033a'], reason: '质量问题' });

  // 退货后不在普通库存
  var inv = store.getInventoryRolls();
  assert.equal(inv.filter(function(r){ return r.id === 'roll-033a'; }).length, 0, '退货布卷不在可出货库存中');
  assert.equal(inv.length, 0);

  // 退货后在待处理列表
  var pending = store.getReturnPendingRolls();
  assert.equal(pending.length, 1, '退货布卷在待处理列表中');
  assert.equal(pending[0].id, 'roll-033a');
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
    break;
  }
}

if (!process.exitCode) {
  console.log(`Regression guard passed: ${passed}/${tests.length}`);
}
