import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import StatusBadge from './StatusBadge.jsx';
import { formatCurrency, formatDate } from '../../utils/formatters.js';
import { Skeleton } from './Skeleton.jsx';

function itemsLine(items) {
  if (!items?.length) return '';
  const grams = items.reduce((n, i) => n + (Number(i.netWeight) || 0), 0);
  const names = items.map((i) => [i.purity, i.itemType].filter(Boolean).join(' ')).join(', ');
  return grams ? `${names} · ${grams.toFixed(2)} g` : names;
}

// One search box for borrowers, loan/packet numbers, HUIDs and item
// descriptions. Closed loans get a "Re-pledge" shortcut, which is how a
// returning customer's items are pledged again without re-typing them.
export default function GlobalSearch({ id, autoFocus, onDone, placeholder = 'Search name, phone, loan / packet no., HUID, item…', inputRef: externalRef }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const ownRef = useRef(null);
  const inputRef = externalRef || ownRef;

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setError('');
      return undefined;
    }
    setLoading(true);
    let alive = true;
    const t = setTimeout(() => {
      api
        .get('/search', { params: { q: term } })
        .then((res) => {
          if (!alive) return;
          setResults(res.data);
          setError('');
          setActive(0);
        })
        .catch((err) => alive && setError(err.message))
        .finally(() => alive && setLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  // Flattened list for arrow-key navigation: borrowers first, then loans.
  const entries = useMemo(() => {
    if (!results) return [];
    return [
      ...results.borrowers.map((b) => ({ type: 'borrower', key: `b-${b.id}`, to: `/borrowers/${b.id}`, data: b })),
      ...results.loans.map((l) => ({ type: 'loan', key: `l-${l.id}`, to: `/loans/${l.id}`, data: l })),
    ];
  }, [results]);

  function go(to) {
    navigate(to);
    setQ('');
    onDone?.();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && entries[active]) {
      e.preventDefault();
      go(entries[active].to);
    } else if (e.key === 'Escape') {
      if (q) setQ('');
      else onDone?.();
    }
  }

  const rowStyle = (selected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    background: selected ? 'var(--hover)' : 'transparent',
  });

  return (
    <div className="global-search">
      <div style={{ position: 'relative' }}>
        <span aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 15 }}>⌕</span>
        <input
          ref={inputRef}
          id={id}
          type="search"
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Search"
          autoComplete="off"
          spellCheck={false}
          style={{ paddingLeft: 38, fontSize: 15, height: 46 }}
        />
      </div>

      {q.trim().length >= 2 && (
        <div style={{ marginTop: 8 }}>
          {loading && !results && (
            <div style={{ display: 'grid', gap: 8, padding: 8 }}>
              <Skeleton height={16} width="70%" />
              <Skeleton height={16} width="55%" />
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, padding: 8 }}>{error}</div>}
          {results && entries.length === 0 && !loading && (
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', padding: '10px 12px' }}>Nothing matches “{q.trim()}”.</div>
          )}

          {results?.borrowers.length > 0 && <div className="search-group">Borrowers</div>}
          {entries
            .filter((e) => e.type === 'borrower')
            .map((e) => {
              const b = e.data;
              const idx = entries.indexOf(e);
              return (
                <div key={e.key} role="option" aria-selected={idx === active} style={rowStyle(idx === active)} onMouseEnter={() => setActive(idx)} onClick={() => go(e.to)}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{[b.phone, b.care_of, b.village || b.city].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              );
            })}

          {results?.loans.length > 0 && <div className="search-group">Loans &amp; pledged items</div>}
          {entries
            .filter((e) => e.type === 'loan')
            .map((e) => {
              const l = e.data;
              const idx = entries.indexOf(e);
              return (
                <div key={e.key} role="option" aria-selected={idx === active} style={rowStyle(idx === active)} onMouseEnter={() => setActive(idx)} onClick={() => go(e.to)}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="num" style={{ fontWeight: 600, fontSize: 14 }}>{l.loanNumber}</span>
                      {l.packetNumber && <span className="num" style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{l.packetNumber}</span>}
                      <StatusBadge status={l.status} />
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2, overflowWrap: 'anywhere' }}>
                      {l.borrowerName} · {itemsLine(l.items)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatCurrency(l.loanAmount)} on {formatDate(l.loanDate)}
                      {l.closureDate ? ` · closed ${formatDate(l.closureDate)}` : ''}
                      {l.items.some((i) => i.huid) ? ` · HUID ${l.items.map((i) => i.huid).filter(Boolean).join(', ')}` : ''}
                    </div>
                  </div>
                  {l.status === 'closed' && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        go(`/loans/${l.id}?repledge=1`);
                      }}
                    >
                      Re-pledge
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
