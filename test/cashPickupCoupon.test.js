const test = require('node:test');
const assert = require('node:assert');
const settlements = require('../src/helpers/settlements');

function makeSequelize() {
  const coupons = [{ code: 'ADMIN20', restaurant_id: null }, { code: 'TIENDA20', restaurant_id: 5 }];
  const inserted = [];
  return {
    inserted,
    async query(sql, opts = {}) {
      const r = opts.replacements || [];
      if (/SELECT id FROM store_earnings WHERE order_id/.test(sql)) return [];
      if (/SELECT commission_rate FROM restaurants/.test(sql)) return [{ commission_rate: 10 }];
      if (/FROM coupons WHERE code/.test(sql)) return coupons.filter((c) => c.code === r[0] && (c.restaurant_id === null || c.restaurant_id === r[1]));
      if (/INSERT INTO store_earnings/.test(sql)) { inserted.push(r); return [0, 1]; }
      return [];
    },
  };
}

const base = { id: 1, restaurant_id: 5, delivery_type: 2, payment_mode: 'COD', sub_total: 200 };

test('recojo COD con cupón de plataforma: la plataforma repone el cupón (neto 0)', async () => {
  const sq = makeSequelize();
  const r = await settlements.recordStoreEarning(sq, { ...base, coupon_name: 'ADMIN20', coupon_amount: 20, payable: 180 }, {});
  assert.strictEqual(r.coupon_absorbed_by, 'platform');
  assert.strictEqual(r.commission_amount, 20);
  assert.strictEqual(r.net_amount, 0);
  assert.strictEqual(r.kind, 'cash_pickup_commission');
});

test('recojo COD con cupón de tienda: neto = -comisión', async () => {
  const sq = makeSequelize();
  const r = await settlements.recordStoreEarning(sq, { ...base, coupon_name: 'TIENDA20', coupon_amount: 20, payable: 180 }, {});
  assert.strictEqual(r.coupon_absorbed_by, 'store');
  assert.strictEqual(r.net_amount, -20);
});

test('recojo COD sin cupón: neto = -comisión', async () => {
  const sq = makeSequelize();
  const r = await settlements.recordStoreEarning(sq, { ...base, payable: 200 }, {});
  assert.strictEqual(r.net_amount, -20);
});

test('isCashPickup lanza si falta payable en recojo con efectivo', () => {
  assert.throws(() => settlements.isCashPickup({ id: 9, delivery_type: 2, payment_mode: 'COD' }), /payable/);
  assert.throws(() => settlements.isCashPickup({ id: 9, delivery_type: 2, payment_mode: 'COD', payable: null }), /payable/);
  assert.strictEqual(settlements.isCashPickup({ id: 9, delivery_type: 1, payment_mode: 'COD' }), false);
});
