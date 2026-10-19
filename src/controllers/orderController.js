const Hashids = require('hashids/cjs');
const hashids = new Hashids('', 5);
const { QueryTypes } = require('sequelize');
const { Order, Orderitem, OrderItemAddon, Restaurant, Address, Item, sequelize } = require('../models');
const { getDistance, randomString } = require('../helpers/utils');
const rules = require('../helpers/orderRules');
const catalog = require('../helpers/orderCatalog');
const { lockWallet, walletWithdraw } = require('../helpers/orderWallet');
const { attachEta } = require('../helpers/orderEta');
const { buildReorder } = require('../helpers/orderReorder');
const mp = require('../helpers/mercadoPago');

async function getSettings() {
  const cache = require('../helpers/cache');
  const cached = await cache.get('settings:map');
  if (cached) return cached;
  const { Setting } = require('../models');
  const settings = await Setting.findAll();
  const map = {};
  settings.forEach((s) => { map[s.key] = s.value; });
  await cache.set('settings:map', map, parseInt(process.env.CACHE_SETTINGS_TTL || '300', 10));
  return map;
}

function computeDeliveryCharge(restaurant, settings, userLat, userLng) {
  let delivery_charge = 0;
  let distance = 0;
  if (userLat && userLng) {
    distance = getDistance(parseFloat(userLat), parseFloat(userLng), parseFloat(restaurant.latitude), parseFloat(restaurant.longitude));
    if (restaurant.delivery_charge_type === 'DYNAMIC') {
      if (distance > restaurant.base_delivery_distance) {
        const extra = ((distance - restaurant.base_delivery_distance) / restaurant.extra_delivery_distance) * restaurant.extra_delivery_charge;
        delivery_charge = parseFloat(restaurant.base_delivery_charge) + extra;
        if (settings.enDelChrRnd === 'true') delivery_charge = Math.ceil(delivery_charge);
      } else {
        delivery_charge = parseFloat(restaurant.base_delivery_charge);
      }
    } else {
      delivery_charge = parseFloat(restaurant.delivery_charges);
    }
  }
  return { delivery_charge: rules.toMoney(delivery_charge), distance };
}

