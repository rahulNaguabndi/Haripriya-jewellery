import { Link } from 'react-router-dom';
import Modal from '../common/Modal.jsx';
import DataTable from '../common/DataTable.jsx';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

const RISK_HINT = {
  critical: 'Under-covered and the customer is slow or risky - call first',
  high: 'Under-covered, or close to it with a risky customer',
  medium: 'Thin cover - keep an eye on it',
  low: 'Thin cover, but a reliable customer',
};

const pct = (ratio) => (ratio == null ? '—' : `${Math.round(ratio * 100)}%`);

export function RateMove({ rate }) {
  if (!rate.current) return null;
  const change = rate.changePct;
  return (
    <span>
      {rate.metal} <strong className="tabular">{formatCurrency(rate.current.rate)}/g</strong>
      {change != null && change !== 0 && (
        <span className={`rate-move ${change < 0 ? 'down' : 'up'}`}>
          {' '}
          {change < 0 ? '▼' : '▲'} {Math.abs(change)}%
        </span>
      )}
      {rate.previous && (
        <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>
          {' '}
          from {formatCurrency(rate.previous.rate)} ({formatDate(rate.previous.date)})
        </span>
      )}
    </span>
  );
}

// "What did today's rate move do to my book?" - opened automatically on the
// dashboard the first time a new rate is seen, and from the risk tile.
export default function RateRiskModal({ data, branchName, onClose }) {
  const s = data.summary;
  const columns = [
    { key: 'risk', label: 'Risk', render: (r) => <span className={`risk-chip risk-${r.risk}`} title={RISK_HINT[r.risk]}>{r.risk}</span> },
    {
      key: 'loanNumber',
      label: 'Loan',
      render: (r) => (
        <Link to={`/loans/${r.loanId}`} className="num" style={{ color: 'var(--gold-deep)', fontWeight: 600 }} onClick={onClose}>
          {r.loanNumber}
        </Link>
      ),
    },
    {
      key: 'borrowerName',
      label: 'Borrower',
      render: (r) => (
        <span>
          {r.borrowerName}
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
            score {r.borrowerScore ?? '—'} · {r.borrowerBand}
            {r.borrowerPhone ? ` · ${r.borrowerPhone}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'amountOwed', label: 'Owed', render: (r) => <span className="tabular">{formatCurrency(r.amountOwed)}</span> },
    {
      key: 'ratioNow',
      label: 'Cover',
      render: (r) => (
        <span className="tabular">
          <strong>{pct(r.ratioNow)}</strong>
          {r.ratioBefore != null && r.ratioBefore !== r.ratioNow && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> was {pct(r.ratioBefore)}</span>}
        </span>
      ),
    },
    {
      key: 'shortfall',
      label: 'Shortfall / headroom',
      render: (r) =>
        r.shortfall > 0 ? (
          <span className="tabular" style={{ color: 'var(--danger)', fontWeight: 600 }}>{formatCurrency(r.shortfall)} short</span>
        ) : (
          <span className="tabular" style={{ color: 'var(--text-muted)' }}>red after a {r.dropToRed}% fall</span>
        ),
    },
  ];

  const chip = (label, value, tone) => (
    <div style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', minWidth: 110 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</div>
      <div className="font-serif tabular" style={{ fontSize: 22, fontWeight: 600, color: tone }}>{value}</div>
    </div>
  );

  return (
    <Modal title={`Rate move · risk check${branchName ? ` · ${branchName}` : ''}`} onClose={onClose} width={920}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, marginBottom: 14 }}>
        {data.rates.map((r) => (
          <RateMove key={r.metal} rate={r} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {chip('Critical', s.byRisk.critical, s.byRisk.critical ? 'var(--danger)' : undefined)}
        {chip('High', s.byRisk.high, s.byRisk.high ? 'var(--danger)' : undefined)}
        {chip('Watch', s.byRisk.medium + s.byRisk.low, s.byRisk.medium ? 'var(--warning)' : undefined)}
        {chip('Newly under', s.newlyRed, s.newlyRed ? 'var(--danger)' : undefined)}
        {chip('Shortfall', formatCurrency(s.shortfall), s.shortfall ? 'var(--danger)' : undefined)}
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12 }}>
        {s.red} of {s.openLoans} open loans are under-covered at the latest rate and {s.amber} are close
        {s.worsened ? ` · ${s.worsened} got worse with this move` : ''}. Risk weighs the cover (melt value ÷ amount owed) against the customer&apos;s reliability score.
      </div>

      <DataTable
        columns={columns}
        rows={data.loans.map((r) => ({ ...r, id: r.loanId }))}
        emptyMessage="No loans need attention at this rate"
        emptyHint="Every open loan is comfortably covered."
      />
      {s.flagged > data.loans.length && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
          Showing the top {data.loans.length} of {s.flagged}.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
        <Link to="/coverage" className="btn btn-secondary" onClick={onClose}>Open coverage review</Link>
        <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
