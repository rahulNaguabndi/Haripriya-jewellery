import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig } from '../utils/interestConfig.js';
import { getTodayRate, getLatestRate } from '../utils/dailyRates.js';
import { meltValue, coverageRatio, coverageStatus } from '../utils/coverageCalculator.js';

async function getActiveCoverageConfig() {
  const { data, error } = await supabase
    .from('coverage_config')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCoverageConfig(req, res, next) {
  try {
    const data = await getActiveCoverageConfig();
    if (!data) throw new ApiError(404, 'No active coverage configuration found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateCoverageConfig(req, res, next) {
  try {
    requireFields(req.body, ['redThreshold', 'amberThreshold']);
    const { redThreshold, amberThreshold, configName } = req.body;

    if (typeof redThreshold !== 'number' || redThreshold <= 0) {
      throw new ApiError(400, 'redThreshold must be a positive number');
    }
    if (typeof amberThreshold !== 'number' || amberThreshold <= redThreshold) {
      throw new ApiError(400, 'amberThreshold must be a number greater than redThreshold');
    }

    const current = await getActiveCoverageConfig();

    let result;
    if (current) {
      const { data, error } = await supabase
        .from('coverage_config')
        .update({
          red_threshold: redThreshold,
          amber_threshold: amberThreshold,
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
        .from('coverage_config')
        .insert({
          config_name: configName || 'default',
          is_active: true,
          red_threshold: redThreshold,
          amber_threshold: amberThreshold,
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

// Coverage ratio (current melt value / amount owed) for every open loan,
// sorted worst-first. Loans with unparseable purity or no rate on record
// yet are returned with status 'unknown' rather than dropped, so nothing
// silently disappears from the review list.
export async function listCoverage(req, res, next) {
  try {
    const coverageConfig = await getActiveCoverageConfig();
    const redThreshold = coverageConfig?.red_threshold ?? 1.0;
    const amberThreshold = coverageConfig?.amber_threshold ?? 1.1;

    const { data: loans, error: loansError } = await supabase
      .from('loans')
      .select('id, loan_number, loan_date, metal_type, weight, purity, loan_amount, interest_rate, borrowers(name)')
      .in('status', ['active', 'partial_payment']);
    if (loansError) throw new ApiError(400, loansError.message);

    if (!loans || loans.length === 0) {
      return res.json({ data: [], redThreshold, amberThreshold });
    }

    // Filtered via the loans join (not `.in('loan_id', [...huge list])`) -
    // at real scale (thousands of open loans) a giant IN-list blows past
    // PostgREST's URL length limit and gets rejected outright.
    const { data: allPayments, error: paymentsError } = await supabase
      .from('payments')
      .select('loan_id, amount, payment_date, loans!inner(status)')
      .in('loans.status', ['active', 'partial_payment'])
      .eq('is_deleted', false);
    if (paymentsError) throw new ApiError(400, paymentsError.message);

    const paymentsByLoan = {};
    for (const p of allPayments || []) {
      (paymentsByLoan[p.loan_id] ||= []).push(p);
    }

    const interestConfig = await getActiveInterestConfig();
    const tiers = interestConfig?.tiers || [];

    const rateCache = {};
    async function currentRate(metalType) {
      if (rateCache[metalType] !== undefined) return rateCache[metalType];
      const today = await getTodayRate(metalType);
      const rate = today || (await getLatestRate(metalType));
      rateCache[metalType] = rate;
      return rate;
    }

    const results = [];
    for (const loan of loans) {
      const payments = paymentsByLoan[loan.id] || [];
      const interest = calculateCompoundInterest({
        principal: loan.loan_amount,
        annualRate: loan.interest_rate,
        loanDate: loan.loan_date,
        partialPayments: payments.map((p) => ({ amount: p.amount, paymentDate: p.payment_date })),
        tiers,
      });

      const rateRow = await currentRate(loan.metal_type);
      const value = rateRow ? meltValue(loan, rateRow.rate_per_gram) : null;
      const ratio = coverageRatio(value, interest.totalAmountDue);
      const status = coverageStatus(ratio, redThreshold, amberThreshold);

      results.push({
        loanId: loan.id,
        loanNumber: loan.loan_number,
        borrowerName: loan.borrowers?.name || null,
        loanDate: loan.loan_date,
        metalType: loan.metal_type,
        weight: loan.weight,
        purity: loan.purity,
        amountOwed: interest.totalAmountDue,
        ratePerGram: rateRow?.rate_per_gram ?? null,
        rateIsToday: rateRow?.rate_date === new Date().toISOString().slice(0, 10),
        meltValue: value,
        ratio,
        status,
      });
    }

    const statusOrder = { red: 0, amber: 1, unknown: 2, green: 3 };
    results.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      if (a.ratio == null) return 0;
      if (b.ratio == null) return -1;
      return a.ratio - b.ratio;
    });

    res.json({ data: results, redThreshold, amberThreshold });
  } catch (err) {
    next(err);
  }
}
