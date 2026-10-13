import { ApiError } from '../middleware/errorHandler.js';
import { logActivity } from '../utils/activityLog.js';
import { buildDailyDigest } from '../services/digest/dailyDigest.js';
import { isEmailConfigured, sendEmail } from '../services/email/mailer.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateFrom(value) {
  if (!value) return undefined;
  if (!ISO_DATE.test(value)) throw new ApiError(400, 'date must be YYYY-MM-DD');
  return value;
}

async function deliver(req, digest, trigger) {
  if (!digest.recipients.length) {
    throw new ApiError(400, 'No recipients - add an email under Settings → Nightly email summary (or set DIGEST_TO).');
  }
  const outcome = await sendEmail({ to: digest.recipients.join(', '), subject: digest.subject, html: digest.html, text: digest.text });
  await logActivity(req, {
    action: 'digest.sent',
    entityType: 'digest',
    branchId: null,
    summary:
      outcome.status === 'sent'
        ? `Emailed the ${digest.date} day summary to ${digest.recipients.join(', ')} (${trigger})`
        : `Day summary for ${digest.date} not emailed - SMTP not configured (${trigger})`,
  });
  return outcome;
}

// Scheduled run (GitHub Actions, 21:30 IST): no user session, guarded by
// the X-Cron-Key shared secret instead (see middleware/cronKey.js).
export async function runDailyDigest(req, res, next) {
  try {
    const digest = await buildDailyDigest({ date: dateFrom(req.query.date) });
    const outcome = await deliver(req, digest, 'scheduled');
    res.json({ date: digest.date, subject: digest.subject, recipients: digest.recipients, ...outcome });
  } catch (err) {
    next(err);
  }
}

// GET /api/digest/preview?date= - admin: the exact email, for the settings card.
export async function previewDigest(req, res, next) {
  try {
    const digest = await buildDailyDigest({ date: dateFrom(req.query.date) });
    res.json({ ...digest, emailConfigured: isEmailConfigured() });
  } catch (err) {
    next(err);
  }
}

// POST /api/digest/send - admin: send today's summary now.
export async function sendDigestNow(req, res, next) {
  try {
    const digest = await buildDailyDigest({ date: dateFrom(req.body?.date) });
    const outcome = await deliver(req, digest, `sent by ${req.user.email}`);
    res.json({ date: digest.date, subject: digest.subject, recipients: digest.recipients, ...outcome });
  } catch (err) {
    next(err);
  }
}
