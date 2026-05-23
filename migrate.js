require('dotenv').config();
const { sequelize } = require('./src/models');

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified_at TIMESTAMP NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(255) NULL,
    auth_token TEXT NULL,
    default_address_id INT DEFAULT 0,
    avatar VARCHAR(255) NULL,
    tax_number VARCHAR(255) NULL,
    is_active TINYINT(1) DEFAULT 1,
    user_ip VARCHAR(255) NULL,
    delivery_pin VARCHAR(255) NULL,
    delivery_guy_detail_id INT NULL,
    remember_token VARCHAR(100) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS password_resets (
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    INDEX password_resets_email_index (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS locations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    is_primary TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS promo_sliders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NULL,
    image VARCHAR(255) NULL,
    url VARCHAR(255) NULL,
    location_id INT NULL,
    position_id INT NULL,
    size VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS restaurants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    slug VARCHAR(255) UNIQUE NULL,
    image VARCHAR(255) NULL,
    placeholder_image VARCHAR(255) NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    address VARCHAR(255) NULL,
    pincode VARCHAR(255) NULL,
    landmark VARCHAR(255) NULL,
    certificate VARCHAR(255) NULL,
    delivery_charges DECIMAL(10,2) DEFAULT 0,
    delivery_charge_type VARCHAR(255) DEFAULT 'FIXED',
    base_delivery_charge DECIMAL(10,2) DEFAULT 0,
    base_delivery_distance DECIMAL(8,2) DEFAULT 0,
    extra_delivery_charge DECIMAL(10,2) DEFAULT 0,
    extra_delivery_distance DECIMAL(8,2) DEFAULT 0,
    restaurant_charges DECIMAL(10,2) DEFAULT 0,
    delivery_time VARCHAR(255) NULL,
    price_range VARCHAR(255) NULL,
    delivery_radius DECIMAL(8,2) DEFAULT 5,
    is_active TINYINT(1) DEFAULT 1,
    is_accepted TINYINT(1) DEFAULT 0,
    is_featured TINYINT(1) DEFAULT 0,
    is_pureveg TINYINT(1) DEFAULT 0,
    auto_acceptable TINYINT(1) DEFAULT 0,
    is_sms_notifiable TINYINT(1) DEFAULT 0,
    delivery_type INT DEFAULT 1,
    commission_rate DECIMAL(5,2) DEFAULT 0,
    min_order_price DECIMAL(10,2) DEFAULT 0,
    free_delivery_subtotal DECIMAL(10,2) DEFAULT 0,
    custom_featured_name VARCHAR(255) NULL,
    custom_message_on_list TEXT NULL,
    custom_message_block TEXT NULL,
    custom_message_on_list_2 TEXT NULL,
    schedule_data TEXT NULL,
    is_schedulable TINYINT(1) DEFAULT 0,
    is_orderscheduling TINYINT(1) DEFAULT 0,
    accept_schedule_orders TINYINT(1) DEFAULT 0,
    schedule_slot_buffer INT DEFAULT 0,
    zone_id INT NULL,
    order_column INT DEFAULT 0,
    sku VARCHAR(255) NULL,
    rating VARCHAR(255) NULL,
    location_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS item_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    restaurant_id INT UNSIGNED NULL,
    user_id INT UNSIGNED NULL,
    is_enabled TINYINT(1) DEFAULT 1,
    order_column INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    price DECIMAL(10,2) NOT NULL,
    old_price DECIMAL(10,2) NULL,
    image VARCHAR(255) NULL,
    is_active TINYINT(1) DEFAULT 1,
    is_recommended TINYINT(1) DEFAULT 0,
    is_veg TINYINT(1) DEFAULT 0,
    restaurant_id INT UNSIGNED NULL,
    item_category_id INT UNSIGNED NULL,
    order_column INT DEFAULT 0,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS addon_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    restaurant_id INT UNSIGNED NULL,
    addonlimit INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS addons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) DEFAULT 0,
    addon_category_id INT UNSIGNED NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS addon_category_item (
    addon_category_id INT UNSIGNED NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (addon_category_id, item_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    unique_order_id VARCHAR(255) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NULL,
    orderstatus_id INT DEFAULT 1,
    total DECIMAL(10,2) NOT NULL,
    sub_total DECIMAL(10,2) NULL,
    delivery_charge DECIMAL(10,2) DEFAULT 0,
    actual_delivery_charge DECIMAL(10,2) DEFAULT 0,
    restaurant_charge DECIMAL(10,2) DEFAULT 0,
    tax DECIMAL(5,2) NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    coupon_name VARCHAR(255) NULL,
    coupon_amount DECIMAL(10,2) DEFAULT 0,
    tip_amount DECIMAL(10,2) DEFAULT 0,
    wallet_amount DECIMAL(10,2) NULL,
    payable DECIMAL(10,2) NULL,
    payment_mode VARCHAR(255) NULL,
    transaction_id VARCHAR(255) NULL,
    address TEXT NULL,
    location TEXT NULL,
    delivery_type INT DEFAULT 1,
    delivery_pin VARCHAR(255) NULL,
    order_comment TEXT NULL,
    distance DECIMAL(8,2) NULL,
    cash_change_amount DECIMAL(10,2) NULL,
    is_scheduled TINYINT(1) DEFAULT 0,
    schedule_date TEXT NULL,
    schedule_slot TEXT NULL,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS orderitems (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    item_id INT UNSIGNED NULL,
    name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS order_item_addons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    orderitem_id INT UNSIGNED NOT NULL,
    addon_category_name VARCHAR(255) NULL,
    addon_name VARCHAR(255) NULL,
    addon_price DECIMAL(10,2) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS addresses (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    address TEXT NULL,
    house VARCHAR(255) NULL,
    tag VARCHAR(255) NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS coupons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(255) NOT NULL,
    discount DECIMAL(10,2) NOT NULL,
    discount_type VARCHAR(255) DEFAULT 'PERCENTAGE',
    max_discount DECIMAL(10,2) NULL,
    min_sub_total DECIMAL(10,2) NULL,
    max_sub_total DECIMAL(10,2) NULL,
    count INT DEFAULT 0,
    max_count INT NULL,
    max_count_per_user INT NULL,
    restaurant_id INT NULL,
    user_type VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS coupon_restaurant (
    coupon_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (coupon_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS ratings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NULL,
    user_id INT UNSIGNED NULL,
    restaurant_id INT UNSIGNED NULL,
    delivery_id INT NULL,
    rating_store DECIMAL(3,1) NULL,
    rating_delivery DECIMAL(3,1) NULL,
    review_store TEXT NULL,
    review_delivery TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS pages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    body LONGTEXT NULL,
    slug VARCHAR(255) NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS translations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    language_name VARCHAR(255) NOT NULL,
    language_code VARCHAR(255) NOT NULL,
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    translation_data LONGTEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS push_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    token TEXT NULL,
    device_type VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS sms_otps (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(255) NOT NULL,
    otp VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY sms_otps_phone_unique (phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS password_reset_otps (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY password_reset_otps_email_unique (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS restaurant_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    image VARCHAR(255) NULL,
    order_column INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS restaurant_category_restaurant (
    restaurant_category_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (restaurant_category_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS restaurant_category_sliders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_category_id INT UNSIGNED NULL,
    image VARCHAR(255) NULL,
    order_column INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS delivery_guy_details (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    vehicle_number VARCHAR(255) NULL,
    vehicle_type VARCHAR(255) NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    heading DECIMAL(5,2) NULL,
    is_available TINYINT(1) DEFAULT 1,
    status VARCHAR(255) NULL,
    commission_rate DECIMAL(5,2) DEFAULT 0,
    tip_commission_rate DECIMAL(5,2) DEFAULT 0,
    max_accept_delivery_limit INT DEFAULT 1,
    cash_limit DECIMAL(10,2) NULL,
    is_sms_notifiable TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS accept_deliveries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS popular_geo_places (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS wallets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    holder_type VARCHAR(255) NOT NULL,
    holder_id INT UNSIGNED NOT NULL,
    balance DECIMAL(64,2) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX wallets_holder_type_holder_id_index (holder_type, holder_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payable_type VARCHAR(255) NOT NULL,
    payable_id INT UNSIGNED NOT NULL,
    wallet_id INT UNSIGNED NOT NULL,
    type VARCHAR(255) NOT NULL,
    amount DECIMAL(64,2) NOT NULL,
    confirmed TINYINT(1) DEFAULT 1,
    meta TEXT NULL,
    uuid VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS payment_gateways (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NULL,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS payment_gateway_restaurant (
    payment_gateway_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (payment_gateway_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS user_restaurant (
    user_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS restaurant_earnings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT UNSIGNED NOT NULL,
    order_id INT UNSIGNED NULL,
    total DECIMAL(10,2) NOT NULL,
    commission DECIMAL(10,2) DEFAULT 0,
    restaurant_earning DECIMAL(10,2) DEFAULT 0,
    restaurant_payout_id INT NULL,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS restaurant_payouts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    is_paid TINYINT(1) DEFAULT 0,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS store_payout_details (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT UNSIGNED NOT NULL,
    bank_name VARCHAR(255) NULL,
    account_name VARCHAR(255) NULL,
    account_number VARCHAR(255) NULL,
    ifsc_code VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS zones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    coordinates TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS slides (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NULL,
    image VARCHAR(255) NULL,
    url VARCHAR(255) NULL,
    sort_position INT DEFAULT 0,
    location_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS alerts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NULL,
    body TEXT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS modules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NULL,
    code VARCHAR(255) NULL,
    is_enabled TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS favorites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    favoriteable_type VARCHAR(255) NOT NULL,
    favoriteable_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX favorites_user_id_index (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id CHAR(36) NOT NULL,
    type VARCHAR(255) NOT NULL,
    notifiable_type VARCHAR(255) NOT NULL,
    notifiable_id INT UNSIGNED NOT NULL,
    data TEXT NOT NULL,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    INDEX notifications_notifiable_type_notifiable_id_index (notifiable_type, notifiable_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS delivery_collections (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    amount DECIMAL(10,2) DEFAULT 0,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS delivery_collection_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_collection_id INT UNSIGNED NULL,
    user_id INT UNSIGNED NULL,
    order_id INT UNSIGNED NULL,
    amount DECIMAL(10,2) DEFAULT 0,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS sms_gateways (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS todo_notes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    note TEXT NULL,
    is_done TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS razorpay_data (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NULL,
    razorpay_order_id VARCHAR(255) NULL,
    razorpay_payment_id VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    log_name VARCHAR(255) NULL,
    description TEXT NOT NULL,
    subject_type VARCHAR(255) NULL,
    subject_id INT UNSIGNED NULL,
    causer_type VARCHAR(255) NULL,
    causer_id INT UNSIGNED NULL,
    properties TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX activity_log_log_name_index (log_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Spatie permissions
  `CREATE TABLE IF NOT EXISTS permissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    guard_name VARCHAR(255) NOT NULL,
    readable_name VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY permissions_name_guard_name_unique (name, guard_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS roles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    guard_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY roles_name_guard_name_unique (name, guard_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS model_has_permissions (
    permission_id INT UNSIGNED NOT NULL,
    model_type VARCHAR(255) NOT NULL,
    model_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (permission_id, model_id, model_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS model_has_roles (
    role_id INT UNSIGNED NOT NULL,
    model_type VARCHAR(255) NOT NULL,
    model_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, model_id, model_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS role_has_permissions (
    permission_id INT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (permission_id, role_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Seed: default roles
  `INSERT IGNORE INTO roles (name, guard_name, created_at, updated_at) VALUES
    ('Admin', 'web', NOW(), NOW()),
    ('Customer', 'web', NOW(), NOW()),
    ('Store Owner', 'web', NOW(), NOW()),
    ('Delivery Guy', 'web', NOW(), NOW())`,

  // Seed: default settings
  `INSERT IGNORE INTO settings (`key`, `value`, created_at, updated_at) VALUES
    ('taxApplicable', 'false', NOW(), NOW()),
    ('taxPercentage', '0', NOW(), NOW()),
    ('enablePushNotificationOrders', 'false', NOW(), NOW()),
    ('randomizeStores', 'false', NOW(), NOW()),
    ('sortDeliveryStoresByDistance', 'false', NOW(), NOW()),
    ('sortSelfpickupStoresByDistance', 'false', NOW(), NOW()),
    ('showInActiveItemsToo', 'false', NOW(), NOW()),
    ('enGDMA', 'false', NOW(), NOW()),
    ('enDelChrRnd', 'false', NOW(), NOW()),
    ('smsRestaurantNotify', 'false', NOW(), NOW())`,

  // Seed: default language (English)
  `INSERT IGNORE INTO translations (language_name, language_code, is_default, is_active, translation_data, created_at, updated_at) VALUES
    ('English', 'en', 1, 1, '{"orderPaymentWalletComment":"Payment for order ","orderPartialPaymentWalletComment":"Partial payment for order ","orderRefundWalletComment":"Refund for order ","orderPartialRefundWalletComment":"Partial refund for order "}', NOW(), NOW())`,
];

(async () => {
  let ok = 0, fail = 0;
  for (const sql of tables) {
    try {
      await sequelize.query(sql);
      ok++;
    } catch (err) {
      console.error('Error en:', sql.substring(0, 60), '\n  ->', err.message);
      fail++;
    }
  }
  console.log(`\nMigración completada: ${ok} OK | ${fail} errores`);
  process.exit(fail > 0 ? 1 : 0);
})();
