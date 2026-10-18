const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { sql: [], affected: 1, rows: [], order: null, deposits: [], tx: [], created: [], destroyed: [] };

const fakeTx = () => {
  const t = { finished: false, LOCK: { UPDATE: 'UPDATE' }, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } };
  state.tx.push(t);
  return t;
};

const wallet = { id: 3, balance: '0', async increment(col, o) { state.deposits.push({ col, by: o.by }); } };

stub('src/models', {
  sequelize: {
    async transaction() { return fakeTx(); },
    async query(sql, opts) {
      state.sql.push({ sql, opts });
      if (/^UPDATE orders/.test(sql)) return [undefined, state.affected];
      if (/FROM orders WHERE orderstatus_id/.test(sql)) return state.rows;
      return [[], 0];
    },
  },
  Order: { async findOne() { return state.order; } },
  Wallet: { async findOne() { return wallet; }, async create() { return wallet; } },
  Transaction: { async create(d) { state.created.push(d); return d; } },
});

const pushed = [];
stub('src/helpers/notifications', {
  async notifyDeliveryNewOrder(o) { pushed.push(o.id); },
  async notifyCustomerOrderEvent() {},
});

const states = require('../src/helpers/orderStates');
const { cancelOrderWithRefund } = require('../src/helpers/orderCancel');
const { emitOrderEvent } = require('../src/helpers/orderEvents');
const scheduled = require('../src/helpers/scheduledOrders');
const otp = require('../src/helpers/otp');
const { createLimiter } = require('../src/helpers/attemptLimiter');

function reset() {
  state.sql = []; state.affected = 1; state.rows = []; state.order = null; state.deposits = []; state.tx = []; state.created = [];
}

test('transiciones desde estados terminales (5 y 6) son rechazadas con 409 sin tocar la BD', async () => {
  for (const from of [5, 6]) {
    for (const to of [2, 3, 4, 5, 6, 7]) {
      reset();
      await assert.rejects(
        states.transition({ id: 10 }, [from], to, 'admin', null),
        (e) => e instanceof states.OrderStateError && e.status === 409
      );
      assert.strictEqual(state.sql.length, 0, `${from}->${to} no debe ejecutar SQL`);
    }
  }
});

test('el cliente solo puede cancelar desde 1 y 10; la tienda no cancela un pedido en camino (4)', async () => {
  reset();
  await assert.rejects(states.transition({ id: 1 }, [2], 6, 'customer', null), states.OrderStateError);
  await assert.rejects(states.transition({ id: 1 }, [4], 6, 'store', null), states.OrderStateError);
  await assert.rejects(states.transition({ id: 1 }, [3], 4, 'store', null), states.OrderStateError);
  assert.strictEqual(state.sql.length, 0);
});

test('UPDATE condicional: affectedRows distinto de 1 produce 409', async () => {
  reset();
  state.affected = 0;
  await assert.rejects(
    states.transition({ id: 7 }, [1], 2, 'store', null, { where: { restaurant_id: 5 } }),
    (e) => e instanceof states.OrderStateError && e.status === 409
  );
  assert.match(state.sql[0].sql, /orderstatus_id IN \(\?\)/);
  assert.match(state.sql[0].sql, /restaurant_id = \?/);
  assert.deepStrictEqual(state.sql[0].opts.replacements, [2, 7, [1], 5]);
});

test('transición válida devuelve origen y destino', async () => {
  reset();
  const r = await states.transition(8, [1, 4], 2, 'store', null);
  assert.deepStrictEqual(r, { id: 8, from: [1], to: 2 });
});

test('columnas de filtro no permitidas se rechazan', async () => {
  reset();
  await assert.rejects(states.transition(8, [1], 2, 'store', null, { where: { id: 1 } }), states.OrderStateError);
});

