import { useState } from 'react';
import Modal from '../common/Modal.jsx';

export default function LoanRolloverModal({ loan, suggestedInterest, onConfirm, onCancel }) {
  const [closureDate, setClosureDate] = useState(new Date().toISOString().slice(0, 10));
  const [interestCollected, setInterestCollected] = useState(suggestedInterest ?? '');
  const [loanAmount, setLoanAmount] = useState(loan.loan_amount);
  const [loanDate, setLoanDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');

  const cardNeedsReturn = loan.card_given && !loan.card_returned;

  function handleSubmit(e) {
    e.preventDefault();
    if (interestCollected === '' || Number(interestCollected) < 0) {
      setError('Interest collected is required and must be 0 or more.');
      return;
    }
    if (!loanAmount || Number(loanAmount) <= 0) {
      setError('New loan amount is required.');
      return;
    }
    if (cardNeedsReturn) {
      setError('Card must be marked returned on this loan before rolling it over.');
      return;
    }
    setError('');
    onConfirm({ closureDate, interestCollected: Number(interestCollected), loanAmount: Number(loanAmount), loanDate });
  }

  return (
    <Modal title="Roll Over Loan" onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>
          Closes {loan.loan_number} once its interest is paid to date, then opens a brand-new loan for the same
          borrower and items, referencing this one. Items carry forward as-is - edit the new loan afterward if
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
            onChange={(e) => setInterestCollected(e.target.value)}
          />
        </div>

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
          <button type="submit" className="btn btn-primary">Confirm Rollover</button>
        </div>
      </form>
    </Modal>
  );
}
