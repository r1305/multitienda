const { Setting, Location, Address, Coupon, PushToken, Order, Orderitem, OrderItemAddon, Translation, Page, RestaurantCategory, RestaurantCategorySlider, SmsOtp, PasswordResetOtp, User, Rating, Restaurant, DeliveryGuyDetail, AcceptDelivery, sequelize } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');

// ─── Settings ────────────────────────────────────────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    const settings = await Setting.findAll();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSettingByKey = async (req, res) => {
  try {
    const s = await Setting.findOne({ where: { key: req.params.key } });
    res.json(s ? s.value : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Location ─────────────────────────────────────────────────────────────────
exports.searchLocation = async (req, res) => {
  try {
    const locations = await Location.findAll({ where: { name: { [Op.like]: `%${req.params.query}%` } }, limit: 10 });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.popularLocations = async (req, res) => {
  try {
    const locations = await Location.findAll({ where: { is_primary: true } });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.popularGeoLocations = async (req, res) => {
  try {
    const { PopularGeoPlace } = require('../models');
    const places = await PopularGeoPlace.findAll();
    const result = places.map(p => ({ ...p.toJSON(), is_default: p.is_default ? 1 : 0, is_primary: p.is_default ? 1 : 0 }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};

exports.saveAddress = async (req, res) => {
  try {
    const { address, house, tag, latitude, longitude } = req.body;
    const addr = await Address.create({ user_id: req.user.id, address, house, tag, latitude, longitude });
    res.json(addr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    await Address.destroy({ where: { id: req.body.address_id, user_id: req.user.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    await req.user.update({ default_address_id: req.body.address_id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Coupon ───────────────────────────────────────────────────────────────────
exports.applyCoupon = async (req, res) => {
  try {
    const code = req.body.code || req.body.coupon;
    if (!code) return res.json({ success: false, message: 'No coupon code provided' });
    const coupon = await Coupon.findOne({ where: { code: code.toUpperCase() } });
    if (!coupon) return res.json({ success: false, message: 'Cupón inválido' });
    // Check max uses
    if (coupon.max_count > 0 && coupon.count >= coupon.max_count) return res.json({ success: false, message: 'Cupón agotado' });
    // Check min subtotal
    const subtotal = parseFloat(req.body.subtotal || 0);
    if (coupon.min_sub_total > 0 && subtotal < parseFloat(coupon.min_sub_total)) return res.json({ success: false, message: 'Pedido mínimo: ' + parseFloat(coupon.min_sub_total).toFixed(2) });
    // Check max uses per user
    if (coupon.max_count_per_user > 0 && req.user) {
      const [userUses] = await sequelize.query('SELECT COUNT(*) as cnt FROM orders WHERE user_id = ? AND coupon_name = ?', { replacements: [req.user.id, coupon.code] });
      if (userUses[0] && parseInt(userUses[0].cnt) >= coupon.max_count_per_user) return res.json({ success: false, message: 'Ya usaste este cupón el máximo de veces permitido' });
    }
    // Check restaurant match
    if (coupon.restaurant_id && req.body.restaurant_id && coupon.restaurant_id != req.body.restaurant_id) return res.json({ success: false, message: 'Cupón no válido para esta tienda' });
    res.json({ success: true, coupon });
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
      'SELECT * FROM notifications WHERE notifiable_id = ? ORDER BY created_at DESC LIMIT 20',
      { replacements: [req.user.id] }
    );
    res.json(notifications);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await sequelize.query('UPDATE notifications SET read_at = NOW() WHERE notifiable_id = ? AND read_at IS NULL', { replacements: [req.user.id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.markOneNotificationRead = async (req, res) => {
  try {
    await sequelize.query('UPDATE notifications SET read_at = NOW() WHERE id = ?', { replacements: [req.body.id] });
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
exports.sendOtp = async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await SmsOtp.upsert({ phone: req.body.phone, otp });
    // TODO: integrate SMS gateway (Twilio, etc.)
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const record = await SmsOtp.findOne({ where: { phone: req.body.phone } });
    res.json({ success: record && String(record.otp) === String(req.body.otp) });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.generateOtpForLogin = async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await SmsOtp.upsert({ phone: req.body.phone, otp });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// ─── Password Reset ───────────────────────────────────────────────────────────
exports.sendPasswordResetMail = async (req, res) => {
  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await PasswordResetOtp.upsert({ email: req.body.email, otp });
    // TODO: send email with nodemailer
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.verifyPasswordResetOtp = async (req, res) => {
  try {
    const record = await PasswordResetOtp.findOne({ where: { email: req.body.email } });
    res.json({ success: record && String(record.otp) === String(req.body.otp) });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.changeUserPassword = async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user) return res.json({ success: false });
    await user.update({ password: await bcrypt.hash(req.body.password, 10) });
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

exports.rateOrder = async (req, res) => {
  try {
    const { order_id, rating_store, rating_delivery, review_store, review_delivery } = req.body;
    const order = await Order.findByPk(order_id);
    if (!order) return res.json({ success: false });
    await Rating.create({ order_id, user_id: req.user.id, restaurant_id: order.restaurant_id, rating_store, rating_delivery, review_store, review_delivery });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getRatingAndReview = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ where: { slug: req.params.slug } });
    if (!restaurant) return res.json([]);
    const ratings = await Rating.findAll({ where: { restaurant_id: restaurant.id }, include: [{ model: User, as: 'user', attributes: ['name', 'avatar'] }] });
    res.json(ratings);
  } catch (err) {
    res.status(500).json([]);
  }
};

// ─── Delivery ─────────────────────────────────────────────────────────────────
exports.deliveryLogin = async (req, res) => {
  try {
    const { generateToken } = require('../middleware/auth');
    const user = await User.findOne({ where: { phone: req.body.phone }, include: [{ association: 'delivery_guy_detail' }] });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(201).json({ success: false, data: 'DONOTMATCH' });
    }
    // Check if user has Delivery Guy role
    const [roles] = await sequelize.query('SELECT r.name FROM model_has_roles mr JOIN roles r ON mr.role_id = r.id WHERE mr.model_id = ?', { replacements: [user.id] });
    if (!roles.length || roles[0].name !== 'Delivery Guy') {
      return res.status(201).json({ success: false, data: 'DONOTMATCH' });
    }
    // Check if approved
    if (!user.is_active) {
      return res.json({ success: false, message: 'Tu cuenta aún no ha sido aprobada por el administrador.' });
    }
    const token = generateToken(user);
    await user.update({ auth_token: token });
    res.json({ success: true, data: { id: user.id, auth_token: token, name: user.name, phone: user.phone, delivery_guy_detail: user.delivery_guy_detail } });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.deliveryRegister = async (req, res) => {
  try {
    const { name, email, phone, password, vehicle_number } = req.body;
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

exports.getDeliveryOrders = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userId = req.user.id;

    // Get delivery radius setting
    const [radiusSetting] = await sequelize.query("SELECT `value` FROM settings WHERE `key` = 'deliveryRadius' LIMIT 1");
    const maxRadius = radiusSetting.length ? parseFloat(radiusSetting[0].value) : 10;

    // Get ignored order IDs for this delivery guy
    const [ignored] = await sequelize.query('SELECT order_id FROM delivery_ignored_orders WHERE user_id = ?', { replacements: [userId] });
    const ignoredIds = ignored.map(i => i.order_id);

    // Get orders waiting for delivery assignment
    const orders = await Order.findAll({
      where: { orderstatus_id: 2, delivery_type: 1 },
      include: [{ association: 'restaurant' }, { association: 'orderitems' }],
      order: [['id', 'DESC']],
    });

    // Filter by distance and ignored
    const { getDistance } = require('../helpers/utils');
    const filtered = orders.filter(o => {
      if (ignoredIds.includes(o.id)) return false;
      if (!latitude || !longitude || !o.restaurant) return true;
      const dist = getDistance(parseFloat(latitude), parseFloat(longitude), parseFloat(o.restaurant.latitude), parseFloat(o.restaurant.longitude));
      return dist <= maxRadius;
    });

    res.json(filtered);
  } catch (err) {
    console.error('getDeliveryOrders error:', err.message);
    res.status(500).json([]);
  }
};

exports.getSingleDeliveryOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.body.order_id, { include: [{ association: 'restaurant' }, { association: 'orderitems', include: [{ association: 'order_item_addons' }] }] });
    if (!order) return res.json(null);
    const result = order.toJSON();
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
    await DeliveryGuyDetail.update({ latitude: req.body.latitude, longitude: req.body.longitude, heading: req.body.heading }, { where: { user_id: req.user.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getDeliveryGuyGpsLocation = async (req, res) => {
  try {
    let userId = req.body.delivery_guy_id;
    if (!userId && req.body.order_id) {
      const accept = await AcceptDelivery.findOne({ where: { order_id: req.body.order_id } });
      if (accept) userId = accept.user_id;
    }
    if (!userId) return res.json(null);
    const detail = await DeliveryGuyDetail.findOne({ where: { user_id: userId } });
    res.json(detail ? { delivery_lat: detail.latitude, delivery_long: detail.longitude, heading: detail.heading } : null);
  } catch (err) {
    res.status(500).json(null);
  }
};

exports.acceptToDeliver = async (req, res) => {
  try {
    const existing = await AcceptDelivery.findOne({ where: { order_id: req.body.order_id } });
    if (existing) return res.json({ success: false, message: 'Already accepted' });
    await AcceptDelivery.create({ order_id: req.body.order_id, user_id: req.user.id });
    await Order.update({ orderstatus_id: 3 }, { where: { id: req.body.order_id } });

    // Notify customer
    const order = await Order.findByPk(req.body.order_id);
    if (order) {
      const { notifyCustomerDeliveryAccepted } = require('../helpers/notifications');
      await notifyCustomerDeliveryAccepted(order);
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
    await Order.update({ orderstatus_id: 4 }, { where: { id: req.body.order_id } });

    // Notify customer order is on the way
    const order = await Order.findByPk(req.body.order_id);
    if (order) {
      const { notifyCustomerOrderOnWay } = require('../helpers/notifications');
      await notifyCustomerOrderOnWay(order);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.deliverOrder = async (req, res) => {
  try {
    await Order.update({ orderstatus_id: 5 }, { where: { id: req.body.order_id } });

    // Calculate and save delivery earning
    const order = await Order.findByPk(req.body.order_id);
    const [dgDetails] = await sequelize.query('SELECT commission_type, fixed_commission, commission_rate, percentage_base FROM delivery_guy_details WHERE user_id = ?', { replacements: [req.user.id] });
    if (dgDetails[0] && order) {
      let earning = 0;
      const dg = dgDetails[0];
      if (dg.commission_type === 'percentage') {
        const base = dg.percentage_base === 'delivery_charge' ? parseFloat(order.delivery_charge || 0) : parseFloat(order.sub_total || order.total);
        earning = base * parseFloat(dg.commission_rate) / 100;
      } else {
        earning = parseFloat(dg.fixed_commission || 0);
      }
      if (earning > 0) {
        await sequelize.query('INSERT INTO delivery_earnings (user_id, order_id, amount, commission_type) VALUES (?,?,?,?)', { replacements: [req.user.id, order.id, earning, dg.commission_type || 'fixed'] });
      }
    }

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
    const { order_id } = req.body;
    const [messages] = await sequelize.query('SELECT * FROM chats WHERE order_id = ? ORDER BY created_at ASC', { replacements: [order_id] });
    res.json(messages);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.sendChatMessage = async (req, res) => {
  try {
    const { order_id, message } = req.body;
    await sequelize.query('INSERT INTO chats (order_id, sender_id, message, created_at) VALUES (?, ?, ?, NOW())', { replacements: [order_id, req.user.id, message] });

    // Send push notification to the other party
    const order = await Order.findByPk(order_id);
    if (order) {
      const { sendPushNotification } = require('../helpers/notifications');
      const accept = await AcceptDelivery.findOne({ where: { order_id } });
      if (req.user.id === order.user_id && accept) {
        // Customer sent message -> notify delivery guy
        await sendPushNotification('Nuevo mensaje', message, accept.user_id, null, { order_id, unique_order_id: order.unique_order_id, type: 'chat' });
      } else if (accept && req.user.id === accept.user_id) {
        // Delivery sent message -> notify customer
        await sendPushNotification('Mensaje del repartidor', message, order.user_id, null, { order_id, unique_order_id: order.unique_order_id, type: 'chat' });
      }
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