test('cancelación de la tienda reembolsa lo pagado con billetera una sola vez', async () => {
  reset();
  state.order = { id: 20, user_id: 4, orderstatus_id: 1, wallet_amount: '15.50', unique_order_id: 'OD-1' };
  const r = await cancelOrderWithRefund({ orderId: 20, actor: 'store', scope: { restaurant_id: 5 } });
  assert.strictEqual(r.refund, true);
  assert.strictEqual(r.refundAmount, 15.5);
  assert.deepStrictEqual(state.deposits, [{ col: 'balance', by: 15.5 }]);
  assert.strictEqual(state.created[0].type, 'deposit');
  assert.strictEqual(state.tx[0].finished, 'commit');
});

test('segunda cancelación (estado ya cambiado) da 409, hace rollback y no reembolsa', async () => {
  reset();
  state.order = { id: 20, user_id: 4, orderstatus_id: 1, wallet_amount: '15.50', unique_order_id: 'OD-1' };
  state.affected = 0;
  await assert.rejects(cancelOrderWithRefund({ orderId: 20, actor: 'customer', scope: { user_id: 4 } }), (e) => e.status === 409);
  assert.strictEqual(state.deposits.length, 0);
  assert.strictEqual(state.tx[0].finished, 'rollback');
});

test('cancelar un pedido entregado (5) no reembolsa', async () => {
  reset();
  state.order = { id: 21, user_id: 4, orderstatus_id: 5, wallet_amount: '9.00', unique_order_id: 'OD-2' };
  await assert.rejects(cancelOrderWithRefund({ orderId: 21, actor: 'admin' }), states.OrderStateError);
  assert.strictEqual(state.deposits.length, 0);
});

test('un fallo de notificación no rompe el flujo', async () => {
  const boom = { notifyCustomerOrderEvent: async () => { throw new Error('fcm caído'); }, notifyDeliveryNewOrder: async () => { throw new Error('x'); } };
  const origError = console.error;
  console.error = () => {};
  try {
    await emitOrderEvent('accepted', { id: 1, user_id: 2, unique_order_id: 'A', delivery_type: 1 }, { notifications: boom });
  } finally {
    console.error = origError;
  }
});

test('accepted avisa al cliente y a repartidores solo si es entrega a domicilio', async () => {
  const calls = [];
  const n = { notifyCustomerOrderEvent: async (o, e) => calls.push(['customer', e]), notifyDeliveryNewOrder: async () => calls.push(['delivery']) };
  await emitOrderEvent('accepted', { id: 1, user_id: 2, unique_order_id: 'A', delivery_type: 1 }, { notifications: n });
  await emitOrderEvent('accepted', { id: 2, user_id: 2, unique_order_id: 'B', delivery_type: 2 }, { notifications: n });
  await emitOrderEvent('released', { id: 3, unique_order_id: 'C', delivery_type: 1 }, { notifications: n });
  assert.deepStrictEqual(calls, [['customer', 'accepted'], ['delivery'], ['customer', 'accepted'], ['delivery']]);
});

test('parseScheduledAt interpreta fecha y hora en America/Lima (UTC-5)', () => {
  const at = scheduled.parseScheduledAt({ schedule_date: '"2026-10-20"', schedule_slot: '"14:30"' });
  assert.strictEqual(new Date(at).toISOString(), '2026-10-20T19:30:00.000Z');
  assert.strictEqual(scheduled.parseScheduledAt({ schedule_date: null, schedule_slot: null }), null);
  assert.ok(scheduled.parseScheduledAt({ schedule_date: '2026-10-20', schedule_slot: '9:05-10:00' }));
});

test('liberación de programados: solo los vencidos pasan de 11 a 2 y se avisa a repartidores', async () => {
  reset();
  state.rows = [
    { id: 1, user_id: 1, unique_order_id: 'P1', delivery_type: 1, schedule_date: '"2026-10-20"', schedule_slot: '"10:00"' },
    { id: 2, user_id: 1, unique_order_id: 'P2', delivery_type: 1, schedule_date: '"2026-10-20"', schedule_slot: '"23:00"' },
  ];
  const now = new Date('2026-10-20T20:00:00Z').getTime();
  const n = await scheduled.releaseDueScheduledOrders({ force: true, now });
  assert.strictEqual(n, 1);
  const updates = state.sql.filter((s) => /^UPDATE orders/.test(s.sql));
  assert.strictEqual(updates.length, 1);
  assert.deepStrictEqual(updates[0].opts.replacements, [2, 1, [11]]);
  assert.deepStrictEqual(pushed, [1]);
});

