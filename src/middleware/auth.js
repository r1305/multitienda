const jwt = require('jsonwebtoken');
const { QueryTypes } = require('sequelize');
const { User, sequelize } = require('../models');

// Fábrica: `permitirInactivo` deja pasar cuentas desactivadas (solo para /check-ban,
// que necesita responder success:false en lugar de 403).
function crearJwtAuth(permitirInactivo) {
  return async function jwtAuthHandler(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Token not provided' });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.sub);
      if (!user) return res.status(401).json({ message: 'User not found' });
      if (!permitirInactivo && !user.is_active) {
        return res.status(403).json({ success: false, message: 'Tu cuenta no está activa o fue suspendida' });
      }
      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

const jwtAuth = crearJwtAuth(false);
const jwtAuthPermitirInactivo = crearJwtAuth(true);

function generateToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.sub);
      if (user && user.is_active) req.user = user;
    } catch (err) {}
  }
  next();
}

async function getUserRoles(userId) {
  const rows = await sequelize.query(
    'SELECT r.name FROM model_has_roles mr JOIN roles r ON r.id = mr.role_id WHERE mr.model_id = ?',
    { replacements: [userId], type: QueryTypes.SELECT }
  );
  return rows.map((r) => r.name);
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'No autenticado' });
    try {
      const userRoles = await getUserRoles(req.user.id);
      if (!roles.some((r) => userRoles.includes(r))) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para esta acción' });
      }
      if (!req.user.is_active) {
        return res.status(403).json({ success: false, message: 'Tu cuenta no está activa o aún no ha sido aprobada' });
      }
      req.userRoles = userRoles;
      next();
    } catch (err) {
      console.error('requireRole error:', err.message);
      res.status(500).json({ success: false, message: 'Error al verificar permisos' });
    }
  };
}

module.exports = { jwtAuth, jwtAuthPermitirInactivo, generateToken, optionalAuth, requireRole, getUserRoles };
