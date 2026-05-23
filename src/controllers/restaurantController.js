const { Op } = require('sequelize');
const { Restaurant, Item, ItemCategory, AddonCategory, Addon, RestaurantCategory, sequelize } = require('../models');
const { getDistance, storeAvgRating } = require('../helpers/utils');

function checkOperation(lat, lon, restaurant) {
  if (!lat || !lon) return true;
  const distance = getDistance(lat, lon, restaurant.latitude, restaurant.longitude);
  const radius = parseFloat(restaurant.delivery_radius) || 50;
  return distance <= radius;
}

function mapRestaurant(r) {
  const obj = r.toJSON ? r.toJSON() : r;
  return {
    id: obj.id, name: obj.name, description: obj.description, image: obj.image,
    rating: obj.rating, avgRating: obj.avgRating, delivery_time: obj.delivery_time,
    price_range: obj.price_range, slug: obj.slug, is_featured: obj.is_featured,
    is_active: obj.is_active, distance: obj.distance,
    custom_featured_name: obj.custom_featured_name,
    custom_message_on_list: obj.custom_message_on_list,
  };
}

exports.getDeliveryRestaurants = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const active = await Restaurant.findAll({ where: { is_accepted: 1, is_active: 1, delivery_type: [1, 3] }, include: [{ association: 'ratings' }], order: [['order_column', 'ASC']] });
    const inactive = await Restaurant.findAll({ where: { is_accepted: 1, is_active: 0, delivery_type: [1, 3] }, include: [{ association: 'ratings' }], order: [['order_column', 'ASC']] });

    const process = (list) => list
      .filter(r => checkOperation(latitude, longitude, r))
      .map(r => { r.distance = getDistance(latitude, longitude, r.latitude, r.longitude); r.avgRating = storeAvgRating(r.ratings); return mapRestaurant(r); });

    res.json([...process(active), ...process(inactive)]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSelfPickupRestaurants = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const active = await Restaurant.findAll({ where: { is_accepted: 1, is_active: 1, delivery_type: [2, 3] }, include: [{ association: 'ratings' }], order: [['order_column', 'ASC']] });
    const inactive = await Restaurant.findAll({ where: { is_accepted: 1, is_active: 0, delivery_type: [2, 3] }, include: [{ association: 'ratings' }], order: [['order_column', 'ASC']] });

    const process = (list) => list
      .filter(r => checkOperation(latitude, longitude, r))
      .map(r => { r.distance = getDistance(latitude, longitude, r.latitude, r.longitude); r.avgRating = storeAvgRating(r.ratings); return mapRestaurant(r); });

    res.json([...process(active), ...process(inactive)]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRestaurantInfo = async (req, res) => {
  try {
    const r = await Restaurant.findOne({ where: { slug: req.params.slug }, include: [{ association: 'ratings' }] });
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.avgRating = storeAvgRating(r.ratings);
    if (!r.is_accepted) r.is_active = false;
    const data = r.toJSON();
    delete data.delivery_areas; delete data.ratings; delete data.commission_rate;
    data.is_favorited = false;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRestaurantInfoWithFavourite = async (req, res) => {
  try {
    const r = await Restaurant.findOne({ where: { slug: req.params.slug }, include: [{ association: 'ratings' }] });
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.avgRating = storeAvgRating(r.ratings);
    if (!r.is_accepted) r.is_active = false;
    const data = r.toJSON();
    delete data.delivery_areas; delete data.ratings; delete data.commission_rate;

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
    const r = await Restaurant.findByPk(req.params.id, { include: [{ association: 'ratings' }] });
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.avgRating = storeAvgRating(r.ratings);
    if (!r.is_accepted) r.is_active = false;
    const data = r.toJSON();
    delete data.delivery_areas; delete data.ratings; delete data.commission_rate;
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

    const rec = recommended.map(r => { const j = r.toJSON(); j.price = parseFloat(j.price); j.old_price = parseFloat(j.old_price || 0); return j; });

    res.json({ recommended: rec, items: grouped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.searchRestaurants = async (req, res) => {
  try {
    const { q, latitude, longitude } = req.body;
    const restaurants = await Restaurant.findAll({
      where: { name: { [Op.like]: `%${q}%` }, is_accepted: 1 },
      include: [{ association: 'ratings' }],
      limit: 20,
    });

    const nearRestaurants = restaurants.filter(r => checkOperation(latitude, longitude, r)).map(r => {
      r.avgRating = storeAvgRating(r.ratings);
      return r;
    });

    const items = await Item.findAll({
      where: { is_active: 1, name: { [Op.like]: `%${q}%` } },
      include: [{ association: 'restaurant' }],
    });

    const nearItems = items.filter(i => i.restaurant?.is_active && i.restaurant?.is_accepted && checkOperation(latitude, longitude, i.restaurant)).slice(0, 20);

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

    const process = async (is_active) => {
      const list = await Restaurant.findAll({
        where: { is_accepted: 1, is_active },
        include: [{ model: RestaurantCategory, as: 'restaurant_categories', where: { id: { [Op.in]: category_ids } }, required: true }, { association: 'ratings' }],
      });
      return list.filter(r => checkOperation(latitude, longitude, r)).map(r => {
        r.avgRating = storeAvgRating(r.ratings);
        return mapRestaurant(r);
      });
    };

    res.json([...await process(1), ...await process(0)]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.checkCartItemsAvailability = async (req, res) => {
  try {
    const ids = req.body.items.map(i => i.id);
    const items = await Item.findAll({ where: { id: { [Op.in]: ids } } });
    res.json(items.map(i => ({ id: i.id, price: i.price, is_active: i.is_active })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.checkRestaurantOperationService = async (req, res) => {
  try {
    const r = await Restaurant.findByPk(req.body.restaurant_id);
    if (!r) return res.json(false);
    res.json(checkOperation(req.body.latitude, req.body.longitude, r));
  } catch (err) {
    res.status(500).json(false);
  }
};

exports.getRestaurantInfoAndOperationalStatus = async (req, res) => {
  try {
    const r = await Restaurant.findByPk(req.body.id, { include: [{ association: 'ratings' }] });
    if (!r) return res.status(400).json({ error: 'Restaurant not found' });
    r.avgRating = storeAvgRating(r.ratings);
    const data = r.toJSON();
    delete data.delivery_areas;
    data.is_operational = checkOperation(req.body.latitude, req.body.longitude, r);
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
    const ids = favs.map(f => f.favoriteable_id);
    if (!ids.length) return res.json([]);

    const restaurants = await Restaurant.findAll({ where: { id: { [Op.in]: ids } }, include: [{ association: 'ratings' }] });
    const result = restaurants.filter(r => checkOperation(latitude, longitude, r)).map(r => {
      r.avgRating = storeAvgRating(r.ratings);
      return mapRestaurant(r);
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
