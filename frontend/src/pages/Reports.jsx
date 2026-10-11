import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { TableSkeleton } from '../components/common/Skeleton.jsx';
import ReportsOverview from '../components/Reports/ReportsOverview.jsx';
import Demographics from '../components/Reports/Demographics.jsx';
import RiskForecast from '../components/Reports/RiskForecast.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import Segmented from '../components/common/Segmented.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'risk', label: 'Risk & forecast' },
  { key: 'demographics', label: 'Demographics' },
  { key: 'outstanding-interest', label: 'Outstanding interest' },
  { key: 'overdue', label: 'Due date passed' },
  { key: 'closed', label: 'Closed loans' },
  { key: 'borrower-summary', label: 'Borrower summary' },
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
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (tab === 'overview' || tab === 'demographics' || tab === 'risk') return;
    setLoading(true);
    setError('');
    api
      .get(`/reports/${tab}`)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tab]);

  const columns = tab === 'borrower-summary' ? borrowerColumns : loanColumns;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Trends across the book, where business comes from, and what's outstanding." />

      <div style={{ overflowX: 'auto', marginBottom: 20, paddingBottom: 2 }}>
        <Segmented label="Report" value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t.key, label: t.label }))} style={{ flexWrap: 'nowrap' }} />
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      {tab === 'overview' ? (
        <ReportsOverview />
      ) : tab === 'risk' ? (
        <RiskForecast />
      ) : tab === 'demographics' ? (
        <Demographics />
      ) : loading ? (
        <TableSkeleton columns={columns.length} rows={8} />
      ) : (
        <DataTable columns={columns} rows={data} emptyMessage="No records found." />
      )}
    </div>
  );
}
