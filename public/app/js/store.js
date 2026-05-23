const Store = Vue.reactive({
  settings: {},
  location: JSON.parse(localStorage.getItem('appLocation') || 'null'),
  cart: JSON.parse(localStorage.getItem('appCart') || '[]'),
  user: JSON.parse(localStorage.getItem('appUser') || 'null'),
  currency: '$',
  currencyAlign: 'left',

  get cartCount() { return this.cart.reduce((sum, i) => sum + i.quantity, 0); },
  get cartTotal() { return this.cart.reduce((sum, i) => sum + i.price * i.quantity, 0); },
  get isLoggedIn() { return !!this.user; },

  setLocation(loc) { this.location = loc; localStorage.setItem('appLocation', JSON.stringify(loc)); },
  setUser(u) { this.user = u; localStorage.setItem('appUser', JSON.stringify(u)); },
  logout() { this.user = null; API.clearToken(); },

  addItem(item) {
    const existing = this.cart.find(i => i.id === item.id);
    if (existing) { existing.quantity++; }
    else { this.cart.push({ ...item, quantity: 1 }); }
    this.saveCart();
  },
  removeItem(itemId) {
    const idx = this.cart.findIndex(i => i.id === itemId);
    if (idx > -1) { if (this.cart[idx].quantity > 1) this.cart[idx].quantity--; else this.cart.splice(idx, 1); }
    this.saveCart();
  },
  clearCart() { this.cart = []; this.saveCart(); },
  getItemQty(itemId) { const item = this.cart.find(i => i.id === itemId); return item ? item.quantity : 0; },
  saveCart() { localStorage.setItem('appCart', JSON.stringify(this.cart)); },
  formatPrice(val) { const n = parseFloat(val || 0).toFixed(2); return this.currencyAlign === 'left' ? this.currency + n : n + this.currency; }
});
