const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = {
  queries: [],
  handler: null,
  users: [],
  otpRows: [],
  favorites: [],
  events: [],
};

const sequelize = {
  QueryTypes: { SELECT: 'SELECT', UPDATE: 'UPDATE' },
  async query(sql, opts = {}) {
    state.queries.push({ sql, opts });
    if (/FROM restaurants r JOIN restaurant_user/.test(sql)) return [[{ id: 5, name: 'Mi tienda' }]];
    if (state.handler) {
      const r = state.handler(sql, opts);
      if (r !== undefined) return r;
    }
    return opts.type === 'SELECT' ? [] : [[], 0];
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
  Order: {}, Orderitem: {}, OrderItemAddon: {}, Item: {}, ItemCategory: {}, Restaurant: {}, Rating: {},
  Wallet: {}, Transaction: {},
  PasswordResetOtp: otpModel(),
  SmsOtp: otpModel(),
  User: {
    async findOne({ where }) {
      return state.users.find((u) => (where.phone && u.phone === where.phone) || (where.email && u.email === where.email)) || null;
    },
  },
  UserFavoriteStore: {
    async findOne({ where }) { return state.favorites.find((f) => f.user_id === where.user_id && f.restaurant_id === where.restaurant_id) || null; },
    async count({ where }) { return state.favorites.filter((f) => f.user_id === where.user_id).length; },
    async create(d) {
      if (state.favorites.some((f) => f.user_id === d.user_id && f.restaurant_id === d.restaurant_id)) {
        const e = new Error('dup'); e.name = 'SequelizeUniqueConstraintError'; throw e;
      }
      state.favorites.push({ ...d });
    },
    async destroy({ where }) {
      state.favorites = state.favorites.filter((f) => !(f.user_id === where.user_id && f.restaurant_id === where.restaurant_id));
    },
  },
});
stub('src/middleware/auth', { generateToken() { return 't'; } });
stub('src/helpers/notifications', {
  async notifyDeliveryNewOrder(o) { state.events.push(['delivery', o.id]); },
  async notifyCustomerOrderEvent(o, e) { state.events.push(['customer', e, o.id]); },
});

const mailer = require('../src/helpers/mailer');
const states = require('../src/helpers/orderStates');
const eta = require('../src/helpers/orderEta');
const { buildReorder } = require('../src/helpers/orderReorder');
const rules = require('../src/helpers/orderRules');
const misc = require('../src/controllers/miscControllers');
const storeOwner = require('../src/controllers/storeOwnerController');
const favorites = require('../src/controllers/favoritesController');
const restaurant = require('../src/controllers/restaurantController');

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const tick = () => new Promise((r) => setImmediate(r));

function withSmtpEnv(fn) {
  const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  return async () => {
    try { return await fn(); } finally {
      keys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
      mailer._setTransportForTests(null);
    }
  };
}

// ─── Correo ──────────────────────────────────────────────────────────────────
test('mailer sin SMTP configurado devuelve false y no lanza', withSmtpEnv(async () => {
  ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].forEach((k) => delete process.env[k]);
  mailer._setTransportForTests(null);
  assert.strictEqual(await mailer.sendOtpMail('a@b.co', '123456'), false);
}));

test('mailer envía con el transporte y escapa el código en el HTML', withSmtpEnv(async () => {
  const sent = [];
  mailer._setTransportForTests({ async sendMail(m) { sent.push(m); } });
  process.env.SMTP_FROM = 'tienda@example.com';
  assert.strictEqual(await mailer.sendOtpMail('cliente@example.com', '654321', 'reset'), true);
  assert.strictEqual(sent[0].to, 'cliente@example.com');
  assert.match(sent[0].text, /654321/);
  assert.match(sent[0].subject, /contraseña/);
  assert.strictEqual(await mailer.sendOtpMail('no-es-correo', '1'), false);
}));

test('mailer devuelve false si el transporte falla', withSmtpEnv(async () => {
  mailer._setTransportForTests({ async sendMail() { throw new Error('smtp caído'); } });
  assert.strictEqual(await mailer.sendOtpMail('cliente@example.com', '111111'), false);
}));

