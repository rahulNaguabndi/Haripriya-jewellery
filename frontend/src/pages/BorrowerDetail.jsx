import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import BorrowerModal from '../components/Borrowers/BorrowerModal.jsx';
import LoanModal from '../components/Loans/LoanModal.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

const loanFilters = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'closed', label: 'Closed' },
];

function matchesLoanFilter(loan, filter) {
  if (filter === 'active') return ['active', 'partial_payment'].includes(loan.status);
  if (filter === 'closed') return ['closed', 'defaulted'].includes(loan.status);
  return true;
}

export default function BorrowerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [borrower, setBorrower] = useState(null);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showNewLoan, setShowNewLoan] = useState(false);
  const [loanFilter, setLoanFilter] = useState('all');

  async function load() {
    try {
      const res = await api.get(`/borrowers/${id}`);
      setBorrower(res.data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!borrower) return <div>Loading…</div>;

  const columns = [
    { key: 'loan_number', label: 'Loan #' },
    { key: 'item_type', label: 'Item' },
    { key: 'metal_type', label: 'Metal' },
    { key: 'loan_amount', label: 'Amount', render: (r) => formatCurrency(r.loan_amount) },
    { key: 'interest', label: 'Interest Accrued', render: (r) => formatCurrency(r.interest?.totalInterestAccrued) },
    { key: 'loan_date', label: 'Loan Date', render: (r) => formatDate(r.loan_date) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  const filteredLoans = (borrower.loans || []).filter((l) => matchesLoanFilter(l, loanFilter));

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={() => navigate('/borrowers')}>
        ← Back to Borrowers
      </button>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="font-serif" style={{ fontSize: 24, fontWeight: 600 }}>{borrower.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13.5, marginTop: 4 }}>
              {borrower.phone} {borrower.email && `· ${borrower.email}`}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>
              {[borrower.address, borrower.city, borrower.state, borrower.pincode].filter(Boolean).join(', ')}
            </div>
            {borrower.aadhar_or_id && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>ID: {borrower.aadhar_or_id}</div>
            )}
            {borrower.care_of && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>C/O: {borrower.care_of}</div>
            )}
          </div>
          <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>Edit</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="font-serif" style={{ fontSize: 18, fontWeight: 600 }}>Loans</div>
        <button className="btn btn-primary" onClick={() => setShowNewLoan(true)}>+ New Loan</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {loanFilters.map((f) => (
          <button
            key={f.key}
            onClick={() => setLoanFilter(f.key)}
            className="btn"
            style={{
              background: loanFilter === f.key ? 'var(--ink)' : 'var(--surface)',
              color: loanFilter === f.key ? '#fff' : 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={filteredLoans}
        emptyMessage={borrower.loans?.length ? 'No loans match this filter.' : 'No loans yet.'}
        onRowClick={(row) => navigate(`/loans/${row.id}`)}
      />

      {showEdit && (
        <BorrowerModal
          borrower={borrower}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            load();
          }}
        />
      )}
      {showNewLoan && (
        <LoanModal
          borrowerId={borrower.id}
          onClose={() => setShowNewLoan(false)}
          onSaved={() => {
            setShowNewLoan(false);
            load();
          }}
        />
      )}
    </div>
  );
}
