// Tab Bar
const TabBar = {
  template: `
    <div class="tab-bar">
      <router-link to="/" class="tab-item" :class="{active: $route.path === '/'}"><i class="fas fa-home"></i><span>Inicio</span></router-link>
      <router-link to="/explore" class="tab-item" :class="{active: $route.path === '/explore'}"><i class="fas fa-search"></i><span>Buscar</span></router-link>
      <router-link to="/cart" class="tab-item" :class="{active: $route.path === '/cart'}" style="position:relative">
        <i class="fas fa-shopping-bag"></i><span>Carrito</span>
        <span v-if="cartCount" style="position:absolute;top:2px;right:50%;transform:translateX(120%);background:var(--primary);color:#fff;font-size:9px;min-width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:10px;padding:0 4px">{{cartCount}}</span>
      </router-link>
      <router-link to="/account" class="tab-item" :class="{active: $route.path === '/account'}"><i class="fas fa-user"></i><span>Cuenta</span></router-link>
    </div>`,
  computed: { cartCount() { return Store.cartCount; } }
};

// App Header
const AppHeader = {
  props: ['title', 'back', 'showLocation'],
  template: `
    <div class="header">
      <button v-if="back" class="header-back" @click="goBack"><i class="fas fa-arrow-left"></i></button>
      <div v-if="showLocation && location" class="header-location" @click="$router.push('/location')">
        <i class="fas fa-map-marker-alt"></i>{{location.address.substring(0,30)}}...
      </div>
      <span v-else class="header-title">{{title}}</span>
      <button v-if="showLocation && Store.isLoggedIn" style="background:none;position:relative;padding:8px;font-size:18px;color:var(--text)" @click="$router.push('/notifications')">
        <i class="fas fa-bell"></i>
      </button>
    </div>`,
  computed: { location() { return Store.location; } },
  setup() { return { Store }; },
  methods: { goBack() { if (typeof this.back === 'string') this.$router.push(this.back); else this.$router.back(); } }
};

// Cart Float Button
const CartFloat = {
  template: `
    <div class="cart-float" v-if="Store.cartCount > 0" @click="$router.push('/cart')">
      <span class="cart-float-text">{{Store.cartCount}} item(s)</span>
      <span class="cart-float-total">{{Store.formatPrice(Store.cartTotal)}} <i class="fas fa-arrow-right"></i></span>
    </div>`,
  setup() { return { Store }; }
};
