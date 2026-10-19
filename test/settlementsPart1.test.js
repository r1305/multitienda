const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const rules = require('../src/helpers/orderRules');
const settlements = require('../src/helpers/settlements');

// Base en memoria que interpreta solo las consultas de settlements.js
function makeDb() {
  const db = {
    orders: [], accept: [], collections: [], earnings: [], payouts: [], nextId: 1, locks: 0, rolledBack: 0,
  };
  const sequelize = {
    async transaction(fn) {
      const snap = JSON.stringify([db.orders, db.collections, db.earnings, db.payouts, db.nextId]);
      try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) {
        [db.orders, db.collections, db.earnings, db.payouts, db.nextId] = JSON.parse(snap);
        db.rolledBack++;
        throw e;
      }
    },
    async query(sql, opts = {}) {
      const r = opts.replacements || [];
      if (/FOR UPDATE/.test(sql)) db.locks++;
      if (/FROM orders o\s+JOIN accept_deliveries/.test(sql) && /SELECT o\.id, o\.payable/.test(sql)) {
        const [dg, mode, wanted] = r;
        return db.orders.filter((o) => db.accept.some((a) => a.order_id === o.id && a.user_id === dg)
          && o.orderstatus_id === 5 && o.payment_mode === mode && Number(o.payable) > 0 && !o.cash_collection_id
          && (!wanted || wanted.includes(o.id)));
      }
      if (/FROM orders o\s+JOIN accept_deliveries/.test(sql) && /COALESCE\(SUM\(o\.payable\)/.test(sql)) {
        const rows = db.orders.filter((o) => db.accept.some((a) => a.order_id === o.id && a.user_id === r[0])
          && o.orderstatus_id === 5 && o.payment_mode === r[1] && Number(o.payable) > 0 && !o.cash_collection_id);
        return [{ amount: rows.reduce((s, o) => s + Number(o.payable), 0), orders: rows.length }];
      }
      if (/INSERT INTO cash_collections/.test(sql)) {
        const id = db.nextId++;
        db.collections.push({ id, delivery_guy_id: r[0], expected_amount: r[1], received_amount: r[2], difference: r[3], note: r[4], created_by: r[5] });
        return [id, 1];
      }
      if (/UPDATE orders SET cash_collection_id/.test(sql)) {
        let n = 0;
        db.orders.forEach((o) => { if (r[1].includes(o.id) && !o.cash_collection_id) { o.cash_collection_id = r[0]; n++; } });
        return [undefined, n];
      }
      if (/FROM cash_collections WHERE delivery_guy_id/.test(sql) && /SUM\(received_amount\)/.test(sql)) {
        const rows = db.collections.filter((c) => c.delivery_guy_id === r[0]);
        return [{ amount: rows.reduce((s, c) => s + c.received_amount, 0), closings: rows.length }];
      }
      if (/SELECT id, amount FROM delivery_earnings/.test(sql)) {
        return db.earnings.filter((e) => e.user_id === r[0] && !e.payout_id);
      }
      if (/INSERT INTO delivery_payouts/.test(sql)) {
        const id = db.nextId++;
        db.payouts.push({ id, delivery_guy_id: r[0], amount: r[1], reference: r[2], note: r[3], created_by: r[4] });
        return [id, 1];
      }
      if (/UPDATE delivery_earnings SET payout_id/.test(sql)) {
        let n = 0;
        db.earnings.forEach((e) => { if (r[1].includes(e.id) && !e.payout_id) { e.payout_id = r[0]; n++; } });
        return [undefined, n];
      }
      if (/FROM delivery_earnings WHERE user_id/.test(sql) && /SUM\(amount\)/.test(sql)) {
        const rows = db.earnings.filter((e) => e.user_id === r[0]);
        const sum = (f) => rows.filter(f).reduce((s, e) => s + e.amount, 0);
        return [{ total: sum(() => true), tips: rows.reduce((s, e) => s + (e.tip_amount || 0), 0), pending: sum((e) => !e.payout_id), paid: sum((e) => !!e.payout_id) }];
      }
      throw new Error('SQL no soportado en el test: ' + sql.slice(0, 80));
    },
  };
  return { db, sequelize };
}

function cashOrder(id, payable, extra = {}) {
  return { id, orderstatus_id: 5, payment_mode: 'COD', payable, cash_collection_id: null, ...extra };
}

