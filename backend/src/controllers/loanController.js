import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields, generateLoanNumber } from '../utils/validators.js';
import { calculateCompoundInterest } from '../utils/interestCalculator.js';
import { getActiveInterestConfig, resolveInterestRate } from '../utils/interestConfig.js';
import { getTodayRate, getLatestRate } from '../utils/dailyRates.js';
import { logActivity, diffFields, inr } from '../utils/activityLog.js';
import { scopeBranch, writeBranchId, assertBranchAccess } from '../utils/branches.js';
import { assertReleaseOtp } from './otpController.js';

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

// The interest the system would charge if the loan were settled on
// `asOfDate` - the figure staff quote. Stored alongside what was actually
// collected so any negotiated reduction is visible later.
async function calculatedInterestOn(loan, asOfDate) {
  const payments = await fetchPayments(loan.id);
  const config = await getActiveInterestConfig();
  return calculateCompoundInterest({
    principal: loan.loan_amount,
    annualRate: loan.interest_rate,
    loanDate: loan.loan_date,
    partialPayments: payments.map((p) => ({ amount: p.amount, paymentDate: p.payment_date })),
    tiers: config?.tiers || [],
    asOfDate: new Date(asOfDate),
  }).totalInterestAccrued;
}

// Collecting less than the calculated interest is allowed (e.g. the ~7-day
// grace after the 1-year compounding mark), but only with a reason, which
// is kept on the loan and in the activity log.
function resolveWaiver(calculated, collected, reason) {
  const waived = round2(Math.max(0, calculated - Number(collected)));
  const cleanReason = String(reason || '').trim();
  if (waived > 0 && !cleanReason) {
    throw new ApiError(
      400,
      `Interest collected is ${inr(waived)} less than the calculated ${inr(calculated)}. Give a reason for the reduction.`
    );
  }
  return {
    interest_calculated: calculated,
    interest_waived: waived,
    interest_waiver_reason: waived > 0 ? cleanReason : null,
  };
}

// Re-pledge/rollover: the same ornaments, so their photos carry forward.
// Rows point at the same Storage files (photo deletion only removes a file
// once no loan references it any more).
async function copyPhotos(fromLoanId, toLoanId, userId) {
  const { data, error } = await supabase
    .from('loan_photos')
    .select('storage_path, content_type, size_bytes, width, height, caption')
    .eq('loan_id', fromLoanId);
  if (error || !data?.length) return;
  const { error: insertError } = await supabase
    .from('loan_photos')
    .insert(data.map((p) => ({ ...p, loan_id: toLoanId, uploaded_by: userId })));
  if (insertError) console.warn('[photos] could not carry photos forward:', insertError.message);
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
    if (item.huid && !HUID_PATTERN.test(normalizeHuid(item.huid))) {
      throw new ApiError(400, `HUID "${item.huid}" is invalid - it must be exactly 6 letters/digits.`);
    }
  }
}

// HUID = BIS Hallmark Unique ID, a 6-character alphanumeric code laser-
// marked on hallmarked articles. Stored uppercase without spaces.
const HUID_PATTERN = /^[A-Z0-9]{6}$/;
function normalizeHuid(huid) {
  return String(huid || '').replace(/\s+/g, '').toUpperCase();
}

