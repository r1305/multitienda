const path = require('path');

// Crea un filtro de multer que solo acepta imágenes raster con extensión permitida.
// SVG queda excluido siempre: puede contener scripts (XSS almacenado).
function invalidImage(message) {
  return Object.assign(new Error(message), { code: 'INVALID_IMAGE' });
}

function createImageFileFilter(allowedExts) {
  const permitidas = allowedExts.filter((e) => e !== '.svg');
  return function imageFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!permitidas.includes(ext)) {
      return cb(invalidImage('Solo se permiten imágenes ' + permitidas.join(', ')));
    }
    if (!mime.startsWith('image/') || mime.includes('svg')) {
      return cb(invalidImage('Solo se permiten tipos MIME de imagen válidos'));
    }
    cb(null, true);
  };
}

module.exports = { createImageFileFilter };
