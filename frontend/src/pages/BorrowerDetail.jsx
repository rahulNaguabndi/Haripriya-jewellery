import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import BorrowerModal from '../components/Borrowers/BorrowerModal.jsx';
import LoanModal from '../components/Loans/LoanModal.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import PageHeader from '../components/common/PageHeader.jsx';
import Segmented from '../components/common/Segmented.jsx';
import { ListSkeleton } from '../components/common/Skeleton.jsx';
import ReliabilityScore from '../components/Borrowers/ReliabilityScore.jsx';
import ActivityTimeline from '../components/common/ActivityTimeline.jsx';

const OPEN = ['active', 'partial_payment'];

// Aadhaar shown masked to last 4 on screen as well as on paper.
function maskId(id) {
  const digits = String(id || '').split(' ').join('');
  return /^[0-9]{12}$/.test(digits) ? `XXXX XXXX ${digits.slice(-4)}` : id;
}

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
  const [repledgeFrom, setRepledgeFrom] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function load() {
    try {
      const res = await api.get(`/borrowers/${id}`);
      setBorrower(res.data);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!borrower) return <ListSkeleton rows={6} />;

  // A closed loan that was rolled over lives on as the newer loan - only
  // genuinely redeemed loans can be re-pledged.
  const rolledOverIds = new Set((borrower.loans || []).map((l) => l.previous_loan_id).filter(Boolean));

  const columns = [
    { key: 'loan_number', label: 'Loan #' },
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
    { key: 'interest', label: 'Interest Accrued', render: (r) => formatCurrency(r.interest?.totalInterestAccrued) },
    { key: 'loan_date', label: 'Loan Date', render: (r) => formatDate(r.loan_date) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      label: '',
      render: (r) =>
        r.status === 'closed' && !rolledOverIds.has(r.id) ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setRepledgeFrom({ ...r, borrowers: { name: borrower.name } });
            }}
          >
            Re-pledge
          </button>
        ) : null,
    },
  ];

  const filteredLoans = (borrower.loans || []).filter((l) => matchesLoanFilter(l, loanFilter));
  const openLoans = (borrower.loans || []).filter((l) => OPEN.includes(l.status));
  const outstanding = openLoans.reduce((n, l) => n + (l.interest?.principalRemaining ?? Number(l.loan_amount) ?? 0), 0);
  const accrued = openLoans.reduce((n, l) => n + (l.interest?.totalInterestAccrued ?? 0), 0);
  const place = [borrower.village, borrower.mandal, borrower.district].filter(Boolean).join(', ') || borrower.city;

  return (
    <div>
      <PageHeader
        back={{ to: '/borrowers', label: 'Borrowers' }}
        title={borrower.name}
        subtitle={[borrower.care_of, place].filter(Boolean).join(' · ')}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>Edit details</button>
            <button className="btn btn-primary" onClick={() => setShowNewLoan(true)}>+ New loan</button>
          </>
        }
      />

      <div className="card" style={{ padding: '20px 24px', marginBottom: 24 }}>
        <div className="facts">
          <div>
            <div className="fact-label">Open loans</div>
            <div className="fact-value is-lg">{openLoans.length}<span style={{ fontSize: 15, color: 'var(--text-muted)' }}> / {borrower.loans?.length || 0}</span></div>
          </div>
          <div>
            <div className="fact-label">Principal outstanding</div>
            <div className="fact-value is-lg">{formatCurrency(outstanding)}</div>
          </div>
          <div>
            <div className="fact-label">Interest accrued</div>
            <div className="fact-value is-lg">{formatCurrency(accrued)}</div>
          </div>
          <div>
            <div className="fact-label">Phone</div>
            <div className="fact-value">{borrower.phone || '—'}</div>
            {borrower.email && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{borrower.email}</div>}
          </div>
          <div>
            <div className="fact-label">ID proof</div>
            <div className="fact-value">{borrower.aadhar_or_id ? maskId(borrower.aadhar_or_id) : '—'}</div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div className="fact-label">Address</div>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>
              {[borrower.address, borrower.village, borrower.mandal, borrower.city, borrower.district, borrower.state, borrower.pincode].filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 className="section-title" style={{ margin: 0 }}>Loans</h2>
        <Segmented label="Filter loans" value={loanFilter} onChange={setLoanFilter} options={loanFilters.map((f) => ({ value: f.key, label: f.label }))} />
      </div>

      <DataTable
        columns={columns}
        rows={filteredLoans}
        emptyMessage={borrower.loans?.length ? 'No loans match this filter' : 'No loans yet'}
        emptyHint={borrower.loans?.length ? 'Choose All to see every loan.' : 'Create the first loan for this borrower with “New loan”.'}
        onRowClick={(row) => navigate(`/loans/${row.id}`)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 20, marginTop: 24 }}>
        <ReliabilityScore borrowerId={borrower.id} refreshKey={refreshKey} />
        <ActivityTimeline borrowerId={borrower.id} refreshKey={refreshKey} />
      </div>
      {repledgeFrom && (
        <LoanModal
          repledgeFrom={repledgeFrom}
          onClose={() => setRepledgeFrom(null)}
          onSaved={(saved) => {
            setRepledgeFrom(null);
            navigate(`/loans/${saved.id}`);
          }}
        />
      )}

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
