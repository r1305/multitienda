// ==================== 1. HOME ====================
const HomePage = {
  template: `
    <div class="page">
      <app-header :showLocation="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!Store.location" style="padding:20px;text-align:center">
          <p style="margin-bottom:12px;color:var(--muted)">Selecciona tu ubicación para ver restaurantes</p>
          <button class="btn-primary" @click="$router.push('/location')"><i class="fas fa-map-marker-alt"></i> Seleccionar ubicación</button>
        </div>
        <template v-else>
          <div v-if="sliders.length" class="slider">
            <div v-for="s in sliders" :key="s.id" class="slider-item"><img :src="s.image" :alt="s.name"></div>
          </div>
          <div class="delivery-toggle">
            <button :class="{active: mode==='delivery'}" @click="mode='delivery'; loadStores()">Delivery</button>
            <button :class="{active: mode==='pickup'}" @click="mode='pickup'; loadStores()">Recoger</button>
          </div>
          <div class="section-title" v-if="stores.length">{{stores.length}} restaurantes</div>
          <div style="padding:0 16px">
            <div v-for="s in sortedStores" :key="s.id" class="store-card" :class="{'store-closed':!s.is_active}">
              <div style="flex:1;display:flex;gap:12px" @click="$router.push('/store/'+s.slug)">
                <img :src="s.image || '/assets/img/various/store-placeholder.png'" class="store-card-img">
                <div class="store-card-info">
                  <div class="store-card-name">{{s.name}}</div>
                  <div class="store-card-desc">{{s.description}}</div>
                  <span v-if="s.is_featured" class="store-card-badge">Destacado</span>
                  <div class="store-card-meta">
                    <span><i class="fas fa-star" style="color:var(--primary)"></i> {{s.avgRating || s.rating || '-'}}</span>
                    <span><i class="fas fa-clock"></i> {{s.delivery_time || '?'}} min</span>
                    <span><i class="fas fa-wallet"></i> {{Store.formatPrice(s.price_range || 0)}}</span>
                  </div>
                </div>
              </div>
              <button style="background:none;padding:8px;align-self:flex-start" @click.stop="toggleFav(s)">
                <i :class="isFav(s.id) ? 'fas' : 'far'" class="fa-star" :style="{color: isFav(s.id) ? '#ffc107' : '#ccc', fontSize:'20px'}"></i>
              </button>
            </div>
          </div>
          <div v-if="!stores.length && !loading" class="empty-state">
            <i class="fas fa-store-slash"></i>
            <p>No hay restaurantes en tu zona</p>
          </div>
        </template>
      </template>
      <cart-float></cart-float>
    </div>`,
  components: { AppHeader, CartFloat },
  data() { return { loading: false, stores: [], sliders: [], mode: 'delivery', favorites: JSON.parse(localStorage.getItem('appFavorites') || '[]') }; },
  setup() { return { Store }; },
  computed: {
    sortedStores() {
      const favIds = this.favorites;
      return [...this.stores].sort((a, b) => {
        const aFav = favIds.includes(a.id) ? 1 : 0;
        const bFav = favIds.includes(b.id) ? 1 : 0;
        return bFav - aFav;
      });
    }
  },
  async mounted() { if (Store.location) { await this.loadStores(); await this.loadSliders(); } },
  methods: {
    async loadSliders() {
      try { const res = await API.getPromoSliders(Store.location.lat, Store.location.lng); this.sliders = Array.isArray(res) ? res.filter(s => s.image) : []; } catch(e) {}
    },
    async loadStores() {
      this.loading = true;
      const { lat, lng } = Store.location;
      try {
        if (this.mode === 'delivery') this.stores = await API.getDeliveryRestaurants(lat, lng);
        else this.stores = await API.getSelfpickupRestaurants(lat, lng);
      } catch(e) { this.stores = []; }
      this.loading = false;
    },
    isFav(id) { return this.favorites.includes(id); },
    async toggleFav(store) {
      const idx = this.favorites.indexOf(store.id);
      if (idx > -1) this.favorites.splice(idx, 1);
      else this.favorites.push(store.id);
      localStorage.setItem('appFavorites', JSON.stringify(this.favorites));
      if (Store.isLoggedIn) {
        try { await API.toggleFavorite(Store.user.auth_token, store.id); } catch(e) {}
      }
    }
  }
};

// ==================== 2. LOCATION ====================
const LocationPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Seleccionar ubicacion" :back="true"></app-header>
      <div class="gps-btn" @click="useGPS">
        <i class="fas fa-crosshairs"></i>
        <span>Usar mi ubicacion actual</span>
      </div>
      <template v-if="Store.isLoggedIn">
        <div v-if="addresses.length" class="section-title">Mis direcciones</div>
        <div v-for="a in addresses" :key="a.id" class="location-item" @click="selectAddress(a)">
          <i class="fas fa-home" style="color:var(--primary)"></i>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:500">{{a.tag || a.house || 'Direccion'}}</div>
            <div style="font-size:12px;color:var(--muted)">{{a.address}}</div>
          </div>
        </div>
        <div v-if="!addresses.length && !gpsLoading" style="text-align:center;padding:30px;color:var(--muted)"><p style="font-size:13px">No tienes direcciones guardadas. Usa tu GPS o agrega una desde tu perfil.</p></div>
      </template>
      <template v-else>
        <div style="text-align:center;padding:30px;color:var(--muted)"><p style="font-size:13px">Permite el acceso a tu ubicacion para mostrarte tiendas cercanas</p><p style="font-size:12px;margin-top:8px"><router-link to="/login" style="color:var(--primary);font-weight:600">Inicia sesion</router-link> para ver tus direcciones guardadas</p></div>
      </template>
      <div v-if="gpsLoading" class="loading"><div class="spinner"></div></div>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { addresses: [], gpsLoading: false }; },
  async mounted() {
    if (Store.isLoggedIn) {
      try { this.addresses = await API.getAddresses(Store.user.id, Store.user.auth_token) || []; } catch(e) {}
    }
  },
  methods: {
    selectAddress(a) {
      Store.setLocation({ lat: parseFloat(a.latitude), lng: parseFloat(a.longitude), address: a.address, house: a.house, tag: a.tag });
      this.$router.push('/');
    },
    useGPS() {
      if (!navigator.geolocation) return alert('GPS no disponible');
      this.gpsLoading = true;
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          let address = latitude.toFixed(4) + ', ' + longitude.toFixed(4);
          try { const res = await API.coordinateToAddress(latitude, longitude); if (res) address = res; } catch(e) {}
          Store.setLocation({ lat: latitude, lng: longitude, address });
          this.gpsLoading = false;
          this.$router.push('/');
        },
        () => { this.gpsLoading = false; alert('No se pudo obtener la ubicacion'); },
        { timeout: 10000 }
      );
    }
  }
};

// ==================== 3. STORE LIST (reuses Home, but separate route possible) ====================
// Already handled in HomePage with delivery/pickup toggle

