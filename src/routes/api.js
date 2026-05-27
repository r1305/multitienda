const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { jwtAuth, optionalAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

const user = require('../controllers/userController');
const restaurant = require('../controllers/restaurantController');
const order = require('../controllers/orderController');
const misc = require('../controllers/miscControllers');
const storeOwner = require('../controllers/storeOwnerController');

// OneSignal service worker — must return JS (never SPA index.html)
const ONE_SIGNAL_WORKER_SOURCE = "importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');\n";
router.get('/onesignal-service-worker.js', (req, res) => {
  res.set({
    'Content-Type': 'application/javascript; charset=utf-8',
    'Service-Worker-Allowed': '/',
    'Cache-Control': 'public, max-age=86400',
  });
  res.send(ONE_SIGNAL_WORKER_SOURCE);
});

// ─── Public routes ────────────────────────────────────────────────────────────
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
router.post('/send-otp', misc.sendOtp);
router.post('/verify-otp', misc.verifyOtp);
router.post('/check-restaurant-operation-service', restaurant.checkRestaurantOperationService);
router.post('/get-single-item', restaurant.getSingleItem);
router.post('/get-all-languages', misc.getAllLanguages);
router.post('/get-single-language', misc.getSingleLanguage);
router.post('/get-restaurant-category-slides', misc.getRestaurantCategorySlider);
router.post('/get-all-restaurants-categories', misc.getAllRestaurantsCategories);
router.post('/get-filtered-restaurants', restaurant.getFilteredRestaurants);
router.post('/send-password-reset-mail', misc.sendPasswordResetMail);
router.post('/verify-password-reset-otp', misc.verifyPasswordResetOtp);
router.post('/change-user-password', misc.changeUserPassword);
router.post('/check-cart-items-availability', restaurant.checkCartItemsAvailability);
router.get('/get-store-reviews/:slug', misc.getRatingAndReview);
router.post('/save-notification-token-no-user', misc.saveTokenNoUser);
router.post('/login', user.login);
router.post('/login-with-otp', user.loginWithOtp);
router.post('/generate-otp-for-login', misc.generateOtpForLogin);
router.post('/register', user.register);
router.post('/delivery/login', misc.deliveryLogin);
router.post('/delivery/register', misc.deliveryRegister);

// ─── Store Owner public ───────────────────────────────────────────────────────
router.post('/store-owner/login', storeOwner.login);
router.get('/store-owner/get-all-language', storeOwner.getAllLanguage);
router.get('/store-owner/get-single-language/:language_code', storeOwner.getSingleLanguage);

// ─── Protected routes ─────────────────────────────────────────────────────────
router.use(jwtAuth);

router.post('/get-ratable-order', misc.getRatableOrder);
router.post('/rate-order', misc.rateOrder);
router.post('/get-restaurant-info-with-favourite/:slug', restaurant.getRestaurantInfoWithFavourite);
router.post('/apply-coupon', optionalAuth, misc.applyCoupon);
router.post('/save-notification-token', misc.saveToken);
router.post('/save-fcm-token', misc.saveFCMToken);
router.post('/update-app-token-for-user', misc.updateAppTokenForUser);
router.post('/get-payment-gateways', misc.getPaymentGateways);
router.post('/get-addresses', misc.getAddresses);
router.post('/save-address', misc.saveAddress);
router.post('/delete-address', misc.deleteAddress);
router.post('/update-user-info', user.updateUserInfo);
router.post('/check-running-order', user.checkRunningOrder);
router.post('/place-order', order.placeOrder);
router.post('/set-default-address', misc.setDefaultAddress);
router.post('/get-orders', order.getOrders);
router.post('/get-order-items', order.getOrderItems);
router.post('/cancel-order', order.cancelOrder);
router.post('/get-wallet-transactions', user.getWalletTransactions);
router.post('/get-user-notifications', misc.getUserNotifications);
router.post('/mark-all-notifications-read', misc.markAllNotificationsRead);
router.post('/mark-one-notification-read', misc.markOneNotificationRead);
router.post('/delivery/update-user-info', misc.updateDeliveryUserInfo);
router.post('/delivery/get-delivery-orders', misc.getDeliveryOrders);
router.post('/delivery/get-single-delivery-order', misc.getSingleDeliveryOrder);
router.post('/delivery/set-delivery-guy-gps-location', misc.setDeliveryGuyGpsLocation);
router.post('/delivery/get-delivery-guy-gps-location', misc.getDeliveryGuyGpsLocation);
router.post('/delivery/accept-to-deliver', misc.acceptToDeliver);
router.post('/delivery/ignore-order', misc.ignoreOrder);
router.post('/delivery/pickedup-order', misc.pickedupOrder);
router.post('/delivery/deliver-order', misc.deliverOrder);
router.post('/delivery/toggle-delivery-guy-status', misc.updateDeliveryUserInfo);
router.post('/delivery/get-completed-orders', misc.getCompletedOrders);
router.post('/delivery/get-active-orders', misc.getActiveDeliveryOrders);
router.post('/delivery/get-earnings', misc.getDeliveryEarnings);
router.post('/conversation/chat', misc.deliveryCustomerChat);
router.post('/conversation/send', misc.sendChatMessage);
router.post('/change-avatar', user.changeAvatar);
router.post('/check-ban', user.checkBan);
router.post('/toggle-favorite', user.toggleFavorite);
router.post('/get-favorite-stores', restaurant.getFavoriteStores);
router.post('/update-tax-number', user.updateTaxNumber);

// ─── Store Owner protected ────────────────────────────────────────────────────
router.post('/store-owner/dashboard', storeOwner.dashboard);
router.post('/store-owner/toggle-store-status', storeOwner.toggleStoreStatus);
router.post('/store-owner/get-orders', storeOwner.getOrders);
router.post('/store-owner/get-single-order', storeOwner.getSingleOrder);
router.post('/store-owner/cancel-order', storeOwner.cancelOrder);
router.post('/store-owner/accept-order', storeOwner.acceptOrder);
router.post('/store-owner/mark-selfpickup-order-ready', storeOwner.markSelfpickupOrderReady);
router.post('/store-owner/mark-selfpickup-order-completed', storeOwner.markSelfpickupOrderCompleted);
router.post('/store-owner/confirm-scheduled-order', storeOwner.confirmScheduledOrder);
router.post('/store-owner/get-menu', storeOwner.getMenu);
router.post('/store-owner/toggle-item-status', storeOwner.toggleItemStatus);
router.post('/store-owner/create-item', upload.single('image'), storeOwner.createItem);
router.post('/store-owner/update-item', upload.single('image'), storeOwner.updateItem);
router.post('/store-owner/delete-item', storeOwner.deleteItem);
router.post('/store-owner/get-categories', storeOwner.getCategories);
router.post('/store-owner/create-category', storeOwner.createCategory);
router.post('/store-owner/update-category', storeOwner.updateCategory);
router.post('/store-owner/delete-category', storeOwner.deleteCategory);
router.post('/store-owner/get-addons', storeOwner.getAddons);
router.post('/store-owner/create-addon', storeOwner.createAddon);
router.post('/store-owner/update-addon', storeOwner.updateAddon);
router.post('/store-owner/delete-addon', storeOwner.deleteAddon);
router.post('/store-owner/get-addon-items', storeOwner.getAddonItems);
router.post('/store-owner/create-addon-item', storeOwner.createAddonItem);
router.post('/store-owner/update-addon-item', storeOwner.updateAddonItem);
router.post('/store-owner/delete-addon-item', storeOwner.deleteAddonItem);
router.post('/store-owner/search-items', storeOwner.searchItems);
router.post('/store-owner/edit-item', storeOwner.editItem);
router.post('/store-owner/update-item', storeOwner.updateItem);
router.post('/store-owner/get-past-orders', storeOwner.getPastOrders);
router.post('/store-owner/get-earnings', storeOwner.getEarnings);
router.post('/store-owner/search-orders', storeOwner.searchOrders);
router.post('/store-owner/get-ratings', storeOwner.getRatings);
router.post('/store-owner/get-earnings', storeOwner.getEarnings);
router.post('/store-owner/send-payout-request', storeOwner.sendPayoutRequest);
router.post('/store-owner/get-inactive-items', storeOwner.getInactiveItems);
router.post('/store-owner/get-store-page', storeOwner.getStorePage);
router.post('/store-owner/update-store', upload.single('image'), storeOwner.updateStore);
router.post('/store-owner/toggle-category-status', storeOwner.toggleCategoryStatus);
router.post('/store-owner/get-coupons', storeOwner.getCoupons);
router.post('/store-owner/create-coupon', storeOwner.createCoupon);
router.post('/store-owner/update-coupon', storeOwner.updateCoupon);
router.post('/store-owner/delete-coupon', storeOwner.deleteCoupon);

module.exports = router;
