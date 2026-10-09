import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api.js';
import StatusBadge from '../common/StatusBadge.jsx';
import { Skeleton, ListSkeleton } from '../common/Skeleton.jsx';
import { formatCurrency, compactINR } from '../../utils/formatters.js';

const MAX_STRIP = 300; // only draw the per-packet strip for reasonably sized ranges

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Breadcrumb({ locker, box, onRoot, onLocker }) {
  return (
    <nav aria-label="Storage location" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 14, marginBottom: 14 }}>
      <button className="btn btn-secondary" style={{ padding: '5px 12px' }} disabled={!locker} onClick={onRoot}>All lockers</button>
      {locker && (
        <>
          <span style={{ color: 'var(--text-muted)' }}>›</span>
          <button className="btn btn-secondary" style={{ padding: '5px 12px' }} disabled={!box} onClick={onLocker}>{locker.name}</button>
        </>
      )}
      {box && (
        <>
          <span style={{ color: 'var(--text-muted)' }}>›</span>
          <span style={{ fontWeight: 600 }}>Box <span className="num">{box.box_number}</span></span>
        </>
      )}
    </nav>
  );
}

function LockerCabinet({ locker, selected, onClick }) {
  return (
    <div>
      <button
        type="button"
        className="locker-cabinet"
        aria-pressed={selected}
        aria-label={`${locker.name}: ${locker.boxes.length} boxes, ${locker.packetCount} packets`}
        onClick={onClick}
      >
        <span className="locker-plate">{locker.name}</span>
        <span className="locker-handle" style={{ left: 'calc(50% - 10px)' }} />
        <span className="locker-handle" style={{ left: 'calc(50% + 6px)' }} />
        <span className="locker-feet"><span /><span /></span>
      </button>
      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <div className="font-serif" style={{ fontSize: 17, fontWeight: 600 }}>{locker.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }} className="tabular">
          {locker.boxes.length}{locker.box_capacity ? `/${locker.box_capacity}` : ''} boxes · {plural(locker.packetCount, 'packet')}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{(locker.metal_types || []).join(' · ')}</div>
      </div>
    </div>
  );
}

