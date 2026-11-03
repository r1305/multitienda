const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const state = { sql: [], existing: new Set(), indexes: new Set() };

const sequelize = {
  async query(sql, opts = {}) {
    state.sql.push(sql);
    if (/information_schema\.COLUMNS/.test(sql) && opts.replacements) {
      return [state.existing.has(opts.replacements.join('.')) ? [{ 1: 1 }] : []];
    }
    if (/information_schema\.COLUMNS/.test(sql)) return [[{ dt: 'varchar' }]];
    if (/information_schema\.STATISTICS/.test(sql)) return [state.indexes.has(opts.replacements[1]) ? [{ 1: 1 }] : []];
    if (/HAVING COUNT/.test(sql)) return [[]];
    return [[], 0];
  },
};

const modelsFile = require.resolve(path.join(__dirname, '..', 'src/models'));
require.cache[modelsFile] = { id: modelsFile, filename: modelsFile, loaded: true, exports: { sequelize } };
const { run } = require('../migrate');

const REQUIRED_COLUMNS = [
  'restaurants.business_type_id', 'popular_geo_places.is_default', 'users.pin_code',
  'restaurants.is_pureveg', 'delivery_guy_details.commission_type', 'addon_categories.type',
  'restaurant_category_restaurant.created_at',
];

test('migrate: crea tablas faltantes y añade columnas que no existen', async () => {
  state.sql = []; state.existing = new Set(); state.indexes = new Set();
  const fail = await run();
  assert.strictEqual(fail, 0);
  for (const t of ['business_types', 'locations', 'pages', 'restaurant_user', 'delivery_ignored_orders', 'chats']) {
    assert.ok(state.sql.some((s) => new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\(`).test(s)), `falta CREATE ${t}`);
  }
  for (const tc of REQUIRED_COLUMNS) {
    const [t, c] = tc.split('.');
    assert.ok(state.sql.some((s) => s.startsWith(`ALTER TABLE ${t} ADD COLUMN ${c} `)), `falta ALTER ${tc}`);
  }
  assert.ok(state.sql.some((s) => s.includes('ADD INDEX `idx_orders_user`')));
});

test('migrate: no repite ALTER ni índices existentes y los seeds no duplican filas', async () => {
  state.sql = [];
  state.existing = new Set(REQUIRED_COLUMNS);
  state.indexes = new Set(['idx_orders_user']);
  await run();
  for (const tc of REQUIRED_COLUMNS) {
    const [t, c] = tc.split('.');
    assert.ok(!state.sql.some((s) => s.startsWith(`ALTER TABLE ${t} ADD COLUMN ${c} `)), `ALTER repetido ${tc}`);
  }
  assert.ok(!state.sql.some((s) => s.includes('ADD INDEX `idx_orders_user`')));
  for (const t of ['roles', 'settings', 'translations']) {
    const seed = state.sql.find((s) => new RegExp(`^INSERT (IGNORE )?INTO ${t} `).test(s));
    assert.ok(seed && /WHERE NOT EXISTS/.test(seed), `seed ${t} no es idempotente`);
  }
  assert.ok(!state.sql.some((s) => /DROP |TRUNCATE |DELETE FROM/i.test(s)));
});

test('migrate: siembra Español (es) por defecto con JSON válido y sin _csrf, antes que English', async () => {
  state.sql = [];
  await run();
  const i = state.sql.findIndex((s) => /SELECT 'Español', 'es', 1, 1, '/.test(s));
  assert.ok(i >= 0 && /WHERE NOT EXISTS \(SELECT 1 FROM translations WHERE language_code = 'es'\)/.test(state.sql[i]));
  assert.ok(i < state.sql.findIndex((s) => /SELECT 'English', 'en'/.test(s)));
  const data = JSON.parse(state.sql[i].match(/'es', 1, 1, '(.*)', NOW\(\)/s)[1].replace(/''/g, "'"));
  assert.strictEqual(data.footerCart, 'Carrito');
  assert.ok(!('_csrf' in data));
  const fixSql = require('fs').readFileSync(path.join(__dirname, '..', 'db/fix-schema.sql'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(fixSql.includes(state.sql[i] + ';'), 'db/fix-schema.sql desalineado con migrate.js');
});