test('propina va 100% al repartidor y se suma a su ganancia', () => {
  const dg = { commission_type: 'fixed', fixed_commission: 4 };
  const res = rules.computeDeliveryPayout(dg, { tip_amount: 3.5, delivery_charge: 6 });
  assert.deepStrictEqual(res, { commission: 4, tip: 3.5, amount: 7.5 });
  assert.strictEqual(rules.computeDeliveryPayout(dg, { tip_amount: null }).amount, 4);
  assert.strictEqual(rules.computeDeliveryPayout(null, { tip_amount: 2 }).amount, 2);
  const pct = { commission_type: 'percentage', percentage_base: 'delivery_charge', commission_rate: 50 };
  assert.strictEqual(rules.computeDeliveryPayout(pct, { delivery_charge: 6, tip_amount: 1 }).amount, 4);
});

test('isCashPending solo cuenta COD con saldo por cobrar y sin cierre', () => {
  assert.strictEqual(settlements.isCashPending(cashOrder(1, 25)), true);
  assert.strictEqual(settlements.isCashPending(cashOrder(1, 0)), false);
  assert.strictEqual(settlements.isCashPending(cashOrder(1, 25, { payment_mode: 'MERCADOPAGO' })), false);
  assert.strictEqual(settlements.isCashPending(cashOrder(1, 25, { payment_mode: 'WALLET' })), false);
  assert.strictEqual(settlements.isCashPending(cashOrder(1, 25, { cash_collection_id: 3 })), false);
});

test('cierre de caja con diferencia: queda registrada y marca los pedidos', async () => {
  const { db, sequelize } = makeDb();
  db.orders.push(cashOrder(1, 30.5), cashOrder(2, 19.5), cashOrder(3, 10, { payment_mode: 'MERCADOPAGO' }));
  db.accept.push({ order_id: 1, user_id: 7 }, { order_id: 2, user_id: 7 }, { order_id: 3, user_id: 7 });
  const res = await settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: '45.00', note: 'faltó cambio', adminId: 1 });
  assert.strictEqual(res.expected_amount, 50);
  assert.strictEqual(res.received_amount, 45);
  assert.strictEqual(res.difference, -5);
  assert.strictEqual(res.orders, 2);
  assert.strictEqual(db.collections.length, 1);
  assert.strictEqual(db.collections[0].note, 'faltó cambio');
  assert.strictEqual(db.orders[0].cash_collection_id, res.id);
  assert.strictEqual(db.orders[1].cash_collection_id, res.id);
  assert.strictEqual(db.orders[2].cash_collection_id, null);
  assert.ok(db.locks >= 1, 'debe bloquear con FOR UPDATE');
});

test('no se puede cerrar un pedido dos veces', async () => {
  const { db, sequelize } = makeDb();
  db.orders.push(cashOrder(1, 30), cashOrder(2, 20));
  db.accept.push({ order_id: 1, user_id: 7 }, { order_id: 2, user_id: 7 });
  await settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: 50, adminId: 1 });
  await assert.rejects(
    () => settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: 50, adminId: 1 }),
    (e) => e instanceof settlements.SettlementError && e.status === 409
  );
  await assert.rejects(
    () => settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: 30, adminId: 1, orderIds: [1] }),
    (e) => e.status === 409
  );
  assert.strictEqual(db.collections.length, 1);
});

test('cierre parcial por pedidos elegidos y pedidos de otro repartidor no entran', async () => {
  const { db, sequelize } = makeDb();
  db.orders.push(cashOrder(1, 30), cashOrder(2, 20), cashOrder(3, 8));
  db.accept.push({ order_id: 1, user_id: 7 }, { order_id: 2, user_id: 7 }, { order_id: 3, user_id: 9 });
  const res = await settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: 30, orderIds: ['1'] });
  assert.strictEqual(res.expected_amount, 30);
  assert.strictEqual(db.orders[1].cash_collection_id, null);
  await assert.rejects(
    () => settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: 8, orderIds: [3] }),
    (e) => e.status === 409
  );
});

