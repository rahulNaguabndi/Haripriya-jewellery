import { Skeleton } from './Skeleton.jsx';

export default function StatCard({ label, value, sublabel, loading }) {
  return (
    <div className="card card-interactive" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'linear-gradient(90deg, var(--gold-deep), var(--gold))',
          opacity: 0.9,
        }}
      />
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        {label}
      </div>
      {loading ? (
        <Skeleton width="70%" height={26} />
      ) : (
        <div className="font-serif tabular" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.05 }}>{value}</div>
      )}
      {sublabel && !loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{sublabel}</div>}
    </div>
  );
}
