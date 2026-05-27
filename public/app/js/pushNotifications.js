/** Register web push (OneSignal) — tags + external_id for server targeting */
const PushNotifications = {
  _lastIdentityKey: null,

  serviceWorkerUrl() {
    return new URL('/public/api/onesignal-service-worker.js', window.location.origin).href;
  },

  async verifyServiceWorker() {
    try {
      const res = await fetch(this.serviceWorkerUrl(), { method: 'GET', cache: 'no-store' });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      return res.ok && ct.includes('javascript');
    } catch (_) {
      return false;
    }
  },

  _storageKey(roleTag, id, extraTags) {
    return `${roleTag}:${id}:${extraTags.restaurant_id || ''}`;
  },

  _clearStoredIdentity() {
    this._lastIdentityKey = null;
    try {
      sessionStorage.removeItem('push_role');
      sessionStorage.removeItem('push_external_id');
    } catch (_) { /* ignore */ }
  },

  logout() {
    if (!window.OneSignalDeferred) return;
    this._clearStoredIdentity();
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        if (typeof OneSignal.logout === 'function') await OneSignal.logout();
      } catch (e) {
        console.warn('OneSignal logout failed', e);
      }
    });
  },

  /** Delivery / store-owner after client app — always logout then login (avoids 409) */
  registerWithRoleSwitch(userId, role, extraTags = {}) {
    if (!userId || !window.OneSignalDeferred) return;
    const id = String(userId);
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const identityKey = this._storageKey(roleTag, id, extraTags);
    const tags = { user_id: id, role: roleTag, ...extraTags };
    this._lastIdentityKey = identityKey;

    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        const permission = await OneSignal.Notifications.permission;
        if (!permission) await OneSignal.Notifications.requestPermission();
        const optedIn = await OneSignal.User.PushSubscription.optedIn;
        if (!optedIn) await OneSignal.User.PushSubscription.optIn();

        if (typeof OneSignal.logout === 'function') await OneSignal.logout();
        await new Promise((r) => setTimeout(r, 300));

        if (typeof OneSignal.login === 'function') await OneSignal.login(id);
        await OneSignal.User.addTags(tags);

        try {
          sessionStorage.setItem('push_role', roleTag);
          sessionStorage.setItem('push_external_id', id);
        } catch (_) { /* ignore */ }
      } catch (e) {
        console.warn('Push registration failed', e);
      }
    });
  },

  registerDelivery(userId) {
    this.registerWithRoleSwitch(userId, 'delivery');
  },

  register(userId, role = 'customer', extraTags = {}) {
    if (!userId || !window.OneSignalDeferred) return;
    const id = String(userId);
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const identityKey = this._storageKey(roleTag, id, extraTags);
    if (this._lastIdentityKey === identityKey) return;
    this._lastIdentityKey = identityKey;

    let storedRole = null;
    let storedExternal = null;
    try {
      storedRole = sessionStorage.getItem('push_role');
      storedExternal = sessionStorage.getItem('push_external_id');
    } catch (_) { /* ignore */ }

    const needsRoleSwitch = storedRole && storedRole !== roleTag;
    if (needsRoleSwitch) {
      return this.registerWithRoleSwitch(userId, role, extraTags);
    }

    const tags = { user_id: id, role: roleTag, ...extraTags };
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        const permission = await OneSignal.Notifications.permission;
        if (!permission) await OneSignal.Notifications.requestPermission();
        const optedIn = await OneSignal.User.PushSubscription.optedIn;
        if (!optedIn) await OneSignal.User.PushSubscription.optIn();

        if (storedExternal && storedExternal !== id && typeof OneSignal.logout === 'function') {
          await OneSignal.logout();
          await new Promise((r) => setTimeout(r, 200));
        }

        if (storedExternal !== id && typeof OneSignal.login === 'function') {
          await OneSignal.login(id);
        }

        await OneSignal.User.addTags(tags);
        try {
          sessionStorage.setItem('push_role', roleTag);
          sessionStorage.setItem('push_external_id', id);
        } catch (_) { /* ignore */ }
      } catch (e) {
        console.warn('Push registration failed', e);
      }
    });
  },

  registerForContext() {
    const path = window.location.pathname || '';
    let deliveryUser = null;
    let storeOwnerUser = null;
    try { deliveryUser = JSON.parse(localStorage.getItem('deliveryUser') || 'null'); } catch (_) { /* ignore */ }
    try { storeOwnerUser = JSON.parse(localStorage.getItem('storeOwnerUser') || 'null'); } catch (_) { /* ignore */ }

    if (path.startsWith('/delivery')) {
      if (deliveryUser?.id) return this.registerDelivery(deliveryUser.id);
      this.logout();
      return;
    }
    if (path.startsWith('/store-owner')) {
      if (storeOwnerUser?.id) {
        const extra = {};
        const rid = storeOwnerUser.restaurant?.id || storeOwnerUser.restaurant_id;
        if (rid) extra.restaurant_id = String(rid);
        const storedRole = sessionStorage.getItem('push_role');
        if (storedRole && storedRole !== 'store_owner') {
          return this.registerWithRoleSwitch(storeOwnerUser.id, 'store_owner', extra);
        }
        return this.register(storeOwnerUser.id, 'store_owner', extra);
      }
      this.logout();
      return;
    }
    if (typeof Store !== 'undefined' && Store.isLoggedIn) {
      const storedRole = sessionStorage.getItem('push_role');
      if (storedRole && storedRole !== 'customer' && !storedRole.includes('customer')) {
        return this.registerWithRoleSwitch(Store.user.id, Store.user.role || 'customer');
      }
      return this.register(Store.user.id, Store.user.role || 'customer');
    }
    if (this._lastIdentityKey) this.logout();
  },

  registerStoreOwner(userId, restaurantId) {
    const extra = restaurantId ? { restaurant_id: String(restaurantId) } : {};
    const storedRole = sessionStorage.getItem('push_role');
    if (storedRole && storedRole !== 'store_owner') {
      return this.registerWithRoleSwitch(userId, 'store_owner', extra);
    }
    this.register(userId, 'store_owner', extra);
  },
};
