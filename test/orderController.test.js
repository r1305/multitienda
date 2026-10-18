const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const rules = require('../src/helpers/orderRules');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { orders: {}, addresses: [], created: null, itemsQuery: null };

const fakeTx = () => ({ finished: false, LOCK: { UPDATE: 'UPDATE' }, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } });

stub('src/models', {
  Order: {
    async findByPk(id) { return state.orders[id] || null; },
    async findOne() { return null; },
    async create(data) { state.created = data; return { id: 1, ...data }; },
  },
  Orderitem: {
    async findAll(q) { state.itemsQuery = q; return [{ id: 7, order_id: q.where.order_id }]; },
    async create() { return { id: 70 }; },
  },
  OrderItemAddon: { async bulkCreate() {} },
  Restaurant: {
    async findByPk() {
      return { id: 5, latitude: '-12.0', longitude: '-77.0', delivery_charge_type: 'DYNAMIC', base_delivery_distance: 1, extra_delivery_distance: 1, extra_delivery_charge: 2, base_delivery_charge: '5.00', free_delivery_subtotal: 0, restaurant_charges: 0, auto_acceptable: false, zone_id: null };
    },
  },
  Address: { async findAll(q) { return state.addresses.filter((a) => a.user_id === q.where.user_id); } },
  Wallet: { async findOne() { return null; } },
  Transaction: {},
  Setting: { async findAll() { return []; } },
  sequelize: { async transaction() { return fakeTx(); } },
});
stub('src/helpers/cache', { async get() { return {}; }, async set() {} });
stub('src/helpers/notifications.impl', { async notifyStoreNewOrder() {}, async notifyDeliveryNewOrder() {} });
stub('src/helpers/orderCatalog', {
  async getAllowedPaymentMethods() { return ['COD']; },
  async loadCatalog() {
    return { items: [{ id: 1, name: 'Pizza', price: '20.00', is_active: true, restaurant_id: 5 }], addons: [], links: [] };
  },
  async checkCoupon() { return { ok: false, message: 'x' }; },
  async consumeCoupon() {},
});

const controller = require('../src/controllers/orderController');

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('get-order-items de otro usuario responde 403 y no consulta ítems', async () => {
  state.orders = { 50: { id: 50, user_id: 2 } };
  state.itemsQuery = null;
  const res = fakeRes();
  await controller.getOrderItems({ body: { order_id: 50 }, user: { id: 1 } }, res);
  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(res.body, { success: false });
  assert.strictEqual(state.itemsQuery, null);
});

test('get-order-items del propio usuario devuelve sus ítems', async () => {
  state.orders = { 51: { id: 51, user_id: 1 } };
  const res = fakeRes();
  await controller.getOrderItems({ body: { order_id: 51 }, user: { id: 1 } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body[0].order_id, 51);
});

const baseBody = (location) => ({
  order: [{ id: 1, quantity: 1, restaurant_id: 5 }],
  method: 'cod', delivery_type: 1, location,
});
const farAddress = { id: 9, user_id: 1, address: 'Casa', latitude: '-12.09', longitude: '-77.0' };

test('placeOrder ignora coordenadas inventadas y usa la dirección guardada', async () => {
  state.addresses = [farAddress];
  state.created = null;
  const res = fakeRes();
  await controller.placeOrder({ user: { id: 1, default_address_id: 9 }, body: baseBody({ lat: -12.0, lng: -77.0, address: 'Falsa', address_id: 9 }) }, res);
  assert.strictEqual(res.body.success, true, res.body.message);
  assert.ok(state.created.distance > 9, `distancia ${state.created.distance}`);
  assert.ok(state.created.delivery_charge > 5);
  assert.strictEqual(state.created.address, 'Casa');
  assert.strictEqual(state.created.payment_mode, 'COD');
  assert.strictEqual(JSON.parse(state.created.location).lat, -12.09);
});

test('placeOrder rechaza coordenadas que no son de una dirección guardada', async () => {
  state.addresses = [farAddress];
  state.created = null;
  const res = fakeRes();
  await controller.placeOrder({ user: { id: 1, default_address_id: 9 }, body: baseBody({ lat: -12.0, lng: -77.0 }) }, res);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(state.created, null);
});

test('placeOrder rechaza dirección de otro usuario', async () => {
  state.addresses = [{ ...farAddress, user_id: 2 }];
  state.created = null;
  const res = fakeRes();
  await controller.placeOrder({ user: { id: 1, default_address_id: 9 }, body: baseBody({ address_id: 9 }) }, res);
  assert.strictEqual(res.body.success, false);
  assert.strictEqual(state.created, null);
});

test('pickDeliveryAddress: coincide por coordenadas exactas o usa la predeterminada sin datos', () => {
  const list = [farAddress, { id: 10, latitude: '-12.1', longitude: '-77.1' }];
  assert.strictEqual(rules.pickDeliveryAddress(list, { lat: -12.1, lng: -77.1 }).id, 10);
  assert.strictEqual(rules.pickDeliveryAddress(list, { defaultAddressId: 9 }).id, 9);
  assert.strictEqual(rules.pickDeliveryAddress(list, { addressId: 99 }), null);
  assert.strictEqual(rules.pickDeliveryAddress([], { addressId: 9 }), null);
});
