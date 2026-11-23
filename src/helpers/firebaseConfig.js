// Fuente única de la config de Firebase del servidor: primero la BD (tabla settings, editable en
// /admin/settings) y el entorno solo como respaldo si el valor de BD está vacío o no es válido.
// La credencial de servicio nunca sale de este módulo hacia el front ni a logs; la caché es solo
// en memoria del proceso (no Redis) y se invalida al guardar los ajustes.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const secretBox = require('./secretBox');

const KEY_URL = 'firebaseDatabaseURL';
const KEY_CRED = 'firebaseServiceAccount';
const TTL_MS = parseInt(process.env.CACHE_FIREBASE_CONFIG_TTL_MS || '300000', 10);

let snap = null;
let snapAt = 0;
let loading = null;
let gen = 0;

function isValidDatabaseUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return false;
    if (u.pathname !== '/' && u.pathname !== '') return false;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebaseio\.com|firebasedatabase\.app)$/.test(u.hostname);
  } catch (_) {
    return false;
  }
}

function toCredential(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  for (const k of ['project_id', 'client_email', 'private_key']) {
    if (typeof parsed[k] !== 'string' || !parsed[k].trim()) return null;
  }
  return parsed;
}

function parseCredential(raw) {
  try { return toCredential(JSON.parse(String(raw))); } catch (_) { return null; }
}

// Texto guardado en BD: JSON o, con MP_ENCRYPTION_KEY, "v1:iv:tag:cifrado".
function encodeCredential(credential) {
  const json = JSON.stringify(credential);
  return secretBox.isConfigured() ? secretBox.encrypt(json) : json;
}

function decodeCredential(stored) {
  const text = String(stored || '').trim();
  if (!text) return null;
  try {
    return parseCredential(text.startsWith('{') ? text : secretBox.decrypt(text));
  } catch (_) {
    return null;
  }
}

function describeStored(stored) {
  const text = String(stored || '').trim();
  if (!text) return { configured: false };
  const c = decodeCredential(text);
  if (!c) return { configured: true, readable: false };
  const id = String(c.private_key_id || '');
  return {
    configured: true,
    readable: true,
    encrypted: !text.startsWith('{'),
    projectId: c.project_id,
    clientEmail: c.client_email,
    hint: id ? `••••${id.slice(-4)}` : '',
  };
}

// Valida lo que llega del formulario de ajustes. Devuelve { error } o los valores listos para guardar:
// url (string, puede ser ''), credential (objeto) y clear (borrar la guardada).
function checkInput(body) {
  const out = { clear: false };
  const b = body || {};
  if (typeof b[KEY_URL] === 'string') {
    const v = b[KEY_URL].trim().replace(/\/+$/, '');
    if (v && !isValidDatabaseUrl(v)) {
      return { error: 'La URL de Realtime Database debe ser https y terminar en firebaseio.com o firebasedatabase.app' };
    }
    out.url = v;
  }
  const raw = typeof b[KEY_CRED] === 'string' ? b[KEY_CRED].trim() : '';
  if (raw) {
    const cred = parseCredential(raw);
    if (!cred) return { error: 'La credencial de servicio debe ser un JSON válido con project_id, client_email y private_key' };
    out.credential = cred;
  } else if (b.firebaseServiceAccountClear === '1' || b.firebaseServiceAccountClear === 'on') {
    out.clear = true;
  }
  return out;
}

function envCredential() {
  try {
    const v = String(process.env.FIREBASE_CREDENTIALS || '').trim();
    if (v.startsWith('{')) return parseCredential(v);
    const file = v || path.join(__dirname, '../../firebase-credentials.json');
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function fingerprintOf(url, credential) {
  return crypto.createHash('sha256').update(`${url}\0${credential ? JSON.stringify(credential) : ''}`).digest('hex').slice(0, 12);
}

async function load() {
  let dbUrl = '';
  let dbCred = null;
  let transient = false;
  try {
    const { QueryTypes } = require('sequelize');
    const { sequelize } = require('../models');
    const rows = await sequelize.query(
      'SELECT `key`, `value` FROM settings WHERE `key` IN (?, ?)',
      { replacements: [KEY_URL, KEY_CRED], type: QueryTypes.SELECT }
    );
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || typeof r !== 'object') continue;
      if (r.key === KEY_URL) dbUrl = String(r.value || '').trim();
      else if (r.key === KEY_CRED) dbCred = decodeCredential(r.value);
    }
  } catch (err) {
    transient = true;
    console.error('[firebaseConfig] no se pudo leer la BD:', err.message);
  }
  const databaseURL = (isValidDatabaseUrl(dbUrl) ? dbUrl : String(process.env.FIREBASE_DATABASE_URL || '').trim()).replace(/\/+$/, '');
  const credential = dbCred || envCredential();
  return { databaseURL, credential, fingerprint: fingerprintOf(databaseURL, credential), transient };
}

async function getConfig() {
  if (snap && Date.now() - snapAt < TTL_MS) return snap;
  if (!loading) {
    const g = gen;
    loading = load().then((c) => {
      if (g === gen && !c.transient) { snap = c; snapAt = Date.now(); }
      return c;
    }).finally(() => { if (g === gen) loading = null; });
  }
  return loading;
}

// Llamar tras guardar ajustes: la siguiente lectura vuelve a la BD y los consumidores reinician Firebase.
function invalidate() {
  gen += 1;
  snap = null;
  loading = null;
}

module.exports = {
  KEY_URL, KEY_CRED, isValidDatabaseUrl, parseCredential, encodeCredential, decodeCredential,
  describeStored, checkInput, getConfig, invalidate,
};
