import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import { formatCurrency, formatDate, amountInWordsINR } from '../utils/formatters.js';

// Aadhaar must not be printed in full (UIDAI masking guidance) - show the
// last 4 digits only. Other ID types (voter ID, PAN...) print as entered.
function maskId(id) {
  if (!id) return '';
  const digits = String(id).replace(/\s+/g, '');
  return /^\d{12}$/.test(digits) ? `XXXX XXXX ${digits.slice(-4)}` : id;
}

function metalHeading(items) {
  const metals = new Set(items.map((i) => i.metal_type));
  if (metals.size === 1 && metals.has('Silver')) return 'Silver Loan';
  if (metals.size === 1 && metals.has('Gold')) return 'Gold Loan';
  return 'Jewel Loan';
}

const sumBy = (items, key) => items.reduce((n, i) => n + (Number(i[key]) || 0), 0);

function Sheet({ loan, business, noticeMonths, copyLabel }) {
  const b = loan.borrowers || {};
  const items = loan.loan_items || [];
  const rate = Number(loan.interest_rate);
  const place = [b.address, b.village, b.mandal, b.city, b.district, b.state].filter(Boolean).join(', ');
  const firstNotice = noticeMonths?.[0];

  return (
    <section className="pledge-sheet">
      {/* Letterhead */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '0.01em' }}>{business.trade_name || business.legal_name}</h1>
          {business.trade_name && business.trade_name !== business.legal_name && (
            <div style={{ fontSize: '9pt', color: 'var(--p-muted)' }}>{business.legal_name}</div>
          )}
          <div style={{ fontSize: '9pt', color: 'var(--p-muted)', maxWidth: '120mm' }}>{business.address}</div>
          <div style={{ fontSize: '9pt', color: 'var(--p-muted)' }}>
            {[business.phone && `Ph: ${business.phone}`, business.email, business.licence_number && `Licence No: ${business.licence_number}`, business.gstin && `GSTIN: ${business.gstin}`]
              .filter(Boolean)
              .join('  ·  ')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="copy-tag">{copyLabel}</div>
          <h2 style={{ fontSize: '15pt', fontWeight: 700, marginTop: 2 }}>{metalHeading(items)} — Pledge Form</h2>
          <dl className="kv" style={{ justifyContent: 'end', marginTop: 4 }}>
            <dt>Loan No.</dt><dd>{loan.loan_number}</dd>
            <dt>Packet No.</dt><dd>{loan.packet_number ?? '—'}</dd>
            <dt>Date</dt><dd>{formatDate(loan.loan_date)}</dd>
          </dl>
        </div>
      </div>
      <div className="rule" />

      {/* Borrower */}
      <div style={{ display: 'flex', gap: 12 }}>
        <dl className="kv" style={{ flex: 1, alignContent: 'start' }}>
          <dt>Borrower name</dt><dd>{b.name}</dd>
          {b.care_of && (<><dt>S/o, W/o, D/o</dt><dd>{b.care_of}</dd></>)}
          <dt>Address</dt><dd style={{ fontWeight: 500 }}>{place || '—'}{b.pincode ? ` – ${b.pincode}` : ''}</dd>
          <dt>Mobile</dt><dd>{b.phone || '—'}</dd>
          <dt>ID proof</dt><dd>{maskId(b.aadhar_or_id) || '—'}</dd>
        </dl>
        <div className="photo">Affix borrower photograph</div>
      </div>

      {/* Items */}
      <div style={{ fontWeight: 700, margin: '10px 0 4px', fontSize: '10pt' }}>Particulars of ornaments pledged</div>
      <table>
        <thead>
          <tr>
            <th style={{ width: '6%' }}>S.No</th>
            <th>Description</th>
            <th style={{ width: '14%' }}>HUID</th>
            <th style={{ width: '12%' }}>Purity</th>
            <th style={{ width: '12%', textAlign: 'right' }}>Gross wt (g)</th>
            <th style={{ width: '12%', textAlign: 'right' }}>Net wt (g)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id || i}>
              <td>{i + 1}</td>
              <td>{[it.metal_type, it.item_type].join(' ')}{it.description ? ` — ${it.description}` : ''}</td>
              <td style={{ fontFamily: 'ui-monospace, monospace' }}>{it.huid || '—'}</td>
              <td>{it.purity || '—'}</td>
              <td className="tabular" style={{ textAlign: 'right' }}>{it.gross_weight != null ? Number(it.gross_weight).toFixed(2) : '—'}</td>
              <td className="tabular" style={{ textAlign: 'right' }}>{it.net_weight != null ? Number(it.net_weight).toFixed(2) : '—'}</td>
            </tr>
          ))}
          {/* a few ruled spare lines for anything added by hand at the counter */}
          {Array.from({ length: Math.max(0, 2 - items.length) }, (_, i) => (
            <tr key={`blank-${i}`}><td>&nbsp;</td><td /><td /><td /><td /><td /></tr>
          ))}
          <tr>
            <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Total ({items.length} item{items.length === 1 ? '' : 's'})</td>
            <td className="tabular" style={{ textAlign: 'right', fontWeight: 700 }}>{sumBy(items, 'gross_weight').toFixed(2)}</td>
            <td className="tabular" style={{ textAlign: 'right', fontWeight: 700 }}>{sumBy(items, 'net_weight').toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      {/* Loan */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <dl className="kv">
          <dt>Loan amount</dt><dd style={{ fontSize: '12pt' }}>{formatCurrency(loan.loan_amount)}</dd>
          <dt>In words</dt><dd style={{ fontWeight: 500 }}>{amountInWordsINR(loan.loan_amount)}</dd>
        </dl>
        <dl className="kv">
          <dt>Interest rate</dt><dd>{rate}% per annum ({(rate / 12).toFixed(2)}% per month)</dd>
          <dt>Interest method</dt><dd style={{ fontWeight: 500 }}>Yearly compounding; part-year by calendar month and day</dd>
          {loan.due_date && (<><dt>Repay by</dt><dd>{formatDate(loan.due_date)}</dd></>)}
        </dl>
      </div>

      {/* Terms */}
      <div style={{ fontWeight: 700, margin: '10px 0 0', fontSize: '10pt' }}>Terms and conditions</div>
      <ol className="terms">
        <li>I declare that the ornaments described above are my own absolute property, free of any charge or claim, and have not been obtained unlawfully. I pledge them with {business.legal_name} (the “Lender”) as security for the loan stated above.</li>
        <li>Interest is charged at {rate}% per annum. Interest unpaid at the end of each full year is added to the principal and carries interest thereafter. A part year is charged by calendar month, plus days at the daily rate. A minimum of one month’s interest is payable even if the loan is repaid earlier.</li>
        <li>Part payments may be made at any time. They are first applied to reduce the principal from the date of payment, and the balance of interest is payable on closure.</li>
        <li>The ornaments will be returned only to me, or to a person holding my written authority, on payment in full of principal, interest and charges, and on surrender of this form or the loan card.</li>
        <li>If interest is not paid, or the loan is not closed{firstNotice ? ` within ${firstNotice} months of the loan date` : ' when due'}, the Lender may send me notice by registered post and/or WhatsApp/SMS at the address and mobile number given above. The cost of each notice will be added to my dues. If I still do not pay or close the loan within the period stated in the notice, the Lender may sell the ornaments by <b>public auction</b>. Any surplus after recovering all dues will be paid to me, and any shortfall remains payable by me.</li>
        <li>The weights recorded above were checked in my presence and are agreed. Stones, wax and other non-metal parts carry no value for this loan.</li>
        <li>I will inform the Lender in writing of any change in my address or mobile number. Notices sent to the details above will be valid service on me.</li>
        <li>The Lender will keep the ornaments in safe custody in its lockers. Any dispute will be subject to the courts at {business.jurisdiction || '__________'} only.</li>
      </ol>
      <div style={{ fontSize: '8.2pt', marginTop: 3 }}>
        I have read the above terms, or had them read and explained to me in a language I understand, and I accept them. I have received the loan amount of <b>{formatCurrency(loan.loan_amount)}</b> in full.
      </div>

      {/* Signatures */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr 1fr', gap: 14, alignItems: 'end', marginTop: 40 }}>
        <div className="sign-box">Signature of borrower</div>
        <div className="thumb">Left thumb</div>
        <div className="sign-box">Witness name &amp; signature</div>
        <div className="sign-box">For {business.trade_name || business.legal_name}<br />Authorised signatory</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt', color: 'var(--p-muted)', marginTop: 10 }}>
        <span>Place: ____________________</span>
        <span>Date: {formatDate(loan.loan_date)}</span>
      </div>

      {/* Release (filled in on closure) */}
      <div className="rule" style={{ borderTopStyle: 'dashed', marginTop: 10 }} />
      <div style={{ fontSize: '8.8pt' }}>
        <b>Release:</b> I have received back all the ornaments listed above in good condition, and I have no further claim on the Lender for this loan.
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginTop: 30 }}>
          <div className="sign-box">Date of release</div>
          <div className="sign-box">Signature of borrower</div>
          <div className="sign-box">Authorised signatory</div>
        </div>
      </div>
    </section>
  );
}