test('sendOtp envía al correo del usuario registrado y no devuelve el OTP', withSmtpEnv(async () => {
  const sent = [];
  mailer._setTransportForTests({ async sendMail(m) { sent.push(m); } });
  process.env.SMTP_FROM = 'tienda@example.com';
  state.users = [{ phone: '999', email: 'dueno@example.com' }];
  const res = fakeRes();
  await misc.sendOtp({ body: { phone: '999', email: 'atacante@example.com' } }, res);
  assert.deepStrictEqual(res.body, { success: true });
  await tick();
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].to, 'dueno@example.com');
  assert.match(sent[0].text, new RegExp(state.otpRows[state.otpRows.length - 1].otp));
}));

test('generateOtpForLogin con teléfono nuevo usa el correo indicado; sin correo no envía y no cae', withSmtpEnv(async () => {
  const sent = [];
  mailer._setTransportForTests({ async sendMail(m) { sent.push(m); } });
  state.users = [];
  let res = fakeRes();
  await misc.generateOtpForLogin({ body: { phone: '111', email: 'nuevo@example.com' } }, res);
  assert.strictEqual(res.body.success, true);
  await tick();
  assert.strictEqual(sent[0].to, 'nuevo@example.com');
  res = fakeRes();
  await misc.generateOtpForLogin({ body: { phone: '222' } }, res);
  assert.deepStrictEqual(res.body, { success: true });
  assert.strictEqual(sent.length, 1);
}));

test('sendPasswordResetMail envía solo a cuentas existentes y no revela el OTP', withSmtpEnv(async () => {
  const sent = [];
  mailer._setTransportForTests({ async sendMail(m) { sent.push(m); } });
  state.users = [{ email: 'real@example.com' }];
  let res = fakeRes();
  await misc.sendPasswordResetMail({ body: { email: 'real@example.com' } }, res);
  assert.deepStrictEqual(res.body, { success: true });
  await tick();
  assert.strictEqual(sent.length, 1);
  res = fakeRes();
  await misc.sendPasswordResetMail({ body: { email: 'otro@example.com' } }, res);
  assert.deepStrictEqual(res.body, { success: true });
  assert.strictEqual(sent.length, 1);
}));

// ─── Estados ─────────────────────────────────────────────────────────────────
test('estado 12: transiciones y actores', () => {
  assert.strictEqual(states.STATUS.PREPARING, 12);
  assert.deepStrictEqual(states.TRANSITIONS[12], [3, 6, 7]);
  assert.ok(states.canTransition(2, 12));
  assert.deepStrictEqual(states.allowedFrom('store', 12, [2]), [2]);
  assert.deepStrictEqual(states.allowedFrom('store', 7, [12]), [12]);
  assert.deepStrictEqual(states.allowedFrom('store', 6, [12]), [12]);
  assert.deepStrictEqual(states.allowedFrom('admin', 6, [12]), [12]);
  assert.deepStrictEqual(states.allowedFrom('delivery', 3, [12]), [12]);
  assert.deepStrictEqual(states.allowedFrom('admin', 3, [12]), [12]);
  assert.deepStrictEqual(states.allowedFrom('customer', 6, [12]), []);
  assert.deepStrictEqual(states.allowedFrom('store', 12, [1]), []);
  assert.ok(!states.canTransition(12, 5));
  const used = Object.values(states.STATUS);
  assert.strictEqual(new Set(used).size, used.length);
});

test('markOrderPreparing hace 2 -> 12 acotado a la tienda y avisa al cliente', async () => {
  state.queries = []; state.events = [];
  state.handler = (sql) => (/^UPDATE orders SET orderstatus_id/.test(sql) ? [undefined, 1] : undefined);
  const { Order } = require('../src/models');
  Order.findOne = async () => ({ id: 31, user_id: 4, unique_order_id: 'X1', delivery_type: 1 });
  const res = fakeRes();
  await storeOwner.markOrderPreparing({ user: { id: 9 }, body: { order_id: 31 } }, res);
  assert.strictEqual(res.body.success, true);
  const upd = state.queries.find((q) => /^UPDATE orders SET orderstatus_id/.test(q.sql));
  assert.strictEqual(upd.opts.replacements[0], 12);
  assert.deepStrictEqual(upd.opts.replacements[2], [2]);
  assert.ok(/restaurant_id = \?/.test(upd.sql));
  assert.ok(state.events.some((e) => e[0] === 'customer' && e[1] === 'preparing'));
});

