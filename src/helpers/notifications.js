const { sequelize } = require('../models');

async function getOneSignalKeys() {
  const [rows] = await sequelize.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('onesignalAppId', 'onesignalRestApiKey')");
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });
  return config;
}

/**
 * Send push notification via OneSignal
 * @param {string} title - Notification title
 * @param {string} message - Notification body
 * @param {number|null} userId - Target user ID (null for all)
 * @param {string|null} role - Target role: 'admin', 'delivery', 'store_owner', 'customer'
 * @param {object} data - Extra data payload
 */
async function sendPushNotification(title, message, userId = null, role = null, data = {}) {
  try {
    const config = await getOneSignalKeys();
    if (!config.onesignalAppId || !config.onesignalRestApiKey) return;

    const payload = {
      app_id: config.onesignalAppId,
      headings: { en: title },
      contents: { en: message },
      data: { ...data, title, message },
    };

    // Target specific user by external_id or tag
    if (userId) {
      payload.filters = [{ field: 'tag', key: 'user_id', relation: '=', value: String(userId) }];
    } else if (role === 'admin') {
      payload.filters = [{ field: 'tag', key: 'role', relation: '=', value: 'admin' }];
    } else if (role === 'delivery') {
      payload.filters = [{ field: 'tag', key: 'role', relation: '=', value: 'delivery' }];
    } else if (role === 'store_owner') {
      payload.filters = [{ field: 'tag', key: 'role', relation: '=', value: 'store_owner' }];
    } else {
      payload.included_segments = ['All'];
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + config.onesignalRestApiKey,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (result.errors) console.error('OneSignal error:', result.errors);
    return result;
  } catch (err) {
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== "production") console.error("Push notification error:", err.message);
  }
}

/**
 * Save in-app notification to database
 */
async function saveNotification(userId, title, message, extra = {}) {
  try {
    const uuid = require('crypto').randomUUID();
    await sequelize.query(
      "INSERT INTO notifications (id, type, notifiable_id, notifiable_type, data, created_at, updated_at) VALUES (?, 'App\\\\Notifications\\\\General', ?, 'App\\\\User', ?, NOW(), NOW())",
      { replacements: [uuid, userId, JSON.stringify({ title, message, ...extra })] }
    );
  } catch (err) {
    console.error('Save notification error:', err.message);
  }
}

/**
 * Notify store owner when a new order is placed
 */
async function notifyStoreNewOrder(order, restaurantId) {
  const [owners] = await sequelize.query(
    'SELECT user_id FROM restaurant_user WHERE restaurant_id = ?',
    { replacements: [restaurantId] }
  );
  const title = 'Nuevo pedido!';
  const message = `Tienes un nuevo pedido #${order.unique_order_id}`;

  for (const owner of owners) {
    await saveNotification(owner.user_id, title, message);
    await sendPushNotification(title, message, owner.user_id);
  }
  // Also notify via store_owner tag
  await sendPushNotification(title, message, null, 'store_owner', { order_id: order.id });
}

/**
 * Notify delivery guys when store accepts order (status 2)
 */
async function notifyDeliveryNewOrder(order) {
  const title = 'Pedido disponible!';
  const message = `Nuevo pedido #${order.unique_order_id} listo para recoger`;
  await sendPushNotification(title, message, null, 'delivery', { order_id: order.id });
}

/**
 * Notify admin when a delivery guy registers
 */
async function notifyAdminNewDelivery(name, phone) {
  const title = 'Nuevo repartidor registrado';
  const message = `${name} (${phone}) solicita ser repartidor. Apruébalo desde el panel.`;
  await saveNotification(1, title, message); // admin user_id = 1
  await sendPushNotification(title, message, null, 'admin');
}

/**
 * Notify customer when delivery accepts order (status 3)
 */
async function notifyCustomerDeliveryAccepted(order) {
  const title = 'Repartidor asignado!';
  const message = `Un repartidor aceptó tu pedido #${order.unique_order_id}`;
  await saveNotification(order.user_id, title, message, { order_id: order.id, unique_order_id: order.unique_order_id });
  await sendPushNotification(title, message, order.user_id);
}

/**
 * Notify customer when delivery picks up order (status 4)
 */
async function notifyCustomerOrderOnWay(order) {
  const title = 'Tu pedido está en camino!';
  const message = `El repartidor va en camino con tu pedido #${order.unique_order_id}`;
  await saveNotification(order.user_id, title, message, { order_id: order.id, unique_order_id: order.unique_order_id });
  await sendPushNotification(title, message, order.user_id);
}

module.exports = {
  sendPushNotification,
  saveNotification,
  notifyStoreNewOrder,
  notifyDeliveryNewOrder,
  notifyAdminNewDelivery,
  notifyCustomerDeliveryAccepted,
  notifyCustomerOrderOnWay,
};
