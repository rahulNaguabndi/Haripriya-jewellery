import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import StatCard from '../components/common/StatCard.jsx';
import InsightCard from '../components/common/InsightCard.jsx';
import { ListSkeleton } from '../components/common/Skeleton.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';

export default function Dashboard() {
  const [loanCounts, setLoanCounts] = useState({ loading: true, data: null, error: null });
  const [borrowerCount, setBorrowerCount] = useState({ loading: true, data: null, error: null });
  const [outstanding, setOutstanding] = useState({ loading: true, data: null, error: null });
  const [recentPayments, setRecentPayments] = useState({ loading: true, data: null, error: null });
  const [dueDatePassed, setDueDatePassed] = useState({ loading: true, data: null, error: null });
  const [insights, setInsights] = useState({ loading: true, data: null, error: null });
  const [rates, setRates] = useState({ loading: true, data: null, error: null });
  const [notices, setNotices] = useState({ loading: true, data: null, error: null });
  const [coverage, setCoverage] = useState({ loading: true, data: null, error: null });

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

    api
      .get('/reports/dashboard/insights')
      .then((res) => setInsights({ loading: false, data: res.data, error: null }))
      .catch((err) => setInsights({ loading: false, data: null, error: err.message }));

    api
      .get('/rates')
      .then((res) => setRates({ loading: false, data: res.data, error: null }))
      .catch((err) => setRates({ loading: false, data: null, error: err.message }));

    api
      .get('/notices/due')
      .then((res) => setNotices({ loading: false, data: res.data, error: null }))
      .catch((err) => setNotices({ loading: false, data: null, error: err.message }));

    // Coverage recomputes interest for every open loan, so it's the slowest
    // call — kept independent so its tile fills in late without holding up
    // the rest of the dashboard.
    api
      .get('/coverage')
      .then((res) => setCoverage({ loading: false, data: res.data.data, error: null }))
      .catch((err) => setCoverage({ loading: false, data: null, error: err.message }));
  }, []);

  function tileValue(tile, format = (v) => v) {
    if (tile.loading) return '…';
    if (tile.error) return '—';
    return format(tile.data);
  }

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // --- Derived CTA figures -------------------------------------------------
  const goldToday = rates.data?.today?.Gold;
  const goldLatest = rates.data?.latest?.Gold;
  const goldRow = goldToday || goldLatest;
  const silverRow = rates.data?.today?.Silver || rates.data?.latest?.Silver;
  const rateSetToday = !!goldToday;

  const redCount = coverage.data ? coverage.data.filter((r) => r.status === 'red').length : 0;
  const amberCount = coverage.data ? coverage.data.filter((r) => r.status === 'amber').length : 0;

  const dueNowCount = notices.data?.dueNow?.length ?? 0;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="font-serif" style={{ fontSize: 26, fontWeight: 600 }}>Dashboard</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{today}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-7">
        <StatCard label="Total Loans" loading={loanCounts.loading} value={tileValue(loanCounts, (d) => d.totalLoans)} />
        <StatCard label="Active Loans" loading={loanCounts.loading} value={tileValue(loanCounts, (d) => d.activeLoans)} />
        <StatCard label="Total Borrowers" loading={borrowerCount.loading} value={tileValue(borrowerCount, (d) => d.totalBorrowers)} />
        <StatCard label="Outstanding Principal" loading={outstanding.loading} value={tileValue(outstanding, (d) => formatCurrency(d.totalPrincipalOutstanding))} />
        <StatCard label="Outstanding Interest" loading={outstanding.loading} value={tileValue(outstanding, (d) => formatCurrency(d.totalInterestOutstanding))} />
      </div>

      <div className="font-serif" style={{ fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Needs attention</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
        <InsightCard
          to="/coverage"
          tone={rateSetToday ? 'gold' : 'amber'}
          label="Gold Rate"
          loading={rates.loading}
          value={goldRow ? `${formatCurrency(goldRow.rate_per_gram)}/g` : 'Not set'}
          sublabel={
            silverRow
              ? `Silver ${formatCurrency(silverRow.rate_per_gram)}/g · ${rateSetToday ? "today's rate" : goldRow ? `as of ${formatDate(goldRow.rate_date)}` : ''}`
              : rateSetToday
              ? "today's rate"
              : goldRow
              ? `as of ${formatDate(goldRow.rate_date)}`
              : 'no rate on record'
          }
          cta={rateSetToday ? undefined : "Set today's rate"}
        />

        <InsightCard
          to="/loans"
          tone="neutral"
          label="New Loans Today"
          loading={insights.loading}
          value={insights.data?.newLoansToday ?? '—'}
          sublabel={insights.data ? `Yesterday: ${insights.data.newLoansYesterday}` : ''}
        />

        <InsightCard
          to="/coverage"
          tone={redCount > 0 ? 'red' : amberCount > 0 ? 'amber' : 'green'}
          label="May Not Be Profitable"
          loading={coverage.loading}
          value={coverage.data ? redCount : '—'}
          sublabel={coverage.data ? `under-collateralized · ${amberCount} to watch` : ''}
          cta="Review coverage"
        />

        <InsightCard
          to="/loans"
          tone={insights.data?.staleAwaitingPaymentCount > 0 ? 'amber' : 'neutral'}
          label="Over 1yr, No Payment"
          loading={insights.loading}
          value={insights.data?.staleAwaitingPaymentCount ?? '—'}
          sublabel={insights.data ? `${formatCurrency(insights.data.staleAwaitingPaymentValue)} principal` : ''}
        />

        <InsightCard
          to="/reports"
          tone={insights.data?.overdueCount > 0 ? 'amber' : 'neutral'}
          label="Due Date Passed"
          loading={insights.loading}
          value={insights.data?.overdueCount ?? '—'}
          sublabel="informational — not enforced"
        />

        <InsightCard
          to="/notices"
          tone={dueNowCount > 0 ? 'amber' : 'neutral'}
          label="Notices Due"
          loading={notices.loading}
          value={dueNowCount}
          sublabel={insights.data ? `${insights.data.noticesSentThisMonth} sent this month` : ''}
          cta={dueNowCount > 0 ? 'Send notices' : undefined}
        />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="font-serif" style={{ fontSize: 17, fontWeight: 600 }}>Recent Payments</div>
          <Link to="/payments" style={{ fontSize: 13, color: 'var(--gold-deep)', textDecoration: 'none', fontWeight: 600 }}>
            View all
          </Link>
        </div>
        {recentPayments.loading && <ListSkeleton rows={6} />}
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
              <span className="tabular" style={{ fontWeight: 600 }}>{formatCurrency(p.amount)}</span>
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
        {dueDatePassed.loading && <ListSkeleton rows={5} />}
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
              <span className="tabular" style={{ fontWeight: 600 }}>{formatCurrency(l.interest?.totalAmountDue)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
