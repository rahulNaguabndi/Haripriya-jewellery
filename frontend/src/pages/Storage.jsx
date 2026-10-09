import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import StorageVisual from '../components/Storage/StorageVisual.jsx';
import { ListSkeleton } from '../components/common/Skeleton.jsx';

const METAL_TYPES = ['Gold', 'Silver'];

export default function Storage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'manage' ? 'manage' : 'visual';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="font-serif" style={{ fontSize: 26, fontWeight: 600 }}>Storage</div>
        <div style={{ display: 'flex', gap: 6 }} role="tablist">
          {[['visual', 'Lockers'], ['manage', 'Manage']].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className="btn"
              onClick={() => setParams(key === 'manage' ? { tab: 'manage' } : {})}
              style={{
                background: tab === key ? 'var(--ink)' : 'var(--surface)',
                color: tab === key ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'visual' ? <StorageVisual /> : <StorageManage />}
    </div>
  );
}

function StorageManage() {
  const [role, setRole] = useState(null);
  const [lockers, setLockers] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [newLocker, setNewLocker] = useState({ name: '', metalTypes: [], displayOrder: 0, boxCapacity: '' });
  const [savingLocker, setSavingLocker] = useState(false);

  const [newBox, setNewBox] = useState({ lockerId: '', boxNumber: '', metalType: 'Gold', rangeStart: '', rangeEnd: '' });
  const [savingBox, setSavingBox] = useState(false);
  const [boxOverlapWarning, setBoxOverlapWarning] = useState(null);


  async function load() {
    setLoading(true);
    try {
      const [meRes, lockersRes, boxesRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/lockers'),
        api.get('/boxes'),
      ]);
      setRole(meRes.data.adminProfile?.role || null);
      setLockers(lockersRes.data.data || []);
      setBoxes(boxesRes.data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const canEdit = role === 'admin' || role === 'super_admin';

  function toggleMetalType(metalType) {
    setNewLocker((l) => ({
      ...l,
      metalTypes: l.metalTypes.includes(metalType)
        ? l.metalTypes.filter((m) => m !== metalType)
        : [...l.metalTypes, metalType],
    }));
  }

  async function addLocker() {
    if (!newLocker.name || newLocker.metalTypes.length === 0) {
      setError('Locker needs a name and at least one metal type.');
      return;
    }
    setSavingLocker(true);
    setError('');
    try {
      await api.post('/lockers', {
        ...newLocker,
        boxCapacity: newLocker.boxCapacity === '' ? null : Number(newLocker.boxCapacity),
      });
      setNewLocker({ name: '', metalTypes: [], displayOrder: 0, boxCapacity: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingLocker(false);
    }
  }

  async function editCapacity(locker) {
    const input = prompt(`How many box slots does ${locker.name} hold? (blank = unknown)`, locker.box_capacity ?? '');
    if (input === null) return;
    try {
      await api.put(`/lockers/${locker.id}`, { boxCapacity: input.trim() === '' ? null : Number(input) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteLocker(id) {
    if (!confirm('Delete this locker?')) return;
    try {
      await api.delete(`/lockers/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addBox() {
    if (!newBox.lockerId || !newBox.boxNumber) {
      setError('Box needs a locker and a box number.');
      return;
    }
    setSavingBox(true);
    setError('');
    setBoxOverlapWarning(null);
    try {
      const res = await api.post('/boxes', {
        lockerId: newBox.lockerId,
        boxNumber: newBox.boxNumber,
        metalType: newBox.metalType,
        rangeStart: newBox.rangeStart === '' ? null : Number(newBox.rangeStart),
        rangeEnd: newBox.rangeEnd === '' ? null : Number(newBox.rangeEnd),
      });
      if (res.data.overlaps?.length > 0) {
        setBoxOverlapWarning(
          `Heads up: this range overlaps ${res.data.overlaps.map((b) => `Box ${b.box_number}`).join(', ')} - you may want to trim those too.`
        );
      }
      setNewBox({ lockerId: '', boxNumber: '', metalType: 'Gold', rangeStart: '', rangeEnd: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBox(false);
    }
  }

  async function deleteBox(id) {
    if (!confirm('Delete this box?')) return;
    try {
      await api.delete(`/boxes/${id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <ListSkeleton rows={6} />;

  return (
    <div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="font-serif" style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Lockers</div>
        {lockers.map((l) => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{l.name}</span>{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>({(l.metal_types || []).join(', ')})</span>{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>· {l.box_capacity ? `${l.box_capacity} box slots` : 'capacity not set'}</span>
            </div>
            {canEdit && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary" onClick={() => editCapacity(l)}>Capacity</button>
                <button className="btn btn-danger" onClick={() => deleteLocker(l.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {lockers.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No lockers yet.</div>}

        {canEdit && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Name</label>
              <input value={newLocker.name} onChange={(e) => setNewLocker((l) => ({ ...l, name: e.target.value }))} placeholder="Godrej" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Metal Types</label>
              <div style={{ display: 'flex', gap: 10, height: 40, alignItems: 'center' }}>
                {METAL_TYPES.map((m) => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
                    <input type="checkbox" checked={newLocker.metalTypes.includes(m)} onChange={() => toggleMetalType(m)} style={{ width: 'auto' }} />
                    {m}
                  </label>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, width: 110 }}>
              <label>Box slots</label>
              <input type="number" min="1" value={newLocker.boxCapacity} onChange={(e) => setNewLocker((l) => ({ ...l, boxCapacity: e.target.value }))} placeholder="e.g. 100" />
            </div>
            <div className="field" style={{ marginBottom: 0, width: 100 }}>
              <label>Order</label>
              <input type="number" value={newLocker.displayOrder} onChange={(e) => setNewLocker((l) => ({ ...l, displayOrder: Number(e.target.value) }))} />
            </div>
            <button className="btn btn-primary" onClick={addLocker} disabled={savingLocker}>
              {savingLocker ? '…' : '+ Add Locker'}
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="font-serif" style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Boxes</div>
        {boxOverlapWarning && (
          <div style={{ fontSize: 12.5, color: 'var(--warning)', marginBottom: 10 }}>{boxOverlapWarning}</div>
        )}
        <div className="table-wrap table-stack">
          <table>
            <thead>
              <tr>
                <th>Box #</th>
                <th>Locker</th>
                <th>Metal</th>
                <th>Range</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {boxes.map((b) => (
                <tr key={b.id}>
                  <td data-label="Box #">{b.box_number}</td>
                  <td data-label="Locker">{b.lockers?.name}</td>
                  <td data-label="Metal">{b.metal_type}</td>
                  <td data-label="Range">{b.range_start != null ? `${b.range_start}–${b.range_end}` : '—'}</td>
                  {canEdit && (
                    <td data-label="">
                      <button className="btn btn-danger" onClick={() => deleteBox(b.id)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {boxes.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>No boxes yet.</div>}

        {canEdit && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Locker</label>
              <select value={newBox.lockerId} onChange={(e) => setNewBox((b) => ({ ...b, lockerId: e.target.value }))}>
                <option value="">Select…</option>
                {lockers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, width: 110 }}>
              <label>Box #</label>
              <input value={newBox.boxNumber} onChange={(e) => setNewBox((b) => ({ ...b, boxNumber: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Metal</label>
              <select value={newBox.metalType} onChange={(e) => setNewBox((b) => ({ ...b, metalType: e.target.value }))}>
                {METAL_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0, width: 110 }}>
              <label>Range Start</label>
              <input type="number" value={newBox.rangeStart} onChange={(e) => setNewBox((b) => ({ ...b, rangeStart: e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom: 0, width: 110 }}>
              <label>Range End</label>
              <input type="number" value={newBox.rangeEnd} onChange={(e) => setNewBox((b) => ({ ...b, rangeEnd: e.target.value }))} />
            </div>
            <button className="btn btn-primary" onClick={addBox} disabled={savingBox}>
              {savingBox ? '…' : '+ Add Box'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