// ==================== 4. STORE DETAIL ====================
const StoreDetailPage = {
  template: `
    <div class="page">
      <div v-if="loading" class="loading" style="padding-top:60px"><div class="spinner"></div></div>
      <template v-else-if="restaurant">
        <div class="store-hero">
          <app-header :title="restaurant.name" :back="true"></app-header>
          <img v-if="restaurant.image" :src="restaurant.image" class="store-hero-img">
          <div class="store-hero-info">
            <div class="store-hero-name">{{restaurant.name}}</div>
            <div class="store-hero-desc">{{restaurant.description}}</div>
            <div class="store-hero-meta">
              <span><i class="fas fa-star" style="color:var(--primary)"></i> {{restaurant.avgRating || restaurant.rating || '-'}}</span>
              <span><i class="fas fa-clock"></i> {{restaurant.delivery_time}} min</span>
              <span><i class="fas fa-motorcycle"></i> {{Store.formatPrice(restaurant.delivery_charges || 0)}}</span>
            </div>
          </div>
        </div>
        <div class="cat-tabs" v-if="categories.length > 1">
          <div v-for="cat in categories" :key="cat" class="cat-tab" :class="{active: activeCat===cat}" @click="activeCat=cat">{{cat}}</div>
        </div>
        <div style="padding:0 16px">
          <div v-for="cat in filteredCategories" :key="cat">
            <div class="section-title" style="padding-left:0">{{cat}}</div>
            <div v-for="item in items[cat]" :key="item.id" class="item-card">
              <div class="item-card-info">
                <div class="item-card-name">{{item.name}}</div>
                <div class="item-card-desc">{{item.description}}</div>
                <div class="item-card-price">
                  {{Store.formatPrice(item.price)}}
                  <span v-if="item.old_price > 0" class="item-card-old-price">{{Store.formatPrice(item.old_price)}}</span>
                </div>
                <div v-if="!item.image" style="margin-top:8px">
                  <div v-if="getQty(item.id)" class="qty-control">
                    <button class="qty-btn" @click="removeFromCart(item)">−</button>
                    <span class="qty-val">{{getQty(item.id)}}</span>
                    <button class="qty-btn" @click="addToCart(item)">+</button>
                  </div>
                  <button v-else class="btn-add-no-img" @click="addToCart(item)">ADD</button>
                </div>
              </div>
              <div v-if="item.image" class="item-card-img">
                <img :src="item.image" style="width:100%;height:100%;object-fit:cover;border-radius:10px">
                <div v-if="getQty(item.id)" class="qty-control" style="position:absolute;bottom:-10px;left:50%;transform:translateX(-50%)">
                  <button class="qty-btn" @click="removeFromCart(item)">−</button>
                  <span class="qty-val">{{getQty(item.id)}}</span>
                  <button class="qty-btn" @click="addToCart(item)">+</button>
                </div>
                <button v-else class="btn-add" @click="addToCart(item)">ADD</button>
              </div>
            </div>
          </div>
        </div>
      </template>
      
      <div v-if="showAddonModal" class="modal-overlay" @click.self="showAddonModal=false">
        <div class="modal-content">
          <div class="modal-title">{{selectedItem ? selectedItem.name : ''}}</div>
          <div v-if="selectedItem" v-for="cat in selectedItem.addon_categories" :key="cat.id" style="margin-bottom:14px">
            <div style="font-size:13px;font-weight:600;margin-bottom:6px">{{cat.name}} <small style="color:var(--muted)">({{cat.type==='SINGLE'?'elige 1':'elige varios'}})</small></div>
            <div v-for="addon in cat.addons" :key="addon.id" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;margin-bottom:4px;cursor:pointer" :style="{background:isAddonSelected(addon)?'#fff3e0':'var(--bg)'}" @click="toggleAddon(cat,addon)">
              <i :class="isAddonSelected(addon)?'fas fa-check-circle':'far fa-circle'" :style="{color:isAddonSelected(addon)?'var(--primary)':'#ccc'}"></i>
              <span style="flex:1;font-size:13px">{{addon.name}}</span>
              <span style="font-size:13px;font-weight:600">+{{Store.formatPrice(addon.price)}}</span>
            </div>
          </div>
          <button class="btn-primary" @click="confirmAddons">Agregar al carrito</button>
        </div>
      </div>
      <cart-float></cart-float>
    </div>`,
  components: { AppHeader, CartFloat },
  data() { return { loading: true, restaurant: null, items: {}, recommended: [], activeCat: null, showAddonModal: false, selectedItem: null, selectedAddons: [] }; },
  setup() { return { Store }; },
  computed: {
    categories() { return Object.keys(this.items); },
    filteredCategories() { return this.activeCat ? [this.activeCat] : this.categories; }
  },
  async mounted() {
    const slug = this.$route.params.slug;
    try {
      const [info, itemsData] = await Promise.all([API.getRestaurantInfo(slug), API.getRestaurantItems(slug)]);
      this.restaurant = info;
      this.items = itemsData.items || {};
      this.recommended = itemsData.recommended || [];
      if (this.categories.length) this.activeCat = null;
    } catch(e) { console.error(e); }
    this.loading = false;
  },
  methods: {
    getQty(id) { return Store.getItemQty(id); },
    addToCart(item) {
      if (item.addon_categories && item.addon_categories.length) {
        this.selectedItem = item;
        this.selectedAddons = [];
        this.showAddonModal = true;
      } else {
        Store.addItem({ id: item.id, name: item.name, price: parseFloat(item.price), image: item.image, restaurant_id: item.restaurant_id, selectedaddons: [] });
      }
    },
    confirmAddons() {
      const addonTotal = this.selectedAddons.reduce((s, a) => s + parseFloat(a.price), 0);
      Store.addItem({ id: this.selectedItem.id, name: this.selectedItem.name, price: 0, image: this.selectedItem.image, restaurant_id: this.selectedItem.restaurant_id, selectedaddons: this.selectedAddons, addonTotal });
      this.showAddonModal = false;
    },
    toggleAddon(cat, addon) {
      if (cat.type === 'SINGLE' || (!cat.type && cat.addonlimit === 1)) {
        this.selectedAddons = this.selectedAddons.filter(a => a.addon_category_id !== addon.addon_category_id);
        this.selectedAddons.push(addon);
      } else {
        const idx = this.selectedAddons.findIndex(a => a.id === addon.id);
        if (idx > -1) this.selectedAddons.splice(idx, 1);
        else this.selectedAddons.push(addon);
      }
    },
    isAddonSelected(addon) { return this.selectedAddons.some(a => a.id === addon.id); },
    removeFromCart(item) { Store.removeItem(item.id); }
  }
};

