import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import NotifyBorrower, { sendConfirmation } from '../Messaging/NotifyBorrower.jsx';
import { api } from '../../services/api.js';

const paymentTypes = ['cash', 'upi', 'cheque', 'transfer'];
const TYPE_LABELS = { cash: 'Cash', upi: 'UPI', cheque: 'Cheque', transfer: 'Bank transfer' };

// borrowerPhone: when given, offers a WhatsApp/SMS "payment received"
// confirmation that goes out after the payment is saved.
export default function PaymentModal({ loanId, borrowerPhone, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentType: 'cash',
    notes: '',
  });
  const [notify, setNotify] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/payments', { ...form, loanId, amount: Number(form.amount) });
      sendConfirmation({ kind: 'payment', loanId, paymentId: res.data.id, channels: notify });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Record Payment" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Amount (₹) *</label>
          <input type="number" step="0.01" required autoFocus value={form.amount} onChange={(e) => set('amount', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Payment Date *</label>
            <input type="date" required value={form.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Payment Type</label>
            <select value={form.paymentType} onChange={(e) => set('paymentType', e.target.value)}>
              {paymentTypes.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>

        {borrowerPhone !== undefined && <NotifyBorrower phone={borrowerPhone} value={notify} onChange={setNotify} />}

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
