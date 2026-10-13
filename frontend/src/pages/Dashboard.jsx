import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import { api } from '../services/api.js';
import StatCard from '../components/common/StatCard.jsx';
import InsightCard from '../components/common/InsightCard.jsx';
import { ListSkeleton } from '../components/common/Skeleton.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import GlobalSearch from '../components/common/GlobalSearch.jsx';
import { Kbd } from '../components/common/Kbd.jsx';
import RateRiskModal from '../components/Coverage/RateRiskModal.jsx';
import { runwayLabel, runwayTone } from '../components/Storage/StorageCapacity.jsx';
import { useBranch } from '../context/BranchContext.jsx';

// The risk check pops up once per new rate (per branch view), the first
// time the dashboard is opened after the rate moves.
const SEEN_KEY = 'rateRiskSeen';
function riskSeen(key) {
  try {
    return localStorage.getItem(SEEN_KEY) === key;
  } catch {
    return false;
  }
}
function markRiskSeen(key) {
  try {
    localStorage.setItem(SEEN_KEY, key);
  } catch {
    // Storage blocked: the pop-up may show again next visit - harmless.
  }
}

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
  const [dayBook, setDayBook] = useState({ loading: true, data: null, error: null });
  const [rateRisk, setRateRisk] = useState({ loading: true, data: null, error: null });
  const [storage, setStorage] = useState({ loading: true, data: null, error: null });
  const [showRisk, setShowRisk] = useState(false);
  const { branchId, currentBranch } = useBranch();

  useEffect(() => {
    api
      .get('/reports/day-book')
      .then((res) => setDayBook({ loading: false, data: res.data.totals, error: null }))
      .catch((err) => setDayBook({ loading: false, data: null, error: err.message }));

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

    api
      .get('/storage/capacity')
      .then((res) => setStorage({ loading: false, data: res.data.metals, error: null }))
      .catch((err) => setStorage({ loading: false, data: null, error: err.message }));

    api
      .get('/coverage/rate-risk')
      .then((res) => setRateRisk({ loading: false, data: res.data, error: null }))
      .catch((err) => setRateRisk({ loading: false, data: null, error: err.message }));
  }, []);

  // Auto-open the risk check when the rate has moved since the user last saw it.
  const riskKey = rateRisk.data?.asOf ? `${rateRisk.data.asOf}:${branchId}` : null;
  const rateMoved = rateRisk.data?.rates?.some((r) => r.changePct);
  useEffect(() => {
    if (riskKey && rateMoved && !riskSeen(riskKey)) setShowRisk(true);
  }, [riskKey, rateMoved]);

  function closeRisk() {
    if (riskKey) markRiskSeen(riskKey);
    setShowRisk(false);
  }

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
      <PageHeader title="Dashboard" subtitle={today} />

      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        <GlobalSearch id="dashboard-search" placeholder="Find a customer, loan / packet no., HUID or item…" />
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Returning customer? Search their name and press <strong>Re-pledge</strong> on a closed loan to reuse its items.<span className="hidden md:inline"> Press <Kbd>/</Kbd> from any page to search.</span>
        </div>
      </div>

      {/* Money first and wider; counts are supporting detail. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr] gap-4 mb-8">
        <StatCard label="Principal out on loan" loading={outstanding.loading} value={tileValue(outstanding, (d) => formatCurrency(d.totalPrincipalOutstanding))} sublabel="open loans" />
        <StatCard label="Interest accrued" loading={outstanding.loading} value={tileValue(outstanding, (d) => formatCurrency(d.totalInterestOutstanding))} sublabel="not yet collected" />
        <StatCard label="Active loans" loading={loanCounts.loading} value={tileValue(loanCounts, (d) => d.activeLoans)} sublabel={loanCounts.data ? `of ${loanCounts.data.totalLoans} total` : undefined} />
        <StatCard label="Borrowers" loading={borrowerCount.loading} value={tileValue(borrowerCount, (d) => d.totalBorrowers)} />
        <StatCard label="All loans" loading={loanCounts.loading} value={tileValue(loanCounts, (d) => d.totalLoans)} />
      </div>

      <h2 className="section-title">Needs attention</h2>
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

        <RiskTile state={rateRisk} onOpen={() => setShowRisk(true)} />

        <InsightCard
          to="/day-book"
          tone={!dayBook.data ? 'neutral' : dayBook.data.net < 0 ? 'amber' : 'green'}
          label="Today's Cash"
          loading={dayBook.loading}
          value={dayBook.data ? `${dayBook.data.net < 0 ? '−' : '+'}${formatCurrency(Math.abs(dayBook.data.net))}` : '—'}
          sublabel={dayBook.data ? `In ${formatCurrency(dayBook.data.moneyIn)} · Out ${formatCurrency(dayBook.data.moneyOut)}` : ''}
          cta="Open day book"
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

        <StorageTile state={storage} />

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
          <h2 className="section-title" style={{ margin: 0 }}>Recent payments</h2>
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
          <h2 className="section-title" style={{ margin: 0 }}>Due date passed</h2>
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

      {showRisk && rateRisk.data && <RateRiskModal data={rateRisk.data} branchName={currentBranch?.name} onClose={closeRisk} />}
    </div>
  );
}

// Headline of the rate-move risk check; opens the full breakdown.
// Locker space: the metal closest to running out leads.
const TONE_RANK = { red: 3, amber: 2, green: 1, neutral: 0 };
function StorageTile({ state }) {
  const set = (state.data || []).filter((m) => m.boxesTotal > 0);
  const worst = set.slice().sort((a, b) => TONE_RANK[runwayTone(b)] - TONE_RANK[runwayTone(a)] || (a.runwayDays ?? Infinity) - (b.runwayDays ?? Infinity))[0];
  const tone = worst ? runwayTone(worst) : 'neutral';
  return (
    <InsightCard
      to="/storage?tab=capacity"
      tone={tone}
      label="Locker Space"
      loading={state.loading}
      value={worst ? `~${worst.headroom.toLocaleString('en-IN')} ${set.length > 1 ? `${worst.metal.toLowerCase()} ` : ''}packets` : state.error ? '—' : 'Not set up'}
      sublabel={
        worst
          ? set.map((m) => `${m.metal}: ${runwayLabel(m.runwayDays)}`).join(' · ')
          : state.error
          ? ''
          : 'add lockers and boxes to track space'
      }
      cta={tone === 'red' || tone === 'amber' ? 'Plan a reshuffle' : undefined}
    />
  );
}

function RiskTile({ state, onOpen }) {
  const d = state.data;
  const gold = d?.rates?.find((r) => r.metal === 'Gold');
  const urgent = d ? d.summary.byRisk.critical + d.summary.byRisk.high : 0;
  const change = gold?.changePct;
  return (
    <button type="button" className="tile-button" onClick={onOpen} disabled={!d} aria-label="Open rate move risk check">
      <InsightCard
        tone={!d ? 'neutral' : d.summary.byRisk.critical ? 'red' : urgent ? 'amber' : 'green'}
        label="Rate Move Risk"
        loading={state.loading}
        value={d ? `${urgent} to call` : '—'}
        sublabel={
          d
            ? `${change ? `Gold ${change < 0 ? '▼' : '▲'} ${Math.abs(change)}% · ` : ''}${d.summary.newlyRed} newly under · ${formatCurrency(d.summary.shortfall)} short`
            : state.error || ''
        }
        cta={d ? 'See risk check' : undefined}
      />
    </button>
  );
}
