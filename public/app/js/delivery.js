// ==================== DELIVERY APP PAGES ====================

const DeliveryLoginPage = {
  template: `
    <div class="page" style="background:var(--white);min-height:100vh">
      <div style="padding:40px 16px;text-align:center">
        <i class="fas fa-motorcycle" style="font-size:50px;color:var(--primary);margin-bottom:16px"></i>
        <h2 style="font-size:20px;margin-bottom:4px">Delivery</h2>
        <p style="color:var(--muted);font-size:13px;margin-bottom:30px">Inicia sesión como repartidor</p>
      </div>
      <div style="padding:0 16px">
        <div v-if="error" style="background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{error}}</div>
        <div v-if="success" style="background:#e8f5e9;color:#2e7d32;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px">{{success}}</div>
        <form v-if="!showRegister" @submit.prevent="doLogin">
          <div style="margin-bottom:14px"><input v-model="phone" type="tel" placeholder="Teléfono" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="password" type="password" placeholder="Contraseña" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Cargando...' : 'Iniciar Sesión'}}</button>
        </form>
        <form v-else @submit.prevent="doRegister">
          <div style="margin-bottom:14px"><input v-model="regName" type="text" placeholder="Nombre completo" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="regEmail" type="email" placeholder="Email" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="regPhone" type="tel" placeholder="Teléfono" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="regPassword" type="password" placeholder="Contraseña" required style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <div style="margin-bottom:14px"><input v-model="regVehicle" type="text" placeholder="Número de vehículo (moto/bici)" style="width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-size:15px"></div>
          <button type="submit" class="btn-primary" :disabled="loading">{{loading ? 'Enviando...' : 'Solicitar Registro'}}</button>
        </form>
        <div style="text-align:center;margin-top:20px;font-size:13px">
          <button v-if="!showRegister" style="background:none;color:var(--primary);font-weight:600" @click="showRegister=true;error='';success=''">¿Quieres ser repartidor? Regístrate</button>
          <button v-else style="background:none;color:var(--primary);font-weight:600" @click="showRegister=false;error='';success=''">Ya tengo cuenta, iniciar sesión</button>
        </div>
        <div style="text-align:center;margin-top:20px"><router-link to="/" style="color:var(--muted);font-size:13px"><i class="fas fa-arrow-left"></i> Volver a la app</router-link></div>
      </div>
    </div>`,
  data() { return { phone: '', password: '', error: '', success: '', loading: false, showRegister: false, regName: '', regEmail: '', regPhone: '', regPassword: '', regVehicle: '' }; },
  mounted() { if (this.deliveryUser) this.$router.push('/delivery/orders'); },
  computed: { deliveryUser() { return JSON.parse(localStorage.getItem('deliveryUser') || 'null'); } },
  methods: {
    async doLogin() {
      this.error = ''; this.loading = true;
      try {
        const res = await API.post('/delivery/login', { phone: this.phone, password: this.password });
        if (res.success) {
          localStorage.setItem('deliveryUser', JSON.stringify(res.data));
          localStorage.setItem('deliveryToken', res.data.auth_token);
          // Set OneSignal tags for delivery and request permission
          if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(async function(OneSignal) {
              const permission = await OneSignal.Notifications.permission;
              if (!permission) await OneSignal.Notifications.requestPermission();
              OneSignal.User.addTags({ user_id: String(res.data.id), role: 'delivery' });
            });
          }
          this.$router.push('/delivery/orders');
        } else this.error = res.data === 'DONOTMATCH' ? 'Credenciales incorrectas' : (res.message || 'Error al iniciar sesión');
      } catch(e) { this.error = 'Error de conexión'; }
      this.loading = false;
    },
    async doRegister() {
      this.error = ''; this.success = ''; this.loading = true;
      try {
        const res = await API.post('/delivery/register', { name: this.regName, email: this.regEmail, phone: this.regPhone, password: this.regPassword, vehicle_number: this.regVehicle });
        if (res.success) { this.success = 'Solicitud enviada. El administrador revisará tu registro y te notificará cuando seas aprobado.'; this.showRegister = false; }
        else this.error = res.message || 'Error al registrar';
      } catch(e) { this.error = 'Error de conexión'; }
      this.loading = false;
    }
  }
};

