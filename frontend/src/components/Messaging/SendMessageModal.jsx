import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import { ListSkeleton } from '../common/Skeleton.jsx';
import { api } from '../../services/api.js';

const CHANNEL_LABEL = { whatsapp: 'WhatsApp', sms: 'SMS' };
const STATUS_TEXT = { sent: 'Sent', failed: 'Failed', skipped: 'Skipped', not_configured: 'Logged (provider not set up)' };

// Preview-then-send dialog for borrower notices over WhatsApp and/or SMS.
// Works before any provider keys exist: sends are then logged as
// "not configured", so staff can see exactly who would be contacted.
export default function SendMessageModal({ loanIds, onClose }) {
  const [config, setConfig] = useState(null);
  const [channels, setChannels] = useState(['whatsapp']);
  const [noticeDays, setNoticeDays] = useState(15);
  const [preview, setPreview] = useState(null);
  const [expanded, setExpanded] = useState(0);
  const [result, setResult] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/messages/config').then((res) => {
      setConfig(res.data);
      setNoticeDays(res.data.defaultNoticeDays);
    }).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .post('/messages/preview', { loanIds, template: 'auction_notice', noticeDays: Number(noticeDays) || 15 })
        .then((res) => setPreview(res.data.data))
        .catch((err) => setError(err.message));
    }, 250);
    return () => clearTimeout(t);
  }, [loanIds, noticeDays]);

  function toggle(channel) {
    setChannels((cs) => (cs.includes(channel) ? cs.filter((c) => c !== channel) : [...cs, channel]));
  }

  async function send() {
    const ready = preview.filter((p) => !p.problems.length).length;
    if (!confirm(`Send the auction notice to ${ready} borrower(s) by ${channels.map((c) => CHANNEL_LABEL[c]).join(' + ')}?`)) return;
    setSending(true);
    setError('');
    try {
      const res = await api.post('/messages/send', { loanIds, channels, template: 'auction_notice', noticeDays: Number(noticeDays) });
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const blocked = preview?.filter((p) => p.problems.length) || [];

  return (
    <Modal title={loanIds.length > 1 ? `Message ${loanIds.length} borrowers` : 'Message borrower'} onClose={onClose} width={620}>
      {result ? (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 10, marginBottom: 14 }}>
            {[['Sent', result.summary.sent, 'var(--success)'], ['Logged only', result.summary.notConfigured, 'var(--warning)'], ['Skipped', result.summary.skipped, 'var(--text-muted)'], ['Failed', result.summary.failed, 'var(--danger)']].map(([label, n, color]) => (
              <div key={label} className="card" style={{ padding: 12, textAlign: 'center' }}>
                <div className="font-serif tabular" style={{ fontSize: 24, fontWeight: 700, color }}>{n}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {result.results.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
                <span>{r.borrowerName || '—'} · {r.loanNumber} · {CHANNEL_LABEL[r.channel]}</span>
                <span title={r.error || ''} style={{ color: r.status === 'sent' ? 'var(--success)' : r.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {STATUS_TEXT[r.status]}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <label>Send by</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['whatsapp', 'sms'].map((c) => (
                  <label key={c} className="btn btn-secondary" style={{ margin: 0, fontWeight: 500, borderColor: channels.includes(c) ? 'var(--gold)' : undefined }}>
                    <input type="checkbox" checked={channels.includes(c)} onChange={() => toggle(c)} style={{ width: 'auto', margin: 0 }} />
                    {CHANNEL_LABEL[c]}
                    {config && !config.channels[c] && <span className="badge badge-amber" style={{ marginLeft: 4 }}>not set up</span>}
                  </label>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0, width: 150 }}>
              <label>Days to respond</label>
              <input type="number" min="1" max="365" value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} />
            </div>
          </div>

          {config && channels.some((c) => !config.channels[c]) && (
            <div style={{ fontSize: 12.5, background: 'var(--warning-soft)', color: 'var(--warning)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
              {channels.filter((c) => !config.channels[c]).map((c) => CHANNEL_LABEL[c]).join(' and ')} isn't connected yet. Messages will be
              recorded in the log but not delivered until the API keys are added on the server.
            </div>
          )}

          {!preview ? (
            <ListSkeleton rows={3} />
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
              {preview.map((p, i) => (
                <div key={p.loanId} style={{ borderBottom: '1px solid var(--divider)', padding: '8px 0' }}>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === i ? -1 : i)}
                    style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', width: '100%', gap: 10, fontSize: 13.5 }}
                  >
                    <span><b>{p.borrowerName || '—'}</b> · {p.loanNumber}</span>
                    <span style={{ color: p.problems.length ? 'var(--danger)' : 'var(--text-muted)', fontSize: 12.5 }}>
                      {p.problems.length ? p.problems[0] : p.to}
                    </span>
                  </button>
                  {expanded === i && (
                    <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--divider)', fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                      {p.text}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {blocked.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
              {blocked.length} will be skipped (missing/invalid phone or closed loan).
            </div>
          )}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={send}
              disabled={sending || !preview || channels.length === 0 || preview.every((p) => p.problems.length)}
            >
              {sending ? 'Sending…' : 'Send notice'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
