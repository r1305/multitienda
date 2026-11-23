const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

process.env.JWT_SECRET = 'test-secret';
const KEY = 'OD-11-22-AB12-XYZ12';

const state = {
  nextId: 5,
  assigned: 9, // repartidor asignado (accept_deliveries)
  roles: ['Customer'],
  user: { id: 5, is_active: 1 },
  chatSelect: 0,
  push: [],
  saved: [],
  pushThrows: false,
  accepted: null,
};

const sequelize = {
  async transaction(fn) {
    const hooks = [];
    const t = { LOCK: { UPDATE: 'UPDATE' }, afterCommit: (h) => hooks.push(h) };
    const out = await fn(t);
    hooks.forEach((h) => h());
    return out;
  },
  async query(sql, opts = {}) {
    const select = opts.type === 'SELECT';
    if (/^INSERT INTO chats/.test(sql)) return [state.nextId, 1];
    if (/^SELECT \* FROM chats WHERE id/.test(sql)) {
      state.chatSelect++;
      return [{ id: opts.replacements[0], order_id: 7, sender_id: 5, message: 'hola', created_at: new Date('2026-11-22T15:00:00Z') }];
    }
    if (/FROM accept_deliveries WHERE order_id/.test(sql)) {
      const rows = state.assigned ? [{ user_id: state.assigned }] : [];
      return select ? rows : [rows, rows.length];
    }
    if (/FROM model_has_roles mr JOIN roles r/.test(sql)) return state.roles.map((name) => ({ name }));
    if (/INNER JOIN model_has_roles mr ON mr.model_id = u.id/.test(sql)) return [[{ id: opts.replacements[0] }]];
    if (/FROM orders WHERE id = \? LIMIT 1 FOR UPDATE/.test(sql)) return [[{ id: 7, unique_order_id: KEY, orderstatus_id: 3 }]];
    if (/^SELECT unique_order_id/.test(sql)) return [{ unique_order_id: KEY }];
    if (/^UPDATE orders/.test(sql)) return [undefined, 1];
    return [[], 0];
  },
};

stub('src/models', {
  sequelize,
  User: { async findByPk() { return state.user; } },
  Order: { async findByPk(id) { return { id, user_id: 5, unique_order_id: KEY, orderstatus_id: 3 }; } },
  AcceptDelivery: {
    async findOne() { return null; },
    async create(d) { state.accepted = d; return d; },
  },
});
stub('src/helpers/notifications', {
  async notifyDeliveryOrderAssigned() { return { ok: true }; },
  async notifyCustomerDeliveryAccepted() {},
});
stub('src/helpers/notifications.impl', {
  getFirebaseApp: () => null,
  async saveNotification(...a) { state.saved.push(a); },
  async sendPushNotification(...a) {
    if (state.pushThrows) throw new Error('fcm down');
    state.push.push(a);
    return { ok: true };
  },
});

const orderRealtime = require('../src/helpers/orderRealtime');
const chatRealtime = require('../src/helpers/chatRealtime');
const misc = require('../src/controllers/miscControllers');
const admin = require('../src/admin/controllers/adminController');
const { jwtAuth } = require('../src/middleware/auth');

const tick = () => new Promise((r) => setImmediate(r));

function fakeDb({ fail } = {}) {
  const calls = [];
  const op = (kind, p) => (v) => {
    calls.push({ kind, path: p, value: v });
    if (fail === 'sync') throw new Error('rtdb sync');
    return fail ? Promise.reject(new Error('rtdb down')) : Promise.resolve();
  };
  return {
    calls,
    chat() { return calls.filter((c) => /^chats?/.test(c.path)); },
    ref(p) { return { set: op('set', p), update: op('update', p), remove: op('remove', p) }; },
  };
}

function reset() {
  state.nextId = 5; state.assigned = 9; state.roles = ['Customer']; state.user = { id: 5, is_active: 1 };
  state.chatSelect = 0; state.push = []; state.saved = []; state.pushThrows = false; state.accepted = null;
  orderRealtime._setDb(undefined);
  chatRealtime._setSigner((uid, claims) => `tok:${uid}:${claims.role}`);
}

function fakeRes() {
  return {
    statusCode: 200, body: undefined, redirected: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    redirect(u) { this.redirected = u; return this; },
  };
}

const sendReq = (userId, body = { order_id: 7, message: ' hola ' }) => ({ user: { id: userId }, body });

// ── (a) espejo de mensaje ─────────────────────────────────────────────────────
test('sendChatMessage espeja una vez en chats/{key}/messages/{id} con los campos de la API', async () => {
  reset();
  const db = fakeDb();
  orderRealtime._setDb(db);
  const res = fakeRes();
  await misc.sendChatMessage(sendReq(5), res);
  await tick();
  assert.strictEqual(res.body.success, true);
  const writes = db.chat();
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].kind, 'set');
  assert.strictEqual(writes[0].path, `chats/${KEY}/messages/5`);
  assert.deepStrictEqual(Object.keys(writes[0].value).sort(), ['created_at', 'id', 'message', 'order_id', 'sender_id']);
  assert.strictEqual(writes[0].value.created_at, '2026-11-22T15:00:00.000Z');
});

