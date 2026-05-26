process.noDeprecation = true;
require('dotenv').config();

const { createApp, shutdown } = require('./src/app');
const { sequelize } = require('./src/models');

const PORT = process.env.APP_PORT || process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

let server;

createApp()
  .then((app) => sequelize.authenticate().then(() => app))
  .then((app) => {
    if (!isProd) console.log('Database connected.');
    server = app.listen(PORT, () => {
      if (!isProd) console.log(`Server running on http://localhost:${PORT}`);
    });
    return app;
  })
  .catch((err) => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });

async function gracefulStop() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await shutdown();
  process.exit(0);
}

process.on('SIGTERM', gracefulStop);
process.on('SIGINT', gracefulStop);
