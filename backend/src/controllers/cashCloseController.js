import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { logActivity, inr } from '../utils/activityLog.js';
import { listBranches, writeBranchId, pinnedBranchId } from '../utils/branches.js';
import { buildDayBook, todayIST } from './insightsController.js';

// End-of-day cash close: per branch, per day.
//
//   expected = opening cash
//            + cash part-payments + closure money (principal + interest)
//            - loans paid out
//            + other cash in - other cash out (expenses, owner top-up...)
//
// Staff count the drawer (optionally by denomination) and the difference
// is the variance. Opening cash carries over from the previous close's
// counted cash. UPI/cheque/bank payments are listed but never expected in
// the drawer. Figures are snapshotted when the day is closed; if anything
// for that day is edited afterwards the close shows as "changed since".

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ADMIN_ROLES = ['super_admin', 'admin'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

// Cash that physically moved through the drawer that day, from the day book.
export function drawerMovement(dayBook) {
  const t = dayBook.totals;
  const cashPayments = round2(dayBook.payments.filter((p) => (p.mode || 'cash') === 'cash').reduce((n, p) => n + p.amount, 0));
  const otherModes = round2(t.partPayments - cashPayments);
  return {
    cashIn: round2(cashPayments + t.closurePrincipal + t.interestCollected),
    cashOut: round2(t.disbursed),
    cashPayments,
    closureMoney: round2(t.closurePrincipal + t.interestCollected),
    nonCashPayments: otherModes,
    byMode: dayBook.partPaymentsByMode,
  };
}

async function previousClose(branchId, date) {
  const { data, error } = await supabase
    .from('cash_closes')
    .select('close_date, counted_cash')
    .eq('branch_id', branchId)
    .lt('close_date', date)
    .order('close_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ApiError(400, error.message);
  return data;
}

// Everything the close card needs for one branch on one day.
export async function branchDayStatus(branch, date) {
  const [dayBook, closeRes, prev] = await Promise.all([
    buildDayBook({ date, branchId: branch.id }),
    supabase.from('cash_closes').select('*').eq('branch_id', branch.id).eq('close_date', date).maybeSingle(),
    previousClose(branch.id, date),
  ]);
  if (closeRes.error) throw new ApiError(400, closeRes.error.message);
  const movement = drawerMovement(dayBook);
  const close = closeRes.data;
  const opening = close ? Number(close.opening_cash) : prev ? Number(prev.counted_cash) : null;

  return {
    branch: { id: branch.id, name: branch.name, code: branch.code },
    date,
    totals: dayBook.totals,
    movement,
    opening: { amount: opening, source: close ? 'close' : prev ? 'previous_close' : 'none', previousCloseDate: prev?.close_date || null },
    expectedBeforeOther: opening == null ? null : round2(opening + movement.cashIn - movement.cashOut),
    close,
    // Day's figures edited after it was closed (late payment entry, a
    // reversed closure...) - the stored close no longer matches the books.
    changedSinceClose: !!close && (round2(close.cash_in) !== movement.cashIn || round2(close.cash_out) !== movement.cashOut),
  };
}

function branchesInScope(req, rows) {
  const active = rows.filter((b) => b.is_active);
  return req.branchId ? rows.filter((b) => b.id === req.branchId) : active;
}

// GET /api/cash-close?date=YYYY-MM-DD
export async function getCashClose(req, res, next) {
  try {
    const date = req.query.date || todayIST();
    if (!ISO_DATE.test(date)) throw new ApiError(400, 'date must be YYYY-MM-DD');
    const scope = branchesInScope(req, await listBranches());
    if (scope.length === 0) throw new ApiError(400, 'No branches set up yet - run the 2026-10-11 database migration.');
    const branches = await Promise.all(scope.map((b) => branchDayStatus(b, date)));
    res.json({ date, today: todayIST(), denominations: DENOMINATIONS, branches });
  } catch (err) {
    next(err);
  }
}

function money(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ApiError(400, `${label} is required`);
    return 0;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, `${label} must be 0 or more`);
  return round2(n);
}

function cleanDenominations(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const d of DENOMINATIONS) {
    const count = Number(raw[d] ?? raw[String(d)] ?? 0);
    if (!Number.isInteger(count) || count < 0) throw new ApiError(400, `Count of ₹${d} notes/coins must be a whole number`);
    if (count) out[d] = count;
  }
  return Object.keys(out).length ? out : null;
}

