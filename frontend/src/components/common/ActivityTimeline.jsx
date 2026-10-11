import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api.js';
import { ListSkeleton } from './Skeleton.jsx';

// Coloured dot per kind of action so money events stand out in a list.
export const ACTION_TONES = {
  payment: 'var(--success)',
  loan: 'var(--gold-deep)',
  borrower: 'var(--text-muted)',
  config: 'var(--warning)',
  rate: 'var(--warning)',
  staff: 'var(--warning)',
  notice: 'var(--danger)',
  photo: 'var(--text-muted)',
  item: 'var(--text-muted)',
};

export function actionTone(action) {
  if (action === 'loan.interest_waived' || action === 'payment.delete') return 'var(--danger)';
  return ACTION_TONES[String(action).split('.')[0]] || 'var(--border)';
}

export function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ActivityRow({ row, showLinks }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: 999, background: actionTone(row.action), marginTop: 6, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{row.summary}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span>{formatWhen(row.created_at)}</span>
          <span>·</span>
          <span>{row.actor_name || row.actor_email || 'system'}</span>
          {showLinks && row.loan_id && row.loans?.loan_number && (
            <>
              <span>·</span>
              <Link to={`/loans/${row.loan_id}`} className="num" style={{ color: 'var(--gold-deep)' }}>{row.loans.loan_number}</Link>
            </>
          )}
          {showLinks && row.borrower_id && row.borrowers?.name && (
            <>
              <span>·</span>
              <Link to={`/borrowers/${row.borrower_id}`} style={{ color: 'var(--gold-deep)' }}>{row.borrowers.name}</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// "History" card for one loan or borrower. refreshKey: bump to reload after
// an action on the page.
export default function ActivityTimeline({ loanId, borrowerId, refreshKey, title = 'History' }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api
      .get('/activity', { params: { loanId, borrowerId, limit: 100 } })
      .then((res) => setRows(res.data.data))
      .catch((err) => {
        setRows([]);
        setError(err.message);
      });
  }, [loanId, borrowerId, refreshKey]);

  const visible = expanded ? rows : rows?.slice(0, 6);

  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>{title}</h2>
      {rows === null && <ListSkeleton rows={4} />}
      {error && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>History isn’t available yet ({error}).</div>}
      {rows && !error && rows.length === 0 && (
        <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>No recorded changes yet. Actions from now on are logged here.</div>
      )}
      {visible?.map((row) => <ActivityRow key={row.id} row={row} />)}
      {rows?.length > 6 && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
