import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import Modal from '../common/Modal.jsx';
import { Skeleton } from '../common/Skeleton.jsx';

// Two business-wide switches that live on the business profile row:
//  - require a borrower OTP before ornaments are released (loan closure)
//  - who gets the nightly email summary (+ preview / send now)
export default function OperationsCard({ canEdit }) {
  const [profile, setProfile] = useState(null);
  const [requireOtp, setRequireOtp] = useState(false);
  const [emails, setEmails] = useState('');
  const [smsReady, setSmsReady] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState({ text: '', ok: true });

  useEffect(() => {
    api
      .get('/business-profile')
      .then((res) => {
        setProfile(res.data);
        setRequireOtp(!!res.data.require_release_otp);
        setEmails(res.data.digest_emails || '');
      })
      .catch((err) => setMessage({ text: err.message, ok: false }));
    api
      .get('/messages/config')
      .then((res) => setSmsReady(!!res.data.channels?.sms))
      .catch(() => {});
  }, []);

  async function act(name, fn) {
    setBusy(name);
    setMessage({ text: '', ok: true });
    try {
      const text = await fn();
      setMessage({ text, ok: true });
    } catch (err) {
      setMessage({ text: err.message, ok: false });
    } finally {
      setBusy('');
    }
  }

  const save = () =>
    act('save', async () => {
      const { data } = await api.put('/business-profile', { legalName: profile.legal_name, requireReleaseOtp: requireOtp, digestEmails: emails.trim() });
      setProfile(data);
      return 'Saved.';
    });

  const openPreview = () =>
    act('preview', async () => {
      const { data } = await api.get('/digest/preview');
      setPreview(data);
      return '';
    });

  const sendNow = () =>
    act('send', async () => {
      const { data } = await api.post('/digest/send');
      return data.status === 'sent'
        ? `Sent to ${data.recipients.join(', ')}.`
        : 'Built the summary, but email isn’t set up on the server yet (SMTP_* settings) - nothing was sent.';
    });

  return (
    <div className="card" style={{ padding: 22, marginBottom: 24 }}>
      <h2 className="section-title" style={{ marginBottom: 14 }}>Release OTP &amp; nightly email</h2>
      {!profile ? (
        <Skeleton height={120} />
      ) : (
        <>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, marginBottom: 4 }}>
            <input type="checkbox" style={{ width: 'auto', marginTop: 3 }} checked={requireOtp} disabled={!canEdit} onChange={(e) => setRequireOtp(e.target.checked)} />
            <span>
              <strong>Require an OTP before releasing ornaments</strong>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)' }}>
                Closing a loan sends a code to the borrower&apos;s phone; staff type it in. Admins can still release without one by giving a reason. When off, OTP stays optional in the close dialog.
              </span>
            </span>
          </label>
          <div style={{ fontSize: 12.5, marginBottom: 18, marginLeft: 26, color: smsReady ? 'var(--success)' : 'var(--warning)' }}>
            {smsReady == null ? '' : smsReady ? 'SMS (Twilio) is connected.' : 'SMS (Twilio) isn’t connected yet - OTPs are logged but not delivered. See docs/MESSAGING_SETUP.md.'}
          </div>

          <div className="field">
            <label>Nightly summary goes to</label>
            <input value={emails} disabled={!canEdit} placeholder="owner@example.com, partner@example.com" onChange={(e) => setEmails(e.target.value)} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Sent every night at about 9:30 PM: each branch&apos;s cash, whether the counter was closed and balanced, the latest rate move and the loans to call about.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canEdit && <button className="btn btn-primary" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>}
            <button className="btn btn-secondary" onClick={openPreview} disabled={!!busy}>{busy === 'preview' ? 'Building…' : 'Preview today’s email'}</button>
            {canEdit && <button className="btn btn-ghost" onClick={sendNow} disabled={!!busy}>{busy === 'send' ? 'Sending…' : 'Send now'}</button>}
          </div>
          {message.text && <div style={{ fontSize: 13, marginTop: 10, color: message.ok ? 'var(--success)' : 'var(--danger)' }}>{message.text}</div>}
        </>
      )}

      {preview && (
        <Modal title="Nightly email preview" onClose={() => setPreview(null)} width={780}>
          <div style={{ fontSize: 13, marginBottom: 6 }}><strong>Subject:</strong> {preview.subject}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
            To: {preview.recipients.length ? preview.recipients.join(', ') : 'nobody yet - add an address above'}
            {!preview.emailConfigured && ' · SMTP not configured on the server, so it won’t actually send yet'}
          </div>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" style={{ width: '100%', height: '60vh', border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }} />
        </Modal>
      )}
    </div>
  );
}