// ==================== 5. CART ====================
const CartPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Carrito" :back="true"></app-header>
      <div v-if="!cart.length" class="empty-state">
        <i class="fas fa-shopping-bag"></i>
        <p>Tu carrito está vacío</p>
        <button class="btn-primary" style="margin-top:20px;width:auto;padding:12px 30px;display:inline-block" @click="$router.push('/')">Ver restaurantes</button>
      </div>
      <template v-else>
        <div style="padding:0 16px">
          <div v-for="(item, idx) in cart" :key="idx" class="cart-item">
            <div class="cart-item-info">
              <div class="cart-item-name">{{item.name}}</div>
              <div v-if="item.selectedaddons && item.selectedaddons.length" style="font-size:11px;color:var(--muted);margin-top:2px">{{item.selectedaddons.map(a => a.name).join(', ')}}</div>
              <div class="cart-item-price">{{Store.formatPrice(item.addonTotal || item.price)}}</div>
            </div>
            <div class="qty-control">
              <button class="qty-btn" @click="remove(item, idx)">{{item.quantity === 1 ? '🗑' : '−'}}</button>
              <span class="qty-val">{{item.quantity}}</span>
              <button class="qty-btn" @click="add(item)">+</button>
            </div>
          </div>
        </div>
        <div class="coupon-input">
          <input v-model="couponCode" placeholder="Código de cupón">
          <button @click="applyCoupon">Aplicar</button>
        </div>
        <div v-if="couponMsg" style="padding:0 16px;font-size:12px" :style="{color: couponOk?'green':'red'}">{{couponMsg}}</div>
        <div class="bill">
          <div class="bill-row"><span>Subtotal</span><span>{{Store.formatPrice(subtotal)}}</span></div>
          <div v-if="discount > 0" class="bill-row"><span>Descuento</span><span style="color:green">-{{Store.formatPrice(discount)}}</span></div>
          <div class="bill-row total"><span>Total</span><span>{{Store.formatPrice(total)}}</span></div>
        </div>
        <div style="padding:16px">
          <button class="btn-primary" @click="checkout"><i class="fas fa-lock"></i> Proceder al pago</button>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  data() { return { couponCode: '', couponMsg: '', couponOk: false, discount: 0 }; },
  setup() { return { Store }; },
  computed: {
    cart() { return Store.cart; },
    subtotal() { return Store.cartTotal; },
    total() { return Math.max(0, this.subtotal - this.discount); }
  },
  methods: {
    add(item) { Store.addItem(item); },
    remove(item, idx) { Store.removeItemByIndex(idx); },
    async applyCoupon() {
      if (!this.couponCode) return;
      try {
        const restaurantId = Store.cart.length ? Store.cart[0].restaurant_id : null;
        const res = await API.applyCoupon(null, this.couponCode, restaurantId, this.subtotal);
        if (res.success && res.coupon) {
          this.couponOk = true;
          if (res.coupon.discount_type === 'PERCENTAGE') this.discount = this.subtotal * parseFloat(res.coupon.discount) / 100;
          else this.discount = parseFloat(res.coupon.discount || 0);
          if (res.coupon.max_discount && this.discount > parseFloat(res.coupon.max_discount)) this.discount = parseFloat(res.coupon.max_discount);
          this.couponMsg = 'Cupón aplicado!';
          Store.appliedCoupon = { code: res.coupon.code }; Store.saveCart();
        } else { this.couponOk = false; this.couponMsg = res.message || 'Cupón inválido'; this.discount = 0; Store.appliedCoupon = null; Store.saveCart(); }
      } catch(e) { this.couponMsg = 'Error aplicando cupón'; }
    },
    checkout() { this.$router.push('/checkout'); }
  }
};

// Placeholder pages
const ExplorePage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Buscar"></app-header>
      <div class="search-box" style="margin-top:0;border-radius:0;box-shadow:none;border-bottom:1px solid var(--border)">
        <i class="fas fa-search"></i>
        <input v-model="query" @input="onSearch" placeholder="Buscar restaurantes o items...">
        <i v-if="query" class="fas fa-times" style="cursor:pointer" @click="query='';results=null"></i>
      </div>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else-if="results">
        <div v-if="results.restaurants && results.restaurants.length">
          <div class="section-title">Restaurantes</div>
          <div style="padding:0 16px">
            <div v-for="r in results.restaurants" :key="r.id" class="store-card" @click="$router.push('/store/'+r.slug)">
              <img :src="r.image || '/assets/img/various/store-placeholder.png'" class="store-card-img">
              <div class="store-card-info"><div class="store-card-name">{{r.name}}</div><div class="store-card-desc">{{r.description}}</div></div>
            </div>
          </div>
        </div>
        <div v-if="results.items && results.items.length">
          <div class="section-title">Items</div>
          <div style="padding:0 16px">
            <div v-for="item in results.items" :key="item.id" class="item-card" @click="$router.push('/store/'+item.restaurant.slug)">
              <div class="item-card-info"><div class="item-card-name">{{item.name}}</div><div class="item-card-desc">{{item.restaurant.name}}</div><div class="item-card-price">{{Store.formatPrice(item.price)}}</div></div>
              <div v-if="item.image" class="item-card-img"><img :src="item.image" style="width:100%;height:100%;object-fit:cover;border-radius:10px"></div>
            </div>
          </div>
        </div>
        <div v-if="(!results.restaurants || !results.restaurants.length) && (!results.items || !results.items.length)" class="empty-state"><i class="fas fa-search"></i><p>Sin resultados</p></div>
      </template>
      <div v-else class="empty-state" style="padding-top:80px"><i class="fas fa-search" style="font-size:36px"></i><p>Escribe al menos 3 caracteres</p></div>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { query: '', results: null, loading: false, timer: null }; },
  methods: {
    onSearch() {
      clearTimeout(this.timer);
      if (this.query.length < 3) { this.results = null; return; }
      this.timer = setTimeout(async () => {
        this.loading = true;
        const loc = Store.location || { lat: 0, lng: 0 };
        try { this.results = await API.searchRestaurants(loc.lat, loc.lng, this.query); } catch(e) { this.results = null; }
        this.loading = false;
      }, 400);
    }
  }
};

// ==================== 6. LOGIN ====================
const LoginPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Iniciar Sesión" :back="true"></app-header>
      <div style="padding:24px 16px">
        <div style="text-align:center;margin-bottom:30px"><i class="fas fa-user-circle" style="font-size:60px;color:var(--border)"></i><h2 style="margin-top:12px;font-size:20px">Bienvenido</h2><p style="color:var(--muted);font-size:13px">Inicia sesión para continuar</p></div>
        <div v-if="error" style="background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{error}}</div>
        <form @submit.prevent="doLogin">
          <div style="margin-bottom:14px"><input v-model="email" type="email" placeholder="Email" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="password" type="password" placeholder="Contraseña" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Cargando...' : 'Iniciar Sesión'}}</button>
        </form>
        <div style="text-align:center;margin-top:20px;font-size:13px">
          <router-link to="/forgot-password" style="color:var(--primary)">Olvidé mi contraseña</router-link>
        </div>
        <div style="text-align:center;margin-top:16px;font-size:13px">No tienes cuenta? <router-link to="/register" style="color:var(--primary);font-weight:600">Regístrate</router-link></div>
      </div>
    </div>`,
  components: { AppHeader },
  data() { return { email: '', password: '', error: '', loading: false }; },
  methods: {
    async doLogin() {
      this.error = ''; this.loading = true;
      try {
        const res = await API.login(this.email, this.password);
        if (res.success) {
          API.setToken(res.data.auth_token); Store.setUser(res.data); 
          // Set OneSignal tags and request permission
          if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(async function(OneSignal) {
              const permission = await OneSignal.Notifications.permission;
              if (!permission) await OneSignal.Notifications.requestPermission();
              const role = res.data.role || 'customer';
              OneSignal.User.addTags({ user_id: String(res.data.id), role: role.toLowerCase().replace(' ', '_') });
            });
          }
          this.$router.push('/account');
        }
        else this.error = 'Credenciales incorrectas';
      } catch(e) { this.error = 'Error de conexión'; }
      this.loading = false;
    }
  }
};

// ==================== 7. REGISTER ====================
const RegisterPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Crear Cuenta" :back="true"></app-header>
      <div style="padding:24px 16px">
        <div v-if="error" style="background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{error}}</div>
        <form @submit.prevent="doRegister">
          <div style="margin-bottom:14px"><input v-model="name" type="text" placeholder="Nombre" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="email" type="email" placeholder="Email" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="phone" type="tel" placeholder="Teléfono" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="password" type="password" placeholder="Contraseña" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Creando...' : 'Crear Cuenta'}}</button>
        </form>
        <div style="text-align:center;margin-top:16px;font-size:13px">Ya tienes cuenta? <router-link to="/login" style="color:var(--primary);font-weight:600">Inicia Sesión</router-link></div>
      </div>
    </div>`,
  components: { AppHeader },
  data() { return { name: '', email: '', phone: '', password: '', error: '', loading: false }; },
  methods: {
    async doRegister() {
      this.error = ''; this.loading = true;
      try {
        const res = await API.register(this.name, this.email, this.phone, this.password);
        if (res.success) { API.setToken(res.data.auth_token); Store.setUser(res.data); this.$router.push('/'); }
        else this.error = res.message || 'Error al registrar';
      } catch(e) { this.error = 'Error de conexión'; }
      this.loading = false;
    }
  }
};

