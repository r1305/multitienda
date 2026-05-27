/**
 * Elapsed time from order creation until delivery (or now if still open).
 */
function formatOrderElapsed(createdAt, statusId, updatedAt) {
  if (!createdAt) return '-';
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) return '-';

  const sid = parseInt(statusId, 10);
  const terminal = sid === 5 || sid === 6;
  let end = Date.now();
  if (terminal && updatedAt) {
    const u = new Date(updatedAt).getTime();
    if (!Number.isNaN(u)) end = u;
  }

  const ms = Math.max(0, end - start);
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rm = mins % 60;
  if (hours < 24) return rm ? `${hours} h ${rm} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const rh = hours % 24;
  return rh ? `${days} d ${rh} h` : `${days} d`;
}

module.exports = { formatOrderElapsed };
