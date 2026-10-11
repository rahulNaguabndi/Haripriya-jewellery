import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { fetchAll } from '../utils/fetchAll.js';
import { calculateCompoundInterest, fullCalendarMonthsElapsed } from '../utils/interestCalculator.js';
import { getActiveInterestConfig } from '../utils/interestConfig.js';
import { scoreBorrower } from '../utils/borrowerScore.js';

// Optional branch filter for a query builder (null = all branches).
const inBranch = (query, branchId, column = 'branch_id') => (branchId ? query.eq(column, branchId) : query);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN = ['active', 'partial_payment'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (rows, key) => round2(rows.reduce((n, r) => n + (Number(r[key]) || 0), 0));

// Today's date in India - the shop's business day, regardless of server TZ.
export function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r[key])) map.set(r[key], []);
    map.get(r[key]).push(r);
  }
  return map;
}

// ---------------------------------------------------------------------
// Day book: GET /api/reports/day-book?date=YYYY-MM-DD
// Everything that moved money on one business day, for the end-of-day
// counter tally. Cash out = loans disbursed; cash in = part payments +
// closures (principal returned + interest). A rollover appears as the old
// loan's closure plus the new loan's disbursement - the net is the cash
// that actually changed hands.
// ---------------------------------------------------------------------
export async function getDayBook(req, res, next) {
  try {
    const date = req.query.date || todayIST();
    if (!ISO_DATE.test(date)) throw new ApiError(400, 'date must be YYYY-MM-DD');
    res.json(await buildDayBook({ date, branchId: req.branchId }));
  } catch (err) {
    next(err);
  }
}

