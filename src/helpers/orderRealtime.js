// Espejo del estado de pedido en Firebase Realtime Database: solo escritura desde el servidor
// (sin listeners). SQL es la fuente de verdad; un fallo aquí nunca rompe ni revierte la transición.
// Nodo: orders/{unique_order_id} = { estado, updatedAt }. Sin datos personales.
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

let injected; // solo tests: undefined = usar la config real · null = desactivado · objeto = db falsa
let memo = null; // { fingerprint, db }
let lastLogged = null;

// Config desde BD (firebaseConfig) con respaldo en entorno. Nunca memoiza "desactivado":
// si la config cambia (o se invalida al guardar ajustes) se reintenta sin reiniciar el servidor.
async function getDb() {
  if (injected !== undefined) return injected;
  let fp = null;
  try {
    const cfg = await require('./firebaseConfig').getConfig();
    fp = cfg.fingerprint;
    if (!cfg.databaseURL) {
      if (lastLogged !== fp) console.log('[orderRealtime] URL de Realtime Database vacía: espejo en RTDB desactivado');
      lastLogged = fp;
      return null;
    }
    if (memo && memo.fingerprint === fp) return memo.db;
    const app = await require('./notifications.impl').getFirebaseApp();
    if (!app) {
      if (lastLogged !== fp) console.log('[orderRealtime] sin credencial de Firebase: espejo en RTDB desactivado');
      lastLogged = fp;
      return null;
    }
    memo = { fingerprint: fp, db: require('firebase-admin/database').getDatabaseWithUrl(cfg.databaseURL, app) };
    return memo.db;
  } catch (err) {
    if (lastLogged !== fp) console.error('[orderRealtime] init:', err.message);
    lastLogged = fp;
    return null;
  }
}

async function resolveKey(order) {
  if (order && order.unique_order_id) return String(order.unique_order_id);
  const id = Number(order && order.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { QueryTypes } = require('sequelize');
  const { sequelize } = require('../models');
  const rows = await sequelize.query('SELECT unique_order_id FROM orders WHERE id = ? LIMIT 1', { replacements: [id], type: QueryTypes.SELECT });
  return rows && rows[0] ? String(rows[0].unique_order_id || '') : null;
}

async function write(order, status) {
  try {
    const db = await getDb();
    if (!db) return;
    const key = await resolveKey(order);
    if (!key || !KEY_RE.test(key)) return;
    await db.ref(`orders/${key}`).update({ estado: Number(status), updatedAt: Date.now() });
  } catch (err) {
    console.error('[orderRealtime] pedido', order && order.id, err.message);
  }
}

// order: { id, unique_order_id? }. Con transacción abierta publica tras el commit (si se revierte, no se publica).
// No devuelve promesa: el llamador no espera ni puede fallar por RTDB.
function publishOrderState(order, status, t) {
  try {
    const run = () => { write(order, status); };
    if (t && typeof t.afterCommit === 'function') t.afterCommit(run);
    else run();
  } catch (err) {
    console.error('[orderRealtime]', err.message);
  }
}

function _setDb(value) { injected = value; }

module.exports = { publishOrderState, getDb, _setDb };
