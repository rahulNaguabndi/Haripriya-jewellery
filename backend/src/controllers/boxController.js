import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';

const METAL_TYPES = ['Gold', 'Silver'];

export async function listBoxes(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('boxes')
      .select('*, lockers(name)')
      .order('box_number', { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// Boxes of the same metal type whose range overlaps [rangeStart, rangeEnd] -
// surfaced as a non-blocking hint during reshuffles, so admin knows which
// other box's range to go trim by hand. Doesn't auto-resolve anything.
async function findOverlaps({ metalType, rangeStart, rangeEnd, excludeBoxId }) {
  if (rangeStart == null || rangeEnd == null) return [];
  let query = supabase
    .from('boxes')
    .select('*, lockers(name)')
    .eq('metal_type', metalType)
    .not('range_start', 'is', null)
    .not('range_end', 'is', null)
    .lte('range_start', rangeEnd)
    .gte('range_end', rangeStart);
  if (excludeBoxId) query = query.neq('id', excludeBoxId);
  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message);
  return data || [];
}

export async function createBox(req, res, next) {
  try {
    requireFields(req.body, ['lockerId', 'boxNumber', 'metalType']);
    const { lockerId, boxNumber, metalType, rangeStart, rangeEnd } = req.body;

    if (!METAL_TYPES.includes(metalType)) {
      throw new ApiError(400, `metalType must be one of: ${METAL_TYPES.join(', ')}`);
    }
    if ((rangeStart != null) !== (rangeEnd != null)) {
      throw new ApiError(400, 'rangeStart and rangeEnd must be set together');
    }
    if (rangeStart != null && rangeEnd != null && rangeStart > rangeEnd) {
      throw new ApiError(400, 'rangeStart must be less than or equal to rangeEnd');
    }

    const overlaps = await findOverlaps({ metalType, rangeStart, rangeEnd });

    const { data, error } = await supabase
      .from('boxes')
      .insert({
        locker_id: lockerId,
        box_number: boxNumber,
        metal_type: metalType,
        range_start: rangeStart ?? null,
        range_end: rangeEnd ?? null,
        updated_by: req.user.id,
      })
      .select('*, lockers(name)')
      .single();

    if (error) {
      if (error.code === '23505') throw new ApiError(400, `Box number "${boxNumber}" is already in use.`);
      throw new ApiError(400, error.message);
    }
    res.status(201).json({ ...data, overlaps });
  } catch (err) {
    next(err);
  }
}

export async function updateBox(req, res, next) {
  try {
    const { lockerId, boxNumber, metalType, rangeStart, rangeEnd } = req.body;
    if (metalType !== undefined && !METAL_TYPES.includes(metalType)) {
      throw new ApiError(400, `metalType must be one of: ${METAL_TYPES.join(', ')}`);
    }
    if (rangeStart != null && rangeEnd != null && rangeStart > rangeEnd) {
      throw new ApiError(400, 'rangeStart must be less than or equal to rangeEnd');
    }

    const update = { updated_at: new Date().toISOString(), updated_by: req.user.id };
    if (lockerId !== undefined) update.locker_id = lockerId;
    if (boxNumber !== undefined) update.box_number = boxNumber;
    if (metalType !== undefined) update.metal_type = metalType;
    if (rangeStart !== undefined) update.range_start = rangeStart;
    if (rangeEnd !== undefined) update.range_end = rangeEnd;

    const { data: current, error: currentError } = await supabase
      .from('boxes')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (currentError) throw new ApiError(400, currentError.message);
    if (!current) throw new ApiError(404, 'Box not found');

    const effectiveMetalType = metalType ?? current.metal_type;
    const effectiveStart = rangeStart !== undefined ? rangeStart : current.range_start;
    const effectiveEnd = rangeEnd !== undefined ? rangeEnd : current.range_end;
    const overlaps = await findOverlaps({
      metalType: effectiveMetalType,
      rangeStart: effectiveStart,
      rangeEnd: effectiveEnd,
      excludeBoxId: req.params.id,
    });

    const { data, error } = await supabase
      .from('boxes')
      .update(update)
      .eq('id', req.params.id)
      .select('*, lockers(name)')
      .maybeSingle();
    if (error) {
      if (error.code === '23505') throw new ApiError(400, `Box number "${boxNumber}" is already in use.`);
      throw new ApiError(400, error.message);
    }
    res.json({ ...data, overlaps });
  } catch (err) {
    next(err);
  }
}

export async function deleteBox(req, res, next) {
  try {
    const { error } = await supabase.from('boxes').delete().eq('id', req.params.id);
    if (error) throw new ApiError(400, error.message);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// Locates a physical packet: resolves its metal type from the loan itself,
// then finds the box (of that metal type) whose range contains it.
export async function lookupPacket(req, res, next) {
  try {
    const packetNumber = Number(req.query.packetNumber);
    if (!packetNumber || !Number.isInteger(packetNumber)) {
      throw new ApiError(400, 'packetNumber must be a whole number');
    }

    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id, loan_number, status, borrowers(name), loan_items(metal_type)')
      .eq('packet_number', packetNumber)
      .maybeSingle();
    if (loanError) throw new ApiError(400, loanError.message);
    if (!loan) {
      return res.json({ found: false, reason: 'No loan has this packet number.' });
    }

    // One physical packet per loan, even if it covers several items - if
    // those items span metal types, the packet is filed under the first
    // item's metal type (matches how the metal_rate snapshot at loan
    // creation resolves the same ambiguity).
    const metalType = loan.loan_items?.[0]?.metal_type;
    const { data: box, error: boxError } = await supabase
      .from('boxes')
      .select('*, lockers(name)')
      .eq('metal_type', metalType)
      .lte('range_start', packetNumber)
      .gte('range_end', packetNumber)
      .maybeSingle();
    if (boxError) throw new ApiError(400, boxError.message);

    if (!box) {
      return res.json({
        found: false,
        reason: `Loan ${loan.loan_number} found, but no ${metalType} box is configured for packet #${packetNumber} yet.`,
        loan,
      });
    }

    res.json({ found: true, loan, box });
  } catch (err) {
    next(err);
  }
}
