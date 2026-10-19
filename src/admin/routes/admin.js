const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const settlementsController = require('../controllers/settlementsController');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { createImageFileFilter } = require('../../helpers/uploadFilter');
const escapeHtml = require('../../helpers/escapeHtml');
const { authRateLimit } = require('../../middleware/rateLimit');

router.use((req, res, next) => {
  res.locals.esc = escapeHtml;
  next();
});

// CSRF protection — mandatory in production
const isProd = process.env.NODE_ENV === 'production';
let csrfProtection = (req, res, next) => next();
try {
  csrfProtection = require('csurf')({ cookie: true });
} catch (_) {
  if (isProd) console.error('[FATAL] csurf package not installed — CSRF protection disabled in production!');
}

const ALLOWED_IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico'];

const safeImageFileFilter = createImageFileFilter(ALLOWED_IMG_EXTS);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../../public/uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: safeImageFileFilter,
});

// Auth middleware
const auth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.redirect('/auth/login');
};

// Admin-only middleware (vertical privilege escalation protection)
const adminOnly = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'Admin') return next();
  req.flash('error', 'Admin access required');
  res.redirect('/auth/login');
};

// Inject settings + CSRF token for admin views (cached)
const injectSettings = async (req, res, next) => {
  try {
    const cache = require('../../helpers/cache');
    const cacheKey = 'admin:settings:inject';
    let settings = await cache.get(cacheKey);
    if (!settings) {
      const { sequelize } = require('../../models');
      const [rows] = await sequelize.query("SELECT `key`, `value` FROM settings WHERE `key` IN ('currencySymbol','currencyFormat','logoUrl','listingImageUrl','faviconUrl','primaryColor','googleApiKey','googleMapId')");
      settings = {};
      rows.forEach((r) => { settings[r.key] = r.value; });
      await cache.set(cacheKey, settings, parseInt(process.env.CACHE_ADMIN_SETTINGS_TTL || '300', 10));
    }
    res.locals.settings = settings;
    res.locals.currency = settings.currencySymbol || settings.currencyFormat || '$';
  } catch (e) {
    res.locals.currency = '$';
    res.locals.settings = {};
  }
  // CSRF token for templates
  if (req.csrfToken) {
    res.locals.csrfToken = req.csrfToken();
  }
  next();
};

// Auth routes (no auth required, but CSRF protected)
router.get('/auth/login', csrfProtection, authController.loginPage);
router.post('/auth/login', authRateLimit, csrfProtection, authController.login);
router.post('/auth/logout', csrfProtection, authController.logout);

// All admin routes require auth + CSRF + admin-only
router.use('/admin', auth, adminOnly, csrfProtection, injectSettings);