export default function PledgeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [loan, setLoan] = useState(null);
  const [business, setBusiness] = useState(null);
  const [noticeMonths, setNoticeMonths] = useState([]);
  const [copies, setCopies] = useState(2);
  const [error, setError] = useState('');
  const printed = useRef(false);

  useEffect(() => {
    Promise.all([api.get(`/loans/${id}`), api.get('/business-profile'), api.get('/admin/config/notices').catch(() => null)])
      .then(([loanRes, businessRes, noticeRes]) => {
        setLoan(loanRes.data);
        setBusiness(businessRes.data);
        setNoticeMonths(noticeRes?.data?.threshold_months || []);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  // "Save & print" lands here with ?autoprint=1: open the print dialog once
  // the sheet (and its web fonts) have rendered.
  useEffect(() => {
    if (!loan || !business || printed.current || params.get('autoprint') !== '1') return;
    printed.current = true;
    document.fonts.ready.then(() => setTimeout(() => window.print(), 150));
  }, [loan, business, params]);

  useEffect(() => {
    if (!loan) return undefined;
    const previous = document.title;
    document.title = `Pledge form ${loan.loan_number}`; // default PDF file name
    return () => {
      document.title = previous;
    };
  }, [loan]);

  if (error) return <div style={{ padding: 24, color: 'var(--danger)' }}>{error}</div>;

  return (
    <div>
      <div className="print-toolbar no-print">
        <button className="btn btn-secondary" onClick={() => navigate(`/loans/${id}`)}>← Back to loan</button>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: '#F3E9D2', fontWeight: 500 }}>
          Copies
          <select value={copies} onChange={(e) => setCopies(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={1}>1 — office</option>
            <option value={2}>2 — office + customer</option>
          </select>
        </label>
        <button className="btn btn-primary" style={{ background: 'var(--gold)', color: '#1b140a' }} disabled={!loan} onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>
      <div className="print-page">
        {!loan || !business ? (
          <div className="pledge-sheet skeleton" style={{ height: 600 }} />
        ) : (
          ['Office copy', 'Customer copy'].slice(0, copies).map((label) => (
            <Sheet key={label} loan={loan} business={business} noticeMonths={noticeMonths} copyLabel={label} />
          ))
        )}
      </div>
    </div>
  );
}