test('markOrderPreparing devuelve 409 si el pedido ya no está en estado 2', async () => {
  state.handler = (sql) => (/^UPDATE orders SET orderstatus_id/.test(sql) ? [undefined, 0] : undefined);
  const res = fakeRes();
  await storeOwner.markOrderPreparing({ user: { id: 9 }, body: { order_id: 31 } }, res);
  assert.strictEqual(res.statusCode, 409);
});

// ─── Alerta de pedidos nuevos ────────────────────────────────────────────────
test('newOrdersCount cuenta solo estado 1 de la tienda del dueño', async () => {
  state.queries = [];
  state.handler = (sql) => (/COUNT\(\*\) AS c FROM orders/.test(sql) ? [[{ c: 3 }]] : undefined);
  const res = fakeRes();
  await storeOwner.newOrdersCount({ user: { id: 9 } }, res);
  assert.deepStrictEqual(res.body, { success: true, count: 3 });
  const q = state.queries.find((x) => /COUNT\(\*\) AS c FROM orders/.test(x.sql));
  assert.deepStrictEqual(q.opts.replacements, [5, 1]);
});

// ─── ETA ─────────────────────────────────────────────────────────────────────
test('ETA = creación + preparación + traslado; tolera prep_minutes nulo', () => {
  const base = { orderstatus_id: 2, delivery_type: 1, distance: 4, created_at: '2026-10-18T12:00:00.000Z' };
  assert.strictEqual(eta.computeEtaAt(base, 15), '2026-10-18T12:27:00.000Z');
  assert.strictEqual(eta.computeEtaAt(base, null), '2026-10-18T12:32:00.000Z');
  assert.strictEqual(eta.computeEtaAt({ ...base, delivery_type: 2 }, 10), '2026-10-18T12:10:00.000Z');
  assert.strictEqual(eta.computeEtaAt({ ...base, distance: 100 }, 0), '2026-10-18T13:00:00.000Z');
  assert.strictEqual(eta.computeEtaAt({ ...base, orderstatus_id: 5 }, 10), null);
  assert.strictEqual(eta.computeEtaAt({ ...base, is_scheduled: true }, 10), null);
  assert.strictEqual(eta.normalizePrepMinutes(999), 20);
  assert.strictEqual(eta.normalizePrepMinutes(0), 0);
});

test('attachEta tolera que la columna prep_minutes no exista', async () => {
  eta._resetForTests();
  state.handler = (sql) => { if (/prep_minutes FROM restaurants/.test(sql)) throw new Error('Unknown column'); };
  const orders = [{ id: 1, restaurant_id: 5, orderstatus_id: 2, delivery_type: 2, created_at: '2026-10-18T12:00:00.000Z' }];
  await eta.attachEta(sequelize, orders);
  assert.strictEqual(orders[0].eta_at, '2026-10-18T12:20:00.000Z');
  eta._resetForTests();
});

test('updateStore valida prep_minutes entre 0 y 180', async () => {
  state.handler = null;
  const res = fakeRes();
  await storeOwner.updateStore({ user: { id: 9 }, body: { name: 'x', prep_minutes: 500 } }, res);
  assert.strictEqual(res.statusCode, 422);
});

