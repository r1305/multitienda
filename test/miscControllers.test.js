const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { order: null, rating: null, created: null, otpRows: [], updatedPassword: null, assigned: 14 };

const sequelize = {
  async transaction(fn) {
    const t = { LOCK: { UPDATE: 'UPDATE' } };
    return fn(t);
  },
  async query(sql) {
    if (/FROM accept_deliveries/.test(sql)) return state.assigned ? [{ user_id: state.assigned }] : [];
    return [[], 0];
  },
};

function otpModel() {
  return {
    async findOne() { return state.otpRows.length ? state.otpRows[state.otpRows.length - 1] : null; },
    async destroy() { state.otpRows.length = 0; },
    async create(d) { state.otpRows.push({ ...d, created_at: new Date() }); },
  };
}

stub('src/models', {
  sequelize,
  Order: { async findOne() { return state.order; } },
  Rating: {
    async findOne() { return state.rating; },
    async create(d) { state.created = d; return d; },
  },
  PasswordResetOtp: otpModel(),
  SmsOtp: otpModel(),
  User: {
    async findOne() { return { async update(d) { state.updatedPassword = d.password; } }; },
  },
});
stub('src/helpers/notifications', { async notifyDeliveryNewOrder() {}, async notifyCustomerOrderEvent() {} });

const controller = require('../src/controllers/miscControllers');

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (body, extra = {}) => ({ user: { id: 1 }, body, ip: '7.7.7.7', ...extra });

test('rateOrder rechaza un pedido no entregado', async () => {
  state.created = null; state.rating = null;
  state.order = { id: 10, user_id: 1, restaurant_id: 5, orderstatus_id: 4 };
  const res = fakeRes();
  await controller.rateOrder(req({ order_id: 10, rating_store: 5 }), res);
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(state.created, null);
});

test('rateOrder de un pedido ajeno responde 404', async () => {
  state.created = null; state.order = null;
  const res = fakeRes();
  await controller.rateOrder(req({ order_id: 11, rating_store: 5 }), res);
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(state.created, null);
});

test('rateOrder no permite calificar dos veces', async () => {
  state.created = null;
  state.order = { id: 12, user_id: 1, restaurant_id: 5, orderstatus_id: 5 };
  state.rating = { id: 1 };
  const res = fakeRes();
  await controller.rateOrder(req({ order_id: 12, rating_store: 4 }), res);
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(state.created, null);
});

test('rateOrder valida el rango 1-5', async () => {
  state.created = null; state.rating = null;
  state.order = { id: 13, user_id: 1, restaurant_id: 5, orderstatus_id: 5 };
  for (const bad of [0, 6, -1, 'abc', null]) {
    const res = fakeRes();
    await controller.rateOrder(req({ order_id: 13, rating_store: bad }), res);
    assert.strictEqual(res.statusCode, 400, `valor ${bad}`);
  }
  const res = fakeRes();
  await controller.rateOrder(req({ order_id: 13, rating_store: 4, rating_delivery: 9 }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(state.created, null);
});

test('rateOrder válido guarda con usuario y repartidor del pedido', async () => {
  state.created = null; state.rating = null;
  state.order = { id: 14, user_id: 1, restaurant_id: 5, orderstatus_id: 5 };
  const res = fakeRes();
  await controller.rateOrder(req({ order_id: 14, rating_store: 5, rating_delivery: 4, review_store: '  Rico  ' }), res);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(state.created.user_id, 1);
  assert.strictEqual(state.created.restaurant_id, 5);
  assert.strictEqual(state.created.delivery_id, 14);
  assert.strictEqual(state.created.review_store, 'Rico');
});

test('changeUserPassword: OTP válido cambia la clave y se consume (no reutilizable)', async () => {
  state.updatedPassword = null;
  state.otpRows = [{ email: 'a@b.c', otp: '123456', created_at: new Date() }];
  const res = fakeRes();
  await controller.changeUserPassword(req({ email: 'a@b.c', password: 'clave-larga-1', otp: '123456' }), res);
  assert.strictEqual(res.body.success, true);
  assert.ok(state.updatedPassword);
  assert.strictEqual(state.otpRows.length, 0);
  const again = fakeRes();
  await controller.changeUserPassword(req({ email: 'a@b.c', password: 'otra-clave-22', otp: '123456' }), again);
  assert.strictEqual(again.body.success, false);
});

test('changeUserPassword: OTP caducado se rechaza', async () => {
  state.updatedPassword = null;
  state.otpRows = [{ email: 'e@b.c', otp: '123456', created_at: new Date(Date.now() - 10 * 60 * 1000) }];
  const res = fakeRes();
  await controller.changeUserPassword(req({ email: 'e@b.c', password: 'clave-larga-1', otp: '123456' }), res);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(res.body.message, 'OTP expirado');
  assert.strictEqual(state.updatedPassword, null);
});

test('changeUserPassword: tras 5 OTP erróneos responde 429 aunque luego sea el correcto', async () => {
  state.updatedPassword = null;
  state.otpRows = [{ email: 'f@b.c', otp: '123456', created_at: new Date() }];
  for (let i = 0; i < 5; i++) {
    const res = fakeRes();
    await controller.changeUserPassword(req({ email: 'f@b.c', password: 'clave-larga-1', otp: '000000' }, { ip: `6.6.6.${i}` }), res);
    assert.strictEqual(res.body.success, false);
  }
  state.otpRows = [{ email: 'f@b.c', otp: '123456', created_at: new Date() }];
  const res = fakeRes();
  await controller.changeUserPassword(req({ email: 'f@b.c', password: 'clave-larga-1', otp: '123456' }, { ip: '6.6.6.99' }), res);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(state.updatedPassword, null);
});
