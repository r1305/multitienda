const { Op } = require('sequelize');
const { Restaurant, Item, ItemCategory, AddonCategory, Addon, RestaurantCategory, sequelize } = require('../models');
const rq = require('../helpers/restaurantQueries');

exports.getDeliveryRestaurants = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const list = await rq.getRestaurantsForLocation({
      deliveryTypes: [1, 3],
      latitude,
      longitude,
      cachePrefix: 'restaurants:delivery',
    });
    res.json(list);
  } catch (err) {
    console.error('[getDeliveryRestaurants]', err.message);
    res.status(500).json({ error: err.message });
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
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};

exports.searchRestaurants = async (req, res) => {
  try {
    const { q, latitude, longitude } = req.body;
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
    res.status(500).json({ error: err.message });
  }
};

exports.getSingleItem = async (req, res) => {
  try {
    const item = await Item.findOne({
      where: { id: req.body.id, is_active: 1 },
      include: [{ model: AddonCategory, as: 'addon_categories', include: [{ model: Addon, as: 'addons', where: { is_active: 1 }, required: false }] }],
    });
    if (item) res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};

exports.checkCartItemsAvailability = async (req, res) => {
  try {
    const ids = req.body.items.map((i) => i.id);
    const items = await Item.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['id', 'price', 'is_active'] });
    res.json(items.map((i) => ({ id: i.id, price: i.price, is_active: i.is_active })));
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    if (!r) return res.status(400).json({ error: 'Restaurant not found' });
    r.avgRating = await rq.getAvgRatingForRestaurant(r.id);
    const data = r.toJSON();
    delete data.delivery_areas;
    data.is_operational = rq.checkOperation(req.body.latitude, req.body.longitude, r);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    res.status(500).json({ error: err.message });
  }
};
