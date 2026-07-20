import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

const METAL_TYPES = ['Gold', 'Silver'];

export default function Storage() {
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [lockers, setLockers] = useState([]);
  const [boxes, setBoxes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [newLocker, setNewLocker] = useState({ name: '', metalTypes: [], displayOrder: 0 });
  const [savingLocker, setSavingLocker] = useState(false);

  const [newBox, setNewBox] = useState({ lockerId: '', boxNumber: '', metalType: 'Gold', rangeStart: '', rangeEnd: '' });
  const [savingBox, setSavingBox] = useState(false);
  const [boxOverlapWarning, setBoxOverlapWarning] = useState(null);

  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

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
      await api.post('/lockers', newLocker);
      setNewLocker({ name: '', metalTypes: [], displayOrder: 0 });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingLocker(false);
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

  async function runLookup() {
    const packetNumber = Number(lookupInput);
    if (!packetNumber) return;
    setLookingUp(true);
    setLookupResult(null);
    setError('');
    try {
      const res = await api.get('/boxes/lookup', { params: { packetNumber } });
      setLookupResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLookingUp(false);
    }
  }

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <div className="font-serif" style={{ fontSize: 26, fontWeight: 600, marginBottom: 20 }}>Storage</div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="font-serif" style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Find a Packet</div>
        <div style={{ display: 'flex', gap: 8, maxWidth: 400 }}>
          <input
            type="number"
            placeholder="Packet number"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runLookup()}
          />
          <button className="btn btn-primary" onClick={runLookup} disabled={lookingUp}>
            {lookingUp ? '…' : 'Locate'}
          </button>
        </div>
        {lookupResult && lookupResult.found && (
          <div style={{ marginTop: 14, fontSize: 14 }}>
            <div>
              Loan <b>{lookupResult.loan.loan_number}</b> ({lookupResult.loan.borrowers?.name || 'Unknown borrower'})
            </div>
            <div style={{ marginTop: 4 }}>
              Locker <b>{lookupResult.box.lockers?.name}</b>, Box <b>{lookupResult.box.box_number}</b>
              {' '}(range {lookupResult.box.range_start}–{lookupResult.box.range_end})
            </div>
          </div>
        )}
        {lookupResult && !lookupResult.found && (
          <div style={{ marginTop: 14, fontSize: 14, color: 'var(--text-muted)' }}>{lookupResult.reason}</div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div className="font-serif" style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Lockers</div>
        {lockers.map((l) => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--divider)' }}>
            <div>
              <span style={{ fontWeight: 600 }}>{l.name}</span>{' '}
              <span style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>({(l.metal_types || []).join(', ')})</span>
            </div>
            {canEdit && (
              <button className="btn btn-danger" onClick={() => deleteLocker(l.id)}>Delete</button>
            )}
          </div>
        ))}
        {lockers.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No lockers yet.</div>}

        {canEdit && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Name</label>
              <input value={newLocker.name} onChange={(e) => setNewLocker((l) => ({ ...l, name: e.target.value }))} placeholder="Godrej Steelage" />
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
        <div className="table-wrap">
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
                  <td>{b.box_number}</td>
                  <td>{b.lockers?.name}</td>
                  <td>{b.metal_type}</td>
                  <td>{b.range_start != null ? `${b.range_start}–${b.range_end}` : '—'}</td>
                  {canEdit && (
                    <td>
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
