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

// Cierra caja: marca los pedidos COD elegidos (orderIds obligatorio, nunca "todos" implícito) con el cierre. Idempotente por pedido
// (cash_collection_id IS NULL bajo FOR UPDATE): un pedido no puede cerrarse dos veces.
async function closeCashCollection(sequelize, { deliveryGuyId, receivedAmount, note, adminId, orderIds }) {
  const dgId = toPositiveId(deliveryGuyId);
  if (!dgId) throw new SettlementError('Repartidor inválido');
  const received = parseAmount(receivedAmount);
  if (received === null) throw new SettlementError('Monto recibido inválido');
  if (!Array.isArray(orderIds) || !orderIds.length) throw new SettlementError('Selecciona al menos un pedido para cerrar la caja');
  const wanted = [...new Set(orderIds.map(toPositiveId))];
  if (wanted.some((x) => !x)) throw new SettlementError('Pedido inválido');

  return sequelize.transaction(async (t) => {
    const rows = await sequelize.query(
      `SELECT o.id, o.payable ${CASH_PENDING_FROM} AND o.id IN (?) ORDER BY o.id ASC FOR UPDATE`,
      { replacements: [dgId, DEFAULT_CASH_METHOD, wanted], type: QueryTypes.SELECT, transaction: t }
    );
    if (!rows.length) throw new SettlementError('No hay pedidos en efectivo pendientes de cierre', 409);
    if (rows.length !== wanted.length) {
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

// ─── Liquidación a tiendas ───────────────────────────────────────────────────

const OPEN_PAYOUT = "('requested', 'pending')";

// Tienda recibe: subtotal de productos - comisión (commission_rate % sobre el subtotal, sin envío ni propina).
// Cupón del admin (coupons.restaurant_id NULL): lo absorbe la plataforma. Cupón de la tienda: se descuenta a la tienda.
function computeStoreSettlement({ subTotal, commissionRate, couponAmount, couponOwner }) {
  const sub = toMoney(Math.max(0, Number(subTotal) || 0));
  const rate = Math.min(100, Math.max(0, Number(commissionRate) || 0));
  const commission = toMoney(sub * rate / 100);
  const coupon = toMoney(Math.max(0, Number(couponAmount) || 0));
  const absorbedBy = couponOwner === 'store' ? 'store' : 'platform';
  const storeCoupon = absorbedBy === 'store' ? coupon : 0;
  return {
    subtotal: sub,
    commission_amount: commission,
    coupon_absorbed_by: absorbedBy,
    coupon_amount: coupon,
    net_amount: toMoney(Math.max(0, sub - storeCoupon - commission)),
  };
}

function orderSubTotal(order) {
  if (order.sub_total !== undefined && order.sub_total !== null && order.sub_total !== '') return toMoney(order.sub_total);
  return toMoney(Math.max(0, Number(order.total || 0) - Number(order.delivery_charge || 0)
    - Number(order.restaurant_charge || 0) - Number(order.tip_amount || 0) + Number(order.coupon_amount || 0)));
}

const CASH_PICKUP_KIND = 'cash_pickup_commission';

// Recojo (delivery_type 2) pagado en efectivo: el dinero lo cobra la tienda, no la plataforma
function isCashPickup(order) {
  if (!order || Number(order.delivery_type) !== 2) return false;
  const mode = typeof order.payment_mode === 'string' ? order.payment_mode.trim().toUpperCase() : '';
  if (mode !== DEFAULT_CASH_METHOD) return false;
  return order.payable === undefined || order.payable === null || toMoney(order.payable) > 0;
}

// Crea el registro de liquidación al entregar un pedido (cualquier forma de pago). Debe llamarse dentro de la
// transacción que cambia el pedido a entregado. Idempotente por order_id (UNIQUE + NOT EXISTS).
async function recordStoreEarning(sequelize, order, t) {
  const restaurantId = toPositiveId(order && order.restaurant_id);
  const orderId = toPositiveId(order && order.id);
  if (!restaurantId || !orderId) return { created: false };

  const existing = await sequelize.query(
    'SELECT id FROM store_earnings WHERE order_id = ? LIMIT 1',
    { replacements: [orderId], type: QueryTypes.SELECT, transaction: t }
  );
  if (existing.length) return { created: false };

  const [restaurant] = await sequelize.query(
    'SELECT commission_rate FROM restaurants WHERE id = ? LIMIT 1',
    { replacements: [restaurantId], type: QueryTypes.SELECT, transaction: t }
  );
  const couponAmount = toMoney(order.coupon_amount);
  let couponOwner = 'platform';
  const warnings = [];
  const code = typeof order.coupon_name === 'string' ? order.coupon_name.trim().toUpperCase() : '';
  if (couponAmount > 0) {
    // `coupons.code` no es único: se limita a cupones de la tienda del pedido o del admin (restaurant_id NULL)
    // y, si hay de ambos, gana el de la tienda
    const matches = code
      ? await sequelize.query(
        'SELECT id, restaurant_id FROM coupons WHERE code = ? AND (restaurant_id IS NULL OR restaurant_id = ?)',
        { replacements: [code, restaurantId], type: QueryTypes.SELECT, transaction: t }
      )
      : [];
    if (matches.some((c) => toPositiveId(c.restaurant_id) === restaurantId)) {
      couponOwner = 'store';
    } else if (!matches.length) {
      warnings.push(`cupón "${code}" del pedido ${orderId} no identificado: registrado como absorbido por la plataforma, revisar`);
      console.warn('[settlements]', warnings[warnings.length - 1]);
    }
  }

  const cashPickup = isCashPickup(order);
  const s = computeStoreSettlement({
    subTotal: orderSubTotal(order),
    commissionRate: restaurant ? restaurant.commission_rate : 0,
    couponAmount,
    couponOwner,
  });
  // Recojo en tienda pagado en efectivo: la tienda ya cobró el dinero; la comisión de la plataforma queda como
  // deuda (net_amount negativo) que se descuenta de sus próximas liquidaciones
  const row = cashPickup
    ? { ...s, net_amount: toMoney(-s.commission_amount), kind: CASH_PICKUP_KIND }
    : { ...s, kind: 'sale' };
  await sequelize.query(
    `INSERT INTO store_earnings (restaurant_id, order_id, subtotal, commission_amount, coupon_absorbed_by, coupon_amount, net_amount, kind)
     SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM store_earnings WHERE order_id = ?)`,
    {
      replacements: [restaurantId, orderId, row.subtotal, row.commission_amount, row.coupon_absorbed_by, row.coupon_amount, row.net_amount, row.kind, orderId],
      type: QueryTypes.INSERT,
      transaction: t,
    }
  );
  return { created: true, ...row, warnings };
}

// Saldo de la tienda: disponible = net_amount sin solicitud; solicitado = solicitudes abiertas; pagado = depositado
async function getStoreBalance(sequelize, restaurantId) {
  const rid = toPositiveId(restaurantId);
  if (!rid) throw new SettlementError('Tienda inválida');
  const [total] = await sequelize.query(
    'SELECT COALESCE(SUM(net_amount), 0) AS v, COUNT(*) AS orders FROM store_earnings WHERE restaurant_id = ?',
    { replacements: [rid], type: QueryTypes.SELECT }
  );
  const [available] = await sequelize.query(
    'SELECT COALESCE(SUM(net_amount), 0) AS v, COUNT(*) AS orders FROM store_earnings WHERE restaurant_id = ? AND payout_id IS NULL',
    { replacements: [rid], type: QueryTypes.SELECT }
  );
  const [requested] = await sequelize.query(
    `SELECT COALESCE(SUM(amount), 0) AS v FROM store_payouts WHERE restaurant_id = ? AND status IN ${OPEN_PAYOUT}`,
    { replacements: [rid], type: QueryTypes.SELECT }
  );
  const [paid] = await sequelize.query(
    "SELECT COALESCE(SUM(paid_amount), 0) AS v FROM store_payouts WHERE restaurant_id = ? AND status = 'paid'",
    { replacements: [rid], type: QueryTypes.SELECT }
  );
  return {
    total_net: toMoney(total && total.v),
    orders: Number((total && total.orders) || 0),
    available: toMoney(available && available.v),
    available_orders: Number((available && available.orders) || 0),
    requested: toMoney(requested && requested.v),
    paid: toMoney(paid && paid.v),
  };
}

// La tienda pide el pago de su saldo disponible (o de un monto menor: se toman liquidaciones completas, de la más
// antigua a la más nueva, sin pasar el monto indicado). Una sola solicitud abierta por tienda (bloqueo de la fila).
async function requestStorePayout(sequelize, { restaurantId, userId, amount }) {
  const rid = toPositiveId(restaurantId);
  if (!rid) throw new SettlementError('Tienda inválida');
  let wanted = null;
  if (amount !== undefined && amount !== null && amount !== '') {
    wanted = parseAmount(amount);
    if (wanted === null || wanted <= 0) throw new SettlementError('Monto inválido');
  }

  return sequelize.transaction(async (t) => {
    const locked = await sequelize.query(
      'SELECT id FROM restaurants WHERE id = ? LIMIT 1 FOR UPDATE',
      { replacements: [rid], type: QueryTypes.SELECT, transaction: t }
    );
    if (!locked.length) throw new SettlementError('Tienda no encontrada', 404);

    const open = await sequelize.query(
      `SELECT id FROM store_payouts WHERE restaurant_id = ? AND status IN ${OPEN_PAYOUT} LIMIT 1`,
      { replacements: [rid], type: QueryTypes.SELECT, transaction: t }
    );
    if (open.length) throw new SettlementError('Ya tienes una solicitud de pago abierta', 409);

    const rows = await sequelize.query(
      'SELECT id, net_amount FROM store_earnings WHERE restaurant_id = ? AND payout_id IS NULL AND net_amount <> 0 ORDER BY id ASC FOR UPDATE',
      { replacements: [rid], type: QueryTypes.SELECT, transaction: t }
    );
    const available = sumBy(rows, 'net_amount');
    if (!rows.length || available <= 0) throw new SettlementError('No tienes saldo disponible para solicitar', 409);
    if (wanted !== null && wanted > available) throw new SettlementError('El monto supera tu saldo disponible', 400);

    let selected = rows;
    if (wanted !== null && wanted < available) {
      selected = [];
      let acc = 0;
      for (const r of rows) {
        const next = toMoney(acc + Number(r.net_amount));
        if (next > wanted) break;
        selected.push(r);
        acc = next;
      }
      if (!selected.length) throw new SettlementError('El monto es menor que tu liquidación más antigua', 400);
    }
    const payoutAmount = sumBy(selected, 'net_amount');
    if (payoutAmount <= 0) throw new SettlementError('El monto seleccionado no cubre las deudas pendientes de tu tienda', 400);

    const [payoutId] = await sequelize.query(
      "INSERT INTO store_payouts (restaurant_id, user_id, amount, status, created_at, updated_at) VALUES (?, ?, ?, 'requested', NOW(), NOW())",
      { replacements: [rid, toPositiveId(userId), payoutAmount], type: QueryTypes.INSERT, transaction: t }
    );
    const [, affected] = await sequelize.query(
      'UPDATE store_earnings SET payout_id = ? WHERE id IN (?) AND restaurant_id = ? AND payout_id IS NULL',
      { replacements: [payoutId, ids(selected), rid], type: QueryTypes.UPDATE, transaction: t }
    );
    if (affected !== selected.length) throw new SettlementError('Tu saldo cambió durante la solicitud, reintenta', 409);
    return { id: payoutId, amount: payoutAmount, orders: selected.length, available };
  });
}

function parsePaidAt(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return undefined;
  return `${m[1]}-${m[2]}-${m[3]} 00:00:00`;
}

// El admin registra el depósito: la solicitud pasa a 'paid'. Si el monto depositado difiere del solicitado
// queda registrada la diferencia (paid_amount - amount).
async function depositStorePayout(sequelize, { payoutId, amount, paidAt, reference, note, adminId }) {
  const pid = toPositiveId(payoutId);
  if (!pid) throw new SettlementError('Solicitud inválida');
  const paid = parseAmount(amount);
  if (paid === null || paid <= 0) throw new SettlementError('Monto depositado inválido');
  const ref = cleanText(reference, 255);
  if (!ref) throw new SettlementError('La referencia del depósito es obligatoria');
  const when = parsePaidAt(paidAt);
  if (when === undefined) throw new SettlementError('Fecha de depósito inválida');

  return sequelize.transaction(async (t) => {
    const [payout] = await sequelize.query(
      'SELECT id, amount, status FROM store_payouts WHERE id = ? LIMIT 1 FOR UPDATE',
      { replacements: [pid], type: QueryTypes.SELECT, transaction: t }
    );
    if (!payout) throw new SettlementError('Solicitud no encontrada', 404);
    if (!['requested', 'pending'].includes(payout.status)) throw new SettlementError('La solicitud ya fue procesada', 409);

    const difference = toMoney(paid - toMoney(payout.amount));
    const [, affected] = await sequelize.query(
      `UPDATE store_payouts SET status = 'paid', paid_amount = ?, difference = ?, reference = ?,
         paid_at = COALESCE(?, NOW()), notes = ?, paid_by = ?, updated_at = NOW()
       WHERE id = ? AND status IN ${OPEN_PAYOUT}`,
      { replacements: [paid, difference, ref, when, cleanText(note, 500) || null, toPositiveId(adminId), pid], type: QueryTypes.UPDATE, transaction: t }
    );
    if (affected !== 1) throw new SettlementError('La solicitud ya fue procesada', 409);
    return { id: pid, requested: toMoney(payout.amount), paid_amount: paid, difference };
  });
}

// El admin rechaza la solicitud: las liquidaciones quedan otra vez disponibles para la tienda
async function rejectStorePayout(sequelize, { payoutId, note, adminId }) {
  const pid = toPositiveId(payoutId);
  if (!pid) throw new SettlementError('Solicitud inválida');
  return sequelize.transaction(async (t) => {
    const [payout] = await sequelize.query(
      'SELECT id, status FROM store_payouts WHERE id = ? LIMIT 1 FOR UPDATE',
      { replacements: [pid], type: QueryTypes.SELECT, transaction: t }
    );
    if (!payout) throw new SettlementError('Solicitud no encontrada', 404);
    if (!['requested', 'pending'].includes(payout.status)) throw new SettlementError('La solicitud ya fue procesada', 409);
    await sequelize.query(
      "UPDATE store_payouts SET status = 'rejected', notes = ?, paid_by = ?, updated_at = NOW() WHERE id = ?",
      { replacements: [cleanText(note, 500) || null, toPositiveId(adminId), pid], type: QueryTypes.UPDATE, transaction: t }
    );
    await sequelize.query(
      'UPDATE store_earnings SET payout_id = NULL WHERE payout_id = ?',
      { replacements: [pid], type: QueryTypes.UPDATE, transaction: t }
    );
    return { id: pid };
  });
}

async function listStorePayouts(sequelize, restaurantId, limit = 50) {
  return sequelize.query(
    `SELECT id, amount, status, paid_amount, difference, reference, paid_at, notes, created_at, updated_at
     FROM store_payouts WHERE restaurant_id = ? ORDER BY id DESC LIMIT ?`,
    { replacements: [toPositiveId(restaurantId), limit], type: QueryTypes.SELECT }
  );
}

module.exports = {
  computeStoreSettlement,
  recordStoreEarning,
  isCashPickup,
  CASH_PICKUP_KIND,
  getStoreBalance,
  requestStorePayout,
  depositStorePayout,
  rejectStorePayout,
  listStorePayouts,
  parsePaidAt,
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
