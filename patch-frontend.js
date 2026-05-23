const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'public/static/js/main.65e0b372.chunk.js');
let content = fs.readFileSync(file, 'utf8');

// Reemplazar la URL base: de "https://"+window.location.hostname a window.location.origin
const before = 'var n="https://"+window.location.hostname';
const after  = 'var n=window.location.origin';

if (!content.includes(before)) {
  console.log('Patron no encontrado, verificando si ya fue parcheado...');
  if (content.includes('window.location.origin')) {
    console.log('Ya estaba parcheado.');
  } else {
    console.log('ERROR: patron no encontrado.');
  }
  process.exit(0);
}

content = content.replace(before, after);
fs.writeFileSync(file, content, 'utf8');
console.log('OK - URL base cambiada a window.location.origin');
console.log('Las rutas /public/api/ ya estan mapeadas en server.js');
