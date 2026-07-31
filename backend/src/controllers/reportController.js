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

// ---------------------------------------------------------------------
// Chart/analytics endpoints (feed the Reports "Overview" charts and the
// dashboard insight tiles). All bucketing is done in JS over a single
// bulk fetch rather than N grouped SQL queries - the dataset (low
// thousands of rows) is small enough that one round-trip + in-memory
// grouping is simpler and cheaper than a Postgres function per chart.
// ---------------------------------------------------------------------

// Loan count by status - drives the status donut on the Reports overview.
export async function getStatusBreakdown(req, res, next) {
  try {
    const { data: loans, error } = await supabase.from('loans').select('status');
    if (error) throw new ApiError(400, error.message);

    const counts = { active: 0, partial_payment: 0, closed: 0, defaulted: 0 };
    for (const l of loans || []) {
      if (counts[l.status] === undefined) counts[l.status] = 0;
      counts[l.status] += 1;
    }
    res.json({ data: counts, total: (loans || []).length });
  } catch (err) {
    next(err);
  }
}

function monthKey(dateStr) {
  return String(dateStr).slice(0, 7); // YYYY-MM
}

// Builds an ordered list of the last `months` YYYY-MM keys ending at the
// current month, so a month with zero activity still shows as a gap (0)
// instead of collapsing the axis.
function lastMonthsAxis(months) {
  const axis = [];
  const d = new Date();
  d.setDate(1);
  for (let i = months - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    axis.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  return axis;
}

// Payments summed per month for the last N months - the payments trend
// area chart on the Reports overview.
export async function getPaymentsMonthly(req, res, next) {
  try {
    const months = Math.min(36, Math.max(3, parseInt(req.query.months) || 12));
    const axis = lastMonthsAxis(months);
    const since = `${axis[0]}-01`;

    const { data: payments, error } = await supabase
      .from('payments')
      .select('amount, payment_date')
      .eq('is_deleted', false)
      .gte('payment_date', since);
    if (error) throw new ApiError(400, error.message);

    const totals = Object.fromEntries(axis.map((m) => [m, 0]));
    for (const p of payments || []) {
      const k = monthKey(p.payment_date);
      if (k in totals) totals[k] += Number(p.amount) || 0;
    }

    res.json({ data: axis.map((month) => ({ month, total: round2(totals[month]) })) });
  } catch (err) {
    next(err);
  }
}

// New loans disbursed per month (count + principal) for the last N months
// - the loans-issued bar chart on the Reports overview.
export async function getLoansMonthly(req, res, next) {
  try {
    const months = Math.min(36, Math.max(3, parseInt(req.query.months) || 12));
    const axis = lastMonthsAxis(months);
    const since = `${axis[0]}-01`;

    const { data: loans, error } = await supabase
      .from('loans')
      .select('loan_amount, loan_date')
      .gte('loan_date', since);
    if (error) throw new ApiError(400, error.message);

    const count = Object.fromEntries(axis.map((m) => [m, 0]));
    const amount = Object.fromEntries(axis.map((m) => [m, 0]));
    for (const l of loans || []) {
      const k = monthKey(l.loan_date);
      if (k in count) {
        count[k] += 1;
        amount[k] += Number(l.loan_amount) || 0;
      }
    }

    res.json({ data: axis.map((month) => ({ month, count: count[month], amount: round2(amount[month]) })) });
  } catch (err) {
    next(err);
  }
}

// Single roll-up powering the dashboard's call-to-action tiles: what
// changed recently and what needs attention today.
export async function getDashboardInsights(req, res, next) {
  try {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const yesterdayIso = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const oneYearAgoIso = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);
    const monthStartIso = `${todayIso.slice(0, 7)}-01`;

    const [
      newToday,
      newYesterday,
      staleLoans,
      overdue,
      noticesMonth,
      noticesTotal,
    ] = await Promise.all([
      supabase.from('loans').select('id', { count: 'exact', head: true }).eq('loan_date', todayIso),
      supabase.from('loans').select('id', { count: 'exact', head: true }).eq('loan_date', yesterdayIso),
      // Open loans over a year old that have never received a payment.
      supabase
        .from('loans')
        .select('loan_amount')
        .in('status', ['active', 'partial_payment'])
        .lte('loan_date', oneYearAgoIso)
        .eq('total_payment_received', 0),
      supabase
        .from('loans')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'partial_payment'])
        .not('due_date', 'is', null)
        .lt('due_date', todayIso),
      supabase.from('loan_notices').select('id', { count: 'exact', head: true }).gte('sent_date', monthStartIso),
      supabase.from('loan_notices').select('id', { count: 'exact', head: true }),
    ]);

    const staleValue = (staleLoans.data || []).reduce((sum, l) => sum + (Number(l.loan_amount) || 0), 0);

    res.json({
      newLoansToday: newToday.count || 0,
      newLoansYesterday: newYesterday.count || 0,
      staleAwaitingPaymentCount: (staleLoans.data || []).length,
      staleAwaitingPaymentValue: round2(staleValue),
      overdueCount: overdue.count || 0,
      noticesSentThisMonth: noticesMonth.count || 0,
      noticesSentTotal: noticesTotal.count || 0,
    });
  } catch (err) {
    next(err);
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
