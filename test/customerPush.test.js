const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

process.env.APP_URL = 'https://tienda.test';
process.env.APP_BASE_PATH = '/multitienda';
process.env.FIREBASE_CREDENTIALS = path.join(__dirname, '..', 'package.json');
const KEY = 'OD-11-22-AB12-XYZ12';

const state = { status: 2, sent: [], saved: [], notified: [] };

stub('src/models', {
  sequelize: {
    async transaction(fn) {
      return fn({ LOCK: { UPDATE: 'UPDATE' }, afterCommit: (h) => h() });
    },
    async query(sql, opts = {}) {
      if (/FROM push_tokens WHERE user_id/.test(sql)) return [[{ token: 'tok-web', device_type: 'web' }, { token: 'tok-and', device_type: 'android' }]];
      if (/^INSERT INTO notifications/.test(sql)) { state.saved.push(opts.replacements); return [[], 0]; }
      if (/INNER JOIN model_has_roles mr ON mr.model_id = u.id/.test(sql)) return [[{ id: opts.replacements[0] }]];
      if (/FROM orders WHERE id = \? LIMIT 1 FOR UPDATE/.test(sql)) return [[{ id: 7, user_id: 5, unique_order_id: KEY, orderstatus_id: state.status }]];
      if (/^UPDATE orders/.test(sql)) return [undefined, 1];
      return [[], 0];
    },
  },
});
stub('src/helpers/notifications', {
  async notifyDeliveryOrderAssigned() { return { ok: true }; },
  async notifyCustomerDeliveryAccepted(o) { state.notified.push(o); },
});
require.cache[require.resolve('firebase-admin')] = {
  id: 'firebase-admin', loaded: true,
  exports: {
    initializeApp: () => ({ name: 'fake' }),
    credential: { cert: (c) => c },
    messaging: () => ({
      async sendEach(msgs) {
        state.sent.push(...msgs);
        return { successCount: msgs.length, failureCount: 0, responses: msgs.map(() => ({ success: true })) };
      },
    }),
  },
};

const { validateMessage } = require(path.join(__dirname, '..', 'node_modules/firebase-admin/lib/messaging/messaging-internal.js'));
require('../src/helpers/orderRealtime')._setDb(null);
const impl = require('../src/helpers/notifications.impl');
const admin = require('../src/admin/controllers/adminController');
const { emitOrderEvent } = require('../src/helpers/orderEvents');

const ORDER = { id: 7, user_id: 5, unique_order_id: KEY };
const fakeRes = () => ({ redirect() { return this; } });

function reset() { state.status = 2; state.sent = []; state.saved = []; state.notified = []; }

test('admin asigna repartidor (2 -> 3): avisa al cliente una vez; reasignar (ya en 3) no repite', async () => {
  reset();
  await admin.assignDelivery({ body: { order_id: 7, user_id: 11 }, flash() {} }, fakeRes());
  assert.strictEqual(state.notified.length, 1);
  assert.strictEqual(Number(state.notified[0].user_id), 5);

  reset();
  state.status = 3;
  await admin.reassignDelivery({ body: { order_id: 7, user_id: 11 }, flash() {} }, fakeRes());
  assert.strictEqual(state.notified.length, 0);
});

test('push al cliente: payload válido para FCM, link e icono con prefijo de montaje', async () => {
  reset();
  await impl.notifyCustomerOrderOnWay(ORDER);
  assert.strictEqual(state.sent.length, 2);
  for (const msg of state.sent) {
    assert.doesNotThrow(() => validateMessage(structuredClone(msg)));
    for (const v of Object.values(msg.data)) assert.strictEqual(typeof v, 'string');
    assert.strictEqual(msg.webpush.fcmOptions.link, `https://tienda.test/multitienda/order/${KEY}`);
    assert.strictEqual(msg.webpush.notification.icon, 'https://tienda.test/multitienda/assets/img/favicons/favicon-96x96.png');
    assert.strictEqual(msg.data.recipient_role, 'customer');
  }
  const web = state.sent.find((m) => m.token === 'tok-web');
  assert.strictEqual(web.notification, undefined);
  assert.strictEqual(web.webpush.notification.title, 'Tu pedido está en camino!');
  assert.ok(state.sent.find((m) => m.token === 'tok-and').notification);
});

test('imagen protocol-relative (//cdn...) se resuelve a https sin prefijo de montaje', async () => {
  reset();
  await impl.sendPushNotification('t', 'm', 5, null, { image: '//cdn.ejemplo.com/x.png' });
  assert.ok(state.sent.length > 0);
  for (const msg of state.sent) {
    assert.strictEqual(msg.webpush.notification.image, 'https://cdn.ejemplo.com/x.png');
    assert.strictEqual(msg.data.image, 'https://cdn.ejemplo.com/x.png');
  }
});

test('asignado y en camino llevan tipos distintos (no se pisan en la notificación local)', async () => {
  reset();
  await impl.notifyCustomerDeliveryAccepted(ORDER);
  await impl.notifyCustomerOrderOnWay(ORDER);
  const types = [...new Set(state.sent.map((m) => m.data.type))];
  assert.deepStrictEqual(types, ['order_assigned', 'order_on_way']);
});

test('cada evento de estado del cliente manda push con título propio y tipo order_<evento>', async () => {
  for (const ev of ['accepted', 'preparing', 'ready', 'cancelled', 'delivered', 'paid', 'scheduled_confirmed']) {
    reset();
    await impl.notifyCustomerOrderEvent(ORDER, ev);
    assert.strictEqual(state.sent.length, 2, ev);
    assert.strictEqual(state.sent[0].data.type, `order_${ev}`);
    assert.ok(state.sent[0].webpush.notification.title);
    assert.doesNotThrow(() => validateMessage(structuredClone(state.sent[0])));
  }
});

