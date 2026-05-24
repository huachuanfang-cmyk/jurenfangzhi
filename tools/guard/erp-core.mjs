function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function byId(items, id) {
  return items.find((item) => item.id === id) || null;
}

export function createGuardStore() {
  const data = {
    o: [],
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

  return {
    createOrder(order) {
      const record = {
        id: order.id,
        no: order.no || '',
        custNm: order.custNm || '',
        fab: order.fab || '',
        prUnit: order.prUnit || '',
        unitPr: order.unitPr || 0,
        delDate: order.delDate || '',
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
      };
      data.ar = data.ar.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    deleteRecord(key, id) {
      if (!Object.hasOwn(data, key)) throw new Error(`unknown data key: ${key}`);
      data[key] = data[key].filter((item) => item.id !== id);
      deleteIntents.push({ key, id });
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
      var balance = Math.max(0, totalAmt + shipFeeTotal - returnTotal - (parseFloat(ar.paidTotal) || 0));

      return {
        id: ar.id,
        no: ar.no,
        outIds: ar.outIds,
        shipments: shipments,
        totalAmt: Math.round(totalAmt * 100) / 100,
        shipFeeTotal: Math.round(shipFeeTotal * 100) / 100,
        returnTotal: Math.round(returnTotal * 100) / 100,
        returns: returns,
        paidTotal: parseFloat(ar.paidTotal) || 0,
        balanceAmt: Math.round(balance * 100) / 100,
        status: balance <= 0 ? 'settled' : 'pending',
      };
    },

    saveYarnPurchase(input, editId = '') {
      const existing = editId ? byId(data.yn, editId) : null;
      if (editId && !existing) throw new Error(`yarn purchase not found: ${editId}`);

      const order = input.ordId ? byId(data.o, input.ordId) : null;
      const ordKg = input.ordKg || '';
      const unitPr = input.unitPr || '';
      const amount = input.amt !== undefined
        ? input.amt
        : ((parseFloat(ordKg) || 0) * (parseFloat(unitPr) || 0) || '');
      const record = {
        id: editId || input.id,
        poNo: existing ? existing.poNo : (input.poNo || ''),
        ordId: input.ordId || '',
        ordNo: order ? order.no : (input.ordNo || ''),
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
