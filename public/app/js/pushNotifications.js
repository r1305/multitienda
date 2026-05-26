/** Register web push (OneSignal) for a logged-in user — tags + external_id for server targeting */
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
};