exports.placeOrder = async (req, res) => {
  let t = null;
  try {
    const user = req.user;
    const { order: orderItems, location, method, coupon, delivery_type, tipAmount, cash_change_amount, order_comment, payment_token, pending_payment, partial_wallet, schedule_date, schedule_slot } = req.body || {};

    const lines = rules.normalizeLines(orderItems);
    const restaurant_id = rules.toPositiveId(orderItems[0] && orderItems[0].restaurant_id);
    if (!restaurant_id) throw new rules.OrderValidationError('Tienda inválida');
    const restaurant = await Restaurant.findByPk(restaurant_id);
    if (!restaurant) throw new rules.OrderValidationError('La tienda no existe');

    const deliveryType = Number(delivery_type);
    if (![1, 2].includes(deliveryType)) throw new rules.OrderValidationError('Tipo de entrega inválido');

    const paymentMethod = rules.assertMethodAllowed(method, await catalog.getAllowedPaymentMethods());
    const tip = rules.parseTip(tipAmount);
    const isMercadoPago = mp.isMercadoPago(paymentMethod);
    let mpConfig = null;
    if (isMercadoPago) {
      mpConfig = await mp.getConfig();
      mp.assertReady(mpConfig);
    }

    const settings = await getSettings();
    const priced = rules.priceLines(lines, { ...(await catalog.loadCatalog(lines)), restaurantId: restaurant_id });
    const sub_total = priced.sub_total;

    let orderstatus_id = 1;
    let is_scheduled = false;
    if (pending_payment || rules.PENDING_PAYMENT_METHODS.includes(paymentMethod)) {
      orderstatus_id = 8;
    } else if (restaurant.auto_acceptable) {
      orderstatus_id = 2;
    }
    if (schedule_date && schedule_slot) {
      is_scheduled = true;
      // Programado: con autoaceptación queda confirmado (11) y se libera a los repartidores a su hora
      orderstatus_id = restaurant.auto_acceptable ? 11 : 10;
    }
    if (isMercadoPago) orderstatus_id = 8;

    let delivery_charge = 0, actual_delivery_charge = 0, distance = 0;
    let deliveryAddress = null;
    if (deliveryType === 1) {
      const saved = await Address.findAll({ where: { user_id: user.id }, attributes: ['id', 'address', 'house', 'latitude', 'longitude'] });
      deliveryAddress = rules.pickDeliveryAddress(saved, {
        addressId: (location && location.address_id) || req.body.address_id,
        lat: location && location.lat,
        lng: location && location.lng,
        defaultAddressId: user.default_address_id,
      });
      if (!deliveryAddress) throw new rules.OrderValidationError('Selecciona una de tus direcciones guardadas para la entrega');
      ({ delivery_charge, distance } = computeDeliveryCharge(restaurant, settings, deliveryAddress.latitude, deliveryAddress.longitude));
      actual_delivery_charge = delivery_charge;
    }
    if (restaurant.free_delivery_subtotal > 0 && sub_total >= restaurant.free_delivery_subtotal) {
      delivery_charge = 0;
    }
    const restaurant_charge = rules.toMoney(restaurant.restaurant_charges || 0);

    t = await sequelize.transaction();

    let coupon_name = null, coupon_amount = 0;
    const couponCode = coupon && typeof coupon === 'object' ? coupon.code : coupon;
    if (couponCode) {
      const result = await catalog.checkCoupon(String(couponCode), { subTotal: sub_total, restaurantId: restaurant_id, userId: user.id, transaction: t });
      if (!result.ok) throw new rules.OrderValidationError(result.message);
      await catalog.consumeCoupon(result.coupon.id, t);
      coupon_name = result.coupon.code;
      coupon_amount = result.amount;
    }

    const orderTotal = rules.computeTotal({ subTotal: sub_total, couponAmount: coupon_amount, deliveryCharge: delivery_charge, restaurantCharge: restaurant_charge, tip });

    let walletBalance = 0;
    if (paymentMethod === rules.WALLET_METHOD || partial_wallet) {
      const wallet = await lockWallet(user.id, t);
      walletBalance = wallet ? rules.toMoney(wallet.balance) : 0;
    }
    const { walletAmount, payable } = rules.splitWalletPayment({ method: paymentMethod, total: orderTotal, walletBalance, partialWallet: !!partial_wallet });

    const lastOrder = await Order.findOne({ order: [['id', 'DESC']], attributes: ['id'], transaction: t });
    const newId = lastOrder ? lastOrder.id + 1 : 1;
    const uniqueId = hashids.encode(newId);
    const unique_order_id = `OD-${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '-')}-${randomString(4).toUpperCase()}-${uniqueId.toUpperCase()}`;

    const newOrder = await Order.create({
      unique_order_id, user_id: user.id, restaurant_id, orderstatus_id,
      total: orderTotal, sub_total, delivery_charge, actual_delivery_charge,
      restaurant_charge, tax: 0,
      tax_amount: 0, coupon_name, coupon_amount, tip_amount: tip,
      wallet_amount: walletAmount > 0 ? walletAmount : null,
      payment_mode: paymentMethod, transaction_id: isMercadoPago ? null : payment_token,
      address: deliveryAddress ? (deliveryAddress.address || '') : 'NA',
      location: JSON.stringify(deliveryAddress
        ? { lat: parseFloat(deliveryAddress.latitude), lng: parseFloat(deliveryAddress.longitude), address: deliveryAddress.address || '', address_id: deliveryAddress.id }
        : location), delivery_type: deliveryType,
      delivery_pin: require('crypto').randomInt(10000, 100000).toString(),
      order_comment, distance, cash_change_amount: cash_change_amount || null,
      is_scheduled, schedule_date: schedule_date ? JSON.stringify(schedule_date) : null,
      schedule_slot: schedule_slot ? JSON.stringify(schedule_slot) : null,
      zone_id: restaurant.zone_id || null, payable,
    }, { transaction: t });

    if (walletAmount > 0) {
      const desc = paymentMethod === rules.WALLET_METHOD ? `Payment for order ${unique_order_id}` : `Partial payment for order ${unique_order_id}`;
      await walletWithdraw(t, user.id, walletAmount, desc);
    }

    const addonRows = [];
    for (const line of priced.lines) {
      const item = await Orderitem.create({ order_id: newOrder.id, item_id: line.item.id, name: line.item.name, quantity: line.quantity, price: line.unit_price }, { transaction: t });
      for (const addon of line.addons) {
        addonRows.push({ orderitem_id: item.id, addon_category_name: addon.AddonCategory ? addon.AddonCategory.name : '', addon_name: addon.name || '', addon_price: rules.toMoney(addon.price) });
      }
    }
    if (addonRows.length) await OrderItemAddon.bulkCreate(addonRows, { transaction: t });

    let preference = null;
    if (isMercadoPago) {
      preference = await mp.createPreference({ id: newOrder.id, unique_order_id, payable }, { config: mpConfig });
    }

    await t.commit();

    if (preference) {
      return res.json({ success: true, data: newOrder, init_point: preference.init_point });
    }

    try {
      const impl = require('../helpers/notifications.impl');
      await impl.notifyStoreNewOrder(newOrder, restaurant_id);
      if (newOrder.orderstatus_id === 2) await impl.notifyDeliveryNewOrder(newOrder);
    } catch (notifErr) {
      console.error('Order notification error:', notifErr.message);
    }

    res.json({ success: true, data: newOrder });
  } catch (err) {
    if (t && !t.finished) await t.rollback();
    if (err instanceof rules.OrderValidationError) {
      return res.json({ success: false, message: err.message });
    }
    if (err instanceof mp.MercadoPagoError) {
      console.error('placeOrder Mercado Pago:', err.message);
      return res.status(502).json({ success: false, message: 'No se pudo iniciar el pago con Mercado Pago. Intenta de nuevo.' });
    }
    console.error('placeOrder error:', err.message);
    res.status(500).json({ success: false, message: 'Error al procesar el pedido' });
  }
};

