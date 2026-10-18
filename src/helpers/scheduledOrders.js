const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const states = require('./orderStates');
const { emitOrderEvent } = require('./orderEvents');

// Zona horaria de negocio (America/Lima, UTC-5 fijo, sin horario de verano).
const BUSINESS_UTC_OFFSET = '-05:00';
const THROTTLE_MS = parseInt(process.env.SCHEDULED_RELEASE_THROTTLE_MS || '30000', 10);
const LEAD_MS = parseInt(process.env.SCHEDULED_RELEASE_LEAD_MIN || '0', 10) * 60 * 1000;
const BATCH = 200;

let lastRun = 0;
let inFlight = null;

function unwrap(v) {
  if (v == null) return '';
  const raw = String(v).trim();
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed.trim() : raw;
  } catch (_) {
    return raw;
  }
}

// Fecha/hora programada (instante UTC) a partir de schedule_date ("YYYY-MM-DD") y schedule_slot ("HH:MM" o rango "HH:MM-HH:MM").
function parseScheduledAt(order) {
  const date = unwrap(order && order.schedule_date);
  const slot = unwrap(order && order.schedule_slot);
  const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  const tm = /(\d{1,2}):(\d{2})/.exec(slot);
  if (!dm || !tm) return null;
  const hh = String(tm[1]).padStart(2, '0');
  const ts = new Date(`${dm[1]}-${dm[2]}-${dm[3]}T${hh}:${tm[2]}:00${BUSINESS_UTC_OFFSET}`).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function isDue(order, now = Date.now()) {
  const at = parseScheduledAt(order);
  return at != null && at - LEAD_MS <= now;
}

// Libera (11 -> 2) los programados confirmados cuya hora llegó y avisa a los repartidores.
// Sin timers: se invoca bajo demanda desde los listados de tienda, repartidor y admin.
async function releaseDueScheduledOrders({ force = false, now = Date.now() } = {}) {
  if (inFlight) return inFlight;
  if (!force && now - lastRun < THROTTLE_MS) return 0;
  lastRun = now;
  inFlight = (async () => {
    let released = 0;
    try {
      const rows = await sequelize.query(
        'SELECT id, user_id, unique_order_id, delivery_type, schedule_date, schedule_slot FROM orders WHERE orderstatus_id = ? AND is_scheduled = 1 ORDER BY id LIMIT ?',
        { replacements: [states.STATUS.SCHEDULED_CONFIRMED, BATCH], type: QueryTypes.SELECT }
      );
      for (const row of rows) {
        if (!isDue(row, now)) continue;
        try {
          await states.transition(row, [states.STATUS.SCHEDULED_CONFIRMED], states.STATUS.ACCEPTED, 'system');
          released++;
          await emitOrderEvent('released', row);
        } catch (err) {
          if (!(err instanceof states.OrderStateError)) console.error('[scheduledOrders] liberar', row.id, err.message);
        }
      }
    } catch (err) {
      console.error('[scheduledOrders]', err.message);
    }
    return released;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

module.exports = { parseScheduledAt, isDue, releaseDueScheduledOrders };
