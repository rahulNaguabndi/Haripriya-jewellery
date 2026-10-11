import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import StatCard from '../components/common/StatCard.jsx';
import DataTable from '../components/common/DataTable.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { TableSkeleton } from '../components/common/Skeleton.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import PageHeader from '../components/common/PageHeader.jsx';
import Segmented from '../components/common/Segmented.jsx';

const METALS = [
  { key: 'all', label: 'All' },
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver' },
  { key: 'mixed', label: 'Mixed' },
];
const METAL_LABEL = { gold: 'Gold', silver: 'Silver', mixed: 'Mixed' };

// Indian financial year starting in April of `startYear`.
function financialYear(startYear) {
  return { key: `fy${startYear}`, label: `FY ${startYear}-${String(startYear + 1).slice(2)}`, from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

function fyPresets() {
  const now = new Date();
  const current = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [financialYear(current), financialYear(current - 1), financialYear(current - 2)];
}

const loanColumns = [
  { key: 'loanNumber', label: 'Loan #' },
  { key: 'loanDate', label: 'Loan date', render: (r) => formatDate(r.loanDate) },
  { key: 'borrower', label: 'Borrower' },
  { key: 'metal', label: 'Metal', render: (r) => METAL_LABEL[r.metal] },
  { key: 'principal', label: 'Principal', render: (r) => <span className="tabular">{formatCurrency(r.principal)}</span> },
  { key: 'interestRate', label: 'Rate', render: (r) => `${r.interestRate}% p.a.` },
  { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'paymentsInPeriod', label: 'Paid in period', render: (r) => <span className="tabular">{formatCurrency(r.paymentsInPeriod)}</span> },
  { key: 'interestCollected', label: 'Interest collected', render: (r) => <span className="tabular">{formatCurrency(r.interestCollected)}</span> },
  { key: 'accruedUnrealised', label: 'Accrued (unrealised)', render: (r) => <span className="tabular" style={{ color: 'var(--text-muted)' }}>{formatCurrency(r.accruedUnrealised)}</span> },
];

const txColumns = [
  { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
  { key: 'type', label: 'Type' },
  { key: 'loanNumber', label: 'Loan #' },
  { key: 'borrower', label: 'Borrower' },
  { key: 'metal', label: 'Metal' },
  { key: 'moneyOut', label: 'Money out', render: (r) => (r.moneyOut ? <span className="tabular">{formatCurrency(r.moneyOut)}</span> : '') },
  { key: 'moneyIn', label: 'Money in', render: (r) => (r.moneyIn ? <span className="tabular" style={{ color: 'var(--success)' }}>{formatCurrency(r.moneyIn)}</span> : '') },
  { key: 'charge', label: 'Charge levied', render: (r) => (r.charge ? <span className="tabular">{formatCurrency(r.charge)}</span> : '') },
];

export default function Accounts() {
  const navigate = useNavigate();
  const presets = useMemo(fyPresets, []);
  const [period, setPeriod] = useState({ from: presets[0].from, to: presets[0].to });
  const [metal, setMetal] = useState('all');
  const [view, setView] = useState('loans');
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get('/accounts/ledger', { params: period })
      .then((res) => setLedger(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [period]);

  async function exportExcel() {
    setExporting(true);
    setError('');
    try {
      const res = await api.get('/accounts/ledger.xlsx', { params: period, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loan-accounts_${period.from}_to_${period.to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  const s = ledger?.summary?.[metal];
  const loans = (ledger?.loans || []).filter((r) => metal === 'all' || r.metal === metal);
  const transactions = (ledger?.transactions || []).filter((t) => metal === 'all' || t.metal === METAL_LABEL[metal]);
  const activePreset = presets.find((p) => p.from === period.from && p.to === period.to)?.key || 'custom';

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={`Loans given, money received and interest collected · ${formatDate(period.from)} – ${formatDate(period.to)}`}
        actions={
          <button className="btn btn-primary" onClick={exportExcel} disabled={exporting || loading}>
            {exporting ? 'Preparing…' : 'Export to Excel'}
          </button>
        }
      />

      <div className="card" style={{ padding: 16, marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 160px' }}>
          <label>Period</label>
          <select
            value={activePreset}
            onChange={(e) => {
              const p = presets.find((x) => x.key === e.target.value);
              if (p) setPeriod({ from: p.from, to: p.to });
            }}
          >
            {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value="custom" disabled>Custom range</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 140px' }}>
          <label>From</label>
          <input type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, from: e.target.value }))} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 140px' }}>
          <label>To</label>
          <input type="date" value={period.to} min={period.from} onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, to: e.target.value }))} />
        </div>
        <Segmented label="Metal" value={metal} onChange={setMetal} options={METALS.map((m) => ({ value: m.key, label: m.label }))} />
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 14, marginBottom: 20 }}>
        <StatCard label="Disbursed" value={formatCurrency(s?.amountDisbursed)} sublabel={s && `${s.loansDisbursed} loans given`} loading={loading} />
        <StatCard label="Interest collected" value={formatCurrency(s?.interestCollected)} sublabel={s && `${s.loansClosed} loans closed`} loading={loading} />
        <StatCard label="Payments received" value={formatCurrency(s?.paymentsReceived)} sublabel="principal repaid" loading={loading} />
        <StatCard label="Outstanding at end" value={formatCurrency(s?.principalOutstanding)} sublabel={s && `+ ${formatCurrency(s.accruedUnrealised)} accrued`} loading={loading} />
      </div>

      <Segmented
        label="Ledger view"
        value={view}
        onChange={setView}
        style={{ marginBottom: 12 }}
        options={[{ value: 'loans', label: `Loans · ${loans.length}` }, { value: 'transactions', label: `Transactions · ${transactions.length}` }]}
      />

      {loading ? (
        <TableSkeleton columns={8} rows={8} />
      ) : view === 'loans' ? (
        <DataTable columns={loanColumns} rows={loans.map((r) => ({ ...r, id: r.loanId }))} onRowClick={(r) => navigate(`/loans/${r.loanId}`)} emptyMessage="No loans in this period" emptyHint="Pick an earlier financial year, or widen the dates." />
      ) : (
        <DataTable columns={txColumns} rows={transactions} emptyMessage="No transactions in this period" emptyHint="Disbursements, payments and closures in the chosen dates appear here." />
      )}

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
        Partial payments reduce principal; interest is realised when a loan is closed. “Accrued (unrealised)” is what open
        loans would owe as of {ledger?.period.asOf ? formatDate(ledger.period.asOf) : 'the period end'}, so it isn't income yet. Tax isn't calculated here.
      </div>
    </div>
  );
}
