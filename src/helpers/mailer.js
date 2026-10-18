const nodemailer = require('nodemailer');
const escapeHtml = require('./escapeHtml');

let transporter = null;

function smtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { host: SMTP_HOST, port, user: SMTP_USER, pass: SMTP_PASS, from: SMTP_FROM };
}

// Transporte único (singleton, pool de nodemailer). Sin timers propios.
function getTransporter() {
  if (transporter) return transporter;
  const cfg = smtpConfig();
  if (!cfg) return null;
  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    pool: true,
    maxConnections: 1,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
}

function isValidEmail(v) {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
}

// Envía un correo. Devuelve true/false; nunca lanza ni cae si falta configuración.
async function sendMail({ to, subject, text, html }) {
  if (!isValidEmail(to)) return false;
  const tr = getTransporter();
  if (!tr) {
    console.error('[mailer] SMTP no configurado (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)');
    return false;
  }
  try {
    await tr.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
    return true;
  } catch (err) {
    console.error('[mailer] error al enviar:', err.message);
    return false;
  }
}

function otpMessage(code, purpose) {
  const subject = purpose === 'reset' ? 'Recuperación de contraseña' : 'Tu código de verificación';
  const intro = purpose === 'reset' ? 'Tu código para recuperar la contraseña es' : 'Tu código de verificación es';
  const text = `${intro}: ${code}. Caduca en 5 minutos. Si no lo solicitaste, ignora este mensaje.`;
  const html = `<p>${escapeHtml(intro)}:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(code)}</p><p>Caduca en 5 minutos. Si no lo solicitaste, ignora este mensaje.</p>`;
  return { subject, text, html };
}

async function sendOtpMail(to, code, purpose = 'otp') {
  return sendMail({ to, ...otpMessage(code, purpose) });
}

function _setTransportForTests(tr) {
  transporter = tr;
}

module.exports = { sendMail, sendOtpMail, isValidEmail, _setTransportForTests };
