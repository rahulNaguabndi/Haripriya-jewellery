import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { getActiveBusinessProfile } from '../utils/businessProfile.js';
import { TEMPLATES, DEFAULT_NOTICE_DAYS, renderTemplate } from '../services/messaging/templates.js';
import { toE164India } from '../services/messaging/phone.js';
import { isWhatsAppConfigured, sendWhatsAppTemplate } from '../services/messaging/whatsapp.js';
import { isSmsConfigured, sendSms } from '../services/messaging/twilioSms.js';

const CHANNELS = ['whatsapp', 'sms'];
const MAX_BATCH = 200;

function validateRequest(body) {
  requireFields(body, ['loanIds']);
  const { loanIds, template = 'auction_notice', noticeDays = DEFAULT_NOTICE_DAYS } = body;
  if (!Array.isArray(loanIds) || loanIds.length === 0) throw new ApiError(400, 'loanIds must be a non-empty array');
  if (loanIds.length > MAX_BATCH) throw new ApiError(400, `Send to at most ${MAX_BATCH} loans at a time`);
  if (!TEMPLATES[template]) throw new ApiError(400, `template must be one of: ${Object.keys(TEMPLATES).join(', ')}`);
  const days = Number(noticeDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError(400, 'noticeDays must be a whole number of days (1-365)');
  return { loanIds, template, noticeDays: days };
}

async function loadLoans(loanIds) {
  const { data, error } = await supabase
    .from('loans')
    .select('id, loan_number, loan_amount, loan_date, status, borrower_id, borrowers(id, name, phone), loan_items(item_type, metal_type, purity, gross_weight, net_weight)')
    .in('id', loanIds);
  if (error) throw new ApiError(400, error.message);
  return data || [];
}

// Renders each loan's message and flags anything that would stop it going
// out (no/invalid phone, closed loan) - shared by preview and send.
async function prepare({ loanIds, template, noticeDays }) {
  const [business, loans] = await Promise.all([getActiveBusinessProfile(), loadLoans(loanIds)]);
  return loans.map((loan) => {
    const rendered = renderTemplate(template, { business, borrower: loan.borrowers, loan, noticeDays });
    const to = toE164India(loan.borrowers?.phone);
    const problems = [];
    if (!loan.borrowers?.phone) problems.push('No phone number on file');
    else if (!to) problems.push(`Phone "${loan.borrowers.phone}" isn't a valid Indian mobile number`);
    if (loan.status === 'closed') problems.push('Loan is already closed');
    return { loan, to, rendered, problems };
  });
}

// GET /api/messages/config - which channels are live, so the UI can say
// "will be logged only" before anyone hits send.
export async function getMessagingConfig(req, res, next) {
  try {
    res.json({
      channels: { whatsapp: isWhatsAppConfigured(), sms: isSmsConfigured() },
      templates: Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, whatsappBody: t.whatsappBody })),
      defaultNoticeDays: DEFAULT_NOTICE_DAYS,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/messages/preview { loanIds, template?, noticeDays? }
export async function previewMessages(req, res, next) {
  try {
    const prepared = await prepare(validateRequest(req.body));
    res.json({
      data: prepared.map(({ loan, to, rendered, problems }) => ({
        loanId: loan.id,
        loanNumber: loan.loan_number,
        borrowerName: loan.borrowers?.name || null,
        to,
        text: rendered.text,
        problems,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function deliver(channel, to, rendered) {
  if (channel === 'whatsapp') {
    if (!isWhatsAppConfigured()) return { status: 'not_configured' };
    return { status: 'sent', ...(await sendWhatsAppTemplate({ to, templateName: rendered.whatsappTemplateName, params: rendered.params })) };
  }
  if (!isSmsConfigured()) return { status: 'not_configured' };
  return { status: 'sent', ...(await sendSms({ to, text: rendered.text })) };
}

// POST /api/messages/send { loanIds, channels: ['whatsapp','sms'], template?, noticeDays? }
// Every attempt is written to message_log - including ones skipped because
// a provider isn't configured yet, so the flow is fully testable today and
// staff can see exactly who would have been contacted.
export async function sendMessages(req, res, next) {
  try {
    const request = validateRequest(req.body);
    const channels = req.body.channels;
    if (!Array.isArray(channels) || channels.length === 0 || channels.some((c) => !CHANNELS.includes(c))) {
      throw new ApiError(400, `channels must be a non-empty array from: ${CHANNELS.join(', ')}`);
    }

    const prepared = await prepare(request);
    const results = [];
    // Sequential on purpose: keeps well under provider rate limits and a
    // batch of <=200 still finishes in seconds.
    for (const { loan, to, rendered, problems } of prepared) {
      for (const channel of channels) {
        let outcome;
        if (problems.length) {
          outcome = { status: 'skipped', error: problems.join('; ') };
        } else {
          try {
            outcome = await deliver(channel, to, rendered);
          } catch (err) {
            outcome = { status: 'failed', error: err.message };
          }
        }
        results.push({ loanId: loan.id, loanNumber: loan.loan_number, borrowerName: loan.borrowers?.name || null, channel, ...outcome });
        const { error } = await supabase.from('message_log').insert({
          loan_id: loan.id,
          borrower_id: loan.borrower_id,
          channel,
          template: request.template,
          to_phone: to,
          body: rendered.text,
          status: outcome.status,
          provider_message_id: outcome.providerMessageId || null,
          error: outcome.error || null,
          sent_by: req.user.id,
        });
        if (error) console.warn('[messages] could not write message_log:', error.message);
      }
    }

    const count = (status) => results.filter((r) => r.status === status).length;
    res.json({
      summary: { sent: count('sent'), failed: count('failed'), skipped: count('skipped'), notConfigured: count('not_configured') },
      results,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/messages/log?loanId=&limit=
export async function listMessageLog(req, res, next) {
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    let query = supabase
      .from('message_log')
      .select('*, loans(loan_number), borrowers(name)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (req.query.loanId) query = query.eq('loan_id', req.query.loanId);
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}
