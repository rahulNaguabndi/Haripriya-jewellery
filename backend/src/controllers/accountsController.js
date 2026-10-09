import ExcelJS from 'exceljs';
import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig } from '../utils/interestConfig.js';
import { fetchAll } from '../utils/fetchAll.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const METAL_LABEL = { gold: 'Gold', silver: 'Silver', mixed: 'Mixed' };
const INTEREST_TYPE_LABEL = 'Compound annual (calendar year/month/day)';

// Indian financial year (1 Apr - 31 Mar) containing `date`.
function currentFinancialYear(date = new Date()) {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

function resolvePeriod(query) {
  const fy = currentFinancialYear();
  const from = query.from || fy.from;
  const to = query.to || fy.to;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new ApiError(400, 'from/to must be YYYY-MM-DD dates');
  if (from > to) throw new ApiError(400, '"from" must be on or before "to"');
  return { from, to };
}

function metalCategory(loan) {
  const metals = new Set((loan.loan_items || []).map((i) => i.metal_type).filter(Boolean));
  if (metals.size === 0 && loan.metal_type) metals.add(loan.metal_type);
  if (metals.size > 1) return 'mixed';
  return metals.has('Silver') ? 'silver' : 'gold';
}

const sum = (rows, key) => round2(rows.reduce((n, r) => n + (Number(r[key]) || 0), 0));

// Builds the full ledger for [from, to]. Shared by the JSON endpoint (for the
// on-screen Accounts page) and the .xlsx export, so both always agree.
//
// Accounting notes (kept factual - tax treatment is left to the accountant):
//  - Partial payments in this app reduce principal (interest on the repaid
//    amount stops accruing from the payment date); interest itself is
//    realised when the loan is closed, as `interest_collected`.
//  - "Interest accrued (unrealised)" on open loans is what the borrower
//    would owe as of the period end - not income until collected.
async function buildLedger({ from, to }) {
  const asOf = new Date(Math.min(Date.now(), new Date(`${to}T23:59:59`).getTime()));

  const [loans, payments, notices, config] = await Promise.all([
    fetchAll(() =>
      supabase
        .from('loans')
        .select(
          'id, loan_number, packet_number, loan_date, loan_amount, interest_rate, interest_type, status, closure_date, interest_collected, metal_type, previous_loan_id, borrowers(name, phone, village, district, city), loan_items(item_type, metal_type, gross_weight, net_weight, purity, huid)'
        )
        .lte('loan_date', to)
        .order('loan_date', { ascending: true })
        .order('id', { ascending: true })
    ),
    fetchAll(() =>
      supabase
        .from('payments')
        .select('id, loan_id, amount, payment_date, payment_type, notes')
        .eq('is_deleted', false)
        .lte('payment_date', to)
        .order('payment_date', { ascending: true })
        .order('id', { ascending: true })
    ),
    fetchAll(() =>
      supabase.from('loan_notices').select('loan_id, threshold_month, sent_date, cost_charged').gte('sent_date', from).lte('sent_date', to).order('id')
    ),
    getActiveInterestConfig(),
  ]);

  const paymentsByLoan = new Map();
  for (const p of payments) {
    if (!paymentsByLoan.has(p.loan_id)) paymentsByLoan.set(p.loan_id, []);
    paymentsByLoan.get(p.loan_id).push(p);
  }

  const loanRows = [];
  const loanById = new Map();
  for (const loan of loans) {
    // In scope: open at any point during the period.
    if (loan.closure_date && loan.closure_date < from) continue;

    const loanPayments = paymentsByLoan.get(loan.id) || [];
    const paymentsToDate = sum(loanPayments, 'amount');
    const paymentsInPeriod = sum(loanPayments.filter((p) => p.payment_date >= from), 'amount');
    const closedInPeriod = loan.status === 'closed' && loan.closure_date && loan.closure_date >= from && loan.closure_date <= to;
    const openAtPeriodEnd = !loan.closure_date || loan.closure_date > to;

    let accruedUnrealised = 0;
    if (openAtPeriodEnd) {
      const interest = calculateCompoundInterest({
        principal: Number(loan.loan_amount),
        annualRate: Number(loan.interest_rate),
        loanDate: loan.loan_date,
        partialPayments: loanPayments.map((p) => ({ amount: Number(p.amount), paymentDate: p.payment_date })),
        tiers: config?.tiers || [],
        asOfDate: asOf,
      });
      accruedUnrealised = round2(interest.totalInterestAccrued);
    }

    const items = loan.loan_items || [];
    const row = {
      loanId: loan.id,
      loanNumber: loan.loan_number,
      packetNumber: loan.packet_number,
      loanDate: loan.loan_date,
      disbursedInPeriod: loan.loan_date >= from,
      borrower: loan.borrowers?.name || '',
      phone: loan.borrowers?.phone || '',
      village: loan.borrowers?.village || loan.borrowers?.city || '',
      district: loan.borrowers?.district || '',
      metal: metalCategory(loan),
      items: items.map((i) => [i.item_type, i.metal_type, i.purity].filter(Boolean).join(' ')).join('; '),
      huids: items.map((i) => i.huid).filter(Boolean).join(', '),
      grossWeight: round2(items.reduce((n, i) => n + (Number(i.gross_weight) || 0), 0)),
      netWeight: round2(items.reduce((n, i) => n + (Number(i.net_weight) || 0), 0)),
      principal: round2(loan.loan_amount),
      interestRate: Number(loan.interest_rate),
      interestType: INTEREST_TYPE_LABEL,
      status: loan.status,
      closureDate: loan.closure_date,
      paymentsInPeriod,
      paymentsToDate,
      interestCollected: closedInPeriod ? round2(loan.interest_collected) : 0,
      principalOutstanding: openAtPeriodEnd ? round2(Math.max(0, loan.loan_amount - paymentsToDate)) : 0,
      accruedUnrealised,
      rolledOverFrom: loan.previous_loan_id ? 'Yes' : '',
      closedInPeriod: !!(loan.closure_date && loan.closure_date >= from && loan.closure_date <= to),
      openAtPeriodEnd,
    };
    loanRows.push(row);
    loanById.set(loan.id, row);
  }

  // Chronological cash-style register of everything that happened in the period.
  const transactions = [];
  for (const r of loanRows) {
    if (r.disbursedInPeriod) {
      transactions.push({ date: r.loanDate, type: 'Loan disbursed', ...txBase(r), moneyOut: r.principal, moneyIn: 0, notes: r.rolledOverFrom ? 'Rollover of earlier loan' : '' });
    }
    if (r.interestCollected) {
      transactions.push({ date: r.closureDate, type: 'Interest collected (loan closed)', ...txBase(r), moneyOut: 0, moneyIn: r.interestCollected, notes: '' });
    }
  }
  for (const p of payments) {
    const r = loanById.get(p.loan_id);
    if (!r || p.payment_date < from) continue;
    transactions.push({ date: p.payment_date, type: 'Payment received', ...txBase(r), moneyOut: 0, moneyIn: round2(p.amount), notes: [p.payment_type, p.notes].filter(Boolean).join(' - ') });
  }
  for (const n of notices) {
    const r = loanById.get(n.loan_id);
    if (!r || !Number(n.cost_charged)) continue;
    transactions.push({ date: n.sent_date, type: `Notice charge levied (${n.threshold_month} mo)`, ...txBase(r), moneyOut: 0, moneyIn: 0, charge: round2(n.cost_charged), notes: 'Added to amount owed; not cash received' });
  }
  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.loanNumber.localeCompare(b.loanNumber));

  const summary = {};
  for (const key of ['gold', 'silver', 'mixed', 'all']) {
    const rows = key === 'all' ? loanRows : loanRows.filter((r) => r.metal === key);
    const disbursed = rows.filter((r) => r.disbursedInPeriod);
    summary[key] = {
      loansDisbursed: disbursed.length,
      amountDisbursed: sum(disbursed, 'principal'),
      paymentsReceived: sum(rows, 'paymentsInPeriod'),
      loansClosed: rows.filter((r) => r.closedInPeriod).length,
      interestCollected: sum(rows, 'interestCollected'),
      openLoansAtEnd: rows.filter((r) => r.openAtPeriodEnd).length,
      principalOutstanding: sum(rows, 'principalOutstanding'),
      accruedUnrealised: sum(rows, 'accruedUnrealised'),
    };
  }

  return { period: { from, to, asOf: asOf.toISOString().slice(0, 10) }, summary, loans: loanRows, transactions };
}

