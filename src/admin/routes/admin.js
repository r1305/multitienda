const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const multer = require('multer');
const path = require('path');

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../../public/uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

// Auth middleware
const auth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.redirect('/auth/login');
};

// Inject settings for admin views
const injectSettings = async (req, res, next) => {
  try {
    const { sequelize } = require('../../models');
    const [rows] = await sequelize.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('onesignalAppId','currencySymbol','currencyFormat')");
    res.locals.settings = {};
    rows.forEach(r => { res.locals.settings[r.key] = r.value; });
    res.locals.currency = res.locals.settings.currencySymbol || res.locals.settings.currencyFormat || '$';
  } catch(e) { res.locals.currency = '$'; }
  next();
};

// Auth routes (no auth required)
router.get('/auth/login', authController.loginPage);
router.post('/auth/login', authController.login);
router.get('/auth/logout', authController.logout);

// All admin routes require auth
router.use('/admin', auth, injectSettings);

// Admin API (JSON responses for charts)
router.get('/admin/api/earnings-chart', auth, async (req, res) => {
  const { sequelize } = require('../../models');
  const { filter, from, to } = req.query;
  let startDate, endDate = new Date();

  if (filter === 'month') {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (filter === 'custom' && from && to) {
    startDate = new Date(from);
    endDate = new Date(to + 'T23:59:59');
  } else {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT DATE(created_at) as day, SUM(total) as earnings FROM orders WHERE orderstatus_id = 5 AND created_at >= ? AND created_at <= ? GROUP BY DATE(created_at) ORDER BY day ASC`,
      { replacements: [startDate, endDate] }
    );

    const labels = [];
    const values = [];
    let total = 0;

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayStr = current.toISOString().split('T')[0];
      labels.push(current.toLocaleDateString('es', { day: 'numeric', month: 'short' }));
      const found = rows.find(r => r.day === dayStr);
      const val = found ? parseFloat(found.earnings) : 0;
      values.push(val);
      total += val;
      current.setDate(current.getDate() + 1);
    }

    res.json({ labels, values, total });
  } catch (err) {
    res.json({ labels: [], values: [], total: 0 });
  }
});

router.get('/admin/api/store-earnings-chart', auth, async (req, res) => {
  const { sequelize } = require('../../models');
  const { store_id, filter, from, to } = req.query;
  let startDate, endDate = new Date();

  if (filter === 'month') {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (filter === 'custom' && from && to) {
    startDate = new Date(from);
    endDate = new Date(to + 'T23:59:59');
  } else {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT DATE(created_at) as day, SUM(total) as earnings, COUNT(*) as cnt FROM orders WHERE orderstatus_id = 5 AND restaurant_id = ? AND created_at >= ? AND created_at <= ? GROUP BY DATE(created_at) ORDER BY day ASC`,
      { replacements: [store_id, startDate, endDate] }
    );

    const labels = [];
    const values = [];
    let total = 0;
    let orderCount = 0;

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayStr = current.toISOString().split('T')[0];
      labels.push(current.toLocaleDateString('es', { day: 'numeric', month: 'short' }));
      const found = rows.find(r => r.day === dayStr);
      const val = found ? parseFloat(found.earnings) : 0;
      values.push(val);
      total += val;
      if (found) orderCount += parseInt(found.cnt);
      current.setDate(current.getDate() + 1);
    }

    res.json({ labels, values, total, orderCount });
  } catch (err) {
    res.json({ labels: [], values: [], total: 0, orderCount: 0 });
  }
});

