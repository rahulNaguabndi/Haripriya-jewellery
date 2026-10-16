import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { fetchAll } from './fetchAll.js';
import { getActiveBusinessProfile } from './businessProfile.js';

// Storage capacity: how full the lockers are, how many more packets fit,
// and how long that lasts at the current pace.
//
// Box capacity is an *estimate*, never a hard limit - a box holds ~150 rings
// or ~50 necklaces, and nobody knows what the next pledge will be. It starts
// at business_profile.default_box_capacity (20) and is replaced by the
// average of real samples as they appear:
//   - a reshuffle step where staff ticked "box is now full" (packets_after);
//   - a box that was set up *before* its first packet arrived and has since
//     been sealed (the next box of the same metal started filling) - its
//     count at the moment the next box started is how many it held.

export const METALS = ['Gold', 'Silver'];
export const IN_STORAGE_STATUSES = ['active', 'partial_payment', 'defaulted'];
const FALLBACK_BOX_CAPACITY = 20;
const SAMPLE_LIMIT = 30; // average the most recent samples - box models change
export const FLOW_WINDOW_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);
export const todayISO = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

// A loan's packet is filed under its first item's metal type (same rule as
// boxController's lookupPacket).
export const packetMetal = (loan) => loan.loan_items?.[0]?.metal_type || loan.metal_type || null;
export const inStorage = (loan) => IN_STORAGE_STATUSES.includes(loan.status);

// The day a closed loan's packet left storage. Closures through the close
// dialog record closure_date; loans auto-closed by a final payment don't,
// so their last update (when the status flipped) stands in.
export function leftStorageOn(loan) {
  if (loan.status !== 'closed') return null;
  return loan.closure_date || (loan.updated_at ? isoDay(loan.updated_at) : loan.loan_date);
}

const hasRange = (box) => box.range_start != null && box.range_end != null;
const boxBranch = (box) => box.lockers?.branch_id || null;

export function boxHolds(box, loan, range = [box.range_start, box.range_end]) {
  const lockerBranchId = boxBranch(box);
  return (
    range[0] != null &&
    range[1] != null &&
    loan.packet_number != null &&
    (!lockerBranchId || !loan.branch_id || loan.branch_id === lockerBranchId) &&
    loan.packet_number >= range[0] &&
    loan.packet_number <= range[1] &&
    packetMetal(loan) === box.metal_type
  );
}

const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

// Everything the capacity / reshuffle views need, in one round of reads.
export async function loadStorageState(branchId = null) {
  const inBranch = (q, col = 'branch_id') => (branchId ? q.eq(col, branchId) : q);
  const [profile, lockersRes, boxesRes, loans, reshufflesRes] = await Promise.all([
    getActiveBusinessProfile(),
    inBranch(supabase.from('lockers').select('*')).order('display_order', { ascending: true }),
    inBranch(supabase.from('boxes').select('*, lockers!inner(name, branch_id)'), 'lockers.branch_id'),
    fetchAll(() =>
      inBranch(
        supabase
          .from('loans')
          .select('id, loan_number, packet_number, loan_date, status, closure_date, updated_at, metal_type, branch_id, borrowers(name), loan_items(metal_type)')
      ).order('id', { ascending: true })
    ),
    supabase.from('box_reshuffles').select('box_id, metal_type, old_start, old_end, packets_after, box_full, created_at').order('created_at', { ascending: true }),
  ]);
  if (lockersRes.error) throw new ApiError(400, lockersRes.error.message);
  if (boxesRes.error) throw new ApiError(400, boxesRes.error.message);
  if (reshufflesRes.error) console.warn('[storage] box_reshuffles unavailable (run the 2026-10-13 migration):', reshufflesRes.error.message);

  const defaultCapacity = Number(profile.default_box_capacity) > 0 ? Number(profile.default_box_capacity) : FALLBACK_BOX_CAPACITY;
  const boxes = (boxesRes.data || []).slice().sort((a, b) => naturalCompare(a.box_number, b.box_number));
  return {
    defaultCapacity,
    lockers: lockersRes.data || [],
    boxes,
    loans,
    reshuffles: reshufflesRes.error ? [] : reshufflesRes.data || [],
  };
}

// The range a box was set up with, before any reshuffle rewrote it.
function originalRange(box, reshuffles) {
  const first = reshuffles.find((r) => r.box_id === box.id);
  if (first) return [first.old_start, first.old_end];
  return [box.range_start, box.range_end];
}

