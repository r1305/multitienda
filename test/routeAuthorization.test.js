const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const calls = [];
const spy = (name) => (req, res) => { calls.push(name); res.json({ ok: true }); };

// Middlewares simulados: csurf y cache neutros; auth JWT y roles por req.user.roles
stub('node_modules/csurf', () => (req, res, next) => next());
stub('src/helpers/cache', { async get() { return {}; }, async set() {} });
stub('src/admin/controllers/settlementsController', {
  cashCollections: spy('admin.cashCollections'),
  deliveryAccount: spy('admin.deliveryAccount'),
  closeCash: spy('admin.closeCash'),
  payDeliveryEarnings: spy('admin.payDeliveryEarnings'),
});
stub('src/middleware/auth', {
  jwtAuth: (req, res, next) => (req.user ? next() : res.status(401).json({ success: false })),
  jwtAuthPermitirInactivo: (req, res, next) => next(),
  optionalAuth: (req, res, next) => next(),
  generateToken: () => 't',
  getUserRoles: async () => [],
  requireRole: (...roles) => (req, res, next) => (
    roles.some((r) => (req.user.roles || []).includes(r)) ? next() : res.status(403).json({ success: false })
  ),
});
stub('src/controllers/storeOwnerController', new Proxy({}, { get: (_, name) => spy('store.' + String(name)) }));
const realMisc = require('../src/controllers/miscControllers');
for (const name of ['deliverOrder', 'getDeliveryBalance']) realMisc[name] = spy('delivery.' + name);

const adminRouter = require('../src/admin/routes/admin');
const apiRouter = require('../src/routes/api');

function fakeRes() {
  return {
    statusCode: 200, body: undefined, redirectedTo: null, done: false, locals: {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.done = true; return this; },
    redirect(u) { this.redirectedTo = u; this.done = true; return this; },
    set() { return this; }, setHeader() {}, getHeader() {},
  };
}

// Recorre la pila del router como lo haría Express (solo middlewares y handlers que coinciden con ruta y método)
async function dispatch(router, method, url, reqExtra) {
  calls.length = 0;
  const res = fakeRes();
  const req = { method, url, originalUrl: url, path: url, params: {}, body: {}, headers: {}, cookies: {}, flash: () => [], ...reqExtra };
  for (const layer of router.stack) {
    if (res.done) break;
    if (!layer.match(url)) continue;
    let handlers;
    if (layer.route) {
      if (!layer.route._handles_method(method.toLowerCase())) continue;
      handlers = layer.route.stack.map((l) => l.handle);
    } else {
      handlers = [layer.handle];
    }
    for (const h of handlers) {
      if (res.done || h.length === 4) continue;
      let advanced = false;
      await h(req, res, () => { advanced = true; });
      if (!advanced) break;
    }
  }
  return { res, calls: [...calls] };
}

test('rutas admin de caja: solo Admin con sesión llega al controlador', async () => {
  const targets = [
    ['POST', '/admin/delivery-guy/account/7/close-cash', 'admin.closeCash'],
    ['POST', '/admin/delivery-guy/account/7/pay-earnings', 'admin.payDeliveryEarnings'],
    ['GET', '/admin/cash-collections', 'admin.cashCollections'],
  ];
  for (const [method, url, handler] of targets) {
    const anon = await dispatch(adminRouter, method, url, { session: {} });
    assert.deepStrictEqual(anon.calls, [], url + ' sin sesión');
    assert.strictEqual(anon.res.redirectedTo, '/auth/login');

    for (const role of ['Customer', 'Store Owner', 'Delivery Guy']) {
      const r = await dispatch(adminRouter, method, url, { session: { user: { id: 3, role } } });
      assert.deepStrictEqual(r.calls, [], `${url} con rol ${role}`);
      assert.strictEqual(r.res.redirectedTo, '/auth/login');
    }

    const admin = await dispatch(adminRouter, method, url, { session: { user: { id: 1, role: 'Admin' } } });
    assert.deepStrictEqual(admin.calls, [handler], url + ' con Admin');
  }
});

test('rutas de tienda: solo Store Owner autenticado llega al controlador', async () => {
  const urls = ['/store-owner/mark-selfpickup-order-completed', '/store-owner/accept-order'];
  for (const url of urls) {
    const anon = await dispatch(apiRouter, 'POST', url, {});
    assert.strictEqual(anon.res.statusCode, 401);
    assert.deepStrictEqual(anon.calls, []);
    for (const roles of [['Customer'], ['Delivery Guy'], ['Admin']]) {
      const r = await dispatch(apiRouter, 'POST', url, { user: { id: 4, roles } });
      assert.strictEqual(r.res.statusCode, 403, `${url} con ${roles}`);
      assert.deepStrictEqual(r.calls, []);
    }
    const owner = await dispatch(apiRouter, 'POST', url, { user: { id: 5, roles: ['Store Owner'] } });
    assert.strictEqual(owner.calls.length, 1);
    assert.ok(owner.calls[0].startsWith('store.'));
  }
});

test('rutas de repartidor (entrega y saldo): solo Delivery Guy', async () => {
  for (const [url, handler] of [['/delivery/deliver-order', 'delivery.deliverOrder'], ['/delivery/get-balance', 'delivery.getDeliveryBalance']]) {
    const store = await dispatch(apiRouter, 'POST', url, { user: { id: 5, roles: ['Store Owner'] } });
    assert.strictEqual(store.res.statusCode, 403);
    assert.deepStrictEqual(store.calls, []);
    const dg = await dispatch(apiRouter, 'POST', url, { user: { id: 6, roles: ['Delivery Guy'] } });
    assert.deepStrictEqual(dg.calls, [handler]);
  }
});
