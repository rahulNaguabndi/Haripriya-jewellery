import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { api } from '../../services/api.js';
import { useChartColors, formatMonthLabel } from '../../utils/chartTheme.js';
import { formatCurrency, compactINR } from '../../utils/formatters.js';
import { ChartCard, ChartTooltip, ChartSkeleton, DonutLegend } from './ReportsOverview.jsx';
import Segmented from '../common/Segmented.jsx';
import { ScoreBadge, BAND_META } from '../Borrowers/ReliabilityScore.jsx';
import StatCard from '../common/StatCard.jsx';

// Notice milestones the ageing bands line up with - bars past these are
// coloured as "notice territory".
const NOTICE_BANDS = new Set(['13-19', '19-26', '26-36', '36+']);

function useFetch(url) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    api
      .get(url)
      .then((r) => setState({ loading: false, data: r.data, error: null }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  }, [url]);
  return state;
}

export default function RiskForecast() {
  const colors = useChartColors();
  const ageing = useFetch('/reports/ageing');
  const forecast = useFetch('/reports/forecast');
  const scores = useFetch('/reports/borrower-scores');
  const [ageMetric, setAgeMetric] = useState('principal');
  const [scoreView, setScoreView] = useState('risky');

  const axisProps = { stroke: colors.muted, tick: { fill: colors.muted, fontSize: 11 }, tickLine: false, axisLine: { stroke: colors.grid } };

  const f = forecast.data;
  const accrual = f?.accrual || [];
  const next = (days) => accrual.find((a) => a.days === days);

  const bandItems = scores.data
    ? ['excellent', 'good', 'watch', 'risky', 'new']
        .map((band) => ({ key: band, name: BAND_META[band].label, value: scores.data.bands[band] || 0, fill: colors[{ excellent: 'success', good: 'goldDeep', watch: 'warning', risky: 'danger', new: 'muted' }[band]] }))
        .filter((d) => d.value > 0)
    : [];
  const scoreRows = scores.data
    ? scoreView === 'risky'
      ? scores.data.data.filter((r) => r.band === 'risky' || r.band === 'watch').slice(0, 15)
      : [...scores.data.data].filter((r) => r.band !== 'new').reverse().slice(0, 15)
    : [];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Forecast headline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Interest on the book today" loading={forecast.loading} value={formatCurrency(next(0)?.interestAccrued)} sublabel={f ? `${f.openLoans} open loans · ${formatCurrency(f.principalOutstanding)} principal` : undefined} />
        <StatCard label="Builds up in 30 days" loading={forecast.loading} value={f ? `+${formatCurrency(next(30)?.increase)}` : '—'} sublabel="if no one pays" />
        <StatCard label="In 90 days" loading={forecast.loading} value={f ? `+${formatCurrency(next(90)?.increase)}` : '—'} sublabel={f ? `+${formatCurrency(next(60)?.increase)} by 60 days` : undefined} />
        <StatCard label="Typical month's collections" loading={forecast.loading} value={formatCurrency(f?.averageMonthly.total)} sublabel={f ? `${formatCurrency(f.averageMonthly.interestCollected)} of it interest · last 5 months` : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ageing */}
        {ageing.loading ? (
          <ChartSkeleton />
        ) : (
          <ChartCard
            title="Loan ageing"
            subtitle={ageing.data ? `${ageing.data.totalLoans} open loans by age · darker bars are past the 13-month notice mark` : ageing.error}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <Segmented
                  label="Ageing metric"
                  value={ageMetric}
                  onChange={setAgeMetric}
                  options={[
                    { value: 'principal', label: 'Principal' },
                    { value: 'count', label: 'Count' },
                  ]}
                />
              </div>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageing.data?.data || []} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 10 }} />
                <YAxis width={ageMetric === 'count' ? 32 : 54} allowDecimals={false} tickFormatter={ageMetric === 'count' ? undefined : compactINR} {...axisProps} />
                <Tooltip
                  cursor={{ fill: colors.grid, opacity: 0.4 }}
                  content={(p) => <ChartTooltip {...p} colors={colors} valueFormatter={ageMetric === 'count' ? undefined : formatCurrency} />}
                />
                <Bar dataKey={ageMetric} name={ageMetric === 'count' ? 'Loans' : 'Principal'} radius={[4, 4, 0, 0]} maxBarSize={38}>
                  {(ageing.data?.data || []).map((b) => (
                    <Cell key={b.key} fill={NOTICE_BANDS.has(b.key) ? colors.warning : colors.gold} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Collections history */}
        {forecast.loading ? (
          <ChartSkeleton />
        ) : (
          <ChartCard title="Collections per month" subtitle={f ? 'Part payments, principal at closure and interest - last 6 months' : forecast.error}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={f?.history || []} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={formatMonthLabel} {...axisProps} />
                <YAxis tickFormatter={compactINR} width={54} {...axisProps} />
                <Tooltip content={(p) => <ChartTooltip {...p} colors={colors} label={p.label && formatMonthLabel(p.label)} valueFormatter={formatCurrency} />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="partPayments" name="Part payments" stackId="c" fill={colors.gold} maxBarSize={38} />
                <Bar dataKey="closurePrincipal" name="Principal at closure" stackId="c" fill={colors.muted} maxBarSize={38} />
                <Bar dataKey="interestCollected" name="Interest" stackId="c" fill={colors.success} radius={[4, 4, 0, 0]} maxBarSize={38} />
                <Line type="monotone" dataKey="total" name="Total" stroke={colors.goldDeep} strokeWidth={2} dot={false} legendType="none" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Borrower reliability */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        {scores.loading ? (
          <ChartSkeleton height={220} />
        ) : (
          <ChartCard title="Borrower reliability" subtitle={scores.data ? `${scores.data.data.length} borrowers with loans` : scores.error} height={180} footer={<DonutLegend items={bandItems} />}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={bandItems} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke={colors.surface} strokeWidth={2}>
                  {bandItems.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip content={(p) => <ChartTooltip {...p} colors={colors} />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h2 className="section-title" style={{ margin: 0 }}>{scoreView === 'risky' ? 'Needs a closer look' : 'Most reliable'}</h2>
            <Segmented
              label="Borrower list"
              value={scoreView}
              onChange={setScoreView}
              options={[
                { value: 'risky', label: 'Watch / risky' },
                { value: 'best', label: 'Most reliable' },
              ]}
            />
          </div>
          {scores.loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Scoring borrowers…</div>}
          {!scores.loading && scoreRows.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>No borrowers in this group.</div>}
          {scoreRows.map((r) => (
            <Link
              key={r.borrowerId}
              to={`/borrowers/${r.borrowerId}`}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--divider)', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                  {[r.place, `${r.loanCount} loan${r.loanCount === 1 ? '' : 's'}`, r.factors.filter((x) => x.points < 0).map((x) => `${x.label.toLowerCase()} ×${x.count}`).join(', ')].filter(Boolean).join(' · ')}
                </div>
              </div>
              <ScoreBadge score={r.score} band={r.band} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
