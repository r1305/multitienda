const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const secretBox = require('./secretBox');

const MP_GATEWAY = 'MERCADOPAGO';
const MP_TITLE = 'Mercado Pago';
const MP_KEYS = ['access_token', 'public_key', 'webhook_secret'];
const MP_REQUIRED_TO_ACTIVATE = ['access_token', 'public_key'];
const MAX_SECRET_LENGTH = 512;

function normalizeName(name) {
  return typeof name === 'string' ? name.trim().toUpperCase() : '';
}

function isReservedGatewayName(name) {
  return normalizeName(name) === MP_GATEWAY;
}

async function findGateway(name, transaction) {
  const rows = await sequelize.query(
    'SELECT id, name, title, is_active FROM payment_gateways WHERE UPPER(TRIM(name)) = ? ORDER BY id LIMIT 1',
    { replacements: [normalizeName(name)], type: QueryTypes.SELECT, transaction }
  );
  return rows[0] || null;
}

async function findGatewayById(id, transaction) {
  const rows = await sequelize.query(
    'SELECT id, name, title, is_active FROM payment_gateways WHERE id = ? LIMIT 1',
    { replacements: [id], type: QueryTypes.SELECT, transaction }
  );
  return rows[0] || null;
}

async function ensureGateway(name, title, transaction) {
  const existing = await findGateway(name, transaction);
  if (existing) return existing;
  await sequelize.query(
    'INSERT INTO payment_gateways (name, title, is_active, created_at, updated_at) VALUES (?, ?, 0, NOW(), NOW())',
    { replacements: [normalizeName(name), title || null], transaction }
  );
  return findGateway(name, transaction);
}

async function loadEncrypted(gatewayId, transaction) {
  return sequelize.query(
    'SELECT `key`, value_encrypted, updated_at FROM payment_gateway_secrets WHERE gateway_id = ?',
    { replacements: [gatewayId], type: QueryTypes.SELECT, transaction }
  );
}

async function loadSecrets(gatewayId, transaction) {
  const rows = await loadEncrypted(gatewayId, transaction);
  const out = {};
  for (const row of rows) out[row.key] = secretBox.decrypt(row.value_encrypted);
  return out;
}

function hint(value) {
  if (!value) return null;
  return `••••${String(value).slice(-4)}`;
}

async function describeSecrets(gatewayId, keys = MP_KEYS) {
  const rows = gatewayId ? await loadEncrypted(gatewayId) : [];
  const byKey = {};
  rows.forEach((r) => { byKey[r.key] = r; });
  const keyOk = secretBox.isConfigured();
  const fields = {};
  for (const k of keys) {
    const row = byKey[k];
    if (!row) { fields[k] = { saved: false, hint: null, updated_at: null }; continue; }
    let h = 'guardado';
    if (keyOk) {
      try { h = hint(secretBox.decrypt(row.value_encrypted)); } catch (_) { h = 'no se puede leer'; }
    }
    fields[k] = { saved: true, hint: h, updated_at: row.updated_at };
  }
  return { encryptionReady: keyOk, fields };
}

function cleanSecretInput(values, keys = MP_KEYS) {
  const out = {};
  for (const k of keys) {
    const v = values && typeof values[k] === 'string' ? values[k].trim() : '';
    if (!v) continue;
    if (v.length > MAX_SECRET_LENGTH || /\s/.test(v)) {
      const err = new Error(`El valor de ${k} no es válido`);
      err.code = 'INVALID_SECRET';
      throw err;
    }
    out[k] = v;
  }
  return out;
}

async function saveSecrets(gatewayId, values, transaction) {
  const entries = Object.entries(values || {});
  const encrypted = entries.map(([k, v]) => [k, secretBox.encrypt(v)]);
  for (const [k, enc] of encrypted) {
    await sequelize.query(
      'INSERT INTO payment_gateway_secrets (gateway_id, `key`, value_encrypted, updated_at) VALUES (?, ?, ?, NOW()) '
      + 'ON DUPLICATE KEY UPDATE value_encrypted = VALUES(value_encrypted), updated_at = NOW()',
      { replacements: [gatewayId, k, enc], transaction }
    );
  }
  return encrypted.length;
}

async function savedKeys(gatewayId, transaction) {
  const rows = await loadEncrypted(gatewayId, transaction);
  return rows.map((r) => r.key);
}

async function canActivate(gatewayId, transaction) {
  const keys = await savedKeys(gatewayId, transaction);
  return MP_REQUIRED_TO_ACTIVATE.every((k) => keys.includes(k));
}

module.exports = {
  MP_GATEWAY,
  MP_TITLE,
  MP_KEYS,
  MP_REQUIRED_TO_ACTIVATE,
  normalizeName,
  isReservedGatewayName,
  findGateway,
  findGatewayById,
  ensureGateway,
  loadSecrets,
  describeSecrets,
  cleanSecretInput,
  saveSecrets,
  canActivate,
  hint,
};
