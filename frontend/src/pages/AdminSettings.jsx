import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import AdminUserModal from '../components/Admin/AdminUserModal.jsx';
import BusinessProfileCard from '../components/Admin/BusinessProfileCard.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { ACCENT_PRESETS } from '../theme/accents.js';

// Editable in the Branding UI below. gold/goldDeep are deliberately excluded
// — those are covered by the "Accent color" picker above, and a personal
// accent choice always overrides a brand gold/goldDeep at runtime (see
// ThemeContext.jsx), so exposing them here would be edits that never
// visibly apply.
const BRAND_TOKENS = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'border', label: 'Border' },
  { key: 'divider', label: 'Divider' },
  { key: 'hover', label: 'Hover' },
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Text (muted)' },
  { key: 'text3', label: 'Text (secondary)' },
  { key: 'ink', label: 'Ink (nav/buttons)' },
  { key: 'inkHover', label: 'Ink hover' },
  { key: 'danger', label: 'Danger' },
  { key: 'dangerSoft', label: 'Danger (soft)' },
  { key: 'success', label: 'Success' },
  { key: 'successSoft', label: 'Success (soft)' },
  { key: 'warning', label: 'Warning' },
  { key: 'warningSoft', label: 'Warning (soft)' },
];

export default function AdminSettings() {
  const { theme, accent, toggleTheme, setAccent, brandColors, applyBrandColors } = useTheme();
  const [config, setConfig] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [noticeConfig, setNoticeConfig] = useState(null);
  const [thresholdMonths, setThresholdMonths] = useState([]);
  const [costAmount, setCostAmount] = useState(0);
  const [savingNotices, setSavingNotices] = useState(false);
  const [redThreshold, setRedThreshold] = useState(1.0);
  const [amberThreshold, setAmberThreshold] = useState(1.1);
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [role, setRole] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [draftColors, setDraftColors] = useState(null);
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    if (brandColors && !draftColors) setDraftColors(brandColors);
  }, [brandColors, draftColors]);

  function updateBrandColor(mode, key, value) {
    setDraftColors((c) => ({ ...c, [mode]: { ...c[mode], [key]: value } }));
  }

  async function saveBranding() {
    setSavingBranding(true);
    setError('');
    try {
      const res = await api.put('/admin/branding', { colors: draftColors });
      applyBrandColors(res.data.colors);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBranding(false);
    }
  }

  async function loadAll() {
    try {
      const [meRes, configRes, noticeRes, coverageRes, usersRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/admin/config/interest'),
        api.get('/admin/config/notices'),
        api.get('/admin/config/coverage'),
        api.get('/admin/users'),
      ]);
      setRole(meRes.data.adminProfile?.role || null);
      setConfig(configRes.data);
      setTiers(configRes.data.tiers || []);
      setNoticeConfig(noticeRes.data);
      setThresholdMonths(noticeRes.data.threshold_months || []);
      setCostAmount(noticeRes.data.cost_amount ?? 0);
      setRedThreshold(coverageRes.data.red_threshold ?? 1.0);
      setAmberThreshold(coverageRes.data.amber_threshold ?? 1.1);
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

  function updateThreshold(index, value) {
    setThresholdMonths((m) => m.map((v, i) => (i === index ? value : v)));
  }

  function addThreshold() {
    setThresholdMonths((m) => [...m, 0]);
  }

  function removeThreshold(index) {
    setThresholdMonths((m) => m.filter((_, i) => i !== index));
  }

  async function saveNoticeConfig() {
    setSavingNotices(true);
    setError('');
    try {
      await api.put('/admin/config/notices', {
        thresholdMonths: thresholdMonths.map(Number),
        costAmount: Number(costAmount),
      });
      loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingNotices(false);
    }
  }

  async function saveCoverageConfig() {
    setSavingCoverage(true);
    setError('');
    try {
      await api.put('/admin/config/coverage', {
        redThreshold: Number(redThreshold),
        amberThreshold: Number(amberThreshold),
      });
      loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCoverage(false);
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
        <div className="font-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>Branding</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
          This deployment's own color palette — unlike the Accent picker above (a personal preference), this
          applies for every user of this app and is meant to be set once per business.
        </div>
        {!draftColors && <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>}
        {draftColors && !canEditConfig && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Only admin / super admin roles can edit branding.</div>
        )}
        {draftColors && canEditConfig && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {['light', 'dark'].map((mode) => (
                <div key={mode}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, textTransform: 'capitalize' }}>{mode} mode</div>
                  {BRAND_TOKENS.map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <label style={{ marginBottom: 0, fontWeight: 400, fontSize: 13 }}>{label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {draftColors[mode][key]}
                        </span>
                        <input
                          type="color"
                          value={draftColors[mode][key]}
                          onChange={(e) => updateBrandColor(mode, key, e.target.value)}
                          style={{ width: 34, height: 34, padding: 2, cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={saveBranding} disabled={savingBranding} style={{ marginTop: 16 }}>
              {savingBranding ? 'Saving…' : 'Save Branding'}
            </button>
          </>
        )}
      </div>

      {role && <BusinessProfileCard canEdit={canEditConfig} />}

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

      <div className="card" style={{ padding: 22, marginBottom: 24 }}>
        <div className="font-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Overdue Notices</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
          Month thresholds (since loan date) at which a registered-post notice is due, plus the flat,
          non-compounding cost added to the amount owed each time one is sent.
        </div>

        <div className="field" style={{ maxWidth: 200, marginBottom: 16 }}>
          <label>Notice cost (₹)</label>
          <input type="number" value={costAmount} disabled={!canEditConfig} onChange={(e) => setCostAmount(e.target.value)} />
        </div>

        <label>Thresholds (months)</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {thresholdMonths.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                value={m}
                disabled={!canEditConfig}
                onChange={(e) => updateThreshold(i, e.target.value)}
                style={{ width: 80 }}
              />
              {canEditConfig && (
                <button className="btn btn-danger" onClick={() => removeThreshold(i)}>×</button>
              )}
            </div>
          ))}
        </div>

        {canEditConfig && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={addThreshold}>+ Add Threshold</button>
            <button className="btn btn-primary" onClick={saveNoticeConfig} disabled={savingNotices}>
              {savingNotices ? 'Saving…' : 'Save Notice Settings'}
            </button>
          </div>
        )}
        {!canEditConfig && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Only admin / super admin roles can edit notice settings.
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 24 }}>
        <div className="font-serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Coverage Thresholds</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
          Ratio = today's melt value ÷ amount owed. Red = at risk, Amber = watch, Green = healthy.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Red threshold (ratio ≤)</label>
            <input type="number" step="0.01" value={redThreshold} disabled={!canEditConfig} onChange={(e) => setRedThreshold(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Amber threshold (ratio &lt;)</label>
            <input type="number" step="0.01" value={amberThreshold} disabled={!canEditConfig} onChange={(e) => setAmberThreshold(e.target.value)} />
          </div>
        </div>
        {canEditConfig && (
          <button className="btn btn-primary" onClick={saveCoverageConfig} disabled={savingCoverage}>
            {savingCoverage ? 'Saving…' : 'Save Coverage Settings'}
          </button>
        )}
        {!canEditConfig && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
            Only admin / super admin roles can edit coverage thresholds.
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
