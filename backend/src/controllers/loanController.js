import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields, generateLoanNumber } from '../utils/validators.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig, resolveInterestRate } from '../utils/interestConfig.js';

async function nextLoanNumber() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const prefix = `LOAN-${y}${m}${d}-`;

  const { count, error } = await supabase
    .from('loans')
    .select('id', { count: 'exact', head: true })
    .like('loan_number', `${prefix}%`);

  if (error) throw new ApiError(400, error.message);
  return generateLoanNumber((count || 0) + 1);
}

async function fetchPayments(loanId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('loan_id', loanId)
    .eq('is_deleted', false)
    .order('payment_date', { ascending: true });
  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function createLoan(req, res, next) {
  try {
    requireFields(req.body, ['borrowerId', 'itemType', 'metalType', 'loanAmount', 'loanDate']);
    const {
      borrowerId,
      itemType,
      metalType,
      weight,
      purity,
      description,
      loanAmount,
      loanDate,
      dueDate,
      interestRate,
      cardGiven,
    } = req.body;

    const { data: borrower, error: borrowerError } = await supabase
      .from('borrowers')
      .select('id')
      .eq('id', borrowerId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (borrowerError) throw new ApiError(400, borrowerError.message);
    if (!borrower) throw new ApiError(404, 'Borrower not found');

    const appliedRate = interestRate ?? (await resolveInterestRate(loanAmount, 24));
    const loanNumber = await nextLoanNumber();

    const { data, error } = await supabase
      .from('loans')
      .insert({
        borrower_id: borrowerId,
        loan_number: loanNumber,
        item_type: itemType,
        metal_type: metalType,
        weight,
        purity,
        description,
        loan_amount: loanAmount,
        loan_date: loanDate,
        due_date: dueDate,
        interest_rate: appliedRate,
        card_given: !!cardGiven,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw new ApiError(400, error.message);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function listLoans(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from('loans').select('*, borrowers(name, phone)', { count: 'exact' });

    if (req.query.borrowerId) query = query.eq('borrower_id', req.query.borrowerId);
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.metalType) query = query.ilike('metal_type', req.query.metalType);
    if (req.query.itemType) query = query.ilike('item_type', req.query.itemType);
    if (req.query.minAmount) query = query.gte('loan_amount', Number(req.query.minAmount));
    if (req.query.maxAmount) query = query.lte('loan_amount', Number(req.query.maxAmount));

    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);

    if (error) throw new ApiError(400, error.message);
    res.json({ data, page, limit, total: count });
  } catch (err) {
    next(err);
  }
}

export async function getLoan(req, res, next) {
  try {
    const { data: loan, error } = await supabase
      .from('loans')
      .select('*, borrowers(id, name, phone, email)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!loan) throw new ApiError(404, 'Loan not found');

    const payments = await fetchPayments(loan.id);
    const config = await getActiveInterestConfig();

    const interest = calculateCompoundInterest({
      principal: loan.loan_amount,
      annualRate: loan.interest_rate,
      loanDate: loan.loan_date,
      partialPayments: payments.map((p) => ({ amount: p.amount, paymentDate: p.payment_date })),
      tiers: config?.tiers || [],
    });

    res.json({ ...loan, partialPayments: payments, interest });
  } catch (err) {
    next(err);
  }
}

export async function updateLoan(req, res, next) {
  try {
    const {
      itemType,
      metalType,
      weight,
      purity,
      description,
      loanAmount,
      loanDate,
      dueDate,
      interestRate,
      cardGiven,
      cardReturned,
    } = req.body;

    const update = {
      item_type: itemType,
      metal_type: metalType,
      weight,
      purity,
      description,
      loan_amount: loanAmount,
      loan_date: loanDate,
      due_date: dueDate,
      interest_rate: interestRate,
      updated_at: new Date().toISOString(),
    };
    if (cardGiven !== undefined) update.card_given = !!cardGiven;
    if (cardReturned !== undefined) update.card_returned = !!cardReturned;

    const { data, error } = await supabase
      .from('loans')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Loan not found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateLoanStatus(req, res, next) {
  try {
    requireFields(req.body, ['status']);
    const validStatuses = ['active', 'closed', 'defaulted', 'partial_payment'];
    if (!validStatuses.includes(req.body.status)) {
      throw new ApiError(400, `status must be one of: ${validStatuses.join(', ')}`);
    }

    const { closureDate, interestCollected, cardReturned } = req.body;
    const update = { status: req.body.status, updated_at: new Date().toISOString() };

    if (req.body.status === 'closed') {
      requireFields(req.body, ['closureDate', 'interestCollected']);
      update.closure_date = closureDate;
      update.interest_collected = interestCollected;

      const { data: existing, error: existingError } = await supabase
        .from('loans')
        .select('card_given, card_returned')
        .eq('id', req.params.id)
        .maybeSingle();
      if (existingError) throw new ApiError(400, existingError.message);
      if (!existing) throw new ApiError(404, 'Loan not found');

      const willHaveCardReturned = cardReturned !== undefined ? !!cardReturned : existing.card_returned;
      if (existing.card_given && !willHaveCardReturned) {
        throw new ApiError(400, 'Card must be marked returned before closing this loan.');
      }
      if (cardReturned !== undefined) update.card_returned = !!cardReturned;
    }

    const { data, error } = await supabase
      .from('loans')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Loan not found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getLoanInterestSummary(req, res, next) {
  try {
    const { data: loan, error } = await supabase
      .from('loans')
      .select('*, borrowers(name)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!loan) throw new ApiError(404, 'Loan not found');

    const payments = await fetchPayments(loan.id);
    const config = await getActiveInterestConfig();

    const interest = calculateCompoundInterest({
      principal: loan.loan_amount,
      annualRate: loan.interest_rate,
      loanDate: loan.loan_date,
      partialPayments: payments.map((p) => ({ amount: p.amount, paymentDate: p.payment_date })),
      tiers: config?.tiers || [],
    });

    const actualInterestCollected = Math.max(0, loan.total_payment_received - (loan.loan_amount - interest.principalRemaining));

    res.json({
      loanId: loan.id,
      borrowerName: loan.borrowers?.name,
      loanAmount: loan.loan_amount,
      loanDate: loan.loan_date,
      daysElapsed: interest.daysElapsed,
      appliedInterestRate: interest.appliedInterestRate,
      calculatedInterest: interest.totalInterestAccrued,
      expectedInterest: interest.totalInterestAccrued,
      actualInterestCollected,
      interestDifference: round2(interest.totalInterestAccrued - actualInterestCollected),
      status: loan.status,
      partialPayments: payments,
    });
  } catch (err) {
    next(err);
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
