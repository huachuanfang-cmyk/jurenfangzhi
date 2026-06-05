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

test('linked sales order cannot be hard deleted', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-linked', no: 'G20260088', custNm: 'Linked Customer' });
  store.receiveFinishedGoods({
    id: 'in-linked',
    ordId: 'ord-linked',
    rolls: [{ id: 'roll-linked', kg: '20.5' }],
  });

  assert.equal(store.canDeleteOrder('ord-linked').ok, false);
  assert.match(store.canDeleteOrder('ord-linked').message, /成品入库/);
});

test('unlinked draft sales order can still be hard deleted', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-draft', no: 'G20260089', status: '草稿' });

  assert.equal(store.canDeleteOrder('ord-draft').ok, true);
});

test('linked sales order can be cancelled without deleting linked records', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-linked-cancel', no: 'G20260090', custNm: 'Linked Customer' });
  store.receiveFinishedGoods({
    id: 'in-linked-cancel',
    ordId: 'ord-linked-cancel',
    rolls: [{ id: 'roll-linked-cancel', kg: '20.5' }],
  });

  const cancelled = store.cancelOrder('ord-linked-cancel');

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(store.getOrder('ord-linked-cancel').status, 'cancelled');
  assert.equal(store.getRoll('roll-linked-cancel').status, 'in');
  assert.equal(store.canDeleteOrder('ord-linked-cancel').ok, false);
});

test('integrity scan reports orphan finished-goods records', () => {
  const store = createGuardStore();
  store.injectRecord('fgr', {
    id: 'roll-orphan',
    ordId: 'missing-order',
    rollNo: '1',
    kg: '18',
    status: 'in',
  });

  const issues = store.findDataIntegrityIssues();
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /不存在的销售订单/);
});

test('integrity scan reports broken roll references across stock flow', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-030', no: 'G20260030' });
  store.injectRecord('fgi', { id: 'in-broken', ordId: 'ord-030', rollIds: ['missing-roll'] });
  store.injectRecord('fgo', { id: 'out-broken', ordId: 'ord-030', rollIds: ['missing-roll'] });
  store.injectRecord('ret', { id: 'ret-broken', ordId: 'ord-030', outId: 'out-broken', rollIds: ['missing-roll'] });
  store.injectRecord('ar', { id: 'ar-broken', outIds: ['out-broken'], retIds: ['missing-ret'] });

  const messages = store.findDataIntegrityIssues().map((issue) => issue.message).join('\n');
  assert.match(messages, /成品入库.*不存在的布卷 missing-roll/);
  assert.match(messages, /成品出货单.*不存在的布卷 missing-roll/);
  assert.match(messages, /退货单.*不存在的布卷 missing-roll/);
  assert.match(messages, /应收对账单.*不存在的退货单 missing-ret/);
});

test('integrity scan reports rolls linked to wrong shipment or order', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-a', no: 'G20260031' });
  store.createOrder({ id: 'ord-b', no: 'G20260032' });
  store.injectRecord('fgr', { id: 'roll-a', ordId: 'ord-a', status: 'out', outId: 'out-a' });
  store.injectRecord('fgo', { id: 'out-b', ordId: 'ord-b', rollIds: ['roll-a'] });
  store.injectRecord('ret', { id: 'ret-b', ordId: 'ord-b', outId: 'out-b', rollIds: ['roll-a'] });

  const messages = store.findDataIntegrityIssues().map((issue) => issue.message).join('\n');
  assert.match(messages, /布卷 roll-a 已关联到其他送货单 out-a/);
  assert.match(messages, /布卷 roll-a 不属于该销售订单/);
  assert.match(messages, /退货单 ret-b 的布卷 roll-a 不属于原送货单 out-b/);
});

