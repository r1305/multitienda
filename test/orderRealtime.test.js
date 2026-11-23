const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { sql: [], affected: 1, uniqueId: 'OD-11-22-AB12-XYZ12' };

stub('src/models', {
  sequelize: {
    async query(sql, opts) {
      state.sql.push(sql);
      if (/^UPDATE orders/.test(sql)) return [undefined, state.affected];
      if (/^SELECT unique_order_id/.test(sql)) return [{ unique_order_id: state.uniqueId }];
      return [[], 0];
    },
  },
});

const states = require('../src/helpers/orderStates');
const realtime = require('../src/helpers/orderRealtime');
const firebaseConfig = require('../src/helpers/firebaseConfig');

const tick = () => new Promise((r) => setImmediate(r));

function fakeDb({ fail } = {}) {
  const calls = [];
  return {
    calls,
    ref(p) {
      return {
        update(v) {
          calls.push({ path: p, value: v });
          if (fail === 'sync') throw new Error('rtdb sync');
          return fail ? Promise.reject(new Error('rtdb down')) : Promise.resolve();
        },
      };
    },
  };
}

function reset() {
  state.sql = [];
  state.affected = 1;
  realtime._setDb(undefined);
}

const A = states.STATUS;
const order = { id: 7, unique_order_id: 'OD-11-22-AB12-XYZ12' };

test('transition publica una sola escritura con estado y updatedAt', async () => {
  reset();
  const db = fakeDb();
  realtime._setDb(db);
  await states.transition(order, [A.PENDING], A.ACCEPTED, 'store');
  await tick();
  assert.strictEqual(db.calls.length, 1);
  assert.strictEqual(db.calls[0].path, 'orders/OD-11-22-AB12-XYZ12');
  assert.deepStrictEqual(Object.keys(db.calls[0].value).sort(), ['estado', 'updatedAt']);
  assert.strictEqual(db.calls[0].value.estado, A.ACCEPTED);
  assert.strictEqual(typeof db.calls[0].value.updatedAt, 'number');
});

test('con solo el id, resuelve la clave pública desde SQL', async () => {
  reset();
  const db = fakeDb();
  realtime._setDb(db);
  await states.transition(7, [A.ACCEPTED], A.ASSIGNED, 'delivery');
  await tick();
  assert.strictEqual(db.calls.length, 1);
  assert.strictEqual(db.calls[0].path, 'orders/OD-11-22-AB12-XYZ12');
  assert.strictEqual(db.calls[0].value.estado, A.ASSIGNED);
});

test('un fallo de RTDB (async o síncrono) no rompe la transición', async () => {
  for (const fail of [true, 'sync']) {
    reset();
    const db = fakeDb({ fail });
    realtime._setDb(db);
    const r = await states.transition(order, [A.PENDING], A.ACCEPTED, 'store');
    await tick();
    assert.strictEqual(r.to, A.ACCEPTED);
    assert.strictEqual(db.calls.length, 1);
  }
});

test('transición rechazada (affectedRows 0) no publica', async () => {
  reset();
  state.affected = 0;
  const db = fakeDb();
  realtime._setDb(db);
  await assert.rejects(() => states.transition(order, [A.PENDING], A.ACCEPTED, 'store'), /ya cambió/);
  await tick();
  assert.strictEqual(db.calls.length, 0);
});

test('con transacción publica solo tras el commit', async () => {
  reset();
  const db = fakeDb();
  realtime._setDb(db);
  const hooks = [];
  const t = { afterCommit: (fn) => hooks.push(fn) };
  await states.transition(order, [A.PENDING], A.CANCELLED, 'store', t);
  await tick();
  assert.strictEqual(db.calls.length, 0);
  assert.strictEqual(hooks.length, 1);
  hooks[0]();
  await tick();
  assert.strictEqual(db.calls.length, 1);
  assert.strictEqual(db.calls[0].value.estado, A.CANCELLED);
});

test('claves no seguras para RTDB no se publican', async () => {
  reset();
  const db = fakeDb();
  realtime._setDb(db);
  realtime.publishOrderState({ id: 1, unique_order_id: 'a/b.c' }, A.PENDING);
  await tick();
  assert.strictEqual(db.calls.length, 0);
});

test('sin URL es no-op: no publica ni consulta SQL', async () => {
  reset();
  firebaseConfig.invalidate();
  const prev = process.env.FIREBASE_DATABASE_URL;
  process.env.FIREBASE_DATABASE_URL = '';
  try {
    await states.transition(7, [A.PENDING], A.ACCEPTED, 'store');
    await tick();
    assert.strictEqual(state.sql.filter((s) => /^SELECT/.test(s) && !/FROM settings/.test(s)).length, 0);
    assert.ok(state.sql.filter((s) => /FROM settings/.test(s)).length <= 1);
  } finally {
    if (prev === undefined) delete process.env.FIREBASE_DATABASE_URL; else process.env.FIREBASE_DATABASE_URL = prev;
  }
});

test('con URL pero sin credencial es no-op', async () => {
  reset();
  firebaseConfig.invalidate();
  const prevUrl = process.env.FIREBASE_DATABASE_URL;
  const prevCred = process.env.FIREBASE_CREDENTIALS;
  process.env.FIREBASE_DATABASE_URL = 'https://ejemplo-default-rtdb.firebaseio.com';
  process.env.FIREBASE_CREDENTIALS = path.join(__dirname, 'no-existe-credencial.json');
  try {
    const r = await states.transition(7, [A.PENDING], A.ACCEPTED, 'store');
    await tick();
    assert.strictEqual(r.to, A.ACCEPTED);
    assert.strictEqual(state.sql.filter((s) => /^SELECT/.test(s) && !/FROM settings/.test(s)).length, 0);
    assert.ok(state.sql.filter((s) => /FROM settings/.test(s)).length <= 1);
  } finally {
    if (prevUrl === undefined) delete process.env.FIREBASE_DATABASE_URL; else process.env.FIREBASE_DATABASE_URL = prevUrl;
    if (prevCred === undefined) delete process.env.FIREBASE_CREDENTIALS; else process.env.FIREBASE_CREDENTIALS = prevCred;
  }
});
