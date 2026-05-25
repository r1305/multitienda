const Hashids = require('hashids/cjs');
const hashids = new Hashids('', 5);
const { Order, Orderitem, OrderItemAddon, Item, Addon, Coupon, Restaurant, Wallet, Transaction, sequelize } = require('../models');
const { getDistance, randomString } = require('../helpers/utils');

async function getSettings() {
  const { Setting } = require('../models');
  const settings = await Setting.findAll();
  const map = {};
  settings.forEach(s => { map[s.key] = s.value; });
  return map;
}

async function getWalletBalance(userId) {
  const wallet = await Wallet.findOne({ where: { holder_type: 'App\\User', holder_id: userId } });
  return wallet ? { wallet, balance: parseFloat(wallet.balance) } : { wallet: null, balance: 0 };
}

async function walletWithdraw(userId, amount, description) {
  const { wallet } = await getWalletBalance(userId);
  if (!wallet) return;
  await wallet.decrement('balance', { by: amount });
  await Transaction.create({ payable_type: 'App\\User', payable_id: userId, wallet_id: wallet.id, type: 'withdraw', amount, confirmed: true, meta: JSON.stringify({ description }) });
}

async function walletDeposit(userId, amount, description) {
  let wallet = await Wallet.findOne({ where: { holder_type: 'App\\User', holder_id: userId } });
  if (!wallet) wallet = await Wallet.create({ holder_type: 'App\\User', holder_id: userId, balance: 0 });
  await wallet.increment('balance', { by: amount });
  await Transaction.create({ payable_type: 'App\\User', payable_id: userId, wallet_id: wallet.id, type: 'deposit', amount, confirmed: true, meta: JSON.stringify({ description }) });
}