const HISTORY_PAGE_SIZE = 10;
const HISTORY_MAX_PAGE_SIZE = 50;

function parsePage(v) {
  return Math.min(Math.max(parseInt(v, 10) || 1, 1), 100000);
}

async function listUserOrders(userId, page, perPage) {
  const { count, rows } = await Order.findAndCountAll({
    where: { user_id: userId },
    include: [
      { association: 'orderitems', include: [{ association: 'order_item_addons' }] },
      { association: 'restaurant' },
      { association: 'rating' },
    ],
    order: [['id', 'DESC']],
    limit: perPage,
    offset: (page - 1) * perPage,
    distinct: true,
  });

  const data = rows.map((o) => {
    const obj = o.toJSON();
    obj.is_ratable = o.orderstatus_id == 5 && !o.rating;
    return obj;
  });
  await attachEta(sequelize, data);
  return { data, total: count, per_page: perPage, current_page: page };
}

exports.getOrders = async (req, res) => {
  try {
    const page = parsePage(req.body && req.body.page);
    res.json(await listUserOrders(req.user.id, page, HISTORY_PAGE_SIZE));
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// GET /api/orders/history?page=1&per_page=10 — solo pedidos del usuario autenticado, siempre con LIMIT.
exports.getOrderHistory = async (req, res) => {
  try {
    const page = parsePage(req.query && req.query.page);
    const requested = parseInt(req.query && req.query.per_page, 10) || HISTORY_PAGE_SIZE;
    const perPage = Math.min(Math.max(requested, 1), HISTORY_MAX_PAGE_SIZE);
    res.json(await listUserOrders(req.user.id, page, perPage));
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

// POST /api/orders/:id/reorder — arma el carrito con el catálogo vigente. No crea pedido ni usa precios viejos.
exports.reorder = async (req, res) => {
  try {
    const orderId = rules.toPositiveId(req.params && req.params.id);
    if (!orderId) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    const order = await Order.findOne({
      where: { id: orderId, user_id: req.user.id },
      include: [{ association: 'orderitems', include: [{ association: 'order_item_addons' }] }],
    });
    if (!order) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });

    const restaurant = await Restaurant.findByPk(order.restaurant_id, { attributes: ['id', 'name', 'slug', 'is_active', 'is_accepted'] });
    if (!restaurant || !restaurant.is_accepted) {
      return res.status(409).json({ success: false, message: 'La tienda ya no está disponible' });
    }

    const orderItems = order.orderitems.map((oi) => ({
      item_id: oi.item_id,
      name: oi.name,
      quantity: oi.quantity,
      addons: (oi.order_item_addons || []).map((a) => ({ addon_name: a.addon_name, addon_category_name: a.addon_category_name })),
    }));
    const itemIds = [...new Set(orderItems.map((oi) => Number(oi.item_id)).filter((n) => Number.isInteger(n) && n > 0))];

    const items = itemIds.length
      ? await Item.findAll({ where: { id: itemIds, restaurant_id: restaurant.id }, attributes: ['id', 'name', 'price', 'is_active', 'restaurant_id'] })
      : [];
    const addonRows = itemIds.length
      ? await sequelize.query(
          `SELECT aci.item_id, a.id, a.name, a.price, a.is_active, a.addon_category_id, ac.name AS category_name
           FROM addon_category_item aci
           JOIN addon_categories ac ON ac.id = aci.addon_category_id AND ac.restaurant_id = ?
           JOIN addons a ON a.addon_category_id = ac.id
           WHERE aci.item_id IN (?) LIMIT 2000`,
          { replacements: [restaurant.id, itemIds], type: QueryTypes.SELECT }
        )
      : [];

    const { lines, unavailable } = buildReorder({ orderItems, items, addonRows, restaurantId: restaurant.id });
    const links = addonRows.map((r) => ({ item_id: r.item_id, addon_category_id: r.addon_category_id }));
    const priced = lines.length
      ? rules.priceLines(lines, { items, addons: addonRows, links, restaurantId: restaurant.id })
      : { lines: [], sub_total: 0 };

    const cart = priced.lines.map((l) => ({
      id: l.item.id,
      restaurant_id: restaurant.id,
      name: l.item.name,
      quantity: l.quantity,
      price: l.unit_price,
      line_total: l.line_total,
      selectedaddons: l.addons.map((a) => ({ addon_id: a.id, addon_name: a.name, addon_price: rules.toMoney(a.price) })),
    }));

    res.json({
      success: true,
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, is_open: !!restaurant.is_active },
      cart,
      sub_total: priced.sub_total,
      unavailable,
    });
  } catch (err) {
    if (err instanceof rules.OrderValidationError) return res.status(409).json({ success: false, message: err.message });
    console.error('reorder error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.getOrderItems = async (req, res) => {
  try {
    const orderId = rules.toPositiveId(req.body && req.body.order_id);
    const order = orderId ? await Order.findByPk(orderId, { attributes: ['id', 'user_id'] }) : null;
    if (!order || Number(order.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false });
    }
    const items = await Orderitem.findAll({ where: { order_id: order.id } });
    res.json(items);
  } catch (err) {
    res.status(401).json({ success: false });
  }
};

exports.cancelOrder = async (req, res) => {
  const orderId = rules.toPositiveId(req.body && req.body.order_id);
  if (!orderId) return res.json({ success: false, refund: false });
  try {
    const { cancelOrderWithRefund } = require('../helpers/orderCancel');
    const { order, refund } = await cancelOrderWithRefund({ orderId, actor: 'customer', scope: { user_id: req.user.id } });
    const { emitOrderEvent } = require('../helpers/orderEvents');
    await emitOrderEvent('cancelled', order);
    res.json({ success: true, refund });
  } catch (err) {
    if (err instanceof require('../helpers/orderStates').OrderStateError) {
      return res.json({ success: false, refund: false, message: err.message });
    }
    console.error('cancelOrder error:', err.message);
    res.status(500).json({ success: false, refund: false });
  }
};
