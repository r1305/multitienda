const express = require('express');
const router = express.Router();
const { getAppBasePath, withAppBase } = require('../helpers/appBasePath');
const { sequelize } = require('../models');
const { run: runMigrations } = require('../../migrate');
const { ensureAdmin } = require('../../scripts/create-tables');

// Block install route in production
const isProd = process.env.NODE_ENV === 'production';

// Install page - shows form
router.get('/install', async (req, res) => {
  if (isProd) return res.status(404).send('Not found');
  // Check if already installed
  try {
    const [users] = await sequelize.query('SELECT id FROM users LIMIT 1').catch(() => [[]]);
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
  if (isProd) return res.status(404).send('Not found');
  const { db_name, db_password, email, password, pin_code } = req.body;

  try {
    if (db_name !== process.env.DB_DATABASE || (db_password || '') !== (process.env.DB_PASSWORD || '')) {
      throw new Error('los datos de BD no coinciden con .env');
    }
    if (!email || !password || !pin_code) throw new Error('faltan datos del administrador');

    await sequelize.authenticate();
    const fail = await runMigrations();
    if (fail > 0) throw new Error(`migración con ${fail} errores`);
    const created = await ensureAdmin({ name: 'Admin', email, password, pinCode: pin_code });
    if (!created) throw new Error('el email del administrador ya existe');

    const host = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const prefix = getAppBasePath();
    const baseUrl = prefix && !host.endsWith(prefix) ? `${host}${prefix}` : host;
    const appLink = (p) => (host + withAppBase(p));

    res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalación Exitosa</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#f5f7fa;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px;max-width:520px;width:100%}h1{font-size:24px;margin-bottom:8px;color:#2e7d32}p{color:#666;font-size:14px;margin-bottom:24px}.url-list{list-style:none;margin-bottom:24px}.url-list li{padding:12px;background:#f5f7fa;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}.url-list li span{font-size:13px;color:#555;font-weight:500}.url-list li a{font-size:12px;color:#ff5722;text-decoration:none;font-weight:600}.btn{display:inline-block;padding:12px 24px;background:#ff5722;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px}</style>
</head><body>
<div class="card">
  <h1>✅ Instalación Exitosa</h1>
  <p>Tu aplicación multitienda está lista. Guarda estas URLs:</p>
  <ul class="url-list">
    <li><span>🛒 Cliente</span><a href="${appLink('/')}">${appLink('/')}</a></li>
    <li><span>🏪 Store Owner</span><a href="${appLink('/store-owner')}">${appLink('/store-owner')}</a></li>
    <li><span>🏍 Delivery</span><a href="${appLink('/delivery')}">${appLink('/delivery')}</a></li>
    <li><span>⚙️ Admin</span><a href="${appLink('/admin/dashboard')}">${appLink('/admin/dashboard')}</a></li>
  </ul>
  <p style="font-size:12px;color:#888;margin-bottom:16px"><strong>Email:</strong> ${email}<br><strong>PIN Code:</strong> ${pin_code} (guárdalo para limpiar datos)</p>
  <a href="/auth/login" class="btn">Ir al Admin</a>
</div>
</body></html>`);

  } catch (err) {
    console.error('install:', err.message);
    res.send(`
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Error</title>
<style>body{font-family:sans-serif;padding:40px;text-align:center}.error{background:#ffebee;color:#c62828;padding:20px;border-radius:8px;max-width:500px;margin:0 auto}</style>
</head><body><div class="error"><h3>Error de instalación</h3><p>No se pudo completar la instalación. Verifica los datos e intenta de nuevo.</p><br><a href="/install">Volver</a></div></body></html>`);
  }
});

module.exports = router;
