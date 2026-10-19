const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const crypto = require('crypto');

delete process.env.MP_ENCRYPTION_KEY;

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const db = { gateways: [], secrets: [], nextId: 1 };

function runQuery(sql, opts = {}) {
  const r = opts.replacements || [];
  if (/FROM payment_gateways WHERE UPPER\(TRIM\(name\)\) = \?/.test(sql)) {
    return db.gateways.filter((g) => g.name.trim().toUpperCase() === r[0]).slice(0, 1);
  }
  if (/FROM payment_gateways WHERE id = \?/.test(sql)) return db.gateways.filter((g) => g.id === Number(r[0]));
  if (/^INSERT INTO payment_gateways/.test(sql)) {
    db.gateways.push({ id: db.nextId++, name: r[0], title: r[1], is_active: 0 });
    return [undefined, 1];
  }
  if (/FROM payment_gateway_secrets WHERE gateway_id/.test(sql)) return db.secrets.filter((s) => s.gateway_id === r[0]);
  if (/^INSERT INTO payment_gateway_secrets/.test(sql)) {
    const found = db.secrets.find((s) => s.gateway_id === r[0] && s.key === r[1]);
    if (found) found.value_encrypted = r[2];
    else db.secrets.push({ gateway_id: r[0], key: r[1], value_encrypted: r[2], updated_at: new Date() });
    return [undefined, 1];
  }
  if (/^UPDATE payment_gateways SET is_active = \?/.test(sql)) {
    const g = db.gateways.find((x) => x.id === r[1]);
    if (g) g.is_active = r[0];
    return [undefined, 1];
  }
  if (/^UPDATE payment_gateways SET is_active = NOT is_active/.test(sql)) {
    const g = db.gateways.find((x) => x.id === Number(r[0]));
    if (g) g.is_active = g.is_active ? 0 : 1;
    return [undefined, 1];
  }
  if (/^SELECT \* FROM payment_gateways/.test(sql)) return [db.gateways.map((g) => ({ ...g }))];
  return [[], 0];
}

const sequelize = {
  async query(sql, opts = {}) { return runQuery(sql, opts); },
  async transaction(fn) {
    const snapshot = JSON.stringify(db);
    const t = { LOCK: { UPDATE: 'UPDATE' } };
    try { return await fn(t); } catch (err) { Object.assign(db, JSON.parse(snapshot)); throw err; }
  },
};

stub('src/models', { sequelize });

const admin = require('../src/admin/controllers/adminController');

function fakeReqRes(body = {}, params = {}) {
  const flashes = {};
  const req = {
    body,
    params,
    session: { user: { id: 1 } },
    flash(type, msg) {
      if (msg === undefined) { const v = flashes[type] || []; delete flashes[type]; return v; }
      (flashes[type] = flashes[type] || []).push(msg);
      return undefined;
    },
  };
  const res = {
    statusCode: 200,
    rendered: null,
    redirected: null,
    status(c) { this.statusCode = c; return this; },
    render(view, locals) { this.rendered = { view, locals }; return this; },
    redirect(url) { this.redirected = url; return this; },
  };
  return { req, res, flashes };
}

test('guardar credenciales sin MP_ENCRYPTION_KEY responde 500 con mensaje y no guarda nada', async () => {
  const { req, res } = fakeReqRes({ access_token: 'TEST-token-1111', public_key: 'TEST-pk-2222' });
  await admin.saveMercadoPago(req, res);
  assert.strictEqual(res.statusCode, 500);
  assert.match(res.rendered.locals.error, /MP_ENCRYPTION_KEY/);
  assert.strictEqual(db.secrets.length, 0);
});

test('no se activa Mercado Pago sin token y public key; se guardan cifrados y la vista solo ve los últimos 4', async () => {
  process.env.MP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

  let ctx = fakeReqRes({ access_token: 'TEST-token-1111', is_active: '1' });
  await admin.saveMercadoPago(ctx.req, ctx.res);
  assert.match(ctx.flashes.error[0], /Access Token y la Public Key/);
  assert.strictEqual(db.secrets.length, 0);
  const gw = db.gateways.find((g) => g.name === 'MERCADOPAGO');
  assert.ok(!gw || !gw.is_active);

  ctx = fakeReqRes({ access_token: 'TEST-token-1111', public_key: 'TEST-pk-2222', webhook_secret: 'whsec-3333', is_active: '1' });
  await admin.saveMercadoPago(ctx.req, ctx.res);
  assert.strictEqual(ctx.res.redirected, '/admin/payment-methods');
  const saved = db.gateways.find((g) => g.name === 'MERCADOPAGO');
  assert.strictEqual(saved.is_active, 1);
  assert.strictEqual(db.secrets.length, 3);
  for (const s of db.secrets) {
    assert.ok(s.value_encrypted.startsWith('v1:'));
    assert.ok(!/TEST-|whsec/.test(s.value_encrypted));
  }

  ctx = fakeReqRes();
  await admin.paymentMethods(ctx.req, ctx.res);
  const locals = ctx.res.rendered.locals;
  assert.ok(!locals.gateways.some((g) => g.name === 'MERCADOPAGO'));
  assert.strictEqual(locals.mercadopago.fields.access_token.hint, '••••1111');
  assert.ok(!JSON.stringify(locals).includes('TEST-token-1111'));

  ctx = fakeReqRes({ public_key: 'TEST-pk-9999', is_active: '1' });
  await admin.saveMercadoPago(ctx.req, ctx.res);
  ctx = fakeReqRes();
  await admin.paymentMethods(ctx.req, ctx.res);
  assert.strictEqual(ctx.res.rendered.locals.mercadopago.fields.access_token.hint, '••••1111');
  assert.strictEqual(ctx.res.rendered.locals.mercadopago.fields.public_key.hint, '••••9999');
});

test('el toggle, la edición y el alta genéricos no pueden tocar Mercado Pago', async () => {
  const gw = db.gateways.find((g) => g.name === 'MERCADOPAGO');
  let ctx = fakeReqRes({}, { id: String(gw.id) });
  await admin.togglePaymentMethod(ctx.req, ctx.res);
  assert.strictEqual(gw.is_active, 1);
  assert.ok(ctx.flashes.error);

  ctx = fakeReqRes({ name: 'mercadopago' });
  await admin.createPaymentMethod(ctx.req, ctx.res);
  assert.strictEqual(db.gateways.filter((g) => g.name.toUpperCase() === 'MERCADOPAGO').length, 1);

  ctx = fakeReqRes({ id: String(gw.id), name: 'Otro' });
  await admin.updatePaymentMethod(ctx.req, ctx.res);
  assert.strictEqual(gw.name, 'MERCADOPAGO');

  ctx = fakeReqRes({}, { id: String(gw.id) });
  await admin.deletePaymentMethod(ctx.req, ctx.res);
  assert.ok(db.gateways.some((g) => g.id === gw.id));
});
