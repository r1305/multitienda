const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { rewriteRootPathsInHtml } = require('../src/helpers/appBasePath');
const { resolveSliderUrl } = require('../src/helpers/sliderLink');

const storeSrc = fs.readFileSync(path.join(__dirname, '../public/app/js/store.js'), 'utf8');

function loadStore(base) {
  const ctx = {
    Vue: { reactive: (o) => o },
    localStorage: { getItem: () => null, setItem() {} },
    document: { documentElement: { setAttribute() {} } },
    window: base === undefined ? {} : { __APP_BASE_PATH__: base },
  };
  vm.createContext(ctx);
  return vm.runInContext(`${storeSrc}\n;Store`, ctx);
}

test('imageUrl antepone /multitienda a rutas guardadas sin base', () => {
  const S = loadStore('/multitienda');
  assert.strictEqual(S.imageUrl('/uploads/a.png'), '/multitienda/uploads/a.png');
  assert.strictEqual(S.imageUrl('uploads/a.png'), '/multitienda/uploads/a.png');
  assert.strictEqual(S.imageUrl('storage/a.png'), '/multitienda/uploads/a.png');
  assert.strictEqual(S.imageUrl('/multitienda/uploads/a.png'), '/multitienda/uploads/a.png');
  assert.strictEqual(loadStore('/multitienda/').imageUrl('/uploads/a.png'), '/multitienda/uploads/a.png');
});

test('imageUrl con base vacía deja la ruta en la raíz', () => {
  for (const base of [undefined, '']) {
    const S = loadStore(base);
    assert.strictEqual(S.imageUrl('/uploads/a.png'), '/uploads/a.png');
    assert.strictEqual(S.imageUrl('uploads/a.png'), '/uploads/a.png');
  }
});

test('imageUrl respeta URLs absolutas y usa placeholder si no hay imagen', () => {
  const S = loadStore('/multitienda');
  assert.strictEqual(S.imageUrl('https://cdn.x/a.png'), 'https://cdn.x/a.png');
  assert.strictEqual(S.imageUrl('//cdn.x/a.png'), 'https://cdn.x/a.png');
  assert.strictEqual(S.imageUrl('blob:abc'), 'blob:abc');
  assert.ok(S.imageUrl(null).startsWith('data:image/svg+xml,'));
  assert.ok(S.imageUrl('null').startsWith('data:image/svg+xml,'));
});

test('admin: el HTML con /uploads se reescribe con la base', () => {
  const html = '<img src="/uploads/a.png"><img src="/multitienda/uploads/b.png">';
  assert.strictEqual(
    rewriteRootPathsInHtml(html, '/multitienda'),
    '<img src="/multitienda/uploads/a.png"><img src="/multitienda/uploads/b.png">'
  );
  assert.strictEqual(rewriteRootPathsInHtml(html, ''), html);
});

test('slider: la ruta interna guardada con /multitienda se normaliza', () => {
  assert.strictEqual(resolveSliderUrl('/multitienda/store/abc', '/multitienda'), '/store/abc');
  assert.strictEqual(resolveSliderUrl('/store/abc', ''), '/store/abc');
});