// ─── OTP ─────────────────────────────────────────────────────────────────────
function fakeOtpModel(initial) {
  const rows = initial ? [initial] : [];
  return {
    rows,
    async findOne() { return rows.length ? rows[rows.length - 1] : null; },
    async destroy() { rows.length = 0; },
    async create(d) { rows.push({ ...d, created_at: new Date() }); },
  };
}

test('OTP caducado se rechaza y se destruye', async () => {
  const M = fakeOtpModel({ otp: '123456', created_at: new Date(Date.now() - 6 * 60 * 1000) });
  const r = await otp.verifyOtp(M, { phone: '1' }, '123456', { identifier: 'exp-1', ip: '9.9.9.1', consume: true });
  assert.strictEqual(r, 'expired');
  assert.strictEqual(M.rows.length, 0);
});

test('OTP válido se consume: el segundo uso falla', async () => {
  const M = fakeOtpModel({ otp: '654321', created_at: new Date() });
  assert.strictEqual(await otp.verifyOtp(M, { phone: '2' }, '654321', { identifier: 'ok-2', ip: '9.9.9.2', consume: true }), 'ok');
  assert.strictEqual(M.rows.length, 0);
  assert.strictEqual(await otp.verifyOtp(M, { phone: '2' }, '654321', { identifier: 'ok-2', ip: '9.9.9.2', consume: true }), 'missing');
});

test('verificación sin consumir conserva el OTP', async () => {
  const M = fakeOtpModel({ otp: '111111', created_at: new Date() });
  assert.strictEqual(await otp.verifyOtp(M, { phone: '3' }, '111111', { identifier: 'keep-3', ip: '9.9.9.3' }), 'ok');
  assert.strictEqual(M.rows.length, 1);
});

test('tras 5 intentos fallidos el identificador queda bloqueado y el OTP se destruye', async () => {
  const M = fakeOtpModel({ otp: '222222', created_at: new Date() });
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(await otp.verifyOtp(M, { phone: '4' }, '000000', { identifier: 'blk-4', ip: '9.9.9.4' }), 'invalid');
  }
  assert.strictEqual(M.rows.length, 0);
  assert.strictEqual(await otp.verifyOtp(M, { phone: '4' }, '222222', { identifier: 'blk-4', ip: '9.9.9.4' }), 'blocked');
});

test('el límite por IP bloquea aunque cambie el identificador', async () => {
  const M = fakeOtpModel({ otp: '333333', created_at: new Date() });
  for (let i = 0; i < 20; i++) {
    await otp.verifyOtp(M, { phone: 'x' }, '000000', { identifier: `ip-${i}`, ip: '8.8.8.8' });
  }
  assert.strictEqual(await otp.verifyOtp(M, { phone: 'x' }, '333333', { identifier: 'ip-nuevo', ip: '8.8.8.8' }), 'blocked');
});

test('issueOtp elimina OTP anteriores y emite uno nuevo de 6 dígitos', async () => {
  const M = fakeOtpModel({ otp: '999999', created_at: new Date() });
  const code = await otp.issueOtp(M, { phone: '5' });
  assert.match(code, /^\d{6}$/);
  assert.strictEqual(M.rows.length, 1);
  assert.strictEqual(M.rows[0].otp, code);
});

test('attemptLimiter expira la ventana sin timers', () => {
  const l = createLimiter({ max: 2, windowMs: 1000 });
  assert.strictEqual(l.fail('k', 0), false);
  assert.strictEqual(l.fail('k', 10), true);
  assert.strictEqual(l.isBlocked('k', 20), true);
  assert.strictEqual(l.isBlocked('k', 2000), false);
});
