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
process.env.FIREBASE_CREDENTIALS = path.join(__dirname, '..', 'package.json');

const state = { rows: [], queries: [], sendErrors: {}, subscribeErrorFor: null, dryRuns: [] };

stub('src/models', {
  sequelize: {
    async query(sql, opts = {}) {
      const r = opts.replacements || [];
      state.queries.push(sql);
      if (/^SELECT token, device_type FROM push_tokens WHERE user_id/.test(sql)) {
        return [state.rows.filter((x) => x.user_id === r[0]).map((x) => ({ token: x.token, device_type: x.device_type }))];
      }
      if (/^SELECT id FROM push_tokens WHERE user_id = \? AND token = \?/.test(sql)) {
        return [state.rows.filter((x) => x.user_id === r[0] && x.token === r[1])];
      }
      if (/^INSERT INTO push_tokens/.test(sql)) {
        state.rows.push({ user_id: r[0], token: r[1], device_type: r[2] });
        return [[], 1];
      }
      if (/^DELETE FROM push_tokens WHERE token IN/.test(sql)) {
        state.rows = state.rows.filter((x) => !r[0].includes(x.token));
        return [[], 0];
      }
      if (/^DELETE FROM push_tokens WHERE user_id = \? AND token = \?/.test(sql)) {
        state.rows = state.rows.filter((x) => !(x.user_id === r[0] && x.token === r[1]));
        return [[], 0];
      }
      return [[], 0];
    },
  },
});

require.cache[require.resolve('firebase-admin')] = {
  id: 'firebase-admin', loaded: true,
  exports: {
    initializeApp: () => ({ name: 'fake' }),
    credential: { cert: (c) => c },
    messaging: () => ({
      async sendEach(msgs) {
        const responses = msgs.map((m) => (state.sendErrors[m.token]
          ? { success: false, error: { code: state.sendErrors[m.token], message: 'x' } }
          : { success: true }));
        const ok = responses.filter((x) => x.success).length;
        return { successCount: ok, failureCount: msgs.length - ok, responses };
      },
      async send(msg, dryRun) {
        state.dryRuns.push({ token: msg.token, dryRun });
        const code = state.sendErrors[msg.token];
        if (code) throw Object.assign(new Error('x'), { code });
        return 'projects/p/messages/1';
      },
      async subscribeToTopic(tokens) {
        if (tokens[0] === state.subscribeErrorFor) {
          return { successCount: 0, failureCount: 1, errors: [{ index: 0, error: { code: 'messaging/registration-token-not-registered' } }] };
        }
        return { successCount: 1, failureCount: 0, errors: [] };
      },
    }),
  },
};

const impl = require('../src/helpers/notifications.impl');

function reset(rows) {
  state.rows = rows;
  state.queries = [];
  state.sendErrors = {};
  state.subscribeErrorFor = null;
  state.dryRuns = [];
}

test('envío: token not-registered se borra por token exacto y los válidos quedan', async () => {
  reset([
    { user_id: 3, token: 'dead-web-aaa', device_type: 'web' },
    { user_id: 3, token: 'live-web-bbb', device_type: 'web' },
    { user_id: 4, token: 'other-ccc', device_type: 'web' },
  ]);
  state.sendErrors['dead-web-aaa'] = 'messaging/registration-token-not-registered';
  const r = await impl.sendPushNotification('t', 'm', 3, null, {});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.failureCount, 1);
  assert.deepStrictEqual(state.rows.map((x) => x.token), ['live-web-bbb', 'other-ccc']);
});

test('envío: invalid-registration-token también se borra; otros errores no', async () => {
  reset([
    { user_id: 3, token: 'bad-aaa', device_type: 'web' },
    { user_id: 3, token: 'quota-bbb', device_type: 'web' },
  ]);
  state.sendErrors['bad-aaa'] = 'messaging/invalid-registration-token';
  state.sendErrors['quota-bbb'] = 'messaging/message-rate-exceeded';
  await impl.sendPushNotification('t', 'm', 3, null, {});
  assert.deepStrictEqual(state.rows.map((x) => x.token), ['quota-bbb']);
});

test('guardar token nuevo del mismo navegador borra el anterior del usuario y no toca otros dispositivos', async () => {
  reset([
    { user_id: 3, token: 'old-web-aaa', device_type: 'web' },
    { user_id: 3, token: 'phone-bbb', device_type: 'android' },
    { user_id: 4, token: 'old-web-aaa', device_type: 'web' },
  ]);
  const r = await impl.saveFCMToken(3, 'new-web-ccc', 'web', 'old-web-aaa');
  assert.deepStrictEqual(r, { ok: true });
  assert.deepStrictEqual(
    state.rows.map((x) => `${x.user_id}:${x.token}`).sort(),
    ['3:new-web-ccc', '3:phone-bbb', '4:old-web-aaa']
  );
});

