const API = {
  _base: null,
  _baseCandidates: ['/api', '/public/api'],

  get token() {
    return localStorage.getItem('appToken') || null;
  },

  _apiBaseFromMeta() {
    const meta = document.querySelector('meta[name="api-base"]');
    const content = meta && meta.getAttribute('content');
    if (content && typeof content === 'string') {
      const trimmed = content.trim().replace(/\/$/, '');
      if (trimmed) return trimmed;
    }
    return null;
  },

  _candidateBases() {
    const metaBase = this._apiBaseFromMeta();
    const list = metaBase
      ? [metaBase, ...this._baseCandidates.filter((b) => b !== metaBase)]
      : [...this._baseCandidates];
    return list;
  },

  async resolveBase(force) {
    if (this._base && !force) return this._base;
    for (const base of this._candidateBases()) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        const res = await fetch(`${base}/get-settings`, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          this._base = base;
          return base;
        }
      } catch (_) { /* try next base */ }
    }
    this._base = this._candidateBases()[0];
    return this._base;
  },

  async request(path, options = {}) {
    const method = (options.method || 'POST').toUpperCase();
    const data = options.data || {};
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    let body;

    if (method !== 'GET' && method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      const deliveryToken = localStorage.getItem('deliveryToken');
      const storeOwnerToken = localStorage.getItem('storeOwnerToken');
      let authToken = null;
      if (path.startsWith('/conversation/') && data.token) {
        authToken = data.token;
      } else if (path.startsWith('/delivery/') && deliveryToken) {
        authToken = deliveryToken;
        data.token = deliveryToken;
      } else if (path.startsWith('/store-owner/') && storeOwnerToken) {
        authToken = storeOwnerToken;
        data.token = storeOwnerToken;
      } else if (this.token) {
        authToken = this.token;
        data.token = this.token;
      }
      if (authToken) headers.Authorization = 'Bearer ' + authToken;
      body = JSON.stringify(data);
    }

    const bases = this._base
      ? [this._base, ...this._candidateBases().filter((b) => b !== this._base)]
      : this._candidateBases();

    let lastError = null;
    for (const base of bases) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), options.timeout || 20000);
        const res = await fetch(base + path, {
          method,
          headers,
          body,
          credentials: 'same-origin',
          cache: 'no-store',
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          lastError = new Error('HTTP ' + res.status);
          continue;
        }
        this._base = base;
        return await res.json();
      } catch (err) {
        lastError = err;
        if (this._base === base) this._base = null;
      }
    }
    throw lastError || new Error('Network error');
  },

  async post(path, data = {}) {
    return this.request(path, { method: 'POST', data });
  },

  async get(path) {
    return this.request(path, { method: 'GET' });
  },

  setToken(t) {
    localStorage.setItem('appToken', t);
  },

  clearToken() {
    localStorage.removeItem('appToken');
    localStorage.removeItem('appUser');
  },

  async getSettings() {
    await this.resolveBase();
    return this.get('/get-settings');
  },

  getPopularLocations() { return this.post('/popular-geo-locations'); },
  getLanguages() { return this.post('/get-all-languages'); },
  getLanguage(id) { return this.post('/get-single-language', { id }); },
  getDeliveryRestaurants(lat, lng) { return this.post('/get-delivery-restaurants', { latitude: lat, longitude: lng }); },
  getSelfpickupRestaurants(lat, lng) { return this.post('/get-selfpickup-restaurants', { latitude: lat, longitude: lng }); },
  getRestaurantInfo(slug) { return this.post('/get-restaurant-info/' + slug); },
  getRestaurantItems(slug) { return this.post('/get-restaurant-items/' + slug); },
  getPromoSliders(lat, lng) { return this.post('/promo-slider', { latitude: lat, longitude: lng }); },
  getCategories() { return this.post('/get-all-restaurants-categories'); },
  coordinateToAddress(lat, lng) { return this.post('/coordinate-to-address', { lat, lng }); },
  applyCoupon(token, code, restaurant_id, subtotal) { return this.post('/apply-coupon', { token, coupon: code, restaurant_id, subtotal }); },
  login(email, password) { return this.post('/login', { email, password }); },
  register(name, email, phone, password) { return this.post('/register', { name, email, phone, password }); },
  forgotPassword(email) { return this.post('/send-password-reset-mail', { email }); },
  verifyResetOtp(email, code) { return this.post('/verify-password-reset-otp', { email, code }); },
  changePassword(email, code, password) { return this.post('/change-user-password', { email, code, password }); },
  getOrders(token, userId) { return this.post('/get-orders', { token, user_id: userId }); },
  getAddresses(userId, token) { return this.post('/get-addresses', { user_id: userId, token }); },
  saveAddress(userId, token, lat, lng, address, house, tag) { return this.post('/save-address', { user_id: userId, token, latitude: lat, longitude: lng, address, house, tag }); },
  deleteAddress(userId, addressId, token) { return this.post('/delete-address', { user_id: userId, address_id: addressId, token }); },
  setDefaultAddress(userId, addressId, token) { return this.post('/set-default-address', { user_id: userId, address_id: addressId, token }); },
  updateUserInfo(userId, token) { return this.post('/update-user-info', { user_id: userId, token }); },
  toggleFavorite(token, id) { return this.post('/toggle-favorite', { token, id }); },
  getFavoriteStores(token, lat, lng) { return this.post('/get-favorite-stores', { token, latitude: lat, longitude: lng }); },
  getNotifications(userId, token) { return this.post('/get-user-notifications', { user_id: userId, token }); },
  markAllRead(userId, token) { return this.post('/mark-all-notifications-read', { user_id: userId, token }); },
  searchRestaurants(lat, lng, q) { return this.post('/search-restaurants', { latitude: lat, longitude: lng, q }); },
  placeOrder(data) { return this.post('/place-order', data); },
  getPaymentGateways(token, restaurantId) { return this.post('/get-payment-gateways', { token, restaurant_id: restaurantId }); },
  cancelOrder(token, userId, orderId) { return this.post('/cancel-order', { token, user_id: userId, order_id: orderId }); },
  getWalletTransactions(token, userId) { return this.post('/get-wallet-transactions', { token, user_id: userId }); },
  getRatableOrder(token, orderId) { return this.post('/get-ratable-order', { token, order_id: orderId }); },
  rateOrder(token, data) { return this.post('/rate-order', { token, ...data }); },
  checkRunningOrder(token, userId) { return this.post('/check-running-order', { token, user_id: userId }); },
};
