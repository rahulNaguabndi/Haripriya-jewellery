import { useEffect, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { api } from '../../services/api.js';
import { useChartColors, formatMonthLabel } from '../../utils/chartTheme.js';
import { ChartTooltip } from '../Reports/ReportsOverview.jsx';
import { Skeleton, StatCardSkeleton } from '../common/Skeleton.jsx';
import Segmented from '../common/Segmented.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { useConfirm } from '../common/ConfirmDialog.jsx';
import { formatDate } from '../../utils/formatters.js';

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));

export function runwayLabel(days) {
  if (days == null) return 'not filling up';
  if (days < 60) return `~${days} days`;
  if (days < 730) return `~${Math.round(days / 30)} months`;
  return `~${(days / 365).toFixed(1)} years`;
}

// Amber under 3 months of runway, red under 1 month (or already full).
export function runwayTone(metal) {
  if (!metal || !metal.boxesTotal) return 'neutral';
  if (metal.headroom <= 0 || (metal.runwayDays != null && metal.runwayDays < 30)) return 'red';
  if (metal.runwayDays != null && metal.runwayDays < 90) return 'amber';
  return 'green';
}

const TONE_COLOR = { red: 'var(--danger)', amber: 'var(--warning)', green: 'var(--success)', neutral: 'var(--text-muted)' };