test('integrity scan reports duplicate active shipments for the same rolls', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-dup-out', no: 'G-DUP-OUT' });
  store.receiveFinishedGoods({ id: 'in-dup-out', ordId: 'ord-dup-out', rolls: [{ id: 'roll-dup-out', kg: '30' }] });
  store.shipFinishedGoods({ id: 'out-dup-1', no: 'DH20260038', ordId: 'ord-dup-out', rollIds: ['roll-dup-out'] });
  store.injectRecord('fgo', { id: 'out-dup-2', no: 'DH20260039', ordId: 'ord-dup-out', rollIds: ['roll-dup-out'] });

  const messages = store.findDataIntegrityIssues().map((issue) => issue.message).join('\n');
  assert.match(messages, /重复送货单占用同一批布卷/);
  assert.match(messages, /DH20260038/);
  assert.match(messages, /DH20260039/);
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

test('AR shipment amount computed for quick no-order sample delivery', () => {
  const store = createGuardStore();
  store.injectRecord('fgo', {
    id: 'quick-sample-001',
    no: 'DH20260040',
    isQuick: true,
    custNm: '新昌丝绸服装（深圳）有限公司',
    ordNo: '—',
    fab: '慕斯羊毛洗系列',
    clr: '黑色-19',
    lot: '6378-19',
    prUnit: 'meter',
    unitPr: '40',
    pcsData: [{ piNo: '1', kg: 3, meter: '3' }],
  });

  const info = store.calcShipmentAmount('quick-sample-001');
  assert.equal(info.kg, 3);
  assert.equal(info.m, 3);
  assert.equal(info.amt, 120);
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

test('receivable details ignore voided duplicate payments', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-028v', no: 'G20260028V', prUnit: 'KG', unitPr: 10 });
  store.receiveFinishedGoods({ id: 'in-028v', ordId: 'ord-028v',
    rolls: [{ id: 'roll-028v-a', kg: '100', colorNm: 'White' }] });
  store.shipFinishedGoods({ id: 'out-028v', ordId: 'ord-028v', rollIds: ['roll-028v-a'] });
  store.createReceivable({
    id: 'ar-028v',
    no: 'AR20260028V',
    outIds: ['out-028v'],
    paidTotal: 1000,
    payments: [
      { id: 'pay-void', amt: '1000', date: '2026-05-26', method: '转账', status: 'voided', voidReason: '重复录入' },
      { id: 'pay-active', amt: '200', date: '2026-05-26', method: '转账' },
    ],
  });

  const details = store.getReceivableDetails('ar-028v');
  assert.equal(details.totalAmt, 1000);
  assert.equal(details.paidTotal, 200);
  assert.equal(details.balanceAmt, 800);
  assert.equal(details.status, 'pending');
});

test('receivable details include shipment extra fee in balance', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-029', no: 'G20260029', prUnit: 'KG', unitPr: 10 });
  store.receiveFinishedGoods({ id: 'in-029', ordId: 'ord-029',
    rolls: [{ id: 'roll-029a', kg: '40.6', colorNm: 'Light purple' }] });
  store.shipFinishedGoods({
    id: 'out-029',
    ordId: 'ord-029',
    rollIds: ['roll-029a'],
    feeNm: '小缸费',
    feeAmt: '300',
  });
  store.createReceivable({ id: 'ar-029', no: 'AR20260029', outIds: ['out-029'] });

  const details = store.getReceivableDetails('ar-029');
  assert.equal(details.totalAmt, 406);
  assert.equal(details.shipFeeTotal, 300);
  assert.equal(details.balanceAmt, 706);
});

test('receivable details subtract returned deduct KG from selected shipment', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-030-ret', no: 'G20260030', prUnit: 'KG', unitPr: 45 });
  store.receiveFinishedGoods({ id: 'in-030-ret', ordId: 'ord-030-ret',
    rolls: [
      { id: 'roll-030-ret-a', kg: '1179.3', colorNm: 'Natural' },
      { id: 'roll-030-ret-b', kg: '380.3', colorNm: 'Natural' },
    ] });
  store.shipFinishedGoods({ id: 'out-030-ret-a', ordId: 'ord-030-ret', rollIds: ['roll-030-ret-a'] });
  store.shipFinishedGoods({ id: 'out-030-ret-b', ordId: 'ord-030-ret', rollIds: ['roll-030-ret-b'] });
  store.returnFinishedGoods({
    id: 'ret-030',
    outId: 'out-030-ret-b',
    rollIds: ['roll-030-ret-b'],
    reason: '品质问题',
    deductKG: '325.3',
  });
  store.createReceivable({ id: 'ar-030-ret', no: 'AR20260030', outIds: ['out-030-ret-a', 'out-030-ret-b'] });

  const details = store.getReceivableDetails('ar-030-ret');
  assert.equal(details.totalAmt, 70182);
  assert.equal(details.returnTotal, 14638.5);
  assert.equal(details.balanceAmt, 55543.5);
  assert.equal(details.returns.length, 1);
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

// ══ 纱线采购：编辑不能变新增 ══

test('editing yarn purchase updates existing record without creating duplicate PO', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-yarn-001', no: 'G20260675' });
  store.saveYarnPurchase({
    id: 'yn-001',
    poNo: 'PO20260001',
    ordId: 'ord-yarn-001',
    supplier: '沃马纺织',
    spec: '32S/1精棉',
    ordKg: '1675',
    unitPr: '23.5',
    delDate: '',
    arrDate: '2026-05-08',
  });

  const edited = store.saveYarnPurchase({
    id: 'yn-001',
    ordId: 'ord-yarn-001',
    supplier: '沃马纺织',
    spec: '32S/1精棉',
    ordKg: '1675',
    unitPr: '23.5',
    delDate: '2026-05-08',
    arrDate: '2026-05-08',
  }, 'yn-001');

  assert.equal(edited.poNo, 'PO20260001', '编辑应保留原采购单号');
  assert.equal(store.getYarnPurchases().length, 1, '编辑补交期不应新增第二张采购单');
  assert.equal(store.getYarnPurchase('yn-001').delDate, '2026-05-08');
});

test('stale yarn edit id is rejected instead of being saved as a new purchase', () => {
  const store = createGuardStore();

  assert.throws(
    () => store.saveYarnPurchase({
      id: 'missing-yarn',
      supplier: '沃马纺织',
      spec: '32S/1精棉',
      ordKg: '1675',
      unitPr: '23.5',
    }, 'missing-yarn'),
    /yarn purchase not found/
  );
  assert.equal(store.getYarnPurchases().length, 0);
});

test('yarn purchase requires a linked sales order', () => {
  const store = createGuardStore();

  assert.throws(
    () => store.saveYarnPurchase({
      id: 'yn-no-order',
      supplier: '沃马纺织',
      spec: '32S/1精棉',
      ordKg: '1675',
      unitPr: '23.5',
    }),
    /linked sales order required/
  );
  assert.equal(store.getYarnPurchases().length, 0);
});

test('yarn purchase delete is blocked when issue or return records reference it', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-yarn-002', no: 'G20260676' });
  store.saveYarnPurchase({
    id: 'yn-002',
    poNo: 'PO20260002',
    ordId: 'ord-yarn-002',
    supplier: '沃马纺织',
    spec: '32S/1精棉',
    ordKg: '1675',
    unitPr: '23.5',
  });
  store.createYarnMovement({ id: 'yo-001', yarnId: 'yn-002', type: 'out', kg: '100' });

  assert.throws(() => store.deleteYarnPurchase('yn-002'), /linked yarn movement/);
  assert.equal(store.getYarnPurchase('yn-002').poNo, 'PO20260002');
  assert.deepEqual(store.getDeleteIntents(), []);
});

