const { getRedis } = require('../config/redis');

const RATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const memoryMap = new Map();

setInterval(() => memoryMap.clear(), RATE_WINDOW_MS);

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
  const count = (memoryMap.get(ip) || 0) + 1;
  memoryMap.set(ip, count);
  return count <= RATE_MAX;
}

function rateLimitMiddleware(req, res, next) {
  checkRate(req.ip || req.connection.remoteAddress || 'unknown')
    .then((ok) => {
      if (!ok) return res.status(429).json({ error: 'Too many requests' });
      next();
    })
    .catch((err) => {
      console.error('[rateLimit]', err.message);
      next();
    });
}

module.exports = { rateLimitMiddleware, checkRate, RATE_MAX, RATE_WINDOW_MS };
