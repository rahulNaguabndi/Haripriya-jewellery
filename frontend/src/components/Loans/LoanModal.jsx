import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import BorrowerModal from '../Borrowers/BorrowerModal.jsx';
import { api } from '../../services/api.js';

const itemTypes = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Bangle', 'Chain', 'Other'];
const metalTypes = ['Gold', 'Silver'];
const goldKarats = ['24k', '22k', '18k', '14k'];

const emptyItem = { itemType: 'Ring', metalType: 'Gold', grossWeight: '', netWeight: '', purity: '', description: '' };

const empty = {
  borrowerId: '',
  items: [{ ...emptyItem }],
  loanAmount: '',
  loanDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  interestRate: '',
  cardGiven: false,
};

function itemFromRow(row) {
  return {
    itemType: row.item_type,
    metalType: row.metal_type,
    grossWeight: row.gross_weight ?? '',
    netWeight: row.net_weight ?? '',
    purity: row.purity ?? '',
    description: row.description ?? '',
  };
}

export default function LoanModal({ loan, borrowerId, onClose, onSaved }) {
  const [form, setForm] = useState(
    loan
      ? {
          ...empty,
          borrowerId: loan.borrower_id,
          items: loan.loan_items?.length ? loan.loan_items.map(itemFromRow) : [{ ...emptyItem }],
          loanAmount: loan.loan_amount,
          loanDate: loan.loan_date,
          dueDate: loan.due_date ?? '',
          interestRate: loan.interest_rate,
          cardGiven: !!loan.card_given,
        }
      : { ...empty, borrowerId: borrowerId || '' }
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBorrowerModal, setShowBorrowerModal] = useState(false);
  const [borrowerQuery, setBorrowerQuery] = useState(loan?.borrowers?.name || '');
  const [borrowerOptions, setBorrowerOptions] = useState([]);
  const [showBorrowerDropdown, setShowBorrowerDropdown] = useState(false);

  function searchBorrowers(query) {
    const request = query
      ? api.get('/borrowers/search', { params: { name: query, limit: 20 } })
      : api.get('/borrowers', { params: { limit: 20 } });
    return request.then((res) => setBorrowerOptions(res.data.data)).catch(() => {});
  }

  useEffect(() => {
    if (borrowerId || loan) return;
    const timeout = setTimeout(() => searchBorrowers(borrowerQuery), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowerQuery, borrowerId, loan]);

  function selectBorrower(b) {
    set('borrowerId', b.id);
    setBorrowerQuery(b.name);
    setShowBorrowerDropdown(false);
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateItem(index, field, value) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === index ? { ...it, [field]: value } : it)),
    }));
  }

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { ...emptyItem }] }));
  }

  function removeItem(index) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!loan && !borrowerId && !form.borrowerId) {
      setError('Select a borrower from the dropdown list.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        borrowerId: form.borrowerId,
        items: form.items.map((it) => ({
          itemType: it.itemType,
          metalType: it.metalType,
          grossWeight: it.grossWeight === '' ? null : Number(it.grossWeight),
          netWeight: it.netWeight === '' ? null : Number(it.netWeight),
          purity: it.purity || null,
          description: it.description || null,
        })),
        loanAmount: Number(form.loanAmount),
        loanDate: form.loanDate,
        dueDate: form.dueDate || null,
        interestRate: form.interestRate === '' ? undefined : Number(form.interestRate),
        cardGiven: form.cardGiven,
      };
      if (loan) {
        await api.put(`/loans/${loan.id}`, payload);
      } else {
        await api.post('/loans', payload);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={loan ? 'Edit Loan' : 'New Loan'} onClose={onClose} width={600}>
      <form onSubmit={handleSubmit}>
        {!borrowerId && (
          <div className="field" style={{ position: 'relative' }}>
            <label>Borrower *</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                required
                style={{ flex: 1 }}
                placeholder="Type to search borrowers…"
                value={borrowerQuery}
                disabled={!!loan}
                onFocus={() => setShowBorrowerDropdown(true)}
                onChange={(e) => {
                  setBorrowerQuery(e.target.value);
                  set('borrowerId', '');
                  setShowBorrowerDropdown(true);
                }}
              />
              {!loan && (
                <button type="button" className="btn btn-secondary" onClick={() => setShowBorrowerModal(true)}>
                  + New Borrower
                </button>
              )}
            </div>
            {showBorrowerDropdown && !loan && borrowerOptions.length > 0 && (
              <>
                <div onClick={() => setShowBorrowerDropdown(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                <div
                  className="card"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 11,
                    maxHeight: 220,
                    overflowY: 'auto',
                    marginTop: 4,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                  }}
                >
                  {borrowerOptions.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => selectBorrower(b)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13.5, borderBottom: '1px solid var(--divider)' }}
                    >
                      <div style={{ fontWeight: 600 }}>{b.name}</div>
                      {b.phone && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{b.phone}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
            {!form.borrowerId && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                Search and select a borrower from the list.
              </div>
            )}
          </div>
        )}

        <label>Pledged Items *</label>
        {form.items.map((item, i) => (
          <div key={i} className="card" style={{ padding: 12, marginBottom: 10, background: 'var(--hover)' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Item Type *</label>
                <select required value={item.itemType} onChange={(e) => updateItem(i, 'itemType', e.target.value)}>
                  {itemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Metal Type *</label>
                <select
                  required
                  value={item.metalType}
                  onChange={(e) => {
                    updateItem(i, 'metalType', e.target.value);
                    updateItem(i, 'purity', '');
                  }}
                >
                  {metalTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Gross Weight (g)</label>
                <input type="number" step="0.01" value={item.grossWeight} onChange={(e) => updateItem(i, 'grossWeight', e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Net Weight (g, excl. stones)</label>
                <input type="number" step="0.01" value={item.netWeight} onChange={(e) => updateItem(i, 'netWeight', e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Purity</label>
                {item.metalType === 'Gold' ? (
                  <select value={item.purity} onChange={(e) => updateItem(i, 'purity', e.target.value)}>
                    <option value="">Select karat…</option>
                    {goldKarats.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                ) : (
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="Melt yield %"
                    value={item.purity}
                    onChange={(e) => updateItem(i, 'purity', e.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11.5 }}>Description</label>
              <input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} />
            </div>
            {form.items.length > 1 && (
              <button type="button" className="btn btn-danger" onClick={() => removeItem(i)}>Remove Item</button>
            )}
          </div>
        ))}
        <button type="button" className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={addItem}>
          + Add Another Item
        </button>

        <div className="field">
          <label>Packet Number</label>
          <input disabled value={loan?.packet_number ?? 'Auto-assigned on save'} />
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Used for physical storage/locker lookup - assigned automatically, not editable.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Loan Amount (₹) *</label>
            <input type="number" step="0.01" required value={form.loanAmount} onChange={(e) => set('loanAmount', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Interest Rate (% / yr)</label>
            <input
              type="number"
              step="0.01"
              placeholder="Auto from tiers"
              value={form.interestRate}
              onChange={(e) => set('interestRate', e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Loan Date *</label>
            <input type="date" required value={form.loanDate} onChange={(e) => set('loanDate', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Due Date (informational only)</label>
            <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Not enforced - loans stay open past this date. Purely a reminder for admin reference.
            </div>
          </div>
        </div>

        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.cardGiven}
              onChange={(e) => set('cardGiven', e.target.checked)}
              style={{ width: 'auto' }}
            />
            Card Given
          </label>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Only check this if a physical loan card was handed to the borrower. It must be marked returned before the loan can be closed.
          </div>
        </div>

        {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      {showBorrowerModal && (
        <BorrowerModal
          onClose={() => setShowBorrowerModal(false)}
          onSaved={(newBorrower) => {
            setShowBorrowerModal(false);
            selectBorrower(newBorrower);
          }}
        />
      )}
    </Modal>
  );
}
