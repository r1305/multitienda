const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { createImageFileFilter } = require('../helpers/uploadFilter');
const { jwtAuth, jwtAuthPermitirInactivo, optionalAuth, requireRole } = require('../middleware/auth');
const { otpRateLimit, authRateLimit } = require('../middleware/rateLimit');

const ALLOWED_IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const safeImageFileFilter = createImageFileFilter(ALLOWED_IMG_EXTS);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads')),
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

const user = require('../controllers/userController');
const restaurant = require('../controllers/restaurantController');
const order = require('../controllers/orderController');
const misc = require('../controllers/miscControllers');
const storeOwner = require('../controllers/storeOwnerController');

// Shorthand: every protected route uses jwtAuth explicitly
const auth = jwtAuth;
const deliveryOnly = requireRole('Delivery Guy');
const storeOnly = requireRole('Store Owner');

// ─── Public routes ───────────────────────────────────────────────────────────
router.post('/coordinate-to-address', misc.coordinatesToAddress);
router.post('/address-to-coordinate', misc.addressToCoordinates);
router.post('/get-settings', misc.getSettings);
router.get('/get-settings', misc.getSettings);
router.get('/get-setting/:key', misc.getSettingByKey);
router.post('/search-location/:query', misc.searchLocation);
router.post('/popular-locations', misc.popularLocations);
router.post('/popular-geo-locations', misc.popularGeoLocations);
router.post('/promo-slider', misc.promoSlider);
router.post('/get-delivery-restaurants', restaurant.getDeliveryRestaurants);
router.post('/get-selfpickup-restaurants', restaurant.getSelfPickupRestaurants);
router.post('/get-restaurant-info/:slug', restaurant.getRestaurantInfo);
router.post('/get-restaurant-info-by-id/:id', restaurant.getRestaurantInfoById);
router.post('/get-restaurant-info-and-operational-status', restaurant.getRestaurantInfoAndOperationalStatus);
router.post('/get-restaurant-items/:slug', restaurant.getRestaurantItems);
router.post('/search-restaurants', restaurant.searchRestaurants);
router.post('/send-otp', otpRateLimit, misc.sendOtp);
router.post('/verify-otp', otpRateLimit, misc.verifyOtp);
router.post('/check-restaurant-operation-service', restaurant.checkRestaurantOperationService);
router.post('/get-single-item', restaurant.getSingleItem);
router.post('/get-all-languages', misc.getAllLanguages);
router.post('/get-single-language', misc.getSingleLanguage);
router.post('/get-restaurant-category-slides', misc.getRestaurantCategorySlider);
router.post('/get-all-restaurants-categories', misc.getAllRestaurantsCategories);
router.post('/get-filtered-restaurants', restaurant.getFilteredRestaurants);
router.post('/send-password-reset-mail', otpRateLimit, misc.sendPasswordResetMail);
router.post('/verify-password-reset-otp', otpRateLimit, misc.verifyPasswordResetOtp);
router.post('/change-user-password', authRateLimit, misc.changeUserPassword);
router.post('/check-cart-items-availability', restaurant.checkCartItemsAvailability);
router.get('/get-store-reviews/:slug', misc.getRatingAndReview);
router.post('/save-notification-token-no-user', misc.saveTokenNoUser);
router.post('/login', authRateLimit, user.login);
router.post('/login-with-otp', authRateLimit, user.loginWithOtp);
router.post('/generate-otp-for-login', otpRateLimit, misc.generateOtpForLogin);
router.post('/register', authRateLimit, user.register);
router.post('/delivery/login', authRateLimit, misc.deliveryLogin);
router.post('/delivery/register', authRateLimit, misc.deliveryRegister);
router.post('/store-owner/login', authRateLimit, storeOwner.login);
router.get('/store-owner/get-all-language', storeOwner.getAllLanguage);
router.get('/store-owner/get-single-language/:language_code', storeOwner.getSingleLanguage);

