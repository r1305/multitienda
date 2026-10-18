module.exports = {
  apps: [
    {
      name: 'multitienda-api',
      script: 'server.js',
      instances: parseInt(process.env.PM2_INSTANCES || '1', 10),
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        ENABLE_NOTIFICATION_WORKER: 'false',
      },
    },
    {
      name: 'multitienda-notifications',
      script: 'workers/notificationWorker.js',
      instances: 1,
      max_memory_restart: '384M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
