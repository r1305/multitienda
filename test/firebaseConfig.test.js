const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const CRED = { type: 'service_account', project_id: 'db-proj', client_email: 'svc@db-proj.iam.test', private_key: 'FAKE-KEY-FOR-TEST', private_key_id: 'abcd1234wxyz' };
const ENV_CRED = { project_id: 'env-proj', client_email: 'svc@env-proj.iam.test', private_key: 'FAKE-ENV-KEY' };
const DB_URL = 'https://db-x-default-rtdb.firebaseio.com';
const ENV_URL = 'https://env-y-default-rtdb.firebaseio.com';

const state = { rows: [], settingsQueries: 0, writes: 0, failWriteAt: 0 };

function setting(key) { return state.rows.find((r) => r.key === key); }

stub('src/models', {
  sequelize: {
    async transaction(cb) {
      const before = state.rows.map((r) => ({ ...r }));
      try { return await cb({}); } catch (e) { state.rows = before; throw e; }
    },
    async query(sql, opts = {}) {
      const rep = opts.replacements || [];
      if (/^SELECT `key`, `value` FROM settings WHERE `key` IN/.test(sql)) {
        state.settingsQueries += 1;
        return state.rows.filter((r) => rep.includes(r.key)).map((r) => ({ ...r }));
      }
      if (/^SELECT `key`, `value` FROM settings$/.test(sql)) return [state.rows.map((r) => ({ ...r }))];
      if (/^SELECT id FROM settings WHERE `key` = \?/.test(sql)) return [state.rows.filter((r) => r.key === rep[0]).map(() => ({ id: 1 }))];
      if (/^(UPDATE|INSERT INTO) settings/.test(sql)) {
        state.writes += 1;
        if (state.failWriteAt && state.writes === state.failWriteAt) {
          const e = new Error('Data too long for column value');
          e.sql = `INSERT INTO settings (key, value) VALUES ('firebaseServiceAccount', '${JSON.stringify(CRED)}')`;
          throw e;
        }
      }
      if (/^UPDATE settings SET `value` = \? WHERE `key` = \?/.test(sql)) { setting(rep[1]).value = rep[0]; return [[], 1]; }
      if (/^INSERT INTO settings/.test(sql)) { state.rows.push({ key: rep[0], value: rep[1] }); return [[], 1]; }
      return [[], 0];
    },
  },
  Setting: {
    async findAll() { return state.rows.map((r, i) => ({ id: i + 1, key: r.key, value: r.value })); },
  },
});
stub('src/helpers/notifications', { async notifyDeliveryNewOrder() {}, async notifyCustomerOrderEvent() {} });
stub('src/helpers/notifications.impl', { getFirebaseApp: async () => ({ name: 'fake-app' }) });
require.cache[require.resolve('firebase-admin/database')] = {
  id: 'firebase-admin/database', loaded: true,
  exports: { getDatabaseWithUrl: (url, app) => ({ url, app, ref() {} }) },
};

const cfg = require('../src/helpers/firebaseConfig');
const realtime = require('../src/helpers/orderRealtime');
const misc = require('../src/controllers/miscControllers');
const admin = require('../src/admin/controllers/adminController');
const cache = require('../src/helpers/cache');

function reset() {
  state.rows = [];
  state.settingsQueries = 0;
  state.writes = 0;
  state.failWriteAt = 0;
  delete process.env.FIREBASE_DATABASE_URL;
  process.env.FIREBASE_CREDENTIALS = path.join(__dirname, 'no-existe-credencial.json');
  delete process.env.MP_ENCRYPTION_KEY;
  realtime._setDb(undefined);
  cfg.invalidate();
}

function fakeRes() {
  return {
    statusCode: 200, body: undefined, redirected: null, rendered: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    redirect(u) { this.redirected = u; return this; },
    render(view, data) { this.rendered = { view, data }; return this; },
  };
}

function fakeReq(body) {
  const flashed = {};
  return { body, session: { user: { role: 'Admin' } }, flashed, flash(k, v) { if (v !== undefined) flashed[k] = v; return flashed[k] ? [flashed[k]] : []; } };
}