test('guardar el mismo token no duplica la fila', async () => {
  reset([{ user_id: 3, token: 'same-aaa', device_type: 'web' }]);
  await impl.saveFCMToken(3, 'same-aaa', 'web', 'same-aaa');
  assert.strictEqual(state.rows.length, 1);
});

test('guardar un token que FCM da por no registrado lo rechaza y no deja la fila', async () => {
  reset([]);
  state.subscribeErrorFor = 'dead-web-aaa';
  state.sendErrors['dead-web-aaa'] = 'messaging/registration-token-not-registered';
  const r = await impl.saveFCMToken(3, 'dead-web-aaa', 'web');
  assert.deepStrictEqual(r, { ok: false, reason: 'token_not_registered' });
  assert.strictEqual(state.rows.length, 0);
  assert.deepStrictEqual(state.dryRuns, [{ token: 'dead-web-aaa', dryRun: true }]);
});

test('alta a tema dice not-registered pero el dry-run lo acepta: se guarda y no se borra', async () => {
  reset([]);
  state.subscribeErrorFor = 'fresh-web-aaa';
  const r = await impl.saveFCMToken(3, 'fresh-web-aaa', 'web');
  assert.deepStrictEqual(r, { ok: true });
  assert.deepStrictEqual(state.rows.map((x) => x.token), ['fresh-web-aaa']);
});

test('dry-run con otro error (credencial de otro proyecto) no borra el token', async () => {
  reset([]);
  state.subscribeErrorFor = 'other-proj-aaa';
  state.sendErrors['other-proj-aaa'] = 'messaging/mismatched-credential';
  const r = await impl.saveFCMToken(3, 'other-proj-aaa', 'web');
  assert.deepStrictEqual(r, { ok: true });
  assert.strictEqual(state.rows.length, 1);
});

test('enable fuerza token nuevo (deleteToken) y manda el anterior como previous_token', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/app/js/pushNotifications.js'), 'utf8');
  const reg = {};
  let current = 'cached-dead-aaa';
  let deleted = 0;
  const posts = [];
  const firebase = {
    apps: [],
    initializeApp() { this.apps.push({ name: '[DEFAULT]' }); },
    messaging() {
      return {
        onMessage() {},
        async getToken() { return current; },
        async deleteToken() { deleted += 1; current = 'fresh-bbb'; return true; },
      };
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
    localStorage: { getItem: () => 'auth', setItem() {} },
    fetch: async (url, opts) => { posts.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; },
    Store: { settings: { firebaseApiKey: 'k', firebaseProjectId: 'p', firebaseMessagingSenderId: 's', firebaseAppId: 'a', firebaseVapidKey: 'v' } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const r = await window.PushNotifications.enable(3, 'customer');
  assert.deepStrictEqual({ ...r }, { ok: true, reason: 'granted' });
  assert.strictEqual(deleted, 1);
  assert.strictEqual(posts.length, 1);
  assert.deepStrictEqual({ ...posts[0] }, { token: 'fresh-bbb', platform: 'web', previous_token: 'cached-dead-aaa' });
});

test('enable: si deleteToken falla, desuscribe el push del SW para forzar token nuevo', async () => {
  const src = fs.readFileSync(path.join(__dirname, '../public/app/js/pushNotifications.js'), 'utf8');
  let unsubscribed = 0;
  const reg = { pushManager: { async getSubscription() { return { async unsubscribe() { unsubscribed += 1; return true; } }; } } };
  const firebase = {
    apps: [],
    initializeApp() { this.apps.push({ name: '[DEFAULT]' }); },
    messaging() {
      return {
        onMessage() {},
        async getToken() { return unsubscribed ? 'fresh-bbb' : 'cached-dead-aaa'; },
        async deleteToken() { throw new Error('token-unsubscribe-failed'); },
      };
    },
  };
  const window = { firebase, dispatchEvent() {}, location: { pathname: '/order/x' } };
  const posts = [];
  const ctx = {
    window,
    URLSearchParams,
    console: { warn() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    Notification: { permission: 'granted' },
    setTimeout, clearTimeout,
    navigator: { serviceWorker: { async register() { return reg; }, ready: Promise.resolve(reg) } },
    localStorage: { getItem: () => 'auth', setItem() {} },
    fetch: async (url, opts) => { posts.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; },
    Store: { settings: { firebaseApiKey: 'k', firebaseProjectId: 'p', firebaseMessagingSenderId: 's', firebaseAppId: 'a', firebaseVapidKey: 'v' } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const r = await window.PushNotifications.enable(3, 'customer');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(unsubscribed, 1);
  assert.strictEqual(posts[0].token, 'fresh-bbb');
  assert.strictEqual(posts[0].previous_token, 'cached-dead-aaa');
});