exports.placeOrder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const settings = await getSettings();
    const { order: orderItems, location, method, coupon, delivery_type, tipAmount, cash_change_amount, order_comment, payment_token, pending_payment, partial_wallet, schedule_date, schedule_slot } = req.body;

    const restaurant_id = orderItems[0].restaurant_id;
    const restaurant = await Restaurant.findByPk(restaurant_id);

    const lastOrder = await Order.findOne({ order: [['id', 'DESC']] });
    const newId = lastOrder ? lastOrder.id + 1 : 1;
    const uniqueId = hashids.encode(newId);
    const unique_order_id = `OD-${new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }).replace('/', '-')}-${randomString(4).toUpperCase()}-${uniqueId.toUpperCase()}`;

    let orderstatus_id = 1;
    let is_scheduled = false;

    if (pending_payment || ['MERCADOPAGO', 'PAYTM', 'RAZORPAY'].includes(method)) {
      orderstatus_id = 8;
    } else if (restaurant.auto_acceptable) {
      orderstatus_id = 2;
    }

    if (schedule_date && schedule_slot) {
      is_scheduled = true;
      orderstatus_id = restaurant.auto_acceptable ? 2 : 10;
    }

    // Calculate totals
    let orderTotal = 0;
    for (const oI of orderItems) {
      const originalItem = await Item.findByPk(oI.id);
      if (oI.selectedaddons && oI.selectedaddons.length) {
        // Has addons: price is only the sum of addons
        const addonSum = oI.selectedaddons.reduce((s, a) => s + parseFloat(a.price || 0), 0);
        orderTotal += addonSum * oI.quantity;
      } else {
        // No addons: use item base price
        orderTotal += parseFloat(originalItem.price) * oI.quantity;
      }
    }

    const sub_total = orderTotal;
    let coupon_name = null, coupon_amount = 0;

    if (coupon) {
      const c = await Coupon.findOne({ where: { code: coupon.code.toUpperCase() } });
      if (c) {
        coupon_name = c.code;
        if (c.discount_type === 'PERCENTAGE') {
          let disc = (c.discount / 100) * orderTotal;
          if (c.max_discount && disc >= c.max_discount) disc = parseFloat(c.max_discount);
          coupon_amount = disc;
        } else {
          coupon_amount = parseFloat(c.discount);
        }
        orderTotal -= coupon_amount;
        await c.increment('count', { transaction: t });
      }
    }

    let delivery_charge = 0, actual_delivery_charge = 0, distance = 0;
    const userAddress = req.body.user?.data?.default_address;

    if (delivery_type == 1 && userAddress) {
      distance = getDistance(userAddress.latitude, userAddress.longitude, restaurant.latitude, restaurant.longitude);
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
      actual_delivery_charge = delivery_charge;
    }

    if (restaurant.free_delivery_subtotal > 0 && sub_total >= restaurant.free_delivery_subtotal) {
      delivery_charge = 0;
    }

    orderTotal += delivery_charge + parseFloat(restaurant.restaurant_charges || 0);

    let tax_amount = 0;
    if (settings.taxApplicable === 'true') {
      tax_amount = (parseFloat(settings.taxPercentage) / 100) * orderTotal;
    }
    orderTotal += tax_amount;

    if (tipAmount) orderTotal += parseFloat(tipAmount);

    const { balance: walletBalance } = await getWalletBalance(user.id);
    let payable = orderTotal;
    if (method === 'COD' && partial_wallet) payable = orderTotal - walletBalance;

    const newOrder = await Order.create({
      unique_order_id, user_id: user.id, restaurant_id, orderstatus_id,
      total: orderTotal, sub_total, delivery_charge, actual_delivery_charge,
      restaurant_charge: restaurant.restaurant_charges, tax: settings.taxPercentage || 0,
      tax_amount, coupon_name, coupon_amount, tip_amount: tipAmount || 0,
      payment_mode: method, transaction_id: payment_token,
      address: delivery_type == 2 ? 'NA' : (location?.address || userAddress?.address || ''),
      location: JSON.stringify(location), delivery_type,
      delivery_pin: Math.random().toString().slice(2, 7),
      order_comment, distance, cash_change_amount: cash_change_amount || null,
      is_scheduled, schedule_date: schedule_date ? JSON.stringify(schedule_date) : null,
      schedule_slot: schedule_slot ? JSON.stringify(schedule_slot) : null,
      zone_id: restaurant.zone_id || null, payable,
    }, { transaction: t });

    // Wallet deductions
    if (partial_wallet && walletBalance > 0) {
      newOrder.wallet_amount = walletBalance;
      await newOrder.save({ transaction: t });
      await walletWithdraw(user.id, walletBalance, `Partial payment for order ${unique_order_id}`);
    }
    if (method === 'WALLET') {
      newOrder.wallet_amount = orderTotal;
      await newOrder.save({ transaction: t });
      await walletWithdraw(user.id, orderTotal, `Payment for order ${unique_order_id}`);
    }

    // Save order items
    for (const oI of orderItems) {
      const originalItem = await Item.findByPk(oI.id);
      const itemName = oI.name || (originalItem ? originalItem.name : 'Item');
      let itemPrice = parseFloat(oI.price) || 0;
      // If has addons, price is sum of addons
      if (oI.selectedaddons && oI.selectedaddons.length) {
        const addonSum = oI.selectedaddons.reduce((s, a) => s + parseFloat(a.price || 0), 0);
        if (addonSum > 0) itemPrice = addonSum;
        else if (!itemPrice && originalItem) itemPrice = parseFloat(originalItem.price);
      } else if (!itemPrice && originalItem) {
        itemPrice = parseFloat(originalItem.price);
      }
      const item = await Orderitem.create({ order_id: newOrder.id, item_id: oI.id, name: itemName, quantity: oI.quantity, price: itemPrice }, { transaction: t });
      if (oI.selectedaddons) {
        for (const sa of oI.selectedaddons) {
          await OrderItemAddon.create({ orderitem_id: item.id, addon_category_name: sa.addon_category_name || '', addon_name: sa.addon_name || sa.name || '', addon_price: sa.price || 0 }, { transaction: t });
        }
      }
    }

    await t.commit();

    // Send notifications
    const { notifyStoreNewOrder, notifyDeliveryNewOrder } = require('../helpers/notifications');
    await notifyStoreNewOrder(newOrder, restaurant_id);
    // If auto-accepted (status 2), also notify delivery guys
    if (newOrder.orderstatus_id === 2) await notifyDeliveryNewOrder(newOrder);

    res.json({ success: true, data: newOrder });
  } catch (err) {
    await t.rollback();
    res.status(500).json({ success: false, data: err.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { count, rows } = await Order.findAndCountAll({
      where: { user_id: req.user.id },
      include: [
        { association: 'orderitems', include: [{ association: 'order_item_addons' }] },
        { association: 'restaurant' },
        { association: 'rating' },
      ],
      order: [['id', 'DESC']],
      limit: 10,
      offset: ((req.body.page || 1) - 1) * 10,
    });

    const data = rows.map(o => {
      const obj = o.toJSON();
      obj.is_ratable = o.orderstatus_id == 5 && !o.rating;
      return obj;
    });

    res.json({ data, total: count, per_page: 10, current_page: req.body.page || 1 });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

exports.getOrderItems = async (req, res) => {
  try {
    const items = await Orderitem.findAll({ where: { order_id: req.body.order_id } });
    res.json(items);
  } catch (err) {
    res.status(401).json({ success: false });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findByPk(req.body.order_id);
    if (!order || order.user_id !== req.user.id || ![1, 10].includes(order.orderstatus_id)) {
      return res.json({ success: false, refund: false });
    }

    let refund = false;
    if (order.payment_mode === 'COD') {
      if (order.wallet_amount) {
        await walletDeposit(req.user.id, parseFloat(order.wallet_amount), `Partial refund for order ${order.unique_order_id}`);
        refund = true;
      }
    } else {
      await walletDeposit(req.user.id, parseFloat(order.total), `Refund for order ${order.unique_order_id}`);
      refund = true;
    }

    await order.update({ orderstatus_id: 6 });
    res.json({ success: true, refund });
  } catch (err) {
    res.status(500).json({ success: false, refund: false });
  }
};
