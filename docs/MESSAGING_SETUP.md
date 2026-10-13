# WhatsApp & SMS notices — setup

The code is in place and works **without any keys**: "Send" writes every
message to `message_log` with status `not_configured`, and nothing leaves the
server. Delivery starts once the env vars below are set on the backend
(Render → Environment). No code change is needed.

Code: `backend/src/services/messaging/` (`whatsapp.js`, `twilioSms.js`,
`templates.js`, `phone.js`), `controllers/messageController.js`, UI in
`frontend/src/components/Messaging/SendMessageModal.jsx` (Loan detail →
**Message**, Notices Due → **Message selected / all due**).

## 1. Business profile

Admin Settings → **Business Profile**: legal name, address and phone are
quoted in every notice. Fill these in first.

## 2. WhatsApp (Meta WhatsApp Business Platform, Cloud API)

1. In Meta Business Manager, create a WhatsApp Business Account and add the
   sending phone number. Note its **Phone Number ID**.
2. Create a **System User** with a permanent access token that has
   `whatsapp_business_messaging`.
3. WhatsApp Manager → Message templates → **Create template**:
   - Category: **Utility**
   - Name: `loan_auction_notice`
   - Language: English (`en`)
   - Body (copy exactly — it matches `templates.js`):

     ```
     Dear {{1}}, this is a notice from {{2}}, {{3}}. You have pledged {{4}} (net weight {{5}} g) with us against a loan of Rs. {{6}} taken on {{7}} (Loan No. {{8}}). Please pay the interest due or close the loan within {{9}} days of this notice. If it is not paid, the pledged ornaments will be auctioned as per the terms of your pledge agreement. For details please contact {{10}}.
     ```
   - Variables: 1 borrower name · 2 legal name · 3 address · 4 items ·
     5 net weight · 6 loan amount · 7 loan date · 8 loan no. · 9 days ·
     10 contact phone.
   Business-initiated WhatsApp messages **must** use an approved template;
   plain text is rejected outside a 24-hour customer window.
4. Set on the backend:

   ```
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_TEMPLATE_AUCTION_NOTICE=loan_auction_notice   # if you named it differently
   WHATSAPP_TEMPLATE_LANG=en
   ```

If you later want a Telugu version, register it as a second language of the
same template and set `WHATSAPP_TEMPLATE_LANG=te`.

### Payment / closure confirmations

The payment and close-loan dialogs can send the borrower a confirmation
(any staff member, one loan at a time - `POST /api/messages/confirmation`).
Register two more **Utility** templates, bodies copied exactly from
`templates.js`:

- `loan_payment_received` (override name with `WHATSAPP_TEMPLATE_PAYMENT_RECEIVED`)

  ```
  Dear {{1}}, we have received Rs. {{2}} on {{3}} towards your Loan No. {{4}} with {{5}}. Principal still outstanding: Rs. {{6}}. Thank you. For any query please contact {{7}}.
  ```
  Variables: 1 borrower name · 2 amount · 3 payment date · 4 loan no. ·
  5 trade name · 6 principal outstanding · 7 contact phone.

- `loan_closed_confirmation` (override with `WHATSAPP_TEMPLATE_LOAN_CLOSED`)

  ```
  Dear {{1}}, your Loan No. {{2}} with {{3}} has been fully settled and closed on {{4}}. Interest paid: Rs. {{5}}. Your pledged {{6}} have been released to you. Thank you for your trust.
  ```
  Variables: 1 borrower name · 2 loan no. · 3 trade name · 4 closure date ·
  5 interest paid · 6 items.

Until a channel is configured the checkbox isn't pre-ticked; if staff tick
it anyway the attempt is logged as `not_configured`. Rollovers don't send a
"closed" message, since the ornaments stay pledged.

## 3. SMS (Twilio)

1. Create a Twilio account and note its **Account SID** and **Auth Token**.
2. **India DLT (mandatory):** register your business as a Principal Entity
   on a DLT portal (Jio, Vodafone-Idea, Airtel or BSNL), register a 6-character
   sender header, and register the SMS text above as a **content template**
   (with `{#var#}` in place of each `{{n}}`). Unregistered commercial SMS to
   Indian numbers is silently dropped by carriers.
3. In Twilio, create a **Messaging Service**, attach the DLT-approved sender,
   and add the DLT entity/template IDs as Twilio's India guidelines describe.
4. Set on the backend:

   ```
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_MESSAGING_SERVICE_SID=...   # or TWILIO_FROM_NUMBER=+1...
   ```

The full notice is about 450 characters, so it goes out as 3–4 SMS segments,
each billed separately.

## 4. Before going live

- Have the notice wording checked against your pledge agreement and your
  state's pawnbroker / money-lending rules (for example, the minimum notice
  period before an auction). The default response window is 15 days, and
  you can change it each time you send.
- Phone numbers must be valid Indian mobiles (`toE164India`). Borrowers with
  missing or invalid numbers are skipped, and the skip is logged.
- Sending is limited to `admin` / `super_admin`. Each batch is capped at 200
  loans.

## Release OTP (SMS)

Closing a loan can send the borrower a 6-digit OTP (Loan → Close → Verify
borrower). It uses the same Twilio settings as above. For India, register a
DLT **Service-Implicit / OTP** template matching:

```
{#var#} is your OTP to collect the ornaments pledged under Loan No. {#var#} at {#var#}. Share it only at our counter. Valid 10 minutes.
```

Settings → *Release OTP & nightly email* turns on "Require an OTP before
releasing ornaments". Until Twilio is configured, OTPs are logged as
`not_configured`; outside production the code is shown on screen for testing.