function BoxSlot({ box, selected, onClick }) {
  const fill = box.rangeSize ? Math.min(100, (box.packetCount / box.rangeSize) * 100) : 0;
  return (
    <button
      type="button"
      className={`box-slot${box.metal_type === 'Silver' ? ' is-silver' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      title={box.range_start != null ? `Packets ${box.range_start}–${box.range_end}` : 'No packet range set'}
    >
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Box · {box.metal_type}
      </span>
      {/* sans + lining figures: the serif's old-style 1 reads as I, ambiguous for box codes */}
      <span className="tabular" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.15, letterSpacing: '0.01em' }}>{box.box_number}</span>
      <span className="tabular" style={{ fontSize: 12.5, fontWeight: 600 }}>{plural(box.packetCount, 'packet')}</span>
      <span className="tabular" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {box.range_start != null ? `${box.range_start}–${box.range_end}` : 'no range'}
      </span>
      <span className="box-fill" aria-hidden><span style={{ width: `${fill}%` }} /></span>
    </button>
  );
}

function BoxContents({ box }) {
  const ref = useRef(null);
  const [data, setData] = useState(null);

  // On phones the contents sit below the box grid - bring them into view.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [box.id]);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api
      .get(`/boxes/${box.id}/contents`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message));
  }, [box.id]);

  const occupied = new Set((data?.packets || []).map((p) => p.packet_number));
  const showStrip = box.rangeSize && box.rangeSize <= MAX_STRIP;

  return (
    <div ref={ref} className="card" style={{ padding: 18, marginTop: 18, scrollMarginTop: 76 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="font-serif" style={{ fontSize: 19, fontWeight: 600 }}>
          Box <span className="num">{box.box_number}</span> <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>· {box.metal_type}</span>
        </div>
        <div className="tabular" style={{ fontSize: 13, color: 'var(--text-3)' }}>
          {plural(box.packetCount, 'packet')} · {formatCurrency(box.principal)} · {box.netWeight} g
        </div>
      </div>

      {showStrip && data && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
            Packet slots {box.range_start}–{box.range_end} (filled = in this box now)
          </div>
          <div className="packet-strip">
            {Array.from({ length: box.rangeSize }, (_, i) => box.range_start + i).map((n) => (
              <div key={n} className={`packet-cell${occupied.has(n) ? ' is-full' : ''}`} title={`Packet ${n}`}>
                {String(n).slice(-2)}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
      {!data && !error && <ListSkeleton rows={4} />}
      {data && data.packets.length === 0 && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13.5, padding: '10px 0' }}>This box is empty right now.</div>
      )}
      {data && data.packets.length > 0 && (
        <div className="table-wrap table-stack">
          <table>
            <thead>
              <tr>
                <th>Packet</th>
                <th>Borrower</th>
                <th>Items</th>
                <th>Net wt</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.packets.map((p) => (
                <tr key={p.id}>
                  <td data-label="Packet">
                    <Link to={`/loans/${p.id}`} style={{ fontWeight: 700, color: 'var(--gold-deep)' }}>#{p.packet_number}</Link>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.loan_number}</div>
                  </td>
                  <td data-label="Borrower">
                    {p.borrowers?.name || '—'}
                    {p.borrowers?.village && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.borrowers.village}</div>}
                  </td>
                  <td data-label="Items" style={{ fontSize: 12.5 }}>{(p.loan_items || []).map((i) => i.item_type).join(', ')}</td>
                  <td data-label="Net wt" className="tabular">
                    {(p.loan_items || []).reduce((n, i) => n + (Number(i.net_weight ?? i.gross_weight) || 0), 0).toFixed(2)} g
                  </td>
                  <td data-label="Amount" className="tabular">{formatCurrency(p.loan_amount)}</td>
                  <td data-label="Status"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StorageVisual() {
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [lookupInput, setLookupInput] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');

  useEffect(() => {
    api
      .get('/boxes/overview')
      .then((res) => setOverview(res.data))
      .catch((err) => setError(err.message));
  }, []);

  const locker = overview?.lockers.find((l) => l.id === params.get('locker')) || null;
  const box = locker?.boxes.find((b) => b.id === params.get('box')) || null;

  // Selection lives in the URL so the phone's back button walks back up
  // box -> locker -> all lockers.
  function select(lockerId, boxId) {
    const next = new URLSearchParams(params);
    lockerId ? next.set('locker', lockerId) : next.delete('locker');
    boxId ? next.set('box', boxId) : next.delete('box');
    setParams(next);
  }

  async function locate() {
    const packetNumber = Number(lookupInput);
    if (!packetNumber) return;
    setLookupMessage('');
    try {
      const res = await api.get('/boxes/lookup', { params: { packetNumber } });
      if (res.data.found) {
        select(res.data.box.locker_id, res.data.box.id);
        setLookupMessage(`Packet #${packetNumber} → ${res.data.box.lockers?.name}, Box ${res.data.box.box_number} (${res.data.loan.borrowers?.name || 'unknown'})`);
      } else {
        setLookupMessage(res.data.reason);
      }
    } catch (err) {
      setLookupMessage(err.message);
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  // Draw up to the locker's physical capacity, so free space is visible.
  const emptySlots = locker?.box_capacity ? Math.max(0, locker.box_capacity - locker.boxes.length) : 0;

  return (
    <div>
      <div className="card" style={{ padding: 14, marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, flex: '1 1 260px', maxWidth: 420 }}>
          <input
            type="number"
            inputMode="numeric"
            placeholder="Find packet number…"
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && locate()}
            aria-label="Packet number"
          />
          <button className="btn btn-primary" onClick={locate}>Locate</button>
        </div>
        {overview && (
          <div className="tabular" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {overview.totals.packetsInStorage} packets in storage
            {overview.totals.unboxedPackets > 0 && (
              <span style={{ color: 'var(--warning)' }} title={`e.g. ${overview.unboxedSample.slice(0, 10).join(', ')}`}>
                {' '}· {overview.totals.unboxedPackets} not in any box range
              </span>
            )}
          </div>
        )}
        {lookupMessage && <div style={{ flexBasis: '100%', fontSize: 13.5 }}>{lookupMessage}</div>}
      </div>

      <Breadcrumb locker={locker} box={box} onRoot={() => select(null, null)} onLocker={() => select(locker.id, null)} />

      {!overview ? (
        <div className="locker-grid">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={220} />)}
        </div>
      ) : !locker ? (
        overview.lockers.length === 0 ? (
          <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
            No lockers yet. Add them under <b>Manage</b>.
          </div>
        ) : (
          <div className="locker-grid">
            {overview.lockers.map((l) => (
              <LockerCabinet key={l.id} locker={l} selected={false} onClick={() => select(l.id, null)} />
            ))}
          </div>
        )
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div className="font-serif" style={{ fontSize: 22, fontWeight: 600 }}>{locker.name}</div>
            <div className="tabular" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {locker.boxes.length}{locker.box_capacity ? ` of ${locker.box_capacity}` : ''} boxes · {plural(locker.packetCount, 'packet')} · {compactINR(locker.principal)}
            </div>
          </div>
          {locker.boxes.length === 0 && emptySlots === 0 ? (
            <div className="card" style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>No boxes in this locker yet.</div>
          ) : (
            <div className="box-grid">
              {locker.boxes.map((b) => (
                <BoxSlot key={b.id} box={b} selected={box?.id === b.id} onClick={() => select(locker.id, box?.id === b.id ? null : b.id)} />
              ))}
              {Array.from({ length: emptySlots }, (_, i) => (
                <div key={`empty-${i}`} className="box-slot is-empty" aria-hidden>
                  <span style={{ fontSize: 12 }}>Empty slot</span>
                </div>
              ))}
            </div>
          )}
          {box && <BoxContents box={box} />}
        </div>
      )}
    </div>
  );
}
