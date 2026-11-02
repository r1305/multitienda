require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize } = require('../src/models');
const { run: runMigrations } = require('../migrate');

const ADMIN_NAME = 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@multitienda.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '$Multitienda2026$';

async function ensureAdmin({ name = ADMIN_NAME, email = ADMIN_EMAIL, password = ADMIN_PASSWORD, pinCode = null } = {}) {
  const [exists] = await sequelize.query('SELECT id FROM users WHERE email = ? LIMIT 1', { replacements: [email] });
  if (exists.length) {
    console.log('OMITIDO: usuario admin ya existe');
    return false;
  }
  const [roles] = await sequelize.query("SELECT id FROM roles WHERE name = 'Admin' AND guard_name = 'web' ORDER BY id ASC LIMIT 1");
  if (!roles.length) throw new Error("rol 'Admin' no existe; ejecuta las migraciones/seeds de roles antes de crear el admin");
  const hash = await bcrypt.hash(password, 10);
  await sequelize.query(
    'INSERT INTO users (name, email, password, is_active, pin_code, created_at, updated_at) VALUES (?, ?, ?, 1, ?, NOW(), NOW())',
    { replacements: [name, email, hash, pinCode] }
  );
  const [[user]] = await sequelize.query('SELECT id FROM users WHERE email = ? LIMIT 1', { replacements: [email] });
  await sequelize.query(
    'INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?, ?, ?)',
    { replacements: [roles[0].id, 'App\\User', user.id] }
  );
  console.log(`APLICADO: usuario admin creado (${email})`);
  return true;
}

async function main() {
  let fail = await runMigrations();
  try {
    await ensureAdmin();
  } catch (err) {
    console.error('Error admin:', err.message);
    fail++;
  }
  return fail;
}

module.exports = { ensureAdmin };

if (require.main === module) {
  main()
    .then(async (fail) => { await sequelize.close(); process.exitCode = fail > 0 ? 1 : 0; })
    .catch(async (err) => { console.error('Abortado:', err.message); try { await sequelize.close(); } catch (e) {} process.exitCode = 1; });
}
