/** Register web push (OneSignal) — tags + external_id for server targeting */
const PushNotifications = {
  _lastIdentityKey: null,
  _pushChain: Promise.resolve(),
  _registerDebounce: null,

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

  _readStoredIdentity() {
    try {
      return {
        role: sessionStorage.getItem('push_role'),
        external: sessionStorage.getItem('push_external_id'),
      };
    } catch (_) {
      return { role: null, external: null };
    }
  },

  _writeStoredIdentity(roleTag, id) {
    try {
      sessionStorage.setItem('push_role', roleTag);
      sessionStorage.setItem('push_external_id', id);
    } catch (_) { /* ignore */ }
  },

  _clearStoredIdentity() {
    this._lastIdentityKey = null;
    try {
      sessionStorage.removeItem('push_role');
      sessionStorage.removeItem('push_external_id');
    } catch (_) { /* ignore */ }
  },

  /** Run OneSignal ops one at a time to avoid 409 identity conflicts */
  _enqueue(fn) {
    if (!window.OneSignalDeferred) return this._pushChain;
    this._pushChain = this._pushChain.then(
      () =>
        new Promise((resolve) => {
          window.OneSignalDeferred.push(async function (OneSignal) {
            try {
              await fn(OneSignal);
            } catch (e) {
              console.warn('OneSignal op failed', e);
            } finally {
              resolve();
            }
          });
        })
    );
    return this._pushChain;
  },

  getBrowserPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission || 'default';
  },

  isConfigured() {
    return !!(typeof Store !== 'undefined' && Store.settings && Store.settings.onesignalAppId);
  },

  /** Only call requestPermission from a click handler (Edge/Chrome block otherwise). */
  async _ensureSubscribed(OneSignal, requestPermission = false) {
    let permission = await OneSignal.Notifications.permission;
    if (!permission && requestPermission) {
      await OneSignal.Notifications.requestPermission();
      permission = await OneSignal.Notifications.permission;
    }
    if (!permission) return false;
    const optedIn = await OneSignal.User.PushSubscription.optedIn;
    if (!optedIn) await OneSignal.User.PushSubscription.optIn();
    return true;
  },

  /** User tapped "Activar notificaciones" — must run synchronously from click. */
  enableDeliveryPush(userId) {
    return new Promise((resolve) => {
      if (!userId || !window.OneSignalDeferred) return resolve(false);
      const id = String(userId);
      const tags = { user_id: id, role: 'delivery' };
      this._lastIdentityKey = null;

      this._enqueue(async (OneSignal) => {
        try {
          const ok = await this._ensureSubscribed(OneSignal, true);
          if (!ok) return resolve(false);

          const stored = this._readStoredIdentity();
          if (stored.role && stored.role !== 'delivery') {
            await this._switchExternalId(OneSignal, id);
          } else if (stored.external !== id) {
            if (stored.external && typeof OneSignal.logout === 'function') {
              await OneSignal.logout();
              await new Promise((r) => setTimeout(r, 300));
            }
            await this._safeLogin(OneSignal, id);
          }

          await OneSignal.User.addTags(tags);
          this._writeStoredIdentity('delivery', id);
          this._lastIdentityKey = this._storageKey('delivery', id, {});
          resolve(true);
        } catch (e) {
          console.warn('enableDeliveryPush failed', e);
          resolve(false);
        }
      });
    });
  },

  async _safeLogin(OneSignal, id) {
    if (typeof OneSignal.login !== 'function') return;
    try {
      await OneSignal.login(id);
    } catch (e) {
      const status = e?.status || e?.statusCode;
      const msg = String(e?.message || e || '');
      if (status === 409 || msg.includes('409')) {
        if (typeof OneSignal.logout === 'function') {
          await OneSignal.logout();
          await new Promise((r) => setTimeout(r, 500));
        }
        await OneSignal.login(id);
      } else {
        throw e;
      }
    }
  },

  async _switchExternalId(OneSignal, id) {
    if (typeof OneSignal.logout === 'function') {
      await OneSignal.logout();
      await new Promise((r) => setTimeout(r, 400));
    }
    await this._safeLogin(OneSignal, id);
  },

  logout() {
    if (!window.OneSignalDeferred) return;
    this._clearStoredIdentity();
    this._enqueue(async (OneSignal) => {
      if (typeof OneSignal.logout === 'function') await OneSignal.logout();
    });
  },

  /** Role or user change — logout then login once */
  registerWithRoleSwitch(userId, role, extraTags = {}) {
    if (!userId || !window.OneSignalDeferred) return;
    const id = String(userId);
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const identityKey = this._storageKey(roleTag, id, extraTags);
    const stored = this._readStoredIdentity();
    if (
      this._lastIdentityKey === identityKey &&
      stored.external === id &&
      stored.role === roleTag
    ) {
      return;
    }
    this._lastIdentityKey = identityKey;
    const tags = { user_id: id, role: roleTag, ...extraTags };

    this._enqueue(async (OneSignal) => {
      const ok = await this._ensureSubscribed(OneSignal, false);
      if (!ok) return;
      await this._switchExternalId(OneSignal, id);
      await OneSignal.User.addTags(tags);
      this._writeStoredIdentity(roleTag, id);
    });
  },

  registerDelivery(userId) {
    if (!userId) return;
    if (this.getBrowserPermission() !== 'granted') return;
    const stored = this._readStoredIdentity();
    if (stored.role && stored.role !== 'delivery') {
      return this.registerWithRoleSwitch(userId, 'delivery');
    }
    return this.register(userId, 'delivery');
  },

  register(userId, role = 'customer', extraTags = {}) {
    if (!userId || !window.OneSignalDeferred) return;
    const id = String(userId);
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const identityKey = this._storageKey(roleTag, id, extraTags);
    const stored = this._readStoredIdentity();

    if (stored.role && stored.role !== roleTag) {
      return this.registerWithRoleSwitch(userId, role, extraTags);
    }

    if (
      this._lastIdentityKey === identityKey &&
      stored.external === id &&
      stored.role === roleTag
    ) {
      return;
    }

    this._lastIdentityKey = identityKey;
    const tags = { user_id: id, role: roleTag, ...extraTags };
    const needsLogin = stored.external !== id;

    this._enqueue(async (OneSignal) => {
      const ok = await this._ensureSubscribed(OneSignal, false);
      if (!ok) return;
      if (needsLogin) {
        if (stored.external && typeof OneSignal.logout === 'function') {
          await OneSignal.logout();
          await new Promise((r) => setTimeout(r, 300));
        }
        await this._safeLogin(OneSignal, id);
      }
      await OneSignal.User.addTags(tags);
      this._writeStoredIdentity(roleTag, id);
    });
  },

  registerForContext() {
    clearTimeout(this._registerDebounce);
    this._registerDebounce = setTimeout(() => this._registerForContextNow(), 200);
  },

  _registerForContextNow() {
    const path = window.location.pathname || '';
    let deliveryUser = null;
    let storeOwnerUser = null;
    try {
      deliveryUser = JSON.parse(localStorage.getItem('deliveryUser') || 'null');
    } catch (_) { /* ignore */ }
    try {
      storeOwnerUser = JSON.parse(localStorage.getItem('storeOwnerUser') || 'null');
    } catch (_) { /* ignore */ }

    if (path.startsWith('/delivery')) {
      if (deliveryUser?.id && this.getBrowserPermission() === 'granted') {
        return this.registerDelivery(deliveryUser.id);
      }
      if (!deliveryUser?.id) this.logout();
      return;
    }
    if (path.startsWith('/store-owner')) {
      if (storeOwnerUser?.id) {
        const extra = {};
        const rid = storeOwnerUser.restaurant?.id || storeOwnerUser.restaurant_id;
        if (rid) extra.restaurant_id = String(rid);
        const stored = this._readStoredIdentity();
        if (stored.role && stored.role !== 'store_owner') {
          return this.registerWithRoleSwitch(storeOwnerUser.id, 'store_owner', extra);
        }
        return this.register(storeOwnerUser.id, 'store_owner', extra);
      }
      this.logout();
      return;
    }
    if (typeof Store !== 'undefined' && Store.isLoggedIn) {
      const stored = this._readStoredIdentity();
      if (stored.role && stored.role !== 'customer' && !stored.role.includes('customer')) {
        return this.registerWithRoleSwitch(Store.user.id, Store.user.role || 'customer');
      }
      return this.register(Store.user.id, Store.user.role || 'customer');
    }
    if (this._lastIdentityKey) this.logout();
  },

  registerStoreOwner(userId, restaurantId) {
    const extra = restaurantId ? { restaurant_id: String(restaurantId) } : {};
    const stored = this._readStoredIdentity();
    if (stored.role && stored.role !== 'store_owner') {
      return this.registerWithRoleSwitch(userId, 'store_owner', extra);
    }
    this.register(userId, 'store_owner', extra);
  },
};
