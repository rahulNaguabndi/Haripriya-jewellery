import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';

const OPEN_STATUSES = ['active', 'partial_payment'];
const UNKNOWN = 'Not recorded';

// Free-text place names get typed inconsistently ("kodad", "Kodad ",
// "KODAD") - group on a normalized key but display the first spelling seen.
function placeKey(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function emptyStats(name) {
  return { name, borrowers: 0, loans: 0, openLoans: 0, disbursed: 0, openPrincipal: 0, gold: 0, silver: 0, mixed: 0 };
}

function metalCategory(items) {
  const metals = new Set((items || []).map((i) => i.metal_type).filter(Boolean));
  if (metals.size > 1) return 'mixed';
  if (metals.has('Silver')) return 'silver';
  return 'gold';
}

function addLoan(stats, loan) {
  stats.loans += 1;
  stats.disbursed += Number(loan.loan_amount) || 0;
  stats[metalCategory(loan.loan_items)] += 1;
  if (OPEN_STATUSES.includes(loan.status)) {
    stats.openLoans += 1;
    stats.openPrincipal += Number(loan.loan_amount) || 0;
  }
}

function childOf(map, rawName) {
  const key = placeKey(rawName) || '__unknown__';
  if (!map.has(key)) map.set(key, { ...emptyStats(rawName?.trim() || UNKNOWN), children: new Map() });
  return map.get(key);
}

function finalize(map) {
  return [...map.values()]
    .map(({ children, ...stats }) => ({
      ...stats,
      disbursed: Math.round(stats.disbursed),
      openPrincipal: Math.round(stats.openPrincipal),
      ...(children ? { children: finalize(children) } : {}),
    }))
    .sort((a, b) => b.loans - a.loans || b.borrowers - a.borrowers);
}

// GET /api/reports/demographics
// Borrower + loan counts rolled up district -> mandal -> village, for the
// "where is our business coming from" view. Borrowers with no district on
// file go under "Not recorded" (their city still stands in for a missing
// village), so pre-existing records still show up somewhere instead of
// silently disappearing.
export async function getDemographics(req, res, next) {
  try {
    const [{ data: borrowers, error: bErr }, { data: loans, error: lErr }] = await Promise.all([
      supabase.from('borrowers').select('id, village, mandal, district, city, state').eq('is_deleted', false),
      supabase.from('loans').select('id, borrower_id, loan_amount, status, loan_items(metal_type)'),
    ]);
    if (bErr) throw new ApiError(400, bErr.message);
    if (lErr) throw new ApiError(400, lErr.message);

    const loansByBorrower = new Map();
    for (const loan of loans || []) {
      if (!loansByBorrower.has(loan.borrower_id)) loansByBorrower.set(loan.borrower_id, []);
      loansByBorrower.get(loan.borrower_id).push(loan);
    }

    const districts = new Map();
    const totals = emptyStats('All');
    let missingVillage = 0;

    for (const b of borrowers || []) {
      const district = childOf(districts, b.district);
      const mandal = childOf(district.children, b.mandal);
      const village = childOf(mandal.children, b.village || b.city);
      village.children = null;
      if (!b.village) missingVillage += 1;

      for (const level of [district, mandal, village, totals]) level.borrowers += 1;
      for (const loan of loansByBorrower.get(b.id) || []) {
        for (const level of [district, mandal, village, totals]) addLoan(level, loan);
      }
    }

    res.json({
      totals: { ...totals, disbursed: Math.round(totals.disbursed), openPrincipal: Math.round(totals.openPrincipal) },
      missingVillage,
      districts: finalize(districts),
    });
  } catch (err) {
    next(err);
  }
}
