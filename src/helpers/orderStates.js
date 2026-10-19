const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');

// Estados de pedido (tabla orderstatus). 12 = en preparación (entre aceptado y listo/asignado)
const STATUS = {
  PENDING: 1,
  ACCEPTED: 2,
  ASSIGNED: 3,
  PICKED_UP: 4,
  DELIVERED: 5,
  CANCELLED: 6,
  SELFPICKUP_READY: 7,
  PAYMENT_PENDING: 8,
  PAYMENT_FAILED: 9,
  SCHEDULED_PENDING: 10,
  SCHEDULED_CONFIRMED: 11,
  PREPARING: 12,
};

// Transiciones permitidas (origen -> destinos). 5 y 6 son terminales.
const TRANSITIONS = {
  1: [2, 6],
  2: [3, 6, 7, 12],
  3: [4, 6],
  4: [5, 6],
  7: [5, 6],
  8: [1, 2, 6, 9, 10, 11],
  9: [6],
  10: [11, 6],
  11: [2, 6],
  12: [3, 6, 7],
  5: [],
  6: [],
};

// Qué estados de origen puede usar cada actor para llegar a cada destino.
const ACTOR_RULES = {
  customer: { 6: [1, 10] },
  store: { 2: [1], 6: [1, 2, 10, 11, 12], 7: [2, 12], 5: [7], 11: [10], 12: [2] },
  admin: { 2: [1], 3: [1, 2, 12], 6: [1, 2, 3, 4, 7, 8, 10, 11, 12], 11: [10], 12: [2] },
  delivery: { 3: [2, 12], 4: [3], 5: [4] },
  system: { 1: [8], 2: [8, 11], 10: [8], 11: [8] },
};

const SCOPE_COLUMNS = ['user_id', 'restaurant_id', 'delivery_type'];

class OrderStateError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = 'OrderStateError';
    this.status = status;
  }
}

function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(Number(to));
}

function allowedFrom(actor, to, from) {
  const rules = ACTOR_RULES[actor];
  if (!rules) throw new OrderStateError('Actor no autorizado para cambiar el estado', 403);
  const actorFrom = rules[to] || [];
  return (Array.isArray(from) ? from : [from])
    .map(Number)
    .filter((f) => canTransition(f, to) && actorFrom.includes(f));
}

// Cambia el estado de forma atómica: UPDATE condicional y affectedRows === 1, o error 409.
// opts.where: columnas de pertenencia adicionales ({ restaurant_id } o { user_id }).
async function transition(order, from, to, actor, t, opts = {}) {
  const orderId = Number(order && typeof order === 'object' ? order.id : order);
  if (!Number.isInteger(orderId) || orderId <= 0) throw new OrderStateError('Pedido inválido', 400);
  const target = Number(to);
  const effective = allowedFrom(actor, target, from);
  if (!effective.length) {
    throw new OrderStateError('Transición de estado no permitida para este pedido');
  }

  let sql = 'UPDATE orders SET orderstatus_id = ?, updated_at = NOW() WHERE id = ? AND orderstatus_id IN (?)';
  const replacements = [target, orderId, effective];
  const scope = opts.where || {};
  for (const col of Object.keys(scope)) {
    if (!SCOPE_COLUMNS.includes(col)) throw new OrderStateError('Filtro de pedido no válido', 400);
    sql += ` AND ${col} = ?`;
    replacements.push(scope[col]);
  }

  const [, affected] = await sequelize.query(sql, { replacements, type: QueryTypes.UPDATE, transaction: t });
  if (affected !== 1) {
    throw new OrderStateError('El pedido ya cambió de estado o no se puede modificar');
  }
  return { id: orderId, from: effective, to: target };
}

module.exports = { STATUS, TRANSITIONS, ACTOR_RULES, OrderStateError, canTransition, allowedFrom, transition };
