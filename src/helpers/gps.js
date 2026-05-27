const { getRedis } = require('../config/redis');
const { getDistance } = require('./utils');
const { DeliveryGuyDetail } = require('../models');

const GPS_REDIS_TTL = parseInt(process.env.GPS_REDIS_TTL || '300', 10);
const GPS_MIN_INTERVAL_MS = parseInt(process.env.GPS_MIN_INTERVAL_MS || '30000', 10);
const GPS_MIN_DISTANCE_KM = parseFloat(process.env.GPS_MIN_DISTANCE_KM || '0.05');

const lastUpdateMemory = new Map();

function shouldPersistToDb(userId, lat, lng) {
  const key = String(userId);
  const now = Date.now();
  const prev = lastUpdateMemory.get(key);
  if (!prev) {
    lastUpdateMemory.set(key, { lat, lng, at: now });
    return true;
  }
  const elapsed = now - prev.at;
  if (elapsed < GPS_MIN_INTERVAL_MS) {
    const dist = getDistance(prev.lat, prev.lng, lat, lng);
    if (dist < GPS_MIN_DISTANCE_KM) return false;
  }
  lastUpdateMemory.set(key, { lat, lng, at: now });
  return true;
}

async function setLivePosition(userId, lat, lng, heading) {
  const redis = getRedis();
  if (!redis) return;
  const payload = JSON.stringify({ lat, lng, heading, updatedAt: Date.now() });
  await redis.set(`gps:live:${userId}`, payload, 'EX', GPS_REDIS_TTL);
}

async function getLivePosition(userId) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`gps:live:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

async function updateDeliveryGps(userId, latitude, longitude, heading) {
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  await setLivePosition(userId, lat, lng, heading);

  if (!shouldPersistToDb(userId, lat, lng)) {
    return { success: true, throttled: true };
  }

  await DeliveryGuyDetail.update(
    { latitude: lat, longitude: lng, heading: heading || 0 },
    { where: { user_id: userId } }
  );
  return { success: true, throttled: false };
}

async function getDeliveryGps(userId) {
  const live = await getLivePosition(userId);
  if (live) {
    return {
      delivery_lat: live.lat,
      delivery_long: live.lng,
      heading: live.heading,
      updated_at: live.updatedAt,
      live: true,
    };
  }
  const detail = await DeliveryGuyDetail.findOne({ where: { user_id: userId } });
  return detail
    ? {
        delivery_lat: detail.latitude,
        delivery_long: detail.longitude,
        heading: detail.heading,
        updated_at: detail.updated_at ? new Date(detail.updated_at).getTime() : null,
        live: false,
      }
    : null;
}

/** Batch GPS for admin map (Redis live first, then DB). */
async function getDeliveryGpsBatch(userIds) {
  const ids = [...new Set(userIds.map((id) => parseInt(id, 10)).filter((id) => id > 0))];
  const out = {};
  if (!ids.length) return out;

  const missing = [];
  const redis = getRedis();
  if (redis) {
    try {
      const keys = ids.map((id) => `gps:live:${id}`);
      const values = await redis.mget(keys);
      ids.forEach((id, i) => {
        if (values[i]) {
          try {
            const live = JSON.parse(values[i]);
            out[id] = {
              delivery_lat: live.lat,
              delivery_long: live.lng,
              heading: live.heading,
              updated_at: live.updatedAt,
              live: true,
            };
          } catch (_) {
            missing.push(id);
          }
        } else {
          missing.push(id);
        }
      });
    } catch (_) {
      missing.push(...ids.filter((id) => !out[id]));
    }
  } else {
    missing.push(...ids);
  }

  if (missing.length) {
    const details = await DeliveryGuyDetail.findAll({
      where: { user_id: missing },
      attributes: ['user_id', 'latitude', 'longitude', 'heading', 'updated_at'],
    });
    for (const d of details) {
      const uid = d.user_id;
      if (out[uid]) continue;
      const lat = parseFloat(d.latitude);
      const lng = parseFloat(d.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out[uid] = {
        delivery_lat: lat,
        delivery_long: lng,
        heading: d.heading,
        updated_at: d.updated_at ? new Date(d.updated_at).getTime() : null,
        live: false,
      };
    }
  }
  return out;
}

module.exports = { updateDeliveryGps, getDeliveryGps, getDeliveryGpsBatch };
