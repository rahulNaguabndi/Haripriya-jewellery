import { ApiError } from '../middleware/errorHandler.js';

export function requireFields(body, fields) {
  const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
  if (missing.length) {
    throw new ApiError(400, `Missing required field(s): ${missing.join(', ')}`);
  }
}

// LOAN-YYYYMMDD-XXX, unique per day via a random 3-digit suffix retry loop
// is handled by the caller (loanController) using a DB uniqueness check.
export function generateLoanNumber(sequence) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `LOAN-${y}${m}${d}-${seq}`;
}
