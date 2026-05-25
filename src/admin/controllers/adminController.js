const { sequelize } = require('../../models');

exports.dashboard = async (req, res) => {
  try {
    const [[{ totalOrders }]] = await sequelize.query('SELECT COUNT(*) as totalOrders FROM orders');
    const [[{ completedOrders }]] = await sequelize.query("SELECT COUNT(*) as completedOrders FROM orders WHERE orderstatus_id = 5");
    const [[{ totalUsers }]] = await sequelize.query('SELECT COUNT(*) as totalUsers FROM users');
    const [[{ totalStores }]] = await sequelize.query('SELECT COUNT(*) as totalStores FROM restaurants');

    const [orders] = await sequelize.query(`
      SELECT o.*, u.name as user_name, r.name as restaurant_name, os.name as status_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN orderstatuses os ON o.orderstatus_id = os.id
      ORDER BY o.id DESC LIMIT 10
    `);

    const [users] = await sequelize.query(`
      SELECT u.name, r.name as role_name FROM users u
      LEFT JOIN model_has_roles mr ON u.id = mr.model_id
      LEFT JOIN roles r ON mr.role_id = r.id
      ORDER BY u.id DESC LIMIT 10
    `);

    res.render('admin/dashboard', {
      user: req.session.user,
      stats: { totalOrders, completedOrders, totalUsers, totalStores },
      orders,
      users,
      success: req.flash('success')[0],
      error: req.flash('error')[0]
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('admin/dashboard', {
      user: req.session.user,
      stats: { totalOrders: 0, completedOrders: 0, totalUsers: 0, totalStores: 0 },
      orders: [],
      users: [],
      success: null,
      error: 'Error loading dashboard'
    });
  }
};

// ==================== 1. ORDERS ====================
exports.orders = async (req, res) => {
  try {
    const [orders] = await sequelize.query(`
      SELECT o.*, u.name as user_name, r.name as restaurant_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      ORDER BY o.id DESC
    `);
    res.render('admin/orders', { user: req.session.user, orders, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/orders', { user: req.session.user, orders: [], success: null, error: 'Error loading orders' });
  }
};

exports.viewOrder = async (req, res) => {
  try {
    const [orders] = await sequelize.query(`
      SELECT o.*, u.name as user_name, u.phone as user_phone, r.name as restaurant_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      WHERE o.unique_order_id = ? OR o.id = ? LIMIT 1
    `, { replacements: [req.params.id, req.params.id] });
    const order = orders[0] || null;
    let orderitems = [], deliveryGuys = [];
    if (order) {
      [orderitems] = await sequelize.query('SELECT * FROM orderitems WHERE order_id = ?', { replacements: [order.id] });
      [deliveryGuys] = await sequelize.query(`SELECT u.id, u.name, u.phone FROM users u INNER JOIN model_has_roles mr ON u.id = mr.model_id INNER JOIN roles r ON mr.role_id = r.id WHERE r.name = 'Delivery Guy'`);
    }
    res.render('admin/viewOrder', { user: req.session.user, order, orderitems, deliveryGuys, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/viewOrder', { user: req.session.user, order: null, orderitems: [], deliveryGuys: [], success: null, error: 'Error loading order' });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    await sequelize.query('UPDATE orders SET orderstatus_id = 6 WHERE id = ?', { replacements: [req.body.order_id] });
    req.flash('success', 'Order cancelled');
  } catch (err) { req.flash('error', 'Error cancelling order'); }
  res.redirect('/admin/orders');
};

exports.acceptOrder = async (req, res) => {
  try {
    await sequelize.query('UPDATE orders SET orderstatus_id = 2 WHERE id = ?', { replacements: [req.body.id] });

    // Notify delivery guys
    const [orders] = await sequelize.query('SELECT * FROM orders WHERE id = ?', { replacements: [req.body.id] });
    if (orders[0]) {
      const { notifyDeliveryNewOrder } = require('../../helpers/notifications');
      await notifyDeliveryNewOrder(orders[0]);
    }

    req.flash('success', 'Order accepted');
  } catch (err) { req.flash('error', 'Error accepting order'); }
  res.redirect('/admin/orders');
};

exports.assignDelivery = async (req, res) => {
  try {
    await sequelize.query('UPDATE orders SET delivery_guy_id = ?, orderstatus_id = 3 WHERE id = ?', { replacements: [req.body.user_id, req.body.order_id] });
    req.flash('success', 'Delivery assigned');
  } catch (err) { req.flash('error', 'Error assigning delivery'); }
  res.redirect('/admin/order/' + req.body.order_id);
};

exports.reassignDelivery = async (req, res) => {
  try {
    await sequelize.query('UPDATE orders SET delivery_guy_id = ? WHERE id = ?', { replacements: [req.body.user_id, req.body.order_id] });
    req.flash('success', 'Delivery reassigned');
  } catch (err) { req.flash('error', 'Error reassigning delivery'); }
  res.redirect('/admin/order/' + req.body.order_id);
};

// ==================== 2. STORES ====================
exports.stores = async (req, res) => {
  try {
    const [stores] = await sequelize.query(`
      SELECT r.*, COALESCE(e.earnings, 0) as total_earnings
      FROM restaurants r
      LEFT JOIN (SELECT restaurant_id, SUM(total) as earnings FROM orders WHERE orderstatus_id = 5 GROUP BY restaurant_id) e ON e.restaurant_id = r.id
      ORDER BY r.id DESC
    `);
    res.render('admin/stores', { user: req.session.user, stores, count: stores.length, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/stores', { user: req.session.user, stores: [], count: 0, success: null, error: 'Error loading stores' });
  }
};

exports.editStore = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM restaurants WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    res.render('admin/editStore', { user: req.session.user, restaurant: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading store');
    res.redirect('/admin/stores');
  }
};

exports.createStore = async (req, res) => {
  try {
    const { name, description, address, latitude, longitude, delivery_charges, commission_rate, delivery_type } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
    await sequelize.query(
      'INSERT INTO restaurants (name, slug, description, address, latitude, longitude, delivery_charges, commission_rate, delivery_type, image, is_active, is_accepted, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,1,NOW(),NOW())',
      { replacements: [name, slug, description||'', address||'', latitude||'', longitude||'', delivery_charges||0, commission_rate||0, delivery_type||1, image] }
    );
    req.flash('success', 'Store created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating store'); }
  res.redirect('/admin/stores');
};

exports.updateStore = async (req, res) => {
  try {
    const { id, name, description, address, latitude, longitude, pincode, landmark, certificate, rating, delivery_time, price_range, restaurant_charges, delivery_charges, commission_rate, delivery_type, delivery_radius, min_order_price, old_image } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : old_image;
    const is_pureveg = req.body.is_pureveg ? 1 : 0;
    const is_featured = req.body.is_featured ? 1 : 0;
    const is_schedulable = req.body.is_schedulable ? 1 : 0;
    const auto_acceptable = req.body.auto_acceptable ? 1 : 0;
    const is_sms_notifiable = req.body.is_notifiable ? 1 : 0;
    const is_accepted = 1;
    await sequelize.query(
      `UPDATE restaurants SET name=?, description=?, address=?, latitude=?, longitude=?, pincode=?, landmark=?, certificate=?, rating=?, delivery_time=?, price_range=?, restaurant_charges=?, delivery_charges=?, commission_rate=?, delivery_type=?, delivery_radius=?, min_order_price=?, image=?, is_pureveg=?, is_featured=?, is_schedulable=?, auto_acceptable=?, is_sms_notifiable=?, is_accepted=?, updated_at=NOW() WHERE id=?`,
      { replacements: [name, description||'', address||'', latitude||'', longitude||'', pincode||'', landmark||'', certificate||'', rating||'', delivery_time||'', price_range||'', restaurant_charges||0, delivery_charges||0, commission_rate||0, delivery_type||1, delivery_radius||'', min_order_price||0, image, is_pureveg, is_featured, is_schedulable, auto_acceptable, is_sms_notifiable, is_accepted, id] }
    );
    req.flash('success', 'Store updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating store'); }
  res.redirect('/admin/stores');
};

exports.disableStore = async (req, res) => {
  try {
    await sequelize.query('UPDATE restaurants SET is_active = IF(is_active=1,0,1) WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Store status toggled');
  } catch (err) { req.flash('error', 'Error toggling store'); }
  res.redirect('/admin/stores');
};

exports.storeEarnings = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM restaurants WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    res.render('admin/storeEarnings', { user: req.session.user, store: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading store');
    res.redirect('/admin/stores');
  }
};

exports.deleteStore = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM restaurants WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Store deleted');
  } catch (err) { req.flash('error', 'Error deleting store'); }
  res.redirect('/admin/stores');
};

// ==================== 3. ITEMS ====================
exports.items = async (req, res) => {
  try {
    const [items] = await sequelize.query(`
      SELECT i.*, r.name as restaurant_name, ic.name as category_name
      FROM items i
      LEFT JOIN restaurants r ON i.restaurant_id = r.id
      LEFT JOIN item_categories ic ON i.item_category_id = ic.id
      ORDER BY i.id DESC
    `);
    const [restaurants] = await sequelize.query('SELECT id, name FROM restaurants ORDER BY name');
    const [itemCategories] = await sequelize.query('SELECT id, name FROM item_categories ORDER BY name');
    res.render('admin/items', { user: req.session.user, items, count: items.length, restaurants, itemCategories, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/items', { user: req.session.user, items: [], count: 0, restaurants: [], itemCategories: [], success: null, error: 'Error loading items' });
  }
};

exports.editItem = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM items WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    const [restaurants] = await sequelize.query('SELECT id, name FROM restaurants ORDER BY name');
    const [itemCategories] = await sequelize.query('SELECT id, name FROM item_categories ORDER BY name');
    const [addonCategories] = await sequelize.query('SELECT id, name FROM addon_categories ORDER BY name');
    const [itemAddons] = await sequelize.query('SELECT addon_category_id FROM addon_category_item WHERE item_id = ?', { replacements: [req.params.id] });
    const itemAddonIds = itemAddons.map(a => a.addon_category_id);
    res.render('admin/editItem', { user: req.session.user, item: rows[0] || null, restaurants, itemCategories, addonCategories, itemAddonIds, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading item');
    res.redirect('/admin/items');
  }
};

exports.createItem = async (req, res) => {
  try {
    const { name, restaurant_id, item_category_id, price, old_price, desc } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const is_recommended = req.body.is_recommended ? 1 : 0;
    await sequelize.query(
      'INSERT INTO items (name, restaurant_id, item_category_id, price, old_price, description, image, is_recommended, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())',
      { replacements: [name, restaurant_id, item_category_id, price, old_price||0, desc||'', image, is_recommended] }
    );
    req.flash('success', 'Item created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating item'); }
  res.redirect('/admin/items');
};

exports.updateItem = async (req, res) => {
  try {
    const { id, name, restaurant_id, item_category_id, price, old_price, desc, old_image } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : old_image;
    const is_recommended = req.body.is_recommended ? 1 : 0;
    await sequelize.query(
      'UPDATE items SET name=?, restaurant_id=?, item_category_id=?, price=?, old_price=?, description=?, image=?, is_recommended=?, updated_at=NOW() WHERE id=?',
      { replacements: [name, restaurant_id, item_category_id, price, old_price||0, desc||'', image, is_recommended, id] }
    );
    // Update addon categories
    await sequelize.query('DELETE FROM addon_category_item WHERE item_id = ?', { replacements: [id] });
    const addonCats = req.body['addon_category_item[]'] || [];
    const cats = Array.isArray(addonCats) ? addonCats : [addonCats];
    for (const acId of cats) {
      if (acId) await sequelize.query('INSERT INTO addon_category_item (addon_category_id, item_id) VALUES (?,?)', { replacements: [acId, id] });
    }
    req.flash('success', 'Item updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating item'); }
  res.redirect('/admin/items');
};

exports.disableItem = async (req, res) => {
  try {
    await sequelize.query('UPDATE items SET is_active = IF(is_active=1,0,1) WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Item status toggled');
  } catch (err) { req.flash('error', 'Error toggling item'); }
  res.redirect('/admin/items');
};

// ==================== 4. ITEM CATEGORIES ====================
exports.itemCategories = async (req, res) => {
  try {
    const [categories] = await sequelize.query(`
      SELECT ic.*, r.name as restaurant_name, (SELECT COUNT(*) FROM items WHERE item_category_id = ic.id) as items_count
      FROM item_categories ic
      LEFT JOIN restaurants r ON ic.restaurant_id = r.id
      ORDER BY ic.id DESC
    `);
    const [restaurants] = await sequelize.query('SELECT id, name FROM restaurants ORDER BY name');
    res.render('admin/itemCategories', { user: req.session.user, categories, count: categories.length, restaurants, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/itemCategories', { user: req.session.user, categories: [], count: 0, restaurants: [], success: null, error: 'Error loading categories' });
  }
};

exports.createItemCategory = async (req, res) => {
  try {
    await sequelize.query('INSERT INTO item_categories (name, restaurant_id, is_enabled, created_at, updated_at) VALUES (?,?,1,NOW(),NOW())', { replacements: [req.body.name, req.body.restaurant_id || null] });
    req.flash('success', 'Category created');
  } catch (err) { req.flash('error', 'Error creating category'); }
  res.redirect('/admin/item-categories');
};

exports.updateItemCategory = async (req, res) => {
  try {
    await sequelize.query('UPDATE item_categories SET name=?, restaurant_id=?, updated_at=NOW() WHERE id=?', { replacements: [req.body.name, req.body.restaurant_id || null, req.body.id] });
    req.flash('success', 'Category updated');
  } catch (err) { req.flash('error', 'Error updating category'); }
  res.redirect('/admin/item-categories');
};

exports.disableItemCategory = async (req, res) => {
  try {
    await sequelize.query('UPDATE item_categories SET is_enabled = IF(is_enabled=1,0,1) WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Category status toggled');
  } catch (err) { req.flash('error', 'Error toggling category'); }
  res.redirect('/admin/item-categories');
};

// ==================== 5. ADDON CATEGORIES ====================
exports.addonCategories = async (req, res) => {
  try {
    const [addonCategories] = await sequelize.query(`
      SELECT ac.*, r.name as restaurant_name, (SELECT COUNT(*) FROM addons WHERE addon_category_id = ac.id) as addons_count
      FROM addon_categories ac
      LEFT JOIN restaurants r ON ac.restaurant_id = r.id
      ORDER BY ac.id DESC
    `);
    const [restaurants] = await sequelize.query('SELECT id, name FROM restaurants ORDER BY name');
    res.render('admin/addonCategories', { user: req.session.user, addonCategories, count: addonCategories.length, restaurants, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/addonCategories', { user: req.session.user, addonCategories: [], count: 0, restaurants: [], success: null, error: 'Error loading addon categories' });
  }
};

exports.editAddonCategory = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM addon_categories WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    const [addons] = await sequelize.query('SELECT * FROM addons WHERE addon_category_id = ? ORDER BY name', { replacements: [req.params.id] });
    const [restaurants] = await sequelize.query('SELECT id, name FROM restaurants ORDER BY name');
    res.render('admin/editAddonCategory', { user: req.session.user, addonCategory: rows[0] || null, addons, restaurants, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading addon category');
    res.redirect('/admin/addon-categories');
  }
};

exports.createAddon = async (req, res) => {
  try {
    const { addon_category_id, name, price } = req.body;
    await sequelize.query('INSERT INTO addons (name, price, addon_category_id, is_active, created_at, updated_at) VALUES (?,?,?,1,NOW(),NOW())', { replacements: [name, price || 0, addon_category_id] });
    req.flash('success', 'Addon created');
  } catch (err) { req.flash('error', 'Error creating addon'); }
  res.redirect('/admin/addon-category/edit/' + req.body.addon_category_id);
};

exports.updateAddon = async (req, res) => {
  try {
    const { id, name, price, addon_category_id } = req.body;
    await sequelize.query('UPDATE addons SET name=?, price=?, updated_at=NOW() WHERE id=?', { replacements: [name, price || 0, id] });
    req.flash('success', 'Addon updated');
  } catch (err) { req.flash('error', 'Error updating addon'); }
  res.redirect('/admin/addon-category/edit/' + req.body.addon_category_id);
};

exports.deleteAddon = async (req, res) => {
  try {
    const [addon] = await sequelize.query('SELECT addon_category_id FROM addons WHERE id = ?', { replacements: [req.params.id] });
    await sequelize.query('DELETE FROM addons WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Addon deleted');
    if (addon[0]) return res.redirect('/admin/addon-category/edit/' + addon[0].addon_category_id);
  } catch (err) { req.flash('error', 'Error deleting addon'); }
  res.redirect('/admin/addon-categories');
};

exports.createAddonCategory = async (req, res) => {
  try {
    await sequelize.query('INSERT INTO addon_categories (name, type, restaurant_id, created_at, updated_at) VALUES (?,?,?,NOW(),NOW())', { replacements: [req.body.name, req.body.type || 'SINGLE', req.body.restaurant_id || null] });
    req.flash('success', 'Addon category created');
  } catch (err) { req.flash('error', 'Error creating addon category'); }
  res.redirect('/admin/addon-categories');
};

exports.updateAddonCategory = async (req, res) => {
  try {
    await sequelize.query('UPDATE addon_categories SET name=?, type=?, restaurant_id=?, updated_at=NOW() WHERE id=?', { replacements: [req.body.name, req.body.type || 'SINGLE', req.body.restaurant_id || null, req.body.id] });
    req.flash('success', 'Addon category updated');
  } catch (err) { req.flash('error', 'Error updating addon category'); }
  res.redirect('/admin/addon-categories');
};

// ==================== 6. USERS ====================
exports.users = async (req, res) => {
  try {
    const [users] = await sequelize.query(`
      SELECT u.*, r.name as role_name FROM users u
      LEFT JOIN model_has_roles mr ON u.id = mr.model_id
      LEFT JOIN roles r ON mr.role_id = r.id
      ORDER BY u.id DESC
    `);
    const [roles] = await sequelize.query('SELECT * FROM roles ORDER BY id');
    res.render('admin/users', { user: req.session.user, users, roles, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/users', { user: req.session.user, users: [], roles: [], success: null, error: 'Error loading users' });
  }
};

exports.editUser = async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT u.*, r.name as role_name FROM users u
      LEFT JOIN model_has_roles mr ON u.id = mr.model_id
      LEFT JOIN roles r ON mr.role_id = r.id
      WHERE u.id = ? LIMIT 1
    `, { replacements: [req.params.id] });
    const [roles] = await sequelize.query('SELECT * FROM roles ORDER BY id');
    const [userOrders] = await sequelize.query('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20', { replacements: [req.params.id] });
    const [addresses] = await sequelize.query('SELECT * FROM addresses WHERE user_id = ?', { replacements: [req.params.id] });
    const [[wallet]] = await sequelize.query('SELECT balance FROM wallets WHERE holder_id = ? LIMIT 1', { replacements: [req.params.id] });
    res.render('admin/editUser', { user: req.session.user, editUser: rows[0] || null, roles, walletBalance: wallet ? wallet.balance : 0, userOrders, addresses, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading user');
    res.redirect('/admin/users');
  }
};

exports.createUser = async (req, res) => {
  const bcrypt = require('bcryptjs');
  try {
    const { name, email, phone, password, role } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const [result] = await sequelize.query(
      'INSERT INTO users (name, email, phone, password, is_active, created_at, updated_at) VALUES (?,?,?,?,1,NOW(),NOW())',
      { replacements: [name, email, phone||'', hash] }
    );
    if (role) {
      const [roles] = await sequelize.query('SELECT id FROM roles WHERE name = ? LIMIT 1', { replacements: [role] });
      if (roles[0]) await sequelize.query('INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?,?,?)', { replacements: [roles[0].id, 'App\\User', result] });
    }
    req.flash('success', 'User created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating user'); }
  res.redirect('/admin/users');
};

exports.updateUser = async (req, res) => {
  const bcrypt = require('bcryptjs');
  try {
    const { id, name, email, phone, password, roles: roleName } = req.body;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await sequelize.query('UPDATE users SET name=?, email=?, phone=?, password=?, updated_at=NOW() WHERE id=?', { replacements: [name, email, phone||'', hash, id] });
    } else {
      await sequelize.query('UPDATE users SET name=?, email=?, phone=?, updated_at=NOW() WHERE id=?', { replacements: [name, email, phone||'', id] });
    }
    if (roleName) {
      await sequelize.query('DELETE FROM model_has_roles WHERE model_id = ?', { replacements: [id] });
      const [roles] = await sequelize.query('SELECT id FROM roles WHERE name = ? LIMIT 1', { replacements: [roleName] });
      if (roles[0]) await sequelize.query('INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?,?,?)', { replacements: [roles[0].id, 'App\\User', id] });
    }
    req.flash('success', 'User updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating user'); }
  res.redirect('/admin/users');
};

exports.banUser = async (req, res) => {
  try {
    await sequelize.query('UPDATE users SET is_active = IF(is_active=1,0,1) WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'User status toggled');
  } catch (err) { req.flash('error', 'Error toggling user'); }
  res.redirect('/admin/users');
};
// ==================== 7. DELIVERY GUYS ====================
exports.deliveryGuys = async (req, res) => {
  try {
    const [deliveryGuys] = await sequelize.query(`
      SELECT u.*, dgd.vehicle_number, dgd.commission_rate, dgd.commission_type, dgd.fixed_commission,
        COALESCE(de.total_earnings, 0) as total_earnings
      FROM users u
      INNER JOIN model_has_roles mr ON u.id = mr.model_id
      INNER JOIN roles r ON mr.role_id = r.id
      LEFT JOIN delivery_guy_details dgd ON u.id = dgd.user_id
      LEFT JOIN (SELECT user_id, SUM(amount) as total_earnings FROM delivery_earnings GROUP BY user_id) de ON de.user_id = u.id
      WHERE r.name = 'Delivery Guy' ORDER BY u.is_active ASC, u.id DESC
    `);
    res.render('admin/deliveryGuys', { user: req.session.user, deliveryGuys, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/deliveryGuys', { user: req.session.user, deliveryGuys: [], success: null, error: 'Error loading delivery guys' });
  }
};

exports.approveUser = async (req, res) => {
  try {
    await sequelize.query('UPDATE users SET is_active = 1 WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Repartidor aprobado');
  } catch (err) { req.flash('error', 'Error al aprobar'); }
  res.redirect('/admin/delivery-guys');
};

exports.saveDeliveryCommission = async (req, res) => {
  try {
    const { user_id, commission_type, fixed_commission, commission_rate } = req.body;
    await sequelize.query(
      'UPDATE delivery_guy_details SET commission_type=?, fixed_commission=?, commission_rate=? WHERE user_id=?',
      { replacements: [commission_type, fixed_commission || 0, commission_rate || 0, user_id] }
    );
    req.flash('success', 'Comisión actualizada');
  } catch (err) { req.flash('error', 'Error al guardar comisión'); }
  res.redirect('/admin/delivery-guys');
};

exports.deliveryGuyEarnings = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM users WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    res.render('admin/deliveryEarnings', { user: req.session.user, deliveryGuy: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading delivery guy');
    res.redirect('/admin/delivery-guys');
  }
};

// ==================== 8. STORE OWNERS ====================
exports.storeOwners = async (req, res) => {
  try {
    const [storeOwners] = await sequelize.query(`
      SELECT u.* FROM users u
      INNER JOIN model_has_roles mr ON u.id = mr.model_id
      INNER JOIN roles r ON mr.role_id = r.id
      WHERE r.name = 'Store Owner' ORDER BY u.id DESC
    `);
    res.render('admin/storeOwners', { user: req.session.user, storeOwners, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/storeOwners', { user: req.session.user, storeOwners: [], success: null, error: 'Error loading store owners' });
  }
};

exports.storeOwnerStores = async (req, res) => {
  try {
    const [owner] = await sequelize.query('SELECT * FROM users WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    const [allStores] = await sequelize.query('SELECT id, name FROM restaurants ORDER BY name');
    const [assigned] = await sequelize.query('SELECT restaurant_id FROM restaurant_user WHERE user_id = ?', { replacements: [req.params.id] });
    const assignedIds = assigned.map(a => a.restaurant_id);
    res.render('admin/storeOwnerStores', { user: req.session.user, owner: owner[0], allStores, assignedIds, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading stores');
    res.redirect('/admin/store-owners');
  }
};

exports.updateStoreOwnerStores = async (req, res) => {
  try {
    const { id } = req.params;
    await sequelize.query('DELETE FROM restaurant_user WHERE user_id = ?', { replacements: [id] });
    let stores = req.body.stores || [];
    if (!Array.isArray(stores)) stores = [stores];
    for (const storeId of stores) {
      await sequelize.query('INSERT INTO restaurant_user (user_id, restaurant_id) VALUES (?,?)', { replacements: [id, storeId] });
    }
    req.flash('success', 'Stores updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating stores'); }
  res.redirect('/admin/store-owners');
};

// ==================== 9. POPULAR GEO LOCATIONS ====================
exports.popularGeoLocations = async (req, res) => {
  try {
    const [locations] = await sequelize.query('SELECT * FROM popular_geo_places ORDER BY id DESC');
    res.render('admin/popularGeoLocations', { user: req.session.user, locations, count: locations.length, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/popularGeoLocations', { user: req.session.user, locations: [], count: 0, success: null, error: 'Error loading locations' });
  }
};

exports.createPopularGeoLocation = async (req, res) => {
  try {
    const { name, latitude, longitude } = req.body;
    await sequelize.query('INSERT INTO popular_geo_places (name, latitude, longitude, is_default, created_at, updated_at) VALUES (?,?,?,0,NOW(),NOW())', { replacements: [name, latitude, longitude] });
    req.flash('success', 'Location created');
  } catch (err) { req.flash('error', 'Error creating location'); }
  res.redirect('/admin/popular-geo-locations');
};

exports.editPopularGeoLocation = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM popular_geo_places WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    const [locations] = await sequelize.query('SELECT * FROM popular_geo_places ORDER BY id DESC');
    res.render('admin/popularGeoLocations', { user: req.session.user, locations, count: locations.length, editLocation: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading location');
    res.redirect('/admin/popular-geo-locations');
  }
};

exports.updatePopularGeoLocation = async (req, res) => {
  try {
    const { id, name, latitude, longitude } = req.body;
    await sequelize.query('UPDATE popular_geo_places SET name=?, latitude=?, longitude=?, updated_at=NOW() WHERE id=?', { replacements: [name, latitude, longitude, id] });
    req.flash('success', 'Location updated');
  } catch (err) { req.flash('error', 'Error updating location'); }
  res.redirect('/admin/popular-geo-locations');
};

exports.disablePopularGeoLocation = async (req, res) => {
  try {
    await sequelize.query('UPDATE popular_geo_places SET is_active = IF(is_active=1,0,1) WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Location status toggled');
  } catch (err) { req.flash('error', 'Error toggling location'); }
  res.redirect('/admin/popular-geo-locations');
};

exports.deletePopularGeoLocation = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM popular_geo_places WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Location deleted');
  } catch (err) { req.flash('error', 'Error deleting location'); }
  res.redirect('/admin/popular-geo-locations');
};

exports.makeDefaultPopularGeoLocation = async (req, res) => {
  try {
    await sequelize.query('UPDATE popular_geo_places SET is_default = 0');
    await sequelize.query('UPDATE popular_geo_places SET is_default = 1 WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Default location updated');
  } catch (err) { req.flash('error', 'Error setting default location'); }
  res.redirect('/admin/popular-geo-locations');
};

// ==================== 10. COUPONS ====================
exports.coupons = async (req, res) => {
  try {
    const [coupons] = await sequelize.query('SELECT * FROM coupons ORDER BY id DESC');
    res.render('admin/coupons', { user: req.session.user, coupons, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/coupons', { user: req.session.user, coupons: [], success: null, error: 'Error loading coupons' });
  }
};

exports.editCoupon = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM coupons WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    res.render('admin/editCoupon', { user: req.session.user, coupon: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading coupon');
    res.redirect('/admin/coupons');
  }
};

exports.createCoupon = async (req, res) => {
  try {
    const { name, code, discount_type, discount, count, max_count_per_user, min_subtotal, max_discount } = req.body;
    await sequelize.query(
      'INSERT INTO coupons (name, code, discount_type, discount, count, max_count_per_user, min_subtotal, max_discount, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,NOW(),NOW())',
      { replacements: [name, code.toUpperCase(), discount_type, discount, count||0, max_count_per_user||0, min_subtotal||0, max_discount||0] }
    );
    req.flash('success', 'Coupon created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating coupon'); }
  res.redirect('/admin/coupons');
};

exports.updateCoupon = async (req, res) => {
  try {
    const { id, name, code, discount_type, discount, count, max_count_per_user, min_subtotal, max_discount } = req.body;
    await sequelize.query(
      'UPDATE coupons SET name=?, code=?, discount_type=?, discount=?, count=?, max_count_per_user=?, min_subtotal=?, max_discount=?, updated_at=NOW() WHERE id=?',
      { replacements: [name, code.toUpperCase(), discount_type, discount, count||0, max_count_per_user||0, min_subtotal||0, max_discount||0, id] }
    );
    req.flash('success', 'Coupon updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating coupon'); }
  res.redirect('/admin/coupons');
};

exports.deleteCoupon = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM coupons WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Coupon deleted');
  } catch (err) { req.flash('error', 'Error deleting coupon'); }
  res.redirect('/admin/coupons');
};

// ==================== 11. PAGES ====================
exports.pages = async (req, res) => {
  try {
    const [pages] = await sequelize.query('SELECT * FROM pages ORDER BY id DESC');
    res.render('admin/pages', { user: req.session.user, pages, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/pages', { user: req.session.user, pages: [], success: null, error: 'Error loading pages' });
  }
};

exports.editPage = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM pages WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    res.render('admin/editPage', { user: req.session.user, page: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading page');
    res.redirect('/admin/pages');
  }
};

exports.createPage = async (req, res) => {
  try {
    const { name, slug, body } = req.body;
    await sequelize.query('INSERT INTO pages (name, slug, body, created_at, updated_at) VALUES (?,?,?,NOW(),NOW())', { replacements: [name, slug, body||''] });
    req.flash('success', 'Page created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating page'); }
  res.redirect('/admin/pages');
};

exports.updatePage = async (req, res) => {
  try {
    const { id, name, slug, body } = req.body;
    await sequelize.query('UPDATE pages SET name=?, slug=?, body=?, updated_at=NOW() WHERE id=?', { replacements: [name, slug, body||'', id] });
    req.flash('success', 'Page updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating page'); }
  res.redirect('/admin/pages');
};

exports.deletePage = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM pages WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Page deleted');
  } catch (err) { req.flash('error', 'Error deleting page'); }
  res.redirect('/admin/pages');
};

// ==================== 12. TRANSLATIONS ====================
exports.translations = async (req, res) => {
  try {
    const [translations] = await sequelize.query('SELECT * FROM translations ORDER BY id DESC');
    res.render('admin/translations', { user: req.session.user, translations, count: translations.length, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/translations', { user: req.session.user, translations: [], count: 0, success: null, error: 'Error loading translations' });
  }
};

exports.editTranslation = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM translations WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    const t = rows[0] || null;
    let data = null;
    if (t && t.translation_data) {
      try { data = JSON.parse(t.translation_data); } catch(e) { data = null; }
    }
    res.render('admin/editTranslation', { user: req.session.user, translation_id: t ? t.id : undefined, language_name: t ? t.language_name : '', data, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading translation');
    res.redirect('/admin/translations');
  }
};

exports.createTranslation = async (req, res) => {
  try {
    const { language_name, language_code, is_default } = req.body;
    const data = JSON.stringify({});
    await sequelize.query('INSERT INTO translations (language_name, language_code, translation_data, is_default, is_active, created_at, updated_at) VALUES (?,?,?,?,1,NOW(),NOW())', { replacements: [language_name, language_code||'', data, is_default ? 1 : 0] });
    req.flash('success', 'Translation created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating translation'); }
  res.redirect('/admin/translations');
};

exports.updateTranslation = async (req, res) => {
  try {
    const { translation_id, language_name, ...keys } = req.body;
    const data = JSON.stringify(keys);
    await sequelize.query('UPDATE translations SET language_name=?, translation_data=?, updated_at=NOW() WHERE id=?', { replacements: [language_name, data, translation_id] });
    req.flash('success', 'Translation updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating translation'); }
  res.redirect('/admin/translations');
};

exports.disableTranslation = async (req, res) => {
  try {
    await sequelize.query('UPDATE translations SET is_active = IF(is_active=1,0,1) WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Translation status toggled');
  } catch (err) { req.flash('error', 'Error toggling translation'); }
  res.redirect('/admin/translations');
};

exports.deleteTranslation = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM translations WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Translation deleted');
  } catch (err) { req.flash('error', 'Error deleting translation'); }
  res.redirect('/admin/translations');
};

exports.makeDefaultTranslation = async (req, res) => {
  try {
    await sequelize.query('UPDATE translations SET is_default = 0');
    await sequelize.query('UPDATE translations SET is_default = 1 WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Default language updated');
  } catch (err) { req.flash('error', 'Error setting default'); }
  res.redirect('/admin/translations');
};

// ==================== 13. SLIDERS ====================
exports.sliders = async (req, res) => {
  try {
    const [sliders] = await sequelize.query('SELECT * FROM promo_sliders ORDER BY id DESC');
    for (let s of sliders) {
      const [slides] = await sequelize.query('SELECT * FROM slides ORDER BY sort_position ASC');
      s.slides = slides;
    }
    res.render('admin/sliders', { user: req.session.user, sliders, count: sliders.length, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/sliders', { user: req.session.user, sliders: [], count: 0, success: null, error: 'Error loading sliders' });
  }
};

exports.editSlider = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT * FROM promo_sliders WHERE id = ? LIMIT 1', { replacements: [req.params.id] });
    const [sliders] = await sequelize.query('SELECT * FROM promo_sliders ORDER BY id DESC');
    for (let s of sliders) { s.slides = []; }
    res.render('admin/sliders', { user: req.session.user, sliders, count: sliders.length, editSlider: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading slider');
    res.redirect('/admin/promo-sliders');
  }
};

exports.createSlider = async (req, res) => {
  try {
    const { name, position_id, size } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    await sequelize.query('INSERT INTO promo_sliders (name, position_id, size, image, created_at, updated_at) VALUES (?,?,?,?,NOW(),NOW())', { replacements: [name, position_id||0, size||0, image] });
    req.flash('success', 'Slider created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating slider'); }
  res.redirect('/admin/promo-sliders');
};

exports.updateSlider = async (req, res) => {
  try {
    const { id, name, position_id, size } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    if (image) {
      await sequelize.query('UPDATE promo_sliders SET name=?, position_id=?, size=?, image=?, updated_at=NOW() WHERE id=?', { replacements: [name, position_id||0, size||0, image, id] });
    } else {
      await sequelize.query('UPDATE promo_sliders SET name=?, position_id=?, size=?, updated_at=NOW() WHERE id=?', { replacements: [name, position_id||0, size||0, id] });
    }
    req.flash('success', 'Slider updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating slider'); }
  res.redirect('/admin/promo-sliders');
};

exports.disableSlider = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM promo_sliders WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Slider removed');
  } catch (err) { req.flash('error', 'Error removing slider'); }
  res.redirect('/admin/promo-sliders');
};

exports.deleteSlider = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM slides WHERE promo_slider_id = ?', { replacements: [req.params.id] });
    await sequelize.query('DELETE FROM promo_sliders WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Slider deleted');
  } catch (err) { req.flash('error', 'Error deleting slider'); }
  res.redirect('/admin/promo-sliders');
};

// ==================== 14. NOTIFICATIONS ====================
exports.notifications = (req, res) => {
  res.render('admin/notifications', { user: req.session.user, success: req.flash('success')[0], error: req.flash('error')[0] });
};

exports.sendNotification = async (req, res) => {
  try {
    const { title, message, image, type, user_ids } = req.body;
    const { sendPushNotification, saveNotification } = require('../../helpers/notifications');

    if (type === 'specific' && user_ids) {
      const ids = user_ids.split(',').map(id => id.trim()).filter(Boolean);
      for (const uid of ids) {
        await sendPushNotification(title, message, uid);
        await saveNotification(uid, title, message);
      }
    } else {
      await sendPushNotification(title, message, null, null, image ? { image } : {});
    }
    req.flash('success', 'Notificación enviada correctamente');
  } catch (err) {
    console.error('Send notification error:', err);
    req.flash('error', 'Error al enviar la notificación: ' + err.message);
  }
  res.redirect('/admin/notifications');
};

// ==================== 15. STORE PAYOUTS ====================
exports.storePayouts = async (req, res) => {
  try {
    const [payouts] = await sequelize.query(`
      SELECT sp.*, r.name as restaurant_name FROM store_payouts sp
      LEFT JOIN restaurants r ON sp.restaurant_id = r.id
      ORDER BY sp.id DESC
    `);
    res.render('admin/storePayouts', { user: req.session.user, payouts, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/storePayouts', { user: req.session.user, payouts: [], success: null, error: 'Error loading payouts' });
  }
};

exports.viewPayout = async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT sp.*, r.name as restaurant_name FROM store_payouts sp
      LEFT JOIN restaurants r ON sp.restaurant_id = r.id
      WHERE sp.id = ? LIMIT 1
    `, { replacements: [req.params.id] });
    res.render('admin/viewPayout', { user: req.session.user, payout: rows[0] || null, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    req.flash('error', 'Error loading payout');
    res.redirect('/admin/store-payouts');
  }
};

exports.updatePayout = async (req, res) => {
  try {
    const { id, status, transaction_mode, transaction_id, message } = req.body;
    await sequelize.query('UPDATE store_payouts SET status=?, transaction_mode=?, transaction_id=?, message=?, updated_at=NOW() WHERE id=?', { replacements: [status, transaction_mode||'', transaction_id||'', message||'', id] });
    req.flash('success', 'Payout updated');
  } catch (err) { console.error(err); req.flash('error', 'Error updating payout'); }
  res.redirect('/admin/store-payouts');
};

// ==================== 16. CATEGORY SLIDER ====================
exports.categorySlider = async (req, res) => {
  try {
    const [categories] = await sequelize.query('SELECT * FROM restaurant_categories ORDER BY id DESC');
    res.render('admin/categorySlider', { user: req.session.user, categories, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/categorySlider', { user: req.session.user, categories: [], success: null, error: 'Error loading categories' });
  }
};

exports.createCategorySlide = async (req, res) => {
  try {
    const { name } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    await sequelize.query('INSERT INTO restaurant_categories (name, image, is_active, created_at, updated_at) VALUES (?,?,1,NOW(),NOW())', { replacements: [name, image] });
    req.flash('success', 'Category slide created');
  } catch (err) { console.error(err); req.flash('error', 'Error creating category slide'); }
  res.redirect('/admin/store-category-slider');
};

exports.disableCategorySlide = async (req, res) => {
  try {
    await sequelize.query('UPDATE restaurant_categories SET is_active = IF(is_active=1,0,1) WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Category slide status toggled');
  } catch (err) { req.flash('error', 'Error toggling category slide'); }
  res.redirect('/admin/store-category-slider');
};

exports.deleteCategorySlide = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM restaurant_categories WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Category slide deleted');
  } catch (err) { req.flash('error', 'Error deleting category slide'); }
  res.redirect('/admin/store-category-slider');
};

// ==================== SETTINGS ====================
exports.settings = async (req, res) => {
  try {
    const [rows] = await sequelize.query('SELECT `key`, `value` FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    settings.faviconUrl = settings.faviconUrl || '';
    res.render('admin/settings', { user: req.session.user, settings, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    console.error(err);
    res.render('admin/settings', { user: req.session.user, settings: {}, success: null, error: 'Error loading settings' });
  }
};

exports.uploadFavicon = async (req, res) => {
  try {
    if (!req.file) { req.flash('error', 'No file uploaded'); return res.redirect('/admin/settings'); }
    const faviconUrl = '/uploads/' + req.file.filename;
    const [existing] = await sequelize.query("SELECT id FROM settings WHERE `key` = 'faviconUrl' LIMIT 1");
    if (existing.length) {
      await sequelize.query("UPDATE settings SET `value` = ? WHERE `key` = 'faviconUrl'", { replacements: [faviconUrl] });
    } else {
      await sequelize.query("INSERT INTO settings (`key`, `value`) VALUES ('faviconUrl', ?)", { replacements: [faviconUrl] });
    }
    req.flash('success', 'Favicon actualizado');
  } catch (err) { req.flash('error', 'Error uploading favicon'); }
  res.redirect('/admin/settings');
};

exports.saveSettings = async (req, res) => {
  try {
    const fields = req.body;
    for (const [key, value] of Object.entries(fields)) {
      const [existing] = await sequelize.query('SELECT id FROM settings WHERE `key` = ? LIMIT 1', { replacements: [key] });
      if (existing.length) {
        await sequelize.query('UPDATE settings SET `value` = ? WHERE `key` = ?', { replacements: [value, key] });
      } else {
        await sequelize.query('INSERT INTO settings (`key`, `value`) VALUES (?,?)', { replacements: [key, value] });
      }
    }
    // Sync currencyFormat with currencySymbol
    if (fields.currencySymbol) {
      const [ex] = await sequelize.query("SELECT id FROM settings WHERE `key` = 'currencyFormat' LIMIT 1");
      if (ex.length) await sequelize.query("UPDATE settings SET `value` = ? WHERE `key` = 'currencyFormat'", { replacements: [fields.currencySymbol] });
      else await sequelize.query("INSERT INTO settings (`key`, `value`) VALUES ('currencyFormat', ?)", { replacements: [fields.currencySymbol] });
    }
    req.flash('success', 'Settings saved');
  } catch (err) { console.error(err); req.flash('error', 'Error saving settings'); }
  res.redirect('/admin/settings');
};