// ==================== 8. FAVORITES ====================
const FavoritesPage = {
  template: `
    <div class="page">
      <app-header title="Mis Favoritos" :back="true"></app-header>
      <div v-if="!Store.isLoggedIn" class="empty-state"><i class="fas fa-heart"></i><p>Inicia sesión para ver tus favoritos</p><button class="btn-primary" style="margin-top:16px;width:auto;padding:10px 24px;display:inline-block" @click="$router.push('/login')">Iniciar Sesión</button></div>
      <div v-else-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!stores.length" class="empty-state"><i class="fas fa-heart-broken"></i><p>No tienes favoritos aún</p></div>
        <div style="padding:0 16px">
          <div v-for="s in stores" :key="s.id" class="store-card" @click="$router.push('/store/'+s.slug)">
            <img :src="s.image || '/assets/img/various/store-placeholder.png'" class="store-card-img">
            <div class="store-card-info"><div class="store-card-name">{{s.name}}</div><div class="store-card-desc">{{s.description}}</div>
              <div class="store-card-meta"><span><i class="fas fa-star" style="color:var(--primary)"></i> {{s.avgRating || s.rating || '-'}}</span><span><i class="fas fa-clock"></i> {{s.delivery_time}} min</span></div>
            </div>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { stores: [], loading: false }; },
  async mounted() {
    if (!Store.isLoggedIn) return;
    this.loading = true;
    const loc = Store.location || { lat: 0, lng: 0 };
    try { this.stores = await API.getFavoriteStores(Store.user.auth_token, loc.lat, loc.lng) || []; } catch(e) {}
    this.loading = false;
  }
};

// ==================== 9. NOTIFICATIONS ====================
const NotificationsPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Notificaciones" :back="true"></app-header>
      <div v-if="!Store.isLoggedIn" class="empty-state"><i class="fas fa-bell"></i><p>Inicia sesion para ver notificaciones</p><button class="btn-primary" style="margin-top:16px;width:auto;padding:10px 24px;display:inline-block" @click="\$router.push('/login')">Iniciar Sesion</button></div>
      <div v-else-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!notifications.length" class="empty-state"><i class="fas fa-bell-slash"></i><p>No tienes notificaciones</p></div>
        <div v-else>
          <div style="padding:8px 16px;text-align:right" v-if="notifications.length"><button style="background:none;color:var(--primary);font-size:12px;font-weight:600" @click="markAll">Marcar todas como leidas</button></div>
          <div v-for="n in notifications" :key="n.id" class="location-item" :style="{background: n.read_at ? '#fff' : '#fff8e1', cursor:'pointer'}" @click="goToOrder(n)">
            <i class="fas fa-bell" :style="{color: n.read_at ? 'var(--muted)' : 'var(--primary)'}"></i>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:500">{{n.data && n.data.title ? n.data.title : 'Notificacion'}}</div>
              <div style="font-size:12px;color:var(--muted)">{{n.data && n.data.message ? n.data.message : ''}}</div>
              <div style="font-size:11px;color:var(--muted);margin-top:4px">{{formatDate(n.created_at)}}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { notifications: [], loading: false }; },
  async mounted() {
    if (!Store.isLoggedIn) return;
    this.loading = true;
    try {
      const res = await API.getNotifications(Store.user.id, Store.user.auth_token);
      this.notifications = Array.isArray(res) ? res.map(n => ({ ...n, data: typeof n.data === 'string' ? JSON.parse(n.data || '{}') : (n.data || {}) })) : [];
    } catch(e) {}
    this.loading = false;
  },
  methods: {
    formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); },
    async markAll() { try { await API.markAllRead(Store.user.id, Store.user.auth_token); this.notifications.forEach(n => n.read_at = new Date()); } catch(e) {} },
    goToOrder(n) {
      if (n.data && n.data.unique_order_id) this.$router.push('/order/' + n.data.unique_order_id);
      else if (n.data && n.data.order_id) this.$router.push('/orders');
    }
  }
};

// ==================== 10. EXPLORE/SEARCH ====================
// Already defined above as ExplorePage

// ==================== 11. FORGOT PASSWORD ====================
const ForgotPasswordPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Recuperar Contraseña" :back="true"></app-header>
      <div style="padding:24px 16px">
        <template v-if="step===1">
          <p style="color:var(--muted);font-size:13px;margin-bottom:20px">Ingresa tu email y te enviaremos un código para restablecer tu contraseña.</p>
          <div v-if="error" style="background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{error}}</div>
          <form @submit.prevent="sendCode">
            <div style="margin-bottom:14px"><input v-model="email" type="email" placeholder="Email" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
            <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Enviando...' : 'Enviar Código'}}</button>
          </form>
        </template>
        <template v-else-if="step===2">
          <p style="color:var(--muted);font-size:13px;margin-bottom:20px">Ingresa el código enviado a {{email}}</p>
          <div v-if="error" style="background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{error}}</div>
          <form @submit.prevent="verifyCode">
            <div style="margin-bottom:14px"><input v-model="code" type="text" placeholder="Código" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px;text-align:center;letter-spacing:4px"></div>
            <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Verificando...' : 'Verificar'}}</button>
          </form>
        </template>
        <template v-else>
          <p style="color:var(--muted);font-size:13px;margin-bottom:20px">Ingresa tu nueva contraseña</p>
          <div v-if="error" style="background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{error}}</div>
          <div v-if="success" style="background:#e8f5e9;color:#2e7d32;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{success}}</div>
          <form @submit.prevent="resetPassword">
            <div style="margin-bottom:14px"><input v-model="password" type="password" placeholder="Nueva contraseña" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
            <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Guardando...' : 'Cambiar Contraseña'}}</button>
          </form>
        </template>
      </div>
    </div>`,
  components: { AppHeader },
  data() { return { step: 1, email: '', code: '', password: '', error: '', success: '', loading: false }; },
  methods: {
    async sendCode() {
      this.error = ''; this.loading = true;
      try { const res = await API.forgotPassword(this.email); if (res.success) this.step = 2; else this.error = 'No se pudo enviar el código'; } catch(e) { this.error = 'Error de conexión'; }
      this.loading = false;
    },
    async verifyCode() {
      this.error = ''; this.loading = true;
      try { const res = await API.verifyResetOtp(this.email, this.code); if (res.success) this.step = 3; else this.error = 'Código inválido'; } catch(e) { this.error = 'Error'; }
      this.loading = false;
    },
    async resetPassword() {
      this.error = ''; this.loading = true;
      try { const res = await API.changePassword(this.email, this.code, this.password); if (res.success) { this.success = 'Contraseña cambiada!'; setTimeout(() => this.$router.push('/login'), 1500); } else this.error = 'Error al cambiar'; } catch(e) { this.error = 'Error'; }
      this.loading = false;
    }
  }
};

