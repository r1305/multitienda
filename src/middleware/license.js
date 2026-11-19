const { getLicenseState } = require('../helpers/license');
const { getAppBasePath } = require('../helpers/appBasePath');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Login/logout siguen abiertos para entrar a ver y exportar datos; el webhook de pagos es entrada de un
// tercero y debe seguir registrando pagos ya cobrados.
const ALWAYS_OPEN = new Set([
  '/auth/login',
  '/auth/logout',
  '/api/login',
  '/api/login-with-otp',
  '/api/generate-otp-for-login',
  '/api/store-owner/login',
  '/api/delivery/login',
  '/api/mp/webhook',
]);

const MESSAGE = 'Licencia vencida o suspendida: el sistema está en modo solo lectura. Regulariza el pago para volver a registrar cambios.';

function normalizePath(reqPath) {
  let p = String(reqPath || '/').replace(/\/+$/, '') || '/';
  const base = getAppBasePath();
  if (base && (p === base || p.startsWith(`${base}/`))) p = p.slice(base.length) || '/';
  if (p.startsWith('/public/api')) p = p.slice('/public'.length);
  return p;
}

async function licenseMiddleware(req, res, next) {
  let state;
  try {
    state = await getLicenseState(req.hostname);
  } catch (_) {
    return next();
  }
  res.locals.licenseState = state;
  if (state.mode === 'grace') res.set('X-License-Status', 'grace');
  if (state.mode !== 'readonly' || SAFE_METHODS.has(req.method)) return next();

  const p = normalizePath(req.path);
  if (ALWAYS_OPEN.has(p)) return next();

  res.set('X-License-Status', 'readonly');
  if (p.startsWith('/api') || req.xhr) {
    return res.status(402).json({ success: false, error: MESSAGE, code: 'LICENSE_READONLY' });
  }
  if (typeof req.flash === 'function') {
    req.flash('error', MESSAGE);
    return res.redirect((req.get && req.get('Referrer')) || '/admin');
  }
  return res.status(402).type('text/plain').send(MESSAGE);
}

module.exports = { licenseMiddleware };
