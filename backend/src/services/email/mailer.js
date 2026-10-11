import nodemailer from 'nodemailer';

// Plain SMTP via nodemailer - works with Gmail (app password), Zoho,
// Brevo, Amazon SES SMTP, etc. Until SMTP_HOST is set nothing is sent and
// callers get { status: 'not_configured' }.
//
// Env:
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS
//   SMTP_SECURE=true for port 465 (implicit TLS); otherwise STARTTLS
//   MAIL_FROM  e.g. "Haripriya Jewels <reports@yourdomain.in>" (default SMTP_USER)

const env = () => ({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  from: process.env.MAIL_FROM || process.env.SMTP_USER,
});

export function isEmailConfigured() {
  const { host, from } = env();
  return !!(host && from);
}

let transport = null;
function getTransport() {
  if (transport) return transport;
  const { host, port, user, pass, secure } = env();
  transport = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  return transport;
}

export async function sendEmail({ to, subject, html, text }) {
  if (!isEmailConfigured()) return { status: 'not_configured' };
  const info = await getTransport().sendMail({ from: env().from, to, subject, html, text });
  return { status: 'sent', messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}
