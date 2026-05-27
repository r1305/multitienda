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

  logout() {
    if (!window.OneSignalDeferred) return;
    this._lastIdentityKey = null;
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        if (typeof OneSignal.logout === 'function') await OneSignal.logout();
      } catch (e) {
        console.warn('OneSignal logout failed', e);
      }
    });
  },

  register(userId, role = 'customer', extraTags = {}) {
    if (!userId || !window.OneSignalDeferred) return;
    const id = String(userId);
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const identityKey = `${roleTag}:${id}:${extraTags.restaurant_id || ''}`;
    if (this._lastIdentityKey === identityKey) return;
    this._lastIdentityKey = identityKey;

    const tags = { user_id: id, role: roleTag, ...extraTags };
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        const permission = await OneSignal.Notifications.permission;
        if (!permission) await OneSignal.Notifications.requestPermission();
        const optedIn = await OneSignal.User.PushSubscription.optedIn;
        if (!optedIn) await OneSignal.User.PushSubscription.optIn();

        const currentExternal = OneSignal.User.externalId != null
          ? String(OneSignal.User.externalId)
          : null;

        if (currentExternal && currentExternal !== id && typeof OneSignal.logout === 'function') {
          await OneSignal.logout();
        }

        if (currentExternal !== id && typeof OneSignal.login === 'function') {
          await OneSignal.login(id);
        }

        await OneSignal.User.addTags(tags);
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

    if (path.startsWith('/delivery') && deliveryUser?.id) {
      return this.register(deliveryUser.id, 'delivery');
    }
    if (path.startsWith('/store-owner') && storeOwnerUser?.id) {
      const extra = {};
      const rid = storeOwnerUser.restaurant?.id || storeOwnerUser.restaurant_id;
      if (rid) extra.restaurant_id = String(rid);
      return this.register(storeOwnerUser.id, 'store_owner', extra);
    }
    if (typeof Store !== 'undefined' && Store.isLoggedIn) {
      return this.register(Store.user.id, Store.user.role || 'customer');
    }
    if (this._lastIdentityKey) this.logout();
  },

  registerStoreOwner(userId, restaurantId) {
    const extra = restaurantId ? { restaurant_id: String(restaurantId) } : {};
    this.register(userId, 'store_owner', extra);
  },
};
