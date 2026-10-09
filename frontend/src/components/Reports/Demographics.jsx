import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { api } from '../../services/api.js';
import { useChartColors } from '../../utils/chartTheme.js';
import { formatCurrency, compactINR } from '../../utils/formatters.js';
import StatCard from '../common/StatCard.jsx';
import { Skeleton, TableSkeleton } from '../common/Skeleton.jsx';

const LEVELS = ['District', 'Mandal / Taluk', 'Village'];
const METRICS = [
  { key: 'loans', label: 'Loans', format: (v) => v },
  { key: 'borrowers', label: 'Borrowers', format: (v) => v },
  { key: 'openPrincipal', label: 'Open principal', format: compactINR },
  { key: 'disbursed', label: 'Total disbursed', format: compactINR },
];

// Gold / silver / mixed share of a place's loans as one thin stacked bar -
// reads at a glance in a table row without a separate chart per place.
function MetalShare({ row }) {
  const total = row.gold + row.silver + row.mixed;
  if (!total) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  const seg = (n, bg) => (n ? <span style={{ width: `${(n / total) * 100}%`, background: bg }} /> : null);
  return (
    <div title={`Gold ${row.gold} · Silver ${row.silver} · Mixed ${row.mixed}`} style={{ minWidth: 90 }}>
      <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--divider)' }}>
        {seg(row.gold, 'var(--gold)')}
        {seg(row.silver, 'var(--text-muted)')}
        {seg(row.mixed, 'var(--gold-deep)')}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }} className="tabular">
        {row.gold}G · {row.silver}S{row.mixed ? ` · ${row.mixed}M` : ''}
      </div>
    </div>
  );
}

export default function Demographics() {
  const colors = useChartColors();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [path, setPath] = useState([]); // drill-down trail of place names
  const [metric, setMetric] = useState('loans');

  useEffect(() => {
    api
      .get('/reports/demographics')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    let level = data.districts;
    for (const name of path) level = level.find((r) => r.name === name)?.children || [];
    return level;
  }, [data, path]);

  const metricDef = METRICS.find((m) => m.key === metric);
  const chartRows = [...rows].sort((a, b) => b[metric] - a[metric]).slice(0, 12);
  const levelLabel = LEVELS[path.length];
  const canDrill = path.length < LEVELS.length - 1;

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  const villageCount = data
    ? data.districts.reduce((n, d) => n + d.children.reduce((m, md) => m + md.children.length, 0), 0)
    : 0;

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 14, marginBottom: 20 }}>
        <StatCard label="Districts" value={data?.districts.length} loading={!data} />
        <StatCard label="Villages" value={villageCount} loading={!data} />
        <StatCard label="Borrowers" value={data?.totals.borrowers} loading={!data} />
        <StatCard
          label="Village missing"
          value={data?.missingVillage}
          sublabel="borrowers to update"
          loading={!data}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14, fontSize: 13.5 }}>
        <button className="btn btn-secondary" style={{ padding: '5px 12px' }} disabled={!path.length} onClick={() => setPath([])}>
          All districts
        </button>
        {path.map((name, i) => (
          <span key={name} style={{ display: 'contents' }}>
            <span style={{ color: 'var(--text-muted)' }}>›</span>
            <button
              className="btn btn-secondary"
              style={{ padding: '5px 12px' }}
              disabled={i === path.length - 1}
              onClick={() => setPath(path.slice(0, i + 1))}
            >
              {name}
            </button>
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <select value={metric} onChange={(e) => setMetric(e.target.value)} style={{ width: 'auto' }} aria-label="Chart metric">
          {METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="font-serif" style={{ fontSize: 16, fontWeight: 600 }}>
          {metricDef.label} by {levelLabel.toLowerCase()}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          {canDrill ? `Tap a bar to drill into its ${LEVELS[path.length + 1].toLowerCase()}s.` : 'Top 12 shown.'}
        </div>
        {!data ? (
          <Skeleton height={260} />
        ) : chartRows.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No borrowers recorded yet.</div>
        ) : (
          <div style={{ height: Math.max(180, chartRows.length * 34) }}>
            <ResponsiveContainer>
              <BarChart data={chartRows} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={colors.grid} />
                <XAxis type="number" tickFormatter={metricDef.format} tick={{ fill: colors.muted, fontSize: 11.5 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fill: colors.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: colors.grid, opacity: 0.5 }}
                  formatter={(v) => [['openPrincipal', 'disbursed'].includes(metric) ? formatCurrency(v) : v, metricDef.label]}
                  contentStyle={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, fontSize: 12.5 }}
                />
                <Bar
                  dataKey={metric}
                  radius={[0, 6, 6, 0]}
                  cursor={canDrill ? 'pointer' : 'default'}
                  onClick={(d) => canDrill && setPath([...path, d.name])}
                >
                  {chartRows.map((r, i) => (
                    <Cell key={r.name} fill={i === 0 ? colors.goldDeep : colors.gold} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {!data ? (
        <TableSkeleton columns={6} rows={6} />
      ) : (
        <div className="table-wrap table-stack">
          <table>
            <thead>
              <tr>
                <th>{levelLabel}</th>
                <th>Borrowers</th>
                <th>Loans</th>
                <th>Open</th>
                <th>Open principal</th>
                <th>Gold / Silver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.name}
                  onClick={canDrill ? () => setPath([...path, r.name]) : undefined}
                  style={canDrill ? { cursor: 'pointer' } : undefined}
                >
                  <td data-label="Place" style={{ fontWeight: 600 }}>{r.name}{canDrill && <span style={{ color: 'var(--text-muted)' }}> ›</span>}</td>
                  <td data-label="Borrowers" className="tabular">{r.borrowers}</td>
                  <td data-label="Loans" className="tabular">{r.loans}</td>
                  <td data-label="Open" className="tabular">{r.openLoans}</td>
                  <td data-label="Open principal" className="tabular">{formatCurrency(r.openPrincipal)}</td>
                  <td data-label="Gold / Silver"><MetalShare row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
