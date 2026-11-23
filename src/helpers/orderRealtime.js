// Espejo del estado de pedido en Firebase Realtime Database: solo escritura desde el servidor
// (sin listeners). SQL es la fuente de verdad; un fallo aquí nunca rompe ni revierte la transición.
// Nodo: orders/{unique_order_id} = { estado, updatedAt }. Sin datos personales.
const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

let db; // undefined: sin inicializar · null: desactivado (sin URL o sin credencial)

function getDb() {
  if (db !== undefined) return db;
  db = null;
  const url = (process.env.FIREBASE_DATABASE_URL || '').trim();
  if (!url) {
    console.log('[orderRealtime] FIREBASE_DATABASE_URL vacío: espejo en RTDB desactivado');
    return db;
  }
  try {
    const app = require('./notifications.impl').getFirebaseApp();
    if (!app) console.log('[orderRealtime] sin credencial de Firebase: espejo en RTDB desactivado');
    else db = require('firebase-admin/database').getDatabaseWithUrl(url, app);
  } catch (err) {
    console.error('[orderRealtime] init:', err.message);
  }
  return db;
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
    const key = await resolveKey(order);
    if (!key || !KEY_RE.test(key)) return;
    await getDb().ref(`orders/${key}`).update({ estado: Number(status), updatedAt: Date.now() });
  } catch (err) {
    console.error('[orderRealtime] pedido', order && order.id, err.message);
  }
}

// order: { id, unique_order_id? }. Con transacción abierta publica tras el commit (si se revierte, no se publica).
// No devuelve promesa: el llamador no espera ni puede fallar por RTDB.
function publishOrderState(order, status, t) {
  try {
    if (!getDb()) return;
    const run = () => { write(order, status); };
    if (t && typeof t.afterCommit === 'function') t.afterCommit(run);
    else run();
  } catch (err) {
    console.error('[orderRealtime]', err.message);
  }
}

function _setDb(value) { db = value; }

module.exports = { publishOrderState, _setDb };
