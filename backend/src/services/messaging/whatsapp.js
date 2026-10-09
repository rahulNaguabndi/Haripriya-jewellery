// WhatsApp Business Platform (Meta Cloud API) sender.
//
// Business-initiated WhatsApp messages (anything sent outside a 24h window
// opened by the customer) MUST use a template pre-approved in WhatsApp
// Manager - free-form text is rejected. So this sends the approved template
// by name and fills its {{1}}..{{n}} body variables; the template wording
// itself lives in Meta (see docs/MESSAGING_SETUP.md for the exact text to
// register, which mirrors templates.js).
//
// Env (all required to enable; until then sends are logged as
// "not_configured" and nothing leaves the server):
//   WHATSAPP_ACCESS_TOKEN      permanent System User token
//   WHATSAPP_PHONE_NUMBER_ID   the sending number's Phone Number ID
// Optional:
//   WHATSAPP_API_VERSION       default v21.0
//   WHATSAPP_TEMPLATE_LANG     default en

const env = () => ({
  token: process.env.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  version: process.env.WHATSAPP_API_VERSION || 'v21.0',
  lang: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
});

export function isWhatsAppConfigured() {
  const { token, phoneNumberId } = env();
  return !!(token && phoneNumberId);
}

// to: E.164 ("+919876543210"); templateName: approved template name;
// params: ordered body variable values.
export async function sendWhatsAppTemplate({ to, templateName, params }) {
  const { token, phoneNumberId, version, lang } = env();
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        components: [
          {
            type: 'body',
            // WhatsApp rejects newlines/tabs and 4+ consecutive spaces inside variables.
            parameters: params.map((p) => ({ type: 'text', text: String(p ?? '-').replace(/\s+/g, ' ').trim() || '-' })),
          },
        ],
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.error_user_msg || body?.error?.message || `WhatsApp API HTTP ${res.status}`);
  }
  return { providerMessageId: body?.messages?.[0]?.id || null };
}
