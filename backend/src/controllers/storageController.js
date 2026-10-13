import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logActivity } from '../utils/activityLog.js';
import {
  METALS,
  loadStorageState,
  summarizeMetal,
  occupancyHistory,
  planRangeChange,
  reshufflePlan,
} from '../utils/storageCapacity.js';

function metalFrom(value) {
  const metal = value || 'Gold';
  if (!METALS.includes(metal)) throw new ApiError(400, `metal must be one of: ${METALS.join(', ')}`);
  return metal;
}

const intFrom = (value) => (value === undefined || value === null || value === '' ? NaN : Number(value));

// GET /api/storage/capacity - per metal: fill, estimated box capacity,
// headroom (packets that still fit) and runway at the current pace.
export async function getCapacity(req, res, next) {
  try {
    const state = await loadStorageState(req.branchId);
    const metals = METALS.map((m) => summarizeMetal(state, m));
    res.json({ defaultBoxCapacity: state.defaultCapacity, metals });
  } catch (err) {
    next(err);
  }
}

// GET /api/storage/history?metal= - monthly packets in storage since the
// first loan, plus the capacity line from nightly snapshots (where taken).
export async function getHistory(req, res, next) {
  try {
    const metal = metalFrom(req.query.metal);
    const state = await loadStorageState(req.branchId);
    const history = occupancyHistory(state, metal);

    let snapQuery = supabase
      .from('storage_snapshots')
      .select('snapshot_date, packets_in_storage, headroom')
      .eq('metal_type', metal)
      .order('snapshot_date', { ascending: true });
    if (req.branchId) snapQuery = snapQuery.eq('branch_id', req.branchId);
    const { data: snaps, error } = await snapQuery;
    if (error) console.warn('[storage] storage_snapshots unavailable (run the 2026-10-13 migration):', error.message);

    // Capacity = packets + headroom on the last snapshot of each month,
    // summed across branches.
    const lastDay = new Map();
    for (const s of snaps || []) lastDay.set(s.snapshot_date.slice(0, 7), s.snapshot_date);
    const capacityByMonth = new Map();
    for (const s of snaps || []) {
      if (lastDay.get(s.snapshot_date.slice(0, 7)) !== s.snapshot_date) continue;
      const key = s.snapshot_date.slice(0, 7);
      capacityByMonth.set(key, (capacityByMonth.get(key) || 0) + s.packets_in_storage + (s.headroom || 0));
    }
    const months = history.months.map((m) => ({ ...m, capacity: capacityByMonth.get(m.month) ?? null }));

    res.json({ metal, months, stats: history.stats, snapshotDays: new Set((snaps || []).map((s) => s.snapshot_date)).size });
  } catch (err) {
    next(err);
  }
}

// GET /api/storage/reshuffle/plan?metal=&threshold=
export async function getReshufflePlan(req, res, next) {
  try {
    const metal = metalFrom(req.query.metal);
    const threshold = req.query.threshold ? Number(req.query.threshold) : 10;
    if (!Number.isInteger(threshold) || threshold < 1) throw new ApiError(400, 'threshold must be a whole number of at least 1');
    const state = await loadStorageState(req.branchId);
    res.json(reshufflePlan(state, metal, threshold));
  } catch (err) {
    next(err);
  }
}

// GET /api/storage/reshuffle/preview?boxId=&start=&end= - what saving
// these numbers would do, without changing anything.
export async function previewReshuffle(req, res, next) {
  try {
    if (!req.query.boxId) throw new ApiError(400, 'boxId is required');
    const state = await loadStorageState(req.branchId);
    res.json(planRangeChange(state, req.query.boxId, intFrom(req.query.start), intFrom(req.query.end)));
  } catch (err) {
    next(err);
  }
}

