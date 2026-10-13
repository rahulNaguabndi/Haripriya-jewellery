import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api.js';
import { useConfirm } from '../common/ConfirmDialog.jsx';
import { Skeleton } from '../common/Skeleton.jsx';
import { formatCurrency } from '../../utils/formatters.js';
import { useMyRole, isAdminRole } from '../../hooks/useMyRole.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MODE_LABELS = { upi: 'UPI', cheque: 'Cheque', transfer: 'Bank transfer' };

function Line({ label, value, strong, muted, sign }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', fontSize: 13.5, color: muted ? 'var(--text-muted)' : undefined, fontWeight: strong ? 600 : 400 }}>
      <span>{label}</span>
      <span className="tabular">{sign}{formatCurrency(value)}</span>
    </div>
  );
}

function VarianceTag({ variance }) {
  const v = round2(variance);
  if (v === 0) return <span className="badge badge-active">Balanced</span>;
  return <span className="badge badge-defaulted">{v > 0 ? 'Over' : 'Short'} by {formatCurrency(Math.abs(v))}</span>;
}

// A closed day: what was expected, what was counted, who closed it.
function ClosedSummary({ status, canReopen, onReopen }) {
  const c = status.close;
  const denoms = Object.entries(c.denominations || {}).sort((a, b) => Number(b[0]) - Number(a[0]));
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <VarianceTag variance={c.variance} />
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Closed by {c.closed_by_name || 'staff'} at {new Date(c.closed_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
        </span>
      </div>
      {status.changedSinceClose && (
        <div style={{ fontSize: 12.5, color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
          This day&apos;s entries were changed after it was closed - cash in is now {formatCurrency(status.movement.cashIn)}, out {formatCurrency(status.movement.cashOut)}. Reopen and recount if the drawer is affected.
        </div>
      )}
      <Line label="Opening cash" value={c.opening_cash} muted />
      <Line label="Cash in" value={c.cash_in} sign="+ " />
      <Line label="Cash out (loans paid)" value={c.cash_out} sign="− " />
      {Number(c.other_in) > 0 && <Line label="Other cash in" value={c.other_in} sign="+ " />}
      {Number(c.other_out) > 0 && <Line label="Other cash out" value={c.other_out} sign="− " />}
      <div style={{ borderTop: '1px solid var(--divider)', marginTop: 4 }} />
      <Line label="Expected in drawer" value={c.expected_cash} strong />
      <Line label="Counted" value={c.counted_cash} strong />
      {denoms.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {denoms.map(([d, n]) => `₹${d} × ${n}`).join(' · ')}
        </div>
      )}
      {c.notes && <div style={{ fontSize: 13, marginTop: 8 }}><span style={{ color: 'var(--text-muted)' }}>Note:</span> {c.notes}</div>}
      {canReopen && (
        <button type="button" className="btn btn-ghost btn-sm no-print" style={{ marginTop: 10 }} onClick={onReopen}>Reopen day…</button>
      )}
    </>
  );
}

// An open day: count the drawer and close it.
function CloseForm({ status, date, denominations, isAdmin, onClosed }) {
  const m = status.movement;
  const carried = status.opening.amount;
  const [opening, setOpening] = useState(carried ?? '');
  const [otherIn, setOtherIn] = useState('');
  const [otherOut, setOtherOut] = useState('');
  const [byDenomination, setByDenomination] = useState(true);
  const [counts, setCounts] = useState({});
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const denomTotal = useMemo(() => denominations.reduce((n, d) => n + d * (Number(counts[d]) || 0), 0), [counts, denominations]);
  const countedValue = byDenomination ? denomTotal : counted === '' ? null : Number(counted);
  const openingValue = opening === '' ? null : Number(opening);
  const expected = openingValue == null ? null : round2(openingValue + m.cashIn - m.cashOut + (Number(otherIn) || 0) - (Number(otherOut) || 0));
  const variance = expected == null || countedValue == null ? null : round2(countedValue - expected);
  const openingLocked = carried != null && !isAdmin;

  async function submit(e) {
    e.preventDefault();
    if (openingValue == null) return setError('Enter the opening cash.');
    if (countedValue == null) return setError('Count the drawer first.');
    if (variance !== 0 && !notes.trim()) return setError('The drawer doesn’t match - add a note explaining the difference.');
    setSaving(true);
    setError('');
    try {
      await api.post('/cash-close', {
        date,
        branchId: status.branch.id,
        openingCash: openingValue,
        otherIn: otherIn || 0,
        otherOut: otherOut || 0,
        countedCash: countedValue,
        denominations: byDenomination ? counts : undefined,
        notes,
      });
      onClosed();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-row">
        <div className="field">
          <label>Opening cash {carried != null && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(from {status.opening.previousCloseDate} close)</span>}</label>
          <input type="number" step="0.01" min="0" value={opening} disabled={openingLocked} onChange={(e) => setOpening(e.target.value)} placeholder="Cash in drawer this morning" />
        </div>
        <div className="field">
          <label>Other cash in</label>
          <input type="number" step="0.01" min="0" value={otherIn} onChange={(e) => setOtherIn(e.target.value)} placeholder="e.g. owner top-up" />
        </div>
        <div className="field">
          <label>Other cash out</label>
          <input type="number" step="0.01" min="0" value={otherOut} onChange={(e) => setOtherOut(e.target.value)} placeholder="e.g. expenses, bank deposit" />
        </div>
      </div>

      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', marginBottom: 14 }}>
        <Line label={`Cash part payments`} value={m.cashPayments} sign="+ " />
        <Line label="Loans closed (principal + interest)" value={m.closureMoney} sign="+ " />
        <Line label="Loans paid out" value={m.cashOut} sign="− " />
        {Object.entries(m.byMode || {})
          .filter(([mode]) => mode !== 'cash')
          .map(([mode, amt]) => (
            <Line key={mode} label={`${MODE_LABELS[mode] || mode} - not in drawer`} value={amt} muted />
          ))}
        <div style={{ borderTop: '1px solid var(--divider)', marginTop: 4 }} />
        <Line label="Expected in drawer" value={expected} strong />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Count the drawer</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setByDenomination((v) => !v)}>
          {byDenomination ? 'Enter total instead' : 'Count by notes'}
        </button>
      </div>
      {byDenomination ? (
        <div className="denom-grid" style={{ marginBottom: 12 }}>
          {denominations.map((d) => (
            <label key={d}>
              <span className="tabular" style={{ minWidth: 40 }}>₹{d} ×</span>
              <input type="number" min="0" step="1" inputMode="numeric" value={counts[d] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value }))} aria-label={`Number of ₹${d}`} />
            </label>
          ))}
        </div>
      ) : (
        <div className="field">
          <label>Counted cash</label>
          <input type="number" step="0.01" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 15 }}>
          Counted <strong className="tabular">{formatCurrency(countedValue ?? 0)}</strong>
        </div>
        {variance != null && <VarianceTag variance={variance} />}
      </div>

      <div className="field">
        <label>Note {variance ? '*' : '(optional)'}</label>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={variance ? 'Why is the drawer over/short?' : 'Anything to remember about today'} />
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Closing…' : 'Close the day'}</button>
    </form>
  );
}

