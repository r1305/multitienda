/** Chat en tiempo real (Firebase RTDB, solo lectura). Sin config, sin SDK o sin acceso: no hace nada y el polling sigue como respaldo. */
const ChatRealtime = {
  // opts: { orderKey, role: 'customer'|'delivery', userId, token (JWT), onMessage(msg) }. Devuelve stop().
  watch(opts) {
    const key = String((opts && opts.orderKey) || '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key) || !opts.userId || !opts.token) return () => {};
    const role = opts.role === 'delivery' ? 'delivery' : 'customer';
    const expectedUid = (role === 'delivery' ? 'd_' : 'u_') + opts.userId;
    let stopped = false;
    let listener = null;
    let retryTimer = null;
    let retries = 0;

    const detach = () => {
      if (listener) { try { listener.ref.off('child_added', listener.handler); } catch (e) {} listener = null; }
    };
    const retry = () => {
      detach();
      if (stopped || retries >= 3 || retryTimer) return;
      retries++;
      retryTimer = setTimeout(() => { retryTimer = null; attach(true); }, 2000 * retries);
    };
    const attach = async (renew) => {
      if (stopped || listener) return;
      if (!window.OrderRealtime || !OrderRealtime._ready() || !window.firebase || !window.firebase.auth) return;
      try {
        const app = window.firebase.apps.find((a) => a.name === 'orders-rt');
        const auth = app.auth();
        if (renew || !auth.currentUser || auth.currentUser.uid !== expectedUid) {
          const res = await API.post('/conversation/realtime-token', { token: opts.token, role });
          if (stopped) return;
          if (!res || !res.token) return;
          await auth.signInWithCustomToken(res.token);
          if (stopped) return;
        }
        const ref = app.database().ref('chats/' + key + '/messages');
        const handler = (snap) => { const m = snap.val(); if (m && !stopped) opts.onMessage(m); };
        ref.on('child_added', handler, retry);
        listener = { ref, handler };
      } catch (e) {
        retry();
      }
    };

    attach(false);
    const onSettings = () => attach(false);
    window.addEventListener('app:settings-ready', onSettings);
    return () => {
      stopped = true;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      window.removeEventListener('app:settings-ready', onSettings);
      detach();
    };
  },
};
window.ChatRealtime = ChatRealtime;