export function estimateBoxCapacity(state, metal) {
  const samples = [];

  for (const r of state.reshuffles) {
    if (r.box_full && r.metal_type === metal && r.packets_after > 0) {
      samples.push({ value: r.packets_after, at: r.created_at.slice(0, 10), source: 'reshuffle' });
    }
  }

  // Live-tracked boxes that have since been sealed.
  const metalLoans = state.loans.filter((l) => packetMetal(l) === metal && l.packet_number != null);
  const ranged = state.boxes
    .filter((b) => b.metal_type === metal)
    .map((b) => ({ box: b, range: originalRange(b, state.reshuffles) }))
    .filter((x) => x.range[0] != null && x.range[1] != null);
  for (const { box, range } of ranged) {
    const held = metalLoans.filter((l) => boxHolds(box, l, range));
    if (!held.length) continue;
    const firstIn = held.reduce((m, l) => (l.loan_date < m ? l.loan_date : m), held[0].loan_date);
    if (isoDay(box.created_at) > firstIn) continue; // box was labelled after the fact
    const next = ranged
      .filter((x) => x.box.id !== box.id && boxBranch(x.box) === boxBranch(box) && x.range[0] > range[1])
      .sort((a, b) => a.range[0] - b.range[0])[0];
    if (!next) continue; // still the running box
    const nextLoans = metalLoans.filter((l) => boxHolds(next.box, l, next.range));
    if (!nextLoans.length) continue;
    const sealedOn = nextLoans.reduce((m, l) => (l.loan_date < m ? l.loan_date : m), nextLoans[0].loan_date);
    const count = held.filter((l) => {
      const left = leftStorageOn(l);
      return l.loan_date <= sealedOn && (!left || left >= sealedOn);
    }).length;
    if (count > 0) samples.push({ value: count, at: sealedOn, source: 'sealed box' });
  }

  samples.sort((a, b) => (a.at < b.at ? -1 : 1));
  const recent = samples.slice(-SAMPLE_LIMIT);
  if (!recent.length) {
    return { estimate: state.defaultCapacity, learned: false, sampleCount: 0, defaultCapacity: state.defaultCapacity, samples: [] };
  }
  const avg = recent.reduce((n, s) => n + s.value, 0) / recent.length;
  return {
    estimate: Math.max(1, Math.round(avg)),
    learned: true,
    sampleCount: recent.length,
    defaultCapacity: state.defaultCapacity,
    samples: recent,
  };
}

