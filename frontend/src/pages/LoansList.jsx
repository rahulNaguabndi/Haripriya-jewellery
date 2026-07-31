import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import { TableSkeleton } from '../components/common/Skeleton.jsx';
import FilterBar from '../components/common/FilterBar.jsx';
import Pagination from '../components/common/Pagination.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import CardStatusBadge from '../components/common/CardStatusBadge.jsx';
import LoanModal from '../components/Loans/LoanModal.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const PAGE_SIZE = 20;

const filterFields = [
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'partial_payment', label: 'Partial Payment' },
      { value: 'closed', label: 'Closed' },
      { value: 'defaulted', label: 'Defaulted' },
    ],
  },
  { name: 'metalType', label: 'Metal Type', placeholder: 'Gold' },
  { name: 'itemType', label: 'Item Type', placeholder: 'Ring' },
  { name: 'minAmount', label: 'Min Amount', type: 'number', width: 120 },
  { name: 'maxAmount', label: 'Max Amount', type: 'number', width: 120 },
];

export default function LoansList() {
  const navigate = useNavigate();
  const [loans, setLoans] = useState([]);
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
      params.page = page;
      params.limit = PAGE_SIZE;
      const res = await api.get('/loans', { params });
      setLoans(res.data.data);
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
    { key: 'loan_number', label: 'Loan #' },
    { key: 'borrower', label: 'Borrower', render: (r) => r.borrowers?.name || '—' },
    {
      key: 'item_type',
      label: 'Items',
      render: (r) => {
        const items = r.loan_items || [];
        if (items.length === 0) return '—';
        if (items.length === 1) return items[0].item_type;
        return `${items[0].item_type} +${items.length - 1} more`;
      },
    },
    {
      key: 'metal_type',
      label: 'Metal',
      render: (r) => [...new Set((r.loan_items || []).map((i) => i.metal_type))].join(', ') || '—',
    },
    { key: 'loan_amount', label: 'Amount', render: (r) => formatCurrency(r.loan_amount) },
    { key: 'loan_date', label: 'Loan Date', render: (r) => formatDate(r.loan_date) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'card', label: 'Card', render: (r) => <CardStatusBadge cardGiven={r.card_given} cardReturned={r.card_returned} /> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="font-serif" style={{ fontSize: 26, fontWeight: 600 }}>Loans</div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Loan</button>
      </div>

      <FilterBar
        fields={filterFields}
        values={filters}
        onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
        onReset={() => setFilters({})}
      />

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      {loading ? <TableSkeleton columns={columns.length} rows={PAGE_SIZE} /> : (
        <>
          <DataTable columns={columns} rows={loans} onRowClick={(row) => navigate(`/loans/${row.id}`)} />
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      {showModal && (
        <LoanModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}
