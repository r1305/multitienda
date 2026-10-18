const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

process.env.JWT_SECRET = 'secreto-de-prueba';

const state = { users: {}, sql: [], owner: { id: 5, is_accepted: 1, is_active: 1, extra_delivery_distance: 2 }, item: null, itemThrows: null, catFound: null, catQuery: null, wallet: [] };

const sequelize = {
  async transaction(fn) { const t = { LOCK: { UPDATE: 'UPDATE' } }; return fn(t); },
  async query(sql, opts = {}) {
    state.sql.push({ sql, opts });
    if (/FROM restaurants r JOIN restaurant_user/.test(sql)) return [[state.owner]];
    if (/FROM users WHERE id/.test(sql)) return [[{ id: opts.replacements[0] }]];
    return [[], 0];
  },
};

stub('src/models', {
  sequelize,
  User: { async findByPk(id) { return state.users[id] || null; } },
  Order: {}, Orderitem: {}, OrderItemAddon: {}, Rating: {}, Wallet: {}, Transaction: {},
  Restaurant: {}, RestaurantCategory: {}, AddonCategory: {}, Addon: {},
  Item: { async findOne() { if (state.itemThrows) throw new Error(state.itemThrows); return state.item; } },
  ItemCategory: { async findOne(q) { state.catQuery = q; return state.catFound; } },
});
stub('src/helpers/notifications', {});
stub('src/helpers/restaurantQueries', {});
stub('src/helpers/orderEvents', { async emitOrderEvent() {} });
stub('src/helpers/scheduledOrders', { async releaseDueScheduledOrders() {} });
stub('src/helpers/orderCancel', { async cancelOrderWithRefund() { return {}; } });
stub('src/helpers/orderDuration', { formatOrderElapsed() { return ''; } });
stub('src/helpers/orderWallet', {
  async walletDeposit(t, uid, amount) { state.wallet.push(['deposit', uid, amount]); },
  async walletWithdraw(t, uid, amount) { state.wallet.push(['withdraw', uid, amount]); },
});
stub('src/config/redis', { getRedis() { return null; }, isRedisAvailable() { return false; } });

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const jwt = require('jsonwebtoken');
const auth = require('../src/middleware/auth');

async function ejecutarAuth(mw, user) {
  state.users = { 1: user };
  const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET);
  const res = fakeRes();
  let paso = false;
  const req = { headers: { authorization: 'Bearer ' + token } };
  await mw(req, res, () => { paso = true; });
  return { res, paso, req };
}

test('M1 jwtAuth rechaza usuario inactivo con 403', async () => {
  const r = await ejecutarAuth(auth.jwtAuth, { id: 1, is_active: 0 });
  assert.strictEqual(r.paso, false);
  assert.strictEqual(r.res.statusCode, 403);
});

test('M1 jwtAuth deja pasar usuario activo y check-ban admite inactivos', async () => {
  const activo = await ejecutarAuth(auth.jwtAuth, { id: 1, is_active: 1 });
  assert.strictEqual(activo.paso, true);
  const inactivo = await ejecutarAuth(auth.jwtAuthPermitirInactivo, { id: 1, is_active: 0 });
  assert.strictEqual(inactivo.paso, true);
});

test('M1 optionalAuth ignora usuarios inactivos', async () => {
  const r = await ejecutarAuth(auth.optionalAuth, { id: 1, is_active: 0 });
  assert.strictEqual(r.req.user, undefined);
});

test('M10 filtro de subidas rechaza SVG por extension y por MIME', () => {
  const { createImageFileFilter } = require('../src/helpers/uploadFilter');
  const filtro = createImageFileFilter(['.jpg', '.png', '.svg']);
  const probar = (originalname, mimetype) => {
    let r;
    filtro({}, { originalname, mimetype }, (e, ok) => { r = { e, ok }; });
    return r;
  };
  assert.ok(probar('x.svg', 'image/svg+xml').e instanceof Error);
  assert.ok(probar('x.png', 'image/svg+xml').e instanceof Error);
  assert.ok(probar('x.png', 'text/html').e instanceof Error);
  assert.strictEqual(probar('x.PNG', 'image/png').ok, true);
});

const owner = require('../src/controllers/storeOwnerController');

test('M4 updateStore rechaza cargo negativo y distancia extra <= 0', async () => {
  let res = fakeRes();
  await owner.updateStore({ user: { id: 9 }, body: { delivery_charges: '-3' } }, res);
  assert.strictEqual(res.statusCode, 422);
  res = fakeRes();
  await owner.updateStore({ user: { id: 9 }, body: { extra_delivery_distance: '0' } }, res);
  assert.strictEqual(res.statusCode, 422);
  state.sql = [];
  res = fakeRes();
  await owner.updateStore({ user: { id: 9 }, body: { delivery_charges: '2', extra_delivery_distance: '1.5' } }, res);
  assert.strictEqual(res.body.success, true);
  assert.ok(state.sql.some((s) => /^UPDATE restaurants/.test(s.sql)));
});

