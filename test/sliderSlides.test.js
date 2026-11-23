const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const UPLOADS = path.join(__dirname, '..', 'public', 'uploads');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const db = { sliders: [], slides: [], cascade: true, sql: [], nextId: 100 };

function reset() {
  db.sliders = [{ id: 7, image: '/uploads/promo-7.png' }, { id: 8, image: null }];
  db.slides = [];
  db.cascade = true;
  db.sql = [];
}

const sequelize = {
  async query(sql, opts = {}) {
    const r = opts.replacements || [];
    db.sql.push(sql);
    if (/^SELECT \* FROM promo_sliders ORDER BY/.test(sql)) return [db.sliders.map((s) => ({ ...s }))];
    if (/^SELECT id FROM promo_sliders WHERE id = \?/.test(sql)) return [db.sliders.filter((s) => s.id === r[0]).map((s) => ({ id: s.id }))];
    if (/^SELECT image FROM promo_sliders WHERE id = \?/.test(sql)) return [db.sliders.filter((s) => s.id === r[0])];
    if (/^SELECT \* FROM slides WHERE promo_slider_id = \?/.test(sql)) return [db.slides.filter((s) => s.promo_slider_id === r[0])];
    if (/^SELECT image FROM slides WHERE id = \? AND promo_slider_id = \?/.test(sql)) return [db.slides.filter((s) => s.id === r[0] && s.promo_slider_id === r[1])];
    if (/^INSERT INTO slides/.test(sql)) {
      const [name, image, url, sort_position, promo_slider_id] = r;
      db.slides.push({ id: db.nextId++, name, image, url, sort_position, promo_slider_id });
      return [undefined, 1];
    }
    if (/^DELETE FROM slides WHERE id = \? AND promo_slider_id = \?/.test(sql)) {
      db.slides = db.slides.filter((s) => !(s.id === r[0] && s.promo_slider_id === r[1]));
      return [[], 1];
    }
    if (/^DELETE FROM slides WHERE promo_slider_id = \?/.test(sql)) {
      db.slides = db.slides.filter((s) => s.promo_slider_id !== r[0]);
      return [[], 1];
    }
    if (/^DELETE FROM promo_sliders WHERE id = \?/.test(sql)) {
      db.sliders = db.sliders.filter((s) => s.id !== r[0]);
      if (db.cascade) db.slides = db.slides.filter((s) => s.promo_slider_id !== r[0]);
      return [[], 1];
    }
    return [[], 0];
  },
};

stub('src/models', { sequelize });

const admin = require('../src/admin/controllers/adminController');

function fakeReqRes(params = {}, body = {}, file = null) {
  const flashes = {};
  const req = {
    params,
    body,
    file,
    session: { user: { id: 1 } },
    flash(type, msg) {
      if (msg === undefined) { const v = flashes[type] || []; delete flashes[type]; return v; }
      (flashes[type] = flashes[type] || []).push(msg);
      return undefined;
    },
  };
  const res = { redirected: null, redirect(url) { this.redirected = url; return this; } };
  return { req, res, flashes };
}

test('slides: alta asocia el slide a su promo_slider y valida el destino', async () => {
  reset();
  const { req, res, flashes } = fakeReqRes({ id: '7' }, { name: ' Oferta ', store_slug: 'pizza', sort_position: '3' }, { filename: 'a.png', path: '/no/existe' });
  await admin.createSlide(req, res);
  assert.deepStrictEqual(db.slides, [{ id: 100, name: 'Oferta', image: '/uploads/a.png', url: '/store/pizza', sort_position: 3, promo_slider_id: 7 }]);
  assert.deepStrictEqual(flashes.success, ['Slide created']);
  assert.strictEqual(res.redirected, '/admin/promo-sliders');
});