const DeliveryOrdersPage = {
  template: `
    <div class="page" style="background:var(--bg);min-height:100vh">
      <div class="header">
        <span class="header-title">Mis Pedidos</span>
        <button style="background:none;font-size:16px;color:var(--text);padding:8px" @click="Store.toggleTheme()"><i :class="Store.theme==='dark'?'fas fa-sun':'fas fa-moon'"></i></button>
        <button style="background:none;font-size:14px;color:var(--primary);font-weight:600" @click="refresh"><i class="fas fa-sync-alt"></i></button>
      </div>
      <div style="padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:var(--white);border-bottom:1px solid var(--border)">
        <div><span style="font-size:13px;color:var(--muted)">Hola, </span><strong style="font-size:14px">{{user.name}}</strong></div>
        <div style="display:flex;gap:12px">
          <router-link to="/delivery/earnings" style="font-size:12px;color:var(--primary)"><i class="fas fa-chart-line"></i> Ganancias</router-link>
          <button style="background:none;font-size:12px;color:#e53935" @click="logout"><i class="fas fa-sign-out-alt"></i> Salir</button>
        </div>
      </div>
      <div style="padding:8px 16px;display:flex;gap:8px;background:var(--white);border-bottom:1px solid var(--border)">
        <button v-for="tab in tabs" :key="tab.id" :style="{padding:'6px 12px',borderRadius:'16px',fontSize:'12px',fontWeight:500,border:'none',background:activeTab===tab.id?'var(--primary)':'var(--bg)',color:activeTab===tab.id?'#fff':'var(--muted)'}" @click="activeTab=tab.id">{{tab.label}} <span v-if="tabCount(tab.id)" style="margin-left:4px">({{tabCount(tab.id)}})</span></button>
      </div>
      <div v-if="!gpsReady" style="padding:16px;text-align:center;background:#fff3e0;margin:12px 16px;border-radius:8px">
        <i class="fas fa-location-crosshairs" style="font-size:24px;color:#ff9800;margin-bottom:8px"></i>
        <p style="font-size:13px;color:#e65100;margin-bottom:8px">Necesitamos tu ubicacion para mostrarte pedidos cercanos</p>
        <button style="background:var(--primary);color:#fff;padding:8px 20px;border-radius:8px;font-size:13px" @click="getLocation">Activar GPS</button>
      </div>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else-if="gpsReady">
        <div v-if="!filteredOrders.length" class="empty-state"><i class="fas fa-box-open"></i><p>{{emptyMsg}}</p><button v-if="activeTab==='available'" style="margin-top:12px;background:var(--primary);color:#fff;padding:8px 20px;border-radius:8px;font-size:13px" @click="refresh">Actualizar</button></div>
        <div style="padding:0 16px;margin-top:12px">
          <div v-for="o in filteredOrders" :key="o.id" class="card" style="position:relative">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-weight:600;font-size:14px">#{{o.unique_order_id}}</span>
                <span :style="{background:statusBg(o.orderstatus_id),color:'#fff',fontSize:'11px',padding:'3px 8px',borderRadius:'4px',fontWeight:600}">{{statusLabel(o.orderstatus_id)}}</span>
              </div>
              <div style="font-size:13px;margin-bottom:4px"><i class="fas fa-store" style="color:var(--primary);width:18px"></i> {{o.restaurant ? o.restaurant.name : 'Restaurante'}}</div>
              <div style="font-size:12px;color:var(--muted);margin-bottom:4px"><i class="fas fa-map-marker-alt" style="width:18px"></i> {{o.address || 'Sin direccion'}}</div>
              <div style="font-size:12px;color:var(--muted);margin-bottom:10px"><i class="fas fa-money-bill" style="width:18px"></i> {{Store.formatPrice(o.total)}}</div>
              <div style="display:flex;gap:8px">
                <button style="flex:1;padding:10px;border-radius:8px;background:var(--primary);color:#fff;font-weight:600;font-size:13px" @click="$router.push('/delivery/order/'+o.id)"><i class="fas fa-eye"></i> Ver Detalle</button>
                <button v-if="activeTab==='available'" style="padding:10px 14px;border-radius:8px;background:#ffebee;color:#c62828;font-size:13px" @click="ignoreOrder(o.id)"><i class="fas fa-times"></i></button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>`,
  setup() { return { Store }; },
  data() { return { allOrders: [], myOrders: [], loading: false, gpsReady: false, lat: null, lng: null, activeTab: 'available', tabs: [{ id: 'available', label: 'Disponibles' }, { id: 'active', label: 'Activos' }, { id: 'completed', label: 'Completados' }] }; },
  computed: {
    user() { return JSON.parse(localStorage.getItem('deliveryUser') || '{}'); },
    filteredOrders() {
      if (this.activeTab === 'available') return this.allOrders;
      if (this.activeTab === 'active') return this.myOrders.filter(o => [3, 4].includes(o.orderstatus_id));
      return this.myOrders.filter(o => [5, 6].includes(o.orderstatus_id));
    },
    emptyMsg() { return { available: 'No hay pedidos disponibles en tu zona', active: 'No tienes pedidos activos', completed: 'Sin entregas completadas' }[this.activeTab]; }
  },
  mounted() { if (!localStorage.getItem('deliveryToken')) { this.$router.push('/delivery'); return; } this.getLocation(); this.interval = setInterval(() => { if (this.gpsReady) this.refresh(); }, 30000); },
  beforeUnmount() { if (this.interval) clearInterval(this.interval); },
  methods: {
    getLocation() { if (!navigator.geolocation) { this.gpsReady = true; this.refresh(); return; } navigator.geolocation.getCurrentPosition((pos) => { this.lat = pos.coords.latitude; this.lng = pos.coords.longitude; this.gpsReady = true; this.refresh(); }, () => { this.gpsReady = true; this.refresh(); }, { timeout: 10000 }); },
    async refresh() {
      this.loading = !this.allOrders.length && !this.myOrders.length;
      try {
        const token = localStorage.getItem('deliveryToken');
        const res = await API.post('/delivery/get-delivery-orders', { token, latitude: this.lat, longitude: this.lng });
        this.allOrders = Array.isArray(res) ? res : [];
        const res2 = await API.post('/delivery/get-completed-orders', { token });
        const activeRes = await API.post('/delivery/get-active-orders', { token });
        this.myOrders = [...(Array.isArray(activeRes) ? activeRes : []), ...(Array.isArray(res2) ? res2 : [])];
      } catch(e) {}
      this.loading = false;
    },
    async ignoreOrder(orderId) { try { const token = localStorage.getItem('deliveryToken'); await API.post('/delivery/ignore-order', { token, order_id: orderId }); this.allOrders = this.allOrders.filter(o => o.id !== orderId); } catch(e) {} },
    tabCount(tab) { if (tab === 'available') return this.allOrders.length; if (tab === 'active') return this.myOrders.filter(o => [3,4].includes(o.orderstatus_id)).length; return this.myOrders.filter(o => [5,6].includes(o.orderstatus_id)).length; },
    statusLabel(id) { return {2:'Disponible',3:'Aceptado',4:'En camino',5:'Entregado',6:'Cancelado'}[id] || ''; },
    statusBg(id) { return {2:'#ff9800',3:'#2196f3',4:'#ff9800',5:'#4caf50',6:'#f44336'}[id] || '#9e9e9e'; },
    logout() { localStorage.removeItem('deliveryUser'); localStorage.removeItem('deliveryToken'); this.$router.push('/delivery'); }
  }
};

