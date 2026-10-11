import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';

let configPromise = null;
function loadConfig() {
  if (!configPromise) configPromise = api.get('/messages/config').then((r) => r.data).catch(() => null);
  return configPromise;
}

// "Send confirmation to the borrower" checkboxes for the payment and
// closure dialogs. value: array of channels ('whatsapp' | 'sms'); start it
// as [] - once the messaging config loads, the first live channel is
// pre-ticked (nothing is pre-ticked while no provider is set up).
export default function NotifyBorrower({ phone, value, onChange, label = 'Send confirmation to borrower' }) {
  const [config, setConfig] = useState(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let alive = true;
    loadConfig().then((c) => {
      if (!alive) return;
      setConfig(c);
      const live = ['whatsapp', 'sms'].find((ch) => c?.channels?.[ch]);
      if (phone && live && !touched) onChange([live]);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (channel, on) => {
    setTouched(true);
    onChange(on ? [...new Set([...value, channel])] : value.filter((c) => c !== channel));
  };
  const anyLive = config && (config.channels?.whatsapp || config.channels?.sms);

  return (
    <div className="field">
      <label>{label}</label>
      {!phone ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No phone number on file for this borrower.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {[
              ['whatsapp', 'WhatsApp'],
              ['sms', 'SMS'],
            ].map(([channel, text]) => (
              <label key={channel} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, fontSize: 13.5, margin: 0 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={value.includes(channel)} onChange={(e) => toggle(channel, e.target.checked)} />
                {text}
                {config && !config.channels?.[channel] && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>(not set up)</span>}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            To {phone}.{config && !anyLive ? ' Messaging isn’t configured yet, so this is only recorded in the message log.' : ''}
          </div>
        </>
      )}
    </div>
  );
}

// Fire-and-forget send after the payment/closure itself has saved: a
// messaging failure must never look like the payment failed. Every attempt
// is recorded server-side in the message log.
export function sendConfirmation(payload) {
  if (!payload.channels?.length) return Promise.resolve(null);
  return api.post('/messages/confirmation', payload).then((r) => r.data).catch((err) => {
    console.warn('[messages] confirmation not sent:', err.message);
    return null;
  });
}
