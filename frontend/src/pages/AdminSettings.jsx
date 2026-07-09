import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import AdminUserModal from '../components/Admin/AdminUserModal.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { ACCENT_PRESETS } from '../theme/accents.js';

export default function AdminSettings() {
  const { theme, accent, toggleTheme, setAccent } = useTheme();
  const [config, setConfig] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [role, setRole] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);

  async function loadAll() {
    try {
      const [meRes, configRes, usersRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/admin/config/interest'),
        api.get('/admin/users'),
      ]);
      setRole(meRes.data.adminProfile?.role || null);
      setConfig(configRes.data);
      setTiers(configRes.data.tiers || []);
      setAdminUsers(usersRes.data.data);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const canEditConfig = role === 'admin' || role === 'super_admin';
  const isSuperAdmin = role === 'super_admin';

  function updateTier(index, field, value) {
    setTiers((t) => t.map((tier, i) => (i === index ? { ...tier, [field]: value } : tier)));
  }

  function addTier() {
    setTiers((t) => [...t, { minAmount: 0, maxAmount: null, interestRate: 24, description: '' }]);
  }

  function removeTier(index) {
    setTiers((t) => t.filter((_, i) => i !== index));
  }

  async function saveTiers() {
    setSaving(true);
    setError('');
    try {
      const payload = tiers.map((t) => ({
        minAmount: Number(t.minAmount),
        maxAmount: t.maxAmount === '' || t.maxAmount == null ? null : Number(t.maxAmount),
        interestRate: Number(t.interestRate),
        description: t.description || '',
      }));
      await api.put('/admin/config/interest', { tiers: payload });
      loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivateUser(id) {
    if (!confirm('Deactivate this admin user?')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!config) return <div>Loading…</div>;

  return (
    <div>
      <div className="font-serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Admin Settings</div>

      <div className="card" style={{ padding: 22, marginBottom: 24 }}>
        <div className="font-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Appearance</div>
        <div style={{ marginBottom: 16 }}>
          <label>Mode</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn"
              onClick={() => theme !== 'light' && toggleTheme()}
              style={{
                background: theme === 'light' ? 'var(--ink)' : 'var(--surface)',
                color: theme === 'light' ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              ☀️ Light
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => theme !== 'dark' && toggleTheme()}
              style={{
                background: theme === 'dark' ? 'var(--ink)' : 'var(--surface)',
                color: theme === 'dark' ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              🌙 Dark
            </button>
          </div>
        </div>
        <div>
          <label>Accent color</label>
          <div style={{ display: 'flex', gap: 12 }}>
            {Object.entries(ACCENT_PRESETS).map(([key, preset]) => (
              <button
                type="button"
                key={key}
                onClick={() => setAccent(key)}
                title={preset.label}
                aria-label={`Use ${preset.label} accent`}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: preset.swatch,
                  border: accent === key ? '3px solid var(--text)' : '3px solid transparent',
                  boxShadow: '0 0 0 1px var(--border)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Applies immediately and is saved to your profile — it'll follow you next time you sign in.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 24 }}>
        <div className="font-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Interest Tiers</div>
        {tiers.map((tier, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Min Amount</label>
              <input type="number" value={tier.minAmount} disabled={!canEditConfig} onChange={(e) => updateTier(i, 'minAmount', e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Max Amount</label>
              <input
                type="number"
                placeholder="Unlimited"
                value={tier.maxAmount ?? ''}
                disabled={!canEditConfig}
                onChange={(e) => updateTier(i, 'maxAmount', e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Interest Rate (%)</label>
              <input type="number" value={tier.interestRate} disabled={!canEditConfig} onChange={(e) => updateTier(i, 'interestRate', e.target.value)} />
            </div>
            <div className="field" style={{ flex: 2, marginBottom: 0 }}>
              <label>Description</label>
              <input value={tier.description || ''} disabled={!canEditConfig} onChange={(e) => updateTier(i, 'description', e.target.value)} />
            </div>
            {canEditConfig && (
              <button className="btn btn-danger" onClick={() => removeTier(i)} style={{ height: 40 }}>
                Remove
              </button>
            )}
          </div>
        ))}
        {canEditConfig && (
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={addTier}>+ Add Tier</button>
            <button className="btn btn-primary" onClick={saveTiers} disabled={saving}>
              {saving ? 'Saving…' : 'Save Tiers'}
            </button>
          </div>
        )}
        {!canEditConfig && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Only admin / super admin roles can edit interest tiers.
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="font-serif" style={{ fontSize: 18, fontWeight: 600 }}>Admin Users</div>
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={() => setShowUserModal(true)}>+ New Admin User</button>
          )}
        </div>
        {adminUsers.map((u) => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{u.full_name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({u.role})</span></div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{u.email}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span className={`badge ${u.is_active ? 'badge-active' : 'badge-closed'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
              {isSuperAdmin && u.is_active && (
                <button className="btn btn-danger" onClick={() => deactivateUser(u.id)}>Deactivate</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showUserModal && (
        <AdminUserModal
          onClose={() => setShowUserModal(false)}
          onSaved={() => {
            setShowUserModal(false);
            loadAll();
          }}
        />
      )}
    </div>
  );
}
