const { QueryTypes } = require('sequelize');
const { sequelize } = require('../../models');
const settlements = require('../../helpers/settlements');
const { toPositiveId, DEFAULT_CASH_METHOD } = require('../../helpers/orderRules');

function adminId(req) {
  return req.session && req.session.user ? req.session.user.id : null;
}

function flashError(req, err, fallback) {
  if (err instanceof settlements.SettlementError) {
    req.flash('error', err.message);
  } else {
    console.error(fallback, err.message);
    req.flash('error', fallback);
  }
}

async function findDeliveryGuy(id) {
  const rows = await sequelize.query(
    `SELECT u.id, u.name, u.phone FROM users u
     INNER JOIN model_has_roles mr ON mr.model_id = u.id
     INNER JOIN roles r ON r.id = mr.role_id
     WHERE u.id = ? AND r.name = 'Delivery Guy' LIMIT 1`,
    { replacements: [id], type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

// Listado de repartidores con efectivo por entregar y ganancias pendientes de pago
exports.cashCollections = async (req, res) => {
  try {
    const guys = await sequelize.query(
      `SELECT u.id, u.name, u.phone, u.is_active,
        (SELECT COALESCE(SUM(o.payable), 0) FROM orders o JOIN accept_deliveries ad ON ad.order_id = o.id
          WHERE ad.user_id = u.id AND o.orderstatus_id = 5 AND o.payment_mode = ? AND COALESCE(o.payable, 0) > 0 AND o.cash_collection_id IS NULL) AS cash_pending,
        (SELECT COUNT(*) FROM orders o JOIN accept_deliveries ad ON ad.order_id = o.id
          WHERE ad.user_id = u.id AND o.orderstatus_id = 5 AND o.payment_mode = ? AND COALESCE(o.payable, 0) > 0 AND o.cash_collection_id IS NULL) AS cash_orders,
        (SELECT COALESCE(SUM(de.amount), 0) FROM delivery_earnings de WHERE de.user_id = u.id AND de.payout_id IS NULL) AS earnings_pending
       FROM users u
       INNER JOIN model_has_roles mr ON mr.model_id = u.id
       INNER JOIN roles r ON r.id = mr.role_id
       WHERE r.name = 'Delivery Guy'
       ORDER BY cash_pending DESC, u.id DESC`,
      { replacements: [DEFAULT_CASH_METHOD, DEFAULT_CASH_METHOD], type: QueryTypes.SELECT }
    );
    res.render('admin/cashCollections', { user: req.session.user, guys, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error('cashCollections error:', err.message);
    res.render('admin/cashCollections', { user: req.session.user, guys: [], success: null, error: 'Error al cargar la caja de repartidores' });
  }
};

// Cuenta de un repartidor: pedidos en efectivo sin cierre, cierres, ganancias pendientes y pagos
exports.deliveryAccount = async (req, res) => {
  const id = toPositiveId(req.params.id);
  try {
    const guy = id ? await findDeliveryGuy(id) : null;
    if (!guy) {
      req.flash('error', 'Repartidor no encontrado');
      return res.redirect('/admin/cash-collections');
    }
    const [balance, pendingOrders, closings, payouts] = await Promise.all([
      settlements.getDeliveryBalance(sequelize, id),
      settlements.listPendingCashOrders(sequelize, id),
      settlements.listCashCollections(sequelize, id, 100),
      settlements.listDeliveryPayouts(sequelize, id, 100),
    ]);
    res.render('admin/deliveryAccount', {
      user: req.session.user, guy, balance, pendingOrders, closings, payouts,
      success: req.flash('success')[0], error: req.flash('error')[0],
    });
  } catch (err) {
    console.error('deliveryAccount error:', err.message);
    req.flash('error', 'Error al cargar la cuenta del repartidor');
    res.redirect('/admin/cash-collections');
  }
};

exports.closeCash = async (req, res) => {
  const id = toPositiveId(req.params.id);
  if (!id) return res.redirect('/admin/cash-collections');
  try {
    const raw = req.body.order_ids;
    const orderIds = raw === undefined || raw === null || raw === '' ? [] : (Array.isArray(raw) ? raw : [raw]);
    if (!orderIds.length) {
      req.flash('error', 'Selecciona al menos un pedido para cerrar la caja');
      return res.redirect('/admin/delivery-guy/account/' + id);
    }
    const result = await settlements.closeCashCollection(sequelize, {
      deliveryGuyId: id,
      receivedAmount: req.body.received_amount,
      note: req.body.note,
      adminId: adminId(req),
      orderIds,
    });
    const diff = result.difference;
    req.flash('success', `Cierre #${result.id} registrado: esperado ${result.expected_amount.toFixed(2)}, recibido ${result.received_amount.toFixed(2)}`
      + (diff !== 0 ? ` (diferencia ${diff.toFixed(2)})` : ''));
  } catch (err) {
    flashError(req, err, 'Error al registrar el cierre de caja');
  }
  res.redirect('/admin/delivery-guy/account/' + id);
};

exports.payDeliveryEarnings = async (req, res) => {
  const id = toPositiveId(req.params.id);
  if (!id) return res.redirect('/admin/cash-collections');
  try {
    const result = await settlements.registerDeliveryPayout(sequelize, {
      deliveryGuyId: id,
      reference: req.body.reference,
      note: req.body.note,
      adminId: adminId(req),
    });
    req.flash('success', `Pago #${result.id} registrado por ${result.amount.toFixed(2)}`);
  } catch (err) {
    flashError(req, err, 'Error al registrar el pago de ganancias');
  }
  res.redirect('/admin/delivery-guy/account/' + id);
};
