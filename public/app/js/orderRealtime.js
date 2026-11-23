/** Escucha orders/{id} en Firebase Realtime Database (solo lectura). Sin config o sin SDK no hace nada: el polling sigue como respaldo. */
const OrderRealtime = {
  _db: null,

  _ready() {
    if (this._db) return true;
    const s = (typeof Store !== 'undefined' && Store.settings) ? Store.settings : {};
    if (!s.firebaseDatabaseURL || !window.firebase || !window.firebase.database) return false;
    try {
      const NAME = 'orders-rt';
      const app = window.firebase.apps.find((a) => a.name === NAME)
        || window.firebase.initializeApp({
          apiKey: s.firebaseApiKey || undefined,
          projectId: s.firebaseProjectId || undefined,
          appId: s.firebaseAppId || undefined,
          databaseURL: s.firebaseDatabaseURL,
        }, NAME);
      this._db = app.database();
      return true;
    } catch (e) {
      return false;
    }
  },

  // ids: unique_order_id. cb se llama (con debounce) cuando cambia el estado de alguno. Devuelve stop().
  watch(ids, cb) {
    const list = [...new Set((ids || []).map(String).filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)))];
    let stopped = false;
    let timer = null;
    const refs = [];
    const fire = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; if (!stopped) cb(); }, 300); };
    const attach = () => {
      if (stopped || refs.length || !list.length || !this._ready()) return;
      list.forEach((id) => {
        const ref = this._db.ref('orders/' + id);
        let first = true;
        const handler = () => { if (first) { first = false; return; } fire(); };
        ref.on('value', handler, () => {});
        refs.push({ ref, handler });
      });
    };
    attach();
    const onSettings = () => attach();
    window.addEventListener('app:settings-ready', onSettings);
    return () => {
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
      window.removeEventListener('app:settings-ready', onSettings);
      refs.forEach((r) => { try { r.ref.off('value', r.handler); } catch (e) {} });
      refs.length = 0;
    };
  },
};
window.OrderRealtime = OrderRealtime;
