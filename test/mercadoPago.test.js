const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const crypto = require('crypto');

process.env.APP_URL = 'https://tienda.example.test';
process.env.APP_BASE_PATH = '/multitienda';
const TEST_KEY = crypto.randomBytes(32).toString('base64');
process.env.MP_ENCRYPTION_KEY = TEST_KEY;

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = {
  order: null,
  created: null,
  restaurant: { id: 5, auto_acceptable: false },
  queries: [],
  txs: [],
  notified: [],
  config: { id: 9, is_active: 1, secrets: { access_token: 'TEST-token-0000', public_key: 'TEST-pk-0000', webhook_secret: 'whsec-test' } },
};

function fakeTx() {
  const t = { finished: false, LOCK: { UPDATE: 'UPDATE' }, async commit() { t.finished = 'commit'; }, async rollback() { t.finished = 'rollback'; } };
  state.txs.push(t);
  return t;
}

const sequelize = {
  async transaction() { return fakeTx(); },
  async query(sql, opts = {}) {
    state.queries.push({ sql, opts });
    const r = opts.replacements || [];
    if (/^UPDATE orders SET orderstatus_id/.test(sql)) {
      const [target, id, from] = r;
      if (state.order && state.order.id === id && from.includes(Number(state.order.orderstatus_id))) {
        state.order.orderstatus_id = target;
        return [undefined, 1];
      }
      return [undefined, 0];
    }
    if (/^UPDATE orders SET transaction_id/.test(sql)) {
      if (state.order && state.order.id === r[1]) state.order.transaction_id = r[0];
      return [undefined, 1];
    }
    return [[], 0];
  },
};

stub('src/models', {
  sequelize,
  Order: {
    async findOne(q) { return state.order && (!q.where || !q.where.id || q.where.id === state.order.id) ? { ...state.order } : null; },
    async findByPk() { return null; },
    async create(data) { state.created = data; return { id: 41, ...data }; },
  },
  Orderitem: { async create() { return { id: 70 }; }, async findAll() { return []; } },
  OrderItemAddon: { async bulkCreate() {} },
  Restaurant: {
    async findByPk() {
      return { ...state.restaurant, latitude: '-12.0', longitude: '-77.0', delivery_charge_type: 'FIXED', delivery_charges: 0, free_delivery_subtotal: 0, restaurant_charges: 0, zone_id: null };
    },
  },
  Address: { async findAll() { return []; } },
  Item: {},
  Wallet: { async findOne() { return null; } },
  Transaction: {},
  Setting: { async findAll() { return []; } },
});
stub('src/helpers/cache', { async get() { return {}; }, async set() {} });
stub('src/helpers/notifications.impl', {
  async notifyStoreNewOrder() { state.notified.push('store'); },
  async notifyDeliveryNewOrder() { state.notified.push('delivery'); },
});
stub('src/helpers/orderCatalog', {
  async getAllowedPaymentMethods() { return ['COD', 'MERCADOPAGO', 'WALLET']; },
  async loadCatalog() {
    return { items: [{ id: 1, name: 'Pizza', price: '20.00', is_active: true, restaurant_id: 5 }], addons: [], links: [] };
  },
  async checkCoupon() { return { ok: false, message: 'x' }; },
  async consumeCoupon() {},
});
stub('src/helpers/paymentSecrets', {
  async findGateway() { return state.config ? { id: state.config.id, name: 'MERCADOPAGO', is_active: state.config.is_active } : null; },
  async loadSecrets() { return state.config ? { ...state.config.secrets } : {}; },
});

const secretBox = require('../src/helpers/secretBox');
const mp = require('../src/helpers/mercadoPago');
const orderController = require('../src/controllers/orderController');
const { handleWebhook } = require('../src/controllers/mercadoPagoController');
const { cancelOrderWithRefund } = require('../src/helpers/orderCancel');
const states = require('../src/helpers/orderStates');

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const { status = 200, json = {} } = handler(call) || {};
    return { ok: status >= 200 && status < 300, status, async json() { return json; } };
  };
  fn.calls = calls;
  return fn;
}

