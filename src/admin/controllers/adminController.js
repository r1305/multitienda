const { sequelize } = require('../../models');
const { formatOrderElapsed } = require('../../helpers/orderDuration');
const crypto = require('crypto');
const rules = require('../../helpers/orderRules');
const states = require('../../helpers/orderStates');
const { cancelOrderWithRefund } = require('../../helpers/orderCancel');
const { emitOrderEvent } = require('../../helpers/orderEvents');
const { releaseDueScheduledOrders } = require('../../helpers/scheduledOrders');
const { walletDeposit, walletWithdraw } = require('../../helpers/orderWallet');

async function assignOrderToDeliveryGuy(orderId, deliveryUserId) {
  const id = rules.toPositiveId(orderId);
  const uid = rules.toPositiveId(deliveryUserId);
  if (!id || !uid) throw new Error('Datos de asignación inválidos');

  const order = await sequelize.transaction(async (t) => {
    const [guys] = await sequelize.query(
      "SELECT u.id FROM users u INNER JOIN model_has_roles mr ON mr.model_id = u.id INNER JOIN roles r ON r.id = mr.role_id WHERE u.id = ? AND u.is_active = 1 AND r.name = 'Delivery Guy' LIMIT 1",
      { replacements: [uid], transaction: t }
    );
    if (!guys.length) throw new Error('El repartidor no existe o no está activo');

    const [orders] = await sequelize.query('SELECT * FROM orders WHERE id = ? LIMIT 1 FOR UPDATE', { replacements: [id], transaction: t });
    const found = orders[0];
    if (!found) throw new Error('Order not found');

    // Reasignar (ya en estado 3) no cambia el estado; asignar desde 1 o 2 pasa a 3 con la máquina de estados
    if (Number(found.orderstatus_id) !== states.STATUS.ASSIGNED) {
      await states.transition(found, [states.STATUS.PENDING, states.STATUS.ACCEPTED, states.STATUS.PREPARING], states.STATUS.ASSIGNED, 'admin', t);
    }
    await sequelize.query('DELETE FROM accept_deliveries WHERE order_id = ?', { replacements: [id], transaction: t });
    await sequelize.query('INSERT INTO accept_deliveries (order_id, user_id) VALUES (?, ?)', { replacements: [id, uid], transaction: t });
    return found;
  });

  const { notifyDeliveryOrderAssigned } = require('../../helpers/notifications');
  const pushResult = await notifyDeliveryOrderAssigned(order, uid);
  return { order, pushResult };
}

