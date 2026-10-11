import { fullCalendarMonthsElapsed } from './interestCalculator.js';

// Borrower reliability score (0-100), from the borrower's own loan history.
// Deliberately simple and explainable: every point comes from a listed
// factor, so staff can see *why* someone scores the way they do. It's a
// guide for the "known customer" judgment call, not an automated decision.
//
// loans: [{ id, status, loan_date, closure_date, previous_loan_id }]
// rolledIds: Set of loan ids that some later loan rolled over from
// noticesByLoan: Map loanId -> count of overdue notices sent
// lastPaymentByLoan: Map loanId -> latest payment_date (ISO)
const BASE = 55;
const RULES = {
  quickRedeem: { points: 8, cap: 32, label: 'Redeemed within 12 months' },
  slowRedeem: { points: 3, cap: 12, label: 'Redeemed after 12 months' },
  rolledOver: { points: 3, cap: 9, label: 'Paid interest and rolled over' },
  partPayer: { points: 2, cap: 6, label: 'Made part payments' },
  defaulted: { points: -20, cap: -60, label: 'Defaulted loan' },
  notice: { points: -5, cap: -30, label: 'Overdue notice sent' },
  stale: { points: -10, cap: -30, label: 'Open over a year with no payment in the last year' },
};

export function bandFor(score, isNew) {
  if (isNew) return 'new';
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'watch';
  return 'risky';
}

export function scoreBorrower(loans, { rolledIds, noticesByLoan, lastPaymentByLoan }, now = new Date()) {
  const counts = Object.fromEntries(Object.keys(RULES).map((k) => [k, 0]));
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const yearAgoIso = yearAgo.toISOString().slice(0, 10);

  for (const loan of loans) {
    if (loan.status === 'closed' && loan.closure_date) {
      if (rolledIds.has(loan.id)) counts.rolledOver += 1;
      else if (fullCalendarMonthsElapsed(loan.loan_date, loan.closure_date) < 12) counts.quickRedeem += 1;
      else counts.slowRedeem += 1;
    }
    if (loan.status === 'defaulted') counts.defaulted += 1;
    if (lastPaymentByLoan.has(loan.id)) counts.partPayer += 1;
    counts.notice += noticesByLoan.get(loan.id) || 0;

    const open = loan.status === 'active' || loan.status === 'partial_payment';
    if (open && fullCalendarMonthsElapsed(loan.loan_date, now) >= 12) {
      const last = lastPaymentByLoan.get(loan.id);
      if (!last || last < yearAgoIso) counts.stale += 1;
    }
  }

  const factors = [];
  let score = BASE;
  for (const [key, rule] of Object.entries(RULES)) {
    if (!counts[key]) continue;
    const raw = counts[key] * rule.points;
    const points = rule.points > 0 ? Math.min(raw, rule.cap) : Math.max(raw, rule.cap);
    score += points;
    factors.push({ key, label: rule.label, count: counts[key], points });
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Not enough history to judge: nothing settled yet and nothing old.
  const settled = counts.quickRedeem + counts.slowRedeem + counts.rolledOver + counts.defaulted;
  const hasOldLoan = loans.some((l) => fullCalendarMonthsElapsed(l.loan_date, now) >= 6);
  const isNew = settled === 0 && !hasOldLoan && counts.notice === 0;

  return { score, band: bandFor(score, isNew), base: BASE, factors, loanCount: loans.length };
}
