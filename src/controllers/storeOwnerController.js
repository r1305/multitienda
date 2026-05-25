const bcrypt = require('bcryptjs');
const { User, Order, Orderitem, OrderItemAddon, Item, ItemCategory, Restaurant, Rating, sequelize } = require('../models');
const { generateToken } = require('../middleware/auth');
const { Op } = require('sequelize');

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
    res.status(500).json({ success: false, data: err.message });
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
    const newStatus = restaurant.is_active ? 0 : 1;
    await sequelize.query('UPDATE restaurants SET is_active = ? WHERE id = ?', { replacements: [newStatus, restaurant.id] });
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });

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

exports.getSingleOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.body.order_id, {
      include: [{ association: 'orderitems', include: [{ association: 'order_item_addons' }] }],
    });
    res.json(order);
  } catch (err) {
    res.status(500).json(null);
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    await Order.update({ orderstatus_id: 6 }, { where: { id: req.body.order_id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    await Order.update({ orderstatus_id: 2 }, { where: { id: req.body.order_id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.markSelfpickupOrderReady = async (req, res) => {
  try {
    await Order.update({ orderstatus_id: 7 }, { where: { id: req.body.order_id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.markSelfpickupOrderCompleted = async (req, res) => {
  try {
    await Order.update({ orderstatus_id: 5 }, { where: { id: req.body.order_id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.confirmScheduledOrder = async (req, res) => {
  try {
    await Order.update({ orderstatus_id: 11 }, { where: { id: req.body.order_id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getMenu = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });

    const [items] = await sequelize.query('SELECT * FROM items WHERE restaurant_id = ? ORDER BY name', { replacements: [restaurant.id] });
    res.json(items);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.toggleItemStatus = async (req, res) => {
  try {
    const item = await Item.findByPk(req.body.item_id);
    if (!item) return res.json({ success: false });
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
    const items = await Item.findAll({ where: { restaurant_id: restaurant.id, name: { [Op.like]: `%${req.body.q}%` } } });
    res.json(items);
  } catch (err) {
    res.status(500).json([]);
  }
};

exports.editItem = async (req, res) => {
  try {
    const item = await Item.findByPk(req.body.item_id);
    res.json(item);
  } catch (err) {
    res.status(500).json(null);
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { item_id, name, price, description } = req.body;
    await Item.update({ name, price, description }, { where: { id: item_id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getPastOrders = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json([]);
    const orders = await Order.findAll({
      where: { restaurant_id: restaurant.id, orderstatus_id: { [Op.in]: [5, 6] } },
      order: [['id', 'DESC']], limit: 20,
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
      where: { restaurant_id: restaurant.id, unique_order_id: { [Op.like]: `%${req.body.q}%` } },
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

exports.getEarnings = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const { RestaurantEarning } = require('../models');
    const earnings = await RestaurantEarning.findAll({ where: { restaurant_id: restaurant.id }, order: [['id', 'DESC']] });
    res.json({ success: true, earnings });
  } catch (err) {
    res.status(500).json({ success: false });
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

exports.toggleCategoryStatus = async (req, res) => {
  try {
    const cat = await ItemCategory.findByPk(req.body.category_id);
    if (!cat) return res.json({ success: false });
    await cat.update({ is_enabled: !cat.is_enabled });
    res.json({ success: true, is_enabled: cat.is_enabled });
  } catch (err) {
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
    let startDate, endDate = new Date();

    if (filter === 'month') {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    } else if (filter === 'custom' && from && to) {
      startDate = new Date(from);
      endDate = new Date(to + 'T23:59:59');
    } else {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const [rows] = await sequelize.query(
      'SELECT DATE(created_at) as day, SUM(total) as earnings, COUNT(*) as cnt FROM orders WHERE orderstatus_id = 5 AND restaurant_id = ? AND created_at >= ? AND created_at <= ? GROUP BY DATE(created_at) ORDER BY day ASC',
      { replacements: [restaurant.id, startDate, endDate] }
    );

    const labels = [];
    const values = [];
    let total = 0;
    let orderCount = 0;

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayStr = current.toISOString().split('T')[0];
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