test('emitOrderEvent avisa al cliente en cada evento salvo released', async () => {
  const calls = [];
  const notifications = {
    async notifyCustomerOrderEvent(o, ev) { calls.push([ev, o.user_id]); },
    async notifyDeliveryNewOrder() {},
    async notifyStoreNewOrder() {},
  };
  for (const ev of ['accepted', 'preparing', 'ready', 'cancelled', 'delivered', 'paid', 'scheduled_confirmed', 'released']) {
    await emitOrderEvent(ev, { ...ORDER, delivery_type: 1, orderstatus_id: 2 }, { notifications });
  }
  assert.deepStrictEqual(calls.map((c) => c[0]), ['accepted', 'preparing', 'ready', 'cancelled', 'delivered', 'paid', 'scheduled_confirmed']);
  assert.ok(calls.every((c) => c[1] === 5));
});

test('initSDK crea la app por defecto aunque ya exista la app orders-rt de OrderRealtime', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/app/js/pushNotifications.js'), 'utf8');
  const apps = [{ name: 'orders-rt' }];
  const firebase = {
    apps,
    initializeApp(cfg, name) { const a = { name: name || '[DEFAULT]' }; apps.push(a); return a; },
    messaging() {
      if (!apps.some((a) => a.name === '[DEFAULT]')) throw new Error("No Firebase App '[DEFAULT]'");
      return { onMessage() {} };
    },
  };
  const window = { firebase, dispatchEvent() {}, location: { pathname: '/order/x' } };
  const ctx = {
    window,
    URLSearchParams,
    CustomEvent: class { constructor(type) { this.type = type; } },
    setTimeout, clearTimeout,
    navigator: { serviceWorker: { async register() { return {}; } } },
    localStorage: { getItem: () => null, setItem() {} },
    Store: { settings: { firebaseApiKey: 'k', firebaseProjectId: 'p', firebaseMessagingSenderId: 's', firebaseAppId: 'a' } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.strictEqual(await window.PushNotifications.initSDK(), true);
  assert.deepStrictEqual(apps.map((a) => a.name), ['orders-rt', '[DEFAULT]']);
});

test('el service worker asigna su registro a messaging para que pushsubscriptionchange no lea pushManager de undefined', () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/firebase-messaging-sw.js'), 'utf8');
  const delegate = {};
  const registration = { scope: 'https://tienda.test/multitienda/', pushManager: {} };
  const self = { location: { search: '?apiKey=k&projectId=p&messagingSenderId=s&appId=a' }, registration, addEventListener() {} };
  const ctx = {
    self,
    URLSearchParams,
    importScripts() {},
    clients: {},
    firebase: {
      initializeApp() {},
      messaging() { return { _delegate: delegate, onBackgroundMessage() {} }; },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.strictEqual(delegate.swRegistration, registration);
});

test('enable devuelve error controlado si getToken falla', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/app/js/pushNotifications.js'), 'utf8');
  const reg = {};
  const firebase = {
    apps: [],
    initializeApp() { this.apps.push({ name: '[DEFAULT]' }); },
    messaging() {
      return { onMessage() {}, async getToken() { throw new TypeError("Cannot read properties of undefined (reading 'pushManager')"); } };
    },
  };
  const window = { firebase, dispatchEvent() {}, location: { pathname: '/order/x' } };
  const ctx = {
    window,
    URLSearchParams,
    console: { warn() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    Notification: { permission: 'granted' },
    setTimeout, clearTimeout,
    navigator: { serviceWorker: { async register() { return reg; }, ready: Promise.resolve(reg) } },
    localStorage: { getItem: () => 'tok', setItem() {} },
    Store: { settings: { firebaseApiKey: 'k', firebaseProjectId: 'p', firebaseMessagingSenderId: 's', firebaseAppId: 'a', firebaseVapidKey: 'v' } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const r = await window.PushNotifications.enable(5, 'customer');
  assert.deepStrictEqual({ ...r }, { ok: false, reason: 'token_save_failed' });
  assert.strictEqual(window.PushNotifications._serviceWorkerReg, reg);
});

test('enable no se cuelga si serviceWorker.ready nunca resuelve y limpia el timer', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/app/js/pushNotifications.js'), 'utf8');
  const firebase = { apps: [], initializeApp() {}, messaging() { return { onMessage() {} }; } };
  const window = { firebase, dispatchEvent() {}, location: { pathname: '/delivery' } };
  const delays = [];
  const cleared = [];
  const ctx = {
    window,
    URLSearchParams,
    console: { warn() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    Notification: { permission: 'granted' },
    setTimeout(fn, ms) { delays.push(ms); fn(); return 7; },
    clearTimeout(id) { cleared.push(id); },
    navigator: { serviceWorker: { async register() { return {}; }, ready: new Promise(() => {}) } },
    localStorage: { getItem: () => 'tok', setItem() {} },
    Store: { settings: { firebaseApiKey: 'k', firebaseProjectId: 'p', firebaseMessagingSenderId: 's', firebaseAppId: 'a', firebaseVapidKey: 'v' } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const r = await window.PushNotifications.enable(5, 'delivery');
  assert.deepStrictEqual({ ...r }, { ok: false, reason: 'init_failed' });
  assert.deepStrictEqual(delays, [8000]);
  assert.deepStrictEqual(cleared, [7]);
  assert.strictEqual(window.PushNotifications._initPromise, null);
  assert.strictEqual(window.PushNotifications._serviceWorkerReg, null);
});
