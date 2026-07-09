import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig } from '../utils/interestConfig.js';

async function loansWithInterest(filterFn) {
  const { data: loans, error } = await supabase.from('loans').select('*, borrowers(name, phone)');
  if (error) throw new ApiError(400, error.message);

  const relevant = filterFn ? loans.filter(filterFn) : loans;
  if (relevant.length === 0) return [];

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .in('loan_id', relevant.map((l) => l.id))
    .eq('is_deleted', false);

  const config = await getActiveInterestConfig();
  const paymentsByLoan = new Map();
  for (const p of payments || []) {
    if (!paymentsByLoan.has(p.loan_id)) paymentsByLoan.set(p.loan_id, []);
    paymentsByLoan.get(p.loan_id).push({ amount: p.amount, paymentDate: p.payment_date });
  }

  return relevant.map((loan) => {
    const interest = calculateCompoundInterest({
      principal: loan.loan_amount,
      annualRate: loan.interest_rate,
      loanDate: loan.loan_date,
      partialPayments: paymentsByLoan.get(loan.id) || [],
      tiers: config?.tiers || [],
    });
    return { ...loan, interest };
  });
}

// Lightweight, independent tiles for the dashboard — each is its own cheap
// query so the frontend can fetch them in parallel (Promise.allSettled) and
// populate each stat card as soon as its own request resolves, instead of
// waiting on one large combined endpoint.
export async function getLoanCounts(req, res, next) {
  try {
    const { count: totalLoans } = await supabase.from('loans').select('id', { count: 'exact', head: true });
    const { count: activeLoans } = await supabase
      .from('loans')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'partial_payment']);

    res.json({ totalLoans: totalLoans || 0, activeLoans: activeLoans || 0 });
  } catch (err) {
    next(err);
  }
}

export async function getBorrowerCount(req, res, next) {
  try {
    const { count: totalBorrowers } = await supabase
      .from('borrowers')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false);

    res.json({ totalBorrowers: totalBorrowers || 0 });
  } catch (err) {
    next(err);
  }
}

export async function getOutstandingTotals(req, res, next) {
  try {
    const openLoans = await loansWithInterest((l) => ['active', 'partial_payment'].includes(l.status));
    const totalInterestOutstanding = openLoans.reduce((sum, l) => sum + l.interest.totalInterestAccrued, 0);
    const totalPrincipalOutstanding = openLoans.reduce((sum, l) => sum + l.interest.principalRemaining, 0);

    res.json({
      totalInterestOutstanding: round2(totalInterestOutstanding),
      totalPrincipalOutstanding: round2(totalPrincipalOutstanding),
    });
  } catch (err) {
    next(err);
  }
}

export async function getRecentPayments(req, res, next) {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10);
    const { data: recentPayments, error } = await supabase
      .from('payments')
      .select('*, loans(loan_number), borrowers(name)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new ApiError(400, error.message);
    res.json({ data: recentPayments });
  } catch (err) {
    next(err);
  }
}

export async function getSummary(req, res, next) {
  try {
    const { count: totalLoans } = await supabase.from('loans').select('id', { count: 'exact', head: true });
    const { count: activeLoans } = await supabase
      .from('loans')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'partial_payment']);
    const { count: totalBorrowers } = await supabase
      .from('borrowers')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false);

    const openLoans = await loansWithInterest((l) => ['active', 'partial_payment'].includes(l.status));
    const totalInterestOutstanding = openLoans.reduce((sum, l) => sum + l.interest.totalInterestAccrued, 0);
    const totalPrincipalOutstanding = openLoans.reduce((sum, l) => sum + l.interest.principalRemaining, 0);

    const { data: recentPayments } = await supabase
      .from('payments')
      .select('*, loans(loan_number), borrowers(name)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      totalLoans: totalLoans || 0,
      activeLoans: activeLoans || 0,
      totalBorrowers: totalBorrowers || 0,
      totalInterestOutstanding: round2(totalInterestOutstanding),
      totalPrincipalOutstanding: round2(totalPrincipalOutstanding),
      recentPayments,
    });
  } catch (err) {
    next(err);
  }
}

export async function getBorrowerSummary(req, res, next) {
  try {
    const { data: borrowers, error } = await supabase.from('borrowers').select('*').eq('is_deleted', false);
    if (error) throw new ApiError(400, error.message);

    const openLoans = await loansWithInterest();
    const summaries = borrowers.map((b) => {
      const loans = openLoans.filter((l) => l.borrower_id === b.id);
      return {
        borrowerId: b.id,
        borrowerName: b.name,
        totalLoans: loans.length,
        activeLoans: loans.filter((l) => ['active', 'partial_payment'].includes(l.status)).length,
        totalLoanAmount: round2(loans.reduce((sum, l) => sum + l.loan_amount, 0)),
        totalOutstanding: round2(loans.reduce((sum, l) => sum + l.interest.totalAmountDue, 0)),
      };
    });

    res.json({ data: summaries });
  } catch (err) {
    next(err);
  }
}

export async function getOutstandingInterest(req, res, next) {
  try {
    const loans = await loansWithInterest((l) => ['active', 'partial_payment'].includes(l.status));
    res.json({ data: loans });
  } catch (err) {
    next(err);
  }
}

export async function getPaymentsReport(req, res, next) {
  try {
    let query = supabase
      .from('payments')
      .select('*, loans(loan_number), borrowers(name)')
      .eq('is_deleted', false);

    if (req.query.dateFrom) query = query.gte('payment_date', req.query.dateFrom);
    if (req.query.dateTo) query = query.lte('payment_date', req.query.dateTo);

    const { data, error } = await query.order('payment_date', { ascending: false });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function getOverdueLoans(req, res, next) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const loans = await loansWithInterest(
      (l) => ['active', 'partial_payment'].includes(l.status) && l.due_date && l.due_date < today
    );
    res.json({ data: loans });
  } catch (err) {
    next(err);
  }
}

export async function getClosedLoans(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('loans')
      .select('*, borrowers(name, phone)')
      .eq('status', 'closed')
      .order('updated_at', { ascending: false });

    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
