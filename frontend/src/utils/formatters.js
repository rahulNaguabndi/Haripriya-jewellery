export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
