const { sequelize } = require('../models');
const path = require('path');

// ─── Firebase Admin SDK (lazy init) ──────────────────────────────────────────
let firebaseApp = null;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  try {
    const admin = require('firebase-admin');
    const credPath = process.env.FIREBASE_CREDENTIALS || path.join(__dirname, '../../firebase-credentials.json');
    const fs = require('fs');
    if (!fs.existsSync(credPath)) return null;
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(require(credPath))
    });
    return firebaseApp;
  } catch (e) {
    console.error('Firebase init error:', e.message);
    return null;
  }
}

// ─── OneSignal (fallback) ────────────────────────────────────────────────────
async function getOneSignalKeys() {
  const [rows] = await sequelize.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('onesignalAppId', 'onesignalRestApiKey')");
  const config = {};
  rows.forEach(r => { config[r.key] = r.value; });
  return config;
}

async function sendViaOneSignal(title, message, userId, role, data) {
  try {
    const config = await getOneSignalKeys();
    if (!config.onesignalAppId || !config.onesignalRestApiKey) return;

    const payload = {
      app_id: config.onesignalAppId,
      headings: { en: title },
      contents: { en: message },
      data: { ...data, title, message },
    };

    if (data.unique_order_id) {
      payload.url = (process.env.APP_URL || '') + '/order/' + data.unique_order_id;
      payload.web_url = payload.url;
    }

    if (userId) {
      payload.filters = [{ field: 'tag', key: 'user_id', relation: '=', value: String(userId) }];
    } else if (role) {
      payload.filters = [{ field: 'tag', key: 'role', relation: '=', value: role }];
    } else {
      payload.included_segments = ['All'];
    }

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + config.onesignalRestApiKey },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (result.errors) console.error('OneSignal error:', result.errors);
    return result;
  } catch (e) {
    console.error('OneSignal error:', e.message);
  }
}

