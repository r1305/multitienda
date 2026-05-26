const { sequelize } = require('../models');
const path = require('path');

let firebaseApp = null;

function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  try {
    let admin;
    try {
      admin = require('firebase-admin');
    } catch (reqErr) {
      if (reqErr.code === 'MODULE_NOT_FOUND') return null;
      throw reqErr;
    }
    const credPath = process.env.FIREBASE_CREDENTIALS || path.join(__dirname, '../../firebase-credentials.json');
    const fs = require('fs');
    if (!fs.existsSync(credPath)) return null;
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(require(credPath)),
    });
    return firebaseApp;
  } catch (e) {
    console.error('Firebase init error:', e.message);
    return null;
  }
}

async function postOneSignal(apiKey, payload) {
  const response = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + apiKey },
    body: JSON.stringify(payload),
  });
  return response.json();
}

async function getOneSignalKeys() {
  const cache = require('./cache');
  const cached = await cache.get('settings:onesignal');
  if (cached) return cached;
  const [rows] = await sequelize.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('onesignalAppId', 'onesignalRestApiKey')");
  const config = {};
  rows.forEach((r) => { config[r.key] = r.value; });
  await cache.set('settings:onesignal', config, 600);
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
      priority: 10,
      chrome_web_badge: '/assets/img/favicons/favicon-96x96.png',
      chrome_web_icon: '/assets/img/favicons/favicon-96x96.png',
      firefox_icon: '/assets/img/favicons/favicon-96x96.png',
    };

    const baseUrl = process.env.APP_URL || '';
    if (data.type === 'new_order' && data.order_id) {
      payload.url = baseUrl + '/store-owner/order/' + data.order_id;
      payload.web_url = payload.url;
    } else if (data.type === 'chat' && data.order_id) {
      if (data.recipient_role === 'delivery') {
        payload.url = baseUrl + '/delivery/order/' + data.order_id;
      } else if (data.unique_order_id) {
        payload.url = baseUrl + '/order/' + data.unique_order_id;
      }
      payload.web_url = payload.url;
    } else if (data.unique_order_id && !role) {
      payload.url = baseUrl + '/order/' + data.unique_order_id;
      payload.web_url = payload.url;
    }

    if (!userId && data.restaurant_id && data.recipient_role === 'store_owner') {
      payload.filters = [
        { field: 'tag', key: 'restaurant_id', relation: '=', value: String(data.restaurant_id) },
        { field: 'tag', key: 'role', relation: '=', value: 'store_owner' },
      ];
    } else if (userId) {
      const uid = String(userId);
      payload.include_aliases = { external_id: [uid] };
      payload.target_channel = 'push';
    } else if (role) {
      payload.filters = [{ field: 'tag', key: 'role', relation: '=', value: role }];
    } else {
      payload.included_segments = ['All'];
    }

    let result = await postOneSignal(config.onesignalRestApiKey, payload);

    if (userId && (result.errors || result.recipients === 0)) {
      const tagPayload = { ...payload };
      delete tagPayload.include_aliases;
      delete tagPayload.target_channel;
      tagPayload.filters = [{ field: 'tag', key: 'user_id', relation: '=', value: String(userId) }];
      result = await postOneSignal(config.onesignalRestApiKey, tagPayload);
    }

    if (result.errors) {
      console.error('OneSignal error:', JSON.stringify(result.errors));
    } else if (userId && result.recipients === 0) {
      console.warn('OneSignal: no recipients for user', userId);
    }
    return result;
  } catch (e) {
    console.error('OneSignal error:', e.message);
  }
}

