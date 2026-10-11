import { useState } from 'react';
import { api } from '../../services/api.js';
import { useBranch } from '../../context/BranchContext.jsx';
import { useConfirm } from '../common/ConfirmDialog.jsx';

const blank = { name: '', code: '', address: '', phone: '' };

// Shops under this business. Loans, payments, lockers and the day's cash
// close belong to a branch; customers, rates and settings are shared.
export default function BranchesCard({ canEdit }) {
  const { branches, reload } = useBranch();
  const confirm = useConfirm();
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function run(fn, ok) {
    setSaving(true);
    setMessage('');
    try {
      await fn();
      await reload();
      setMessage(ok);
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (await run(() => api.post('/branches', form), 'Branch added.')) setForm(blank);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (await run(() => api.put(`/branches/${editing.id}`, editing), 'Saved.')) setEditing(null);
  }

  async function makeDefault(b) {
    const ok = await confirm({
      title: `Make ${b.name} the default branch?`,
      message: 'New loans created from the "All branches" view go here unless another branch is picked.',
      confirmLabel: 'Make default',
    });
    if (ok) run(() => api.put(`/branches/${b.id}`, { isDefault: true }), `${b.name} is now the default.`);
  }

  async function toggleActive(b) {
    if (b.is_active) {
      const ok = await confirm({
        title: `Deactivate ${b.name}?`,
        message: 'It disappears from the branch switcher and can’t take new loans. Its existing loans and history stay as they are.',
        confirmLabel: 'Deactivate',
        danger: true,
      });
      if (!ok) return;
    }
    run(() => api.put(`/branches/${b.id}`, { isActive: !b.is_active }), b.is_active ? 'Deactivated.' : 'Reactivated.');
  }

  return (
    <div className="card" style={{ padding: 22, marginBottom: 24 }}>
      <h2 className="section-title" style={{ marginBottom: 4 }}>Branches</h2>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
        Each branch has its own loans, lockers and cash close. Customers, gold rates and settings are shared. With more than one branch, a switcher appears in the top bar.
      </div>

      {branches.length === 0 && <div style={{ fontSize: 13.5, color: 'var(--warning)' }}>No branches yet - run the 2026-10-11 database migration in Supabase.</div>}

      {branches.map((b) =>
        editing?.id === b.id ? (
          <form key={b.id} onSubmit={saveEdit} style={{ padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
            <div className="form-row">
              <div className="field"><label>Name</label><input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div className="field" style={{ maxWidth: 140 }}><label>Code</label><input required value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            </div>
            <div className="field"><label>Address</label><input value={editing.address || ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>Save</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {b.name} <span className="num" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {b.code}</span>
              </div>
              {(b.address || b.phone) && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{[b.address, b.phone].filter(Boolean).join(' · ')}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {b.is_default && <span className="badge badge-active">Default</span>}
              {!b.is_active && <span className="badge badge-closed">Inactive</span>}
              {canEdit && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: b.id, name: b.name, code: b.code, phone: b.phone, address: b.address })}>Edit</button>
                  {!b.is_default && b.is_active && <button className="btn btn-ghost btn-sm" onClick={() => makeDefault(b)}>Make default</button>}
                  {!b.is_default && <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(b)}>{b.is_active ? 'Deactivate' : 'Reactivate'}</button>}
                </>
              )}
            </div>
          </div>
        )
      )}

      {canEdit && (
        <form onSubmit={add} style={{ marginTop: 16 }}>
          <div className="form-row">
            <div className="field"><label>New branch name *</label><input required value={form.name} placeholder="e.g. Kodad" onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field" style={{ maxWidth: 140 }}><label>Code *</label><input required value={form.code} placeholder="KDD" maxLength={10} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="field"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <button type="submit" className="btn btn-primary" disabled={saving}>+ Add branch</button>
        </form>
      )}
      {!canEdit && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>Only a super admin can add or change branches.</div>}
      {message && <div style={{ fontSize: 13, marginTop: 10, color: /added|saved|now|activated/i.test(message) ? 'var(--success)' : 'var(--danger)' }}>{message}</div>}
    </div>
  );
}
