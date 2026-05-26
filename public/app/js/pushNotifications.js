/** Register web push (OneSignal) — tags + external_id for server targeting */
const PushNotifications = {
  register(userId, role = 'customer', extraTags = {}) {
    if (!userId || !window.OneSignalDeferred) return;
    const id = String(userId);
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    const tags = { user_id: id, role: roleTag, ...extraTags };
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        const permission = await OneSignal.Notifications.permission;
        if (!permission) await OneSignal.Notifications.requestPermission();
        const optedIn = await OneSignal.User.PushSubscription.optedIn;
        if (!optedIn) await OneSignal.User.PushSubscription.optIn();
        if (typeof OneSignal.login === 'function') await OneSignal.login(id);
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
  },

  /** Call after store dashboard loads so restaurant_id tag is set */
  registerStoreOwner(userId, restaurantId) {
    const extra = restaurantId ? { restaurant_id: String(restaurantId) } : {};
    this.register(userId, 'store_owner', extra);
  },
};
