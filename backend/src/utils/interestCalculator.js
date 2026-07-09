const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365;

const round2 = (n) => Math.round(n * 100) / 100;
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

// Splits one continuous-rate segment [segStart, segEnd) into a human-readable
// breakdown: full 365-day "Year N" chunks (each year's interest is added to
// the balance before the next year's interest is computed on it — which is
// mathematically identical to raising (1 + rate/100) to an integer power),
// followed by ~30-day "Month N" chunks for whatever remainder is left under
// a year. Every chunk's interest is opening balance * ((1+rate/100)^(days/365) - 1),
// so the sum of all chunks always equals openingPrincipal * (1+rate/100)^(totalDays/365) —
// identical to the plain compound-interest formula, just decomposed into steps.
function splitSegmentIntoChunks({ segStart, segEnd, openingBalance, rate, segmentLabel }) {
  const chunks = [];
  const totalDays = Math.max(0, (segEnd - segStart) / MS_PER_DAY);
  if (totalDays <= 0 || openingBalance <= 0) return chunks;

  let cursorDate = segStart;
  let cursorBalance = openingBalance;
  let remainingDays = totalDays;
  let yearNum = 1;

  while (remainingDays > DAYS_PER_YEAR) {
    const interest = cursorBalance * (rate / 100);
    const periodEnd = new Date(cursorDate.getTime() + DAYS_PER_YEAR * MS_PER_DAY);
    const closingBalance = cursorBalance + interest;
    chunks.push({
      type: 'year',
      segmentLabel,
      periodLabel: `Year ${yearNum}`,
      startDate: isoDate(cursorDate),
      endDate: isoDate(periodEnd),
      days: DAYS_PER_YEAR,
      rate,
      openingBalance: round2(cursorBalance),
      interest: round2(interest),
      closingBalance: round2(closingBalance),
      note:
        `Full year at ${rate}%/yr: ${round2(cursorBalance).toLocaleString()} × ${rate}% = ` +
        `${round2(interest).toLocaleString()} interest, added to principal for Year ${yearNum + 1}.`,
    });
    cursorBalance = closingBalance;
    cursorDate = periodEnd;
    remainingDays -= DAYS_PER_YEAR;
    yearNum += 1;
  }

  const yearPrefix = yearNum > 1 ? `Year ${yearNum}, ` : '';
  let monthNum = 1;
  while (remainingDays > 0) {
    const chunkDays = Math.min(30, remainingDays);
    const chunkYears = chunkDays / DAYS_PER_YEAR;
    const closingBalance = cursorBalance * Math.pow(1 + rate / 100, chunkYears);
    const interest = closingBalance - cursorBalance;
    const periodEnd = new Date(cursorDate.getTime() + chunkDays * MS_PER_DAY);
    chunks.push({
      type: 'month',
      segmentLabel,
      periodLabel: `${yearPrefix}Month ${monthNum}`,
      startDate: isoDate(cursorDate),
      endDate: isoDate(periodEnd),
      days: Math.round(chunkDays * 100) / 100,
      rate,
      openingBalance: round2(cursorBalance),
      interest: round2(interest),
      closingBalance: round2(closingBalance),
      note: `${Math.round(chunkDays)} day(s) at ${rate}%/yr, compounded on the current balance.`,
    });
    cursorBalance = closingBalance;
    cursorDate = periodEnd;
    remainingDays -= chunkDays;
    monthNum += 1;
  }

  return chunks;
}

// Compound-interest calculation, re-evaluating the applicable rate tier
// after every partial payment reduces the outstanding principal.
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

  let remainingPrincipal = principal;
  let totalInterest = 0;
  const breakdown = [];

  const sortedPayments = [...partialPayments].sort(
    (a, b) => new Date(a.paymentDate) - new Date(b.paymentDate)
  );

  let currentDate = start;
  let currentRate = getApplicableTier(remainingPrincipal, tiers)?.interestRate ?? annualRate;

  for (const payment of sortedPayments) {
    const paymentDate = new Date(payment.paymentDate);
    const yearsInPeriod = Math.max(0, (paymentDate - currentDate) / MS_PER_DAY) / DAYS_PER_YEAR;

    const amount = remainingPrincipal * Math.pow(1 + currentRate / 100, yearsInPeriod);
    totalInterest += amount - remainingPrincipal;
    breakdown.push(
      ...splitSegmentIntoChunks({
        segStart: currentDate,
        segEnd: paymentDate,
        openingBalance: remainingPrincipal,
        rate: currentRate,
        segmentLabel: `Until payment of ${payment.amount} on ${isoDate(paymentDate)}`,
      })
    );

    remainingPrincipal = Math.max(0, remainingPrincipal - payment.amount);
    currentDate = paymentDate;
    currentRate = getApplicableTier(remainingPrincipal, tiers)?.interestRate ?? annualRate;
  }

  const finalYears = Math.max(0, (today - currentDate) / MS_PER_DAY) / DAYS_PER_YEAR;
  const finalAmount = remainingPrincipal * Math.pow(1 + currentRate / 100, finalYears);
  totalInterest += finalAmount - remainingPrincipal;
  breakdown.push(
    ...splitSegmentIntoChunks({
      segStart: currentDate,
      segEnd: today,
      openingBalance: remainingPrincipal,
      rate: currentRate,
      segmentLabel: sortedPayments.length ? 'Since last payment' : 'Since loan start',
    })
  );

  return {
    principalRemaining: round2(remainingPrincipal),
    totalInterestAccrued: round2(totalInterest),
    totalAmountDue: round2(remainingPrincipal + totalInterest),
    daysElapsed: Math.floor((today - start) / MS_PER_DAY),
    appliedInterestRate: currentRate,
    breakdown,
  };
}