function sign({ dataId, requestId, ts, secret }) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${crypto.createHmac('sha256', secret).update(manifest).digest('hex')}`;
}

function webhookReq({ dataId = '1234567', requestId = 'req-1', signature }) {
  const headers = { 'x-signature': signature, 'x-request-id': requestId };
  return {
    query: { 'data.id': dataId, type: 'payment' },
    body: { type: 'payment', data: { id: dataId } },
    get(name) { return headers[name.toLowerCase()]; },
  };
}

function resetOrder(extra = {}) {
  state.order = { id: 41, user_id: 3, restaurant_id: 5, unique_order_id: 'OD-1', orderstatus_id: 8, payment_mode: 'MERCADOPAGO', payable: '20.00', wallet_amount: null, transaction_id: null, is_scheduled: false, delivery_type: 2, ...extra };
  state.queries = [];
  state.txs = [];
  state.notified = [];
}

test('secretBox cifra y descifra con AES-256-GCM y detecta alteraciones', () => {
  const enc = secretBox.encrypt('APP_USR-secreto');
  assert.ok(enc.startsWith('v1:'));
  assert.ok(!enc.includes('APP_USR-secreto'));
  assert.notStrictEqual(secretBox.encrypt('APP_USR-secreto'), enc);
  assert.strictEqual(secretBox.decrypt(enc), 'APP_USR-secreto');
  const parts = enc.split(':');
  const ct = Buffer.from(parts[3], 'base64');
  ct[0] ^= 1;
  parts[3] = ct.toString('base64');
  assert.throws(() => secretBox.decrypt(parts.join(':')), secretBox.SecretBoxError);
  assert.throws(() => secretBox.decrypt(enc, crypto.randomBytes(32).toString('base64')), secretBox.SecretBoxError);
});

test('secretBox falla sin MP_ENCRYPTION_KEY o con una clave de largo inválido', () => {
  assert.throws(() => secretBox.encrypt('x', ''), /MP_ENCRYPTION_KEY/);
  assert.throws(() => secretBox.encrypt('x', Buffer.alloc(16).toString('base64')), /32 bytes/);
  const saved = process.env.MP_ENCRYPTION_KEY;
  delete process.env.MP_ENCRYPTION_KEY;
  try {
    assert.strictEqual(secretBox.isConfigured(), false);
    assert.throws(() => secretBox.encrypt('x'), secretBox.SecretBoxError);
  } finally {
    process.env.MP_ENCRYPTION_KEY = saved;
  }
});

test('place-order con Mercado Pago crea la preferencia con el precio del servidor y no notifica a la tienda', async () => {
  resetOrder();
  const fetch = mockFetch(() => ({ status: 201, json: { id: 'pref-1', init_point: 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-1' } }));
  const prev = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    const res = fakeRes();
    await orderController.placeOrder({
      user: { id: 3 },
      body: {
        order: [{ id: 1, restaurant_id: 5, quantity: 1, price: 1 }],
        total: { totalPrice: 1 }, method: 'mercadopago', delivery_type: 2, payment_token: 'falso-del-cliente',
        schedule_date: '2026-10-20', schedule_slot: { open: '10:00' },
      },
    }, res);
    assert.strictEqual(res.body.success, true, JSON.stringify(res.body));
    assert.strictEqual(res.body.init_point, 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=pref-1');
    assert.strictEqual(state.created.orderstatus_id, 8);
    assert.strictEqual(state.created.transaction_id, null);
    assert.strictEqual(state.created.payment_mode, 'MERCADOPAGO');
    assert.strictEqual(fetch.calls.length, 1);
    const call = fetch.calls[0];
    assert.strictEqual(call.url, 'https://api.mercadopago.com/checkout/preferences');
    assert.strictEqual(call.method, 'POST');
    assert.strictEqual(call.headers.Authorization, 'Bearer TEST-token-0000');
    assert.strictEqual(call.body.items[0].unit_price, 20);
    assert.strictEqual(call.body.items[0].quantity, 1);
    assert.strictEqual(call.body.external_reference, '41');
    assert.strictEqual(call.body.notification_url, 'https://tienda.example.test/multitienda/api/mp/webhook');
    assert.match(call.body.back_urls.success, /^https:\/\/tienda\.example\.test\/multitienda\/order\//);
    assert.strictEqual(state.txs[0].finished, 'commit');
    assert.deepStrictEqual(state.notified, []);
  } finally {
    globalThis.fetch = prev;
  }
});

test('place-order con Mercado Pago revierte el pedido si la API falla', async () => {
  resetOrder();
  const prev = globalThis.fetch;
  globalThis.fetch = mockFetch(() => ({ status: 500, json: { message: 'error' } }));
  try {
    const res = fakeRes();
    await orderController.placeOrder({ user: { id: 3 }, body: { order: [{ id: 1, restaurant_id: 5, quantity: 1 }], method: 'MERCADOPAGO', delivery_type: 2 } }, res);
    assert.strictEqual(res.statusCode, 502);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(state.txs[0].finished, 'rollback');
  } finally {
    globalThis.fetch = prev;
  }
});

test('place-order con Mercado Pago sin credenciales activas no crea el pedido', async () => {
  resetOrder();
  const saved = state.config;
  state.config = { ...saved, is_active: 0 };
  state.created = null;
  try {
    const res = fakeRes();
    await orderController.placeOrder({ user: { id: 3 }, body: { order: [{ id: 1, restaurant_id: 5, quantity: 1 }], method: 'MERCADOPAGO', delivery_type: 2 } }, res);
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.message, /Mercado Pago no está disponible/);
    assert.strictEqual(state.created, null);
  } finally {
    state.config = saved;
  }
});

test('webhook con firma válida aprueba el pago una sola vez (idempotente)', async () => {
  resetOrder();
  const fetch = mockFetch(() => ({ json: { id: 1234567, status: 'approved', external_reference: '41', transaction_amount: 20 } }));
  const events = [];
  const deps = { fetch, orderEvents: { async emitOrderEvent(ev, o) { events.push([ev, o.orderstatus_id]); } } };
  const signature = sign({ dataId: '1234567', requestId: 'req-1', ts: '1760000000', secret: 'whsec-test' });

  const first = await handleWebhook(webhookReq({ signature }), deps);
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.changed, true);
  assert.strictEqual(state.order.orderstatus_id, 1);
  assert.strictEqual(state.order.transaction_id, 'mp:1234567');
  assert.strictEqual(fetch.calls[0].url, 'https://api.mercadopago.com/v1/payments/1234567');
  assert.deepStrictEqual(events, [['paid', 1]]);

  const second = await handleWebhook(webhookReq({ signature }), deps);
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body.changed, false);
  assert.strictEqual(second.body.reason, 'already_processed');
  assert.strictEqual(state.order.orderstatus_id, 1);
  assert.strictEqual(events.length, 1);
});

test('webhook aprobado de una tienda con autoaceptación pasa a aceptado (2)', async () => {
  resetOrder();
  state.restaurant = { id: 5, auto_acceptable: true };
  try {
    const fetch = mockFetch(() => ({ json: { id: 99, status: 'approved', external_reference: '41', transaction_amount: 20 } }));
    const signature = sign({ dataId: '99', requestId: 'r', ts: '1', secret: 'whsec-test' });
    const out = await handleWebhook(webhookReq({ dataId: '99', requestId: 'r', signature }), { fetch, orderEvents: { async emitOrderEvent() {} } });
    assert.strictEqual(out.body.changed, true);
    assert.strictEqual(state.order.orderstatus_id, 2);
  } finally {
    state.restaurant = { id: 5, auto_acceptable: false };
  }
});

test('webhook con firma inválida responde 401 y no consulta a Mercado Pago', async () => {
  resetOrder();
  const fetch = mockFetch(() => ({ json: {} }));
  const bad = sign({ dataId: '1234567', requestId: 'req-1', ts: '1760000000', secret: 'otra-clave' });
  const out = await handleWebhook(webhookReq({ signature: bad }), { fetch });
  assert.strictEqual(out.status, 401);
  const missing = await handleWebhook(webhookReq({ signature: undefined }), { fetch });
  assert.strictEqual(missing.status, 401);
  const tampered = sign({ dataId: '1234567', requestId: 'req-1', ts: '1760000000', secret: 'whsec-test' });
  const otherId = await handleWebhook(webhookReq({ dataId: '7654321', signature: tampered }), { fetch });
  assert.strictEqual(otherId.status, 401);
  assert.strictEqual(fetch.calls.length, 0);
  assert.strictEqual(state.order.orderstatus_id, 8);
});

test('webhook de pago no aprobado o con monto menor no cambia el estado', async () => {
  resetOrder();
  const signature = sign({ dataId: '1234567', requestId: 'req-1', ts: '1760000000', secret: 'whsec-test' });
  for (const payment of [
    { id: 1234567, status: 'rejected', external_reference: '41', transaction_amount: 20 },
    { id: 1234567, status: 'pending', external_reference: '41', transaction_amount: 20 },
    { id: 1234567, status: 'approved', external_reference: '41', transaction_amount: 5 },
  ]) {
    const out = await handleWebhook(webhookReq({ signature }), { fetch: mockFetch(() => ({ json: payment })), orderEvents: { async emitOrderEvent() { throw new Error('no debe notificar'); } } });
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.body.changed, false);
    assert.strictEqual(state.order.orderstatus_id, 8);
    assert.strictEqual(state.order.transaction_id, null);
  }
});

test('cancelar un pedido pagado con Mercado Pago: si el reembolso falla no se cancela', async () => {
  resetOrder({ orderstatus_id: 1, transaction_id: 'mp:1234567' });
  const failing = {
    needsRefund: mp.needsRefund,
    async refundOrderPayment() { throw new mp.MercadoPagoError('Mercado Pago respondió 500'); },
  };
  await assert.rejects(
    cancelOrderWithRefund({ orderId: 41, actor: 'customer', scope: { user_id: 3 }, mercadoPago: failing }),
    (err) => err instanceof states.OrderStateError && err.status === 502
  );
  assert.strictEqual(state.txs[0].finished, 'rollback');
  assert.ok(!state.queries.some((q) => /SET transaction_id/.test(q.sql)));
});

test('cancelar un pedido pagado con Mercado Pago reembolsa con clave de idempotencia y lo registra', async () => {
  resetOrder({ orderstatus_id: 1, transaction_id: 'mp:1234567' });
  const fetch = mockFetch(() => ({ status: 201, json: { id: 555, amount: 20, status: 'approved' } }));
  const prev = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    const out = await cancelOrderWithRefund({ orderId: 41, actor: 'customer', scope: { user_id: 3 } });
    assert.strictEqual(out.refund, true);
    assert.strictEqual(state.txs[0].finished, 'commit');
    assert.strictEqual(state.order.orderstatus_id, 6);
    assert.strictEqual(state.order.transaction_id, 'mp:1234567;refund:555');
    assert.strictEqual(fetch.calls[0].url, 'https://api.mercadopago.com/v1/payments/1234567/refunds');
    assert.strictEqual(fetch.calls[0].headers['X-Idempotency-Key'], 'refund-order-41');
  } finally {
    globalThis.fetch = prev;
  }
});

test('un pedido ya reembolsado o sin pago no vuelve a llamar a la API de reembolso', () => {
  assert.strictEqual(mp.needsRefund({ payment_mode: 'MERCADOPAGO', transaction_id: 'mp:1;refund:2' }), false);
  assert.strictEqual(mp.needsRefund({ payment_mode: 'MERCADOPAGO', transaction_id: null }), false);
  assert.strictEqual(mp.needsRefund({ payment_mode: 'COD', transaction_id: 'mp:1' }), false);
  assert.strictEqual(mp.needsRefund({ payment_mode: 'MERCADOPAGO', transaction_id: 'mp:1' }), true);
});
