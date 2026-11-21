// Destino de un slider: la ruta SPA de una tienda (/store/<slug>), una ruta interna de la app o una URL http(s).
// Las rutas internas se guardan sin el prefijo de montaje (APP_BASE_PATH): el router del cliente lo añade.
function storeSliderUrl(slug) {
  const s = String(slug == null ? '' : slug).trim();
  return s ? `/store/${encodeURIComponent(s)}` : null;
}

function resolveSliderUrl(value, appBase = '') {
  let raw = String(value == null ? '' : value).trim();
  if (!raw || raw.length > 255) return null;
  if (/^https?:\/\/[^\s]+$/i.test(raw)) return raw;
  if (!raw.startsWith('/') || raw.startsWith('//') || /\s/.test(raw)) return null;
  const base = String(appBase || '').replace(/\/$/, '');
  if (base && (raw === base || raw.startsWith(`${base}/`))) raw = raw.slice(base.length) || '/';
  return raw;
}

function sliderUrlFromForm(body, appBase = '') {
  const b = body || {};
  return storeSliderUrl(b.store_slug) || resolveSliderUrl(b.url, appBase);
}

module.exports = { storeSliderUrl, resolveSliderUrl, sliderUrlFromForm };
