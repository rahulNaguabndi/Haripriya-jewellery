import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { fullCalendarMonthsElapsed } from '../utils/interestCalculator.js';
import { getActiveNoticeConfig } from '../utils/noticeConfig.js';

export async function getNoticeConfig(req, res, next) {
  try {
    const data = await getActiveNoticeConfig();
    if (!data) throw new ApiError(404, 'No active notice configuration found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateNoticeConfig(req, res, next) {
  try {
    requireFields(req.body, ['thresholdMonths', 'costAmount']);
    const { thresholdMonths, costAmount, configName } = req.body;

    if (!Array.isArray(thresholdMonths) || thresholdMonths.some((m) => typeof m !== 'number' || m <= 0)) {
      throw new ApiError(400, 'thresholdMonths must be an array of positive numbers');
    }
    if (typeof costAmount !== 'number' || costAmount < 0) {
      throw new ApiError(400, 'costAmount must be a non-negative number');
    }

    const current = await getActiveNoticeConfig();

    let result;
    if (current) {
      const { data, error } = await supabase
        .from('notice_config')
        .update({
          threshold_months: [...thresholdMonths].sort((a, b) => a - b),
          cost_amount: costAmount,
          config_name: configName || current.config_name,
          updated_at: new Date().toISOString(),
          updated_by: req.user.id,
        })
        .eq('id', current.id)
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    } else {
      const { data, error } = await supabase
        .from('notice_config')
        .insert({
          config_name: configName || 'default',
          is_active: true,
          threshold_months: [...thresholdMonths].sort((a, b) => a - b),
          cost_amount: costAmount,
          updated_by: req.user.id,
        })
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Loans past a configured threshold that haven't had that threshold's
// notice sent yet, bucketed into:
//  - dueNow: no partial payments made - straightforward to send
//  - exempted: has partial payments, so suppressed by default (per the
//    real-world rule) but still surfaced for a manual override, since
//    partial payments don't always mean the loan is adequately covered.
//    (The "still under-covered" auto-check is deferred until the
//    metal-rate/coverage-margin feature lands.)
export async function listNoticesDue(req, res, next) {
  try {
    const config = await getActiveNoticeConfig();
    const thresholds = config?.threshold_months || [];
    const costAmount = config?.cost_amount ?? 0;

    if (thresholds.length === 0) {
      return res.json({ dueNow: [], exempted: [], costAmount });
    }

    const { data: loans, error: loansError } = await supabase
      .from('loans')
      .select('id, loan_number, loan_date, status, borrowers(name)')
      .in('status', ['active', 'partial_payment']);
    if (loansError) throw new ApiError(400, loansError.message);

    const { data: sentNotices, error: noticesError } = await supabase
      .from('loan_notices')
      .select('loan_id, threshold_month');
    if (noticesError) throw new ApiError(400, noticesError.message);

    const sentSet = new Set((sentNotices || []).map((n) => `${n.loan_id}:${n.threshold_month}`));
    const now = new Date();

    const dueNow = [];
    const exempted = [];

    for (const loan of loans || []) {
      const monthsElapsed = fullCalendarMonthsElapsed(loan.loan_date, now);
      const pendingThresholds = thresholds.filter(
        (t) => monthsElapsed >= t && !sentSet.has(`${loan.id}:${t}`)
      );

      for (const thresholdMonth of pendingThresholds) {
        const row = {
          loanId: loan.id,
          loanNumber: loan.loan_number,
          borrowerName: loan.borrowers?.name || null,
          loanDate: loan.loan_date,
          monthsElapsed,
          thresholdMonth,
        };
        if (loan.status === 'partial_payment') exempted.push(row);
        else dueNow.push(row);
      }
    }

    dueNow.sort((a, b) => b.monthsElapsed - a.monthsElapsed);
    exempted.sort((a, b) => b.monthsElapsed - a.monthsElapsed);

    res.json({ dueNow, exempted, costAmount });
  } catch (err) {
    next(err);
  }
}

export async function createNotice(req, res, next) {
  try {
    requireFields(req.body, ['loanId', 'thresholdMonth']);
    const { loanId, thresholdMonth, sentDate } = req.body;

    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id')
      .eq('id', loanId)
      .maybeSingle();
    if (loanError) throw new ApiError(400, loanError.message);
    if (!loan) throw new ApiError(404, 'Loan not found');

    const config = await getActiveNoticeConfig();

    const { data, error } = await supabase
      .from('loan_notices')
      .insert({
        loan_id: loanId,
        threshold_month: thresholdMonth,
        sent_date: sentDate || new Date().toISOString().slice(0, 10),
        cost_charged: config?.cost_amount ?? 0,
        sent_by: req.user.id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ApiError(400, 'A notice for this threshold has already been sent for this loan.');
      }
      throw new ApiError(400, error.message);
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function listNoticesForLoan(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('loan_notices')
      .select('*')
      .eq('loan_id', req.params.id)
      .order('sent_date', { ascending: false });

    if (error) throw new ApiError(400, error.message);
    const totalCost = (data || []).reduce((sum, n) => sum + Number(n.cost_charged), 0);
    res.json({ data, totalCost });
  } catch (err) {
    next(err);
  }
}