async function replaceLoanItems(loanId, items) {
  // Items are replaced wholesale on edit, so carry each HUID's recorded
  // BIS verification over to the re-inserted row that keeps the same HUID.
  const { data: existing, error: existingError } = await supabase
    .from('loan_items')
    .select('huid, huid_verified_at, huid_verified_by, huid_verification_note')
    .eq('loan_id', loanId);
  if (existingError) throw new ApiError(400, existingError.message);
  const verificationByHuid = new Map((existing || []).filter((i) => i.huid).map((i) => [i.huid, i]));

  const { error: deleteError } = await supabase.from('loan_items').delete().eq('loan_id', loanId);
  if (deleteError) throw new ApiError(400, deleteError.message);

  const rows = items.map((item) => {
    const huid = normalizeHuid(item.huid) || null;
    const previous = huid ? verificationByHuid.get(huid) : null;
    return {
      loan_id: loanId,
      item_type: item.itemType,
      metal_type: item.metalType,
      gross_weight: item.grossWeight === '' || item.grossWeight == null ? null : Number(item.grossWeight),
      net_weight: item.netWeight === '' || item.netWeight == null ? null : Number(item.netWeight),
      purity: item.purity || null,
      description: item.description || null,
      huid,
      huid_verified_at: previous?.huid_verified_at ?? null,
      huid_verified_by: previous?.huid_verified_by ?? null,
      huid_verification_note: previous?.huid_verification_note ?? null,
    };
  });

  const { data, error } = await supabase.from('loan_items').insert(rows).select();
  if (error) throw new ApiError(400, error.message);
  return data;
}