test('un fallo de RTDB (async o síncrono) no rompe el envío del mensaje', async () => {
  for (const fail of [true, 'sync']) {
    reset();
    const db = fakeDb({ fail });
    orderRealtime._setDb(db);
    const res = fakeRes();
    await misc.sendChatMessage(sendReq(5), res);
    await tick();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(db.chat().length, 1);
  }
});

test('con transacción el espejo se escribe solo tras el commit; sin RTDB no consulta SQL', async () => {
  reset();
  const db = fakeDb();
  orderRealtime._setDb(db);
  const hooks = [];
  chatRealtime.publishChatMessage(KEY, 5, { afterCommit: (h) => hooks.push(h) });
  await tick();
  assert.strictEqual(db.chat().length, 0);
  hooks[0]();
  await tick();
  assert.strictEqual(db.chat().length, 1);

  reset();
  orderRealtime._setDb(null);
  chatRealtime.publishChatMessage(KEY, 5);
  await tick();
  assert.strictEqual(state.chatSelect, 0);
});

// ── (b) acceso ────────────────────────────────────────────────────────────────
test('cliente: grantCustomerAccess escribe chatAccess/{key} con u_<id>', async () => {
  reset();
  const db = fakeDb();
  orderRealtime._setDb(db);
  chatRealtime.grantCustomerAccess({ unique_order_id: KEY }, 5);
  await tick();
  assert.deepStrictEqual(db.calls, [{ kind: 'update', path: `chatAccess/${KEY}`, value: { u_5: true } }]);
});

test('aceptar pedido (repartidor) escribe chatAccess d_<id>', async () => {
  reset();
  const db = fakeDb();
  orderRealtime._setDb(db);
  const res = fakeRes();
  await misc.acceptToDeliver({ user: { id: 9 }, body: { order_id: 7 } }, res);
  await tick();
  assert.strictEqual(res.body.success, true);
  const access = db.calls.filter((c) => c.path.startsWith('chatAccess/'));
  assert.deepStrictEqual(access, [{ kind: 'update', path: `chatAccess/${KEY}`, value: { d_9: true } }]);
});

test('reasignar repartidor da acceso al nuevo y elimina el anterior, tras el commit', async () => {
  reset();
  const db = fakeDb();
  orderRealtime._setDb(db);
  state.assigned = 9;
  const res = fakeRes();
  await admin.reassignDelivery({ body: { order_id: 7, user_id: 11 }, flash() {} }, res);
  await tick();
  const access = db.calls.filter((c) => c.path.startsWith('chatAccess/'));
  assert.strictEqual(access.length, 1);
  assert.deepStrictEqual(access[0].value, { d_9: null, d_11: true });
});

test('reasignar al mismo repartidor no lo elimina; sin anterior solo agrega', async () => {
  reset();
  const db = fakeDb();
  orderRealtime._setDb(db);
  state.assigned = 11;
  await admin.reassignDelivery({ body: { order_id: 7, user_id: 11 }, flash() {} }, fakeRes());
  await tick();
  assert.deepStrictEqual(db.calls.filter((c) => c.path.startsWith('chatAccess/')).map((c) => c.value), [{ d_11: true }]);

  const db2 = fakeDb();
  orderRealtime._setDb(db2);
  chatRealtime.assignDeliveryAccess({ unique_order_id: KEY }, 11, null);
  await tick();
  assert.deepStrictEqual(db2.calls.map((c) => c.value), [{ d_11: true }]);
});

test('claves o uids no seguros no se escriben', async () => {
  reset();
  const db = fakeDb();
  orderRealtime._setDb(db);
  chatRealtime.updateChatAccess('a/b.c', { add: ['u_1'] });
  chatRealtime.updateChatAccess(KEY, { add: ['x/..'], remove: ['u_1/x'] });
  chatRealtime.assignDeliveryAccess({ unique_order_id: KEY }, 'abc', null);
  await tick();
  assert.strictEqual(db.calls.length, 0);
});

// ── (c) token ─────────────────────────────────────────────────────────────────
test('POST /conversation/realtime-token está protegida con jwtAuth', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/routes/api.js'), 'utf8');
  assert.match(src, /router\.post\('\/conversation\/realtime-token', auth, misc\.chatRealtimeToken\)/);
});

