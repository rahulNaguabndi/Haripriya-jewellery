import { useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { useChartColors } from '../../utils/chartTheme.js';
import { formatCurrency, compactINR } from '../../utils/formatters.js';
import { ChartTooltip } from '../Reports/ReportsOverview.jsx';

const MAX_DROP = 30;

// "What if metal prices fall X%?" - re-runs the coverage ratio for every
// open loan with melt value scaled down, entirely in the browser (the
// coverage endpoint already returns melt value and amount owed per loan).
function simulate(rows, drop, redThreshold, amberThreshold) {
  let red = 0;
  let amber = 0;
  let owedAtRisk = 0;
  let shortfall = 0;
  for (const r of rows) {
    if (r.meltValue == null || !r.amountOwed) continue;
    const melt = r.meltValue * (1 - drop / 100);
    const ratio = melt / r.amountOwed;
    if (ratio <= redThreshold) {
      red += 1;
      owedAtRisk += r.amountOwed;
      shortfall += Math.max(0, r.amountOwed - melt);
    } else if (ratio < amberThreshold) amber += 1;
  }
  return { drop, red, amber, owedAtRisk, shortfall };
}

export default function PriceDropSimulator({ rows, redThreshold, amberThreshold }) {
  const colors = useChartColors();
  const [drop, setDrop] = useState(10);
  const valued = rows.filter((r) => r.meltValue != null && r.amountOwed);

  const curve = useMemo(
    () => Array.from({ length: MAX_DROP + 1 }, (_, d) => simulate(valued, d, redThreshold, amberThreshold)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, redThreshold, amberThreshold]
  );
  const now = curve[0];
  const at = curve[drop];
  if (!valued.length) return null;

  const axisProps = { stroke: colors.muted, tick: { fill: colors.muted, fontSize: 11 }, tickLine: false, axisLine: { stroke: colors.grid } };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 className="section-title" style={{ margin: 0 }}>What if metal prices fall?</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{valued.length} loans with a melt value</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 6px', flexWrap: 'wrap' }}>
        <label htmlFor="drop" style={{ margin: 0, whiteSpace: 'nowrap' }}>
          Price drop <strong className="tabular" style={{ fontSize: 18, color: 'var(--text)' }}>{drop}%</strong>
        </label>
        <input
          id="drop"
          type="range"
          min="0"
          max={MAX_DROP}
          step="1"
          value={drop}
          onChange={(e) => setDrop(Number(e.target.value))}
          style={{ flex: 1, minWidth: 180, accentColor: 'var(--gold-deep)', padding: 0, border: 0, background: 'transparent' }}
        />
      </div>

      <div className="facts" style={{ marginTop: 12 }}>
        <div>
          <div className="fact-label">Loans at risk</div>
          <div className="fact-value is-lg tabular" style={{ color: at.red > now.red ? 'var(--danger)' : undefined }}>
            {at.red}
            {at.red > now.red && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}> (+{at.red - now.red} vs today)</span>}
          </div>
        </div>
        <div>
          <div className="fact-label">To watch</div>
          <div className="fact-value tabular">{at.amber}</div>
        </div>
        <div>
          <div className="fact-label">Owed on at-risk loans</div>
          <div className="fact-value tabular">{formatCurrency(at.owedAtRisk)}</div>
        </div>
        <div>
          <div className="fact-label">Not covered by metal</div>
          <div className="fact-value tabular" style={{ color: at.shortfall > 0 ? 'var(--danger)' : undefined }}>{formatCurrency(at.shortfall)}</div>
        </div>
      </div>

      <div style={{ height: 180, marginTop: 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.danger} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colors.danger} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="drop" tickFormatter={(d) => `${d}%`} {...axisProps} />
            <YAxis tickFormatter={compactINR} width={54} {...axisProps} />
            <Tooltip
              content={(p) => <ChartTooltip {...p} colors={colors} label={p.label != null ? `${p.label}% drop` : null} valueFormatter={formatCurrency} />}
            />
            <ReferenceLine x={drop} stroke={colors.goldDeep} strokeDasharray="4 3" />
            <Area type="monotone" dataKey="shortfall" name="Not covered" stroke={colors.danger} strokeWidth={2} fill="url(#riskFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
        Uses today’s amount owed and melt value, with gold and silver falling by the same %. “Not covered” = amount owed minus melt value on loans that would turn red.
      </div>
    </div>
  );
}
