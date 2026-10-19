const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { order: null, assigned: 14, dg: null, earnings: [], storeEarnings: [], statusUpdates: 0, commits: 0, rollbacks: 0, failCode: null };

const sequelize = {
  async transaction(fn) {
    const t = { LOCK: { UPDATE: 'UPDATE' } };
    try { const out = await fn(t); state.commits++; return out; } catch (e) { state.rollbacks++; throw e; }
  },
  async query(sql, opts = {}) {
    const r = opts.replacements || [];
    if (/FROM accept_deliveries/.test(sql)) return state.assigned ? [{ user_id: state.assigned }] : [];
    if (/UPDATE orders SET orderstatus_id/.test(sql)) { state.statusUpdates++; return [undefined, 1]; }
    if (/FROM delivery_guy_details/.test(sql)) return state.dg ? [state.dg] : [];
    if (/INSERT INTO delivery_earnings/.test(sql)) {
      if (!state.earnings.some((e) => e.order_id === r[1])) state.earnings.push({ user_id: r[0], order_id: r[1], amount: r[2], tip_amount: r[3], commission_type: r[4] });
      return [0, 1];
    }
    if (/SELECT id FROM store_earnings WHERE order_id/.test(sql)) return state.storeEarnings.filter((e) => e.order_id === r[0]);
    if (/SELECT commission_rate FROM restaurants/.test(sql)) return [{ commission_rate: 10 }];
    if (/FROM coupons WHERE code/.test(sql)) return r[0] === 'TIENDA5' ? [{ id: 1, restaurant_id: 5 }] : [{ id: 2, restaurant_id: null }];
    if (/INSERT INTO store_earnings/.test(sql)) {
      if (state.failCode) { const e = new Error('Unknown column kind'); e.original = { code: state.failCode }; throw e; }
      if (!state.storeEarnings.some((e) => e.order_id === r[1])) {
        state.storeEarnings.push({ restaurant_id: r[0], order_id: r[1], subtotal: r[2], commission_amount: r[3], coupon_absorbed_by: r[4], coupon_amount: r[5], net_amount: r[6] });
      }
      return [0, 1];
    }
    return [[], 0];
  },
};

stub('src/models', {
  sequelize,
  Order: { async findByPk() { return state.order; } },
  Setting: { async findOne() { return null; } },
});
stub('src/helpers/notifications', { async notifyDeliveryNewOrder() {}, async notifyCustomerOrderEvent() {} });

const controller = require('../src/controllers/miscControllers');

function fakeRes() {
  return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

function reset(order, dg) {
  state.order = order; state.dg = dg; state.earnings = []; state.storeEarnings = []; state.statusUpdates = 0; state.commits = 0; state.rollbacks = 0;
}

const baseOrder = () => ({
  id: 10, orderstatus_id: 4, restaurant_id: 5, sub_total: 100, delivery_charge: 6, tip_amount: 4,
  coupon_name: null, coupon_amount: 0, total: 110, payment_mode: 'COD', payable: 110, delivery_pin: null,
});

test('deliverOrder: la propina se suma 100% a la ganancia del repartidor', async () => {
  reset(baseOrder(), { commission_type: 'fixed', fixed_commission: 4 });
  const res = fakeRes();
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(state.earnings, [{ user_id: 14, order_id: 10, amount: 8, tip_amount: 4, commission_type: 'fixed' }]);
});

test('deliverOrder: sin comisión configurada igual paga la propina', async () => {
  reset(baseOrder(), null);
  const res = fakeRes();
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(state.earnings[0].amount, 4);
  assert.strictEqual(state.earnings[0].commission_type, 'fixed');
});

test('deliverOrder crea store_earnings (comisión sobre subtotal) en la misma transacción', async () => {
  reset(baseOrder(), { commission_type: 'fixed', fixed_commission: 4 });
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, fakeRes());
  assert.strictEqual(state.storeEarnings.length, 1);
  assert.strictEqual(state.storeEarnings[0].commission_amount, 10);
  assert.strictEqual(state.storeEarnings[0].net_amount, 90);
  assert.strictEqual(state.commits, 1);
});

test('deliverOrder: cupón de la tienda se descuenta a la tienda, el del admin no', async () => {
  reset({ ...baseOrder(), coupon_name: 'TIENDA5', coupon_amount: 20, payment_mode: 'MERCADOPAGO', payable: 0 }, null);
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, fakeRes());
  assert.strictEqual(state.storeEarnings[0].coupon_absorbed_by, 'store');
  assert.strictEqual(state.storeEarnings[0].net_amount, 70);

  reset({ ...baseOrder(), coupon_name: 'ADMIN10', coupon_amount: 20 }, null);
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, fakeRes());
  assert.strictEqual(state.storeEarnings[0].coupon_absorbed_by, 'platform');
  assert.strictEqual(state.storeEarnings[0].net_amount, 90);
});

test('deliverOrder es idempotente: repetir no duplica store_earnings ni ganancias', async () => {
  reset(baseOrder(), { commission_type: 'fixed', fixed_commission: 4 });
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, fakeRes());
  state.order = baseOrder();
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, fakeRes());
  assert.strictEqual(state.storeEarnings.length, 1);
  assert.strictEqual(state.earnings.length, 1);
});

test('deliverOrder de un pedido ajeno no registra nada', async () => {
  reset(baseOrder(), null);
  state.assigned = 99;
  const res = fakeRes();
  await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, res);
  state.assigned = 14;
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(state.storeEarnings.length, 0);
  assert.strictEqual(state.earnings.length, 0);
});

test('deliverOrder: columna o tabla ausente avisa "Falta ejecutar migrate.js" y responde 500', async () => {
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.join(' '));
  try {
    for (const code of ['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE']) {
      reset(baseOrder(), null);
      state.failCode = code;
      const res = fakeRes();
      await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, res);
      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(state.rollbacks, 1);
    }
    assert.strictEqual(logged.filter((l) => l.includes('Falta ejecutar migrate.js')).length, 2);
    reset(baseOrder(), null);
    state.failCode = 'ER_LOCK_DEADLOCK';
    logged.length = 0;
    await controller.deliverOrder({ user: { id: 14 }, body: { order_id: 10 } }, fakeRes());
    assert.strictEqual(logged.length, 0);
  } finally { console.error = orig; state.failCode = null; }
});
