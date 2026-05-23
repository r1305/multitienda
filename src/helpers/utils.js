function getDistance(latFrom, lonFrom, latTo, lonTo) {
  const toRad = (v) => (v * Math.PI) / 180;
  const latDelta = toRad(latTo) - toRad(latFrom);
  const lonDelta = toRad(lonTo) - toRad(lonFrom);
  const angle =
    2 *
    Math.asin(
      Math.sqrt(
        Math.pow(Math.sin(latDelta / 2), 2) +
          Math.cos(toRad(latFrom)) *
            Math.cos(toRad(latTo)) *
            Math.pow(Math.sin(lonDelta / 2), 2)
      )
    );
  return angle * 6371; // km
}

function storeAvgRating(ratings) {
  if (!ratings || ratings.length === 0) return '0';
  const avg = ratings.reduce((sum, r) => sum + parseFloat(r.rating_store || 0), 0) / ratings.length;
  return String(parseFloat(avg.toFixed(1))).replace('.0', '');
}

function getOrderStatusName(id) {
  const statuses = {
    1: 'Order Placed', 2: 'Order Accepted', 3: 'Delivery Assigned',
    4: 'Picked Up', 5: 'Completed', 6: 'Canceled', 7: 'Ready to Pickup',
    8: 'Awaiting Payment', 9: 'Payment Failed', 10: 'Scheduled Order', 11: 'Confirmed Scheduled Order',
  };
  return statuses[id] || 'Unknown';
}

function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = { getDistance, storeAvgRating, getOrderStatusName, randomString };
