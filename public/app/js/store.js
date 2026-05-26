const Store = Vue.reactive({
  settings: {},
  location: JSON.parse(localStorage.getItem('appLocation') || 'null'),
  cart: JSON.parse(localStorage.getItem('appCart') || '[]'),
  appliedCoupon: JSON.parse(localStorage.getItem('appCoupon') || 'null'),
  user: JSON.parse(localStorage.getItem('appUser') || 'null'),
  currency: '$',
  currencyAlign: 'left',
  theme: localStorage.getItem('appTheme') || 'light',

  applyTheme() { document.documentElement.setAttribute('data-theme', Store.theme); },
  toggleTheme() { Store.theme = Store.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('appTheme', Store.theme); Store.applyTheme(); },

  get cartCount() { return this.cart.reduce((sum, i) => sum + i.quantity, 0); },
  get cartTotal() { return this.cart.reduce((sum, i) => sum + (i.addonTotal || parseFloat(i.price)) * i.quantity, 0); },
  get isLoggedIn() { return !!this.user; },

  setLocation(loc) { this.location = loc; localStorage.setItem('appLocation', JSON.stringify(loc)); },
  setUser(u) { this.user = u; localStorage.setItem('appUser', JSON.stringify(u)); },
  logout() { this.user = null; API.clearToken(); },

  addItem(item) {
    if (item.selectedaddons && item.selectedaddons.length) {
      const key = item.id + '_' + item.selectedaddons.map(a => a.id).sort().join(',');
      const existing = this.cart.find(i => i._key === key);
      if (existing) { existing.quantity++; }
      else { this.cart.push({ ...item, _key: key, quantity: 1 }); }
    } else {
      const existing = this.cart.find(i => i.id === item.id && !i.selectedaddons?.length);
      if (existing) { existing.quantity++; }
      else { this.cart.push({ ...item, quantity: 1 }); }
    }
    this.saveCart();
  },
  removeItem(itemId) {
    const idx = this.cart.findIndex(i => i.id === itemId && !i.selectedaddons?.length);
    if (idx > -1) { if (this.cart[idx].quantity > 1) this.cart[idx].quantity--; else this.cart.splice(idx, 1); }
    this.saveCart();
  },
  removeItemByIndex(idx) {
    if (idx > -1 && idx < this.cart.length) { if (this.cart[idx].quantity > 1) this.cart[idx].quantity--; else this.cart.splice(idx, 1); }
    this.saveCart();
  },
  clearCart() { this.cart = []; this.appliedCoupon = null; this.saveCart(); },
  getItemQty(itemId) { const item = this.cart.find(i => i.id === itemId); return item ? item.quantity : 0; },
  saveCart() { localStorage.setItem('appCart', JSON.stringify(this.cart)); localStorage.setItem('appCoupon', JSON.stringify(this.appliedCoupon)); },
  formatPrice(val) { const n = parseFloat(val || 0).toFixed(2); return this.currencyAlign === 'left' ? this.currency + n : n + this.currency; },

  /** Normalize image paths from API (Laravel /uploads /storage / absolute URL) */
  imageUrl(path) {
    const placeholder = "data:image/svg+xml," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect fill="#eee" width="80" height="80" rx="8"/><text x="50%" y="54%" text-anchor="middle" fill="#bbb" font-size="11" font-family="sans-serif">Sin foto</text></svg>'
    );
    if (!path || path === 'null' || path === 'undefined') return placeholder;
    let url = String(path).trim();
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('storage/')) url = '/uploads/' + url.slice(8);
    else if (url.startsWith('/storage/')) url = '/uploads/' + url.slice(9);
    if (!url.startsWith('/')) url = '/' + url;
    return url;
  },
});
