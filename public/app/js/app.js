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
window.__appRouter = router;

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

// Load settings on startup (retry — first request can fail during cold start / wrong API base)
async function loadAppSettings() {
  const delays = [0, 1500, 4000];
  let lastErr = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      await API.resolveBase(i > 0);
      const settings = await API.getSettings();
      if (Array.isArray(settings)) {
        settings.forEach((s) => { Store.settings[s.key] = s.value; });
        if (Store.settings.currencySymbol) Store.currency = Store.settings.currencySymbol;
        else if (Store.settings.currencyFormat) Store.currency = Store.settings.currencyFormat;
        if (Store.settings.currencySymbolAlign) Store.currencyAlign = Store.settings.currencySymbolAlign;
        window.dispatchEvent(new CustomEvent('app:settings-ready'));
        return settings;
      }
    } catch (e) {
      lastErr = e;
      console.warn('[settings] attempt', i + 1, 'failed:', e.message || e);
    }
  }
  throw lastErr || new Error('Failed to load settings');
}

window.loadAppSettings = loadAppSettings;

(async () => {
  try {
    await loadAppSettings();
    if (Store.settings.onesignalAppId && window.PushNotifications) {
      await PushNotifications.initSDK();
      PushNotifications.registerForContext();
    }
    // Set dynamic favicon
    if (Store.settings.faviconUrl) {
      const link = document.querySelector('link[rel="icon"]') || document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = Store.settings.faviconUrl;
      document.head.appendChild(link);
    }
  } catch(e) { console.warn('Failed to load settings after retries:', e.message || e); }
})();

window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev.reason;
  const msg = String(reason?.message || reason || '');
  if (reason?.name === 'AbortError' || msg.includes('AbortError') || msg.includes('connection was closed')) {
    ev.preventDefault();
  }
});

app.mount('#app');
