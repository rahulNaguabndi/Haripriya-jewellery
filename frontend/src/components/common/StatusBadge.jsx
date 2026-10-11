export const STATUS_LABELS = {
  active: 'Active',
  closed: 'Closed',
  defaulted: 'Defaulted',
  partial_payment: 'Partial payment',
};

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>;
}
