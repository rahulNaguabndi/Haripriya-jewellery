import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import StatusBadge, { STATUS_LABELS } from '../components/common/StatusBadge.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import CardStatusBadge from '../components/common/CardStatusBadge.jsx';
import InterestSummaryCard from '../components/common/InterestSummaryCard.jsx';
import LoanModal from '../components/Loans/LoanModal.jsx';
import PaymentModal from '../components/Payments/PaymentModal.jsx';
import LoanClosureModal from '../components/Loans/LoanClosureModal.jsx';
import LoanRolloverModal from '../components/Loans/LoanRolloverModal.jsx';
import HuidVerificationModal, { HuidChip } from '../components/Loans/HuidVerification.jsx';
import SendMessageModal from '../components/Messaging/SendMessageModal.jsx';
import { sendConfirmation } from '../components/Messaging/NotifyBorrower.jsx';
import LoanPhotos from '../components/Loans/LoanPhotos.jsx';
import ActivityTimeline from '../components/common/ActivityTimeline.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { ListSkeleton } from '../components/common/Skeleton.jsx';
import { useBranch } from '../context/BranchContext.jsx';
import { useMyRole, isAdminRole } from '../hooks/useMyRole.js';

const statuses = ['active', 'partial_payment', 'closed', 'defaulted'];

