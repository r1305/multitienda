const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  email: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING,
  phone: DataTypes.STRING,
  auth_token: DataTypes.TEXT,
  default_address_id: { type: DataTypes.INTEGER, defaultValue: 0 },
  avatar: DataTypes.STRING,
  tax_number: DataTypes.STRING,
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  user_ip: DataTypes.STRING,
}, { tableName: 'users' });

const Address = sequelize.define('Address', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.INTEGER,
  address: DataTypes.TEXT,
  house: DataTypes.STRING,
  tag: DataTypes.STRING,
  latitude: DataTypes.DECIMAL(10, 8),
  longitude: DataTypes.DECIMAL(11, 8),
}, { tableName: 'addresses' });

const Restaurant = sequelize.define('Restaurant', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  description: DataTypes.TEXT,
  slug: DataTypes.STRING,
  image: DataTypes.STRING,
  latitude: DataTypes.DECIMAL(10, 8),
  longitude: DataTypes.DECIMAL(11, 8),
  delivery_radius: DataTypes.DECIMAL(8, 2),
  delivery_charges: DataTypes.DECIMAL(10, 2),
  delivery_charge_type: DataTypes.STRING,
  base_delivery_charge: DataTypes.DECIMAL(10, 2),
  base_delivery_distance: DataTypes.DECIMAL(8, 2),
  extra_delivery_charge: DataTypes.DECIMAL(10, 2),
  extra_delivery_distance: DataTypes.DECIMAL(8, 2),
  restaurant_charges: DataTypes.DECIMAL(10, 2),
  delivery_time: DataTypes.STRING,
  price_range: DataTypes.STRING,
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  is_accepted: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_featured: { type: DataTypes.BOOLEAN, defaultValue: false },
  auto_acceptable: { type: DataTypes.BOOLEAN, defaultValue: false },
  delivery_type: DataTypes.INTEGER,
  commission_rate: DataTypes.DECIMAL(5, 2),
  min_order_price: DataTypes.DECIMAL(10, 2),
  free_delivery_subtotal: DataTypes.DECIMAL(10, 2),
  custom_featured_name: DataTypes.STRING,
  custom_message_on_list: DataTypes.TEXT,
  zone_id: DataTypes.INTEGER,
  order_column: DataTypes.INTEGER,
}, { tableName: 'restaurants' });

const Item = sequelize.define('Item', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  description: DataTypes.TEXT,
  price: DataTypes.DECIMAL(10, 2),
  old_price: DataTypes.DECIMAL(10, 2),
  image: DataTypes.STRING,
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  is_recommended: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_veg: { type: DataTypes.BOOLEAN, defaultValue: false },
  restaurant_id: DataTypes.INTEGER,
  item_category_id: DataTypes.INTEGER,
  order_column: DataTypes.INTEGER,
  zone_id: DataTypes.INTEGER,
}, { tableName: 'items' });

const ItemCategory = sequelize.define('ItemCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  restaurant_id: DataTypes.INTEGER,
  is_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  order_column: DataTypes.INTEGER,
}, { tableName: 'item_categories' });

const Addon = sequelize.define('Addon', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  price: DataTypes.DECIMAL(10, 2),
  addon_category_id: DataTypes.INTEGER,
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'addons' });

const AddonCategory = sequelize.define('AddonCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  description: DataTypes.TEXT,
  restaurant_id: DataTypes.INTEGER,
  addonlimit: DataTypes.INTEGER,
}, { tableName: 'addon_categories' });

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  unique_order_id: DataTypes.STRING,
  user_id: DataTypes.INTEGER,
  restaurant_id: DataTypes.INTEGER,
  orderstatus_id: DataTypes.INTEGER,
  total: DataTypes.DECIMAL(10, 2),
  sub_total: DataTypes.DECIMAL(10, 2),
  delivery_charge: DataTypes.DECIMAL(10, 2),
  actual_delivery_charge: DataTypes.DECIMAL(10, 2),
  restaurant_charge: DataTypes.DECIMAL(10, 2),
  tax: DataTypes.DECIMAL(5, 2),
  tax_amount: DataTypes.DECIMAL(10, 2),
  coupon_name: DataTypes.STRING,
  coupon_amount: DataTypes.DECIMAL(10, 2),
  tip_amount: DataTypes.DECIMAL(10, 2),
  wallet_amount: DataTypes.DECIMAL(10, 2),
  payable: DataTypes.DECIMAL(10, 2),
  payment_mode: DataTypes.STRING,
  transaction_id: DataTypes.STRING,
  address: DataTypes.TEXT,
  location: DataTypes.TEXT,
  delivery_type: DataTypes.INTEGER,
  delivery_pin: DataTypes.STRING,
  order_comment: DataTypes.TEXT,
  distance: DataTypes.DECIMAL(8, 2),
  cash_change_amount: DataTypes.DECIMAL(10, 2),
  is_scheduled: { type: DataTypes.BOOLEAN, defaultValue: false },
  schedule_date: DataTypes.TEXT,
  schedule_slot: DataTypes.TEXT,
  zone_id: DataTypes.INTEGER,
}, { tableName: 'orders' });