// ─── FCM Push ────────────────────────────────────────────────────────────────
async function sendViaFCM(title, message, userId, role, data) {
  const app = getFirebaseApp();
  if (!app) return null;

  const admin = require('firebase-admin');
  const messaging = admin.messaging(app);

  const notification = { title, body: message };
  const fcmData = {};
  Object.entries(data).forEach(([k, v]) => { fcmData[k] = String(v); });
  fcmData.title = title;
  fcmData.message = message;

  try {
    if (userId) {
      // Send to specific user's FCM tokens
      const [tokens] = await sequelize.query(
        "SELECT token FROM push_tokens WHERE user_id = ? AND token IS NOT NULL AND token != ''",
        { replacements: [userId] }
      );
      if (!tokens.length) return null;
      const tokenList = tokens.map(t => t.token).filter(Boolean);
      if (!tokenList.length) return null;

      const result = await messaging.sendEachForMulticast({
        tokens: tokenList,
        notification,
        data: fcmData,
        android: { priority: 'high', notification: { sound: 'default', channelId: 'orders' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });

      // Clean invalid tokens
      if (result.responses) {
        const invalid = [];
        result.responses.forEach((r, i) => {
          if (!r.success && r.error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error.code)) {
            invalid.push(tokenList[i]);
          }
        });
        if (invalid.length) {
          await sequelize.query("DELETE FROM push_tokens WHERE token IN (?)", { replacements: [invalid] });
        }
      }
      return result;

    } else if (role) {
      // Send to topic (role-based)
      const topic = role.replace(' ', '_').toLowerCase();
      return await messaging.send({
        topic,
        notification,
        data: fcmData,
        android: { priority: 'high', notification: { sound: 'default', channelId: 'orders' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });

    } else {
      // Send to all (topic 'all')
      return await messaging.send({
        topic: 'all',
        notification,
        data: fcmData,
        android: { priority: 'high', notification: { sound: 'default', channelId: 'orders' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    }
  } catch (e) {
    console.error('FCM error:', e.message);
    return null;
  }
}

// ─── Main send function (tries FCM first, falls back to OneSignal) ───────────
async function sendPushNotification(title, message, userId = null, role = null, data = {}) {
  // Try FCM first
  const fcmResult = await sendViaFCM(title, message, userId, role, data);

  // Always also send via OneSignal (for web push)
  await sendViaOneSignal(title, message, userId, role, data);

  return fcmResult;
}

// ─── Save in-app notification ────────────────────────────────────────────────
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

// ─── Save FCM token ──────────────────────────────────────────────────────────
async function saveFCMToken(userId, token, platform = 'android') {
  if (!token) return;
  try {
    const [existing] = await sequelize.query(
      "SELECT id FROM push_tokens WHERE user_id = ? AND token = ? LIMIT 1",
      { replacements: [userId, token] }
    );
    if (!existing.length) {
      await sequelize.query(
        "INSERT INTO push_tokens (user_id, token, device_type, created_at, updated_at) VALUES (?,?,?,NOW(),NOW())",
        { replacements: [userId, token, platform] }
      );
    }

    // Subscribe to role topic
    const app = getFirebaseApp();
    if (app) {
      const admin = require('firebase-admin');
      const [roles] = await sequelize.query(
        "SELECT r.name FROM roles r INNER JOIN model_has_roles mr ON r.id = mr.role_id WHERE mr.model_id = ?",
        { replacements: [userId] }
      );
      const roleName = roles.length ? roles[0].name.replace(' ', '_').toLowerCase() : 'customer';
      await admin.messaging(app).subscribeToTopic([token], roleName).catch(() => {});
      await admin.messaging(app).subscribeToTopic([token], 'all').catch(() => {});
    }
  } catch (e) {
    console.error('Save FCM token error:', e.message);
  }
}

// ─── Notification helpers ────────────────────────────────────────────────────
async function notifyStoreNewOrder(order, restaurantId) {
  const [owners] = await sequelize.query(
    'SELECT user_id FROM restaurant_user WHERE restaurant_id = ?',
    { replacements: [restaurantId] }
  );
  const title = 'Nuevo pedido!';
  const message = `Tienes un nuevo pedido #${order.unique_order_id}`;
  for (const owner of owners) {
    await saveNotification(owner.user_id, title, message);
    await sendPushNotification(title, message, owner.user_id, null, { order_id: String(order.id), unique_order_id: order.unique_order_id });
  }
}

async function notifyDeliveryNewOrder(order) {
  const title = 'Pedido disponible!';
  const message = `Nuevo pedido #${order.unique_order_id} listo para recoger`;
  await sendPushNotification(title, message, null, 'delivery', { order_id: String(order.id), unique_order_id: order.unique_order_id });
}

async function notifyAdminNewDelivery(name, phone) {
  const title = 'Nuevo repartidor registrado';
  const message = `${name} (${phone}) solicita ser repartidor.`;
  await saveNotification(1, title, message);
  await sendPushNotification(title, message, null, 'admin');
}

async function notifyCustomerDeliveryAccepted(order) {
  const title = 'Repartidor asignado!';
  const message = `Un repartidor aceptó tu pedido #${order.unique_order_id}`;
  await saveNotification(order.user_id, title, message, { order_id: order.id, unique_order_id: order.unique_order_id });
  await sendPushNotification(title, message, order.user_id, null, { order_id: String(order.id), unique_order_id: order.unique_order_id });
}

async function notifyCustomerOrderOnWay(order) {
  const title = 'Tu pedido está en camino!';
  const message = `El repartidor va en camino con tu pedido #${order.unique_order_id}`;
  await saveNotification(order.user_id, title, message, { order_id: order.id, unique_order_id: order.unique_order_id });
  await sendPushNotification(title, message, order.user_id, null, { order_id: String(order.id), unique_order_id: order.unique_order_id });
}

module.exports = {
  sendPushNotification,
  saveNotification,
  saveFCMToken,
  notifyStoreNewOrder,
  notifyDeliveryNewOrder,
  notifyAdminNewDelivery,
  notifyCustomerDeliveryAccepted,
  notifyCustomerOrderOnWay,
};