// Current fill of every box of one metal, plus headroom and runway.
export function summarizeMetal(state, metal, { asOf = todayISO() } = {}) {
  const capacity = estimateBoxCapacity(state, metal);
  const est = capacity.estimate;
  const stored = state.loans.filter((l) => inStorage(l) && packetMetal(l) === metal);
  const numbered = stored.filter((l) => l.packet_number != null);

  const boxes = state.boxes
    .filter((b) => b.metal_type === metal)
    .map((box) => {
      const count = numbered.filter((l) => boxHolds(box, l)).length;
      return {
        id: box.id,
        boxNumber: box.box_number,
        lockerId: box.locker_id,
        lockerName: box.lockers?.name || null,
        branchId: boxBranch(box),
        rangeStart: box.range_start,
        rangeEnd: box.range_end,
        packetCount: count,
        estFree: Math.max(0, est - count),
        fillPct: Math.round((count / est) * 100),
        isFree: count === 0,
      };
    });

  const covered = new Set();
  for (const box of state.boxes.filter((b) => b.metal_type === metal && hasRange(b))) {
    for (const l of numbered) if (boxHolds(box, l)) covered.add(l.id);
  }

  // Empty slots in lockers that may hold this metal. A locker that takes
  // both metals has its slots counted for both (flagged as shared).
  const lockers = state.lockers
    .filter((l) => (l.metal_types || []).includes(metal))
    .map((l) => {
      const used = state.boxes.filter((b) => b.locker_id === l.id).length;
      return {
        id: l.id,
        name: l.name,
        branchId: l.branch_id,
        shared: (l.metal_types || []).length > 1,
        slots: l.box_capacity ?? null,
        boxes: used,
        freeSlots: l.box_capacity != null ? Math.max(0, l.box_capacity - used) : null,
      };
    });
  const freeSlots = lockers.reduce((n, l) => n + (l.freeSlots || 0), 0);
  const unknownSlotLockers = lockers.filter((l) => l.slots == null).length;

  const freeInBoxes = boxes.reduce((n, b) => n + b.estFree, 0);
  const headroom = freeInBoxes + freeSlots * est;
  const totalCapacity = boxes.length * est + freeSlots * est;

  // Pace: packets in minus packets out over the trailing window.
  const from = isoDay(new Date(`${asOf}T00:00:00Z`).getTime() - (FLOW_WINDOW_DAYS - 1) * DAY_MS);
  const metalLoans = state.loans.filter((l) => packetMetal(l) === metal);
  const added = metalLoans.filter((l) => l.loan_date >= from && l.loan_date <= asOf).length;
  const removed = metalLoans.filter((l) => {
    const left = leftStorageOn(l);
    return left && left >= from && left <= asOf;
  }).length;
  const netPerDay = (added - removed) / FLOW_WINDOW_DAYS;
  const runwayDays = netPerDay > 0 ? Math.floor(headroom / netPerDay) : null;

  return {
    metal,
    capacity: { estimate: est, learned: capacity.learned, sampleCount: capacity.sampleCount, defaultCapacity: capacity.defaultCapacity },
    packetsInStorage: stored.length,
    packetsInBoxes: covered.size,
    notInAnyBox: numbered.length - covered.size,
    unnumbered: stored.length - numbered.length,
    boxesTotal: boxes.length,
    boxesInUse: boxes.filter((b) => b.packetCount > 0).length,
    freeBoxes: boxes.filter((b) => b.isFree).length,
    freeInBoxes,
    freeSlots,
    unknownSlotLockers,
    totalCapacity,
    headroom,
    occupancyPct: totalCapacity > 0 ? Math.round((covered.size / totalCapacity) * 100) : null,
    flow: { windowDays: FLOW_WINDOW_DAYS, added, removed, netPerDay: Math.round(netPerDay * 100) / 100 },
    runwayDays,
    lockers,
    boxes,
  };
}

// Packets in storage over time, rebuilt from loan dates - works for the
// whole history even though packet numbers / boxes only exist recently.
export function occupancyHistory(state, metal, { asOf = todayISO() } = {}) {
  const loans = state.loans.filter((l) => packetMetal(l) === metal && l.loan_date);
  if (!loans.length) return { months: [], stats: null };

  const start = loans.reduce((m, l) => (l.loan_date < m ? l.loan_date : m), loans[0].loan_date);
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const days = Math.floor((Date.parse(`${asOf}T00:00:00Z`) - t0) / DAY_MS) + 1;
  if (days <= 0) return { months: [], stats: null };
  const idx = (iso) => Math.floor((Date.parse(`${iso}T00:00:00Z`) - t0) / DAY_MS);

  // +1 the day a packet comes in, -1 the day after it leaves (a packet
  // returned today was still in the locker this morning).
  const delta = new Array(days + 1).fill(0);
  for (const l of loans) {
    const inAt = idx(l.loan_date);
    if (inAt >= days) continue;
    delta[Math.max(0, inAt)] += 1;
    const left = leftStorageOn(l);
    if (left) {
      const outAt = idx(left) + 1;
      if (outAt <= inAt) delta[Math.max(0, inAt)] -= 1;
      else if (outAt < days) delta[outAt] -= 1;
    }
  }

  const byMonth = new Map();
  let running = 0;
  let peak = { value: 0, date: start };
  const daily = [];
  for (let d = 0; d < days; d++) {
    running += delta[d];
    const date = isoDay(t0 + d * DAY_MS);
    daily.push(running);
    if (running > peak.value) peak = { value: running, date };
    const key = date.slice(0, 7);
    const m = byMonth.get(key) || { month: key, sum: 0, n: 0, end: 0 };
    m.sum += running;
    m.n += 1;
    m.end = running;
    byMonth.set(key, m);
  }

  const avg = (arr) => (arr.length ? Math.round(arr.reduce((n, v) => n + v, 0) / arr.length) : null);
  const months = [...byMonth.values()].map((m) => ({ month: m.month, avg: Math.round(m.sum / m.n), end: m.end }));
  const lastYear = String(Number(asOf.slice(0, 4)) - 1);

  return {
    months,
    stats: {
      since: start,
      current: running,
      avgLast12Months: avg(daily.slice(-365)),
      avgLastCalendarYear: avg(daily.filter((_, i) => isoDay(t0 + i * DAY_MS).startsWith(lastYear))),
      lastCalendarYear: lastYear,
      avgAllTime: avg(daily),
      peak,
    },
  };
}

