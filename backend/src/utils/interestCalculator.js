const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365;

const round2 = (n) => Math.round(n * 100) / 100;
const ceilTo10 = (n) => Math.ceil(n / 10) * 10;
const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

// Returns the tier whose [minAmount, maxAmount] range contains principalAmount,
// or null if no tier matches (caller should fall back to the loan's stored rate).
export function getApplicableTier(principalAmount, tiers = []) {
  return (
    tiers.find(
      (tier) =>
        principalAmount >= tier.minAmount &&
        (tier.maxAmount == null || principalAmount <= tier.maxAmount)
    ) || null
  );
}

function addCalendarMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function addCalendarYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

// Real calendar months elapsed (a "month" is the actual calendar month, not a
// fixed 30-day block) plus whatever whole days are left over after the last
// full month. E.g. 26/01/2026 -> 20/07/2026 = 5 months, 24 days.
function calendarMonthsAndDays(start, end) {
  let cursor = new Date(start);
  let months = 0;
  while (addCalendarMonths(cursor, 1).getTime() <= end.getTime()) {
    cursor = addCalendarMonths(cursor, 1);
    months += 1;
  }
  const days = Math.round((end.getTime() - cursor.getTime()) / MS_PER_DAY);
  return { months, days };
}

// Full calendar months elapsed between two dates - exported for the notice
// scheduler, which fires at whole-month thresholds (13/19/26/36 months).
export function fullCalendarMonthsElapsed(start, end) {
  return calendarMonthsAndDays(new Date(start), new Date(end)).months;
}

// Computes interest accrued by `amount` between `start` and `end`, per the
// business's real calculation method:
//  - If the whole span is under one calendar month, charge a single flat
//    month's interest (minimum-holding-period floor) - this only applies at
//    the top of the span, not to a trailing remainder after full years.
//  - Otherwise, walk forward one full calendar year at a time: each full
//    year's interest is simple (principal * rate%), then folds into the
//    principal (uncompounded/uncapped, carried forward unrounded) for the
//    next year, re-resolving the applicable rate tier as the balance grows.
//  - Whatever is left under a year is split into full calendar months
//    (flat monthlyRate% each, regardless of that month's actual length) plus
//    a final day-count remainder (charged at annualRate/365 per day).
// Returns the unrounded total interest plus a chunk-by-chunk breakdown for
// display purposes.
function accrueInterest({ amount, startDate, endDate, tiers, fallbackRate, label }) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const chunks = [];

  if (end.getTime() <= start.getTime()) {
    return { total: 0, finalRate: getApplicableTier(amount, tiers)?.interestRate ?? fallbackRate, chunks };
  }

  const { months: totalMonths } = calendarMonthsAndDays(start, end);

  // Minimum-holding-period floor: whole span under a month still charged a
  // full month's interest.
  if (totalMonths === 0 && addCalendarYears(start, 1).getTime() > end.getTime()) {
    const rate = getApplicableTier(amount, tiers)?.interestRate ?? fallbackRate;
    const interest = (amount * rate) / 100 / 12;
    chunks.push({
      type: 'month',
      segmentLabel: label,
      periodLabel: 'Minimum charge (under 1 month)',
      startDate: isoDate(start),
      endDate: isoDate(end),
      days: Math.round((end.getTime() - start.getTime()) / MS_PER_DAY),
      rate,
      openingBalance: round2(amount),
      interest: round2(interest),
      closingBalance: round2(amount + interest),
      note: `Redeemed/checked under 1 month - flat 1 month charged: ${rate}%/yr / 12 x ${round2(amount).toLocaleString()}.`,
    });
    return { total: interest, finalRate: rate, chunks };
  }

  let balance = amount;
  let cursor = start;
  let rate = getApplicableTier(balance, tiers)?.interestRate ?? fallbackRate;
  let total = 0;
  let yearNum = 1;

  while (addCalendarYears(cursor, 1).getTime() <= end.getTime()) {
    const periodEnd = addCalendarYears(cursor, 1);
    const interest = (balance * rate) / 100;
    chunks.push({
      type: 'year',
      segmentLabel: label,
      periodLabel: `Year ${yearNum}`,
      startDate: isoDate(cursor),
      endDate: isoDate(periodEnd),
      days: Math.round((periodEnd.getTime() - cursor.getTime()) / MS_PER_DAY),
      rate,
      openingBalance: round2(balance),
      interest: round2(interest),
      closingBalance: round2(balance + interest),
      note: `Full year at ${rate}%/yr: ${round2(balance).toLocaleString()} x ${rate}% = ${round2(interest).toLocaleString()}, folded into principal for Year ${yearNum + 1}.`,
    });
    total += interest;
    balance += interest; // unrounded carry-forward
    cursor = periodEnd;
    rate = getApplicableTier(balance, tiers)?.interestRate ?? fallbackRate;
    yearNum += 1;
  }

  const { months, days } = calendarMonthsAndDays(cursor, end);
  if (months > 0 || days > 0) {
    const monthPortion = (balance * rate) / 100 / 12 * months;
    const dayPortion = (balance * rate) / 100 / DAYS_PER_YEAR * days;
    const interest = monthPortion + dayPortion;
    const yearPrefix = yearNum > 1 ? `Year ${yearNum}, ` : '';
    chunks.push({
      type: 'month',
      segmentLabel: label,
      periodLabel: `${yearPrefix}${months}M ${days}D remainder`,
      startDate: isoDate(cursor),
      endDate: isoDate(end),
      days: Math.round((end.getTime() - cursor.getTime()) / MS_PER_DAY),
      rate,
      openingBalance: round2(balance),
      interest: round2(interest),
      closingBalance: round2(balance + interest),
      note: `${months} full month(s) flat at ${rate}%/yr/12, plus ${days} day(s) at ${rate}%/yr/365.`,
    });
    total += interest;
  }

  return { total, finalRate: rate, chunks };
}