test('token: sin JWT responde 401; con JWT inválido o usuario inactivo no pasa', async () => {
  reset();
  let nexted = false;
  const res = fakeRes();
  await jwtAuth({ headers: {} }, res, () => { nexted = true; });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(nexted, false);

  const bad = fakeRes();
  await jwtAuth({ headers: { authorization: 'Bearer basura' } }, bad, () => { nexted = true; });
  assert.strictEqual(bad.statusCode, 401);

  state.user = { id: 5, is_active: 0 };
  const inactive = fakeRes();
  await jwtAuth({ headers: { authorization: 'Bearer ' + jwt.sign({ sub: 5 }, process.env.JWT_SECRET) } }, inactive, () => { nexted = true; });
  assert.strictEqual(inactive.statusCode, 403);
  assert.strictEqual(nexted, false);
});

test('token: JWT de cliente devuelve token y uid u_<id> sin datos extra', async () => {
  reset();
  orderRealtime._setDb(fakeDb());
  const req = { headers: { authorization: 'Bearer ' + jwt.sign({ sub: 5 }, process.env.JWT_SECRET) }, body: {} };
  let nexted = false;
  await jwtAuth(req, fakeRes(), () => { nexted = true; });
  assert.strictEqual(nexted, true);
  const res = fakeRes();
  await misc.chatRealtimeToken(req, res);
  assert.deepStrictEqual(res.body, { success: true, token: 'tok:u_5:customer', uid: 'u_5' });
});

test('token: repartidor recibe d_<id>; sin rol Delivery Guy es 403', async () => {
  reset();
  orderRealtime._setDb(fakeDb());
  state.roles = ['Delivery Guy'];
  const ok = fakeRes();
  await misc.chatRealtimeToken({ user: { id: 9 }, body: { role: 'delivery' } }, ok);
  assert.deepStrictEqual(ok.body, { success: true, token: 'tok:d_9:delivery', uid: 'd_9' });

  state.roles = ['Customer'];
  const denied = fakeRes();
  await misc.chatRealtimeToken({ user: { id: 5 }, body: { role: 'delivery' } }, denied);
  assert.strictEqual(denied.statusCode, 403);
  assert.strictEqual(denied.body.token, undefined);
});

test('token: sin RTDB configurado responde 503', async () => {
  reset();
  orderRealtime._setDb(null);
  const res = fakeRes();
  await misc.chatRealtimeToken({ user: { id: 5 }, body: {} }, res);
  assert.strictEqual(res.statusCode, 503);
});

// ── (d) push por mensaje ──────────────────────────────────────────────────────
test('push: el cliente escribe y el push va al repartidor, no al emisor', async () => {
  reset();
  const res = fakeRes();
  await misc.sendChatMessage(sendReq(5), res);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(state.push.length, 1);
  const [title, message, userId, role, data] = state.push[0];
  assert.strictEqual(userId, 9);
  assert.strictEqual(role, null);
  assert.match(title, /mensaje/i);
  assert.strictEqual(message, 'hola');
  assert.strictEqual(data.type, 'chat');
  assert.strictEqual(data.recipient_role, 'delivery');
  assert.strictEqual(data.unique_order_id, KEY);
  assert.strictEqual(state.saved[0][0], 9);
});

test('push: el repartidor escribe y el push va al cliente, no al emisor', async () => {
  reset();
  const res = fakeRes();
  await misc.sendChatMessage(sendReq(9), res);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(state.push.length, 1);
  assert.strictEqual(state.push[0][2], 5);
  assert.strictEqual(state.push[0][4].recipient_role, 'customer');
});

test('push: sin repartidor asignado no hay destinatario; un tercero recibe 403', async () => {
  reset();
  state.assigned = null;
  const res = fakeRes();
  await misc.sendChatMessage(sendReq(5), res);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(state.push.length, 0);

  const other = fakeRes();
  await misc.sendChatMessage(sendReq(77), other);
  assert.strictEqual(other.statusCode, 403);
  assert.strictEqual(state.push.length, 0);
});

test('push: si FCM falla el mensaje ya guardado responde success', async () => {
  reset();
  state.pushThrows = true;
  const res = fakeRes();
  await misc.sendChatMessage(sendReq(5), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
});

// ── (e) reglas ────────────────────────────────────────────────────────────────
test('database.rules.json: chats solo legibles con chatAccess; sin lectura global', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');
  const { rules } = JSON.parse(raw);
  assert.strictEqual(rules['.read'], false);
  assert.strictEqual(rules['.write'], false);
  assert.deepStrictEqual(rules.orders.$orderId, { '.read': true, '.write': false });
  assert.deepStrictEqual(rules.chatAccess, { '.read': false, '.write': false });
  assert.strictEqual(rules.chats['.read'], undefined);
  assert.strictEqual(rules.chats.$orderKey['.read'], undefined);
  const msgs = rules.chats.$orderKey.messages;
  assert.strictEqual(msgs['.write'], false);
  assert.strictEqual(
    msgs['.read'],
    "auth != null && root.child('chatAccess/' + $orderKey + '/' + auth.uid).val() === true"
  );
  const reads = raw.match(/"\.read": true/g) || [];
  assert.strictEqual(reads.length, 1);
});