const Orderitem = sequelize.define('Orderitem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_id: DataTypes.INTEGER,
  item_id: DataTypes.INTEGER,
  name: DataTypes.STRING,
  quantity: DataTypes.INTEGER,
  price: DataTypes.DECIMAL(10, 2),
}, { tableName: 'orderitems' });

const OrderItemAddon = sequelize.define('OrderItemAddon', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderitem_id: DataTypes.INTEGER,
  addon_category_name: DataTypes.STRING,
  addon_name: DataTypes.STRING,
  addon_price: DataTypes.DECIMAL(10, 2),
}, { tableName: 'order_item_addons' });

const Coupon = sequelize.define('Coupon', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: DataTypes.STRING,
  discount: DataTypes.DECIMAL(10, 2),
  discount_type: DataTypes.STRING,
  max_discount: DataTypes.DECIMAL(10, 2),
  min_sub_total: DataTypes.DECIMAL(10, 2),
  max_sub_total: DataTypes.DECIMAL(10, 2),
  count: DataTypes.INTEGER,
  max_count: DataTypes.INTEGER,
  max_count_per_user: DataTypes.INTEGER,
  restaurant_id: DataTypes.INTEGER,
  user_type: DataTypes.STRING,
}, { tableName: 'coupons' });

const Rating = sequelize.define('Rating', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_id: DataTypes.INTEGER,
  user_id: DataTypes.INTEGER,
  restaurant_id: DataTypes.INTEGER,
  delivery_id: DataTypes.INTEGER,
  rating_store: DataTypes.DECIMAL(3, 1),
  rating_delivery: DataTypes.DECIMAL(3, 1),
  review_store: DataTypes.TEXT,
  review_delivery: DataTypes.TEXT,
}, { tableName: 'ratings' });

const Setting = sequelize.define('Setting', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  key: DataTypes.STRING,
  value: DataTypes.TEXT,
}, { tableName: 'settings' });

const Location = sequelize.define('Location', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  latitude: DataTypes.DECIMAL(10, 8),
  longitude: DataTypes.DECIMAL(11, 8),
  is_primary: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'locations' });

const PromoSlider = sequelize.define('PromoSlider', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  image: DataTypes.STRING,
  url: DataTypes.STRING,
  location_id: DataTypes.INTEGER,
  position_id: DataTypes.INTEGER,
  size: DataTypes.STRING,
}, { tableName: 'promo_sliders' });

const Page = sequelize.define('Page', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  body: DataTypes.TEXT('long'),
  slug: DataTypes.STRING,
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'pages' });

const Translation = sequelize.define('Translation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  language_name: DataTypes.STRING,
  language_code: DataTypes.STRING,
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  translation_data: DataTypes.TEXT('long'),
}, { tableName: 'translations' });

const PushToken = sequelize.define('PushToken', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.INTEGER,
  token: DataTypes.TEXT,
  device_type: DataTypes.STRING,
}, { tableName: 'push_tokens' });

const SmsOtp = sequelize.define('SmsOtp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  phone: DataTypes.STRING,
  otp: DataTypes.STRING,
}, { tableName: 'sms_otps' });

const PasswordResetOtp = sequelize.define('PasswordResetOtp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: DataTypes.STRING,
  otp: DataTypes.STRING,
}, { tableName: 'password_reset_otps' });

const RestaurantCategory = sequelize.define('RestaurantCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  image: DataTypes.STRING,
  order_column: DataTypes.INTEGER,
}, { tableName: 'restaurant_categories' });

const RestaurantCategorySlider = sequelize.define('RestaurantCategorySlider', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  restaurant_category_id: DataTypes.INTEGER,
  image: DataTypes.STRING,
  order_column: DataTypes.INTEGER,
}, { tableName: 'restaurant_category_sliders' });

const PaymentGateway = sequelize.define('PaymentGateway', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  title: DataTypes.STRING,
  account_number: DataTypes.STRING,
  phone_number: DataTypes.STRING,
  is_active: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'payment_gateways' });

