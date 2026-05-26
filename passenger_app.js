process.noDeprecation = true;
require('dotenv').config();

const { createApp } = require('./src/app');
const { sequelize } = require('./src/models');

let app;
const ready = createApp()
  .then((created) => sequelize.authenticate().then(() => {
    app = created;
    return app;
  }))
  .catch((err) => {
    console.error('Startup failed:', err.message, err.stack);
    process.exit(1);
  });

function forward(req, res, next) {
  if (app) return app(req, res, next);
  ready
    .then(() => app(req, res, next))
    .catch(() => res.status(503).send('Service unavailable'));
}

module.exports = forward;

if (typeof PhusionPassenger !== 'undefined') {
  ready.then(() => app.listen('passenger'));
} else if (require.main === module) {
  const PORT = process.env.PORT || process.env.APP_PORT || 3000;
  ready.then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}