function Fact({ label, value, sub }) {
  return (
    <div>
      <div className="fact-label">{label}</div>
      <div className="fact-value is-lg tabular">{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function FillBar({ pct, tone }) {
  const width = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', background: TONE_COLOR[tone] || 'var(--gold)', transition: 'width .4s var(--ease)' }} />
    </div>
  );
}

function MetalCard({ m, canEdit, onEditDefault }) {
  const tone = runwayTone(m);
  const cap = m.capacity;
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{m.metal}</h2>
        <span style={{ fontSize: 13, fontWeight: 600, color: TONE_COLOR[tone] }}>
          {!m.boxesTotal
            ? 'No boxes set up yet'
            : m.runwayDays == null
            ? 'Not filling up: more packets going out than coming in'
            : `Space for ${runwayLabel(m.runwayDays)} at the current pace`}
        </span>
      </div>

      <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text-muted)' }} className="tabular">
        <span>{num(m.packetsInBoxes)} packets in boxes</span>
        <span>est. capacity {num(m.totalCapacity)}{m.occupancyPct != null ? ` · ${m.occupancyPct}% full` : ''}</span>
      </div>
      <FillBar pct={m.occupancyPct} tone={tone} />

      <div className="facts" style={{ marginTop: 18 }}>
        <Fact label="More packets that fit" value={`~${num(m.headroom)}`} sub={`${num(m.freeInBoxes)} in boxes + ${num(m.freeSlots)} empty slots`} />
        <Fact
          label="Net per day"
          value={m.flow.netPerDay > 0 ? `+${m.flow.netPerDay}` : m.flow.netPerDay}
          sub={`last ${m.flow.windowDays} days: ${num(m.flow.added)} in, ${num(m.flow.removed)} out`}
        />
        <Fact
          label="Est. per box"
          value={`~${cap.estimate}`}
          sub={
            <>
              {cap.learned ? `learned from ${cap.sampleCount} box${cap.sampleCount === 1 ? '' : 'es'}` : `starting guess (no full boxes recorded yet)`}
              {canEdit && !cap.learned && (
                <>
                  {' · '}
                  <button type="button" className="btn-link" onClick={onEditDefault} style={{ background: 'none', border: 0, padding: 0, color: 'var(--gold-deep)', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                    change
                  </button>
                </>
              )}
            </>
          }
        />
        <Fact label="Boxes" value={`${num(m.boxesInUse)} / ${num(m.boxesTotal)}`} sub={`in use · ${num(m.freeBoxes)} empty`} />
      </div>

      {(m.notInAnyBox > 0 || m.unnumbered > 0 || m.unknownSlotLockers > 0) && (
        <ul style={{ margin: '16px 0 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--warning)', lineHeight: 1.6 }}>
          {m.notInAnyBox > 0 && <li>{num(m.notInAnyBox)} numbered packets aren't covered by any box range - they aren't counted as filling a box.</li>}
          {m.unnumbered > 0 && <li>{num(m.unnumbered)} older packets have no packet number, so they can't be placed in a box. They take up space that isn't counted here.</li>}
          {m.unknownSlotLockers > 0 && <li>{m.unknownSlotLockers} locker{m.unknownSlotLockers > 1 ? 's have' : ' has'} no slot count, so empty slots there aren't counted. Set it under Manage.</li>}
        </ul>
      )}
    </div>
  );
}

function HistoryChart({ metal }) {
  const colors = useChartColors();
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    setState({ loading: true, data: null, error: null });
    api
      .get('/storage/history', { params: { metal } })
      .then((res) => setState({ loading: false, data: res.data, error: null }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  }, [metal]);

  if (state.loading) return <div className="card" style={{ padding: 20 }}><Skeleton width="40%" height={16} style={{ marginBottom: 16 }} /><Skeleton width="100%" height={240} radius={10} /></div>;
  if (state.error) return <div className="card" style={{ padding: 20, color: 'var(--danger)', fontSize: 13 }}>{state.error}</div>;

  const { months, stats, snapshotDays } = state.data;
  if (!months.length) return <div className="card"><EmptyState compact title={`No ${metal.toLowerCase()} loans yet`} hint="History appears once loans are recorded." /></div>;

  // Spans years, so every tick carries its year ("Oct '24").
  const data = months.map((m) => ({ ...m, label: `${formatMonthLabel(m.month).split(' ')[0]} '${m.month.slice(2, 4)}` }));
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 className="section-title" style={{ margin: 0 }}>{metal} packets in storage over time</h2>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 14 }}>
        Worked out from loan and closure dates since {formatDate(stats.since)}, so it goes back further than the lockers do.
        {snapshotDays > 0 ? ' The dashed line is estimated capacity from nightly snapshots.' : ' Estimated capacity is added from tonight, when the nightly job starts recording it.'}
      </div>

      <div className="facts" style={{ marginBottom: 16 }}>
        <Fact label="Now" value={num(stats.current)} />
        <Fact label="Avg, last 12 months" value={num(stats.avgLast12Months)} />
        <Fact label={`Avg, ${stats.lastCalendarYear}`} value={num(stats.avgLastCalendarYear)} />
        <Fact label="Avg, all time" value={num(stats.avgAllTime)} />
        <Fact label="Peak" value={num(stats.peak.value)} sub={formatDate(stats.peak.date)} />
      </div>

      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id={`occ-${metal}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.gold} stopOpacity={0.35} />
                <stop offset="100%" stopColor={colors.gold} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={colors.grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis tick={{ fill: colors.muted, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip colors={colors} valueFormatter={num} />} />
            <Area type="monotone" dataKey="avg" name="Avg in storage" stroke={colors.goldDeep} strokeWidth={2} fill={`url(#occ-${metal})`} />
            <Line type="stepAfter" dataKey="capacity" name="Est. capacity" stroke={colors.muted} strokeDasharray="5 4" dot={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BoxFillTable({ m }) {
  if (!m.boxes.length) return null;
  const est = m.capacity.estimate;
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 className="section-title">{m.metal} boxes</h2>
      <div className="table-wrap table-stack">
        <table>
          <thead>
            <tr>
              <th>Box</th>
              <th>Locker</th>
              <th>Range</th>
              <th style={{ textAlign: 'right' }}>Packets</th>
              <th style={{ textAlign: 'right' }}>Est. free</th>
              <th style={{ width: '28%' }}>Fill</th>
            </tr>
          </thead>
          <tbody>
            {m.boxes.map((b) => (
              <tr key={b.id}>
                <td data-label="Box" className="num">{b.boxNumber}</td>
                <td data-label="Locker">{b.lockerName}</td>
                <td data-label="Range" className="tabular">{b.rangeStart != null ? `${b.rangeStart}–${b.rangeEnd}` : <span style={{ color: 'var(--text-muted)' }}>free</span>}</td>
                <td data-label="Packets" className="tabular" style={{ textAlign: 'right' }}>{b.packetCount}</td>
                <td data-label="Est. free" className="tabular" style={{ textAlign: 'right' }}>{b.estFree}</td>
                <td data-label="Fill">
                  <FillBar pct={(b.packetCount / est) * 100} tone={b.packetCount >= est ? 'amber' : 'green'} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StorageCapacity({ canEdit }) {
  const confirm = useConfirm();
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [metal, setMetal] = useState('Gold');

  function load() {
    api
      .get('/storage/capacity')
      .then((res) => setState({ loading: false, data: res.data, error: null }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  }
  useEffect(load, []);

  async function editDefault() {
    const input = await confirm({
      title: 'Starting estimate per box',
      message: 'Used until the app learns real figures from boxes marked full during a reshuffle.',
      input: { label: 'Packets per box', type: 'number', min: 1, defaultValue: state.data?.defaultBoxCapacity ?? 20 },
      confirmLabel: 'Save',
    });
    if (input === null) return;
    try {
      await api.put('/storage/settings', { defaultBoxCapacity: Number(input) });
      load();
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    }
  }

  if (state.loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    );
  }
  if (state.error && !state.data) return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{state.error}</div>;

  const current = state.data.metals.find((m) => m.metal === metal);
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {state.error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{state.error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {state.data.metals.map((m) => (
          <MetalCard key={m.metal} m={m} canEdit={canEdit} onEditDefault={editDefault} />
        ))}
      </div>

      <div>
        <Segmented label="Metal" value={metal} onChange={setMetal} options={[{ value: 'Gold', label: 'Gold' }, { value: 'Silver', label: 'Silver' }]} style={{ marginBottom: 14 }} />
        <div style={{ display: 'grid', gap: 20 }}>
          <HistoryChart metal={metal} />
          {current && <BoxFillTable m={current} />}
        </div>
      </div>
    </div>
  );
}