async function sendViaFCM(title, message, userId, role, data) {
  const app = getFirebaseApp();
  if (!app) return null;

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (reqErr) {
    if (reqErr.code === 'MODULE_NOT_FOUND') return null;
    throw reqErr;
  }
  const messaging = admin.messaging(app);

  const notification = { title, body: message };
  const fcmData = {};
  Object.entries(data).forEach(([k, v]) => { fcmData[k] = String(v); });
  fcmData.title = title;
  fcmData.message = message;

  try {
    if (userId) {
      const [tokens] = await sequelize.query(
        "SELECT token FROM push_tokens WHERE user_id = ? AND token IS NOT NULL AND token != ''",
        { replacements: [userId] }
      );
      if (!tokens.length) return null;
      const tokenList = tokens.map((t) => t.token).filter(Boolean);
      if (!tokenList.length) return null;

      const result = await messaging.sendEachForMulticast({
        tokens: tokenList,
        notification,
        data: fcmData,
        android: { priority: 'high', notification: { sound: 'default', channelId: 'orders' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });

      if (result.responses) {
        const invalid = [];
        result.responses.forEach((r, i) => {
          if (!r.success && r.error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error.code)) {
            invalid.push(tokenList[i]);
          }
        });
        if (invalid.length) {
          await sequelize.query('DELETE FROM push_tokens WHERE token IN (?)', { replacements: [invalid] });
        }
      }
      return result;
    }
    if (role) {
      const topic = role.replace(' ', '_').toLowerCase();
      return messaging.send({
        topic,
        notification,
        data: fcmData,
        android: { priority: 'high', notification: { sound: 'default', channelId: 'orders' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    }
    return messaging.send({
      topic: 'all',
      notification,
      data: fcmData,
      android: { priority: 'high', notification: { sound: 'default', channelId: 'orders' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
  } catch (e) {
    console.error('FCM error:', e.message);
    return null;
  }
}

async function sendPushNotification(title, message, userId = null, role = null, data = {}) {
  const fcmResult = await sendViaFCM(title, message, userId, role, data);
  await sendViaOneSignal(title, message, userId, role, data);
  return fcmResult;
}

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

async function saveFCMToken(userId, token, platform = 'android') {
  if (!token) return;
  try {
    const [existing] = await sequelize.query(
      'SELECT id FROM push_tokens WHERE user_id = ? AND token = ? LIMIT 1',
      { replacements: [userId, token] }
    );
    if (!existing.length) {
      await sequelize.query(
        'INSERT INTO push_tokens (user_id, token, device_type, created_at, updated_at) VALUES (?,?,?,NOW(),NOW())',
        { replacements: [userId, token, platform] }
      );
    }

    const app = getFirebaseApp();
    if (app) {
      let admin;
      try {
        admin = require('firebase-admin');
      } catch (reqErr) {
        if (reqErr.code === 'MODULE_NOT_FOUND') return;
        throw reqErr;
      }
      const [roles] = await sequelize.query(
        'SELECT r.name FROM roles r INNER JOIN model_has_roles mr ON r.id = mr.role_id WHERE mr.model_id = ?',
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

async function notifyStoreNewOrder(order, restaurantId) {
  const rid = Number(restaurantId);
  const [owners] = await sequelize.query(
    'SELECT user_id FROM restaurant_user WHERE restaurant_id = ?',
    { replacements: [rid] }
  );
  const ownerIds = [...new Set(owners.map((o) => Number(o.user_id)).filter((id) => id > 0))];

  const title = '¡Nuevo pedido!';
  const message = `Pedido #${order.unique_order_id} — revisa y acepta`;
  const data = {
    order_id: Number(order.id),
    unique_order_id: order.unique_order_id,
    type: 'new_order',
    recipient_role: 'store_owner',
    restaurant_id: rid,
  };

  if (!ownerIds.length) {
    console.warn('[notifyStoreNewOrder] No owners in restaurant_user for restaurant', rid);
  }

  for (const userId of ownerIds) {
    await saveNotification(userId, title, message, data);
  }

  const restaurantResult = await sendViaOneSignal(title, message, null, null, data);
  const restaurantPushFailed = !restaurantResult
    || restaurantResult.errors
    || (typeof restaurantResult.recipients === 'number' && restaurantResult.recipients === 0);

  if (restaurantPushFailed && ownerIds.length) {
    for (const userId of ownerIds) {
      await sendPushNotification(title, message, userId, null, {
        order_id: data.order_id,
        unique_order_id: data.unique_order_id,
        type: 'new_order',
      });
    }
  } else if (restaurantPushFailed) {
    console.warn('[notifyStoreNewOrder] No push recipients for restaurant', rid, '- assign owner in admin and open /store-owner with notifications enabled');
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
