import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import DataTable from '../components/common/DataTable.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import CardStatusBadge from '../components/common/CardStatusBadge.jsx';
import InterestSummaryCard from '../components/common/InterestSummaryCard.jsx';
import LoanModal from '../components/Loans/LoanModal.jsx';
import PaymentModal from '../components/Payments/PaymentModal.jsx';
import LoanClosureModal from '../components/Loans/LoanClosureModal.jsx';
import LoanRolloverModal from '../components/Loans/LoanRolloverModal.jsx';
import HuidVerificationModal, { HuidChip } from '../components/Loans/HuidVerification.jsx';
import SendMessageModal from '../components/Messaging/SendMessageModal.jsx';
import { formatCurrency, formatDate } from '../utils/formatters.js';
import { ListSkeleton } from '../components/common/Skeleton.jsx';

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

  async function load() {
    try {
      const [loanRes, noticesRes] = await Promise.all([
        api.get(`/loans/${id}`),
        api.get(`/loans/${id}/notices`),
      ]);
      setLoan(loanRes.data);
      setNotices(noticesRes.data.data || []);
      setNoticesTotalCost(noticesRes.data.totalCost || 0);
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

  async function handleConfirmClosure(closureDate, interestCollected, cardReturned) {
    try {
      await api.patch(`/loans/${id}/status`, { status: 'closed', closureDate, interestCollected, cardReturned });
      setShowClosure(false);
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

  async function handleConfirmRollover({ closureDate, interestCollected, loanAmount, loanDate }) {
    try {
      const res = await api.post(`/loans/${id}/rollover`, { closureDate, interestCollected, loanAmount, loanDate });
      setShowRollover(false);
      navigate(`/loans/${res.data.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <div style={{ color: 'var(--danger)' }}>{error}</div>;
  if (!loan) return <ListSkeleton rows={6} />;

  const paymentColumns = [
    { key: 'payment_date', label: 'Date', render: (r) => formatDate(r.payment_date) },
    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
    { key: 'payment_type', label: 'Type' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={() => navigate('/loans')}>
        ← Back to Loans
      </button>

      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="num" style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0.01em" }}>{loan.loan_number}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13.5, marginTop: 4 }}>
              Borrower:{' '}
              <Link to={`/borrowers/${loan.borrowers?.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>
                {loan.borrowers?.name}
              </Link>
            </div>
            {(loan.loan_items || []).map((item) => (
              <div key={item.id} style={{ color: 'var(--text-muted)', fontSize: 13.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginTop: 2 }}>
                <span>
                {item.item_type} · {item.metal_type}
                {item.gross_weight ? ` · gross ${item.gross_weight}g` : ''}
                {item.net_weight ? ` · net ${item.net_weight}g` : ''}
                {item.purity ? ` · ${item.purity}` : ''}
                {item.description ? ` · ${item.description}` : ''}
                </span>
                {item.huid && (
                  <button type="button" onClick={() => setVerifyItem(item)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} aria-label={`Verify HUID ${item.huid}`}>
                    <HuidChip item={item} />
                  </button>
                )}
              </div>
            ))}
            {loan.previousLoan && (
              <div style={{ fontSize: 12.5, marginTop: 6 }}>
                Rolled over from{' '}
                <Link to={`/loans/${loan.previousLoan.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>
                  {loan.previousLoan.loan_number}
                </Link>
              </div>
            )}
            {loan.rolledInto && (
              <div style={{ fontSize: 12.5, marginTop: 6 }}>
                Rolled into{' '}
                <Link to={`/loans/${loan.rolledInto.id}`} style={{ color: 'var(--gold-deep)', fontWeight: 600 }}>
                  {loan.rolledInto.loan_number}
                </Link>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={loan.status} onChange={handleStatusChange} style={{ width: 'auto' }} aria-label="Loan status">
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>Edit</button>
            <button className="btn btn-secondary" onClick={() => navigate(`/loans/${loan.id}/print`)}>Print form</button>
            <button className="btn btn-secondary" onClick={() => setShowMessage(true)}>Message</button>
            {loan.status !== 'closed' && !loan.rolledInto && (
              <button className="btn btn-secondary" onClick={() => setShowRollover(true)}>Roll Over</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, marginTop: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Loan Amount</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatCurrency(loan.loan_amount)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Loan Date</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDate(loan.loan_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Packet Number</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{loan.packet_number ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Due Date (informational)</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDate(loan.due_date)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Total Received</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatCurrency(loan.total_payment_received)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Status</div>
            <StatusBadge status={loan.status} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Card</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CardStatusBadge cardGiven={loan.card_given} cardReturned={loan.card_returned} />
              {loan.card_given && !loan.card_returned && (
                <button className="btn btn-secondary" style={{ padding: '2px 10px', fontSize: 12 }} onClick={handleMarkCardReturned}>
                  Mark Returned
                </button>
              )}
            </div>
          </div>
          {loan.status === 'closed' && (
            <>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Closure Date</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDate(loan.closure_date)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Interest Collected</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{formatCurrency(loan.interest_collected)}</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 20, marginBottom: 20 }}>
        <InterestSummaryCard interest={loan.interest} />
        <div className="card" style={{ padding: 20 }}>
          <div className="font-serif" style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Overdue Notices</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Total notice cost charged</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{formatCurrency(noticesTotalCost)}</div>
          </div>
          {notices.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No notices sent for this loan.</div>
          )}
          {notices.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 13,
                padding: '6px 0',
                borderBottom: '1px solid var(--divider)',
              }}
            >
              <span>{n.threshold_month} mo notice — {formatDate(n.sent_date)}</span>
              <span>{formatCurrency(n.cost_charged)}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="font-serif" style={{ fontSize: 18, fontWeight: 600 }}>Payment History</div>
        <button className="btn btn-primary" onClick={() => setShowPayment(true)}>+ Add Payment</button>
      </div>

      <DataTable columns={paymentColumns} rows={loan.partialPayments} emptyMessage="No payments recorded yet." />

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
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false);
            load();
          }}
        />
      )}
      {showClosure && (
        <LoanClosureModal
          suggestedInterest={loan.interest?.totalInterestAccrued}
          cardGiven={loan.card_given}
          cardReturned={loan.card_returned}
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
          suggestedInterest={loan.interest?.totalInterestAccrued}
          onConfirm={handleConfirmRollover}
          onCancel={() => setShowRollover(false)}
        />
      )}
    </div>
  );
}
