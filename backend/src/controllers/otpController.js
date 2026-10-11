import crypto from 'crypto';
import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { logActivity } from '../utils/activityLog.js';
import { getActiveBusinessProfile } from '../utils/businessProfile.js';
import { assertBranchAccess } from '../utils/branches.js';
import { toE164India } from '../services/messaging/phone.js';
import { isSmsConfigured, sendSms } from '../services/messaging/twilioSms.js';

// OTP check before pledged ornaments are handed back (loan closure).
//
// Staff press "Send OTP" in the close-loan dialog; the borrower's phone on
// file gets a 6-digit code by SMS (Twilio); staff type the code the
// borrower reads out. Closing the loan then carries the verified otpId.
// Only an HMAC of the code is stored, codes are single-use, expire after
// OTP_TTL_MIN minutes and lock after MAX_ATTEMPTS wrong tries.
//
// Enforcement is a business switch (business_profile.require_release_otp):
// off = OTP is optional and recorded when used; on = closing needs a
// verified OTP, or an admin override with a written reason.
//
// Until Twilio keys are set the SMS is logged as not_configured; outside
// production the code is then returned to the browser so the flow can be
// tried end to end (never in production).

const OTP_TTL_MIN = 10;
const VERIFIED_VALID_MIN = 30;
const MAX_ATTEMPTS = 5;
const RESEND_GAP_SEC = 30;
const MAX_PER_HOUR = 5;
const ADMIN_ROLES = ['super_admin', 'admin'];

const secret = () => process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-otp-secret';
const hashCode = (otpId, code) => crypto.createHmac('sha256', secret()).update(`${otpId}:${code}`).digest('hex');
const maskPhone = (e164) => (e164 ? `${e164.slice(0, 3)}••••••${e164.slice(-4)}` : null);

function otpText({ code, loan, business }) {
  return `${code} is your OTP to collect the ornaments pledged under Loan No. ${loan.loan_number} at ${business.trade_name || business.legal_name}. Share it only at our counter. Valid ${OTP_TTL_MIN} minutes.`;
}

async function loadLoan(req) {
  const { data: loan, error } = await supabase
    .from('loans')
    .select('id, loan_number, status, borrower_id, branch_id, borrowers(name, phone)')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  if (!loan) throw new ApiError(404, 'Loan not found');
  assertBranchAccess(req, loan);
  return loan;
}

