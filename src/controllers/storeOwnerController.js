const bcrypt = require('bcryptjs');
const { User, Order, Orderitem, OrderItemAddon, Item, ItemCategory, Restaurant, Rating, sequelize } = require('../models');
const { generateToken } = require('../middleware/auth');
const { Op, QueryTypes } = require('sequelize');
const rules = require('../helpers/orderRules');
const states = require('../helpers/orderStates');
const { cancelOrderWithRefund } = require('../helpers/orderCancel');
const { emitOrderEvent } = require('../helpers/orderEvents');
const { releaseDueScheduledOrders } = require('../helpers/scheduledOrders');
const { escapeLike } = require('../helpers/utils');

exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ where: { email: req.body.email } });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(201).json({ success: false, data: 'DONOTMATCH' });
    }
    const token = generateToken(user);
    await user.update({ auth_token: token });

    const restaurant = await Restaurant.findOne({
      include: [{ model: User, as: 'owners', where: { id: user.id }, required: true, through: { attributes: [] } }],
    }).catch(() => null);

    res.json({ success: true, data: { id: user.id, auth_token: token, name: user.name, email: user.email, restaurant } });
  } catch (err) {
    console.error('storeOwner login error:', err.message);
    res.status(500).json({ success: false, data: 'Error al iniciar sesión' });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [[{ todayOrders }]] = await sequelize.query('SELECT COUNT(*) as todayOrders FROM orders WHERE restaurant_id = ? AND created_at >= ?', { replacements: [restaurant.id, today] });
    const [[{ pendingOrders }]] = await sequelize.query('SELECT COUNT(*) as pendingOrders FROM orders WHERE restaurant_id = ? AND orderstatus_id = 1', { replacements: [restaurant.id] });
    const [[{ todayEarnings }]] = await sequelize.query('SELECT COALESCE(SUM(total), 0) as todayEarnings FROM orders WHERE restaurant_id = ? AND orderstatus_id = 5 AND created_at >= ?', { replacements: [restaurant.id, today] });

    res.json({ success: true, store: restaurant, stats: { todayOrders, pendingOrders, todayEarnings: parseFloat(todayEarnings) } });
  } catch (err) {
    console.error('Store owner dashboard error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.toggleStoreStatus = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    // Si el administrador deshabilitó la tienda (is_accepted = 0), el dueño no puede reabrirla
    if (!restaurant.is_accepted) {
      return res.status(403).json({ success: false, message: 'Tu tienda fue deshabilitada por el administrador' });
    }
    const newStatus = restaurant.is_active ? 0 : 1;
    await sequelize.query('UPDATE restaurants SET is_active = ? WHERE id = ?', { replacements: [newStatus, restaurant.id] });
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    console.error('toggleStoreStatus error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await releaseDueScheduledOrders();

    const orders = await Order.findAll({
      where: { restaurant_id: restaurant.id, orderstatus_id: { [Op.in]: [1, 2, 3, 4, 7, 10, 11] } },
      include: [{ association: 'orderitems', include: [{ association: 'order_item_addons' }] }],
      order: [['id', 'DESC']],
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json([]);
  }
};

function sendStateError(err, res) {
  if (err instanceof states.OrderStateError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  console.error('Store owner order error:', err.message);
  return res.status(500).json({ success: false });
}

async function findOwnedOrder(orderId, restaurantId) {
  const id = rules.toPositiveId(orderId);
  if (!id) return null;
  return Order.findOne({ where: { id, restaurant_id: restaurantId } });
}

exports.getSingleOrder = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json(null);
    const orderId = rules.toPositiveId(req.body && req.body.order_id);
    if (!orderId) return res.json(null);
    const order = await Order.findOne({
      where: { id: orderId, restaurant_id: restaurant.id },
      include: [{ association: 'orderitems', include: [{ association: 'order_item_addons' }] }],
    });
    if (!order) return res.json(null);
    const result = order.toJSON();
    // Fill empty item names from items table
    if (result.orderitems && result.orderitems.length) {
      for (let oi of result.orderitems) {
        if (!oi.name && oi.item_id) {
          const [rows] = await sequelize.query('SELECT name, price FROM items WHERE id = ? AND restaurant_id = ?', { replacements: [oi.item_id, restaurant.id] });
          if (rows[0]) { oi.name = rows[0].name; if (!parseFloat(oi.price)) oi.price = rows[0].price; }
        }
      }
    }
    res.json(result);
  } catch (err) {
    console.error('getSingleOrder error:', err.message);
    res.status(500).json(null);
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const orderId = rules.toPositiveId(req.body && req.body.order_id);
    if (!orderId) return res.status(404).json({ success: false, message: 'Order not found' });
    const { order, refund } = await cancelOrderWithRefund({ orderId, actor: 'store', scope: { restaurant_id: restaurant.id } });
    await emitOrderEvent('cancelled', order);
    res.json({ success: true, refund });
  } catch (err) {
    sendStateError(err, res);
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const order = await findOwnedOrder(req.body && req.body.order_id, restaurant.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    await states.transition(order, [states.STATUS.PENDING], states.STATUS.ACCEPTED, 'store', null, { where: { restaurant_id: restaurant.id } });
    await emitOrderEvent('accepted', order);
    res.json({ success: true });
  } catch (err) {
    sendStateError(err, res);
  }
};

exports.markSelfpickupOrderReady = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const order = await findOwnedOrder(req.body && req.body.order_id, restaurant.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (Number(order.delivery_type) !== 2) {
      return res.status(409).json({ success: false, message: 'El pedido no es de recojo en tienda' });
    }
    await states.transition(order, [states.STATUS.ACCEPTED], states.STATUS.SELFPICKUP_READY, 'store', null, { where: { restaurant_id: restaurant.id } });
    res.json({ success: true });
  } catch (err) {
    sendStateError(err, res);
  }
};

exports.markSelfpickupOrderCompleted = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const order = await findOwnedOrder(req.body && req.body.order_id, restaurant.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (Number(order.delivery_type) !== 2) {
      return res.status(409).json({ success: false, message: 'El pedido no es de recojo en tienda' });
    }
    await states.transition(order, [states.STATUS.SELFPICKUP_READY], states.STATUS.DELIVERED, 'store', null, { where: { restaurant_id: restaurant.id } });
    await emitOrderEvent('delivered', order);
    res.json({ success: true });
  } catch (err) {
    sendStateError(err, res);
  }
};

exports.confirmScheduledOrder = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const order = await findOwnedOrder(req.body && req.body.order_id, restaurant.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    await states.transition(order, [states.STATUS.SCHEDULED_PENDING], states.STATUS.SCHEDULED_CONFIRMED, 'store', null, { where: { restaurant_id: restaurant.id } });
    await emitOrderEvent('scheduled_confirmed', order);
    // Si la hora ya llegó, se libera de inmediato a los repartidores
    await releaseDueScheduledOrders({ force: true });
    res.json({ success: true });
  } catch (err) {
    sendStateError(err, res);
  }
};