const DeliveryGuyDetail = sequelize.define('DeliveryGuyDetail', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: DataTypes.INTEGER,
  vehicle_number: DataTypes.STRING,
  vehicle_type: DataTypes.STRING,
  latitude: DataTypes.DECIMAL(10, 8),
  longitude: DataTypes.DECIMAL(11, 8),
  heading: DataTypes.DECIMAL(5, 2),
  is_available: { type: DataTypes.BOOLEAN, defaultValue: true },
  status: DataTypes.STRING,
  commission_rate: DataTypes.DECIMAL(5, 2),
  max_accept_delivery_limit: DataTypes.INTEGER,
  cash_limit: DataTypes.DECIMAL(10, 2),
  tip_commission_rate: DataTypes.DECIMAL(5, 2),
}, { tableName: 'delivery_guy_details' });

const AcceptDelivery = sequelize.define('AcceptDelivery', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_id: DataTypes.INTEGER,
  user_id: DataTypes.INTEGER,
}, { tableName: 'accept_deliveries' });

const PopularGeoPlace = sequelize.define('PopularGeoPlace', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: DataTypes.STRING,
  latitude: DataTypes.DECIMAL(10, 8),
  longitude: DataTypes.DECIMAL(11, 8),
  is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'popular_geo_places' });

const Wallet = sequelize.define('Wallet', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  holder_type: DataTypes.STRING,
  holder_id: DataTypes.INTEGER,
  balance: { type: DataTypes.DECIMAL(64, 2), defaultValue: 0 },
}, { tableName: 'wallets' });

const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  payable_type: DataTypes.STRING,
  payable_id: DataTypes.INTEGER,
  wallet_id: DataTypes.INTEGER,
  type: DataTypes.STRING,
  amount: DataTypes.DECIMAL(64, 2),
  confirmed: DataTypes.BOOLEAN,
  meta: DataTypes.TEXT,
  uuid: DataTypes.STRING,
}, { tableName: 'transactions' });

// Associations
User.hasMany(Address, { foreignKey: 'user_id', as: 'addresses' });
Address.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(DeliveryGuyDetail, { foreignKey: 'user_id', as: 'delivery_guy_detail' });
DeliveryGuyDetail.belongsTo(User, { foreignKey: 'user_id' });

Restaurant.hasMany(Item, { foreignKey: 'restaurant_id', as: 'items' });
Item.belongsTo(Restaurant, { foreignKey: 'restaurant_id', as: 'restaurant' });

Item.belongsTo(ItemCategory, { foreignKey: 'item_category_id', as: 'item_category' });
ItemCategory.hasMany(Item, { foreignKey: 'item_category_id' });

AddonCategory.hasMany(Addon, { foreignKey: 'addon_category_id', as: 'addons' });
Addon.belongsTo(AddonCategory, { foreignKey: 'addon_category_id' });

const AddonCategoryItem = sequelize.define('AddonCategoryItem', {
  addon_category_id: DataTypes.INTEGER,
  item_id: DataTypes.INTEGER,
}, { tableName: 'addon_category_item', timestamps: false });

Item.belongsToMany(AddonCategory, { through: AddonCategoryItem, foreignKey: 'item_id', otherKey: 'addon_category_id', as: 'addon_categories' });
AddonCategory.belongsToMany(Item, { through: AddonCategoryItem, foreignKey: 'addon_category_id', otherKey: 'item_id' });

Order.hasMany(Orderitem, { foreignKey: 'order_id', as: 'orderitems' });
Orderitem.belongsTo(Order, { foreignKey: 'order_id' });

Orderitem.hasMany(OrderItemAddon, { foreignKey: 'orderitem_id', as: 'order_item_addons' });
OrderItemAddon.belongsTo(Orderitem, { foreignKey: 'orderitem_id' });

Order.belongsTo(Restaurant, { foreignKey: 'restaurant_id', as: 'restaurant' });
Restaurant.hasMany(Order, { foreignKey: 'restaurant_id', as: 'orders' });

Order.hasOne(Rating, { foreignKey: 'order_id', as: 'rating' });
Rating.belongsTo(Order, { foreignKey: 'order_id' });

Restaurant.hasMany(Rating, { foreignKey: 'restaurant_id', as: 'ratings' });

Restaurant.belongsToMany(RestaurantCategory, {
  through: 'restaurant_category_restaurant',
  foreignKey: 'restaurant_id',
  as: 'restaurant_categories',
});
RestaurantCategory.belongsToMany(Restaurant, {
  through: 'restaurant_category_restaurant',
  foreignKey: 'restaurant_category_id',
});

module.exports = {
  sequelize, User, Address, Restaurant, Item, ItemCategory, Addon, AddonCategory,
  Order, Orderitem, OrderItemAddon, Coupon, Rating, Setting, Location, PromoSlider,
  Page, Translation, PushToken, SmsOtp, PasswordResetOtp, RestaurantCategory,
  RestaurantCategorySlider, DeliveryGuyDetail, AcceptDelivery, PopularGeoPlace,
  Wallet, Transaction, PaymentGateway, AddonCategoryItem,
};
