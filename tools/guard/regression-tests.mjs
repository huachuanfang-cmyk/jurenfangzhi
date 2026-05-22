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
