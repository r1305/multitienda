const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const settlements = require('../src/helpers/settlements');

// Base en memoria que interpreta solo las consultas de la liquidación a tiendas
function makeDb() {
  const db = {
    restaurants: [{ id: 5, commission_rate: 10 }, { id: 6, commission_rate: 0 }],
    coupons: [{ code: 'ADMIN10', restaurant_id: null }, { code: 'TIENDA5', restaurant_id: 5 }],
    earnings: [], payouts: [], nextId: 1, locks: 0,
  };
  const sequelize = {
    async transaction(fn) {
      const snap = JSON.stringify([db.earnings, db.payouts, db.nextId]);
      try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) {
        [db.earnings, db.payouts, db.nextId] = JSON.parse(snap);
        throw e;
      }
    },
    async query(sql, opts = {}) {
      const r = opts.replacements || [];
      if (/FOR UPDATE/.test(sql)) db.locks++;
      if (/SELECT id FROM store_earnings WHERE order_id/.test(sql)) return db.earnings.filter((e) => e.order_id === r[0]);
      if (/SELECT commission_rate FROM restaurants/.test(sql)) return db.restaurants.filter((x) => x.id === r[0]);
      if (/SELECT restaurant_id FROM coupons WHERE code/.test(sql)) return db.coupons.filter((c) => c.code === r[0]);
      if (/INSERT INTO store_earnings/.test(sql)) {
        const [restaurant_id, order_id, subtotal, commission_amount, coupon_absorbed_by, coupon_amount, net_amount, notExists] = r;
        if (db.earnings.some((e) => e.order_id === notExists)) return [0, 0];
        db.earnings.push({ id: db.nextId++, restaurant_id, order_id, subtotal, commission_amount, coupon_absorbed_by, coupon_amount, net_amount, payout_id: null });
        return [0, 1];
      }
      if (/SELECT id FROM restaurants WHERE id/.test(sql)) return db.restaurants.filter((x) => x.id === r[0]);
      if (/SELECT id FROM store_payouts WHERE restaurant_id/.test(sql)) {
        return db.payouts.filter((p) => p.restaurant_id === r[0] && ['requested', 'pending'].includes(p.status));
      }
      if (/SELECT id, net_amount FROM store_earnings/.test(sql)) {
        return db.earnings.filter((e) => e.restaurant_id === r[0] && !e.payout_id && e.net_amount > 0);
      }
      if (/INSERT INTO store_payouts/.test(sql)) {
        const id = db.nextId++;
        db.payouts.push({ id, restaurant_id: r[0], user_id: r[1], amount: r[2], status: 'requested' });
        return [id, 1];
      }
      if (/UPDATE store_earnings SET payout_id = \?/.test(sql)) {
        let n = 0;
        db.earnings.forEach((e) => { if (r[1].includes(e.id) && e.restaurant_id === r[2] && !e.payout_id) { e.payout_id = r[0]; n++; } });
        return [undefined, n];
      }
      if (/UPDATE store_earnings SET payout_id = NULL/.test(sql)) {
        db.earnings.forEach((e) => { if (e.payout_id === r[0]) e.payout_id = null; });
        return [undefined, 1];
      }
      if (/SELECT id, amount, status FROM store_payouts WHERE id/.test(sql) || /SELECT id, status FROM store_payouts WHERE id/.test(sql)) {
        return db.payouts.filter((p) => p.id === r[0]);
      }
      if (/UPDATE store_payouts SET status = 'paid'/.test(sql)) {
        const p = db.payouts.find((x) => x.id === r[6] && ['requested', 'pending'].includes(x.status));
        if (!p) return [undefined, 0];
        Object.assign(p, { status: 'paid', paid_amount: r[0], difference: r[1], reference: r[2], paid_at: r[3], notes: r[4], paid_by: r[5] });
        return [undefined, 1];
      }
      if (/UPDATE store_payouts SET status = 'rejected'/.test(sql)) {
        const p = db.payouts.find((x) => x.id === r[2]);
        Object.assign(p, { status: 'rejected', notes: r[0], paid_by: r[1] });
        return [undefined, 1];
      }
      if (/FROM store_earnings WHERE restaurant_id = \? AND payout_id IS NULL/.test(sql) && /SUM\(net_amount\)/.test(sql)) {
        const rows = db.earnings.filter((e) => e.restaurant_id === r[0] && !e.payout_id);
        return [{ v: rows.reduce((s, e) => s + e.net_amount, 0), orders: rows.length }];
      }
      if (/FROM store_earnings WHERE restaurant_id = \?/.test(sql) && /SUM\(net_amount\)/.test(sql)) {
        const rows = db.earnings.filter((e) => e.restaurant_id === r[0]);
        return [{ v: rows.reduce((s, e) => s + e.net_amount, 0), orders: rows.length }];
      }
      if (/FROM store_payouts WHERE restaurant_id = \? AND status IN/.test(sql)) {
        const rows = db.payouts.filter((p) => p.restaurant_id === r[0] && ['requested', 'pending'].includes(p.status));
        return [{ v: rows.reduce((s, p) => s + p.amount, 0) }];
      }
      if (/FROM store_payouts WHERE restaurant_id = \? AND status = 'paid'/.test(sql)) {
        const rows = db.payouts.filter((p) => p.restaurant_id === r[0] && p.status === 'paid');
        return [{ v: rows.reduce((s, p) => s + p.paid_amount, 0) }];
      }
      throw new Error('SQL no soportado en el test: ' + sql.slice(0, 90));
    },
  };
  return { db, sequelize };
}

