const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

function stub(relPath, exports) {
  const file = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

stub('src/helpers/cache', { async get() { return {}; }, async set() {} });
stub('src/admin/controllers/adminController', new Proxy({}, {
  get: (_, name) => (req, res) => res.json({ name: String(name), token: res.locals.csrfToken, file: req.file ? req.file.filename : null }),
}));

const express = require('express');
const cookieParser = require('cookie-parser');
const adminRouter = require('../src/admin/routes/admin');

async function startApp() {
  const flashes = [];
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.session = { user: { role: 'Admin' } };
    req.flash = (type, msg) => { if (msg) flashes.push([type, msg]); return []; };
    next();
  });
  app.use('/', adminRouter);
  app.use((err, req, res, next) => res.status(err.code === 'EBADCSRFTOKEN' ? 403 : 500).json({ code: err.code }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { server, flashes, base: `http://127.0.0.1:${server.address().port}` };
}

function pngForm(field, name = 'x.png', type = 'image/png', extra = {}) {
  const fd = new FormData();
  Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
  fd.append(field, new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type }), name);
  return fd;
}

test('uploads de ajustes: token en la query pasa csurf antes de multer; en el body multipart no', async () => {
  const { server, flashes, base } = await startApp();
  const subidos = [];
  try {
    const page = await fetch(`${base}/admin/settings`);
    const { token } = await page.json();
    const cookie = page.headers.get('set-cookie').split(';')[0];
    assert.ok(token);

    const enBody = await fetch(`${base}/admin/settings/upload-favicon`, { method: 'POST', headers: { cookie }, body: pngForm('favicon', 'x.png', 'image/png', { _csrf: token }) });
    assert.strictEqual(enBody.status, 403);

    for (const [ruta, campo, handler] of [
      ['upload-favicon', 'favicon', 'uploadFavicon'],
      ['upload-logo', 'logo', 'uploadLogo'],
      ['upload-listing-image', 'listingImage', 'uploadListingImage'],
    ]) {
      const r = await fetch(`${base}/admin/settings/${ruta}?_csrf=${encodeURIComponent(token)}`, { method: 'POST', headers: { cookie }, body: pngForm(campo) });
      assert.strictEqual(r.status, 200, ruta);
      const json = await r.json();
      assert.strictEqual(json.name, handler);
      assert.ok(json.file, ruta);
      subidos.push(json.file);
    }

    const svg = await fetch(`${base}/admin/settings/upload-logo?_csrf=${encodeURIComponent(token)}`, { method: 'POST', redirect: 'manual', headers: { cookie, referer: `${base}/admin/settings` }, body: pngForm('logo', 'x.svg', 'image/svg+xml') });
    assert.strictEqual(svg.status, 302);
    assert.strictEqual(svg.headers.get('location'), `${base}/admin/settings`);
    assert.ok(flashes.some(([t, m]) => t === 'error' && /Solo se permiten/.test(m)));
  } finally {
    server.close();
    for (const f of subidos) fs.rmSync(path.join(__dirname, '../public/uploads', f), { force: true });
  }
});
