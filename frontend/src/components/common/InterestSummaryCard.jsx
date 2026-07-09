import { useState } from 'react';
import { formatCurrency, formatDate } from '../../utils/formatters.js';

export default function InterestSummaryCard({ interest }) {
  const [showInfo, setShowInfo] = useState(false);

  if (!interest) return null;

  const rows = [
    ['Principal remaining', formatCurrency(interest.principalRemaining)],
    ['Interest accrued', formatCurrency(interest.totalInterestAccrued)],
    ['Total amount due', formatCurrency(interest.totalAmountDue)],
    ['Applied interest rate', `${interest.appliedInterestRate}% / yr`],
    ['Days elapsed', interest.daysElapsed],
  ];

  const breakdown = interest.breakdown || [];

  const segments = [];
  for (const chunk of breakdown) {
    const last = segments[segments.length - 1];
    if (last && last.segmentLabel === chunk.segmentLabel) {
      last.chunks.push(chunk);
    } else {
      segments.push({ segmentLabel: chunk.segmentLabel, chunks: [chunk] });
    }
  }

  return (
    <div className="card" style={{ padding: 20, position: 'relative' }}>
      <div className="font-serif" style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Interest Summary</div>

      <button
        type="button"
        aria-label="How is this loan's interest calculated?"
        onClick={() => setShowInfo((v) => !v)}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 20,
          height: 20,
          borderRadius: '50%',
          border: '1px solid var(--text-muted)',
          background: 'none',
          color: 'var(--text-muted)',
          fontSize: 12,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        i
      </button>

      {showInfo && (
        <>
          <div onClick={() => setShowInfo(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
          <div
            className="card"
            style={{
              position: 'absolute',
              top: 44,
              left: 20,
              right: 20,
              zIndex: 11,
              padding: 16,
              fontSize: 13,
              lineHeight: 1.5,
              maxHeight: 420,
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>How this loan's interest was calculated</div>

            {breakdown.length === 0 && (
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>No interest has accrued yet.</p>
            )}

            {segments.map((segment, i) => {
              const totalDays = segment.chunks.reduce((sum, c) => sum + c.days, 0);
              const years = Math.floor(totalDays / 365);
              const remainder = totalDays % 365;
              const months = Math.floor(remainder / 30);
              const remDays = Math.round(remainder % 30);

              const rate = segment.chunks[0].rate;
              const openingBalance = segment.chunks[0].openingBalance;
              const totalInterest = segment.chunks.reduce((sum, c) => sum + c.interest, 0);

              const perYear = (openingBalance * rate) / 100;
              const perMonth = (openingBalance * rate) / 100 / 12;
              const perDay = (openingBalance * rate) / 100 / 365;

              const durationLabel = `${years > 0 ? `${years}Y ` : ''}${months}M ${remDays}D`;

              return (
                <div key={i}>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      marginTop: i === 0 ? 0 : 14,
                      marginBottom: 6,
                    }}
                  >
                    {segment.segmentLabel}
                  </div>
                  <div
                    style={{
                      border: '1px solid var(--border, #e5ddd0)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      marginBottom: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                      <span>{durationLabel} = {formatCurrency(totalInterest)} interest</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                      {years > 0 && <>{formatCurrency(perYear)} / year · </>}
                      {formatCurrency(perMonth)} / month · {formatCurrency(perDay)} / day
                    </div>
                  </div>
                </div>
              );
            })}

            {breakdown.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border, #e5ddd0)' }}>
                <span>Total interest accrued</span>
                <span>{formatCurrency(interest.totalInterestAccrued)}</span>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 10, columnGap: 12 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
