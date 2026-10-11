import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import { TableSkeleton } from '../components/common/Skeleton.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import SendMessageModal from '../components/Messaging/SendMessageModal.jsx';
import PageHeader from '../components/common/PageHeader.jsx';

export default function NoticesDue() {
  const navigate = useNavigate();
  const [dueNow, setDueNow] = useState([]);
  const [exempted, setExempted] = useState([]);
  const [costAmount, setCostAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingKey, setSendingKey] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [messageLoanIds, setMessageLoanIds] = useState(null);

  function toggleSelected(loanId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(loanId) ? next.delete(loanId) : next.add(loanId);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/notices/due');
      setDueNow(res.data.dueNow || []);
      setExempted(res.data.exempted || []);
      setCostAmount(res.data.costAmount || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function sendNotice(row) {
    const key = `${row.loanId}:${row.thresholdMonth}`;
    setSendingKey(key);
    try {
      await api.post('/notices', { loanId: row.loanId, thresholdMonth: row.thresholdMonth });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingKey(null);
    }
  }

  function columnsFor(rows, buttonLabel) {
    return [
      {
        key: 'select',
        label: '',
        render: (r) => (
          <input
            type="checkbox"
            aria-label={`Select ${r.loanNumber} for messaging`}
            checked={selected.has(r.loanId)}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleSelected(r.loanId)}
            style={{ width: 18, height: 18 }}
          />
        ),
      },
      { key: 'loan_number', label: 'Loan #', render: (r) => r.loanNumber },
      { key: 'borrower', label: 'Borrower', render: (r) => r.borrowerName || '—' },
      { key: 'loan_date', label: 'Loan Date', render: (r) => formatDate(r.loanDate) },
      { key: 'months', label: 'Months Elapsed', render: (r) => r.monthsElapsed },
      { key: 'threshold', label: 'Threshold', render: (r) => `${r.thresholdMonth} mo` },
      {
        key: 'action',
        label: '',
        render: (r) => (
          <button
            className="btn btn-primary"
            disabled={sendingKey === `${r.loanId}:${r.thresholdMonth}`}
            onClick={(e) => {
              e.stopPropagation();
              sendNotice(r);
            }}
          >
            {sendingKey === `${r.loanId}:${r.thresholdMonth}` ? 'Sending…' : buttonLabel}
          </button>
        ),
      },
    ];
  }

  if (loading) {
    return (
      <div>
        <PageHeader title="Notices due" subtitle="Loans that have crossed a notice threshold." />
        <TableSkeleton columns={6} rows={8} />
      </div>
    );
  }
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <PageHeader
        title="Notices due"
        subtitle={`Each notice sent adds ${formatCurrency(costAmount)} (flat, not compounded) to the amount owed.`}
        actions={
          <>
            <button className="btn btn-secondary" disabled={dueNow.length === 0} onClick={() => setMessageLoanIds([...new Set(dueNow.map((r) => r.loanId))])}>
              Message all due ({new Set(dueNow.map((r) => r.loanId)).size})
            </button>
            <button className="btn btn-primary" disabled={selected.size === 0} onClick={() => setMessageLoanIds([...selected])}>
              Message selected ({selected.size})
            </button>
          </>
        }
      />

      <h2 className="section-title">Due now <span className="tabular" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {dueNow.length}</span></h2>
      <div style={{ marginBottom: 28 }}>
        <DataTable
          columns={columnsFor(dueNow, 'Send notice')}
          rows={dueNow}
          emptyMessage="No notices due"
          emptyHint="Every open loan is within its notice schedule."
          onRowClick={(r) => navigate(`/loans/${r.loanId}`)}
        />
      </div>

      <h2 className="section-title" style={{ marginTop: 28, marginBottom: 4 }}>
        Exempted · partial payments made <span className="tabular" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>· {exempted.length}</span>
      </h2>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        These loans have received partial payments, so the notice is normally suppressed. If a loan is still
        under-covered despite the payments, send it anyway.
      </div>
      <DataTable
        columns={columnsFor(exempted, 'Send anyway')}
        rows={exempted}
        emptyMessage="No exempted loans pending."
        onRowClick={(r) => navigate(`/loans/${r.loanId}`)}
      />
      {messageLoanIds && <SendMessageModal loanIds={messageLoanIds} onClose={() => setMessageLoanIds(null)} />}
    </div>
  );
}
