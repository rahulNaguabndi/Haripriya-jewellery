import { useState } from 'react';
import Modal from '../common/Modal.jsx';
import { api } from '../../services/api.js';
import { formatDate } from '../../utils/formatters.js';

// BIS publishes no HUID lookup API - verification is done in the official
// BIS CARE app ("Verify HUID"), which shows the jeweller's registration,
// article type, purity and assaying centre for a given HUID. This page is
// BIS's own explainer and app links.
const BIS_CARE_INFO_URL = 'https://www.bis.gov.in/hallmarking-overview/consumer-protection/?lang=en';

export function HuidChip({ item }) {
  if (!item.huid) return null;
  const verified = !!item.huid_verified_at;
  return (
    <span
      className={`badge ${verified ? 'badge-green' : 'badge-amber'}`}
      title={verified ? `Verified on BIS CARE ${formatDate(item.huid_verified_at)}${item.huid_verification_note ? ` - ${item.huid_verification_note}` : ''}` : 'HUID not yet verified'}
      style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '0.06em' }}
    >
      HUID {item.huid} · {verified ? 'verified' : 'unverified'}
    </span>
  );
}

export default function HuidVerificationModal({ loanId, item, onClose, onSaved }) {
  const [note, setNote] = useState(item.huid_verification_note || '');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.huid);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function save(verified) {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/loans/${loanId}/items/${item.id}/huid-verification`, { verified, note: note || null });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Verify HUID" onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.item_type} · {item.metal_type}{item.purity ? ` · ${item.purity}` : ''}</div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 30, fontWeight: 700, letterSpacing: '0.2em', margin: '6px 0' }}>{item.huid}</div>
        <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? '✓ Copied' : 'Copy HUID'}</button>
      </div>

      <ol style={{ fontSize: 13.5, lineHeight: 1.6, paddingLeft: 20, marginTop: 0 }}>
        <li>Open the <b>BIS CARE</b> app (Android / iOS) → <b>Verify HUID</b>.</li>
        <li>Enter the HUID above and check the result matches the article: <b>type</b>, <b>purity</b> (e.g. 22K916) and jeweller.</li>
        <li>Note what BIS CARE showed below, then mark it verified.</li>
      </ol>
      <a href={BIS_CARE_INFO_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--gold-deep)' }}>
        About BIS CARE &amp; HUID on bis.gov.in ↗
      </a>

      <div className="field" style={{ marginTop: 14 }}>
        <label>What BIS CARE showed</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Necklace, 22K916, matches jeweller" />
      </div>

      {item.huid_verified_at && (
        <div style={{ fontSize: 12.5, color: 'var(--success)', marginBottom: 10 }}>Verified on {formatDate(item.huid_verified_at)}.</div>
      )}
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {item.huid_verified_at && (
          <button type="button" className="btn btn-danger" disabled={saving} onClick={() => save(false)}>Clear verification</button>
        )}
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
          {saving ? 'Saving…' : 'Mark verified'}
        </button>
      </div>
    </Modal>
  );
}