export default function LoanDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loan, setLoan] = useState(null);
  const [notices, setNotices] = useState([]);
  const [noticesTotalCost, setNoticesTotalCost] = useState(0);
  const [error, setError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showClosure, setShowClosure] = useState(false);
  const [showRollover, setShowRollover] = useState(false);
  const [verifyItem, setVerifyItem] = useState(null);
  const [showMessage, setShowMessage] = useState(false);
  const [showRepledge, setShowRepledge] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const { multiBranch, activeBranches } = useBranch();
  const role = useMyRole();

  // ?repledge=1 (from search results / borrower page) opens the re-pledge
  // form straight away once the loan has loaded.
  useEffect(() => {
    if (loan && loan.id === id && searchParams.get('repledge') === '1') {
      if (loan.status === 'closed' && !loan.rolledInto) setShowRepledge(true);
      setSearchParams({}, { replace: true });
    }
  }, [loan, id, searchParams, setSearchParams]);

  async function load() {
    try {
      const [loanRes, noticesRes] = await Promise.all([
        api.get(`/loans/${id}`),
        api.get(`/loans/${id}/notices`),
      ]);
      setLoan(loanRes.data);
      setNotices(noticesRes.data.data || []);
      setNoticesTotalCost(noticesRes.data.totalCost || 0);
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleStatusChange(e) {
    const status = e.target.value;
    if (status === 'closed') {
      setShowClosure(true);
      return;
    }
    try {
      await api.patch(`/loans/${id}/status`, { status });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  // Errors propagate to the dialog, which shows them inline and stays open.
  async function handleConfirmClosure({ closureDate, interestCollected, cardReturned, waiverReason, notifyChannels, otpId, otpOverrideReason }) {
    await api.patch(`/loans/${id}/status`, { status: 'closed', closureDate, interestCollected, cardReturned, waiverReason, otpId, otpOverrideReason });
    sendConfirmation({ kind: 'closure', loanId: id, channels: notifyChannels });
    setShowClosure(false);
    load();
  }

  async function handleMoveBranch(e) {
    const branchId = e.target.value;
    if (!branchId || branchId === loan.branch_id) return;
    try {
      await api.patch(`/loans/${id}/branch`, { branchId });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMarkCardReturned() {
    try {
      await api.put(`/loans/${id}`, { cardReturned: true });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConfirmRollover(payload) {
    const res = await api.post(`/loans/${id}/rollover`, payload);
    setShowRollover(false);
    navigate(`/loans/${res.data.id}`);
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!loan) return <ListSkeleton rows={6} />;

  const paymentColumns = [
    { key: 'payment_date', label: 'Date', render: (r) => formatDate(r.payment_date) },
    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
    { key: 'payment_type', label: 'Type' },
    { key: 'notes', label: 'Notes' },
  ];

  const items = loan.loan_items || [];
  const netWeight = items.reduce((n, i) => n + (Number(i.net_weight ?? i.gross_weight) || 0), 0);

  return (
    <div>
      <PageHeader
        back={{ to: '/loans', label: 'Loans' }}
        title={<span className="num" style={{ fontSize: '0.82em', fontWeight: 700, letterSpacing: 0 }}>{loan.loan_number}</span>}
        subtitle={
          <>
            <Link to={`/borrowers/${loan.borrowers?.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600, textDecoration: 'none' }}>
              {loan.borrowers?.name}
            </Link>
            {' · '}Packet <span className="num">#{loan.packet_number ?? '—'}</span>
            {' · '}
            <StatusBadge status={loan.status} />
          </>
        }
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setShowMessage(true)}>Message</button>
            <button className="btn btn-ghost" onClick={() => navigate(`/loans/${loan.id}/print`)}>Print form</button>
            <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>Edit</button>
            {loan.status !== 'closed' && !loan.rolledInto && (
              <button className="btn btn-secondary" onClick={() => setShowRollover(true)}>Roll over</button>
            )}
            {loan.status === 'closed' && !loan.rolledInto ? (
              <button className="btn btn-primary" onClick={() => setShowRepledge(true)}>Re-pledge items</button>
            ) : (
              <button className="btn btn-primary" onClick={() => setShowPayment(true)}>+ Add payment</button>
            )}
          </>
        }
      />

      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div className="facts">
          <div>
            <div className="fact-label">Loan amount</div>
            <div className="fact-value is-lg">{formatCurrency(loan.loan_amount)}</div>
          </div>
          <div>
            <div className="fact-label">Amount due today</div>
            <div className="fact-value is-lg">{formatCurrency(loan.interest?.totalAmountDue)}</div>
          </div>
          <div>
            <div className="fact-label">Loan date</div>
            <div className="fact-value">{formatDate(loan.loan_date)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{loan.interest_rate}% p.a.</div>
          </div>
          <div>
            <div className="fact-label">Received so far</div>
            <div className="fact-value">{formatCurrency(loan.total_payment_received)}</div>
          </div>
          <div>
            <div className="fact-label">Due date</div>
            <div className="fact-value">{formatDate(loan.due_date)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>reminder only</div>
          </div>
          {loan.status === 'closed' && (
            <>
              <div>
                <div className="fact-label">Closed on</div>
                <div className="fact-value">{formatDate(loan.closure_date)}</div>
              </div>
              <div>
                <div className="fact-label">Interest collected</div>
                <div className="fact-value">{formatCurrency(loan.interest_collected)}</div>
                {Number(loan.interest_waived) > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--warning)' }} title={loan.interest_waiver_reason || ''}>
                    {formatCurrency(loan.interest_waived)} reduced from {formatCurrency(loan.interest_calculated)}
                  </div>
                )}
              </div>
              {Number(loan.interest_waived) > 0 && (
                <div>
                  <div className="fact-label">Reduction reason</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{loan.interest_waiver_reason}</div>
                </div>
              )}
            </>
          )}
          <div>
            <div className="fact-label">Status</div>
            <select value={loan.status} onChange={handleStatusChange} aria-label="Change loan status" style={{ padding: '6px 10px', fontSize: 13.5 }}>
              {statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          {(multiBranch || loan.branches) && (
            <div>
              <div className="fact-label">Branch</div>
              {isAdminRole(role) && multiBranch ? (
                <select value={loan.branch_id || ''} onChange={handleMoveBranch} aria-label="Move loan to branch" title="The packet has moved to this branch" style={{ padding: '6px 10px', fontSize: 13.5 }}>
                  {!loan.branch_id && <option value="">—</option>}
                  {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              ) : (
                <div className="fact-value">{loan.branches?.name || '—'}</div>
              )}
            </div>
          )}
          <div>
            <div className="fact-label">Loan card</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CardStatusBadge cardGiven={loan.card_given} cardReturned={loan.card_returned} />
              {loan.card_given && !loan.card_returned && (
                <button className="btn btn-ghost btn-sm" onClick={handleMarkCardReturned}>Mark returned</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--divider)', marginTop: 18, paddingTop: 14 }}>
          <div className="fact-label" style={{ marginBottom: 8 }}>
            Pledged items · {items.length} · {netWeight.toFixed(2)} g net
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {items.map((item) => (
              <div key={item.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{item.item_type}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {[item.metal_type, item.purity, item.gross_weight && `gross ${item.gross_weight} g`, item.net_weight && `net ${item.net_weight} g`, item.description].filter(Boolean).join(' · ')}
                </span>
                {item.huid && (
                  <button type="button" onClick={() => setVerifyItem(item)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} aria-label={`Verify HUID ${item.huid}`}>
                    <HuidChip item={item} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {(loan.previousLoan || loan.rolledInto || loan.repledgedFrom || loan.repledges?.length > 0) && (
            <div style={{ fontSize: 13, marginTop: 10, color: 'var(--text-muted)' }}>
              {loan.previousLoan && (
                <>Rolled over from <Link to={`/loans/${loan.previousLoan.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>{loan.previousLoan.loan_number}</Link>. </>
              )}
              {loan.rolledInto && (
                <>Rolled into <Link to={`/loans/${loan.rolledInto.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>{loan.rolledInto.loan_number}</Link>. </>
              )}
              {loan.repledgedFrom && (
                <>Re-pledge of <Link to={`/loans/${loan.repledgedFrom.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>{loan.repledgedFrom.loan_number}</Link>. </>
              )}
              {loan.repledges?.length > 0 && (
                <>
                  Re-pledged as{' '}
                  {loan.repledges.map((r, i) => (
                    <span key={r.id}>
                      {i > 0 && ', '}
                      <Link to={`/loans/${r.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>{r.loan_number}</Link>
                    </span>
                  ))}
                  .
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 20, marginBottom: 24 }}>
        <InterestSummaryCard interest={loan.interest} />
        <div className="card" style={{ padding: 20 }}>
          <h2 className="section-title">Overdue notices</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Notice charges added to dues</div>
            <div className="tabular" style={{ fontSize: 15, fontWeight: 600 }}>{formatCurrency(noticesTotalCost)}</div>
          </div>
          {notices.length === 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>No notices sent for this loan yet.</div>
          )}
          {notices.map((n) => (
            <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
              <span>{n.threshold_month}-month notice · {formatDate(n.sent_date)}</span>
              <span className="tabular">{formatCurrency(n.cost_charged)}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="section-title">Payment history</h2>
      <DataTable
        columns={paymentColumns}
        rows={loan.partialPayments}
        emptyMessage="No payments yet"
        emptyHint="Part payments reduce the principal from the day they're made. Use “Add payment” to record one."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 20, marginTop: 24 }}>
        <LoanPhotos loanId={loan.id} onChange={() => setHistoryKey((k) => k + 1)} />
        <ActivityTimeline loanId={loan.id} refreshKey={historyKey} />
      </div>

      {showEdit && (
        <LoanModal
          loan={loan}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            load();
          }}
        />
      )}
      {showPayment && (
        <PaymentModal
          loanId={loan.id}
          borrowerPhone={loan.borrowers?.phone || null}
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false);
            load();
          }}
        />
      )}
      {showClosure && (
        <LoanClosureModal
          loan={loan}
          onConfirm={handleConfirmClosure}
          onCancel={() => setShowClosure(false)}
        />
      )}
      {verifyItem && (
        <HuidVerificationModal
          loanId={loan.id}
          item={verifyItem}
          onClose={() => setVerifyItem(null)}
          onSaved={() => {
            setVerifyItem(null);
            load();
          }}
        />
      )}
      {showMessage && <SendMessageModal loanIds={[loan.id]} onClose={() => setShowMessage(false)} />}
      {showRollover && (
        <LoanRolloverModal
          loan={loan}
          onConfirm={handleConfirmRollover}
          onCancel={() => setShowRollover(false)}
        />
      )}
      {showRepledge && (
        <LoanModal
          repledgeFrom={loan}
          onClose={() => setShowRepledge(false)}
          onSaved={(saved) => {
            setShowRepledge(false);
            navigate(`/loans/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}