// ==================== ACCOUNT ====================
const AccountPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Mi Cuenta"></app-header>
      <div v-if="!Store.isLoggedIn" style="padding:40px 16px;text-align:center">
        <i class="fas fa-user-circle" style="font-size:60px;color:var(--border)"></i>
        <p style="margin:16px 0;color:var(--muted)">Inicia sesión para acceder a tu cuenta</p>
        <button class="btn-primary" style="width:auto;padding:12px 30px;display:inline-block" @click="$router.push('/login')">Iniciar Sesión</button>
      </div>
      <template v-else>
        <div style="padding:20px 16px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--border)">
          <div style="width:50px;height:50px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700">{{Store.user.name ? Store.user.name[0].toUpperCase() : 'U'}}</div>
          <div><div style="font-weight:600;font-size:16px">{{Store.user.name}}</div><div style="font-size:13px;color:var(--muted)">{{Store.user.email}}</div></div>
        </div>
        <div class="account-menu">
          <div class="location-item" @click="$router.push('/orders')"><i class="fas fa-receipt"></i><span class="location-item-text">Mis Pedidos</span></div>
          <div class="location-item" @click="$router.push('/addresses')"><i class="fas fa-map-marker-alt"></i><span class="location-item-text">Mis Direcciones</span></div>
          <div class="location-item" @click="$router.push('/wallet')"><i class="fas fa-wallet"></i><span class="location-item-text">Mi Billetera</span></div>
          <div class="location-item" @click="$router.push('/favorites')"><i class="fas fa-heart"></i><span class="location-item-text">Mis Favoritos</span></div>
          <div class="location-item" @click="$router.push('/notifications')"><i class="fas fa-bell"></i><span class="location-item-text">Notificaciones</span></div>
          <div class="location-item" @click="doLogout" style="color:#e53935"><i class="fas fa-sign-out-alt" style="color:#e53935"></i><span class="location-item-text">Cerrar Sesión</span></div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  methods: { doLogout() { Store.logout(); this.$router.push('/'); } }
};


// ==================== 12. CHECKOUT ====================
const CheckoutPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Pago" :back="true"></app-header>
      <div v-if="!Store.isLoggedIn" class="empty-state"><i class="fas fa-lock"></i><p>Inicia sesión para pagar</p><button class="btn-primary" style="margin-top:16px;width:auto;padding:10px 24px;display:inline-block" @click="$router.push('/login')">Iniciar Sesión</button></div>
      <div v-else-if="processing" class="loading" style="padding-top:80px"><div class="spinner"></div><p style="text-align:center;margin-top:16px;color:var(--muted)">Procesando tu orden...</p></div>
      <template v-else>
        <div v-if="addresses.length" style="padding:12px 16px;border-bottom:1px solid var(--border)">
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Entregar en:</div>
          <div v-for="a in addresses" :key="a.id" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;margin-bottom:6px;cursor:pointer" :style="{border: selectedAddress && selectedAddress.id===a.id ? '2px solid var(--primary)' : '1px solid var(--border)'}" @click="selectedAddress=a">
            <i class="fas fa-map-marker-alt" :style="{color: selectedAddress && selectedAddress.id===a.id ? 'var(--primary)' : 'var(--muted)'}"></i>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500">{{a.tag || a.house || 'Dirección'}}</div>
              <div style="font-size:11px;color:var(--muted)">{{a.address}}</div>
            </div>
            <i v-if="selectedAddress && selectedAddress.id===a.id" class="fas fa-check-circle" style="color:var(--primary)"></i>
          </div>
          <router-link to="/addresses" style="font-size:12px;color:var(--primary)">+ Agregar nueva</router-link>
        </div>
        <div v-else style="padding:12px 16px;border-bottom:1px solid var(--border)">
          <p style="font-size:13px;color:var(--muted)">No tienes direcciones guardadas</p>
          <router-link to="/addresses" style="font-size:13px;color:var(--primary);font-weight:600">+ Agregar dirección</router-link>
        </div>
        <div class="bill">
          <div class="bill-row"><span>Subtotal</span><span>{{Store.formatPrice(Store.cartTotal)}}</span></div>
          <div class="bill-row"><span>Envío</span><span>{{Store.formatPrice(deliveryCharge)}}</span></div>
          <div v-if="restaurantCharge > 0" class="bill-row"><span>Cargo servicio</span><span>{{Store.formatPrice(restaurantCharge)}}</span></div>
          <div class="bill-row total"><span>Total</span><span>{{Store.formatPrice(total)}}</span></div>
        </div>
        <div v-if="storeIsSchedulable" style="padding:12px 16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:14px"><input type="checkbox" v-model="isScheduled"> Programar pedido</label>
          </div>
          <div v-if="isScheduled" style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="date" v-model="scheduleDate" :min="todayDate" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
            <input type="time" v-model="scheduleTime" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
          </div>
        </div>
        <div class="section-title">Método de pago</div>
        <div style="padding:0 16px">
          <div v-for="gw in gateways" :key="gw.id" style="border-radius:8px;margin-bottom:8px;border:1px solid var(--border);padding:12px;cursor:pointer" @click="pay(gw.name)">
            <div style="display:flex;align-items:center;gap:10px">
              <i :class="gwIcon(gw.name)" style="font-size:20px"></i>
              <span style="flex:1;font-size:14px;font-weight:500">{{gw.name}}</span>
              <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
            </div>
            <div v-if="gw.account_number" style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-left:30px"><span style="font-size:12px;color:var(--muted)">Cuenta: {{gw.account_number}}</span><i class="fas fa-copy" style="color:var(--primary);font-size:11px;cursor:pointer" @click.stop="copyText(gw.account_number)"></i></div>
            <div v-if="gw.phone_number" style="display:flex;align-items:center;gap:6px;margin-top:4px;padding-left:30px"><span style="font-size:12px;color:var(--muted)">Cel: {{gw.phone_number}}</span><i class="fas fa-copy" style="color:var(--primary);font-size:11px;cursor:pointer" @click.stop="copyText(gw.phone_number)"></i></div>
          </div>
          <div v-if="!gateways.length" class="location-item" style="border-radius:8px;border:1px solid var(--border)" @click="pay('COD')">
            <i class="fas fa-money-bill" style="font-size:20px;color:green"></i>
            <span class="location-item-text">Pago en efectivo</span>
          </div>
        </div>
        <div v-if="copied" style="padding:4px 16px;font-size:12px;color:#4caf50;text-align:center"><i class="fas fa-check"></i> Copiado!</div>
                <div v-if="error" style="padding:16px;color:#c62828;font-size:13px">{{error}}</div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { gateways: [], processing: false, error: '', deliveryCharge: 0, restaurantCharge: 0, addresses: [], selectedAddress: null, isScheduled: false, scheduleDate: '', scheduleTime: '', storeIsSchedulable: false, copied: false }; },
  computed: {
    total() { return Store.cartTotal + this.deliveryCharge + this.restaurantCharge; },
    todayDate() { return new Date().toISOString().split('T')[0]; }
  },
  async mounted() {
    if (!Store.isLoggedIn) return;
    try { const res = await API.getPaymentGateways(Store.user.auth_token, null); if (Array.isArray(res)) this.gateways = res; } catch(e) {}
    try { this.addresses = await API.getAddresses(Store.user.id, Store.user.auth_token) || []; if (this.addresses.length) this.selectedAddress = this.addresses[0]; } catch(e) {}
    // Check if store is schedulable and load charges
    if (Store.cart.length && Store.cart[0].restaurant_id) {
      try {
        const info = await API.post('/get-restaurant-info-by-id/' + Store.cart[0].restaurant_id, {});
        if (info && info.is_schedulable) this.storeIsSchedulable = true;
        if (info && info.restaurant_charges) this.restaurantCharge = parseFloat(info.restaurant_charges);
        if (info && info.delivery_charges) this.deliveryCharge = parseFloat(info.delivery_charges);
      } catch(e) {}
    }
  },
  methods: {
    gwIcon(name) { return name === 'COD' ? 'fas fa-money-bill' : 'fas fa-wallet'; },
    copyText(text) { navigator.clipboard.writeText(text); this.copied = true; setTimeout(() => { this.copied = false; }, 2000); },
    async pay(method) {
      if (!this.selectedAddress && this.addresses.length) { this.error = 'Selecciona una dirección de entrega'; return; }
      this.processing = true; this.error = '';
      try {
        const addr = this.selectedAddress || Store.location || {};
        const loc = { lat: parseFloat(addr.latitude || addr.lat || 0), lng: parseFloat(addr.longitude || addr.lng || 0), address: addr.address || '' };
        const restaurantId = Store.cart[0] ? Store.cart[0].restaurant_id : null;
        const res = await API.placeOrder({
          token: Store.user.auth_token, user: { data: Store.user },
          order: Store.cart.map(i => ({ id: i.id, quantity: i.quantity, restaurant_id: i.restaurant_id, name: i.name, price: i.addonTotal || i.price, selectedaddons: (i.selectedaddons || []).map(a => ({ addon_id: a.id, addon_name: a.name, addon_category_name: a.addon_category_name || '', price: a.price })) })),
          location: loc,
          total: { totalPrice: Store.cartTotal }, method, payment_token: '',
          delivery_type: 1, partial_wallet: false, dis: 0, pending_payment: false,
          tipAmount: null, cash_change_amount: null, order_comment: '', coupon: Store.appliedCoupon,
          schedule_date: this.isScheduled ? this.scheduleDate : null,
          schedule_slot: this.isScheduled ? this.scheduleTime : null
        });
        if (res && res.success) { Store.clearCart(); this.$router.push('/order/' + res.data.unique_order_id); }
        else { this.error = res.message || 'Error al procesar la orden'; this.processing = false; }
      } catch(e) { this.error = 'Error de conexión'; this.processing = false; }
    }
  }
};