exports.getMenu = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });

    const [items] = await sequelize.query('SELECT * FROM items WHERE restaurant_id = ? ORDER BY name', { replacements: [restaurant.id] });
    // Load addon category ids for each item
    for (let item of items) {
      const [links] = await sequelize.query('SELECT addon_category_id FROM addon_category_item WHERE item_id = ?', { replacements: [item.id] });
      item.addon_category_ids = links.map(l => l.addon_category_id);
    }
    res.json(items);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.toggleItemStatus = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const item = await Item.findByPk(req.body.item_id);
    if (!item || item.restaurant_id !== restaurant.id) return res.json({ success: false });
    await item.update({ is_active: !item.is_active });
    res.json({ success: true, is_active: item.is_active });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.searchItems = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const items = await Item.findAll({ where: { restaurant_id: restaurant.id, name: { [Op.like]: `%${escapeLike(req.body.q)}%` } } });
    res.json(items);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.editItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json(null);
    const item = await Item.findByPk(req.body.item_id);
    if (!item || item.restaurant_id !== restaurant.id) return res.json(null);
    res.json(item);
  } catch (err) {
    res.status(500).json(null);
  }
};

exports.getPastOrders = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const orders = await Order.findAll({
      where: { restaurant_id: restaurant.id, orderstatus_id: { [Op.in]: [5, 6] } },
      include: [{ association: 'orderitems' }],
      order: [['id', 'DESC']], limit: 50,
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.searchOrders = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const orders = await Order.findAll({
      where: { restaurant_id: restaurant.id, unique_order_id: { [Op.like]: `%${escapeLike(req.body.q)}%` } },
      order: [['id', 'DESC']], limit: 10,
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.getRatings = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const ratings = await Rating.findAll({ where: { restaurant_id: restaurant.id }, order: [['id', 'DESC']] });
    res.json(ratings);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.sendPayoutRequest = async (req, res) => {
  try {
    res.json({ success: true, message: 'Payout request sent' });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getInactiveItems = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const items = await Item.findAll({ where: { restaurant_id: restaurant.id, is_active: 0 } });
    res.json(items);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.getStorePage = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    res.json({ success: true, restaurant });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.updateStore = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const { name, description, address, latitude, longitude, delivery_time, price_range, restaurant_charges, delivery_charges, delivery_charge_type, base_delivery_charge, base_delivery_distance, extra_delivery_charge, extra_delivery_distance, delivery_radius, min_order_price, free_delivery_subtotal, delivery_type, auto_acceptable, is_schedulable } = req.body;
    // Cargos y distancias: no negativos; la distancia extra debe ser > 0 (se usa como divisor)
    const camposNoNegativos = { restaurant_charges, delivery_charges, base_delivery_charge, base_delivery_distance, extra_delivery_charge, delivery_radius, min_order_price, free_delivery_subtotal };
    for (const [campo, valor] of Object.entries(camposNoNegativos)) {
      if (valor === undefined || valor === null || valor === '') continue;
      const n = Number(valor);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(422).json({ success: false, message: `El valor de ${campo} no puede ser negativo` });
      }
    }
    if (extra_delivery_distance !== undefined && extra_delivery_distance !== null && extra_delivery_distance !== '') {
      const d = Number(extra_delivery_distance);
      if (!Number.isFinite(d) || d <= 0) {
        return res.status(422).json({ success: false, message: 'La distancia extra de entrega debe ser mayor que 0' });
      }
    }
    const image = req.file ? '/uploads/' + req.file.filename : null;
    let sql = `UPDATE restaurants SET name=?, description=?, address=?, latitude=?, longitude=?, delivery_time=?, price_range=?, restaurant_charges=?, delivery_charges=?, delivery_charge_type=?, base_delivery_charge=?, base_delivery_distance=?, extra_delivery_charge=?, extra_delivery_distance=?, delivery_radius=?, min_order_price=?, free_delivery_subtotal=?, delivery_type=?, auto_acceptable=?, is_schedulable=?, updated_at=NOW()`;
    const params = [name || restaurant.name, description || '', address || '', latitude || restaurant.latitude, longitude || restaurant.longitude, delivery_time || '', price_range || '', restaurant_charges || 0, delivery_charges || 0, delivery_charge_type || 'FIXED', base_delivery_charge || 0, base_delivery_distance || 0, extra_delivery_charge || 0, extra_delivery_distance || restaurant.extra_delivery_distance || 1, delivery_radius || 0, min_order_price || 0, free_delivery_subtotal || 0, delivery_type || 1, auto_acceptable ? 1 : 0, is_schedulable ? 1 : 0];
    if (image) { sql += ', image=?'; params.push(image); }
    sql += ' WHERE id=?';
    params.push(restaurant.id);
    await sequelize.query(sql, { replacements: params });
    res.json({ success: true });
  } catch (err) {
    console.error('updateStore error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.toggleCategoryStatus = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const cat = await ItemCategory.findOne({ where: { id: req.body.category_id, restaurant_id: restaurant.id } });
    if (!cat) return res.json({ success: false });
    await cat.update({ is_enabled: !cat.is_enabled });
    res.json({ success: true, is_enabled: cat.is_enabled });
  } catch (err) {
    console.error('toggleCategoryStatus error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.getAllLanguage = async (req, res) => {
  try {
    const { Translation } = require('../models');
    const langs = await Translation.findAll({ where: { is_active: 1 }, attributes: ['id', 'language_name', 'language_code', 'is_default'] });
    const result = langs.map(l => ({ ...l.toJSON(), is_default: l.is_default ? 1 : 0 }));
    res.json(result);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.getSingleLanguage = async (req, res) => {
  try {
    const { Translation } = require('../models');
    const lang = await Translation.findOne({ where: { language_code: req.params.language_code } });
    res.json(lang);
  } catch (err) {
    res.status(500).json(null);
  }
};

// Helper
async function getOwnerRestaurant(userId) {
  const [rows] = await sequelize.query(
    'SELECT r.* FROM restaurants r JOIN restaurant_user ru ON ru.restaurant_id = r.id WHERE ru.user_id = ? LIMIT 1',
    { replacements: [userId] }
  );
  return rows[0] || null;
}

exports.getEarnings = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ labels: [], values: [], total: 0, orderCount: 0 });

    const { filter, from, to } = req.query || {};
    let startStr, endStr;
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

    if (filter === 'month') {
      const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      startStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      endStr = todayStr;
    } else if (filter === 'custom' && from && to) {
      startStr = from;
      endStr = to;
    } else {
      const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      startStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      endStr = todayStr;
    }

    const [rows] = await sequelize.query(
      'SELECT DATE(created_at) as day, SUM(total) as earnings, COUNT(*) as cnt FROM orders WHERE orderstatus_id = 5 AND restaurant_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ? GROUP BY DATE(created_at) ORDER BY day ASC',
      { replacements: [restaurant.id, startStr, endStr] }
    );

    const labels = [];
    const values = [];
    let total = 0;
    let orderCount = 0;

    // Generate days from startStr to endStr
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const current = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    while (current <= end) {
      const dayStr = current.getFullYear() + '-' + String(current.getMonth()+1).padStart(2,'0') + '-' + String(current.getDate()).padStart(2,'0');
      labels.push(current.toLocaleDateString('es', { day: 'numeric', month: 'short' }));
      const found = rows.find(r => r.day === dayStr);
      const val = found ? parseFloat(found.earnings) : 0;
      values.push(val);
      total += val;
      if (found) orderCount += parseInt(found.cnt);
      current.setDate(current.getDate() + 1);
    }

    res.json({ labels, values, total, orderCount });
  } catch (err) {
    res.status(500).json({ labels: [], values: [], total: 0, orderCount: 0 });
  }
};

// Valida que la categoría de ítem y las categorías de complementos pertenezcan a la tienda del dueño.
function parseIdList(raw) {
  let ids = raw;
  if (typeof raw === 'string') {
    try { ids = JSON.parse(raw); } catch (_) { return null; }
  }
  if (ids == null || ids === '') return [];
  if (!Array.isArray(ids)) return null;
  const out = [];
  for (const v of ids) {
    const n = rules.toPositiveId(v);
    if (!n) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

async function resolveOwnedCategories(restaurantId, itemCategoryId, rawAddonIds) {
  let itemCategory = null;
  if (itemCategoryId !== undefined && itemCategoryId !== null && itemCategoryId !== '') {
    itemCategory = rules.toPositiveId(itemCategoryId);
    if (!itemCategory) return { ok: false, message: 'Categoría de producto inválida' };
    const [rows] = await sequelize.query('SELECT id FROM item_categories WHERE id = ? AND restaurant_id = ?', { replacements: [itemCategory, restaurantId] });
    if (!rows.length) return { ok: false, message: 'La categoría de producto no pertenece a tu tienda' };
  }
  const addonIds = parseIdList(rawAddonIds);
  if (addonIds === null) return { ok: false, message: 'Categorías de complementos inválidas' };
  if (addonIds.length) {
    const [rows] = await sequelize.query('SELECT id FROM addon_categories WHERE id IN (?) AND restaurant_id = ?', { replacements: [addonIds, restaurantId] });
    if (rows.length !== addonIds.length) return { ok: false, message: 'Una categoría de complementos no pertenece a tu tienda' };
  }
  return { ok: true, itemCategory, addonIds };
}

exports.createItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const { name, price, old_price, description, is_recommended, item_category_id, addon_category_ids } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const owned = await resolveOwnedCategories(restaurant.id, item_category_id, addon_category_ids);
    if (!owned.ok) return res.status(403).json({ success: false, message: owned.message });

    await sequelize.transaction(async (t) => {
      const inserted = await sequelize.query(
        'INSERT INTO items (name, price, old_price, description, is_recommended, image, item_category_id, restaurant_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())',
        { replacements: [name, price, old_price || 0, description || '', is_recommended ? 1 : 0, image, owned.itemCategory, restaurant.id], type: QueryTypes.INSERT, transaction: t }
      );
      const itemId = rules.toPositiveId(Array.isArray(inserted) ? inserted[0] : inserted);
      if (!itemId) throw new Error('No se obtuvo el id del ítem creado');
      for (const acId of owned.addonIds) {
        await sequelize.query('INSERT IGNORE INTO addon_category_item (addon_category_id, item_id) VALUES (?,?)', { replacements: [acId, itemId], transaction: t });
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('createItem error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const { item_id, name, price, old_price, description, is_recommended, item_category_id, addon_category_ids } = req.body;
    const itemId = rules.toPositiveId(item_id);
    if (!itemId) return res.status(400).json({ success: false });
    const image = req.file ? '/uploads/' + req.file.filename : null;

    const [own] = await sequelize.query('SELECT id FROM items WHERE id = ? AND restaurant_id = ?', { replacements: [itemId, restaurant.id] });
    if (!own.length) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    const owned = await resolveOwnedCategories(restaurant.id, item_category_id, addon_category_ids);
    if (!owned.ok) return res.status(403).json({ success: false, message: owned.message });

    await sequelize.transaction(async (t) => {
      if (image) {
        await sequelize.query(
          'UPDATE items SET name=?, price=?, old_price=?, description=?, is_recommended=?, image=?, item_category_id=?, updated_at=NOW() WHERE id=? AND restaurant_id=?',
          { replacements: [name, price, old_price || 0, description || '', is_recommended ? 1 : 0, image, owned.itemCategory, itemId, restaurant.id], transaction: t }
        );
      } else {
        await sequelize.query(
          'UPDATE items SET name=?, price=?, old_price=?, description=?, is_recommended=?, item_category_id=?, updated_at=NOW() WHERE id=? AND restaurant_id=?',
          { replacements: [name, price, old_price || 0, description || '', is_recommended ? 1 : 0, owned.itemCategory, itemId, restaurant.id], transaction: t }
        );
      }
      await sequelize.query(
        'DELETE FROM addon_category_item WHERE item_id = ? AND item_id IN (SELECT id FROM items WHERE restaurant_id = ?)',
        { replacements: [itemId, restaurant.id], transaction: t }
      );
      for (const acId of owned.addonIds) {
        await sequelize.query('INSERT IGNORE INTO addon_category_item (addon_category_id, item_id) VALUES (?,?)', { replacements: [acId, itemId], transaction: t });
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('updateItem error:', err.message);
    res.status(500).json({ success: false });
  }
};


exports.deleteItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('DELETE FROM items WHERE id=? AND restaurant_id=?', { replacements: [req.body.item_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// Categories CRUD for store owner
exports.getCategories = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const [categories] = await sequelize.query('SELECT * FROM item_categories WHERE restaurant_id = ? ORDER BY name', { replacements: [restaurant.id] });
    res.json(categories);
  } catch (err) { res.status(500).json([]); }
};

exports.createCategory = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('INSERT INTO item_categories (name, restaurant_id, is_enabled, created_at, updated_at) VALUES (?,?,1,NOW(),NOW())', { replacements: [req.body.name, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.updateCategory = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('UPDATE item_categories SET name=?, updated_at=NOW() WHERE id=? AND restaurant_id=?', { replacements: [req.body.name, req.body.category_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.deleteCategory = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('DELETE FROM item_categories WHERE id=? AND restaurant_id=?', { replacements: [req.body.category_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

// Addons CRUD for store owner
exports.getAddons = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const [addons] = await sequelize.query('SELECT ac.*, (SELECT COUNT(*) FROM addons WHERE addon_category_id = ac.id) as addons_count FROM addon_categories ac WHERE ac.restaurant_id = ? ORDER BY ac.name', { replacements: [restaurant.id] });
    res.json(addons);
  } catch (err) { res.status(500).json([]); }
};

exports.createAddon = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('INSERT INTO addon_categories (name, type, restaurant_id, created_at, updated_at) VALUES (?,?,?,NOW(),NOW())', { replacements: [req.body.name, req.body.type || 'SINGLE', restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.updateAddon = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('UPDATE addon_categories SET name=?, type=?, updated_at=NOW() WHERE id=? AND restaurant_id=?', { replacements: [req.body.name, req.body.type || 'SINGLE', req.body.addon_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.deleteAddon = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('DELETE FROM addons WHERE addon_category_id = ? AND addon_category_id IN (SELECT id FROM addon_categories WHERE restaurant_id = ?)', { replacements: [req.body.addon_id, restaurant.id] });
    await sequelize.query('DELETE FROM addon_categories WHERE id=? AND restaurant_id=?', { replacements: [req.body.addon_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

// Addon items (individual options within an addon category)
exports.getAddonItems = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const [items] = await sequelize.query(
      'SELECT a.* FROM addons a JOIN addon_categories ac ON a.addon_category_id = ac.id WHERE ac.restaurant_id = ? AND a.addon_category_id = ? ORDER BY a.name',
      { replacements: [restaurant.id, req.body.addon_category_id] }
    );
    res.json(items);
  } catch (err) { res.status(500).json([]); }
};

exports.createAddonItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    // Verify addon category belongs to this restaurant
    const [ac] = await sequelize.query('SELECT id FROM addon_categories WHERE id = ? AND restaurant_id = ?', { replacements: [req.body.addon_category_id, restaurant.id] });
    if (!ac.length) return res.status(403).json({ success: false });
    await sequelize.query('INSERT INTO addons (name, price, addon_category_id, is_active, created_at, updated_at) VALUES (?,?,?,1,NOW(),NOW())', { replacements: [req.body.name, req.body.price || 0, req.body.addon_category_id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.updateAddonItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('UPDATE addons SET name=?, price=?, updated_at=NOW() WHERE id=? AND addon_category_id IN (SELECT id FROM addon_categories WHERE restaurant_id=?)', { replacements: [req.body.name, req.body.price || 0, req.body.addon_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.deleteAddonItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('DELETE FROM addons WHERE id=? AND addon_category_id IN (SELECT id FROM addon_categories WHERE restaurant_id=?)', { replacements: [req.body.addon_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

// Coupons CRUD for store owner
exports.getCoupons = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const [coupons] = await sequelize.query('SELECT c.*, (SELECT COUNT(*) FROM orders WHERE coupon_name = c.code) as used_count FROM coupons c WHERE c.restaurant_id = ? ORDER BY c.id DESC', { replacements: [restaurant.id] });
    res.json(coupons);
  } catch (err) { res.status(500).json([]); }
};

exports.createCoupon = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const { code, discount_type, discount, max_discount, min_sub_total, max_count, max_count_per_user } = req.body;
    const discountVal = Math.round(parseFloat(discount || 0) * 100) / 100;
    await sequelize.query('INSERT INTO coupons (code, discount_type, discount, max_discount, min_sub_total, max_count, max_count_per_user, restaurant_id, count, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,0,NOW(),NOW())', { replacements: [(code || '').toUpperCase(), discount_type || 'FIXED', discountVal, max_discount || 0, min_sub_total || 0, max_count || 0, max_count_per_user || 0, restaurant.id] });
    res.json({ success: true });
  } catch (err) { console.error('createCoupon error:', err.message); res.status(500).json({ success: false }); }
};

exports.updateCoupon = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const { coupon_id, code, discount_type, discount, max_discount, min_sub_total, max_count, max_count_per_user } = req.body;
    await sequelize.query('UPDATE coupons SET code=?, discount_type=?, discount=?, max_discount=?, min_sub_total=?, max_count=?, max_count_per_user=?, updated_at=NOW() WHERE id=? AND restaurant_id=?', { replacements: [(code || '').toUpperCase(), discount_type || 'FIXED', discount || 0, max_discount || 0, min_sub_total || 0, max_count || 0, max_count_per_user || 0, coupon_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    await sequelize.query('DELETE FROM coupons WHERE id=? AND restaurant_id=?', { replacements: [req.body.coupon_id, restaurant.id] });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
};
