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
      requireRecord('fgo', ret.outId, 'shipment');
      for (const rollId of ret.rollIds || []) {
        const roll = requireRecord('fgr', rollId, 'roll');
        if (roll.outId !== ret.outId) throw new Error(`roll is not linked to shipment: ${rollId}`);
        roll.status = 'return_pending';
      }
      const record = {
        id: ret.id,
        outId: ret.outId,
        rollIds: clone(ret.rollIds || []),
        reason: ret.reason || '',
        status: 'pending',
      };
      data.ret = data.ret.filter((item) => item.id !== record.id).concat(record);
      return clone(record);
    },

    getReturnPendingRolls() {
      return clone(data.fgr.filter((roll) => roll.status === 'return_pending'));
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
  };
}
