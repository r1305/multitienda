const DEFAULT_BUSINESS_TYPE_LABEL = 'Restaurante';
const MAX_NAME_LENGTH = 100;

function parseBusinessTypeId(value) {
  if (value === undefined || value === null || value === '') return { provided: false, id: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return { provided: true, id: null, invalid: true };
  return { provided: true, id: n };
}

async function resolveActiveBusinessTypeId(sequelize, value, opts = {}) {
  const parsed = parseBusinessTypeId(value);
  if (!parsed.provided) return { ok: true, id: null, provided: false };
  if (parsed.invalid) return { ok: false, message: 'El rubro seleccionado no es válido' };
  const keepCurrent = opts.currentId != null && Number(opts.currentId) === parsed.id;
  const [rows] = await sequelize.query(
    keepCurrent
      ? 'SELECT id FROM business_types WHERE id = ? LIMIT 1'
      : 'SELECT id FROM business_types WHERE id = ? AND is_active = 1 LIMIT 1',
    { replacements: [parsed.id] }
  );
  if (!rows || !rows.length) return { ok: false, message: 'El rubro seleccionado no existe o está inactivo' };
  return { ok: true, id: parsed.id, provided: true };
}

async function listActiveBusinessTypes(sequelize) {
  const [rows] = await sequelize.query(
    'SELECT id, name FROM business_types WHERE is_active = 1 ORDER BY name ASC'
  );
  return rows || [];
}

function normalizeBusinessTypeName(value) {
  const name = String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, message: 'El nombre del rubro es obligatorio' };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, message: `El nombre del rubro no puede superar ${MAX_NAME_LENGTH} caracteres` };
  return { ok: true, name };
}

function filterStoresByBusinessType(list, value, activeTypes) {
  const parsed = parseBusinessTypeId(value);
  if (!parsed.provided) return list;
  if (parsed.invalid) return [];
  const selected = (activeTypes || []).find((t) => Number(t.id) === parsed.id);
  if (!selected) return [];
  const isDefault = String(selected.name).trim().toLowerCase() === DEFAULT_BUSINESS_TYPE_LABEL.toLowerCase();
  return list.filter((s) => {
    const id = s.business_type_id == null ? null : Number(s.business_type_id);
    return id === parsed.id || (isDefault && id === null);
  });
}

module.exports = {
  filterStoresByBusinessType,
  DEFAULT_BUSINESS_TYPE_LABEL,
  parseBusinessTypeId,
  resolveActiveBusinessTypeId,
  listActiveBusinessTypes,
  normalizeBusinessTypeName,
};
