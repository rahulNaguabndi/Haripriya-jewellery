import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api.js';
import Segmented from '../common/Segmented.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { ListSkeleton, Skeleton } from '../common/Skeleton.jsx';
import { formatDate } from '../../utils/formatters.js';

// Shift-down reshuffle, the way the shop does it: a box with room takes the
// lowest packets of the next box, until that box empties, then on to the
// next. Staff do the physical move, then enter the box's new start/end
// numbers; the app counts what's now in the range and trims the following
// boxes to match. Nothing changes until "Save" - the screen never runs
// ahead of the shelf.

const range = (s, e) => (s == null ? 'free' : `${s}–${e}`);
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function printPickList(box, suggestion) {
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) return;
  const nums = suggestion.packetNumbers.map((n) => `<li>#${n}</li>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pick list · Box ${esc(box.boxNumber)}</title>
<style>body{font-family:Georgia,serif;color:#20160F;margin:32px}h1{font-size:22px;margin:0 0 4px}p{margin:4px 0;font-size:14px}
ol{columns:4;font-family:ui-monospace,monospace;font-size:14px;padding-left:22px;margin:16px 0}li{margin:3px 0}
.row{display:flex;gap:24px;margin:18px 0}.box{border:1.5px solid #B78C3C;border-radius:8px;padding:10px 14px;flex:1}
.k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8A7B5E}.v{font-size:18px;font-weight:600}
.sign{margin-top:40px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #20160F;padding-top:4px;font-size:12px;color:#8A7B5E}</style></head><body>
<h1>Reshuffle pick list</h1><p>${esc(new Date().toLocaleString('en-IN'))}</p>
<div class="row"><div class="box"><div class="k">Take from</div><div class="v">Box ${esc(suggestion.fromBox)}</div><p>${esc(suggestion.fromLocker || '')}</p></div>
<div class="box"><div class="k">Put into</div><div class="v">Box ${esc(box.boxNumber)}</div><p>${esc(box.lockerName || '')}</p></div></div>
<p>Move the <strong>${suggestion.take}</strong> lowest-numbered packets from Box ${esc(suggestion.fromBox)} (the app's estimate - stop when the box is full):</p>
<ol>${nums}</ol>
<p>Then write down Box ${esc(box.boxNumber)}'s new range: <strong>${box.rangeStart} – ______</strong> and enter it in the app.</p>
<div class="sign"><div>Moved by</div><div>Checked by</div></div>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

function BoxRow({ b, selected, onSelect }) {
  const badge = b.isFree
    ? <span className="badge badge-green">empty</span>
    : b.isRunning
    ? <span className="badge badge-unknown">running</span>
    : b.hasSpace
    ? <span className="badge badge-amber">~{b.estFree} free</span>
    : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        width: '100%',
        padding: '10px 14px',
        textAlign: 'left',
        cursor: 'pointer',
        borderColor: selected ? 'var(--gold)' : undefined,
        boxShadow: selected ? 'var(--ring)' : undefined,
      }}
    >
      <span>
        <span className="font-serif" style={{ fontSize: 16, fontWeight: 600 }}>Box <span className="num">{b.boxNumber}</span></span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }} className="tabular">
          {b.lockerName} · {range(b.rangeStart, b.rangeEnd)} · {b.packetCount} packets
        </span>
      </span>
      {badge}
    </button>
  );
}

function Preview({ preview, loading, error }) {
  const [open, setOpen] = useState(false);
  if (error) return <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>;
  if (loading && !preview) return <Skeleton width="100%" height={60} />;
  if (!preview) return null;
  const already = preview.alreadyThere;
  const leaving = preview.packetsBefore - already;
  const parts = [`${already} already in the box`];
  if (preview.incoming) parts.push(`${preview.incoming} coming in from other boxes`);
  if (preview.newlyCovered) parts.push(`${preview.newlyCovered} not in any box until now`);
  if (leaving > 0) parts.push(`${leaving} leaving`);
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
      <div className="font-serif tabular" style={{ fontSize: 22, fontWeight: 600 }}>
        {preview.packetsAfter} packet{preview.packetsAfter === 1 ? '' : 's'} in {preview.to[0]}–{preview.to[1]}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {parts.join(' · ')}
      </div>

      {preview.packets.length > 0 && (
        <button type="button" className="btn btn-ghost" style={{ padding: '4px 0', marginTop: 4 }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'} packet numbers
        </button>
      )}
      {open && (
        <div className="tabular" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0', maxHeight: 180, overflow: 'auto' }}>
          {preview.packets.map((p) => (
            <span key={p.loanId} className={`badge ${p.was === 'other' ? 'badge-amber' : p.was === 'none' ? 'badge-green' : 'badge-unknown'}`} title={p.borrower || ''}>
              #{p.packetNumber}{p.was === 'other' ? ` ← Box ${p.fromBox}` : p.was === 'none' ? ' (new)' : ''}
            </span>
          ))}
        </div>
      )}

      {preview.adjusted.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="fact-label">Following boxes will change</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }} className="tabular">
            {preview.adjusted.map((a) => (
              <li key={a.boxId}>
                Box <span className="num">{a.boxNumber}</span>: {range(a.from[0], a.from[1])} →{' '}
                {a.to ? `${a.to[0]}–${a.to[1]} (${a.packetsAfter} packets)` : <strong style={{ color: 'var(--success)' }}>emptied, now free</strong>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.conflicts.map((c) => (
        <div key={c} style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>{c}</div>
      ))}
      {preview.uncovered.length > 0 && (
        <div style={{ marginTop: 10, color: 'var(--warning)', fontSize: 13 }}>
          {preview.uncovered.length} packet{preview.uncovered.length > 1 ? 's' : ''} would no longer be in any box:{' '}
          <span className="tabular">{preview.uncovered.slice(0, 15).map((n) => `#${n}`).join(', ')}{preview.uncovered.length > 15 ? '…' : ''}</span>. Check the numbers match the shelf.
        </div>
      )}
    </div>
  );
}

