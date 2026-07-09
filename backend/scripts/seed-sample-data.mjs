// One-off script to populate the database with realistic sample data for
// manual testing: ~1000 borrowers and a spread of loans covering different
// interest/compounding scenarios (short-term, multi-month, >1yr, >2yr,
// partial payments, closed, defaulted).
//
// Run from backend/: node scripts/seed-sample-data.mjs
// (On a machine behind a TLS-inspecting proxy, set NODE_EXTRA_CA_CERTS first,
// same as running the dev server — see README.)
import 'dotenv/config';
import { supabase } from '../src/config/supabaseClient.js';

const BORROWER_COUNT = 1000;
const EXTRA_LOANS_FOR_REPEAT_BORROWERS = 300;

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan',
  'Kabir', 'Ansh', 'Dhruv', 'Karan', 'Yash', 'Manish', 'Rahul', 'Suresh', 'Ramesh', 'Anand',
  'Saanvi', 'Ananya', 'Diya', 'Aadhya', 'Kiara', 'Myra', 'Sara', 'Ira', 'Anika', 'Navya',
  'Lakshmi', 'Priya', 'Divya', 'Sneha', 'Pooja', 'Kavya', 'Meena', 'Radha', 'Geeta', 'Sunita',
  'Haripriya', 'Lalitha', 'Padma', 'Vasanthi', 'Rukmini', 'Devika', 'Nithya', 'Swathi', 'Bhavana', 'Charitha',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Gupta', 'Reddy', 'Rao', 'Naidu', 'Iyer', 'Iyengar', 'Nair', 'Menon',
  'Pillai', 'Devi', 'Kumar', 'Prasad', 'Chowdary', 'Chowdhury', 'Patel', 'Shah', 'Mehta', 'Joshi',
  'Reddy', 'Naik', 'Rathod', 'Yadav', 'Singh', 'Choudhary', 'Bhatt', 'Desai', 'Pandey', 'Mishra',
];

const CITIES = [
  { city: 'Hyderabad', state: 'Telangana' },
  { city: 'Vijayawada', state: 'Andhra Pradesh' },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh' },
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Chennai', state: 'Tamil Nadu' },
  { city: 'Coimbatore', state: 'Tamil Nadu' },
  { city: 'Mumbai', state: 'Maharashtra' },
  { city: 'Pune', state: 'Maharashtra' },
  { city: 'Kochi', state: 'Kerala' },
  { city: 'Warangal', state: 'Telangana' },
  { city: 'Guntur', state: 'Andhra Pradesh' },
  { city: 'Nellore', state: 'Andhra Pradesh' },
];

const STREETS = ['MG Road', 'Main Street', 'Temple Street', 'Market Road', 'Gandhi Nagar', 'Station Road', 'Ring Road', 'Church Street'];
const ITEM_TYPES = ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Bangle', 'Chain', 'Other'];
const METAL_TYPES = ['Gold', 'Silver', 'Platinum'];
const PAYMENT_TYPES = ['cash', 'cheque', 'transfer'];

// Scenario weights sum to 100. Each covers a different interest/compounding
// and lifecycle situation so the app has real variety to browse/test.
const SCENARIOS = [
  { key: 'short_active', weight: 30, daysAgo: [1, 25], status: 'active', paymentCount: [0, 0] },
  { key: 'mid_partial', weight: 25, daysAgo: [40, 300], status: 'partial_payment', paymentCount: [1, 2] },
  { key: 'over_year', weight: 15, daysAgo: [370, 500], status: 'partial_payment', paymentCount: [0, 1] },
  { key: 'over_2years', weight: 5, daysAgo: [740, 900], status: 'partial_payment', paymentCount: [1, 2] },
  { key: 'closed', weight: 15, daysAgo: [60, 400], status: 'closed', paymentCount: [1, 2] },
  { key: 'defaulted', weight: 10, daysAgo: [200, 600], status: 'defaulted', paymentCount: [0, 1] },
];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pickScenario() {
  const roll = randInt(1, 100);
  let cumulative = 0;
  for (const s of SCENARIOS) {
    cumulative += s.weight;
    if (roll <= cumulative) return s;
  }
  return SCENARIOS[SCENARIOS.length - 1];
}

