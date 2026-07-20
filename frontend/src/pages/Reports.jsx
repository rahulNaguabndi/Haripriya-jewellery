import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const tabs = [
  { key: 'outstanding-interest', label: 'Outstanding Interest' },
  { key: 'overdue', label: 'Due Date Passed (informational)' },
  { key: 'closed', label: 'Closed Loans' },
  { key: 'borrower-summary', label: 'Borrower Summary' },
];

const loanColumns = [
  { key: 'loan_number', label: 'Loan #' },
  { key: 'borrower', label: 'Borrower', render: (r) => r.borrowers?.name || '—' },
  { key: 'loan_amount', label: 'Principal', render: (r) => formatCurrency(r.loan_amount) },
  { key: 'principalRemaining', label: 'Principal Remaining', render: (r) => formatCurrency(r.interest?.principalRemaining) },
  { key: 'interest', label: 'Interest Accrued', render: (r) => formatCurrency(r.interest?.totalInterestAccrued) },
  { key: 'totalDue', label: 'Total Due', render: (r) => formatCurrency(r.interest?.totalAmountDue) },
  { key: 'due_date', label: 'Due Date', render: (r) => formatDate(r.due_date) },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
];

const borrowerColumns = [
  { key: 'borrowerName', label: 'Borrower' },
  { key: 'totalLoans', label: 'Total Loans' },
  { key: 'activeLoans', label: 'Active Loans' },
  { key: 'totalLoanAmount', label: 'Total Loan Amount', render: (r) => formatCurrency(r.totalLoanAmount) },
  { key: 'totalOutstanding', label: 'Total Outstanding', render: (r) => formatCurrency(r.totalOutstanding) },
];

export default function Reports() {
  const [tab, setTab] = useState('outstanding-interest');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get(`/reports/${tab}`)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tab]);

  const columns = tab === 'borrower-summary' ? borrowerColumns : loanColumns;

  return (
    <div>
      <div className="font-serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Reports</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="btn"
            style={{
              background: tab === t.key ? 'var(--ink)' : 'var(--surface)',
              color: tab === t.key ? '#fff' : 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      {loading ? <div>Loading…</div> : <DataTable columns={columns} rows={data} emptyMessage="No records found." />}
    </div>
  );
}
