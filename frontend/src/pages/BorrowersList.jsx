import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import Pagination from '../components/common/Pagination.jsx';
import FilterBar from '../components/common/FilterBar.jsx';
import BorrowerModal from '../components/Borrowers/BorrowerModal.jsx';

const PAGE_SIZE = 20;

const advancedFilterFields = [
  { name: 'city', label: 'Village / City', placeholder: 'Village or city' },
  { name: 'minLoanAmount', label: 'Min Loan Amount', type: 'number', width: 140 },
  { name: 'maxLoanAmount', label: 'Max Loan Amount', type: 'number', width: 140 },
  { name: 'loanDateFrom', label: 'Loan Date From', type: 'date', width: 160 },
  { name: 'loanDateTo', label: 'Loan Date To', type: 'date', width: 160 },
];

export default function BorrowersList() {
  const navigate = useNavigate();
  const [borrowers, setBorrowers] = useState([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v != null));
      const endpoint = search ? '/borrowers/search' : '/borrowers';
      const params = { ...activeFilters, page, limit: PAGE_SIZE };
      if (search) params.q = search;
      const res = await api.get(endpoint, { params });
      setBorrowers(res.data.data);
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = setTimeout(load, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filters, page]);

  useEffect(() => {
    setPage(1);
  }, [search, filters]);

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'care_of', label: 'C/O' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'city', label: 'City' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div className="font-serif" style={{ fontSize: 26, fontWeight: 600 }}>Borrowers</div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Borrower</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <input
          className="w-full sm:w-auto sm:max-w-[360px]"
          placeholder="Search by name, phone, email, village, C/O, ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Hide Advanced Filters' : 'Advanced Filters'}
        </button>
      </div>

      {showFilters && (
        <FilterBar
          fields={advancedFilterFields}
          values={filters}
          onChange={(name, value) => setFilters((f) => ({ ...f, [name]: value }))}
          onReset={() => setFilters({})}
        />
      )}

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      {loading ? (
        <div>Loading…</div>
      ) : (
        <>
          <DataTable columns={columns} rows={borrowers} onRowClick={(row) => navigate(`/borrowers/${row.id}`)} />
          <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
        </>
      )}

      {showModal && (
        <BorrowerModal
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
