import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig } from '../utils/interestConfig.js';
import { logActivity, diffFields, inr } from '../utils/activityLog.js';

// Re-evaluates a loan's status after a payment is recorded/edited/removed,
// based on total amount due (principal + accrued interest) vs. payments received.
async function refreshLoanStatus(loanId) {
  const { data: loan, error } = await supabase.from('loans').select('*').eq('id', loanId).maybeSingle();
  if (error || !loan || loan.status === 'defaulted') return;

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('loan_id', loanId)
    .eq('is_deleted', false);

  const config = await getActiveInterestConfig();
  const interest = calculateCompoundInterest({
    principal: loan.loan_amount,
    annualRate: loan.interest_rate,
    loanDate: loan.loan_date,
    partialPayments: (payments || []).map((p) => ({ amount: p.amount, paymentDate: p.payment_date })),
    tiers: config?.tiers || [],
  });

  let nextStatus = loan.status;
  if (interest.principalRemaining <= 0 && interest.totalAmountDue <= 0.01) {
    nextStatus = 'closed';
  } else if ((payments || []).length > 0) {
    nextStatus = 'partial_payment';
  }

  if (nextStatus !== loan.status) {
    await supabase.from('loans').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', loanId);
  }
}

export async function createPayment(req, res, next) {
  try {
    requireFields(req.body, ['loanId', 'amount', 'paymentDate']);
    const { loanId, amount, paymentDate, paymentType, notes } = req.body;

    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id, borrower_id, loan_number')
      .eq('id', loanId)
      .maybeSingle();
    if (loanError) throw new ApiError(400, loanError.message);
    if (!loan) throw new ApiError(404, 'Loan not found');

    const { data, error } = await supabase
      .from('payments')
      .insert({
        loan_id: loanId,
        borrower_id: loan.borrower_id,
        amount,
        payment_date: paymentDate,
        payment_type: paymentType || 'cash',
        notes,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) throw new ApiError(400, error.message);

    await refreshLoanStatus(loanId);
    await logActivity(req, {
      action: 'payment.create',
      entityType: 'payment',
      entityId: data.id,
      loanId,
      borrowerId: loan.borrower_id,
      summary: `Recorded ${data.payment_type} payment of ${inr(amount)} on ${loan.loan_number} (dated ${paymentDate})`,
      details: { amount, paymentDate, paymentType: data.payment_type, notes },
    });

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function getPaymentsForLoan(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('loan_id', req.params.loanId)
      .eq('is_deleted', false)
      .order('payment_date', { ascending: false });

    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function listPayments(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('payments')
      .select('*, loans(loan_number), borrowers(name)', { count: 'exact' })
      .eq('is_deleted', false);

    if (req.query.borrowerId) query = query.eq('borrower_id', req.query.borrowerId);
    if (req.query.loanId) query = query.eq('loan_id', req.query.loanId);
    if (req.query.dateFrom) query = query.gte('payment_date', req.query.dateFrom);
    if (req.query.dateTo) query = query.lte('payment_date', req.query.dateTo);

    const { data, error, count } = await query.order('payment_date', { ascending: false }).range(from, to);
    if (error) throw new ApiError(400, error.message);
    res.json({ data, page, limit, total: count });
  } catch (err) {
    next(err);
  }
}

export async function updatePayment(req, res, next) {
  try {
    const { amount, paymentDate, paymentType, notes } = req.body;

    const { data: before } = await supabase
      .from('payments')
      .select('*, loans(loan_number)')
      .eq('id', req.params.paymentId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('payments')
      .update({ amount, payment_date: paymentDate, payment_type: paymentType, notes })
      .eq('id', req.params.paymentId)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Payment not found');

    await refreshLoanStatus(data.loan_id);
    const changes = diffFields(
      before,
      { amount, payment_date: paymentDate, payment_type: paymentType, notes },
      ['amount', 'payment_date', 'payment_type', 'notes']
    );
    if (Object.keys(changes).length) {
      const described = Object.entries(changes)
        .map(([field, c]) => `${field.replace(/_/g, ' ')} ${c.from ?? '-'} -> ${c.to ?? '-'}`)
        .join(', ');
      await logActivity(req, {
        action: 'payment.update',
        entityType: 'payment',
        entityId: data.id,
        loanId: data.loan_id,
        borrowerId: data.borrower_id,
        summary: `Edited payment on ${before?.loans?.loan_number || 'loan'}: ${described}`,
        details: changes,
      });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deletePayment(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .update({ is_deleted: true })
      .eq('id', req.params.paymentId)
      .select('*, loans(loan_number)')
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Payment not found');

    await refreshLoanStatus(data.loan_id);
    await logActivity(req, {
      action: 'payment.delete',
      entityType: 'payment',
      entityId: data.id,
      loanId: data.loan_id,
      borrowerId: data.borrower_id,
      summary: `Deleted ${inr(data.amount)} payment dated ${data.payment_date} on ${data.loans?.loan_number || 'loan'}`,
      details: { amount: data.amount, paymentDate: data.payment_date, paymentType: data.payment_type },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
