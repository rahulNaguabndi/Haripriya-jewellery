import { useState } from 'react';

// On phones the filters collapse behind a "Filters" toggle so the results
// aren't pushed below the fold; from `sm` up they're always shown inline.
// alwaysOpen: the caller already has its own show/hide toggle (Borrowers).
export default function FilterBar({ fields, values, onChange, onReset, alwaysOpen = false }) {
  const [open, setOpen] = useState(alwaysOpen);
  const activeCount = fields.filter((f) => values[f.name] !== undefined && values[f.name] !== '').length;

  return (
    <div className="mb-4">
      <button
        type="button"
        className={`btn btn-secondary sm:hidden${alwaysOpen ? ' hidden' : ''}`}
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: open ? 8 : 0 }}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Filters{activeCount ? ` (${activeCount} active)` : ''}</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      <div className={`card ${open ? 'grid' : 'hidden'} grid-cols-2 sm:flex flex-wrap items-end gap-3.5 p-4`}>
        {fields.map((field) => (
          <div key={field.name} className="w-full sm:w-auto filter-field" style={{ '--fw': `${field.width || 160}px` }}>
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
        <button className="btn btn-secondary col-span-2 sm:col-auto" onClick={onReset} style={{ height: 40 }}>
          Reset
        </button>
      </div>
    </div>
  );
}
