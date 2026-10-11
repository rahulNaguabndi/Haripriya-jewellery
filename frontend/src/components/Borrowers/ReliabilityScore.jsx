import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { Skeleton } from '../common/Skeleton.jsx';

export const BAND_META = {
  excellent: { label: 'Excellent', color: 'var(--success)' },
  good: { label: 'Good', color: 'var(--gold-deep)' },
  watch: { label: 'Watch', color: 'var(--warning)' },
  risky: { label: 'Risky', color: 'var(--danger)' },
  new: { label: 'New customer', color: 'var(--text-muted)' },
};

export function ScoreBadge({ score, band }) {
  const meta = BAND_META[band] || BAND_META.new;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: meta.color, whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: meta.color }} />
      {band === 'new' ? meta.label : <><span className="tabular">{score}</span> · {meta.label}</>}
    </span>
  );
}

// Score ring + the factors behind it, for the borrower detail page.
export default function ReliabilityScore({ borrowerId, refreshKey }) {
  const [data, setData] = useState(undefined);

  useEffect(() => {
    api
      .get('/reports/borrower-scores', { params: { borrowerId } })
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, [borrowerId, refreshKey]);

  if (data === undefined) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <Skeleton width="40%" height={14} style={{ marginBottom: 14 }} />
        <Skeleton width={84} height={84} radius={999} />
      </div>
    );
  }
  if (!data) return null;

  const meta = BAND_META[data.band] || BAND_META.new;
  const pct = data.band === 'new' ? 0 : data.score;
  const r = 34;
  const circ = 2 * Math.PI * r;

  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 className="section-title" style={{ marginTop: 0 }}>Reliability</h2>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Score ${data.score} of 100, ${meta.label}`}>
          <circle cx="42" cy="42" r={r} fill="none" stroke="var(--divider)" strokeWidth="8" />
          <circle
            cx="42"
            cy="42"
            r={r}
            fill="none"
            stroke={meta.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            transform="rotate(-90 42 42)"
          />
          <text x="42" y="47" textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text)" style={{ fontVariantNumeric: 'lining-nums tabular-nums' }}>
            {data.band === 'new' ? '—' : data.score}
          </text>
        </svg>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, color: meta.color, marginBottom: 6 }}>{meta.label}</div>
          {data.factors.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Not enough history yet - starts at {data.base}.</div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {data.factors.map((f) => (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-3)' }}>{f.label} ×{f.count}</span>
                  <span className="tabular" style={{ fontWeight: 600, color: f.points >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {f.points > 0 ? '+' : ''}{f.points}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>Starts at {data.base}; a guide for the counter, not a rule.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