exports.dashboard = async (req, res) => {
  try {
    const q = async (sql, def = 0) => { try { const [[r]] = await sequelize.query(sql); return Object.values(r)[0]; } catch(e) { return def; } };
    const qa = async (sql) => { try { const [r] = await sequelize.query(sql); return r; } catch(e) { return []; } };

    const [
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      totalUsers,
      totalStores,
      totalDelivery,
      todayOrders,
      todayRevenue,
      totalRevenue,
      recentOrders,
      topStores,
      activeDelivery,
      settingsRows,
    ] = await Promise.all([
      q('SELECT COUNT(*) as v FROM orders'),
      q("SELECT COUNT(*) as v FROM orders WHERE orderstatus_id = 5"),
      q("SELECT COUNT(*) as v FROM orders WHERE orderstatus_id IN (1,2,3,4,7,10,11,12)"),
      q("SELECT COUNT(*) as v FROM orders WHERE orderstatus_id = 6"),
      q('SELECT COUNT(*) as v FROM users'),
      q('SELECT COUNT(*) as v FROM restaurants'),
      q("SELECT COUNT(*) as v FROM users u INNER JOIN model_has_roles mr ON u.id = mr.model_id INNER JOIN roles r ON mr.role_id = r.id WHERE r.name = 'Delivery Guy'"),
      q("SELECT COUNT(*) as v FROM orders WHERE DATE(created_at) = CURDATE()"),
      q("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE orderstatus_id = 5 AND DATE(created_at) = CURDATE()"),
      q("SELECT COALESCE(SUM(total),0) as v FROM orders WHERE orderstatus_id = 5"),
      qa(`
      SELECT o.id, o.unique_order_id, o.total, o.orderstatus_id, o.payment_mode, o.created_at, o.updated_at,
        u.name as user_name, r.name as restaurant_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      ORDER BY o.id DESC LIMIT 8
    `),
      qa(`
      SELECT r.id, r.name, r.image, r.is_active, COUNT(o.id) as order_count, COALESCE(SUM(o.total),0) as revenue
      FROM restaurants r
      LEFT JOIN orders o ON o.restaurant_id = r.id AND o.orderstatus_id = 5
      GROUP BY r.id ORDER BY revenue DESC LIMIT 5
    `),
      qa(`
      SELECT u.id, u.name, u.phone, u.is_active,
        (SELECT COUNT(*) FROM accept_deliveries ad
          INNER JOIN orders o ON o.id = ad.order_id
          WHERE ad.user_id = u.id AND o.orderstatus_id IN (3, 4)) as active_orders
      FROM users u
      INNER JOIN model_has_roles mr ON u.id = mr.model_id
      INNER JOIN roles r ON mr.role_id = r.id
      WHERE r.name = 'Delivery Guy' AND u.is_active = 1
      ORDER BY active_orders DESC, u.name ASC LIMIT 5
    `),
      sequelize.query("SELECT `value` FROM settings WHERE `key` = 'currencySymbol' LIMIT 1").catch(() => [[]]),
    ]);

    const currency = settingsRows[0]?.length ? settingsRows[0][0].value : '$';

    const ONLINE_GPS_MS = 15 * 60 * 1000;
    if (activeDelivery.length) {
      try {
        const gps = require('../../helpers/gps');
        const positions = await gps.getDeliveryGpsBatch(activeDelivery.map((d) => d.id));
        activeDelivery.forEach((d) => {
          const pos = positions[d.id];
          const lat = pos ? parseFloat(pos.delivery_lat) : NaN;
          const lng = pos ? parseFloat(pos.delivery_long) : NaN;
          d.has_location = Number.isFinite(lat) && Number.isFinite(lng);
          const ts = pos?.updated_at;
          d.is_live = !!(d.has_location && ts && Date.now() - ts < ONLINE_GPS_MS);
          d.is_online = d.is_live;
        });
      } catch (gpsErr) {
        console.warn('Dashboard delivery GPS:', gpsErr.message);
      }
    }

    res.render('admin/dashboard', {
      user: req.session.user,
      stats: { totalOrders, completedOrders, pendingOrders, cancelledOrders, totalUsers, totalStores, totalDelivery, todayOrders, todayRevenue, totalRevenue },
      recentOrders,
      topStores,
      activeDelivery,
      currency,
      formatOrderElapsed,
      success: req.flash('success')[0],
      error: req.flash('error')[0]
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.render('admin/dashboard', {
      user: req.session.user,
      stats: { totalOrders: 0, completedOrders: 0, pendingOrders: 0, cancelledOrders: 0, totalUsers: 0, totalStores: 0, totalDelivery: 0, todayOrders: 0, todayRevenue: 0, totalRevenue: 0 },
      recentOrders: [],
      topStores: [],
      activeDelivery: [],
      currency: '$',
      formatOrderElapsed,
      success: null,
      error: 'Error loading dashboard'
    });
  }
};

// ==================== 1. ORDERS ====================
exports.orders = async (req, res) => {
  let orders = [];
  let deliveryGuys = [];

  await releaseDueScheduledOrders();

  try {
    const [rows] = await sequelize.query(`
      SELECT o.*, u.name AS user_name, r.name AS restaurant_name,
        dg.name AS delivery_guy_name, ad.user_id AS delivery_guy_id
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN restaurants r ON o.restaurant_id = r.id
      LEFT JOIN accept_deliveries ad ON ad.order_id = o.id
      LEFT JOIN users dg ON dg.id = ad.user_id
      ORDER BY o.id DESC
    `);
    orders = rows;
  } catch (err) {
    console.warn('orders list with delivery join:', err.message);
    try {
      const [rows] = await sequelize.query(`
        SELECT o.*, u.name AS user_name, r.name AS restaurant_name
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN restaurants r ON o.restaurant_id = r.id
        ORDER BY o.id DESC
      `);
      orders = rows;
    } catch (err2) {
      console.error('orders list:', err2);
      return res.render('admin/orders', {
        user: req.session.user,
        orders: [],
        deliveryGuys: [],
        formatOrderElapsed,
        success: null,
        error: 'Error loading orders',
      });
    }
  }

  try {
    const [rows] = await sequelize.query(`
      SELECT u.id, u.name, u.phone FROM users u
      INNER JOIN model_has_roles mr ON u.id = mr.model_id
      INNER JOIN roles r ON mr.role_id = r.id
      WHERE r.name = 'Delivery Guy' AND u.is_active = 1
      ORDER BY u.name ASC
    `);
    deliveryGuys = rows;
  } catch (dgErr) {
    console.warn('orders deliveryGuys:', dgErr.message);
  }

  try {
    res.render('admin/orders', {
      user: req.session.user,
      orders,
      deliveryGuys,
      formatOrderElapsed,
      success: req.flash('success')[0],
      error: req.flash('error')[0],
    });
  } catch (renderErr) {
    console.error('orders render:', renderErr);
    res.render('admin/orders', {
      user: req.session.user,
      orders: [],
      deliveryGuys: [],
      formatOrderElapsed,
      success: null,
      error: 'Error loading orders',
    });
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
      const [acceptRows] = await sequelize.query(
        'SELECT user_id FROM accept_deliveries WHERE order_id = ? LIMIT 1',
        { replacements: [order.id] }
      );
      if (acceptRows[0]) order.delivery_guy_id = acceptRows[0].user_id;
    }
    res.render('admin/viewOrder', {
      user: req.session.user,
      order,
      orderitems,
      deliveryGuys,
      formatOrderElapsed,
      success: req.flash('success')[0],
      error: req.flash('error')[0],
    });
  } catch (err) {
    console.error(err);
    res.render('admin/viewOrder', {
      user: req.session.user,
      order: null,
      orderitems: [],
      deliveryGuys: [],
      formatOrderElapsed,
      success: null,
      error: 'Error loading order',
    });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { order } = await cancelOrderWithRefund({ orderId: req.body.order_id, actor: 'admin' });
    await emitOrderEvent('cancelled', order);
    req.flash('success', 'Order cancelled');
  } catch (err) {
    if (!(err instanceof states.OrderStateError)) console.error('admin cancelOrder:', err.message);
    req.flash('error', err instanceof states.OrderStateError ? err.message : 'Error cancelling order');
  }
  res.redirect('/admin/orders');
};

exports.acceptOrder = async (req, res) => {
  try {
    const [orders] = await sequelize.query('SELECT id, user_id, unique_order_id, delivery_type FROM orders WHERE id = ?', { replacements: [req.body.id] });
    if (!orders[0]) throw new states.OrderStateError('Order not found', 404);
    await states.transition(orders[0], [states.STATUS.PENDING], states.STATUS.ACCEPTED, 'admin');
    // Avisa al cliente y, si es entrega a domicilio, a los repartidores
    await emitOrderEvent('accepted', orders[0]);
    req.flash('success', 'Order accepted');
  } catch (err) {
    if (!(err instanceof states.OrderStateError)) console.error('admin acceptOrder:', err.message);
    req.flash('error', err instanceof states.OrderStateError ? err.message : 'Error accepting order');
  }
  res.redirect('/admin/orders');
};

exports.assignDelivery = async (req, res) => {
  try {
    const { order, pushResult } = await assignOrderToDeliveryGuy(req.body.order_id, req.body.user_id);
    if (pushResult?.ok) {
      req.flash('success', 'Repartidor asignado y notificación push enviada.');
    } else if (pushResult?.reason === 'all_failed') {
      req.flash('error', 'Repartidor asignado, pero FCM rechazó el token. El repartidor debe volver a activar notificaciones en /delivery.');
    } else if (pushResult?.reason === 'firebase_not_configured') {
      req.flash('error', 'Repartidor asignado, pero Firebase no está configurado en el servidor.');
    } else {
      req.flash('success', 'Repartidor asignado.');
    }
    if (req.body.return_to === 'orders') return res.redirect('/admin/orders');
    return res.redirect('/admin/order/' + (order.unique_order_id || order.id));
  } catch (err) {
    console.error(err);
    req.flash('error', err instanceof states.OrderStateError ? err.message : 'Error al asignar repartidor');
    if (req.body.return_to === 'orders') return res.redirect('/admin/orders');
    res.redirect('/admin/orders');
  }
};

exports.reassignDelivery = async (req, res) => {
  try {
    const { order, pushResult } = await assignOrderToDeliveryGuy(req.body.order_id, req.body.user_id);
    if (pushResult?.ok) {
      req.flash('success', 'Repartidor reasignado y notificación push enviada.');
    } else if (pushResult?.reason === 'all_failed') {
      req.flash('error', 'Repartidor reasignado, pero FCM rechazó el token. Vuelva a activar notificaciones en /delivery.');
    } else {
      req.flash('success', 'Repartidor reasignado.');
    }
    return res.redirect('/admin/order/' + (order.unique_order_id || order.id));
  } catch (err) {
    console.error(err);
    req.flash('error', err instanceof states.OrderStateError ? err.message : 'Error al reasignar repartidor');
    res.redirect('/admin/orders');
  }
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
    // El admin habilita/deshabilita con is_accepted; is_active es "abierta/cerrada" y lo controla el dueño
    await sequelize.query('UPDATE restaurants SET is_accepted = IF(is_accepted=1,0,1), updated_at = NOW() WHERE id = ?', { replacements: [req.params.id] });
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
    if (!password || password.length < 8) {
      req.flash('error', 'Password must be at least 8 characters');
      return res.redirect('/admin/users');
    }
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

const MAX_AJUSTE_BILLETERA = 100000;

async function ajustarBilletera(req, res, tipo) {
  const userId = rules.toPositiveId(req.body.user_id);
  const destino = userId ? `/admin/user/edit/${userId}` : '/admin/users';
  try {
    if (!userId) throw new rules.OrderValidationError('Usuario inválido');
    const esDeposito = tipo === 'deposit';
    const monto = rules.toMoney(esDeposito ? req.body.add_amount : req.body.substract_amount);
    if (!(monto > 0) || monto > MAX_AJUSTE_BILLETERA) {
      throw new rules.OrderValidationError(`El monto debe ser mayor que 0 y no superar ${MAX_AJUSTE_BILLETERA}`);
    }
    const descripcion = String((esDeposito ? req.body.add_amount_description : req.body.substract_amount_description) || '').slice(0, 255)
      || (esDeposito ? 'Recarga del administrador' : 'Descuento del administrador');
    await sequelize.transaction(async (t) => {
      const [existe] = await sequelize.query('SELECT id FROM users WHERE id = ? LIMIT 1', { replacements: [userId], transaction: t });
      if (!existe.length) throw new rules.OrderValidationError('El usuario no existe');
      if (esDeposito) await walletDeposit(t, userId, monto, descripcion);
      else await walletWithdraw(t, userId, monto, descripcion);
    });
    req.flash('success', esDeposito ? 'Saldo agregado a la billetera' : 'Saldo descontado de la billetera');
  } catch (err) {
    if (!(err instanceof rules.OrderValidationError)) console.error('admin ajustarBilletera:', err.message);
    req.flash('error', err instanceof rules.OrderValidationError ? err.message : 'Error al actualizar la billetera');
  }
  res.redirect(destino);
}

exports.addMoneyToWallet = (req, res) => ajustarBilletera(req, res, 'deposit');
exports.substractMoneyFromWallet = (req, res) => ajustarBilletera(req, res, 'withdraw');

exports.deleteUserAddress = async (req, res) => {
  const userId = rules.toPositiveId(req.body.user_id);
  const addressId = rules.toPositiveId(req.body.address_id);
  try {
    if (!userId || !addressId) throw new Error('Datos inválidos');
    // Se filtra por user_id para no borrar direcciones de otro usuario
    await sequelize.query('DELETE FROM addresses WHERE id = ? AND user_id = ?', { replacements: [addressId, userId] });
    req.flash('success', 'Dirección eliminada');
  } catch (err) {
    console.error('admin deleteUserAddress:', err.message);
    req.flash('error', 'Error al eliminar la dirección');
  }
  res.redirect(userId ? `/admin/user/edit/${userId}` : '/admin/users');
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
  const mapCenter = { lat: 9.9281, lng: -84.0907 };
  try {
    const [geoRows] = await sequelize.query(
      'SELECT latitude, longitude FROM popular_geo_places WHERE is_default = 1 LIMIT 1'
    );
    if (geoRows && geoRows[0]) {
      mapCenter.lat = parseFloat(geoRows[0].latitude) || mapCenter.lat;
      mapCenter.lng = parseFloat(geoRows[0].longitude) || mapCenter.lng;
    }
  } catch (geoErr) {
    console.warn('deliveryGuys mapCenter:', geoErr.message);
  }

  const deliveryGuysFrom = `
      FROM users u
      INNER JOIN model_has_roles mr ON u.id = mr.model_id
      INNER JOIN roles r ON mr.role_id = r.id
      LEFT JOIN delivery_guy_details dgd ON u.id = dgd.user_id
      WHERE r.name = 'Delivery Guy'`;

  let deliveryGuys = [];
  try {
    const [rows] = await sequelize.query(`
      SELECT u.id, u.name, u.email, u.phone, u.is_active,
        dgd.vehicle_number, dgd.commission_rate, dgd.commission_type, dgd.fixed_commission,
        dgd.percentage_base, dgd.dynamic_base_distance, dgd.dynamic_base_price, dgd.dynamic_price_per_km,
        COALESCE((
          SELECT SUM(amount) FROM delivery_earnings de WHERE de.user_id = u.id
        ), 0) AS total_earnings
      ${deliveryGuysFrom}
      ORDER BY u.is_active ASC, u.id DESC
    `);
    deliveryGuys = rows;
  } catch (earningsErr) {
    console.warn('deliveryGuys earnings subquery:', earningsErr.message);
    try {
      const [rows] = await sequelize.query(`
        SELECT u.id, u.name, u.email, u.phone, u.is_active,
          dgd.vehicle_number, dgd.commission_rate, dgd.commission_type, dgd.fixed_commission,
          dgd.percentage_base, dgd.dynamic_base_distance, dgd.dynamic_base_price, dgd.dynamic_price_per_km,
          0 AS total_earnings
        ${deliveryGuysFrom}
        ORDER BY u.is_active ASC, u.id DESC
      `);
      deliveryGuys = rows;
    } catch (detailsErr) {
      console.warn('deliveryGuys commission columns:', detailsErr.message);
      const [rows] = await sequelize.query(`
        SELECT u.id, u.name, u.email, u.phone, u.is_active,
          dgd.vehicle_number, dgd.commission_rate, dgd.commission_type, dgd.fixed_commission,
          0 AS total_earnings
        ${deliveryGuysFrom}
        ORDER BY u.is_active ASC, u.id DESC
      `);
      deliveryGuys = rows;
    }
  }

  try {
    res.render('admin/deliveryGuys', {
      user: req.session.user,
      deliveryGuys,
      mapCenter,
      success: req.flash('success')[0],
      error: req.flash('error')[0],
    });
  } catch (renderErr) {
    console.error('deliveryGuys render:', renderErr);
    res.render('admin/deliveryGuys', {
      user: req.session.user,
      deliveryGuys: [],
      mapCenter,
      success: null,
      error: 'Error loading delivery guys',
    });
  }
};

exports.deliveryGuysLocations = async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT u.id, u.name, u.phone, u.is_active, dgd.vehicle_number
      FROM users u
      INNER JOIN model_has_roles mr ON u.id = mr.model_id
      INNER JOIN roles r ON mr.role_id = r.id
      LEFT JOIN delivery_guy_details dgd ON u.id = dgd.user_id
      WHERE r.name = 'Delivery Guy'
    `);
    const gps = require('../../helpers/gps');
    const positions = await gps.getDeliveryGpsBatch(rows.map((r) => r.id));
    const drivers = rows
      .map((r) => {
        const p = positions[r.id];
        const lat = p ? parseFloat(p.delivery_lat) : null;
        const lng = p ? parseFloat(p.delivery_long) : null;
        return {
          id: r.id,
          name: r.name,
          phone: r.phone,
          is_active: r.is_active,
          vehicle: r.vehicle_number,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          heading: p?.heading,
          updated_at: p?.updated_at || null,
          live: !!p?.live,
        };
      })
      .filter((d) => d.lat != null && d.lng != null);
    res.json({
      drivers,
      total: rows.length,
      on_map: drivers.length,
      fetched_at: Date.now(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ drivers: [], total: 0, on_map: 0, error: 'Error loading locations' });
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
    const { user_id, commission_type, fixed_commission, commission_rate, percentage_base, dynamic_base_distance, dynamic_base_price, dynamic_price_per_km } = req.body;
    await sequelize.query(
      'UPDATE delivery_guy_details SET commission_type=?, fixed_commission=?, commission_rate=?, percentage_base=?, dynamic_base_distance=?, dynamic_base_price=?, dynamic_price_per_km=? WHERE user_id=?',
      { replacements: [commission_type, fixed_commission || 0, commission_rate || 0, percentage_base || 'total', dynamic_base_distance || 0, dynamic_base_price || 0, dynamic_price_per_km || 0, user_id] }
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
    const [coupons] = await sequelize.query('SELECT c.*, r.name as restaurant_name, (SELECT COUNT(*) FROM orders WHERE coupon_name = c.code) as used_count FROM coupons c LEFT JOIN restaurants r ON c.restaurant_id = r.id ORDER BY c.id DESC');
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
exports.notifications = async (req, res) => {
  let deliveryPushList = [];
  try {
    const { getDeliveryPushStatus } = require('../../helpers/notifications.impl');
    deliveryPushList = await getDeliveryPushStatus();
  } catch (err) {
    console.error('Delivery push status error:', err.message);
  }
  const pushReadyCount = deliveryPushList.filter((d) => d.hasPushToken).length;
  res.render('admin/notifications', {
    user: req.session.user,
    success: req.flash('success')[0],
    error: req.flash('error')[0],
    deliveryPushList,
    pushReadyCount,
    deliveryTotal: deliveryPushList.length,
  });
};

exports.sendNotification = async (req, res) => {
  try {
    const { title, message, image, target, user_ids } = req.body;
    const { sendPushNotification, saveNotification, broadcastToRole } = require('../../helpers/notifications');
    const extra = image ? { image } : {};

    if (target === 'specific' && user_ids) {
      const ids = user_ids.split(',').map((id) => id.trim()).filter(Boolean);
      for (const uid of ids) {
        await saveNotification(uid, title, message, extra);
        await sendPushNotification(title, message, uid, null, extra);
      }
      req.flash('success', `Notificación enviada a ${ids.length} usuario(s).`);
    } else if (target === 'customers') {
      const n = await broadcastToRole('customer', title, message, extra);
      req.flash('success', n ? `Notificación enviada a ${n} cliente(s).` : 'Enviado por tag; verifica que los clientes tengan push activo.');
    } else if (target === 'delivery') {
      const n = await broadcastToRole('delivery', title, message, extra);
      req.flash(
        'success',
        n
          ? `Notificación enviada a ${n} repartidor(es). Deben tener la app /delivery abierta con notificaciones activadas.`
          : 'No hay repartidores en el sistema. Regístralos con rol Delivery Guy.'
      );
    } else if (target === 'store_owners') {
      const n = await broadcastToRole('store_owner', title, message, extra);
      req.flash('success', n ? `Notificación enviada a ${n} dueño(s) de tienda.` : 'No hay dueños de tienda asignados.');
    } else {
      await sendPushNotification(title, message, null, null, extra);
      req.flash('success', 'Notificación enviada a todos los suscriptos.');
    }
  } catch (err) {
    console.error('Send notification error:', err);
    req.flash('error', 'Error al enviar la notificación');
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
    settings.logoUrl = settings.logoUrl || '';
    settings.listingImageUrl = settings.listingImageUrl || '';
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
    const cache = require('../../helpers/cache');
    await cache.del('settings:all');
    await cache.del('admin:settings:inject');
    await cache.del('settings:appBaseUrl');
    await cache.invalidate('restaurants:');
    req.flash('success', 'Favicon actualizado');
  } catch (err) { req.flash('error', 'Error uploading favicon'); }
  res.redirect('/admin/settings');
};

exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) { req.flash('error', 'No file uploaded'); return res.redirect('/admin/settings'); }
    const logoUrl = '/uploads/' + req.file.filename;
    const [existing] = await sequelize.query("SELECT id FROM settings WHERE `key` = 'logoUrl' LIMIT 1");
    if (existing.length) {
      await sequelize.query("UPDATE settings SET `value` = ? WHERE `key` = 'logoUrl'", { replacements: [logoUrl] });
    } else {
      await sequelize.query("INSERT INTO settings (`key`, `value`) VALUES ('logoUrl', ?)", { replacements: [logoUrl] });
    }
    const cache = require('../../helpers/cache');
    await cache.del('settings:all');
    await cache.del('admin:settings:inject');
    req.flash('success', 'Logo actualizado');
  } catch (err) { req.flash('error', 'Error uploading logo'); }
  res.redirect('/admin/settings');
};

exports.uploadListingImage = async (req, res) => {
  try {
    if (!req.file) { req.flash('error', 'No file uploaded'); return res.redirect('/admin/settings'); }
    const listingImageUrl = '/uploads/' + req.file.filename;
    const [existing] = await sequelize.query("SELECT id FROM settings WHERE `key` = 'listingImageUrl' LIMIT 1");
    if (existing.length) {
      await sequelize.query("UPDATE settings SET `value` = ? WHERE `key` = 'listingImageUrl'", { replacements: [listingImageUrl] });
    } else {
      await sequelize.query("INSERT INTO settings (`key`, `value`) VALUES ('listingImageUrl', ?)", { replacements: [listingImageUrl] });
    }
    const cache = require('../../helpers/cache');
    await cache.del('settings:all');
    await cache.del('admin:settings:inject');
    req.flash('success', 'Listing image actualizada');
  } catch (err) { req.flash('error', 'Error uploading listing image'); }
  res.redirect('/admin/settings');
};

exports.saveSettings = async (req, res) => {
  try {
    const fields = req.body;
    const ALLOWED_KEYS = [
      'storeName', 'currencySymbol', 'currencyId', 'currencyFormat',
      'googleApiKey', 'walletName', 'uploadImageQuality', 'primaryColor',
      'enableDeliveryPin', 'deliveryRadius',
      'firebaseApiKey', 'firebaseAuthDomain', 'firebaseProjectId', 'firebaseStorageBucket',
      'firebaseMessagingSenderId', 'firebaseAppId', 'firebaseMeasurementId', 'firebaseVapidKey',
      'enablePushNotificationOrders',
      'seoMetaTitle', 'seoMetaDescription', 'googleAnalyticsCode',
    ];
    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
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
    const cache = require('../../helpers/cache');
    await cache.del('settings:all');
    await cache.del('settings:map');
    await cache.del('admin:settings:inject');
    await cache.del('settings:appBaseUrl');
    await cache.del('settings:deliveryRadius');
    await cache.invalidate('restaurants:');
    req.flash('success', 'Settings saved');
  } catch (err) { console.error(err); req.flash('error', 'Error saving settings'); }
  res.redirect('/admin/settings');
};

exports.paymentMethods = async (req, res) => {
  try {
    const [gateways] = await sequelize.query('SELECT * FROM payment_gateways ORDER BY id');
    res.render('admin/paymentMethods', { user: req.session.user, gateways, success: req.flash('success')[0], error: req.flash('error')[0] });
  } catch (err) {
    res.render('admin/paymentMethods', { user: req.session.user, gateways: [], success: null, error: 'Error loading payment methods' });
  }
};

exports.createPaymentMethod = async (req, res) => {
  try {
    const { name, account_number, phone_number } = req.body;
    await sequelize.query('INSERT INTO payment_gateways (name, account_number, phone_number, is_active, created_at, updated_at) VALUES (?,?,?,1,NOW(),NOW())', { replacements: [name, account_number || null, phone_number || null] });
    req.flash('success', 'Metodo de pago creado');
  } catch (err) { req.flash('error', 'Error al crear'); }
  res.redirect('/admin/payment-methods');
};

exports.updatePaymentMethod = async (req, res) => {
  try {
    const { id, name, account_number, phone_number } = req.body;
    await sequelize.query('UPDATE payment_gateways SET name=?, account_number=?, phone_number=?, updated_at=NOW() WHERE id=?', { replacements: [name, account_number || null, phone_number || null, id] });
    req.flash('success', 'Metodo actualizado');
  } catch (err) { req.flash('error', 'Error al actualizar'); }
  res.redirect('/admin/payment-methods');
};

exports.togglePaymentMethod = async (req, res) => {
  try {
    await sequelize.query('UPDATE payment_gateways SET is_active = NOT is_active WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Estado actualizado');
  } catch (err) { req.flash('error', 'Error'); }
  res.redirect('/admin/payment-methods');
};

exports.deletePaymentMethod = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM payment_gateways WHERE id = ?', { replacements: [req.params.id] });
    req.flash('success', 'Metodo eliminado');
  } catch (err) { req.flash('error', 'Error al eliminar'); }
  res.redirect('/admin/payment-methods');
};

exports.cleanData = async (req, res) => {
  try {
    const { pin_code } = req.body;
    if (!pin_code) { req.flash('error', 'PIN Code requerido'); return res.redirect('/admin/settings'); }

    // Verify PIN against superadmin (timing-safe comparison)
    const [admins] = await sequelize.query("SELECT pin_code FROM users WHERE id = (SELECT model_id FROM model_has_roles WHERE role_id = 1 LIMIT 1) LIMIT 1");
    if (!admins.length) {
      req.flash('error', 'PIN Code incorrecto');
      return res.redirect('/admin/settings');
    }
    const storedPin = admins[0].pin_code || '';
    const inputPin = String(pin_code);
    if (storedPin.length !== inputPin.length || !crypto.timingSafeEqual(Buffer.from(storedPin), Buffer.from(inputPin))) {
      req.flash('error', 'PIN Code incorrecto');
      return res.redirect('/admin/settings');
    }

    // Get superadmin user id to preserve
    const [adminUser] = await sequelize.query("SELECT model_id FROM model_has_roles WHERE role_id = 1 LIMIT 1");
    const adminId = adminUser[0].model_id;

    // Limpia todas las tablas de datos en una sola transacción (conserva superadmin, roles y ajustes)
    await sequelize.transaction(async (t) => {
      await sequelize.query('DELETE FROM chats', { transaction: t });
      await sequelize.query('DELETE FROM notifications', { transaction: t });
      await sequelize.query('DELETE FROM order_item_addons', { transaction: t });
      await sequelize.query('DELETE FROM orderitems', { transaction: t });
      await sequelize.query('DELETE FROM orders', { transaction: t });
      await sequelize.query('DELETE FROM accept_deliveries', { transaction: t });
      await sequelize.query('DELETE FROM delivery_earnings', { transaction: t });
      await sequelize.query('DELETE FROM delivery_ignored_orders', { transaction: t });
      await sequelize.query('DELETE FROM ratings', { transaction: t });
      await sequelize.query('DELETE FROM addon_category_item', { transaction: t });
      await sequelize.query('DELETE FROM addons', { transaction: t });
      await sequelize.query('DELETE FROM addon_categories', { transaction: t });
      await sequelize.query('DELETE FROM items', { transaction: t });
      await sequelize.query('DELETE FROM item_categories', { transaction: t });
      await sequelize.query('DELETE FROM restaurants', { transaction: t });
      await sequelize.query('DELETE FROM restaurant_user', { transaction: t });
      await sequelize.query('DELETE FROM coupons', { transaction: t });
      await sequelize.query('DELETE FROM addresses', { transaction: t });
      await sequelize.query('DELETE FROM wallets', { transaction: t });
      await sequelize.query('DELETE FROM transactions', { transaction: t });
      await sequelize.query('DELETE FROM push_tokens', { transaction: t });
      await sequelize.query('DELETE FROM promo_sliders', { transaction: t });
      await sequelize.query('DELETE FROM delivery_guy_details', { transaction: t });
      await sequelize.query('DELETE FROM password_reset_otps', { transaction: t });
      await sequelize.query('DELETE FROM sms_otps', { transaction: t });
      await sequelize.query('DELETE FROM model_has_roles WHERE model_id != ?', { replacements: [adminId], transaction: t });
      await sequelize.query('DELETE FROM users WHERE id != ?', { replacements: [adminId], transaction: t });
    });

    // Borra los archivos subidos (solo archivos; conserva .gitkeep)
    const fs = require('fs');
    const path = require('path');
    const uploadsDir = path.join(__dirname, '../../../public/uploads');
    if (fs.existsSync(uploadsDir)) {
      for (const file of fs.readdirSync(uploadsDir)) {
        if (file === '.gitkeep') continue;
        const full = path.join(uploadsDir, file);
        if (fs.lstatSync(full).isFile()) fs.unlinkSync(full);
      }
    }

    req.flash('success', 'Todos los datos han sido eliminados correctamente');
  } catch (err) {
    console.error('Clean data error:', err.message);
    req.flash('error', 'Error al limpiar datos');
  }
  res.redirect('/admin/settings');
};