// End-of-day cash close for the day shown in the day book - one card per
// branch in view.
export default function CashClose({ date }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const confirm = useConfirm();
  const role = useMyRole();
  const isAdmin = isAdminRole(role);

  useEffect(() => {
    setData(null);
    setError('');
    api
      .get('/cash-close', { params: { date } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, [date, reload]);

  async function reopen(close) {
    const reason = await confirm({
      title: 'Reopen this day?',
      message: 'The saved count is removed and the day can be counted and closed again. This is recorded in the activity log.',
      input: { label: 'Reason' },
      confirmLabel: 'Reopen',
      danger: true,
    });
    if (!reason) return;
    try {
      await api.delete(`/cash-close/${close.id}`, { data: { reason } });
      setReload((n) => n + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <h2 className="section-title">Close the day</h2>
      {error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</div>}
      {!data && !error && <div className="card" style={{ padding: 20 }}><Skeleton height={140} /></div>}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.branches.map((status) => (
            <div key={status.branch.id} className="card" style={{ padding: '18px 20px' }}>
              {data.branches.length > 1 && <div className="font-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>{status.branch.name}</div>}
              {status.close ? (
                <ClosedSummary status={status} canReopen={isAdmin} onReopen={() => reopen(status.close)} />
              ) : (
                <CloseForm status={status} date={data.date} denominations={data.denominations} isAdmin={isAdmin} onClosed={() => setReload((n) => n + 1)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
