const crypto = require('crypto');
const rules = require('./orderRules');
const states = require('./orderStates');

const API_BASE = 'https://api.mercadopago.com';
const METHOD = 'MERCADOPAGO';
const REQUEST_TIMEOUT_MS = 10000;
const AMOUNT_TOLERANCE = 0.01;

class MercadoPagoError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'MercadoPagoError';
    this.status = status;
  }
}

function isMercadoPago(method) {
  return rules.normalizeMethod(method) === METHOD;
}

function parseTransaction(value) {
  const m = /^mp:([^;]+)(?:;refund:(.+))?$/.exec(String(value || ''));
  return m ? { paymentId: m[1], refundId: m[2] || null } : { paymentId: null, refundId: null };
}

function formatTransaction(paymentId, refundId) {
  return refundId ? `mp:${paymentId};refund:${refundId}` : `mp:${paymentId}`;
}

function publicBaseUrl() {
  let base = String(process.env.APP_URL || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(base)) return null;
  const { getAppBasePath } = require('./appBasePath');
  const prefix = getAppBasePath();
  if (prefix && !base.endsWith(prefix)) base = `${base}${prefix}`;
  return base;
}

async function getConfig(deps = {}) {
  const secrets = deps.paymentSecrets || require('./paymentSecrets');
  const gateway = await secrets.findGateway(METHOD);
  if (!gateway) return null;
  const values = await secrets.loadSecrets(gateway.id);
  return {
    gatewayId: gateway.id,
    isActive: !!Number(gateway.is_active),
    accessToken: values.access_token || null,
    publicKey: values.public_key || null,
    webhookSecret: values.webhook_secret || null,
  };
}

function assertReady(config) {
  if (!config || !config.isActive || !config.accessToken || !config.publicKey) {
    throw new rules.OrderValidationError('Mercado Pago no está disponible en este momento');
  }
}

async function mpRequest(method, path, { accessToken, body, idempotencyKey, fetch } = {}) {
  const doFetch = fetch || globalThis.fetch;
  if (typeof doFetch !== 'function') throw new MercadoPagoError('fetch no disponible en este Node', 500);
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;
  let res;
  try {
    res = await doFetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new MercadoPagoError(`No se pudo conectar con Mercado Pago (${err.name || 'error'})`);
  }
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    const detail = data && (data.message || data.error) ? `: ${String(data.message || data.error).slice(0, 200)}` : '';
    throw new MercadoPagoError(`Mercado Pago respondió ${res.status}${detail}`, res.status >= 500 ? 502 : res.status);
  }
  return data || {};
}

function buildPreference(order, baseUrl) {
  const amount = rules.toMoney(order.payable);
  if (!(amount > 0)) throw new rules.OrderValidationError('El pedido no tiene monto por cobrar con Mercado Pago');
  const orderUrl = `${baseUrl}/order/${encodeURIComponent(order.unique_order_id)}`;
  const item = { id: String(order.id), title: `Pedido ${order.unique_order_id}`, quantity: 1, unit_price: amount };
  if (process.env.MP_CURRENCY) item.currency_id = String(process.env.MP_CURRENCY).trim().toUpperCase();
  return {
    items: [item],
    external_reference: String(order.id),
    notification_url: `${baseUrl}/api/mp/webhook`,
    back_urls: { success: orderUrl, failure: orderUrl, pending: orderUrl },
    auto_return: 'approved',
  };
}

async function createPreference(order, deps = {}) {
  const config = deps.config || await getConfig(deps);
  assertReady(config);
  const baseUrl = deps.baseUrl || publicBaseUrl();
  if (!baseUrl) throw new MercadoPagoError('Falta APP_URL (URL pública) para crear el pago en Mercado Pago', 500);
  const body = buildPreference(order, baseUrl);
  const data = await mpRequest('POST', '/checkout/preferences', { accessToken: config.accessToken, body, fetch: deps.fetch });
  if (!data.init_point) throw new MercadoPagoError('Mercado Pago no devolvió el enlace de pago');
  return { id: data.id || null, init_point: data.init_point };
}

function parseSignatureHeader(header) {
  const out = {};
  String(header || '').split(',').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return out;
}

