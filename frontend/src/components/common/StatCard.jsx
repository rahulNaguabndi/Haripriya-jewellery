export default function StatCard({ label, value, sublabel }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div className="font-serif" style={{ fontSize: 28, fontWeight: 600 }}>{value}</div>
      {sublabel && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{sublabel}</div>}
    </div>
  );
}
