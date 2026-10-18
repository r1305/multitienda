const test = require('node:test');
const assert = require('node:assert');
const rules = require('../src/helpers/orderRules');
const escapeHtml = require('../src/helpers/escapeHtml');

const items = [
  { id: 1, name: 'Pizza', price: '20.00', is_active: true, restaurant_id: 5 },
  { id: 2, name: 'Agua', price: '3.50', is_active: true, restaurant_id: 5 },
  { id: 3, name: 'Inactivo', price: '10.00', is_active: false, restaurant_id: 5 },
  { id: 4, name: 'Otra tienda', price: '1.00', is_active: true, restaurant_id: 9 },
];
const addons = [
  { id: 10, name: 'Queso', price: '4.00', is_active: true, addon_category_id: 100 },
  { id: 11, name: 'Jamón', price: '6.00', is_active: true, addon_category_id: 100 },
  { id: 12, name: 'Apagado', price: '1.00', is_active: false, addon_category_id: 100 },
  { id: 13, name: 'Ajeno', price: '1.00', is_active: true, addon_category_id: 200 },
];
const links = [{ item_id: 1, addon_category_id: 100 }];
const catalog = { items, addons, links, restaurantId: 5 };

test('precio del servidor ignora precios del cliente', () => {
  const lines = rules.normalizeLines([
    { id: 1, quantity: 2, price: 0.01, selectedaddons: [{ addon_id: 10, price: 0 }, { id: 11, price: 0 }] },
    { id: 2, quantity: 3, price: 0 },
  ]);
  const r = rules.priceLines(lines, catalog);
  assert.strictEqual(r.lines[0].unit_price, 10);
  assert.strictEqual(r.lines[1].unit_price, 3.5);
  assert.strictEqual(r.sub_total, 30.5);
});

test('cantidad debe ser entero entre 1 y 99', () => {
  for (const q of [0, -1, 1.5, 100, 'abc', null]) {
    assert.throws(() => rules.normalizeLines([{ id: 1, quantity: q }]), rules.OrderValidationError);
  }
  assert.strictEqual(rules.normalizeLines([{ id: 1, quantity: '3' }])[0].quantity, 3);
});

test('rechaza producto inactivo, de otra tienda o inexistente', () => {
  assert.throws(() => rules.priceLines(rules.normalizeLines([{ id: 3, quantity: 1 }]), catalog), /no está disponible/);
  assert.throws(() => rules.priceLines(rules.normalizeLines([{ id: 4, quantity: 1 }]), catalog), /no pertenece/);
  assert.throws(() => rules.priceLines(rules.normalizeLines([{ id: 99, quantity: 1 }]), catalog), /ya no existe/);
});

test('rechaza complemento inactivo o no vinculado al producto', () => {
  assert.throws(() => rules.priceLines(rules.normalizeLines([{ id: 1, quantity: 1, selectedaddons: [{ addon_id: 12 }] }]), catalog), /no está disponible/);
  assert.throws(() => rules.priceLines(rules.normalizeLines([{ id: 1, quantity: 1, selectedaddons: [{ addon_id: 13 }] }]), catalog), /no corresponde/);
  assert.throws(() => rules.priceLines(rules.normalizeLines([{ id: 2, quantity: 1, selectedaddons: [{ addon_id: 10 }] }]), catalog), /no corresponde/);
});

test('propina numérica y no negativa', () => {
  assert.strictEqual(rules.parseTip(null), 0);
  assert.strictEqual(rules.parseTip('2.555'), 2.56);
  assert.throws(() => rules.parseTip(-1), rules.OrderValidationError);
  assert.throws(() => rules.parseTip('x'), rules.OrderValidationError);
});

test('total nunca negativo', () => {
  assert.strictEqual(rules.computeTotal({ subTotal: 10, couponAmount: 50 }), 0);
  assert.strictEqual(rules.computeTotal({ subTotal: 10, couponAmount: 2, deliveryCharge: 3, restaurantCharge: 1, tip: 0.5 }), 12.5);
});

