import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

// System-calculated interest for settling `loanId` on `date` (YYYY-MM-DD).
// Re-fetches when the date changes; `fallback` (today's figure) shows
// meanwhile.
export function useInterestAsOf(loanId, date, fallback) {
  const [value, setValue] = useState(fallback ?? null);

  useEffect(() => {
    if (!loanId || !date) return undefined;
    let alive = true;
    api
      .get(`/loans/${loanId}/interest-summary`, { params: { asOf: date } })
      .then((res) => alive && setValue(res.data.calculatedInterest))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [loanId, date]);

  return value;
}
