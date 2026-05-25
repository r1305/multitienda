// ==================== STORE OWNER APP PAGES ====================

const StoreOwnerLoginPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <div style="padding:40px 16px;text-align:center">
        <i class="fas fa-store" style="font-size:50px;color:var(--primary);margin-bottom:16px"></i>
        <h2 style="font-size:20px;margin-bottom:4px">Mi Tienda</h2>
        <p style="color:var(--muted);font-size:13px;margin-bottom:30px">Panel de administración de tu tienda</p>
      </div>
      <div style="padding:0 16px">
        <div v-if="error" style="background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{error}}</div>
        <form @submit.prevent="doLogin">
          <div style="margin-bottom:14px"><input v-model="email" type="email" placeholder="Email" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="password" type="password" placeholder="Contraseña" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Cargando...' : 'Iniciar Sesión'}}</button>
        </form>
        <div style="text-align:center;margin-top:20px"><router-link to="/" style="color:var(--muted);font-size:13px"><i class="fas fa-arrow-left"></i> Volver a la app</router-link></div>
      </div>
    </div>`,
  data() { return { email: '', password: '', error: '', loading: false }; },
  mounted() { if (localStorage.getItem('storeOwnerUser')) this.$router.push('/store-owner/dashboard'); },
  methods: {
    async doLogin() {
      this.error = ''; this.loading = true;
      try {
        const res = await API.post('/store-owner/login', { email: this.email, password: this.password });
        if (res.success) {
          localStorage.setItem('storeOwnerUser', JSON.stringify(res.data));
          localStorage.setItem('storeOwnerToken', res.data.auth_token);
          if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(async function(OneSignal) {
              const permission = await OneSignal.Notifications.permission;
              if (!permission) await OneSignal.Notifications.requestPermission();
              OneSignal.User.addTags({ user_id: String(res.data.id), role: 'store_owner' });
            });
          }
          this.$router.push('/store-owner/dashboard');
        } else this.error = res.message || 'Credenciales incorrectas';
      } catch(e) { this.error = 'Error de conexión'; }
      this.loading = false;
    }
  }
};

const StoreOwnerDashboardPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard" class="active"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history"><i class="fas fa-history"></i> Historial</router-link>
        <a @click="logout" style="cursor:pointer"><i class="fas fa-sign-out-alt"></i> Salir</a>
      </nav>
      <div class="so-main">
        <div class="so-topbar">
          <span class="so-topbar-title">Dashboard</span>
          <span style="font-size:12px;color:var(--muted)">{{store.name}}</span>
        </div>
        <div class="so-bottom-nav">
          <router-link to="/store-owner/dashboard" class="active"><i class="fas fa-home"></i><span>Inicio</span></router-link>
          <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i><span>Pedidos</span></router-link>
          <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i><span>Menu</span></router-link>
          <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i><span>Ganancias</span></router-link>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div><h2 style="font-size:20px;font-weight:700;margin:0">{{store.name || 'Mi Tienda'}}</h2><p style="font-size:13px;color:var(--muted);margin:4px 0 0">{{store.address || ''}}</p></div>
            <button class="so-btn" :class="store.is_active?'so-btn-success':'so-btn-danger'" @click="toggleStatus">{{store.is_active ? 'Abierto' : 'Cerrado'}}</button>
          </div>
          <div class="so-stats">
            <div class="so-stat"><div class="so-stat-value" style="color:var(--primary)">{{stats.todayOrders}}</div><div class="so-stat-label">Pedidos hoy</div></div>
            <div class="so-stat"><div class="so-stat-value" style="color:#4caf50">{{Store.formatPrice(stats.todayEarnings)}}</div><div class="so-stat-label">Ganancias hoy</div></div>
            <div class="so-stat"><div class="so-stat-value" style="color:#ff9800">{{stats.pendingOrders}}</div><div class="so-stat-label">Pendientes</div></div>
          </div>
          <div class="so-card">
            <div class="so-card-header">Accesos rapidos</div>
            <div class="so-card-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
              <router-link to="/store-owner/orders" class="so-btn so-btn-primary" style="justify-content:center"><i class="fas fa-receipt"></i> Pedidos</router-link>
              <router-link to="/store-owner/menu" class="so-btn so-btn-outline" style="justify-content:center"><i class="fas fa-utensils"></i> Productos</router-link>
              <router-link to="/store-owner/categories" class="so-btn so-btn-outline" style="justify-content:center"><i class="fas fa-list"></i> Categorias</router-link>
              <router-link to="/store-owner/addons" class="so-btn so-btn-outline" style="justify-content:center"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
              <router-link to="/store-owner/earnings" class="so-btn so-btn-outline" style="justify-content:center"><i class="fas fa-chart-line"></i> Ganancias</router-link>
            </div>
          </div>
        </template>
      </div>
    </div>`,
  setup() { return { Store }; },
  data() { return { loading: true, store: {}, stats: { todayOrders: 0, todayEarnings: 0, pendingOrders: 0 } }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadDashboard(); },
  methods: {
    async loadDashboard() { try { const token = localStorage.getItem('storeOwnerToken'); const res = await API.post('/store-owner/dashboard', { token }); if (res.store) this.store = res.store; if (res.stats) this.stats = res.stats; } catch(e) {} this.loading = false; },
    async toggleStatus() { try { const token = localStorage.getItem('storeOwnerToken'); const res = await API.post('/store-owner/toggle-store-status', { token }); if (res.success) this.store.is_active = res.is_active; } catch(e) {} },
    logout() { localStorage.removeItem('storeOwnerUser'); localStorage.removeItem('storeOwnerToken'); this.$router.push('/store-owner'); }
  }
};

const StoreOwnerOrdersPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders" class="active"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history"><i class="fas fa-history"></i> Historial</router-link>
      </nav>
      <div class="so-main">
        <div class="so-topbar">
          <span class="so-topbar-title">Pedidos</span>
        </div>
        <div class="so-bottom-nav">
          <router-link to="/store-owner/dashboard"><i class="fas fa-home"></i><span>Inicio</span></router-link>
          <router-link to="/store-owner/orders" class="active"><i class="fas fa-receipt"></i><span>Pedidos</span></router-link>
          <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i><span>Menu</span></router-link>
          <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i><span>Ganancias</span></router-link>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <button v-for="tab in tabs" :key="tab.id" class="so-btn so-btn-sm" :class="activeTab===tab.id?'so-btn-primary':'so-btn-outline'" @click="activeTab=tab.id">{{tab.label}}</button>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div v-if="!filteredOrders.length" style="text-align:center;padding:40px;color:var(--muted)"><i class="fas fa-receipt" style="font-size:36px;margin-bottom:12px;display:block"></i><p>Sin pedidos</p></div>
          <div class="so-card" v-for="o in filteredOrders" :key="o.id" style="cursor:pointer" @click="$router.push('/store-owner/order/'+o.id)">
            <div class="so-card-body" style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong style="font-size:14px">#{{o.unique_order_id}}</strong>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">{{o.orderitems ? o.orderitems.length : 0}} items</div>
              </div>
              <div style="text-align:right">
                <span class="so-badge" :class="statusClass(o.orderstatus_id)">{{statusText(o.orderstatus_id)}}</span>
                <div style="font-size:14px;font-weight:600;margin-top:4px">{{Store.formatPrice(o.total)}}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>`,
  setup() { return { Store }; },
  data() { return { orders: [], pastOrders: [], loading: true, activeTab: 'new', tabs: [{ id: 'new', label: 'Nuevos' }, { id: 'preparing', label: 'Preparando' }, { id: 'all', label: 'Todos' }] }; },
  computed: {
    filteredOrders() {
      if (this.activeTab === 'new') return this.orders.filter(o => [1, 11].includes(o.orderstatus_id));
      if (this.activeTab === 'preparing') return this.orders.filter(o => [2, 3, 4, 7].includes(o.orderstatus_id));
      return [...this.orders, ...this.pastOrders];
    }
  },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadOrders(); this.interval = setInterval(() => this.loadOrders(), 20000); },
  beforeUnmount() { if (this.interval) clearInterval(this.interval); },
  methods: {
    async loadOrders() { try { const token = localStorage.getItem('storeOwnerToken'); const [res, past] = await Promise.all([API.post('/store-owner/get-orders', { token }), API.post('/store-owner/get-past-orders', { token })]); this.orders = Array.isArray(res) ? res : (res.data || []); this.pastOrders = Array.isArray(past) ? past : (past.data || []); } catch(e) {} this.loading = false; },
    statusText(id) { return {1:'Nuevo',2:'Preparando',3:'En delivery',4:'En camino',5:'Entregado',6:'Cancelado',7:'Listo',8:'Pago pendiente',10:'Programado',11:'Confirmado'}[id] || ''; },
    statusClass(id) { return [5].includes(id)?'so-badge-success':[6].includes(id)?'so-badge-danger':'so-badge-info'; }
  }
};

const StoreOwnerOrderDetailPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders" class="active"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history"><i class="fas fa-history"></i> Historial</router-link>
      </nav>
      <div class="so-main">
        <div class="so-topbar">
          <button style="background:none;border:none;font-size:18px" @click="$router.back()"><i class="fas fa-arrow-left"></i></button>
          <span class="so-topbar-title">Pedido #{{order ? order.unique_order_id : ''}}</span>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else-if="order">
          <div style="text-align:center;margin-bottom:16px">
            <span class="so-badge" :class="statusClass(order.orderstatus_id)" style="font-size:13px;padding:6px 14px">{{statusText(order.orderstatus_id)}}</span>
          </div>
          <div class="so-card">
            <div class="so-card-header">Items del pedido</div>
            <div class="so-card-body" style="padding:0">
              <table class="so-table">
                <thead><tr><th>Item</th><th>Cant</th><th>Precio</th></tr></thead>
                <tbody>
                  <tr v-for="item in order.orderitems" :key="item.id"><td>{{item.name}}</td><td>{{item.quantity}}</td><td>{{Store.formatPrice(item.price * item.quantity)}}</td></tr>
                </tbody>
                <tfoot><tr><td colspan="2" style="font-weight:600">Total</td><td style="font-weight:600">{{Store.formatPrice(order.total)}}</td></tr></tfoot>
              </table>
            </div>
          </div>
          <div class="so-card">
            <div class="so-card-body">
              <div class="so-form-row">
                <div><strong style="font-size:12px;color:var(--muted)">Pago</strong><p style="margin:4px 0 0;font-size:14px">{{order.payment_mode || 'COD'}}</p></div>
                <div><strong style="font-size:12px;color:var(--muted)">Direccion</strong><p style="margin:4px 0 0;font-size:14px">{{order.address || '-'}}</p></div>
              </div>
              <div v-if="order.order_comment" style="margin-top:12px;background:#fff3e0;padding:10px;border-radius:6px;font-size:13px"><i class="fas fa-comment" style="color:#ff9800;margin-right:6px"></i>{{order.order_comment}}</div>
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button v-if="order.orderstatus_id===1||order.orderstatus_id===11" class="so-btn so-btn-success" style="flex:1" @click="acceptOrder" :disabled="actionLoading"><i class="fas fa-check"></i> Aceptar</button>
            <button v-if="order.orderstatus_id===2&&order.delivery_type===2" class="so-btn so-btn-primary" style="flex:1" @click="markReady" :disabled="actionLoading"><i class="fas fa-box"></i> Listo para Recoger</button>
            <button v-if="order.orderstatus_id===1||order.orderstatus_id===11" class="so-btn so-btn-danger" style="flex:1" @click="cancelOrder" :disabled="actionLoading"><i class="fas fa-times"></i> Rechazar</button>
          </div>
          <div v-if="successMsg" style="margin-top:12px;background:#e8f5e9;color:#2e7d32;padding:10px;border-radius:8px;font-size:13px;text-align:center">{{successMsg}}</div>
        </template>
      </div>
    </div>`,
  setup() { return { Store }; },
  data() { return { order: null, loading: true, actionLoading: false, successMsg: '' }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadOrder(); },
  methods: {
    async loadOrder() { try { const token = localStorage.getItem('storeOwnerToken'); this.order = await API.post('/store-owner/get-single-order', { token, order_id: this.$route.params.id }); } catch(e) {} this.loading = false; },
    async acceptOrder() { this.actionLoading = true; try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/accept-order', { token, order_id: this.order.id }); this.order.orderstatus_id = 2; this.successMsg = 'Pedido aceptado!'; } catch(e) {} this.actionLoading = false; },
    async markReady() { this.actionLoading = true; try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/mark-selfpickup-order-ready', { token, order_id: this.order.id }); this.order.orderstatus_id = 7; this.successMsg = 'Marcado como listo!'; } catch(e) {} this.actionLoading = false; },
    async cancelOrder() { if (!confirm('Rechazar pedido?')) return; this.actionLoading = true; try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/cancel-order', { token, order_id: this.order.id }); this.order.orderstatus_id = 6; this.successMsg = 'Pedido rechazado'; } catch(e) {} this.actionLoading = false; },
    statusText(id) { return {1:'Nuevo',2:'Preparando',3:'En delivery',4:'En camino',5:'Entregado',6:'Cancelado',7:'Listo',8:'Pago pendiente',10:'Programado',11:'Confirmado'}[id] || ''; },
    statusClass(id) { return [5,7].includes(id)?'so-badge-success':[6].includes(id)?'so-badge-danger':'so-badge-info'; }
  }
};

const StoreOwnerHistoryPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history" class="active"><i class="fas fa-history"></i> Historial</router-link>
      </nav>
      <div class="so-main">
        <div class="so-topbar"><span class="so-topbar-title">Historial</span></div>
        <div class="so-bottom-nav">
          <router-link to="/store-owner/dashboard"><i class="fas fa-home"></i><span>Inicio</span></router-link>
          <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i><span>Pedidos</span></router-link>
          <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i><span>Menu</span></router-link>
          <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i><span>Ganancias</span></router-link>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div v-if="!orders.length" style="text-align:center;padding:40px;color:var(--muted)"><i class="fas fa-history" style="font-size:36px;margin-bottom:12px;display:block"></i><p>Sin pedidos completados</p></div>
          <div class="so-card" v-for="o in orders" :key="o.id" style="cursor:pointer" @click="$router.push('/store-owner/order/'+o.id)">
            <div class="so-card-body" style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong style="font-size:14px">#{{o.unique_order_id}}</strong>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">{{formatDate(o.created_at)}}</div>
              </div>
              <div style="text-align:right">
                <span class="so-badge" :class="o.orderstatus_id===5?'so-badge-success':'so-badge-danger'">{{o.orderstatus_id===5?'Entregado':'Cancelado'}}</span>
                <div style="font-size:14px;font-weight:600;margin-top:4px">{{Store.formatPrice(o.total)}}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>`,
  setup() { return { Store }; },
  data() { return { orders: [], loading: true }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.load(); },
  methods: {
    async load() { try { const token = localStorage.getItem('storeOwnerToken'); const res = await API.post('/store-owner/get-past-orders', { token }); this.orders = Array.isArray(res) ? res : (res.data || []); } catch(e) {} this.loading = false; },
    formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); }
  }
};

const StoreOwnerEarningsPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings" class="active"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history"><i class="fas fa-history"></i> Historial</router-link>
      </nav>
      <div class="so-main">
        <div class="so-topbar"><span class="so-topbar-title">Ganancias</span></div>
        <div class="so-bottom-nav">
          <router-link to="/store-owner/dashboard"><i class="fas fa-home"></i><span>Inicio</span></router-link>
          <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i><span>Pedidos</span></router-link>
          <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i><span>Menu</span></router-link>
          <router-link to="/store-owner/earnings" class="active"><i class="fas fa-chart-line"></i><span>Ganancias</span></router-link>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div class="so-stats">
            <div class="so-stat"><div class="so-stat-value" style="color:#4caf50">{{Store.formatPrice(total)}}</div><div class="so-stat-label">Total del periodo</div></div>
            <div class="so-stat"><div class="so-stat-value" style="color:var(--primary)">{{orderCount}}</div><div class="so-stat-label">Pedidos</div></div>
          </div>
          <div class="so-card">
            <div class="so-card-header">
              <span>Ganancias</span>
              <div style="display:flex;gap:6px">
                <button v-for="f in filters" :key="f.id" class="so-btn so-btn-sm" :class="activeFilter===f.id?'so-btn-primary':'so-btn-outline'" @click="setFilter(f.id)">{{f.label}}</button>
              </div>
            </div>
            <div class="so-card-body">
              <div v-if="activeFilter==='custom'" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
                <input type="date" v-model="dateFrom" class="so-btn so-btn-outline" style="padding:6px 10px">
                <span style="color:var(--muted)">a</span>
                <input type="date" v-model="dateTo" class="so-btn so-btn-outline" style="padding:6px 10px">
                <button class="so-btn so-btn-primary so-btn-sm" @click="loadData"><i class="fas fa-search"></i></button>
              </div>
              <div style="position:relative;height:220px"><canvas id="earningsChart"></canvas></div>
            </div>
          </div>
        </template>
      </div>
    </div>`,
  setup() { return { Store }; },
  data() {
    const today = new Date().toISOString().split('T')[0];
    return { loading: true, total: 0, orderCount: 0, chartData: { labels: [], values: [] }, activeFilter: 'week', dateFrom: today, dateTo: today, chart: null, filters: [{ id: 'week', label: '7d' }, { id: 'month', label: '30d' }, { id: 'custom', label: 'Rango' }] };
  },
  async mounted() {
    if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; }
    await this.loadData(); this.loadChart();
  },
  methods: {
    setFilter(f) { this.activeFilter = f; if (f !== 'custom') this.loadData(); },
    async loadData() {
      this.loading = !this.chart;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        let url = '/store-owner/get-earnings?filter=' + this.activeFilter;
        if (this.activeFilter === 'custom') url += '&from=' + this.dateFrom + '&to=' + this.dateTo;
        const res = await API.post(url, { token });
        this.total = res.total || 0; this.orderCount = res.orderCount || 0;
        this.chartData = { labels: res.labels || [], values: res.values || [] };
        this.$nextTick(() => this.loadChart());
      } catch(e) {}
      this.loading = false;
    },
    loadChart() {
      const canvas = document.getElementById('earningsChart');
      if (!canvas || !window.Chart) { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4'; s.onload = () => this.renderChart(); document.head.appendChild(s); return; }
      this.renderChart();
    },
    renderChart() {
      const canvas = document.getElementById('earningsChart');
      if (!canvas || !window.Chart) return;
      if (this.chart) { this.chart.destroy(); this.chart = null; }
      this.chart = new Chart(canvas.getContext('2d'), {
        type: 'bar', data: { labels: this.chartData.labels, datasets: [{ label: 'Ganancias', data: this.chartData.values, backgroundColor: 'rgba(76,175,80,.7)', borderColor: '#4caf50', borderWidth: 1, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => Store.currency + v } }, x: { grid: { display: false } } } }
      });
    }
  }
};

const StoreOwnerMenuPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu" class="active"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history"><i class="fas fa-history"></i> Historial</router-link>
      </nav>
      <div class="so-main">
        <div class="so-topbar">
          <span class="so-topbar-title">Productos</span>
          <button class="so-btn so-btn-primary so-btn-sm" @click="openNew"><i class="fas fa-plus"></i> Nuevo</button>
        </div>
        <div class="so-bottom-nav">
          <router-link to="/store-owner/dashboard"><i class="fas fa-home"></i><span>Inicio</span></router-link>
          <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i><span>Pedidos</span></router-link>
          <router-link to="/store-owner/menu" class="active"><i class="fas fa-utensils"></i><span>Menu</span></router-link>
          <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i><span>Ganancias</span></router-link>
        </div>
        <div style="margin-bottom:12px"><input v-model="search" placeholder="Buscar producto..." style="width:100%;padding:10px 14px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px"></div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div v-if="!filteredItems.length" style="text-align:center;padding:40px;color:var(--muted)"><i class="fas fa-utensils" style="font-size:36px;margin-bottom:12px;display:block"></i><p>Sin productos</p></div>
          <div class="so-card" v-for="item in filteredItems" :key="item.id">
            <div class="so-card-body" style="display:flex;gap:12px;align-items:center">
              <img v-if="item.image" :src="item.image" style="width:50px;height:50px;border-radius:8px;object-fit:cover">
              <div style="flex:1;min-width:0">
                <strong style="font-size:14px">{{item.name}}</strong>
                <div style="font-size:12px;color:var(--muted);margin-top:2px">{{Store.formatPrice(item.price)}} <span v-if="item.old_price>0" style="text-decoration:line-through">{{Store.formatPrice(item.old_price)}}</span></div>
              </div>
              <div style="display:flex;gap:4px;align-items:center">
                <button class="so-btn so-btn-sm" :class="item.is_active?'so-btn-success':'so-btn-outline'" @click="toggleStatus(item)" style="font-size:11px">{{item.is_active?'ON':'OFF'}}</button>
                <button class="so-btn so-btn-outline so-btn-sm" @click="startEdit(item)"><i class="fas fa-edit"></i></button>
                <button class="so-btn so-btn-sm" style="background:#ffebee;color:#c62828" @click="deleteItem(item)"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div v-if="showForm" class="so-modal" @click.self="showForm=false">
        <div class="so-modal-content" style="max-height:90vh;overflow-y:auto">
          <div class="so-modal-title">{{editItem ? 'Editar' : 'Nuevo'}} Producto</div>
          <div class="so-form-group"><label>Nombre *</label><input v-model="form.name" placeholder="Nombre del producto"></div>
          <div class="so-form-row">
            <div class="so-form-group"><label>Precio *</label><input v-model="form.price" type="number" step="0.01"></div>
            <div class="so-form-group"><label>Precio anterior</label><input v-model="form.old_price" type="number" step="0.01" placeholder="0"></div>
          </div>
          <div class="so-form-group"><label>Descripcion</label><textarea v-model="form.description" rows="2" style="width:100%;padding:8px;border:1px solid #e0e0e0;border-radius:6px;resize:vertical"></textarea></div>
          <div class="so-form-group"><label>Categoria</label><select v-model="form.item_category_id" style="width:100%;padding:8px;border:1px solid #e0e0e0;border-radius:6px"><option :value="null">-- Sin categoria --</option><option v-for="c in categories" :key="c.id" :value="c.id">{{c.name}}</option></select></div>
          <div class="so-form-group"><label>Addon Categories</label><div v-for="ac in addonCats" :key="ac.id" style="margin-bottom:4px"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" :value="ac.id" v-model="form.addon_category_ids"> {{ac.name}}</label></div></div>
          <div class="so-form-group"><label>Imagen</label><input type="file" accept="image/*" @change="onFile" style="font-size:13px"></div>
          <div class="so-form-group"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" v-model="form.is_recommended"> Recomendado</label></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="so-btn so-btn-primary" style="flex:1" @click="save" :disabled="saving">{{saving?'Guardando...':'Guardar'}}</button>
            <button class="so-btn so-btn-outline" style="flex:1" @click="showForm=false">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`,
  setup() { return { Store }; },
  data() { return { items: [], categories: [], addonCats: [], loading: true, search: '', showForm: false, editItem: null, saving: false, imageFile: null, form: { name: '', price: '', old_price: '', description: '', item_category_id: null, addon_category_ids: [], is_recommended: false } }; },
  computed: {
    filteredItems() { if (!this.search) return this.items; const q = this.search.toLowerCase(); return this.items.filter(i => i.name.toLowerCase().includes(q)); }
  },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.load(); },
  methods: {
    async load() {
      this.loading = true;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const [items, cats, addons] = await Promise.all([
          API.post('/store-owner/get-menu', { token }),
          API.post('/store-owner/get-categories', { token }),
          API.post('/store-owner/get-addons', { token })
        ]);
        this.items = Array.isArray(items) ? items : [];
        this.categories = Array.isArray(cats) ? cats : [];
        this.addonCats = Array.isArray(addons) ? addons : [];
      } catch(e) {}
      this.loading = false;
    },
    openNew() { this.editItem = null; this.imageFile = null; this.form = { name: '', price: '', old_price: '', description: '', item_category_id: null, addon_category_ids: [], is_recommended: false }; this.showForm = true; },
    startEdit(item) { this.editItem = item; this.imageFile = null; this.form = { name: item.name, price: item.price, old_price: item.old_price || '', description: item.description || '', item_category_id: item.item_category_id || null, addon_category_ids: item.addon_category_ids || [], is_recommended: !!item.is_recommended }; this.showForm = true; },
    onFile(e) { this.imageFile = e.target.files[0] || null; },
    async save() {
      if (!this.form.name || !this.form.price) return;
      this.saving = true;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const fd = new FormData();
        fd.append('token', token);
        fd.append('name', this.form.name);
        fd.append('price', this.form.price);
        fd.append('old_price', this.form.old_price || 0);
        fd.append('description', this.form.description || '');
        fd.append('item_category_id', this.form.item_category_id || '');
        fd.append('addon_category_ids', JSON.stringify(this.form.addon_category_ids));
        fd.append('is_recommended', this.form.is_recommended ? 1 : 0);
        if (this.imageFile) fd.append('image', this.imageFile);
        if (this.editItem) {
          fd.append('item_id', this.editItem.id);
          await fetch('/public/api/store-owner/update-item', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd }).then(r => r.json());
        } else {
          await fetch('/public/api/store-owner/create-item', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd }).then(r => r.json());
        }
        this.showForm = false;
        await this.load();
      } catch(e) { console.error(e); }
      this.saving = false;
    },
    async toggleStatus(item) { try { const token = localStorage.getItem('storeOwnerToken'); const res = await API.post('/store-owner/toggle-item-status', { token, item_id: item.id }); if (res.success) item.is_active = res.is_active; } catch(e) {} },
    async deleteItem(item) { if (!confirm('Eliminar ' + item.name + '?')) return; try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/delete-item', { token, item_id: item.id }); this.items = this.items.filter(i => i.id !== item.id); } catch(e) {} }
  }
};

const StoreOwnerCategoriesPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories" class="active"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history"><i class="fas fa-history"></i> Historial</router-link>
      </nav>
      <div class="so-main">
        <div class="so-topbar">
          <span class="so-topbar-title">Categorias</span>
          <button class="so-btn so-btn-primary so-btn-sm" @click="showForm=true;editCat=null;form={name:''}"><i class="fas fa-plus"></i> Nueva</button>
        </div>
        <div class="so-bottom-nav">
          <router-link to="/store-owner/dashboard"><i class="fas fa-home"></i><span>Inicio</span></router-link>
          <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i><span>Pedidos</span></router-link>
          <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i><span>Menu</span></router-link>
          <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i><span>Ganancias</span></router-link>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div v-if="!categories.length" style="text-align:center;padding:40px;color:var(--muted)"><i class="fas fa-list" style="font-size:36px;margin-bottom:12px;display:block"></i><p>Sin categorias</p></div>
          <div class="so-card">
            <div class="so-card-body" style="padding:0">
              <table class="so-table">
                <thead><tr><th>Nombre</th><th>Acciones</th></tr></thead>
                <tbody>
                  <tr v-for="cat in categories" :key="cat.id">
                    <td><strong>{{cat.name}}</strong></td>
                    <td><button class="so-btn so-btn-outline so-btn-sm" @click="startEdit(cat)"><i class="fas fa-edit"></i></button> <button class="so-btn so-btn-sm" style="background:#ffebee;color:#c62828" @click="deleteCat(cat)"><i class="fas fa-trash"></i></button></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>
      <div v-if="showForm" class="so-modal" @click.self="showForm=false">
        <div class="so-modal-content">
          <div class="so-modal-title">{{editCat ? 'Editar Categoria' : 'Nueva Categoria'}}</div>
          <div class="so-form-group"><label>Nombre *</label><input v-model="form.name" placeholder="Nombre de la categoria"></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="so-btn so-btn-primary" style="flex:1" @click="saveCat" :disabled="saving">{{saving?'Guardando...':'Guardar'}}</button>
            <button class="so-btn so-btn-outline" style="flex:1" @click="showForm=false">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`,
  data() { return { categories: [], loading: true, showForm: false, editCat: null, saving: false, form: { name: '' } }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.load(); },
  methods: {
    async load() { this.loading = true; try { const token = localStorage.getItem('storeOwnerToken'); const res = await API.post('/store-owner/get-categories', { token }); this.categories = Array.isArray(res) ? res : []; } catch(e) {} this.loading = false; },
    startEdit(cat) { this.editCat = cat; this.form = { name: cat.name }; this.showForm = true; },
    async saveCat() {
      if (!this.form.name) return;
      this.saving = true;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        let res;
        if (this.editCat) { res = await API.post('/store-owner/update-category', { token, category_id: this.editCat.id, name: this.form.name }); }
        else { res = await API.post('/store-owner/create-category', { token, name: this.form.name }); }
        if (res.success !== false) { this.showForm = false; await this.load(); }
      } catch(e) { console.error(e); }
      this.saving = false;
    },
    async deleteCat(cat) {
      if (!confirm('Eliminar ' + cat.name + '?')) return;
      try { const token = localStorage.getItem('storeOwnerToken'); const res = await API.post('/store-owner/delete-category', { token, category_id: cat.id }); if (res.success !== false) this.categories = this.categories.filter(c => c.id !== cat.id); } catch(e) { console.error(e); }
    }
  }
};

