// Composed empty state: a small gold mark, a title, a hint about what to do
// next and an optional action - instead of a lone grey sentence.
export default function EmptyState({ title, hint, action, mark = '◇', compact }) {
  return (
    <div className="empty-state" style={compact ? { padding: '24px 16px' } : undefined}>
      <div className="empty-state-mark" aria-hidden>{mark}</div>
      <div className="empty-state-title">{title}</div>
      {hint && <div className="empty-state-hint">{hint}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}
