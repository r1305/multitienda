const MAX_QUANTITY = 99;
const MAX_LINES = 100;
const MAX_TIP = 10000;
const WALLET_METHOD = 'WALLET';
const DEFAULT_CASH_METHOD = 'COD';
const PENDING_PAYMENT_METHODS = ['MERCADOPAGO', 'PAYTM', 'RAZORPAY'];

class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

function toMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function toPositiveId(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeMethod(m) {
  return typeof m === 'string' ? m.trim().toUpperCase() : '';
}

function resolveAllowedMethods(activeGatewayNames) {
  const names = (activeGatewayNames || []).map(normalizeMethod).filter(Boolean);
  const allowed = names.length ? names : [DEFAULT_CASH_METHOD];
  if (!allowed.includes(WALLET_METHOD)) allowed.push(WALLET_METHOD);
  return allowed;
}

function assertMethodAllowed(method, allowedMethods) {
  const m = normalizeMethod(method);
  if (!m || !allowedMethods.includes(m)) {
    throw new OrderValidationError('Método de pago no válido o no habilitado');
  }
  return m;
}

function parseQuantity(q) {
  const n = Number(q);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QUANTITY) {
    throw new OrderValidationError(`Cantidad inválida: debe ser un entero entre 1 y ${MAX_QUANTITY}`);
  }
  return n;
}

function parseTip(tip) {
  if (tip === undefined || tip === null || tip === '') return 0;
  const n = Number(tip);
  if (!Number.isFinite(n) || n < 0 || n > MAX_TIP) {
    throw new OrderValidationError('Propina inválida');
  }
  return toMoney(n);
}

function normalizeLines(orderItems) {
  if (!Array.isArray(orderItems) || !orderItems.length) {
    throw new OrderValidationError('El carrito está vacío');
  }
  if (orderItems.length > MAX_LINES) {
    throw new OrderValidationError('El carrito tiene demasiados productos');
  }
  return orderItems.map((oI) => {
    const item_id = toPositiveId(oI && oI.id);
    if (!item_id) throw new OrderValidationError('Producto inválido en el carrito');
    const quantity = parseQuantity(oI.quantity);
    const rawAddons = Array.isArray(oI.selectedaddons) ? oI.selectedaddons : [];
    const addon_ids = rawAddons.map((a) => {
      const id = toPositiveId(a && (a.addon_id !== undefined ? a.addon_id : a.id));
      if (!id) throw new OrderValidationError('Complemento inválido en el carrito');
      return id;
    });
    return { item_id, quantity, addon_ids };
  });
}

function collectIds(lines) {
  const itemIds = [...new Set(lines.map((l) => l.item_id))];
  const addonIds = [...new Set(lines.flatMap((l) => l.addon_ids))];
  return { itemIds, addonIds };
}

function priceLines(lines, catalog) {
  const { items = [], addons = [], links = [], restaurantId = null } = catalog;
  const itemsById = new Map(items.map((i) => [Number(i.id), i]));
  const addonsById = new Map(addons.map((a) => [Number(a.id), a]));
  const linkSet = new Set(links.map((l) => `${Number(l.item_id)}:${Number(l.addon_category_id)}`));

  let subTotal = 0;
  const priced = lines.map((line) => {
    const item = itemsById.get(line.item_id);
    if (!item) throw new OrderValidationError('Un producto del carrito ya no existe');
    if (restaurantId != null && Number(item.restaurant_id) !== Number(restaurantId)) {
      throw new OrderValidationError(`El producto "${item.name}" no pertenece a esta tienda`);
    }
    if (!item.is_active) {
      throw new OrderValidationError(`El producto "${item.name}" no está disponible`);
    }
    const lineAddons = line.addon_ids.map((aid) => {
      const addon = addonsById.get(aid);
      if (!addon || !addon.is_active) {
        throw new OrderValidationError(`Un complemento de "${item.name}" no está disponible`);
      }
      if (!linkSet.has(`${Number(item.id)}:${Number(addon.addon_category_id)}`)) {
        throw new OrderValidationError(`Un complemento no corresponde al producto "${item.name}"`);
      }
      return addon;
    });
    const unitPrice = lineAddons.length
      ? toMoney(lineAddons.reduce((s, a) => s + toMoney(a.price), 0))
      : toMoney(item.price);
    const lineTotal = toMoney(unitPrice * line.quantity);
    subTotal += lineTotal;
    return { item, quantity: line.quantity, unit_price: unitPrice, line_total: lineTotal, addons: lineAddons };
  });

  return { lines: priced, sub_total: toMoney(subTotal) };
}

