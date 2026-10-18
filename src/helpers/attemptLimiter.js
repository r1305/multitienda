// Limitador de intentos fallidos en memoria, sin timers.
// Las entradas vencidas se purgan de forma perezosa al registrar nuevos fallos.
const MAX_ENTRIES = 10000;

function createLimiter({ max, windowMs }) {
  const map = new Map();

  function sweep(now) {
    for (const [key, entry] of map) {
      if (now - entry.start > windowMs) map.delete(key);
    }
  }

  function current(key, now) {
    const entry = map.get(key);
    if (!entry) return null;
    if (now - entry.start > windowMs) {
      map.delete(key);
      return null;
    }
    return entry;
  }

  return {
    max,
    isBlocked(key, now = Date.now()) {
      const entry = current(key, now);
      return !!entry && entry.count >= max;
    },
    // Registra un intento fallido; devuelve true si la clave quedó bloqueada.
    fail(key, now = Date.now()) {
      if (map.size >= MAX_ENTRIES) {
        sweep(now);
        // Tope duro: si aún excede, se eliminan las más antiguas (el Map conserva orden de inserción).
        let exceso = map.size - MAX_ENTRIES + 1;
        for (const k of map.keys()) {
          if (exceso <= 0) break;
          map.delete(k);
          exceso -= 1;
        }
      }
      let entry = current(key, now);
      if (!entry) {
        entry = { count: 0, start: now };
        map.set(key, entry);
      }
      entry.count += 1;
      return entry.count >= max;
    },
    reset(key) {
      map.delete(key);
    },
    size() {
      return map.size;
    },
  };
}

module.exports = { createLimiter };
