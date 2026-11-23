/** Web push via Firebase Cloud Messaging (FCM) */
const PushNotifications = {
  _initPromise: null,
  _messaging: null,
  _serviceWorkerReg: null,
  _registerDebounce: null,
  _lastRegisterKey: null,
  _lastSavedTokenByUser: {},

  _firebaseConfig() {
    const s = (typeof Store !== 'undefined' && Store.settings) ? Store.settings : {};
    return {
      apiKey: s.firebaseApiKey || '',
      authDomain: s.firebaseAuthDomain || '',
      projectId: s.firebaseProjectId || '',
      storageBucket: s.firebaseStorageBucket || '',
      messagingSenderId: s.firebaseMessagingSenderId || '',
      appId: s.firebaseAppId || '',
      measurementId: s.firebaseMeasurementId || '',
    };
  },

  _firebaseVapidKey() {
    return (Store?.settings?.firebaseVapidKey || '').trim();
  },

  isConfigured() {
    const cfg = this._firebaseConfig();
    return !!(cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId);
  },

  isVapidConfigured() {
    return !!this._firebaseVapidKey();
  },

  getBrowserPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission || 'default';
  },

  isReady() {
    return !!window.__fcmReady;
  },

  _appBase() {
    return (typeof window !== 'undefined' && window.__APP_BASE_PATH__)
      ? String(window.__APP_BASE_PATH__).replace(/\/$/, '')
      : '';
  },

  _pathStartsWith(segment) {
    const p = window.location.pathname || '';
    const seg = segment.startsWith('/') ? segment : `/${segment}`;
    const base = this._appBase();
    return p.startsWith(seg) || (base && p.startsWith(`${base}${seg}`));
  },

  serviceWorkerUrl() {
    const cfg = this._firebaseConfig();
    const params = new URLSearchParams();
    Object.entries(cfg).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const prefix = this._appBase();
    return `${prefix}/firebase-messaging-sw.js?${params.toString()}`;
  },

  async requestBrowserPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    const current = Notification.permission;
    if (current === 'granted' || current === 'denied') return current;
    try {
      return await Notification.requestPermission();
    } catch (_) {
      return Notification.permission || 'default';
    }
  },

  async _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    if (this._serviceWorkerReg) return this._serviceWorkerReg;
    const scope = this._appBase() ? `${this._appBase()}/` : '/';
    const reg = await navigator.serviceWorker.register(this.serviceWorkerUrl(), { scope });
    let timer = null;
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('sw_ready_timeout')), 8000); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    this._serviceWorkerReg = reg;
    return reg;
  },

  async initSDK() {
    if (this.isReady()) return true;
    if (!this.isConfigured()) return false;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      if (typeof window.firebase === 'undefined') {
        console.warn('Firebase SDK not loaded');
        return false;
      }

      const swReg = await this._registerServiceWorker();
      if (!swReg) return false;

      const cfg = this._firebaseConfig();
      if (!window.firebase.apps.some((a) => a.name === '[DEFAULT]')) {
        window.firebase.initializeApp(cfg);
      }

      this._messaging = window.firebase.messaging();
      this._messaging.onMessage((payload) => this._handleForegroundMessage(payload));
      window.__fcmReady = true;
      window.dispatchEvent(new CustomEvent('app:push-ready'));
      return true;
    })();

    try {
      return await this._initPromise;
    } catch (_) {
      this._initPromise = null;
      return false;
    }
  },

  _apiBases() {
    const list = [];
    if (typeof API !== 'undefined' && API._base) list.push(API._base);
    const prefix = this._appBase();
    [`${prefix}/api`, '/multitienda/api', '/api', '/public/api'].forEach((b) => {
      if (b && !list.includes(b)) list.push(b);
    });
    return list;
  },

  _currentAuthToken() {
    if (this._pathStartsWith('/delivery')) return localStorage.getItem('deliveryToken');
    if (this._pathStartsWith('/store-owner')) return localStorage.getItem('storeOwnerToken');
    if (typeof API !== 'undefined' && API.token) return API.token;
    return localStorage.getItem('appToken');
  },

  async _getCurrentToken() {
    if (!this._messaging) return null;
    const vapidKey = this._firebaseVapidKey();
    if (!vapidKey) return null;
    return this._messaging.getToken({
      vapidKey,
      serviceWorkerRegistration: this._serviceWorkerReg || undefined,
    });
  },

  async _saveTokenForUser(userId, roleTag, previousToken = null) {
    const authToken = this._currentAuthToken();
    if (!authToken) return false;

    let token = null;
    try {
      token = await this._getCurrentToken();
    } catch (e) {
      console.warn('[FCM] No se pudo obtener el token del dispositivo', e && e.message ? e.message : e);
      return false;
    }
    if (!token) return false;

    const userKey = `${roleTag}:${String(userId)}`;
    if (this._lastSavedTokenByUser[userKey] === token) return true;

    const payload = { token, platform: 'web' };
    if (previousToken && previousToken !== token) payload.previous_token = previousToken;
    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
    };

    let lastStatus = 0;
    for (const base of this._apiBases()) {
      try {
        const res = await fetch(`${base}/save-fcm-token`, {
          method: 'POST',
          headers,
          body,
          credentials: 'same-origin',
          cache: 'no-store',
        });
        lastStatus = res.status;
        if (res.ok) {
          this._lastSavedTokenByUser[userKey] = token;
          try { localStorage.setItem(`fcm_saved:${userKey}`, '1'); } catch (_) { /* ignore */ }
          return true;
        }
        if (res.status === 410) break;
      } catch (_) { /* try next base */ }
    }
    console.warn('[FCM] No se pudo guardar el token en el servidor', lastStatus ? `(HTTP ${lastStatus})` : '');
    return false;
  },

  async _ensureReadyAndPermission(requestPermission = false) {
    const perm = requestPermission
      ? await this.requestBrowserPermission()
      : this.getBrowserPermission();
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };

    if (!this.isConfigured() && typeof window.loadAppSettings === 'function') {
      try { await window.loadAppSettings(); } catch (_) { /* ignore */ }
    }
    if (!this.isConfigured()) return { ok: false, reason: 'not_configured' };

    const inited = await this.initSDK();
    if (!inited) return { ok: false, reason: 'init_failed' };
    if (!this.isVapidConfigured()) return { ok: false, reason: 'vapid_missing' };
    return { ok: true, reason: 'ready' };
  },

  async register(userId, role = 'customer', extraTags = {}) {
    if (!userId) return false;
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const key = `${roleTag}:${String(userId)}:${extraTags.restaurant_id || ''}`;
    if (this._lastRegisterKey === key) return true;

    const ready = await this._ensureReadyAndPermission(false);
    if (!ready.ok) return false;

    const ok = await this._saveTokenForUser(userId, roleTag);
    if (ok) this._lastRegisterKey = key;
    return ok;
  },

  registerDelivery(userId) {
    return this.register(userId, 'delivery');
  },

  registerStoreOwner(userId, restaurantId) {
    return this.register(userId, 'store_owner', restaurantId ? { restaurant_id: String(restaurantId) } : {});
  },

  hasSavedTokenForUser(userId, roleTag = 'delivery') {
    const userKey = `${roleTag}:${String(userId)}`;
    if (this._lastSavedTokenByUser[userKey]) return true;
    try { return localStorage.getItem(`fcm_saved:${userKey}`) === '1'; } catch (_) { return false; }
  },

  async enable(userId, role = 'customer') {
    if (!userId) return { ok: false, reason: 'no_user' };
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const ready = await this._ensureReadyAndPermission(true);
    if (!ready.ok) return ready;

    let previous = null;
    try { previous = await this._getCurrentToken(); } catch (_) { /* ignore */ }
    try {
      await this._messaging.deleteToken();
    } catch (_) {
      try {
        const sub = await this._serviceWorkerReg?.pushManager?.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch (_) { /* ignore */ }
    }
    delete this._lastSavedTokenByUser[`${roleTag}:${String(userId)}`];

    const ok = await this._saveTokenForUser(userId, roleTag, previous);
    if (!ok) return { ok: false, reason: 'token_save_failed' };
    this._lastRegisterKey = `${roleTag}:${String(userId)}:`;
    return { ok: true, reason: 'granted' };
  },

  enableDeliveryPush(userId) {
    return this.enable(userId, 'delivery');
  },

  logout() {
    this._lastRegisterKey = null;
  },

  logoutWhenReady() {
    this.logout();
  },

  registerForContext() {
    clearTimeout(this._registerDebounce);
    this._registerDebounce = setTimeout(() => this._registerForContextNow(), 200);
  },

  _registerForContextNow() {
    let deliveryUser = null;
    let storeOwnerUser = null;
    try { deliveryUser = JSON.parse(localStorage.getItem('deliveryUser') || 'null'); } catch (_) { /* ignore */ }
    try { storeOwnerUser = JSON.parse(localStorage.getItem('storeOwnerUser') || 'null'); } catch (_) { /* ignore */ }

    if (this._pathStartsWith('/delivery')) {
      if (deliveryUser?.id) this.registerDelivery(deliveryUser.id);
      return;
    }
    if (this._pathStartsWith('/store-owner')) {
      if (storeOwnerUser?.id) {
        const rid = storeOwnerUser.restaurant?.id || storeOwnerUser.restaurant_id;
        this.registerStoreOwner(storeOwnerUser.id, rid);
      }
      return;
    }
    if (typeof Store !== 'undefined' && Store.isLoggedIn && Store.user?.id) {
      this.register(Store.user.id, Store.user.role || 'customer');
    }
  },

  _readPayloadData(payload) {
    const d = payload?.data || {};
    const n = payload?.notification || {};
    return {
      type: d.type || '',
      recipient_role: d.recipient_role || '',
      order_id: d.order_id || d.orderId || '',
      unique_order_id: d.unique_order_id || d.uniqueOrderId || '',
      url: d.url || d.web_url || d.link || n.click_action || '',
    };
  },

  _handleForegroundMessage(payload) {
    const data = this._readPayloadData(payload);
    const notif = payload?.notification || {};
    const title = notif.title || data.title || 'Notificación';
    const body = notif.body || data.message || '';
    this.showLocal(title, {
      body,
      icon: notif.icon || `${this._appBase()}/assets/img/favicons/favicon-96x96.png`,
      tag: data.order_id ? `order-${data.order_id}-${data.type || 'push'}` : 'app-push',
      data: { link: data.url || '' },
    });
    window.dispatchEvent(new CustomEvent('app:push-foreground', { detail: { payload, data, title, body } }));
  },

  // Android Chrome no permite `new Notification()` en páginas: se muestra vía el service worker.
  showLocal(title, options = {}) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const link = options.data && options.data.link;
    const viaPage = () => {
      try {
        const n = new Notification(title, options);
        n.onclick = () => { window.focus(); if (link) window.location.href = link; };
      } catch (_) { /* ignore */ }
    };
    const reg = this._serviceWorkerReg;
    if (reg && typeof reg.showNotification === 'function') {
      reg.showNotification(title, options).catch(viaPage);
      return;
    }
    viaPage();
  },
};

window.PushNotifications = PushNotifications;
