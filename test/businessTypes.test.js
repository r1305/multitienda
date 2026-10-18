const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

const TYPES = [
  { id: 1, name: 'Restaurante', is_active: 1 },
  { id: 2, name: 'Farmacia', is_active: 1 },
  { id: 3, name: 'Licorería', is_active: 0 },
];

const state = { sql: [] };

const sequelize = {
  QueryTypes: { SELECT: 'SELECT', UPDATE: 'UPDATE' },
  async query(sql, opts = {}) {
    state.sql.push({ sql, opts });
    if (/FROM restaurants r JOIN restaurant_user/.test(sql)) return [[{ id: 5, name: 'Mi comercio', business_type_id: 2 }]];
    if (/FROM business_types WHERE id = \? AND is_active = 1/.test(sql)) {
      return [TYPES.filter((t) => t.id === opts.replacements[0] && t.is_active)];
    }
    if (/FROM business_types WHERE id = \?/.test(sql)) {
      return [TYPES.filter((t) => t.id === opts.replacements[0])];
    }
    if (/FROM business_types WHERE is_active = 1/.test(sql)) {
      return [TYPES.filter((t) => t.is_active).map((t) => ({ id: t.id, name: t.name }))];
    }
    return [[], 0];
  },
};

const bt = require('../src/helpers/businessTypes');

test('rubro: sin valor no valida ni cambia nada', async () => {
  for (const v of [undefined, null, '']) {
    const r = await bt.resolveActiveBusinessTypeId(sequelize, v);
    assert.deepStrictEqual(r, { ok: true, id: null, provided: false });
  }
});

test('rubro: acepta un rubro activo', async () => {
  const r = await bt.resolveActiveBusinessTypeId(sequelize, '2');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.id, 2);
});

test('rubro: rechaza inexistente, inactivo y valores no numéricos', async () => {
  for (const v of [999, 3, 'abc', '-1', '1.5', 0]) {
    const r = await bt.resolveActiveBusinessTypeId(sequelize, v);
    assert.strictEqual(r.ok, false, `debía rechazar ${v}`);
    assert.ok(r.message);
  }
});

test('rubro: un comercio puede conservar su rubro aunque se haya desactivado', async () => {
  const r = await bt.resolveActiveBusinessTypeId(sequelize, 3, { currentId: 3 });
  assert.strictEqual(r.ok, true);
  const otro = await bt.resolveActiveBusinessTypeId(sequelize, 3, { currentId: 2 });
  assert.strictEqual(otro.ok, false);
});

test('filtro: solo se listan rubros activos', async () => {
  const list = await bt.listActiveBusinessTypes(sequelize);
  assert.deepStrictEqual(list.map((t) => t.name), ['Restaurante', 'Farmacia']);
});

test('filtro: por rubro activo; inactivo o inválido da lista vacía; sin filtro devuelve todo', () => {
  const active = [{ id: 1, name: 'Restaurante' }, { id: 2, name: 'Farmacia' }];
  const stores = [
    { id: 10, business_type_id: 2 },
    { id: 11, business_type_id: null },
    { id: 12, business_type_id: 1 },
    { id: 13, business_type_id: 3 },
  ];
  assert.deepStrictEqual(bt.filterStoresByBusinessType(stores, 2, active).map((s) => s.id), [10]);
  assert.deepStrictEqual(bt.filterStoresByBusinessType(stores, '1', active).map((s) => s.id), [11, 12]);
  assert.deepStrictEqual(bt.filterStoresByBusinessType(stores, 3, active), []);
  assert.deepStrictEqual(bt.filterStoresByBusinessType(stores, 'x', active), []);
  assert.strictEqual(bt.filterStoresByBusinessType(stores, undefined, active), stores);
  assert.strictEqual(bt.filterStoresByBusinessType(stores, '', active), stores);
});

test('nombre de rubro: obligatorio y con largo máximo', () => {
  assert.strictEqual(bt.normalizeBusinessTypeName('   ').ok, false);
  assert.strictEqual(bt.normalizeBusinessTypeName('x'.repeat(101)).ok, false);
  assert.deepStrictEqual(bt.normalizeBusinessTypeName('  Pet   shop '), { ok: true, name: 'Pet shop' });
});

test('storeOwner.updateStore rechaza rubro inexistente o inactivo y no actualiza', async () => {
  stub('src/models', {
    sequelize,
    User: {}, Order: {}, Orderitem: {}, OrderItemAddon: {}, Item: {}, ItemCategory: {}, Restaurant: {}, Rating: {},
  });
  stub('src/middleware/auth', { generateToken() { return 't'; } });
  stub('src/helpers/notifications', {});
  const owner = require('../src/controllers/storeOwnerController');
  const fakeRes = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } });

  for (const id of [999, 3]) {
    state.sql = [];
    const res = fakeRes();
    await owner.updateStore({ user: { id: 9 }, body: { name: 'x', business_type_id: id } }, res);
    assert.strictEqual(res.statusCode, 422);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(state.sql.filter((s) => /^UPDATE restaurants/.test(s.sql)).length, 0);
  }

  state.sql = [];
  const ok = fakeRes();
  await owner.updateStore({ user: { id: 9 }, body: { name: 'x', business_type_id: 2 } }, ok);
  assert.strictEqual(ok.body.success, true);
  const upd = state.sql.find((s) => /^UPDATE restaurants/.test(s.sql));
  assert.ok(upd && /business_type_id=\?/.test(upd.sql));
  assert.ok(upd.opts.replacements.includes(2));
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : (p.endsWith('.ejs') ? [p] : []);
  });
}

test('todas las vistas EJS compilan', () => {
  const files = walk(path.join(__dirname, '..', 'views'));
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.doesNotThrow(() => ejs.compile(fs.readFileSync(f, 'utf8'), { filename: f }), f);
  }
});

test('vistas de rubros renderizan y escapan datos', async () => {
  const esc = require('../src/helpers/escapeHtml');
  const views = path.join(__dirname, '..', 'views', 'admin');
  const common = { settings: {}, currency: '$', esc, user: { name: 'a' }, success: null, error: null, appBase: '' };
  const evil = '<img src=x onerror=alert(1)>';

  const list = await ejs.renderFile(path.join(views, 'businessTypes.ejs'), {
    ...common, count: 1, businessTypes: [{ id: 1, name: evil, is_active: 1, stores_count: 2 }],
  });
  assert.ok(!list.includes(evil));
  assert.ok(list.includes('/admin/business-types/new'));

  const stores = await ejs.renderFile(path.join(views, 'stores.ejs'), {
    ...common, count: 1, businessTypeOptions: [{ id: 2, name: evil }],
    stores: [{ id: 1, name: 'T', address: '', is_accepted: 1, is_active: 1, total_earnings: 0, business_type_name: null }],
  });
  assert.ok(!stores.includes(evil));
  assert.ok(stores.includes('name="business_type_id"'));
  assert.ok(stores.includes('Restaurante'));

  const edit = await ejs.renderFile(path.join(views, 'editStore.ejs'), {
    ...common, restaurant: { id: 1, name: 'T', business_type_id: 2 },
    businessTypeOptions: [{ id: 2, name: 'Farmacia', is_active: 1 }, { id: 3, name: 'Licorería', is_active: 0 }],
  });
  assert.ok(/<option value="2" selected>Farmacia<\/option>/.test(edit));
  assert.ok(edit.includes('Cargo del comercio'));
});
