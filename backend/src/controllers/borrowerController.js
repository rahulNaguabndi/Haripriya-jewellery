import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig } from '../utils/interestConfig.js';

export async function createBorrower(req, res, next) {
  try {
    requireFields(req.body, ['name']);

    const { name, phone, email, address, city, state, pincode, aadharOrId, careOf } = req.body;

    const { data, error } = await supabase
      .from('borrowers')
      .insert({
        name,
        phone,
        email,
        address,
        city,
        state,
        pincode,
        aadhar_or_id: aadharOrId,
        care_of: careOf,
        supabase_user_id: req.user.id,
      })
      .select()
      .single();

    if (error) throw new ApiError(400, error.message);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function listBorrowers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('borrowers')
      .select('*', { count: 'exact' })
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new ApiError(400, error.message);
    res.json({ data, page, limit, total: count });
  } catch (err) {
    next(err);
  }
}

export async function searchBorrowers(req, res, next) {
  try {
    const { name } = req.query;
    if (!name) throw new ApiError(400, 'Query parameter "name" is required');

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('borrowers')
      .select('*', { count: 'exact' })
      .eq('is_deleted', false)
      .ilike('name', `%${name}%`)
      .order('name', { ascending: true })
      .range(from, to);

    if (error) throw new ApiError(400, error.message);
    res.json({ data, page, limit, total: count });
  } catch (err) {
    next(err);
  }
}

export async function getBorrower(req, res, next) {
  try {
    const { data: borrower, error } = await supabase
      .from('borrowers')
      .select('*')
      .eq('id', req.params.id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!borrower) throw new ApiError(404, 'Borrower not found');

    const { data: loans, error: loansError } = await supabase
      .from('loans')
      .select('*')
      .eq('borrower_id', req.params.id)
      .order('created_at', { ascending: false });

    if (loansError) throw new ApiError(400, loansError.message);

    let loansWithInterest = loans;
    if (loans.length > 0) {
      const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .in('loan_id', loans.map((l) => l.id))
        .eq('is_deleted', false);

      const config = await getActiveInterestConfig();
      const paymentsByLoan = new Map();
      for (const p of payments || []) {
        if (!paymentsByLoan.has(p.loan_id)) paymentsByLoan.set(p.loan_id, []);
        paymentsByLoan.get(p.loan_id).push({ amount: p.amount, paymentDate: p.payment_date });
      }

      loansWithInterest = loans.map((l) => ({
        ...l,
        interest: calculateCompoundInterest({
          principal: l.loan_amount,
          annualRate: l.interest_rate,
          loanDate: l.loan_date,
          partialPayments: paymentsByLoan.get(l.id) || [],
          tiers: config?.tiers || [],
        }),
      }));
    }

    res.json({ ...borrower, loans: loansWithInterest });
  } catch (err) {
    next(err);
  }
}

export async function updateBorrower(req, res, next) {
  try {
    const { name, phone, email, address, city, state, pincode, aadharOrId, careOf } = req.body;

    const { data, error } = await supabase
      .from('borrowers')
      .update({
        name,
        phone,
        email,
        address,
        city,
        state,
        pincode,
        aadhar_or_id: aadharOrId,
        care_of: careOf,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Borrower not found');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteBorrower(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('borrowers')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Borrower not found');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