function evaluateCoupon(coupon, { subTotal, restaurantId, userUses = 0 }) {
  if (!coupon) return { ok: false, message: 'Cupón inválido' };
  if (coupon.restaurant_id && restaurantId && Number(coupon.restaurant_id) !== Number(restaurantId)) {
    return { ok: false, message: 'Cupón no válido para esta tienda' };
  }
  const count = Number(coupon.count || 0);
  const maxCount = Number(coupon.max_count || 0);
  if (maxCount > 0 && count >= maxCount) return { ok: false, message: 'Cupón agotado' };
  const sub = toMoney(subTotal);
  const minSub = toMoney(coupon.min_sub_total);
  if (minSub > 0 && sub < minSub) return { ok: false, message: 'Pedido mínimo: ' + minSub.toFixed(2) };
  const maxSub = toMoney(coupon.max_sub_total);
  if (maxSub > 0 && sub > maxSub) return { ok: false, message: 'Pedido máximo para este cupón: ' + maxSub.toFixed(2) };
  const maxPerUser = Number(coupon.max_count_per_user || 0);
  if (maxPerUser > 0 && Number(userUses) >= maxPerUser) {
    return { ok: false, message: 'Ya usaste este cupón el máximo de veces permitido' };
  }
  const discount = toMoney(coupon.discount);
  if (discount <= 0) return { ok: false, message: 'Cupón inválido' };
  let amount;
  if (coupon.discount_type === 'PERCENTAGE') {
    if (discount > 100) return { ok: false, message: 'Cupón inválido' };
    amount = (discount / 100) * sub;
    const maxDiscount = toMoney(coupon.max_discount);
    if (maxDiscount > 0 && amount > maxDiscount) amount = maxDiscount;
  } else {
    amount = discount;
  }
  amount = toMoney(Math.min(Math.max(0, amount), sub));
  return { ok: true, amount };
}

function computeTotal({ subTotal, couponAmount = 0, deliveryCharge = 0, restaurantCharge = 0, tip = 0 }) {
  return toMoney(Math.max(0, toMoney(subTotal) - toMoney(couponAmount) + toMoney(deliveryCharge) + toMoney(restaurantCharge) + toMoney(tip)));
}

function splitWalletPayment({ method, total, walletBalance, partialWallet }) {
  const t = toMoney(total);
  const balance = toMoney(walletBalance);
  if (method === WALLET_METHOD) {
    if (balance < t) throw new OrderValidationError('Saldo insuficiente en la billetera');
    return { walletAmount: t, payable: 0 };
  }
  if (partialWallet && balance > 0) {
    const used = toMoney(Math.min(balance, t));
    return { walletAmount: used, payable: toMoney(t - used) };
  }
  return { walletAmount: 0, payable: t };
}

function refundableAmount(order) {
  return toMoney(order && order.wallet_amount ? order.wallet_amount : 0);
}

function computeDeliveryEarning(dg, order) {
  if (!dg || !order) return 0;
  let earning = 0;
  if (dg.commission_type === 'percentage') {
    const base = dg.percentage_base === 'delivery_charge' ? parseFloat(order.delivery_charge || 0) : parseFloat(order.sub_total || order.total || 0);
    earning = base * parseFloat(dg.commission_rate || 0) / 100;
  } else if (dg.commission_type === 'dynamic') {
    const distance = parseFloat(order.distance || 0);
    const baseDist = parseFloat(dg.dynamic_base_distance || 0);
    const basePrice = parseFloat(dg.dynamic_base_price || 0);
    const pricePerKm = parseFloat(dg.dynamic_price_per_km || 0);
    earning = distance <= baseDist ? basePrice : basePrice + (distance - baseDist) * pricePerKm;
  } else {
    earning = parseFloat(dg.fixed_commission || 0);
  }
  return toMoney(Math.max(0, earning));
}

// Regla: la propina va 100% al repartidor y se suma a su ganancia. tip_commission_rate ya no se usa.
function computeDeliveryPayout(dg, order) {
  const commission = computeDeliveryEarning(dg, order);
  const tip = toMoney(Math.max(0, parseFloat((order && order.tip_amount) || 0) || 0));
  return { commission, tip, amount: toMoney(commission + tip) };
}

const COORD_TOLERANCE = 0.000001;

function pickDeliveryAddress(savedAddresses, { addressId, lat, lng, defaultAddressId } = {}) {
  const list = (Array.isArray(savedAddresses) ? savedAddresses : []).filter(
    (a) => a && Number.isFinite(parseFloat(a.latitude)) && Number.isFinite(parseFloat(a.longitude))
  );
  if (!list.length) return null;
  const byId = toPositiveId(addressId);
  if (byId) return list.find((a) => Number(a.id) === byId) || null;
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  if (Number.isFinite(la) && Number.isFinite(ln) && (la !== 0 || ln !== 0)) {
    return list.find((a) => Math.abs(parseFloat(a.latitude) - la) <= COORD_TOLERANCE
      && Math.abs(parseFloat(a.longitude) - ln) <= COORD_TOLERANCE) || null;
  }
  const defId = toPositiveId(defaultAddressId);
  if (defId) return list.find((a) => Number(a.id) === defId) || null;
  return null;
}

module.exports = {
  MAX_QUANTITY,
  WALLET_METHOD,
  DEFAULT_CASH_METHOD,
  PENDING_PAYMENT_METHODS,
  OrderValidationError,
  toMoney,
  toPositiveId,
  normalizeMethod,
  resolveAllowedMethods,
  assertMethodAllowed,
  parseQuantity,
  parseTip,
  normalizeLines,
  collectIds,
  priceLines,
  evaluateCoupon,
  computeTotal,
  splitWalletPayment,
  refundableAmount,
  computeDeliveryEarning,
  computeDeliveryPayout,
  pickDeliveryAddress,
};