// POST /api/cash-close { date, branchId?, countedCash, openingCash?, otherIn?, otherOut?, denominations?, notes? }
export async function closeDay(req, res, next) {
  try {
    requireFields(req.body, ['date']);
    const { date, notes } = req.body;
    if (!ISO_DATE.test(date)) throw new ApiError(400, 'date must be YYYY-MM-DD');
    if (date > todayIST()) throw new ApiError(400, "You can't close a day that hasn't happened yet.");

    const branchId = await writeBranchId(req, req.body.branchId);
    const branch = (await listBranches()).find((b) => b.id === branchId);
    if (!branch) throw new ApiError(400, 'Pick a branch to close.');

    const status = await branchDayStatus(branch, date);
    if (status.close) throw new ApiError(400, `${branch.name} is already closed for ${date}.`);

    // Opening cash comes from the previous close. Typing one in is for the
    // very first close (nothing to carry over), or an admin correction.
    let opening = status.opening.amount;
    if (req.body.openingCash !== undefined && req.body.openingCash !== '' && req.body.openingCash !== null) {
      const typed = money(req.body.openingCash, 'Opening cash');
      if (opening != null && typed !== opening && !ADMIN_ROLES.includes(req.adminUser?.role)) {
        throw new ApiError(403, `Opening cash is carried over from the last close (${inr(opening)}). Only an admin can change it.`);
      }
      opening = typed;
    }
    if (opening == null) throw new ApiError(400, 'Enter the opening cash - there is no earlier close to carry it over from.');

    const denominations = cleanDenominations(req.body.denominations);
    const denominationTotal = denominations ? Object.entries(denominations).reduce((n, [d, c]) => n + Number(d) * c, 0) : null;
    const counted = req.body.countedCash !== undefined && req.body.countedCash !== '' ? money(req.body.countedCash, 'Counted cash') : denominationTotal;
    if (counted == null) throw new ApiError(400, 'Counted cash is required');
    if (denominationTotal != null && round2(denominationTotal) !== counted) {
      throw new ApiError(400, `Counted cash ${inr(counted)} doesn't match the denomination count ${inr(denominationTotal)}.`);
    }

    const otherIn = money(req.body.otherIn, 'Other cash in');
    const otherOut = money(req.body.otherOut, 'Other cash out');
    const expected = round2(opening + status.movement.cashIn - status.movement.cashOut + otherIn - otherOut);
    const variance = round2(counted - expected);
    if (variance !== 0 && !String(notes || '').trim()) {
      throw new ApiError(400, `The drawer is ${variance > 0 ? 'over' : 'short'} by ${inr(Math.abs(variance))} - add a note explaining it.`);
    }

    const { data, error } = await supabase
      .from('cash_closes')
      .insert({
        branch_id: branchId,
        close_date: date,
        opening_cash: opening,
        cash_in: status.movement.cashIn,
        cash_out: status.movement.cashOut,
        other_in: otherIn,
        other_out: otherOut,
        expected_cash: expected,
        counted_cash: counted,
        variance,
        denominations,
        notes: String(notes || '').trim() || null,
        closed_by: req.user.id,
        closed_by_name: req.adminUser?.full_name || req.user.email,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, `${branch.name} is already closed for ${date}.`);
      throw new ApiError(400, error.message);
    }

    await logActivity(req, {
      action: 'cash.close',
      entityType: 'cash_close',
      entityId: data.id,
      branchId,
      summary:
        `Closed ${branch.name} for ${date}: counted ${inr(counted)}, expected ${inr(expected)}` +
        (variance ? ` (${variance > 0 ? 'over' : 'short'} by ${inr(Math.abs(variance))})` : ' (matches)'),
      details: { opening, cashIn: status.movement.cashIn, cashOut: status.movement.cashOut, otherIn, otherOut, expected, counted, variance },
    });
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/cash-close/:id - admin reopens a day (e.g. to fix a count).
export async function reopenDay(req, res, next) {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) throw new ApiError(400, 'Give a reason for reopening the day');
    const { data: close, error } = await supabase.from('cash_closes').select('*, branches(name)').eq('id', req.params.id).maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!close) throw new ApiError(404, 'Cash close not found');
    const pinned = pinnedBranchId(req.adminUser);
    if (pinned && pinned !== close.branch_id) throw new ApiError(403, 'This close belongs to another branch');

    const { error: deleteError } = await supabase.from('cash_closes').delete().eq('id', close.id);
    if (deleteError) throw new ApiError(400, deleteError.message);
    await logActivity(req, {
      action: 'cash.reopen',
      entityType: 'cash_close',
      entityId: close.id,
      branchId: close.branch_id,
      summary: `Reopened ${close.branches?.name || 'branch'} for ${close.close_date}: ${reason}`,
      details: { removedClose: close },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
