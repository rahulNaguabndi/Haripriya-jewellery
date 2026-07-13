export default function FilterBar({ fields, values, onChange, onReset }) {
  return (
    <div className="card flex flex-wrap items-end gap-3.5 mb-4 p-4">
      {fields.map((field) => (
        <div key={field.name} className="w-full sm:w-auto" style={{ minWidth: field.width || 160 }}>
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