function ReshuffleLog({ refreshKey }) {
  const [state, setState] = useState({ loading: true, data: [] });
  useEffect(() => {
    api
      .get('/storage/reshuffle/log')
      .then((res) => setState({ loading: false, data: res.data.data || [] }))
      .catch(() => setState({ loading: false, data: [] }));
  }, [refreshKey]);

  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 className="section-title">Recent reshuffles</h2>
      {state.loading ? (
        <ListSkeleton rows={3} />
      ) : !state.data.length ? (
        <EmptyState compact title="No reshuffles recorded yet" hint="Each saved box range change shows up here, with who made it." />
      ) : (
        <div className="table-wrap table-stack">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Box</th>
                <th>Range</th>
                <th style={{ textAlign: 'right' }}>Packets</th>
                <th>Also changed</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((r) => (
                <tr key={r.id}>
                  <td data-label="When">{formatDate(r.created_at)}</td>
                  <td data-label="Box"><span className="num">{r.box_number}</span> <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.metal_type}</span></td>
                  <td data-label="Range" className="tabular">{range(r.old_start, r.old_end)} → {range(r.new_start, r.new_end)}</td>
                  <td data-label="Packets" className="tabular" style={{ textAlign: 'right' }}>
                    {r.packets_before} → {r.packets_after}{r.box_full ? ' · full' : ''}
                  </td>
                  <td data-label="Also changed" className="tabular" style={{ fontSize: 12.5 }}>
                    {(r.adjusted || []).map((a) => `Box ${a.boxNumber} ${a.to ? `${a.to[0]}–${a.to[1]}` : 'emptied'}`).join(', ') || '—'}
                  </td>
                  <td data-label="By">{r.created_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StorageReshuffle({ canEdit }) {
  const [metal, setMetal] = useState('Gold');
  const [threshold, setThreshold] = useState(10);
  const [plan, setPlan] = useState({ loading: true, data: null, error: null });
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ start: '', end: '', boxFull: false, notes: '' });
  const [preview, setPreview] = useState({ loading: false, data: null, error: null });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [logKey, setLogKey] = useState(0);

  function loadPlan(keepSelected) {
    setPlan((p) => ({ ...p, loading: true }));
    api
      .get('/storage/reshuffle/plan', { params: { metal, threshold } })
      .then((res) => {
        setPlan({ loading: false, data: res.data, error: null });
        if (!keepSelected) setSelectedId(null);
      })
      .catch((err) => setPlan({ loading: false, data: null, error: err.message }));
  }
  useEffect(() => loadPlan(false), [metal, threshold]); // eslint-disable-line react-hooks/exhaustive-deps

  const boxes = plan.data?.boxes || [];
  const selected = useMemo(() => boxes.find((b) => b.id === selectedId) || null, [boxes, selectedId]);
  const withSpace = boxes.filter((b) => b.suggestion);

  // Reset the form whenever a different box is picked.
  useEffect(() => {
    setForm({ start: selected?.rangeStart ?? '', end: selected?.rangeEnd ?? '', boxFull: false, notes: '' });
    setPreview({ loading: false, data: null, error: null });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live count for the numbers typed in (debounced).
  useEffect(() => {
    if (!selected || form.start === '' || form.end === '') {
      setPreview({ loading: false, data: null, error: null });
      return undefined;
    }
    setPreview((p) => ({ ...p, loading: true, error: null }));
    const t = setTimeout(() => {
      api
        .get('/storage/reshuffle/preview', { params: { boxId: selected.id, start: form.start, end: form.end } })
        .then((res) => setPreview({ loading: false, data: res.data, error: null }))
        .catch((err) => setPreview({ loading: false, data: null, error: err.message }));
    }, 350);
    return () => clearTimeout(t);
  }, [selected, form.start, form.end]);

  const unchanged = selected && Number(form.start) === selected.rangeStart && Number(form.end) === selected.rangeEnd;
  const canSave = canEdit && preview.data && !preview.loading && !preview.data.conflicts.length && (!unchanged || form.boxFull);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await api.post('/storage/reshuffle', {
        boxId: selected.id,
        rangeStart: Number(form.start),
        rangeEnd: Number(form.end),
        boxFull: form.boxFull,
        notes: form.notes || null,
      });
      const r = res.data;
      const nextBox = r.adjusted.find((a) => a.to);
      setMessage(
        `Saved Box ${r.box.boxNumber}: ${r.to[0]}–${r.to[1]}, ${r.packetsAfter} packets.` +
          (r.adjusted.length ? ` ${r.adjusted.map((a) => `Box ${a.boxNumber} ${a.to ? `now ${a.to[0]}–${a.to[1]}` : 'is empty'}`).join(', ')}.` : '') +
          (r.logged ? '' : ' (Not added to the reshuffle log - the 2026-10-13 database update is missing.)')
      );
      setLogKey((k) => k + 1);
      loadPlan(true);
      // Carry on down the shelf: the box we just took from is usually next.
      setSelectedId(nextBox ? nextBox.boxId : r.box.id);
    } catch (err) {
      setMessage(null);
      setPreview((p) => ({ ...p, error: err.message }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card" style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Segmented label="Metal" value={metal} onChange={setMetal} options={[{ value: 'Gold', label: 'Gold' }, { value: 'Silver', label: 'Silver' }]} />
        <div className="field" style={{ marginBottom: 0, width: 190 }}>
          <label htmlFor="reshuffle-threshold">Flag boxes with at least</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input id="reshuffle-threshold" type="number" min="1" value={threshold} onChange={(e) => setThreshold(Math.max(1, Number(e.target.value) || 1))} style={{ width: 80 }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>free</span>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', flex: '1 1 260px' }}>
          {plan.data && (
            <>
              Free space is estimated at ~{plan.data.estimate} packets per box{plan.data.learned ? ' (learned)' : ' (starting guess)'}. The numbers you enter are what counts.
            </>
          )}
        </div>
      </div>

      {plan.error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{plan.error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5 items-start">
        <div>
          <div className="fact-label" style={{ marginBottom: 8 }}>
            {metal} boxes in shelf order{withSpace.length ? ` · ${withSpace.length} with space to fill` : ''}
          </div>
          {plan.loading && !plan.data ? (
            <ListSkeleton rows={6} />
          ) : !boxes.length ? (
            <div className="card"><EmptyState compact title={`No ${metal.toLowerCase()} boxes yet`} hint="Add lockers and boxes under Manage first." /></div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {boxes.map((b) => (
                <BoxRow key={b.id} b={b} selected={b.id === selectedId} onSelect={() => setSelectedId(b.id)} />
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20, position: 'sticky', top: 16 }}>
          {!selected ? (
            <EmptyState
              compact
              title="Pick a box to reshuffle"
              hint="Boxes marked “free” have room. After you move packets on the shelf, enter the box's new start and end numbers here."
            />
          ) : (
            <>
              <h2 className="section-title" style={{ marginTop: 0 }}>
                Box <span className="num">{selected.boxNumber}</span>{' '}
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>{selected.lockerName}</span>
              </h2>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }} className="tabular">
                Now {range(selected.rangeStart, selected.rangeEnd)} · {selected.packetCount} packets · ~{selected.estFree} free (estimate)
              </div>

              {selected.suggestion && (
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 13.5 }}>
                    Suggestion: take the next <strong>{selected.suggestion.take}</strong> packets from Box{' '}
                    <span className="num">{selected.suggestion.fromBox}</span>
                    {selected.suggestion.fromLocker && selected.suggestion.fromLocker !== selected.lockerName ? ` (${selected.suggestion.fromLocker})` : ''}
                    {selected.suggestion.emptiesNextBox ? ', which empties it' : ''}.
                  </div>
                  <div className="tabular" style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
                    #{selected.suggestion.packetNumbers.slice(0, 12).join(', #')}
                    {selected.suggestion.packetNumbers.length > 12 ? ` … #${selected.suggestion.suggestedEnd}` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={() => printPickList(selected, selected.suggestion)}>Print pick list</button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setForm((f) => ({ ...f, start: selected.rangeStart, end: selected.suggestion.suggestedEnd }))}
                    >
                      Use end #{selected.suggestion.suggestedEnd}
                    </button>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="field">
                  <label htmlFor="rs-start">Start packet no.</label>
                  <input id="rs-start" type="number" min="1" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} disabled={!canEdit} />
                </div>
                <div className="field">
                  <label htmlFor="rs-end">End packet no.</label>
                  <input id="rs-end" type="number" min="1" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} disabled={!canEdit} />
                </div>
              </div>

              <Preview preview={preview.data} loading={preview.loading} error={preview.error} />

              {canEdit ? (
                <>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, margin: '16px 0 10px', fontWeight: 400 }}>
                    <input type="checkbox" checked={form.boxFull} onChange={(e) => setForm((f) => ({ ...f, boxFull: e.target.checked }))} style={{ width: 'auto' }} />
                    This box is now physically full (teaches the per-box estimate)
                  </label>
                  <div className="field">
                    <label htmlFor="rs-notes">Notes (optional)</label>
                    <input id="rs-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. moved to Godrej rack 2" />
                  </div>
                  <button type="button" className="btn btn-primary" disabled={!canSave || saving} onClick={save}>
                    {saving ? 'Saving…' : 'Save new range'}
                  </button>
                  {unchanged && !form.boxFull && <span style={{ fontSize: 12.5, color: 'var(--text-muted)', marginLeft: 10 }}>Enter the new numbers to save</span>}
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 12 }}>Only admins can save box range changes.</div>
              )}
            </>
          )}
          {message && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--success)' }}>{message}</div>}
        </div>
      </div>

      <ReshuffleLog refreshKey={logKey} />
    </div>
  );
}
