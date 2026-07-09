import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import FilterBar from '../components/common/FilterBar.jsx';
import Pagination from '../components/common/Pagination.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const PAGE_SIZE = 20;

const filterFields = [
  { name: 'dateFrom', label: 'From', type: 'date' },
  { name: 'dateTo', label: 'To', type: 'date' },
];

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
      params.page = page;
      params.limit = PAGE_SIZE;
      const res = await api.get('/payments', { params });
      setPayments(res.data.data);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const columns = [
    { key: 'payment_date', label: 'Date', render: (r) => formatDate(r.payment_date) },
    { key: 'borrower', label: 'Borrower', render: (r) => r.borrowers?.name || '—' },
    { key: 'loan', label: 'Loan #', render: (r) => r.loans?.loan_number || '—' },
    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
    { key: 'payment_type', label: 'Type' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div>
      <div className="font-serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Payments</div>

      <FilterBar
        fields={filterFields}
        values={filters}
        onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
        onReset={() => setFilters({})}
      />

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      {loading ? <div>Loading…</div> : (
        <>
          <DataTable columns={columns} rows={payments} emptyMessage="No payments found." />
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
