const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const state = { calls: [] };

stub('src/models', { sequelize: { async query() { return [[], 0]; } } });
stub('src/helpers/notifications', { async notifyDeliveryNewOrder() {}, async notifyCustomerOrderEvent() {} });
stub('src/helpers/gps', {
  async updateDeliveryGps(...args) { state.calls.push(args); return { success: true, throttled: false }; },
});

const controller = require('../src/controllers/miscControllers');

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (body) => ({ user: { id: 9 }, body });

for (const [name, body] of [
  ['latitud 500', { latitude: 500, longitude: -70 }],
  ['longitud -181', { latitude: -12, longitude: -181 }],
  ['NaN', { latitude: NaN, longitude: -70 }],
  ['string no numérico', { latitude: 'abc', longitude: '-77' }],
  ['Infinity', { latitude: Infinity, longitude: 10 }],
  ['ausentes', {}],
]) {
  test(`setDeliveryGuyGpsLocation rechaza ${name}`, async () => {
    state.calls.length = 0;
    const res = fakeRes();
    await controller.setDeliveryGuyGpsLocation(req(body), res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { success: false, message: 'Coordenadas inválidas' });
    assert.strictEqual(state.calls.length, 0);
  });
}

test('setDeliveryGuyGpsLocation acepta coordenadas válidas y guarda una vez', async () => {
  state.calls.length = 0;
  const res = fakeRes();
  await controller.setDeliveryGuyGpsLocation(req({ latitude: '-12.0464', longitude: -77.0428, heading: 90 }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(state.calls.length, 1);
  assert.deepStrictEqual(state.calls[0], [9, -12.0464, -77.0428, 90]);
});