test('a) la config prefiere BD sobre entorno y cae al entorno si la BD esta vacia', async () => {
  reset();
  process.env.FIREBASE_DATABASE_URL = ENV_URL;
  process.env.FIREBASE_CREDENTIALS = JSON.stringify(ENV_CRED);
  state.rows = [{ key: 'firebaseDatabaseURL', value: DB_URL }, { key: 'firebaseServiceAccount', value: JSON.stringify(CRED) }];
  let c = await cfg.getConfig();
  assert.strictEqual(c.databaseURL, DB_URL);
  assert.strictEqual(c.credential.project_id, 'db-proj');

  state.rows = [{ key: 'firebaseDatabaseURL', value: '  ' }, { key: 'firebaseServiceAccount', value: '' }];
  cfg.invalidate();
  c = await cfg.getConfig();
  assert.strictEqual(c.databaseURL, ENV_URL);
  assert.strictEqual(c.credential.project_id, 'env-proj');
});

test('a) una URL o credencial invalida en BD cae al entorno', async () => {
  reset();
  process.env.FIREBASE_DATABASE_URL = ENV_URL;
  process.env.FIREBASE_CREDENTIALS = JSON.stringify(ENV_CRED);
  state.rows = [{ key: 'firebaseDatabaseURL', value: 'http://evil.example.com' }, { key: 'firebaseServiceAccount', value: '{"project_id":"x"}' }];
  const c = await cfg.getConfig();
  assert.strictEqual(c.databaseURL, ENV_URL);
  assert.strictEqual(c.credential.project_id, 'env-proj');
});

test('b) la cache se invalida al guardar ajustes en el admin', async () => {
  reset();
  state.rows = [{ key: 'firebaseDatabaseURL', value: DB_URL }];
  let c = await cfg.getConfig();
  await cfg.getConfig();
  assert.strictEqual(state.settingsQueries, 1);
  assert.strictEqual(c.databaseURL, DB_URL);

  const res = fakeRes();
  await admin.saveSettings(fakeReq({ firebaseDatabaseURL: 'https://nuevo-default-rtdb.europe-west1.firebasedatabase.app/', firebaseServiceAccount: JSON.stringify(CRED) }), res);
  assert.strictEqual(res.redirected, '/admin/settings');
  c = await cfg.getConfig();
  assert.strictEqual(c.databaseURL, 'https://nuevo-default-rtdb.europe-west1.firebasedatabase.app');
  assert.strictEqual(c.credential.project_id, 'db-proj');
});

test('b) con MP_ENCRYPTION_KEY la credencial se guarda cifrada y se lee igual', async () => {
  reset();
  process.env.MP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  await admin.saveSettings(fakeReq({ firebaseServiceAccount: JSON.stringify(CRED) }), fakeRes());
  const stored = setting('firebaseServiceAccount').value;
  assert.match(stored, /^v1:/);
  assert.ok(!stored.includes('FAKE-KEY-FOR-TEST'));
  const c = await cfg.getConfig();
  assert.strictEqual(c.credential.client_email, CRED.client_email);
});

test('b) credencial vacia conserva la guardada y la casilla de eliminar la borra', async () => {
  reset();
  state.rows = [{ key: 'firebaseServiceAccount', value: JSON.stringify(CRED) }];
  await admin.saveSettings(fakeReq({ firebaseServiceAccount: '' }), fakeRes());
  assert.strictEqual((await cfg.getConfig()).credential.project_id, 'db-proj');
  await admin.saveSettings(fakeReq({ firebaseServiceAccount: '', firebaseServiceAccountClear: '1' }), fakeRes());
  assert.ok((await cfg.getConfig()).credential === null);
});

test('c) /get-settings no incluye la credencial ni la private_key', async () => {
  reset();
  await cache.del('settings:all');
  process.env.FIREBASE_DATABASE_URL = ENV_URL;
  state.rows = [
    { key: 'firebaseApiKey', value: 'web-api-key' },
    { key: 'firebaseDatabaseURL', value: DB_URL },
    { key: 'firebaseServiceAccount', value: JSON.stringify(CRED) },
  ];
  const res = fakeRes();
  await misc.getSettings({}, res);
  const text = JSON.stringify(res.body);
  assert.ok(text.includes('web-api-key'));
  assert.ok(text.includes(DB_URL));
  assert.ok(!text.includes('firebaseServiceAccount'));
  assert.ok(!text.includes('private_key') && !text.includes('FAKE-KEY-FOR-TEST') && !text.includes(CRED.client_email));
  await cache.del('settings:all');
});

