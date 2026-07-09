export default function Modal({ title, onClose, children, width }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={width ? { width } : undefined} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div className="font-serif" style={{ fontSize: 20, fontWeight: 600 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