router.get('/admin/api/delivery-earnings-chart', auth, async (req, res) => {
  const { sequelize } = require('../../models');
  const { user_id, filter, from, to } = req.query;
  let startDate, endDate = new Date();

  if (filter === 'month') {
    startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  } else if (filter === 'custom' && from && to) {
    startDate = new Date(from);
    endDate = new Date(to + 'T23:59:59');
  } else {
    startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT DATE(created_at) as day, SUM(amount) as earnings, COUNT(*) as cnt FROM delivery_earnings WHERE user_id = ? AND created_at >= ? AND created_at <= ? GROUP BY DATE(created_at) ORDER BY day ASC`,
      { replacements: [user_id, startDate, endDate] }
    );

    const labels = [];
    const values = [];
    let total = 0;
    let deliveryCount = 0;

    const current = new Date(startDate);
    while (current <= endDate) {
      const dayStr = current.toISOString().split('T')[0];
      labels.push(current.toLocaleDateString('es', { day: 'numeric', month: 'short' }));
      const found = rows.find(r => r.day === dayStr);
      const val = found ? parseFloat(found.earnings) : 0;
      values.push(val);
      total += val;
      if (found) deliveryCount += parseInt(found.cnt);
      current.setDate(current.getDate() + 1);
    }

    res.json({ labels, values, total, deliveryCount });
  } catch (err) {
    res.json({ labels: [], values: [], total: 0, deliveryCount: 0 });
  }
});

// Dashboard
router.get('/admin/dashboard', adminController.dashboard);

// Orders
router.get('/admin/orders', adminController.orders);
router.get('/admin/order/:id', adminController.viewOrder);
router.post('/admin/order/cancel', adminController.cancelOrder);
router.post('/admin/order/accept', adminController.acceptOrder);
router.post('/admin/order/assign-delivery', adminController.assignDelivery);
router.post('/admin/order/reassign-delivery', adminController.reassignDelivery);

// Stores
router.get('/admin/stores', adminController.stores);
router.get('/admin/store/edit/:id', adminController.editStore);
router.post('/admin/store/edit/save', upload.single('image'), adminController.updateStore);
router.post('/admin/store/new/save', upload.single('image'), adminController.createStore);
router.get('/admin/store/disable/:id', adminController.disableStore);
router.get('/admin/store/delete/:id', adminController.deleteStore);
router.get('/admin/store/earnings/:id', adminController.storeEarnings);

// Items (view only)
router.get('/admin/items', adminController.items);

// Item Categories (view only)
router.get('/admin/item-categories', adminController.itemCategories);

// Addon Categories (view only)
router.get('/admin/addon-categories', adminController.addonCategories);
router.get('/admin/addon-category/edit/:id', adminController.editAddonCategory);

// Users
router.get('/admin/users', adminController.users);
router.get('/admin/user/edit/:id', adminController.editUser);
router.post('/admin/user/edit/save', adminController.updateUser);
router.post('/admin/user/new/save', adminController.createUser);
router.get('/admin/user/ban/:id', adminController.banUser);

// Delivery Guys
router.get('/admin/delivery-guys', adminController.deliveryGuys);
router.get('/admin/user/approve/:id', adminController.approveUser);
router.post('/admin/delivery-guy/commission/save', adminController.saveDeliveryCommission);
router.get('/admin/delivery-guy/earnings/:id', adminController.deliveryGuyEarnings);

// Store Owners
router.get('/admin/store-owners', adminController.storeOwners);
router.get('/admin/store-owner/:id/stores', adminController.storeOwnerStores);
router.post('/admin/store-owner/:id/stores/save', adminController.updateStoreOwnerStores);


// Coupons (view only)
router.get('/admin/coupons', adminController.coupons);

// Pages

// Translations
router.get('/admin/translations', adminController.translations);
router.get('/admin/translation/edit/:id', adminController.editTranslation);
router.post('/admin/translation/new/save', adminController.createTranslation);
router.post('/admin/translation/edit/save', adminController.updateTranslation);
router.get('/admin/translation/disable/:id', adminController.disableTranslation);
router.get('/admin/translation/delete/:id', adminController.deleteTranslation);
router.get('/admin/translation/make-default/:id', adminController.makeDefaultTranslation);

// Promo Sliders
router.get('/admin/promo-sliders', adminController.sliders);
router.post('/admin/slider/create', upload.single('image'), adminController.createSlider);
router.get('/admin/slider/edit/:id', adminController.editSlider);
router.post('/admin/slider/edit/save', upload.single('image'), adminController.updateSlider);
router.get('/admin/slider/disable/:id', adminController.disableSlider);
router.get('/admin/slider/delete/:id', adminController.deleteSlider);

// Notifications
router.get('/admin/notifications', adminController.notifications);
router.post('/admin/notifications/send', adminController.sendNotification);

// Store Payouts
router.get('/admin/store-payouts', adminController.storePayouts);
router.get('/admin/store-payout/:id', adminController.viewPayout);
router.post('/admin/store-payout/save', adminController.updatePayout);

// Category Slider
router.get('/admin/store-category-slider', adminController.categorySlider);
router.post('/admin/store-category-slider/new', upload.single('image'), adminController.createCategorySlide);
router.get('/admin/store-category-slider/disable/:id', adminController.disableCategorySlide);
router.get('/admin/store-category-slider/delete/:id', adminController.deleteCategorySlide);

// Settings
router.get('/admin/settings', adminController.settings);
router.post('/admin/settings', adminController.saveSettings);
router.post('/admin/settings/upload-favicon', upload.single('favicon'), adminController.uploadFavicon);

module.exports = router;
