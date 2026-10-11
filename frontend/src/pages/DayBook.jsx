import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import PageHeader from '../components/common/PageHeader.jsx';
import StatCard from '../components/common/StatCard.jsx';
import DataTable from '../components/common/DataTable.jsx';
import { TableSkeleton } from '../components/common/Skeleton.jsx';
import { formatCurrency } from '../utils/formatters.js';

const MODE_LABELS = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', transfer: 'Bank transfer' };
const KIND_LABELS = { new: 'New', rollover: 'Rollover', repledge: 'Re-pledge' };

// India's calendar date (the shop's business day), not UTC's.
function todayIST() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function shiftDate(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function longDate(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const loanLink = (id, number) => (
  <Link to={`/loans/${id}`} className="num" style={{ color: 'var(--gold-deep)', fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
    {number}
  </Link>
);

function Section({ title, total, children }) {
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{title}</h2>
        {total != null && <span className="tabular" style={{ fontWeight: 600 }}>{formatCurrency(total)}</span>}
      </div>
      {children}
    </div>
  );
}

// End-of-day counter tally: what came in, what went out, by payment mode.
export default function DayBook() {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayIST();
  const date = searchParams.get('date') || today;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get('/reports/day-book', { params: { date } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [date]);

  const setDate = (d) => setSearchParams(d === today ? {} : { date: d });
  const t = data?.totals;

  const loanColumns = [
    { key: 'loanNumber', label: 'Loan #', render: (r) => loanLink(r.id, r.loanNumber) },
    { key: 'borrowerName', label: 'Borrower' },
    { key: 'kind', label: 'Type', render: (r) => (r.kind === 'rollover' && r.rolledFrom ? `Rollover of ${r.rolledFrom}` : KIND_LABELS[r.kind]) },
    { key: 'amount', label: 'Amount paid out', render: (r) => <span className="tabular">{formatCurrency(r.amount)}</span> },
  ];
  const paymentColumns = [
    { key: 'loanNumber', label: 'Loan #', render: (r) => loanLink(r.loanId, r.loanNumber) },
    { key: 'borrowerName', label: 'Borrower' },
    { key: 'mode', label: 'Mode', render: (r) => MODE_LABELS[r.mode] || r.mode },
    { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
    { key: 'amount', label: 'Received', render: (r) => <span className="tabular">{formatCurrency(r.amount)}</span> },
  ];
  const closureColumns = [
    { key: 'loanNumber', label: 'Loan #', render: (r) => loanLink(r.id, r.loanNumber) },
    { key: 'borrowerName', label: 'Borrower' },
    { key: 'principalReturned', label: 'Principal', render: (r) => <span className="tabular">{formatCurrency(r.principalReturned)}</span> },
    {
      key: 'interestCollected',
      label: 'Interest',
      render: (r) => (
        <span>
          <span className="tabular">{formatCurrency(r.interestCollected)}</span>
          {r.interestWaived > 0 && (
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--warning)' }} title={r.waiverReason || ''}>
              −{formatCurrency(r.interestWaived)} reduced
            </span>
          )}
        </span>
      ),
    },
    { key: 'total', label: 'Total received', render: (r) => <span className="tabular" style={{ fontWeight: 600 }}>{formatCurrency(r.total)}</span> },
    { key: 'rolledInto', label: 'Note', render: (r) => (r.rolledInto ? `Rolled into ${r.rolledInto}` : 'Items released') },
  ];

  const modes = Object.entries(data?.partPaymentsByMode || {});

  return (
    <div>
      <PageHeader
        title="Day Book"
        subtitle={longDate(date)}
        actions={
          <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">← Prev</button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto' }} aria-label="Day" />
            <button className="btn btn-ghost btn-sm" disabled={date >= today} onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">Next →</button>
            {date !== today && <button className="btn btn-secondary btn-sm" onClick={() => setDate(today)}>Today</button>}
            <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>Print</button>
          </div>
        }
      />

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Money in" loading={loading} value={formatCurrency(t?.moneyIn)} sublabel={t ? `${t.counts.payments} payments · ${t.counts.closures} closures` : undefined} />
        <StatCard label="Money out" loading={loading} value={formatCurrency(t?.moneyOut)} sublabel={t ? `${t.counts.newLoans} loans given` : undefined} />
        <StatCard
          label="Net cash"
          loading={loading}
          value={t ? `${t.net < 0 ? '−' : '+'}${formatCurrency(Math.abs(t.net))}` : '—'}
          sublabel={t ? (t.net < 0 ? 'more paid out than received' : 'should be in the drawer / bank') : undefined}
        />
        <StatCard
          label="Interest earned"
          loading={loading}
          value={formatCurrency(t?.interestCollected)}
          sublabel={t?.interestWaived > 0 ? `${formatCurrency(t.interestWaived)} reduced at the counter` : 'from loans closed today'}
        />
      </div>

      {!loading && t && (
        <div className="card" style={{ padding: '16px 20px', marginTop: 16 }}>
          <div className="facts">
            {modes.map(([mode, amount]) => (
              <div key={mode}>
                <div className="fact-label">Part payments · {MODE_LABELS[mode] || mode}</div>
                <div className="fact-value tabular">{formatCurrency(amount)}</div>
              </div>
            ))}
            <div>
              <div className="fact-label">At closure (principal + interest)</div>
              <div className="fact-value tabular">{formatCurrency(t.closurePrincipal + t.interestCollected)}</div>
            </div>
            <div>
              <div className="fact-label">Loans paid out</div>
              <div className="fact-value tabular">{formatCurrency(t.disbursed)}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
            A rollover shows up twice: the old loan closing (money in) and the new loan (money out). The net is the cash that actually changed hands. Closure amounts are assumed paid at the counter; their payment mode isn’t recorded.
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 28 }}><TableSkeleton columns={5} rows={6} /></div>
      ) : data ? (
        <>
          <Section title="Loans given" total={t.disbursed}>
            <DataTable columns={loanColumns} rows={data.newLoans} emptyMessage="No loans given on this day" />
          </Section>
          <Section title="Part payments received" total={t.partPayments}>
            <DataTable columns={paymentColumns} rows={data.payments} emptyMessage="No part payments on this day" />
          </Section>
          <Section title="Loans closed" total={t.closurePrincipal + t.interestCollected}>
            <DataTable columns={closureColumns} rows={data.closures} emptyMessage="No loans closed on this day" />
          </Section>
        </>
      ) : null}
    </div>
  );
}
