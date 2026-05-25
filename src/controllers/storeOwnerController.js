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
    if (!order) return res.json(null);
    const result = order.toJSON();
    // Fill empty item names from items table
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
    console.error('getSingleOrder error:', err.message);
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

exports.createItem = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user.id);
    if (!restaurant) return res.status(403).json({ success: false });
    const { name, price, old_price, description, is_recommended, item_category_id, addon_category_ids } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const [result, meta] = await sequelize.query(
      'INSERT INTO items (name, price, old_price, description, is_recommended, image, item_category_id, restaurant_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())',
      { replacements: [name, price, old_price || 0, description || '', is_recommended ? 1 : 0, image, item_category_id || null, restaurant.id] }
    );
    const itemId = meta;
    if (addon_category_ids) {
      const ids = typeof addon_category_ids === 'string' ? JSON.parse(addon_category_ids) : addon_category_ids;
      for (const acId of ids) { await sequelize.query('INSERT IGNORE INTO addon_category_item (addon_category_id, item_id) VALUES (?,?)', { replacements: [acId, itemId] }); }
    }
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
    const image = req.file ? '/uploads/' + req.file.filename : null;
    if (image) {
      await sequelize.query(
        'UPDATE items SET name=?, price=?, old_price=?, description=?, is_recommended=?, image=?, item_category_id=?, updated_at=NOW() WHERE id=? AND restaurant_id=?',
        { replacements: [name, price, old_price || 0, description || '', is_recommended ? 1 : 0, image, item_category_id || null, item_id, restaurant.id] }
      );
    } else {
      await sequelize.query(
        'UPDATE items SET name=?, price=?, old_price=?, description=?, is_recommended=?, item_category_id=?, updated_at=NOW() WHERE id=? AND restaurant_id=?',
        { replacements: [name, price, old_price || 0, description || '', is_recommended ? 1 : 0, item_category_id || null, item_id, restaurant.id] }
      );
    }
    // Update addon category links
    await sequelize.query('DELETE FROM addon_category_item WHERE item_id = ?', { replacements: [item_id] });
    if (addon_category_ids) {
      const ids = typeof addon_category_ids === 'string' ? JSON.parse(addon_category_ids) : addon_category_ids;
      for (const acId of ids) { await sequelize.query('INSERT IGNORE INTO addon_category_item (addon_category_id, item_id) VALUES (?,?)', { replacements: [acId, item_id] }); }
    }
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