test('cierre rechaza montos inválidos', async () => {
  const { db, sequelize } = makeDb();
  db.orders.push(cashOrder(1, 30));
  db.accept.push({ order_id: 1, user_id: 7 });
  for (const bad of [-1, 'abc', NaN, Infinity, '', null, undefined]) {
    await assert.rejects(() => settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: bad }), (e) => e.status === 400);
  }
  assert.strictEqual(db.collections.length, 0);
  const ok = await settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: 0 });
  assert.strictEqual(ok.difference, -30);
});

test('saldo del repartidor: efectivo pendiente/entregado y ganancias pendientes/pagadas', async () => {
  const { db, sequelize } = makeDb();
  db.orders.push(cashOrder(1, 30), cashOrder(2, 20));
  db.accept.push({ order_id: 1, user_id: 7 }, { order_id: 2, user_id: 7 });
  db.earnings.push({ id: 1, user_id: 7, amount: 5, tip_amount: 1 }, { id: 2, user_id: 7, amount: 4.5, tip_amount: 0 });
  await settlements.closeCashCollection(sequelize, { deliveryGuyId: 7, receivedAmount: 30, orderIds: [1] });
  let b = await settlements.getDeliveryBalance(sequelize, 7);
  assert.strictEqual(b.cash_pending, 20);
  assert.strictEqual(b.cash_delivered, 30);
  assert.strictEqual(b.earnings_total, 9.5);
  assert.strictEqual(b.earnings_tips, 1);
  assert.strictEqual(b.earnings_pending, 9.5);
  const p = await settlements.registerDeliveryPayout(sequelize, { deliveryGuyId: 7, reference: 'YAPE-123', note: 'semana', adminId: 1 });
  assert.strictEqual(p.amount, 9.5);
  b = await settlements.getDeliveryBalance(sequelize, 7);
  assert.strictEqual(b.earnings_pending, 0);
  assert.strictEqual(b.earnings_paid, 9.5);
});

test('liquidación de ganancias: exige referencia y no paga dos veces', async () => {
  const { db, sequelize } = makeDb();
  db.earnings.push({ id: 1, user_id: 7, amount: 5 });
  await assert.rejects(() => settlements.registerDeliveryPayout(sequelize, { deliveryGuyId: 7, reference: '  ' }), (e) => e.status === 400);
  await settlements.registerDeliveryPayout(sequelize, { deliveryGuyId: 7, reference: 'R1' });
  await assert.rejects(() => settlements.registerDeliveryPayout(sequelize, { deliveryGuyId: 7, reference: 'R2' }), (e) => e.status === 409);
  assert.strictEqual(db.payouts.length, 1);
  assert.strictEqual(db.earnings[0].payout_id, db.payouts[0].id);
});

test('vistas admin de caja compilan y renderizan', async () => {
  const dir = path.join(__dirname, '..', 'views', 'admin');
  for (const f of ['cashCollections.ejs', 'deliveryAccount.ejs']) {
    ejs.compile(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: path.join(dir, f) });
  }
  const esc = require('../src/helpers/escapeHtml');
  const base = { esc, settings: {}, currency: 'S/', csrfToken: 'x', appBase: '', user: { name: 'Admin' } };
  const html1 = await ejs.renderFile(path.join(dir, 'cashCollections.ejs'), { ...base, guys: [{ id: 7, name: '<b>Ana</b>', phone: '1', cash_pending: 50, cash_orders: 2, earnings_pending: 9.5 }] });
  assert.ok(html1.includes('&lt;b&gt;Ana') && html1.includes('50.00'));
  const html2 = await ejs.renderFile(path.join(dir, 'deliveryAccount.ejs'), {
    ...base, guy: { id: 7, name: 'Ana' },
    balance: { cash_pending: 50, cash_pending_orders: 2, cash_delivered: 0, cash_closings: 0, earnings_total: 9.5, earnings_tips: 1, earnings_pending: 9.5, earnings_paid: 0 },
    pendingOrders: [{ id: 1, unique_order_id: 'A1', payable: 30, updated_at: new Date() }],
    closings: [{ id: 1, created_at: new Date(), orders_count: 2, expected_amount: 50, received_amount: 45, difference: -5, note: 'n' }],
    payouts: [{ id: 1, created_at: new Date(), amount: 9.5, reference: 'R', note: null }],
  });
  assert.ok(html2.includes('close-cash') && html2.includes('pay-earnings') && html2.includes('Confirmar cierre'));
});
