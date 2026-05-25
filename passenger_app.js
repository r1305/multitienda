// Passenger (cPanel) compatible entry point
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

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', true);

// Sessions
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
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
sessionStore.sync();
app.use(flash());

// Static files with caching
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), { maxAge: '7d' }));
app.use('/assets', express.static(path.join(__dirname, 'public/assets'), { maxAge: '30d' }));
app.use('/app', express.static(path.join(__dirname, 'public/app'), { maxAge: '1d' }));
app.use('/OneSignalSDKWorker.js', (req, res) => res.sendFile(path.join(__dirname, 'public/OneSignalSDKWorker.js')));

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
  res.status(500).json({ error: 'Internal server error' });
});

// For Passenger: export the app, don't listen
if (typeof(PhusionPassenger) !== 'undefined') {
  app.listen('passenger');
} else {
  const PORT = process.env.PORT || process.env.APP_PORT || 3000;
  sequelize.authenticate()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch(err => { console.error('DB failed:', err.message); process.exit(1); });
}

module.exports = app;