// POST /api/loans/:id/release-otp
export async function sendReleaseOtp(req, res, next) {
  try {
    const loan = await loadLoan(req);
    if (loan.status === 'closed') throw new ApiError(400, 'This loan is already closed.');
    const to = toE164India(loan.borrowers?.phone);
    if (!to) throw new ApiError(400, loan.borrowers?.phone ? `Phone "${loan.borrowers.phone}" isn't a valid Indian mobile number` : 'No phone number on file for this borrower');

    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { data: recent, error: recentError } = await supabase
      .from('release_otps')
      .select('created_at')
      .eq('loan_id', loan.id)
      .gte('created_at', hourAgo)
      .order('created_at', { ascending: false });
    if (recentError) throw new ApiError(400, recentError.message);
    if (recent.length >= MAX_PER_HOUR) throw new ApiError(429, 'Too many OTPs for this loan in the last hour. Try again later.');
    if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_GAP_SEC * 1000) {
      throw new ApiError(429, `Wait ${RESEND_GAP_SEC} seconds before sending another OTP.`);
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const otpId = crypto.randomUUID();
    const business = await getActiveBusinessProfile();
    const text = otpText({ code, loan, business });

    let outcome;
    if (!isSmsConfigured()) outcome = { status: 'not_configured' };
    else {
      try {
        outcome = { status: 'sent', ...(await sendSms({ to, text })) };
      } catch (err) {
        outcome = { status: 'failed', error: err.message };
      }
    }

    const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();
    const { error: insertError } = await supabase.from('release_otps').insert({
      id: otpId,
      loan_id: loan.id,
      code_hash: hashCode(otpId, code),
      sent_to: to,
      delivery_status: outcome.status,
      expires_at: expiresAt,
      created_by: req.user.id,
    });
    if (insertError) throw new ApiError(400, insertError.message);

    // The code itself never goes into any log.
    const { error: logError } = await supabase.from('message_log').insert({
      loan_id: loan.id,
      borrower_id: loan.borrower_id,
      channel: 'sms',
      template: 'release_otp',
      to_phone: to,
      body: text.replace(code, '••••••'),
      status: outcome.status,
      provider_message_id: outcome.providerMessageId || null,
      error: outcome.error || null,
      sent_by: req.user.id,
    });
    if (logError) console.warn('[otp] could not write message_log:', logError.message);

    if (outcome.status === 'failed') throw new ApiError(502, `SMS could not be sent: ${outcome.error}`);

    await logActivity(req, {
      action: 'otp.sent',
      entityType: 'loan',
      entityId: loan.id,
      loanId: loan.id,
      borrowerId: loan.borrower_id,
      branchId: loan.branch_id,
      summary: `Sent release OTP for ${loan.loan_number} to ${maskPhone(to)}${outcome.status === 'not_configured' ? ' (SMS not configured - not delivered)' : ''}`,
    });

    const devEcho = outcome.status === 'not_configured' && process.env.NODE_ENV !== 'production';
    res.status(201).json({
      otpId,
      sentTo: maskPhone(to),
      deliveryStatus: outcome.status,
      expiresAt,
      ...(devEcho ? { devCode: code } : {}),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/loans/:id/release-otp/verify { otpId, code }
export async function verifyReleaseOtp(req, res, next) {
  try {
    requireFields(req.body, ['otpId', 'code']);
    const loan = await loadLoan(req);
    const code = String(req.body.code).replace(/\D/g, '');

    const { data: otp, error } = await supabase
      .from('release_otps')
      .select('*')
      .eq('id', req.body.otpId)
      .eq('loan_id', loan.id)
      .maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!otp) throw new ApiError(404, 'OTP not found - send a new one.');
    if (otp.verified_at) return res.json({ verified: true, otpId: otp.id });
    if (new Date(otp.expires_at) < new Date()) throw new ApiError(400, 'This OTP has expired - send a new one.');
    if (otp.attempts >= MAX_ATTEMPTS) throw new ApiError(400, 'Too many wrong attempts - send a new OTP.');

    const a = Buffer.from(hashCode(otp.id, code));
    const b = Buffer.from(otp.code_hash);
    const ok = code.length === 6 && a.length === b.length && crypto.timingSafeEqual(a, b);

    const update = ok ? { verified_at: new Date().toISOString() } : { attempts: otp.attempts + 1 };
    const { error: updateError } = await supabase.from('release_otps').update(update).eq('id', otp.id);
    if (updateError) throw new ApiError(400, updateError.message);

    if (!ok) {
      const left = MAX_ATTEMPTS - otp.attempts - 1;
      throw new ApiError(400, left > 0 ? `Wrong OTP - ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong OTP - too many attempts, send a new one.');
    }

    await logActivity(req, {
      action: 'otp.verified',
      entityType: 'loan',
      entityId: loan.id,
      loanId: loan.id,
      borrowerId: loan.borrower_id,
      branchId: loan.branch_id,
      summary: `Borrower verified release OTP for ${loan.loan_number}`,
    });
    res.json({ verified: true, otpId: otp.id });
  } catch (err) {
    next(err);
  }
}

// Called by the loan-close endpoint. Returns null when no check applies, or
// { summary, details, consume? } describing how the release was verified.
export async function assertReleaseOtp(req, loan, { otpId, otpOverrideReason }) {
  if (otpId) {
    const { data: otp, error } = await supabase.from('release_otps').select('*').eq('id', otpId).eq('loan_id', loan.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    const fresh = otp?.verified_at && Date.now() - new Date(otp.verified_at).getTime() < VERIFIED_VALID_MIN * 60 * 1000;
    if (!otp || !otp.verified_at || otp.consumed_at || !fresh) {
      throw new ApiError(400, 'The OTP verification is no longer valid - verify a new OTP.');
    }
    return {
      summary: 'borrower verified by OTP',
      details: { method: 'otp', otpId, sentTo: maskPhone(otp.sent_to) },
      consume: async () => {
        const { error: consumeError } = await supabase.from('release_otps').update({ consumed_at: new Date().toISOString() }).eq('id', otpId);
        if (consumeError) console.warn('[otp] could not mark OTP used:', consumeError.message);
      },
    };
  }

  const business = await getActiveBusinessProfile();
  if (!business.require_release_otp) return null;

  const reason = String(otpOverrideReason || '').trim();
  if (reason && ADMIN_ROLES.includes(req.adminUser?.role)) {
    return { summary: `released without OTP: ${reason}`, details: { method: 'override', reason } };
  }
  throw new ApiError(
    400,
    ADMIN_ROLES.includes(req.adminUser?.role)
      ? 'Verify the borrower with an OTP, or give a reason for releasing without one.'
      : "Verify the borrower with an OTP before releasing the ornaments. If the borrower can't receive it, ask an admin."
  );
}
