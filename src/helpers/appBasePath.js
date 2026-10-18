const fs = require('fs');
const path = require('path');

const LEGACY_PREFIXES = [
  '/admin',
  '/api',
  '/auth',
  '/delivery',
  '/store-owner',
  '/app',
  '/assets',
  '/uploads',
  '/public',
  '/install',
];

function getAppBasePath() {
  const raw = process.env.APP_BASE_PATH || process.env.APP_MOUNT_PATH || '';
  return String(raw).trim().replace(/\/$/, '');
}

function withAppBase(urlPath) {
  const base = getAppBasePath();
  if (!urlPath || typeof urlPath !== 'string') return urlPath;
  if (!base) return urlPath;
  if (!urlPath.startsWith('/')) return urlPath;
  if (urlPath === base || urlPath.startsWith(`${base}/`)) return urlPath;
  return base + urlPath;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteRootPathsInHtml(html, base) {
  if (!base || typeof html !== 'string' || !html.includes('<')) return html;
  const b = base.replace(/\/$/, '');
  const baseSegment = escapeRegex(b.replace(/^\//, ''));
  const pattern = new RegExp(`(href|action|src)="/(?!${baseSegment}/|/)`, 'g');
  return html.replace(pattern, `$1="${b}/`);
}

function attachAppBaseMiddleware(app) {
  const base = getAppBasePath();
  app.locals.appBase = base;
  app.locals.u = (p) => withAppBase(p);

  if (!base) return;

  app.use((req, res, next) => {
    res.locals.appBase = base;
    res.locals.u = (p) => withAppBase(p);

    const origRedirect = res.redirect.bind(res);
    res.redirect = function redirectWithBase(url, ...args) {
      let target = url;
      if (typeof target === 'string' && target.startsWith('/') && !target.startsWith(`${base}/`) && target !== base) {
        target = base + target;
      }
      return origRedirect(target, ...args);
    };

    const origSend = res.send.bind(res);
    res.send = function sendWithBase(body) {
      if (process.env.APP_GATEWAY_MOUNTED !== '1' && typeof body === 'string' && body.includes('<')) {
        body = rewriteRootPathsInHtml(body, base);
      }
      return origSend(body);
    };

    const origRender = res.render.bind(res);
    res.render = function renderWithBase(view, options, callback) {
      if (typeof options === 'function') {
        return origRender(view, { appBase: base, u: withAppBase }, options);
      }
      const opts = options && typeof options === 'object' ? { ...options, appBase: base, u: withAppBase } : { appBase: base, u: withAppBase };
      return origRender(view, opts, callback);
    };

    next();
  });
}

function legacyPathRedirectMiddleware(app) {
  const base = getAppBasePath();
  if (!base) return;
  // En el gateway, /app y /assets ya llegan montados bajo base; redirigir otra vez causa bucle.
  if (process.env.APP_GATEWAY_MOUNTED === '1') return;

  app.use((req, res, next) => {
    const p = req.path || '';
    if (p.startsWith(base)) return next();
    if (p === '/apps' || p.startsWith('/apps/')) return next();
    if (p === '/health') return next();

    const needsRedirect = LEGACY_PREFIXES.some((pre) => p === pre || p.startsWith(`${pre}/`));
    if (needsRedirect) {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(302, `${base}${p}${qs}`);
    }
    next();
  });
}

let spaHtmlTemplate = null;

function getSpaIndexHtml() {
  const base = getAppBasePath();
  if (!spaHtmlTemplate) {
    spaHtmlTemplate = fs.readFileSync(
      path.join(__dirname, '../../public/app/index.html'),
      'utf8'
    );
  }
  if (!base) return spaHtmlTemplate;

  const apiBase = `${base}/api`;
  let html = spaHtmlTemplate.replace(/content="\/api"/, `content="${apiBase}"`);
  // Always rewrite SPA asset paths to include the base path.
  html = html
    .replace(/href="\/app\//g, `href="${base}/app/`)
    .replace(/href="\/assets\//g, `href="${base}/assets/`)
    .replace(/src="\/app\//g, `src="${base}/app/`)
    .replace(
      /document\.write\('<scr'\+'ipt src="\/app\//g,
      `document.write('<scr'+'ipt src="${base}/app/`
    );
  const inject = `<script>window.__APP_BASE_PATH__=${JSON.stringify(base)};</script>`;
  if (!html.includes('__APP_BASE_PATH__')) {
    html = html.replace('</head>', `${inject}</head>`);
  }
  return html;
}

function wrapAppWithBasePath(app) {
  const base = getAppBasePath();
  if (!base || process.env.APP_GATEWAY_MOUNTED === '1') return app;
  const express = require('express');
  const root = express();
  legacyPathRedirectMiddleware(root);
  root.use(base, app);
  return root;
}

function publicUrlPath(pathSuffix) {
  return withAppBase(pathSuffix.startsWith('/') ? pathSuffix : `/${pathSuffix}`);
}

module.exports = {
  getAppBasePath,
  withAppBase,
  attachAppBaseMiddleware,
  legacyPathRedirectMiddleware,
  getSpaIndexHtml,
  wrapAppWithBasePath,
  publicUrlPath,
  rewriteRootPathsInHtml,
};
