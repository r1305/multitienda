const { sequelize, Restaurant } = require('../models');
const { getDistance } = require('./utils');
const cache = require('./cache');

function safeDistance(lat1, lon1, lat2, lon2) {
  const a = parseFloat(lat1);
  const b = parseFloat(lon1);
  const c = parseFloat(lat2);
  const d = parseFloat(lon2);
  if (![a, b, c, d].every(Number.isFinite)) return null;
  return getDistance(a, b, c, d);
}

function checkOperation(lat, lon, restaurant) {
  const latN = parseFloat(lat);
  const lonN = parseFloat(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return true;

  const rLat = parseFloat(restaurant.latitude);
  const rLon = parseFloat(restaurant.longitude);
  if (!Number.isFinite(rLat) || !Number.isFinite(rLon)) return true;

  const distance = safeDistance(latN, lonN, rLat, rLon);
  if (distance == null) return true;
  const radius = parseFloat(restaurant.delivery_radius) || 50;
  return distance <= radius;
}

function formatAvgRating(value) {
  if (value == null || value === '') return '0';
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '0';
  return String(n.toFixed(1)).replace('.0', '');
}

function mapRow(r, latitude, longitude) {
  const avg = formatAvgRating(r.avgRating != null ? r.avgRating : r.rating);
  const latN = parseFloat(latitude);
  const lonN = parseFloat(longitude);
  const distance = Number.isFinite(latN) && Number.isFinite(lonN)
    ? safeDistance(latN, lonN, r.latitude, r.longitude)
    : null;

  return {
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    rating: r.rating,
    avgRating: avg,
    delivery_time: r.delivery_time,
    price_range: r.price_range,
    slug: r.slug,
    is_featured: r.is_featured,
    is_active: r.is_active,
    distance,
    custom_featured_name: r.custom_featured_name || null,
    custom_message_on_list: r.custom_message_on_list || null,
  };
}

async function loadAvgRatings(restaurantIds) {
  const map = {};
  if (!restaurantIds.length) return map;
  try {
    const placeholders = restaurantIds.map(() => '?').join(',');
    const [rows] = await sequelize.query(
      `SELECT restaurant_id, ROUND(AVG(rating_store), 1) AS avgRating
       FROM ratings
       WHERE restaurant_id IN (${placeholders})
       GROUP BY restaurant_id`,
      { replacements: restaurantIds }
    );
    rows.forEach((row) => { map[row.restaurant_id] = row.avgRating; });
  } catch (err) {
    console.warn('[restaurantQueries] ratings aggregate skipped:', err.message);
  }
  return map;
}

async function queryRestaurants(deliveryTypes, isActive) {
  const types = Array.isArray(deliveryTypes) ? deliveryTypes : [deliveryTypes];
  const placeholders = types.map(() => '?').join(',');
  const [rows] = await sequelize.query(
    `SELECT * FROM restaurants
     WHERE is_accepted = 1 AND is_active = ? AND delivery_type IN (${placeholders})
     ORDER BY order_column ASC`,
    { replacements: [isActive ? 1 : 0, ...types] }
  );
  const avgMap = await loadAvgRatings(rows.map((r) => r.id));
  return rows.map((r) => ({
    ...r,
    avgRating: avgMap[r.id] != null ? avgMap[r.id] : r.rating,
  }));
}

async function getRestaurantsForLocation({ deliveryTypes, latitude, longitude, cachePrefix }) {
  const latKey = cache.roundCoord(latitude);
  const lngKey = cache.roundCoord(longitude);
  const typesKey = deliveryTypes.join('-');
  const cacheKey = `${cachePrefix}:${typesKey}:${latKey}:${lngKey}`;

  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const [activeRows, inactiveRows] = await Promise.all([
    queryRestaurants(deliveryTypes, true),
    queryRestaurants(deliveryTypes, false),
  ]);

  const mapForLocation = (rows) => rows
    .filter((r) => checkOperation(latitude, longitude, r))
    .map((r) => mapRow(r, latitude, longitude));

  const ttl = parseInt(process.env.CACHE_RESTAURANTS_TTL || '120', 10);
  const result = [...mapForLocation(activeRows), ...mapForLocation(inactiveRows)];
  await cache.set(cacheKey, result, ttl);
  return result;
}

async function getAvgRatingForRestaurant(restaurantId) {
  try {
    const [rows] = await sequelize.query(
      'SELECT ROUND(AVG(rating_store), 1) AS avgRating FROM ratings WHERE restaurant_id = ?',
      { replacements: [restaurantId] }
    );
    if (rows && rows[0] && rows[0].avgRating != null) {
      return formatAvgRating(rows[0].avgRating);
    }
  } catch (_) { /* ratings table may differ */ }

  const r = await Restaurant.findByPk(restaurantId, { attributes: ['rating'], raw: true });
  return formatAvgRating(r ? r.rating : null);
}

module.exports = {
  checkOperation,
  getRestaurantsForLocation,
  getAvgRatingForRestaurant,
  loadAvgRatings,
  mapRow,
  queryRestaurants,
  safeDistance,
};
