import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../common/Modal.jsx';
import BorrowerModal from '../Borrowers/BorrowerModal.jsx';
import { api } from '../../services/api.js';
import { useBranch } from '../../context/BranchContext.jsx';

const itemTypes = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Bangle', 'Chain', 'Other'];
const metalTypes = ['Gold', 'Silver'];
const goldKarats = ['24k', '22k', '18k', '14k'];

// BIS Hallmark Unique ID: exactly 6 letters/digits, laser-marked on the article.
const HUID_RE = /^[A-Z0-9]{6}$/;

const emptyItem = { itemType: 'Ring', metalType: 'Gold', grossWeight: '', netWeight: '', purity: '', description: '', huid: '' };

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
    huid: row.huid ?? '',
  };
}

// repledgeFrom: a closed loan whose borrower + items prefill a brand-new
// loan (returning customer pledging the same ornaments again). Only the
// amount and dates need filling in.
export default function LoanModal({ loan, borrowerId, repledgeFrom, onClose, onSaved }) {
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
      : repledgeFrom
      ? {
          ...empty,
          borrowerId: repledgeFrom.borrower_id,
          items: repledgeFrom.loan_items?.length ? repledgeFrom.loan_items.map(itemFromRow) : [{ ...emptyItem }],
        }
      : { ...empty, borrowerId: borrowerId || '' }
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showBorrowerModal, setShowBorrowerModal] = useState(false);
  const [borrowerQuery, setBorrowerQuery] = useState(loan?.borrowers?.name || repledgeFrom?.borrowers?.name || '');
  const [borrowerOptions, setBorrowerOptions] = useState([]);
  const [showBorrowerDropdown, setShowBorrowerDropdown] = useState(false);
  const [huidMatches, setHuidMatches] = useState({});
  const navigate = useNavigate();
  const { multiBranch, activeBranches, currentBranch, homeBranchId, pinnedBranchId } = useBranch();
  // New loans go to the branch being viewed; in "All branches" the user picks.
  const chooseBranch = !loan && multiBranch && !pinnedBranchId;
  const [branchId, setBranchId] = useState(
    () => currentBranch?.id || homeBranchId || activeBranches.find((b) => b.is_default)?.id || activeBranches[0]?.id || ''
  );

  // Same hallmarked piece already on another loan = possible double-pledge.
  async function checkHuid(index, huid) {
    const clean = (huid || '').replace(/\s+/g, '').toUpperCase();
    if (!HUID_RE.test(clean)) {
      setHuidMatches((m) => ({ ...m, [index]: null }));
      return;
    }
    try {
      const res = await api.get('/loans/huid-check', { params: { huid: clean, excludeLoanId: loan?.id } });
      setHuidMatches((m) => ({ ...m, [index]: res.data.matches }));
    } catch {
      setHuidMatches((m) => ({ ...m, [index]: null }));
    }
  }

  function searchBorrowers(query) {
    const request = query
      ? api.get('/borrowers/search', { params: { name: query, limit: 20 } })
      : api.get('/borrowers', { params: { limit: 20 } });
    return request.then((res) => setBorrowerOptions(res.data.data)).catch(() => {});
  }

  useEffect(() => {
    if (borrowerId || loan || repledgeFrom) return;
    const timeout = setTimeout(() => searchBorrowers(borrowerQuery), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowerQuery, borrowerId, loan, repledgeFrom]);

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
    const printAfter = e.nativeEvent?.submitter?.dataset?.print === 'true';
    const badHuid = form.items.find((it) => it.huid && !HUID_RE.test(it.huid));
    if (badHuid) {
      setError(`HUID "${badHuid.huid}" must be exactly 6 letters/digits (or left blank).`);
      return;
    }
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
          huid: it.huid || null,
        })),
        loanAmount: Number(form.loanAmount),
        loanDate: form.loanDate,
        dueDate: form.dueDate || null,
        interestRate: form.interestRate === '' ? undefined : Number(form.interestRate),
        cardGiven: form.cardGiven,
        repledgedFromLoanId: repledgeFrom?.id,
        ...(chooseBranch && branchId ? { branchId } : {}),
      };
      const saved = loan ? await api.put(`/loans/${loan.id}`, payload) : await api.post('/loans', payload);
      if (printAfter) {
        navigate(`/loans/${saved.data.id}/print?autoprint=1`);
        return;
      }
      onSaved(saved.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={loan ? 'Edit Loan' : repledgeFrom ? 'Re-pledge items' : 'New Loan'} onClose={onClose} width={600}>
      <form onSubmit={handleSubmit}>
        {repledgeFrom && (
          <div style={{ fontSize: 13, background: 'var(--gold-soft, var(--hover))', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 16, lineHeight: 1.5 }}>
            Copied borrower and items from <strong className="num">{repledgeFrom.loan_number}</strong>
            {repledgeFrom.closure_date ? <> (closed {new Date(repledgeFrom.closure_date).toLocaleDateString('en-IN')})</> : null}.
            Re-check the items, then enter the <strong>loan amount</strong>. Photos carry over too.
          </div>
        )}
        {!borrowerId && (
          <div className="field" style={{ position: 'relative' }}>
            <label>Borrower *</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                required
                style={{ flex: 1 }}
                placeholder="Type to search borrowers…"
                value={borrowerQuery}
                disabled={!!loan || !!repledgeFrom}
                onFocus={() => setShowBorrowerDropdown(true)}
                onChange={(e) => {
                  setBorrowerQuery(e.target.value);
                  set('borrowerId', '');
                  setShowBorrowerDropdown(true);
                }}
              />
              {!loan && !repledgeFrom && (
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
            <div className="form-row">
              <div className="field" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Item Type *</label>
                <select required value={item.itemType} onChange={(e) => updateItem(i, 'itemType', e.target.value)}>
                  {itemTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
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
            <div className="form-row">
              <div className="field" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Gross Weight (g)</label>
                <input type="number" step="0.01" value={item.grossWeight} onChange={(e) => updateItem(i, 'grossWeight', e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>Net Weight (g, excl. stones)</label>
                <input type="number" step="0.01" value={item.netWeight} onChange={(e) => updateItem(i, 'netWeight', e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
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
            <div className="form-row">
              <div className="field" style={{ marginBottom: 8, flexGrow: 2 }}>
                <label style={{ fontSize: 11.5 }}>Description</label>
                <input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11.5 }}>HUID (if hallmarked)</label>
                <input
                  value={item.huid}
                  maxLength={6}
                  placeholder="e.g. AB12CD"
                  autoCapitalize="characters"
                  spellCheck={false}
                  style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.12em', textTransform: 'uppercase' }}
                  onChange={(e) => updateItem(i, 'huid', e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                  onBlur={(e) => checkHuid(i, e.target.value)}
                />
              </div>
            </div>
            {item.huid && item.huid.length !== 6 && (
              <div style={{ fontSize: 11.5, color: 'var(--warning)', marginBottom: 8 }}>HUID is 6 characters ({item.huid.length} entered).</div>
            )}
            {(() => {
              // An open loan with the same HUID is a possible double pledge;
              // a closed one just means the piece was pledged here before.
              const matches = huidMatches[i] || [];
              const open = matches.filter((m) => m.status !== 'closed');
              const closed = matches.filter((m) => m.status === 'closed' && m.loanId !== repledgeFrom?.id);
              const describe = (list) => list.map((m) => `${m.loanNumber} (${m.borrowerName || 'unknown'})`).join('; ');
              return (
                <>
                  {open.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger-soft)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                      This HUID is on an open loan: {describe(open)}. Check for a double pledge.
                    </div>
                  )}
                  {closed.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--hover)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                      Pledged here before on {describe(closed)} (closed).
                    </div>
                  )}
                </>
              );
            })()}
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

        {chooseBranch && (
          <div className="field">
            <label>Branch *</label>
            <select required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {activeBranches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>Where the packet is kept and the cash is counted.</div>
          </div>
        )}

        <div className="form-row">
          <div className="field">
            <label>Loan Amount (₹) *</label>
            <input type="number" step="0.01" required value={form.loanAmount} onChange={(e) => set('loanAmount', e.target.value)} />
          </div>
          <div className="field">
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

        <div className="form-row">
          <div className="field">
            <label>Loan Date *</label>
            <input type="date" required value={form.loanDate} onChange={(e) => set('loanDate', e.target.value)} />
          </div>
          <div className="field">
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

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 6 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-secondary" disabled={saving} data-print="false">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving} data-print="true">
            Save &amp; print pledge form
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