test('c) la pantalla de ajustes del admin no recibe la private_key', async () => {
  reset();
  state.rows = [{ key: 'firebaseServiceAccount', value: JSON.stringify(CRED) }];
  const res = fakeRes();
  await admin.settings(fakeReq({}), res);
  const text = JSON.stringify(res.rendered.data);
  assert.ok(!text.includes('FAKE-KEY-FOR-TEST') && !text.includes('private_key"'));
  assert.strictEqual(res.rendered.data.settings.firebaseServiceAccount, undefined);
  const info = res.rendered.data.settings.firebaseServiceAccountInfo;
  assert.strictEqual(info.configured, true);
  assert.strictEqual(info.hint, '••••wxyz');
});

test('d) la validacion rechaza credencial sin private_key y URL no valida', async () => {
  const noKey = JSON.stringify({ project_id: 'p', client_email: 'e@p.iam' });
  assert.ok(cfg.checkInput({ firebaseServiceAccount: noKey }).error);
  assert.ok(cfg.checkInput({ firebaseServiceAccount: 'no es json' }).error);
  assert.ok(cfg.checkInput({ firebaseDatabaseURL: 'http://x-default-rtdb.firebaseio.com' }).error);
  assert.ok(cfg.checkInput({ firebaseDatabaseURL: 'https://evil.example.com' }).error);
  assert.ok(cfg.checkInput({ firebaseDatabaseURL: 'https://x.firebaseio.com.evil.com' }).error);
  assert.strictEqual(cfg.checkInput({ firebaseDatabaseURL: DB_URL + '/', firebaseServiceAccount: JSON.stringify(CRED) }).error, undefined);

  reset();
  const req = fakeReq({ firebaseDatabaseURL: DB_URL, firebaseServiceAccount: noKey });
  const res = fakeRes();
  await admin.saveSettings(req, res);
  assert.ok(req.flashed.error);
  assert.strictEqual(state.rows.length, 0);
});

async function failingSave(body) {
  const prevInvalidate = cfg.invalidate;
  const prevError = console.error;
  const logged = [];
  let invalidated = 0;
  cfg.invalidate = () => { invalidated += 1; return prevInvalidate(); };
  console.error = (...args) => { logged.push(args); };
  const req = fakeReq(body);
  try { await admin.saveSettings(req, fakeRes()); } finally { cfg.invalidate = prevInvalidate; console.error = prevError; }
  return { req, logged, invalidated };
}

test('f) un fallo de BD a mitad del guardado revierte todo y no invalida la config', async () => {
  reset();
  state.rows = [{ key: 'storeName', value: 'Old' }];
  const before = JSON.stringify(state.rows);
  state.failWriteAt = 2;
  const { req, invalidated } = await failingSave({ storeName: 'New', firebaseDatabaseURL: DB_URL, firebaseServiceAccount: JSON.stringify(CRED) });
  assert.ok(req.flashed.error);
  assert.strictEqual(JSON.stringify(state.rows), before);
  assert.strictEqual(invalidated, 0);
});

test('f) un error de BD con la credencial en la SQL no la imprime por console.error', async () => {
  reset();
  state.failWriteAt = 1;
  const { logged } = await failingSave({ firebaseServiceAccount: JSON.stringify(CRED) });
  assert.ok(logged.length > 0);
  const text = logged.map((a) => a.map((x) => (x instanceof Error ? x.stack + JSON.stringify(x) : String(x))).join(' ')).join(' | ');
  assert.ok(!text.includes('FAKE-KEY-FOR-TEST') && !text.includes('private_key'));
});

test('e) getDb no queda memoizado en null tras invalidar', async () => {
  reset();
  assert.strictEqual(await realtime.getDb(), null);
  state.rows = [{ key: 'firebaseDatabaseURL', value: DB_URL }, { key: 'firebaseServiceAccount', value: JSON.stringify(CRED) }];
  assert.strictEqual(await realtime.getDb(), null, 'sigue con la cache hasta invalidar');
  cfg.invalidate();
  const db = await realtime.getDb();
  assert.ok(db);
  assert.strictEqual(db.url, DB_URL);
  assert.strictEqual(await realtime.getDb(), db, 'misma instancia mientras la config no cambia');

  state.rows[0].value = 'https://otro-default-rtdb.firebaseio.com';
  cfg.invalidate();
  assert.strictEqual((await realtime.getDb()).url, 'https://otro-default-rtdb.firebaseio.com');
});
