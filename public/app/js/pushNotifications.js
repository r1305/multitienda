/** Register web push (OneSignal) — tags + external_id for server targeting */
const PushNotifications = {
  register(userId, role = 'customer') {
    if (!userId || !window.OneSignalDeferred) return;
    const id = String(userId);
    const roleTag = String(role || 'customer').toLowerCase().replace(/\s+/g, '_');
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        const permission = await OneSignal.Notifications.permission;
        if (!permission) await OneSignal.Notifications.requestPermission();
        const optedIn = await OneSignal.User.PushSubscription.optedIn;
        if (!optedIn) await OneSignal.User.PushSubscription.optIn();
        if (typeof OneSignal.login === 'function') await OneSignal.login(id);
        await OneSignal.User.addTags({ user_id: id, role: roleTag });
      } catch (e) {
        console.warn('Push registration failed', e);
      }
    });
  },

  /** Pick customer vs delivery vs store-owner from current route (avoids wrong OneSignal user) */
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
      return this.register(storeOwnerUser.id, 'store_owner');
    }
    if (typeof Store !== 'undefined' && Store.isLoggedIn) {
      return this.register(Store.user.id, Store.user.role || 'customer');
    }
  },
};