test('slides: enlace invalido queda sin url y slider inexistente o sin imagen no inserta', async () => {
  reset();
  let c = fakeReqRes({ id: '7' }, { url: 'javascript:alert(1)' }, { filename: 'b.png', path: '/no/existe' });
  await admin.createSlide(c.req, c.res);
  assert.strictEqual(db.slides[0].url, null);

  const tmp = path.join(os.tmpdir(), `slide-${process.pid}-${Date.now()}.png`);
  fs.writeFileSync(tmp, 'x');
  c = fakeReqRes({ id: '999' }, {}, { filename: path.basename(tmp), path: tmp });
  await admin.createSlide(c.req, c.res);
  assert.deepStrictEqual(c.flashes.error, ['Slider not found']);
  await wait(50);
  assert.strictEqual(fs.existsSync(tmp), false);

  c = fakeReqRes({ id: '7' }, {}, null);
  await admin.createSlide(c.req, c.res);
  assert.deepStrictEqual(c.flashes.error, ['Slide requires an image']);
  assert.strictEqual(db.slides.length, 1);
});

test('slides: el listado solo trae los slides de su slider', async () => {
  reset();
  db.slides = [{ id: 1, promo_slider_id: 7, image: '/uploads/x.png' }, { id: 2, promo_slider_id: 8, image: '/uploads/y.png' }];
  let rendered;
  const { req } = fakeReqRes();
  await admin.sliders(req, { render(v, l) { rendered = l; }, redirect() {} });
  const bySlider = Object.fromEntries(rendered.sliders.map((s) => [s.id, s.slides.map((x) => x.id)]));
  assert.deepStrictEqual(bySlider, { 7: [1], 8: [2] });
});

test('slides: borrar un slide exige id y promo_slider_id y borra su archivo local', async () => {
  reset();
  fs.mkdirSync(UPLOADS, { recursive: true });
  const name = `test-slide-${process.pid}-${Date.now()}.png`;
  const file = path.join(UPLOADS, name);
  fs.writeFileSync(file, 'x');
  db.slides = [{ id: 1, promo_slider_id: 7, image: '/uploads/' + name }, { id: 2, promo_slider_id: 8, image: null }];
  try {
    let c = fakeReqRes({ id: '8', slideId: '1' });
    await admin.deleteSlide(c.req, c.res);
    assert.deepStrictEqual(c.flashes.error, ['Slide not found']);
    assert.strictEqual(db.slides.length, 2);
    assert.strictEqual(fs.existsSync(file), true);

    c = fakeReqRes({ id: '7', slideId: '1' });
    await admin.deleteSlide(c.req, c.res);
    assert.deepStrictEqual(c.flashes.success, ['Slide deleted']);
    assert.deepStrictEqual(db.slides.map((s) => s.id), [2]);
    assert.ok(db.sql.some((s) => /^DELETE FROM slides WHERE id = \? AND promo_slider_id = \?/.test(s)));
    await wait(50);
    assert.strictEqual(fs.existsSync(file), false);
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
});

for (const cascade of [true, false]) {
  test(`slides: borrar un promo_slider no deja slides huerfanos (cascade=${cascade})`, async () => {
    reset();
    db.cascade = cascade;
    db.slides = [{ id: 1, promo_slider_id: 7, image: null }, { id: 2, promo_slider_id: 7, image: null }, { id: 3, promo_slider_id: 8, image: null }];
    const { req, res, flashes } = fakeReqRes({ id: '7' });
    await admin.deleteSlider(req, res);
    assert.deepStrictEqual(flashes.success, ['Slider deleted']);
    assert.deepStrictEqual(db.sliders.map((s) => s.id), [8]);
    assert.deepStrictEqual(db.slides.map((s) => s.id), [3]);
    assert.strictEqual(res.redirected, '/admin/promo-sliders');
  });
}

test('slides: borrar un promo_slider inexistente avisa y no toca nada', async () => {
  reset();
  const { req, flashes } = fakeReqRes({ id: '999' });
  await admin.deleteSlider(req, { redirect() {} });
  assert.deepStrictEqual(flashes.error, ['Slider not found']);
  assert.strictEqual(db.sliders.length, 2);
});