function order(id, extra = {}) {
  return { id, restaurant_id: 5, sub_total: 100, delivery_charge: 6, tip_amount: 4, coupon_name: null, coupon_amount: 0, total: 110, ...extra };
}

test('comisión se calcula sobre el subtotal (sin envío ni propina)', () => {
  const s = settlements.computeStoreSettlement({ subTotal: 100, commissionRate: 12.5, couponAmount: 0, couponOwner: 'platform' });
  assert.strictEqual(s.commission_amount, 12.5);
  assert.strictEqual(s.net_amount, 87.5);
  assert.strictEqual(settlements.computeStoreSettlement({ subTotal: 100, commissionRate: 0 }).net_amount, 100);
  assert.strictEqual(settlements.computeStoreSettlement({ subTotal: 100, commissionRate: 250 }).net_amount, 0);
});

test('cupón del admin lo asume la plataforma; cupón de la tienda se descuenta a la tienda', () => {
  const admin = settlements.computeStoreSettlement({ subTotal: 100, commissionRate: 10, couponAmount: 20, couponOwner: 'platform' });
  assert.strictEqual(admin.coupon_absorbed_by, 'platform');
  assert.strictEqual(admin.net_amount, 90);
  const store = settlements.computeStoreSettlement({ subTotal: 100, commissionRate: 10, couponAmount: 20, couponOwner: 'store' });
  assert.strictEqual(store.coupon_absorbed_by, 'store');
  assert.strictEqual(store.commission_amount, 10);
  assert.strictEqual(store.net_amount, 70);
  assert.strictEqual(settlements.computeStoreSettlement({ subTotal: 10, commissionRate: 10, couponAmount: 50, couponOwner: 'store' }).net_amount, 0);
});

test('recordStoreEarning aplica la regla del dueño del cupón y es idempotente', async () => {
  const { db, sequelize } = makeDb();
  const t = {};
  const a = await settlements.recordStoreEarning(sequelize, order(1, { coupon_name: 'admin10', coupon_amount: 20 }), t);
  assert.strictEqual(a.created, true);
  assert.strictEqual(db.earnings[0].coupon_absorbed_by, 'platform');
  assert.strictEqual(db.earnings[0].net_amount, 90);
  await settlements.recordStoreEarning(sequelize, order(2, { coupon_name: 'TIENDA5', coupon_amount: 20 }), t);
  assert.strictEqual(db.earnings[1].coupon_absorbed_by, 'store');
  assert.strictEqual(db.earnings[1].net_amount, 70);
  const again = await settlements.recordStoreEarning(sequelize, order(1, { coupon_name: 'admin10', coupon_amount: 20 }), t);
  assert.strictEqual(again.created, false);
  assert.strictEqual(db.earnings.length, 2);
});

