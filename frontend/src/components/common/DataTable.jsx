import EmptyState from './EmptyState.jsx';

// emptyMessage: string (shown as the empty-state title) or a full element.
export default function DataTable({ columns, rows, emptyMessage, emptyHint, onRowClick }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="card">
        {typeof emptyMessage === 'object' && emptyMessage ? emptyMessage : <EmptyState title={emptyMessage || 'Nothing here yet'} hint={emptyHint} compact />}
      </div>
    );
  }

  return (
    <div className="card table-wrap table-stack">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id || i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} data-label={col.label}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
