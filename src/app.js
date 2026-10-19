const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const flash = require('connect-flash');
const { initRedis, closeRedis } = require('./config/redis');
const { createSessionMiddleware } = require('./helpers/session');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const { attachProcessor, closeQueue } = require('./helpers/notificationQueue');
const {
  attachAppBaseMiddleware,
  getSpaIndexHtml,
  getAppBasePath,
  withAppBase,
} = require('./helpers/appBasePath');

async function createApp() {
  await initRedis();

  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const appBase = getAppBasePath();
  attachAppBaseMiddleware(app);

  const firebaseWorkerPath = path.join(__dirname, '../public/firebase-messaging-sw.js');
  app.get('/firebase-messaging-sw.js', (req, res) => {
    res.type('application/javascript');
    res.set({
      'Service-Worker-Allowed': appBase ? `${appBase}/` : '/',
      'Cache-Control': 'public, max-age=300',
    });
    res.sendFile(firebaseWorkerPath);
  });

  app.set('trust proxy', 1);

  // HTTPS enforcement in production — only when NOT behind gateway
  // (the gateway/cPanel reverse-proxy handles TLS termination)
  if (isProd && process.env.APP_GATEWAY_MOUNTED !== '1') {
    app.use((req, res, next) => {
      const host = req.headers.host || '';
      if (req.secure || /^localhost|^127\.0\.0\.1/i.test(host)) return next();
      res.redirect(301, 'https://' + req.headers.host + req.originalUrl);
    });
  }

  // Security headers (optional - install helmet for full protection)
  try {
    const helmet = require('helmet');
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://code.jquery.com", "https://cdnjs.cloudflare.com", "https://www.gstatic.com", "https://unpkg.com", "https://cdn.datatables.net", "https://maps.googleapis.com", "https://maps.gstatic.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.datatables.net", "https://unpkg.com"],
          fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://www.gstatic.com", "https://maps.googleapis.com", "https://*.googleapis.com", "https://maps.gstatic.com"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: false,
    }));
  } catch (_) { /* helmet not installed */ }

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

  app.use(cookieParser());

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
    console.error(`[ERROR] ${req.method} ${req.path} ->`, err.stack || err.message || err);
    if (res.headersSent) return next(err);
    const wantsJson = req.path.startsWith('/api') || req.path.startsWith('/public/api');
    if (wantsJson) {
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.status(500).send('Internal server error');
  });

  app.get('*', async (req, res) => {
    if (req.path.startsWith('/admin') || req.path.startsWith('/auth')) {
      return res.status(404).send('Route not found');
    }
    let html = getSpaIndexHtml();
    try {
      const cache = require('./helpers/cache');
      const cached = await cache.get('settings:all');
      if (cached) {
        const fav = cached.find(s => s.key === 'faviconUrl');
        if (fav && fav.value) {
          const appBase = getAppBasePath() || '';
          html = html.replace(/rel="icon"[^>]*href="[^"]*"/, `rel="icon" type="image/png" href="${appBase}${fav.value}"`);
        }
      }
    } catch (_) { /* use default favicon */ }
    res.type('html').send(html);
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

module.exports = { createApp, shutdown, getAppBasePath, withAppBase };
