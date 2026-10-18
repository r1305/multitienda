const crypto = require('crypto');
const { createLimiter } = require('./attemptLimiter');

const OTP_TTL_MS = 5 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_ID = 5;
const MAX_ATTEMPTS_PER_IP = 20;

// Intentos fallidos por identificador (email/teléfono) y por IP.
const idLimiter = createLimiter({ max: MAX_ATTEMPTS_PER_ID, windowMs: WINDOW_MS });
const ipLimiter = createLimiter({ max: MAX_ATTEMPTS_PER_IP, windowMs: WINDOW_MS });

function sameCode(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Evalúa un registro OTP: 'missing' | 'expired' | 'invalid' | 'ok'.
function evaluateOtp(record, given, now = Date.now()) {
  if (!record) return 'missing';
  const created = record.created_at ? new Date(record.created_at).getTime() : NaN;
  if (!Number.isFinite(created) || now - created > OTP_TTL_MS) return 'expired';
  if (given === undefined || given === null || given === '') return 'invalid';
  return sameCode(record.otp, given) ? 'ok' : 'invalid';
}

function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Emite un OTP nuevo y elimina los anteriores del mismo destinatario.
async function issueOtp(Model, where) {
  const otp = generateCode();
  await Model.destroy({ where });
  await Model.create({ ...where, otp });
  return otp;
}

// Verifica un OTP con límite de intentos por identificador e IP.
// consume=true destruye el OTP al validarlo; un OTP vencido o con demasiados fallos también se destruye.
// Resultado: 'ok' | 'missing' | 'expired' | 'invalid' | 'blocked'.
async function verifyOtp(Model, where, given, { identifier, ip, consume = false, now = Date.now() } = {}) {
  const idKey = `otp:${identifier || ''}`;
  const ipKey = `otp:ip:${ip || 'unknown'}`;
  if (idLimiter.isBlocked(idKey, now) || ipLimiter.isBlocked(ipKey, now)) return 'blocked';

  const record = await Model.findOne({ where, order: [['id', 'DESC']] });
  const status = evaluateOtp(record, given, now);

  if (status === 'ok') {
    idLimiter.reset(idKey);
    if (consume) await Model.destroy({ where });
    return 'ok';
  }
  if (status === 'expired') {
    await Model.destroy({ where });
    return 'expired';
  }
  if (status === 'invalid' || status === 'missing') {
    const idBlocked = idLimiter.fail(idKey, now);
    ipLimiter.fail(ipKey, now);
    if (idBlocked && record) await Model.destroy({ where });
  }
  return status;
}

module.exports = { OTP_TTL_MS, evaluateOtp, generateCode, issueOtp, verifyOtp, idLimiter, ipLimiter };
