const { getRedis, isRedisAvailable } = require('../config/redis');

const memoryStore = new Map();

function memGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key, value, ttlSeconds) {
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

async function get(key) {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) { /* fall through */ }
  }
  return memGet(key);
}

async function set(key, value, ttlSeconds = 300) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch (_) { /* fall through */ }
  }
  memSet(key, value, ttlSeconds);
}

async function del(key) {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(key); } catch (_) { /* ignore */ }
  }
  memoryStore.delete(key);
}

async function invalidate(prefix) {
  const redis = getRedis();
  if (redis) {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    } catch (_) { /* ignore */ }
  }
  for (const key of [...memoryStore.keys()]) {
    if (key.startsWith(prefix)) memoryStore.delete(key);
  }
}

function roundCoord(n, decimals = 2) {
  if (n == null || n === '') return '0';
  return Number(parseFloat(n).toFixed(decimals));
}

module.exports = { get, set, del, invalidate, roundCoord, isRedisAvailable };