test('métodos de pago: solo pasarelas activas, COD por defecto y WALLET', () => {
  assert.deepStrictEqual(rules.resolveAllowedMethods([]), ['COD', 'WALLET']);
  const allowed = rules.resolveAllowedMethods(['Yape', 'COD']);
  assert.strictEqual(rules.assertMethodAllowed('yape', allowed), 'YAPE');
  assert.throws(() => rules.assertMethodAllowed('PAYPAL', allowed), rules.OrderValidationError);
  assert.throws(() => rules.assertMethodAllowed(undefined, allowed), rules.OrderValidationError);
});

test('cupones', () => {
  const base = { code: 'X', discount: '10', discount_type: 'PERCENTAGE', count: 0, max_count: 0, max_count_per_user: 0 };
  assert.deepStrictEqual(rules.evaluateCoupon(base, { subTotal: 50 }), { ok: true, amount: 5 });
  assert.strictEqual(rules.evaluateCoupon({ ...base, discount: '150' }, { subTotal: 50 }).ok, false);
  assert.strictEqual(rules.evaluateCoupon({ ...base, max_discount: '2' }, { subTotal: 50 }).amount, 2);
  assert.strictEqual(rules.evaluateCoupon({ ...base, discount_type: 'FIXED', discount: '80' }, { subTotal: 50 }).amount, 50);
  assert.strictEqual(rules.evaluateCoupon({ ...base, restaurant_id: 3 }, { subTotal: 50, restaurantId: 5 }).ok, false);
  assert.strictEqual(rules.evaluateCoupon({ ...base, max_count: 5, count: 5 }, { subTotal: 50 }).message, 'Cupón agotado');
  assert.strictEqual(rules.evaluateCoupon({ ...base, min_sub_total: '60' }, { subTotal: 50 }).ok, false);
  assert.strictEqual(rules.evaluateCoupon({ ...base, max_sub_total: '40' }, { subTotal: 50 }).ok, false);
  assert.strictEqual(rules.evaluateCoupon({ ...base, max_count_per_user: 1 }, { subTotal: 50, userUses: 1 }).ok, false);
  assert.strictEqual(rules.evaluateCoupon(null, { subTotal: 50 }).ok, false);
});

test('billetera: sin cobro doble y saldo insuficiente', () => {
  assert.deepStrictEqual(rules.splitWalletPayment({ method: 'WALLET', total: 20, walletBalance: 25 }), { walletAmount: 20, payable: 0 });
  assert.throws(() => rules.splitWalletPayment({ method: 'WALLET', total: 20, walletBalance: 5 }), /Saldo insuficiente/);
  assert.deepStrictEqual(rules.splitWalletPayment({ method: 'YAPE', total: 20, walletBalance: 5, partialWallet: true }), { walletAmount: 5, payable: 15 });
  assert.deepStrictEqual(rules.splitWalletPayment({ method: 'COD', total: 20, walletBalance: 50, partialWallet: true }), { walletAmount: 20, payable: 0 });
  assert.deepStrictEqual(rules.splitWalletPayment({ method: 'COD', total: 20, walletBalance: 50, partialWallet: false }), { walletAmount: 0, payable: 20 });
});

test('reembolso solo de lo cobrado con billetera', () => {
  assert.strictEqual(rules.refundableAmount({ total: '100', wallet_amount: null, payment_mode: 'YAPE' }), 0);
  assert.strictEqual(rules.refundableAmount({ total: '100', wallet_amount: '30.00', payment_mode: 'COD' }), 30);
});

test('ganancia de repartidor', () => {
  assert.strictEqual(rules.computeDeliveryEarning({ commission_type: 'fixed', fixed_commission: '5' }, {}), 5);
  assert.strictEqual(rules.computeDeliveryEarning({ commission_type: 'percentage', commission_rate: '10', percentage_base: 'delivery_charge' }, { delivery_charge: '8' }), 0.8);
  assert.strictEqual(rules.computeDeliveryEarning({ commission_type: 'dynamic', dynamic_base_distance: 3, dynamic_base_price: 4, dynamic_price_per_km: 1 }, { distance: 5 }), 6);
  assert.strictEqual(rules.computeDeliveryEarning(undefined, {}), 0);
});

test('escapeHtml', () => {
  assert.strictEqual(escapeHtml('<img src=x onerror="a">\'`&'), '&lt;img src=x onerror=&quot;a&quot;&gt;&#39;&#96;&amp;');
  assert.strictEqual(escapeHtml(null), '');
  assert.strictEqual(escapeHtml(0), '0');
});
