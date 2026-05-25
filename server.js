process.noDeprecation = true;
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const flash = require('connect-flash');
const { sequelize } = require('./src/models');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Trust proxy (cPanel uses reverse proxy)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// EJS with caching in production
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) app.set('view cache', true);

// Sessions - cleanup every 6 hours instead of default
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'sessions',
  checkExpirationInterval: 6 * 60 * 60 * 1000,
  expiration: 7 * 24 * 60 * 60 * 1000
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'multitienda-secret-2026',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, secure: isProd }
}));
sessionStore.sync();
app.use(flash());

// Only log in development
if (!isProd) {
  app.use((req, res, next) => {
    if (req.path.includes('/api/')) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// Static files with aggressive caching in production
const staticOptions = isProd ? { maxAge: '7d', etag: true } : {};
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), staticOptions));
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: '30d', etag: true }));
app.use('/app', express.static(path.join(__dirname, 'public/app'), { maxAge: 0, etag: false }));
app.get('/OneSignalSDKWorker.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.set('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public/OneSignalSDKWorker.js'));
});

// Install route
app.use('/', require('./src/routes/install'));

// API routes
const apiRoutes = require('./src/routes/api');
app.use('/api', apiRoutes);
app.use('/public/api', apiRoutes);

// Admin panel routes
app.use('/', require('./src/admin/routes/admin'));

// Vue app SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/auth')) {
    return res.status(404).send('Route not found');
  }
  res.sendFile(path.join(__dirname, 'public/app/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  if (!isProd) console.error(`[ERROR] ${req.method} ${req.path} ->`, err.message);
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

const PORT = process.env.APP_PORT || process.env.PORT || 3000;

sequelize.authenticate()
  .then(() => {
    if (!isProd) console.log('Database connected.');
    app.listen(PORT, () => { if (!isProd) console.log(`Server running on http://localhost:${PORT}`); });
  })
  .catch(err => {
    console.error('DB connection failed:', err.message);
    process.exit(1);
  });
