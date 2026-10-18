const { QueryTypes } = require('sequelize');
const { Item, Addon, AddonCategory, Coupon, PaymentGateway, sequelize } = require('../models');
const rules = require('./orderRules');

async function getAllowedPaymentMethods() {
  const gateways = await PaymentGateway.findAll({ where: { is_active: 1 }, attributes: ['name'] });
  return rules.resolveAllowedMethods(gateways.map((g) => g.name));
}

async function loadCatalog(lines) {
  const { itemIds, addonIds } = rules.collectIds(lines);
  const items = itemIds.length
    ? await Item.findAll({ where: { id: itemIds }, attributes: ['id', 'name', 'price', 'is_active', 'restaurant_id'] })
    : [];
  const addons = addonIds.length
    ? await Addon.findAll({
        where: { id: addonIds },
        attributes: ['id', 'name', 'price', 'is_active', 'addon_category_id'],
        include: [{ model: AddonCategory, attributes: ['id', 'name'] }],
      })
    : [];
  const links = addonIds.length && itemIds.length
    ? await sequelize.query(
        'SELECT item_id, addon_category_id FROM addon_category_item WHERE item_id IN (?)',
        { replacements: [itemIds], type: QueryTypes.SELECT }
      )
    : [];
  return { items, addons, links };
}

async function countCouponUses(userId, couponCode, transaction) {
  const sql = 'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ? AND coupon_name = ? AND orderstatus_id NOT IN (6, 9)'
    + (transaction ? ' LOCK IN SHARE MODE' : '');
  const rows = await sequelize.query(sql, { replacements: [userId, couponCode], type: QueryTypes.SELECT, transaction });
  return rows[0] ? parseInt(rows[0].cnt, 10) || 0 : 0;
}

async function checkCoupon(code, { subTotal, restaurantId, userId, transaction } = {}) {
  if (!code || typeof code !== 'string') return { ok: false, message: 'Cupón inválido', coupon: null };
  const opts = { where: { code: code.trim().toUpperCase() } };
  if (transaction) { opts.transaction = transaction; opts.lock = transaction.LOCK.UPDATE; }
  const coupon = await Coupon.findOne(opts);
  if (!coupon) return { ok: false, message: 'Cupón inválido', coupon: null };
  let userUses = 0;
  if (Number(coupon.max_count_per_user || 0) > 0 && userId) {
    userUses = await countCouponUses(userId, coupon.code, transaction);
  }
  return { ...rules.evaluateCoupon(coupon, { subTotal, restaurantId, userUses }), coupon };
}

async function consumeCoupon(couponId, transaction) {
  const [, affected] = await sequelize.query(
    'UPDATE coupons SET count = COALESCE(count, 0) + 1, updated_at = NOW() WHERE id = ? AND (max_count IS NULL OR max_count <= 0 OR COALESCE(count, 0) < max_count)',
    { replacements: [couponId], type: QueryTypes.UPDATE, transaction }
  );
  if (affected !== 1) throw new rules.OrderValidationError('Cupón agotado');
}

module.exports = { getAllowedPaymentMethods, loadCatalog, checkCoupon, consumeCoupon };