// Real-world interest calculation:
//  - Gross interest is computed on the full original principal for the
//    entire loan-date-to-asOfDate span (calendar year/month/day method,
//    annual-only compounding - see accrueInterest above).
//  - For each partial payment, the interest that would have accrued on that
//    paid-off amount from its own payment date to asOfDate is computed the
//    same way, and subtracted from the gross - the borrower isn't charged
//    interest on money already returned.
//  - The final total is rounded UP to the nearest Rs 10 (never down).
//
// principal: original loan amount
// annualRate: rate stored on the loan (used when no tier matches)
// loanDate: Date | string
// partialPayments: [{ amount, paymentDate }]
// tiers: current interest configuration tiers
// asOfDate: Date to calculate up to (defaults to now)
export function calculateCompoundInterest({
  principal,
  annualRate,
  loanDate,
  partialPayments = [],
  tiers = [],
  asOfDate = new Date(),
}) {
  const start = new Date(loanDate);
  const today = new Date(asOfDate);

  const gross = accrueInterest({
    amount: principal,
    startDate: start,
    endDate: today,
    tiers,
    fallbackRate: annualRate,
    label: `Gross interest on ${principal.toLocaleString()} (full term)`,
  });

  const breakdown = [...gross.chunks];
  let offsetTotal = 0;
  let finalRate = gross.finalRate;

  const sortedPayments = [...partialPayments].sort(
    (a, b) => new Date(a.paymentDate) - new Date(b.paymentDate)
  );

  for (const payment of sortedPayments) {
    const offset = accrueInterest({
      amount: payment.amount,
      startDate: new Date(payment.paymentDate),
      endDate: today,
      tiers,
      fallbackRate: annualRate,
      label: `Less: interest on ${payment.amount.toLocaleString()} paid ${isoDate(payment.paymentDate)}`,
    });
    offsetTotal += offset.total;
    breakdown.push(
      ...offset.chunks.map((c) => ({
        ...c,
        interest: round2(-c.interest),
        closingBalance: round2(c.openingBalance - (c.interest ?? 0)),
      }))
    );
  }

  const remainingPrincipal = Math.max(
    0,
    principal - sortedPayments.reduce((sum, p) => sum + p.amount, 0)
  );

  const rawInterest = gross.total - offsetTotal;
  const totalInterest = rawInterest <= 0 ? 0 : ceilTo10(rawInterest);

  return {
    principalRemaining: round2(remainingPrincipal),
    totalInterestAccrued: totalInterest,
    totalAmountDue: round2(remainingPrincipal + totalInterest),
    daysElapsed: Math.floor((today - start) / MS_PER_DAY),
    appliedInterestRate: finalRate,
    breakdown,
  };
}
