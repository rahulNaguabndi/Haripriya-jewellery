import { getActiveBusinessProfile } from '../../utils/businessProfile.js';
import { listBranches } from '../../utils/branches.js';
import { branchDayStatus } from '../../controllers/cashCloseController.js';
import { computeRateRisk } from '../../controllers/coverageController.js';
import { todayIST } from '../../controllers/insightsController.js';

// The owner's nightly email: the day's money per branch, whether each
// counter was closed and balanced, what the latest gold/silver move did to
// the book, and the loans to call about first. One HTML body (inline
// styles - email clients ignore <style>) plus a plain-text fallback.

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const inr = (n) => (n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
const signed = (n) => `${n < 0 ? '−' : '+'}${inr(Math.abs(n))}`;
const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const C = { ink: '#20160F', muted: '#8A7B5E', border: '#E6D8BC', bg: '#F7F1E6', card: '#FFFCF5', gold: '#B78C3C', red: '#b3413a', amber: '#8a6512', green: '#3f7d4f' };
const RISK_COLOR = { critical: C.red, high: C.red, medium: C.amber, low: C.muted };

function recipientsFrom(profile) {
  const raw = profile.digest_emails || process.env.DIGEST_TO || profile.email || '';
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

export async function buildDailyDigest({ date = todayIST(), appUrl = process.env.APP_URL } = {}) {
  const [profile, branches] = await Promise.all([getActiveBusinessProfile(), listBranches({ fresh: true })]);
  const active = branches.filter((b) => b.is_active);
  const [days, risk] = await Promise.all([Promise.all(active.map((b) => branchDayStatus(b, date))), computeRateRisk(null, { limit: 10 })]);
  const businessName = profile.trade_name || profile.legal_name;
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const total = days.reduce(
    (t, d) => ({
      moneyIn: t.moneyIn + d.totals.moneyIn,
      moneyOut: t.moneyOut + d.totals.moneyOut,
      newLoans: t.newLoans + d.totals.counts.newLoans,
      closures: t.closures + d.totals.counts.closures,
      payments: t.payments + d.totals.counts.payments,
      interest: t.interest + d.totals.interestCollected,
      waived: t.waived + d.totals.interestWaived,
    }),
    { moneyIn: 0, moneyOut: 0, newLoans: 0, closures: 0, payments: 0, interest: 0, waived: 0 }
  );
  const notClosed = days.filter((d) => !d.close);
  const offBalance = days.filter((d) => d.close && Number(d.close.variance) !== 0);

  const rateLine = risk.rates
    .filter((r) => r.current)
    .map((r) => `${r.metal} ${inr(r.current.rate)}/g${r.changePct != null ? ` (${r.changePct > 0 ? '+' : ''}${r.changePct}%)` : ''}`)
    .join(' · ');

  const flags = [];
  if (notClosed.length) flags.push(`${notClosed.map((d) => d.branch.name).join(', ')} not closed`);
  if (offBalance.length) flags.push(`${offBalance.length} counter${offBalance.length > 1 ? 's' : ''} off balance`);
  if (risk.summary.newlyRed) flags.push(`${risk.summary.newlyRed} loan${risk.summary.newlyRed > 1 ? 's' : ''} newly under-covered`);
  const subject = `${businessName} · ${date} · Net ${signed(total.moneyIn - total.moneyOut)}${flags.length ? ` · ⚠ ${flags.join(', ')}` : ''}`;

  // ---------- HTML ----------
  const cell = 'padding:8px 10px;border-bottom:1px solid ' + C.border + ';font-size:13px;';
  const num = cell + 'text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;';
  const head = 'padding:8px 10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:' + C.muted + ';text-align:left;border-bottom:1px solid ' + C.border + ';';
  const h2 = `font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;margin:26px 0 10px;color:${C.ink};`;
  const stat = (label, value, sub) =>
    `<td style="padding:12px 14px;background:${C.card};border:1px solid ${C.border};border-radius:8px;vertical-align:top;width:25%">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}">${esc(label)}</div>
      <div style="font-family:Georgia,serif;font-size:20px;font-weight:600;margin-top:4px">${esc(value)}</div>
      ${sub ? `<div style="font-size:12px;color:${C.muted};margin-top:2px">${esc(sub)}</div>` : ''}
    </td>`;

  const closeCell = (d) => {
    if (!d.close) return `<span style="color:${C.amber};font-weight:600">Not closed</span>`;
    const v = Number(d.close.variance);
    const tag = v === 0 ? `<span style="color:${C.green};font-weight:600">Balanced</span>` : `<span style="color:${C.red};font-weight:600">${v > 0 ? 'Over' : 'Short'} ${inr(Math.abs(v))}</span>`;
    return `${tag}<div style="font-size:11.5px;color:${C.muted}">counted ${inr(d.close.counted_cash)} · ${esc(d.close.closed_by_name || '')}${d.changedSinceClose ? ' · edited after close' : ''}</div>`;
  };

  const branchRows = days
    .map(
      (d) => `<tr>
        <td style="${cell}"><strong>${esc(d.branch.name)}</strong></td>
        <td style="${num}">${inr(d.totals.moneyIn)}</td>
        <td style="${num}">${inr(d.totals.moneyOut)}</td>
        <td style="${num}">${signed(d.totals.net)}</td>
        <td style="${num}">${d.totals.counts.newLoans} / ${d.totals.counts.payments} / ${d.totals.counts.closures}</td>
        <td style="${cell}">${closeCell(d)}</td>
      </tr>`
    )
    .join('');

  const riskRows = risk.loans
    .map(
      (l) => `<tr>
        <td style="${cell}"><span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${RISK_COLOR[l.risk]}">${esc(l.risk)}</span></td>
        <td style="${cell}">${appUrl ? `<a href="${esc(appUrl)}/loans/${esc(l.loanId)}" style="color:${C.gold}">${esc(l.loanNumber)}</a>` : esc(l.loanNumber)}${active.length > 1 ? `<div style="font-size:11px;color:${C.muted}">${esc(branchName.get(l.branchId) || '')}</div>` : ''}</td>
        <td style="${cell}">${esc(l.borrowerName || '')}<div style="font-size:11px;color:${C.muted}">score ${l.borrowerScore ?? '—'} · ${esc(l.borrowerBand)}</div></td>
        <td style="${num}">${inr(l.amountOwed)}</td>
        <td style="${num}">${l.ratioNow != null ? `${Math.round(l.ratioNow * 100)}%` : '—'}</td>
        <td style="${num}">${l.shortfall ? inr(l.shortfall) : l.dropToRed ? `${l.dropToRed}% to red` : '—'}</td>
      </tr>`
    )
    .join('');

  const s = risk.summary;
  const html = `<!doctype html><html><body style="margin:0;background:${C.bg};font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${C.ink}">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px">
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:600">${esc(businessName)}</div>
    <div style="color:${C.muted};font-size:13px;margin-top:2px">Day summary · ${esc(longDate(date))}</div>
    ${flags.length ? `<div style="margin-top:14px;padding:10px 14px;border-radius:8px;background:#fbeceb;color:${C.red};font-size:13px;font-weight:600">⚠ ${esc(flags.join(' · '))}</div>` : ''}

    <table role="presentation" cellspacing="8" style="width:100%;margin:12px -8px 0;border-collapse:separate"><tr>
      ${stat('Money in', inr(total.moneyIn), `${total.payments} payments · ${total.closures} closures`)}
      ${stat('Money out', inr(total.moneyOut), `${total.newLoans} loans given`)}
      ${stat('Net', signed(total.moneyIn - total.moneyOut), active.length > 1 ? `${active.length} branches` : '')}
      ${stat('Interest earned', inr(total.interest), total.waived ? `${inr(total.waived)} reduced` : 'on loans closed')}
    </tr></table>

    <div style="${h2}">${active.length > 1 ? 'Branches' : 'Counter'}</div>
    <table style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.border}">
      <tr><th style="${head}">Branch</th><th style="${head}text-align:right">In</th><th style="${head}text-align:right">Out</th><th style="${head}text-align:right">Net</th><th style="${head}text-align:right">Loans / Pay / Closed</th><th style="${head}">Cash close</th></tr>
      ${branchRows}
    </table>

    <div style="${h2}">Rates &amp; risk</div>
    <div style="font-size:13px;margin-bottom:8px">${esc(rateLine || 'No rate on record')}${risk.asOf ? ` <span style="color:${C.muted}">(as of ${esc(risk.asOf)})</span>` : ''}</div>
    <div style="font-size:13px;margin-bottom:10px">
      <strong>${s.red}</strong> under-covered (red)${s.newlyRed ? `, <strong style="color:${C.red}">${s.newlyRed} new</strong>` : ''} ·
      <strong>${s.amber}</strong> to watch ·
      shortfall <strong>${inr(s.shortfall)}</strong> across ${s.openLoans} open loans
    </div>
    ${
      risk.loans.length
        ? `<table style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.border}">
      <tr><th style="${head}">Risk</th><th style="${head}">Loan</th><th style="${head}">Borrower</th><th style="${head}text-align:right">Owed</th><th style="${head}text-align:right">Cover</th><th style="${head}text-align:right">Shortfall</th></tr>
      ${riskRows}
    </table>`
        : `<div style="font-size:13px;color:${C.green}">No loans need attention at today's rate.</div>`
    }
    ${appUrl ? `<div style="margin-top:22px"><a href="${esc(appUrl)}/dashboard" style="display:inline-block;padding:9px 16px;border-radius:8px;background:${C.ink};color:#fff;text-decoration:none;font-size:13px">Open dashboard</a></div>` : ''}
    <div style="font-size:11.5px;color:${C.muted};margin-top:24px">Cover = melt value at the latest rate ÷ amount owed. Sent automatically every night.</div>
  </div></body></html>`;

  // ---------- Plain text ----------
  const lines = [
    `${businessName} - day summary ${date}`,
    flags.length ? `ATTENTION: ${flags.join('; ')}` : null,
    '',
    `Money in ${inr(total.moneyIn)} | out ${inr(total.moneyOut)} | net ${signed(total.moneyIn - total.moneyOut)} | interest ${inr(total.interest)}`,
    '',
    ...days.map(
      (d) =>
        `${d.branch.name}: in ${inr(d.totals.moneyIn)}, out ${inr(d.totals.moneyOut)}, ` +
        (d.close ? `closed, counted ${inr(d.close.counted_cash)}, variance ${inr(d.close.variance)}` : 'NOT CLOSED')
    ),
    '',
    `Rates: ${rateLine || 'none'}`,
    `Risk: ${s.red} red (${s.newlyRed} new), ${s.amber} amber, shortfall ${inr(s.shortfall)}`,
    ...risk.loans.map((l) => `  [${l.risk}] ${l.loanNumber} ${l.borrowerName || ''} owed ${inr(l.amountOwed)} cover ${l.ratioNow != null ? Math.round(l.ratioNow * 100) + '%' : '-'}`),
  ].filter((l) => l !== null);

  return { date, subject, html, text: lines.join('\n'), recipients: recipientsFrom(profile) };
}