export async function createLoan(req, res, next) {
  try {
    requireFields(req.body, ['borrowerId', 'items', 'loanAmount', 'loanDate']);
    const { borrowerId, items, loanAmount, loanDate, dueDate, interestRate, cardGiven, repledgedFromLoanId, branchId } = req.body;
    validateItems(items);

    let repledgeSource = null;
    if (repledgedFromLoanId) {
      const { data, error: sourceError } = await supabase
        .from('loans')
        .select('id, loan_number, status')
        .eq('id', repledgedFromLoanId)
        .maybeSingle();
      if (sourceError) throw new ApiError(400, sourceError.message);
      if (!data) throw new ApiError(404, 'The loan being re-pledged was not found');
      if (data.status !== 'closed') {
        throw new ApiError(400, `${data.loan_number} is still open - use Roll over instead of re-pledging.`);
      }
      repledgeSource = data;
    }

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
    const loanBranchId = await writeBranchId(req, branchId);

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
        repledged_from_loan_id: repledgeSource?.id ?? null,
        branch_id: loanBranchId,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (error) throw new ApiError(400, error.message);

    const loanItems = await replaceLoanItems(loan.id, items);
    if (repledgeSource) await copyPhotos(repledgeSource.id, loan.id, req.user.id);

    await logActivity(req, {
      action: repledgeSource ? 'loan.repledge' : 'loan.create',
      entityType: 'loan',
      entityId: loan.id,
      loanId: loan.id,
      borrowerId,
      branchId: loan.branch_id,
      summary: repledgeSource
        ? `Re-pledged items from ${repledgeSource.loan_number} as ${loan.loan_number} for ${inr(loanAmount)}`
        : `Created loan ${loan.loan_number} for ${inr(loanAmount)}`,
      details: { loanAmount, loanDate, interestRate: appliedRate, itemCount: items.length },
    });

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
    let query = scopeBranch(supabase.from('loans').select(`*, borrowers(name, phone), branches(name, code), ${itemsSelect}`, { count: 'exact' }), req);

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
      .select(
        '*, borrowers(id, name, phone, email, address, village, mandal, district, city, state, pincode, aadhar_or_id, care_of), loan_items(*), branches(id, name, code)'
      )
      .eq('id', req.params.id)
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!loan) throw new ApiError(404, 'Loan not found');
    assertBranchAccess(req, loan);

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

    let repledgedFrom = null;
    if (loan.repledged_from_loan_id) {
      const { data } = await supabase
        .from('loans')
        .select('id, loan_number, loan_date, closure_date')
        .eq('id', loan.repledged_from_loan_id)
        .maybeSingle();
      repledgedFrom = data;
    }
    const { data: repledges } = await supabase
      .from('loans')
      .select('id, loan_number, loan_date')
      .eq('repledged_from_loan_id', loan.id)
      .order('loan_date', { ascending: false });

    res.json({ ...loan, partialPayments: payments, interest, previousLoan, rolledInto, repledgedFrom, repledges: repledges || [] });
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

    const { data: before, error: beforeError } = await supabase
      .from('loans')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (beforeError) throw new ApiError(400, beforeError.message);
    if (!before) throw new ApiError(404, 'Loan not found');
    assertBranchAccess(req, before);

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

    const changes = diffFields(before, update, ['loan_amount', 'loan_date', 'due_date', 'interest_rate', 'card_given', 'card_returned']);
    if (items !== undefined) changes.items = { count: items.length };
    const changed = Object.keys(changes);
    if (changed.length) {
      const described = changed
        .map((field) => (field === 'items' ? 'items' : `${field.replace(/_/g, ' ')} ${changes[field].from ?? '-'} -> ${changes[field].to ?? '-'}`))
        .join(', ');
      const cardOnly = changed.length === 1 && changed[0] === 'card_returned';
      await logActivity(req, {
        action: cardOnly ? 'loan.card_returned' : 'loan.update',
        entityType: 'loan',
        entityId: data.id,
        loanId: data.id,
        borrowerId: data.borrower_id,
        branchId: data.branch_id,
        summary: cardOnly ? `Marked card returned on ${data.loan_number}` : `Edited ${data.loan_number}: ${described}`,
        details: changes,
      });
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
    const { closureDate, interestCollected, loanAmount, loanDate, dueDate, interestRate, items, cardGiven, waiverReason } = req.body;

    const { data: oldLoan, error: oldLoanError } = await supabase
      .from('loans')
      .select('*, loan_items(*)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (oldLoanError) throw new ApiError(400, oldLoanError.message);
    if (!oldLoan) throw new ApiError(404, 'Loan not found');
    assertBranchAccess(req, oldLoan);
    if (oldLoan.status === 'closed') throw new ApiError(400, 'This loan is already closed.');
    if (oldLoan.card_given && !oldLoan.card_returned) {
      throw new ApiError(400, 'Card must be marked returned before rolling over this loan.');
    }

    const waiver = resolveWaiver(await calculatedInterestOn(oldLoan, closureDate), interestCollected, waiverReason);

    const { error: closeError } = await supabase
      .from('loans')
      .update({
        status: 'closed',
        closure_date: closureDate,
        interest_collected: interestCollected,
        ...waiver,
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
            huid: it.huid,
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
        // The packet stays where it is - same branch as the loan it replaces.
        branch_id: oldLoan.branch_id,
        created_by: req.user.id,
      })
      .select()
      .single();
    if (newLoanError) throw new ApiError(400, newLoanError.message);

    const loanItems = await replaceLoanItems(newLoan.id, newItems);
    await copyPhotos(oldLoan.id, newLoan.id, req.user.id);

    await logActivity(req, {
      action: 'loan.rollover',
      entityType: 'loan',
      entityId: newLoan.id,
      loanId: oldLoan.id,
      borrowerId: oldLoan.borrower_id,
      branchId: oldLoan.branch_id,
      summary:
        `Rolled over ${oldLoan.loan_number} into ${newLoan.loan_number}: interest ${inr(interestCollected)} collected, new amount ${inr(loanAmount)}` +
        (waiver.interest_waived > 0 ? ` (${inr(waiver.interest_waived)} reduced: ${waiver.interest_waiver_reason})` : ''),
      details: { oldLoanId: oldLoan.id, newLoanId: newLoan.id, closureDate, interestCollected, loanAmount, loanDate, ...waiver },
    });
    if (waiver.interest_waived > 0) await logWaiver(req, oldLoan, waiver, interestCollected);

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

    const { closureDate, interestCollected, cardReturned, waiverReason, otpId, otpOverrideReason } = req.body;
    const update = { status: req.body.status, updated_at: new Date().toISOString() };

    const { data: existing, error: existingError } = await supabase
      .from('loans')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (existingError) throw new ApiError(400, existingError.message);
    if (!existing) throw new ApiError(404, 'Loan not found');
    assertBranchAccess(req, existing);

    let otpCheck = null;
    if (req.body.status === 'closed') {
      requireFields(req.body, ['closureDate', 'interestCollected']);
      update.closure_date = closureDate;
      update.interest_collected = interestCollected;
      Object.assign(update, resolveWaiver(await calculatedInterestOn(existing, closureDate), interestCollected, waiverReason));

      const willHaveCardReturned = cardReturned !== undefined ? !!cardReturned : existing.card_returned;
      if (existing.card_given && !willHaveCardReturned) {
        throw new ApiError(400, 'Card must be marked returned before closing this loan.');
      }
      if (cardReturned !== undefined) update.card_returned = !!cardReturned;

      // Ornaments are handed back on closure - check the borrower's OTP
      // (enforced only when the business turns it on; see otpController).
      if (existing.status !== 'closed') otpCheck = await assertReleaseOtp(req, existing, { otpId, otpOverrideReason });
    }

    const { data, error } = await supabase
      .from('loans')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .maybeSingle();

    if (error) throw new ApiError(400, error.message);
    if (!data) throw new ApiError(404, 'Loan not found');

    if (req.body.status === 'closed') {
      await logActivity(req, {
        action: 'loan.close',
        entityType: 'loan',
        entityId: data.id,
        loanId: data.id,
        borrowerId: data.borrower_id,
        branchId: data.branch_id,
        summary: `Closed ${data.loan_number} on ${closureDate}: interest ${inr(interestCollected)} collected` + (otpCheck?.summary ? ` (${otpCheck.summary})` : ''),
        details: { closureDate, interestCollected, previousStatus: existing.status, releaseCheck: otpCheck?.details || null },
      });
      if (otpCheck?.consume) await otpCheck.consume();
      if (update.interest_waived > 0) await logWaiver(req, data, update, interestCollected);
    } else if (existing.status !== data.status) {
      await logActivity(req, {
        action: 'loan.status',
        entityType: 'loan',
        entityId: data.id,
        loanId: data.id,
        borrowerId: data.borrower_id,
        summary: `Changed ${data.loan_number} status from ${existing.status} to ${data.status}`,
        details: { from: existing.status, to: data.status },
      });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}

function logWaiver(req, loan, waiver, interestCollected) {
  return logActivity(req, {
    action: 'loan.interest_waived',
    entityType: 'loan',
    entityId: loan.id,
    loanId: loan.id,
    borrowerId: loan.borrower_id,
    summary: `Reduced interest on ${loan.loan_number} by ${inr(waiver.interest_waived)} (calculated ${inr(waiver.interest_calculated)}, collected ${inr(interestCollected)}): ${waiver.interest_waiver_reason}`,
    details: { ...waiver, interest_collected: interestCollected },
  });
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

    // ?asOf=YYYY-MM-DD: the figure for a chosen settlement date (the
    // close/rollover dialogs quote interest for the date being entered).
    if (req.query.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf)) throw new ApiError(400, 'asOf must be YYYY-MM-DD');
    const payments = await fetchPayments(loan.id);
    const config = await getActiveInterestConfig();

    const interest = calculateCompoundInterest({
      principal: loan.loan_amount,
      annualRate: loan.interest_rate,
      loanDate: loan.loan_date,
      partialPayments: payments.map((p) => ({ amount: p.amount, paymentDate: p.payment_date })),
      tiers: config?.tiers || [],
      asOfDate: req.query.asOf ? new Date(req.query.asOf) : new Date(),
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
      principalRemaining: interest.principalRemaining,
      totalAmountDue: interest.totalAmountDue,
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

// GET /api/loans/huid-check?huid=XXXXXX[&excludeLoanId=]
// Other loans already carrying this HUID. The same hallmarked piece showing
// up on two open loans is a red flag (double-pledge or copied HUID), so the
// loan form warns about it as soon as a HUID is typed.
export async function checkHuid(req, res, next) {
  try {
    const huid = normalizeHuid(req.query.huid);
    if (!HUID_PATTERN.test(huid)) throw new ApiError(400, 'HUID must be exactly 6 letters/digits.');

    let query = supabase
      .from('loan_items')
      .select('id, item_type, metal_type, loans!inner(id, loan_number, status, loan_date, borrowers(name))')
      .eq('huid', huid);
    if (req.query.excludeLoanId) query = query.neq('loan_id', req.query.excludeLoanId);
    const { data, error } = await query;
    if (error) throw new ApiError(400, error.message);

    res.json({
      huid,
      matches: (data || []).map((row) => ({
        loanId: row.loans.id,
        loanNumber: row.loans.loan_number,
        status: row.loans.status,
        loanDate: row.loans.loan_date,
        borrowerName: row.loans.borrowers?.name || null,
        itemType: row.item_type,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/loans/:id/items/:itemId/huid-verification
// Records the outcome of a staff check in the BIS CARE app ("Verify HUID").
// BIS publishes no lookup API, so this is a recorded manual verification:
// { verified: true, note: "22K, AHC xyz, matches" } or { verified: false }
// to clear it.
export async function setHuidVerification(req, res, next) {
  try {
    const { verified, note } = req.body;
    if (typeof verified !== 'boolean') throw new ApiError(400, 'verified must be true or false');

    const { data: item, error: itemError } = await supabase
      .from('loan_items')
      .select('id, huid')
      .eq('id', req.params.itemId)
      .eq('loan_id', req.params.id)
      .maybeSingle();
    if (itemError) throw new ApiError(400, itemError.message);
    if (!item) throw new ApiError(404, 'Item not found on this loan');
    if (verified && !item.huid) throw new ApiError(400, 'This item has no HUID to verify.');

    const { data, error } = await supabase
      .from('loan_items')
      .update({
        huid_verified_at: verified ? new Date().toISOString() : null,
        huid_verified_by: verified ? req.user.id : null,
        huid_verification_note: verified ? note || null : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .select()
      .single();
    if (error) throw new ApiError(400, error.message);
    await logActivity(req, {
      action: verified ? 'item.huid_verified' : 'item.huid_unverified',
      entityType: 'loan_item',
      entityId: item.id,
      loanId: req.params.id,
      summary: verified ? `Recorded HUID ${item.huid} as verified in BIS CARE${note ? `: ${note}` : ''}` : `Cleared HUID ${item.huid} verification`,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/loans/:id/branch { branchId } - admin only. The packet has
// physically moved to another branch (its locker), so the loan, its
// payments and future cash follow it.
export async function transferLoanBranch(req, res, next) {
  try {
    requireFields(req.body, ['branchId']);
    const { data: loan, error } = await supabase.from('loans').select('id, loan_number, borrower_id, branch_id, branches(name)').eq('id', req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!loan) throw new ApiError(404, 'Loan not found');
    const target = await writeBranchId(req, req.body.branchId);
    if (target === loan.branch_id) return res.json(loan);

    const { data, error: updateError } = await supabase
      .from('loans')
      .update({ branch_id: target, updated_at: new Date().toISOString() })
      .eq('id', loan.id)
      .select('*, branches(id, name, code)')
      .single();
    if (updateError) throw new ApiError(400, updateError.message);
    const { error: paymentsError } = await supabase.from('payments').update({ branch_id: target }).eq('loan_id', loan.id);
    if (paymentsError) throw new ApiError(400, paymentsError.message);

    await logActivity(req, {
      action: 'loan.branch_transfer',
      entityType: 'loan',
      entityId: loan.id,
      loanId: loan.id,
      borrowerId: loan.borrower_id,
      branchId: target,
      summary: `Moved ${loan.loan_number} from ${loan.branches?.name || 'no branch'} to ${data.branches?.name}`,
      details: { from: loan.branch_id, to: target },
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}
