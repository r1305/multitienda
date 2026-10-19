window.obtenerPosicion = async function obtenerPosicion(opts) {
  const o = Object.assign({ enableHighAccuracy: true, timeout: 10000 }, opts || {});
  const cap = window.Capacitor;
  const nativo = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
  const plugin = nativo && cap.Plugins && cap.Plugins.Geolocation;
  if (plugin) {
    const concedido = (p) => p && (p.location === 'granted' || p.coarseLocation === 'granted');
    let perm = await plugin.checkPermissions();
    if (!concedido(perm)) {
      perm = await plugin.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      if (!concedido(perm)) throw new Error('PERMISO_DENEGADO');
    }
    const pos = await plugin.getCurrentPosition(o);
    return pos.coords;
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS_NO_DISPONIBLE'));
    navigator.geolocation.getCurrentPosition((pos) => resolve(pos.coords), reject, o);
  });
};
