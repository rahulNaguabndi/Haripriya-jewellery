import { Link } from 'react-router-dom';
import { Skeleton } from './Skeleton.jsx';

// A dashboard "call to action" tile: a headline metric plus an optional link
// to the page where you'd act on it. `tone` colours the left edge so
// attention-needing tiles (overdue, at-risk) read as urgent at a glance.
const TONES = {
  neutral: 'var(--border)',
  gold: 'var(--gold)',
  amber: 'var(--warning)',
  red: 'var(--danger)',
  green: 'var(--success)',
};

export default function InsightCard({ to, label, value, sublabel, tone = 'neutral', cta, loading }) {
  const body = (
    <>
      <div
        aria-hidden
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, background: TONES[tone] || TONES.neutral }}
      />
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        {label}
      </div>
      {loading ? (
        <Skeleton width="60%" height={24} />
      ) : (
        <div className="font-serif tabular" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>{value}</div>
      )}
      {sublabel && !loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{sublabel}</div>}
      {cta && !loading && (
        <div style={{ fontSize: 12.5, color: 'var(--gold-deep)', fontWeight: 600, marginTop: 12 }}>{cta} →</div>
      )}
    </>
  );

  const style = { padding: 18, paddingLeft: 20, position: 'relative', overflow: 'hidden', display: 'block' };

  if (to) {
    return (
      <Link to={to} className="card card-interactive" style={{ ...style, textDecoration: 'none', color: 'inherit' }}>
        {body}
      </Link>
    );
  }
  return <div className="card" style={style}>{body}</div>;
}
