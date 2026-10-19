const mp = require('../helpers/mercadoPago');

function notificationData(req) {
  const q = req.query || {};
  const b = req.body || {};
  const dataId = q['data.id'] || (b.data && b.data.id) || q.id || null;
  const type = q.type || b.type || q.topic || null;
  return { dataId: dataId ? String(dataId) : null, type: type ? String(type) : null };
}

async function handleWebhook(req, deps = {}) {
  const config = await (deps.getConfig || mp.getConfig)(deps);
  const { dataId, type } = notificationData(req);
  const valid = !!(config && config.webhookSecret) && mp.verifySignature({
    signature: req.get ? req.get('x-signature') : req.headers['x-signature'],
    requestId: req.get ? req.get('x-request-id') : req.headers['x-request-id'],
    dataId,
    secret: config.webhookSecret,
  });
  if (!valid) return { status: 401, body: { success: false, message: 'Firma inválida' } };
  if (type !== 'payment') return { status: 200, body: { success: true, ignored: true } };

  const payment = await mp.getPayment(dataId, { ...deps, config });
  const result = await mp.applyApprovedPayment(payment, deps);
  return { status: 200, body: { success: true, changed: result.changed, reason: result.reason || null } };
}

exports.handleWebhook = handleWebhook;

exports.webhook = async (req, res) => {
  try {
    const { status, body } = await handleWebhook(req);
    res.status(status).json(body);
  } catch (err) {
    console.error('mp webhook error:', err.message);
    res.status(err instanceof mp.MercadoPagoError ? 502 : 500).json({ success: false });
  }
};
