const { Setting, Location, Address, Coupon, PushToken, Order, Orderitem, OrderItemAddon, Translation, Page, RestaurantCategory, RestaurantCategorySlider, SmsOtp, PasswordResetOtp, User, Rating, Restaurant, DeliveryGuyDetail, AcceptDelivery, sequelize } = require('../models');
const { Op, QueryTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const otpHelper = require('../helpers/otp');
const mailer = require('../helpers/mailer');
const states = require('../helpers/orderStates');
const { emitOrderEvent } = require('../helpers/orderEvents');
const { releaseDueScheduledOrders } = require('../helpers/scheduledOrders');

// ─── Settings ────────────────────────────────────────────────────────────────
const PUBLIC_SETTINGS_KEYS = [
  'storeName', 'currencySymbol', 'currencyId', 'currencyFormat',
  'walletName', 'deliveryRadius', 'enableDeliveryPin',
  'enablePushNotificationOrders',
  'seoMetaTitle', 'seoMetaDescription', 'googleAnalyticsCode',
  'firebaseApiKey', 'firebaseAuthDomain', 'firebaseProjectId', 'firebaseStorageBucket',
  'firebaseMessagingSenderId', 'firebaseAppId', 'firebaseMeasurementId', 'firebaseVapidKey',
  'faviconUrl', 'logoUrl', 'listingImageUrl', 'primaryColor',
  'googleApiKey', 'googleMapId',
];

exports.getSettings = async (req, res) => {
  try {
    const cache = require('../helpers/cache');
    const cached = await cache.get('settings:all');
    if (cached) return res.json(cached);
    const rows = await Setting.findAll();
    const settings = rows
      .map((s) => {
        const j = s.toJSON ? s.toJSON() : s;
        return { id: j.id, key: j.key, value: j.value };
      })
      .filter((s) => PUBLIC_SETTINGS_KEYS.includes(s.key));
    await cache.set('settings:all', settings, parseInt(process.env.CACHE_SETTINGS_TTL || '300', 10));
    res.json(settings);
  } catch (err) {
    console.error('[getSettings]');
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getSettingByKey = async (req, res) => {
  try {
    const key = String(req.params.key || '');
    if (!PUBLIC_SETTINGS_KEYS.includes(key)) return res.status(404).json(null);
    const s = await Setting.findOne({ where: { key } });
    res.json(s ? s.value : null);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ─── Location ─────────────────────────────────────────────────────────────────
exports.searchLocation = async (req, res) => {
  try {
    const raw = String(req.params.query || '').slice(0, 100);
    const q = raw.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const locations = await Location.findAll({ where: { name: { [Op.like]: `%${q}%` } }, limit: 10 });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.popularLocations = async (req, res) => {
  try {
    const locations = await Location.findAll({ where: { is_primary: true } });
    res.json(locations);
  } catch (err) {
    console.error('[misc]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.popularGeoLocations = async (req, res) => {
  try {
    const { PopularGeoPlace } = require('../models');
    const places = await PopularGeoPlace.findAll();
    const result = places.map(p => ({ ...p.toJSON(), is_default: p.is_default ? 1 : 0, is_primary: p.is_default ? 1 : 0 }));
    res.json(result);
  } catch (err) {
    console.error('[misc]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ─── PromoSlider ──────────────────────────────────────────────────────────────
exports.promoSlider = async (req, res) => {
  try {
    const [sliders] = await sequelize.query('SELECT * FROM promo_sliders WHERE image IS NOT NULL ORDER BY id DESC');
    const [slides] = await sequelize.query('SELECT * FROM slides WHERE image IS NOT NULL ORDER BY sort_position ASC');
    res.json([...sliders, ...slides]);
  } catch (err) {
    res.status(500).json([]);
  }
};

// ─── Address ──────────────────────────────────────────────────────────────────
exports.getAddresses = async (req, res) => {
  try {
    const addresses = await Address.findAll({ where: { user_id: req.user.id } });
    res.json(addresses);
  } catch (err) {
    console.error('[misc]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.saveAddress = async (req, res) => {
  try {
    const { address, house, tag, latitude, longitude } = req.body;
    const addr = await Address.create({ user_id: req.user.id, address, house, tag, latitude, longitude });
    res.json(addr);
  } catch (err) {
    console.error('[misc]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    await Address.destroy({ where: { id: req.body.address_id, user_id: req.user.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[misc]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    await req.user.update({ default_address_id: req.body.address_id });
    res.json({ success: true });
  } catch (err) {
    console.error('[misc]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// ─── Coupon ───────────────────────────────────────────────────────────────────
exports.applyCoupon = async (req, res) => {
  try {
    const code = req.body.code || req.body.coupon;
    if (!code || typeof code !== 'string') return res.json({ success: false, message: 'No coupon code provided' });
    const { checkCoupon } = require('../helpers/orderCatalog');
    const result = await checkCoupon(code, {
      subTotal: parseFloat(req.body.subtotal || 0),
      restaurantId: req.body.restaurant_id,
      userId: req.user ? req.user.id : null,
    });
    if (!result.ok) return res.json({ success: false, message: result.message });
    res.json({ success: true, coupon: result.coupon, discount_amount: result.amount });
  } catch (err) {
    console.error('applyCoupon error:', err.message);
    res.status(500).json({ success: false, message: 'Error al validar cupón' });
  }
};

// ─── Notifications ────────────────────────────────────────────────────────────
exports.saveToken = async (req, res) => {
  try {
    await PushToken.upsert({ user_id: req.user.id, token: req.body.token, device_type: req.body.device_type });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.saveTokenNoUser = async (req, res) => {
  try {
    await PushToken.create({ user_id: null, token: req.body.token, device_type: req.body.device_type });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.saveFCMToken = async (req, res) => {
  try {
    const token = req.body && req.body.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Token required' });
    }
    const { saveFCMToken } = require('../helpers/notifications');
    await saveFCMToken(req.user.id, token, req.body.platform || 'web');
    res.json({ success: true, user_id: req.user.id });
  } catch (err) {
    console.error('[saveFCMToken]', err.message);
    res.status(500).json({ success: false });
  }
};

exports.updateAppTokenForUser = async (req, res) => {
  try {
    await PushToken.upsert({ user_id: req.user.id, token: req.body.token, device_type: req.body.device_type });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getUserNotifications = async (req, res) => {
  try {
    const [notifications] = await sequelize.query(
      'SELECT * FROM notifications WHERE notifiable_id = ? AND notifiable_type = ? ORDER BY created_at DESC LIMIT 20',
      { replacements: [req.user.id, 'App\\User'] }
    );
    res.json(notifications);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await sequelize.query('UPDATE notifications SET read_at = NOW() WHERE notifiable_id = ? AND notifiable_type = ? AND read_at IS NULL', { replacements: [req.user.id, 'App\\User'] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.markOneNotificationRead = async (req, res) => {
  try {
    await sequelize.query('UPDATE notifications SET read_at = NOW() WHERE id = ? AND notifiable_id = ? AND notifiable_type = ?', { replacements: [req.body.id, req.user.id, 'App\\User'] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ─── Payment Gateways ─────────────────────────────────────────────────────────
exports.getPaymentGateways = async (req, res) => {
  try {
    const { PaymentGateway } = require('../models');
    const gateways = await PaymentGateway.findAll({ where: { is_active: 1 } });
    res.json(gateways);
  } catch (err) {
    res.status(500).json([]);
  }
};

// ─── Language ─────────────────────────────────────────────────────────────────
exports.getAllLanguages = async (req, res) => {
  try {
    const langs = await Translation.findAll({ where: { is_active: 1 }, attributes: ['id', 'language_name', 'language_code', 'is_default'] });
    const result = langs.map(l => ({ ...l.toJSON(), is_default: l.is_default ? 1 : 0 }));
    res.json(result);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.getSingleLanguage = async (req, res) => {
  try {
    const where = req.body.id ? { id: req.body.id } : { language_code: req.body.language_code };
    const lang = await Translation.findOne({ where });
    if (!lang) return res.json(null);
    let data = {};
    if (lang.translation_data) {
      try { data = JSON.parse(lang.translation_data); } catch(e) {}
    }
    res.json(data);
  } catch (err) {
    res.status(500).json(null);
  }
};

// ─── Pages ────────────────────────────────────────────────────────────────────
exports.getPages = async (req, res) => {
  try {
    const pages = await Page.findAll({ where: { is_active: 1 }, attributes: ['id', 'name', 'slug'] });
    res.json(pages);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.getSinglePage = async (req, res) => {
  try {
    const page = await Page.findOne({ where: { slug: req.body.slug } });
    res.json(page);
  } catch (err) {
    res.status(500).json(null);
  }
};

// ─── Restaurant Categories ────────────────────────────────────────────────────
exports.getRestaurantCategorySlider = async (req, res) => {
  try {
    const sliders = await RestaurantCategorySlider.findAll({ order: [['order_column', 'ASC']] });
    res.json(sliders);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.getAllRestaurantsCategories = async (req, res) => {
  try {
    const categories = await RestaurantCategory.findAll({ order: [['order_column', 'ASC']] });
    res.json(categories);
  } catch (err) {
    res.status(500).json([]);
  }
};

// ─── SMS / OTP ────────────────────────────────────────────────────────────────
// Envío del OTP por correo SMTP (src/helpers/mailer.js). El código nunca se devuelve en la respuesta.
// El destino es el correo del usuario registrado con ese teléfono; solo si el teléfono no tiene cuenta
// se acepta el correo indicado en la petición (alta nueva). La respuesta no revela si la cuenta existe.
async function deliverPhoneOtp(req, res) {
  const phone = req.body && req.body.phone;
  if (!phone || typeof phone !== 'string') return res.status(400).json({ success: false });
  const code = await otpHelper.issueOtp(SmsOtp, { phone });
  const existing = await User.findOne({ where: { phone } });
  const bodyEmail = req.body && req.body.email;
  const to = existing ? existing.email : (mailer.isValidEmail(bodyEmail) ? bodyEmail : null);
  if (to) void mailer.sendOtpMail(to, code, 'otp').catch((err) => console.error('[otp] envío', err.message));
  else console.error('[otp] sin correo de destino para el OTP');
  return res.json({ success: true });
}

exports.sendOtp = async (req, res) => {
  try {
    await deliverPhoneOtp(req, res);
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const phone = req.body && req.body.phone;
    const result = await otpHelper.verifyOtp(SmsOtp, { phone }, req.body && req.body.otp, { identifier: phone, ip: req.ip });
    if (result === 'blocked') return res.status(429).json({ success: false, message: 'Demasiados intentos. Intenta de nuevo más tarde.' });
    if (result === 'expired') return res.json({ success: false, message: 'OTP expired' });
    res.json({ success: result === 'ok' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.generateOtpForLogin = async (req, res) => {
  try {
    await deliverPhoneOtp(req, res);
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ─── Password Reset ───────────────────────────────────────────────────────────
exports.sendPasswordResetMail = async (req, res) => {
  try {
    const email = req.body && req.body.email;
    if (!email || typeof email !== 'string') return res.status(400).json({ success: false });
    const code = await otpHelper.issueOtp(PasswordResetOtp, { email });
    const user = await User.findOne({ where: { email } });
    if (user) void mailer.sendOtpMail(email, code, 'reset').catch((err) => console.error('[reset] envío', err.message));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.verifyPasswordResetOtp = async (req, res) => {
  try {
    const email = req.body && req.body.email;
    const result = await otpHelper.verifyOtp(PasswordResetOtp, { email }, req.body && req.body.otp, { identifier: email, ip: req.ip });
    if (result === 'blocked') return res.status(429).json({ success: false, message: 'Demasiados intentos. Intenta de nuevo más tarde.' });
    if (result === 'expired') return res.json({ success: false, message: 'OTP expired' });
    res.json({ success: result === 'ok' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.changeUserPassword = async (req, res) => {
  try {
    const { email, password, otp } = req.body || {};
    if (!email || typeof email !== 'string') return res.json({ success: false });
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (!otp) return res.json({ success: false, message: 'OTP requerido' });
    const result = await otpHelper.verifyOtp(PasswordResetOtp, { email }, otp, { identifier: email, ip: req.ip, consume: true });
    if (result === 'blocked') return res.status(429).json({ success: false, message: 'Demasiados intentos. Intenta de nuevo más tarde.' });
    if (result === 'missing') return res.json({ success: false, message: 'Solicita un OTP primero' });
    if (result === 'expired') return res.json({ success: false, message: 'OTP expirado' });
    if (result !== 'ok') return res.json({ success: false, message: 'OTP inválido' });
    const user = await User.findOne({ where: { email } });
    if (!user) return res.json({ success: false });
    await user.update({ password: await bcrypt.hash(password, 10) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ─── Ratings ──────────────────────────────────────────────────────────────────
exports.getRatableOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ where: { id: req.body.order_id, user_id: req.user.id, orderstatus_id: 5 }, include: [{ association: 'rating' }] });
    res.json(order && !order.rating ? order : null);
  } catch (err) {
    res.status(500).json(null);
  }
};

function parseScore(v, { required }) {
  if (v === undefined || v === null || v === '' || Number(v) === 0) return required ? NaN : null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : NaN;
}

function cleanReview(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, 1000) : null;
}

// Califica un pedido: solo el cliente dueño, pedido entregado (5), una sola vez y notas entre 1 y 5.
exports.rateOrder = async (req, res) => {
  try {
    const { order_id, rating_store, rating_delivery, review_store, review_delivery } = req.body || {};
    const orderId = toOrderId(order_id);
    if (!orderId) return res.status(400).json({ success: false, message: 'Pedido inválido' });
    const store = parseScore(rating_store, { required: true });
    const delivery = parseScore(rating_delivery, { required: false });
    if (Number.isNaN(store) || Number.isNaN(delivery)) {
      return res.status(400).json({ success: false, message: 'La calificación debe estar entre 1 y 5' });
    }

    const outcome = await sequelize.transaction(async (t) => {
      const order = await Order.findOne({ where: { id: orderId, user_id: req.user.id }, transaction: t, lock: t.LOCK.UPDATE });
      if (!order) return { status: 404, message: 'Pedido no encontrado' };
      if (Number(order.orderstatus_id) !== 5) return { status: 409, message: 'Solo puedes calificar pedidos entregados' };
      const previous = await Rating.findOne({ where: { order_id: orderId }, transaction: t });
      if (previous) return { status: 409, message: 'Este pedido ya fue calificado' };
      const deliveryId = await getAssignedDeliveryId(orderId, t);
      await Rating.create({
        order_id: orderId, user_id: req.user.id, restaurant_id: order.restaurant_id, delivery_id: deliveryId,
        rating_store: store, rating_delivery: delivery,
        review_store: cleanReview(review_store), review_delivery: cleanReview(review_delivery),
      }, { transaction: t });
      return { status: 200 };
    });

    if (outcome.status !== 200) return res.status(outcome.status).json({ success: false, message: outcome.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getRatingAndReview = async (req, res) => {
  try {
    const rows = await sequelize.query(
      'SELECT id FROM restaurants WHERE slug = ? AND is_accepted = 1 LIMIT 1',
      { replacements: [String(req.params.slug || '')], type: QueryTypes.SELECT }
    );
    if (!rows.length) return res.status(404).json({ success: false });
    req.params = { ...req.params, id: String(rows[0].id) };
    return require('./restaurantController').getPublicRatings(req, res);
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ─── Delivery ─────────────────────────────────────────────────────────────────
function withoutDeliveryPin(o) {
  const obj = o && typeof o.toJSON === 'function' ? o.toJSON() : { ...o };
  delete obj.delivery_pin;
  return obj;
}

function toOrderId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function getAssignedDeliveryId(orderId, transaction) {
  const rows = await sequelize.query(
    'SELECT user_id FROM accept_deliveries WHERE order_id = ? ORDER BY id DESC LIMIT 1',
    { replacements: [orderId], type: QueryTypes.SELECT, transaction }
  );
  return rows[0] ? Number(rows[0].user_id) : null;
}

async function getOrderParticipants(orderId) {
  const order = await Order.findByPk(orderId, { attributes: ['id', 'user_id', 'unique_order_id', 'orderstatus_id'] });
  if (!order) return null;
  return { order, customerId: Number(order.user_id), deliveryId: await getAssignedDeliveryId(orderId) };
}

exports.deliveryLogin = async (req, res) => {
  try {
    const { generateToken } = require('../middleware/auth');
    const [rows] = await sequelize.query(
      'SELECT u.* FROM users u JOIN model_has_roles mr ON u.id = mr.model_id JOIN roles r ON mr.role_id = r.id WHERE u.phone = ? AND r.name = ? LIMIT 1',
      { replacements: [req.body.phone, 'Delivery Guy'] }
    );
    const row = rows[0];
    if (!row || !(await bcrypt.compare(req.body.password, row.password))) {
      return res.status(401).json({ success: false, data: 'DONOTMATCH' });
    }
    // Check if approved
    if (!row.is_active) {
      return res.json({ success: false, message: 'Tu cuenta aún no ha sido aprobada por el administrador.' });
    }
    const user = await User.findByPk(row.id, { include: [{ association: 'delivery_guy_detail' }] });
    const token = generateToken(user);
    await user.update({ auth_token: token });
    res.json({ success: true, data: { id: user.id, auth_token: token, name: user.name, phone: user.phone, delivery_guy_detail: user.delivery_guy_detail } });
  } catch (err) {
    console.error('deliveryLogin error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.deliveryRegister = async (req, res) => {
  try {
    const { name, email, phone, password, vehicle_number } = req.body;
    if (!password || password.length < 8) {
      return res.json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
    }
    // Check if phone or email already exists
    const existing = await User.findOne({ where: { [Op.or]: [{ phone }, { email }] } });
    if (existing) return res.json({ success: false, message: 'El teléfono o email ya está registrado' });
    // Create user as inactive (pending approval)
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, phone, password: hash, is_active: 0 });
    // Assign Delivery Guy role
    const [dgRole] = await sequelize.query("SELECT id FROM roles WHERE name = 'Delivery Guy' LIMIT 1");
    if (dgRole[0]) {
      await sequelize.query('INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?, ?, ?)', { replacements: [dgRole[0].id, 'App\\User', user.id] });
    }
    // Create delivery_guy_details
    await sequelize.query('INSERT INTO delivery_guy_details (user_id, vehicle_number, is_available, created_at, updated_at) VALUES (?, ?, 0, NOW(), NOW())', { replacements: [user.id, vehicle_number || ''] });
    // Create pending approval notification for admin
    const { notifyAdminNewDelivery } = require('../helpers/notifications');
    await notifyAdminNewDelivery(name, phone);

    res.json({ success: true });
  } catch (err) {
    console.error('deliveryRegister error:', err.message);
    res.json({ success: false, message: 'Error al registrar' });
  }
};

// Campos del pedido que el repartidor necesita; se excluyen PIN, pago, cupón, impuestos y datos internos.
const DELIVERY_ORDER_ATTRS = [
  'id', 'unique_order_id', 'restaurant_id', 'orderstatus_id', 'total', 'sub_total', 'delivery_charge',
  'restaurant_charge', 'coupon_amount', 'tip_amount', 'payment_mode', 'payable', 'cash_change_amount',
  'address', 'location', 'delivery_type', 'distance', 'order_comment',
  'is_scheduled', 'schedule_date', 'schedule_slot', 'created_at',
];
const DELIVERY_RESTAURANT_ATTRS = ['id', 'name', 'latitude', 'longitude', 'image', 'address'];
const DELIVERY_ITEM_ATTRS = ['id', 'order_id', 'item_id', 'name', 'quantity', 'price'];

exports.getDeliveryOrders = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userId = req.user.id;
    const cache = require('../helpers/cache');
    const { getDistance } = require('../helpers/utils');

    // Libera programados cuya hora llegó (sin timers)
    await releaseDueScheduledOrders();

    let maxRadius = 10;
    const radiusCached = await cache.get('settings:deliveryRadius');
    if (radiusCached != null) {
      maxRadius = parseFloat(radiusCached);
    } else {
      const [radiusSetting] = await sequelize.query("SELECT `value` FROM settings WHERE `key` = 'deliveryRadius' LIMIT 1");
      maxRadius = radiusSetting.length ? parseFloat(radiusSetting[0].value) : 10;
      await cache.set('settings:deliveryRadius', maxRadius, 600);
    }

    const [ignored] = await sequelize.query(
      'SELECT order_id FROM delivery_ignored_orders WHERE user_id = ?',
      { replacements: [userId] }
    );
    const ignoredIds = new Set(ignored.map((i) => i.order_id));

    const orders = await Order.findAll({
      where: { orderstatus_id: [2, 12], delivery_type: 1 },
      attributes: DELIVERY_ORDER_ATTRS,
      include: [
        { association: 'restaurant', attributes: DELIVERY_RESTAURANT_ATTRS },
        { association: 'orderitems', attributes: DELIVERY_ITEM_ATTRS },
      ],
      order: [['id', 'DESC']],
      limit: parseInt(process.env.DELIVERY_ORDERS_LIMIT || '50', 10),
    });

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const filtered = orders.filter((o) => {
      if (ignoredIds.has(o.id)) return false;
      if (!latitude || !longitude || !o.restaurant) return true;
      const dist = getDistance(lat, lng, parseFloat(o.restaurant.latitude), parseFloat(o.restaurant.longitude));
      return dist <= maxRadius;
    });

    res.json(filtered.map(withoutDeliveryPin));
  } catch (err) {
    console.error('getDeliveryOrders error:', err.message);
    res.status(500).json([]);
  }
};

exports.getSingleDeliveryOrder = async (req, res) => {
  try {
    const orderId = toOrderId(req.body.order_id);
    if (!orderId) return res.json(null);
    const order = await Order.findByPk(orderId, {
      attributes: DELIVERY_ORDER_ATTRS,
      include: [
        { association: 'restaurant', attributes: DELIVERY_RESTAURANT_ATTRS },
        { association: 'orderitems', attributes: DELIVERY_ITEM_ATTRS, include: [{ association: 'order_item_addons' }] },
      ],
    });
    if (!order) return res.json(null);
    const assignedId = await getAssignedDeliveryId(orderId);
    const isAvailable = !assignedId && [2, 12].includes(Number(order.orderstatus_id)) && Number(order.delivery_type) === 1;
    if (assignedId !== Number(req.user.id) && !isAvailable) {
      return res.status(403).json(null);
    }
    const result = withoutDeliveryPin(order);
    if (result.orderitems && result.orderitems.length) {
      for (let oi of result.orderitems) {
        if (!oi.name && oi.item_id) {
          const [rows] = await sequelize.query('SELECT name, price FROM items WHERE id = ?', { replacements: [oi.item_id] });
          if (rows[0]) { oi.name = rows[0].name; if (!parseFloat(oi.price)) oi.price = rows[0].price; }
        }
      }
    }
    res.json(result);
  } catch (err) {
    res.status(500).json(null);
  }
};

exports.setDeliveryGuyGpsLocation = async (req, res) => {
  try {
    const rawLat = req.body.latitude;
    const rawLng = req.body.longitude;
    const lat = typeof rawLat === 'number' || (typeof rawLat === 'string' && rawLat.trim() !== '') ? Number(rawLat) : NaN;
    const lng = typeof rawLng === 'number' || (typeof rawLng === 'string' && rawLng.trim() !== '') ? Number(rawLng) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, message: 'Coordenadas inválidas' });
    }
    const gps = require('../helpers/gps');
    const result = await gps.updateDeliveryGps(
      req.user.id,
      lat,
      lng,
      req.body.heading
    );
    res.json({ success: true, throttled: result.throttled || false });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getDeliveryGuyGpsLocation = async (req, res) => {
  try {
    const me = Number(req.user.id);
    let userId = null;
    const orderId = toOrderId(req.body.order_id);
    if (orderId) {
      const p = await getOrderParticipants(orderId);
      if (!p || !p.deliveryId) return res.json(null);
      if (me !== p.customerId && me !== p.deliveryId) return res.status(403).json(null);
      if (me === p.customerId && ![3, 4].includes(Number(p.order.orderstatus_id))) return res.json(null);
      userId = p.deliveryId;
    } else if (toOrderId(req.body.delivery_guy_id) === me) {
      userId = me;
    }
    if (!userId) return res.json(null);
    const gps = require('../helpers/gps');
    res.json(await gps.getDeliveryGps(userId));
  } catch (err) {
    res.status(500).json(null);
  }
};

exports.acceptToDeliver = async (req, res) => {
  try {
    const orderId = toOrderId(req.body.order_id);
    if (!orderId) return res.status(400).json({ success: false, message: 'Pedido inválido' });
    // La transición 2 -> 3 es condicional (un solo ganador); la comprobación previa evita un segundo INSERT en accept_deliveries.
    // Pendiente manual: UNIQUE(order_id) en accept_deliveries como defensa adicional.
    const accepted = await sequelize.transaction(async (t) => {
      const existing = await AcceptDelivery.findOne({ where: { order_id: orderId }, transaction: t, lock: true });
      if (existing) return false;
      try {
        await states.transition(orderId, [states.STATUS.ACCEPTED, states.STATUS.PREPARING], states.STATUS.ASSIGNED, 'delivery', t, { where: { delivery_type: 1 } });
      } catch (err) {
        if (err instanceof states.OrderStateError) return false;
        throw err;
      }
      await AcceptDelivery.create({ order_id: orderId, user_id: req.user.id }, { transaction: t });
      return true;
    });
    if (!accepted) return res.status(409).json({ success: false, message: 'El pedido ya fue tomado o no está disponible' });

    const order = await Order.findByPk(orderId);
    if (order) {
      try {
        const { notifyCustomerDeliveryAccepted } = require('../helpers/notifications');
        await notifyCustomerDeliveryAccepted(order);
      } catch (nErr) {
        console.error('acceptToDeliver notify error:', nErr.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.ignoreOrder = async (req, res) => {
  try {
    await sequelize.query('INSERT IGNORE INTO delivery_ignored_orders (user_id, order_id) VALUES (?, ?)', { replacements: [req.user.id, req.body.order_id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.pickedupOrder = async (req, res) => {
  try {
    const orderId = toOrderId(req.body.order_id);
    if (!orderId) return res.status(400).json({ success: false, message: 'Pedido inválido' });
    const notAllowed = { success: false, message: 'El pedido no está asignado a ti o no está listo para recoger' };
    try {
      await sequelize.transaction(async (t) => {
        const assignedId = await getAssignedDeliveryId(orderId, t);
        if (assignedId !== Number(req.user.id)) throw new states.OrderStateError(notAllowed.message);
        await states.transition(orderId, [states.STATUS.ASSIGNED], states.STATUS.PICKED_UP, 'delivery', t);
      });
    } catch (err) {
      if (err instanceof states.OrderStateError) return res.status(409).json(notAllowed);
      throw err;
    }

    const order = await Order.findByPk(orderId);
    if (order) {
      try {
        const { notifyCustomerOrderOnWay } = require('../helpers/notifications');
        await notifyCustomerOrderOnWay(order);
      } catch (nErr) {
        console.error('pickedupOrder notify error:', nErr.message);
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.deliverOrder = async (req, res) => {
  try {
    const orderId = toOrderId(req.body.order_id);
    if (!orderId) return res.status(400).json({ success: false, message: 'Pedido inválido' });
    const { computeDeliveryPayout } = require('../helpers/orderRules');
    const pinSetting = await Setting.findOne({ where: { key: 'enableDeliveryPin' }, attributes: ['value'] });
    const pinRequired = !!pinSetting && String(pinSetting.value) === 'true';

    const outcome = await sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!order || Number(order.orderstatus_id) !== 4) return { status: 409 };
      const assignedId = await getAssignedDeliveryId(orderId, t);
      if (assignedId !== Number(req.user.id)) return { status: 409 };
      if (pinRequired && order.delivery_pin) {
        const given = String(req.body.delivery_pin || req.body.pin || '').trim();
        if (given !== String(order.delivery_pin)) return { status: 400, message: 'PIN de entrega incorrecto' };
      }

      try {
        await states.transition(order, [states.STATUS.PICKED_UP], states.STATUS.DELIVERED, 'delivery', t);
      } catch (err) {
        if (err instanceof states.OrderStateError) return { status: 409 };
        throw err;
      }

      const dgDetails = await sequelize.query(
        'SELECT commission_type, fixed_commission, commission_rate, percentage_base, dynamic_base_distance, dynamic_base_price, dynamic_price_per_km FROM delivery_guy_details WHERE user_id = ? LIMIT 1',
        { replacements: [req.user.id], type: QueryTypes.SELECT, transaction: t }
      );
      // Ganancia = comisión del repartidor + 100% de la propina. UNIQUE(order_id) + NOT EXISTS evitan el doble pago
      const payout = computeDeliveryPayout(dgDetails[0], order);
      if (payout.amount > 0) {
        await sequelize.query(
          'INSERT INTO delivery_earnings (user_id, order_id, amount, tip_amount, commission_type) SELECT ?, ?, ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM delivery_earnings WHERE order_id = ?)',
          { replacements: [req.user.id, orderId, payout.amount, payout.tip, (dgDetails[0] && dgDetails[0].commission_type) || 'fixed', orderId], transaction: t }
        );
      }
      return { status: 200, order };
    });

    if (outcome.status === 409) return res.status(409).json({ success: false, message: 'El pedido no está asignado a ti o no está en camino' });
    if (outcome.status !== 200) return res.status(outcome.status).json({ success: false, message: outcome.message });
    await emitOrderEvent('delivered', outcome.order);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getCompletedOrders = async (req, res) => {
  try {
    const accepted = await AcceptDelivery.findAll({ where: { user_id: req.user.id } });
    const orderIds = accepted.map(a => a.order_id);
    const orders = await Order.findAll({ where: { id: orderIds, orderstatus_id: 5 }, include: [{ association: 'restaurant' }], order: [['id', 'DESC']], limit: 50 });
    res.json(orders);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.getActiveDeliveryOrders = async (req, res) => {
  try {
    const accepted = await AcceptDelivery.findAll({ where: { user_id: req.user.id } });
    const orderIds = accepted.map(a => a.order_id);
    const orders = await Order.findAll({ where: { id: orderIds, orderstatus_id: [3, 4] }, include: [{ association: 'restaurant' }, { association: 'orderitems' }], order: [['id', 'DESC']] });
    res.json(orders);
  } catch (err) {
    res.status(500).json([]);
  }
};

// Saldo propio del repartidor: efectivo por entregar, cierres, ganancias y pagos. Solo lee req.user.id.
exports.getDeliveryBalance = async (req, res) => {
  try {
    const settlements = require('../helpers/settlements');
    const [balance, closings, payouts] = await Promise.all([
      settlements.getDeliveryBalance(sequelize, req.user.id),
      settlements.listCashCollections(sequelize, req.user.id, 20),
      settlements.listDeliveryPayouts(sequelize, req.user.id, 20),
    ]);
    res.json({ success: true, balance, closings, payouts });
  } catch (err) {
    console.error('getDeliveryBalance error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.getDeliveryEarnings = async (req, res) => {
  try {
    const [earnings] = await sequelize.query(
      'SELECT de.*, o.unique_order_id, o.created_at as order_date FROM delivery_earnings de JOIN orders o ON de.order_id = o.id WHERE de.user_id = ? ORDER BY de.created_at DESC',
      { replacements: [req.user.id] }
    );
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let totalEarnings = 0, todayEarnings = 0, weekEarnings = 0;
    earnings.forEach(e => {
      const amt = parseFloat(e.amount);
      totalEarnings += amt;
      if (new Date(e.created_at) >= today) todayEarnings += amt;
      if (new Date(e.created_at) >= weekAgo) weekEarnings += amt;
    });
    res.json({ earnings, totalEarnings, todayEarnings, weekEarnings, totalDeliveries: earnings.length });
  } catch (err) {
    res.status(500).json({ earnings: [], totalEarnings: 0, todayEarnings: 0, weekEarnings: 0, totalDeliveries: 0 });
  }
};

exports.updateDeliveryUserInfo = async (req, res) => {
  try {
    const detail = await DeliveryGuyDetail.findOne({ where: { user_id: req.user.id } });
    res.json({ success: true, data: { user: req.user, delivery_detail: detail } });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
exports.deliveryCustomerChat = async (req, res) => {
  try {
    const orderId = toOrderId(req.body.order_id);
    if (!orderId) return res.json([]);
    const p = await getOrderParticipants(orderId);
    const me = Number(req.user.id);
    if (!p || (me !== p.customerId && me !== p.deliveryId)) return res.status(403).json([]);
    const messages = await sequelize.query('SELECT * FROM chats WHERE order_id = ? ORDER BY created_at ASC', { replacements: [orderId], type: QueryTypes.SELECT });
    res.json(messages);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.sendChatMessage = async (req, res) => {
  try {
    const orderId = toOrderId(req.body.order_id);
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!orderId || !message) return res.status(400).json({ success: false, message: 'Mensaje inválido' });
    if (message.length > 1000) return res.status(400).json({ success: false, message: 'El mensaje es demasiado largo' });

    const p = await getOrderParticipants(orderId);
    const senderId = Number(req.user.id);
    if (!p || (senderId !== p.customerId && senderId !== p.deliveryId)) {
      return res.status(403).json({ success: false, message: 'No participas en este pedido' });
    }

    await sequelize.query('INSERT INTO chats (order_id, sender_id, message, created_at) VALUES (?, ?, ?, NOW())', { replacements: [orderId, senderId, message] });

    let recipientId = null;
    let title = null;
    let recipientRole = null;
    if (senderId === p.customerId && p.deliveryId) {
      recipientId = p.deliveryId;
      recipientRole = 'delivery';
      title = 'Nuevo mensaje del cliente';
    } else if (senderId === p.deliveryId) {
      recipientId = p.customerId;
      recipientRole = 'customer';
      title = 'Mensaje del repartidor';
    }

    if (recipientId && title) {
      const impl = require('../helpers/notifications.impl');
      const chatData = {
        order_id: orderId,
        unique_order_id: p.order.unique_order_id,
        type: 'chat',
        recipient_role: recipientRole,
      };
      await impl.saveNotification(recipientId, title, message, chatData);
      await impl.sendPushNotification(title, message, recipientId, null, chatData);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ─── Geocoder ─────────────────────────────────────────────────────────────────
exports.coordinatesToAddress = async (req, res) => {
  try {
    const axios = require('axios');
    const { lat, lng, latitude, longitude } = req.body;
    const la = lat || latitude;
    const lo = lng || longitude;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.json('');
    const { data } = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${la},${lo}&key=${apiKey}`);
    res.json(data.results?.[0]?.formatted_address || '');
  } catch (err) {
    res.json('');
  }
};

exports.addressToCoordinates = async (req, res) => {
  try {
    const axios = require('axios');
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return res.json({ latitude: 0, longitude: 0 });
    const { data } = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(req.body.address)}&key=${apiKey}`);
    const loc = data.results?.[0]?.geometry?.location;
    res.json({ latitude: loc?.lat || 0, longitude: loc?.lng || 0 });
  } catch (err) {
    res.status(500).json({ latitude: 0, longitude: 0 });
  }
};