const StoreOwnerAddonsPage = {
  template: `
    <div class="so-layout">
      <nav class="so-sidebar">
        <div class="so-sidebar-brand"><i class="fas fa-store"></i> Mi Tienda</div>
        <router-link to="/store-owner/dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</router-link>
        <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i> Pedidos</router-link>
        <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i> Productos</router-link>
        <router-link to="/store-owner/categories"><i class="fas fa-list"></i> Categorias</router-link>
        <router-link to="/store-owner/addons" class="active"><i class="fas fa-puzzle-piece"></i> Addons</router-link>
        <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i> Ganancias</router-link>
        <router-link to="/store-owner/history"><i class="fas fa-history"></i> Historial</router-link>
      </nav>
      <div class="so-main">
        <div class="so-topbar">
          <span class="so-topbar-title">Addons</span>
          <button class="so-btn so-btn-primary so-btn-sm" @click="showCatForm=true;editCat=null;catForm={name:'',type:'SINGLE'}"><i class="fas fa-plus"></i> Nueva</button>
        </div>
        <div class="so-bottom-nav">
          <router-link to="/store-owner/dashboard"><i class="fas fa-home"></i><span>Inicio</span></router-link>
          <router-link to="/store-owner/orders"><i class="fas fa-receipt"></i><span>Pedidos</span></router-link>
          <router-link to="/store-owner/menu"><i class="fas fa-utensils"></i><span>Menu</span></router-link>
          <router-link to="/store-owner/earnings"><i class="fas fa-chart-line"></i><span>Ganancias</span></router-link>
        </div>
        <div v-if="loading" class="loading"><div class="spinner"></div></div>
        <template v-else>
          <div v-if="!addonCats.length" style="text-align:center;padding:40px;color:var(--muted)"><i class="fas fa-puzzle-piece" style="font-size:36px;margin-bottom:12px;display:block"></i><p>Sin addon categories</p></div>
          <div class="so-card" v-for="cat in addonCats" :key="cat.id">
            <div class="so-card-header">
              <div><strong>{{cat.name}}</strong> <span class="so-badge so-badge-info">{{cat.type==='SINGLE'?'Single':'Multiple'}}</span></div>
              <div style="display:flex;gap:4px">
                <button class="so-btn so-btn-outline so-btn-sm" @click="startEditCat(cat)"><i class="fas fa-edit"></i></button>
                <button class="so-btn so-btn-sm" style="background:#ffebee;color:#c62828" @click="deleteCat(cat)"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <div class="so-card-body" style="padding:0">
              <table class="so-table">
                <tbody>
                  <tr v-for="addon in cat.items" :key="addon.id">
                    <td>{{addon.name}}</td>
                    <td style="font-weight:600">{{Store.formatPrice(addon.price)}}</td>
                    <td style="width:80px"><button class="so-btn so-btn-outline so-btn-sm" @click="startEditAddon(cat,addon)"><i class="fas fa-edit"></i></button> <button class="so-btn so-btn-sm" style="background:#ffebee;color:#c62828" @click="deleteAddon(cat,addon)"><i class="fas fa-trash"></i></button></td>
                  </tr>
                  <tr v-if="!cat.items||!cat.items.length"><td colspan="3" style="color:var(--muted);font-size:12px">Sin opciones</td></tr>
                </tbody>
              </table>
              <div style="padding:8px 12px"><button class="so-btn so-btn-outline so-btn-sm" @click="showAddonForm=true;addonCatId=cat.id;editAddon=null;addonForm={name:'',price:''}"><i class="fas fa-plus"></i> Agregar opcion</button></div>
            </div>
          </div>
        </template>
      </div>
      <div v-if="showCatForm" class="so-modal" @click.self="showCatForm=false">
        <div class="so-modal-content">
          <div class="so-modal-title">{{editCat?'Editar':'Nueva'}} Categoria de Addon</div>
          <div class="so-form-group"><label>Nombre *</label><input v-model="catForm.name" placeholder="Ej: Tamano, Toppings"></div>
          <div class="so-form-group"><label>Tipo</label><select v-model="catForm.type"><option value="SINGLE">Single (elige 1)</option><option value="MULTIPLE">Multiple (varias)</option></select></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="so-btn so-btn-primary" style="flex:1" @click="saveCat">Guardar</button>
            <button class="so-btn so-btn-outline" style="flex:1" @click="showCatForm=false">Cancelar</button>
          </div>
        </div>
      </div>
      <div v-if="showAddonForm" class="so-modal" @click.self="showAddonForm=false">
        <div class="so-modal-content">
          <div class="so-modal-title">{{editAddon?'Editar':'Nueva'}} Opcion</div>
          <div class="so-form-group"><label>Nombre *</label><input v-model="addonForm.name" placeholder="Ej: Grande, Queso extra"></div>
          <div class="so-form-group"><label>Precio</label><input v-model="addonForm.price" type="number" step="0.01" placeholder="0.00"></div>
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="so-btn so-btn-primary" style="flex:1" @click="saveAddon">Guardar</button>
            <button class="so-btn so-btn-outline" style="flex:1" @click="showAddonForm=false">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`,
  setup() { return { Store }; },
  data() { return { addonCats: [], loading: true, showCatForm: false, editCat: null, catForm: { name: '', type: 'SINGLE' }, showAddonForm: false, editAddon: null, addonCatId: null, addonForm: { name: '', price: '' } }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.load(); },
  methods: {
    async load() {
      this.loading = true;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const cats = await API.post('/store-owner/get-addons', { token });
        const list = Array.isArray(cats) ? cats : [];
        for (let cat of list) { const items = await API.post('/store-owner/get-addon-items', { token, addon_category_id: cat.id }); cat.items = Array.isArray(items) ? items : []; }
        this.addonCats = list;
      } catch(e) { console.error(e); }
      this.loading = false;
    },
    startEditCat(cat) { this.editCat = cat; this.catForm = { name: cat.name, type: cat.type || 'SINGLE' }; this.showCatForm = true; },
    async saveCat() {
      if (!this.catForm.name) return;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        if (this.editCat) { await API.post('/store-owner/update-addon', { token, addon_id: this.editCat.id, name: this.catForm.name, type: this.catForm.type }); }
        else { await API.post('/store-owner/create-addon', { token, name: this.catForm.name, type: this.catForm.type }); }
        this.showCatForm = false; await this.load();
      } catch(e) { console.error(e); }
    },
    async deleteCat(cat) {
      if (!confirm('Eliminar ' + cat.name + '?')) return;
      try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/delete-addon', { token, addon_id: cat.id }); this.addonCats = this.addonCats.filter(c => c.id !== cat.id); } catch(e) { console.error(e); }
    },
    startEditAddon(cat, addon) { this.editAddon = addon; this.addonCatId = cat.id; this.addonForm = { name: addon.name, price: addon.price }; this.showAddonForm = true; },
    async saveAddon() {
      if (!this.addonForm.name) return;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        if (this.editAddon) { await API.post('/store-owner/update-addon-item', { token, addon_id: this.editAddon.id, name: this.addonForm.name, price: this.addonForm.price || 0 }); }
        else { await API.post('/store-owner/create-addon-item', { token, addon_category_id: this.addonCatId, name: this.addonForm.name, price: this.addonForm.price || 0 }); }
        this.showAddonForm = false; await this.load();
      } catch(e) { console.error(e); }
    },
    async deleteAddon(cat, addon) {
      if (!confirm('Eliminar ' + addon.name + '?')) return;
      try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/delete-addon-item', { token, addon_id: addon.id }); cat.items = cat.items.filter(a => a.id !== addon.id); } catch(e) { console.error(e); }
    }
  }
};
