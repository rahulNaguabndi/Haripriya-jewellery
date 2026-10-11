import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig } from '../utils/interestConfig.js';
import { getTodayRate, getLatestRate } from '../utils/dailyRates.js';
import { itemMeltValue, coverageRatio, coverageStatus } from '../utils/coverageCalculator.js';
import { fetchAll } from '../utils/fetchAll.js';
import { computeBorrowerScores } from './insightsController.js';

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

const OPEN = ['active', 'partial_payment'];
const METALS = ['Gold', 'Silver'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Every open loan (optionally one branch) with what is owed today and the
// fine-metal grams behind it, per metal. Melt value at any rate is then just
// fineGrams x rate, so the same pass can be priced at today's rate and at
// the previous one. Items with unparseable purity count as unknown, not 0.
export async function openLoanExposure(branchId = null) {
  const loanQuery = () => {
    let q = supabase
      .from('loans')
      .select('id, loan_number, loan_date, loan_amount, interest_rate, borrower_id, branch_id, borrowers(name, phone), loan_items(*)')
      .in('status', OPEN);
    if (branchId) q = q.eq('branch_id', branchId);
    return q.order('id');
  };
  // Filtered via the loans join (not `.in('loan_id', [...huge list])`) -
  // at real scale a giant IN-list blows past PostgREST's URL length limit.
  const paymentQuery = () => {
    let q = supabase.from('payments').select('loan_id, amount, payment_date, loans!inner(status)').in('loans.status', OPEN).eq('is_deleted', false);
    if (branchId) q = q.eq('branch_id', branchId);
    return q.order('id');
  };
  const [loans, allPayments, interestConfig] = await Promise.all([fetchAll(loanQuery), fetchAll(paymentQuery), getActiveInterestConfig()]);

  const paymentsByLoan = {};
  for (const p of allPayments) (paymentsByLoan[p.loan_id] ||= []).push({ amount: p.amount, paymentDate: p.payment_date });
  const tiers = interestConfig?.tiers || [];

  return loans.map((loan) => {
    const interest = calculateCompoundInterest({
      principal: loan.loan_amount,
      annualRate: loan.interest_rate,
      loanDate: loan.loan_date,
      partialPayments: paymentsByLoan[loan.id] || [],
      tiers,
    });
    const fineGrams = {};
    let hasUnknownItems = false;
    for (const item of loan.loan_items || []) {
      // itemMeltValue at a rate of 1/g = fine grams of metal.
      const grams = itemMeltValue(item, 1);
      if (grams == null) hasUnknownItems = true;
      else fineGrams[item.metal_type] = (fineGrams[item.metal_type] || 0) + grams;
    }
    return { loan, amountOwed: interest.totalAmountDue, fineGrams, hasUnknownItems };
  });
}

// Melt value of one exposure row at a set of per-metal rates. A metal with
// no rate on record is flagged (missingRate), not counted as zero.
function meltAt(row, rates) {
  let value = null;
  let missingRate = false;
  for (const [metal, grams] of Object.entries(row.fineGrams)) {
    const rate = rates[metal]?.rate_per_gram;
    if (!rate) {
      missingRate = true;
      continue;
    }
    value = (value ?? 0) + grams * Number(rate);
  }
  return { value, missingRate };
}

async function currentRates() {
  const rates = {};
  for (const metal of METALS) rates[metal] = (await getTodayRate(metal)) || (await getLatestRate(metal));
  return rates;
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

    const [rows, rates] = await Promise.all([openLoanExposure(req.branchId), currentRates()]);
    const today = new Date().toISOString().slice(0, 10);

    const results = rows.map((row) => {
      const { loan } = row;
      const melt = meltAt(row, rates);
      const metalTypes = Object.keys(row.fineGrams);
      const ratio = coverageRatio(melt.value, row.amountOwed);
      return {
        loanId: loan.id,
        loanNumber: loan.loan_number,
        borrowerName: loan.borrowers?.name || null,
        loanDate: loan.loan_date,
        metalTypes,
        itemCount: (loan.loan_items || []).length,
        amountOwed: row.amountOwed,
        rateIsToday: metalTypes.every((m) => rates[m]?.rate_date === today),
        meltValue: melt.value,
        hasUnknownItems: row.hasUnknownItems || melt.missingRate,
        ratio,
        status: coverageStatus(ratio, redThreshold, amberThreshold),
      };
    });

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

// ---------------------------------------------------------------------
// Rate-change risk: GET /api/coverage/rate-risk
// What the latest gold/silver rate move did to the book: each open loan's
// coverage at the latest rate vs the previous one, combined with the
// borrower's reliability score into one risk level, so the owner sees at a
// glance which loans to call about first.
// ---------------------------------------------------------------------
const RISK_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// Coverage status x borrower band -> how worried to be. A shortfall with a
// customer who usually redeems is less urgent than one who is already slow.
function riskLevel(status, band, dropToRed) {
  const weak = band === 'risky' || band === 'watch';
  if (status === 'red') return weak ? 'critical' : 'high';
  if (status === 'amber') return band === 'risky' ? 'high' : weak || band === 'new' ? 'medium' : 'low';
  if (status === 'green' && dropToRed != null && dropToRed < 5 && weak) return 'medium';
  return null;
}

async function latestTwoRates(metal) {
  const { data, error } = await supabase
    .from('daily_rates')
    .select('rate_date, rate_per_gram, set_at')
    .eq('metal_type', metal)
    .order('rate_date', { ascending: false })
    .limit(2);
  if (error) throw new ApiError(400, error.message);
  return { current: data?.[0] || null, previous: data?.[1] || null };
}

export async function computeRateRisk(branchId = null, { limit = 25 } = {}) {
  const coverageConfig = await getActiveCoverageConfig();
  const red = coverageConfig?.red_threshold ?? 1.0;
  const amber = coverageConfig?.amber_threshold ?? 1.1;

  const pairs = {};
  for (const metal of METALS) pairs[metal] = await latestTwoRates(metal);
  const now = Object.fromEntries(METALS.map((m) => [m, pairs[m].current]));
  // No previous rate for a metal -> compare against the same rate (no move).
  const before = Object.fromEntries(METALS.map((m) => [m, pairs[m].previous || pairs[m].current]));

  const [rows, scores] = await Promise.all([openLoanExposure(branchId), computeBorrowerScores()]);
  const scoreById = new Map(scores.map((s) => [s.borrowerId, s]));

  const summary = { openLoans: rows.length, red: 0, amber: 0, newlyRed: 0, newlyAmber: 0, worsened: 0, shortfall: 0, owedAtRisk: 0 };
  const flagged = [];
  for (const row of rows) {
    const meltNow = meltAt(row, now).value;
    const meltBefore = meltAt(row, before).value;
    const ratioNow = coverageRatio(meltNow, row.amountOwed);
    const ratioBefore = coverageRatio(meltBefore, row.amountOwed);
    const status = coverageStatus(ratioNow, red, amber);
    const previousStatus = coverageStatus(ratioBefore, red, amber);
    if (status === 'unknown') continue;

    if (status === 'red') summary.red += 1;
    if (status === 'amber') summary.amber += 1;
    if (status === 'red' && previousStatus !== 'red') summary.newlyRed += 1;
    if (status === 'amber' && previousStatus === 'green') summary.newlyAmber += 1;
    if (ratioNow != null && ratioBefore != null && ratioNow < ratioBefore - 1e-9) summary.worsened += 1;

    // How much further (%) the price can fall before this loan turns red.
    const dropToRed = ratioNow != null && ratioNow > red ? round2((1 - red / ratioNow) * 100) : 0;
    const score = scoreById.get(row.loan.borrower_id);
    const band = score?.band || 'new';
    const level = riskLevel(status, band, dropToRed);
    if (!level) continue;

    const shortfall = status === 'red' ? round2(Math.max(0, row.amountOwed - (meltNow || 0))) : 0;
    summary.shortfall += shortfall;
    summary.owedAtRisk += row.amountOwed;
    flagged.push({
      loanId: row.loan.id,
      loanNumber: row.loan.loan_number,
      loanDate: row.loan.loan_date,
      branchId: row.loan.branch_id,
      borrowerId: row.loan.borrower_id,
      borrowerName: row.loan.borrowers?.name || null,
      borrowerPhone: row.loan.borrowers?.phone || null,
      metals: Object.keys(row.fineGrams),
      amountOwed: round2(row.amountOwed),
      meltNow: round2(meltNow),
      meltBefore: round2(meltBefore),
      ratioNow: ratioNow == null ? null : Math.round(ratioNow * 1000) / 1000,
      ratioBefore: ratioBefore == null ? null : Math.round(ratioBefore * 1000) / 1000,
      status,
      previousStatus,
      shortfall,
      dropToRed,
      borrowerScore: score?.score ?? null,
      borrowerBand: band,
      risk: level,
    });
  }

  flagged.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.shortfall - a.shortfall || (a.ratioNow ?? 9) - (b.ratioNow ?? 9));
  const byRisk = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of flagged) byRisk[f.risk] += 1;

  const rates = METALS.map((metal) => {
    const { current, previous } = pairs[metal];
    const changePct = current && previous ? round2(((current.rate_per_gram - previous.rate_per_gram) / previous.rate_per_gram) * 100) : null;
    return {
      metal,
      current: current ? { rate: Number(current.rate_per_gram), date: current.rate_date } : null,
      previous: previous ? { rate: Number(previous.rate_per_gram), date: previous.rate_date } : null,
      changePct,
    };
  });
  const asOf = rates.map((r) => r.current?.date).filter(Boolean).sort().pop() || null;

  return {
    asOf,
    rates,
    thresholds: { red, amber },
    summary: { ...summary, shortfall: round2(summary.shortfall), owedAtRisk: round2(summary.owedAtRisk), byRisk, flagged: flagged.length },
    loans: flagged.slice(0, limit),
  };
}

export async function getRateRisk(req, res, next) {
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 25);
    res.json(await computeRateRisk(req.branchId, { limit }));
  } catch (err) {
    next(err);
  }
}