test('recordStoreEarning ignora pedidos sin tienda y usa total si falta sub_total', async () => {
  const { db, sequelize } = makeDb();
  assert.strictEqual((await settlements.recordStoreEarning(sequelize, order(1, { restaurant_id: null }), {})).created, false);
  await settlements.recordStoreEarning(sequelize, order(2, { sub_total: null, total: 110, delivery_charge: 6, tip_amount: 4, restaurant_charge: 0 }), {});
  assert.strictEqual(db.earnings[0].subtotal, 100);
});

async function seed(sequelize, n = 3) {
  for (let i = 1; i <= n; i++) await settlements.recordStoreEarning(sequelize, order(i), {});
}

test('solicitud de pago: monto = saldo disponible y marca las liquidaciones', async () => {
  const { db, sequelize } = makeDb();
  await seed(sequelize);
  const bal = await settlements.getStoreBalance(sequelize, 5);
  assert.strictEqual(bal.available, 270);
  const res = await settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 });
  assert.strictEqual(res.amount, 270);
  assert.strictEqual(res.orders, 3);
  assert.ok(db.earnings.every((e) => e.payout_id === res.id));
  const after = await settlements.getStoreBalance(sequelize, 5);
  assert.strictEqual(after.available, 0);
  assert.strictEqual(after.requested, 270);
  assert.ok(db.locks >= 2, 'bloquea tienda y liquidaciones');
});

test('solicitud de pago no excede el saldo y valida el monto', async () => {
  const { db, sequelize } = makeDb();
  await seed(sequelize);
  await assert.rejects(() => settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9, amount: 271 }), (e) => e.status === 400);
  for (const bad of [-5, 0, 'x', NaN, Infinity]) {
    await assert.rejects(() => settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9, amount: bad }), (e) => e.status === 400);
  }
  assert.strictEqual(db.payouts.length, 0);
  const part = await settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9, amount: 200 });
  assert.strictEqual(part.amount, 180);
  assert.strictEqual(part.orders, 2);
  assert.strictEqual(db.earnings.filter((e) => !e.payout_id).length, 1);
});

test('no se permiten dos solicitudes abiertas a la vez, otra tienda sí puede', async () => {
  const { db, sequelize } = makeDb();
  await seed(sequelize, 2);
  await settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 });
  await settlements.recordStoreEarning(sequelize, order(10), {});
  await assert.rejects(
    () => settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 }),
    (e) => e instanceof settlements.SettlementError && e.status === 409
  );
  assert.strictEqual(db.payouts.length, 1);
  await settlements.recordStoreEarning(sequelize, order(11, { restaurant_id: 6 }), {});
  const other = await settlements.requestStorePayout(sequelize, { restaurantId: 6, userId: 10 });
  assert.strictEqual(other.amount, 100);
});

test('solicitud sin saldo falla y no crea registro', async () => {
  const { db, sequelize } = makeDb();
  await assert.rejects(() => settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 }), (e) => e.status === 409);
  await assert.rejects(() => settlements.requestStorePayout(sequelize, { restaurantId: 99, userId: 9 }), (e) => e.status === 404);
  assert.strictEqual(db.payouts.length, 0);
});

test('depósito marca la solicitud como paid y registra la diferencia', async () => {
  const { db, sequelize } = makeDb();
  await seed(sequelize);
  const req = await settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 });
  const dep = await settlements.depositStorePayout(sequelize, { payoutId: req.id, amount: '260.00', paidAt: '2026-10-18', reference: 'TRF-1', note: 'comisión bancaria', adminId: 1 });
  assert.strictEqual(dep.difference, -10);
  const p = db.payouts[0];
  assert.strictEqual(p.status, 'paid');
  assert.strictEqual(p.paid_amount, 260);
  assert.strictEqual(p.difference, -10);
  assert.strictEqual(p.reference, 'TRF-1');
  assert.strictEqual(p.paid_at, '2026-10-18 00:00:00');
  assert.strictEqual(p.paid_by, 1);
  const bal = await settlements.getStoreBalance(sequelize, 5);
  assert.strictEqual(bal.paid, 260);
  assert.strictEqual(bal.requested, 0);
  await assert.rejects(
    () => settlements.depositStorePayout(sequelize, { payoutId: req.id, amount: 270, reference: 'TRF-2' }),
    (e) => e.status === 409
  );
  // con la solicitud pagada la tienda puede pedir de nuevo
  await settlements.recordStoreEarning(sequelize, order(20), {});
  const next = await settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 });
  assert.strictEqual(next.amount, 90);
});

