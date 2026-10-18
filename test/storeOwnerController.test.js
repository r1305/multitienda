const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { sql: [], insertId: 77, ownedAddonCats: [100], ownedItemCats: [3], ownItem: true, order: null, affected: 1, events: [] };

const fakeTx = () => ({ finished: false, LOCK: { UPDATE: 'UPDATE' }, async commit() { this.finished = 'commit'; }, async rollback() { this.finished = 'rollback'; } });

const sequelize = {
  async transaction(fn) {
    const t = fakeTx();
    if (!fn) return t;
    try { const r = await fn(t); t.finished = 'commit'; return r; } catch (e) { t.finished = 'rollback'; throw e; }
  },
  async query(sql, opts = {}) {
    state.sql.push({ sql, opts });
    if (/FROM restaurants r JOIN restaurant_user/.test(sql)) return [[{ id: 5, name: 'Mi tienda' }]];
    if (/^INSERT INTO items/.test(sql)) return [state.insertId, 1];
    if (/FROM item_categories WHERE id/.test(sql)) return [state.ownedItemCats.includes(opts.replacements[0]) ? [{ id: opts.replacements[0] }] : []];
    if (/FROM addon_categories WHERE id IN/.test(sql)) {
      return [opts.replacements[0].filter((id) => state.ownedAddonCats.includes(id)).map((id) => ({ id }))];
    }
    if (/FROM items WHERE id = \? AND restaurant_id/.test(sql)) return [state.ownItem ? [{ id: opts.replacements[0] }] : []];
    if (/^UPDATE orders/.test(sql)) return [undefined, state.affected];
    return [[], 0];
  },
};

stub('src/models', {
  sequelize,
  User: {}, Orderitem: {}, OrderItemAddon: {}, Item: {}, ItemCategory: {}, Restaurant: {}, Rating: {},
  Order: { async findOne() { return state.order; } },
  Wallet: { async findOne() { return null; }, async create() { return { id: 1, async increment() {} }; } },
  Transaction: { async create() {} },
});
stub('src/middleware/auth', { generateToken() { return 't'; } });
stub('src/helpers/notifications', {
  async notifyDeliveryNewOrder(o) { state.events.push(['delivery', o.id]); },
  async notifyCustomerOrderEvent(o, e) { state.events.push(['customer', e, o.id]); },
});

const controller = require('../src/controllers/storeOwnerController');

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const user = { id: 9 };
const links = () => state.sql.filter((s) => /^INSERT IGNORE INTO addon_category_item/.test(s.sql)).map((s) => s.opts.replacements);

test('createItem vincula los complementos al id del ítem recién creado', async () => {
  state.sql = []; state.insertId = 77; state.ownedItemCats = [3]; state.ownedAddonCats = [100, 101];
  const res = fakeRes();
  await controller.createItem({ user, body: { name: 'Pizza', price: 20, item_category_id: 3, addon_category_ids: JSON.stringify([100, 101, 100]) } }, res);
  assert.strictEqual(res.body.success, true);
  assert.deepStrictEqual(links(), [[100, 77], [101, 77]]);
});

test('createItem rechaza una categoría de complementos de otra tienda sin insertar nada', async () => {
  state.sql = []; state.ownedAddonCats = [100];
  const res = fakeRes();
  await controller.createItem({ user, body: { name: 'Pizza', price: 20, addon_category_ids: [100, 999] } }, res);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(state.sql.filter((s) => /^INSERT/.test(s.sql)).length, 0);
});

test('createItem rechaza una categoría de ítem de otra tienda', async () => {
  state.sql = []; state.ownedItemCats = [3];
  const res = fakeRes();
  await controller.createItem({ user, body: { name: 'Pizza', price: 20, item_category_id: 44 } }, res);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(state.sql.filter((s) => /^INSERT/.test(s.sql)).length, 0);
});