// ─── Protected routes (jwtAuth applied per-route) ────────────────────────────
router.post('/get-ratable-order', auth, misc.getRatableOrder);
router.post('/rate-order', auth, misc.rateOrder);
router.post('/get-restaurant-info-with-favourite/:slug', auth, restaurant.getRestaurantInfoWithFavourite);
router.post('/apply-coupon', auth, optionalAuth, misc.applyCoupon);
router.post('/save-notification-token', auth, misc.saveToken);
router.post('/save-fcm-token', auth, misc.saveFCMToken);
router.post('/update-app-token-for-user', auth, misc.updateAppTokenForUser);
router.post('/get-payment-gateways', auth, misc.getPaymentGateways);
router.post('/get-addresses', auth, misc.getAddresses);
router.post('/save-address', auth, misc.saveAddress);
router.post('/delete-address', auth, misc.deleteAddress);
router.post('/update-user-info', auth, user.updateUserInfo);
router.post('/check-running-order', auth, user.checkRunningOrder);
router.post('/place-order', auth, order.placeOrder);
router.post('/set-default-address', auth, misc.setDefaultAddress);
router.post('/get-orders', auth, order.getOrders);
router.post('/get-order-items', auth, order.getOrderItems);
router.post('/cancel-order', auth, order.cancelOrder);
router.post('/get-wallet-transactions', auth, user.getWalletTransactions);
router.post('/get-user-notifications', auth, misc.getUserNotifications);
router.post('/mark-all-notifications-read', auth, misc.markAllNotificationsRead);
router.post('/mark-one-notification-read', auth, misc.markOneNotificationRead);
router.post('/delivery/update-user-info', auth, deliveryOnly, misc.updateDeliveryUserInfo);
router.post('/delivery/get-delivery-orders', auth, deliveryOnly, misc.getDeliveryOrders);
router.post('/delivery/get-single-delivery-order', auth, deliveryOnly, misc.getSingleDeliveryOrder);
router.post('/delivery/set-delivery-guy-gps-location', auth, deliveryOnly, misc.setDeliveryGuyGpsLocation);
router.post('/delivery/get-delivery-guy-gps-location', auth, misc.getDeliveryGuyGpsLocation);
router.post('/delivery/accept-to-deliver', auth, deliveryOnly, misc.acceptToDeliver);
router.post('/delivery/ignore-order', auth, deliveryOnly, misc.ignoreOrder);
router.post('/delivery/pickedup-order', auth, deliveryOnly, misc.pickedupOrder);
router.post('/delivery/deliver-order', auth, deliveryOnly, misc.deliverOrder);
router.post('/delivery/toggle-delivery-guy-status', auth, deliveryOnly, misc.updateDeliveryUserInfo);
router.post('/delivery/get-completed-orders', auth, deliveryOnly, misc.getCompletedOrders);
router.post('/delivery/get-active-orders', auth, deliveryOnly, misc.getActiveDeliveryOrders);
router.post('/delivery/get-earnings', auth, deliveryOnly, misc.getDeliveryEarnings);
router.post('/conversation/chat', auth, misc.deliveryCustomerChat);
router.post('/conversation/send', auth, misc.sendChatMessage);
router.post('/change-avatar', auth, user.changeAvatar);
router.post('/check-ban', jwtAuthPermitirInactivo, user.checkBan);
router.post('/toggle-favorite', auth, user.toggleFavorite);
router.post('/get-favorite-stores', auth, restaurant.getFavoriteStores);
router.post('/update-tax-number', auth, user.updateTaxNumber);

