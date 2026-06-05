# Order Shipment Receivable Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect the confirmed ERP money-and-goods chain so changes to one area cannot silently break sales orders, finished goods stock, delivery notes, returns, receivable statements, or receipt account snapshots.

**Architecture:** Add a small rule registry and focused guard tests around the existing single-page ERP. Keep `index.html` as the runtime source of truth for now, and use `tools/guard/erp-core.mjs` plus static guard tests to lock accepted behavior before any broader refactor.

**Tech Stack:** Plain HTML/JavaScript in `index.html`, Node.js ESM guard scripts, `node:assert/strict`, existing `npm run guard` runner.

---

## File Structure

- Create: `tools/guard/business-rule-registry.mjs`
  - Owns named accepted business rules for the core chain.
  - Exports rule ids and labels used by guard tests.
- Create: `tools/guard/business-rule-registry-tests.mjs`
  - Verifies every first-phase core rule is registered once.
  - Prevents later agents from deleting rule definitions casually.
- Modify: `tools/guard/run-guard.mjs`
  - Adds the new registry test to the unified guard suite.
- Modify: `tools/guard/erp-core.mjs`
  - Adds pure helpers for shipment state, duplicate no-restock handling, quick shipment amount, receivable grouping, and receipt account snapshots.
- Modify: `tools/guard/regression-tests.mjs`
  - Adds behavior tests that exercise the pure helpers with realistic textile ERP records.
- Modify: `tools/guard/receivable-recon-tests.mjs`
  - Adds static guards that protect order-split reconciliation, no-order shipment grouping, readonly account display, and selected-account snapshots in `index.html`.
- Modify: `tools/guard/data-integrity-tests.mjs`
  - Adds static guards for duplicate shipment detection and no-restock duplicate void semantics.
- Modify: `index.html`
  - Only if a failing test proves the runtime does not currently expose the accepted behavior.
  - Keep edits small and local around existing helper functions and receivable modal logic.

---

### Task 1: Business Rule Registry

**Files:**
- Create: `tools/guard/business-rule-registry.mjs`
- Create: `tools/guard/business-rule-registry-tests.mjs`
- Modify: `tools/guard/run-guard.mjs`

- [ ] **Step 1: Create the rule registry**

Create `tools/guard/business-rule-registry.mjs`:

```js
export const CORE_BUSINESS_RULES = Object.freeze([
  {
    id: 'shipment-active-excludes-voided',
    area: 'shipment',
    label: '已作废和重复作废送货单不得进入有效出货集合',
  },
  {
    id: 'shipment-duplicate-void-no-restock',
    area: 'inventory',
    label: '重复送货单只能重复作废，不得普通作废回仓',
  },
  {
    id: 'receivable-quick-out-amount',
    area: 'receivable',
    label: '快速无订单收费出货进入应收时金额不能为 0',
  },
  {
    id: 'receivable-split-by-order',
    area: 'receivable',
    label: '同客户同月份对账默认按订单号隔离',
  },
  {
    id: 'receivable-no-order-group',
    area: 'receivable',
    label: '无订单出货独立分组，不自动混入普通销售订单',
  },
  {
    id: 'receipt-account-readonly-snapshot',
    area: 'account',
    label: '对账单收款账户来自账户档案，生成后只读快照',
  },
  {
    id: 'receipt-personal-not-default',
    area: 'account',
    label: '私人代收账户可选但不能默认',
  },
]);

export function ruleIds() {
  return CORE_BUSINESS_RULES.map((rule) => rule.id);
}

export function findRule(id) {
  return CORE_BUSINESS_RULES.find((rule) => rule.id === id) || null;
}
```

- [ ] **Step 2: Add the registry test**

Create `tools/guard/business-rule-registry-tests.mjs`:

```js
import assert from 'node:assert/strict';
import { CORE_BUSINESS_RULES, findRule, ruleIds } from './business-rule-registry.mjs';

const requiredRuleIds = [
  'shipment-active-excludes-voided',
  'shipment-duplicate-void-no-restock',
  'receivable-quick-out-amount',
  'receivable-split-by-order',
  'receivable-no-order-group',
  'receipt-account-readonly-snapshot',
  'receipt-personal-not-default',
];

assert.equal(CORE_BUSINESS_RULES.length, requiredRuleIds.length);
assert.deepEqual([...new Set(ruleIds())], ruleIds(), 'rule ids must be unique');

for (const id of requiredRuleIds) {
  const rule = findRule(id);
  assert.ok(rule, `missing rule: ${id}`);
  assert.ok(rule.area, `missing area: ${id}`);
  assert.ok(rule.label.includes('账') || rule.label.includes('送货') || rule.label.includes('账户') || rule.label.includes('订单'), `label too vague: ${id}`);
}

console.log(`Business rule registry guard passed: ${CORE_BUSINESS_RULES.length}/${requiredRuleIds.length}`);
```