// Shared by the day book page, the end-of-day cash close and the nightly
// email digest, so all three always agree on the day's figures.
export async function buildDayBook({ date, branchId = null }) {
  const borrowerCols = 'borrowers(id, name)';
  const [newLoansRes, paymentsRes, closuresRes] = await Promise.all([
    inBranch(
      supabase
        .from('loans')
        .select(`id, loan_number, loan_amount, loan_date, previous_loan_id, repledged_from_loan_id, created_by, ${borrowerCols}, previous:loans!previous_loan_id(loan_number)`)
        .eq('loan_date', date),
      branchId
    ).order('created_at'),
    inBranch(
      supabase
        .from('payments')
        .select(`id, loan_id, amount, payment_type, notes, created_at, loans(loan_number), ${borrowerCols}`)
        .eq('payment_date', date)
        .eq('is_deleted', false),
      branchId
    ).order('created_at'),
    inBranch(
      supabase
        .from('loans')
        .select(`id, loan_number, loan_amount, loan_date, closure_date, interest_collected, interest_calculated, interest_waived, interest_waiver_reason, ${borrowerCols}`)
        .eq('closure_date', date)
        .eq('status', 'closed'),
      branchId
    ).order('updated_at'),
  ]);
  for (const r of [newLoansRes, paymentsRes, closuresRes]) if (r.error) throw new ApiError(400, r.error.message);

  const closures = closuresRes.data || [];
  const closureIds = closures.map((l) => l.id);

  // Principal returned at closure = amount lent - part payments made up to
  // (and including) the closure day; same-day part payments are already
  // counted above as payments, so they're excluded here to avoid counting
  // the same rupees twice.
  const [priorPaymentsRes, rolledRes] = await Promise.all([
    closureIds.length
      ? supabase.from('payments').select('loan_id, amount, payment_date').in('loan_id', closureIds).eq('is_deleted', false)
      : Promise.resolve({ data: [] }),
    closureIds.length
      ? supabase.from('loans').select('id, loan_number, previous_loan_id').in('previous_loan_id', closureIds)
      : Promise.resolve({ data: [] }),
  ]);
  if (priorPaymentsRes.error) throw new ApiError(400, priorPaymentsRes.error.message);
  if (rolledRes.error) throw new ApiError(400, rolledRes.error.message);
  const paidByLoan = groupBy(priorPaymentsRes.data || [], 'loan_id');
  const rolledInto = new Map((rolledRes.data || []).map((l) => [l.previous_loan_id, l.loan_number]));

  const closureRows = closures.map((l) => {
    const paid = paidByLoan.get(l.id) || [];
    const paidBefore = sum(paid.filter((p) => p.payment_date <= date), 'amount');
    const principalReturned = round2(Math.max(0, Number(l.loan_amount) - paidBefore));
    return {
      id: l.id,
      loanNumber: l.loan_number,
      borrowerId: l.borrowers?.id,
      borrowerName: l.borrowers?.name || null,
      principalReturned,
      interestCollected: round2(l.interest_collected),
      interestCalculated: l.interest_calculated == null ? null : round2(l.interest_calculated),
      interestWaived: round2(l.interest_waived),
      waiverReason: l.interest_waiver_reason,
      total: round2(principalReturned + Number(l.interest_collected || 0)),
      rolledInto: rolledInto.get(l.id) || null,
    };
  });

  const loanRows = (newLoansRes.data || []).map((l) => ({
    id: l.id,
    loanNumber: l.loan_number,
    borrowerId: l.borrowers?.id,
    borrowerName: l.borrowers?.name || null,
    amount: round2(l.loan_amount),
    kind: l.previous_loan_id ? 'rollover' : l.repledged_from_loan_id ? 'repledge' : 'new',
    rolledFrom: l.previous?.loan_number || null,
  }));

  const paymentRows = (paymentsRes.data || []).map((p) => ({
    id: p.id,
    loanId: p.loan_id,
    loanNumber: p.loans?.loan_number,
    borrowerId: p.borrowers?.id,
    borrowerName: p.borrowers?.name || null,
    amount: round2(p.amount),
    mode: p.payment_type || 'cash',
    notes: p.notes,
  }));

  const byMode = {};
  for (const p of paymentRows) byMode[p.mode] = round2((byMode[p.mode] || 0) + p.amount);

  const disbursed = sum(loanRows, 'amount');
  const partPayments = sum(paymentRows, 'amount');
  const closurePrincipal = sum(closureRows, 'principalReturned');
  const interest = sum(closureRows, 'interestCollected');
  const moneyIn = round2(partPayments + closurePrincipal + interest);

  return {
    date,
    totals: {
      moneyIn,
      moneyOut: disbursed,
      net: round2(moneyIn - disbursed),
      interestCollected: interest,
      interestWaived: sum(closureRows, 'interestWaived'),
      partPayments,
      closurePrincipal,
      disbursed,
      counts: { newLoans: loanRows.length, payments: paymentRows.length, closures: closureRows.length },
    },
    partPaymentsByMode: byMode,
    newLoans: loanRows,
    payments: paymentRows,
    closures: closureRows,
  };
}

// Shared bulk read for the portfolio analytics below: every open loan plus
// its payments (paged past PostgREST's 1000-row cap).
async function openLoansWithPayments(branchId = null) {
  const [loans, payments, config] = await Promise.all([
    fetchAll(() =>
      inBranch(
        supabase.from('loans').select('id, loan_number, loan_amount, loan_date, interest_rate, total_payment_received, borrower_id').in('status', OPEN),
        branchId
      ).order('id')
    ),
    fetchAll(() =>
      inBranch(
        supabase.from('payments').select('loan_id, amount, payment_date, loans!inner(status)').in('loans.status', OPEN).eq('is_deleted', false),
        branchId
      ).order('id')
    ),
    getActiveInterestConfig(),
  ]);
  const paymentsByLoan = new Map();
  for (const p of payments) {
    if (!paymentsByLoan.has(p.loan_id)) paymentsByLoan.set(p.loan_id, []);
    paymentsByLoan.get(p.loan_id).push({ amount: Number(p.amount), paymentDate: p.payment_date });
  }
  return { loans, paymentsByLoan, tiers: config?.tiers || [] };
}

