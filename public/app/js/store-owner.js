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
          <div class="location-item" @click="$router.push('/store-owner/earnings')" style="background:#fff;border-radius:8px;margin-bottom:8px;box-shadow:var(--shadow)">
            <i class="fas fa-chart-line" style="color:#4caf50"></i>
            <span class="location-item-text">Mis Ganancias</span>
            <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
          </div>
          <div class="location-item" @click="$router.push('/store-owner/menu')" style="background:#fff;border-radius:8px;margin-bottom:8px;box-shadow:var(--shadow)">
            <i class="fas fa-utensils" style="color:var(--primary)"></i>
            <span class="location-item-text">Mi Menú</span>
            <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
          </div>
          <div class="location-item" @click="$router.push('/store-owner/categories')" style="background:#fff;border-radius:8px;margin-bottom:8px;box-shadow:var(--shadow)">
            <i class="fas fa-list" style="color:var(--primary)"></i>
            <span class="location-item-text">Categorias</span>
            <i class="fas fa-chevron-right" style="color:var(--muted);font-size:12px"></i>
          </div>
          <div class="location-item" @click="$router.push('/store-owner/addons')" style="background:#fff;border-radius:8px;margin-bottom:8px;box-shadow:var(--shadow)">
            <i class="fas fa-puzzle-piece" style="color:var(--primary)"></i>
            <span class="location-item-text">Addons</span>
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
      <app-header title="Mi Menu" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:var(--muted)">{{items.length}} productos</span>
          <button style="background:var(--primary);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;border:none" @click="showForm=true;editItem=null;form={name:'',price:'',old_price:'',description:'',is_recommended:false}"><i class="fas fa-plus"></i> Agregar</button>
        </div>
        <div style="padding:0 16px">
          <div v-for="item in items" :key="item.id" class="item-card">
            <div class="item-card-info" style="flex:1">
              <div class="item-card-name">{{item.name}}</div>
              <div style="font-size:12px;color:var(--muted)">{{item.description || ''}}</div>
              <div class="item-card-price">{{Store.formatPrice(item.price)}}<span v-if="item.old_price > 0" class="item-card-old-price">{{Store.formatPrice(item.old_price)}}</span></div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
              <span :style="{fontSize:'10px',padding:'2px 6px',borderRadius:'4px',fontWeight:600,background:item.is_active?'#e8f5e9':'#ffebee',color:item.is_active?'#2e7d32':'#c62828'}">{{item.is_active ? 'Activo' : 'Inactivo'}}</span>
              <div style="display:flex;gap:4px">
                <button style="background:none;padding:4px;font-size:14px;color:var(--primary)" @click="startEdit(item)"><i class="fas fa-edit"></i></button>
                <button style="background:none;padding:4px;font-size:14px" @click="toggleItem(item)"><i :class="item.is_active?'fas fa-toggle-on':'fas fa-toggle-off'" :style="{color:item.is_active?'var(--primary)':'#ccc'}"></i></button>
                <button style="background:none;padding:4px;font-size:14px;color:#e53935" @click="deleteItem(item)"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </div>
          <div v-if="!items.length" class="empty-state"><i class="fas fa-utensils"></i><p>Sin productos. Agrega tu primer producto.</p></div>
        </div>
      </template>
      <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
        <div class="modal-content">
          <div class="modal-title">{{editItem ? 'Editar Producto' : 'Nuevo Producto'}}</div>
          <div style="margin-bottom:12px"><input v-model="form.name" placeholder="Nombre *" required style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"></div>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <input v-model="form.price" type="number" step="0.01" placeholder="Precio *" required style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
            <input v-model="form.old_price" type="number" step="0.01" placeholder="Precio anterior" style="flex:1;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
          </div>
          <div style="margin-bottom:12px"><select v-model="form.item_category_id" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"><option value="">-- Categoria --</option><option v-for="cat in categories" :key="cat.id" :value="cat.id">{{cat.name}}</option></select></div>
          <div style="margin-bottom:12px"><textarea v-model="form.description" placeholder="Descripcion" rows="2" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"></textarea></div>
          <div style="margin-bottom:12px"><label style="font-size:13px;color:var(--muted);display:block;margin-bottom:4px">Imagen del producto</label><input type="file" accept="image/*" ref="imageInput" @change="onImageChange" style="font-size:13px"></div>
          <div v-if="form.imagePreview" style="margin-bottom:12px"><img :src="form.imagePreview" style="width:80px;height:80px;object-fit:cover;border-radius:8px"></div>
          <div style="margin-bottom:12px"><label style="font-size:13px;display:flex;align-items:center;gap:8px"><input type="checkbox" v-model="form.is_recommended"> Recomendado</label></div>
          <div style="display:flex;gap:8px">
            <button class="btn-primary" style="flex:1" @click="saveItem" :disabled="saving">{{saving ? 'Guardando...' : 'Guardar'}}</button>
            <button style="flex:1;padding:12px;border-radius:8px;background:var(--bg);border:none;font-size:14px;font-weight:500" @click="showForm=false">Cancelar</button>
          </div>
          <div v-if="formError" style="color:#c62828;font-size:12px;margin-top:8px;text-align:center">{{formError}}</div>
        </div>
      </div>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { items: [], categories: [], loading: true, showForm: false, editItem: null, saving: false, formError: '', form: { name: '', price: '', old_price: '', description: '', is_recommended: false, image: null, imagePreview: '', item_category_id: '' } }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.loadMenu(); this.loadCategories(); },
  methods: {
    async loadMenu() { this.loading = true; try { const token = localStorage.getItem('storeOwnerToken'); const res = await API.post('/store-owner/get-menu', { token }); this.items = Array.isArray(res) ? res : (res.data || []); } catch(e) {} this.loading = false; },
    async loadCategories() { try { const token = localStorage.getItem('storeOwnerToken'); this.categories = await API.post('/store-owner/get-categories', { token }) || []; } catch(e) {} },
    startEdit(item) { this.editItem = item; this.form = { name: item.name, price: item.price, old_price: item.old_price || '', description: item.description || '', is_recommended: !!item.is_recommended, image: null, imagePreview: item.image || '', item_category_id: item.item_category_id || '' }; this.showForm = true; this.formError = ''; },
    onImageChange(e) { const file = e.target.files[0]; if (file) { this.form.image = file; this.form.imagePreview = URL.createObjectURL(file); } },
    async saveItem() {
      if (!this.form.name || !this.form.price) { this.formError = 'Nombre y precio son requeridos'; return; }
      this.saving = true; this.formError = '';
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const fd = new FormData();
        fd.append('token', token);
        fd.append('name', this.form.name);
        fd.append('price', this.form.price);
        fd.append('old_price', this.form.old_price || 0);
        fd.append('description', this.form.description || '');
        fd.append('is_recommended', this.form.is_recommended ? 1 : 0);
        fd.append('item_category_id', this.form.item_category_id || '');
        if (this.form.image) fd.append('image', this.form.image);
        if (this.editItem) fd.append('item_id', this.editItem.id);
        const url = this.editItem ? '/public/api/store-owner/update-item' : '/public/api/store-owner/create-item';
        await fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd });
        this.showForm = false;
        await this.loadMenu();
      } catch(e) { this.formError = 'Error al guardar'; }
      this.saving = false;
    },
    async toggleItem(item) { try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/toggle-item-status', { token, item_id: item.id }); item.is_active = !item.is_active; } catch(e) {} },
    async deleteItem(item) { if (!confirm('Eliminar ' + item.name + '?')) return; try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/delete-item', { token, item_id: item.id }); this.items = this.items.filter(i => i.id !== item.id); } catch(e) {} }
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


const StoreOwnerEarningsPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Mis Ganancias" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div style="padding:16px;text-align:center;background:linear-gradient(135deg,#4caf50,#81c784);color:#fff;margin:16px;border-radius:var(--radius)">
          <div style="font-size:13px;opacity:.8">Ganancias del periodo</div>
          <div id="totalAmount" style="font-size:28px;font-weight:700;margin-top:4px">{{Store.formatPrice(total)}}</div>
          <div style="font-size:12px;opacity:.7;margin-top:4px">{{orderCount}} pedidos completados</div>
        </div>
        <div style="padding:0 16px">
          <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
            <button v-for="f in filters" :key="f.id" :style="{padding:'6px 12px',borderRadius:'16px',fontSize:'12px',fontWeight:500,border:'none',background:activeFilter===f.id?'#4caf50':'var(--bg)',color:activeFilter===f.id?'#fff':'var(--muted)'}" @click="setFilter(f.id)">{{f.label}}</button>
          </div>
          <div v-if="activeFilter==='custom'" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
            <input type="date" v-model="dateFrom" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px">
            <span style="color:var(--muted)">a</span>
            <input type="date" v-model="dateTo" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px">
            <button style="padding:6px 12px;border-radius:6px;background:#4caf50;color:#fff;font-size:12px;font-weight:600;border:none" @click="loadData"><i class="fas fa-search"></i> Buscar</button>
          </div>
          <div style="position:relative;height:220px;margin-bottom:16px"><canvas id="earningsChart"></canvas></div>
        </div>
        <div class="section-title" style="margin-top:16px">Detalle por dia</div>
        <div style="padding:0 16px">
          <div v-for="(val, i) in chartData.values" :key="i" v-if="val > 0" style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:13px;color:var(--muted)">{{chartData.labels[i]}}</span>
            <span style="font-size:13px;font-weight:600;color:#4caf50">{{Store.formatPrice(val)}}</span>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() {
    const today = new Date().toISOString().split('T')[0];
    return { loading: true, total: 0, orderCount: 0, chartData: { labels: [], values: [] }, activeFilter: 'week', dateFrom: today, dateTo: today, chart: null, filters: [{ id: 'week', label: '7 dias' }, { id: 'month', label: '30 dias' }, { id: 'custom', label: 'Rango' }] };
  },
  async mounted() {
    if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; }
    await this.loadData();
    this.loadChart();
  },
  methods: {
    setFilter(f) { this.activeFilter = f; if (f !== 'custom') this.loadData(); },
    async loadData() {
      this.loading = true;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        let url = '/store-owner/get-earnings?filter=' + this.activeFilter;
        if (this.activeFilter === 'custom') url += '&from=' + this.dateFrom + '&to=' + this.dateTo;
        const res = await API.post(url, { token });
        this.total = res.total || 0;
        this.orderCount = res.orderCount || 0;
        this.chartData = { labels: res.labels || [], values: res.values || [] };
        this.$nextTick(() => this.loadChart());
      } catch(e) {}
      this.loading = false;
    },
    loadChart() {
      const canvas = document.getElementById('earningsChart');
      if (!canvas || !window.Chart) {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4';
        s.onload = () => this.renderChart();
        document.head.appendChild(s);
        return;
      }
      this.renderChart();
    },
    renderChart() {
      const canvas = document.getElementById('earningsChart');
      if (!canvas || !window.Chart) return;
      if (this.chart) { this.chart.destroy(); this.chart = null; }
      const ctx = canvas.getContext('2d');
      this.chart = new Chart(ctx, {
        type: 'bar',
        data: { labels: this.chartData.labels, datasets: [{ label: 'Ganancias', data: this.chartData.values, backgroundColor: 'rgba(76,175,80,.7)', borderColor: '#4caf50', borderWidth: 1, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v } }, x: { grid: { display: false } } } }
      });
    }
  }
};


const StoreOwnerCategoriesPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Categorias" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:var(--muted)">{{categories.length}} categorias</span>
          <button style="background:var(--primary);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;border:none" @click="showForm=true;editCat=null;form={name:''}"><i class="fas fa-plus"></i> Agregar</button>
        </div>
        <div style="padding:0 16px">
          <div v-for="cat in categories" :key="cat.id" style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border)">
            <div><strong style="font-size:14px">{{cat.name}}</strong></div>
            <div style="display:flex;gap:6px">
              <button style="background:none;padding:4px;font-size:14px;color:var(--primary)" @click="startEdit(cat)"><i class="fas fa-edit"></i></button>
              <button style="background:none;padding:4px;font-size:14px;color:#e53935" @click="deleteCat(cat)"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          <div v-if="!categories.length" class="empty-state"><i class="fas fa-list"></i><p>Sin categorias</p></div>
        </div>
      </template>
      <div v-if="showForm" class="modal-overlay" @click.self="showForm=false">
        <div class="modal-content">
          <div class="modal-title">{{editCat ? 'Editar Categoria' : 'Nueva Categoria'}}</div>
          <div style="margin-bottom:12px"><input v-model="form.name" placeholder="Nombre *" required style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"></div>
          <div style="display:flex;gap:8px">
            <button class="btn-primary" style="flex:1" @click="saveCat" :disabled="saving">{{saving ? 'Guardando...' : 'Guardar'}}</button>
            <button style="flex:1;padding:12px;border-radius:8px;background:var(--bg);border:none;font-size:14px" @click="showForm=false">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`,
  components: { AppHeader },
  data() { return { categories: [], loading: true, showForm: false, editCat: null, saving: false, form: { name: '' } }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.load(); },
  methods: {
    async load() { this.loading = true; try { const token = localStorage.getItem('storeOwnerToken'); this.categories = await API.post('/store-owner/get-categories', { token }) || []; } catch(e) {} this.loading = false; },
    startEdit(cat) { this.editCat = cat; this.form = { name: cat.name }; this.showForm = true; },
    async saveCat() { if (!this.form.name) return; this.saving = true; try { const token = localStorage.getItem('storeOwnerToken'); if (this.editCat) { await API.post('/store-owner/update-category', { token, category_id: this.editCat.id, name: this.form.name }); } else { await API.post('/store-owner/create-category', { token, name: this.form.name }); } this.showForm = false; await this.load(); } catch(e) {} this.saving = false; },
    async deleteCat(cat) { if (!confirm('Eliminar ' + cat.name + '?')) return; try { const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/delete-category', { token, category_id: cat.id }); this.categories = this.categories.filter(c => c.id !== cat.id); } catch(e) {} }
  }
};

const StoreOwnerAddonsPage = {
  template: `
    <div class="page" style="background:#fff;min-height:100vh">
      <app-header title="Addons" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:var(--muted)">{{addonCats.length}} categorias de addons</span>
          <button style="background:var(--primary);color:#fff;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;border:none" @click="showCatForm=true;editCat=null;catForm={name:'',type:'SINGLE'}"><i class="fas fa-plus"></i> Nueva Categoria</button>
        </div>
        <div style="padding:0 16px">
          <div v-for="cat in addonCats" :key="cat.id" style="border:1px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg)">
              <div><strong style="font-size:14px">{{cat.name}}</strong><br><small style="color:var(--muted)">{{cat.type === 'SINGLE' ? 'Single' : 'Multiple'}}</small></div>
              <div style="display:flex;gap:4px">
                <button style="background:none;padding:4px;font-size:13px;color:var(--primary)" @click="startEditCat(cat)"><i class="fas fa-edit"></i></button>
                <button style="background:none;padding:4px;font-size:13px;color:#e53935" @click="deleteCat(cat)"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <div style="padding:8px 12px">
              <div v-for="addon in cat.items" :key="addon.id" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
                <div><span style="font-size:13px">{{addon.name}}</span> <span style="font-size:12px;color:var(--muted)">{{Store.formatPrice(addon.price)}}</span></div>
                <div style="display:flex;gap:4px">
                  <button style="background:none;padding:2px;font-size:12px;color:var(--primary)" @click="startEditAddon(cat, addon)"><i class="fas fa-edit"></i></button>
                  <button style="background:none;padding:2px;font-size:12px;color:#e53935" @click="deleteAddon(cat, addon)"><i class="fas fa-trash"></i></button>
                </div>
              </div>
              <button style="background:none;color:var(--primary);font-size:12px;font-weight:600;padding:8px 0;border:none" @click="showAddonForm=true;addonCatId=cat.id;editAddon=null;addonForm={name:'',price:''}"><i class="fas fa-plus"></i> Agregar opcion</button>
            </div>
          </div>
          <div v-if="!addonCats.length" class="empty-state"><i class="fas fa-puzzle-piece"></i><p>Sin addon categories</p></div>
        </div>
      </template>
      <div v-if="showCatForm" class="modal-overlay" @click.self="showCatForm=false">
        <div class="modal-content">
          <div class="modal-title">{{editCat ? 'Editar Categoria' : 'Nueva Categoria de Addon'}}</div>
          <div style="margin-bottom:12px"><input v-model="catForm.name" placeholder="Nombre *" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"></div>
          <div style="margin-bottom:12px"><select v-model="catForm.type" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"><option value="SINGLE">Single (una opcion)</option><option value="MULTIPLE">Multiple (varias)</option></select></div>
          <div style="display:flex;gap:8px">
            <button class="btn-primary" style="flex:1" @click="saveCat">Guardar</button>
            <button style="flex:1;padding:12px;border-radius:8px;background:var(--bg);border:none" @click="showCatForm=false">Cancelar</button>
          </div>
        </div>
      </div>
      <div v-if="showAddonForm" class="modal-overlay" @click.self="showAddonForm=false">
        <div class="modal-content">
          <div class="modal-title">{{editAddon ? 'Editar Opcion' : 'Nueva Opcion'}}</div>
          <div style="margin-bottom:12px"><input v-model="addonForm.name" placeholder="Nombre *" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"></div>
          <div style="margin-bottom:12px"><input v-model="addonForm.price" type="number" step="0.01" placeholder="Precio" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px"></div>
          <div style="display:flex;gap:8px">
            <button class="btn-primary" style="flex:1" @click="saveAddon">Guardar</button>
            <button style="flex:1;padding:12px;border-radius:8px;background:var(--bg);border:none" @click="showAddonForm=false">Cancelar</button>
          </div>
        </div>
      </div>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { addonCats: [], loading: true, showCatForm: false, editCat: null, catForm: { name: '', type: 'SINGLE' }, showAddonForm: false, editAddon: null, addonCatId: null, addonForm: { name: '', price: '' } }; },
  mounted() { if (!localStorage.getItem('storeOwnerToken')) { this.$router.push('/store-owner'); return; } this.load(); },
  methods: {
    async load() {
      this.loading = true;
      try {
        const token = localStorage.getItem('storeOwnerToken');
        const cats = await API.post('/store-owner/get-addons', { token }) || [];
        for (let cat of cats) {
          const items = await API.post('/store-owner/get-addon-items', { token, addon_category_id: cat.id });
          cat.items = Array.isArray(items) ? items : [];
        }
        this.addonCats = cats;
      } catch(e) {}
      this.loading = false;
    },
    startEditCat(cat) { this.editCat = cat; this.catForm = { name: cat.name, type: cat.type || 'SINGLE' }; this.showCatForm = true; },
    async saveCat() {
      if (!this.catForm.name) return;
      const token = localStorage.getItem('storeOwnerToken');
      if (this.editCat) { await API.post('/store-owner/update-addon', { token, addon_id: this.editCat.id, name: this.catForm.name, type: this.catForm.type }); }
      else { await API.post('/store-owner/create-addon', { token, name: this.catForm.name, type: this.catForm.type }); }
      this.showCatForm = false; await this.load();
    },
    async deleteCat(cat) { if (!confirm('Eliminar ' + cat.name + ' y todas sus opciones?')) return; const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/delete-addon', { token, addon_id: cat.id }); this.addonCats = this.addonCats.filter(c => c.id !== cat.id); },
    startEditAddon(cat, addon) { this.editAddon = addon; this.addonCatId = cat.id; this.addonForm = { name: addon.name, price: addon.price }; this.showAddonForm = true; },
    async saveAddon() {
      if (!this.addonForm.name) return;
      const token = localStorage.getItem('storeOwnerToken');
      if (this.editAddon) { await API.post('/store-owner/update-addon-item', { token, addon_id: this.editAddon.id, name: this.addonForm.name, price: this.addonForm.price || 0 }); }
      else { await API.post('/store-owner/create-addon-item', { token, addon_category_id: this.addonCatId, name: this.addonForm.name, price: this.addonForm.price || 0 }); }
      this.showAddonForm = false; await this.load();
    },
    async deleteAddon(cat, addon) { if (!confirm('Eliminar ' + addon.name + '?')) return; const token = localStorage.getItem('storeOwnerToken'); await API.post('/store-owner/delete-addon-item', { token, addon_id: addon.id }); cat.items = cat.items.filter(a => a.id !== addon.id); }
  }
};