- [ ] **Step 3: Run the new test directly**

Run:

```powershell
node tools/guard/business-rule-registry-tests.mjs
```

Expected:

```text
Business rule registry guard passed: 7/7
```

- [ ] **Step 4: Add the test to the guard runner**

In `tools/guard/run-guard.mjs`, add this command immediately after the regression guard:

```js
  [process.execPath, ['tools/guard/business-rule-registry-tests.mjs'], 'business rule registry guard'],
```

- [ ] **Step 5: Run the full guard**

Run:

```powershell
npm run guard
```

Expected:

```text
ERP guard passed.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add tools/guard/business-rule-registry.mjs tools/guard/business-rule-registry-tests.mjs tools/guard/run-guard.mjs
git commit -m "test: register core ERP business rules"
```

---

### Task 2: Pure Core Helpers For State And Amounts

**Files:**
- Modify: `tools/guard/erp-core.mjs`
- Modify: `tools/guard/regression-tests.mjs`

- [ ] **Step 1: Write failing tests for core helper behavior**

Append these tests to `tools/guard/regression-tests.mjs` near the existing receivable amount tests:

```js
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
```

- [ ] **Step 2: Run regression tests and confirm failure**

Run:

```powershell
node tools/guard/regression-tests.mjs
```

Expected:

```text
FAIL core helper excludes voided shipments from active receivable candidates
```

- [ ] **Step 3: Add pure helpers to `erp-core.mjs`**

Inside the object returned by `createGuardStore()`, add these methods after `getShipment(id)`:

```js
    isActiveShipment(shipment) {
      return Boolean(shipment && !shipment.voided && shipment.status !== 'voided' && shipment.status !== 'cancelled');
    },

    calcQuickShipmentAmount(out) {
      const unitPr = parseFloat(out.unitPr || out.price || out.pr || 0) || 0;
      const qtyM = parseFloat(out.qtyM || out.m || out.meter || out.totalM || 0) || 0;
      const qtyKG = parseFloat(out.qtyKG || out.kg || out.totalKG || 0) || 0;
      const manual = parseFloat(out.amt || out.amount || out.totalAmt || 0) || 0;
      const prUnit = String(out.prUnit || out.unit || '').toUpperCase();
      if (manual > 0) return Number(manual.toFixed(2));
      if (prUnit.includes('KG')) return Number((qtyKG * unitPr).toFixed(2));
      return Number((qtyM * unitPr).toFixed(2));
    },

    receivableShipmentCandidates() {
      return clone(data.fgo.filter((shipment) => this.isActiveShipment(shipment)));
    },

    groupReceivableShipmentsByOrder() {
      const groups = new Map();
      for (const shipment of this.receivableShipmentCandidates()) {
        const order = data.o.find((item) => item.id === shipment.ordId);
        const key = order ? order.no : 'NO_ORDER';
        if (!groups.has(key)) groups.set(key, { key, shipments: [] });
        groups.get(key).shipments.push(clone(shipment));
      }
      return [...groups.values()];
    },
```

- [ ] **Step 4: Run regression tests**

Run:

```powershell
node tools/guard/regression-tests.mjs
```

Expected:

```text
Regression guard passed
```

- [ ] **Step 5: Run full guard**

Run:

```powershell
npm run guard
```

Expected:

```text
ERP guard passed.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add tools/guard/erp-core.mjs tools/guard/regression-tests.mjs
git commit -m "test: guard shipment state and quick receivable amounts"
```

---

### Task 3: Receivable UI Static Guards

**Files:**
- Modify: `tools/guard/receivable-recon-tests.mjs`
- Modify: `index.html` only if tests fail

- [ ] **Step 1: Add static guards for accepted receivable behavior**

Append these tests to `tools/guard/receivable-recon-tests.mjs`:

```js
test('receivable edit keeps no-order quick shipments grouped separately', () => {
  must(/NO_ORDER|无订单出货|快速无订单/, 'no-order receivable grouping language or key');
  must(/quickOut|calcQuickOutAmount|quickOutByMeter/, 'quick shipment amount path exists');
});

test('receivable account fields render as readonly snapshot values', () => {
  must(/receiptAccountSnapshot|receiptAccountLabel|sameAccount/, 'receipt account snapshot helpers exist');
  must(/disabled=true|readOnly=true|只读/, 'account fields are rendered readonly or disabled');
});

test('personal receipt account is selectable but not default', () => {
  must(/receipt_personal_jjs_agbank/, 'personal account id exists');
  must(/个人代收账户-蒋劲松/, 'personal account display label exists');
  must(/个人代收账户需要财务负责人确认|个人代收账户/, 'personal account print warning exists');
  must(/isDefault:false/, 'personal account is not default');
});
```

