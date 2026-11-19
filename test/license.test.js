const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('path');

const store = { rows: [] };
const modelsFile = require.resolve(path.join(__dirname, '..', 'src/models'));
require.cache[modelsFile] = {
  id: modelsFile,
  filename: modelsFile,
  loaded: true,
  exports: {
    Setting: {
      findOne: async ({ where }) => {
        const row = store.rows.find((r) => r.key === where.key);
        return row ? { ...row, update: async (v) => Object.assign(row, v) } : null;
      },
      create: async (r) => { store.rows.push({ ...r }); },
    },
  },
};

const license = require('../src/helpers/license');
const { licenseMiddleware } = require('../src/middleware/license');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const otherKey = crypto.generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const DAY = 86400000;
const NOW = Date.parse('2026-06-01T12:00:00Z');
const DOMAIN = 'tienda.example.com';

function sign(payload, key = privateKey) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.sign(null, Buffer.from(body, 'ascii'), key).toString('base64url')}`;
}
const payload = (over = {}) => ({
  domain: DOMAIN, status: 'active', exp: new Date(NOW + 30 * DAY).toISOString(), iss: 'test', ...over,
});

function resetEnv() {
  for (const k of Object.keys(process.env)) if (k.startsWith('LICENSE_')) delete process.env[k];
  delete process.env.APP_URL;
  store.rows = [];
  license._reset();
}

test('verifyToken: token valido', () => {
  const v = license.verifyToken(sign(payload()), PEM, NOW, DOMAIN);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.reason, null);
  assert.strictEqual(v.payload.domain, DOMAIN);
});

test('verifyToken: exp en epoch segundos', () => {
  const v = license.verifyToken(sign(payload({ exp: Math.floor((NOW + DAY) / 1000) })), PEM, NOW, DOMAIN);
  assert.strictEqual(v.ok, true);
});

test('verifyToken: firma alterada o clave distinta', () => {
  const tok = sign(payload());
  const [body, sig] = tok.split('.');
  const tampered = Buffer.from(JSON.stringify(payload({ exp: new Date(NOW + 999 * DAY).toISOString() }))).toString('base64url');
  assert.strictEqual(license.verifyToken(`${tampered}.${sig}`, PEM, NOW, DOMAIN).reason, 'bad_signature');
  assert.strictEqual(license.verifyToken(sign(payload(), otherKey.privateKey), PEM, NOW, DOMAIN).reason, 'bad_signature');
  assert.ok(body);
});

test('verifyToken: dominio distinto (ignora puerto y mayusculas)', () => {
  assert.strictEqual(license.verifyToken(sign(payload({ domain: 'otra.com' })), PEM, NOW, DOMAIN).reason, 'domain_mismatch');
  assert.strictEqual(license.verifyToken(sign(payload()), PEM, NOW, 'TIENDA.example.com:3000').ok, true);
});

test('verifyToken: expirado y suspendido conservan payload', () => {
  const exp = license.verifyToken(sign(payload({ exp: new Date(NOW - DAY).toISOString() })), PEM, NOW, DOMAIN);
  assert.strictEqual(exp.reason, 'expired');
  assert.ok(exp.payload);
  const sus = license.verifyToken(sign(payload({ status: 'suspended' })), PEM, NOW, DOMAIN);
  assert.strictEqual(sus.reason, 'suspended');
  assert.strictEqual(sus.ok, false);
});

test('verifyToken: formato malformado', () => {
  for (const t of [undefined, null, '', 'abc', 'a.b.c', '.', 'xxx.yyy', `${Buffer.from('[1]').toString('base64url')}.AAAA`,
    sign({ domain: DOMAIN, status: 'weird', exp: NOW })]) {
    assert.strictEqual(license.verifyToken(t, PEM, NOW, DOMAIN).reason, 'bad_format', String(t));
  }
});

async function stateWith(tok, nowOffsetDays = 0) {
  resetEnv();
  process.env.LICENSE_PUBLIC_KEY = PEM;
  store.rows.push({ key: license.TOKEN_KEY, value: tok });
  process.env.LICENSE_DOMAIN = DOMAIN;
  const realNow = Date.now;
  Date.now = () => NOW + nowOffsetDays * DAY;
  try { return await license.getLicenseState(); } finally { Date.now = realNow; }
}

test('estado: activo -> ok', async () => {
  assert.strictEqual((await stateWith(sign(payload()))).mode, 'ok');
});

test('estado: expirado dentro de gracia -> grace, fuera -> readonly', async () => {
  const tok = sign(payload({ exp: new Date(NOW - 2 * DAY).toISOString() }));
  assert.strictEqual((await stateWith(tok)).mode, 'grace');
  assert.strictEqual((await stateWith(tok, 10)).mode, 'readonly');
});

test('estado: LICENSE_GRACE_DAYS configurable', async () => {
  const tok = sign(payload({ exp: new Date(NOW - 2 * DAY).toISOString() }));
  resetEnv();
  process.env.LICENSE_PUBLIC_KEY = PEM;
  process.env.LICENSE_DOMAIN = DOMAIN;
  process.env.LICENSE_GRACE_DAYS = '1';
  store.rows.push({ key: license.TOKEN_KEY, value: tok });
  const realNow = Date.now;
  Date.now = () => NOW;
  try { assert.strictEqual((await license.getLicenseState()).mode, 'readonly'); } finally { Date.now = realNow; }
});

test('estado: suspendido sin suspended_at -> readonly; con suspended_at reciente -> grace', async () => {
  assert.strictEqual((await stateWith(sign(payload({ status: 'suspended' })))).mode, 'readonly');
  const recent = sign(payload({ status: 'suspended', suspended_at: new Date(NOW - DAY).toISOString() }));
  assert.strictEqual((await stateWith(recent)).mode, 'grace');
  assert.strictEqual((await stateWith(recent, 30)).mode, 'readonly');
});

test('estado: token invalido o ausente -> readonly', async () => {
  assert.strictEqual((await stateWith('basura')).mode, 'readonly');
  assert.strictEqual((await stateWith(sign(payload({ domain: 'otra.com' })))).reason, 'domain_mismatch');
  assert.strictEqual((await stateWith(null)).reason, 'no_token');
});

test('estado: sin clave publica, con y sin LICENSE_ENFORCE', async () => {
  resetEnv();
  assert.strictEqual((await license.getLicenseState()).mode, 'ok');
  resetEnv();
  process.env.LICENSE_ENFORCE = 'true';
  const realErr = console.error;
  console.error = () => {};
  try {
    const s = await license.getLicenseState();
    assert.strictEqual(s.mode, 'readonly');
    assert.strictEqual(s.reason, 'no_public_key');
  } finally { console.error = realErr; }
});

test('refreshLicense: guarda token valido; red caida conserva el anterior', async () => {
  resetEnv();
  process.env.LICENSE_PUBLIC_KEY = PEM;
  process.env.LICENSE_DOMAIN = DOMAIN;
  process.env.LICENSE_KEY = 'k';
  process.env.LICENSE_SERVER_URL = 'https://lic.example.com/validate';
  const good = sign(payload());
  const realFetch = global.fetch;
  const realWarn = console.warn;
  const realNow = Date.now;
  console.warn = () => {};
  Date.now = () => NOW;
  let calls = 0;
  global.fetch = async (url, opts) => {
    calls += 1;
    assert.strictEqual(JSON.parse(opts.body).domain, DOMAIN);
    return { ok: true, json: async () => ({ token: good }) };
  };
  try {
    assert.strictEqual((await license.getLicenseState()).mode, 'ok');
    assert.strictEqual(store.rows.find((r) => r.key === license.TOKEN_KEY).value, good);
    assert.strictEqual(calls, 1);
    await license.getLicenseState();
    assert.strictEqual(calls, 1, 'la cache evita pedir de nuevo');

    global.fetch = async () => { throw new Error('ECONNREFUSED'); };
    assert.deepStrictEqual(await license.refreshLicense(), { ok: false, reason: 'refresh_failed' });
    assert.strictEqual((await license.getLicenseState()).mode, 'ok');

    global.fetch = async () => ({ ok: true, json: async () => ({ token: sign(payload(), otherKey.privateKey) }) });
    assert.strictEqual((await license.refreshLicense()).ok, false);
    assert.strictEqual(store.rows.find((r) => r.key === license.TOKEN_KEY).value, good);
  } finally {
    global.fetch = realFetch;
    console.warn = realWarn;
    Date.now = realNow;
  }
});

test('refreshLicense: una sola peticion en vuelo', async () => {
  resetEnv();
  process.env.LICENSE_PUBLIC_KEY = PEM;
  process.env.LICENSE_DOMAIN = DOMAIN;
  process.env.LICENSE_KEY = 'k';
  process.env.LICENSE_SERVER_URL = 'https://lic.example.com/validate';
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    await new Promise((r) => setImmediate(r));
    return { ok: true, json: async () => ({ token: sign(payload()) }) };
  };
  try {
    await Promise.all([license.refreshLicense(), license.refreshLicense(), license.getLicenseState()]);
    assert.strictEqual(calls, 1);
  } finally { global.fetch = realFetch; }
});

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: null, locals: {}, redirected: null,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    type() { return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
    redirect(u) { this.redirected = u; return this; },
  };
}

async function run(method, reqPath, tok, over = {}) {
  resetEnv();
  process.env.LICENSE_PUBLIC_KEY = PEM;
  process.env.LICENSE_DOMAIN = DOMAIN;
  if (tok) store.rows.push({ key: license.TOKEN_KEY, value: tok });
  const res = fakeRes();
  let nexted = false;
  await licenseMiddleware({ method, path: reqPath, hostname: DOMAIN, ...over }, res, () => { nexted = true; });
  return { res, nexted };
}

const expired = () => sign(payload({ exp: new Date(NOW - 60 * DAY).toISOString() }));

test('middleware: readonly bloquea POST en /api con 402 JSON', async () => {
  const { res, nexted } = await run('POST', '/api/orders', expired());
  assert.strictEqual(nexted, false);
  assert.strictEqual(res.statusCode, 402);
  assert.strictEqual(res.body.code, 'LICENSE_READONLY');
});

test('middleware: readonly deja pasar GET', async () => {
  const { nexted, res } = await run('GET', '/api/orders', expired());
  assert.strictEqual(nexted, true);
  assert.strictEqual(res.locals.licenseState.mode, 'readonly');
});

test('middleware: readonly en admin redirige con aviso; sin flash responde 402 texto', async () => {
  const flashes = [];
  const a = await run('POST', '/admin/products', expired(), { flash: (...a) => flashes.push(a), get: () => null });
  assert.strictEqual(a.nexted, false);
  assert.strictEqual(a.res.redirected, '/admin');
  assert.strictEqual(flashes[0][0], 'error');
  const b = await run('DELETE', '/admin/products/1', expired());
  assert.strictEqual(b.res.statusCode, 402);
});

test('middleware: login, logout y webhook siguen abiertos en readonly', async () => {
  for (const p of ['/auth/login', '/auth/logout', '/api/login', '/api/store-owner/login', '/public/api/login', '/api/mp/webhook']) {
    assert.strictEqual((await run('POST', p, expired())).nexted, true, p);
  }
});

test('middleware: grace y ok no bloquean; grace anade cabecera', async () => {
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    const g = await run('POST', '/api/orders', sign(payload({ exp: new Date(NOW - DAY).toISOString() })));
    assert.strictEqual(g.nexted, true);
    assert.strictEqual(g.res.headers['X-License-Status'], 'grace');
    assert.strictEqual(g.res.locals.licenseState.mode, 'grace');
    const ok = await run('POST', '/api/orders', sign(payload()));
    assert.strictEqual(ok.nexted, true);
    assert.strictEqual(ok.res.headers['X-License-Status'], undefined);
  } finally { Date.now = realNow; }
});