test('depósito valida monto, referencia y fecha', async () => {
  const { db, sequelize } = makeDb();
  await seed(sequelize, 1);
  const req = await settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 });
  for (const amount of [-1, 'abc', '', null, Infinity]) {
    await assert.rejects(() => settlements.depositStorePayout(sequelize, { payoutId: req.id, amount, reference: 'R' }), (e) => e.status === 400);
  }
  await assert.rejects(() => settlements.depositStorePayout(sequelize, { payoutId: req.id, amount: 90, reference: '  ' }), (e) => e.status === 400);
  await assert.rejects(() => settlements.depositStorePayout(sequelize, { payoutId: req.id, amount: 90, reference: 'R', paidAt: '2026-02-31' }), (e) => e.status === 400);
  await assert.rejects(() => settlements.depositStorePayout(sequelize, { payoutId: 999, amount: 90, reference: 'R' }), (e) => e.status === 404);
  assert.strictEqual(db.payouts[0].status, 'requested');
  const zero = await settlements.depositStorePayout(sequelize, { payoutId: req.id, amount: 0, reference: 'R0' });
  assert.strictEqual(zero.difference, -90);
});

test('rechazar la solicitud devuelve el saldo a la tienda', async () => {
  const { db, sequelize } = makeDb();
  await seed(sequelize, 2);
  const req = await settlements.requestStorePayout(sequelize, { restaurantId: 5, userId: 9 });
  await settlements.rejectStorePayout(sequelize, { payoutId: req.id, note: 'datos bancarios incompletos', adminId: 1 });
  assert.strictEqual(db.payouts[0].status, 'rejected');
  assert.ok(db.earnings.every((e) => e.payout_id === null));
  assert.strictEqual((await settlements.getStoreBalance(sequelize, 5)).available, 180);
  await assert.rejects(() => settlements.rejectStorePayout(sequelize, { payoutId: req.id }), (e) => e.status === 409);
});

test('vistas de pagos a tiendas compilan y renderizan', async () => {
  const dir = path.join(__dirname, '..', 'views', 'admin');
  for (const f of ['storePayouts.ejs', 'viewPayout.ejs']) {
    ejs.compile(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: path.join(dir, f) });
  }
  const esc = require('../src/helpers/escapeHtml');
  const base = { esc, settings: {}, currency: 'S/', csrfToken: 'x', appBase: '', user: { name: 'Admin' } };
  const list = await ejs.renderFile(path.join(dir, 'storePayouts.ejs'), {
    ...base,
    payouts: [
      { id: 1, restaurant_name: 'Tienda <x>', amount: 270, status: 'requested', created_at: new Date() },
      { id: 2, restaurant_name: 'Otra', amount: 90, status: 'paid', paid_amount: 85, difference: -5, reference: 'TRF', created_at: new Date() },
    ],
  });
  assert.ok(list.includes('Registrar depósito') && list.includes('Tienda &lt;x&gt;') && list.includes('Pagado'));
  const open = await ejs.renderFile(path.join(dir, 'viewPayout.ejs'), {
    ...base,
    payout: { id: 1, restaurant_name: 'T', amount: 270, status: 'requested', created_at: new Date() },
    earnings: [{ order_id: 1, unique_order_id: 'A1', subtotal: 100, commission_amount: 10, coupon_amount: 0, coupon_absorbed_by: 'platform', net_amount: 90 }],
  });
  assert.ok(open.includes('/admin/store-payout/save') && open.includes('/admin/store-payout/reject') && open.includes('name="paid_amount"'));
  const done = await ejs.renderFile(path.join(dir, 'viewPayout.ejs'), {
    ...base,
    payout: { id: 2, restaurant_name: 'T', amount: 90, status: 'paid', paid_amount: 85, difference: -5, reference: 'TRF', paid_at: new Date(), created_at: new Date() },
    earnings: [],
  });
  assert.ok(!done.includes('/admin/store-payout/save') && done.includes('ya fue procesada'));
});
