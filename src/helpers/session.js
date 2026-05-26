const session = require('express-session');
const { sequelize } = require('../models');

async function createSessionMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.SESSION_SECRET;
  if (isProd && !secret) {
    throw new Error('SESSION_SECRET is required when NODE_ENV=production');
  }

  const storeType = process.env.SESSION_STORE
    || (process.env.REDIS_URL ? 'redis' : 'memory');

  const config = {
    secret: secret || 'multitienda-dev-only-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: isProd && process.env.SESSION_COOKIE_SECURE !== 'false',
      httpOnly: true,
      sameSite: 'lax',
    },
  };

  if (storeType === 'redis' && process.env.REDIS_URL) {
    const RedisStore = require('connect-redis').default;
    const { createClient } = require('redis');
    const redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => {
      if (!isProd) console.error('[Session Redis]', err.message);
    });
    await redisClient.connect();
    config.store = new RedisStore({ client: redisClient, prefix: 'mt:sess:' });
  } else if (storeType === 'db') {
    const SequelizeStore = require('connect-session-sequelize')(session.Store);
    const sessionStore = new SequelizeStore({
      db: sequelize,
      tableName: 'sessions',
      checkExpirationInterval: 12 * 60 * 60 * 1000,
      expiration: 7 * 24 * 60 * 60 * 1000,
    });
    config.store = sessionStore;
    await sessionStore.sync();
  }

  return session(config);
}

module.exports = { createSessionMiddleware };
