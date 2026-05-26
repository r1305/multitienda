const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '../public/app/js/pages.js');
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
  /<button class="qty-btn" @click="removeFromCart\(item\)">[\s\S]*?<\/button>/g,
  '<button type="button" class="qty-btn" aria-label="Quitar" @click="removeFromCart(item)"><i class="fas fa-minus"></i></button>'
);

s = s.replace(
  /<button class="qty-btn" @click="addToCart\(item\)">\+<\/button>/g,
  '<button type="button" class="qty-btn" aria-label="Anadir" @click="addToCart(item)"><i class="fas fa-plus"></i></button>'
);

s = s.replace(
  /<button v-else class="btn-add-no-img" @click="addToCart\(item\)">ADD<\/button>/g,
  '<button v-else type="button" class="btn-add-no-img" @click="addToCart(item)">Anadir</button>'
);

s = s.replace(
  /<button v-else class="btn-add" @click="addToCart\(item\)">ADD<\/button>/g,
  '<button v-else type="button" class="btn-add" @click="addToCart(item)">Anadir</button>'
);

s = s.replace(
  /<img :src="item\.image" style="width:100%;height:100%;object-fit:cover;border-radius:10px">/g,
  '<img :src="Store.imageUrl(item.image)" style="width:100%;height:100%;object-fit:cover;border-radius:10px" alt="">'
);

s = s.replace(
  /<button class="qty-btn" @click="remove\(item, idx\)">\{\{item\.quantity === 1 \?[\s\S]*?<\/button>/,
  `<button type="button" class="qty-btn" :aria-label="item.quantity === 1 ? 'Eliminar' : 'Quitar uno'" @click="remove(item, idx)">
                <i :class="item.quantity === 1 ? 'fas fa-trash' : 'fas fa-minus'"></i>
              </button>`
);

s = s.replace(
  /<button class="qty-btn" @click="add\(item\)">\+<\/button>/g,
  '<button type="button" class="qty-btn" aria-label="Anadir" @click="add(item)"><i class="fas fa-plus"></i></button>'
);

// Add cart image if missing
if (!s.includes('cart-item-img')) {
  s = s.replace(
    /(<div v-for="\(item, idx\) in cart" :key="idx" class="cart-item">)\n            <div class="cart-item-info">/,
    '$1\n            <img :src="Store.imageUrl(item.image)" class="cart-item-img" alt="">\n            <div class="cart-item-info">'
  );
}

fs.writeFileSync(p, s, 'utf8');
console.log('pages.js fixed, cart-item-img:', s.includes('cart-item-img'));
