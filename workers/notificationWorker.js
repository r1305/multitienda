process.noDeprecation = true;
require('dotenv').config();

const { initRedis, closeRedis } = require('../src/config/redis');
const { startNotificationWorker, closeQueue } = require('../src/helpers/notificationQueue');
const { sequelize } = require('../src/models');

async function main() {
  await initRedis();
  await sequelize.authenticate();
  startNotificationWorker();
  console.log('[Worker] Notification processor ready');
}

main().catch((err) => {
  console.error('[Worker] Failed to start:', err.message);
  process.exit(1);
});

async function stop() {
  await closeQueue();
  await closeRedis();
  await sequelize.close();
  process.exit(0);
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
