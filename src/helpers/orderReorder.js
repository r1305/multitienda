// Reconstruye un carrito a partir de un pedido anterior con el catálogo vigente.
// No usa los precios del pedido viejo: solo identifica qué productos/complementos siguen disponibles.
// orderItems: [{ item_id, name, quantity, addons: [{ addon_name, addon_category_name }] }]
// items: filas vigentes (id, name, is_active, restaurant_id).
// addonRows: complementos vigentes por producto: { item_id, id, name, is_active, addon_category_id, category_name }.
function norm(v) {
  return String(v === undefined || v === null ? '' : v).trim().toLowerCase();
}

function buildReorder({ orderItems, items, addonRows, restaurantId }) {
  const itemsById = new Map((items || []).map((i) => [Number(i.id), i]));
  const lines = [];
  const unavailable = [];

  for (const oi of orderItems || []) {
    const label = oi.name || `Producto ${oi.item_id}`;
    const item = itemsById.get(Number(oi.item_id));
    if (!item || !item.is_active || Number(item.restaurant_id) !== Number(restaurantId)) {
      unavailable.push({ name: label, reason: 'Producto no disponible' });
      continue;
    }
    const addon_ids = [];
    let missing = false;
    for (const a of oi.addons || []) {
      const found = (addonRows || []).find((r) =>
        Number(r.item_id) === Number(oi.item_id)
        && r.is_active
        && norm(r.name) === norm(a.addon_name)
        && norm(r.category_name) === norm(a.addon_category_name));
      if (!found) { missing = true; break; }
      addon_ids.push(Number(found.id));
    }
    if (missing) {
      unavailable.push({ name: label, reason: 'Un complemento ya no está disponible' });
      continue;
    }
    lines.push({ item_id: Number(oi.item_id), quantity: Math.max(1, Number(oi.quantity) || 1), addon_ids });
  }
  return { lines, unavailable };
}

module.exports = { buildReorder };
