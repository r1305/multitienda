const { getRedis } = require('../config/redis');

const RATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const memoryMap = new Map();

const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX = parseInt(process.env.OTP_RATE_LIMIT || '5', 10);
const otpMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpMap) {
    if (now - entry.start > OTP_WINDOW_MS) otpMap.delete(key);
  }
}, OTP_WINDOW_MS);

function evictMemoryMap() {
  const now = Date.now();
  for (const [key, entry] of memoryMap) {
    if (now - entry.start > RATE_WINDOW_MS) memoryMap.delete(key);
  }
}
setInterval(evictMemoryMap, RATE_WINDOW_MS);

async function checkRate(ip) {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `rl:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, RATE_WINDOW_MS);
      return count <= RATE_MAX;
    } catch (_) { /* fall through */ }
  }
  const now = Date.now();
  const entry = memoryMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    memoryMap.set(ip, { count: 1, start: now });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_MAX;
}

async function checkOtpRate(identifier) {
  const redis = getRedis();
  const key = `rl:otp:${identifier}`;
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, OTP_WINDOW_MS);
      return count <= OTP_MAX;
    } catch (_) { /* fall through */ }
  }
  const now = Date.now();
  const entry = otpMap.get(key);
  if (!entry || now - entry.start > OTP_WINDOW_MS) {
    otpMap.set(key, { count: 1, start: now });
    return true;
  }
  entry.count++;
  return entry.count <= OTP_MAX;
}

function rateLimitMiddleware(req, res, next) {
  checkRate(req.ip || req.connection.remoteAddress || 'unknown')
    .then((ok) => {
      if (!ok) return res.status(429).json({ error: 'Too many requests' });
      next();
    })
    .catch((err) => {
      console.error('[rateLimit]', err.message);
      res.status(429).json({ error: 'Too many requests' });
    });
}

function otpRateLimit(req, res, next) {
  const identifier = req.body.phone || req.body.email || req.ip || 'unknown';
  checkOtpRate(identifier)
    .then((ok) => {
      if (!ok) return res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
      next();
    })
    .catch(() => {
      res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    });
}

const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX = parseInt(process.env.AUTH_RATE_LIMIT || '10', 10);
const authMap = new Map();

function evictAuthMap() {
  const now = Date.now();
  for (const [key, entry] of authMap) {
    if (now - entry.start > AUTH_WINDOW_MS) authMap.delete(key);
  }
}
setInterval(evictAuthMap, AUTH_WINDOW_MS);

async function checkAuthRate(identifier) {
  const redis = getRedis();
  const key = `rl:auth:${identifier}`;
  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, AUTH_WINDOW_MS);
      return count <= AUTH_MAX;
    } catch (_) { /* fall through */ }
  }
  const now = Date.now();
  const entry = authMap.get(key);
  if (!entry || now - entry.start > AUTH_WINDOW_MS) {
    authMap.set(key, { count: 1, start: now });
    return true;
  }
  entry.count++;
  return entry.count <= AUTH_MAX;
}

function authRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  checkAuthRate(ip)
    .then((ok) => {
      if (!ok) return res.status(429).json({ success: false, message: 'Demasiados intentos. Intenta de nuevo más tarde.' });
      next();
    })
    .catch(() => {
      res.status(429).json({ success: false, message: 'Demasiados intentos. Intenta de nuevo más tarde.' });
    });
}

module.exports = { rateLimitMiddleware, otpRateLimit, authRateLimit, checkRate, RATE_MAX, RATE_WINDOW_MS };
