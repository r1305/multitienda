const { Op } = require('sequelize');
const { Restaurant, Item, ItemCategory, AddonCategory, Addon, RestaurantCategory, sequelize } = require('../models');
const rq = require('../helpers/restaurantQueries');
const { escapeLike } = require('../helpers/utils');
const businessTypes = require('../helpers/businessTypes');

async function applyBusinessTypeFilter(list, businessTypeId) {
  if (businessTypeId === undefined || businessTypeId === null || businessTypeId === '') return list;
  const active = await businessTypes.listActiveBusinessTypes(sequelize);
  return businessTypes.filterStoresByBusinessType(list, businessTypeId, active);
}

exports.getBusinessTypes = async (req, res) => {
  try {
    res.json(await businessTypes.listActiveBusinessTypes(sequelize));
  } catch (err) {
    console.error('[restaurant] business types', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getDeliveryRestaurants = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const list = await rq.getRestaurantsForLocation({
      deliveryTypes: [1, 3],
      latitude,
      longitude,
      cachePrefix: 'restaurants:delivery',
    });
    res.json(await applyBusinessTypeFilter(list, req.body.business_type_id));
  } catch (err) {
    console.error('[getDeliveryRestaurants]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getSelfPickupRestaurants = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const list = await rq.getRestaurantsForLocation({
      deliveryTypes: [2, 3],
      latitude,
      longitude,
      cachePrefix: 'restaurants:pickup',
    });
    res.json(await applyBusinessTypeFilter(list, req.body.business_type_id));
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

async function loadRestaurantBySlug(slug) {
  const r = await Restaurant.findOne({ where: { slug } });
  if (!r) return null;
  r.avgRating = await rq.getAvgRatingForRestaurant(r.id);
  if (!r.is_accepted) r.is_active = false;
  return r;
}

exports.getRestaurantInfo = async (req, res) => {
  try {
    const r = await loadRestaurantBySlug(req.params.slug);
    if (!r) return res.status(404).json({ error: 'Not found' });
    const data = r.toJSON();
    delete data.delivery_areas;
    delete data.commission_rate;
    data.is_favorited = false;
    res.json(data);
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getRestaurantInfoWithFavourite = async (req, res) => {
  try {
    const r = await loadRestaurantBySlug(req.params.slug);
    if (!r) return res.status(404).json({ error: 'Not found' });
    const data = r.toJSON();
    delete data.delivery_areas;
    delete data.commission_rate;

    const [fav] = await sequelize.query(
      'SELECT id FROM favorites WHERE user_id = ? AND favoriteable_id = ? AND favoriteable_type = ?',
      { replacements: [req.user.id, r.id, 'App\\Restaurant'], type: sequelize.QueryTypes.SELECT }
    );
    data.is_favorited = !!fav;
    res.json(data);
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getRestaurantInfoById = async (req, res) => {
  try {
    const r = await Restaurant.findByPk(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.avgRating = await rq.getAvgRatingForRestaurant(r.id);
    if (!r.is_accepted) r.is_active = false;
    const data = r.toJSON();
    delete data.delivery_areas;
    delete data.commission_rate;
    res.json(data);
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getRestaurantItems = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ where: { slug: req.params.slug } });
    if (!restaurant) return res.status(404).json({ error: 'Not found' });

    const addonInclude = {
      model: AddonCategory, as: 'addon_categories',
      include: [{ model: Addon, as: 'addons', where: { is_active: 1 }, required: false }],
    };

    const recommended = await Item.findAll({
      where: { restaurant_id: restaurant.id, is_recommended: 1, is_active: 1 },
      include: [addonInclude, { model: ItemCategory, as: 'item_category', where: { is_enabled: 1 } }],
      order: [['order_column', 'ASC']],
    });

    const items = await Item.findAll({
      where: { restaurant_id: restaurant.id, is_active: 1 },
      include: [addonInclude, { model: ItemCategory, as: 'item_category', where: { is_enabled: 1 }, required: true }],
      order: [[{ model: ItemCategory, as: 'item_category' }, 'order_column', 'ASC'], ['order_column', 'ASC']],
    });

    const grouped = {};
    for (const item of items) {
      const catName = item.item_category?.name || 'Other';
      if (!grouped[catName]) grouped[catName] = [];
      const itemJson = item.toJSON();
      itemJson.price = parseFloat(itemJson.price);
      itemJson.old_price = parseFloat(itemJson.old_price || 0);
      grouped[catName].push(itemJson);
    }

    const rec = recommended.map((r) => {
      const j = r.toJSON();
      j.price = parseFloat(j.price);
      j.old_price = parseFloat(j.old_price || 0);
      return j;
    });

    res.json({ recommended: rec, items: grouped });
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.searchRestaurants = async (req, res) => {
  try {
    const { q: qRaw, latitude, longitude } = req.body;
    const q = escapeLike(qRaw);
    const rows = await Restaurant.findAll({
      where: { name: { [Op.like]: `%${q}%` }, is_accepted: 1 },
      limit: 20,
      raw: true,
    });
    const avgMap = await rq.loadAvgRatings(rows.map((r) => r.id));
    const withAvg = rows.map((r) => ({ ...r, avgRating: avgMap[r.id] ?? r.rating }));

    const nearRestaurants = withAvg
      .filter((r) => r.is_accepted && rq.checkOperation(latitude, longitude, r))
      .map((r) => rq.mapRow(r, latitude, longitude));

    const items = await Item.findAll({
      where: { is_active: 1, name: { [Op.like]: `%${q}%` } },
      include: [{ association: 'restaurant' }],
      limit: 40,
    });

    const nearItems = items
      .filter((i) => i.restaurant?.is_active && i.restaurant?.is_accepted && rq.checkOperation(latitude, longitude, i.restaurant))
      .slice(0, 20);

    res.json({ restaurants: nearRestaurants, items: nearItems });
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getSingleItem = async (req, res) => {
  try {
    const item = await Item.findOne({
      where: { id: req.body.id, is_active: 1 },
      include: [{ model: AddonCategory, as: 'addon_categories', include: [{ model: Addon, as: 'addons', where: { is_active: 1 }, required: false }] }],
    });
    if (!item) return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    res.json(item);
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getFilteredRestaurants = async (req, res) => {
  try {
    const { latitude, longitude, category_ids } = req.body;
    if (!category_ids?.length) return res.json([]);

    const rows = await Restaurant.findAll({
      where: { is_accepted: 1 },
      include: [{
        model: RestaurantCategory,
        as: 'restaurant_categories',
        where: { id: { [Op.in]: category_ids } },
        required: true,
        attributes: [],
      }],
      order: [['order_column', 'ASC']],
      raw: true,
    });
    const avgMap = await rq.loadAvgRatings(rows.map((r) => r.id));
    const withAvg = rows.map((r) => ({ ...r, avgRating: avgMap[r.id] ?? r.rating }));

    const active = withAvg.filter((r) => r.is_active).filter((r) => rq.checkOperation(latitude, longitude, r)).map((r) => rq.mapRow(r, latitude, longitude));
    const inactive = withAvg.filter((r) => !r.is_active).filter((r) => rq.checkOperation(latitude, longitude, r)).map((r) => rq.mapRow(r, latitude, longitude));
    res.json([...active, ...inactive]);
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.checkCartItemsAvailability = async (req, res) => {
  try {
    const rules = require('../helpers/orderRules');
    const { loadCatalog } = require('../helpers/orderCatalog');
    const raw = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 100) : [];
    const lines = [];
    for (const i of raw) {
      try {
        const [line] = rules.normalizeLines([{ ...i, quantity: i && i.quantity !== undefined ? i.quantity : 1 }]);
        lines.push(line);
      } catch (_) { /* línea inválida: se omite */ }
    }
    if (!lines.length) return res.json([]);
    const restaurantId = rules.toPositiveId(req.body.restaurant_id);
    const data = await loadCatalog(lines);
    const found = new Set(data.items.map((it) => Number(it.id)));
    const result = lines.filter((l) => found.has(l.item_id)).map((line) => {
      try {
        const priced = rules.priceLines([line], { ...data, restaurantId });
        return { id: line.item_id, price: priced.lines[0].unit_price, is_active: true };
      } catch (_) {
        const item = data.items.find((it) => Number(it.id) === line.item_id);
        return { id: line.item_id, price: item ? rules.toMoney(item.price) : 0, is_active: false };
      }
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar el carrito' });
  }
};

exports.checkRestaurantOperationService = async (req, res) => {
  try {
    const r = await Restaurant.findByPk(req.body.restaurant_id, { attributes: ['id', 'latitude', 'longitude', 'delivery_radius'] });
    if (!r) return res.json(false);
    res.json(rq.checkOperation(req.body.latitude, req.body.longitude, r));
  } catch (err) {
    res.status(500).json(false);
  }
};

exports.getRestaurantInfoAndOperationalStatus = async (req, res) => {
  try {
    const r = await Restaurant.findByPk(req.body.id);
    if (!r) return res.status(400).json({ error: 'Comercio no encontrado' });
    r.avgRating = await rq.getAvgRatingForRestaurant(r.id);
    const data = r.toJSON();
    delete data.delivery_areas;
    data.is_operational = rq.checkOperation(req.body.latitude, req.body.longitude, r);
    res.json(data);
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

exports.getFavoriteStores = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const favs = await sequelize.query(
      'SELECT favoriteable_id FROM favorites WHERE user_id = ? AND favoriteable_type = ?',
      { replacements: [req.user.id, 'App\\Restaurant'], type: sequelize.QueryTypes.SELECT }
    );
    const ids = favs.map((f) => f.favoriteable_id);
    if (!ids.length) return res.json([]);

    const rows = await Restaurant.findAll({ where: { id: { [Op.in]: ids } }, raw: true });
    const avgMap = await rq.loadAvgRatings(ids);
    const withAvg = rows.map((r) => ({ ...r, avgRating: avgMap[r.id] ?? r.rating }));

    const result = withAvg
      .filter((r) => rq.checkOperation(latitude, longitude, r))
      .map((r) => rq.mapRow(r, latitude, longitude));
    res.json(result);
  } catch (err) {
    console.error('[restaurant]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const RATINGS_PAGE_SIZE = 10;
const RATINGS_MAX_PAGE_SIZE = 50;

// GET /api/restaurants/:id/ratings — público, paginado. Solo pedidos entregados; sin datos de usuario ni de pedido.
exports.getPublicRatings = async (req, res) => {
  try {
    const id = Number(req.params && req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ success: false });
    const store = await sequelize.query(
      'SELECT id FROM restaurants WHERE id = ? AND is_accepted = 1 LIMIT 1',
      { replacements: [id], type: sequelize.QueryTypes.SELECT }
    );
    if (!store.length) return res.status(404).json({ success: false });

    const page = Math.min(Math.max(parseInt(req.query && req.query.page, 10) || 1, 1), 100000);
    const perPage = Math.min(Math.max(parseInt(req.query && req.query.per_page, 10) || RATINGS_PAGE_SIZE, 1), RATINGS_MAX_PAGE_SIZE);
    const from = 'FROM ratings r JOIN orders o ON o.id = r.order_id WHERE r.restaurant_id = ? AND o.restaurant_id = r.restaurant_id AND o.orderstatus_id = 5 AND r.rating_store IS NOT NULL';

    const [summary] = await sequelize.query(
      `SELECT AVG(r.rating_store) AS average, COUNT(*) AS total ${from}`,
      { replacements: [id], type: sequelize.QueryTypes.SELECT }
    );

    const listSql = (withReply) => `SELECT r.rating_store AS rating, r.review_store AS comment, ${withReply ? 'r.reply' : 'NULL'} AS reply, r.created_at ${from} ORDER BY r.id DESC LIMIT ? OFFSET ?`;
    const replacements = [id, perPage, (page - 1) * perPage];
    let rows;
    try {
      rows = await sequelize.query(listSql(true), { replacements, type: sequelize.QueryTypes.SELECT });
    } catch (e) {
      rows = await sequelize.query(listSql(false), { replacements, type: sequelize.QueryTypes.SELECT });
    }

    const total = Number(summary && summary.total) || 0;
    res.json({
      success: true,
      average: total ? Math.round(Number(summary.average) * 10) / 10 : null,
      total,
      per_page: perPage,
      current_page: page,
      data: rows.map((r) => ({ rating: Number(r.rating), comment: r.comment, reply: r.reply || null, created_at: r.created_at })),
    });
  } catch (err) {
    console.error('[restaurant] ratings', err.message);
    res.status(500).json({ success: false });
  }
};