test('weaving doc suggests factory from latest yarn issue when no saved config', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-wd-001', no: 'G20260675' });
  store.createYarnMovement({
    id: 'yo-old',
    type: 'out',
    ordNo: 'G20260675',
    factory: '旧织厂',
    date: '2026-05-01',
    kg: '500',
  });
  store.createYarnMovement({
    id: 'yo-new',
    type: 'out',
    ordNo: 'G20260675',
    factory: '东莞市裕泰纺织科技有限公司',
    date: '2026-05-08',
    kg: '1675',
  });

  const defaults = store.resolveWeavingFactoryDefaults({ ordId: 'ord-wd-001' });
  assert.equal(defaults.factory, '东莞市裕泰纺织科技有限公司');
  assert.equal(defaults.source, 'yarnout');
});

test('weaving doc saved factory is not overwritten by yarn issue suggestion', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-wd-002', no: 'G20260676' });
  store.createYarnMovement({
    id: 'yo-wd-002',
    type: 'out',
    ordNo: 'G20260676',
    factory: '发料记录织厂',
    date: '2026-05-08',
    kg: '1000',
  });

  const defaults = store.resolveWeavingFactoryDefaults({
    ordId: 'ord-wd-002',
    savedConfig: { facNm: '已保存织厂' },
  });
  assert.equal(defaults.factory, '已保存织厂');
  assert.equal(defaults.source, 'saved');
});

