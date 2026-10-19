const crypto = require('crypto');

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

class SecretBoxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

function getKey(rawKey) {
  const raw = rawKey !== undefined ? rawKey : process.env.MP_ENCRYPTION_KEY;
  if (!raw || !String(raw).trim()) {
    throw new SecretBoxError('Falta la variable de entorno MP_ENCRYPTION_KEY: no se pueden cifrar ni leer las credenciales');
  }
  const key = Buffer.from(String(raw).trim(), 'base64');
  if (key.length !== 32) {
    throw new SecretBoxError('MP_ENCRYPTION_KEY debe ser una clave de 32 bytes codificada en base64');
  }
  return key;
}

function isConfigured(rawKey) {
  try {
    getKey(rawKey);
    return true;
  } catch (_) {
    return false;
  }
}

function encrypt(plain, rawKey) {
  if (plain === undefined || plain === null) throw new SecretBoxError('Valor vacío');
  const key = getKey(rawKey);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

function decrypt(payload, rawKey) {
  const key = getKey(rawKey);
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SecretBoxError('Valor cifrado con formato inválido');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new SecretBoxError('Valor cifrado con formato inválido');
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (_) {
    throw new SecretBoxError('No se pudo descifrar la credencial (clave incorrecta o dato alterado)');
  }
}

module.exports = { encrypt, decrypt, getKey, isConfigured, SecretBoxError };
