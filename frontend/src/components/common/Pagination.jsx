export default function Pagination({ page, limit, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / limit));
  if (totalPages <= 1) return null;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 13 }}>
      <div style={{ color: 'var(--text-muted)' }}>
        {total} total · Page {page} of {totalPages}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Prev
        </button>
        <button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
