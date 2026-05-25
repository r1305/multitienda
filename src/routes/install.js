const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

// Install page - shows form
router.get('/install', async (req, res) => {
  // Check if already installed
  try {
    const { Sequelize } = require('sequelize');
    const seq = new Sequelize(process.env.DB_DATABASE, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
      host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, dialect: 'mysql', logging: false
    });
    const [users] = await seq.query('SELECT id FROM users LIMIT 1').catch(() => [[]]);
    await seq.close();
    if (users && users.length) {
      return res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>⚠️ Ya instalado</h2><p>La aplicación ya está instalada. Si necesitas reinstalar, elimina las tablas primero.</p><a href="/admin/dashboard">Ir al Admin</a></body></html>`);
    }
  } catch(e) {}

  res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalación</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f7fa;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px;max-width:480px;width:100%}h1{font-size:24px;margin-bottom:8px;color:#1e2a38}p{color:#666;font-size:14px;margin-bottom:24px}.section{margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f0f0f0}.section-title{font-size:12px;font-weight:600;color:#888;text-transform:uppercase;margin-bottom:12px}label{display:block;font-size:13px;font-weight:500;color:#555;margin-bottom:4px}input{width:100%;padding:12px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:12px}input:focus{outline:none;border-color:#ff5722}button{width:100%;padding:14px;background:#ff5722;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}button:hover{background:#e64a19}.error{background:#ffebee;color:#c62828;padding:10px;border-radius:8px;font-size:13px;margin-bottom:16px}</style>
</head><body>
<div class="card">
  <h1>🚀 Instalación</h1>
  <p>Configura tu aplicación multitienda</p>
  <form method="POST" action="/install">
    <div class="section">
      <div class="section-title">Base de Datos</div>
      <label>DB Name</label><input type="text" name="db_name" required value="${process.env.DB_DATABASE || ''}">
      <label>DB Password</label><input type="password" name="db_password" required>
    </div>
    <div class="section">
      <div class="section-title">Super Administrador</div>
      <label>Email</label><input type="email" name="email" required placeholder="admin@example.com">
      <label>Contraseña</label><input type="password" name="password" required placeholder="Min 6 caracteres">
      <label>PIN Code (para limpiar datos)</label><input type="text" name="pin_code" required placeholder="Ej: 1234" maxlength="10">
    </div>
    <button type="submit">Instalar</button>
  </form>
</div>
</body></html>`);
});

