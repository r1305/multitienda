const impl = require('./notifications.impl');
const { enqueue } = require('./notificationQueue');

async function sendPushNotification(title, message, userId = null, role = null, data = {}) {
  return enqueue('push', { title, message, userId, role, data });
}

async function notifyStoreNewOrder(order, restaurantId) {
  return enqueue('notifyStoreNewOrder', { args: [order, restaurantId] });
}

async function notifyDeliveryNewOrder(order) {
  return enqueue('notifyDeliveryNewOrder', { args: [order] });
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
  saveNotification: impl.saveNotification,
  saveFCMToken: impl.saveFCMToken,
  notifyStoreNewOrder,
  notifyDeliveryNewOrder,
  notifyAdminNewDelivery,
  notifyCustomerDeliveryAccepted,
  notifyCustomerOrderOnWay,
};
