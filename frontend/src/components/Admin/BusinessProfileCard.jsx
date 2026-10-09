import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { Skeleton } from '../common/Skeleton.jsx';

const FIELDS = [
  { key: 'legalName', column: 'legal_name', label: 'Legal name *', placeholder: 'As registered' },
  { key: 'tradeName', column: 'trade_name', label: 'Trade / shop name' },
  { key: 'address', column: 'address', label: 'Address', wide: true },
  { key: 'phone', column: 'phone', label: 'Phone' },
  { key: 'email', column: 'email', label: 'Email' },
  { key: 'licenceNumber', column: 'licence_number', label: 'Money-lending / pawnbroker licence no.' },
  { key: 'gstin', column: 'gstin', label: 'GSTIN' },
  { key: 'jurisdiction', column: 'jurisdiction', label: 'Courts of jurisdiction', placeholder: 'e.g. Kodad' },
];

// Legal identity printed on the pledge form and quoted in WhatsApp/SMS notices.
export default function BusinessProfileCard({ canEdit }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .get('/business-profile')
      .then((res) => setForm(Object.fromEntries(FIELDS.map((f) => [f.key, res.data[f.column] ?? '']))))
      .catch((err) => setMessage(err.message));
  }, []);

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      await api.put('/business-profile', form);
      setMessage('Saved.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 24 }}>
      <div className="font-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Business Profile</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
        Printed on the pledge form and used in WhatsApp/SMS notices.
      </div>
      {!form ? (
        <Skeleton height={120} />
      ) : (
        <>
          <div className="form-row">
            {FIELDS.map((f) => (
              <div key={f.key} className="field" style={f.wide ? { flexBasis: '100%' } : undefined}>
                <label>{f.label}</label>
                <input
                  value={form[f.key]}
                  placeholder={f.placeholder}
                  disabled={!canEdit}
                  onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {canEdit && (
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.legalName}>
                {saving ? 'Saving…' : 'Save profile'}
              </button>
            )}
            {message && <span style={{ fontSize: 13, color: message === 'Saved.' ? 'var(--success)' : 'var(--danger)' }}>{message}</span>}
          </div>
        </>
      )}
    </div>
  );
}
