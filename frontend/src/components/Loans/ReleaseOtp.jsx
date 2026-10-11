import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';

const RESEND_AFTER = 30;

// Borrower verification before the ornaments are handed back: send a code
// to the phone on file, type what the borrower reads out. `value` is
// { otpId, verified, overrideReason }. When the business requires it and
// the user is an admin, they may release without an OTP by giving a reason.
export default function ReleaseOtp({ loanId, phone, required, isAdmin, value, onChange }) {
  const [open, setOpen] = useState(required);
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const [overriding, setOverriding] = useState(false);

  useEffect(() => {
    if (required) setOpen(true);
  }, [required]);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function send() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/loans/${loanId}/release-otp`);
      setSent(data);
      setCode('');
      setWait(RESEND_AFTER);
      onChange({ otpId: data.otpId, verified: false, overrideReason: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code.');
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/loans/${loanId}/release-otp/verify`, { otpId: sent.otpId, code });
      onChange({ otpId: data.otpId, verified: true, overrideReason: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const box = { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, background: 'var(--surface-2)' };

  if (!open) {
    return (
      <div className="field">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Verify borrower with OTP (optional)</button>
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Verify borrower</div>
        <span className={`badge ${required ? 'badge-defaulted' : 'badge-closed'}`}>{required ? 'Required' : 'Optional'}</span>
      </div>

      {value.verified ? (
        <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: 14 }}>✓ OTP verified - safe to hand over the ornaments.</div>
      ) : overriding ? (
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Reason for releasing without OTP *</label>
          <input
            value={value.overrideReason || ''}
            placeholder="e.g. Borrower present with Aadhaar, phone lost"
            onChange={(e) => onChange({ otpId: null, verified: false, overrideReason: e.target.value })}
            autoFocus
          />
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => { setOverriding(false); onChange({ otpId: null, verified: false, overrideReason: '' }); }}>
            Use OTP instead
          </button>
        </div>
      ) : !phone ? (
        <div style={{ fontSize: 13, color: 'var(--warning)' }}>No mobile number on file for this borrower - add one to send an OTP.</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            A 6-digit code goes by SMS to the borrower&apos;s phone on file. Ask them to read it out.
          </div>
          {!sent ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send OTP'}</button>
          ) : (
            <>
              <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                Sent to <span className="tabular">{sent.sentTo}</span>
                {sent.deliveryStatus === 'not_configured' && (
                  <span style={{ display: 'block', color: 'var(--warning)', marginTop: 4 }}>
                    SMS isn&apos;t set up yet, so nothing was delivered.
                    {sent.devCode && <> Test code: <strong className="tabular">{sent.devCode}</strong></>}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  className="otp-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  placeholder="••••••"
                  aria-label="OTP"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && verify(e)}
                />
                <button type="button" className="btn btn-primary btn-sm" onClick={verify} disabled={busy || code.length !== 6}>Verify</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={send} disabled={busy || wait > 0}>{wait > 0 ? `Resend in ${wait}s` : 'Resend'}</button>
              </div>
            </>
          )}
        </>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}

      {required && isAdmin && !value.verified && !overriding && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setOverriding(true)}>
          Release without OTP…
        </button>
      )}
    </div>
  );
}
