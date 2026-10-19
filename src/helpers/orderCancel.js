const { Order, sequelize } = require('../models');
const rules = require('./orderRules');
const states = require('./orderStates');
const { walletDeposit } = require('./orderWallet');

// Cancela un pedido (estado 6) con la máquina de estados y reembolsa a la billetera lo pagado con ella
// y en Mercado Pago lo cobrado allí; si el reembolso de Mercado Pago falla, no se cancela.
// Una sola transacción: bloqueo del pedido, transición condicional y reembolso.
// scope: { user_id } o { restaurant_id } para acotar la pertenencia del pedido.
async function cancelOrderWithRefund({ orderId, actor, scope = {}, from, mercadoPago }) {
  const id = rules.toPositiveId(orderId);
  if (!id) throw new states.OrderStateError('Pedido inválido', 400);
  const t = await sequelize.transaction();
  try {
    const order = await Order.findOne({ where: { id, ...scope }, transaction: t, lock: t.LOCK.UPDATE });
    if (!order) throw new states.OrderStateError('Pedido no encontrado', 404);

    const fromStates = from || [Number(order.orderstatus_id)];
    await states.transition(order, fromStates, states.STATUS.CANCELLED, actor, t, { where: scope });

    const refundAmount = rules.refundableAmount(order);
    let refund = false;
    if (refundAmount > 0) {
      await walletDeposit(t, order.user_id, refundAmount, `Refund for order ${order.unique_order_id}`);
      refund = true;
    }

    const mp = mercadoPago || require('./mercadoPago');
    let mpRefund = null;
    if (mp.needsRefund(order)) {
      try {
        mpRefund = await mp.refundOrderPayment(order);
      } catch (err) {
        console.error(`[orderCancel] reembolso Mercado Pago pedido ${order.id}:`, err.message);
        throw new states.OrderStateError('No se pudo reembolsar el pago en Mercado Pago; el pedido no se canceló', 502);
      }
      await sequelize.query('UPDATE orders SET transaction_id = ? WHERE id = ?', {
        replacements: [mpRefund.transaction_id, order.id],
        transaction: t,
      });
      order.transaction_id = mpRefund.transaction_id;
      refund = true;
    }
    await t.commit();
    return { order, refund, refundAmount, mpRefund };
  } catch (err) {
    if (!t.finished) await t.rollback();
    throw err;
  }
}

module.exports = { cancelOrderWithRefund };
