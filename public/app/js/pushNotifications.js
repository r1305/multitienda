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

  getBrowserPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission || 'default';
  },

  isReady() {
    return !!window.__fcmReady;
  },

  serviceWorkerUrl() {
    const cfg = this._firebaseConfig();
    const params = new URLSearchParams();
    Object.entries(cfg).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `/firebase-messaging-sw.js?${params.toString()}`;
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
    this._serviceWorkerReg = await navigator.serviceWorker.register(this.serviceWorkerUrl(), { scope: '/' });
    return this._serviceWorkerReg;
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
      if (!window.firebase.apps.length) {
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
    ['/api', '/public/api'].forEach((b) => {
      if (!list.includes(b)) list.push(b);
    });
    return list;
  },

  _currentAuthToken() {
    const p = window.location.pathname || '';
    if (p.startsWith('/delivery')) return localStorage.getItem('deliveryToken');
    if (p.startsWith('/store-owner')) return localStorage.getItem('storeOwnerToken');
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

  async _saveTokenForUser(userId, roleTag) {
    const authToken = this._currentAuthToken();
    if (!authToken) return false;

    const token = await this._getCurrentToken();
    if (!token) return false;

    const userKey = `${roleTag}:${String(userId)}`;
    if (this._lastSavedTokenByUser[userKey] === token) return true;

    const body = JSON.stringify({ token, platform: 'web' });
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${authToken}`,
    };

    for (const base of this._apiBases()) {
      try {
        const res = await fetch(`${base}/save-fcm-token`, {
          method: 'POST',
          headers,
          body,
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (res.ok) {
          this._lastSavedTokenByUser[userKey] = token;
          return true;
        }
      } catch (_) { /* try next base */ }
    }
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

  async enableDeliveryPush(userId) {
    if (!userId) return { ok: false, reason: 'no_user' };
    const ready = await this._ensureReadyAndPermission(true);
    if (!ready.ok) return ready;

    const ok = await this._saveTokenForUser(userId, 'delivery');
    if (!ok) return { ok: false, reason: 'token_save_failed' };
    this._lastRegisterKey = `delivery:${String(userId)}:`;
    return { ok: true, reason: 'granted' };
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
    const p = window.location.pathname || '';
    let deliveryUser = null;
    let storeOwnerUser = null;
    try { deliveryUser = JSON.parse(localStorage.getItem('deliveryUser') || 'null'); } catch (_) { /* ignore */ }
    try { storeOwnerUser = JSON.parse(localStorage.getItem('storeOwnerUser') || 'null'); } catch (_) { /* ignore */ }

    if (p.startsWith('/delivery')) {
      if (deliveryUser?.id) this.registerDelivery(deliveryUser.id);
      return;
    }
    if (p.startsWith('/store-owner')) {
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
    window.dispatchEvent(new CustomEvent('app:push-foreground', { detail: { payload, data } }));
  },
};

window.PushNotifications = PushNotifications;
