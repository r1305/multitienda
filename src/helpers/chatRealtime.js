// Chat en Firebase RTDB: SQL (tabla chats) sigue siendo la fuente de verdad. El servidor solo escribe
// (sin listeners): chats/{orderKey}/messages/{id} y chatAccess/{orderKey}/{uid}=true, y emite custom tokens.
// Todo es fire-and-forget: un fallo de RTDB nunca rompe el envío del mensaje ni la asignación.
const orderRealtime = require('./orderRealtime');

const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UID_RE = /^[ud]_\d{1,12}$/;

let signer = null;

// uid Firebase: "u_<id>" cliente, "d_<id>" repartidor (evita colisiones entre roles).
function uidFor(role, userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return `${role === 'delivery' ? 'd' : 'u'}_${id}`;
}

// Con transacción abierta ejecuta tras el commit; sin ella, de inmediato. No devuelve promesa.
function run(t, fn) {
  try {
    if (!orderRealtime.getDb()) return;
    const go = () => { Promise.resolve().then(fn).catch((err) => console.error('[chatRealtime]', err.message)); };
    if (t && typeof t.afterCommit === 'function') t.afterCommit(go);
    else go();
  } catch (err) {
    console.error('[chatRealtime]', err.message);
  }
}

// Espeja la fila ya guardada en chats (mismos campos que devuelve /conversation/chat).
function publishChatMessage(orderKey, messageId, t) {
  const key = String(orderKey || '');
  const id = Number(messageId);
  if (!KEY_RE.test(key) || !Number.isInteger(id) || id <= 0) return;
  run(t, async () => {
    const { QueryTypes } = require('sequelize');
    const { sequelize } = require('../models');
    const rows = await sequelize.query('SELECT * FROM chats WHERE id = ? LIMIT 1', { replacements: [id], type: QueryTypes.SELECT });
    if (!rows || !rows[0]) return;
    await orderRealtime.getDb().ref(`chats/${key}/messages/${id}`).set(JSON.parse(JSON.stringify(rows[0])));
  });
}

// Quien pueda leer el chat de un pedido: add -> true, remove -> se elimina. Un solo update atómico.
function updateChatAccess(orderKey, { add = [], remove = [] } = {}, t) {
  const key = String(orderKey || '');
  if (!KEY_RE.test(key)) return;
  const patch = {};
  remove.filter((u) => UID_RE.test(u)).forEach((u) => { patch[u] = null; });
  add.filter((u) => UID_RE.test(u)).forEach((u) => { patch[u] = true; });
  if (!Object.keys(patch).length) return;
  run(t, () => orderRealtime.getDb().ref(`chatAccess/${key}`).update(patch));
}

function grantCustomerAccess(order, userId, t) {
  updateChatAccess(order && order.unique_order_id, { add: [uidFor('customer', userId)] }, t);
}

// Asigna o reasigna repartidor: da acceso al nuevo y quita el del anterior.
function assignDeliveryAccess(order, newUserId, oldUserId, t) {
  const add = uidFor('delivery', newUserId);
  const old = uidFor('delivery', oldUserId);
  updateChatAccess(order && order.unique_order_id, { add: [add], remove: old && old !== add ? [old] : [] }, t);
}

// Custom token para signInWithCustomToken. null si el chat en tiempo real no está disponible.
async function issueToken(role, userId) {
  const uid = uidFor(role, userId);
  if (!uid || !orderRealtime.getDb()) return null;
  const claims = { role: role === 'delivery' ? 'delivery' : 'customer' };
  if (signer) return { token: await signer(uid, claims), uid };
  const admin = require('firebase-admin');
  const app = require('./notifications.impl').getFirebaseApp();
  if (!app) return null;
  return { token: await admin.auth(app).createCustomToken(uid, claims), uid };
}

function _setSigner(fn) { signer = fn; }

module.exports = { uidFor, publishChatMessage, updateChatAccess, grantCustomerAccess, assignDeliveryAccess, issueToken, _setSigner };