test('M3 el dueno no puede reabrir una tienda deshabilitada por el admin', async () => {
  state.owner = { id: 5, is_accepted: 0, is_active: 0 };
  state.sql = [];
  const res = fakeRes();
  await owner.toggleStoreStatus({ user: { id: 9 } }, res);
  assert.strictEqual(res.statusCode, 403);
  assert.ok(!state.sql.some((s) => /^UPDATE restaurants/.test(s.sql)));
  state.owner = { id: 5, is_accepted: 1, is_active: 1 };
});

test('M2 toggleCategoryStatus filtra por restaurant_id del dueno', async () => {
  state.catFound = null;
  const res = fakeRes();
  await owner.toggleCategoryStatus({ user: { id: 9 }, body: { category_id: 3 } }, res);
  assert.strictEqual(state.catQuery.where.restaurant_id, 5);
  assert.strictEqual(res.body.success, false);
});

const restaurant = require('../src/controllers/restaurantController');
const admin = require('../src/admin/controllers/adminController');

test('M6 getSingleItem responde 404 cuando no existe', async () => {
  state.item = null;
  const res = fakeRes();
  await restaurant.getSingleItem({ body: { id: 999 } }, res);
  assert.strictEqual(res.statusCode, 404);
});

test('M7 los errores no filtran err.message al cliente', async () => {
  state.itemThrows = 'ER_SECRETO: detalle interno de SQL';
  const res = fakeRes();
  const original = console.error;
  console.error = () => {};
  await restaurant.getSingleItem({ body: { id: 1 } }, res);
  console.error = original;
  state.itemThrows = null;
  assert.strictEqual(res.statusCode, 500);
  assert.ok(!JSON.stringify(res.body).includes('ER_SECRETO'));
});

test('B rutas de admin nuevas existen con POST y csrf', () => {
  const proxyCtrl = new Proxy({}, { get: () => function () {} });
  stub('src/admin/controllers/authController', proxyCtrl);
  stub('src/admin/controllers/adminController', proxyCtrl);
  const router = require('../src/admin/routes/admin');
  const rutas = router.stack.filter((l) => l.route).map((l) => ({ path: l.route.path, methods: Object.keys(l.route.methods), n: l.route.stack.length }));
  const tiene = (m, p) => rutas.some((r) => r.path === p && r.methods.includes(m));
  const nuevas = ['/admin/user/add-money-to-wallet', '/admin/user/substract-money-from-wallet', '/admin/user/delete-address', '/admin/item/edit/save', '/admin/coupon/edit/save', '/admin/page/new/save', '/admin/page/edit/save', '/admin/page/delete/:id', '/admin/popular-geo-location/delete/:id'];
  for (const p of nuevas) assert.ok(tiene('post', p), 'falta POST ' + p);
  assert.ok(!tiene('get', '/auth/logout'), 'logout no debe aceptar GET');
  const logout = rutas.find((r) => r.path === '/auth/logout' && r.methods.includes('post'));
  assert.ok(logout && logout.n >= 2, 'logout POST debe llevar csrf');
  const login = rutas.find((r) => r.path === '/auth/login' && r.methods.includes('post'));
  assert.ok(login.n >= 3, 'login debe llevar rate limit + csrf + controlador');
  const usoAdmin = router.stack.find((l) => !l.route && l.regexp && l.regexp.test('/admin/user/add-money-to-wallet'));
  assert.ok(usoAdmin, 'debe haber middleware (auth + csrf) montado en /admin');
});

test('B attemptLimiter respeta el tope duro de entradas', () => {
  const { createLimiter } = require('../src/helpers/attemptLimiter');
  const l = createLimiter({ max: 5, windowMs: 60000 });
  for (let i = 0; i < 10500; i++) l.fail('k' + i);
  assert.ok(l.size() <= 10000, 'size=' + l.size());
  assert.ok(l.size() > 9000);
});

test('B rateLimit expone stop() y sus timers no retienen el proceso', () => {
  const rl = require('../src/middleware/rateLimit');
  assert.strictEqual(typeof rl.stop, 'function');
  rl.stop();
});

test('B ajuste de billetera del admin valida monto y usa el helper', async () => {
  const flashes = [];
  const mk = (body) => ({ body, flash: (k, m) => flashes.push([k, m]) });
  const redirects = [];
  const res = { redirect: (u) => redirects.push(u) };
  await admin.addMoneyToWallet(mk({ user_id: '7', add_amount: '-5' }), res);
  assert.strictEqual(state.wallet.length, 0);
  assert.strictEqual(flashes[flashes.length - 1][0], 'error');
  await admin.addMoneyToWallet(mk({ user_id: '7', add_amount: '12.5', add_amount_description: 'bono' }), res);
  assert.deepStrictEqual(state.wallet[0], ['deposit', 7, 12.5]);
  await admin.substractMoneyFromWallet(mk({ user_id: '7', substract_amount: '3' }), res);
  assert.deepStrictEqual(state.wallet[1], ['withdraw', 7, 3]);
  assert.strictEqual(redirects[redirects.length - 1], '/admin/user/edit/7');
});