// POST /api/storage/reshuffle { boxId, rangeStart, rangeEnd, boxFull, notes }
// Saves a box's new range after the physical shift, trims the following
// boxes to match, and logs the step.
export async function applyReshuffle(req, res, next) {
  try {
    const { boxId, rangeStart, rangeEnd, boxFull = false, notes = null } = req.body || {};
    if (!boxId) throw new ApiError(400, 'boxId is required');
    const state = await loadStorageState(req.branchId);
    const plan = planRangeChange(state, boxId, intFrom(rangeStart), intFrom(rangeEnd));
    if (plan.conflicts.length) throw new ApiError(400, plan.conflicts.join(' '));

    const now = new Date().toISOString();
    // Following boxes first: if the main update then fails, nothing claims
    // the same packet twice - at worst a few packets show as "not in any box".
    for (const a of plan.adjusted) {
      const { error } = await supabase
        .from('boxes')
        .update({ range_start: a.to ? a.to[0] : null, range_end: a.to ? a.to[1] : null, updated_at: now, updated_by: req.user.id })
        .eq('id', a.boxId);
      if (error) throw new ApiError(400, `Could not update Box ${a.boxNumber}: ${error.message}`);
    }
    const { error: boxError } = await supabase
      .from('boxes')
      .update({ range_start: plan.to[0], range_end: plan.to[1], updated_at: now, updated_by: req.user.id })
      .eq('id', boxId);
    if (boxError) throw new ApiError(400, boxError.message);

    const { data: step, error: logError } = await supabase
      .from('box_reshuffles')
      .insert({
        branch_id: plan.box.branchId,
        box_id: boxId,
        box_number: plan.box.boxNumber,
        metal_type: plan.box.metal,
        old_start: plan.from?.[0] ?? null,
        old_end: plan.from?.[1] ?? null,
        new_start: plan.to[0],
        new_end: plan.to[1],
        packets_before: plan.packetsBefore,
        packets_after: plan.packetsAfter,
        box_full: !!boxFull,
        adjusted: plan.adjusted.map((a) => ({ boxId: a.boxId, boxNumber: a.boxNumber, from: a.from, to: a.to, packetsAfter: a.packetsAfter })),
        notes: notes || null,
        created_by: req.user.id,
        created_by_name: req.adminUser?.full_name || req.user.email,
      })
      .select()
      .single();
    if (logError) console.warn('[storage] could not log reshuffle (run the 2026-10-13 migration):', logError.message);

    const range = (r) => (r ? `${r[0]}–${r[1]}` : 'emptied');
    await logActivity(req, {
      action: 'storage.reshuffle',
      entityType: 'box',
      entityId: boxId,
      branchId: plan.box.branchId,
      summary:
        `Box ${plan.box.boxNumber} (${plan.box.metal}) ${range(plan.from)} → ${range(plan.to)}, ${plan.packetsAfter} packets` +
        (plan.incoming ? ` (${plan.incoming} moved in)` : '') +
        (plan.newlyCovered ? ` (${plan.newlyCovered} newly covered)` : '') +
        (plan.adjusted.length ? `; ${plan.adjusted.map((a) => `Box ${a.boxNumber} ${range(a.to)}`).join(', ')}` : '') +
        (boxFull ? '; marked full' : ''),
      details: { from: plan.from, to: plan.to, adjusted: plan.adjusted, boxFull: !!boxFull, notes },
    });

    res.json({ ...plan, logged: !logError, stepId: step?.id || null });
  } catch (err) {
    next(err);
  }
}

// GET /api/storage/reshuffle/log?limit=
export async function getReshuffleLog(req, res, next) {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 30);
    let query = supabase.from('box_reshuffles').select('*').order('created_at', { ascending: false }).limit(limit);
    if (req.branchId) query = query.eq('branch_id', req.branchId);
    const { data, error } = await query;
    if (error) {
      console.warn('[storage] box_reshuffles unavailable (run the 2026-10-13 migration):', error.message);
      return res.json({ data: [], unavailable: true });
    }
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// PUT /api/storage/settings { defaultBoxCapacity } - the starting guess
// used until real box fills have been recorded.
export async function updateStorageSettings(req, res, next) {
  try {
    const value = Number(req.body?.defaultBoxCapacity);
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      throw new ApiError(400, 'defaultBoxCapacity must be a whole number between 1 and 1000');
    }
    const { data: profile, error: readError } = await supabase.from('business_profile').select('id, default_box_capacity').eq('is_active', true).maybeSingle();
    if (readError) throw new ApiError(400, readError.message);
    if (!profile) throw new ApiError(400, 'Set up the business profile under Settings first.');
    const { error } = await supabase
      .from('business_profile')
      .update({ default_box_capacity: value, updated_at: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) throw new ApiError(400, error.message);

    await logActivity(req, {
      action: 'storage.settings',
      entityType: 'business_profile',
      entityId: profile.id,
      branchId: null,
      summary: `Starting box capacity estimate ${profile.default_box_capacity ?? '—'} → ${value} packets`,
    });
    res.json({ defaultBoxCapacity: value });
  } catch (err) {
    next(err);
  }
}
