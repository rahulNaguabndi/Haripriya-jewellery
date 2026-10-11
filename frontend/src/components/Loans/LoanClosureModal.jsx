import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import InterestWaiverFields, { needsWaiverReason, waiverReasonText } from './InterestWaiverFields.jsx';
import NotifyBorrower from '../Messaging/NotifyBorrower.jsx';
import { useInterestAsOf } from '../../hooks/useInterestAsOf.js';

export default function LoanClosureModal({ loan, onConfirm, onCancel }) {
  const [closureDate, setClosureDate] = useState(new Date().toISOString().slice(0, 10));
  const calculated = useInterestAsOf(loan.id, closureDate, loan.interest?.totalInterestAccrued);
  const [interestCollected, setInterestCollected] = useState(calculated ?? '');
  const [touched, setTouched] = useState(false);
  const [waiver, setWaiver] = useState({ preset: '', note: '' });
  const [cardReturnedNow, setCardReturnedNow] = useState(!!loan.card_returned);
  const [notify, setNotify] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const cardNeedsReturn = loan.card_given && !loan.card_returned;

  // Follow the calculated figure as the date changes, until staff type
  // their own number.
  useEffect(() => {
    if (!touched && calculated != null) setInterestCollected(calculated);
  }, [calculated, touched]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!closureDate) return setError('Closure date is required.');
    if (interestCollected === '' || Number(interestCollected) < 0) return setError('Interest collected is required and must be 0 or more.');
    if (needsWaiverReason(calculated, interestCollected, waiver)) return setError('Give a reason for collecting less than the calculated interest.');
    if (cardNeedsReturn && !cardReturnedNow) return setError('Confirm the card has been returned before closing this loan.');
    setError('');
    setSaving(true);
    try {
      await onConfirm({
        closureDate,
        interestCollected: Number(interestCollected),
        cardReturned: cardReturnedNow,
        waiverReason: waiverReasonText(waiver) || undefined,
        notifyChannels: notify,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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
            onChange={(e) => {
              setTouched(true);
              setInterestCollected(e.target.value);
            }}
          />
        </div>
        <InterestWaiverFields calculated={calculated} collected={interestCollected} value={waiver} onChange={setWaiver} />

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

        <NotifyBorrower phone={loan.borrowers?.phone} value={notify} onChange={setNotify} label="Send closure confirmation" />

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Closing…' : 'Confirm Closure'}</button>
        </div>
      </form>
    </Modal>
  );
}
