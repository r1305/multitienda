const { QueryTypes } = require('sequelize');
const { sequelize, UserFavoriteStore } = require('../models');
const rules = require('../helpers/orderRules');

const MAX_FAVORITES = 100;

// Una tienda es favoriteable si existe y el administrador la tiene habilitada (is_accepted = 1).
async function findEnabledStore(id) {
  const rows = await sequelize.query(
    'SELECT id FROM restaurants WHERE id = ? AND is_accepted = 1 LIMIT 1',
    { replacements: [id], type: QueryTypes.SELECT }
  );
  return rows[0] || null;
}

exports.addFavoriteStore = async (req, res) => {
  try {
    const restaurantId = rules.toPositiveId(req.params && req.params.restaurantId);
    if (!restaurantId) return res.status(404).json({ success: false, message: 'Tienda no encontrada' });
    if (!(await findEnabledStore(restaurantId))) {
      return res.status(404).json({ success: false, message: 'Tienda no encontrada' });
    }
    const existing = await UserFavoriteStore.findOne({ where: { user_id: req.user.id, restaurant_id: restaurantId } });
    if (!existing) {
      const total = await UserFavoriteStore.count({ where: { user_id: req.user.id } });
      if (total >= MAX_FAVORITES) {
        return res.status(409).json({ success: false, message: `Máximo ${MAX_FAVORITES} tiendas favoritas` });
      }
      try {
        await UserFavoriteStore.create({ user_id: req.user.id, restaurant_id: restaurantId });
      } catch (err) {
        if (!(err && err.name === 'SequelizeUniqueConstraintError')) throw err;
      }
    }
    res.json({ success: true, restaurant_id: restaurantId, favorite: true });
  } catch (err) {
    console.error('addFavoriteStore error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.removeFavoriteStore = async (req, res) => {
  try {
    const restaurantId = rules.toPositiveId(req.params && req.params.restaurantId);
    if (!restaurantId) return res.status(404).json({ success: false, message: 'Tienda no encontrada' });
    await UserFavoriteStore.destroy({ where: { user_id: req.user.id, restaurant_id: restaurantId } });
    res.json({ success: true, restaurant_id: restaurantId, favorite: false });
  } catch (err) {
    console.error('removeFavoriteStore error:', err.message);
    res.status(500).json({ success: false });
  }
};

exports.listFavoriteStores = async (req, res) => {
  try {
    const rows = await sequelize.query(
      `SELECT r.id, r.name, r.slug, r.image, r.is_active
       FROM user_favorite_stores f
       JOIN restaurants r ON r.id = f.restaurant_id AND r.is_accepted = 1
       WHERE f.user_id = ?
       ORDER BY f.id DESC LIMIT ${MAX_FAVORITES}`,
      { replacements: [req.user.id], type: QueryTypes.SELECT }
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listFavoriteStores error:', err.message);
    res.status(500).json({ success: false, data: [] });
  }
};
