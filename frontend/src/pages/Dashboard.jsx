import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import StatCard from '../components/common/StatCard.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

export default function Dashboard() {
  const [loanCounts, setLoanCounts] = useState({ loading: true, data: null, error: null });
  const [borrowerCount, setBorrowerCount] = useState({ loading: true, data: null, error: null });
  const [outstanding, setOutstanding] = useState({ loading: true, data: null, error: null });
  const [recentPayments, setRecentPayments] = useState({ loading: true, data: null, error: null });
  const [dueDatePassed, setDueDatePassed] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    // Each tile is fetched from its own endpoint independently, in parallel —
    // a slow/failing query only affects its own card, not the whole dashboard.
    api
      .get('/reports/dashboard/loan-counts')
      .then((res) => setLoanCounts({ loading: false, data: res.data, error: null }))
      .catch((err) => setLoanCounts({ loading: false, data: null, error: err.message }));

    api
      .get('/reports/dashboard/borrower-count')
      .then((res) => setBorrowerCount({ loading: false, data: res.data, error: null }))
      .catch((err) => setBorrowerCount({ loading: false, data: null, error: err.message }));

    api
      .get('/reports/dashboard/outstanding-totals')
      .then((res) => setOutstanding({ loading: false, data: res.data, error: null }))
      .catch((err) => setOutstanding({ loading: false, data: null, error: err.message }));

    api
      .get('/reports/dashboard/recent-payments')
      .then((res) => setRecentPayments({ loading: false, data: res.data.data, error: null }))
      .catch((err) => setRecentPayments({ loading: false, data: null, error: err.message }));

    api
      .get('/reports/overdue')
      .then((res) => setDueDatePassed({ loading: false, data: res.data.data, error: null }))
      .catch((err) => setDueDatePassed({ loading: false, data: null, error: err.message }));
  }, []);

  function tileValue(tile, format = (v) => v) {
    if (tile.loading) return '…';
    if (tile.error) return '—';
    return format(tile.data);
  }

  return (
    <div>
      <div className="font-serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Dashboard</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Loans" value={tileValue(loanCounts, (d) => d.totalLoans)} />
        <StatCard label="Active Loans" value={tileValue(loanCounts, (d) => d.activeLoans)} />
        <StatCard label="Total Borrowers" value={tileValue(borrowerCount, (d) => d.totalBorrowers)} />
        <StatCard label="Outstanding Principal" value={tileValue(outstanding, (d) => formatCurrency(d.totalPrincipalOutstanding))} />
        <StatCard label="Outstanding Interest" value={tileValue(outstanding, (d) => formatCurrency(d.totalInterestOutstanding))} />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="font-serif" style={{ fontSize: 17, fontWeight: 600 }}>Recent Payments</div>
          <Link to="/payments" style={{ fontSize: 13, color: 'var(--gold-deep)', textDecoration: 'none', fontWeight: 600 }}>
            View all
          </Link>
        </div>
        {recentPayments.loading && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>}
        {recentPayments.error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{recentPayments.error}</div>}
        {!recentPayments.loading && !recentPayments.error && (!recentPayments.data || recentPayments.data.length === 0) && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No payments recorded yet.</div>
        )}
        {recentPayments.data?.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: '1px solid var(--divider)',
              fontSize: 14,
            }}
          >
            <div>
              <strong>{p.borrowers?.name}</strong> · {p.loans?.loan_number}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ color: 'var(--text-muted)' }}>{formatDate(p.payment_date)}</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(p.amount)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 20, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div className="font-serif" style={{ fontSize: 17, fontWeight: 600 }}>Due Date Passed</div>
          <Link to="/reports" style={{ fontSize: 13, color: 'var(--gold-deep)', textDecoration: 'none', fontWeight: 600 }}>
            View all
          </Link>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Informational only - the due date isn't enforced, these loans are still open as normal.
        </div>
        {dueDatePassed.loading && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>}
        {dueDatePassed.error && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{dueDatePassed.error}</div>}
        {!dueDatePassed.loading && !dueDatePassed.error && (!dueDatePassed.data || dueDatePassed.data.length === 0) && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No loans past their due date.</div>
        )}
        {dueDatePassed.data?.slice(0, 10).map((l) => (
          <div
            key={l.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: '1px solid var(--divider)',
              fontSize: 14,
            }}
          >
            <div>
              <strong>{l.borrowers?.name}</strong> · {l.loan_number}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ color: 'var(--text-muted)' }}>Due {formatDate(l.due_date)}</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(l.interest?.totalAmountDue)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