function buildBorrowerRow(i) {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const loc = pick(CITIES);
  return {
    name: `${first} ${last}`,
    phone: String(randInt(6, 9)) + String(randInt(100000000, 999999999)),
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com`,
    address: `${randInt(1, 999)}, ${pick(STREETS)}`,
    city: loc.city,
    state: loc.state,
    pincode: String(randInt(500000, 699999)),
    aadhar_or_id: String(randInt(100000000000, 999999999999)),
  };
}

function buildLoanRow(borrower, seq, todayStr) {
  const scenario = pickScenario();
  const loanDate = isoDaysAgo(randInt(scenario.daysAgo[0], scenario.daysAgo[1]));
  const isSmallTier = Math.random() < 0.15;
  const loanAmount = isSmallTier ? randInt(200, 999) : randInt(1000, 100000);
  const interestRate = isSmallTier ? 36 : 24;
  const paymentCount = randInt(scenario.paymentCount[0], scenario.paymentCount[1]);

  return {
    row: {
      borrower_id: borrower.id,
      loan_number: `SEED-${todayStr}-${String(seq).padStart(5, '0')}`,
      item_type: pick(ITEM_TYPES),
      metal_type: pick(METAL_TYPES),
      weight: randInt(2, 80),
      purity: pick(['18k', '22k', '24k']),
      description: null,
      loan_amount: loanAmount,
      loan_date: loanDate,
      due_date: null,
      status: scenario.status,
      interest_rate: interestRate,
    },
    plan: { loanDate, loanAmount, paymentCount, scenario: scenario.key },
  };
}

function buildPaymentRows(loan, plan) {
  const { loanDate, loanAmount, paymentCount, scenario } = plan;
  const daysElapsed = Math.max(1, Math.floor((Date.now() - new Date(loanDate).getTime()) / (1000 * 60 * 60 * 24)));
  const payments = [];

  for (let i = 0; i < paymentCount; i++) {
    const dayOffset = Math.floor(((i + 1) / (paymentCount + 1)) * daysElapsed);
    const paymentDate = isoDaysAgo(daysElapsed - dayOffset);
    const isLast = i === paymentCount - 1;
    const fraction = scenario === 'closed' && isLast ? randInt(60, 90) / 100 : randInt(15, 40) / 100;
    payments.push({
      loan_id: loan.id,
      borrower_id: loan.borrower_id,
      amount: Math.max(50, Math.round(loanAmount * fraction)),
      payment_date: paymentDate,
      payment_type: pick(PAYMENT_TYPES),
      notes: null,
    });
  }
  return payments;
}

async function bulkInsert(table, rows, chunkSize = 200) {
  const results = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase.from(table).insert(chunk).select();
    if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
    results.push(...data);
    console.log(`  ${table}: ${results.length}/${rows.length}`);
  }
  return results;
}

async function main() {
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  console.log(`Seeding ${BORROWER_COUNT} borrowers...`);
  const borrowerRows = Array.from({ length: BORROWER_COUNT }, (_, i) => buildBorrowerRow(i));
  const borrowers = await bulkInsert('borrowers', borrowerRows);
  console.log(`Inserted ${borrowers.length} borrowers.\n`);

  console.log('Building loan scenarios...');
  let seq = 1;
  const loanPlans = [];

  for (const b of borrowers) {
    const { row, plan } = buildLoanRow(b, seq++, todayStr);
    loanPlans.push({ row, plan });
  }
  for (let i = 0; i < EXTRA_LOANS_FOR_REPEAT_BORROWERS; i++) {
    const b = pick(borrowers);
    const { row, plan } = buildLoanRow(b, seq++, todayStr);
    loanPlans.push({ row, plan });
  }

  console.log(`Seeding ${loanPlans.length} loans...`);
  const loanRows = loanPlans.map((p) => p.row);
  const insertedLoans = await bulkInsert('loans', loanRows);
  console.log(`Inserted ${insertedLoans.length} loans.\n`);

  const planByLoanNumber = new Map(loanPlans.map((p) => [p.row.loan_number, p.plan]));
  const paymentRows = insertedLoans.flatMap((loan) => {
    const plan = planByLoanNumber.get(loan.loan_number);
    return buildPaymentRows(loan, plan);
  });

  console.log(`Seeding ${paymentRows.length} payments...`);
  const insertedPayments = await bulkInsert('payments', paymentRows);
  console.log(`Inserted ${insertedPayments.length} payments.\n`);

  console.log('Done.');
  console.log(`Summary: ${borrowers.length} borrowers, ${insertedLoans.length} loans, ${insertedPayments.length} payments.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