// Admin API (JSON responses for charts)
router.get('/admin/api/earnings-chart', async (req, res) => {
  const { sequelize } = require('../../models');
  const { filter, from, to } = req.query;
  let startStr, endStr;
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

  if (filter === 'month') {
    const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    startStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    endStr = todayStr;
  } else if (filter === 'custom' && from && to) {
    startStr = from;
    endStr = to;
  } else {
    const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    startStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    endStr = todayStr;
  }

  try {
    const [rows] = await sequelize.query(
      `SELECT DATE(created_at) as day, SUM(total) as earnings FROM orders WHERE orderstatus_id = 5 AND DATE(created_at) >= ? AND DATE(created_at) <= ? GROUP BY DATE(created_at) ORDER BY day ASC`,
      { replacements: [startStr, endStr] }
    );

    const labels = [];
    const values = [];
    let total = 0;

    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const current = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    while (current <= end) {
      const dayStr = current.getFullYear() + '-' + String(current.getMonth()+1).padStart(2,'0') + '-' + String(current.getDate()).padStart(2,'0');
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

router.get('/admin/api/store-earnings-chart', async (req, res) => {
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

router.get('/admin/api/delivery-earnings-chart', async (req, res) => {
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

// Redirect /admin to dashboard
router.get('/admin', (req, res) => res.redirect('/admin/dashboard'));

// Dashboard
router.get('/admin/dashboard', adminController.dashboard);

// Orders
router.get('/admin/orders', adminController.orders);
router.get('/admin/order/:id', adminController.viewOrder);
router.post('/admin/order/cancel', adminController.cancelOrder);
router.post('/admin/order/accept', adminController.acceptOrder);
router.post('/admin/order/assign-delivery', adminController.assignDelivery);
router.post('/admin/order/reassign-delivery', adminController.reassignDelivery);

// Acciones que modifican datos: solo POST con token CSRF
// Stores
router.get('/admin/stores', adminController.stores);
router.get('/admin/store/edit/:id', adminController.editStore);
router.post('/admin/store/edit/save', upload.single('image'), adminController.updateStore);
router.post('/admin/store/new/save', upload.single('image'), adminController.createStore);
router.post('/admin/store/disable/:id', adminController.disableStore);
router.post('/admin/store/delete/:id', adminController.deleteStore);
router.get('/admin/store/earnings/:id', adminController.storeEarnings);
router.get('/admin/business-types', adminController.businessTypes);
router.post('/admin/business-types/new', adminController.createBusinessType);
router.post('/admin/business-types/toggle/:id', adminController.toggleBusinessType);

// Items
router.get('/admin/items', adminController.items);
router.get('/admin/item/edit/:id', adminController.editItem);
router.post('/admin/item/edit/save', upload.single('image'), adminController.updateItem);

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
router.post('/admin/user/ban/:id', adminController.banUser);
router.post('/admin/user/add-money-to-wallet', adminController.addMoneyToWallet);
router.post('/admin/user/substract-money-from-wallet', adminController.substractMoneyFromWallet);
router.post('/admin/user/delete-address', adminController.deleteUserAddress);

// Delivery Guys
router.get('/admin/api/delivery-guys-locations', adminController.deliveryGuysLocations);
router.get('/admin/delivery-guys', adminController.deliveryGuys);
router.post('/admin/user/approve/:id', adminController.approveUser);
router.post('/admin/delivery-guy/commission/save', adminController.saveDeliveryCommission);
router.get('/admin/delivery-guy/earnings/:id', adminController.deliveryGuyEarnings);

// Caja de repartidores: cierres de efectivo y liquidación de ganancias (solo admin, POST con CSRF)
router.get('/admin/cash-collections', settlementsController.cashCollections);
router.get('/admin/delivery-guy/account/:id', settlementsController.deliveryAccount);
router.post('/admin/delivery-guy/account/:id/close-cash', settlementsController.closeCash);
router.post('/admin/delivery-guy/account/:id/pay-earnings', settlementsController.payDeliveryEarnings);

// Store Owners
router.get('/admin/store-owners', adminController.storeOwners);
router.get('/admin/store-owner/:id/stores', adminController.storeOwnerStores);
router.post('/admin/store-owner/:id/stores/save', adminController.updateStoreOwnerStores);


// Coupons
router.get('/admin/coupons', adminController.coupons);
router.get('/admin/coupon/edit/:id', adminController.editCoupon);
router.post('/admin/coupon/new/save', adminController.createCoupon);
router.post('/admin/coupon/edit/save', adminController.updateCoupon);
router.post('/admin/coupon/delete/:id', adminController.deleteCoupon);

// Pages
router.get('/admin/pages', adminController.pages);
router.get('/admin/page/edit/:id', adminController.editPage);
router.post('/admin/page/new/save', adminController.createPage);
router.post('/admin/page/edit/save', adminController.updatePage);
router.post('/admin/page/delete/:id', adminController.deletePage);

// Popular geo locations
router.get('/admin/popular-geo-locations', adminController.popularGeoLocations);
router.get('/admin/popular-geo-location/edit/:id', adminController.editPopularGeoLocation);
router.post('/admin/popular-geo-location/new/save', adminController.createPopularGeoLocation);
router.post('/admin/popular-geo-location/edit/save', adminController.updatePopularGeoLocation);
router.post('/admin/popular-geo-location/disable/:id', adminController.disablePopularGeoLocation);
router.post('/admin/popular-geo-location/delete/:id', adminController.deletePopularGeoLocation);
router.post('/admin/popular-geo-location/make-default/:id', adminController.makeDefaultPopularGeoLocation);

// Translations
router.get('/admin/translations', adminController.translations);
router.get('/admin/translation/edit/:id', adminController.editTranslation);
router.post('/admin/translation/new/save', adminController.createTranslation);
router.post('/admin/translation/edit/save', adminController.updateTranslation);
router.post('/admin/translation/disable/:id', adminController.disableTranslation);
router.post('/admin/translation/delete/:id', adminController.deleteTranslation);
router.post('/admin/translation/make-default/:id', adminController.makeDefaultTranslation);

// Promo Sliders
router.get('/admin/promo-sliders', adminController.sliders);
router.post('/admin/slider/create', upload.single('image'), adminController.createSlider);
router.get('/admin/slider/edit/:id', adminController.editSlider);
router.post('/admin/slider/edit/save', upload.single('image'), adminController.updateSlider);
router.post('/admin/slider/disable/:id', adminController.disableSlider);
router.post('/admin/slider/delete/:id', adminController.deleteSlider);

// Notifications
router.get('/admin/notifications', adminController.notifications);
router.post('/admin/notifications/send', adminController.sendNotification);

// Store Payouts
router.get('/admin/store-payouts', adminController.storePayouts);
router.get('/admin/store-payout/:id', adminController.viewPayout);
router.post('/admin/store-payout/save', adminController.updatePayout);
router.post('/admin/store-payout/reject', adminController.rejectPayout);

// Category Slider
router.get('/admin/store-category-slider', adminController.categorySlider);
router.post('/admin/store-category-slider/new', upload.single('image'), adminController.createCategorySlide);
router.post('/admin/store-category-slider/disable/:id', adminController.disableCategorySlide);
router.post('/admin/store-category-slider/delete/:id', adminController.deleteCategorySlide);

// Settings
router.get('/admin/settings', adminController.settings);
router.post('/admin/settings', adminController.saveSettings);
router.post('/admin/settings/upload-favicon', upload.single('favicon'), adminController.uploadFavicon);
router.post('/admin/settings/upload-logo', upload.single('logo'), adminController.uploadLogo);
router.post('/admin/settings/upload-listing-image', upload.single('listingImage'), adminController.uploadListingImage);

// Payment Methods
router.get('/admin/payment-methods', adminController.paymentMethods);
router.post('/admin/payment-method/new/save', adminController.createPaymentMethod);
router.post('/admin/payment-method/edit/save', adminController.updatePaymentMethod);
router.post('/admin/payment-method/toggle/:id', adminController.togglePaymentMethod);
router.post('/admin/payment-method/delete/:id', adminController.deletePaymentMethod);
router.post('/admin/payment-method/mercadopago/save', adminController.saveMercadoPago);

// Clean data
router.post('/admin/clean-data', adminController.cleanData);

module.exports = router;
