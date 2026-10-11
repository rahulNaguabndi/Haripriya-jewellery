import { formatCurrency } from '../../utils/formatters.js';

export const WAIVER_REASONS = [
  'Grace period - just past the 1-year mark',
  'Long-standing / known customer',
  'Rounded off at the counter',
  'Other',
];

// Shown under "Interest collected" on close/rollover. Staff always quote the
// system figure; if the customer negotiates it down, the reduction needs a
// reason, which is saved on the loan and in the activity log.
// value: { preset, note } - combine with waiverReasonText() before sending.
export default function InterestWaiverFields({ calculated, collected, value, onChange }) {
  if (calculated == null) return null;
  const reduction = Math.max(0, Math.round((Number(calculated) - Number(collected || 0)) * 100) / 100);
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <div style={{ marginTop: -6, marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
        System-calculated interest: <strong className="tabular" style={{ color: 'var(--text)' }}>{formatCurrency(calculated)}</strong>
      </div>
      {collected !== '' && reduction > 0 && (
        <div style={{ marginTop: 10, background: 'var(--warning-soft)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
          <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600, marginBottom: 8 }}>
            Reducing interest by <span className="tabular">{formatCurrency(reduction)}</span> — reason required
          </div>
          <div className="field" style={{ marginBottom: value.preset === 'Other' ? 8 : 0 }}>
            <label style={{ fontSize: 11.5 }}>Reason *</label>
            <select required value={value.preset} onChange={(e) => set({ preset: e.target.value })}>
              <option value="">Select a reason…</option>
              {WAIVER_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {value.preset && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11.5 }}>{value.preset === 'Other' ? 'Details *' : 'Note (optional)'}</label>
              <input
                required={value.preset === 'Other'}
                value={value.note}
                placeholder={value.preset === 'Other' ? 'Why was the interest reduced?' : 'e.g. closed 4 days after the 1-year mark'}
                onChange={(e) => set({ note: e.target.value })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function waiverReasonText({ preset, note }) {
  if (!preset) return '';
  if (preset === 'Other') return (note || '').trim();
  return note?.trim() ? `${preset} - ${note.trim()}` : preset;
}

export function needsWaiverReason(calculated, collected, value) {
  if (calculated == null || collected === '') return false;
  return Number(collected) < Number(calculated) && !waiverReasonText(value);
}
