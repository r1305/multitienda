const { isRedisAvailable } = require('../config/redis');

let queue = null;
let processorAttached = false;

function getQueue() {
  if (!process.env.REDIS_URL || !isRedisAvailable()) return null;
  if (!queue) {
    const Queue = require('bull');
    queue = new Queue('notifications', process.env.REDIS_URL, {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });
  }
  return queue;
}

function attachProcessor() {
  if (processorAttached) return;
  const q = getQueue();
  if (!q) return;
  processorAttached = true;

  const impl = require('./notifications.impl');

  q.process(async (job) => {
    const { type, payload } = job.data;
    if (type === 'push') {
      const { title, message, userId, role, data } = payload;
      return impl.sendPushNotification(title, message, userId, role, data || {});
    }
    const fn = impl[type];
    if (!fn) throw new Error(`Unknown notification job: ${type}`);
    return fn(...(payload.args || []));
  });

  q.on('failed', (job, err) => {
    console.error('[NotificationQueue] Job failed:', job?.data?.type, err.message);
  });
}

async function enqueue(type, payload = {}) {
  const q = getQueue();
  if (q) {
    attachProcessor();
    await q.add({ type, payload }, { priority: payload.priority || 0 });
    return;
  }
  const impl = require('./notifications.impl');
  if (type === 'push') {
    const { title, message, userId, role, data } = payload;
    await impl.sendPushNotification(title, message, userId, role, data);
    return;
  }
  const fn = impl[type];
  if (fn) await fn(...(payload.args || []));
}

function startNotificationWorker() {
  attachProcessor();
  const q = getQueue();
  if (q) console.log('[NotificationQueue] Worker listening');
  return q;
}

async function closeQueue() {
  if (queue) {
    await queue.close();
    queue = null;
    processorAttached = false;
  }
}

module.exports = { enqueue, getQueue, startNotificationWorker, closeQueue, attachProcessor };