// Process installation
router.post('/install', async (req, res) => {
  const { db_name, db_password, email, password, pin_code } = req.body;

  try {
    const { Sequelize } = require('sequelize');
    const seq = new Sequelize(db_name, process.env.DB_USERNAME, db_password, {
      host: process.env.DB_HOST, port: process.env.DB_PORT || 3306, dialect: 'mysql', logging: false
    });

    await seq.authenticate();

    // Create all tables
    const tables = `
      CREATE TABLE IF NOT EXISTS users (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        phone VARCHAR(255),
        auth_token TEXT,
        default_address_id INT DEFAULT 0,
        avatar VARCHAR(255),
        tax_number VARCHAR(255),
        is_active TINYINT(1) DEFAULT 1,
        user_ip VARCHAR(255),
        pin_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS roles (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        guard_name VARCHAR(255) DEFAULT 'web',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS model_has_roles (
        role_id INT UNSIGNED,
        model_type VARCHAR(255) DEFAULT 'App\\\\User',
        model_id INT UNSIGNED
      );

      CREATE TABLE IF NOT EXISTS addresses (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED,
        address TEXT,
        house VARCHAR(255),
        tag VARCHAR(255),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS restaurants (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        description TEXT,
        slug VARCHAR(255),
        image VARCHAR(255),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        address TEXT,
        pincode VARCHAR(50),
        landmark VARCHAR(255),
        certificate VARCHAR(255),
        rating DECIMAL(3,1),
        delivery_radius DECIMAL(8,2),
        delivery_charges DECIMAL(10,2) DEFAULT 0,
        delivery_charge_type VARCHAR(50) DEFAULT 'FIXED',
        base_delivery_charge DECIMAL(10,2) DEFAULT 0,
        base_delivery_distance DECIMAL(8,2) DEFAULT 0,
        extra_delivery_charge DECIMAL(10,2) DEFAULT 0,
        extra_delivery_distance DECIMAL(8,2) DEFAULT 0,
        restaurant_charges DECIMAL(10,2) DEFAULT 0,
        delivery_time VARCHAR(255),
        price_range VARCHAR(50),
        is_active TINYINT(1) DEFAULT 1,
        is_accepted TINYINT(1) DEFAULT 0,
        is_featured TINYINT(1) DEFAULT 0,
        is_schedulable TINYINT(1) DEFAULT 0,
        auto_acceptable TINYINT(1) DEFAULT 0,
        delivery_type INT DEFAULT 1,
        commission_rate DECIMAL(5,2) DEFAULT 0,
        min_order_price DECIMAL(10,2) DEFAULT 0,
        free_delivery_subtotal DECIMAL(10,2) DEFAULT 0,
        zone_id INT,
        order_column INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS restaurant_user (
        restaurant_id INT UNSIGNED,
        user_id INT UNSIGNED
      );

      CREATE TABLE IF NOT EXISTS items (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        description TEXT,
        price DECIMAL(10,2),
        old_price DECIMAL(10,2) DEFAULT 0,
        image VARCHAR(255),
        is_active TINYINT(1) DEFAULT 1,
        is_recommended TINYINT(1) DEFAULT 0,
        is_veg TINYINT(1) DEFAULT 0,
        restaurant_id INT UNSIGNED,
        item_category_id INT UNSIGNED,
        order_column INT,
        zone_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS item_categories (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        restaurant_id INT UNSIGNED,
        is_enabled TINYINT(1) DEFAULT 1,
        order_column INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS addon_categories (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        description TEXT,
        type ENUM('SINGLE','MULTIPLE') DEFAULT 'SINGLE',
        restaurant_id INT UNSIGNED,
        addonlimit INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS addons (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        price DECIMAL(10,2) DEFAULT 0,
        addon_category_id INT UNSIGNED,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS addon_category_item (
        addon_category_id INT UNSIGNED,
        item_id INT UNSIGNED
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        unique_order_id VARCHAR(255),
        user_id INT UNSIGNED,
        restaurant_id INT UNSIGNED,
        orderstatus_id INT DEFAULT 1,
        total DECIMAL(10,2),
        sub_total DECIMAL(10,2),
        delivery_charge DECIMAL(10,2) DEFAULT 0,
        actual_delivery_charge DECIMAL(10,2) DEFAULT 0,
        restaurant_charge DECIMAL(10,2) DEFAULT 0,
        tax DECIMAL(5,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        coupon_name VARCHAR(255),
        coupon_amount DECIMAL(10,2) DEFAULT 0,
        tip_amount DECIMAL(10,2) DEFAULT 0,
        wallet_amount DECIMAL(10,2) DEFAULT 0,
        payable DECIMAL(10,2),
        payment_mode VARCHAR(255),
        transaction_id VARCHAR(255),
        address TEXT,
        location TEXT,
        delivery_type INT DEFAULT 1,
        delivery_pin VARCHAR(50),
        order_comment TEXT,
        distance DECIMAL(8,2) DEFAULT 0,
        cash_change_amount DECIMAL(10,2),
        is_scheduled TINYINT(1) DEFAULT 0,
        schedule_date TEXT,
        schedule_slot TEXT,
        zone_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orderitems (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id INT UNSIGNED,
        item_id INT UNSIGNED,
        name VARCHAR(255),
        quantity INT DEFAULT 1,
        price DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_item_addons (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        orderitem_id INT UNSIGNED,
        addon_category_name VARCHAR(255),
        addon_name VARCHAR(255),
        addon_price DECIMAL(10,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS coupons (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(255),
        discount DECIMAL(10,2),
        discount_type VARCHAR(50) DEFAULT 'FIXED',
        max_discount DECIMAL(10,2) DEFAULT 0,
        min_sub_total DECIMAL(10,2) DEFAULT 0,
        max_sub_total DECIMAL(10,2) DEFAULT 0,
        count INT DEFAULT 0,
        max_count INT DEFAULT 0,
        max_count_per_user INT DEFAULT 0,
        restaurant_id INT UNSIGNED,
        user_type VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ratings (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id INT UNSIGNED,
        user_id INT UNSIGNED,
        restaurant_id INT UNSIGNED,
        delivery_id INT UNSIGNED,
        rating_store DECIMAL(3,1),
        rating_delivery DECIMAL(3,1),
        review_store TEXT,
        review_delivery TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255),
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payment_gateways (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        title VARCHAR(255),
        account_number VARCHAR(255),
        phone_number VARCHAR(255),
        is_active TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS delivery_guy_details (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED,
        vehicle_number VARCHAR(255),
        vehicle_type VARCHAR(255),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        heading DECIMAL(5,2),
        is_available TINYINT(1) DEFAULT 1,
        status VARCHAR(255),
        commission_rate DECIMAL(5,2),
        commission_type ENUM('fixed','percentage','dynamic') DEFAULT 'fixed',
        percentage_base ENUM('total','delivery_charge') DEFAULT 'total',
        dynamic_base_distance DECIMAL(8,2) DEFAULT 0,
        dynamic_base_price DECIMAL(10,2) DEFAULT 0,
        dynamic_price_per_km DECIMAL(10,2) DEFAULT 0,
        fixed_commission DECIMAL(10,2) DEFAULT 0,
        tip_commission_rate DECIMAL(5,2),
        max_accept_delivery_limit INT,
        cash_limit DECIMAL(10,2),
        is_sms_notifiable TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS accept_deliveries (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id INT UNSIGNED,
        user_id INT UNSIGNED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS delivery_earnings (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED,
        order_id INT UNSIGNED,
        amount DECIMAL(10,2),
        commission_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS delivery_ignored_orders (
        user_id INT UNSIGNED,
        order_id INT UNSIGNED
      );

      CREATE TABLE IF NOT EXISTS promo_sliders (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        image VARCHAR(255),
        url VARCHAR(255),
        location_id INT,
        position_id INT,
        size VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS translations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        language_name VARCHAR(255),
        language_code VARCHAR(50),
        is_default TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        translation_data LONGTEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(255) PRIMARY KEY,
        type VARCHAR(255),
        notifiable_id INT UNSIGNED,
        notifiable_type VARCHAR(255),
        data TEXT,
        read_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS chats (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id INT UNSIGNED,
        sender_id INT UNSIGNED,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS wallets (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        holder_type VARCHAR(255),
        holder_id INT UNSIGNED,
        balance DECIMAL(64,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        payable_type VARCHAR(255),
        payable_id INT UNSIGNED,
        wallet_id INT UNSIGNED,
        type VARCHAR(50),
        amount DECIMAL(64,2),
        confirmed TINYINT(1) DEFAULT 1,
        meta TEXT,
        uuid VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS restaurant_categories (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        image VARCHAR(255),
        order_column INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS restaurant_category_restaurant (
        restaurant_id INT UNSIGNED,
        restaurant_category_id INT UNSIGNED
      );

      CREATE TABLE IF NOT EXISTS restaurant_category_sliders (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        restaurant_category_id INT UNSIGNED,
        image VARCHAR(255),
        order_column INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS password_reset_otps (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255),
        otp VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sms_otps (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(255),
        otp VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS push_tokens (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNSIGNED,
        token TEXT,
        device_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;

    // Execute each CREATE TABLE statement
    const statements = tables.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      await seq.query(stmt);
    }

    // Create roles
    await seq.query("INSERT IGNORE INTO roles (id, name) VALUES (1, 'Admin'), (2, 'Customer'), (3, 'Delivery Guy'), (4, 'Store Owner')");

    // Create superadmin user
    const hash = await bcrypt.hash(password, 10);
    await seq.query(
      "INSERT INTO users (name, email, password, is_active, pin_code, created_at, updated_at) VALUES ('Admin', ?, ?, 1, ?, NOW(), NOW())",
      { replacements: [email, hash, pin_code] }
    );
    const [[admin]] = await seq.query("SELECT id FROM users WHERE email = ?", { replacements: [email] });

    // Assign admin role
    await seq.query("INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (1, 'App\\\\User', ?)", { replacements: [admin.id] });

    // Insert default settings
    const defaultSettings = [
      ['currencySymbol', '$'], ['currencyFormat', '$'], ['currencySymbolAlign', 'left'],
      ['deliveryRadius', '10'], ['enableDeliveryPin', 'false'],
      ['enablePushNotificationOrders', 'true'], ['uploadImageQuality', '75']
    ];
    for (const [key, value] of defaultSettings) {
      await seq.query("INSERT INTO settings (`key`, value) VALUES (?, ?)", { replacements: [key, value] });
    }

    // Insert COD payment method
    await seq.query("INSERT INTO payment_gateways (name, is_active, created_at, updated_at) VALUES ('COD', 1, NOW(), NOW())");

    await seq.close();

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

    res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalación Exitosa</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f7fa;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px;max-width:520px;width:100%}h1{font-size:24px;margin-bottom:8px;color:#2e7d32}p{color:#666;font-size:14px;margin-bottom:24px}.url-list{list-style:none;margin-bottom:24px}.url-list li{padding:12px;background:#f5f7fa;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}.url-list li span{font-size:13px;color:#555;font-weight:500}.url-list li a{font-size:12px;color:#ff5722;text-decoration:none;font-weight:600}.btn{display:inline-block;padding:12px 24px;background:#ff5722;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px}</style>
</head><body>
<div class="card">
  <h1>✅ Instalación Exitosa</h1>
  <p>Tu aplicación multitienda está lista. Guarda estas URLs:</p>
  <ul class="url-list">
    <li><span>🛒 Cliente</span><a href="${baseUrl}/">${baseUrl}/</a></li>
    <li><span>🏪 Store Owner</span><a href="${baseUrl}/store-owner">${baseUrl}/store-owner</a></li>
    <li><span>🏍 Delivery</span><a href="${baseUrl}/delivery">${baseUrl}/delivery</a></li>
    <li><span>⚙️ Admin</span><a href="${baseUrl}/admin/dashboard">${baseUrl}/admin/dashboard</a></li>
  </ul>
  <p style="font-size:12px;color:#888;margin-bottom:16px"><strong>Email:</strong> ${email}<br><strong>PIN Code:</strong> ${pin_code} (guárdalo para limpiar datos)</p>
  <a href="/auth/login" class="btn">Ir al Admin</a>
</div>
</body></html>`);

  } catch (err) {
    res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Error</title>
<style>body{font-family:sans-serif;padding:40px;text-align:center}.error{background:#ffebee;color:#c62828;padding:20px;border-radius:8px;max-width:500px;margin:0 auto}</style>
</head><body><div class="error"><h3>Error de instalación</h3><p>${err.message}</p><br><a href="/install">Volver</a></div></body></html>`);
  }
});

module.exports = router;
