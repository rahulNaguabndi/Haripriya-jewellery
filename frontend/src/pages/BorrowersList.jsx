import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import Pagination from '../components/common/Pagination.jsx';
import BorrowerModal from '../components/Borrowers/BorrowerModal.jsx';

const PAGE_SIZE = 20;

export default function BorrowersList() {
  const navigate = useNavigate();
  const [borrowers, setBorrowers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const endpoint = search ? '/borrowers/search' : '/borrowers';
      const params = search ? { name: search, page, limit: PAGE_SIZE } : { page, limit: PAGE_SIZE };
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
  }, [search, page]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns = [
    { key: 'name', label: 'Name' },
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

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

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
