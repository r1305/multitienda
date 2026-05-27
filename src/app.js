const express = require('express');
const cors = require('cors');
const path = require('path');
const flash = require('connect-flash');
const { initRedis, closeRedis } = require('./config/redis');
const { createSessionMiddleware } = require('./helpers/session');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const { attachProcessor, closeQueue } = require('./helpers/notificationQueue');

async function createApp() {
  await initRedis();

  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const oneSignalWorkerPath = path.join(__dirname, '../public/OneSignalSDKWorker.js');

  const serveOneSignalWorker = (req, res) => {
    res.type('application/javascript');
    res.set({
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'public, max-age=86400',
    });
    res.sendFile(oneSignalWorkerPath);
  };

  const oneSignalWorkerJs = "importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');\n";
  const serveOneSignalWorkerApi = (req, res) => {
    res.type('application/javascript');
    res.set({ 'Service-Worker-Allowed': '/', 'Cache-Control': 'public, max-age=86400' });
    res.send(oneSignalWorkerJs);
  };
  app.get(['/public/api/onesignal-service-worker.js', '/api/onesignal-service-worker.js'], serveOneSignalWorkerApi);
  app.get(/^\/(app\/)?OneSignalSDKWorker\.js$/i, serveOneSignalWorker);

  app.set('trust proxy', 1);

  try {
    const compression = require('compression');
    app.use(compression({ threshold: 1024 }));
  } catch (_) { /* optional */ }

  const corsOrigin = process.env.CORS_ORIGIN || process.env.APP_URL;
  if (corsOrigin) {
    const origins = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
    app.use(cors({ origin: origins, credentials: true }));
  } else {
    app.use(cors());
  }

  app.use(express.json({ limit: process.env.BODY_LIMIT || '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: process.env.BODY_LIMIT || '2mb' }));

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../views'));
  if (isProd) app.set('view cache', true);

  app.use(await createSessionMiddleware());
  app.use(flash());
  app.use(rateLimitMiddleware);

  if (process.env.SERVE_STATIC !== 'false') {
    app.use('/uploads', express.static(path.join(__dirname, '../public/uploads'), { maxAge: '7d', etag: true }));
    app.use('/assets', express.static(path.join(__dirname, '../public/assets'), { maxAge: '30d', etag: true, immutable: true }));
    app.use('/app', express.static(path.join(__dirname, '../public/app'), isProd ? { maxAge: '1h', etag: true } : {}));
  }

  app.use('/', require('./routes/install'));

  const apiRoutes = require('./routes/api');
  app.use('/api', apiRoutes);
  app.use('/public/api', apiRoutes);
  app.use('/', require('./admin/routes/admin'));

  app.use((err, req, res, next) => {
    if (!isProd) console.error(`[ERROR] ${req.method} ${req.path} ->`, err.message);
    if (res.headersSent) return next(err);
    const wantsJson = req.path.startsWith('/api') || req.path.startsWith('/public/api');
    if (wantsJson) {
      return res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
    }
    res.status(500).send(isProd ? 'Internal server error' : err.message);
  });

  const spaFile = path.join(__dirname, '../public/app/index.html');
  app.get('*', (req, res) => {
    if (/onesignal/i.test(req.path) && /\.js$/i.test(req.path)) {
      return serveOneSignalWorker(req, res);
    }
    if (req.path.startsWith('/admin') || req.path.startsWith('/auth')) {
      return res.status(404).send('Route not found');
    }
    res.sendFile(spaFile);
  });

  if (process.env.ENABLE_NOTIFICATION_WORKER !== 'false') {
    attachProcessor();
  }

  return app;
}

async function shutdown() {
  await closeQueue();
  await closeRedis();
  const { sequelize } = require('./models');
  await sequelize.close();
}

module.exports = { createApp, shutdown };