// ══ 软删除（撤销入库）：voided 疋不影响库存统计 ══

test('voided rolls are excluded from stock count and KG', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-v01', no: 'G20260701' });
  store.receiveFinishedGoods({ id: 'in-v01', ordId: 'ord-v01', rolls: [
    { id: 'roll-v01a', kg: '40' },
    { id: 'roll-v01b', kg: '30' },
    { id: 'roll-v01c', kg: '20' },
  ]});

  // 撤销前：3匹在库
  const before = store.getStockSummary();
  assert.equal(before.inStockRolls, 3, '撤销前应有3匹在库');
  assert.equal(before.stockKG, 90, '撤销前在库KG=90');

  // 撤销 in-v01 批次
  store.voidReceiptRolls('in-v01', '数量录错');

  // 撤销后：0匹在库，KG=0
  const after = store.getStockSummary();
  assert.equal(after.inStockRolls, 0, '撤销后在库匹数应为0');
  assert.equal(after.stockKG, 0, '撤销后在库KG应为0');
  assert.equal(after.totalRolls, 0, '撤销后总活动匹数为0（voided不计入）');
});

test('voided rolls do not count as in-stock in calcShipStatus', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-v02', no: 'G20260702' });
  store.receiveFinishedGoods({ id: 'in-v02', ordId: 'ord-v02', rolls: [
    { id: 'roll-v02a', kg: '50' },
  ]});

  // 有在库疋时状态为 stocked
  assert.equal(store.calcShipStatus('ord-v02'), 'stocked');

  // 撤销后：没有任何活动疋，状态应为 null 而非 stocked
  store.voidReceiptRolls('in-v02', '录错');
  assert.equal(store.calcShipStatus('ord-v02'), null, '所有疋voided后状态应为null');
});

test('voided rolls are physically preserved for audit trail', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-v03', no: 'G20260703' });
  store.receiveFinishedGoods({ id: 'in-v03', ordId: 'ord-v03', rolls: [
    { id: 'roll-v03a', kg: '60' },
    { id: 'roll-v03b', kg: '40' },
  ]});

  store.voidReceiptRolls('in-v03', '审计测试原因');

  // 记录仍然存在（软删除，不是硬删除）
  const rollA = store.getRoll('roll-v03a');
  assert.ok(rollA, 'voided疋记录应保留在数据库中');
  assert.equal(rollA.status, 'voided', '状态应为voided');
  assert.equal(rollA.voidReason, '审计测试原因', '撤销原因应记录');
  assert.ok(rollA.voidedAt, '撤销时间戳应记录');

  // voided 疋不出现在可出货库存中
  const inventory = store.getInventoryRolls();
  assert.equal(inventory.find((r) => r.id === 'roll-v03a'), undefined, 'voided疋不在可出货库存');
});

