import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('index.html', 'utf8');

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('sales order delete path uses data integrity guard', () => {
  assert.match(html, /function\s+canDeleteOrder\s*\(/);
  assert.match(html, /function\s+findOrderDeleteRefs\s*\(/);
  assert.match(html, /function\s+delO\s*\([^)]*\)\s*\{[\s\S]*canDeleteOrder/);
});

test('sales order list offers cancel instead of hard delete', () => {
  assert.match(html, /function\s+cancelOrder\s*\(/);
  assert.match(html, /业务单据全面禁止硬删除/);
  const listActionBlock = html.slice(
    html.indexOf('业务单据全面禁止硬删除'),
    html.indexOf('tr.appendChild(opTd)', html.indexOf('业务单据全面禁止硬删除'))
  );
  assert.match(listActionBlock, /mkBtn\('作废'[\s\S]*cancelOrder/);
  assert.doesNotMatch(listActionBlock, /mkBtn\('删除'[\s\S]*delO/);
});

test('data integrity scanner checks orphan business records', () => {
  assert.match(html, /function\s+findDataIntegrityIssues\s*\(/);
  assert.match(html, /不存在的销售订单/);
  assert.match(html, /不存在的送货单/);
  assert.match(html, /不存在的布卷/);
  assert.match(html, /不存在的退货单/);
  assert.match(html, /不属于该销售订单/);
  assert.match(html, /重复订单号/);
  assert.match(html, /重复送货单占用同一批布卷/);
});

test('master-data delete paths use reference guards', () => {
  assert.match(html, /function\s+canDeleteCustomer\s*\(/);
  assert.match(html, /function\s+canDeleteFactory\s*\(/);
  assert.match(html, /function\s+canDeleteMaterial\s*\(/);
});

test('duplicate finished-goods shipments can be voided without returning stock', () => {
  assert.match(html, /function\s+markDuplicateShipmentVoidNoRestock\s*\(/);
  assert.match(html, /function\s+findDuplicateShipmentKeeper\s*\(/);
  const fnStart = html.indexOf('function markDuplicateShipmentVoidNoRestock');
  const fnEnd = html.indexOf('function ', fnStart + 20);
  const fn = html.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 2500);
  assert.match(fn, /noRestockOnVoid=true/);
  assert.match(fn, /voidReason='重复送货单作废（不回仓）'/);
  assert.match(fn, /rl\.outId=keeper\.id/);
  assert.doesNotMatch(fn, /rl\.status='in'/);
});

test('finished-goods shipment save rechecks stale or duplicated roll selections', () => {
  assert.match(html, /function\s+validateRollsAvailableForShipment\s*\(/);
  assert.match(html, /function\s+findDuplicateShipmentByRollIds\s*\(/);
  assert.match(html, /validateRollsAvailableForShipment\(groupRollIds,allRolls\)/);
  assert.match(html, /findDuplicateShipmentByRollIds\(groupRollIds,list\)/);
  assert.match(html, /validateRollsAvailableForShipment\(rollIds,allR\)/);
  assert.match(html, /findDuplicateShipmentByRollIds\(rollIds,DB\.fgouts\|\|\[\]\)/);
});

test('duplicate shipment void stores audit metadata and never returns stock', () => {
  const fnStart = html.indexOf('function markDuplicateShipmentVoidNoRestock');
  const fnEnd = html.indexOf('function ', fnStart + 20);
  const fn = html.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 3000);
  assert.match(fn, /duplicateOf=keeper\.id/);
  assert.match(fn, /voidedAt=new Date\(\)\.toISOString\(\)/);
  assert.match(fn, /noRestockOnVoid=true/);
  assert.match(fn, /rl\.outId=keeper\.id/);
  assert.doesNotMatch(fn, /rl\.status='in'/);
});

test('integrity repair tool exposes duplicate shipment groups with safe handling path', () => {
  assert.match(html, /function\s+findDuplicateShipmentRollGroups\s*\(/);
  assert.match(html, /重复送货占用/);
  assert.match(html, /保留较早有效单/);
  assert.match(html, /重复作废不回仓/);
  assert.match(html, /window\._fgTab='out'/);
  assert.match(html, /go\('fgstock'\)/);
});

test('legal quick no-order finished-goods shipments are whitelisted from orphan order repair', () => {
  assert.match(html, /function\s+isLegalNoOrderShipment\s*\(/);
  assert.match(html, /orderExistsForRow\(row,pair\[0\]\)/);
  assert.match(html, /isLegalNoOrderShipment\(row,pair\[0\]\)/);
  assert.match(html, /无订单出货/);
});

test('integrity repair delete blocks receivable-linked delivery notes', () => {
  assert.match(html, /function\s+repairDeleteBlockReason\s*\(/);
  assert.match(html, /target\.table==='fgo'/);
  assert.match(html, /row\.arecId/);
  assert.match(html, /DB\.arecs\|\|\[\]/);
  assert.match(html, /outIds\|\|\[\]/);
  assert.match(html, /仍有业务联动/);
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
  }
}

if (!process.exitCode) {
  console.log(`Data integrity guard passed: ${passed}/${tests.length}`);
}