const DeliveryOrderDetailPage = {
  template: `
    <div class="page" style="background:var(--white);min-height:100vh">
      <app-header :title="'Pedido #'+(order ? order.unique_order_id : '')" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else-if="order">
        <div style="padding:16px;text-align:center">
          <div :style="{display:'inline-block',padding:'6px 16px',borderRadius:'20px',fontSize:'13px',fontWeight:600,color:'#fff',background:statusColor}">{{statusText}}</div>
        </div>
        <div style="padding:0 16px">
          <div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:10px">
            <div style="font-size:12px;color:var(--muted)">Restaurante</div>
            <div style="font-size:15px;font-weight:600">{{order.restaurant ? order.restaurant.name : '-'}}</div>
            <div v-if="order.restaurant && order.restaurant.address" style="font-size:12px;color:var(--muted);margin-top:4px">{{order.restaurant.address}}</div>
            <div v-if="order.restaurant" style="display:flex;gap:8px;margin-top:8px">
              <a :href="'https://www.google.com/maps/dir/?api=1&destination='+order.restaurant.latitude+','+order.restaurant.longitude" target="_blank" style="flex:1;padding:8px;border-radius:6px;background:#4285f4;color:#fff;font-size:12px;font-weight:600;text-align:center;text-decoration:none"><i class="fas fa-map-marked-alt"></i> Maps</a>
              <a :href="'https://waze.com/ul?ll='+order.restaurant.latitude+','+order.restaurant.longitude+'&navigate=yes'" target="_blank" style="flex:1;padding:8px;border-radius:6px;background:#33ccff;color:#fff;font-size:12px;font-weight:600;text-align:center;text-decoration:none"><i class="fas fa-location-arrow"></i> Waze</a>
            </div>
          </div>
          <div style="background:var(--bg);border-radius:8px;padding:12px;margin-bottom:10px">
            <div style="font-size:12px;color:var(--muted)">Cliente</div>
            <div style="font-size:14px;font-weight:500">{{order.address || 'Sin direccion'}}</div>
            <div v-if="customerCoords" style="display:flex;gap:8px;margin-top:8px">
              <a :href="'https://www.google.com/maps/dir/?api=1&destination='+customerCoords.lat+','+customerCoords.lng" target="_blank" style="flex:1;padding:8px;border-radius:6px;background:#4285f4;color:#fff;font-size:12px;font-weight:600;text-align:center;text-decoration:none"><i class="fas fa-map-marked-alt"></i> Maps</a>
              <a :href="'https://waze.com/ul?ll='+customerCoords.lat+','+customerCoords.lng+'&navigate=yes'" target="_blank" style="flex:1;padding:8px;border-radius:6px;background:#33ccff;color:#fff;font-size:12px;font-weight:600;text-align:center;text-decoration:none"><i class="fas fa-location-arrow"></i> Waze</a>
            </div>
          </div>
          <div class="bill">
            <div v-if="order.orderitems" v-for="item in order.orderitems" :key="item.id">
              <div class="bill-row"><span>{{item.quantity}}x {{item.name}}</span><span>{{Store.formatPrice(item.price * item.quantity)}}</span></div>
              <div v-if="item.order_item_addons && item.order_item_addons.length" style="padding-left:24px;margin-bottom:4px"><div v-for="a in item.order_item_addons" :key="a.id" style="font-size:11px;color:var(--muted)">+ {{a.addon_name}} ({{Store.formatPrice(a.addon_price)}})</div></div>
            </div>
            <div class="bill-row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px"><span>Subtotal</span><span>{{Store.formatPrice(order.sub_total || order.total)}}</span></div>
            <div class="bill-row"><span>Envio</span><span>{{Store.formatPrice(order.delivery_charge || 0)}}</span></div>
            <div v-if="order.restaurant_charge > 0" class="bill-row"><span>Cargo servicio</span><span>{{Store.formatPrice(order.restaurant_charge)}}</span></div>
            <div v-if="order.coupon_amount > 0" class="bill-row"><span>Cupon</span><span style="color:green">-{{Store.formatPrice(order.coupon_amount)}}</span></div>
            <div class="bill-row total"><span>Total</span><span>{{Store.formatPrice(order.total)}}</span></div>
            <div class="bill-row"><span>Pago</span><span>{{order.payment_mode || 'COD'}}</span></div>
          </div>
          <div v-if="order.order_comment" style="background:#fff3e0;border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px"><i class="fas fa-comment" style="color:#ff9800;margin-right:6px"></i>{{order.order_comment}}</div>
        </div>
        <div style="padding:16px">
          <button v-if="order.orderstatus_id === 2" class="btn-primary" @click="acceptOrder" :disabled="actionLoading"><i class="fas fa-check"></i> {{actionLoading ? 'Procesando...' : 'Aceptar Pedido'}}</button>
          <button v-else-if="order.orderstatus_id === 3" class="btn-primary" style="background:#ff9800" @click="pickupOrder" :disabled="actionLoading"><i class="fas fa-box"></i> {{actionLoading ? 'Procesando...' : 'Recogido del Restaurante'}}</button>
          <button v-else-if="order.orderstatus_id === 4" class="btn-primary" style="background:#4caf50" @click="deliverOrder" :disabled="actionLoading"><i class="fas fa-check-double"></i> {{actionLoading ? 'Procesando...' : 'Marcar como Entregado'}}</button>
          <div v-else-if="order.orderstatus_id === 5" style="text-align:center;padding:20px;color:#4caf50;font-weight:600"><i class="fas fa-check-circle" style="font-size:24px"></i><p>Pedido entregado</p></div>
        </div>
        <div v-if="successMsg" style="padding:0 16px"><div style="background:#e8f5e9;color:#2e7d32;padding:10px;border-radius:8px;font-size:13px;text-align:center">{{successMsg}}</div></div>
        <div v-if="[3,4].includes(order.orderstatus_id)" style="padding:0 16px 16px">
          <div style="font-size:14px;font-weight:600;margin-bottom:8px"><i class="fas fa-comments" style="color:var(--primary)"></i> Chat con el cliente</div>
          <div ref="chatBox" style="background:var(--bg);border-radius:8px;padding:12px;max-height:250px;overflow-y:auto;margin-bottom:8px">
            <div v-if="!messages.length" style="text-align:center;color:var(--muted);font-size:12px;padding:20px">Sin mensajes aun</div>
            <div v-for="m in messages" :key="m.id" :style="{marginBottom:'8px',display:'flex',justifyContent:m.sender_id==myId?'flex-end':'flex-start'}">
              <div :style="{maxWidth:'75%',padding:'8px 12px',borderRadius:'12px',fontSize:'13px',background:m.sender_id==myId?'var(--primary)':'var(--white)',color:m.sender_id==myId?'#fff':'var(--text)',boxShadow:'0 1px 3px rgba(0,0,0,.1)'}">{{m.message}}<div :style="{fontSize:'10px',marginTop:'4px',opacity:.7}">{{formatTime(m.created_at)}}</div></div>
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
  data() { return { order: null, loading: true, actionLoading: false, successMsg: '', gpsInterval: null, messages: [], chatMsg: '', chatInterval: null }; },
  computed: {
    statusText() { return {2:'Esperando repartidor',3:'Asignado',4:'En camino',5:'Entregado'}[this.order?.orderstatus_id] || ''; },
    statusColor() { return {2:'#ff9800',3:'#2196f3',4:'#ff9800',5:'#4caf50'}[this.order?.orderstatus_id] || '#9e9e9e'; },
    myId() { const u = JSON.parse(localStorage.getItem('deliveryUser') || '{}'); return u.id; },
    customerCoords() { if (!this.order || !this.order.location) return null; try { return JSON.parse(this.order.location); } catch(e) { return null; } }
  },
  async mounted() {
    if (!localStorage.getItem('deliveryToken')) { this.$router.push('/delivery'); return; }
    await this.loadOrder();
    if (this.order && [3,4].includes(this.order.orderstatus_id)) { this.startGpsTracking(); this.loadMessages(); this.chatInterval = setInterval(() => this.loadMessages(), 10000); }
  },
  beforeUnmount() { this.stopGpsTracking(); if (this.chatInterval) clearInterval(this.chatInterval); },
  methods: {
    async loadOrder() { try { const token = localStorage.getItem('deliveryToken'); const res = await API.post('/delivery/get-single-delivery-order', { token, order_id: this.$route.params.id }); this.order = res; } catch(e) {} this.loading = false; },
    async acceptOrder() { this.actionLoading = true; try { const token = localStorage.getItem('deliveryToken'); await API.post('/delivery/accept-to-deliver', { token, order_id: this.order.id }); this.order.orderstatus_id = 3; this.successMsg = 'Pedido aceptado!'; this.startGpsTracking(); this.loadMessages(); this.chatInterval = setInterval(() => this.loadMessages(), 10000); } catch(e) {} this.actionLoading = false; },
    async pickupOrder() { this.actionLoading = true; try { const token = localStorage.getItem('deliveryToken'); await API.post('/delivery/pickedup-order', { token, order_id: this.order.id }); this.order.orderstatus_id = 4; this.successMsg = 'Pedido recogido!'; } catch(e) {} this.actionLoading = false; },
    async deliverOrder() { this.actionLoading = true; try { const token = localStorage.getItem('deliveryToken'); await API.post('/delivery/deliver-order', { token, order_id: this.order.id }); this.order.orderstatus_id = 5; this.successMsg = 'Pedido entregado!'; this.stopGpsTracking(); if (this.chatInterval) clearInterval(this.chatInterval); } catch(e) {} this.actionLoading = false; },
    startGpsTracking() { if (this.gpsInterval) return; this.sendGps(); this.gpsInterval = setInterval(() => this.sendGps(), 10000); },
    stopGpsTracking() { if (this.gpsInterval) { clearInterval(this.gpsInterval); this.gpsInterval = null; } },
    sendGps() { if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(async (pos) => { const token = localStorage.getItem('deliveryToken'); await API.post('/delivery/set-delivery-guy-gps-location', { token, latitude: pos.coords.latitude, longitude: pos.coords.longitude, heading: pos.coords.heading || 0 }); }, () => {}, { enableHighAccuracy: true, timeout: 8000 }); },
    async loadMessages() { try { const token = localStorage.getItem('deliveryToken'); const res = await API.post('/conversation/chat', { token, order_id: this.order.id }); this.messages = Array.isArray(res) ? res : []; this.$nextTick(() => { if (this.$refs.chatBox) this.$refs.chatBox.scrollTop = this.$refs.chatBox.scrollHeight; }); } catch(e) {} },
    async sendMessage() { if (!this.chatMsg.trim()) return; try { const token = localStorage.getItem('deliveryToken'); await API.post('/conversation/send', { token, order_id: this.order.id, message: this.chatMsg.trim() }); this.chatMsg = ''; await this.loadMessages(); } catch(e) {} },
    formatTime(d) { if (!d) return ''; return new Date(d).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }); }
  }
};

const DeliveryHistoryPage = {
  template: `
    <div class="page" style="background:var(--white);min-height:100vh">
      <app-header title="Historial de Entregas" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div v-if="!orders.length" class="empty-state"><i class="fas fa-history"></i><p>Sin entregas completadas</p></div>
        <div style="padding:0 16px">
          <div v-for="o in orders" :key="o.id" class="card">
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;font-size:14px">#{{o.unique_order_id}}</span>
                <span style="font-weight:600;font-size:14px;color:var(--primary)">{{Store.formatPrice(o.total)}}</span>
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:6px"><i class="fas fa-store" style="width:16px"></i> {{o.restaurant ? o.restaurant.name : '-'}}</div>
              <div style="font-size:12px;color:var(--muted);margin-top:4px"><i class="fas fa-calendar" style="width:16px"></i> {{formatDate(o.created_at)}}</div>
            </div>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { orders: [], loading: false }; },
  async mounted() { if (!localStorage.getItem('deliveryToken')) { this.$router.push('/delivery'); return; } this.loading = true; try { const token = localStorage.getItem('deliveryToken'); const res = await API.post('/delivery/get-completed-orders', { token }); this.orders = Array.isArray(res) ? res : []; } catch(e) {} this.loading = false; },
  methods: { formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); } }
};

