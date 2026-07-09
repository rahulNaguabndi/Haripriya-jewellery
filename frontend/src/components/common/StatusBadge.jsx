const labels = {
  active: 'Active',
  closed: 'Closed',
  defaulted: 'Defaulted',
  partial_payment: 'Partial Payment',
};

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{labels[status] || status}</span>;
}
