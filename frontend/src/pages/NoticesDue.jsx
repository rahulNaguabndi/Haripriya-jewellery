import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import { TableSkeleton } from '../components/common/Skeleton.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import SendMessageModal from '../components/Messaging/SendMessageModal.jsx';

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
        <div className="font-serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Notices Due</div>
        <TableSkeleton columns={6} rows={8} />
      </div>
    );
  }
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div className="font-serif" style={{ fontSize: 26, fontWeight: 600 }}>Notices Due</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" disabled={dueNow.length === 0} onClick={() => setMessageLoanIds([...new Set(dueNow.map((r) => r.loanId))])}>
            WhatsApp / SMS all due ({new Set(dueNow.map((r) => r.loanId)).size})
          </button>
          <button className="btn btn-primary" disabled={selected.size === 0} onClick={() => setMessageLoanIds([...selected])}>
            Message selected ({selected.size})
          </button>
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Each notice sent adds {formatCurrency(costAmount)} (flat, non-compounding) to the loan's amount owed.
      </div>

      <div className="font-serif" style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>
        Due now ({dueNow.length})
      </div>
      <div style={{ marginBottom: 28 }}>
        <DataTable
          columns={columnsFor(dueNow, 'Send notice')}
          rows={dueNow}
          emptyMessage="No notices due."
          onRowClick={(r) => navigate(`/loans/${r.loanId}`)}
        />
      </div>

      <div className="font-serif" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
        Exempted — partial payments made ({exempted.length})
      </div>
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
