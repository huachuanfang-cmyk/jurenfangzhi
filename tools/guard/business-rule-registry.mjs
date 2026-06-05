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
