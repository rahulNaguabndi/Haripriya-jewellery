// Twilio Programmable SMS sender (REST API via fetch - no SDK dependency).
//
// Env (required to enable; until then sends are logged as "not_configured"):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   and one of:
//   TWILIO_MESSAGING_SERVICE_SID  (preferred - holds the India DLT sender)
//   TWILIO_FROM_NUMBER            (E.164 sender)
//
// India: commercial SMS must be sent from a DLT-registered header (sender
// ID) using a DLT-registered content template, or carriers silently drop
// it. Register the entity + template on a DLT portal and map them in
// Twilio before going live (see docs/MESSAGING_SETUP.md).

const env = () => ({
  sid: process.env.TWILIO_ACCOUNT_SID,
  token: process.env.TWILIO_AUTH_TOKEN,
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
  from: process.env.TWILIO_FROM_NUMBER,
});

export function isSmsConfigured() {
  const { sid, token, messagingServiceSid, from } = env();
  return !!(sid && token && (messagingServiceSid || from));
}

export async function sendSms({ to, text }) {
  const { sid, token, messagingServiceSid, from } = env();
  const form = new URLSearchParams({ To: to, Body: text });
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
  else form.set('From', from);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Twilio API HTTP ${res.status}`);
  return { providerMessageId: body?.sid || null };
}