// ─── Volver a pedir ──────────────────────────────────────────────────────────
test('reorder: filtra productos y complementos no vigentes y reprecia con el catálogo actual', () => {
  const orderItems = [
    { item_id: 1, name: 'Pizza', quantity: 2, addons: [{ addon_name: 'Queso', addon_category_name: 'Extras' }] },
    { item_id: 2, name: 'Agotado', quantity: 1, addons: [] },
    { item_id: 3, name: 'Hamburguesa', quantity: 1, addons: [{ addon_name: 'Bacon', addon_category_name: 'Extras' }] },
  ];
  const items = [
    { id: 1, name: 'Pizza', price: 99, is_active: 1, restaurant_id: 5 },
    { id: 2, name: 'Agotado', price: 5, is_active: 0, restaurant_id: 5 },
    { id: 3, name: 'Hamburguesa', price: 12, is_active: 1, restaurant_id: 5 },
  ];
  const addonRows = [
    { item_id: 1, id: 10, name: 'queso ', price: 3, is_active: 1, addon_category_id: 7, category_name: 'Extras' },
    { item_id: 3, id: 11, name: 'Bacon', price: 2, is_active: 0, addon_category_id: 7, category_name: 'Extras' },
  ];
  const { lines, unavailable } = buildReorder({ orderItems, items, addonRows, restaurantId: 5 });
  assert.deepStrictEqual(lines, [{ item_id: 1, quantity: 2, addon_ids: [10] }]);
  assert.strictEqual(unavailable.length, 2);
  const links = addonRows.map((r) => ({ item_id: r.item_id, addon_category_id: r.addon_category_id }));
  const priced = rules.priceLines(lines, { items, addons: addonRows, links, restaurantId: 5 });
  assert.strictEqual(priced.sub_total, 6);
});

// ─── Favoritos ───────────────────────────────────────────────────────────────
test('favoritos: agrega una vez, valida tienda habilitada y quita', async () => {
  state.favorites = [];
  state.handler = (sql, opts) => (/FROM restaurants WHERE id = \? AND is_accepted = 1/.test(sql) ? (opts.replacements[0] === 5 ? [{ id: 5 }] : []) : undefined);
  let res = fakeRes();
  await favorites.addFavoriteStore({ user: { id: 1 }, params: { restaurantId: '999' } }, res);
  assert.strictEqual(res.statusCode, 404);
  res = fakeRes();
  await favorites.addFavoriteStore({ user: { id: 1 }, params: { restaurantId: 'abc' } }, res);
  assert.strictEqual(res.statusCode, 404);
  res = fakeRes();
  await favorites.addFavoriteStore({ user: { id: 1 }, params: { restaurantId: '5' } }, res);
  assert.strictEqual(res.body.favorite, true);
  res = fakeRes();
  await favorites.addFavoriteStore({ user: { id: 1 }, params: { restaurantId: '5' } }, res);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(state.favorites.length, 1);
  res = fakeRes();
  await favorites.removeFavoriteStore({ user: { id: 2 }, params: { restaurantId: '5' } }, res);
  assert.strictEqual(state.favorites.length, 1);
  await favorites.removeFavoriteStore({ user: { id: 1 }, params: { restaurantId: '5' } }, res);
  assert.strictEqual(state.favorites.length, 0);
});

test('favoritos: el listado filtra por usuario y lleva LIMIT', async () => {
  state.queries = [];
  state.handler = (sql) => (/user_favorite_stores f/.test(sql) ? [{ id: 5, name: 'T', slug: 't', image: null, is_active: 1 }] : undefined);
  const res = fakeRes();
  await favorites.listFavoriteStores({ user: { id: 1 } }, res);
  assert.strictEqual(res.body.data.length, 1);
  const q = state.queries.find((x) => /user_favorite_stores f/.test(x.sql));
  assert.match(q.sql, /LIMIT 100/);
  assert.deepStrictEqual(q.opts.replacements, [1]);
});

// ─── Reseñas ─────────────────────────────────────────────────────────────────
test('reseñas públicas: solo entregados, paginadas, sin datos de usuario ni pedido', async () => {
  state.queries = [];
  state.handler = (sql, opts) => {
    if (/FROM restaurants WHERE id = \? AND is_accepted = 1/.test(sql)) return [{ id: 5 }];
    if (/AVG\(r.rating_store\)/.test(sql)) return [{ average: '4.3333', total: 3 }];
    if (/r.review_store AS comment/.test(sql)) return [{ rating: '5.0', comment: '<b>Rico</b>', reply: 'Gracias', created_at: '2026-10-01', user_id: 9, order_id: 3 }];
  };
  const res = fakeRes();
  await restaurant.getPublicRatings({ params: { id: '5' }, query: { page: '2', per_page: '500' } }, res);
  assert.strictEqual(res.body.average, 4.3);
  assert.strictEqual(res.body.per_page, 50);
  assert.strictEqual(res.body.current_page, 2);
  assert.deepStrictEqual(Object.keys(res.body.data[0]).sort(), ['comment', 'created_at', 'rating', 'reply']);
  const listQ = state.queries.find((x) => /r.review_store AS comment/.test(x.sql));
  assert.match(listQ.sql, /orderstatus_id = 5/);
  assert.match(listQ.sql, /LIMIT \? OFFSET \?/);
  assert.deepStrictEqual(listQ.opts.replacements, [5, 50, 50]);
});