- [ ] **Step 2: Run receivable guard and confirm current behavior**

Run:

```powershell
node tools/guard/receivable-recon-tests.mjs
```

Expected:

```text
Receivable reconciliation guard passed
```

If a test fails, inspect only the related area in `index.html` and make the smallest edit that restores the accepted behavior.

- [ ] **Step 3: If account fields are still editable, make them readonly display fields**

In the receivable modal account section in `index.html`, keep the account selector editable but render account details as readonly display fields. The runtime pattern should be equivalent to:

```js
      typeInput.readOnly = true;
      nameInput.readOnly = true;
      bankInput.readOnly = true;
      noInput.readOnly = true;
```

or:

```js
      typeInput.disabled = true;
      nameInput.disabled = true;
      bankInput.disabled = true;
      noInput.disabled = true;
```

The save logic must continue reading the selected account from the account file and saving `receiptAccountSnapshot`.

- [ ] **Step 4: Run targeted and full guard**

Run:

```powershell
node tools/guard/receivable-recon-tests.mjs
npm run guard
```

Expected:

```text
Receivable reconciliation guard passed
ERP guard passed.
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add tools/guard/receivable-recon-tests.mjs index.html
git commit -m "test: guard receivable grouping and account snapshots"
```

If `index.html` was not modified, commit only the test file:

```powershell
git add tools/guard/receivable-recon-tests.mjs
git commit -m "test: guard receivable grouping and account snapshots"
```

---

### Task 4: Duplicate Shipment And No-Restock Guard Expansion

**Files:**
- Modify: `tools/guard/data-integrity-tests.mjs`
- Modify: `tools/guard/regression-tests.mjs`
- Modify: `index.html` only if tests fail

- [ ] **Step 1: Add static guard for duplicate repair wording and metadata**

Append this test to `tools/guard/data-integrity-tests.mjs`:

```js
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
```

- [ ] **Step 2: Add behavior test for duplicate void in `erp-core.mjs`**

Append this test to `tools/guard/regression-tests.mjs`:

```js
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
```

- [ ] **Step 3: Run regression tests and confirm failure**

Run:

```powershell
node tools/guard/regression-tests.mjs
```

Expected:

```text
FAIL duplicate shipment void keeps stock out and links duplicate to keeper
```

- [ ] **Step 4: Implement the pure helper in `erp-core.mjs`**

Inside the object returned by `createGuardStore()`, add:

```js
    markDuplicateShipmentVoidNoRestock(duplicateId, keeperId) {
      const duplicate = requireRecord('fgo', duplicateId, 'duplicate shipment');
      const keeper = requireRecord('fgo', keeperId, 'keeper shipment');
      duplicate.voided = true;
      duplicate.status = 'voided';
      duplicate.noRestockOnVoid = true;
      duplicate.voidReason = '重复送货单作废（不回仓）';
      duplicate.voidedAt = duplicate.voidedAt || new Date().toISOString();
      duplicate.duplicateOf = keeper.id;
      for (const rollId of duplicate.rollIds || []) {
        const roll = byId(data.fgr, rollId);
        if (roll) {
          roll.status = 'out';
          roll.outId = keeper.id;
        }
      }
      return clone(duplicate);
    },
```

- [ ] **Step 5: Run targeted and full guard**

Run:

```powershell
node tools/guard/data-integrity-tests.mjs
node tools/guard/regression-tests.mjs
npm run guard
```

Expected:

```text
Data integrity guard passed
Regression guard passed
ERP guard passed.
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add tools/guard/data-integrity-tests.mjs tools/guard/regression-tests.mjs tools/guard/erp-core.mjs index.html
git commit -m "test: guard duplicate shipment no-restock repair"
```

---

### Task 5: Final Verification And Push

**Files:**
- No new files expected.

- [ ] **Step 1: Run full guard**

Run:

```powershell
npm run guard
```

Expected:

```text
ERP guard passed.
```

- [ ] **Step 2: Check worktree**

Run:

```powershell
git status --short
```

Expected:

```text
?? recovery-backups/
```

Only `recovery-backups/` should remain untracked. Do not commit it.

- [ ] **Step 3: Push**

Run:

```powershell
git push origin main
```

Expected:

```text
main -> main
```

## Self-Review Checklist

- The plan starts with tests or guard checks before runtime changes.
- The first visible UI changes are limited to readonly account display or existing warning behavior.
- Quick no-order shipment amount is protected before any receivable refactor.
- Split-by-order reconciliation remains protected.
- Duplicate shipment correction remains no-restock.
- Private receipt account remains selectable but not default.
- `recovery-backups/` is never staged.
