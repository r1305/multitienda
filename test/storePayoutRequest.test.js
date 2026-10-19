const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { sql: [], earnings: [{ id: 1, net_amount: 90 }, { id: 2, net_amount: 45.5 }], open: false, owner: true };

const sequelize = {
  async transaction(fn) { return fn({ LOCK: { UPDATE: 'UPDATE' } }); },
  async query(sql, opts = {}) {
    state.sql.push({ sql, opts });
    if (/FROM restaurants r JOIN restaurant_user/.test(sql)) return [state.owner ? [{ id: 5, name: 'Mi tienda', commission_rate: 10 }] : []];
    if (/SELECT id FROM restaurants WHERE id/.test(sql)) return [{ id: opts.replacements[0] }];
    if (/SELECT id FROM store_payouts WHERE restaurant_id/.test(sql)) return state.open ? [{ id: 1 }] : [];
    if (/SELECT id, net_amount FROM store_earnings/.test(sql)) return state.earnings;
    if (/INSERT INTO store_payouts/.test(sql)) return [31, 1];
    if (/UPDATE store_earnings SET payout_id/.test(sql)) return [undefined, opts.replacements[1].length];
    if (/FROM store_earnings WHERE restaurant_id = \? AND DATE/.test(sql)) return [[], 0];
    if (/SUM\(net_amount\)/.test(sql)) return [{ v: 135.5, orders: 2 }];
    if (/FROM store_payouts/.test(sql)) return [{ v: 0 }];
    return [[], 0];
  },
};

stub('src/models', {
  sequelize,
  User: {}, Orderitem: {}, OrderItemAddon: {}, Item: {}, ItemCategory: {}, Restaurant: {}, Rating: {}, Order: {},
});
stub('src/middleware/auth', { generateToken() { return 't'; } });
stub('src/helpers/notifications', { async notifyDeliveryNewOrder() {}, async notifyCustomerOrderEvent() {} });

const controller = require('../src/controllers/storeOwnerController');

function fakeRes() {
  return { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

test('sendPayoutRequest crea la solicitud con el monto de la BD, ignorando restaurant_id del body', async () => {
  state.sql = []; state.open = false;
  const res = fakeRes();
  await controller.sendPayoutRequest({ user: { id: 9 }, body: { restaurant_id: 99, amount: 99999 } }, res);
  assert.strictEqual(res.body.success, false, 'un monto mayor al saldo se rechaza');

  state.sql = [];
  const ok = fakeRes();
  await controller.sendPayoutRequest({ user: { id: 9 }, body: { restaurant_id: 99 } }, ok);
  assert.strictEqual(ok.body.success, true);
  assert.strictEqual(ok.body.payout.amount, 135.5);
  const ins = state.sql.find((s) => /INSERT INTO store_payouts/.test(s.sql));
  assert.strictEqual(ins.opts.replacements[0], 5, 'usa la tienda del dueño autenticado');
  assert.strictEqual(ins.opts.replacements[1], 9);
});

test('sendPayoutRequest con una solicitud abierta responde success:false', async () => {
  state.open = true;
  const res = fakeRes();
  await controller.sendPayoutRequest({ user: { id: 9 }, body: {} }, res);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.message, /abierta/);
  state.open = false;
});

test('sendPayoutRequest sin tienda del usuario responde 403', async () => {
  state.owner = false;
  const res = fakeRes();
  await controller.sendPayoutRequest({ user: { id: 9 }, body: {} }, res);
  state.owner = true;
  assert.strictEqual(res.statusCode, 403);
});

test('getEarnings lee store_earnings (net_amount) y devuelve el saldo', async () => {
  state.sql = [];
  const res = fakeRes();
  await controller.getEarnings({ user: { id: 9 }, query: { filter: 'week' } }, res);
  const q = state.sql.find((s) => /FROM store_earnings WHERE restaurant_id = \? AND DATE/.test(s.sql));
  assert.ok(q, 'consulta store_earnings');
  assert.ok(/SUM\(net_amount\)/.test(q.sql) && !/SUM\(total\)/.test(q.sql));
  assert.strictEqual(res.body.balance.available, 135.5);
  assert.ok(Array.isArray(res.body.payouts));
});
