import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { api } from '../../services/api.js';
import { useChartColors, formatMonthLabel } from '../../utils/chartTheme.js';
import { formatCurrency } from '../../utils/formatters.js';
import { Skeleton } from '../common/Skeleton.jsx';

// Compact Indian-format currency for dense chart axes (₹1.2L, ₹45k).
function compactINR(n) {
  const v = Number(n) || 0;
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${v}`;
}

const STATUS_META = {
  active: { label: 'Active', colorKey: 'success' },
  partial_payment: { label: 'Partial', colorKey: 'warning' },
  closed: { label: 'Closed', colorKey: 'muted' },
  defaulted: { label: 'Defaulted', colorKey: 'danger' },
};

function ChartCard({ title, subtitle, children, footer, height = 260 }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="font-serif" style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>{subtitle}</div>}
      <div style={{ height, marginTop: subtitle ? 0 : 12 }}>{children}</div>
      {footer}
    </div>
  );
}

function DonutLegend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'center', marginTop: 12 }}>
      {items.map((d) => (
        <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: d.fill }} />
          {d.name} <strong style={{ color: 'var(--text)' }}>{d.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({ active, payload, label, colors, valueFormatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: '8px 12px',
        boxShadow: 'var(--shadow-md)',
        fontSize: 12.5,
      }}
    >
      {label != null && <div style={{ color: colors.muted, marginBottom: 4 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.text, fontWeight: 600 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color || p.payload?.fill }} />
          {p.name}: {valueFormatter ? valueFormatter(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton({ height = 260 }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <Skeleton width="40%" height={16} style={{ marginBottom: 16 }} />
      <Skeleton width="100%" height={height - 40} radius={10} />
    </div>
  );
}

export default function ReportsOverview() {
  const colors = useChartColors();
  const [status, setStatus] = useState({ loading: true, data: null });
  const [payments, setPayments] = useState({ loading: true, data: null });
  const [loans, setLoans] = useState({ loading: true, data: null });
  const [coverage, setCoverage] = useState({ loading: true, data: null });

  useEffect(() => {
    api.get('/reports/status-breakdown').then((r) => setStatus({ loading: false, data: r.data })).catch(() => setStatus({ loading: false, data: null }));
    api.get('/reports/payments-monthly?months=12').then((r) => setPayments({ loading: false, data: r.data.data })).catch(() => setPayments({ loading: false, data: null }));
    api.get('/reports/loans-monthly?months=12').then((r) => setLoans({ loading: false, data: r.data.data })).catch(() => setLoans({ loading: false, data: null }));
    api.get('/coverage').then((r) => setCoverage({ loading: false, data: r.data.data })).catch(() => setCoverage({ loading: false, data: null }));
  }, []);

  const statusData = status.data
    ? Object.entries(STATUS_META)
        .map(([key, meta]) => ({ key, name: meta.label, value: status.data.data[key] || 0, fill: colors[meta.colorKey] }))
        .filter((d) => d.value > 0)
    : [];

  const coverageBuckets = coverage.data
    ? [
        { key: 'red', name: 'At risk', value: coverage.data.filter((r) => r.status === 'red').length, fill: colors.danger },
        { key: 'amber', name: 'Watch', value: coverage.data.filter((r) => r.status === 'amber').length, fill: colors.warning },
        { key: 'green', name: 'Healthy', value: coverage.data.filter((r) => r.status === 'green').length, fill: colors.success },
        { key: 'unknown', name: 'Unknown', value: coverage.data.filter((r) => r.status === 'unknown').length, fill: colors.muted },
      ].filter((d) => d.value > 0)
    : [];

  const axisProps = {
    stroke: colors.muted,
    tick: { fill: colors.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: colors.grid },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Payments trend */}
      {payments.loading ? (
        <ChartSkeleton />
      ) : (
        <ChartCard title="Payments Collected" subtitle="Monthly total, last 12 months">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={payments.data || []} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="payFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.goldDeep} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colors.goldDeep} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonthLabel} {...axisProps} />
              <YAxis tickFormatter={compactINR} width={54} {...axisProps} />
              <Tooltip content={(p) => <ChartTooltip {...p} colors={colors} label={p.label && formatMonthLabel(p.label)} valueFormatter={formatCurrency} />} />
              <Area type="monotone" dataKey="total" name="Collected" stroke={colors.goldDeep} strokeWidth={2} fill="url(#payFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Loans issued */}
      {loans.loading ? (
        <ChartSkeleton />
      ) : (
        <ChartCard title="Loans Issued" subtitle="New loans per month, last 12 months">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={loans.data || []} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonthLabel} {...axisProps} />
              <YAxis allowDecimals={false} width={32} {...axisProps} />
              <Tooltip cursor={{ fill: colors.grid, opacity: 0.4 }} content={(p) => <ChartTooltip {...p} colors={colors} label={p.label && formatMonthLabel(p.label)} />} />
              <Bar dataKey="count" name="Loans" fill={colors.gold} radius={[4, 4, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Status donut */}
      {status.loading ? (
        <ChartSkeleton />
      ) : (
        <ChartCard title="Loan Status" subtitle={`${status.data?.total || 0} loans total`} height={200} footer={<DonutLegend items={statusData} />}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke={colors.surface} strokeWidth={2}>
                {statusData.map((d) => (
                  <Cell key={d.key} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip content={(p) => <ChartTooltip {...p} colors={colors} />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Coverage split */}
      {coverage.loading ? (
        <ChartSkeleton />
      ) : (
        <ChartCard
          title="Collateral Coverage"
          subtitle="Open loans by melt-value coverage"
          height={200}
          footer={coverageBuckets.length > 0 ? <DonutLegend items={coverageBuckets} /> : null}
        >
          {coverageBuckets.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: 20 }}>
              No coverage data yet — set today's metal rate on the Coverage page.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={coverageBuckets} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke={colors.surface} strokeWidth={2}>
                  {coverageBuckets.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
                <Tooltip content={(p) => <ChartTooltip {...p} colors={colors} />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      )}
    </div>
  );
}