function txBase(r) {
  return { loanNumber: r.loanNumber, borrower: r.borrower, metal: METAL_LABEL[r.metal], charge: 0 };
}

export async function getLedger(req, res, next) {
  try {
    res.json(await buildLedger(resolvePeriod(req.query)));
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------

const INR = '"₹"#,##,##0.00';
const LOAN_COLUMNS = [
  { header: 'Loan #', key: 'loanNumber', width: 20 },
  { header: 'Packet #', key: 'packetNumber', width: 10 },
  { header: 'Loan date', key: 'loanDate', width: 12, date: true },
  { header: 'Borrower', key: 'borrower', width: 24 },
  { header: 'Village', key: 'village', width: 16 },
  { header: 'District', key: 'district', width: 16 },
  { header: 'Metal', key: 'metalLabel', width: 9 },
  { header: 'Items', key: 'items', width: 32 },
  { header: 'HUID(s)', key: 'huids', width: 14 },
  { header: 'Gross wt (g)', key: 'grossWeight', width: 11, numFmt: '0.00' },
  { header: 'Net wt (g)', key: 'netWeight', width: 11, numFmt: '0.00' },
  { header: 'Principal', key: 'principal', width: 14, numFmt: INR, total: true },
  { header: 'Rate % p.a.', key: 'interestRate', width: 10, numFmt: '0.00' },
  { header: 'Interest type', key: 'interestType', width: 30 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Closure date', key: 'closureDate', width: 12, date: true },
  { header: 'Payments in period', key: 'paymentsInPeriod', width: 16, numFmt: INR, total: true },
  { header: 'Interest collected in period', key: 'interestCollected', width: 18, numFmt: INR, total: true },
  { header: 'Principal outstanding at end', key: 'principalOutstanding', width: 18, numFmt: INR, total: true },
  { header: 'Interest accrued, unrealised', key: 'accruedUnrealised', width: 18, numFmt: INR, total: true },
  { header: 'Rollover', key: 'rolledOverFrom', width: 9 },
];

const TX_COLUMNS = [
  { header: 'Date', key: 'date', width: 12, date: true },
  { header: 'Type', key: 'type', width: 32 },
  { header: 'Loan #', key: 'loanNumber', width: 20 },
  { header: 'Borrower', key: 'borrower', width: 24 },
  { header: 'Metal', key: 'metal', width: 9 },
  { header: 'Money out', key: 'moneyOut', width: 14, numFmt: INR, total: true },
  { header: 'Money in', key: 'moneyIn', width: 14, numFmt: INR, total: true },
  { header: 'Charge levied', key: 'charge', width: 14, numFmt: INR, total: true },
  { header: 'Notes', key: 'notes', width: 36 },
];

function toDate(v) {
  return v ? new Date(`${v}T00:00:00Z`) : null;
}

function addTableSheet(workbook, name, columns, rows) {
  const ws = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
  for (const r of rows) {
    ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.date ? toDate(r[c.key]) : r[c.key]])));
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.numFmt) col.numFmt = c.numFmt;
    if (c.date) col.numFmt = 'dd-mmm-yyyy';
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16130F' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  if (rows.length) {
    const totalRow = ws.addRow({});
    totalRow.getCell(1).value = 'Total';
    totalRow.font = { bold: true };
    columns.forEach((c, i) => {
      if (!c.total) return;
      const letter = ws.getColumn(i + 1).letter;
      totalRow.getCell(i + 1).value = { formula: `SUBTOTAL(9,${letter}2:${letter}${rows.length + 1})` };
    });
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' } };
    });
  }
  return ws;
}

