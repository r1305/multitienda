/**
 * cPanel / hosting compartido: UN solo proceso Node.
 * No usar ecosystem.config.js (cluster + worker) en la misma cuenta.
 */
module.exports = {
  apps: [
    {
      name: 'multitienda-api',
      script: 'passenger_app.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        ENABLE_NOTIFICATION_WORKER: 'true',
        SESSION_STORE: 'memory',
      },
    },
  ],
};
