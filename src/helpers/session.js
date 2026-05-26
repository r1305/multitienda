const session = require('express-session');
const { sequelize } = require('../models');
const { isRedisAvailable } = require('../config/redis');

async function createSessionMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (isProd) {
      console.warn('[Session] SESSION_SECRET is not set — using insecure default. Set SESSION_SECRET in .env.');
    }
    secret = 'multitienda-dev-only-change-in-production';
  }

  let storeType = process.env.SESSION_STORE
    || (process.env.REDIS_URL ? 'redis' : 'memory');

  const config = {
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProd && process.env.SESSION_COOKIE_SECURE === 'true',
      httpOnly: true,
      sameSite: 'lax',
    },
  };

  if (storeType === 'redis') {
    if (!process.env.REDIS_URL || !isRedisAvailable()) {
      console.warn('[Session] Redis not available — falling back to memory store.');
      storeType = 'memory';
    } else {
      try {
        const RedisStore = require('connect-redis').default;
        const { createClient } = require('redis');
        const redisClient = createClient({ url: process.env.REDIS_URL });
        redisClient.on('error', () => { /* logged on connect failure */ });
        await redisClient.connect();
        await redisClient.ping();
        config.store = new RedisStore({ client: redisClient, prefix: 'mt:sess:' });
      } catch (err) {
        console.warn('[Session] Redis connect failed — memory store:', err.message);
        storeType = 'memory';
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
      console.warn('[Session] DB session store failed — memory store:', err.message);
    }
  }

  return session(config);
}

module.exports = { createSessionMiddleware };
