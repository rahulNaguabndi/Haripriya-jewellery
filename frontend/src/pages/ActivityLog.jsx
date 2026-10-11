import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import PageHeader from '../components/common/PageHeader.jsx';
import Pagination from '../components/common/Pagination.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Segmented from '../components/common/Segmented.jsx';
import { ListSkeleton } from '../components/common/Skeleton.jsx';
import { ActivityRow } from '../components/common/ActivityTimeline.jsx';
import { useMyRole, isAdminRole } from '../hooks/useMyRole.js';

const PAGE_SIZE = 50;
// value = activity_log.entity_type(s), comma-separated.
const TYPES = [
  { value: '', label: 'Everything' },
  { value: 'loan,loan_item,loan_photo,loan_notice', label: 'Loans' },
  { value: 'payment', label: 'Payments' },
  { value: 'borrower', label: 'Borrowers' },
  { value: 'interest_config,notice_config,daily_rate,admin_user', label: 'Rates & settings' },
];

// Shop-wide audit trail: every money-changing or record-changing action,
// who did it and when. Admin-only.
export default function ActivityLog() {
  const role = useMyRole();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [actors, setActors] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdminRole(role)) return;
    api.get('/activity/actors').then((res) => setActors(res.data.data)).catch(() => {});
  }, [role]);

  useEffect(() => setPage(1), [type, actorId, from, to, q]);

  useEffect(() => {
    if (!isAdminRole(role)) return undefined;
    setRows(null);
    setError('');
    const params = {
      page,
      limit: PAGE_SIZE,
      entityType: type || undefined,
      actorId: actorId || undefined,
      from: from || undefined,
      to: to || undefined,
      q: q.trim() || undefined,
    };
    const t = setTimeout(() => {
      api
        .get('/activity', { params })
        .then((res) => {
          setRows(res.data.data);
          setTotal(res.data.total || 0);
        })
        .catch((err) => {
          setRows([]);
          setError(err.message);
        });
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [role, page, type, actorId, from, to, q]);

  if (role && !isAdminRole(role)) {
    return (
      <div>
        <PageHeader title="Activity log" />
        <div className="card"><EmptyState title="Admins only" hint="Ask an admin if you need to check who changed something." compact /></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Activity log" subtitle="Every loan, payment, borrower and settings change - who did it and when." />

      <div style={{ overflowX: 'auto', marginBottom: 14, paddingBottom: 2 }}>
        <Segmented label="Activity type" value={type} onChange={setType} options={TYPES} style={{ flexWrap: 'nowrap' }} />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0, flex: '2 1 220px' }}>
          <label>Search</label>
          <input type="search" value={q} placeholder="Loan number, name, amount…" onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}>
          <label>Staff member</label>
          <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">Anyone</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 150px' }}>
          <label>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 150px' }}>
          <label>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: '6px 20px' }}>
        {rows === null ? (
          <div style={{ padding: '12px 0' }}><ListSkeleton rows={8} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="No activity found" hint="Changes made from now on appear here." compact />
        ) : (
          rows.map((row) => <ActivityRow key={row.id} row={row} showLinks />)
        )}
      </div>
      <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
    </div>
  );
}