// ---------------------------------------------------------------------
// Ageing: GET /api/reports/ageing
// Open loans bucketed by age, with band edges at the overdue-notice
// milestones (13/19/26/36 months) so the chart lines up with notice work.
// ---------------------------------------------------------------------
const AGE_BANDS = [
  { key: '0-3', label: '0–3 mo', min: 0, max: 3 },
  { key: '3-6', label: '3–6 mo', min: 3, max: 6 },
  { key: '6-12', label: '6–12 mo', min: 6, max: 12 },
  { key: '12-13', label: '12–13 mo', min: 12, max: 13 },
  { key: '13-19', label: '13–19 mo', min: 13, max: 19 },
  { key: '19-26', label: '19–26 mo', min: 19, max: 26 },
  { key: '26-36', label: '26–36 mo', min: 26, max: 36 },
  { key: '36+', label: '36+ mo', min: 36, max: Infinity },
];

export async function getAgeing(req, res, next) {
  try {
    const { loans, paymentsByLoan, tiers } = await openLoansWithPayments(req.branchId);
    const now = new Date();
    const bands = AGE_BANDS.map((b) => ({ key: b.key, label: b.label, count: 0, principal: 0, amountDue: 0 }));

    for (const loan of loans) {
      const months = fullCalendarMonthsElapsed(loan.loan_date, now);
      const band = bands[AGE_BANDS.findIndex((b) => months >= b.min && months < b.max)];
      const interest = calculateCompoundInterest({
        principal: Number(loan.loan_amount),
        annualRate: Number(loan.interest_rate),
        loanDate: loan.loan_date,
        partialPayments: paymentsByLoan.get(loan.id) || [],
        tiers,
      });
      band.count += 1;
      band.principal += interest.principalRemaining;
      band.amountDue += interest.totalAmountDue;
    }

    res.json({ data: bands.map((b) => ({ ...b, principal: round2(b.principal), amountDue: round2(b.amountDue) })), totalLoans: loans.length });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Forecast: GET /api/reports/forecast
// How much interest the open book builds up over the next 30/60/90 days
// (if nobody pays), next to what was actually collected per month over the
// last 6 months - a realistic expectation for the coming months.
// ---------------------------------------------------------------------
export async function getForecast(req, res, next) {
  try {
    const { loans, paymentsByLoan, tiers } = await openLoansWithPayments(req.branchId);
    const horizons = [0, 30, 60, 90];
    const totals = horizons.map(() => 0);
    let principal = 0;

    for (const loan of loans) {
      const partialPayments = paymentsByLoan.get(loan.id) || [];
      horizons.forEach((days, i) => {
        const asOfDate = new Date(Date.now() + days * 86400000);
        const interest = calculateCompoundInterest({
          principal: Number(loan.loan_amount),
          annualRate: Number(loan.interest_rate),
          loanDate: loan.loan_date,
          partialPayments,
          tiers,
          asOfDate,
        });
        totals[i] += interest.totalInterestAccrued;
        if (days === 0) principal += interest.principalRemaining;
      });
    }

    // Collections history: part payments by payment month, closure interest
    // and closure principal by closure month.
    const start = new Date();
    start.setDate(1);
    start.setMonth(start.getMonth() - 5);
    const from = start.toISOString().slice(0, 10);
    const [payments, closed] = await Promise.all([
      fetchAll(() => inBranch(supabase.from('payments').select('amount, payment_date').eq('is_deleted', false).gte('payment_date', from), req.branchId).order('id')),
      fetchAll(() =>
        inBranch(
          supabase.from('loans').select('loan_amount, total_payment_received, interest_collected, closure_date').eq('status', 'closed').gte('closure_date', from),
          req.branchId
        ).order('id')
      ),
    ]);

    const months = [];
    for (let i = 0; i < 6; i += 1) {
      const d = new Date(start);
      d.setMonth(start.getMonth() + i);
      months.push({ month: d.toISOString().slice(0, 7), partPayments: 0, closurePrincipal: 0, interestCollected: 0 });
    }
    const byMonth = new Map(months.map((m) => [m.month, m]));
    for (const p of payments) {
      const m = byMonth.get(p.payment_date.slice(0, 7));
      if (m) m.partPayments += Number(p.amount) || 0;
    }
    for (const l of closed) {
      const m = byMonth.get(String(l.closure_date).slice(0, 7));
      if (!m) continue;
      m.interestCollected += Number(l.interest_collected) || 0;
      m.closurePrincipal += Math.max(0, Number(l.loan_amount) - Number(l.total_payment_received || 0));
    }
    const history = months.map((m) => ({
      month: m.month,
      partPayments: round2(m.partPayments),
      closurePrincipal: round2(m.closurePrincipal),
      interestCollected: round2(m.interestCollected),
      total: round2(m.partPayments + m.closurePrincipal + m.interestCollected),
    }));
    // Average over completed months only (the current month is partial).
    const completed = history.slice(0, -1);
    const avg = (key) => round2(completed.reduce((n, m) => n + m[key], 0) / Math.max(1, completed.length));

    res.json({
      openLoans: loans.length,
      principalOutstanding: round2(principal),
      accrual: horizons.map((days, i) => ({
        days,
        interestAccrued: round2(totals[i]),
        increase: round2(totals[i] - totals[0]),
      })),
      history,
      averageMonthly: { total: avg('total'), interestCollected: avg('interestCollected'), partPayments: avg('partPayments') },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Borrower reliability: GET /api/reports/borrower-scores[?borrowerId=]
// ---------------------------------------------------------------------
export async function getBorrowerScores(req, res, next) {
  try {
    const { borrowerId } = req.query;
    const data = await computeBorrowerScores(borrowerId);
    if (borrowerId) return res.json(data[0] || null);

    const bands = {};
    for (const row of data) bands[row.band] = (bands[row.band] || 0) + 1;
    res.json({ data, bands });
  } catch (err) {
    next(err);
  }
}

// Reliability is judged on the customer's whole history across branches.
// Returns rows sorted worst-first; one row when borrowerId is given.
export async function computeBorrowerScores(borrowerId) {
  const loanQuery = () => {
    let q = supabase.from('loans').select('id, borrower_id, status, loan_date, closure_date, previous_loan_id').order('id');
    if (borrowerId) q = q.eq('borrower_id', borrowerId);
    return q;
  };
  const loans = await fetchAll(loanQuery);
  const loanIds = loans.map((l) => l.id);

  // Per-borrower requests stay small; the full list pages through
  // everything instead of passing thousands of ids in a URL.
  const scoped = (table, cols) => () => {
    let q = supabase.from(table).select(cols).order('id');
    if (borrowerId) q = q.in('loan_id', loanIds.length ? loanIds : ['00000000-0000-0000-0000-000000000000']);
    return q;
  };
  const [notices, payments, borrowers] = await Promise.all([
    fetchAll(scoped('loan_notices', 'id, loan_id')),
    fetchAll(() => {
      let q = supabase.from('payments').select('id, loan_id, payment_date').eq('is_deleted', false).order('id');
      if (borrowerId) q = q.in('loan_id', loanIds.length ? loanIds : ['00000000-0000-0000-0000-000000000000']);
      return q;
    }),
    fetchAll(() => {
      let q = supabase.from('borrowers').select('id, name, phone, village, city').eq('is_deleted', false).order('id');
      if (borrowerId) q = q.eq('id', borrowerId);
      return q;
    }),
  ]);

  const rolledIds = new Set(loans.filter((l) => l.previous_loan_id).map((l) => l.previous_loan_id));
  const noticesByLoan = new Map();
  for (const n of notices) noticesByLoan.set(n.loan_id, (noticesByLoan.get(n.loan_id) || 0) + 1);
  const lastPaymentByLoan = new Map();
  for (const p of payments) {
    const prev = lastPaymentByLoan.get(p.loan_id);
    if (!prev || p.payment_date > prev) lastPaymentByLoan.set(p.loan_id, p.payment_date);
  }
  const loansByBorrower = groupBy(loans, 'borrower_id');
  const context = { rolledIds, noticesByLoan, lastPaymentByLoan };

  const data = borrowers
    .filter((b) => loansByBorrower.has(b.id))
    .map((b) => ({
      borrowerId: b.id,
      name: b.name,
      phone: b.phone,
      place: b.village || b.city || null,
      ...scoreBorrower(loansByBorrower.get(b.id), context),
    }))
    .sort((a, b) => a.score - b.score);
  return data;
}