function buildManifest({ dataId, requestId, ts }) {
  let manifest = '';
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

function verifySignature({ signature, requestId, dataId, secret }) {
  if (!secret || !signature || !dataId) return false;
  const { ts, v1 } = parseSignatureHeader(signature);
  if (!ts || !v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(buildManifest({ dataId, requestId, ts })).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(v1).toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getPayment(paymentId, deps = {}) {
  const config = deps.config || await getConfig(deps);
  if (!config || !config.accessToken) throw new MercadoPagoError('Mercado Pago no está configurado', 503);
  return mpRequest('GET', `/v1/payments/${encodeURIComponent(paymentId)}`, { accessToken: config.accessToken, fetch: deps.fetch });
}

function paidStatusFor(order, restaurant) {
  const auto = !!(restaurant && restaurant.auto_acceptable);
  if (order.is_scheduled) return auto ? states.STATUS.SCHEDULED_CONFIRMED : states.STATUS.SCHEDULED_PENDING;
  return auto ? states.STATUS.ACCEPTED : states.STATUS.PENDING;
}

async function applyApprovedPayment(payment, deps = {}) {
  const models = deps.models || require('../models');
  const { Order, Restaurant, sequelize } = models;
  if (!payment || payment.status !== 'approved') return { changed: false, reason: 'not_approved' };
  const orderId = rules.toPositiveId(payment.external_reference);
  if (!orderId) return { changed: false, reason: 'no_reference' };

  const t = await sequelize.transaction();
  let order;
  let target;
  try {
    order = await Order.findOne({ where: { id: orderId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!order || !isMercadoPago(order.payment_mode)) {
      await t.rollback();
      return { changed: false, reason: 'order_not_found' };
    }
    if (Number(order.orderstatus_id) !== states.STATUS.PAYMENT_PENDING) {
      await t.rollback();
      return { changed: false, reason: 'already_processed' };
    }
    const paid = rules.toMoney(payment.transaction_amount);
    if (paid + AMOUNT_TOLERANCE < rules.toMoney(order.payable)) {
      await t.rollback();
      console.warn(`[mercadoPago] monto pagado menor al del pedido ${order.id}`);
      return { changed: false, reason: 'amount_mismatch' };
    }
    const restaurant = await Restaurant.findByPk(order.restaurant_id, { attributes: ['id', 'auto_acceptable'], transaction: t });
    target = paidStatusFor(order, restaurant);
    await states.transition(order, [states.STATUS.PAYMENT_PENDING], target, 'system', t);
    await sequelize.query('UPDATE orders SET transaction_id = ? WHERE id = ?', {
      replacements: [formatTransaction(payment.id), order.id],
      transaction: t,
    });
    await t.commit();
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err instanceof states.OrderStateError) return { changed: false, reason: 'already_processed' };
    throw err;
  }

  order.orderstatus_id = target;
  order.transaction_id = formatTransaction(payment.id);
  const { emitOrderEvent } = deps.orderEvents || require('./orderEvents');
  await emitOrderEvent('paid', order, deps.eventOpts || {});
  return { changed: true, status: target };
}

function needsRefund(order) {
  if (!order || !isMercadoPago(order.payment_mode)) return false;
  const tx = parseTransaction(order.transaction_id);
  return !!tx.paymentId && !tx.refundId;
}

async function refundOrderPayment(order, deps = {}) {
  const tx = parseTransaction(order.transaction_id);
  if (!tx.paymentId) throw new MercadoPagoError('El pedido no tiene un pago de Mercado Pago registrado', 409);
  if (tx.refundId) return { id: tx.refundId, transaction_id: order.transaction_id, alreadyRefunded: true };
  const config = deps.config || await getConfig(deps);
  if (!config || !config.accessToken) throw new MercadoPagoError('Mercado Pago no está configurado', 503);
  const data = await mpRequest('POST', `/v1/payments/${encodeURIComponent(tx.paymentId)}/refunds`, {
    accessToken: config.accessToken,
    body: {},
    idempotencyKey: `refund-order-${order.id}`,
    fetch: deps.fetch,
  });
  if (!data.id) throw new MercadoPagoError('Mercado Pago no confirmó el reembolso');
  return { id: String(data.id), amount: data.amount, transaction_id: formatTransaction(tx.paymentId, data.id), alreadyRefunded: false };
}

module.exports = {
  METHOD,
  MercadoPagoError,
  isMercadoPago,
  parseTransaction,
  formatTransaction,
  publicBaseUrl,
  getConfig,
  assertReady,
  buildPreference,
  createPreference,
  parseSignatureHeader,
  buildManifest,
  verifySignature,
  getPayment,
  paidStatusFor,
  applyApprovedPayment,
  needsRefund,
  refundOrderPayment,
};
