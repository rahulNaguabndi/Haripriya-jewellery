import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import { api } from '../../services/api.js';

const empty = { name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '', aadharOrId: '', careOf: '' };

export default function BorrowerModal({ borrower, onClose, onSaved }) {
  const [form, setForm] = useState(borrower ? { ...empty, ...borrower, aadharOrId: borrower.aadhar_or_id, careOf: borrower.care_of } : empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      let saved;
      if (borrower) {
        saved = await api.put(`/borrowers/${borrower.id}`, form);
      } else {
        saved = await api.post('/borrowers', form);
      }
      onSaved(saved.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={borrower ? 'Edit Borrower' : 'New Borrower'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Name *</label>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Phone</label>
            <input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Email</label>
            <input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Address</label>
          <input value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>City</label>
            <input value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>State</label>
            <input value={form.state || ''} onChange={(e) => set('state', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Pincode</label>
            <input value={form.pincode || ''} onChange={(e) => set('pincode', e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Aadhar / ID Proof</label>
          <input value={form.aadharOrId || ''} onChange={(e) => set('aadharOrId', e.target.value)} />
        </div>
        <div className="field">
          <label>C/O</label>
          <input value={form.careOf || ''} onChange={(e) => set('careOf', e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
