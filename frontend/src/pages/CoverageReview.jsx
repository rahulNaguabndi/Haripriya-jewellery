import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader.jsx';
import { useConfirm } from '../components/common/ConfirmDialog.jsx';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import { TableSkeleton } from '../components/common/Skeleton.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import PriceDropSimulator from '../components/Coverage/PriceDropSimulator.jsx';

const METAL_TYPES = ['Gold', 'Silver'];
const STATUS_LABELS = { red: 'At risk', amber: 'Watch', green: 'Healthy', unknown: 'Unknown' };

export default function CoverageReview() {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [rates, setRates] = useState({ today: {}, latest: {} });
  const [rateInputs, setRateInputs] = useState({ Gold: '', Silver: '' });
  const [role, setRole] = useState(null);
  const [rows, setRows] = useState([]);
  const [thresholds, setThresholds] = useState({ redThreshold: 1.0, amberThreshold: 1.1 });
  const [loading, setLoading] = useState(true);
  const [savingRate, setSavingRate] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [meRes, ratesRes, coverageRes] = await Promise.all([
        api.get('/auth/me'),
        api.get('/rates'),
        api.get('/coverage'),
      ]);
      setRole(meRes.data.adminProfile?.role || null);
      setRates(ratesRes.data);
      setRows(coverageRes.data.data || []);
      setThresholds({
        redThreshold: coverageRes.data.redThreshold,
        amberThreshold: coverageRes.data.amberThreshold,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submitRate(metalType) {
    const value = Number(rateInputs[metalType]);
    if (!value || value <= 0) return;

    const alreadySetToday = !!rates.today?.[metalType];
    if (alreadySetToday) {
      const ok = await confirm({
        title: `Override today's ${metalType.toLowerCase()} rate?`,
        message: `It's already locked at ${formatCurrency(rates.today[metalType].rate_per_gram)}/g. Replace it with ${formatCurrency(value)}/g?`,
        confirmLabel: 'Override rate',
        danger: true,
      });
      if (!ok) return;
    }

    setSavingRate(metalType);
    setError('');
    try {
      await api.post('/rates', { metalType, ratePerGram: value });
      setRateInputs((r) => ({ ...r, [metalType]: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRate(null);
    }
  }

  const isSuperAdmin = role === 'super_admin';

  const columns = [
    { key: 'loan_number', label: 'Loan #', render: (r) => r.loanNumber },
    { key: 'borrower', label: 'Borrower', render: (r) => r.borrowerName || '—' },
    { key: 'metal', label: 'Metal', render: (r) => (r.metalTypes.length ? r.metalTypes.join(' + ') : '—') },
    { key: 'items', label: 'Items', render: (r) => r.itemCount },
    {
      key: 'melt',
      label: 'Melt Value',
      render: (r) => (
        <>
          {r.meltValue != null ? formatCurrency(r.meltValue) : '—'}
          {r.hasUnknownItems && <span style={{ color: 'var(--text-muted)' }}> (partial)</span>}
        </>
      ),
    },
    { key: 'owed', label: 'Amount Owed', render: (r) => formatCurrency(r.amountOwed) },
    { key: 'ratio', label: 'Ratio', render: (r) => (r.ratio != null ? r.ratio.toFixed(2) : '—') },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <span className={`badge badge-${r.status}`}>{STATUS_LABELS[r.status]}</span>,
    },
    {
      key: 'rate',
      label: 'Rate',
      render: (r) => (r.meltValue != null && !r.rateIsToday ? <span style={{ color: 'var(--text-muted)' }}>stale</span> : r.meltValue != null ? 'today' : '—'),
    },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title="Coverage review" subtitle="Is each open loan still covered by the metal pledged against it?" />
        <TableSkeleton columns={9} rows={10} />
      </div>
    );
  }
  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <PageHeader
        title="Coverage review"
        subtitle={<>Ratio = today's melt value ÷ amount currently owed. Red ≤ {thresholds.redThreshold}, amber &lt; {thresholds.amberThreshold}, green ≥ {thresholds.amberThreshold}.</>}
      />

      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h2 className="section-title">Today's rate</h2>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {METAL_TYPES.map((metalType) => {
            const todayRow = rates.today?.[metalType];
            const latestRow = rates.latest?.[metalType];
            const locked = !!todayRow;
            const canEdit = !locked || isSuperAdmin;
            return (
              <div key={metalType} style={{ minWidth: 220 }}>
                <label>{metalType} (₹/gram)</label>
                {locked && !isSuperAdmin && (
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{formatCurrency(todayRow.rate_per_gram)}</div>
                )}
                {(!locked || isSuperAdmin) && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={locked ? String(todayRow.rate_per_gram) : latestRow ? `Last: ${latestRow.rate_per_gram}` : 'Enter rate'}
                      value={rateInputs[metalType]}
                      onChange={(e) => setRateInputs((r) => ({ ...r, [metalType]: e.target.value }))}
                    />
                    <button
                      className="btn btn-primary"
                      disabled={savingRate === metalType}
                      onClick={() => submitRate(metalType)}
                    >
                      {savingRate === metalType ? '…' : locked ? 'Override' : 'Set'}
                    </button>
                  </div>
                )}
                {locked && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                    Locked for today{isSuperAdmin ? ' — only super admin can override' : ''}.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <PriceDropSimulator rows={rows} redThreshold={thresholds.redThreshold} amberThreshold={thresholds.amberThreshold} />

      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="No open loans to review."
        onRowClick={(r) => navigate(`/loans/${r.loanId}`)}
      />
    </div>
  );
}
