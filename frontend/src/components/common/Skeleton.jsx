// Reusable loading placeholders. Prefer these over a bare "Loading…" string
// so the page keeps its shape while data is in flight (no layout shift when
// content arrives). All visual styling lives on `.skeleton` in theme.css.

export function Skeleton({ width = '100%', height = 14, radius, style }) {
  return (
    <span
      className="skeleton"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

// A single stat-tile placeholder matching StatCard's dimensions.
export function StatCardSkeleton() {
  return (
    <div className="card" style={{ padding: 20, position: 'relative', overflow: 'hidden' }}>
      <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--divider)' }} />
      <Skeleton width="55%" height={11} style={{ marginBottom: 14 }} />
      <Skeleton width="75%" height={26} />
    </div>
  );
}

// Table placeholder that mirrors a DataTable's header + N body rows, so the
// column layout doesn't jump when the real rows load in.
export function TableSkeleton({ columns = 5, rows = 8 }) {
  return (
    <div className="card table-wrap" aria-busy="true">
      <table>
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}>
                <Skeleton width="60%" height={10} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: columns }).map((_, c) => (
                <td key={c}>
                  <Skeleton width={c === 0 ? '70%' : `${45 + ((r + c) % 4) * 12}%`} height={13} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Generic stacked-line placeholder for list-style cards (e.g. the dashboard's
// Recent Payments rows).
export function ListSkeleton({ rows = 6 }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            padding: '11px 0',
            borderBottom: '1px solid var(--divider)',
          }}
        >
          <Skeleton width={`${30 + (i % 3) * 10}%`} height={13} />
          <Skeleton width={80} height={13} />
        </div>
      ))}
    </div>
  );
}
