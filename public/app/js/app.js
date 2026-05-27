const { createApp } = Vue;
const { createRouter, createWebHistory } = VueRouter;

const routes = [
  { path: '/', component: HomePage },
  { path: '/location', component: LocationPage },
  { path: '/store/:slug', component: StoreDetailPage },
  { path: '/cart', component: CartPage },
  { path: '/explore', component: ExplorePage },
  { path: '/account', component: AccountPage },
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegisterPage },
  { path: '/forgot-password', component: ForgotPasswordPage },
  { path: '/favorites', component: FavoritesPage },
  { path: '/notifications', component: NotificationsPage },
  { path: '/checkout', component: CheckoutPage },
  { path: '/orders', component: OrdersPage },
  { path: '/order/:id', component: OrderDetailPage },
  { path: '/addresses', component: AddressesPage },
  { path: '/wallet', component: WalletPage },
  { path: '/rate/:id', component: RateOrderPage },
  { path: '/delivery', component: DeliveryLoginPage },
  { path: '/delivery/orders', component: DeliveryOrdersPage },
  { path: '/delivery/order/:id', component: DeliveryOrderDetailPage },
  { path: '/delivery/history', component: DeliveryHistoryPage },
  { path: '/delivery/earnings', component: DeliveryEarningsPage },
  { path: '/store-owner', component: StoreOwnerLoginPage },
  { path: '/store-owner/dashboard', component: StoreOwnerDashboardPage },
  { path: '/store-owner/orders', component: StoreOwnerOrdersPage },
  { path: '/store-owner/order/:id', component: StoreOwnerOrderDetailPage },
  { path: '/store-owner/menu', component: StoreOwnerMenuPage },
  { path: '/store-owner/categories', component: StoreOwnerCategoriesPage },
  { path: '/store-owner/addons', component: StoreOwnerAddonsPage },
  { path: '/store-owner/history', component: StoreOwnerHistoryPage },
  { path: '/store-owner/earnings', component: StoreOwnerEarningsPage },
  { path: '/store-owner/settings', component: StoreOwnerSettingsPage },
  { path: '/store-owner/coupons', component: StoreOwnerCouponsPage },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; }
});

router.afterEach(() => {
  if (window.PushNotifications) PushNotifications.registerForContext();
});

const app = createApp({
  computed: {
    showTabBar() {
      const hide = ['/location', '/login', '/register', '/forgot-password', '/checkout'];
      return !hide.includes(this.$route.path) && !this.$route.path.startsWith('/order/') && !this.$route.path.startsWith('/rate/') && !this.$route.path.startsWith('/delivery') && !this.$route.path.startsWith('/store-owner');
    }
  }
});

app.component('tab-bar', TabBar);
app.use(router);
Store.applyTheme();

// Load settings on startup
(async () => {
  try {
    const settings = await API.getSettings();
    if (Array.isArray(settings)) {
      settings.forEach(s => { Store.settings[s.key] = s.value; });
      if (Store.settings.currencySymbol) Store.currency = Store.settings.currencySymbol;
      else if (Store.settings.currencyFormat) Store.currency = Store.settings.currencyFormat;
      if (Store.settings.currencySymbolAlign) Store.currencyAlign = Store.settings.currencySymbolAlign;
    }
    // Initialize OneSignal
    if (Store.settings.onesignalAppId) {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function(OneSignal) {
        const serviceWorkerUrl = PushNotifications.serviceWorkerUrl();
        const workerOk = await PushNotifications.verifyServiceWorker();
        if (!workerOk) {
          console.warn('OneSignal: service worker URL returned HTML or failed — push disabled. URL:', serviceWorkerUrl);
          return;
        }
        try {
          await OneSignal.init({
            appId: Store.settings.onesignalAppId,
            allowLocalhostAsSecureOrigin: true,
            notifyButton: { enable: false },
            serviceWorkerPath: serviceWorkerUrl,
            serviceWorkerParam: { scope: '/' },
          });
        } catch (swErr) {
          console.warn('OneSignal init failed:', swErr.message);
          return;
        }
        OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
          event.notification.display();
        });
        OneSignal.Notifications.addEventListener('click', (e) => {
          const data = e.notification?.additionalData || e.notification?.data || e.data || {};
          if (!data.order_id && !data.unique_order_id) return;
          const storeOwnerUser = JSON.parse(localStorage.getItem('storeOwnerUser') || 'null');
          const deliveryUser = JSON.parse(localStorage.getItem('deliveryUser') || 'null');
          if (data.type === 'delivery_assigned' && data.order_id) {
            router.push('/delivery/order/' + data.order_id);
          } else if (data.type === 'new_order' || data.recipient_role === 'store_owner' || storeOwnerUser) {
            router.push('/store-owner/order/' + data.order_id);
          } else if (data.recipient_role === 'delivery' || deliveryUser) {
            router.push('/delivery/order/' + (data.order_id || data.unique_order_id));
          } else if (data.unique_order_id) {
            router.push('/order/' + data.unique_order_id);
          }
        });
        PushNotifications.registerForContext();
      });
    }
    // Set dynamic favicon
    if (Store.settings.faviconUrl) {
      const link = document.querySelector('link[rel="icon"]') || document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = Store.settings.faviconUrl;
      document.head.appendChild(link);
    }
  } catch(e) { console.error('Failed to load settings', e); }
})();

app.mount('#app');