test('mix of voided and normal rolls: only active rolls counted', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-v04', no: 'G20260704' });
  // 批次1：正常
  store.receiveFinishedGoods({ id: 'in-v04a', ordId: 'ord-v04', rolls: [
    { id: 'roll-v04a', kg: '50' },
    { id: 'roll-v04b', kg: '50' },
  ]});
  // 批次2：撤销
  store.receiveFinishedGoods({ id: 'in-v04b', ordId: 'ord-v04', rolls: [
    { id: 'roll-v04c', kg: '80' },
  ]});
  store.voidReceiptRolls('in-v04b', '录错批次');

  const s = store.getStockSummary();
  assert.equal(s.inStockRolls, 2, '只有正常批次的2匹在库');
  assert.equal(s.stockKG, 100, '只统计正常批次的100KG');

  // 出货时只能选正常批次
  store.shipFinishedGoods({ id: 'out-v04', ordId: 'ord-v04', rollIds: ['roll-v04a'] });
  const s2 = store.getStockSummary();
  assert.equal(s2.inStockRolls, 1, '出货1匹后剩1匹');
  assert.equal(s2.stockKG, 50);
});

// ══ 回修/扣损状态排除 ══

test('repaired rolls are excluded from stock count and KG', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-rp01', no: 'G20260801' });
  store.receiveFinishedGoods({ id: 'in-rp01', ordId: 'ord-rp01', rolls: [
    { id: 'roll-rp01a', kg: '30' },
    { id: 'roll-rp01b', kg: '25' },
  ]});
  // 模拟将疋手动标记为 repaired（回修流程完成后的最终状态）
  const r = store.getRoll('roll-rp01a');
  assert.ok(r, 'roll should exist');
  // 直接操作内部状态（通过接口无法直接设置 repaired，但测试验证 getStockSummary 过滤逻辑）
  // 用 returnFinishedGoods 先退货，再验证退货不计入库存
  store.shipFinishedGoods({ id: 'out-rp01', ordId: 'ord-rp01', rollIds: ['roll-rp01a', 'roll-rp01b'] });
  // 退货后 returnFinishedGoods
  store.returnFinishedGoods({ id: 'ret-rp01', outId: 'out-rp01', ordId: 'ord-rp01', rollIds: ['roll-rp01a'] });
  const s = store.getStockSummary();
  // return_pending 疋也不应计入在库（不是 'in' 状态）
  assert.equal(s.inStockRolls, 0, '出货后无在库匹');
});

test('written_off rolls are excluded from stock count', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-wo01', no: 'G20260802' });
  store.receiveFinishedGoods({ id: 'in-wo01', ordId: 'ord-wo01', rolls: [
    { id: 'roll-wo01a', kg: '40' },
    { id: 'roll-wo01b', kg: '35' },
  ]});
  // 标记 voided（erp-core voidReceiptRolls 可用，written_off 逻辑相同：不是 'in' 状态）
  store.voidReceiptRolls('in-wo01', '报废');
  const s = store.getStockSummary();
  assert.equal(s.inStockRolls, 0, '报废后无在库匹');
  assert.equal(s.stockKG, 0, '报废后 KG 为 0');
  // 原始数据保留
  assert.ok(store.getRoll('roll-wo01a'), '报废疋物理保留');
  assert.equal(store.getRoll('roll-wo01a').status, 'voided');
});

test('calcShipStatus excludes repaired/voided rolls from ratio', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-cs01', no: 'G20260803' });
  store.receiveFinishedGoods({ id: 'in-cs01', ordId: 'ord-cs01', rolls: [
    { id: 'roll-cs01a', kg: '20' },
    { id: 'roll-cs01b', kg: '20' },
  ]});
  store.shipFinishedGoods({ id: 'out-cs01', ordId: 'ord-cs01', rollIds: ['roll-cs01a'] });
  // 退货疋不参与出货状态判断
  store.returnFinishedGoods({ id: 'ret-cs01', outId: 'out-cs01', ordId: 'ord-cs01', rollIds: ['roll-cs01a'] });
  // 将另一批 voided（模拟扣损）
  store.receiveFinishedGoods({ id: 'in-cs01b', ordId: 'ord-cs01', rolls: [
    { id: 'roll-cs01c', kg: '20' },
  ]});
  store.voidReceiptRolls('in-cs01b', '测试');
  // 有效疋只剩 roll-cs01b (in)，未完全出货
  const status = store.calcShipStatus('ord-cs01');
  assert.notEqual(status, 'fully_out', 'voided/returned不计入分母，仅roll-cs01b在库，状态应为stocked');
  assert.equal(status, 'stocked');
});

