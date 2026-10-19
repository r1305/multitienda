const { QueryTypes } = require('sequelize');
const { toMoney, toPositiveId, DEFAULT_CASH_METHOD } = require('./orderRules');

// Modelo de negocio: la plataforma recibe todo el dinero (Mercado Pago a su cuenta, efectivo vía cierre de caja
// del repartidor) y liquida después a repartidores y tiendas. Montos siempre desde la BD; el admin solo ingresa
// el monto recibido en un cierre de caja y el monto de un depósito.

class SettlementError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'SettlementError';
    this.status = status;
  }
}

const MAX_AMOUNT = 99999999;

function parseAmount(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return null;
  return toMoney(n);
}

function cleanText(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

// Efectivo que el repartidor debe entregar: pedido COD entregado con saldo por cobrar (payable) y sin cierre
function isCashPending(order) {
  if (!order) return false;
  const mode = typeof order.payment_mode === 'string' ? order.payment_mode.trim().toUpperCase() : '';
  return mode === DEFAULT_CASH_METHOD && toMoney(order.payable) > 0 && !order.cash_collection_id;
}

function ids(rows) {
  return rows.map((r) => Number(r.id));
}

function sumBy(rows, key) {
  return toMoney(rows.reduce((acc, r) => acc + Number(r[key] || 0), 0));
}

const CASH_PENDING_FROM = `FROM orders o
  JOIN accept_deliveries ad ON ad.order_id = o.id
  WHERE ad.user_id = ? AND o.orderstatus_id = 5 AND o.payment_mode = ? AND COALESCE(o.payable, 0) > 0
    AND o.cash_collection_id IS NULL`;

async function listPendingCashOrders(sequelize, deliveryGuyId, t) {
  return sequelize.query(
    `SELECT o.id, o.unique_order_id, o.payable, o.created_at, o.updated_at ${CASH_PENDING_FROM} ORDER BY o.id ASC`,
    { replacements: [deliveryGuyId, DEFAULT_CASH_METHOD], type: QueryTypes.SELECT, transaction: t }
  );
}

// Cierra caja: marca los pedidos COD pendientes del repartidor con el cierre. Idempotente por pedido
// (cash_collection_id IS NULL bajo FOR UPDATE): un pedido no puede cerrarse dos veces.
async function closeCashCollection(sequelize, { deliveryGuyId, receivedAmount, note, adminId, orderIds }) {
  const dgId = toPositiveId(deliveryGuyId);
  if (!dgId) throw new SettlementError('Repartidor inválido');
  const received = parseAmount(receivedAmount);
  if (received === null) throw new SettlementError('Monto recibido inválido');
  let wanted = null;
  if (Array.isArray(orderIds) && orderIds.length) {
    wanted = [...new Set(orderIds.map(toPositiveId))];
    if (wanted.some((x) => !x)) throw new SettlementError('Pedido inválido');
  }

  return sequelize.transaction(async (t) => {
    const rows = await sequelize.query(
      `SELECT o.id, o.payable ${CASH_PENDING_FROM}${wanted ? ' AND o.id IN (?)' : ''} ORDER BY o.id ASC FOR UPDATE`,
      { replacements: wanted ? [dgId, DEFAULT_CASH_METHOD, wanted] : [dgId, DEFAULT_CASH_METHOD], type: QueryTypes.SELECT, transaction: t }
    );
    if (!rows.length) throw new SettlementError('No hay pedidos en efectivo pendientes de cierre', 409);
    if (wanted && rows.length !== wanted.length) {
      throw new SettlementError('Algunos pedidos ya fueron cerrados o no corresponden al repartidor', 409);
    }

    const expected = sumBy(rows, 'payable');
    const difference = toMoney(received - expected);
    const [collectionId] = await sequelize.query(
      'INSERT INTO cash_collections (delivery_guy_id, expected_amount, received_amount, difference, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      { replacements: [dgId, expected, received, difference, cleanText(note, 500) || null, toPositiveId(adminId)], type: QueryTypes.INSERT, transaction: t }
    );
    const [, affected] = await sequelize.query(
      'UPDATE orders SET cash_collection_id = ? WHERE id IN (?) AND cash_collection_id IS NULL',
      { replacements: [collectionId, ids(rows)], type: QueryTypes.UPDATE, transaction: t }
    );
    if (affected !== rows.length) throw new SettlementError('Los pedidos cambiaron durante el cierre, reintenta', 409);
    return { id: collectionId, expected_amount: expected, received_amount: received, difference, orders: rows.length };
  });
}

// Liquida las ganancias pendientes del repartidor (incluye propinas). El monto sale de la BD.
async function registerDeliveryPayout(sequelize, { deliveryGuyId, reference, note, adminId }) {
  const dgId = toPositiveId(deliveryGuyId);
  if (!dgId) throw new SettlementError('Repartidor inválido');
  const ref = cleanText(reference, 255);
  if (!ref) throw new SettlementError('La referencia del pago es obligatoria');

  return sequelize.transaction(async (t) => {
    const rows = await sequelize.query(
      'SELECT id, amount FROM delivery_earnings WHERE user_id = ? AND payout_id IS NULL ORDER BY id ASC FOR UPDATE',
      { replacements: [dgId], type: QueryTypes.SELECT, transaction: t }
    );
    const amount = sumBy(rows, 'amount');
    if (!rows.length || amount <= 0) throw new SettlementError('No hay ganancias pendientes de pago', 409);

    const [payoutId] = await sequelize.query(
      'INSERT INTO delivery_payouts (delivery_guy_id, amount, reference, note, created_by) VALUES (?, ?, ?, ?, ?)',
      { replacements: [dgId, amount, ref, cleanText(note, 500) || null, toPositiveId(adminId)], type: QueryTypes.INSERT, transaction: t }
    );
    const [, affected] = await sequelize.query(
      'UPDATE delivery_earnings SET payout_id = ? WHERE id IN (?) AND payout_id IS NULL',
      { replacements: [payoutId, ids(rows)], type: QueryTypes.UPDATE, transaction: t }
    );
    if (affected !== rows.length) throw new SettlementError('Las ganancias cambiaron durante el pago, reintenta', 409);
    return { id: payoutId, amount, earnings: rows.length };
  });
}

// Saldo del repartidor: efectivo pendiente de entregar, entregado, ganancias acumuladas / pagadas / pendientes
async function getDeliveryBalance(sequelize, deliveryGuyId) {
  const dgId = toPositiveId(deliveryGuyId);
  if (!dgId) throw new SettlementError('Repartidor inválido');
  const [cash] = await sequelize.query(
    `SELECT COALESCE(SUM(o.payable), 0) AS amount, COUNT(*) AS orders ${CASH_PENDING_FROM}`,
    { replacements: [dgId, DEFAULT_CASH_METHOD], type: QueryTypes.SELECT }
  );
  const [delivered] = await sequelize.query(
    'SELECT COALESCE(SUM(received_amount), 0) AS amount, COUNT(*) AS closings FROM cash_collections WHERE delivery_guy_id = ?',
    { replacements: [dgId], type: QueryTypes.SELECT }
  );
  const [earn] = await sequelize.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COALESCE(SUM(tip_amount), 0) AS tips,
       COALESCE(SUM(CASE WHEN payout_id IS NULL THEN amount ELSE 0 END), 0) AS pending,
       COALESCE(SUM(CASE WHEN payout_id IS NOT NULL THEN amount ELSE 0 END), 0) AS paid
     FROM delivery_earnings WHERE user_id = ?`,
    { replacements: [dgId], type: QueryTypes.SELECT }
  );
  return {
    cash_pending: toMoney(cash && cash.amount),
    cash_pending_orders: Number((cash && cash.orders) || 0),
    cash_delivered: toMoney(delivered && delivered.amount),
    cash_closings: Number((delivered && delivered.closings) || 0),
    earnings_total: toMoney(earn && earn.total),
    earnings_tips: toMoney(earn && earn.tips),
    earnings_pending: toMoney(earn && earn.pending),
    earnings_paid: toMoney(earn && earn.paid),
  };
}

async function listCashCollections(sequelize, deliveryGuyId, limit = 50) {
  return sequelize.query(
    `SELECT cc.*, (SELECT COUNT(*) FROM orders o WHERE o.cash_collection_id = cc.id) AS orders_count
     FROM cash_collections cc WHERE cc.delivery_guy_id = ? ORDER BY cc.id DESC LIMIT ?`,
    { replacements: [toPositiveId(deliveryGuyId), limit], type: QueryTypes.SELECT }
  );
}

async function listDeliveryPayouts(sequelize, deliveryGuyId, limit = 50) {
  return sequelize.query(
    'SELECT * FROM delivery_payouts WHERE delivery_guy_id = ? ORDER BY id DESC LIMIT ?',
    { replacements: [toPositiveId(deliveryGuyId), limit], type: QueryTypes.SELECT }
  );
}

module.exports = {
  SettlementError,
  parseAmount,
  cleanText,
  isCashPending,
  listPendingCashOrders,
  closeCashCollection,
  registerDeliveryPayout,
  getDeliveryBalance,
  listCashCollections,
  listDeliveryPayouts,
};