function addSummarySheet(workbook, ledger, businessName) {
  const ws = workbook.addWorksheet('Summary');
  ws.columns = [{ width: 38 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.addRow([`${businessName} - Loan accounts`]).font = { bold: true, size: 14 };
  ws.addRow([`Period: ${ledger.period.from} to ${ledger.period.to}   (interest accrued as of ${ledger.period.asOf})`]);
  ws.addRow([]);
  const head = ws.addRow(['', 'Gold', 'Silver', 'Mixed', 'All']);
  head.font = { bold: true };
  const lines = [
    ['Loans disbursed in period', 'loansDisbursed'],
    ['Amount disbursed', 'amountDisbursed', true],
    ['Payments received (principal reduction)', 'paymentsReceived', true],
    ['Loans closed in period', 'loansClosed'],
    ['Interest collected on closure', 'interestCollected', true],
    ['Principal outstanding at period end', 'principalOutstanding', true],
    ['Interest accrued, not yet collected', 'accruedUnrealised', true],
  ];
  for (const [label, key, money] of lines) {
    const row = ws.addRow([label, ...['gold', 'silver', 'mixed', 'all'].map((m) => ledger.summary[m][key])]);
    if (money) for (let c = 2; c <= 5; c++) row.getCell(c).numFmt = INR;
  }
  ws.addRow([]);
  const notes = [
    'Notes:',
    '- Metal "Mixed" = one loan secured by both gold and silver items.',
    '- Partial payments reduce principal; interest is realised when a loan is closed.',
    '- "Interest accrued, not yet collected" is informational - not income until received.',
    '- Notice charges are added to the amount owed and listed separately on the Transactions sheet.',
    '- Tax treatment is intentionally not computed here.',
  ];
  for (const n of notes) ws.addRow([n]).font = { italic: true, color: { argb: 'FF8A7B5E' } };
}

export async function exportLedgerXlsx(req, res, next) {
  try {
    const period = resolvePeriod(req.query);
    const ledger = await buildLedger(period);
    const { data: profile } = await supabase.from('business_profile').select('legal_name').eq('is_active', true).maybeSingle();
    const businessName = profile?.legal_name || 'Haripriya Jewels';

    const rows = ledger.loans.map((r) => ({ ...r, metalLabel: METAL_LABEL[r.metal] }));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = businessName;
    workbook.created = new Date();

    addSummarySheet(workbook, ledger, businessName);
    addTableSheet(workbook, 'All loans', LOAN_COLUMNS, rows);
    addTableSheet(workbook, 'Gold', LOAN_COLUMNS, rows.filter((r) => r.metal === 'gold'));
    addTableSheet(workbook, 'Silver', LOAN_COLUMNS, rows.filter((r) => r.metal === 'silver'));
    addTableSheet(workbook, 'Mixed', LOAN_COLUMNS, rows.filter((r) => r.metal === 'mixed'));
    addTableSheet(workbook, 'Transactions', TX_COLUMNS, ledger.transactions);

    const filename = `loan-accounts_${period.from}_to_${period.to}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
}
