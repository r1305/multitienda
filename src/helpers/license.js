// Licencia verificada en el cliente. Nunca borra datos: en "readonly" solo se bloquean escrituras.
//
// Token: base64url(payload JSON) + "." + base64url(firma Ed25519 sobre los bytes ASCII del primer segmento).
// Payload: { domain, status: "active"|"suspended", exp (ISO o epoch s), iss, suspended_at? (ISO o epoch s) }.
//
// Sin LICENSE_PUBLIC_KEY: con LICENSE_ENFORCE=true la app queda en "readonly" (y se loguea el error);
// sin LICENSE_ENFORCE=true queda en "ok" (instalaciones sin licenciar, desarrollo).
// Con clave pública la licencia siempre se aplica, sea cual sea LICENSE_ENFORCE.
//
// Sin timers: el refresco es lazy, lo dispara getLicenseState() cuando vence el TTL y no hay uno en vuelo.
const crypto = require('node:crypto');

const DAY_MS = 86400000;
const RETRY_MS = 5 * 60 * 1000;
const TOKEN_KEY = 'license_token';

let token = null;
let loaded = false;
let loading = null;
let nextRefreshAt = 0;
let inflight = null;
let seenHost = null;
let warnedNoKey = false;
let keyCache = { pem: null, key: null };

const ttlMs = () => Number(process.env.LICENSE_CHECK_TTL_MS) || 12 * 60 * 60 * 1000;
const timeoutMs = () => Number(process.env.LICENSE_TIMEOUT_MS) || 8000;
const graceMs = () => {
  const d = process.env.LICENSE_GRACE_DAYS;
  const n = d === undefined || d === '' ? 7 : Number(d);
  return (Number.isFinite(n) && n >= 0 ? n : 7) * DAY_MS;
};
const publicKey = () => (process.env.LICENSE_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim();
const enforced = () => process.env.LICENSE_ENFORCE === 'true';

function normHost(h) {
  return String(h || '').toLowerCase().replace(/:\d+$/, '').trim();
}

function getDomain() {
  if (process.env.LICENSE_DOMAIN) return normHost(process.env.LICENSE_DOMAIN);
  if (process.env.APP_URL) {
    try { return normHost(new URL(process.env.APP_URL).hostname); } catch (_) { /* usa el host visto */ }
  }
  return seenHost;
}

function toMs(v) {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return toMs(Number(v));
  return Date.parse(v);
}

function getKeyObject(pem) {
  if (keyCache.pem !== pem) {
    let key = null;
    try { key = crypto.createPublicKey(pem); } catch (_) { /* clave inválida */ }
    keyCache = { pem, key };
  }
  return keyCache.key;
}

const fail = (reason, payload = null) => ({ ok: false, payload, reason });

// domain es opcional: sin él no se compara el dominio.
function verifyToken(tok, publicKeyPem, nowMs = Date.now(), domain) {
  if (typeof tok !== 'string') return fail('bad_format');
  const parts = tok.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return fail('bad_format');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch (_) { return fail('bad_format'); }
  if (!payload || typeof payload !== 'object' || typeof payload.domain !== 'string'
    || !['active', 'suspended'].includes(payload.status) || !Number.isFinite(toMs(payload.exp))) {
    return fail('bad_format');
  }
  const key = getKeyObject(publicKeyPem);
  let valid = false;
  try {
    valid = !!key && crypto.verify(null, Buffer.from(parts[0], 'ascii'), key, Buffer.from(parts[1], 'base64url'));
  } catch (_) { valid = false; }
  if (!valid) return fail('bad_signature');
  if (domain && normHost(payload.domain) !== normHost(domain)) return fail('domain_mismatch');
  if (payload.status === 'suspended') return fail('suspended', payload);
  if (toMs(payload.exp) <= nowMs) return fail('expired', payload);
  return { ok: true, payload, reason: null };
}

function computeMode(v, nowMs) {
  if (v.ok) return 'ok';
  if (v.reason !== 'expired' && v.reason !== 'suspended') return 'readonly';
  // La gracia corre desde exp; un token suspendido sin suspended_at no tiene gracia.
  const since = v.reason === 'expired' ? toMs(v.payload.exp) : toMs(v.payload.suspended_at);
  return Number.isFinite(since) && nowMs <= since + graceMs() ? 'grace' : 'readonly';
}

async function loadToken() {
  if (loaded) return;
  if (!loading) {
    loading = (async () => {
      try {
        const { Setting } = require('../models');
        const row = await Setting.findOne({ where: { key: TOKEN_KEY } });
        if (row && row.value && !token) token = row.value;
        loaded = true;
      } catch (e) {
        console.error('[license] no se pudo leer el token:', e.message);
      }
    })();
  }
  await loading;
  loading = null;
}

async function saveToken(tok) {
  token = tok;
  try {
    const { Setting } = require('../models');
    const row = await Setting.findOne({ where: { key: TOKEN_KEY } });
    if (row) await row.update({ value: tok });
    else await Setting.create({ key: TOKEN_KEY, value: tok });
  } catch (e) {
    console.error('[license] no se pudo guardar el token:', e.message);
  }
}

async function doRefresh() {
  const licenseKey = process.env.LICENSE_KEY;
  const url = process.env.LICENSE_SERVER_URL;
  const pem = publicKey();
  const domain = getDomain();
  if (!licenseKey || !url || !pem || !domain) {
    nextRefreshAt = Date.now() + ttlMs();
    return { ok: false, reason: 'not_configured' };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey, domain, app_version: require('../../package.json').version }),
      signal: AbortSignal.timeout(timeoutMs()),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const v = verifyToken(body && body.token, pem, Date.now(), domain);
    if (['bad_format', 'bad_signature', 'domain_mismatch'].includes(v.reason)) throw new Error(`token ${v.reason}`);
    await saveToken(body.token);
    nextRefreshAt = Date.now() + ttlMs();
    return { ok: true, reason: v.reason };
  } catch (e) {
    // Sin red o respuesta inválida: se conserva el último token válido hasta su exp.
    console.warn('[license] refresco fallido:', e.message);
    nextRefreshAt = Date.now() + Math.min(ttlMs(), RETRY_MS);
    return { ok: false, reason: 'refresh_failed' };
  }
}

