export default function FilterBar({ fields, values, onChange, onReset }) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
      {fields.map((field) => (
        <div key={field.name} style={{ minWidth: field.width || 160 }}>
          <label style={{ marginBottom: 4 }}>{field.label}</label>
          {field.type === 'select' ? (
            <select value={values[field.name] || ''} onChange={(e) => onChange(field.name, e.target.value)}>
              <option value="">All</option>
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={field.type || 'text'}
              value={values[field.name] || ''}
              placeholder={field.placeholder}
              onChange={(e) => onChange(field.name, e.target.value)}
            />
          )}
        </div>
      ))}
      <button className="btn btn-secondary" onClick={onReset} style={{ height: 40 }}>
        Reset
      </button>
    </div>
  );
}
