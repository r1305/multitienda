const session = require('express-session');
const { sequelize } = require('../models');
const { isRedisAvailable } = require('../config/redis');
const { getAppBasePath } = require('./appBasePath');

async function createSessionMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (isProd) {
      console.error('[Session] FATAL: SESSION_SECRET is not set. Aborting in production.');
      process.exit(1);
    }
    console.warn('[Session] SESSION_SECRET not set — using insecure dev default.');
    secret = 'multitienda-dev-only-change-in-production';
  }

  // En producción evitamos MemoryStore (tiene fuga de memoria): si no hay
  // Redis, usamos el almacén en base de datos (connect-session-sequelize).
  const fallbackStore = isProd ? 'db' : 'memory';
  let storeType = process.env.SESSION_STORE
    || (process.env.REDIS_URL ? 'redis' : fallbackStore);

  const config = {
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProd,
      httpOnly: true,
      sameSite: 'lax',
      ...(getAppBasePath() ? { path: getAppBasePath() } : {}),
    },
  };

  if (storeType === 'redis') {
    if (!process.env.REDIS_URL || !isRedisAvailable()) {
      console.warn(`[Session] Redis not available — falling back to ${fallbackStore} store.`);
      storeType = fallbackStore;
    } else {
      try {
        const RedisStore = require('connect-redis').default;
        const { createClient } = require('redis');
        const redisClient = createClient({ url: process.env.REDIS_URL });
        redisClient.on('error', () => { /* logged on connect failure */ });
        const connectMs = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10);
        await Promise.race([
          redisClient.connect(),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`Redis session connect timeout (${connectMs}ms)`)), connectMs);
          }),
        ]);
        await redisClient.ping();
        config.store = new RedisStore({ client: redisClient, prefix: 'mt:sess:' });
      } catch (err) {
        console.warn(`[Session] Redis connect failed — ${fallbackStore} store:`, err.message);
        storeType = fallbackStore;
      }
    }
  }

  if (storeType === 'db') {
    try {
      const SequelizeStore = require('connect-session-sequelize')(session.Store);
      const sessionStore = new SequelizeStore({
        db: sequelize,
        tableName: 'sessions',
        checkExpirationInterval: 12 * 60 * 60 * 1000,
        expiration: 7 * 24 * 60 * 60 * 1000,
      });
      config.store = sessionStore;
      await sessionStore.sync();
    } catch (err) {
      if (isProd) {
        console.error('[Session] DB session store failed — aborting in production:', err.message);
        process.exit(1);
      }
      console.warn('[Session] DB session store failed — memory store:', err.message);
    }
  }

  return session(config);
}

module.exports = { createSessionMiddleware };
