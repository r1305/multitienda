const test = require('node:test');
const assert = require('node:assert');
const { storeSliderUrl, resolveSliderUrl, sliderUrlFromForm } = require('../src/helpers/sliderLink');
const { shouldNotifyDelivery } = require('../src/helpers/orderRules');

test('slider: la tienda elegida manda sobre el enlace libre y apunta a /store/<slug>', () => {
  assert.strictEqual(storeSliderUrl('pizza-roma'), '/store/pizza-roma');
  assert.strictEqual(storeSliderUrl('  '), null);
  assert.strictEqual(sliderUrlFromForm({ store_slug: 'café tía', url: 'https://x.com' }), '/store/caf%C3%A9%20t%C3%ADa');
  assert.strictEqual(sliderUrlFromForm({ store_slug: '', url: '/explore' }), '/explore');
  assert.strictEqual(sliderUrlFromForm({}), null);
});

test('slider: solo acepta http(s) o rutas internas y quita el prefijo de montaje', () => {
  assert.strictEqual(resolveSliderUrl('https://promo.example.com/a?b=1'), 'https://promo.example.com/a?b=1');
  assert.strictEqual(resolveSliderUrl('javascript:alert(1)'), null);
  assert.strictEqual(resolveSliderUrl('//evil.com'), null);
  assert.strictEqual(resolveSliderUrl('store/x'), null);
  assert.strictEqual(resolveSliderUrl('/apps/multitienda/store/x', '/apps/multitienda'), '/store/x');
  assert.strictEqual(resolveSliderUrl('/apps/multitienda', '/apps/multitienda/'), '/');
  assert.strictEqual(resolveSliderUrl('/a'.repeat(200)), null);
});

test('push a repartidores al crear/pagar: solo domicilio y aceptado', () => {
  assert.strictEqual(shouldNotifyDelivery({ delivery_type: 1, orderstatus_id: 2 }), true);
  assert.strictEqual(shouldNotifyDelivery({ delivery_type: '1', orderstatus_id: '2' }), true);
  assert.strictEqual(shouldNotifyDelivery({ delivery_type: 2, orderstatus_id: 2 }), false);
  assert.strictEqual(shouldNotifyDelivery({ delivery_type: 1, orderstatus_id: 1 }), false);
  assert.strictEqual(shouldNotifyDelivery(null), false);
});