const DeliveryEarningsPage = {
  template: `
    <div class="page" style="background:var(--white);min-height:100vh">
      <app-header title="Mis Ganancias" :back="true"></app-header>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else>
        <div style="padding:20px 16px;text-align:center;background:linear-gradient(135deg,var(--primary),#ff8a65);color:#fff;margin:16px;border-radius:var(--radius)">
          <div style="font-size:13px;opacity:.8">Ganancias totales</div>
          <div style="font-size:28px;font-weight:700;margin-top:4px">{{Store.formatPrice(totalEarnings)}}</div>
          <div style="font-size:12px;opacity:.7;margin-top:4px">{{totalDeliveries}} entregas completadas</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:0 16px;margin-bottom:16px">
          <div style="background:var(--bg);border-radius:8px;padding:14px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:#4caf50">{{Store.formatPrice(todayEarnings)}}</div>
            <div style="font-size:11px;color:var(--muted)">Hoy</div>
          </div>
          <div style="background:var(--bg);border-radius:8px;padding:14px;text-align:center">
            <div style="font-size:20px;font-weight:700;color:#2196f3">{{Store.formatPrice(weekEarnings)}}</div>
            <div style="font-size:11px;color:var(--muted)">Esta semana</div>
          </div>
        </div>
        <div class="section-title">Ultimas entregas</div>
        <div v-if="!orders.length" class="empty-state" style="padding:20px"><p>Sin entregas aun</p></div>
        <div style="padding:0 16px">
          <div v-for="o in orders.slice(0,20)" :key="o.id" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:13px;font-weight:500">#{{o.unique_order_id}}</div>
              <div style="font-size:11px;color:var(--muted)">{{formatDate(o.order_date || o.created_at)}} &middot; {{o.commission_type === 'percentage' ? 'Porcentual' : 'Fijo'}}</div>
            </div>
            <div style="font-weight:600;color:#4caf50">+{{Store.formatPrice(o.amount)}}</div>
          </div>
        </div>
      </template>
    </div>`,
  components: { AppHeader },
  setup() { return { Store }; },
  data() { return { orders: [], loading: true, totalEarnings: 0, todayEarnings: 0, weekEarnings: 0, totalDeliveries: 0 }; },
  async mounted() {
    if (!localStorage.getItem('deliveryToken')) { this.$router.push('/delivery'); return; }
    try {
      const token = localStorage.getItem('deliveryToken');
      const res = await API.post('/delivery/get-earnings', { token });
      this.orders = res.earnings || [];
      this.totalEarnings = res.totalEarnings || 0;
      this.todayEarnings = res.todayEarnings || 0;
      this.weekEarnings = res.weekEarnings || 0;
      this.totalDeliveries = res.totalDeliveries || 0;
    } catch(e) {}
    this.loading = false;
  },
  methods: { formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); } }
};
