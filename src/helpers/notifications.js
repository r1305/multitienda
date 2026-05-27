const impl = require('./notifications.impl');
const { enqueue } = require('./notificationQueue');

async function sendPushNotification(title, message, userId = null, role = null, data = {}) {
  const impl = require('./notifications.impl');
  return impl.sendPushNotification(title, message, userId, role, data);
}

async function broadcastToRole(roleTag, title, message, data = {}) {
  const impl = require('./notifications.impl');
  return impl.broadcastToRole(roleTag, title, message, data);
}

async function notifyStoreNewOrder(order, restaurantId) {
  const impl = require('./notifications.impl');
  return impl.notifyStoreNewOrder(order, restaurantId);
}

async function notifyDeliveryNewOrder(order) {
  return enqueue('notifyDeliveryNewOrder', { args: [order] });
}

async function notifyDeliveryOrderAssigned(order, deliveryUserId) {
  const impl = require('./notifications.impl');
  return impl.notifyDeliveryOrderAssigned(order, deliveryUserId);
}

async function notifyAdminNewDelivery(name, phone) {
  return enqueue('notifyAdminNewDelivery', { args: [name, phone] });
}

async function notifyCustomerDeliveryAccepted(order) {
  return enqueue('notifyCustomerDeliveryAccepted', { args: [order] });
}

async function notifyCustomerOrderOnWay(order) {
  return enqueue('notifyCustomerOrderOnWay', { args: [order] });
}

module.exports = {
  sendPushNotification,
  broadcastToRole,
  saveNotification: impl.saveNotification,
  saveFCMToken: impl.saveFCMToken,
  notifyStoreNewOrder,
  notifyDeliveryNewOrder,
  notifyDeliveryOrderAssigned,
  notifyAdminNewDelivery,
  notifyCustomerDeliveryAccepted,
  notifyCustomerOrderOnWay,
};
