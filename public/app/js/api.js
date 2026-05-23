const API = {
  base: '/public/api',
  token: localStorage.getItem('appToken') || null,
  async post(path, data = {}) {
    const headers = { 'Content-Type': 'application/json' };
    // Use delivery token for delivery/conversation routes, store owner token for store-owner routes, otherwise client token
    const deliveryToken = localStorage.getItem('deliveryToken');
    const storeOwnerToken = localStorage.getItem('storeOwnerToken');
    if ((path.startsWith('/delivery/') || path.startsWith('/conversation/')) && deliveryToken) {
      headers['Authorization'] = 'Bearer ' + deliveryToken;
      data.token = deliveryToken;
    } else if (path.startsWith('/store-owner/') && storeOwnerToken) {
      headers['Authorization'] = 'Bearer ' + storeOwnerToken;
      data.token = storeOwnerToken;
    } else if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
      data.token = this.token;
    }
    const res = await fetch(this.base + path, { method: 'POST', headers, body: JSON.stringify(data) });
    return res.json();
  },
  setToken(t) { this.token = t; localStorage.setItem('appToken', t); },
  clearToken() { this.token = null; localStorage.removeItem('appToken'); localStorage.removeItem('appUser'); },
  getSettings() { return this.post('/get-settings'); },
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
