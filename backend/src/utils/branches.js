import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';

// Branch scoping.
//
// Every request carries an optional `X-Branch-Id` header (the branch picked
// in the header switcher; absent or "all" = every branch). verifyAuth turns
// it into req.branchId:
//   - staff tied to a branch (admin_users.branch_id) are always pinned to it,
//     whatever the header says;
//   - everyone else gets the header's branch, or null = all branches.
// Reads filter with scopeBranch(); writes pick a concrete branch with
// writeBranchId(). Borrowers, rates and settings are business-wide.

const CACHE_MS = 60 * 1000;
let cache = { at: 0, rows: null };

export async function listBranches({ fresh = false } = {}) {
  if (!fresh && cache.rows && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const { data, error } = await supabase.from('branches').select('*').order('is_default', { ascending: false }).order('name');
  if (error) {
    // Most likely the 2026-10-11 migration hasn't been applied yet: behave
    // as a single-branch shop instead of failing every request.
    console.warn('[branches] could not read branches:', error.message);
    return [];
  }
  cache = { at: Date.now(), rows: data || [] };
  return cache.rows;
}

export function clearBranchCache() {
  cache = { at: 0, rows: null };
}

export async function defaultBranchId() {
  const rows = await listBranches();
  return (rows.find((b) => b.is_default) || rows.find((b) => b.is_active) || rows[0])?.id || null;
}

// The branch a staff member is locked to, or null if they can see all.
export function pinnedBranchId(adminUser) {
  return adminUser?.role === 'staff' && adminUser?.branch_id ? adminUser.branch_id : null;
}

export async function resolveRequestBranch(req) {
  const pinned = pinnedBranchId(req.adminUser);
  if (pinned) return pinned;
  const header = String(req.headers['x-branch-id'] || '').trim();
  if (!header || header === 'all') return null;
  const rows = await listBranches();
  // An unknown/stale id (e.g. a deleted branch still in localStorage) falls
  // back to "all" rather than silently showing nothing.
  return rows.some((b) => b.id === header) ? header : null;
}

// Restricts a query to the request's branch (no-op when viewing all).
export function scopeBranch(query, req, column = 'branch_id') {
  return req.branchId ? query.eq(column, req.branchId) : query;
}

// The branch a new record is written to: the pinned/selected branch, an
// explicitly requested one (admins choosing in "All branches" view), the
// user's home branch, or the business default.
export async function writeBranchId(req, requested) {
  const pinned = pinnedBranchId(req.adminUser);
  if (pinned) return pinned;
  if (requested) {
    const rows = await listBranches();
    if (!rows.some((b) => b.id === requested && b.is_active)) throw new ApiError(400, 'Unknown or inactive branch');
    return requested;
  }
  return req.branchId || req.adminUser?.branch_id || (await defaultBranchId());
}

// Staff pinned to a branch may only open/act on that branch's loans.
export function assertBranchAccess(req, record) {
  const pinned = pinnedBranchId(req.adminUser);
  if (pinned && record?.branch_id && record.branch_id !== pinned) {
    throw new ApiError(403, 'This loan belongs to another branch');
  }
}
