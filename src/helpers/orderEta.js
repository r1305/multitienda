// Tiempo estimado de entrega (ETA) calculado en servidor.
// eta_at = created_at + prep_minutes + tiempo de traslado.
// Traslado (solo entrega a domicilio): TRAVEL_MIN_PER_KM minutos por km de la columna orders.distance,
// con mínimo TRAVEL_MIN_MINUTES y máximo TRAVEL_MAX_MINUTES. Recojo en tienda: 0.
const DEFAULT_PREP_MINUTES = 20;
const MAX_PREP_MINUTES = 180;
const TRAVEL_MIN_PER_KM = 3;
const TRAVEL_MIN_MINUTES = 5;
const TRAVEL_MAX_MINUTES = 60;
const COLUMN_RETRY_MS = 60 * 1000;

function normalizePrepMinutes(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_PREP_MINUTES;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > MAX_PREP_MINUTES) return DEFAULT_PREP_MINUTES;
  return n;
}

function travelMinutes(order) {
  if (Number(order && order.delivery_type) !== 1) return 0;
  const km = Number(order.distance);
  const raw = Number.isFinite(km) && km > 0 ? Math.round(km * TRAVEL_MIN_PER_KM) : TRAVEL_MIN_MINUTES;
  return Math.min(TRAVEL_MAX_MINUTES, Math.max(TRAVEL_MIN_MINUTES, raw));
}

// Devuelve ISO o null (sin fecha de creación, pedido programado, cancelado o entregado).
function computeEtaAt(order, prepMinutes) {
  if (!order) return null;
  const status = Number(order.orderstatus_id);
  if (status === 5 || status === 6 || status === 9) return null;
  if (order.is_scheduled) return null;
  const created = order.created_at ? new Date(order.created_at).getTime() : NaN;
  if (!Number.isFinite(created)) return null;
  const total = normalizePrepMinutes(prepMinutes) + travelMinutes(order);
  return new Date(created + total * 60000).toISOString();
}

// Lee prep_minutes por tienda. Tolera que la columna aún no exista (devuelve mapa vacío).
let missingUntil = 0;
async function loadPrepMinutes(sequelize, restaurantIds, now = Date.now()) {
  const ids = [...new Set((restaurantIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length || now < missingUntil) return {};
  try {
    const [rows] = await sequelize.query('SELECT id, prep_minutes FROM restaurants WHERE id IN (?)', { replacements: [ids] });
    const map = {};
    for (const r of rows) map[r.id] = r.prep_minutes;
    return map;
  } catch (err) {
    missingUntil = now + COLUMN_RETRY_MS;
    return {};
  }
}

async function attachEta(sequelize, orders) {
  const list = (orders || []).filter(Boolean);
  const prep = await loadPrepMinutes(sequelize, list.map((o) => o.restaurant_id));
  for (const o of list) o.eta_at = computeEtaAt(o, prep[o.restaurant_id]);
  return list;
}

function _resetForTests() { missingUntil = 0; }

module.exports = {
  DEFAULT_PREP_MINUTES, MAX_PREP_MINUTES, normalizePrepMinutes, travelMinutes, computeEtaAt, loadPrepMinutes, attachEta, _resetForTests,
};
