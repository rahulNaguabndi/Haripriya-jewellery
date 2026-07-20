import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields, generateLoanNumber } from '../utils/validators.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig, resolveInterestRate } from '../utils/interestConfig.js';
import { getTodayRate, getLatestRate } from '../utils/dailyRates.js';

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

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(
      400,
      'items must be a non-empty array of { itemType, metalType, grossWeight, netWeight, purity, description }'
    );
  }
  for (const item of items) {
    if (!item.itemType || !item.metalType) {
      throw new ApiError(400, 'Each item needs itemType and metalType');
    }
  }
}

async function replaceLoanItems(loanId, items) {
  const { error: deleteError } = await supabase.from('loan_items').delete().eq('loan_id', loanId);
  if (deleteError) throw new ApiError(400, deleteError.message);

  const rows = items.map((item) => ({
    loan_id: loanId,
    item_type: item.itemType,
    metal_type: item.metalType,
    gross_weight: item.grossWeight === '' || item.grossWeight == null ? null : Number(item.grossWeight),
    net_weight: item.netWeight === '' || item.netWeight == null ? null : Number(item.netWeight),
    purity: item.purity || null,
    description: item.description || null,
  }));

  const { data, error } = await supabase.from('loan_items').insert(rows).select();
  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function createLoan(req, res, next) {
  try {
    requireFields(req.body, ['borrowerId', 'items', 'loanAmount', 'loanDate']);
    const { borrowerId, items, loanAmount, loanDate, dueDate, interestRate, cardGiven } = req.body;
    validateItems(items);

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

    // Snapshot the day's locked metal rate for the first item's metal type
    // (today's if set, else the most recent one on record) - server-
    // resolved, not client-supplied. Coverage calculations always use the
    // live current rate per item, not this snapshot; it's kept purely as
    // a disbursement-time reference.
    const rateRow = (await getTodayRate(items[0].metalType)) || (await getLatestRate(items[0].metalType));

    const { data: loan, error } = await supabase
      .from('loans')
      .insert({
        borrower_id: borrowerId,
        loan_number: loanNumber,
        loan_amount: loanAmount,
        loan_date: loanDate,
        due_date: dueDate,
        interest_rate: appliedRate,
        card_given: !!cardGiven,
        metal_rate: rateRow?.rate_per_gram ?? null,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw new ApiError(400, error.message);

    const loanItems = await replaceLoanItems(loan.id, items);
    res.status(201).json({ ...loan, loan_items: loanItems });
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

    // Filtering by metal/item type joins through loan_items (that's where
    // the data lives now) via an inner join, not an `.in('id', [...])`
    // list - keeps this correct at any loan-count scale. Side effect: when
    // either filter is active, the embedded loan_items array on each
    // returned loan only contains the matching item(s), not the full set.
    const needsItemFilter = !!(req.query.metalType || req.query.itemType);
    const itemsSelect = needsItemFilter ? 'loan_items!inner(*)' : 'loan_items(*)';
    let query = supabase.from('loans').select(`*, borrowers(name, phone), ${itemsSelect}`, { count: 'exact' });

    if (req.query.borrowerId) query = query.eq('borrower_id', req.query.borrowerId);
    if (req.query.status) query = query.eq('status', req.query.status);
    if (req.query.metalType) query = query.ilike('loan_items.metal_type', req.query.metalType);
    if (req.query.itemType) query = query.ilike('loan_items.item_type', req.query.itemType);
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
      .select('*, borrowers(id, name, phone, email), loan_items(*)')
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

    let previousLoan = null;
    if (loan.previous_loan_id) {
      const { data } = await supabase
        .from('loans')
        .select('id, loan_number, closure_date')
        .eq('id', loan.previous_loan_id)
        .maybeSingle();
      previousLoan = data;
    }
    const { data: rolledInto } = await supabase
      .from('loans')
      .select('id, loan_number, loan_date')
      .eq('previous_loan_id', loan.id)
      .maybeSingle();

    res.json({ ...loan, partialPayments: payments, interest, previousLoan, rolledInto });
  } catch (err) {
    next(err);
  }
}

export async function updateLoan(req, res, next) {
  try {
    const { items, loanAmount, loanDate, dueDate, interestRate, cardGiven, cardReturned } = req.body;

    const update = {
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

    let loanItems;
    if (items !== undefined) {
      validateItems(items);
      loanItems = await replaceLoanItems(data.id, items);
    } else {
      const { data: existingItems, error: itemsError } = await supabase
        .from('loan_items')
        .select('*')
        .eq('loan_id', data.id);
      if (itemsError) throw new ApiError(400, itemsError.message);
      loanItems = existingItems;
    }

    res.json({ ...data, loan_items: loanItems });
  } catch (err) {
    next(err);
  }
}

// Rollover is NOT renewing a loan in place: it closes the current loan
// (interest paid to date) and opens a brand-new loan for the same
// borrower, referencing the old loan via previous_loan_id. Physically,
// the item is re-verified and re-tagged with a new packet number, so the
// new loan gets its own loan_items (copied forward from the old loan by
// default, or overridden if staff re-describe the item during handling).
export async function rolloverLoan(req, res, next) {
  try {
    requireFields(req.body, ['closureDate', 'interestCollected', 'loanAmount', 'loanDate']);
    const { closureDate, interestCollected, loanAmount, loanDate, dueDate, interestRate, items, cardGiven } = req.body;

    const { data: oldLoan, error: oldLoanError } = await supabase
      .from('loans')
      .select('*, loan_items(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (oldLoanError) throw new ApiError(400, oldLoanError.message);
    if (!oldLoan) throw new ApiError(404, 'Loan not found');
    if (oldLoan.status === 'closed') throw new ApiError(400, 'This loan is already closed.');
    if (oldLoan.card_given && !oldLoan.card_returned) {
      throw new ApiError(400, 'Card must be marked returned before rolling over this loan.');
    }

    const { error: closeError } = await supabase
      .from('loans')
      .update({
        status: 'closed',
        closure_date: closureDate,
        interest_collected: interestCollected,
        updated_at: new Date().toISOString(),
      })
      .eq('id', oldLoan.id);
    if (closeError) throw new ApiError(400, closeError.message);

    const newItems =
      items && items.length > 0
        ? items
        : oldLoan.loan_items.map((it) => ({
            itemType: it.item_type,
            metalType: it.metal_type,
            grossWeight: it.gross_weight,
            netWeight: it.net_weight,
            purity: it.purity,
            description: it.description,
          }));
    validateItems(newItems);

    const appliedRate = interestRate ?? (await resolveInterestRate(loanAmount, 24));
    const loanNumber = await nextLoanNumber();
    const rateRow = (await getTodayRate(newItems[0].metalType)) || (await getLatestRate(newItems[0].metalType));

    const { data: newLoan, error: newLoanError } = await supabase
      .from('loans')
      .insert({
        borrower_id: oldLoan.borrower_id,
        loan_number: loanNumber,
        loan_amount: loanAmount,
        loan_date: loanDate,
        due_date: dueDate,
        interest_rate: appliedRate,
        card_given: !!cardGiven,
        metal_rate: rateRow?.rate_per_gram ?? null,
        previous_loan_id: oldLoan.id,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (newLoanError) throw new ApiError(400, newLoanError.message);

    const loanItems = await replaceLoanItems(newLoan.id, newItems);
    res.status(201).json({ ...newLoan, loan_items: loanItems });
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
