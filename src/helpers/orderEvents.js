// Ruta única de notificaciones por evento de pedido.
// Un fallo al notificar nunca debe romper la transición de estado: se registra y se continúa.
function slimOrder(order) {
  const o = order && typeof order.toJSON === 'function' ? order.toJSON() : order;
  return o ? { id: o.id, user_id: o.user_id, unique_order_id: o.unique_order_id, delivery_type: o.delivery_type, restaurant_id: o.restaurant_id, orderstatus_id: o.orderstatus_id } : null;
}

// Eventos: accepted, preparing, ready, cancelled, delivered, scheduled_confirmed, released, paid.
// accepted: avisa al cliente y, si es entrega a domicilio, a los repartidores.
// released: un programado llegó a su hora; solo se avisa a los repartidores.
async function emitOrderEvent(event, order, opts = {}) {
  const o = slimOrder(order);
  if (!o) return;
  try {
    const notifications = opts.notifications || require('./notifications');
    if (event === 'released') {
      if (Number(o.delivery_type) === 1) await notifications.notifyDeliveryNewOrder(o);
      return;
    }
    if (event === 'paid') {
      await notifications.notifyCustomerOrderEvent(o, 'paid');
      await notifications.notifyStoreNewOrder(o, o.restaurant_id);
      if (Number(o.orderstatus_id) === 2 && Number(o.delivery_type) === 1) await notifications.notifyDeliveryNewOrder(o);
      return;
    }
    await notifications.notifyCustomerOrderEvent(o, event);
    if (event === 'accepted' && Number(o.delivery_type) === 1 && opts.notifyDelivery !== false) {
      await notifications.notifyDeliveryNewOrder(o);
    }
  } catch (err) {
    console.error(`[orderEvents] ${event} pedido ${o.id}:`, err.message);
  }
}

module.exports = { emitOrderEvent };
