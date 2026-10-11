import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import InterestWaiverFields, { needsWaiverReason, waiverReasonText } from './InterestWaiverFields.jsx';
import { useInterestAsOf } from '../../hooks/useInterestAsOf.js';

export default function LoanRolloverModal({ loan, onConfirm, onCancel }) {
  const [closureDate, setClosureDate] = useState(new Date().toISOString().slice(0, 10));
  const calculated = useInterestAsOf(loan.id, closureDate, loan.interest?.totalInterestAccrued);
  const [interestCollected, setInterestCollected] = useState(calculated ?? '');
  const [touched, setTouched] = useState(false);
  const [waiver, setWaiver] = useState({ preset: '', note: '' });
  const [loanAmount, setLoanAmount] = useState(loan.loan_amount);
  const [loanDate, setLoanDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cardNeedsReturn = loan.card_given && !loan.card_returned;

  useEffect(() => {
    if (!touched && calculated != null) setInterestCollected(calculated);
  }, [calculated, touched]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (interestCollected === '' || Number(interestCollected) < 0) return setError('Interest collected is required and must be 0 or more.');
    if (needsWaiverReason(calculated, interestCollected, waiver)) return setError('Give a reason for collecting less than the calculated interest.');
    if (!loanAmount || Number(loanAmount) <= 0) return setError('New loan amount is required.');
    if (cardNeedsReturn) return setError('Card must be marked returned on this loan before rolling it over.');
    setError('');
    setSaving(true);
    try {
      await onConfirm({
        closureDate,
        interestCollected: Number(interestCollected),
        loanAmount: Number(loanAmount),
        loanDate,
        waiverReason: waiverReasonText(waiver) || undefined,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Roll Over Loan" onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
          Closes {loan.loan_number} once its interest is paid to date, then opens a brand-new loan for the same
          borrower and items, referencing this one. Items and photos carry forward as-is - edit the new loan afterward if
          anything changed on re-inspection.
        </div>

        <div className="field">
          <label>Old Loan - Closure Date *</label>
          <input type="date" required value={closureDate} onChange={(e) => setClosureDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Old Loan - Interest Collected (₹) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={interestCollected}
            onChange={(e) => {
              setTouched(true);
              setInterestCollected(e.target.value);
            }}
          />
        </div>
        <InterestWaiverFields calculated={calculated} collected={interestCollected} value={waiver} onChange={setWaiver} />

        {cardNeedsReturn && (
          <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 10 }}>
            This loan's card hasn't been marked returned yet - do that first, then roll over.
          </div>
        )}

        <div className="field">
          <label>New Loan Amount (₹) *</label>
          <input type="number" step="0.01" required value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>New Loan Date *</label>
          <input type="date" required value={loanDate} onChange={(e) => setLoanDate(e.target.value)} />
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Confirm Rollover'}</button>
        </div>
      </form>
    </Modal>
  );
}
