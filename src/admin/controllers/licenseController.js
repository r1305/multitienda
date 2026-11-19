const { describeLicense, submitToken } = require('../../helpers/license');

const REJECT = {
  no_public_key: 'El servidor no tiene configurada la clave pública de licencias (LICENSE_PUBLIC_KEY).',
  bad_format: 'El token no tiene un formato válido. Pega el token completo tal como lo emitió el servidor de licencias.',
  bad_signature: 'La firma del token no es válida. No se guardó nada.',
  domain_mismatch: 'El token fue emitido para otro dominio. No se guardó nada.',
};

exports.page = async (req, res) => {
  let license = null;
  try {
    license = await describeLicense(req.hostname);
  } catch (e) {
    console.error('[license] no se pudo leer el estado:', e && e.message);
  }
  res.render('admin/license', {
    user: req.session.user,
    license,
    success: req.flash('success')[0],
    error: req.flash('error')[0],
  });
};

exports.save = async (req, res) => {
  try {
    const r = await submitToken(req.body && req.body.token, req.hostname);
    if (!r.saved) req.flash('error', REJECT[r.reason] || 'No se pudo validar el token.');
    else if (r.reason) req.flash('error', `Licencia guardada, pero está ${r.reason === 'expired' ? 'vencida' : 'suspendida'}.`);
    else req.flash('success', 'Licencia activada correctamente.');
  } catch (e) {
    console.error('[license] no se pudo guardar el token:', e && e.message);
    req.flash('error', 'No se pudo guardar la licencia.');
  }
  res.redirect('/admin/license');
};