function refreshLicense() {
  if (!inflight) inflight = doRefresh().catch(() => ({ ok: false, reason: 'refresh_failed' })).finally(() => { inflight = null; });
  return inflight;
}

async function getLicenseState(hostHint) {
  if (hostHint && !seenHost) seenHost = normHost(hostHint);
  const pem = publicKey();
  if (!pem) {
    if (!enforced()) return { mode: 'ok', reason: 'unenforced', payload: null };
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.error('[license] LICENSE_ENFORCE=true sin LICENSE_PUBLIC_KEY: modo solo lectura');
    }
    return { mode: 'readonly', reason: 'no_public_key', payload: null };
  }
  try {
    await loadToken();
    if (Date.now() >= nextRefreshAt) {
      const p = refreshLicense();
      // Sin ningún token no hay nada que usar: se espera el primer refresco; si no, corre en segundo plano.
      if (!token) await p;
    }
  } catch (_) { /* nunca romper el request */ }
  if (!token) return { mode: 'readonly', reason: 'no_token', payload: null };
  const now = Date.now();
  const v = verifyToken(token, pem, now, getDomain());
  return { mode: computeMode(v, now), reason: v.reason, payload: v.payload };
}

function _reset() {
  token = null; loaded = false; loading = null; nextRefreshAt = 0; inflight = null;
  seenHost = null; warnedNoKey = false; keyCache = { pem: null, key: null };
}

module.exports = { verifyToken, getLicenseState, refreshLicense, TOKEN_KEY, _reset };