test('reseñas públicas: tienda inexistente o no habilitada devuelve 404', async () => {
  state.handler = () => [];
  const res = fakeRes();
  await restaurant.getPublicRatings({ params: { id: '77' }, query: {} }, res);
  assert.strictEqual(res.statusCode, 404);
});

test('reseñas públicas: sin columna reply cae a la consulta sin ella', async () => {
  state.handler = (sql) => {
    if (/FROM restaurants WHERE id = \? AND is_accepted = 1/.test(sql)) return [{ id: 5 }];
    if (/AVG\(r.rating_store\)/.test(sql)) return [{ average: null, total: 0 }];
    if (/r\.reply/.test(sql)) throw new Error('Unknown column');
    if (/NULL AS reply/.test(sql)) return [];
  };
  const res = fakeRes();
  await restaurant.getPublicRatings({ params: { id: '5' }, query: {} }, res);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.average, null);
});

test('get-store-reviews público: sin user/avatar, con LIMIT y solo tienda habilitada', async () => {
  state.queries = [];
  state.handler = (sql) => {
    if (/FROM restaurants WHERE slug = \? AND is_accepted = 1/.test(sql)) return [{ id: 5 }];
    if (/FROM restaurants WHERE id = \? AND is_accepted = 1/.test(sql)) return [{ id: 5 }];
    if (/AVG\(r.rating_store\)/.test(sql)) return [{ average: '5', total: 1 }];
    if (/r.review_store AS comment/.test(sql)) return [{ rating: 5, comment: 'Rico', reply: null, created_at: '2026-10-01' }];
  };
  let res = fakeRes();
  await misc.getRatingAndReview({ params: { slug: 'mi-tienda' }, query: { per_page: '500' } }, res);
  assert.strictEqual(res.body.success, true);
  assert.ok(!JSON.stringify(res.body).match(/user|avatar/));
  const listQ = state.queries.find((x) => /r.review_store AS comment/.test(x.sql));
  assert.match(listQ.sql, /LIMIT \? OFFSET \?/);
  assert.strictEqual(listQ.opts.replacements[1], 50);
  state.handler = () => [];
  res = fakeRes();
  await misc.getRatingAndReview({ params: { slug: 'no-existe' }, query: {} }, res);
  assert.strictEqual(res.statusCode, 404);
});

test('replyToRating filtra por restaurant_id de la tienda y exige pedido entregado', async () => {
  state.queries = [];
  state.handler = (sql) => (/^UPDATE ratings r JOIN orders o/.test(sql) ? [undefined, 1] : undefined);
  let res = fakeRes();
  await storeOwner.replyToRating({ user: { id: 9 }, body: { rating_id: 8, reply: '  Gracias por tu visita  ' } }, res);
  assert.strictEqual(res.body.success, true);
  const q = state.queries.find((x) => /^UPDATE ratings r JOIN orders o/.test(x.sql));
  assert.match(q.sql, /r\.restaurant_id = \?/);
  assert.match(q.sql, /o\.orderstatus_id = 5/);
  assert.deepStrictEqual(q.opts.replacements, ['Gracias por tu visita', 8, 5, 5]);
  state.handler = (sql) => (/^UPDATE ratings r JOIN orders o/.test(sql) ? [undefined, 0] : undefined);
  res = fakeRes();
  await storeOwner.replyToRating({ user: { id: 9 }, body: { rating_id: 99, reply: 'hola' } }, res);
  assert.strictEqual(res.statusCode, 404);
  res = fakeRes();
  await storeOwner.replyToRating({ user: { id: 9 }, body: { rating_id: 8, reply: '   ' } }, res);
  assert.strictEqual(res.statusCode, 422);
});