test('updateItem de un ítem ajeno responde 404 y no borra vínculos', async () => {
  state.sql = []; state.ownItem = false;
  const res = fakeRes();
  await controller.updateItem({ user, body: { item_id: 500, name: 'x', price: 1, addon_category_ids: [100] } }, res);
  assert.strictEqual(res.statusCode, 404);
  assert.strictEqual(state.sql.filter((s) => /DELETE FROM addon_category_item/.test(s.sql)).length, 0);
});

test('updateItem propio reemplaza vínculos acotados a la tienda', async () => {
  state.sql = []; state.ownItem = true; state.ownedAddonCats = [100]; state.ownedItemCats = [3];
  const res = fakeRes();
  await controller.updateItem({ user, body: { item_id: 12, name: 'x', price: 1, item_category_id: 3, addon_category_ids: [100] } }, res);
  assert.strictEqual(res.body.success, true);
  const del = state.sql.find((s) => /DELETE FROM addon_category_item/.test(s.sql));
  assert.match(del.sql, /restaurant_id = \?/);
  assert.deepStrictEqual(links(), [[100, 12]]);
});

test('acceptOrder: transición 1->2 acotada a la tienda y notifica a cliente y repartidores', async () => {
  state.sql = []; state.events = []; state.affected = 1;
  state.order = { id: 30, user_id: 2, unique_order_id: 'OD-30', delivery_type: 1 };
  const res = fakeRes();
  await controller.acceptOrder({ user, body: { order_id: 30 } }, res);
  assert.strictEqual(res.body.success, true);
  const upd = state.sql.find((s) => /^UPDATE orders/.test(s.sql));
  assert.deepStrictEqual(upd.opts.replacements, [2, 30, [1], 5]);
  assert.deepStrictEqual(state.events, [['customer', 'accepted', 30], ['delivery', 30]]);
});

test('acceptOrder sobre un pedido que ya no está pendiente responde 409', async () => {
  state.sql = []; state.events = []; state.affected = 0;
  state.order = { id: 31, user_id: 2, unique_order_id: 'OD-31', delivery_type: 1 };
  const res = fakeRes();
  await controller.acceptOrder({ user, body: { order_id: 31 } }, res);
  assert.strictEqual(res.statusCode, 409);
  assert.deepStrictEqual(state.events, []);
});

test('markSelfpickupOrderReady exige delivery_type=2', async () => {
  state.sql = []; state.affected = 1;
  state.order = { id: 32, delivery_type: 1 };
  const res = fakeRes();
  await controller.markSelfpickupOrderReady({ user, body: { order_id: 32 } }, res);
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(state.sql.filter((s) => /^UPDATE orders/.test(s.sql)).length, 0);
  state.order = { id: 33, delivery_type: 2 };
  const ok = fakeRes();
  await controller.markSelfpickupOrderReady({ user, body: { order_id: 33 } }, ok);
  assert.strictEqual(ok.body.success, true);
});

test('cancelOrder de la tienda reembolsa y notifica al cliente', async () => {
  state.sql = []; state.events = []; state.affected = 1;
  state.order = { id: 34, user_id: 2, orderstatus_id: 2, wallet_amount: '10.00', unique_order_id: 'OD-34' };
  const res = fakeRes();
  await controller.cancelOrder({ user, body: { order_id: 34 } }, res);
  assert.deepStrictEqual(res.body, { success: true, refund: true });
  assert.deepStrictEqual(state.events, [['customer', 'cancelled', 34]]);
});

test('cancelOrder sobre un pedido entregado responde 409', async () => {
  state.sql = []; state.events = [];
  state.order = { id: 35, user_id: 2, orderstatus_id: 5, wallet_amount: '10.00', unique_order_id: 'OD-35' };
  const res = fakeRes();
  await controller.cancelOrder({ user, body: { order_id: 35 } }, res);
  assert.strictEqual(res.statusCode, 409);
  assert.deepStrictEqual(state.events, []);
});
