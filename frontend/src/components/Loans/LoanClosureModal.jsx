import { useState } from 'react';
import Modal from '../common/Modal.jsx';

export default function LoanClosureModal({ suggestedInterest, cardGiven, cardReturned, onConfirm, onCancel }) {
  const [closureDate, setClosureDate] = useState(new Date().toISOString().slice(0, 10));
  const [interestCollected, setInterestCollected] = useState(suggestedInterest ?? '');
  const [cardReturnedNow, setCardReturnedNow] = useState(!!cardReturned);
  const [error, setError] = useState('');
  const cardNeedsReturn = cardGiven && !cardReturned;

  function handleSubmit(e) {
    e.preventDefault();
    if (!closureDate) {
      setError('Closure date is required.');
      return;
    }
    if (interestCollected === '' || Number(interestCollected) < 0) {
      setError('Interest collected is required and must be 0 or more.');
      return;
    }
    if (cardNeedsReturn && !cardReturnedNow) {
      setError('Confirm the card has been returned before closing this loan.');
      return;
    }
    setError('');
    onConfirm(closureDate, Number(interestCollected), cardReturnedNow);
  }

  return (
    <Modal title="Close Loan" onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Closure Date *</label>
          <input type="date" required value={closureDate} onChange={(e) => setClosureDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Interest Collected (₹) *</label>
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
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={cardReturnedNow}
                onChange={(e) => setCardReturnedNow(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Card has been returned by the borrower *
            </label>
          </div>
        )}

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">Confirm Closure</button>
        </div>
      </form>
    </Modal>
  );
}