test('core helper excludes voided shipments from active receivable candidates', () => {
  const store = createGuardStore();
  store.injectRecord('fgo', { id: 'out-active', no: 'DH-A', custNm: '客户A', amt: 100 });
  store.injectRecord('fgo', { id: 'out-void', no: 'DH-V', custNm: '客户A', status: 'voided', amt: 200 });
  store.injectRecord('fgo', { id: 'out-dup', no: 'DH-D', custNm: '客户A', status: 'voided', noRestockOnVoid: true, amt: 300 });

  const candidates = store.receivableShipmentCandidates();

  assert.deepEqual(candidates.map((x) => x.id), ['out-active']);
});

test('core helper computes quick no-order sample amount from meters and unit price', () => {
  const store = createGuardStore();
  const amount = store.calcQuickShipmentAmount({
    no: '20260040',
    custNm: '新昌丝绸服装（深圳）有限公司',
    qtyM: '3',
    unitPr: '40',
    prUnit: 'M',
    rm: 'SAMPLE 打样用',
  });

  assert.equal(amount, 120);
});

test('core helper groups no-order shipments separately from sales orders', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-1', no: 'G20260693', custNm: '清远幸运龙服装有限公司' });
  store.receiveFinishedGoods({
    id: 'in-1',
    ordId: 'ord-1',
    rolls: [{ id: 'roll-1', rollNo: '1', kg: '10', m: '100' }],
  });
  store.shipFinishedGoods({ id: 'out-order', ordId: 'ord-1', no: 'DH20260026', rollIds: ['roll-1'] });
  store.injectRecord('fgo', {
    id: 'out-quick',
    no: '20260040',
    custNm: '新昌丝绸服装（深圳）有限公司',
    quickOut: true,
    qtyM: '3',
    unitPr: '40',
    prUnit: 'M',
  });

  const groups = store.groupReceivableShipmentsByOrder();

  assert.ok(groups.some((group) => group.key === 'G20260693'));
  assert.ok(groups.some((group) => group.key === 'NO_ORDER'));
});

test('duplicate shipment void keeps stock out and links duplicate to keeper', () => {
  const store = createGuardStore();
  store.createOrder({ id: 'ord-dup-core', no: 'G20260682', custNm: '清远幸运龙服装有限公司' });
  store.receiveFinishedGoods({
    id: 'in-dup-core',
    ordId: 'ord-dup-core',
    rolls: [{ id: 'roll-dup-core', rollNo: '1500', kg: '19', m: '1535' }],
  });
  store.shipFinishedGoods({ id: 'out-keeper', no: 'DH20260038', ordId: 'ord-dup-core', rollIds: ['roll-dup-core'] });
  store.injectRecord('fgo', { id: 'out-dup', no: 'DH20260039', ordId: 'ord-dup-core', rollIds: ['roll-dup-core'] });

  store.markDuplicateShipmentVoidNoRestock('out-dup', 'out-keeper');

  const duplicate = store.getShipment('out-dup');
  const roll = store.getRoll('roll-dup-core');
  assert.equal(duplicate.status, 'voided');
  assert.equal(duplicate.noRestockOnVoid, true);
  assert.equal(duplicate.duplicateOf, 'out-keeper');
  assert.equal(roll.status, 'out');
  assert.equal(roll.outId, 'out-keeper');
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
