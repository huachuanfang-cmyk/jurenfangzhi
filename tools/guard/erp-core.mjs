function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function byId(items, id) {
  return items.find((item) => item.id === id) || null;
}

function isVoidedPayment(payment) {
  return Boolean(payment && (payment.voided || payment.status === 'voided' || payment.voidAt));
}

function activePaymentTotal(payments, fallback = 0) {
  if (!Array.isArray(payments) || payments.length === 0) return parseFloat(fallback) || 0;
  return payments.reduce((sum, payment) => {
    if (isVoidedPayment(payment)) return sum;
    return sum + (parseFloat(payment.amt) || 0);
  }, 0);
}

export function createGuardStore() {
  const data = {
    o: [],
    c: [],
    f: [],
    mat: [],
    t: [],
    wd: [],
    dd: [],
    fgi: [],
    fgo: [],
    fgr: [],
    ret: [],
    ar: [],
    yn: [],
    yo: [],
  };
  const deleteIntents = [];

  function requireRecord(key, id, label) {
    const record = byId(data[key], id);
    if (!record) throw new Error(`${label} not found: ${id}`);
    return record;
  }

  function orderRefMatches(record, order) {
    if (!record || !order) return false;
    const ordId = String(record.ordId || record.ord_id || record.orderId || '').split('::')[0];
    const ordNo = String(record.ordNo || record.ord_no || record.orderNo || '');
    return (!!ordId && ordId === order.id) || (!!ordNo && ordNo === order.no);
  }

  function orderExistsForRecord(record) {
    if (!record) return true;
    const ordId = String(record.ordId || record.ord_id || record.orderId || '').split('::')[0];
    const ordNo = String(record.ordNo || record.ord_no || record.orderNo || '');
    if (!ordId && !ordNo) return true;
    return data.o.some((order) => (!!ordId && order.id === ordId) || (!!ordNo && order.no === ordNo));
  }

  return {
    injectRecord(key, record) {
      if (!Object.hasOwn(data, key)) throw new Error(`unknown data key: ${key}`);
      data[key] = data[key].filter((item) => item.id !== record.id).concat(clone(record));
      return clone(record);
    },

    createOrder(order) {
      const record = {
        id: order.id,
        no: order.no || '',
        custNm: order.custNm || '',
        fab: order.fab || '',
        prUnit: order.prUnit || '',
        unitPr: order.unitPr || 0,
        delDate: order.delDate || '',
        status: order.status || 'draft',
        cancelledAt: order.cancelledAt || '',
        colors: clone(order.colors || []),
      };
      data.o = data.o.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    getOrder(id) {
      const record = byId(data.o, id);
      return record ? clone(record) : null;
    },

    updateOrderColors(id, colors) {
      const order = requireRecord('o', id, 'order');
      order.colors = clone(colors);
      return clone(order);
    },

    cancelOrder(id) {
      const order = requireRecord('o', id, 'order');
      order.status = 'cancelled';
      order.cancelledAt = order.cancelledAt || new Date().toISOString();
      return clone(order);
    },

    getProductionDocColors(id) {
      const order = requireRecord('o', id, 'order');
      return clone(order.colors || []);
    },

    receiveFinishedGoods(receipt) {
      requireRecord('o', receipt.ordId, 'order');
      const rollIds = [];
      for (const inputRoll of receipt.rolls || []) {
        const roll = {
          id: inputRoll.id,
          inId: receipt.id,
          ordId: receipt.ordId,
          rollNo: inputRoll.rollNo || '',
          vatNo: receipt.vatNo || '',
          colorNm: inputRoll.colorNm || '',
          colorCode: inputRoll.colorCode || '',
          kg: inputRoll.kg || '',
          m: inputRoll.m || '',
          status: 'in',
          outId: '',
        };
        data.fgr = data.fgr.filter((item) => item.id !== roll.id).concat(roll);
        rollIds.push(roll.id);
      }
      const record = {
        id: receipt.id,
        ordId: receipt.ordId,
        vatNo: receipt.vatNo || '',
        rollIds,
      };
      data.fgi = data.fgi.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    getRoll(id) {
      const record = byId(data.fgr, id);
      return record ? clone(record) : null;
    },

    getInventoryRolls() {
      return clone(data.fgr.filter((roll) => roll.status === 'in' && !roll.outId));
    },

    shipFinishedGoods(shipment) {
      requireRecord('o', shipment.ordId, 'order');
      for (const rollId of shipment.rollIds || []) {
        const roll = requireRecord('fgr', rollId, 'roll');
        if (roll.status !== 'in') throw new Error(`roll is not in stock: ${rollId}`);
        roll.status = 'out';
        roll.outId = shipment.id;
      }
      const record = {
        id: shipment.id,
        no: shipment.no || '',
        ordId: shipment.ordId,
        rollIds: clone(shipment.rollIds || []),
        feeNm: shipment.feeNm || '',
        feeAmt: shipment.feeAmt || '',
        arecId: '',
      };
      data.fgo = data.fgo.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    getShipment(id) {
      const record = byId(data.fgo, id);
      return record ? clone(record) : null;
    },

    returnFinishedGoods(ret) {
      const shipment = requireRecord('fgo', ret.outId, 'shipment');
      var totalKG = 0;
      for (const rollId of ret.rollIds || []) {
        const roll = requireRecord('fgr', rollId, 'roll');
        if (roll.outId !== ret.outId) throw new Error(`roll is not linked to shipment: ${rollId}`);
        roll.status = 'return_pending';
        totalKG += parseFloat(roll.kg) || 0;
      }
      const record = {
        id: ret.id,
        outId: ret.outId,
        ordId: shipment.ordId,
        rollIds: clone(ret.rollIds || []),
        reason: ret.reason || '',
        totalKG: ret.totalKG !== undefined ? ret.totalKG : totalKG,
        deductKG: ret.deductKG !== undefined ? ret.deductKG : totalKG,
        status: 'pending',
      };
      data.ret = data.ret.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    getReturnPendingRolls() {
      return clone(data.fgr.filter((roll) => roll.status === 'return_pending'));
    },

    getRollsByOrder(ordId) {
      return clone(data.fgr.filter((r) => r.ordId === ordId));
    },

    groupRollsByColorVat(ordId) {
      var rolls = data.fgr.filter(function(r){ return r.ordId === ordId && r.status === 'in'; });
      var groups = {};
      rolls.forEach(function(r){
        var key = (r.colorNm || '') + '|' + (r.vatNo || '');
        if (!groups[key]) groups[key] = { key: key, colorNm: r.colorNm || '', vatNo: r.vatNo || '', rollIds: [] };
        groups[key].rollIds.push(r.id);
      });
      return Object.keys(groups).map(function(k){ return {
        key: k,
        colorNm: groups[k].colorNm,
        vatNo: groups[k].vatNo,
        rollIds: groups[k].rollIds,
        count: groups[k].rollIds.length,
      }; });
    },

    deleteShipment(shipmentId) {
      var shipment = requireRecord('fgo', shipmentId, 'shipment');
      (shipment.rollIds || []).forEach(function(rid){
        var roll = byId(data.fgr, rid);
        if (roll) { roll.status = 'in'; roll.outId = ''; }
      });
      data.fgo = data.fgo.filter(function(s){ return s.id !== shipmentId; });
      deleteIntents.push({ key: 'fgo', id: shipmentId });
      return true;
    },

    createReceivable(receivable) {
      for (const outId of receivable.outIds || []) {
        const shipment = requireRecord('fgo', outId, 'shipment');
        shipment.arecId = receivable.id;
      }
      const record = {
        id: receivable.id,
        no: receivable.no || '',
        outIds: clone(receivable.outIds || []),
        paidTotal: receivable.paidTotal || 0,
        payments: clone(receivable.payments || []),
      };
      data.ar = data.ar.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    deleteRecord(key, id) {
      if (!Object.hasOwn(data, key)) throw new Error(`unknown data key: ${key}`);
      data[key] = data[key].filter((item) => item.id !== id);
      deleteIntents.push({ key, id });
    },

    canDeleteOrder(id) {
      const order = byId(data.o, id);
      if (!order) return { ok: false, refs: [], message: `销售订单不存在: ${id}` };

      const refs = [];
      const addIf = (label, key, matcher = (item) => orderRefMatches(item, order)) => {
        const count = data[key].filter(matcher).length;
        if (count) refs.push({ label, count });
      };

      addIf('纱线采购', 'yn');
      addIf('发料/回仓', 'yo');
      addIf('加工跟踪', 't');
      addIf('织厂加工单', 'wd');
      addIf('染整加工单', 'dd');
      addIf('成品入库', 'fgi');
      addIf('成品配料/库存', 'fgr');
      addIf('成品出货单', 'fgo');
      addIf('退货单', 'ret');

      const orderShipmentIds = new Set(data.fgo.filter((item) => orderRefMatches(item, order)).map((item) => item.id));
      const orderReturnIds = new Set(data.ret.filter((item) => orderRefMatches(item, order)).map((item) => item.id));
      addIf('应收对账单', 'ar', (item) =>
        (item.outIds || []).some((outId) => orderShipmentIds.has(outId)) ||
        (item.retIds || []).some((retId) => orderReturnIds.has(retId))
      );

      if (!refs.length) return { ok: true, refs: [], message: '' };
      const labels = refs.map((ref) => `${ref.label}${ref.count}条`).join('、');
      return {
        ok: false,
        refs,
        message: `订单 ${order.no || id} 已关联 ${labels}，不能直接删除。建议改为已取消/作废，保留历史追踪。`,
      };
    },

    findDataIntegrityIssues() {
      const issues = [];
      const noMap = new Map();
      data.o.forEach((order) => {
        if (!order.no) return;
        const list = noMap.get(order.no) || [];
        list.push(order.id);
        noMap.set(order.no, list);
      });
      for (const [no, ids] of noMap.entries()) {
        if (ids.length > 1) issues.push({ type: 'duplicate_order_no', message: `重复订单号 ${no}: ${ids.join(', ')}` });
      }

      const checks = [
        ['yn', '纱线采购'],
        ['yo', '发料/回仓'],
        ['t', '加工跟踪'],
        ['wd', '织厂加工单'],
        ['dd', '染整加工单'],
        ['fgi', '成品入库'],
        ['fgr', '成品配料/库存'],
        ['fgo', '成品出货单'],
        ['ret', '退货单'],
      ];
      checks.forEach(([key, label]) => {
        data[key].forEach((item) => {
          if (!orderExistsForRecord(item)) {
            issues.push({ type: 'orphan_order_ref', key, id: item.id, message: `${label} ${item.id || ''} 引用了不存在的销售订单` });
          }
        });
      });

      const shipmentIds = new Set(data.fgo.map((item) => item.id));
      data.ret.forEach((ret) => {
        if (ret.outId && !shipmentIds.has(ret.outId)) {
          issues.push({ type: 'orphan_shipment_ref', key: 'ret', id: ret.id, message: `退货单 ${ret.id || ''} 引用了不存在的送货单` });
        }
      });
      data.ar.forEach((ar) => {
        (ar.outIds || []).forEach((outId) => {
          if (!shipmentIds.has(outId)) {
            issues.push({ type: 'orphan_shipment_ref', key: 'ar', id: ar.id, message: `应收对账单 ${ar.id || ''} 引用了不存在的送货单 ${outId}` });
          }
        });
      });

      const rollIds = new Set(data.fgr.map((item) => item.id));
      data.fgi.forEach((receipt) => {
        (receipt.rollIds || []).forEach((rollId) => {
          if (rollId && !rollIds.has(rollId)) {
            issues.push({ type: 'orphan_roll_ref', key: 'fgi', id: receipt.id, message: `成品入库 ${receipt.id || ''} 引用了不存在的布卷 ${rollId}` });
          }
        });
      });
      data.fgo.forEach((shipment) => {
        (shipment.rollIds || []).forEach((rollId) => {
          const roll = byId(data.fgr, rollId);
          if (!roll) {
            issues.push({ type: 'orphan_roll_ref', key: 'fgo', id: shipment.id, message: `成品出货单 ${shipment.id || ''} 引用了不存在的布卷 ${rollId}` });
            return;
          }
          if (roll.outId && roll.outId !== shipment.id) {
            issues.push({ type: 'roll_shipment_mismatch', key: 'fgo', id: shipment.id, message: `成品出货单 ${shipment.id || ''} 的布卷 ${rollId} 已关联到其他送货单 ${roll.outId}` });
          }
          if (shipment.ordId && roll.ordId && roll.ordId !== shipment.ordId) {
            issues.push({ type: 'roll_order_mismatch', key: 'fgo', id: shipment.id, message: `成品出货单 ${shipment.id || ''} 的布卷 ${rollId} 不属于该销售订单` });
          }
        });
      });
      const shipmentRollGroups = new Map();
      data.fgo.forEach((shipment) => {
        if (shipment.voided || shipment.status === 'voided' || shipment.status === 'cancelled') return;
        const key = (shipment.rollIds || []).filter(Boolean).sort().join('|');
        if (!key) return;
        const list = shipmentRollGroups.get(key) || [];
        list.push(shipment);
        shipmentRollGroups.set(key, list);
      });
      for (const group of shipmentRollGroups.values()) {
        if (group.length < 2) continue;
        const nos = group.map((shipment) => shipment.no || shipment.id || '未编号').join('、');
        issues.push({ type: 'duplicate_shipment_rolls', key: 'fgo', id: group[0].id, message: `重复送货单占用同一批布卷：${nos}。请保留较早有效单，较后重复单使用「重复作废」处理，不要普通作废回仓。` });
      }
      data.ret.forEach((ret) => {
        (ret.rollIds || []).forEach((rollId) => {
          const roll = byId(data.fgr, rollId);
          if (!roll) {
            issues.push({ type: 'orphan_roll_ref', key: 'ret', id: ret.id, message: `退货单 ${ret.id || ''} 引用了不存在的布卷 ${rollId}` });
            return;
          }
          if (ret.outId && roll.outId && roll.outId !== ret.outId) {
            issues.push({ type: 'return_roll_mismatch', key: 'ret', id: ret.id, message: `退货单 ${ret.id || ''} 的布卷 ${rollId} 不属于原送货单 ${ret.outId}` });
          }
        });
      });
      const returnIds = new Set(data.ret.map((item) => item.id));
      data.ar.forEach((ar) => {
        (ar.retIds || []).forEach((retId) => {
          if (retId && !returnIds.has(retId)) {
            issues.push({ type: 'orphan_return_ref', key: 'ar', id: ar.id, message: `应收对账单 ${ar.id || ''} 引用了不存在的退货单 ${retId}` });
          }
        });
      });
      return issues;
    },

    getDeleteIntents() {
      return clone(deleteIntents);
    },

    // 软删除：将入库批次标记为 voided，不物理删除
    voidReceiptRolls(inId, reason) {
      const now = new Date().toISOString();
      let voided = 0;
      data.fgr.forEach((r) => {
        if (r.inId === inId) {
          r.status = 'voided';
          r.voidReason = reason || '录错撤销';
          r.voidedAt = now;
          voided++;
        }
      });
      // 对应 fgi 批次也标记 voided
      const receipt = byId(data.fgi, inId);
      if (receipt) { receipt.status = 'voided'; receipt.voidReason = reason || '录错撤销'; receipt.voidedAt = now; }
      return voided;
    },

    calcShipStatus(ordId) {
      // voided / repaired / written_off 疋不计入出货状态判断
      const INACTIVE = new Set(['voided', 'repaired', 'written_off', 'returned']);
      const ordRolls = data.fgr.filter((r) => r.ordId === ordId && !INACTIVE.has(r.status));
      if (!ordRolls.length) return null;
      const outRolls = ordRolls.filter((r) => r.status === 'out');
      if (!outRolls.length) return 'stocked';
      if (outRolls.length >= ordRolls.length) return 'fully_out';
      return 'partial_out';
    },

    getStockSummary() {
      // voided / returned / repaired / written_off 疋均不计入库存统计
      const INACTIVE = new Set(['returned', 'voided', 'repaired', 'written_off']);
      var activeRolls = data.fgr.filter((r) => !INACTIVE.has(r.status));
      var inRolls  = activeRolls.filter((r) => r.status === 'in');
      var outRolls = activeRolls.filter((r) => r.status === 'out');
      var totalKG = activeRolls.reduce(function(s, r){ return s + (parseFloat(r.kg)||0); }, 0);
      var outKG   = outRolls.reduce(function(s, r){ return s + (parseFloat(r.kg)||0); }, 0);
      return {
        totalKG:      Math.round(totalKG * 10) / 10,
        outKG:        Math.round(outKG * 10) / 10,
        stockKG:      Math.round((totalKG - outKG) * 10) / 10,
        totalRolls:   activeRolls.length,
        outRolls:     outRolls.length,
        inStockRolls: inRolls.length,
      };
    },

    calcShipmentAmount(shipmentId) {
      const shipment = byId(data.fgo, shipmentId);
      if (!shipment) return null;
      const order = byId(data.o, shipment.ordId);
      if (!order) return { kg: 0, m: 0, amt: 0, byM: false };

      const rolls = shipment.rollIds
        .map((rid) => byId(data.fgr, rid))
        .filter(Boolean);
      if (!rolls.length) return { kg: 0, m: 0, amt: 0, byM: false };

      var kg = rolls.reduce(function(s, r){ return s + (parseFloat(r.kg)||0); }, 0);
      var mTot = rolls.reduce(function(s, r){ return s + (parseFloat(r.m)||0); }, 0);
      var byM = order.prUnit === 'M' || order.prUnit === '米';
      var basePr = parseFloat(order.unitPr) || 0;
      var amt = 0;

      if (basePr > 0) {
        amt = rolls.reduce(function(s, r){
          var clr = (order.colors || []).find(function(c){ return c.nm === r.colorNm || c.code === r.colorCode; });
          var extraPr = parseFloat(clr ? (clr.extraPr || 0) : 0);
          var qty = byM ? (parseFloat(r.m)||0) : (parseFloat(r.kg)||0);
          return s + qty * (basePr + extraPr);
        }, 0);
      }

      return {
        kg: Math.round(kg * 10) / 10,
        m: Math.round(mTot * 10) / 10,
        amt: Math.round(amt * 100) / 100,
        byM: byM,
      };
    },

    getReceivableDetails(arId) {
      const ar = byId(data.ar, arId);
      if (!ar) return null;

      var shipments = (ar.outIds || []).map(function(outId){
        var s = byId(data.fgo, outId);
        if (!s) return null;
        var amtInfo = this.calcShipmentAmount(s.id);
        var feeAmt = parseFloat(s.feeAmt) || 0;
        return { id: s.id, ordId: s.ordId, rollIds: s.rollIds, feeNm: s.feeNm || '', feeAmt: feeAmt, ...amtInfo };
      }, this).filter(Boolean);

      var totalAmt = shipments.reduce(function(s, sh){ return s + sh.amt; }, 0);
      var shipFeeTotal = shipments.reduce(function(s, sh){ return s + (parseFloat(sh.feeAmt) || 0); }, 0);
      var returns = data.ret.filter(function(ret){
        if (ret.status === 'cancelled') return false;
        if (ar.retIds && ar.retIds.length) return ar.retIds.indexOf(ret.id) >= 0;
        return (ar.outIds || []).indexOf(ret.outId) >= 0;
      }).map(function(ret){
        var shipment = byId(data.fgo, ret.outId);
        if (!shipment) return null;
        var shipmentAmt = this.calcShipmentAmount(shipment.id);
        var retKG = parseFloat(ret.deductKG) || parseFloat(ret.totalKG) || 0;
        var shipmentKG = shipmentAmt && shipmentAmt.kg ? shipmentAmt.kg : 0;
        var returnAmt = shipmentKG > 0 ? (retKG / shipmentKG) * shipmentAmt.amt : 0;
        return {
          id: ret.id,
          outId: ret.outId,
          reason: ret.reason || '',
          deductKG: Math.round(retKG * 10) / 10,
          amt: Math.round(returnAmt * 100) / 100,
        };
      }, this).filter(Boolean);
      var returnTotal = returns.reduce(function(s, ret){ return s + ret.amt; }, 0);
      var paidTotal = activePaymentTotal(ar.payments, ar.paidTotal);
      var balance = Math.max(0, totalAmt + shipFeeTotal - returnTotal - paidTotal);

      return {
        id: ar.id,
        no: ar.no,
        outIds: ar.outIds,
        shipments: shipments,
        totalAmt: Math.round(totalAmt * 100) / 100,
        shipFeeTotal: Math.round(shipFeeTotal * 100) / 100,
        returnTotal: Math.round(returnTotal * 100) / 100,
        returns: returns,
        paidTotal: Math.round(paidTotal * 100) / 100,
        balanceAmt: Math.round(balance * 100) / 100,
        status: balance <= 0 ? 'settled' : 'pending',
      };
    },

    saveYarnPurchase(input, editId = '') {
      const existing = editId ? byId(data.yn, editId) : null;
      if (editId && !existing) throw new Error(`yarn purchase not found: ${editId}`);

      const order = input.ordId
        ? byId(data.o, input.ordId)
        : data.o.find((item) => item.no && item.no === input.ordNo);
      if (!order) throw new Error('linked sales order required');
      const ordKg = input.ordKg || '';
      const unitPr = input.unitPr || '';
      const amount = input.amt !== undefined
        ? input.amt
        : ((parseFloat(ordKg) || 0) * (parseFloat(unitPr) || 0) || '');
      const record = {
        id: editId || input.id,
        poNo: existing ? existing.poNo : (input.poNo || ''),
        ordId: order.id || input.ordId || '',
        ordNo: order.no || input.ordNo || '',
        supplier: input.supplier || '',
        spec: input.spec || '',
        ordKg: ordKg,
        unitPr: unitPr,
        amt: amount ? Number(amount).toFixed(2) : '',
        delDate: input.delDate || '',
        arrDate: input.arrDate || '',
        paid: !!input.paid,
      };

      const idx = editId ? data.yn.findIndex((item) => item.id === editId) : -1;
      if (idx >= 0) data.yn[idx] = record;
      else data.yn = data.yn.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    getYarnPurchase(id) {
      const record = byId(data.yn, id);
      return record ? clone(record) : null;
    },

    getYarnPurchases() {
      return clone(data.yn);
    },

    createYarnMovement(input) {
      const record = {
        id: input.id,
        yarnId: input.yarnId || '',
        type: input.type || 'out',
        ordNo: input.ordNo || '',
        factory: input.factory || '',
        date: input.date || '',
        kg: input.kg || '',
      };
      data.yo = data.yo.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    getLatestYarnIssueFactoryForOrder(ordIdOrNo) {
      const order = byId(data.o, ordIdOrNo);
      const ordNo = order ? order.no : ordIdOrNo;
      const matches = data.yo
        .filter((item) => item.type === 'out' && item.factory && item.ordNo === ordNo)
        .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id || '').localeCompare(String(b.id || '')));
      const latest = matches[matches.length - 1];
      return latest ? latest.factory : '';
    },

    resolveWeavingFactoryDefaults({ ordId, currentFactory = '', savedConfig = null } = {}) {
      if (currentFactory) return { factory: currentFactory, source: 'manual' };
      if (savedConfig && savedConfig.facNm) return { factory: savedConfig.facNm, source: 'saved' };
      const suggested = this.getLatestYarnIssueFactoryForOrder(ordId);
      return suggested ? { factory: suggested, source: 'yarnout' } : { factory: '', source: 'empty' };
    },

    deleteYarnPurchase(id) {
      if (data.yo.some((item) => item.yarnId === id)) {
        throw new Error(`linked yarn movement exists: ${id}`);
      }
      data.yn = data.yn.filter((item) => item.id !== id);
      deleteIntents.push({ key: 'yn', id });
      return true;
    },
  };
}
