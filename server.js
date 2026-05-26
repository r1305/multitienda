process.noDeprecation = true;
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Trust proxy
app.set('trust proxy', 1);

// Compression - reduce bandwidth significantly
try {
  const compression = require('compression');
  app.use(compression({ threshold: 1024 }));
} catch(e) { /* compression not installed, skip */ }

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
if (isProd) app.set('view cache', true);

// Sessions - use memory store (lighter than Sequelize store for low traffic)
// Falls back to SequelizeStore only if explicitly configured
const useDbSessions = process.env.SESSION_STORE === 'db';
let sessionConfig = {
  secret: process.env.SESSION_SECRET || 'multitienda-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, secure: isProd }
};

if (useDbSessions) {
  const { sequelize } = require('./src/models');
  const SequelizeStore = require('connect-session-sequelize')(session.Store);
  const sessionStore = new SequelizeStore({
    db: sequelize,
    tableName: 'sessions',
    checkExpirationInterval: 12 * 60 * 60 * 1000,
    expiration: 7 * 24 * 60 * 60 * 1000
  });
  sessionConfig.store = sessionStore;
  sessionStore.sync();
}

app.use(session(sessionConfig));
app.use(flash());

// Simple rate limiter (in-memory, no dependency)
const rateMap = new Map();
const RATE_WINDOW = 60000; // 1 min
const RATE_MAX = 120; // max requests per window
setInterval(() => rateMap.clear(), RATE_WINDOW);

app.use((req, res, next) => {
  const ip = req.ip;
  const count = (rateMap.get(ip) || 0) + 1;
  rateMap.set(ip, count);
  if (count > RATE_MAX) return res.status(429).json({ error: 'Too many requests' });
  next();
});

// Static files with caching
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), { maxAge: '7d', etag: true }));
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: '30d', etag: true, immutable: true }));
app.use('/app', express.static(path.join(__dirname, 'public/app'), isProd ? { maxAge: '1h', etag: true } : {}));
app.get('/OneSignalSDKWorker.js', (req, res) => {
  res.set({ 'Content-Type': 'application/javascript', 'Service-Worker-Allowed': '/', 'Cache-Control': 'public, max-age=86400' });
  res.sendFile(path.join(__dirname, 'public/OneSignalSDKWorker.js'));
});

// Install route
app.use('/', require('./src/routes/install'));

// API routes (lazy load heavy controllers only when needed)
const apiRoutes = require('./src/routes/api');
app.use('/api', apiRoutes);
app.use('/public/api', apiRoutes);

// Admin panel routes
app.use('/', require('./src/admin/routes/admin'));

// Vue app SPA - cache the file path
const spaFile = path.join(__dirname, 'public/app/index.html');
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/auth')) {
    return res.status(404).send('Route not found');
  }
  res.sendFile(spaFile);
});

// Error handler
app.use((err, req, res, next) => {
  if (!isProd) console.error(`[ERROR] ${req.method} ${req.path} ->`, err.message);
  res.status(500).json({ error: isProd ? 'Internal server error' : err.message });
});

const PORT = process.env.APP_PORT || process.env.PORT || 3000;

const { sequelize } = require('./src/models');
sequelize.authenticate()
  .then(() => {
    if (!isProd) console.log('Database connected.');
    app.listen(PORT, () => { if (!isProd) console.log(`Server running on http://localhost:${PORT}`); });
  })
  .catch(err => {
    console.error('DB connection failed:', err.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  sequelize.close().then(() => process.exit(0));
});
process.on('SIGINT', () => {
  sequelize.close().then(() => process.exit(0));
});
