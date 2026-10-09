// Normalizes an Indian mobile number to E.164 (+91XXXXXXXXXX). Accepts
// "98765 43210", "098765-43210", "+91 98765 43210", "919876543210".
// Returns null when it can't be a valid number, so callers can skip it.
export function toE164India(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `+91${digits}`;
}
