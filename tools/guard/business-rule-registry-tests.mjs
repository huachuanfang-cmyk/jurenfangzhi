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
  assert.ok(
    rule.label.includes('账') ||
      rule.label.includes('送货') ||
      rule.label.includes('账户') ||
      rule.label.includes('订单'),
    `label too vague: ${id}`
  );
}

console.log(`Business rule registry guard passed: ${CORE_BUSINESS_RULES.length}/${requiredRuleIds.length}`);
