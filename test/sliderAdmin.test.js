const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const db = { fail: null, slidesFail: false, slidesOtherFail: false, inserted: [] };

function schemaError(column) {
  const err = new Error(`Unknown column '${column}' in 'field list'`);
  err.original = { code: 'ER_BAD_FIELD_ERROR' };
  return err;
}

const sequelize = {
  async query(sql, opts = {}) {
    if (/^INSERT INTO promo_sliders/.test(sql)) {
      if (db.fail) throw db.fail;
      db.inserted.push(opts.replacements);
      return [undefined, 1];
    }
    if (/FROM promo_sliders ORDER BY/.test(sql)) return [[{ id: 7, name: 'Promo', image: '/uploads/a.png' }]];
    if (/FROM slides/.test(sql)) {
      if (db.slidesFail) throw schemaError('sort_position');
      if (db.slidesOtherFail) throw new Error('conexion perdida');
      return [[{ id: 1, image: '/uploads/s.png' }]];
    }
    return [[], 0];
  },
};

stub('src/models', { sequelize });

const admin = require('../src/admin/controllers/adminController');

function fakeReqRes(body = {}, file = null) {
  const flashes = {};
  const req = {
    body,
    file,
    params: {},
    session: { user: { id: 1 } },
    flash(type, msg) {
      if (msg === undefined) { const v = flashes[type] || []; delete flashes[type]; return v; }
      (flashes[type] = flashes[type] || []).push(msg);
      return undefined;
    },
  };
  const res = {
    rendered: null,
    redirected: null,
    render(view, locals) { this.rendered = { view, locals }; return this; },
    redirect(url) { this.redirected = url; return this; },
  };
  return { req, res, flashes };
}

test('slider: alta guarda imagen y destino en promo_sliders', async () => {
  db.fail = null;
  const { req, res, flashes } = fakeReqRes({ name: 'Promo', store_slug: 'pizza' }, { filename: 'x.png', path: '/no/existe' });
  await admin.createSlider(req, res);
  assert.deepStrictEqual(db.inserted.pop(), ['Promo', 0, 0, '/uploads/x.png', '/store/pizza']);
  assert.deepStrictEqual(flashes.success, ['Slider created']);
  assert.strictEqual(res.redirected, '/admin/promo-sliders');
});

test('slider: si falta la columna avisa de migrate.js y borra la imagen subida', async () => {
  const tmp = path.join(os.tmpdir(), `slider-${process.pid}-${Date.now()}.png`);
  fs.writeFileSync(tmp, 'x');
  db.fail = schemaError('url');
  const { req, res, flashes } = fakeReqRes({ name: 'Promo' }, { filename: path.basename(tmp), path: tmp });
  await admin.createSlider(req, res);
  db.fail = null;
  assert.match(flashes.error[0], /migrate\.js/);
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(fs.existsSync(tmp), false);
});

test('slider: el listado del admin no se cae si la tabla slides no casa con el esquema', async () => {
  db.slidesFail = true;
  const { req, res } = fakeReqRes();
  await admin.sliders(req, res);
  db.slidesFail = false;
  assert.strictEqual(res.rendered.locals.error, undefined);
  assert.strictEqual(res.rendered.locals.sliders.length, 1);
  assert.deepStrictEqual(res.rendered.locals.sliders[0].slides, []);
});

test('slider: un error que no es de esquema en slides se registra y el listado sigue', async () => {
  db.slidesOtherFail = true;
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a);
  const { req, res } = fakeReqRes();
  try { await admin.sliders(req, res); } finally { console.error = orig; db.slidesOtherFail = false; }
  assert.deepStrictEqual(logged, [['[sliders]', 'conexion perdida']]);
  assert.strictEqual(res.rendered.locals.error, undefined);
  assert.deepStrictEqual(res.rendered.locals.sliders[0].slides, []);
});
