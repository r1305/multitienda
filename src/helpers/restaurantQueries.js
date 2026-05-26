const { sequelize } = require('../models');
const { getDistance } = require('./utils');
const cache = require('./cache');

const RESTAURANT_SELECT = `
  r.id, r.name, r.description, r.image, r.latitude, r.longitude,
  r.delivery_radius, r.delivery_time, r.price_range, r.slug, r.is_featured, r.is_active,
  r.custom_featured_name, r.custom_message_on_list, r.order_column,
  (SELECT ROUND(AVG(rating_store), 1) FROM ratings WHERE restaurant_id = r.id) AS avgRating
`;

function checkOperation(lat, lon, restaurant) {
  if (!lat || !lon) return true;
  const distance = getDistance(lat, lon, restaurant.latitude, restaurant.longitude);
  const radius = parseFloat(restaurant.delivery_radius) || 50;
  return distance <= radius;
}

function mapRow(r, latitude, longitude) {
  const avg = r.avgRating != null ? String(parseFloat(r.avgRating).toFixed(1)).replace('.0', '') : '0';
  const distance = latitude && longitude
    ? getDistance(latitude, longitude, r.latitude, r.longitude)
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
    custom_featured_name: r.custom_featured_name,
    custom_message_on_list: r.custom_message_on_list,
  };
}

async function queryRestaurants(deliveryTypes, isActive) {
  const types = Array.isArray(deliveryTypes) ? deliveryTypes : [deliveryTypes];
  const placeholders = types.map(() => '?').join(',');
  const [rows] = await sequelize.query(
    `SELECT ${RESTAURANT_SELECT}
     FROM restaurants r
     WHERE r.is_accepted = 1 AND r.is_active = ? AND r.delivery_type IN (${placeholders})
     ORDER BY r.order_column ASC`,
    { replacements: [isActive ? 1 : 0, ...types] }
  );
  return rows;
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

  const process = (rows) => rows
    .filter((r) => checkOperation(latitude, longitude, r))
    .map((r) => mapRow(r, latitude, longitude));

  const result = [...process(activeRows), ...process(inactiveRows)];
  await cache.set(cacheKey, result, parseInt(process.env.CACHE_RESTAURANTS_TTL || '120', 10));
  return result;
}

async function getAvgRatingForRestaurant(restaurantId) {
  const [[row]] = await sequelize.query(
    'SELECT ROUND(AVG(rating_store), 1) AS avgRating FROM ratings WHERE restaurant_id = ?',
    { replacements: [restaurantId] }
  );
  if (!row || row.avgRating == null) return '0';
  return String(parseFloat(row.avgRating).toFixed(1)).replace('.0', '');
}

module.exports = {
  checkOperation,
  getRestaurantsForLocation,
  getAvgRatingForRestaurant,
  mapRow,
  queryRestaurants,
};
