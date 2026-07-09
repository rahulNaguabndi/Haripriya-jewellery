import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import { api } from '../../services/api.js';

export default function AdminUserModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'staff' });
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
      await api.post('/admin/users', form);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New Admin User" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Full Name *</label>
          <input required value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </div>
        <div className="field">
          <label>Email *</label>
          <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="field">
          <label>Temporary Password *</label>
          <input type="password" required value={form.password} onChange={(e) => set('password', e.target.value)} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
