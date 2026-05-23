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
    <div class="page" style="background:var(--bg);min-height:100vh">
      <div class="header">
        <span class="header-title">Mi Tienda</span>
        <button style="background:none;font-size:14px;color:#e53935" @click="logout"><i class="fas fa-sign-out-alt"></i></button>
      </div>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div style="padding:16px;background:#fff;border-bottom:1px solid var(--border)">
          <div style="font-size:18px;font-weight:700">{{store.name || 'Mi Tienda'}}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">{{store.address || ''}}</div>
          <div style="margin-top:10px;display:flex;gap:8px">
            <span :style="{padding:'4px 10px',borderRadius:'12px',fontSize:'11px',fontWeight:600,background:store.is_active?'#e8f5e9':'#ffebee',color:store.is_active?'#2e7d32':'#c62828'}">{{store.is_active ? 'Abierto' : 'Cerrado'}}</span>
            <button style="padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;background:var(--border);color:var(--text)" @click="toggleStatus">{{store.is_active ? 'Cerrar tienda' : 'Abrir tienda'}}</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px">
          <div style="background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:var(--shadow)">
            <div style="font-size:24px;font-weight:700;color:var(--primary)">{{stats.todayOrders}}</div>
            <div style="font-size:11px;color:var(--muted)">Pedidos hoy</div>
          </div>
          <div style="background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:var(--shadow)">
            <div style="font-size:24px;font-weight:700;color:#4caf50">{{Store.formatPrice(stats.todayEarnings)}}</div>
            <div style="font-size:11px;color:var(--muted)">Ganancias hoy</div>
          </div>
        </div>
        <div style="padding:0 16px">
          <div class="location-item" @click="$router.push('/store-owner/orders')" style="background:#fff;border-radius:8px;margin-bottom:8px;box-shadow:var(--shadow)">
            <i class="fas fa-receipt" style="color:var(--primary)"></i>
            <span class="location-item-text" style="flex:1">Pedidos Nuevos</span>
            <span v-if="stats.pendingOrders" style="background:var(--primary);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">{{stats.pendingOrders}}</span>
            <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
          </div>
          <div class="location-item" @click="$router.push('/store-owner/menu')" style="background:#fff;border-radius:8px;margin-bottom:8px;box-shadow:var(--shadow)">
            <i class="fas fa-utensils" style="color:var(--primary)"></i>
            <span class="location-item-text">Mi Menú</span>
            <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
          </div>
          <div class="location-item" @click="$router.push('/store-owner/history')" style="background:#fff;border-radius:8px;margin-bottom:8px;box-shadow:var(--shadow)">
            <i class="fas fa-history" style="color:var(--primary)"></i>
            <span class="location-item-text">Historial</span>
            <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
          </div>
        </div>
      </template>
    </div>`,
  setup() { return { Store }; },
  data() { return { loading: true, store: {}, stats: { todayOrders: 0, todayEarnings: 0, pendingOrders: 0 } }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadDashboard(); },
  methods: {
    async loadDashboard() {
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const res = await API.post('/store-owner/dashboard', { token });
        if (res.store) this.store = res.store;
        if (res.stats) this.stats = res.stats;
      } catch(e) {}
      this.loading = false;
    },
    async toggleStatus() {
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const res = await API.post('/store-owner/toggle-store-status', { token });
        if (res.success) this.store.is_active = res.is_active;
      } catch(e) {}
    },
    logout() { localStorage.removeItem('storeOwnerUser'); localStorage.removeItem('storeOwnerToken'); this.$router.push('/store-owner'); }
  }
};

const StoreOwnerOrdersPage = {
  template: `
    <div class="page" style="background:var(--bg);min-height:100vh">
      <app-header title="Pedidos" :back="true"></app-header>
      <div style="padding:8px 16px;display:flex;gap:8px;background:#fff;border-bottom:1px solid var(--border)">
        <button v-for="tab in tabs" :key="tab.id" :style="{padding:'6px 12px',borderRadius:'16px',fontSize:'12px',fontWeight:500,border:'none',background:activeTab===tab.id?'var(--primary)':'var(--bg)',color:activeTab===tab.id?'#fff':'var(--muted)'}" @click="activeTab=tab.id">{{tab.label}}</button>
      </div>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!filteredOrders.length" class="empty-state"><i class="fas fa-receipt"></i><p>Sin pedidos</p></div>
        <div style="padding:0 16px;margin-top:12px">
          <div v-for="o in filteredOrders" :key="o.id" class="card" @click="$router.push('/store-owner/order/'+o.id)">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span style="font-weight:600;font-size:14px">#{{o.unique_order_id}}</span>
                <span :style="{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,background:statusColor(o.orderstatus_id),color:'#fff'}">{{statusText(o.orderstatus_id)}}</span>
              </div>
              <div style="font-size:13px;color:var(--muted)">{{o.orderitems ? o.orderitems.length : 0}} items</div>
              <div style="display:flex;justify-content:space-between;margin-top:6px">
                <span style="font-size:12px;color:var(--muted)">{{formatDate(o.created_at)}}</span>
                <span style="font-weight:600">{{Store.formatPrice(o.total)}}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { orders: [], loading: true, activeTab: 'new', tabs: [{ id: 'new', label: 'Nuevos' }, { id: 'preparing', label: 'Preparando' }, { id: 'all', label: 'Todos' }] }; },
  computed: {
    filteredOrders() {
      if (this.activeTab === 'new') return this.orders.filter(o => [1, 11].includes(o.orderstatus_id));
      if (this.activeTab === 'preparing') return this.orders.filter(o => [2, 3, 4, 7].includes(o.orderstatus_id));
      return this.orders;
    }
  },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadOrders(); this.interval = setInterval(() => this.loadOrders(), 20000); },
  beforeUnmount() { if (this.interval) clearInterval(this.interval); },
  methods: {
    async loadOrders() {
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const res = await API.post('/store-owner/get-orders', { token });
        this.orders = Array.isArray(res) ? res : (res.data || []);
      } catch(e) {}
      this.loading = false;
    },
    statusText(id) { return {1:'Nuevo',2:'Preparando',3:'En delivery',4:'En camino',5:'Entregado',6:'Cancelado',7:'Listo',8:'Pago pendiente',10:'Programado',11:'Confirmado'}[id] || ''; },
    statusColor(id) { return {1:'#2196f3',2:'#ff9800',3:'#ff9800',4:'#ff9800',5:'#4caf50',6:'#f44336',7:'#4caf50',8:'#9e9e9e',10:'#9c27b0',11:'#2196f3'}[id] || '#9e9e9e'; },
    formatDate(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
  }
};

const StoreOwnerOrderDetailPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header :title="'Pedido #'+(order?order.unique_order_id:'')" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else-if="order">
        <div style="padding:16px;text-align:center">
          <div :style="{display:'inline-block',padding:'6px 16px',borderRadius:'20px',fontSize:'13px',fontWeight:600,color:'#fff',background:statusColor(order.orderstatus_id)}">{{statusText(order.orderstatus_id)}}</div>
        </div>
        <div class="bill">
          <div v-for="item in order.orderitems" :key="item.id" class="bill-row"><span>{{item.quantity}}x {{item.name}}</span><span>{{Store.formatPrice(item.price * item.quantity)}}</span></div>
          <div class="bill-row total"><span>Total</span><span>{{Store.formatPrice(order.total)}}</span></div>
        </div>
        <div style="padding:0 16px">
          <div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px">
            <div style="font-size:12px;color:var(--muted)">Cliente</div>
            <div style="font-size:14px;font-weight:500">{{order.address || 'Sin dirección'}}</div>
          </div>
          <div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px">
            <div style="font-size:12px;color:var(--muted)">Pago</div>
            <div style="font-size:14px">{{order.payment_mode || 'COD'}}</div>
          </div>
          <div v-if="order.order_comment" style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:12px">
            <div style="font-size:12px;color:var(--muted)">Comentario</div>
            <div style="font-size:14px">{{order.order_comment}}</div>
          </div>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
          <button v-if="order.orderstatus_id === 1 || order.orderstatus_id === 11" class="btn-primary" @click="acceptOrder" :disabled="actionLoading"><i class="fas fa-check"></i> Aceptar Pedido</button>
          <button v-if="order.orderstatus_id === 2 && order.delivery_type === 2" style="width:100%;padding:12px;border-radius:8px;background:#4caf50;color:#fff;font-weight:600;font-size:14px" @click="markReady" :disabled="actionLoading"><i class="fas fa-box"></i> Listo para Recoger</button>
          <button v-if="order.orderstatus_id === 1 || order.orderstatus_id === 11" style="width:100%;padding:12px;border-radius:8px;background:#ffebee;color:#c62828;font-weight:600;font-size:14px" @click="cancelOrder" :disabled="actionLoading">Rechazar Pedido</button>
        </div>
        <div v-if="successMsg" style="padding:0 16px"><div style="background:#e8f5e9;color:#2e7d32;padding:10px;border-radius:8px;font-size:13px;text-align:center">{{successMsg}}</div></div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { order: null, loading: true, actionLoading: false, successMsg: '' }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadOrder(); },
  methods: {
    async loadOrder() {
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const res = await API.post('/store-owner/get-single-order', { token, order_id: this.$route.params.id });
        this.order = res;
      } catch(e) {}
      this.loading = false;
    },
    async acceptOrder() {
      this.actionLoading = true;
      try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/accept-order', { token, order_id: this.order.id }); this.order.orderstatus_id = 2; this.successMsg = 'Pedido aceptado!'; } catch(e) {}
      this.actionLoading = false;
    },
    async markReady() {
      this.actionLoading = true;
      try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/mark-selfpickup-order-ready', { token, order_id: this.order.id }); this.order.orderstatus_id = 7; this.successMsg = 'Marcado como listo!'; } catch(e) {}
      this.actionLoading = false;
    },
    async cancelOrder() {
      if (!confirm('¿Rechazar este pedido?')) return;
      this.actionLoading = true;
      try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/cancel-order', { token, order_id: this.order.id }); this.order.orderstatus_id = 6; this.successMsg = 'Pedido rechazado'; } catch(e) {}
      this.actionLoading = false;
    },
    statusText(id) { return {1:'Nuevo',2:'Preparando',3:'En delivery',4:'En camino',5:'Entregado',6:'Cancelado',7:'Listo',8:'Pago pendiente',10:'Programado',11:'Confirmado'}[id] || ''; },
    statusColor(id) { return {1:'#2196f3',2:'#ff9800',3:'#ff9800',4:'#ff9800',5:'#4caf50',6:'#f44336',7:'#4caf50',8:'#9e9e9e',10:'#9c27b0',11:'#2196f3'}[id] || '#9e9e9e'; }
  }
};

const StoreOwnerMenuPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Mi Menú" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!items.length" class="empty-state"><i class="fas fa-utensils"></i><p>Sin items en el menú</p></div>
        <div style="padding:0 16px">
          <div v-for="item in items" :key="item.id" class="item-card">
            <div class="item-card-info" style="flex:1">
              <div class="item-card-name">{{item.name}}</div>
              <div class="item-card-price">{{Store.formatPrice(item.price)}}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span :style="{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,background:item.is_active?'#e8f5e9':'#ffebee',color:item.is_active?'#2e7d32':'#c62828'}">{{item.is_active ? 'Activo' : 'Inactivo'}}</span>
              <button style="background:none;padding:6px" @click="toggleItem(item)">
                <i :class="item.is_active ? 'fas fa-toggle-on' : 'fas fa-toggle-off'" :style="{fontSize:'22px',color:item.is_active?'var(--primary)':'#ccc'}"></i>
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { items: [], loading: true }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadMenu(); },
  methods: {
    async loadMenu() {
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const res = await API.post('/store-owner/get-menu', { token });
        this.items = Array.isArray(res) ? res : (res.data || []);
      } catch(e) {}
      this.loading = false;
    },
    async toggleItem(item) {
      try {
        const token = localStorage.getItem('storeOwnerToken');
        await API.post('/store-owner/toggle-item-status', { token, item_id: item.id });
        item.is_active = !item.is_active;
      } catch(e) {}
    }
  }
};

const StoreOwnerHistoryPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Historial" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!orders.length" class="empty-state"><i class="fas fa-history"></i><p>Sin pedidos completados</p></div>
        <div style="padding:0 16px">
          <div v-for="o in orders" :key="o.id" class="card">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;font-size:14px">#{{o.unique_order_id}}</span>
                <span :style="{fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600,background:o.orderstatus_id===5?'#4caf50':'#f44336',color:'#fff'}">{{o.orderstatus_id === 5 ? 'Entregado' : 'Cancelado'}}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:6px">
                <span style="font-size:12px;color:var(--muted)">{{formatDate(o.created_at)}}</span>
                <span style="font-weight:600">{{Store.formatPrice(o.total)}}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { orders: [], loading: true }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadHistory(); },
  methods: {
    async loadHistory() {
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const res = await API.post('/store-owner/get-past-orders', { token });
        this.orders = Array.isArray(res) ? res : (res.data || []);
      } catch(e) {}
      this.loading = false;
    },
    formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  }
};
