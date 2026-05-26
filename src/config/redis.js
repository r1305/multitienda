const Redis = require('ioredis');

let client = null;
let initAttempted = false;
let available = false;

function createRedisClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
  });
}

async function initRedis() {
  if (initAttempted) return available;
  initAttempted = true;
  if (!process.env.REDIS_URL) {
    client = null;
    available = false;
    return false;
  }
  try {
    client = createRedisClient();
    await client.ping();
    available = true;
    client.on('error', (err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Redis]', err.message);
      }
    });
    return true;
  } catch (err) {
    console.warn('[Redis] Unavailable, using in-memory fallbacks:', err.message);
    if (client) {
      try { client.disconnect(); } catch (_) { /* ignore */ }
    }
    client = null;
    available = false;
    return false;
  }
}

function getRedis() {
  return available && client ? client : null;
}

function isRedisAvailable() {
  return available && !!client;
}

async function closeRedis() {
  if (client) {
    try { await client.quit(); } catch (_) { /* ignore */ }
    client = null;
    available = false;
  }
}

module.exports = { initRedis, getRedis, isRedisAvailable, closeRedis, createRedisClient };