// ---------------------------------------------------------------------
// Reshuffle: staff enter a box's new start/end after physically shifting
// the lowest packets of the next box(es) into it. Following boxes of the
// same metal and branch are trimmed to start right after the new end, or
// cleared (freed) if the new range swallows them whole.
// ---------------------------------------------------------------------

export function planRangeChange(state, boxId, newStart, newEnd) {
  const box = state.boxes.find((b) => b.id === boxId);
  if (!box) throw new ApiError(404, 'Box not found');
  if (!Number.isInteger(newStart) || !Number.isInteger(newEnd) || newStart < 1) {
    throw new ApiError(400, 'Start and end must be whole packet numbers');
  }
  if (newStart > newEnd) throw new ApiError(400, 'Start must be less than or equal to end');

  const metal = box.metal_type;
  const branch = boxBranch(box);
  const stored = state.loans.filter((l) => inStorage(l) && l.packet_number != null && packetMetal(l) === metal && (!branch || !l.branch_id || l.branch_id === branch));
  const peers = state.boxes
    .filter((b) => b.id !== box.id && b.metal_type === metal && boxBranch(b) === branch && hasRange(b))
    .sort((a, b) => a.range_start - b.range_start);

  const conflicts = [];
  const adjusted = [];
  for (const p of peers) {
    if (p.range_end < newStart || p.range_start > newEnd) continue;
    if (p.range_start < newStart) {
      conflicts.push(`Overlaps Box ${p.box_number} (${p.range_start}–${p.range_end}), which starts before ${newStart}. Trim that box first.`);
      continue;
    }
    const to = p.range_end <= newEnd ? null : [newEnd + 1, p.range_end];
    adjusted.push({ box: p, from: [p.range_start, p.range_end], to });
  }

  const newRanges = new Map(state.boxes.filter((b) => b.metal_type === metal && boxBranch(b) === branch).map((b) => [b.id, hasRange(b) ? [b.range_start, b.range_end] : null]));
  newRanges.set(box.id, [newStart, newEnd]);
  for (const a of adjusted) newRanges.set(a.box.id, a.to);
  const boxById = new Map(state.boxes.map((b) => [b.id, b]));
  const whereNow = (l) => {
    for (const [id, r] of newRanges) if (r && boxHolds(boxById.get(id), l, r)) return id;
    return null;
  };
  const whereBefore = (l) => state.boxes.find((b) => b.metal_type === metal && boxBranch(b) === branch && boxHolds(b, l)) || null;

  const inNew = stored.filter((l) => boxHolds(box, l, [newStart, newEnd])).sort((a, b) => a.packet_number - b.packet_number);
  const packets = inNew.map((l) => {
    const from = whereBefore(l);
    return {
      packetNumber: l.packet_number,
      loanId: l.id,
      loanNumber: l.loan_number,
      borrower: l.borrowers?.name || null,
      // 'this' = already in the box, 'other' = moving in from another box,
      // 'none' = wasn't covered by any box range until now.
      was: !from ? 'none' : from.id === box.id ? 'this' : 'other',
      fromBox: from && from.id !== box.id ? from.box_number : null,
      fromLocker: from && from.id !== box.id ? from.lockers?.name || null : null,
    };
  });

  // Packets that sat in one of the touched boxes before and now fall
  // between ranges - a sign the numbers entered don't match the shelf.
  const touched = [box, ...adjusted.map((a) => a.box)];
  const uncovered = stored
    .filter((l) => touched.some((b) => boxHolds(b, l)) && !whereNow(l))
    .map((l) => l.packet_number)
    .sort((a, b) => a - b);

  return {
    box: { id: box.id, boxNumber: box.box_number, lockerName: box.lockers?.name || null, metal, branchId: branch },
    from: hasRange(box) ? [box.range_start, box.range_end] : null,
    to: [newStart, newEnd],
    packetsBefore: stored.filter((l) => boxHolds(box, l)).length,
    packetsAfter: inNew.length,
    alreadyThere: packets.filter((p) => p.was === 'this').length,
    incoming: packets.filter((p) => p.was === 'other').length,
    newlyCovered: packets.filter((p) => p.was === 'none').length,
    packets,
    adjusted: adjusted.map((a) => ({
      boxId: a.box.id,
      boxNumber: a.box.box_number,
      lockerName: a.box.lockers?.name || null,
      from: a.from,
      to: a.to,
      packetsBefore: stored.filter((l) => boxHolds(a.box, l)).length,
      packetsAfter: a.to ? stored.filter((l) => boxHolds(a.box, l, a.to)).length : 0,
    })),
    uncovered,
    conflicts,
  };
}

