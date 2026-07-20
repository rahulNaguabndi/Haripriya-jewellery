// Standard karat -> purity% conversions for gold (14k/18k/22k/24k).
const GOLD_KARAT_PURITY = { 24: 100, 22: 91.6, 18: 75, 14: 58.3 };

// Resolves a loan's purity into a 0-100 percentage.
//  - Gold: purity is a karat value ("22k" from the current form, or a bare
//    "22" from data entered before the karat dropdown existed) looked up
//    in GOLD_KARAT_PURITY.
//  - Silver: purity is a raw estimated melt-yield percentage typed by staff
//    (business judgment, not a fixed table) - parsed directly as a number.
// Returns null if unparseable.
export function purityPercent(metalType, purity) {
  if (!purity) return null;
  if (metalType === 'Gold') {
    const karat = Number(String(purity).trim().toLowerCase().replace('k', ''));
    return GOLD_KARAT_PURITY[karat] ?? null;
  }
  if (metalType === 'Silver') {
    const pct = Number(String(purity).replace('%', '').trim());
    return Number.isFinite(pct) ? pct : null;
  }
  return null;
}

// Current melt value of the pledged item at a given rate (Rs/gram).
// Accepts a loan row straight from Supabase (snake_case columns).
export function meltValue({ weight, metal_type: metalType, purity }, ratePerGram) {
  const pct = purityPercent(metalType, purity);
  if (pct == null || !weight || !ratePerGram) return null;
  return weight * (pct / 100) * ratePerGram;
}

// meltValue / amountOwed. Null if either input is unavailable; a loan with
// nothing owed is treated as maximally safe (no ratio needed).
export function coverageRatio(meltValueAmount, amountOwed) {
  if (meltValueAmount == null) return null;
  if (!amountOwed || amountOwed <= 0) return null;
  return meltValueAmount / amountOwed;
}

export function coverageStatus(ratio, redThreshold, amberThreshold) {
  if (ratio == null) return 'unknown';
  if (ratio <= redThreshold) return 'red';
  if (ratio < amberThreshold) return 'amber';
  return 'green';
}