// ==================== 13. MY ORDERS ====================
const OrdersPage = {
  template: `
    <div class="page">
      <app-header title="Mis Pedidos" :back="'/account'"></app-header>
      <div v-if="!Store.isLoggedIn" class="empty-state"><i class="fas fa-receipt"></i><p>Inicia sesión para ver tus pedidos</p><button class="btn-primary" style="margin-top:16px;width:auto;padding:10px 24px;display:inline-block" @click="$router.push('/login')">Iniciar Sesión</button></div>
      <div v-else-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!orders.length" class="empty-state"><i class="fas fa-receipt"></i><p>No tienes pedidos aún</p></div>
        <div style="padding:0 16px">
          <div v-for="o in orders" :key="o.id" class="card" style="cursor:pointer" @click="$router.push('/order/'+o.unique_order_id)">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;font-size:14px">#{{o.unique_order_id}}</span>
                <span :style="{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,background:statusColor(o.orderstatus_id),color:'#fff'}">{{statusText(o.orderstatus_id)}}</span>
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:6px">{{o.restaurant ? o.restaurant.name : ''}}</div>
              <div style="display:flex;justify-content:space-between;margin-top:8px">
                <span style="font-size:13px;color:var(--muted)">{{formatDate(o.created_at)}}</span>
                <span style="font-weight:600;font-size:14px">{{Store.formatPrice(o.total)}}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { orders: [], loading: false }; },
  async mounted() {
    if (!Store.isLoggedIn) return;
    this.loading = true;
    try { const res = await API.getOrders(Store.user.auth_token, Store.user.id); this.orders = res.data || res || []; } catch(e) {}
    this.loading = false;
  },
  methods: {
    statusText(id) { return {1:'Recibida',2:'Preparando',3:'En camino',4:'En camino',5:'Entregado',6:'Cancelado',7:'Listo',8:'Pago pendiente',9:'Pago fallido',10:'Programado',11:'Confirmado'}[id] || 'Desconocido'; },
    statusColor(id) { return {1:'#2196f3',2:'#ff9800',3:'#ff9800',4:'#ff9800',5:'#4caf50',6:'#f44336',7:'#4caf50',8:'#9e9e9e',9:'#f44336',10:'#9c27b0',11:'#2196f3'}[id] || '#9e9e9e'; },
    formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es', { day:'numeric', month:'short', year:'numeric' }); }
  }
};

// ==================== 14. ORDER DETAIL / RUNNING ORDER ====================
const OrderDetailPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header :title="'Orden #'+(order?order.unique_order_id:'')" :back="'/orders'"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else-if="order">
        <div style="padding:16px;text-align:center">
          <div :style="{display:'inline-block',padding:'6px 16px',borderRadius:'20px',fontSize:'13px',fontWeight:600,color:'#fff',background:statusColor(order.orderstatus_id)}">{{statusText(order.orderstatus_id)}}</div>
        </div>
        <div id="orderMap" style="width:calc(100% - 32px);height:250px;background:#eee;border-radius:12px;margin:0 16px 16px"></div>
        <div class="bill">
          <div v-for="item in order.orderitems" :key="item.id">
            <div class="bill-row"><span>{{item.quantity}}x {{item.name}}</span><span>{{Store.formatPrice(item.price * item.quantity)}}</span></div>
            <div v-if="item.order_item_addons && item.order_item_addons.length" style="padding-left:24px;margin-bottom:4px"><div v-for="a in item.order_item_addons" :key="a.id" style="font-size:11px;color:var(--muted)">+ {{a.addon_name}} ({{Store.formatPrice(a.addon_price)}})</div></div>
          </div>
          <div class="bill-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px"><span>Subtotal</span><span>{{Store.formatPrice(order.sub_total || order.total)}}</span></div>
          <div class="bill-row"><span>Envio</span><span>{{Store.formatPrice(order.delivery_charge || 0)}}</span></div>
          <div v-if="order.restaurant_charge > 0" class="bill-row"><span>Cargo servicio</span><span>{{Store.formatPrice(order.restaurant_charge)}}</span></div>
          <div v-if="order.tax_amount > 0" class="bill-row"><span>Impuesto</span><span>{{Store.formatPrice(order.tax_amount)}}</span></div>
          <div v-if="order.coupon_amount > 0" class="bill-row"><span>Cupon</span><span style="color:green">-{{Store.formatPrice(order.coupon_amount)}}</span></div>
          <div class="bill-row total"><span>Total</span><span>{{Store.formatPrice(order.total)}}</span></div>
        </div>
        <div style="padding:0 16px">
          <div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:12px;color:var(--muted)">Restaurante</div><div style="font-size:14px;font-weight:500">{{order.restaurant ? order.restaurant.name : '-'}}</div></div>
          <div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:12px;color:var(--muted)">Pago</div><div style="font-size:14px;font-weight:500">{{order.payment_mode || 'COD'}}</div></div>
          <div v-if="order.address" style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px"><div style="font-size:12px;color:var(--muted)">Direccion</div><div style="font-size:14px">{{order.address}}</div></div>
        </div>
        <div v-if="canCancel" style="padding:16px"><button style="width:100%;padding:12px;border-radius:8px;background:#ffebee;color:#c62828;font-weight:600;font-size:14px" @click="cancelOrder">Cancelar Orden</button></div>
        <div v-if="canRate" style="padding:0 16px 16px"><button class="btn-primary" @click="$router.push('/rate/'+order.id)">Calificar Orden</button></div>
        <div v-if="[3,4].includes(order.orderstatus_id)" style="padding:0 16px 16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:8px"><i class="fas fa-comments" style="color:var(--primary)"></i> Chat con el repartidor</div>
          <div style="background:var(--bg);border-radius:8px;padding:12px;max-height:250px;overflow-y:auto;margin-bottom:8px">
            <div v-if="!messages.length" style="text-align:center;color:var(--muted);font-size:12px;padding:20px">Sin mensajes aun</div>
            <div v-for="m in messages" :key="m.id" :style="{marginBottom:'8px',display:'flex',justifyContent:m.sender_id==Store.user.id?'flex-end':'flex-start'}">
              <div :style="{maxWidth:'75%',padding:'8px 12px',borderRadius:'12px',fontSize:'13px',background:m.sender_id==Store.user.id?'var(--primary)':'#fff',color:m.sender_id==Store.user.id?'#fff':'var(--text)',boxShadow:'0 1px 3px rgba(0,0,0,.1)'}">{{m.message}}<div :style="{fontSize:'10px',marginTop:'4px',opacity:.7}">{{formatTime(m.created_at)}}</div></div>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <input v-model="chatMsg" @keyup.enter="sendMessage" placeholder="Escribe un mensaje..." style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
            <button @click="sendMessage" style="padding:10px 14px;border-radius:8px;background:var(--primary);color:#fff"><i class="fas fa-paper-plane"></i></button>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { order: null, loading: true, refreshInterval: null, map: null, deliveryMarker: null, routeLine: null, googleLoaded: false, messages: [], chatMsg: '', chatInterval: null }; },
  computed: {
    isRunning() { return this.order && [1,2,3,4,7,8].includes(this.order.orderstatus_id); },
    canCancel() { return this.order && [1,10].includes(this.order.orderstatus_id); },
    canRate() { return this.order && this.order.orderstatus_id === 5; }
  },
  async mounted() { await this.loadOrder(); this.loadGoogleMaps(); if (this.isRunning) { this.refreshInterval = setInterval(() => this.loadOrder(), 15000); this.loadMessages(); this.chatInterval = setInterval(() => this.loadMessages(), 10000); } },
  beforeUnmount() { if (this.refreshInterval) clearInterval(this.refreshInterval); if (this.chatInterval) clearInterval(this.chatInterval); },
  methods: {
    async loadOrder() {
      try {
        const res = await API.updateUserInfo(Store.user.id, Store.user.auth_token);
        if (res && res.data && res.data.running_order && res.data.running_order.unique_order_id === this.$route.params.id) { this.order = res.data.running_order; }
        else { const orders = await API.getOrders(Store.user.auth_token, Store.user.id); const list = orders.data || orders || []; this.order = list.find(o => o.unique_order_id === this.$route.params.id) || null; }
        if (this.googleLoaded && this.map) this.updateMap();
      } catch(e) {}
      this.loading = false;
    },
    loadGoogleMaps() {
      const apiKey = Store.settings.googleApiKey;
      if (!apiKey) return;
      if (window.google && window.google.maps) { this.googleLoaded = true; this.$nextTick(() => this.initMap()); return; }
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + apiKey + '&callback=__gmapsLoaded';
      s.async = true;
      window.__gmapsLoaded = () => { this.googleLoaded = true; this.$nextTick(() => this.initMap()); };
      document.head.appendChild(s);
    },
    initMap() {
      if (!this.order || !window.google) return;
      const mapEl = document.getElementById('orderMap');
      if (!mapEl) return;
      const rest = this.order.restaurant;
      let loc = null;
      try { loc = this.order.location ? JSON.parse(this.order.location) : null; } catch(e) {}
      const center = rest ? { lat: parseFloat(rest.latitude), lng: parseFloat(rest.longitude) } : (loc ? { lat: loc.lat, lng: loc.lng } : { lat: 0, lng: 0 });
      this.map = new google.maps.Map(mapEl, { zoom: 14, center, disableDefaultUI: true, zoomControl: true });
      if (rest) new google.maps.Marker({ position: { lat: parseFloat(rest.latitude), lng: parseFloat(rest.longitude) }, map: this.map, title: rest.name, icon: { url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40"><circle cx="32" cy="32" r="30" fill="#4caf50"/><text x="32" y="40" text-anchor="middle" font-size="28" fill="white">🏪</text></svg>'), scaledSize: new google.maps.Size(40, 40) } });
      if (loc) new google.maps.Marker({ position: { lat: loc.lat, lng: loc.lng }, map: this.map, title: 'Tu ubicacion', icon: { url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40"><circle cx="32" cy="32" r="30" fill="#2196f3"/><text x="32" y="40" text-anchor="middle" font-size="28" fill="white">🏠</text></svg>'), scaledSize: new google.maps.Size(40, 40) } });
      // Fit bounds
      if (rest && loc) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: parseFloat(rest.latitude), lng: parseFloat(rest.longitude) });
        bounds.extend({ lat: loc.lat, lng: loc.lng });
        this.map.fitBounds(bounds, 50);
      }
      this.updateMap();
    },
    async updateMap() {
      if (!this.map || !this.order || !window.google) return;
      if ([3, 4].includes(this.order.orderstatus_id)) {
        try {
          const gps = await API.post('/delivery/get-delivery-guy-gps-location', { token: Store.user.auth_token, order_id: this.order.id });
          if (gps && gps.delivery_lat && gps.delivery_long) {
            const pos = { lat: parseFloat(gps.delivery_lat), lng: parseFloat(gps.delivery_long) };
            if (this.deliveryMarker) { this.deliveryMarker.setPosition(pos); }
            else { this.deliveryMarker = new google.maps.Marker({ position: pos, map: this.map, title: 'Repartidor', icon: { url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="40" height="40"><circle cx="32" cy="32" r="30" fill="#ff5722"/><text x="32" y="40" text-anchor="middle" font-size="28" fill="white">🏍</text></svg>'), scaledSize: new google.maps.Size(40, 40) } }); }
            // Draw route when picked up (status 4)
            if (this.order.orderstatus_id === 4) {
              let loc = null;
              try { loc = this.order.location ? JSON.parse(this.order.location) : null; } catch(e) {}
              if (loc) this.drawRoute(pos, { lat: loc.lat, lng: loc.lng });
            }
            // Fit all markers
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(pos);
            const rest = this.order.restaurant;
            if (rest) bounds.extend({ lat: parseFloat(rest.latitude), lng: parseFloat(rest.longitude) });
            let loc = null;
            try { loc = this.order.location ? JSON.parse(this.order.location) : null; } catch(e) {}
            if (loc) bounds.extend({ lat: loc.lat, lng: loc.lng });
            this.map.fitBounds(bounds, 50);
          }
        } catch(e) {}
      }
    },
    drawRoute(origin, dest) {
      new google.maps.DirectionsService().route({ origin, destination: dest, travelMode: google.maps.TravelMode.DRIVING }, (result, status) => {
        if (status === 'OK') {
          if (this.routeLine) this.routeLine.setMap(null);
          this.routeLine = new google.maps.Polyline({ path: result.routes[0].overview_path, strokeColor: '#ff5722', strokeWeight: 4, strokeOpacity: 0.8, map: this.map });
        }
      });
    },
    statusText(id) { return {1:'Recibida',2:'Preparando',3:'En camino',4:'En camino',5:'Entregado',6:'Cancelado',7:'Listo',8:'Pago pendiente',9:'Pago fallido',10:'Programado',11:'Confirmado'}[id] || ''; },
    statusColor(id) { return {1:'#2196f3',2:'#ff9800',3:'#ff9800',4:'#ff9800',5:'#4caf50',6:'#f44336',7:'#4caf50',8:'#9e9e9e',9:'#f44336',10:'#9c27b0',11:'#2196f3'}[id] || '#9e9e9e'; },
    async cancelOrder() { if (!confirm('Cancelar esta orden?')) return; try { await API.cancelOrder(Store.user.auth_token, Store.user.id, this.order.id); this.order.orderstatus_id = 6; } catch(e) {} },
    async loadMessages() { try { const res = await API.post('/conversation/chat', { token: Store.user.auth_token, order_id: this.order.id }); this.messages = Array.isArray(res) ? res : []; } catch(e) {} },
    async sendMessage() { if (!this.chatMsg.trim()) return; try { await API.post('/conversation/send', { token: Store.user.auth_token, order_id: this.order.id, message: this.chatMsg.trim() }); this.chatMsg = ''; await this.loadMessages(); } catch(e) {} },
    formatTime(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
  }
};

// ==================== 15. ADDRESSES ====================
const AddressesPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Mis Direcciones" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!addresses.length" class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No tienes direcciones guardadas</p></div>
        <div v-for="a in addresses" :key="a.id" class="location-item" @click="setDefault(a)">
          <i class="fas fa-map-marker-alt" :style="{color: a.id === defaultId ? 'var(--primary)' : 'var(--muted)'}"></i>
          <div style="flex:1">
            <div style="font-size:14px" :style="{fontWeight: a.id===defaultId?'600':'400'}">{{a.tag || ''}} {{a.house || ''}}</div>
            <div style="font-size:12px;color:var(--muted)">{{a.address}}</div>
          </div>
          <button v-if="a.id !== defaultId" @click.stop="deleteAddr(a.id)" style="background:none;color:#e53935;font-size:16px"><i class="fas fa-trash"></i></button>
          <i v-else class="fas fa-check-circle" style="color:var(--primary)"></i>
        </div>
        <div style="padding:16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:12px">Agregar dirección</div>
          <form @submit.prevent="saveAddr">
            <input v-model="newAddr.address" placeholder="Dirección" required style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;font-size:14px">
            <div style="display:flex;gap:8px;margin-bottom:8px">
              <input v-model="newAddr.house" placeholder="Casa/Depto" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
              <input v-model="newAddr.tag" placeholder="Etiqueta" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
            </div>
            <button type="submit" class="btn-primary" :disabled="saving">{{saving ? 'Guardando...' : 'Guardar'}}</button>
          </form>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { addresses: [], loading: false, saving: false, defaultId: null, newAddr: { address: '', house: '', tag: '' } }; },
  async mounted() {
    if (!Store.isLoggedIn) return this.$router.push('/login');
    this.loading = true;
    this.defaultId = Store.user.default_address_id || null;
    try { this.addresses = await API.getAddresses(Store.user.id, Store.user.auth_token) || []; } catch(e) {}
    this.loading = false;
  },
  methods: {
    async setDefault(a) {
      try { await API.setDefaultAddress(Store.user.id, a.id, Store.user.auth_token); this.defaultId = a.id; Store.setLocation({ lat: parseFloat(a.latitude), lng: parseFloat(a.longitude), address: a.address }); } catch(e) {}
    },
    async deleteAddr(id) {
      if (!confirm('¿Eliminar dirección?')) return;
      try { await API.deleteAddress(Store.user.id, id, Store.user.auth_token); this.addresses = this.addresses.filter(a => a.id !== id); } catch(e) {}
    },
    async saveAddr() {
      this.saving = true;
      const loc = Store.location || { lat: 0, lng: 0 };
      try {
        await API.saveAddress(Store.user.id, Store.user.auth_token, loc.lat, loc.lng, this.newAddr.address, this.newAddr.house, this.newAddr.tag);
        this.newAddr = { address: '', house: '', tag: '' };
        this.addresses = await API.getAddresses(Store.user.id, Store.user.auth_token) || [];
      } catch(e) {}
      this.saving = false;
    }
  }
};

// ==================== 16. WALLET ====================
const WalletPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Mi Billetera" :back="true"></app-header>
      <div v-if="!Store.isLoggedIn" class="empty-state"><i class="fas fa-wallet"></i><p>Inicia sesión</p></div>
      <template v-else>
        <div style="padding:20px 16px;text-align:center;background:linear-gradient(135deg,var(--primary),#ff8a65);color:#fff;margin:16px;border-radius:var(--radius)">
          <div style="font-size:13px;opacity:.8">Saldo disponible</div>
          <div style="font-size:28px;font-weight:700;margin-top:4px">{{Store.formatPrice(balance)}}</div>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div class="section-title">Transacciones</div>
          <div v-if="!transactions.length" class="empty-state" style="padding:20px"><p>Sin transacciones</p></div>
          <div v-for="t in transactions" :key="t.id" style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:13px;font-weight:500">{{t.meta ? (JSON.parse(t.meta).description || 'Transacción') : 'Transacción'}}</div>
              <div style="font-size:11px;color:var(--muted)">{{formatDate(t.created_at)}}</div>
            </div>
            <div :style="{fontWeight:600,fontSize:'14px',color:t.type==='deposit'?'#4caf50':'#f44336'}">{{t.type==='deposit'?'+':'-'}}{{Store.formatPrice(t.amount)}}</div>
          </div>
        </template>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { balance: 0, transactions: [], loading: false }; },
  async mounted() {
    if (!Store.isLoggedIn) return;
    this.loading = true;
    this.balance = Store.user.wallet_balance || 0;
    try { const res = await API.getWalletTransactions(Store.user.auth_token, Store.user.id); this.transactions = res.data || res || []; } catch(e) {}
    this.loading = false;
  },
  methods: { formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); } }
};

// ==================== 17. RATE ORDER ====================
const RateOrderPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Calificar Orden" :back="true"></app-header>
      <div style="padding:24px 16px;text-align:center">
        <div style="font-size:16px;font-weight:600;margin-bottom:20px">¿Cómo fue tu experiencia?</div>
        <div style="margin-bottom:20px">
          <div style="font-size:13px;color:var(--muted);margin-bottom:8px">Restaurante</div>
          <div style="display:flex;justify-content:center;gap:8px">
            <i v-for="s in 5" :key="'store'+s" class="fas fa-star" :style="{fontSize:'28px',cursor:'pointer',color:s<=storeRating?'#ffc107':'#ddd'}" @click="storeRating=s"></i>
          </div>
        </div>
        <div style="margin-bottom:20px">
          <div style="font-size:13px;color:var(--muted);margin-bottom:8px">Repartidor</div>
          <div style="display:flex;justify-content:center;gap:8px">
            <i v-for="s in 5" :key="'del'+s" class="fas fa-star" :style="{fontSize:'28px',cursor:'pointer',color:s<=deliveryRating?'#ffc107':'#ddd'}" @click="deliveryRating=s"></i>
          </div>
        </div>
        <textarea v-model="comment" placeholder="Comentario (opcional)" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:14px;min-height:80px;margin-bottom:16px"></textarea>
        <div v-if="success" style="background:#e8f5e9;color:#2e7d32;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">¡Gracias por tu calificación!</div>
        <button class="btn-primary" @click="submit" :disabled="submitting || success">{{submitting ? 'Enviando...' : 'Enviar Calificación'}}</button>
      </div>
    </div>`,
  components: { AppHeader },
  data() { return { storeRating: 0, deliveryRating: 0, comment: '', submitting: false, success: false }; },
  methods: {
    async submit() {
      if (!this.storeRating) return;
      this.submitting = true;
      try {
        await API.rateOrder(Store.user.auth_token, { order_id: this.$route.params.id, rating_store: this.storeRating, rating_delivery: this.deliveryRating, review_store: this.comment, review_delivery: '' });
        this.success = true;
        setTimeout(() => this.$router.push('/orders'), 2000);
      } catch(e) {}
      this.submitting = false;
    }
  }
};
