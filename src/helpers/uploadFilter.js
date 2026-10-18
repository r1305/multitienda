const path = require('path');

// Crea un filtro de multer que solo acepta imágenes raster con extensión permitida.
// SVG queda excluido siempre: puede contener scripts (XSS almacenado).
function createImageFileFilter(allowedExts) {
  const permitidas = allowedExts.filter((e) => e !== '.svg');
  return function imageFileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!permitidas.includes(ext)) {
      return cb(new Error('Solo se permiten imágenes con extensiones válidas'));
    }
    if (!mime.startsWith('image/') || mime.includes('svg')) {
      return cb(new Error('Solo se permiten tipos MIME de imagen válidos'));
    }
    cb(null, true);
  };
}

module.exports = { createImageFileFilter };
