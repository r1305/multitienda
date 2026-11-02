-- fix-schema.sql — completa el esquema de multitienda sobre una BD existente (equivale a migrate.run()).
-- Generado desde migrate.js. Idempotente: se puede ejecutar varias veces.
-- NO borra ni vacía tablas: solo CREATE TABLE IF NOT EXISTS, ADD COLUMN/INDEX si faltan y seeds con WHERE NOT EXISTS.
-- Únicos cambios de datos: store_payouts.status ENUM -> VARCHAR(20) y filas 'approved' -> 'paid' (igual que migrate.js).
--
-- ANTES DE EJECUTAR: haz copia de seguridad completa de la BD
--   phpMyAdmin > seleccionar la BD > Exportar > Rápido > SQL (o cPanel > Copias de seguridad).
-- Cómo ejecutar: phpMyAdmin > seleccionar la BD de la app (p. ej. zahrksos_multitienda) > pestaña SQL > pegar o Importar este archivo.
-- Compatible con MySQL 5.7/8 y MariaDB (no usa ADD COLUMN IF NOT EXISTS; usa information_schema + PREPARE/EXECUTE).

SET NAMES utf8mb4;

-- 1) Tablas faltantes y datos base (roles, settings, idioma, pasarelas, rubros)
CREATE TABLE IF NOT EXISTS users (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS password_resets (
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    INDEX password_resets_email_index (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS settings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS locations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    is_primary TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS promo_sliders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NULL,
    image VARCHAR(255) NULL,
    url VARCHAR(255) NULL,
    location_id INT NULL,
    position_id INT NULL,
    size VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS restaurants (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS item_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    restaurant_id INT UNSIGNED NULL,
    user_id INT UNSIGNED NULL,
    is_enabled TINYINT(1) DEFAULT 1,
    order_column INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS items (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS addon_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    restaurant_id INT UNSIGNED NULL,
    addonlimit INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS addons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) DEFAULT 0,
    addon_category_id INT UNSIGNED NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS addon_category_item (
    addon_category_id INT UNSIGNED NOT NULL,
    item_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (addon_category_id, item_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS orders (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS orderitems (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    item_id INT UNSIGNED NULL,
    name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS order_item_addons (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    orderitem_id INT UNSIGNED NOT NULL,
    addon_category_name VARCHAR(255) NULL,
    addon_name VARCHAR(255) NULL,
    addon_price DECIMAL(10,2) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS addresses (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    address TEXT NULL,
    house VARCHAR(255) NULL,
    tag VARCHAR(255) NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS coupons (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS coupon_restaurant (
    coupon_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (coupon_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS ratings (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS user_favorite_stores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY user_favorite_stores_unique (user_id, restaurant_id),
    KEY user_favorite_stores_restaurant (restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pages (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    body LONGTEXT NULL,
    slug VARCHAR(255) NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS translations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    language_name VARCHAR(255) NOT NULL,
    language_code VARCHAR(255) NOT NULL,
    is_default TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    translation_data LONGTEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS push_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    token TEXT NULL,
    device_type VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sms_otps (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(255) NOT NULL,
    otp VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY sms_otps_phone_unique (phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS password_reset_otps (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY password_reset_otps_email_unique (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS restaurant_categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    image VARCHAR(255) NULL,
    order_column INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS restaurant_category_restaurant (
    restaurant_category_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (restaurant_category_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS restaurant_category_sliders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_category_id INT UNSIGNED NULL,
    image VARCHAR(255) NULL,
    order_column INT DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS delivery_guy_details (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS accept_deliveries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS delivery_earnings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    order_id INT UNSIGNED NULL,
    amount DECIMAL(10,2) NULL,
    commission_type VARCHAR(50) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS popular_geo_places (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    latitude DECIMAL(10,8) NULL,
    longitude DECIMAL(11,8) NULL,
    is_default TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wallets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    holder_type VARCHAR(255) NOT NULL,
    holder_id INT UNSIGNED NOT NULL,
    balance DECIMAL(64,2) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX wallets_holder_type_holder_id_index (holder_type, holder_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS transactions (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS payment_gateways (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NULL,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS payment_gateway_secrets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    gateway_id INT UNSIGNED NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    value_encrypted TEXT NOT NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY payment_gateway_secrets_gateway_key_unique (gateway_id, `key`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS payment_gateway_restaurant (
    payment_gateway_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (payment_gateway_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS user_restaurant (
    user_id INT UNSIGNED NOT NULL,
    restaurant_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, restaurant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS restaurant_earnings (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS restaurant_payouts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    is_paid TINYINT(1) DEFAULT 0,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS store_payout_details (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT UNSIGNED NOT NULL,
    bank_name VARCHAR(255) NULL,
    account_name VARCHAR(255) NULL,
    account_number VARCHAR(255) NULL,
    ifsc_code VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS zones (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    coordinates TEXT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS slides (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NULL,
    image VARCHAR(255) NULL,
    url VARCHAR(255) NULL,
    sort_position INT DEFAULT 0,
    location_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS alerts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NULL,
    body TEXT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS modules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NULL,
    code VARCHAR(255) NULL,
    is_enabled TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS favorites (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    favoriteable_type VARCHAR(255) NOT NULL,
    favoriteable_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX favorites_user_id_index (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notifications (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS delivery_collections (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    amount DECIMAL(10,2) DEFAULT 0,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS delivery_collection_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_collection_id INT UNSIGNED NULL,
    user_id INT UNSIGNED NULL,
    order_id INT UNSIGNED NULL,
    amount DECIMAL(10,2) DEFAULT 0,
    zone_id INT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sms_gateways (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    is_active TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS todo_notes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    note TEXT NULL,
    is_done TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS razorpay_data (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NULL,
    razorpay_order_id VARCHAR(255) NULL,
    razorpay_payment_id VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS activity_log (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS permissions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    guard_name VARCHAR(255) NOT NULL,
    readable_name VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY permissions_name_guard_name_unique (name, guard_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS roles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    guard_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY roles_name_guard_name_unique (name, guard_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS model_has_permissions (
    permission_id INT UNSIGNED NOT NULL,
    model_type VARCHAR(255) NOT NULL,
    model_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (permission_id, model_id, model_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS model_has_roles (
    role_id INT UNSIGNED NOT NULL,
    model_type VARCHAR(255) NOT NULL,
    model_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, model_id, model_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS role_has_permissions (
    permission_id INT UNSIGNED NOT NULL,
    role_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (permission_id, role_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS restaurant_user (
    restaurant_id INT UNSIGNED,
    user_id INT UNSIGNED
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS delivery_ignored_orders (
    user_id INT UNSIGNED,
    order_id INT UNSIGNED
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS chats (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED,
    sender_id INT UNSIGNED,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS business_types (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY business_types_name_unique (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO business_types (name, is_active) VALUES
    ('Restaurante', 1),
    ('Farmacia', 1),
    ('Tienda', 1),
    ('Licorería', 1),
    ('Ferretería', 1),
    ('Panadería', 1);
CREATE TABLE IF NOT EXISTS cash_collections (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_guy_id INT UNSIGNED NOT NULL,
    expected_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    received_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    difference DECIMAL(10,2) NOT NULL DEFAULT 0,
    note VARCHAR(500) NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    KEY cash_collections_delivery_guy_idx (delivery_guy_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS delivery_payouts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_guy_id INT UNSIGNED NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    reference VARCHAR(255) NULL,
    note VARCHAR(500) NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    KEY delivery_payouts_delivery_guy_idx (delivery_guy_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS store_earnings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT UNSIGNED NOT NULL,
    order_id INT UNSIGNED NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    coupon_absorbed_by VARCHAR(20) NOT NULL DEFAULT 'platform',
    coupon_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    net_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    kind VARCHAR(30) NOT NULL DEFAULT 'sale',
    payout_id INT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY store_earnings_order_id_unique (order_id),
    KEY store_earnings_restaurant_payout_idx (restaurant_id, payout_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS store_payouts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    restaurant_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'requested',
    notes TEXT NULL,
    reference VARCHAR(255) NULL,
    paid_at DATETIME NULL,
    paid_amount DECIMAL(10,2) NULL,
    difference DECIMAL(10,2) NULL,
    paid_by INT UNSIGNED NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    KEY store_payouts_restaurant_status_idx (restaurant_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO roles (name, guard_name, created_at, updated_at)
    SELECT s.name, 'web', NOW(), NOW() FROM (
      SELECT 'Admin' AS name UNION ALL SELECT 'Customer' UNION ALL SELECT 'Store Owner' UNION ALL SELECT 'Delivery Guy'
    ) s WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.name = s.name);
INSERT INTO settings (`key`, `value`, created_at, updated_at)
    SELECT s.k, s.v, NOW(), NOW() FROM (
      SELECT 'taxApplicable' AS k, 'false' AS v
      UNION ALL SELECT 'taxPercentage', '0'
      UNION ALL SELECT 'enablePushNotificationOrders', 'false'
      UNION ALL SELECT 'randomizeStores', 'false'
      UNION ALL SELECT 'sortDeliveryStoresByDistance', 'false'
      UNION ALL SELECT 'sortSelfpickupStoresByDistance', 'false'
      UNION ALL SELECT 'showInActiveItemsToo', 'false'
      UNION ALL SELECT 'enGDMA', 'false'
      UNION ALL SELECT 'enDelChrRnd', 'false'
      UNION ALL SELECT 'smsRestaurantNotify', 'false'
      UNION ALL SELECT 'currencySymbol', '$'
      UNION ALL SELECT 'currencyFormat', '$'
      UNION ALL SELECT 'currencySymbolAlign', 'left'
      UNION ALL SELECT 'deliveryRadius', '10'
      UNION ALL SELECT 'enableDeliveryPin', 'false'
      UNION ALL SELECT 'uploadImageQuality', '75'
      UNION ALL SELECT 'googleApiKey', ''
    ) s WHERE NOT EXISTS (SELECT 1 FROM settings x WHERE x.`key` = s.k);
INSERT INTO translations (language_name, language_code, is_default, is_active, translation_data, created_at, updated_at)
    SELECT 'English', 'en', 1, 1, '{"orderPaymentWalletComment":"Payment for order ","orderPartialPaymentWalletComment":"Partial payment for order ","orderRefundWalletComment":"Refund for order ","orderPartialRefundWalletComment":"Partial refund for order "}', NOW(), NOW() FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM translations WHERE language_code = 'en' OR is_default = 1);
INSERT INTO payment_gateways (name, title, is_active, created_at, updated_at)
    SELECT 'MERCADOPAGO', 'Mercado Pago', 0, NOW(), NOW() FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM payment_gateways WHERE UPPER(TRIM(name)) = 'MERCADOPAGO');
INSERT INTO payment_gateways (name, is_active, created_at, updated_at)
    SELECT 'COD', 1, NOW(), NOW() FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM payment_gateways WHERE UPPER(TRIM(name)) = 'COD');

-- 2) Columnas faltantes (solo si no existen)
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE users ADD COLUMN pin_code VARCHAR(50) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'pin_code');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurants ADD COLUMN business_type_id INT UNSIGNED NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND COLUMN_NAME = 'business_type_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurants ADD COLUMN is_pureveg TINYINT(1) DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND COLUMN_NAME = 'is_pureveg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurants ADD COLUMN is_sms_notifiable TINYINT(1) DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND COLUMN_NAME = 'is_sms_notifiable');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurants ADD COLUMN custom_featured_name VARCHAR(255) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND COLUMN_NAME = 'custom_featured_name');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurants ADD COLUMN custom_message_on_list TEXT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND COLUMN_NAME = 'custom_message_on_list');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurant_category_restaurant ADD COLUMN created_at TIMESTAMP NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurant_category_restaurant' AND COLUMN_NAME = 'created_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurant_category_restaurant ADD COLUMN updated_at TIMESTAMP NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurant_category_restaurant' AND COLUMN_NAME = 'updated_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE popular_geo_places ADD COLUMN is_default TINYINT(1) DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'popular_geo_places' AND COLUMN_NAME = 'is_default');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE popular_geo_places ADD COLUMN is_active TINYINT(1) DEFAULT 1', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'popular_geo_places' AND COLUMN_NAME = 'is_active');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE addon_categories ADD COLUMN type ENUM(''SINGLE'',''MULTIPLE'') DEFAULT ''SINGLE''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'addon_categories' AND COLUMN_NAME = 'type');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_guy_details ADD COLUMN commission_type ENUM(''fixed'',''percentage'',''dynamic'') DEFAULT ''fixed''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_guy_details' AND COLUMN_NAME = 'commission_type');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_guy_details ADD COLUMN percentage_base ENUM(''total'',''delivery_charge'') DEFAULT ''total''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_guy_details' AND COLUMN_NAME = 'percentage_base');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_guy_details ADD COLUMN dynamic_base_distance DECIMAL(8,2) DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_guy_details' AND COLUMN_NAME = 'dynamic_base_distance');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_guy_details ADD COLUMN dynamic_base_price DECIMAL(10,2) DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_guy_details' AND COLUMN_NAME = 'dynamic_base_price');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_guy_details ADD COLUMN dynamic_price_per_km DECIMAL(10,2) DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_guy_details' AND COLUMN_NAME = 'dynamic_price_per_km');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_guy_details ADD COLUMN fixed_commission DECIMAL(10,2) DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_guy_details' AND COLUMN_NAME = 'fixed_commission');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE restaurants ADD COLUMN prep_minutes INT NULL DEFAULT 20', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'restaurants' AND COLUMN_NAME = 'prep_minutes');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE ratings ADD COLUMN reply TEXT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ratings' AND COLUMN_NAME = 'reply');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE payment_gateways ADD COLUMN account_number VARCHAR(255) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_gateways' AND COLUMN_NAME = 'account_number');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE payment_gateways ADD COLUMN phone_number VARCHAR(255) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_gateways' AND COLUMN_NAME = 'phone_number');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE orders ADD COLUMN cash_collection_id INT UNSIGNED NULL, ADD INDEX orders_cash_collection_idx (cash_collection_id)', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'cash_collection_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_earnings ADD COLUMN payout_id INT UNSIGNED NULL, ADD INDEX delivery_earnings_payout_idx (payout_id)', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_earnings' AND COLUMN_NAME = 'payout_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE delivery_earnings ADD COLUMN tip_amount DECIMAL(10,2) NOT NULL DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_earnings' AND COLUMN_NAME = 'tip_amount');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_earnings ADD COLUMN kind VARCHAR(30) NOT NULL DEFAULT ''sale''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_earnings' AND COLUMN_NAME = 'kind');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN amount DECIMAL(10,2) NOT NULL DEFAULT 0', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'amount');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT ''requested''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'status');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN user_id INT UNSIGNED NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'user_id');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN notes TEXT NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'notes');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN reference VARCHAR(255) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'reference');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN paid_at DATETIME NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'paid_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN paid_amount DECIMAL(10,2) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'paid_amount');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN difference DECIMAL(10,2) NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'difference');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN paid_by INT UNSIGNED NULL', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'paid_by');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'created_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE store_payouts ADD COLUMN updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'updated_at');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3) store_payouts.status: ENUM del instalador -> VARCHAR(20) conservando valores
SET @s = (SELECT IF(COUNT(*) > 0, 'ALTER TABLE store_payouts MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT ''requested''', 'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'store_payouts' AND COLUMN_NAME = 'status' AND DATA_TYPE = 'enum');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Legacy: 'approved' equivale a 'paid'; completa paid_amount con amount si estaba vacío
UPDATE store_payouts SET status = 'paid', paid_amount = COALESCE(paid_amount, amount) WHERE status = 'approved';

-- 4) UNIQUE por order_id: solo si no existe y no hay order_id duplicados (si los hay, depurar a mano y volver a ejecutar)
SET @s = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ratings' AND INDEX_NAME = 'ratings_order_id_unique') = 0
  AND (SELECT COUNT(*) FROM (SELECT order_id FROM `ratings` WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*) > 1) d) = 0,
  'ALTER TABLE `ratings` ADD UNIQUE KEY `ratings_order_id_unique` (order_id)', 'SELECT 1'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accept_deliveries' AND INDEX_NAME = 'accept_deliveries_order_id_unique') = 0
  AND (SELECT COUNT(*) FROM (SELECT order_id FROM `accept_deliveries` WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*) > 1) d) = 0,
  'ALTER TABLE `accept_deliveries` ADD UNIQUE KEY `accept_deliveries_order_id_unique` (order_id)', 'SELECT 1'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_earnings' AND INDEX_NAME = 'delivery_earnings_order_id_unique') = 0
  AND (SELECT COUNT(*) FROM (SELECT order_id FROM `delivery_earnings` WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*) > 1) d) = 0,
  'ALTER TABLE `delivery_earnings` ADD UNIQUE KEY `delivery_earnings_order_id_unique` (order_id)', 'SELECT 1'));
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5) Índices de rendimiento (solo si no existen)
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_restaurant` (restaurant_id)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_restaurant');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_user` (user_id)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_user');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_status` (orderstatus_id)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_status');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD INDEX `idx_orders_created` (created_at)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_created');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orderitems` ADD INDEX `idx_orderitems_order` (order_id)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orderitems' AND INDEX_NAME = 'idx_orderitems_order');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `accept_deliveries` ADD INDEX `idx_accept_deliveries_order` (order_id)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accept_deliveries' AND INDEX_NAME = 'idx_accept_deliveries_order');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `model_has_roles` ADD INDEX `idx_model_has_roles_model` (model_id)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'model_has_roles' AND INDEX_NAME = 'idx_model_has_roles_model');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `delivery_earnings` ADD INDEX `idx_delivery_earnings_user` (user_id)', 'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_earnings' AND INDEX_NAME = 'idx_delivery_earnings_user');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
