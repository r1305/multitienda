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

function appPathPrefix() {
  const { getAppBasePath } = require('./appBasePath');
  return getAppBasePath();
}

async function getAppBaseUrl() {
  const cache = require('./cache');
  const cached = await cache.get('settings:appBaseUrl');
  if (cached) return cached;

  let base = (process.env.APP_URL || '').trim().replace(/\/$/, '');
  const prefix = appPathPrefix();
  if (prefix && base && !base.endsWith(prefix)) base = `${base}${prefix}`;
  else if (prefix && !base) base = prefix;
  if (!/^https?:\/\//i.test(base)) {
    try {
      const [rows] = await sequelize.query(
        "SELECT value FROM settings WHERE `key` IN ('appUrl', 'storeUrl', 'siteUrl', 'websiteUrl') AND value IS NOT NULL AND value != '' LIMIT 1"
      );
      if (rows[0]?.value) base = String(rows[0].value).trim().replace(/\/$/, '');
    } catch (_) { /* ignore */ }
  }

  let resolved = /^https?:\/\//i.test(base) ? base : null;
  if (!resolved && prefix) resolved = prefix;
  if (resolved) await cache.set('settings:appBaseUrl', resolved, 600);
  return resolved;
}

function toAbsoluteAssetUrl(pathOrUrl, baseUrl) {
  if (!pathOrUrl || !baseUrl) return null;
  const s = String(pathOrUrl).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  if (/^https?:\/\//i.test(s)) return s;
  try {
    return new URL(s.startsWith('/') ? s : `/${s}`, `${baseUrl}/`).href;
  } catch (_) {
    return null;
  }
}

function sanitizeNotificationData(data, title, message, baseUrl) {
  const notifData = { ...data, title, message };
  Object.keys(notifData).forEach((key) => {
    const val = notifData[key];
    if (val == null) {
      delete notifData[key];
      return;
    }
    if (typeof val === 'string' && (key.includes('image') || key.includes('icon') || key.includes('url'))) {
      const abs = toAbsoluteAssetUrl(val, baseUrl);
      if (abs) notifData[key] = abs;
      else delete notifData[key];
    }
  });
  return notifData;
}

function inferNotificationUrl(data, baseUrl) {
  if (!baseUrl || !data) return null;
  if (data.url || data.web_url || data.link) return data.url || data.web_url || data.link;
  if (data.type === 'new_order' && data.order_id) return `${baseUrl}/store-owner/order/${data.order_id}`;
  if (data.type === 'delivery_assigned' && data.order_id) return `${baseUrl}/delivery/order/${data.order_id}`;
  if (data.type === 'delivery_order') return `${baseUrl}/delivery/orders`;
  if (data.type === 'chat' && data.order_id) {
    if (data.recipient_role === 'delivery') return `${baseUrl}/delivery/order/${data.order_id}`;
    if (data.unique_order_id) return `${baseUrl}/order/${data.unique_order_id}`;
  }
  if (data.unique_order_id) return `${baseUrl}/order/${data.unique_order_id}`;
  return null;
}

async function sendViaFCM(title, message, userId, role, data) {
  const app = getFirebaseApp();
  if (!app) {
    console.warn('[FCM] Firebase Admin no disponible (instala firebase-admin y FIREBASE_CREDENTIALS)');
    return { ok: false, reason: 'firebase_not_configured' };
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (reqErr) {
    if (reqErr.code === 'MODULE_NOT_FOUND') return null;
    throw reqErr;
  }
  const messaging = admin.messaging(app);
  const baseUrl = await getAppBaseUrl();
  const notifData = sanitizeNotificationData(data || {}, title, message, baseUrl);
  const link = inferNotificationUrl(notifData, baseUrl);
  if (link) {
    notifData.url = link;
    notifData.web_url = link;
    notifData.link = link;
  }
  const fcmData = {};
  Object.entries(notifData).forEach(([k, v]) => { fcmData[k] = String(v); });
  fcmData.title = title;
  fcmData.message = message;
  const iconUrl = toAbsoluteAssetUrl('/assets/img/favicons/favicon-96x96.png', baseUrl);
  const imageUrl = toAbsoluteAssetUrl(notifData.image, baseUrl);

  const webpush = {
    headers: { Urgency: 'high' },
    notification: {
      title,
      body: message,
      icon: iconUrl || undefined,
      badge: iconUrl || undefined,
      image: imageUrl || undefined,
      vibrate: [200, 100, 200],
    },
    fcmOptions: link ? { link } : undefined,
  };
  const android = { priority: 'high', notification: { sound: 'default', channelId: 'orders' } };
  const apns = { payload: { aps: { sound: 'default', badge: 1 } } };

  function buildMessageForToken(token, deviceType) {
    const isWeb = String(deviceType || '').toLowerCase() === 'web';
    if (isWeb) {
      return {
        token,
        data: fcmData,
        webpush,
      };
    }
    return {
      token,
      notification: { title, body: message },
      data: fcmData,
      webpush,
      android,
      apns,
    };
  }

  function processSendEachResult(result, tokenRows) {
    const invalid = [];
    if (result.responses) {
      result.responses.forEach((r, i) => {
        if (r.success) return;
        const err = r.error;
        const code = err?.code || 'unknown';
        const tokenPreview = tokenRows[i]?.token ? `${String(tokenRows[i].token).slice(0, 12)}…` : '?';
        console.warn('[FCM] Token falló:', code, err?.message || '', tokenPreview);
        if (err && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(code)) {
          invalid.push(tokenRows[i].token);
        }
      });
    }
    if (invalid.length) {
      sequelize.query('DELETE FROM push_tokens WHERE token IN (?)', { replacements: [invalid] }).catch(() => {});
    }
    const successCount = result.successCount || 0;
    const failureCount = result.failureCount || 0;
    if (failureCount && successCount) {
      console.warn('[FCM] Envío parcial user_id=', userId, 'ok=', successCount, 'fail=', failureCount);
    }
    return { successCount, failureCount, invalidCount: invalid.length };
  }

  try {
    if (userId) {
      const uid = Number(userId);
      const [tokens] = await sequelize.query(
        "SELECT token, device_type FROM push_tokens WHERE user_id = ? AND token IS NOT NULL AND token != ''",
        { replacements: [uid] }
      );
      if (!tokens.length) {
        console.warn('[FCM] Sin tokens push para user_id=', uid);
        return { ok: false, reason: 'no_tokens', userId: uid };
      }
      const tokenRows = tokens.filter((t) => t.token);
      if (!tokenRows.length) return { ok: false, reason: 'no_tokens', userId: uid };

      const messages = tokenRows.map((row) => buildMessageForToken(row.token, row.device_type));
      const result = await messaging.sendEach(messages);
      const { successCount, failureCount } = processSendEachResult(result, tokenRows);

      if (!successCount) {
        return { ok: false, reason: 'all_failed', userId: uid, tokenCount: tokenRows.length, failureCount };
      }
      return { ok: true, userId: uid, tokenCount: tokenRows.length, successCount, failureCount };
    }
    if (role) {
      const topic = role.replace(' ', '_').toLowerCase();
      return messaging.send({
        topic,
        notification: { title, body: message },
        data: fcmData,
        webpush,
        android,
        apns,
      });
    }
    return messaging.send({
      topic: 'all',
      notification: { title, body: message },
      data: fcmData,
      webpush,
      android,
      apns,
    });
  } catch (e) {
    console.error('[FCM] Error:', e.message);
    return { ok: false, reason: 'send_error', message: e.message };
  }
}

async function sendPushNotification(title, message, userId = null, role = null, data = {}) {
  return sendViaFCM(title, message, userId, role, data);
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
    await sendPushNotification(title, message, userId, null, data);
  }
  if (!ownerIds.length) {
    console.warn('[notifyStoreNewOrder] No push recipients for restaurant', rid, '- assign owner in admin and ensure /store-owner accepted notifications');
  }
}

const ROLE_TAG_TO_NAME = {
  delivery: 'Delivery Guy',
  customer: 'Customer',
  store_owner: 'Store Owner',
  admin: 'Admin',
};

async function getDeliveryPushStatus() {
  const [rows] = await sequelize.query(
    `SELECT u.id, u.name, u.phone, u.email, u.is_active AS user_active,
            COALESCE(dgd.is_available, 0) AS is_available,
            (SELECT COUNT(*) FROM push_tokens pt WHERE pt.user_id = u.id) AS push_token_count
     FROM users u
     INNER JOIN model_has_roles mr ON mr.model_id = u.id
     INNER JOIN roles r ON r.id = mr.role_id AND r.name = 'Delivery Guy'
     LEFT JOIN delivery_guy_details dgd ON dgd.user_id = u.id
     ORDER BY u.name ASC`
  );
  return rows.map((r) => {
    const hasToken = Number(r.push_token_count) > 0;
    return {
      id: Number(r.id),
      name: r.name || '',
      phone: r.phone || '',
      email: r.email || '',
      accountActive: Number(r.user_active) !== 0,
      isAvailable: Number(r.is_available) === 1,
      hasPushToken: hasToken,
      pushStatus: hasToken ? 'token' : 'none',
      pushLabel: hasToken
        ? 'Token registrado (Firebase móvil/web)'
        : 'Sin token — debe abrir /delivery y aceptar notificaciones',
    };
  });
}

async function getUserIdsByRoleTag(roleTag) {
  const roleName = ROLE_TAG_TO_NAME[roleTag];
  if (!roleName) return [];
  const [rows] = await sequelize.query(
    `SELECT DISTINCT u.id FROM users u
     INNER JOIN model_has_roles mr ON mr.model_id = u.id
     INNER JOIN roles r ON r.id = mr.role_id
     WHERE r.name = ?`,
    { replacements: [roleName] }
  );
  return [...new Set(rows.map((r) => Number(r.id)).filter((id) => id > 0))];
}

async function broadcastToRole(roleTag, title, message, data = {}) {
  const userIds = await getUserIdsByRoleTag(roleTag);
  const baseUrl = await getAppBaseUrl();
  const payloadData = { ...data, recipient_role: roleTag };

  if (roleTag === 'delivery' && baseUrl) {
    payloadData.url = `${baseUrl}/delivery/orders`;
    payloadData.web_url = payloadData.url;
  } else if (roleTag === 'store_owner' && baseUrl) {
    payloadData.url = `${baseUrl}/store-owner/dashboard`;
    payloadData.web_url = payloadData.url;
  }

  for (const userId of userIds) {
    await saveNotification(userId, title, message, payloadData);
    await sendPushNotification(title, message, userId, null, payloadData);
  }

  if (!userIds.length) {
    console.warn('[broadcastToRole] No users with role', roleTag);
    await sendPushNotification(title, message, null, roleTag, payloadData);
    return 0;
  }

  return userIds.length;
}

async function notifyDeliveryNewOrder(order) {
  const title = 'Pedido disponible!';
  const message = `Nuevo pedido #${order.unique_order_id} listo para recoger`;
  await broadcastToRole('delivery', title, message, {
    order_id: Number(order.id),
    unique_order_id: order.unique_order_id,
    type: 'delivery_order',
  });
}

async function notifyDeliveryOrderAssigned(order, deliveryUserId) {
  const uid = Number(deliveryUserId);
  const title = 'Pedido asignado';
  const message = `Te asignaron el pedido #${order.unique_order_id}`;
  const data = {
    type: 'delivery_assigned',
    recipient_role: 'delivery',
    order_id: Number(order.id),
    unique_order_id: order.unique_order_id,
  };
  await saveNotification(uid, title, message, data);
  const pushResult = await sendPushNotification(title, message, uid, null, data);
  if (!pushResult || pushResult.ok === false) {
    console.warn('[notifyDeliveryOrderAssigned] Push no entregado', {
      deliveryUserId: uid,
      orderId: order.id,
      reason: pushResult?.reason || 'unknown',
      failureCount: pushResult?.failureCount,
    });
  }
  return pushResult;
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

const CUSTOMER_ORDER_EVENTS = {
  accepted: { title: 'Pedido aceptado', message: (o) => `La tienda aceptó tu pedido #${o.unique_order_id}` },
  cancelled: { title: 'Pedido cancelado', message: (o) => `Tu pedido #${o.unique_order_id} fue cancelado` },
  delivered: { title: 'Pedido entregado', message: (o) => `Tu pedido #${o.unique_order_id} fue entregado. ¡Gracias!` },
  scheduled_confirmed: { title: 'Pedido programado confirmado', message: (o) => `La tienda confirmó tu pedido programado #${o.unique_order_id}` },
};

async function notifyCustomerOrderEvent(order, event) {
  const def = CUSTOMER_ORDER_EVENTS[event];
  if (!def || !order || !order.user_id) return;
  const title = def.title;
  const message = def.message(order);
  const data = { order_id: order.id, unique_order_id: order.unique_order_id, type: `order_${event}`, recipient_role: 'customer' };
  await saveNotification(order.user_id, title, message, data);
  await sendPushNotification(title, message, order.user_id, null, { ...data, order_id: String(order.id) });
}

module.exports = {
  sendPushNotification,
  saveNotification,
  saveFCMToken,
  getUserIdsByRoleTag,
  getDeliveryPushStatus,
  broadcastToRole,
  notifyStoreNewOrder,
  notifyDeliveryNewOrder,
  notifyDeliveryOrderAssigned,
  notifyAdminNewDelivery,
  notifyCustomerDeliveryAccepted,
  notifyCustomerOrderOnWay,
  notifyCustomerOrderEvent,
};