// Boxes of one metal in shelf order, with the "take the next N packets
// from the following box" hint for every box that has room.
export function reshufflePlan(state, metal, threshold) {
  const summary = summarizeMetal(state, metal);
  const est = summary.capacity.estimate;
  const stored = state.loans.filter((l) => inStorage(l) && l.packet_number != null && packetMetal(l) === metal);

  const byBranch = new Map();
  for (const b of state.boxes.filter((x) => x.metal_type === metal)) {
    const key = boxBranch(b) || 'none';
    if (!byBranch.has(key)) byBranch.set(key, []);
    byBranch.get(key).push(b);
  }

  const rows = [];
  for (const list of byBranch.values()) {
    const ordered = list.filter(hasRange).sort((a, b) => a.range_start - b.range_start);
    ordered.forEach((box, i) => {
      const held = stored.filter((l) => boxHolds(box, l));
      const free = Math.max(0, est - held.length);
      const next = ordered[i + 1] || null;
      let suggestion = null;
      if (next && free >= threshold) {
        const nextPackets = stored
          .filter((l) => boxHolds(next, l))
          .sort((a, b) => a.packet_number - b.packet_number);
        const take = nextPackets.slice(0, free);
        if (take.length) {
          suggestion = {
            fromBoxId: next.id,
            fromBox: next.box_number,
            fromLocker: next.lockers?.name || null,
            take: take.length,
            packetNumbers: take.map((l) => l.packet_number),
            suggestedEnd: take[take.length - 1].packet_number,
            emptiesNextBox: take.length === nextPackets.length,
          };
        }
      }
      rows.push({
        id: box.id,
        boxNumber: box.box_number,
        lockerName: box.lockers?.name || null,
        branchId: boxBranch(box),
        rangeStart: box.range_start,
        rangeEnd: box.range_end,
        packetCount: held.length,
        estFree: free,
        hasSpace: free >= threshold,
        isRunning: !next,
        suggestion,
      });
    });
    for (const box of list.filter((b) => !hasRange(b))) {
      rows.push({
        id: box.id,
        boxNumber: box.box_number,
        lockerName: box.lockers?.name || null,
        branchId: boxBranch(box),
        rangeStart: null,
        rangeEnd: null,
        packetCount: 0,
        estFree: est,
        hasSpace: true,
        isRunning: false,
        isFree: true,
        suggestion: null,
      });
    }
  }

  return { metal, threshold, estimate: est, learned: summary.capacity.learned, boxes: rows };
}

// Nightly per-branch, per-metal snapshot (called from the digest job).
export async function takeStorageSnapshots(date = todayISO()) {
  const { data: branches } = await supabase.from('branches').select('id, is_active');
  const targets = (branches || []).filter((b) => b.is_active).map((b) => b.id);
  const rows = [];
  for (const branchId of targets.length ? targets : [null]) {
    const state = await loadStorageState(branchId);
    for (const metal of METALS) {
      const s = summarizeMetal(state, metal, { asOf: date });
      if (!s.boxesTotal && !s.packetsInStorage) continue;
      rows.push({
        snapshot_date: date,
        branch_id: branchId,
        metal_type: metal,
        packets_in_storage: s.packetsInStorage,
        boxes_in_use: s.boxesInUse,
        box_slots: s.lockers.reduce((n, l) => n + (l.slots || 0), 0) || null,
        est_box_capacity: s.capacity.estimate,
        headroom: s.headroom,
        boxes: s.boxes.map((b) => ({ id: b.id, n: b.boxNumber, c: b.packetCount })),
      });
    }
  }
  if (!rows.length) return { saved: 0 };
  const { error } = await supabase.from('storage_snapshots').upsert(rows, { onConflict: 'snapshot_date,branch_id,metal_type' });
  if (error) throw new ApiError(400, error.message);
  return { saved: rows.length };
}