// ─── Store Owner protected ────────────────────────────────────────────────────
router.post('/store-owner/dashboard', auth, storeOnly, storeOwner.dashboard);
router.post('/store-owner/toggle-store-status', auth, storeOnly, storeOwner.toggleStoreStatus);
router.post('/store-owner/get-orders', auth, storeOnly, storeOwner.getOrders);
router.post('/store-owner/get-single-order', auth, storeOnly, storeOwner.getSingleOrder);
router.post('/store-owner/cancel-order', auth, storeOnly, storeOwner.cancelOrder);
router.post('/store-owner/accept-order', auth, storeOnly, storeOwner.acceptOrder);
router.post('/store-owner/mark-selfpickup-order-ready', auth, storeOnly, storeOwner.markSelfpickupOrderReady);
router.post('/store-owner/mark-selfpickup-order-completed', auth, storeOnly, storeOwner.markSelfpickupOrderCompleted);
router.post('/store-owner/confirm-scheduled-order', auth, storeOnly, storeOwner.confirmScheduledOrder);
router.post('/store-owner/get-menu', auth, storeOnly, storeOwner.getMenu);
router.post('/store-owner/toggle-item-status', auth, storeOnly, storeOwner.toggleItemStatus);
router.post('/store-owner/create-item', auth, storeOnly, upload.single('image'), storeOwner.createItem);
router.post('/store-owner/update-item', auth, storeOnly, upload.single('image'), storeOwner.updateItem);
router.post('/store-owner/delete-item', auth, storeOnly, storeOwner.deleteItem);
router.post('/store-owner/get-categories', auth, storeOnly, storeOwner.getCategories);
router.post('/store-owner/create-category', auth, storeOnly, storeOwner.createCategory);
router.post('/store-owner/update-category', auth, storeOnly, storeOwner.updateCategory);
router.post('/store-owner/delete-category', auth, storeOnly, storeOwner.deleteCategory);
router.post('/store-owner/get-addons', auth, storeOnly, storeOwner.getAddons);
router.post('/store-owner/create-addon', auth, storeOnly, storeOwner.createAddon);
router.post('/store-owner/update-addon', auth, storeOnly, storeOwner.updateAddon);
router.post('/store-owner/delete-addon', auth, storeOnly, storeOwner.deleteAddon);
router.post('/store-owner/get-addon-items', auth, storeOnly, storeOwner.getAddonItems);
router.post('/store-owner/create-addon-item', auth, storeOnly, storeOwner.createAddonItem);
router.post('/store-owner/update-addon-item', auth, storeOnly, storeOwner.updateAddonItem);
router.post('/store-owner/delete-addon-item', auth, storeOnly, storeOwner.deleteAddonItem);
router.post('/store-owner/search-items', auth, storeOnly, storeOwner.searchItems);
router.post('/store-owner/edit-item', auth, storeOnly, storeOwner.editItem);
router.post('/store-owner/get-past-orders', auth, storeOnly, storeOwner.getPastOrders);
router.post('/store-owner/get-earnings', auth, storeOnly, storeOwner.getEarnings);
router.post('/store-owner/search-orders', auth, storeOnly, storeOwner.searchOrders);
router.post('/store-owner/get-ratings', auth, storeOnly, storeOwner.getRatings);
router.post('/store-owner/send-payout-request', auth, storeOnly, storeOwner.sendPayoutRequest);
router.post('/store-owner/get-inactive-items', auth, storeOnly, storeOwner.getInactiveItems);
router.post('/store-owner/get-store-page', auth, storeOnly, storeOwner.getStorePage);
router.post('/store-owner/update-store', auth, storeOnly, upload.single('image'), storeOwner.updateStore);
router.post('/store-owner/toggle-category-status', auth, storeOnly, storeOwner.toggleCategoryStatus);
router.post('/store-owner/get-coupons', auth, storeOnly, storeOwner.getCoupons);
router.post('/store-owner/create-coupon', auth, storeOnly, storeOwner.createCoupon);
router.post('/store-owner/update-coupon', auth, storeOnly, storeOwner.updateCoupon);
router.post('/store-owner/delete-coupon', auth, storeOnly, storeOwner.deleteCoupon);

module.exports = router;
