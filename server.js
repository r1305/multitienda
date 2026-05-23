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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Sessions & Flash
const sessionStore = new SequelizeStore({ db: sequelize, tableName: 'sessions' });
app.use(session({
  secret: process.env.SESSION_SECRET || 'multitienda-secret-2026',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
sessionStore.sync();
app.use(flash());

// Log API requests
app.use((req, res, next) => {
  if (req.path.includes('/api/')) console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Static files
app.use('/storage', express.static(path.join(__dirname, 'storage')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/app', express.static(path.join(__dirname, 'public/app')));

// API routes
app.use('/api', require('./src/routes/api'));
app.use('/public/api', require('./src/routes/api'));

// Admin panel routes
app.use('/', require('./src/admin/routes/admin'));

// Vue app - serve index.html for all non-admin, non-api, non-static routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/auth')) {
    return res.status(404).send('Route not found');
  }
  res.sendFile(path.join(__dirname, 'public/app/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path} ->`, err.message);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.APP_PORT || 3001;

sequelize.authenticate()
  .then(() => {
    console.log('Database connected.');
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  });
